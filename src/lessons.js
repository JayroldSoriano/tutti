// Tutti v2 lesson path: 32 core lessons in 6 units, encoded from PLAN-LESSONS.md section 2.
// Pure ES module. Imports songs.js only (curriculum item ids are plain strings here; the tests
// check them against curriculum.js).

import { getSong, songPitches, songFeatures } from './songs.js';

// ---------------------------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------------------------

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pad2 = (n) => String(n).padStart(2, '0');

/** 'F#4' + staff -> NoteRef { midi, staff, accidental? } (accidental only on black keys). */
function ref(name, staff) {
  const m = /^([A-G])([#b])?(-?\d)$/.exec(name);
  if (!m) throw new Error(`lessons.js: bad note name "${name}"`);
  const midi = (Number(m[3]) + 1) * 12 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const r = { midi, staff };
  if (m[2]) r.accidental = m[2];
  return r;
}
const t = (n) => ref(n, 'treble');
const b = (n) => ref(n, 'bass');
const ts = (s) => s.split(/\s+/).map(t);
const bs = (s) => s.split(/\s+/).map(b);
/** 't:C4 b:G3 ...' -> NoteRef[]; bare names use `dflt`. */
const pat = (s, dflt = 'treble') =>
  s.split(/\s+/).map((tok) => {
    const m = /^([tb]):(.+)$/.exec(tok);
    return m ? ref(m[2], m[1] === 'b' ? 'bass' : 'treble') : ref(tok, dflt);
  });
const ids = (s) => s.split(/\s+/);
const noteItemId = (r) => `n:${r.staff === 'bass' ? 'b' : 't'}:${r.midi}`;

// step builders for the technique activities
const find = (title, prompt, pcs, count, range, o = {}) => ({
  type: 'find-key', title, purpose: o.purpose || 'Learn where the keys are by touch and by sight, with no staff to lean on.',
  prompt, pcs, count, range, hintGroups: !!o.hint, ...(o.ordered ? { ordered: true } : {}),
});
const nameIt = (title, targets, o = {}) => ({
  type: 'name-it', title, purpose: o.purpose || 'Say the letter name out loud, then confirm it: that links the staff, the name and the key.',
  targets, rounds: o.rounds || 2, ...(o.askHand ? { askHand: true } : {}),
});
const landmark = (title, lm, targets, purpose) => ({
  type: 'landmark-distance', title, purpose: purpose || 'Read a note by its distance from one you already know, not by counting up from the bottom.',
  landmark: lm, targets,
});
const mnemonic = (title, phrase, notes) => ({
  type: 'mnemonic', title, purpose: 'A rhyme is your spare route to a note when the distance method is not enough.',
  phrase, words: phrase.includes(' ') ? phrase.split(' ') : phrase.split(''), notes,
});
const flash = (title, patterns, o = {}) => ({
  type: 'flash', title, purpose: o.purpose || 'See a short pattern for a moment, then play it from memory. That trains you to read in chunks.',
  patterns, showMs: 1500, ...(o.pairs ? { pairs: true } : {}),
});
const guided = (title, scaffold, targets, o = {}) => ({
  type: 'guided', title, purpose: o.purpose || 'Play each target in turn. Mistakes cost nothing here.',
  scaffold, targets, rounds: o.rounds || 1, shuffle: !!o.shuffle,
});
const drillItems = (title, itemIds, count, o = {}) => ({
  type: 'drill', title, purpose: o.purpose || 'Short, quick repeats of exactly what this lesson teaches.',
  source: 'items', itemIds, count, min: count, hints: o.hints || 'off', stopEarly: false,
});
const drillMixed = (title, count) => ({
  type: 'drill', title, purpose: 'Everything you know so far, shuffled, so you learn to switch quickly.',
  source: 'mixed', count, min: count, hints: 'off', stopEarly: false,
});
const progression = (title, itemIds, scaffold) => ({
  type: 'progression', title, purpose: 'Move from chord to chord in order, the way a hymn does.', itemIds, scaffold,
});
const itemTargets = (s) => ids(s).map((itemId) => ({ itemId }));

// visuals
const V = (kind, params = {}) => ({ kind, ...params });

// songs
const wait = (song, o = {}) => ({ kind: 'wait', song, ...o });
const tempo = (song, bpm, o = {}) => ({ kind: 'tempo', song, bpm, optional: true, ...o });

// ---------------------------------------------------------------------------------------------
// Lesson specs (section 2). `items` are v1 engine item ids.
// ---------------------------------------------------------------------------------------------

const KEYB = { lo: 36, hi: 84 };
const C4 = t('C4');

const SPECS = [
  // ---------------------------------------------------------------- Unit 1
  {
    title: 'The keyboard map and middle C',
    goal: 'Find any C, D, E on the keyboard; read C4, D4, E4 on the treble staff; play a tune.',
    preview: 'Find C, D and E on the keyboard and play your first tune',
    teaches: ts('C4 D4 E4'), items: 'n:t:60 n:t:62 n:t:64', features: 'q h w',
    placeOut: 'treble-landmarks treble-staff',
    concepts: [
      { title: 'Twos and threes', body: ['Look at the black keys: they come in groups of two and groups of three.', 'The groups repeat all along the keyboard, so you can find your place anywhere.'], visual: V('kb-groups') },
      { title: 'C lives left of the two', body: ['C is the white key just left of every group of two black keys.', 'D sits between the two black keys. E is the white key to the right of them.'], visual: V('kb-names', { letters: ['C', 'D', 'E'] }) },
      { title: 'Middle C on paper', body: ['The staff is a ladder of five lines. Middle C sits on its own short line below it.', 'D hangs just under the bottom line and E sits on the bottom line.'], visual: V('staff-key-link', { notes: ts('C4 D4 E4') }) },
    ],
    technique: [
      find('Find every C', 'Find every C on the keyboard.', [0], 4, KEYB, { hint: true }),
      find('Find D, then E', 'Find every D, then every E.', [2, 4], 3, KEYB, { hint: true, ordered: true }),
      nameIt('Say it, then tap it', ts('C4 D4 E4')),
    ],
    tip: { title: 'Finger numbers', body: ['Right hand, curved fingers: thumb is 1, index 2, middle 3.', 'Put your thumb on middle C.'], visual: V('finger-numbers', { hand: 'rh' }) },
    songs: [wait('hot-cross-buns', { pos: { rh: 60 } })],
    quiz: { count: 8 },
  },
  {
    title: 'F and G: the C position',
    goal: 'Read F4 and G4; keep five fingers over C-D-E-F-G and play without looking down.',
    preview: 'F and G, and the five-finger C position',
    teaches: ts('F4 G4'), items: 'n:t:65 n:t:67',
    concepts: [
      { title: 'The treble clef is a G', body: ['The treble clef curls around the second line from the bottom. That line is G.', 'Once you know G, every other line and space is a few steps away.'], visual: V('clef', { clef: 'treble', landmark: t('G4') }) },
      { title: 'F and G live left of the three', body: ['F is the white key just left of every group of three black keys.', 'G is the next white key to the right, between the first and second black keys of the three.'], visual: V('kb-names', { letters: ['F', 'G'] }) },
      { title: 'Up the ladder', body: ['Line, space, line, space: each step up the staff is the next white key to the right.', 'C D E F G climbs from the short line under the staff to the second line.'], visual: V('line-space', { from: 60, to: 67, staff: 'treble' }) },
    ],
    technique: [
      landmark('Measure from G', t('G4'), ts('F4 E4')),
      landmark('Measure from middle C', C4, ts('D4 E4')),
      find('Find every G', 'Find every G on the keyboard.', [7], 3, KEYB, { hint: true }),
    ],
    tip: { title: 'The C position', body: ['Fingers 1-2-3-4-5 rest on C-D-E-F-G. Each finger owns one key.', 'Do not look down at your hands.'], visual: V('hand-position', { hand: 'rh', thumb: 60 }) },
    songs: [wait('mary-lamb', { pos: { rh: 60 } }), wait('lightly-row', { pos: { rh: 60 } })],
    quiz: { count: 10 },
  },
  {
    title: 'Steps and skips: reading by distance',
    goal: 'Read a melody as a contour (same, step, skip) instead of naming every note.',
    preview: 'Read melodies by steps and skips instead of note names',
    teaches: [], items: 'iv:t:+2 iv:t:-2 iv:t:+3 iv:t:-3',
    concepts: [
      { title: 'Step', body: ['A step goes from a line to the next space, or from a space to the next line.', 'On the keyboard a step is the neighbouring white key.'], visual: V('step-skip', { size: 2 }) },
      { title: 'Skip', body: ['A skip goes from a line to the next line, or from a space to the next space.', 'On the keyboard you miss one white key in between.'], visual: V('step-skip', { size: 3 }) },
      { title: 'Read the shape', body: ['Name the first note, then follow the shape: same note, step or skip, up or down.', 'You can read whole phrases this way without naming every note.'], visual: V('interval-shapes', { song: 'ode-to-joy', bars: [1, 2] }) },
    ],
    technique: [
      landmark('Step or skip from middle C', C4, ts('D4 E4'), 'Say whether the note is a step or a skip away, then play it.'),
      landmark('Step or skip from G', t('G4'), ts('F4 E4'), 'Say whether the note is a step or a skip away, then play it.'),
      flash('Three-note shapes', [pat('C4 D4 E4'), pat('G4 F4 E4'), pat('C4 E4 G4'), pat('E4 D4 C4')]),
    ],
    tip: { title: 'Eyes on the page', body: ['Keep your eyes on the page, not your hands.', 'Feel for the neighbouring key with the neighbouring finger.'] },
    songs: [wait('au-clair'), wait('ode-to-joy')],
    quiz: { count: 10, itemIds: 'iv:t:+2 iv:t:-2 iv:t:+3 iv:t:-3 n:t:60 n:t:62 n:t:64 n:t:65 n:t:67' },
  },
  {
    title: 'Counting and legato: your first recital',
    goal: 'Hold notes for their full value, count a steady beat, join notes smoothly.',
    preview: 'Counting beats, holding long notes and playing legato',
    teaches: [], items: 'rh:w rh:h-h rh:q-q-q-q rh:q-q-h rh:h-q-q', features: 'h.',
    noToday: true,
    concepts: [
      { title: 'How long?', body: ['A quarter note lasts 1 beat, a half note 2, a dotted half note 3 and a whole note 4.', 'Count the beats out loud at a steady speed while you hold each key.'], visual: V('note-values') },
      { title: '4/4', body: ['The two 4s at the start mean four beats in every bar.', 'Bar lines are the fence posts: count 1 2 3 4 between each pair.'], visual: V('time-sig', { time: [4, 4] }) },
      { title: 'Legato', body: ['Organ tone never fades, so every gap between notes is audible.', 'Release each key at the moment the next one goes down: no gap and no overlap.'], visual: V('legato') },
    ],
    technique: [drillItems('Tap the rhythms', ids('rh:w rh:h-h rh:q-q-q-q rh:q-q-h rh:h-q-q'), 6, { hints: 'auto', purpose: 'Tap each rhythm on the pad while you count out loud.' })],
    tip: { title: 'Sit tall', body: ['Sit tall, with your forearms level with the keys and your wrists loose.'], visual: V('hand-position', { posture: true }) },
    songs: [wait('aunt-rhody'), tempo('ode-to-joy', 72, { optional: false }), wait('jingle-bells', { checkpoint: true })],
    melodyCheckpoint: true,
  },
  // ---------------------------------------------------------------- Unit 2
  {
    title: 'The bass clef: F, C and G',
    goal: 'Read the bass landmarks with the left hand.',
    preview: 'The bass clef: F, C and G for the left hand',
    teaches: bs('F3 C3 G3'), items: 'n:b:53 n:b:48 n:b:55', placeOut: 'bass-landmarks bass-staff',
    concepts: [
      { title: 'The bass clef is an F', body: ['The two dots of the bass clef hug the fourth line from the bottom. That line is F.', 'This is the F just below middle C.'], visual: V('clef', { clef: 'bass', landmark: b('F3') }) },
      { title: 'Bass C', body: ['Bass C is in the second space from the bottom, one octave below middle C.', 'With F it gives the left hand two anchors.'], visual: V('landmarks', { staff: 'bass', notes: bs('C3 F3') }) },
      { title: 'G sits on top of F', body: ['G is the space just above the F line.', 'C, F and G are the three bass notes you meet first.'], visual: V('staff-key-link', { notes: bs('C3 F3 G3') }) },
    ],
    technique: [
      find('Find F, then bass C', 'Find the F below middle C, then the C below it.', [5, 0], 1, { lo: 48, hi: 59 }, { ordered: true }),
      landmark('Measure from F', b('F3'), bs('G3')),
      nameIt('Say it, then tap it', bs('C3 F3 G3')),
    ],
    tip: { title: 'Mirror hands', body: ['The left hand mirrors the right: pinky is 5 on C, thumb is 1 on G.'], visual: V('finger-numbers', { hand: 'lh' }) },
    songs: [wait('low-pipes', { pos: { lh: 48 } })],
    quiz: { count: 10 },
  },
  {
    title: 'D and E: the left-hand C position',
    goal: 'Read all five left-hand notes C3-G3 by step and skip.',
    preview: 'D and E in the left hand: five bass notes',
    teaches: bs('D3 E3'), items: 'n:b:50 n:b:52 iv:b:+2 iv:b:-2 iv:b:+3 iv:b:-3',
    concepts: [
      { title: 'Fill the gap', body: ['D is the middle line of the bass staff and E is the space just above it.', 'Now C D E F G climb the bass staff from the second space to the space above the F line.'], visual: V('line-space', { from: 48, to: 55, staff: 'bass' }) },
      { title: 'Same shapes, new clef', body: ['Steps and skips look the same in both clefs: neighbour to neighbour is a step, one gap is a skip.', 'Only the names change, so use the shapes you already know.'], visual: V('step-skip', { size: 3, staff: 'bass' }) },
    ],
    technique: [
      landmark('Measure from bass C', b('C3'), bs('D3 E3')),
      landmark('Measure from F', b('F3'), bs('E3 D3')),
      flash('Three-note shapes', [pat('C3 D3 E3', 'bass'), pat('G3 F3 E3', 'bass'), pat('C3 E3 G3', 'bass'), pat('E3 D3 C3', 'bass')]),
    ],
    tip: { title: 'Left-hand C position', body: ['Left-hand C position: fingers 5-4-3-2-1 rest on C-D-E-F-G.'], visual: V('hand-position', { hand: 'lh', pinky: 48 }) },
    songs: [wait('hot-cross-buns-lh'), wait('ode-to-joy-lh')],
    spares: ['au-clair-lh'],
    quiz: { count: 10 },
  },
  {
    title: 'The grand staff: where the hands meet',
    goal: 'Read both staves at once and know which hand plays; meet middle C from the bass side.',
    preview: 'The grand staff: both hands, and rests',
    teaches: bs('C4'), items: 'n:b:60', features: 'rest grand',
    concepts: [
      { title: 'Two staves, one keyboard', body: ['The treble staff is for your right hand and the bass staff is for your left.', 'A brace joins them, and notes that line up vertically are played together.'], visual: V('grand-staff') },
      { title: 'One middle C, two spellings', body: ['Middle C is the ledger line under the treble staff and the ledger line above the bass staff.', 'It is the same key written two ways.'], visual: V('staff-key-link', { notes: [t('C4'), b('C4')] }) },
      { title: 'Rests', body: ['A rest is silence for that hand. Keep counting while it lasts.', 'The whole rest hangs under the fourth line and fills the whole bar.'], visual: V('note-values', { rests: true }) },
    ],
    technique: [
      nameIt('Which hand, which note?', pat('t:C4 b:C4 t:G4 b:F3 b:C3 t:E4'), { askHand: true, purpose: 'Tap the hand that plays the note first, then the letter name.' }),
    ],
    tip: { title: 'Rest, but stay ready', body: ['Both hands rest on the keys the whole time, even when one is silent.'] },
    songs: [wait('middle-c-meeting'), wait('ode-relay', { hands: 'both' })],
    quiz: { count: 10 },
  },
  {
    title: 'Recital 1: ten notes, two hands',
    goal: 'Consolidate C3-G3 and C4-G4; switch clefs without hesitation.',
    preview: 'Recital 1: ten notes across both hands',
    teaches: [], items: '',
    concepts: [
      { title: 'Your landmarks so far', body: ['Middle C, treble G, bass F and bass C are your four anchors.', 'Find the nearest anchor first, then count steps and skips from it.'], visual: V('landmarks', { staff: 'grand' }) },
    ],
    technique: [
      landmark('Measure in the treble clef', t('G4'), ts('F4 E4 D4')),
      landmark('Measure in the bass clef', b('F3'), bs('G3 E3 D3')),
      flash('Mixed-clef shapes', [
        pat('b:C3 b:E3 t:C4'), pat('t:G4 t:E4 b:G3'), pat('b:F3 b:G3 t:F4'),
        pat('t:C4 b:G3 b:E3'), pat('t:E4 t:D4 b:D3'), pat('b:E3 b:C3 t:D4'),
      ]),
      drillMixed('Mixed drill', 20),
    ],
    tip: { title: 'Legato check', body: ['Listen for gaps between notes. There should be none.'] },
    songs: [wait('mary-relay', { checkpoint: true }), tempo('jingle-bells', 84)],
    melodyCheckpoint: true,
  },
  // ---------------------------------------------------------------- Unit 3
  {
    title: 'A and B: above the C position',
    goal: 'Read A4 and B4; move the hand out of C position.',
    preview: 'A and B: moving out of the C position',
    teaches: ts('A4 B4'), items: 'n:t:69 n:t:71',
    concepts: [
      { title: 'Keep climbing', body: ['A is the second space and B is the middle line of the treble staff.', 'They continue the same ladder above G.'], visual: V('line-space', { from: 67, to: 71, staff: 'treble' }) },
      { title: 'A and B finish the group of three', body: ['G, A and B are the three white keys around the right two black keys of the group of three.', 'B is the last white key before the next C.'], visual: V('kb-names', { letters: ['G', 'A', 'B'] }) },
      { title: 'Stretch or shift', body: ['To reach A, stretch finger 5 up one key, or move the whole hand up.', 'The note names do not change, so choose whichever feels relaxed.'], visual: V('hand-position', { hand: 'rh', shift: true }) },
    ],
    technique: [
      landmark('Measure from G', t('G4'), ts('A4 B4')),
      find('Find every A, every B', 'Find every A, then every B.', [9, 11], 3, KEYB, { ordered: true }),
      nameIt('Say it, then tap it', ts('G4 A4 B4 F4')),
    ],
    tip: { title: 'Shift the hand', body: ['When a tune leaves the position, move the whole hand.', 'Do not twist the wrist.'] },
    songs: [wait('twinkle'), wait('b-in-the-middle')],
    spares: ['london-bridge'],
    quiz: { count: 12 },
  },
  {
    title: 'High C and D: a second landmark',
    goal: 'Own C5 as a landmark and read D5 from it.',
    preview: 'High C and D: a second treble landmark',
    teaches: ts('C5 D5'), items: 'n:t:72 n:t:74',
    concepts: [
      { title: 'Treble C', body: ['Treble C is the third space, right in the middle of the staff, an octave above middle C.', 'It is your second anchor in the treble clef.'], visual: V('landmarks', { staff: 'treble', notes: ts('C4 G4 C5') }) },
      { title: 'G position', body: ['Put your thumb on G, with fingers 2 to 5 on A B C D.', 'Every tune you know can be played from here.'], visual: V('hand-position', { hand: 'rh', thumb: 67 }) },
    ],
    technique: [
      landmark('Measure from treble C', t('C5'), ts('D5 B4 A4')),
      flash('Shapes in G position', [pat('G4 A4 B4'), pat('B4 C5 D5'), pat('D5 C5 A4'), pat('G4 B4 D5')]),
      find('Find middle C, then the C above', 'Find middle C, then the C above it.', [0], 2, { lo: 60, hi: 72 }, { ordered: true }),
    ],
    tip: { title: 'Same tune, new place', body: ['Same tune in a new place is called transposing.', 'Your fingers repeat the pattern. Only the names change.'] },
    songs: [wait('lightly-row-g', { pos: { rh: 67 } }), wait('mary-lamb-g', { pos: { rh: 67 } })],
    quiz: { count: 12 },
  },
  {
    title: 'E, F, G: the top of the staff',
    goal: 'Read the full treble staff E4-G5; recall any line or space instantly.',
    preview: 'E, F and G: the top of the treble staff',
    teaches: ts('E5 F5 G5'), items: 'n:t:76 n:t:77 n:t:79', passesStages: 'treble-landmarks treble-staff',
    concepts: [
      { title: 'Top-line F', body: ['The top line of the treble staff is F, a new anchor. G sits on top of the staff.', 'E is the bottom line, so the five lines run E G B D F.'], visual: V('landmarks', { staff: 'treble', notes: ts('C4 G4 C5 F5') }) },
      { title: 'Lines: E G B D F', body: ['The five lines from the bottom are E, G, B, D, F.', 'Every Good Boy Does Fine keeps them in order.'], visual: V('mnemonic', { phrase: 'Every Good Boy Does Fine', notes: ts('E4 G4 B4 D5 F5') }) },
      { title: 'Spaces: F A C E', body: ['The four spaces from the bottom are F, A, C, E.', 'They spell the word FACE.'], visual: V('mnemonic', { phrase: 'FACE', notes: ts('F4 A4 C5 E5') }) },
    ],
    technique: [
      mnemonic('Lines: Every Good Boy Does Fine', 'Every Good Boy Does Fine', ts('E4 G4 B4 D5 F5')),
      mnemonic('Spaces: FACE', 'FACE', ts('F4 A4 C5 E5')),
      landmark('Measure from top-line F', t('F5'), ts('E5 G5 D5')),
    ],
    tip: { title: 'The spare key', body: ['Mnemonics are the spare key. Landmarks and distance are faster.', 'Use the rhyme only when you are stuck.'] },
    songs: [wait('lines-and-spaces'), wait('old-hundredth-c')],
    quiz: { count: 12 },
  },
  {
    title: 'Rhythm 2: eighths, dots and three-four',
    goal: 'Read eighth notes, dotted quarters, 3/4 time and a pickup.',
    preview: 'Eighth notes, dotted notes and three-four time',
    teaches: [], items: 'rh:q-h-q rh:8-8-q-h rh:q-8-8-h rh:h-8-8-q rh:8-8-8-8-h rh:q-q-8-8-q rh:8-8-q-8-8-q', features: '8 q. 3/4 pickup',
    noToday: true,
    concepts: [
      { title: 'Eighths', body: ['Two eighth notes fit in one beat, joined by a beam.', 'Count them as 1-and, 2-and.'], visual: V('note-values', { eighths: true }) },
      { title: 'The dot', body: ['A dot adds half the note value, so a dotted quarter lasts one and a half beats.', 'It is usually followed by an eighth note that finishes the beat.'], visual: V('note-values', { dots: true }) },
      { title: '3/4 and the pickup', body: ['In 3/4 there are three beats in each bar.', 'A tune may start on the last beat of a bar. That short first bar is called a pickup.'], visual: V('time-sig', { time: [3, 4], pickup: true }) },
    ],
    technique: [drillItems('Tap the rhythms', ids('rh:q-h-q rh:8-8-q-h rh:q-8-8-h rh:h-8-8-q rh:8-8-8-8-h rh:q-q-8-8-q rh:8-8-q-8-8-q'), 10, { hints: 'auto', purpose: 'Tap each rhythm on the pad while you count out loud.' })],
    tip: { title: 'Count out loud', body: ['Count out loud. Organists count, because the instrument will not cover a late note.'] },
    songs: [wait('joy-to-the-world'), wait('amazing-grace', { checkpoint: true }), tempo('amazing-grace', 66)],
    spares: ['silent-night'],
    melodyCheckpoint: true,
  },
  // ---------------------------------------------------------------- Unit 4
  {
    title: 'A and B: up to middle C',
    goal: 'Read G3-A3-B3-C4 in the bass clef.',
    preview: 'A and B in the bass clef, up to middle C',
    teaches: bs('A3 B3'), items: 'n:b:57 n:b:59',
    concepts: [
      { title: 'The top of the bass staff', body: ['A is the top line of the bass staff and B sits on top of it.', 'Middle C continues the ladder on a ledger line just above.'], visual: V('line-space', { from: 55, to: 60, staff: 'bass' }) },
    ],
    technique: [
      landmark('Measure down from middle C', b('C4'), bs('B3 A3')),
      landmark('Measure up from F', b('F3'), bs('G3 A3')),
      nameIt('Say it, then tap it', bs('F3 G3 A3 B3 C4')),
    ],
    tip: { title: 'The left thumb', body: ['The left-hand thumb is as strong as any finger.', 'Let it play A, B and middle C.'] },
    songs: [wait('twinkle-lh'), wait('b-in-the-middle-lh')],
    spares: ['london-bridge-lh'],
    quiz: { count: 12 },
  },
  {
    title: 'Low G, A, B: the bottom of the staff',
    goal: 'Read G2, A2, B2.',
    preview: 'Low G, A and B: the bottom of the bass staff',
    teaches: bs('G2 A2 B2'), items: 'n:b:43 n:b:45 n:b:47',
    concepts: [
      { title: 'Bottom-line G', body: ['The bottom line of the bass staff is G, two octaves below treble G.', 'It is a new anchor at the low end.'], visual: V('landmarks', { staff: 'bass', notes: [b('G2'), b('C3'), b('F3'), b('C4')] }) },
      { title: 'Lines: G B D F A', body: ['The five lines from the bottom are G, B, D, F, A.', 'Good Boys Do Fine Always keeps them in order.'], visual: V('mnemonic', { phrase: 'Good Boys Do Fine Always', notes: bs('G2 B2 D3 F3 A3') }) },
      { title: 'Spaces: A C E G', body: ['The four spaces from the bottom are A, C, E, G.', 'All Cows Eat Grass keeps them in order.'], visual: V('mnemonic', { phrase: 'All Cows Eat Grass', notes: bs('A2 C3 E3 G3') }) },
    ],
    technique: [
      mnemonic('Lines: Good Boys Do Fine Always', 'Good Boys Do Fine Always', bs('G2 B2 D3 F3 A3')),
      mnemonic('Spaces: All Cows Eat Grass', 'All Cows Eat Grass', bs('A2 C3 E3 G3')),
      landmark('Measure up from bottom G', b('G2'), bs('A2 B2')),
      landmark('Measure down from bass C', b('C3'), bs('B2 A2')),
    ],
    tip: { title: 'Walking bass', body: ['Bass lines often walk by step.', 'Keep the hand low and quiet.'] },
    songs: [wait('walking-down'), wait('old-hundredth-lh')],
    quiz: { count: 12 },
  },
  {
    title: 'Low F and the whole grand staff',
    goal: 'Read F2; read any note on either staff.',
    preview: 'Low F: the whole grand staff',
    teaches: bs('F2'), items: 'n:b:41', passesStages: 'bass-landmarks bass-staff grand-mixed',
    noToday: true,
    concepts: [
      { title: 'One below the staff', body: ['F sits in the space just below the bottom line of the bass staff.', 'It is the lowest note you have met so far.'], visual: V('staff-key-link', { notes: bs('F2 G2') }) },
      { title: 'All your landmarks', body: ['Bass G, bass C, bass F, middle C, treble G, treble C and top F.', 'Seven anchors cover the whole grand staff.'], visual: V('landmarks', { staff: 'grand' }) },
    ],
    technique: [
      landmark('Measure in the treble clef', t('G4'), ts('A4 F4 B4 E4')),
      landmark('Measure in the bass clef', b('C3'), bs('B2 A2 D3 E3')),
      flash('Mixed-clef shapes', [
        pat('b:F2 b:C3 t:C4'), pat('t:G4 t:C5 b:G3'), pat('b:A2 t:A4 t:F5'),
        pat('t:E5 b:E3 b:G2'), pat('b:C3 t:C4 t:G5'), pat('t:B4 b:B2 b:F3'),
      ]),
      drillMixed('Mixed drill', 24),
    ],
    tip: { title: 'Look ahead', body: ['Look ahead: your eyes should be one note in front of your fingers.'] },
    songs: [wait('bottom-of-the-staff'), wait('twinkle-relay')],
    quiz: { count: 14 },
  },
  {
    title: 'Hands together 1: a held bass',
    goal: 'Play a left-hand long note while the right hand plays a melody.',
    preview: 'Hands together: a held bass under a melody',
    teaches: [], items: 'ht:48+60 ht:50+62 ht:52+64 ht:55+67 ht:57+69', features: 'together',
    concepts: [
      { title: 'Read bottom to top', body: ['When notes line up vertically they sound together.', 'Read the bass note first, then the treble note above it.'], visual: V('chord-stack', { pairs: [[b('C3'), t('C4')], [b('G3'), t('G4')]] }) },
      { title: 'Octaves', body: ['The same letter name in both hands makes an octave.', 'Bass C and middle C look far apart on the page but share one letter.'], visual: V('staff-key-link', { notes: [b('C3'), t('C4')] }) },
    ],
    technique: [
      guided('Octave pairs, with glow', 'glow', itemTargets('ht:48+60 ht:50+62 ht:52+64 ht:55+67 ht:57+69'), { purpose: 'Both keys glow. Play the pair at exactly the same moment.' }),
      guided('Octave pairs, from memory', 'none', itemTargets('ht:48+60 ht:50+62 ht:52+64 ht:55+67 ht:57+69'), { shuffle: true, purpose: 'Nothing glows now. Read both staves and play the pair.' }),
    ],
    tip: { title: 'Hold the bass', body: ['Hold the bass key down for its full length.', 'On the organ, lifting early leaves a hole.'] },
    songs: [wait('hot-cross-buns-drone', { hands: 'both' }), wait('ode-drone', { hands: 'both' })],
    quiz: { count: 12 },
  },
  {
    title: 'Hands together 2: moving in tenths',
    goal: 'Move both hands in the same direction at the same time.',
    preview: 'Both hands moving together in tenths',
    teaches: [], items: 'ht:48+64 ht:50+65 ht:53+69 ht:55+71 dy:t:3 dy:b:3 dy:t:5 dy:b:5',
    concepts: [
      { title: 'Thirds and fifths in one hand', body: ['A third sits on two neighbouring lines or two neighbouring spaces.', 'A fifth sits on two lines or two spaces with one more line or space between them.'], visual: V('interval-shapes', { sizes: [3, 5], harmonic: true }) },
      { title: 'Tenths', body: ['A tenth is a third spread across two hands, such as bass C under the E above middle C.', 'On the page the hands move like mirror images, in step.'], visual: V('chord-stack', { pairs: [[b('C3'), t('E4')], [b('D3'), t('F4')], [b('E3'), t('G4')]] }) },
    ],
    technique: [
      guided('Tenths, name only', 'name', itemTargets('ht:48+64 ht:50+65 ht:53+69 ht:55+71'), { purpose: 'The names are shown. Find both keys and play them together.' }),
      flash('Two-pair patterns', [
        pat('b:C3 t:E4 b:D3 t:F4'), pat('b:D3 t:F4 b:F3 t:A4'), pat('b:F3 t:A4 b:G3 t:B4'), pat('b:G3 t:B4 b:C3 t:E4'),
      ], { pairs: true, purpose: 'See two pairs for a moment, then play both pairs from memory.' }),
    ],
    tip: { title: 'One shape', body: ['When both hands move, think of one shape, not two notes.'] },
    songs: [wait('twinkle-hands', { passes: [['rh', true], ['both', false]] })],
    quiz: { count: 12 },
  },
  {
    title: 'Recital 2: both hands, whole staves',
    goal: 'Consolidate hands-together reading.',
    preview: 'Recital 2: both hands across both staves',
    teaches: [], items: 'iv:t:+4 iv:t:-4 iv:t:+5 iv:t:-5 iv:b:+4 iv:b:-4 iv:b:+5 iv:b:-5',
    concepts: [
      { title: 'Fourths and fifths', body: ['A fourth runs from a line to a space, with two notes in between.', 'A fifth runs from line to line, or space to space, with one line or space between.'], visual: V('interval-shapes', { sizes: [4, 5] }) },
    ],
    technique: [
      drillMixed('Mixed drill', 24),
      flash('Mixed-clef shapes', [
        pat('b:C3 b:G3 t:E4'), pat('t:C5 t:G4 b:C3'), pat('b:D3 b:A3 t:F4'),
        pat('t:B4 t:E4 b:E3'), pat('b:G2 b:D3 t:G4'), pat('t:D5 t:A4 b:F3'),
      ]),
    ],
    tip: { title: 'Keep going', body: ['If you slip, keep the beat and rejoin.', 'Never go back to fix a note in a hymn.'] },
    songs: [wait('lightly-row-hands'), wait('jingle-bells-hands', { checkpoint: true }), tempo('lightly-row-hands', 66)],
    melodyCheckpoint: true,
  },
  // ---------------------------------------------------------------- Unit 5
  {
    title: 'F sharp and the key of G',
    goal: 'Read a sharp; understand a one-sharp key signature.',
    preview: 'F sharp and the key of G',
    teaches: [t('F#4'), b('F#3')], items: 'n:t:66 n:b:54', features: 'key1',
    concepts: [
      { title: 'A sharp is the next key to the right', body: ['A sharp raises a note to the next key on the right, usually a black key.', 'F sharp is the black key just right of F.'], visual: V('accidental', { sign: '#', note: t('F4') }) },
      { title: 'Key signature', body: ['A sharp printed at the start of every line turns every F into F sharp, in every octave.', 'One sharp means the key of G.'], visual: V('key-signature', { key: 1 }) },
    ],
    technique: [
      find('Find every F sharp', 'Find every F sharp on the keyboard.', [6], 4, KEYB),
      nameIt('Say it, then tap it', [t('F4'), t('F#4'), b('F3'), b('F#3'), t('G4')]),
      landmark('Measure from G', t('G4'), [t('F#4')]),
    ],
    tip: { title: 'Black keys', body: ['Black keys: slide the hand in towards the fallboard.', 'Do not reach with a flat finger.'] },
    songs: [wait('g-major-walk'), wait('good-king-wenceslas')],
    spares: ['old-hundredth-g'],
    quiz: { count: 12 },
  },
  {
    title: 'B flat and the key of F',
    goal: 'Read a flat; understand a one-flat key signature.',
    preview: 'B flat and the key of F',
    teaches: [t('Bb4'), b('Bb3')], items: 'n:t:70 n:b:58', features: 'key-1',
    concepts: [
      { title: 'A flat is the next key to the left', body: ['A flat lowers a note to the next key on the left, usually a black key.', 'B flat is the black key just left of B.'], visual: V('accidental', { sign: 'b', note: t('B4') }) },
      { title: 'One flat is the key of F', body: ['One flat at the start of every line turns every B into B flat.', 'One flat means the key of F.'], visual: V('key-signature', { key: -1 }) },
    ],
    technique: [
      find('Find every B flat', 'Find every B flat on the keyboard.', [10], 4, KEYB),
      nameIt('Say it, then tap it', [t('B4'), t('Bb4'), t('A4'), b('B3'), b('Bb3')]),
    ],
    tip: { title: 'B flat fingering', body: ['In F position the fourth finger of the right hand plays B flat.'] },
    songs: [wait('f-major-bass'), wait('ode-to-joy-f'), wait('frere-jacques')],
    quiz: { count: 12 },
  },
  {
    title: 'More accidentals and the natural sign',
    goal: 'Read any single sharp, flat or natural written in front of a note.',
    preview: 'More sharps, flats and the natural sign',
    teaches: [t('C#5'), t('Eb5'), t('G#4'), t('F#5'), b('Eb3'), b('C#4'), b('Ab3')],
    items: 'n:t:73 n:t:75 n:t:68 n:b:51 n:b:61 n:b:56', passesStages: 'accidentals',
    concepts: [
      { title: 'An accidental lasts to the bar line', body: ['A sharp or flat written in front of a note applies to that note until the end of the bar.', 'The next bar line cancels it.'], visual: V('accidental', { sign: '#', note: t('G4'), carry: true }) },
      { title: 'The natural cancels', body: ['A natural sign cancels a sharp or flat and gives you the plain white key.', 'It lasts to the bar line too.'], visual: V('accidental', { sign: 'n', note: t('F4') }) },
    ],
    technique: [
      find('Find C sharp, E flat, G sharp, A flat', 'Find C sharp, E flat, G sharp and A flat.', [1, 3, 8], 2, KEYB, { ordered: true }),
      nameIt('Say it, then tap it', [t('C#5'), t('Eb5'), t('G#4'), b('Eb3'), b('C#4'), b('Ab3')]),
    ],
    tip: { title: 'Letter first', body: ['Read the letter first, then adjust by one key.', 'Do not learn black keys as separate notes.'] },
    songs: [wait('neighbours-rh'), wait('neighbours-lh'), wait('greensleeves')],
    quiz: { count: 12 },
  },
  {
    title: 'Ledger lines around middle C',
    goal: 'Read notes just outside each staff, where the hands overlap.',
    preview: 'Ledger lines around middle C',
    teaches: [t('A3'), t('B3'), t('G3'), b('D4'), b('E4')], items: 'n:t:57 n:t:59 n:b:62 n:b:64',
    concepts: [
      { title: 'Ledger lines continue the ladder', body: ['Short extra lines carry a staff up or down with the same line-space-line pattern.', 'Below the treble staff the notes run middle C, B, A, G.'], visual: V('ledger', { staff: 'treble', notes: ts('C4 B3 A3 G3') }) },
      { title: 'The staves overlap', body: ['Bass D and E, above the bass staff, are the same keys as treble D and E below the treble staff.', 'The same key can be written on either staff.'], visual: V('staff-key-link', { notes: [b('D4'), t('D4')] }) },
    ],
    technique: [
      landmark('Measure down from middle C (treble)', t('C4'), ts('B3 A3 G3')),
      landmark('Measure up from middle C (bass)', b('C4'), bs('D4 E4')),
      nameIt('Say it, then tap it', [t('A3'), t('B3'), t('G3'), b('D4'), b('E4'), t('C4')]),
    ],
    tip: { title: 'Which hand?', body: ['Which hand plays a note? The staff decides, not the key.'] },
    songs: [wait('yankee-doodle'), wait('hot-cross-buns-high-lh'), wait('auld-lang-syne')],
    spares: ['au-clair-high-lh'],
    quiz: { count: 12 },
  },
  {
    title: 'Ledger lines at the edges',
    goal: 'Read high treble and low bass ledger notes.',
    preview: 'Ledger lines at the top and bottom',
    teaches: [t('A5'), t('B5'), t('C6'), b('E2'), b('D2'), b('C2')], items: 'n:t:81 n:t:83 n:t:84 n:b:40 n:b:38 n:b:36', passesStages: 'ledger',
    concepts: [
      { title: 'Two more Cs', body: ['C6 sits on the second ledger line above the treble staff.', 'C2 sits on the second ledger line below the bass staff. They are the outer anchors.'], visual: V('landmarks', { staff: 'grand', notes: [b('C2'), b('C3'), t('C4'), t('C5'), t('C6')] }) },
    ],
    technique: [
      landmark('Measure down from high C', t('C6'), ts('B5 A5')),
      landmark('Measure up from low C', b('C2'), bs('D2 E2')),
      find('Find all five Cs', 'Find all five Cs, from the lowest to the highest.', [0], 5, KEYB, { ordered: true }),
    ],
    tip: { title: 'Where the pedals go', body: ['On a real organ the lowest notes usually go to the pedals.', 'Here the left hand takes them.'] },
    songs: [wait('joy-to-the-world-high'), wait('deep-pipes')],
    quiz: { count: 12 },
  },
  // ---------------------------------------------------------------- Unit 6
  {
    title: 'Two moving voices',
    goal: 'Play a moving bass against a moving melody.',
    preview: 'Two moving voices, with sixths and octaves',
    teaches: [],
    items: 'ht:52+60 ht:53+62 ht:55+64 ht:57+65 ht:53+60 ht:55+62 ht:57+64 dy:t:6 dy:b:6 dy:t:8 dy:b:8 dy:t:2 dy:b:2 dy:t:4 dy:b:4 iv:t:+6 iv:t:-6 iv:t:+8 iv:t:-8 iv:b:+6 iv:b:-6 iv:b:+8 iv:b:-8',
    passesStages: 'intervals dyads hands-together',
    concepts: [
      { title: 'Sixths and octaves', body: ['A sixth spans five steps, from a line to a space.', 'An octave spans seven steps, also from a line to a space, and has the same letter name.'], visual: V('interval-shapes', { sizes: [6, 8] }) },
      { title: 'Same, opposite, oblique', body: ['Hands can move the same way, in opposite ways, or one can hold while the other moves.', 'Spot which one it is before you play.'], visual: V('chord-stack', { motion: true }) },
    ],
    technique: [
      guided('Pairs, name only', 'name', itemTargets('ht:52+60 ht:53+62 ht:55+64 ht:57+65 ht:53+60 ht:55+62 ht:57+64'), { shuffle: true, purpose: 'The names are shown. Find both keys and play them together.' }),
      flash('Two-pair patterns', [
        pat('b:E3 t:C4 b:F3 t:D4'), pat('b:F3 t:D4 b:G3 t:E4'), pat('b:G3 t:E4 b:A3 t:F4'),
        pat('b:F3 t:C4 b:G3 t:D4'), pat('b:G3 t:D4 b:A3 t:E4'), pat('b:A3 t:F4 b:G3 t:E4'),
      ], { pairs: true, purpose: 'See two pairs for a moment, then play both pairs from memory.' }),
    ],
    tip: { title: 'Slow and right', body: ['Practise hands separately once, then together slowly.', 'Slow and right beats fast and wrong.'] },
    songs: [wait('ode-tenths', { passes: [['lh', true], ['both', false]] })],
    quiz: { count: 14 },
  },
  {
    title: 'Triads: three notes in one hand',
    goal: 'Read a root-position triad as one shape.',
    preview: 'Triads: three notes in one hand',
    teaches: [], items: 'ch:t:C:0 ch:t:F:0 ch:t:G:0 ch:b:C:0 ch:b:F:0 ch:b:G:0', features: 'chord',
    concepts: [
      { title: 'The snowman', body: ['A triad is three notes on three lines in a row, or three spaces in a row.', 'It looks like a snowman, so read it as one shape.'], visual: V('chord-stack', { triad: 'C' }) },
      { title: 'C, F and G', body: ['Three chords, C, F and G, harmonise most simple tunes.', 'You will learn their shapes in both hands.'], visual: V('chord-stack', { triads: ['C', 'F', 'G'] }) },
    ],
    technique: [
      guided('Triads, with glow', 'glow', itemTargets('ch:t:C:0 ch:t:F:0 ch:t:G:0 ch:b:C:0 ch:b:F:0 ch:b:G:0'), { purpose: 'All three keys glow. Press them at exactly the same instant.' }),
      guided('Triads, from memory', 'none', itemTargets('ch:t:C:0 ch:t:F:0 ch:t:G:0 ch:b:C:0 ch:b:F:0 ch:b:G:0'), { shuffle: true, purpose: 'Nothing glows now. Read the shape and play all three notes.' }),
    ],
    tip: { title: 'One drop', body: ['Play all three notes at exactly the same instant.', 'Drop the hand as one unit: fingers 1-3-5 in the right hand, 5-3-1 in the left.'] },
    songs: [wait('mary-chords')],
    quiz: { count: 12 },
  },
  {
    title: 'Hymn chords: four parts',
    goal: 'Read a four-note hymn chord, two notes per hand.',
    preview: 'Hymn chords in four parts',
    teaches: [], items: 'hy:C:I hy:C:IV hy:C:V',
    concepts: [
      { title: 'Four voices', body: ['A hymn chord has four notes. Soprano and alto are on the treble staff, for your right hand.', 'Tenor and bass are on the bass staff, for your left hand.'], visual: V('chord-stack', { satb: 'hy:C:I' }) },
      { title: 'Home, away, home', body: ['I is home, IV steps away from it and V pulls back towards it.', 'The Amen at the end of a hymn is IV then I.'], visual: V('chord-stack', { satb: ['hy:C:IV', 'hy:C:I'] }) },
    ],
    technique: [
      progression('The Amen', ids('hy:C:I hy:C:IV hy:C:I'), 'glow'),
      progression('Home, away, pull, home', ids('hy:C:I hy:C:IV hy:C:V hy:C:I'), 'name'),
    ],
    tip: { title: 'Legato chords', body: ['Change chords legato: move the fingers that must move.', 'Hold the notes the two chords share.'] },
    songs: [wait('silent-night', { passes: [['rh', false]] })],
    quiz: { count: 12 },
  },
  {
    title: 'Old Hundredth, first half',
    goal: 'Play two phrases of a real hymn, melody and bass together.',
    preview: 'Old Hundredth, first half',
    teaches: [], items: 'hy:G:I hy:G:IV hy:G:V',
    concepts: [
      { title: 'How to learn a hymn', body: ['Play the bass alone, then the melody alone, then both together.', 'Work one phrase at a time.'], visual: V('grand-staff', { song: 'old-hundredth-duet', bars: [1, 3] }) },
    ],
    technique: [],
    tip: { title: 'Breathe with the phrase', body: ['Breathe where a singer would.', 'Lift both hands together at the end of each phrase.'] },
    songs: [wait('old-hundredth-duet', { bars: [1, 6], passes: [['lh', true], ['rh', false], ['both', false]], checkpoint: true })],
    melodyCheckpoint: true,
  },
  {
    title: 'Amazing Grace in F',
    goal: 'Hands together in 3/4 with a key signature.',
    preview: 'Amazing Grace in F, hands together',
    teaches: [], items: 'hy:F:I hy:F:IV hy:F:V',
    concepts: [],
    technique: [],
    tip: { title: 'Tie the bar together', body: ['The left hand ties the bar together.', 'Hold each dotted half note for all three beats.'] },
    songs: [wait('amazing-grace-hands', { passes: [['rh', true], ['both', false]], checkpoint: true }), tempo('amazing-grace-hands', 60)],
    melodyCheckpoint: true,
  },
  {
    title: 'Silent Night',
    goal: 'Sight-read a familiar carol with a slow bass.',
    preview: 'Silent Night with a slow bass',
    teaches: [], items: 'hy:C:vi hy:C:V7',
    concepts: [],
    technique: [],
    tip: { title: 'Touch is expression', body: ['Play it softer by playing it smoother.', 'On the organ, touch is your only expression.'] },
    songs: [wait('silent-night-hands', { checkpoint: true }), tempo('silent-night-hands', 60)],
    melodyCheckpoint: true,
  },
  {
    title: 'Ode to Joy, complete',
    goal: 'A 16-bar piece with a moving bass.',
    preview: 'Ode to Joy, complete',
    teaches: [], items: '',
    concepts: [],
    technique: [],
    tip: { title: 'Spot the repeats', body: ['Spot repeats before you play.', 'Bars 1-4, 5-8 and 13-16 are nearly the same.'] },
    songs: [wait('ode-full', { passes: [['lh', true], ['both', false]], checkpoint: true }), tempo('ode-full', 72)],
    melodyCheckpoint: true,
  },
  {
    title: 'Old Hundredth, complete',
    goal: 'A whole hymn tune, note against note.',
    preview: 'Old Hundredth, complete',
    teaches: [], items: 'hy:G:vi hy:G:V7',
    concepts: [],
    technique: [],
    tip: { title: 'The final chord', body: ['Hold the final chord a little longer.', 'Then release both hands together.'] },
    songs: [
      wait('old-hundredth-duet', { bars: [7, 12], passes: [['lh', true], ['rh', false], ['both', false]] }),
      wait('old-hundredth-duet', { passes: [['both', false]], checkpoint: true }),
      tempo('old-hundredth-duet', 60),
    ],
    melodyCheckpoint: true,
  },
  {
    title: 'Graduation: sight-reading',
    goal: 'Play two pieces you have not practised hands together before, first time, without names.',
    preview: 'Graduation: sight-read two pieces',
    teaches: [], items: '',
    concepts: [
      { title: 'Before you play', body: ['Check the clefs, the key signature and the time signature first.', 'Find the first note of each hand, and the highest and lowest notes.'], visual: V('grand-staff', { song: 'first-noel', checklist: true }) },
    ],
    technique: [],
    tip: { title: 'Trust your reading', body: ['Play the first bar slowly, then keep that steady beat.', 'Do not stop to fix a note.'] },
    songs: [wait('first-noel', { passes: [['both', false]] }), wait('good-king-hands', { passes: [['both', false]], checkpoint: true })],
    melodyCheckpoint: true,
  },
];

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------

const split = (s) => (Array.isArray(s) ? s.slice() : s ? s.split(/\s+/).filter(Boolean) : []);

const UNIT_DEFS = [
  { n: 1, title: 'Right hand, first five notes', from: 1, to: 4 },
  { n: 2, title: 'Left hand and the grand staff', from: 5, to: 8 },
  { n: 3, title: 'The whole treble staff, then rhythm', from: 9, to: 12 },
  { n: 4, title: 'The whole bass staff and hands together', from: 13, to: 18 },
  { n: 5, title: 'Keys, accidentals and ledger lines', from: 19, to: 23 },
  { n: 6, title: 'Hymn lines', from: 24, to: 32 },
];

const lessonId = (n) => `L${pad2(n)}`;

/** Three earlier notes nearest to the new ones (same staff preferred), for the "from memory" step. */
function earlierNotes(fresh, earlierKeys) {
  const cands = [];
  for (const key of earlierKeys) {
    const [s, m] = key.split(':');
    const staff = s === 'b' ? 'bass' : 'treble';
    const midi = Number(m);
    if (fresh.some((f) => f.staff === staff && f.midi === midi)) continue;
    const same = fresh.filter((f) => f.staff === staff);
    const pool = same.length ? same : fresh;
    const d = Math.min(...pool.map((f) => Math.abs(f.midi - midi))) + (same.length ? 0 : 100);
    cands.push({ d, midi, staff });
  }
  cands.sort((a, b2) => a.d - b2.d || a.midi - b2.midi || (a.staff < b2.staff ? -1 : 1));
  return cands.slice(0, 3).map(({ midi, staff }) => ({ midi, staff }));
}

function songHands(songId) {
  const s = getSong(songId);
  if (!s) throw new Error(`lessons.js: unknown song "${songId}"`);
  const h = Object.keys(s.parts);
  return h.length === 2 ? 'both' : h[0];
}

function buildLesson(spec, index, earlierKeys) {
  const n = index + 1;
  const id = lessonId(n);
  const items = split(spec.items);
  const unit = UNIT_DEFS.find((u) => n >= u.from && n <= u.to).n;
  const steps = [];
  const push = (type, fields) => {
    const step = { id: `${id}.s${pad2(steps.length + 1)}`, type, ...fields };
    steps.push(step);
    return step;
  };

  // 1 warm-up
  if (n > 1) {
    push('drill', {
      title: 'Warm-up', purpose: 'Bring back notes from earlier lessons before you add anything new.',
      source: 'warmup', count: 8, min: 8, hints: 'off', stopEarly: false,
    });
  }
  // 2 concepts
  for (const c of spec.concepts || []) {
    push('concept', { title: c.title, purpose: 'Understand the idea before you play it.', body: c.body, visual: c.visual });
  }
  const fresh = spec.teaches.map((r) => ({ midi: r.midi, staff: r.staff }));
  const freshRefs = spec.teaches.map((r) => ({ ...r }));
  // 3-4 demo, glow
  if (fresh.length) {
    push('demo', {
      title: 'Watch and listen', purpose: 'Hear each new note and see where it sits on the staff and on the keyboard.',
      notes: freshRefs, bpm: 60, loops: 2, showNames: true,
    });
    push('guided', {
      title: 'Play the new notes', purpose: 'The key glows and the name is shown, so you cannot go wrong. Say each name as you play it.',
      scaffold: 'glow', targets: freshRefs, rounds: 2, shuffle: false,
    });
  }
  // 5 technique
  for (const tech of spec.technique || []) {
    const { type, ...rest } = tech;
    push(type, rest);
  }
  // 6-7 name, none
  if (fresh.length) {
    push('guided', {
      title: 'Name only', purpose: 'The glow is gone. Use the printed name to find each key.',
      scaffold: 'name', targets: freshRefs, rounds: 2, shuffle: true,
    });
    push('guided', {
      title: 'From memory', purpose: 'Nothing is shown. Read each note from the staff alone.',
      scaffold: 'none', targets: [...freshRefs, ...earlierNotes(fresh, earlierKeys)], rounds: 2, shuffle: true,
    });
  }
  // 8 tip
  push('tip', { title: spec.tip.title, purpose: 'A small habit that makes organ playing easier.', body: spec.tip.body, ...(spec.tip.visual ? { visual: spec.tip.visual } : {}) });
  // 9 today drill
  if (items.length && !spec.noToday) {
    push('drill', {
      title: 'Practice drill', purpose: 'Quick repeats lock the new material in; anything you miss comes back soon.',
      source: 'today', count: 24, min: 10, hints: 'off', stopEarly: true,
    });
  }
  // 10-11 songs
  let checkpointStep = null;
  const songSteps = [];
  for (const s of spec.songs) {
    const song = getSong(s.song);
    if (!song) throw new Error(`lessons.js: ${id} uses unknown song "${s.song}"`);
    const hands = s.hands || songHands(s.song);
    if (s.kind === 'wait') {
      const passes = s.passes
        ? s.passes.map(([h, names], i) => ({ hands: h, names, glow: false, fingers: !!s.pos && i === 0 }))
        : [
            { hands, names: true, glow: false, fingers: !!s.pos },
            { hands, names: false, glow: false, fingers: false },
          ];
      const fields = {
        title: `Play: ${song.title}`, purpose: 'Play a real tune. The cursor waits for you, so take your time.',
        songId: s.song, ...(s.bars ? { bars: s.bars } : {}), passes, ...(s.pos ? { pos: s.pos } : {}),
        ...(s.checkpoint ? { checkpoint: true } : {}),
      };
      const step = push('melody-wait', fields);
      if (s.checkpoint) checkpointStep = step;
      songSteps.push(step);
    } else {
      push('melody-tempo', {
        title: `In time: ${song.title}`, purpose: 'Play with the beat. This step never blocks your progress.',
        songId: s.song, ...(s.bars ? { bars: s.bars } : {}), hands, bpm: s.bpm, optional: s.optional,
      });
    }
  }
  // 12 quiz / checkpoint
  let checkpoint;
  if (spec.melodyCheckpoint) {
    checkpoint = { kind: 'melody', stepId: checkpointStep.id, passAcc: 0.8, aceAcc: 0.92 };
  } else {
    const q = push('quiz', {
      title: 'Checkpoint', purpose: 'Show what you have learned: no hints and no second tries.',
      count: spec.quiz.count, ...(spec.quiz.itemIds ? { itemIds: split(spec.quiz.itemIds) } : {}), passAcc: 0.8,
    });
    checkpoint = { kind: 'quiz', stepId: q.id, passAcc: 0.8, aceAcc: 0.9 };
  }
  // 13 recap
  push('recap', { title: 'Recap', purpose: 'See what you learned today and what comes next.' });

  const teaches = spec.teaches.map((r) => {
    const out = { ...r };
    if (items.includes(noteItemId(r))) out.itemId = noteItemId(r);
    return out;
  });
  return {
    id, n, unit, title: spec.title, goal: spec.goal, preview: spec.preview,
    teaches, items, features: split(spec.features), passesStages: split(spec.passesStages),
    placeOut: split(spec.placeOut), spares: split(spec.spares), checkpoint, steps,
  };
}

/** Lesson[] L01..L32 in order. */
export const LESSONS = (() => {
  const out = [];
  const known = []; // 't:60' keys taught so far
  SPECS.forEach((spec, i) => {
    out.push(buildLesson(spec, i, known.slice()));
    for (const r of spec.teaches) {
      const key = `${r.staff === 'bass' ? 'b' : 't'}:${r.midi}`;
      if (!known.includes(key)) known.push(key);
    }
  });
  return out;
})();

/** [{ n, title, lessonIds }] */
export const UNITS = UNIT_DEFS.map((u) => ({
  n: u.n, title: u.title,
  lessonIds: LESSONS.filter((l) => l.n >= u.from && l.n <= u.to).map((l) => l.id),
}));

// deep freeze so the UI cannot mutate shared lesson data
(function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) freeze(o[k]);
  }
})(LESSONS);
(function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) freeze(o[k]);
  }
})(UNITS);

export function getLesson(id) {
  return LESSONS.find((l) => l.id === id);
}

/** Cumulative over lessons 1..n: { pitches: ['t:60', 'b:48'], features, items }. */
export function taughtThrough(n) {
  const pitches = [];
  const features = [];
  const items = [];
  const add = (arr, v) => {
    if (!arr.includes(v)) arr.push(v);
  };
  for (const l of LESSONS) {
    if (l.n > n) break;
    for (const r of l.teaches) add(pitches, `${r.staff === 'bass' ? 'b' : 't'}:${r.midi}`);
    for (const f of l.features) add(features, f);
    for (const it of l.items) add(items, it);
  }
  return { pitches, features, items };
}

/** First lesson n whose taughtThrough(n) covers the song's pitches and features, else Infinity. */
export function songMinLesson(song) {
  const needP = songPitches(song).map((p) => `${p.staff === 'bass' ? 'b' : 't'}:${p.midi}`);
  const needF = songFeatures(song);
  for (let n = 1; n <= LESSONS.length; n++) {
    const tt = taughtThrough(n);
    if (needP.every((p) => tt.pitches.includes(p)) && needF.every((f) => tt.features.includes(f))) return n;
  }
  return Infinity;
}

/** Song ids referenced by the lesson's melody and demo steps, plus its spares (unique, in order). */
export function lessonSongIds(lesson) {
  const out = [];
  for (const s of lesson.steps) {
    if ((s.type === 'melody-wait' || s.type === 'melody-tempo' || s.type === 'demo') && s.songId && !out.includes(s.songId)) out.push(s.songId);
  }
  for (const id of lesson.spares) if (!out.includes(id)) out.push(id);
  return out;
}
