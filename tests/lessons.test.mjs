import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, LESSONS, getLesson, taughtThrough, songMinLesson, lessonSongIds } from '../src/lessons.js';
import { getSong, songBars } from '../src/songs.js';
import { ITEMS, getStage, stageItems } from '../src/curriculum.js';

const VISUAL_KINDS = new Set([
  'kb-groups', 'kb-names', 'staff-key-link', 'clef', 'line-space', 'step-skip', 'interval-shapes', 'landmarks', 'mnemonic',
  'finger-numbers', 'hand-position', 'note-values', 'time-sig', 'grand-staff', 'accidental', 'key-signature', 'ledger',
  'chord-stack', 'legato',
]);
const STEP_TYPES = new Set([
  'concept', 'tip', 'demo', 'guided', 'find-key', 'name-it', 'landmark-distance', 'mnemonic', 'flash', 'drill',
  'melody-wait', 'melody-tempo', 'progression', 'quiz', 'recap',
]);
const key = (r) => `${r.staff === 'bass' ? 'b' : 't'}:${r.midi}`;

/** every NoteRef carried by a step (not itemId targets) */
function stepNoteRefs(s) {
  switch (s.type) {
    case 'demo': return s.notes || [];
    case 'guided': return s.targets.flatMap((tg) => (tg.notes ? tg.notes : tg.midi !== undefined ? [tg] : []));
    case 'name-it': return s.targets;
    case 'landmark-distance': return [s.landmark, ...s.targets];
    case 'mnemonic': return s.notes;
    case 'flash': return s.patterns.flat();
    default: return [];
  }
}

test('32 lessons in 6 units, ids and numbers in order', () => {
  assert.equal(LESSONS.length, 32);
  LESSONS.forEach((l, i) => {
    assert.equal(l.n, i + 1);
    assert.equal(l.id, `L${String(i + 1).padStart(2, '0')}`);
    assert.equal(getLesson(l.id), l);
  });
  assert.equal(getLesson('L99'), undefined);
  assert.equal(UNITS.length, 6);
  assert.deepEqual(UNITS.flatMap((u) => u.lessonIds), LESSONS.map((l) => l.id));
  for (const u of UNITS) for (const id of u.lessonIds) assert.equal(getLesson(id).unit, u.n);
});

test('every lesson has the required shape', () => {
  for (const l of LESSONS) {
    for (const f of ['title', 'goal', 'preview']) assert.ok(typeof l[f] === 'string' && l[f].length > 0, `${l.id} ${f}`);
    for (const f of ['teaches', 'items', 'features', 'passesStages', 'placeOut', 'spares', 'steps']) assert.ok(Array.isArray(l[f]), `${l.id} ${f}`);
    assert.ok(['quiz', 'melody'].includes(l.checkpoint.kind));
    assert.ok(l.checkpoint.passAcc === 0.8);
    assert.ok(l.checkpoint.aceAcc === (l.checkpoint.kind === 'quiz' ? 0.9 : 0.92));
    assert.ok(l.preview.length <= 80, `${l.id} preview length`);
  }
});

test('every song referenced exists and is playable at that lesson', () => {
  for (const l of LESSONS) {
    for (const id of lessonSongIds(l)) {
      const song = getSong(id);
      assert.ok(song, `${l.id}: unknown song ${id}`);
      assert.ok(songMinLesson(song) <= l.n, `${l.id}: ${id} needs lesson ${songMinLesson(song)}`);
    }
    for (const s of l.steps) {
      if (!s.songId) continue;
      const song = s.bars ? songBars(getSong(s.songId), s.bars) : getSong(s.songId);
      assert.ok(songMinLesson(song) <= l.n, `${s.id}: sliced ${s.songId} needs lesson ${songMinLesson(song)}`);
    }
    for (const id of l.spares) assert.ok(getSong(id), `${l.id} spare ${id}`);
  }
});

test('item ids exist in the curriculum and are not repeated across lessons', () => {
  const seen = new Map();
  for (const l of LESSONS) {
    for (const id of l.items) {
      assert.ok(ITEMS[id], `${l.id}: unknown item ${id}`);
      assert.ok(!seen.has(id), `${id} in ${seen.get(id)} and ${l.id}`);
      seen.set(id, l.id);
    }
    for (const s of l.steps) {
      for (const id of s.itemIds || []) assert.ok(ITEMS[id], `${s.id}: unknown item ${id}`);
      if (s.type === 'guided') for (const tg of s.targets) if (tg.itemId) {
        assert.ok(ITEMS[tg.itemId], `${s.id}: unknown item ${tg.itemId}`);
        assert.ok(taughtThrough(l.n).items.includes(tg.itemId), `${s.id}: ${tg.itemId} not yet taught`);
      }
      if (s.type === 'drill' && s.source === 'items') for (const id of s.itemIds) assert.ok(taughtThrough(l.n).items.includes(id), `${s.id}: ${id} not yet taught`);
      if (s.type === 'quiz' || s.type === 'progression') for (const id of s.itemIds || []) assert.ok(taughtThrough(l.n).items.includes(id), `${s.id}: ${id} not yet taught`);
    }
  }
});

test('single-note items and teaches entries match', () => {
  for (const l of LESSONS) {
    const noteItems = l.items.filter((id) => id.startsWith('n:'));
    const viaTeaches = l.teaches.filter((r) => r.itemId).map((r) => r.itemId);
    assert.deepEqual([...noteItems].sort(), [...viaTeaches].sort(), `${l.id}`);
    for (const r of l.teaches.filter((x) => x.itemId)) assert.equal(r.itemId, `n:${r.staff === 'bass' ? 'b' : 't'}:${r.midi}`);
    for (const r of l.teaches) {
      assert.ok(r.staff === 'treble' || r.staff === 'bass');
      if (r.accidental) assert.ok(r.accidental === '#' || r.accidental === 'b');
    }
  }
});

test('every NoteRef in teaching steps is already taught', () => {
  for (const l of LESSONS) {
    const taught = new Set(taughtThrough(l.n).pitches);
    for (const s of l.steps) {
      for (const r of stepNoteRefs(s)) assert.ok(taught.has(key(r)), `${s.id} (${s.type}): ${key(r)} not taught by ${l.id}`);
    }
  }
});

test('find-key targets fit their range', () => {
  for (const l of LESSONS) {
    for (const s of l.steps.filter((x) => x.type === 'find-key')) {
      assert.ok(s.range.lo < s.range.hi);
      for (const pc of s.pcs) {
        let n = 0;
        for (let m = s.range.lo; m <= s.range.hi; m++) if (m % 12 === pc) n++;
        assert.ok(n >= (s.count || 1), `${s.id}: pc ${pc} has ${n} keys in range, wants ${s.count}`);
      }
    }
  }
});

test('mnemonic words line up with notes', () => {
  for (const l of LESSONS) for (const s of l.steps.filter((x) => x.type === 'mnemonic')) {
    assert.equal(s.words.length, s.notes.length);
    assert.equal(s.words.join(s.words.length > 1 && s.phrase.includes(' ') ? ' ' : ''), s.phrase);
  }
});

test('passesStages are fully taught by that lesson', () => {
  for (const l of LESSONS) {
    const items = new Set(taughtThrough(l.n).items);
    for (const st of l.passesStages) {
      assert.ok(getStage(st), `${l.id}: unknown stage ${st}`);
      if (st === 'grand-mixed') continue;
      for (const it of stageItems(st)) assert.ok(items.has(it.id), `${l.id}: stage ${st} item ${it.id} not covered`);
    }
  }
  const l24 = getLesson('L24');
  for (const st of ['intervals', 'dyads', 'hands-together']) {
    for (const it of stageItems(st)) assert.ok(l24.items.concat(taughtThrough(23).items).includes(it.id), `${st} ${it.id}`);
  }
});

test('step ids, ordering, warm-up and recap', () => {
  for (const l of LESSONS) {
    const seen = new Set();
    l.steps.forEach((s, i) => {
      assert.equal(s.id, `${l.id}.s${String(i + 1).padStart(2, '0')}`);
      assert.ok(!seen.has(s.id));
      seen.add(s.id);
      assert.ok(STEP_TYPES.has(s.type), `${s.id}: ${s.type}`);
      assert.ok(s.title && s.purpose, `${s.id}: title and purpose`);
    });
    assert.equal(l.steps.at(-1).type, 'recap');
    if (l.n === 1) assert.ok(!l.steps.some((s) => s.type === 'drill' && s.source === 'warmup'), 'L01 has no warm-up');
    else {
      assert.equal(l.steps[0].type, 'drill');
      assert.equal(l.steps[0].source, 'warmup');
    }
    assert.equal(l.steps.filter((s) => s.type === 'drill' && s.source === 'warmup').length, l.n === 1 ? 0 : 1);
  }
});

test('exactly one checkpoint per lesson, pointing at the right step', () => {
  for (const l of LESSONS) {
    const flagged = l.steps.filter((s) => s.type === 'quiz' || s.checkpoint === true);
    assert.equal(flagged.length, 1, `${l.id}`);
    assert.equal(flagged[0].id, l.checkpoint.stepId);
    assert.equal(flagged[0].type, l.checkpoint.kind === 'quiz' ? 'quiz' : 'melody-wait');
    if (l.checkpoint.kind === 'melody') assert.ok(!l.steps.some((s) => s.type === 'quiz'));
  }
  const melody = LESSONS.filter((l) => l.checkpoint.kind === 'melody').map((l) => l.n);
  assert.deepEqual(melody, [4, 8, 12, 18, 27, 28, 29, 30, 31, 32]);
});

test('concept and tip text limits, visual kinds, no exclamation marks', () => {
  for (const l of LESSONS) {
    for (const s of l.steps.filter((x) => x.type === 'concept' || x.type === 'tip')) {
      assert.ok(Array.isArray(s.body) && s.body.length >= 1, `${s.id}`);
      assert.ok(s.body.length <= (s.type === 'concept' ? 3 : 2), `${s.id} has ${s.body.length} lines`);
      for (const line of s.body) {
        assert.ok(line.length <= 110, `${s.id}: ${line.length} chars`);
        assert.ok(!line.includes('!'), `${s.id}: exclamation mark`);
      }
      if (s.type === 'concept') assert.ok(s.visual, `${s.id} needs a visual`);
      if (s.visual) assert.ok(VISUAL_KINDS.has(s.visual.kind), `${s.id}: visual ${s.visual.kind}`);
    }
  }
});

test('step field shapes follow section 3', () => {
  for (const l of LESSONS) for (const s of l.steps) {
    switch (s.type) {
      case 'demo': assert.ok((s.notes && s.notes.length) || s.songId); assert.equal(s.loops, 2); assert.equal(s.bpm, 60); assert.equal(s.showNames, true); break;
      case 'guided': assert.ok(['glow', 'name', 'none'].includes(s.scaffold)); assert.ok(s.targets.length); assert.ok(s.rounds >= 1); assert.equal(typeof s.shuffle, 'boolean'); break;
      case 'find-key': assert.ok(s.pcs.length && s.prompt && s.range && typeof s.hintGroups === 'boolean'); break;
      case 'name-it': assert.ok(s.targets.length && s.rounds >= 1); break;
      case 'flash': assert.ok(s.patterns.length >= 1 && s.showMs === 1500); break;
      case 'drill':
        assert.ok(['warmup', 'today', 'mixed', 'items'].includes(s.source));
        assert.ok(['off', 'auto'].includes(s.hints));
        assert.ok(s.min <= s.count);
        if (s.source === 'items') assert.ok(s.itemIds.length);
        break;
      case 'melody-wait':
        assert.ok(getSong(s.songId)); assert.ok(s.passes.length >= 1);
        for (const p of s.passes) { assert.ok(['rh', 'lh', 'both'].includes(p.hands)); assert.equal(typeof p.names, 'boolean'); assert.equal(typeof p.glow, 'boolean'); assert.equal(typeof p.fingers, 'boolean'); }
        break;
      case 'melody-tempo': assert.ok(getSong(s.songId)); assert.ok(s.bpm > 0); assert.equal(typeof s.optional, 'boolean'); break;
      case 'progression': assert.ok(s.itemIds.length); break;
      case 'quiz': assert.equal(s.passAcc, 0.8); break;
      default: break;
    }
  }
});

test('melody passes only use hands the song has', () => {
  for (const l of LESSONS) for (const s of l.steps.filter((x) => x.type === 'melody-wait' || x.type === 'melody-tempo')) {
    const parts = Object.keys(getSong(s.songId).parts);
    const hands = s.type === 'melody-wait' ? s.passes.map((p) => p.hands) : [s.hands];
    for (const h of hands) assert.ok(h === 'both' ? parts.length === 2 || parts.length === 1 : parts.includes(h), `${s.id}: ${h} vs ${parts}`);
  }
  // single-part songs play with their own hand, two-part songs default to both
  assert.equal(LESSONS[0].steps.find((s) => s.type === 'melody-wait').passes[0].hands, 'rh');
  assert.equal(getLesson('L05').steps.find((s) => s.type === 'melody-wait').passes[0].hands, 'lh');
  assert.equal(getLesson('L07').steps.filter((s) => s.type === 'melody-wait')[1].passes[0].hands, 'both');
});

test('taughtThrough is cumulative; songMinLesson handles unreachable songs', () => {
  const a = taughtThrough(1);
  assert.deepEqual(a.pitches, ['t:60', 't:62', 't:64']);
  assert.deepEqual(a.features, ['q', 'h', 'w']);
  assert.deepEqual(a.items, ['n:t:60', 'n:t:62', 'n:t:64']);
  const b = taughtThrough(32);
  assert.ok(b.pitches.length > a.pitches.length);
  assert.ok(b.features.includes('chord') && b.features.includes('key-1'));
  assert.equal(taughtThrough(0).pitches.length, 0);
  assert.equal(songMinLesson({ parts: { rh: [[{ midis: [30], accidentals: [null], dur: 'q', beats: 1 }]] }, time: [4, 4], key: 0, pickup: 0 }), Infinity);
});

test('lessonSongIds lists steps then spares without duplicates', () => {
  assert.deepEqual(lessonSongIds(getLesson('L06')), ['hot-cross-buns-lh', 'ode-to-joy-lh', 'au-clair-lh']);
  assert.deepEqual(lessonSongIds(getLesson('L12')), ['joy-to-the-world', 'amazing-grace', 'silent-night']);
  assert.deepEqual(lessonSongIds(getLesson('L04')), ['aunt-rhody', 'ode-to-joy', 'jingle-bells']);
});

test('lesson data is frozen', () => {
  assert.throws(() => { 'use strict'; LESSONS[0].title = 'x'; });
});
