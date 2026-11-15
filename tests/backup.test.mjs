import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, migrate } from '../src/engine.js';
import { beginLesson, recordStep, completeLesson } from '../src/lessonProgress.js';
import { LESSONS } from '../src/lessons.js';
import {
  BACKUP_FORMAT, BACKUP_VERSION, summarizeState, makeBackup, backupFileName, backupToJSON,
  encodeBackupCode, parseBackup, applyBackup, compareSummaries,
} from '../src/backup.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 5, 12);
const day = (i) => new Date(T0 + i * DAY).toISOString().slice(0, 10);

// Drive an engine through `answers` practice answers, then complete `lessonCount` lessons.
function realisticState({ seed = 1, answers = 40, lessonCount = 3, t0 = T0 } = {}) {
  const e = createEngine({ seed });
  e.startSession({ now: t0 });
  let now = t0;
  for (let i = 0; i < 400 && e.getState().totalAnswers < answers; i++) {
    let p = e.next({ now });
    if (!p) { e.endSession({ now }); e.startSession({ now }); p = e.next({ now }); }
    if (!p) break;
    now += 1800;
    e.answer({ promptId: p.promptId, correct: i % 5 !== 3, rtMs: 900 + (i % 7) * 100, now });
  }
  e.endSession({ now: now + 500 });
  let ls = e.getLessons();
  for (let i = 0; i < lessonCount; i++) {
    const lesson = LESSONS[i];
    const at = now + (i + 1) * DAY;
    ls = beginLesson(ls, lesson, { now: at, today: day(i + 1) });
    lesson.steps.forEach((st, k) => {
      ls = recordStep(ls, k, { acc: 0.95, n: 10, medianRatio: 0.8, missed: [], passes: [{ acc: 0.95 }] }, { now: at + k, stepId: st.id });
    });
    ls = completeLesson(ls, lesson, { now: at + 100, today: day(i + 1), itemStats: e.itemStats(), lessons: LESSONS }).state;
    e.setLessons(ls, { now: at + 100 });
    e.markLessonDay({ now: at + 100 });
  }
  return e.getState();
}

const STATE = realisticState();
const NOW = Date.UTC(2026, 1, 3, 9, 7);

test('realistic state has the shape the tests rely on', () => {
  assert.equal(STATE.totalAnswers, 40);
  assert.ok(Object.keys(STATE.lessons.done).length >= 1);
});

test('summarizeState: derived numbers and garbage safety', () => {
  const s = summarizeState(STATE);
  assert.equal(s.totalAnswers, 40);
  assert.equal(s.lessonsDone, Object.keys(STATE.lessons.done).length);
  assert.equal(s.nextLessonN, LESSONS.find((l) => !STATE.lessons.done[l.id]).n);
  assert.ok(s.itemsSeen > 0);
  assert.ok(s.lastActiveAt >= s.createdAt && s.createdAt >= T0);
  assert.ok(Number.isInteger(s.streakDays) && s.streakDays >= 1);
  const empty = summarizeState(undefined);
  assert.deepEqual(empty, { totalAnswers: 0, lessonsDone: 0, nextLessonN: 1, itemsSeen: 0, streakDays: null, lastActiveAt: null, createdAt: null });
  for (const g of [null, 5, 'x', [], {}, { v: 1, items: 7 }, { v: 1, lessons: 'no', sessions: [null] }]) {
    assert.doesNotThrow(() => summarizeState(g));
  }
});

test('makeBackup envelope, deep clone, filename, JSON', () => {
  const b = makeBackup(STATE, { now: NOW });
  assert.equal(b.format, BACKUP_FORMAT);
  assert.equal(b.v, BACKUP_VERSION);
  assert.equal(b.app, 'tutti');
  assert.equal(b.createdAt, NOW);
  assert.equal(b.stateVersion, 1);
  assert.deepEqual(b.state, STATE);
  assert.notEqual(b.state, STATE);
  assert.notEqual(b.state.items, STATE.items);
  assert.deepEqual(b.summary, summarizeState(STATE));
  assert.match(backupFileName(NOW), /^tutti-progress-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const d = new Date(NOW);
  const p = (n) => String(n).padStart(2, '0');
  assert.equal(backupFileName(NOW), `tutti-progress-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`);
  const json = backupToJSON(b);
  assert.ok(json.includes('\n  "format"'));
  assert.deepEqual(JSON.parse(json), b);
});

test('file round trip: pretty, minified, bytes', async () => {
  const b = makeBackup(STATE, { now: NOW });
  const pretty = backupToJSON(b);
  for (const input of [pretty, JSON.stringify(b), new TextEncoder().encode(pretty), new TextEncoder().encode(pretty).buffer, '﻿' + pretty]) {
    const r = await parseBackup(input);
    assert.equal(r.ok, true);
    assert.deepEqual(r.state, migrate(STATE));
    assert.deepEqual(r.state, STATE);
    assert.deepEqual(r.summary, b.summary);
    assert.equal(r.backup.createdAt, NOW);
  }
  console.log(`backup file size: pretty ${pretty.length} bytes, minified ${JSON.stringify(b).length} bytes`);
});

test('code round trip, survives whitespace, wrapping, quotes, surrounding words', async () => {
  const b = makeBackup(STATE, { now: NOW });
  const code = await encodeBackupCode(b);
  assert.match(code, /^TUTTI1\.[0-9a-f]{8}\.[A-Za-z0-9_-]+$/);
  assert.equal(code.includes('\n'), false);
  console.log(`backup code length: ${code.length} chars (file ${backupToJSON(b).length} bytes pretty)`);
  const wrapped = code.replace(/(.{37})/g, '$1\n');
  const variants = [
    code, `  ${code}\n`, `"${code}"`, `'${code}'`, `“${code}”`, `\`${code}\``, wrapped,
    wrapped.replace(/\n/g, '\r\n  '), code.replace(/(.{20})/g, '$1 '), `Here is my Tutti code:\n${code}`,
  ];
  for (const v of variants) {
    const r = await parseBackup(v);
    assert.equal(r.ok, true, JSON.stringify(v.slice(0, 40)));
    assert.deepEqual(r.state, STATE);
    assert.equal(r.backup.createdAt, NOW);
  }
});

test('uncompressed fallback TUTTI0 code is accepted', async () => {
  const saved = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  let code;
  try { code = await encodeBackupCode(makeBackup(STATE, { now: NOW })); } finally { globalThis.CompressionStream = saved; }
  assert.match(code, /^TUTTI0\./);
  const r = await parseBackup(code);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, STATE);
});

test('error codes: empty, not-tutti, corrupt', async () => {
  const code = await encodeBackupCode(makeBackup(STATE, { now: NOW }));
  const [pre, crc, body] = code.split('.');
  const err = async (x) => { const r = await parseBackup(x); assert.equal(r.ok, false); assert.equal(typeof r.message, 'string'); assert.ok(r.message.length > 10); return r.error; };
  for (const x of ['', '   \n ', undefined, null]) assert.equal(await err(x), 'empty');
  for (const x of ['hello world', 'TUTT', 'XUTTI1.abc', '[1,2]', '42', '{"foo":1}', '{"format":"other"}', 'TUTTI9x']) assert.equal(await err(x), 'not-tutti', String(x));
  assert.equal(await err(`${pre}.${crc === '00000000' ? '00000001' : '00000000'}.${body}`), 'corrupt'); // CRC mismatch
  assert.equal(await err(code.slice(0, Math.floor(code.length / 2))), 'corrupt'); // truncated
  assert.equal(await err(code.slice(0, 12)), 'corrupt');
  assert.equal(await err(`${pre}.${crc}.${body.slice(0, -1)}`), 'corrupt');
  assert.equal(await err(`${pre}.${crc}.!!!!`), 'corrupt');
  assert.equal(await err('{"format":"tutti-backup",'), 'corrupt'); // broken JSON
  // valid CRC but not gzip data
  const junk = new TextEncoder().encode('not gzip at all');
  const fakeBody = Buffer.from(junk).toString('base64url');
  assert.equal(await err(`TUTTI1.00000000.${fakeBody}`), 'corrupt');
});

test('wrong prefix and newer versions', async () => {
  const code = await encodeBackupCode(makeBackup(STATE, { now: NOW }));
  assert.equal((await parseBackup(code.replace('TUTTI1', 'TUTTI2'))).error, 'newer-version');
  assert.equal((await parseBackup(code.replace('TUTTI1', 'NOTTUTTI'))).error, 'not-tutti');
  const b = makeBackup(STATE, { now: NOW });
  assert.equal((await parseBackup(JSON.stringify({ ...b, v: 2 }))).error, 'newer-version');
  assert.equal((await parseBackup(JSON.stringify({ ...b, stateVersion: 2 }))).error, 'newer-version');
  assert.equal((await parseBackup(JSON.stringify({ ...b, state: { ...b.state, v: 2 } }))).error, 'newer-version');
  assert.equal((await parseBackup(await encodeBackupCode({ ...b, v: 2 }))).error, 'newer-version');
  assert.equal((await parseBackup(JSON.stringify({ ...b, state: 'nope' }))).error, 'invalid-state');
  assert.equal((await parseBackup(JSON.stringify({ ...b, state: { totalAnswers: 5 } }))).error, 'invalid-state');
});

test('raw state JSON is accepted and migrated', async () => {
  const r = await parseBackup(JSON.stringify(STATE));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, STATE);
  assert.equal(r.summary.totalAnswers, 40);
  assert.equal(r.backup.format, BACKUP_FORMAT);
  // hand-damaged raw state is repaired by migrate, engine accepts it
  const dmg = { ...STATE, totalAnswers: -5, items: { 'bogus': { n: 1 } }, stageIdx: 999 };
  const r2 = await parseBackup(JSON.stringify(dmg));
  assert.equal(r2.ok, true);
  assert.doesNotThrow(() => createEngine({ state: r2.state }));
  assert.equal(r2.state.totalAnswers, 0);
});

test('applyBackup merge: union of lessons, higher totals, idempotent', () => {
  const a = realisticState({ seed: 1, answers: 40, lessonCount: 2 });
  const b = realisticState({ seed: 2, answers: 25, lessonCount: 4, t0: T0 + 10 * DAY });
  const extraA = JSON.parse(JSON.stringify(a));
  extraA.lessons.done.L07 = { at: T0, grade: 'pass', attempts: 1, acc: 0.8 };
  for (const [cur, inc] of [[extraA, b], [b, extraA]]) {
    const m = applyBackup(cur, inc, 'merge', { now: NOW });
    const ids = new Set([...Object.keys(cur.lessons.done), ...Object.keys(inc.lessons.done)]);
    assert.deepEqual(new Set(Object.keys(m.lessons.done)), ids);
    assert.equal(m.totalAnswers, Math.max(cur.totalAnswers, inc.totalAnswers));
    assert.equal(m.updatedAt, NOW);
    assert.doesNotThrow(() => createEngine({ state: m }));
    // idempotent: re-merging the same backup changes only updatedAt
    const again = applyBackup(m, inc, 'merge', { now: NOW + 5000 });
    assert.deepEqual({ ...again, updatedAt: 0 }, { ...m, updatedAt: 0 });
    assert.equal(again.updatedAt, NOW + 5000);
    const third = applyBackup(again, cur, 'merge', { now: NOW + 9000 });
    assert.deepEqual({ ...third, updatedAt: 0 }, { ...m, updatedAt: 0 });
  }
  // better grade wins
  const hi = JSON.parse(JSON.stringify(a)); hi.lessons.done.L01 = { at: T0, grade: 'ace', attempts: 1, acc: 1 };
  const lo = JSON.parse(JSON.stringify(a)); lo.lessons.done.L01 = { at: T0 + 5, grade: 'pass', attempts: 3, acc: 0.8 };
  assert.equal(applyBackup(lo, hi, 'merge', { now: NOW }).lessons.done.L01.grade, 'ace');
  // does not mutate inputs
  const snap = JSON.stringify([extraA, b]);
  applyBackup(extraA, b, 'merge', { now: NOW });
  assert.equal(JSON.stringify([extraA, b]), snap);
});

test('applyBackup replace equals migrate(imported); fresh current ok', () => {
  const inc = realisticState({ seed: 3, answers: 30, lessonCount: 1 });
  const cur = realisticState({ seed: 4, answers: 60, lessonCount: 5 });
  const r = applyBackup(cur, inc, 'replace', { now: NOW });
  assert.deepEqual(r, { ...migrate(inc), updatedAt: NOW });
  assert.equal(r.totalAnswers, 30);
  const m = applyBackup(undefined, inc, 'merge', { now: NOW });
  assert.deepEqual(m, { ...migrate(inc), updatedAt: NOW });
});

test('compareSummaries', () => {
  const old = summarizeState(realisticState({ answers: 20, lessonCount: 1 }));
  const neu = summarizeState(realisticState({ answers: 40, lessonCount: 3, t0: T0 + 5 * DAY }));
  assert.deepEqual(compareSummaries(old, neu), { incomingIsNewer: true, incomingHasMore: true });
  assert.deepEqual(compareSummaries(neu, old), { incomingIsNewer: false, incomingHasMore: false });
  assert.deepEqual(compareSummaries(old, old), { incomingIsNewer: false, incomingHasMore: false });
  assert.deepEqual(compareSummaries(null, undefined), { incomingIsNewer: false, incomingHasMore: false });
});

test('garbage inputs never throw', async () => {
  const junk = [undefined, null, 0, NaN, 1e99, true, 'x', '\u0000', '{', '}', '[]', 'TUTTI1.', 'TUTTI1..', 'TUTTI1.zzzzzzzz.AAAA', 'TUTTI0.00000000.', [], {}, () => 1, Symbol('s'), new Uint8Array([0xff, 0xfe, 0, 1]), new ArrayBuffer(0), 'a'.repeat(100000), '{"format":"tutti-backup","state":null}'];
  for (const g of junk) {
    await assert.doesNotReject(async () => { const r = await parseBackup(g); assert.equal(typeof r.ok, 'boolean'); if (!r.ok) assert.ok(r.error && r.message); });
    assert.doesNotThrow(() => summarizeState(g));
    assert.doesNotThrow(() => makeBackup(g, { now: 1 }));
    assert.doesNotThrow(() => makeBackup(g));
    assert.doesNotThrow(() => backupFileName(g));
    assert.doesNotThrow(() => backupToJSON(g));
    assert.doesNotThrow(() => compareSummaries(g, g));
    for (const mode of ['merge', 'replace', 'bogus', undefined]) {
      assert.doesNotThrow(() => { const s = applyBackup(g, g, mode, { now: 1 }); createEngine({ state: s }); });
      assert.doesNotThrow(() => applyBackup(STATE, g, mode));
    }
    await assert.doesNotReject(() => encodeBackupCode(g));
  }
});
