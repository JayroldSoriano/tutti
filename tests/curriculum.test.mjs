import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, ITEMS, getStage, stageItems, realize, noteName, staffStep, isBlack } from '../src/curriculum.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allItems = Object.values(ITEMS);
const pc = (m) => ((m % 12) + 12) % 12;

test('stage list shape', () => {
  assert.equal(STAGES.length, 15);
  STAGES.forEach((s, i) => assert.equal(s.index, i));
  assert.equal(STAGES.at(-1).id, 'pedal');
  assert.equal(STAGES.at(-1).optional, true);
  assert.equal(STAGES.at(-1).requires, 'bass-staff');
  assert.deepEqual(STAGES.map((s) => s.itemIds.length), [5, 7, 5, 7, 0, 10, 24, 10, 12, 16, 36, 15, 12, 5, 16]);
  for (const s of STAGES) {
    assert.ok(s.rt.start > s.rt.end, s.id);
    assert.equal(getStage(s.id), s);
  }
  assert.equal(getStage('nope'), undefined);
});

test('every stage item id resolves; ids unique', () => {
  const seen = new Set();
  for (const s of STAGES) {
    for (const id of s.itemIds) {
      assert.ok(ITEMS[id], id);
      assert.equal(ITEMS[id].stageId, s.id);
      assert.ok(!seen.has(id), `dup ${id}`);
      seen.add(id);
    }
    for (const r of s.refs || []) assert.ok(getStage(r), r);
  }
  assert.equal(seen.size, Object.keys(ITEMS).length);
  for (const it of allItems) {
    assert.ok(it.label && it.hint && it.hint.name, it.id);
    assert.equal(it.id, Object.keys(ITEMS).find((k) => ITEMS[k] === it));
  }
  assert.equal(stageItems('grand-mixed').length, 24);
  assert.deepEqual(stageItems('treble-landmarks').map((i) => i.id), ['n:t:60', 'n:t:67', 'n:t:72', 'n:t:64', 'n:t:77']);
  assert.deepEqual(stageItems('bass-landmarks').map((i) => i.id), ['n:b:60', 'n:b:53', 'n:b:48', 'n:b:43', 'n:b:57']);
  assert.ok(ITEMS['ht:48+64'] && ITEMS['ch:t:C:0'] && ITEMS['hy:G:V7'] && ITEMS['rh:q-q-h'] && ITEMS['ph:tr-step'] && ITEMS['pd:36']);
  assert.ok(ITEMS['iv:t:+3'] && ITEMS['iv:b:-5'] && ITEMS['dy:t:3']);
});

function checkConsistency(p, item) {
  assert.ok(p.notes.length > 0, item.id);
  const a = p.answer;
  if (a.type === 'set') {
    assert.deepEqual([...a.midis].sort((x, y) => x - y), p.notes.map((n) => n.midi).sort((x, y) => x - y), item.id);
    assert.equal(new Set(a.midis).size, a.midis.length, item.id);
  } else if (a.type === 'sequence') {
    const ordered = [...p.notes].sort((x, y) => x.beat - y.beat).map((n) => n.midi);
    assert.deepEqual(a.midis, ordered, item.id);
    assert.ok(a.given >= 0 && a.given < a.midis.length);
  } else {
    assert.equal(a.type, 'rhythm');
    assert.deepEqual(a.onsets, p.notes.map((n) => n.beat));
    assert.equal(a.beats, 4);
    assert.equal(a.bpm, 72);
    const total = p.notes.reduce((s, n) => s + { w: 4, h: 2, q: 1, 8: 0.5 }[n.dur], 0);
    assert.equal(total, 4);
    return;
  }
  const ms = a.midis;
  assert.equal(p.range.lo % 12, 0);
  assert.equal(p.range.hi % 12, 0);
  assert.ok(p.range.hi - p.range.lo >= 24, item.id);
  assert.ok(p.range.lo <= Math.min(...ms) && p.range.hi >= Math.max(...ms), item.id);
}

test('realised prompts: answers consistent with notes (many seeds)', () => {
  for (const it of allItems) {
    for (let seed = 1; seed <= 25; seed++) {
      const p = realize(it, mulberry32(seed));
      checkConsistency(p, it);
      assert.equal(p.clef, it.clef);
    }
  }
});

// Staff steps: stages other than ledger/pedal stay within the five lines +- 1 step, with the
// documented exceptions: middle C on its own ledger line (stages 0/2/4/7/13), and one ledger line
// each side for the shape stages (intervals, dyads, hands, triads, hymn chords).
test('notes sit inside the staff window', () => {
  const lenient = new Set(['intervals', 'dyads', 'hands-together', 'triads', 'hymn-chords']);
  for (const it of allItems) {
    if (it.stageId === 'ledger' || it.stageId === 'pedal') continue;
    for (let seed = 1; seed <= 40; seed++) {
      const p = realize(it, mulberry32(seed));
      for (const n of p.notes) {
        if (p.kind === 'rhythm') continue;
        const step = staffStep(n.midi, n.staff, n.accidental);
        const ok = lenient.has(it.stageId)
          ? step >= -2 && step <= 10
          : (step >= -1 && step <= 9) || (n.midi === 60 && (step === -2 || step === 10)) || (it.id === 'n:b:61' && step === 10);
        assert.ok(ok, `${it.id} midi ${n.midi} step ${step}`);
      }
    }
  }
});

test('ledger stage really uses ledger lines', () => {
  for (const it of stageItems('ledger')) {
    const n = realize(it, mulberry32(1)).notes[0];
    const step = staffStep(n.midi, n.staff);
    assert.ok(step < -1 || step > 9, `${it.id} ${step}`);
  }
});

test('realize is deterministic for a fixed seed and varies across seeds', () => {
  for (const it of allItems) {
    assert.deepEqual(realize(it, mulberry32(42)), realize(it, mulberry32(42)), it.id);
  }
  const shapes = new Set();
  for (let s = 1; s < 30; s++) shapes.add(JSON.stringify(realize(ITEMS['iv:t:+3'], mulberry32(s)).answer.midis));
  assert.ok(shapes.size > 3);
});

test('intervals and dyads have the right size and direction', () => {
  for (const it of stageItems('intervals')) {
    for (let s = 1; s < 30; s++) {
      const p = realize(it, mulberry32(s));
      const [a, b] = p.answer.midis;
      assert.equal(p.answer.given, 1);
      assert.ok(!isBlack(a) && !isBlack(b));
      const dia = (m) => Math.floor(m / 12) * 7 + { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 }[pc(m)];
      assert.equal(dia(b) - dia(a), it.gen.dir * (it.gen.size - 1), it.id);
    }
  }
  for (const it of stageItems('dyads')) {
    for (let s = 1; s < 30; s++) {
      const [a, b] = realize(it, mulberry32(s)).answer.midis;
      const dia = (m) => Math.floor(m / 12) * 7 + { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 }[pc(m)];
      assert.equal(Math.abs(dia(b) - dia(a)), it.gen.size - 1, it.id);
    }
  }
});

test('hands-together pairs: left on bass, right on treble, curated intervals', () => {
  const items = stageItems('hands-together');
  assert.equal(items.length, 16);
  for (const it of items) {
    const p = realize(it, mulberry32(1));
    const bass = p.notes.find((n) => n.staff === 'bass');
    const treble = p.notes.find((n) => n.staff === 'treble');
    assert.ok(bass && treble && bass.midi < treble.midi);
    assert.ok([7, 8, 9, 12, 15, 16].includes(treble.midi - bass.midi), it.id);
  }
});

test('triads: concrete correct voicings', () => {
  const pcs = { C: [0, 4, 7], F: [5, 9, 0], G: [7, 11, 2], Am: [9, 0, 4], Dm: [2, 5, 9], Em: [4, 7, 11] };
  for (const it of stageItems('triads')) {
    const { sym, inv } = it.gen;
    const ms = realize(it, mulberry32(1)).answer.midis;
    assert.equal(ms.length, 3);
    assert.deepEqual(ms.map(pc), [0, 1, 2].map((i) => pcs[sym][(inv + i) % 3]), it.id);
    assert.ok(ms[0] < ms[1] && ms[1] < ms[2] && ms[2] - ms[0] <= 12);
  }
});

test('hymn chords: SATB voicing rules, chord tones, key signature', () => {
  const expect = {
    C: { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2], vi: [9, 0, 4], V7: [7, 11, 2, 5] },
    G: { I: [7, 11, 2], IV: [0, 4, 7], V: [2, 6, 9], vi: [4, 7, 11], V7: [2, 6, 9, 0] },
    F: { I: [5, 9, 0], IV: [10, 2, 5], V: [0, 4, 7], vi: [2, 5, 9], V7: [0, 4, 7, 10] },
  };
  const sigs = { C: 0, G: 1, F: -1 };
  const items = stageItems('hymn-chords');
  assert.equal(items.length, 15);
  for (const it of items) {
    const [, key, num] = it.id.split(':');
    const p = realize(it, mulberry32(1));
    assert.equal(p.keySig, sigs[key]);
    const [b, t, a, s] = it.gen.voices;
    assert.ok(b <= t && t <= a && a <= s, it.id);
    assert.ok(t - b <= 12 && s - a <= 12 && a - t <= 12 && s - a <= 12, `spacing ${it.id}`);
    const set = new Set(expect[key][num]);
    const used = new Set(it.gen.voices.map(pc));
    for (const x of used) assert.ok(set.has(x), `${it.id} stray pc ${x}`);
    assert.ok(used.has(expect[key][num][0]) && used.has(expect[key][num][1]), `${it.id} root+third`);
    if (num === 'V7') assert.equal(used.size, 4, it.id);
    assert.deepEqual(p.notes.filter((n) => n.staff === 'treble').map((n) => n.midi).sort(), [a, s].sort());
    assert.deepEqual(p.notes.filter((n) => n.staff === 'bass').map((n) => n.midi).sort(), [b, t].sort());
    assert.equal(pc(b), expect[key][num][0], `${it.id} root in bass`);
    // black keys must be spelled by the key signature (F# in G, Bb in F)
    for (const m of it.gen.voices) if (isBlack(m)) assert.ok((key === 'G' && pc(m) === 6) || (key === 'F' && pc(m) === 10), it.id);
  }
});

test('rhythm patterns', () => {
  const items = stageItems('rhythm');
  assert.equal(items.length, 12);
  const p = realize(ITEMS['rh:q-q-h'], mulberry32(1));
  assert.deepEqual(p.answer, { type: 'rhythm', onsets: [0, 1, 2], beats: 4, bpm: 72 });
  assert.deepEqual(realize(ITEMS['rh:8-8-q-h'], mulberry32(1)).answer.onsets, [0, 0.5, 1, 2]);
  for (const it of items) checkConsistency(realize(it, mulberry32(1)), it);
});

test('phrases: 4-8 notes, landmark start, step/skip rules', () => {
  for (const it of stageItems('phrases')) {
    for (let s = 1; s <= 60; s++) {
      const p = realize(it, mulberry32(s));
      const ms = p.answer.midis;
      assert.equal(p.answer.type, 'sequence');
      assert.equal(p.answer.given, 0);
      assert.ok(ms.length >= 4 && ms.length <= 8, `${it.id} len ${ms.length}`);
      const tpl = it.gen.template;
      if (tpl === 'alt') {
        p.notes.forEach((n, i) => assert.equal(n.staff, i % 2 === 0 ? 'treble' : 'bass'));
        assert.ok([60, 67, 72].includes(ms[0]));
        continue;
      }
      const staff = tpl.startsWith('tr') ? 'treble' : 'bass';
      assert.ok(p.notes.every((n) => n.staff === staff));
      assert.ok((staff === 'treble' ? [60, 67, 72] : [43, 48, 53]).includes(ms[0]), `${it.id} start ${ms[0]}`);
      const dia = (m) => Math.floor(m / 12) * 7 + { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 }[pc(m)];
      const moves = ms.slice(1).map((m, i) => Math.abs(dia(m) - dia(ms[i])));
      assert.ok(moves.every((d) => d >= 1 && d <= 3));
      const skips = moves.filter((d) => d > 1).length;
      if (tpl.endsWith('step')) assert.ok(skips <= 1, `${it.id} skips ${skips}`);
      else assert.ok(skips >= 1, `${it.id} skips ${skips}`);
    }
  }
});

test('accidental and pedal stages', () => {
  for (const it of stageItems('accidentals')) {
    const n = realize(it, mulberry32(1)).notes[0];
    assert.ok(isBlack(n.midi) && (n.accidental === '#' || n.accidental === 'b'), it.id);
  }
  const ped = stageItems('pedal');
  assert.equal(ped.length, 16);
  const ms = ped.map((i) => i.gen.midi);
  assert.equal(Math.min(...ms), 36);
  assert.equal(Math.max(...ms), 62);
  assert.ok(ped.every((i) => i.clef === 'bass' && !isBlack(i.gen.midi)));
});

test('staffStep', () => {
  assert.equal(staffStep(64, 'treble'), 0);
  assert.equal(staffStep(60, 'treble'), -2);
  assert.equal(staffStep(60, 'bass'), 10);
  assert.equal(staffStep(43, 'bass'), 0);
  assert.equal(staffStep(77, 'treble'), 8);
  assert.equal(staffStep(57, 'bass'), 8);
  // accidentals do not move the step
  assert.equal(staffStep(66, 'treble', '#'), staffStep(65, 'treble'));
  assert.equal(staffStep(70, 'treble', 'b'), staffStep(71, 'treble'));
  assert.equal(staffStep(66, 'treble', 'b'), staffStep(67, 'treble'));
});

test('noteName', () => {
  assert.equal(noteName(60, 'letters'), 'C4');
  assert.equal(noteName(69, 'letters'), 'A4');
  assert.equal(noteName(36, 'letters'), 'C2');
  assert.equal(noteName(66, 'letters'), 'F#4');
  assert.equal(noteName(70, 'letters'), 'Bb4');
  assert.equal(noteName(70, 'letters', { accidental: '#' }), 'A#4');
  assert.equal(noteName(61, 'letters', { accidental: 'b' }), 'Db4');
  assert.equal(noteName(60, 'letters', { octave: false }), 'C');
  const sol = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
  [60, 62, 64, 65, 67, 69, 71].forEach((m, i) => assert.equal(noteName(m, 'solfege'), sol[i]));
  assert.equal(noteName(71, 'solfege'), 'Ti');
  assert.equal(noteName(66, 'solfege'), 'Fa#');
  assert.equal(noteName(60, 'solfege', { octave: true }), 'Do4');
});

test('isBlack', () => {
  const blacks = [61, 63, 66, 68, 70, 73];
  for (let m = 36; m < 84; m++) assert.equal(isBlack(m), [1, 3, 6, 8, 10].includes(m % 12));
  blacks.forEach((m) => assert.ok(isBlack(m)));
});

test('no forbidden nondeterminism or imports in source', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/curriculum.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(src));
  assert.ok(!/^import /m.test(src));
});
