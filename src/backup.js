// Tutti progress backup: move progress between devices with no backend, via a file or a text code.
// Pure ES module (no DOM). Runs in browsers and Node 22. Public functions never throw.
import { migrate, mergeStates, createEngine, STATE_VERSION } from './engine.js';
import { LESSONS } from './lessons.js';

export const BACKUP_FORMAT = 'tutti-backup';
export const BACKUP_VERSION = 1;

const MAX_BYTES = 32 * 1024 * 1024; // decompression cap (zip-bomb guard)

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- summary
export function summarizeState(state) {
  const out = { totalAnswers: 0, lessonsDone: 0, nextLessonN: null, itemsSeen: 0, streakDays: null, lastActiveAt: null, createdAt: null };
  try {
    const s = migrate(isObj(state) ? clone(state) : undefined);
    out.totalAnswers = s.totalAnswers;
    out.itemsSeen = Object.values(s.items).filter((r) => r && r.n > 0).length;
    const done = (s.lessons && s.lessons.done) || {};
    out.lessonsDone = LESSONS.filter((l) => done[l.id]).length;
    const next = LESSONS.find((l) => !done[l.id]);
    out.nextLessonN = next ? next.n : null;

    // activity timestamps: only real practice, never updatedAt (which merges/imports bump)
    const stamps = [];
    for (const x of s.sessions) if (fin(x.t) && x.t > 0) stamps.push(x.t, x.t + Math.max(0, x.durMs || 0));
    if (s.lessons) {
      if (s.lessons.lastActive > 0) stamps.push(s.lessons.lastActive);
      for (const d of Object.values(s.lessons.done)) if (d.at > 0) stamps.push(d.at);
    }
    if (stamps.length) {
      out.lastActiveAt = Math.max(...stamps);
      const firsts = s.sessions.filter((x) => x.t > 0).map((x) => x.t);
      if (s.lessons) for (const d of Object.values(s.lessons.done)) if (d.at > 0) firsts.push(d.at);
      out.createdAt = Math.min(...firsts, out.lastActiveAt);
      try { out.streakDays = createEngine({ state: s }).progress({ now: out.lastActiveAt }).streakDays; } catch { /* leave null */ }
    }
  } catch { /* garbage in, zeros out */ }
  return out;
}

export function makeBackup(state, { now } = {}) {
  let st;
  try { st = isObj(state) ? clone(state) : migrate(undefined); } catch { st = migrate(undefined); }
  return {
    format: BACKUP_FORMAT, v: BACKUP_VERSION, app: 'tutti', createdAt: fin(now) ? now : null,
    stateVersion: fin(st.v) ? st.v : STATE_VERSION, summary: summarizeState(st), state: st,
  };
}

export function backupFileName(now) {
  const d = new Date(fin(now) ? now : Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `tutti-progress-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export function backupToJSON(backup) {
  try { return JSON.stringify(backup, null, 2); } catch { return '{}'; }
}

// ---------------------------------------------------------------- bytes helpers
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const crcHex = (bytes) => crc32(bytes).toString(16).padStart(8, '0');

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (t.length % 4 === 1) throw new Error('bad base64 length');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pump(stream, input, limit) {
  const w = stream.writable.getWriter();
  w.write(input).then(() => w.close()).catch(() => {});
  const r = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    total += value.length;
    if (total > limit) { try { await r.cancel(); } catch { /* ignore */ } throw new Error('too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const gzip = (bytes) => pump(new CompressionStream('gzip'), bytes, MAX_BYTES);
const gunzip = (bytes) => pump(new DecompressionStream('gzip'), bytes, MAX_BYTES);

// ---------------------------------------------------------------- code
export async function encodeBackupCode(backup) {
  try {
    const json = new TextEncoder().encode(JSON.stringify(backup));
    if (typeof CompressionStream === 'function') {
      try {
        const z = await gzip(json);
        return `TUTTI1.${crcHex(z)}.${toB64Url(z)}`;
      } catch { /* fall through to uncompressed */ }
    }
    return `TUTTI0.${crcHex(json)}.${toB64Url(json)}`;
  } catch { return ''; }
}

// ---------------------------------------------------------------- parse
const fail = (error, message) => ({ ok: false, error, message });
const MSG = {
  empty: 'Nothing to import yet. Choose a backup file or paste your code.',
  notTutti: 'That does not look like a Tutti backup.',
  corrupt: 'That backup looks damaged or cut short. Try copying the whole code again.',
  newer: 'This backup was made by a newer version of Tutti. Update the app on this device and try again.',
  invalid: 'The progress inside this backup could not be read.',
};

function toText(input) {
  if (typeof input === 'string') return input;
  if (input instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(input));
  if (ArrayBuffer.isView(input)) return new TextDecoder('utf-8').decode(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  return null;
}

async function decodeCode(text) {
  // strip all whitespace (chat apps wrap lines), then locate the code (tolerates quotes / leading words)
  const flat = text.replace(/[\s​-‍⁠]+/g, '');
  const at = flat.search(/TUTTI\d+\./i);
  if (at < 0) return null;
  const m = /^TUTTI(\d+)\.([0-9a-fA-F]*)\.?([A-Za-z0-9_\-+/=]*)/i.exec(flat.slice(at));
  if (!m) return null;
  const ver = Number(m[1]);
  if (ver > 1) return { error: 'newer-version' };
  if (m[2].length !== 8 || !m[3]) return { error: 'corrupt' };
  let bytes;
  try { bytes = fromB64Url(m[3]); } catch { return { error: 'corrupt' }; }
  if (crcHex(bytes) !== m[2].toLowerCase()) return { error: 'corrupt' };
  try {
    if (ver === 1) {
      if (typeof DecompressionStream !== 'function') return { error: 'corrupt', noGzip: true };
      bytes = await gunzip(bytes);
    }
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch { return { error: 'corrupt' }; }
}

export async function parseBackup(input) {
  try {
    let text = toText(input);
    if (text == null) return fail('empty', MSG.empty);
    text = text.replace(/^﻿/, '');
    if (!text.trim()) return fail('empty', MSG.empty);

    let jsonText = null;
    const head = text.trim();
    if (head[0] !== '{') {
      const dec = await decodeCode(text);
      if (!dec) return fail('not-tutti', MSG.notTutti);
      if (dec.error === 'newer-version') return fail('newer-version', MSG.newer);
      if (dec.error) {
        return fail('corrupt', dec.noGzip ? 'This code is compressed and this browser cannot open it. Use a backup file instead.' : MSG.corrupt);
      }
      jsonText = dec.text;
    } else {
      jsonText = head;
    }

    let obj;
    try { obj = JSON.parse(jsonText); } catch { return fail('corrupt', MSG.corrupt); }
    if (!isObj(obj)) return fail('not-tutti', MSG.notTutti);

    let rawState, createdAt = null;
    if (obj.format === BACKUP_FORMAT) {
      if (fin(obj.v) && obj.v > BACKUP_VERSION) return fail('newer-version', MSG.newer);
      if (fin(obj.stateVersion) && obj.stateVersion > STATE_VERSION) return fail('newer-version', MSG.newer);
      if (!isObj(obj.state)) return fail('invalid-state', MSG.invalid);
      rawState = obj.state;
      if (fin(obj.createdAt)) createdAt = obj.createdAt;
    } else if (fin(obj.v) && ('totalAnswers' in obj || 'items' in obj || 'stages' in obj || 'sessions' in obj)) {
      rawState = obj; // bare state saved by hand / older build
    } else {
      return fail('not-tutti', MSG.notTutti);
    }
    if (fin(rawState.v) && rawState.v > STATE_VERSION) return fail('newer-version', MSG.newer);
    if (rawState.v !== STATE_VERSION) return fail('invalid-state', MSG.invalid);

    const state = migrate(clone(rawState));
    const backup = makeBackup(state, { now: createdAt ?? (state.updatedAt || null) });
    return { ok: true, backup, state, summary: backup.summary };
  } catch {
    return fail('corrupt', MSG.corrupt);
  }
}

// ---------------------------------------------------------------- apply / compare
export function applyBackup(current, imported, mode, { now } = {}) {
  const inc = migrate(isObj(imported) ? clone(imported) : undefined);
  let out;
  try {
    out = mode === 'replace' ? inc : mergeStates(migrate(isObj(current) ? clone(current) : undefined), inc);
    out = migrate(out);
  } catch { out = inc; }
  if (fin(now)) out.updatedAt = now;
  return out;
}

export function compareSummaries(local, incoming) {
  const g = (s, k) => (isObj(s) && fin(s[k]) ? s[k] : 0);
  return {
    incomingIsNewer: g(incoming, 'lastActiveAt') > g(local, 'lastActiveAt'),
    incomingHasMore: g(incoming, 'totalAnswers') > g(local, 'totalAnswers') || g(incoming, 'lessonsDone') > g(local, 'lessonsDone'),
  };
}
