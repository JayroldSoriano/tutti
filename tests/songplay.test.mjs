import test from 'node:test';
import assert from 'node:assert/strict';
import { momentsOf, createWaitPlayer, gradeTempo } from '../src/songplay.js';

const ev = (t, midis, extra = {}) => ({ t, beats: 1, midis, hand: 'rh', staff: 'treble', bar: 1, idx: 0, ...extra });
const line = [ev(0, [60]), ev(1, [62]), ev(2, [64])];

test('momentsOf groups equal t and sorts', () => {
  const m = momentsOf([ev(1, [48], { hand: 'lh' }), ev(0, [60]), ev(1, [64]), ev(0, [48], { hand: 'lh' })]);
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].midis.sort(), [48, 60]);
  assert.equal(m[1].events.length, 2);
});

test('single line advances note by note and finishes', () => {
  const p = createWaitPlayer(line);
  assert.equal(p.index, 0);
  assert.deepEqual(p.moment().midis, [60]);
  assert.equal(p.push(60).status, 'advance');
  assert.equal(p.index, 1);
  assert.equal(p.push(62).status, 'advance');
  assert.equal(p.push(64).status, 'done');
  assert.equal(p.moment(), null);
  assert.deepEqual(p.stats(), { moments: 3, firstTry: 3, wrong: 0, acc: 1 });
});

test('wrong key does not advance and lowers acc', () => {
  const p = createWaitPlayer(line);
  assert.equal(p.push(61).status, 'wrong');
  assert.equal(p.index, 0);
  assert.equal(p.push(60).status, 'advance');
  p.push(62); p.push(64);
  const s = p.stats();
  assert.equal(s.wrong, 1);
  assert.equal(s.firstTry, 2);
  assert.ok(Math.abs(s.acc - 2 / 3) < 1e-9);
});

test('two-hand moment needs both midis in any order', () => {
  const p = createWaitPlayer([ev(0, [60]), ev(0, [48], { hand: 'lh' }), ev(1, [62])]);
  let r = p.push(60);
  assert.equal(r.status, 'pending');
  assert.deepEqual(r.matched, [60]);
  assert.deepEqual(r.need, [48]);
  assert.equal(p.push(48).status, 'advance');
  const q = createWaitPlayer([ev(0, [60]), ev(0, [48], { hand: 'lh' })]);
  assert.equal(q.push(48).status, 'pending');
  assert.equal(q.push(60).status, 'done');
});

test('repeated notes need a fresh push each moment', () => {
  const p = createWaitPlayer([ev(0, [60]), ev(1, [60]), ev(2, [60])]);
  assert.equal(p.push(60).status, 'advance');
  assert.equal(p.index, 1);
  assert.equal(p.push(60).status, 'advance');
  assert.equal(p.push(60).status, 'done');
  assert.equal(p.push(60).status, 'done');
});

test('pcMode accepts any octave', () => {
  const strict = createWaitPlayer(line);
  assert.equal(strict.push(72).status, 'wrong');
  const p = createWaitPlayer(line, { pcMode: true });
  assert.equal(p.push(72).status, 'advance');
  assert.equal(p.push(50).status, 'advance');
  assert.equal(p.stats().wrong, 0);
});

test('gradeTempo hit / late / missed / extra at 60 and 120 bpm', () => {
  // 60 bpm: beat = 1000 ms, tol = max(250, 130) = 250
  let g = gradeTempo(line, [{ midi: 60, tMs: 5000 }, { midi: 62, tMs: 6100 }, { midi: 64, tMs: 7200 }], { bpm: 60, startMs: 5000 });
  assert.deepEqual([g.onsets, g.hit, g.missed, g.extra, g.acc], [3, 3, 0, 0, 1]);
  assert.equal(g.meanAbsMs, 100);
  // late third note (400 ms) -> missed + extra
  g = gradeTempo(line, [{ midi: 60, tMs: 0 }, { midi: 62, tMs: 1000 }, { midi: 64, tMs: 2400 }], { bpm: 60, startMs: 0 });
  assert.deepEqual([g.hit, g.missed, g.extra], [2, 1, 1]);
  // 120 bpm: beat = 500 ms, tol = max(125, 130) = 130
  g = gradeTempo(line, [{ midi: 60, tMs: 0 }, { midi: 62, tMs: 620 }, { midi: 64, tMs: 1000 }], { bpm: 120, startMs: 0 });
  assert.deepEqual([g.hit, g.missed], [3, 0]); // 120 ms early/late inside the 130 ms floor
  g = gradeTempo(line, [{ midi: 60, tMs: 0 }, { midi: 62, tMs: 650 }, { midi: 64, tMs: 1000 }], { bpm: 120, startMs: 0 });
  assert.deepEqual([g.hit, g.missed, g.extra], [2, 1, 1]);
  // wrong pitch is extra; missing note is missed
  g = gradeTempo(line, [{ midi: 60, tMs: 0 }, { midi: 63, tMs: 1000 }], { bpm: 60, startMs: 0 });
  assert.deepEqual([g.hit, g.missed, g.extra], [1, 2, 1]);
  // pcMode
  g = gradeTempo(line, [{ midi: 72, tMs: 0 }, { midi: 50, tMs: 1000 }, { midi: 40, tMs: 2000 }], { bpm: 60, startMs: 0, pcMode: true });
  assert.equal(g.hit, 3);
  assert.equal(gradeTempo([], [], { bpm: 60, startMs: 0 }).acc, 0);
});
