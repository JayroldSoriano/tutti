import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, migrate, mergeStates } from '../src/engine.js';
import { freshLessonState } from '../src/lessonProgress.js';
import { STAGES } from '../src/curriculum.js';

const MIN = 60000, DAY = 86400000;
const T0 = Date.UTC(2026, 0, 5, 12);
const POOL = ['n:t:60', 'n:t:62', 'n:t:64', 'n:t:65', 'n:t:67'];

function driveLesson(e, opts, { wrongAt = [], now0 = T0 } = {}) {
  const r = e.startSession({ mode: 'lesson', now: now0, ...opts });
  if (!r.ok) return { r, seq: [], prompts: [] };
  const seq = [], prompts = [];
  let now = now0, k = 0, p;
  while ((p = e.next({ now })) && k < 200) {
    now += 1500;
    const correct = !wrongAt.includes(k);
    seq.push(p.itemId); prompts.push(p);
    e.answer({ promptId: p.promptId, correct, rtMs: 1000, now });
    k++;
  }
  const summary = e.endSession({ now });
  return { r, seq, prompts, summary };
}

test('v1 save migrates unchanged; no lessons key appears', () => {
  const e = createEngine({ seed: 3 });
  e.startSession({ now: T0 });
  for (let i = 0; i < 6; i++) { const p = e.next({ now: T0 + i * 2000 }); e.answer({ promptId: p.promptId, correct: i % 2 === 0, rtMs: 900, now: T0 + i * 2000 + 900 }); }
  e.endSession({ now: T0 + 20000 });
  const st = e.getState();
  assert.equal('lessons' in st, false);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(st))), st);
  assert.deepEqual(Object.keys(migrate(undefined)).sort(), Object.keys(st).sort());
  assert.equal(Object.values(st.days).every((d) => !('lessons' in d)), true);
  assert.equal(e.getLessons().v, 1);
  assert.deepEqual(e.getLessons(), freshLessonState());
});

test('lessons survive migrate, getState, setLessons; days.lessons kept', () => {
  const e = createEngine({ seed: 1 });
  const ls = freshLessonState();
  ls.done.L01 = { at: 5, grade: 'ace', attempts: 1, acc: 0.95 };
  ls.queue.push({ kind: 'review', reason: 'weak', forLesson: 'L02', focus: ['n:t:60'], attempt: 1 });
  e.setLessons(ls, { now: T0 });
  e.markLessonDay({ now: T0 });
  const st = e.getState();
  assert.equal(st.updatedAt, T0);
  assert.equal(st.lessons.updatedAt, T0);
  assert.equal(st.lessons.done.L01.grade, 'ace');
  assert.equal(st.days['2026-01-05'].lessons, 1);
  const m = migrate(JSON.parse(JSON.stringify(st)));
  assert.deepEqual(m, st);
  const e2 = createEngine({ state: st });
  assert.deepEqual(e2.getLessons(), st.lessons);
  const copy = e2.getLessons(); copy.done.L99 = {}; // deep clone
  assert.equal('L99' in e2.getLessons().done, false);
  e.setLessons('garbage', { now: T0 + 1 });
  assert.equal(e.getLessons().done.L01.grade, 'ace');
  assert.equal(migrate({ v: 1, lessons: 'junk' }).lessons, undefined);
});

test('mergeStates keeps union of lesson progress whichever side wins', () => {
  const mk = (total, doneId, grade, dayLessons) => {
    const e = createEngine({ seed: 1 });
    const ls = freshLessonState(); ls.done[doneId] = { at: 1, grade, attempts: 1, acc: 1 };
    e.setLessons(ls, { now: T0 + total });
    e.markLessonDay({ now: T0 });
    for (let i = 1; i < dayLessons; i++) e.markLessonDay({ now: T0 });
    const st = e.getState(); st.totalAnswers = total; return st;
  };
  const a = mk(10, 'L01', 'pass', 1), b = mk(20, 'L02', 'ace', 3);
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
    assert.deepEqual(Object.keys(m.lessons.done).sort(), ['L01', 'L02']);
    assert.equal(m.days['2026-01-05'].lessons, 3);
  }
  assert.equal(mergeStates(a, b).totalAnswers, 20);
  const plain = createEngine({ seed: 1 }).getState();
  assert.equal('lessons' in mergeStates(plain, plain), false);
  assert.equal(mergeStates(plain, a).lessons.done.L01.grade, 'pass');
});

test('lesson session: coverage, count, summary, item records', () => {
  const e = createEngine({ seed: 7 });
  const before = e.getState();
  const { r, seq, prompts, summary } = driveLesson(e, { itemIds: POOL, count: 12, hints: 'off' });
  assert.equal(r.ok, true);
  assert.equal(seq.length, 12);
  assert.deepEqual([...seq.slice(0, 5)].sort(), [...POOL].sort());
  assert.ok(seq.every((id, i) => i === 0 || id !== seq[i - 1]));
  assert.ok(prompts.every((p) => p.isIntro === false && p.hintAfterMs === Infinity && p.mode === 'lesson'));
  const st = e.getState();
  assert.equal(st.totalAnswers, 12);
  for (const id of POOL) { assert.ok(st.items[id].n >= 1); assert.ok(st.items[id].intro > 0); }
  assert.equal(summary.answers, 12);
  assert.deepEqual(summary.missed, []);
  assert.equal(Object.values(summary.perItem).reduce((a, x) => a + x.n, 0), 12);
  assert.ok(summary.medianRatio > 0);
  // untouched: stage windows, pace, stageIdx
  assert.deepEqual(st.stages, before.stages);
  assert.equal(st.pace, before.pace);
  assert.equal(st.stageIdx, before.stageIdx);
  assert.equal(st.days['2026-01-05'].answers, 12);
  assert.equal(st.sessions.length, 1);
});

test('lesson session: empty pool and unknown ids', () => {
  const e = createEngine({ seed: 1 });
  assert.deepEqual(e.startSession({ mode: 'lesson', itemIds: [], now: T0 }), { ok: false, mode: 'lesson', stageId: e.startSession({ mode: 'lesson', itemIds: ['nope'], now: T0 }).stageId, reason: 'empty' });
  assert.equal(e.next({ now: T0 }), null);
  const r = e.startSession({ mode: 'lesson', itemIds: ['nope', 'n:t:60', 'n:t:60'], count: 3, now: T0 });
  assert.equal(r.ok, true);
  const seq = []; let p, now = T0;
  while ((p = e.next({ now }))) { seq.push(p.itemId); now += 1000; e.answer({ promptId: p.promptId, correct: true, rtMs: 800, now }); }
  assert.deepEqual(seq, ['n:t:60', 'n:t:60', 'n:t:60']); // one-item pool may repeat
});

test('lesson session: stopEarly needs min answers and 7 of last 8', () => {
  const e = createEngine({ seed: 5 });
  const a = driveLesson(e, { itemIds: POOL, count: 24, min: 10, stopEarly: true, hints: 'off' });
  assert.equal(a.seq.length, 10);
  const e2 = createEngine({ seed: 5 });
  const b = driveLesson(e2, { itemIds: POOL, count: 24, min: 10, stopEarly: true, hints: 'off' }, { wrongAt: [2, 4, 6] });
  assert.ok(b.seq.length > 10 && b.seq.length <= 24);
  const e3 = createEngine({ seed: 5 });
  const c = driveLesson(e3, { itemIds: POOL, count: 24, min: 10, stopEarly: false, hints: 'off' });
  assert.equal(c.seq.length, 24);
});

test('lesson session: retries on/off and missed list', () => {
  const run = (retries) => driveLesson(createEngine({ seed: 9 }), { itemIds: POOL, count: 20, retries, hints: 'off' }, { wrongAt: [0] });
  const on = run(true), off = run(false);
  assert.deepEqual(on.summary.missed, [on.seq[0]]);
  assert.deepEqual(off.summary.missed, [off.seq[0]]);
  // retries are served only after the coverage pass of 5, and the +2 entry is already due then
  assert.equal(on.seq[5], on.seq[0]);
  assert.notEqual(on.seq.slice(5).join(), off.seq.slice(5).join());
});

test('lesson session: hints modes and determinism', () => {
  const h = (hints) => driveLesson(createEngine({ seed: 2 }), { itemIds: POOL, count: 3, hints }).prompts.map((p) => p.hintAfterMs);
  assert.deepEqual(h('off'), [Infinity, Infinity, Infinity]);
  assert.deepEqual(h('on'), [0, 0, 0]);
  assert.ok(h('auto').every((x) => x > 0 && Number.isFinite(x)));
  const s1 = driveLesson(createEngine({ seed: 11 }), { itemIds: POOL, count: 15, hints: 'off' }, { wrongAt: [3, 8] });
  const s2 = driveLesson(createEngine({ seed: 11 }), { itemIds: POOL, count: 15, hints: 'off' }, { wrongAt: [3, 8] });
  assert.deepEqual(s1.seq, s2.seq);
  const s3 = driveLesson(createEngine({ seed: 12 }), { itemIds: POOL, count: 15, hints: 'off' }, { wrongAt: [3, 8] });
  assert.notDeepEqual(s1.seq, s3.seq);
});

test('summary extras exist for practice mode too', () => {
  const e = createEngine({ seed: 4 });
  e.startSession({ now: T0 });
  const wrong = [];
  let now = T0;
  for (let i = 0; i < 8; i++) {
    const p = e.next({ now });
    now += 1000;
    if (!p.isIntro) wrong.push(p.itemId);
    e.answer({ promptId: p.promptId, correct: false, rtMs: 900, now });
  }
  const s = e.endSession({ now });
  assert.deepEqual(s.missed.sort(), [...new Set(wrong)].sort());
  assert.equal(Object.values(s.perItem).reduce((a, x) => a + x.n, 0), wrong.length);
  assert.ok(Object.values(s.perItem).every((x) => x.c === 0));
  assert.equal(s.medianRatio, 0);
  assert.deepEqual(createEngine({ seed: 4 }).endSession({ now: T0 }).perItem, {});
});

test('passStages: order rule, events, no item seeding', () => {
  const ne = STAGES.filter((s) => !s.optional);
  const e = createEngine({ seed: 1 });
  assert.deepEqual(e.passStages([ne[1].id], { now: T0 }), []); // earlier stage not passed or listed
  assert.equal(e.getState().stageIdx, 0);
  const ev = e.passStages([ne[1].id, ne[0].id, 'pedal', 'bogus'], { now: T0 });
  assert.deepEqual(ev, [{ type: 'stage-passed', stageId: ne[0].id, via: 'lesson' }, { type: 'stage-passed', stageId: ne[1].id, via: 'lesson' }]);
  const st = e.getState();
  assert.equal(st.stageIdx, 2);
  assert.equal(st.stages[ne[0].id].status, 'passed');
  assert.equal(st.stages[ne[0].id].via, 'lesson');
  assert.equal(st.stages[ne[2].id].status, 'active');
  assert.equal(st.stages.pedal.status, 'locked');
  assert.deepEqual(st.items, {});
  assert.deepEqual(e.passStages([ne[0].id], { now: T0 }), []); // already passed
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(st))), st);
});

test('addActiveMs and markLessonDay feed the streak', () => {
  const e = createEngine({ seed: 1 });
  assert.equal(e.progress({ now: T0 }).streakDays, 0);
  e.addActiveMs(2 * MIN, { now: T0 });
  assert.equal(e.progress({ now: T0 }).streakDays, 0); // under the 10 min goal
  e.markLessonDay({ now: T0 });
  let p = e.progress({ now: T0 });
  assert.equal(p.streakDays, 1);
  assert.equal(p.today.lessons, 1);
  assert.equal(p.today.ms, 2 * MIN);
  e.markLessonDay({ now: T0 + DAY });
  assert.equal(e.progress({ now: T0 + DAY }).streakDays, 2);
  assert.equal(e.progress({ now: T0 + 2 * DAY }).streakDays, 2); // yesterday still counts
  assert.equal(e.progress({ now: T0 + 3 * DAY }).streakDays, 0);
  e.addActiveMs(10 * MIN, { now: T0 + 5 * DAY }); // clamped to 3 min
  assert.equal(e.progress({ now: T0 + 5 * DAY }).today.ms, 3 * MIN);
  e.addActiveMs(-5, { now: T0 + 5 * DAY });
  e.addActiveMs(NaN, { now: T0 + 5 * DAY });
  assert.equal(e.progress({ now: T0 + 5 * DAY }).today.ms, 3 * MIN);
});

test('reset clears lessons', () => {
  const e = createEngine({ seed: 1 });
  const ls = freshLessonState(); ls.done.L01 = { at: 1, grade: 'pass', attempts: 1, acc: 1 };
  e.setLessons(ls, { now: T0 });
  e.markLessonDay({ now: T0 });
  e.reset({ now: T0 + 1 });
  assert.equal('lessons' in e.getState(), false);
  assert.deepEqual(e.getLessons(), freshLessonState());
  assert.equal(e.progress({ now: T0 }).today.lessons, 0);
});

test('itemStats shape', () => {
  const e = createEngine({ seed: 1 });
  assert.deepEqual(e.itemStats({ now: T0 }), {});
  driveLesson(e, { itemIds: POOL, count: 10, hints: 'off' });
  const s = e.itemStats({ now: T0 + DAY });
  assert.deepEqual(Object.keys(s).sort(), [...POOL].sort());
  for (const v of Object.values(s)) {
    assert.deepEqual(Object.keys(v).sort(), ['acc', 'box', 'due', 'mastered', 'mastery', 'n']);
    assert.equal(typeof v.mastered, 'boolean');
  }
  const prog = e.progress({ now: T0 }).items;
  assert.equal(s['n:t:60'].mastery, prog['n:t:60'].mastery);
});
