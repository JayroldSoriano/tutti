import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/storage.js';

const st = (n, at = n) => ({ v: 1, updatedAt: at, totalAnswers: n, stages: {} });
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function fakeLS({ throwSet = false, init } = {}) {
  const m = new Map(init || []);
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (throwSet) throw new Error('quota'); m.set(k, v); },
  };
}

function fakeClaude({ getResult = null, setImpl, uid = 'u1' } = {}) {
  const calls = { sets: [], paths: [] };
  const docObj = {
    get: async () => getResult,
    set: async (o) => { calls.sets.push(o); if (setImpl) return setImpl(calls.sets.length, o); },
  };
  const claude = {
    use: async (name) => {
      if (name === 'user') return { id: async () => uid };
      if (name === 'db') return { collection: (p) => { calls.paths.push(p); return { doc: (d) => { calls.paths.push(d); return docObj; } }; } };
      return null;
    },
  };
  return { claude, calls };
}

test('no claude at all -> local backend, connect resolves null remote', async () => {
  const s = createStore({ claude: undefined, localStorage: fakeLS(), debounceMs: 5 });
  assert.equal(s.loadLocal(), null);
  const r = await s.connect();
  assert.deepEqual(r, { remote: null, backend: 'local' });
  await s.save(st(1), { flush: true });
  assert.equal(s.loadLocal().totalAnswers, 1);
});

test('use resolving null -> local', async () => {
  const s = createStore({ claude: { use: async () => null }, localStorage: fakeLS() });
  const r = await s.connect();
  assert.equal(r.backend, 'local');
  assert.equal(r.remote, null);
});

test('use never resolving -> connect gives up at 12 s', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = createStore({ claude: { use: () => new Promise(() => {}) }, localStorage: fakeLS() });
    let res = null;
    s.connect().then((r) => { res = r; });
    await tick();
    mock.timers.tick(11999);
    await tick();
    assert.equal(res, null);
    mock.timers.tick(1);
    await tick();
    assert.deepEqual(res, { remote: null, backend: 'local' });
  } finally { mock.timers.reset(); }
});

test('use throwing -> never rejects', async () => {
  const s = createStore({ claude: { use: async () => { throw new Error('x'); } }, localStorage: fakeLS() });
  const r = await s.connect();
  assert.equal(r.backend, 'local');
});

for (const [name, wrap] of [
  ['plain object', (o) => o],
  ['{data} wrapper', (o) => ({ data: o })],
  ['.data() function', (o) => ({ data: () => o, exists: true })],
]) {
  test(`get() shape: ${name}`, async () => {
    const { claude, calls } = fakeClaude({ getResult: wrap(st(7)) });
    const s = createStore({ claude, localStorage: fakeLS() });
    const r = await s.connect();
    assert.equal(r.backend, 'db');
    assert.equal(r.remote.totalAnswers, 7);
    assert.deepEqual(calls.paths, ['data/users/u1', 'progress']);
  });
}

for (const missing of [null, undefined]) {
  test(`get() shape: ${missing}`, async () => {
    const { claude } = fakeClaude({ getResult: missing });
    const r = await createStore({ claude, localStorage: fakeLS() }).connect();
    assert.equal(r.backend, 'db');
    assert.equal(r.remote, null);
  });
}

test('.set() rejecting then succeeding retries on next save', async () => {
  const { claude, calls } = fakeClaude({ setImpl: (n) => { if (n === 1) throw new Error('net'); } });
  const s = createStore({ claude, localStorage: fakeLS(), debounceMs: 5 });
  const status = [];
  s.onStatus((x) => status.push(x));
  await s.connect();
  await s.save(st(1), { flush: true });
  assert.deepEqual(status, ['saving', 'offline']);
  await s.save(st(1), { flush: true }); // same state: must retry since remote never confirmed
  assert.equal(calls.sets.length, 2);
  assert.equal(status.at(-1), 'saved');
  await s.save(st(1), { flush: true }); // now unchanged
  assert.equal(calls.sets.length, 2);
});

test('localStorage throwing on setItem -> memory backend, no throw', async () => {
  const s = createStore({ claude: undefined, localStorage: fakeLS({ throwSet: true }) });
  await s.connect();
  await s.save(st(3), { flush: true });
  assert.equal(s.backend(), 'memory');
  assert.equal(s.loadLocal().totalAnswers, 3);
});

test('localStorage missing entirely -> memory', async () => {
  const s = createStore({ claude: undefined, localStorage: null });
  await s.connect();
  await s.save(st(2), { flush: true });
  assert.equal(s.backend(), 'memory');
});

test('loadLocal tolerates corrupt JSON', () => {
  const ls = fakeLS({ init: [['tutti.progress.v1', '{nope']] });
  assert.equal(createStore({ localStorage: ls, claude: undefined }).loadLocal(), null);
});

test('10 rapid saves -> one db write with the last state; localStorage written each time', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { claude, calls } = fakeClaude();
    const ls = fakeLS();
    const s = createStore({ claude, localStorage: ls, debounceMs: 1500 });
    await s.connect();
    for (let i = 1; i <= 10; i++) s.save(st(i));
    assert.equal(JSON.parse(ls.m.get('tutti.progress.v1')).totalAnswers, 10);
    assert.equal(calls.sets.length, 0);
    mock.timers.tick(1500);
    await tick(20);
    assert.equal(calls.sets.length, 1);
    assert.equal(calls.sets[0].totalAnswers, 10);
  } finally { mock.timers.reset(); }
});

test('single-flight: save during in-flight write keeps only latest pending', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { claude, calls } = fakeClaude({ setImpl: (n) => (n === 1 ? gate : undefined) });
  const s = createStore({ claude, localStorage: fakeLS(), debounceMs: 5 });
  await s.connect();
  const p1 = s.save(st(1), { flush: true });
  await tick();
  s.save(st(2), { flush: true });
  s.save(st(3), { flush: true });
  await tick();
  assert.equal(calls.sets.length, 1); // second write waits
  release();
  await p1;
  await tick(20);
  assert.equal(calls.sets.length, 2);
  assert.equal(calls.sets[1].totalAnswers, 3);
});

test('unchanged state (updatedAt + totalAnswers) writes nothing', async () => {
  const { claude, calls } = fakeClaude();
  const ls = fakeLS();
  const s = createStore({ claude, localStorage: ls, debounceMs: 5 });
  await s.connect();
  await s.save(st(4), { flush: true });
  assert.equal(calls.sets.length, 1);
  let lsWrites = 0;
  const orig = ls.setItem; ls.setItem = (k, v) => { lsWrites++; orig(k, v); };
  await s.save(st(4), { flush: true });
  assert.equal(calls.sets.length, 1);
  assert.equal(lsWrites, 0);
  await s.save(st(5), { flush: true });
  assert.equal(calls.sets.length, 2);
});

test('save never throws on garbage input', async () => {
  const s = createStore({ claude: undefined, localStorage: fakeLS() });
  await s.save(null); await s.save(undefined, { flush: true }); await s.save('x');
});
