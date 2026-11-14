// Tutti persistence: claude db -> localStorage -> memory. Never throws, never rejects.

const CONNECT_TIMEOUT_MS = 12000;

function safeLocalStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function sig(s) {
  return s && typeof s === 'object' ? `${s.updatedAt}|${s.totalAnswers}` : '';
}

function isState(o) {
  return !!o && typeof o === 'object' && !Array.isArray(o) && typeof o.v === 'number';
}

// Accept: plain state object, {data: state}, doc snapshot with .data() function, null/undefined.
function normalizeRemote(raw) {
  try {
    if (raw == null) return null;
    if (typeof raw.exists === 'boolean' && !raw.exists) return null;
    if (typeof raw.data === 'function') return normalizeRemote(raw.data());
    if (raw.data && typeof raw.data === 'object' && !isState(raw)) return normalizeRemote(raw.data);
    if (isState(raw)) return raw;
    return null;
  } catch { return null; }
}

export function createStore(opts = {}) {
  const key = opts.key ?? 'tutti.progress.v1';
  const claude = 'claude' in opts ? opts.claude : globalThis.claude;
  const ls = 'localStorage' in opts ? opts.localStorage : safeLocalStorage();
  const debounceMs = opts.debounceMs ?? 1500;
  const log = typeof opts.log === 'function' ? opts.log : () => {};

  let doc = null;            // db doc handle once connected
  let memory = null;         // in-memory copy (always kept)
  let localOk = !!ls;
  let lastLocalSig = null;
  let lastRemoteSig = null;
  let pending = null;        // latest state awaiting a db write
  let timer = null;
  let inflight = null;       // promise of the current write loop
  let connecting = null;
  const listeners = new Set();

  const emit = (s) => { for (const fn of [...listeners]) { try { fn(s); } catch { /* ignore */ } } };

  function writeLocal(state) {
    memory = state;
    if (!ls) { localOk = false; return; }
    try { ls.setItem(key, JSON.stringify(state)); localOk = true; }
    catch (e) { localOk = false; log('localStorage write failed', e); }
  }

  function loadLocal() {
    try {
      if (ls) {
        const raw = ls.getItem(key);
        if (raw) {
          const s = JSON.parse(raw);
          if (isState(s)) { lastLocalSig = sig(s); return s; }
        }
      }
    } catch (e) { log('localStorage read failed', e); }
    return memory;
  }

  async function acquireDoc() {
    const db = await claude?.use?.('db');
    const user = await claude?.use?.('user');
    if (!db || !user) return null;
    const id = await user.id();
    if (id == null) return null;
    return db.collection('data/users/' + id).doc('progress');
  }

  function connect() {
    if (connecting) return connecting;
    connecting = new Promise((resolve) => {
      let done = false;
      let to = null;
      const finish = (remote, d) => {
        if (done) return;
        done = true;
        if (to != null) { try { clearTimeout(to); } catch { /* ignore */ } }
        if (d) { doc = d; if (remote) lastRemoteSig = sig(remote); }
        resolve({ remote: remote || null, backend: backend() });
      };
      to = setTimeout(() => { log('connect timed out'); finish(null, null); }, CONNECT_TIMEOUT_MS);
      (async () => {
        try {
          const d = await acquireDoc();
          if (!d) return finish(null, null);
          let remote = null;
          try { remote = normalizeRemote(await d.get()); } catch (e) { log('db get failed', e); }
          finish(remote, d);
        } catch (e) { log('connect failed', e); finish(null, null); }
      })();
    });
    return connecting;
  }

  async function drain() {
    while (pending) {
      const state = pending;
      pending = null;
      if (!doc) return;
      if (sig(state) === lastRemoteSig) continue;
      emit('saving');
      try {
        await doc.set(state);
        lastRemoteSig = sig(state);
        emit('saved');
      } catch (e) {
        log('db write failed', e);
        emit('offline'); // local copy stays; next save() retries
      }
    }
  }

  function kick() {
    if (!inflight) {
      inflight = drain().catch(() => {}).finally(() => { inflight = null; });
    }
    return inflight;
  }

  function save(state, { flush = false } = {}) {
    try {
      if (!state || typeof state !== 'object') return Promise.resolve();
      const s = sig(state);
      if (s !== lastLocalSig) { writeLocal(state); lastLocalSig = s; }
      else memory = state;
      if (!doc) { emit(localOk ? 'saved' : 'offline'); return Promise.resolve(); }
      if (s === lastRemoteSig && !pending) return Promise.resolve();
      pending = state;
      if (timer != null) { clearTimeout(timer); timer = null; }
      if (flush) return kick();
      timer = setTimeout(() => { timer = null; kick(); }, debounceMs);
      return Promise.resolve();
    } catch (e) {
      log('save failed', e);
      return Promise.resolve();
    }
  }

  function backend() {
    if (doc) return 'db';
    return localOk ? 'local' : 'memory';
  }

  function onStatus(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { loadLocal, connect, save, backend, onStatus };
}
