import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as LP from '../src/lessonProgress.js';

const { LESSON_CONFIG: C } = LP;
const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 5, 12);
const day = (i) => new Date(T0 + i * DAY).toISOString().slice(0, 10);

function mk(n, items, extra = {}) {
  const id = 'L' + String(n).padStart(2, '0');
  const steps = [
    { id: `${id}.s01`, type: 'drill', source: 'warmup', count: 8, min: 6, hints: 'off', stopEarly: false },
    { id: `${id}.s02`, type: 'drill', source: 'today', count: 10, min: 7, hints: 'off', stopEarly: true },
    { id: `${id}.s03`, type: 'melody-wait', songId: `song${n}`, passes: [{ hands: 'rh', names: false, glow: false, fingers: false }] },
    { id: `${id}.s04`, type: 'quiz', count: 10, passAcc: 0.8 },
    { id: `${id}.s05`, type: 'recap' },
  ];
  return {
    id, n, unit: 1, title: id, goal: '', preview: '', teaches: [], items, features: [], passesStages: [], placeOut: [], spares: [],
    checkpoint: { kind: 'quiz', stepId: `${id}.s04`, passAcc: 0.8, aceAcc: 0.9 }, steps, ...extra,
  };
}
const LESSONS = [
  mk(1, ['n:t:60', 'n:t:62', 'n:t:64'], { placeOut: ['treble-landmarks'] }),
  mk(2, ['n:t:65', 'n:t:67'], { placeOut: ['treble-landmarks'] }),
  mk(3, ['iv:t:+2', 'iv:t:-2'], { placeOut: ['treble-landmarks', 'treble-staff'] }),
  mk(4, ['rh:w'], { placeOut: [] }),
  mk(5, ['n:b:53', 'n:b:48'], { placeOut: ['bass-landmarks'], passesStages: ['bass-landmarks'] }),
];
const SONGS = { song1: { id: 'song1', parts: { rh: [] } }, song2: { id: 'song2', parts: { rh: [] } }, song3: { id: 'song3', parts: { rh: [], lh: [] } },
  song4: { id: 'song4', parts: { lh: [] } }, song5: { id: 'song5', parts: { rh: [] } } };

const ace = (l) => ({ [l.id + '.s03']: { acc: 0.95, passes: [{ acc: 0.95 }] }, [l.id + '.s04']: { n: 10, acc: 1, medianRatio: 0.8, missed: [] } });
const okPass = (l) => ({ [l.id + '.s03']: { acc: 0.7 }, [l.id + '.s04']: { n: 10, acc: 0.85, medianRatio: 1.2, missed: ['x:1'] } });
const bad = (l, missed = ['n:t:62']) => ({ [l.id + '.s04']: { n: 10, acc: 0.5, medianRatio: 1.5, missed } });

function run(ls, lesson, res, { now, today, itemStats = {}, lessons = LESSONS }) {
  let s = LP.beginLesson(ls, lesson, { now, today });
  lesson.steps.forEach((st, i) => { if (res[st.id]) s = LP.recordStep(s, i, res[st.id], { now }); });
  return LP.completeLesson(s, lesson, { now, today, itemStats, lessons });
}
const up = (ls, o = {}) => LP.nextUp(ls, LESSONS, { now: T0, today: day(0), itemStats: {}, ...o });

test('1 ace advances; next core available now', () => {
  const { state, outcome } = run(LP.freshLessonState(), LESSONS[0], ace(LESSONS[0]), { now: T0, today: day(0) });
  assert.equal(outcome.grade, 'ace');
  assert.equal(state.done.L01.grade, 'ace');
  assert.equal(state.cur, null);
  const n = up(state);
  assert.deepEqual([n.kind, n.lessonId, n.availability], ['core', 'L02', 'now']);
});

test('2 pass -> tomorrow; later day / override -> now', () => {
  const { state, outcome } = run(LP.freshLessonState(), LESSONS[0], okPass(LESSONS[0]), { now: T0, today: day(0) });
  assert.equal(outcome.grade, 'pass');
  assert.equal(outcome.nextAvailability, 'tomorrow');
  assert.equal(up(state).availability, 'tomorrow');
  assert.equal(up(state, { today: day(1), now: T0 + DAY }).availability, 'now');
  assert.equal(up({ ...state, override: day(0) }).availability, 'now');
  assert.equal(up(state).softCap, false);
  assert.equal(LP.nextUp({ ...state, doneToday: 3 }, LESSONS, { now: T0, today: day(0) }).softCap, true);
});

test('3 repeat -> review queue; passing review completes the original lesson', () => {
  const r = run(LP.freshLessonState(), LESSONS[0], bad(LESSONS[0]), { now: T0, today: day(0) });
  assert.equal(r.outcome.grade, 'repeat');
  assert.deepEqual(r.state.done, {});
  assert.equal(r.state.fails.L01, 1);
  assert.deepEqual(r.state.queue[0], { kind: 'review', reason: 'repeat', forLesson: 'L01', focus: ['n:t:62'], attempt: 1 });
  const n = up(r.state);
  assert.deepEqual([n.kind, n.reason, n.availability], ['review', 'repeat', 'now']);
  const rev = LP.buildReviewLesson(n.entry, LESSONS, SONGS, r.state, {}, { now: T0 });
  assert.equal(rev.id, 'R:L01:1');
  const quizId = rev.checkpoint.stepId;
  const songStep = rev.steps.find((s) => s.type === 'melody-wait');
  const res = { [quizId]: { n: 10, acc: 0.9, medianRatio: 0.9, missed: [] }, [songStep.id]: { acc: 0.9 } };
  const r2 = run(r.state, rev, res, { now: T0 + 1000, today: day(0) });
  assert.equal(r2.outcome.passed, true);
  assert.equal(r2.state.done.L01.grade, 'pass');
  assert.equal(r2.state.queue.length, 0);
  assert.equal(up(r2.state).lessonId, 'L02');
});

test('4 relaxed grading after maxFails', () => {
  let r = run(LP.freshLessonState(), LESSONS[0], bad(LESSONS[0]), { now: T0, today: day(0) });
  let rev = LP.buildReviewLesson(r.state.queue[0], LESSONS, SONGS, r.state, {}, { now: T0 });
  const q = (lesson, acc) => ({ [lesson.checkpoint.stepId]: { n: 10, acc, medianRatio: 2, missed: ['n:t:60'] } });
  r = run(r.state, rev, q(rev, 0.5), { now: T0, today: day(0) });
  assert.equal(r.outcome.grade, 'repeat');
  assert.equal(r.state.fails.L01, 2);
  assert.equal(r.state.queue[0].attempt, 2);
  rev = LP.buildReviewLesson(r.state.queue[0], LESSONS, SONGS, r.state, {}, { now: T0 });
  assert.equal(rev.id, 'R:L01:2');
  assert.ok(rev.steps.find((s) => s.type === 'guided').scaffold === 'glow');
  assert.equal(rev.steps.find((s) => s.type === 'drill').count, 12);
  r = run(r.state, rev, q(rev, 0.65), { now: T0, today: day(0) });
  assert.equal(r.outcome.grade, 'pass');
  assert.equal(r.outcome.relaxed, true);
  assert.deepEqual(r.outcome.weakItems, ['n:t:60']);
  assert.equal(r.state.done.L01.grade, 'pass');
  assert.equal(LP.gradeLesson(LESSONS[0], bad(LESSONS[0]), { fails: 2 }), 'repeat');
});

const statsFor = (ids, mastery, n = 5) => Object.fromEntries(ids.map((id) => [id, { mastery, acc: mastery, n, box: 1, due: T0 + DAY, mastered: false }]));

test('5 weak backlog inserts exactly one weak review; low warm-up does the same', () => {
  const all = ['n:t:60', 'n:t:62', 'n:t:64', 'n:t:65', 'n:t:67'];
  const l2 = LESSONS[1];
  const r = run(LP.freshLessonState(), l2, ace(l2), { now: T0, today: day(0), itemStats: statsFor(all, 0.3) });
  assert.equal(r.state.queue.filter((e) => e.reason === 'weak').length, 1);
  assert.equal(r.state.queue[0].forLesson, 'L03');
  assert.equal(r.state.queue[0].focus.length, 5);
  assert.deepEqual(r.outcome.insertedReview, r.state.queue[0]);
  // second pass with a weak entry queued: no duplicate
  const again = run({ ...r.state, done: {} }, LESSONS[2], ace(LESSONS[2]), { now: T0, today: day(0), itemStats: statsFor(all, 0.3) });
  assert.equal(again.state.queue.filter((e) => e.reason === 'weak').length, 1);
  // warm-up trigger
  const l3 = LESSONS[2];
  const res = { ...ace(l3), [l3.id + '.s01']: { n: 8, acc: 0.5, missed: ['n:t:60'] } };
  const w = run(LP.freshLessonState(), l3, res, { now: T0, today: day(0), itemStats: statsFor(all, 0.9) });
  assert.equal(w.state.queue.length, 1);
  assert.equal(w.state.queue[0].reason, 'weak');
  assert.equal(w.state.queue[0].forLesson, 'L04');
  // healthy: none
  const h = run(LP.freshLessonState(), l2, ace(l2), { now: T0, today: day(0), itemStats: statsFor(all, 0.9) });
  assert.equal(h.state.queue.length, 0);
});

test('6 away review once', () => {
  let s = LP.freshLessonState();
  for (const l of LESSONS.slice(0, 3)) s = run(s, l, ace(l), { now: T0, today: day(0) }).state;
  assert.equal(up(s, { now: T0 + DAY, today: day(1) }).kind, 'core');
  const stats = statsFor(['n:t:60', 'n:t:62', 'n:t:64', 'n:t:65'], 0.4);
  const n = up(s, { now: T0 + 4 * DAY, today: day(4), itemStats: stats });
  assert.deepEqual([n.kind, n.reason], ['review', 'away']);
  assert.equal(n.entry.forLesson, 'L04');
  assert.equal(n.entry.focus.length, 4);
  const plan = LP.buildReviewLesson(n.entry, LESSONS, SONGS, s, stats, { now: T0 + 4 * DAY });
  const b = LP.beginLesson(s, plan, { now: T0 + 4 * DAY, today: day(4) });
  assert.equal(b.queue.filter((e) => e.reason === 'away').length, 1);
  const c = LP.completeLesson(b, plan, { now: T0 + 4 * DAY + 1, today: day(4), itemStats: stats, lessons: LESSONS });
  assert.equal(c.state.queue.length, 0);
  assert.equal(LP.nextUp(c.state, LESSONS, { now: T0 + 4 * DAY + 2, today: day(4), itemStats: stats }).kind, 'core');
});

test('7 resume and JSON survival', () => {
  let s = LP.beginLesson(LP.freshLessonState(), LESSONS[0], { now: T0, today: day(0) });
  s = LP.recordStep(s, 0, { n: 8, acc: 0.9 }, { now: T0 + 1 });
  s = LP.recordStep(s, 1, { n: 10, acc: 0.8 }, { now: T0 + 2 });
  const n = up(s);
  assert.deepEqual([n.kind, n.lessonId, n.stepIndex], ['resume', 'L01', 2]);
  const back = LP.sanitizeLessonState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  assert.deepEqual(Object.keys(back.cur.res), ['L01.s01', 'L01.s02']);
  assert.equal(LP.abandonLesson(s, { now: T0 + 5 }).cur, null);
});

test('8 checkpoint thresholds', () => {
  const mel = { ...LESSONS[0], checkpoint: { kind: 'melody', stepId: 'L01.s03', passAcc: 0.8, aceAcc: 0.92 } };
  const g = (acc, cfg) => LP.gradeLesson(mel, { 'L01.s03': { acc } }, cfg);
  assert.equal(g(0.79), 'repeat');
  assert.equal(g(0.8), 'pass');
  assert.equal(g(0.92), 'ace');
  assert.equal(g(0.7, { fails: 2 }), 'pass');
  const L = LESSONS[0];
  const q = (o, mel = 0.9) => LP.gradeLesson(L, { 'L01.s03': { acc: mel }, 'L01.s04': { acc: 0.95, medianRatio: 0.9, ...o } });
  assert.equal(q({}), 'ace');
  assert.equal(q({ acc: 0.79 }), 'repeat');
  assert.equal(q({ acc: 0.89 }), 'pass');
  assert.equal(q({ medianRatio: 1.1 }), 'pass');
  assert.equal(q({}, 0.8), 'pass');
});

test('9 mergeLessonState', () => {
  const a = { ...LP.freshLessonState(), updatedAt: 10, done: { L01: { at: 5, grade: 'pass', attempts: 1, acc: 0.8 } }, songs: { s: { plays: 2, bestAcc: 0.7, bestTempo: 60 } }, lastDay: '2026-01-05' };
  const b = { ...LP.freshLessonState(), updatedAt: 20, done: { L01: { at: 9, grade: 'ace', attempts: 1, acc: 0.95 }, L02: { at: 9, grade: 'pass', attempts: 1, acc: 0.8 } },
    songs: { s: { plays: 1, bestAcc: 0.9, bestTempo: 0 }, t: { plays: 1, bestAcc: 0.5, bestTempo: 0 } }, lastDay: '2026-01-06' };
  for (const m of [LP.mergeLessonState(a, b), LP.mergeLessonState(b, a)]) {
    assert.equal(m.done.L01.grade, 'ace');
    assert.ok(m.done.L02);
    assert.deepEqual(m.songs.s, { plays: 2, bestAcc: 0.9, bestTempo: 60 });
    assert.ok(m.songs.t);
    assert.equal(m.lastDay, '2026-01-06');
  }
  const tie = LP.mergeLessonState({ ...a, done: { L01: { at: 1, grade: 'pass', attempts: 1, acc: 1 } } }, { ...a, done: { L01: { at: 7, grade: 'pass', attempts: 2, acc: 1 } } });
  assert.equal(tie.done.L01.at, 7);
  for (const junk of [undefined, null, 5, 'x', [], { done: 7, queue: 'z', songs: [1], cur: 4, fails: null }]) {
    assert.doesNotThrow(() => LP.mergeLessonState(junk, a));
    assert.doesNotThrow(() => LP.sanitizeLessonState(junk));
  }
  assert.equal(LP.sanitizeLessonState(null), undefined);
  assert.equal(LP.sanitizeLessonState('x'), undefined);
  const evil = LP.sanitizeLessonState(JSON.parse('{"done":{"__proto__":{"at":1,"grade":"ace"}},"songs":{"constructor":{}}}'));
  assert.deepEqual(evil.done, {});
});

test('10 placeOut and pickWarmup', () => {
  const p = LP.placeOut(LP.freshLessonState(), LESSONS, ['treble-landmarks', 'treble-staff'], { now: T0 });
  assert.deepEqual(Object.keys(p.done), ['L01', 'L02', 'L03', 'L04']);
  assert.equal(p.done.L02.grade, 'skip');
  assert.equal(up(p).lessonId, 'L05');
  assert.deepEqual(Object.keys(LP.placeOut(LP.freshLessonState(), LESSONS, ['treble-landmarks'], { now: T0 }).done), ['L01', 'L02']);
  assert.deepEqual(Object.keys(LP.placeOut(LP.freshLessonState(), LESSONS, [], { now: T0 }).done), []);
  const all = ['treble-landmarks', 'treble-staff', 'bass-landmarks'];
  assert.equal(Object.keys(LP.placeOut(LP.freshLessonState(), LESSONS, all, { now: T0 }).done).length, 5);

  const st = {
    'n:t:60': { mastery: 0.9, acc: 1, n: 5, box: 3, due: T0 + DAY, mastered: true },
    'n:t:62': { mastery: 0.8, acc: 1, n: 5, box: 1, due: T0 - 2 * DAY, mastered: false },
    'n:t:64': { mastery: 0.4, acc: 1, n: 5, box: 2, due: T0 + DAY, mastered: false },
    'n:t:65': { mastery: 0.5, acc: 1, n: 5, box: 1, due: T0 - 1 * DAY, mastered: false },
    'n:t:67': { mastery: 0.95, acc: 1, n: 5, box: 0, due: T0, mastered: false },
  };
  assert.deepEqual(LP.pickWarmup(5, LESSONS, st, { now: T0, count: 8 }), ['n:t:62', 'n:t:65', 'n:t:64', 'n:t:67', 'n:t:60']);
  assert.deepEqual(LP.pickWarmup(5, LESSONS, st, { now: T0, count: 2 }), ['n:t:62', 'n:t:65']);
  assert.deepEqual(LP.pickWarmup(1, LESSONS, st, { now: T0, count: 8 }), []);
  assert.deepEqual(LP.pickWarmup(2, LESSONS, { 'n:t:60': st['n:t:60'], 'n:t:62': st['n:t:62'] }, { now: T0, count: 8 }), []); // fewer than 3 candidates
  assert.equal(LP.pickWarmup(2, LESSONS, st, { now: T0, count: 8 }).length, 3);
});

test('11 buildReviewLesson shapes', () => {
  let s = LP.freshLessonState();
  s = run(s, LESSONS[0], ace(LESSONS[0]), { now: T0, today: day(0) }).state;
  s.songs.song1 = { plays: 5, bestAcc: 0.9, bestTempo: 0 };
  s.songs.song2 = { plays: 1, bestAcc: 0.5, bestTempo: 0 };
  const stats = statsFor(['n:t:60', 'n:t:62', 'n:t:64', 'n:t:65'], 0.8);
  const rev = LP.buildReviewLesson({ kind: 'review', reason: 'repeat', forLesson: 'L02', focus: ['n:t:65', 'n:t:67', 'iv:t:+2'], attempt: 1 }, LESSONS, SONGS, s, stats, { now: T0 });
  assert.deepEqual(rev.steps.map((x) => x.type), ['concept', 'guided', 'landmark-distance', 'drill', 'melody-wait', 'quiz', 'recap']);
  assert.equal(rev.steps[0].visual.kind, 'landmarks');
  const g = rev.steps[1];
  assert.deepEqual(g.targets.map((t) => t.midi), [65, 67]);
  assert.equal(g.scaffold, 'name');
  assert.equal(g.rounds, 2);
  const ld = rev.steps.filter((x) => x.type === 'landmark-distance');
  assert.ok(ld.every((x) => x.landmark.staff === 'treble'));
  const drill = rev.steps.find((x) => x.type === 'drill');
  assert.equal(drill.source, 'items');
  assert.equal(drill.count, 16);
  assert.equal(drill.min, 10);
  assert.ok(drill.itemIds.includes('iv:t:+2'));
  assert.equal(drill.itemIds.length, 3 + 3); // focus + strong neighbours that have stats (up to 4)
  assert.equal(rev.steps.find((x) => x.type === 'melody-wait').songId, 'song2'); // L02 first song
  const quiz = rev.steps.find((x) => x.type === 'quiz');
  assert.deepEqual(quiz.itemIds.slice(0, 3), ['n:t:65', 'n:t:67', 'iv:t:+2']);
  assert.equal(rev.checkpoint.stepId, quiz.id);
  assert.ok(rev.steps.every((x, i) => x.id === `R:L02:1.s${String(i + 1).padStart(2, '0')}`));
  // weak reason: song = least played unlocked
  const weak = LP.buildReviewLesson({ kind: 'review', reason: 'weak', forLesson: 'L02', focus: ['n:t:65'], attempt: 1 }, LESSONS, SONGS, s, stats, { now: T0 });
  assert.equal(weak.steps.find((x) => x.type === 'melody-wait').songId, 'song2');
  assert.deepEqual(LP.unlockedSongIds(s, LESSONS, SONGS), ['song1', 'song2']);
  // non-note focus: no concept/guided
  const shapes = LP.buildReviewLesson({ kind: 'review', reason: 'repeat', forLesson: 'L03', focus: ['iv:t:+2'], attempt: 1 }, LESSONS, SONGS, s, stats, { now: T0 });
  assert.deepEqual(shapes.steps.map((x) => x.type), ['drill', 'melody-wait', 'quiz', 'recap']);
  // daily
  const d = LP.buildReviewLesson({ kind: 'daily', day: day(9) }, LESSONS, SONGS, { ...s, done: Object.fromEntries(LESSONS.map((l) => [l.id, { at: 1, grade: 'pass', attempts: 1, acc: 1 }])) }, stats, { now: T0 });
  assert.equal(d.id, 'D:' + day(9));
  assert.deepEqual(d.steps.map((x) => x.type), ['drill', 'melody-wait', 'melody-wait', 'recap']);
  assert.equal(d.steps[0].source, 'warmup');
  assert.equal(d.steps[0].count, 10);
  const waits = d.steps.filter((x) => x.type === 'melody-wait');
  assert.ok(waits.every((w) => w.passes.length === 1 && w.passes[0].names === false));
  assert.equal(d.checkpoint.kind, 'melody');
  assert.equal(d.checkpoint.stepId, waits[1].id);
  assert.notEqual(waits[0].songId, waits[1].songId);
});

test('12 after the last lesson nextUp is daily and never inserts reviews', () => {
  let s = LP.freshLessonState();
  for (const l of LESSONS) s = run(s, l, ace(l), { now: T0, today: day(0) }).state;
  const n = up(s);
  assert.deepEqual([n.kind, n.lessonId, n.availability], ['daily', 'D:' + day(0), 'now']);
  const plan = LP.buildReviewLesson(n.entry, LESSONS, SONGS, s, {}, { now: T0 });
  const done = LP.beginLesson(s, plan, { now: T0, today: day(0) });
  const res = Object.fromEntries(plan.steps.filter((x) => x.type === 'melody-wait').map((x) => [x.id, { acc: 0.5 }]));
  let b = done;
  plan.steps.forEach((st, i) => { if (res[st.id]) b = LP.recordStep(b, i, res[st.id], { now: T0 }); });
  const r = LP.completeLesson(b, plan, { now: T0, today: day(0), itemStats: {}, lessons: LESSONS });
  assert.equal(r.state.queue.length, 0);
  assert.equal(r.outcome.advance, true);
  assert.equal(Object.keys(r.state.done).length, 5);
  assert.ok(r.state.songs.song1.plays + r.state.songs.song2.plays + r.state.songs.song3.plays >= 2);
});

test('song stats from melody steps', () => {
  const l = { ...LESSONS[0], steps: [...LESSONS[0].steps.slice(0, 2), { id: 'L01.s03', type: 'melody-wait', songId: 'a', passes: [] },
    { id: 'L01.s04', type: 'melody-tempo', songId: 'a', bpm: 72, hands: 'rh', optional: true }, { id: 'L01.s05', type: 'quiz', count: 10 }],
  checkpoint: { kind: 'quiz', stepId: 'L01.s05', passAcc: 0.8, aceAcc: 0.9 } };
  const res = { 'L01.s03': { acc: 0.9 }, 'L01.s04': { acc: 0.85, bpm: 72 }, 'L01.s05': { acc: 0.85, medianRatio: 1 } };
  const r = run(LP.freshLessonState(), l, res, { now: T0, today: day(0) });
  assert.deepEqual(r.state.songs.a, { plays: 2, bestAcc: 0.9, bestTempo: 72 });
});

const hasLessons = fs.existsSync(new URL('../src/lessons.js', import.meta.url)) && fs.existsSync(new URL('../src/songs.js', import.meta.url));
test('real LESSONS/SONGS: path walks and review builds', { skip: !hasLessons }, async () => {
  const { LESSONS: REAL } = await import('../src/lessons.js');
  const { SONGS: RS } = await import('../src/songs.js');
  assert.equal(REAL.length, 32);
  const s = LP.placeOut(LP.freshLessonState(), REAL, ['treble-landmarks', 'treble-staff'], { now: T0 });
  assert.ok(Object.keys(s.done).length >= 4);
  const n = LP.nextUp(s, REAL, { now: T0, today: day(0), itemStats: {} });
  assert.equal(n.kind, 'core');
  const rev = LP.buildReviewLesson({ kind: 'review', reason: 'repeat', forLesson: 'L02', focus: ['n:t:65'], attempt: 1 }, REAL, RS, s, {}, { now: T0 });
  assert.ok(rev.steps.some((x) => x.type === 'melody-wait'));
  assert.ok(LP.unlockedSongIds(LP.freshLessonState(), REAL, RS).length > 0);
});
