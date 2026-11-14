// Tutti curriculum: stage + item data and prompt realisation.
// Pure ES module: no DOM, no imports, no ambient randomness or clock.
// Pitches are MIDI numbers (C4 = 60). Staff position is derived, never stored.

// ---------------------------------------------------------------------------------------------
// Pitch helpers
// ---------------------------------------------------------------------------------------------

const BLACK_PCS = [1, 3, 6, 8, 10];
const WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
// Natural letter index per pitch class for white keys; black keys per spelling.
const WHITE_LETTER = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const SHARP_LETTER = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
const FLAT_LETTER = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
// Default spelling of a black key when no accidental is given (matches every key signature used).
const DEFAULT_ACC = { 1: '#', 3: 'b', 6: '#', 8: '#', 10: 'b' };

const STAFF_BASE_DIA = { treble: 30, bass: 18 }; // diatonic index of the bottom line (E4 / G2)

const pcOf = (midi) => ((midi % 12) + 12) % 12;
const octOf = (midi) => Math.floor(midi / 12) - 1;

export function isBlack(midi) {
  return BLACK_PCS.includes(pcOf(midi));
}

/** Resolve the spelling accidental ('#' | 'b' | null) of a midi note. */
function spelling(midi, accidental) {
  const pc = pcOf(midi);
  if (!BLACK_PCS.includes(pc)) return null;
  return accidental === '#' || accidental === 'b' ? accidental : DEFAULT_ACC[pc];
}

/** Diatonic index (octave*7 + letter) of the written note. */
function diaOf(midi, accidental) {
  const pc = pcOf(midi);
  const acc = spelling(midi, accidental);
  const letter = acc === null ? WHITE_LETTER[pc] : acc === '#' ? SHARP_LETTER[pc] : FLAT_LETTER[pc];
  return octOf(midi) * 7 + letter;
}

/** White-key midi of a diatonic index. */
function diaToMidi(d) {
  const oct = Math.floor(d / 7);
  return (oct + 1) * 12 + WHITE_SEMIS[((d % 7) + 7) % 7];
}

/** Diatonic steps above the staff's bottom line (treble E4 = 0, bass G2 = 0). Accidentals only
 *  select the spelling (F# vs Gb); they never move a note by themselves. */
export function staffStep(midi, staff, accidental) {
  return diaOf(midi, accidental) - (staff === 'bass' ? STAFF_BASE_DIA.bass : STAFF_BASE_DIA.treble);
}

/** naming: 'letters' -> 'C4' | 'solfege' -> 'Do' (fixed-do, B = 'Ti').
 *  opts: { octave?: boolean (default: letters yes, solfege no), accidental?: '#'|'b' }.
 *  Black keys default to C# Eb F# G# Bb unless opts.accidental says otherwise. */
export function noteName(midi, naming = 'letters', opts = {}) {
  const pc = pcOf(midi);
  const acc = spelling(midi, opts && opts.accidental);
  const letter = acc === null ? WHITE_LETTER[pc] : acc === '#' ? SHARP_LETTER[pc] : FLAT_LETTER[pc];
  const solfege = naming === 'solfege';
  const wantOct = opts && opts.octave !== undefined ? !!opts.octave : !solfege;
  return (solfege ? SOLFEGE[letter] : LETTERS[letter]) + (acc || '') + (wantOct ? String(octOf(midi)) : '');
}

/** Keyboard range: lowest/highest midi padded to whole octaves, at least 2 octaves, within C1..C7. */
function rangeFor(midis) {
  let lo = Math.floor(Math.min(...midis) / 12) * 12;
  let hi = Math.floor(Math.max(...midis) / 12) * 12 + 12;
  let below = true;
  while (hi - lo < 24) {
    if (below && lo - 12 >= 24) lo -= 12;
    else if (hi + 12 <= 96) hi += 12;
    else lo -= 12;
    below = !below;
  }
  return { lo, hi };
}

// ---------------------------------------------------------------------------------------------
// Hint text
// ---------------------------------------------------------------------------------------------

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
const TREBLE_LINE_WORDS = ['Every', 'Good', 'Boy', 'Does', 'Fine'];
const BASS_LINE_WORDS = ['Good', 'Boys', 'Do', 'Fine', 'Always'];
const BASS_SPACE_WORDS = ['All', 'Cows', 'Eat', 'Grass'];

function positionText(step) {
  if (step >= 0 && step <= 8) return step % 2 === 0 ? `${ORD[step / 2 + 1]} line` : `${ORD[(step + 1) / 2]} space`;
  if (step < 0) {
    const n = -step;
    return n % 2 === 1 ? 'space below the staff' : `${ORD[n / 2]} ledger line below`;
  }
  const n = step - 8;
  return n % 2 === 1 ? 'space above the staff' : `${ORD[n / 2]} ledger line above`;
}

const LANDMARK_HINTS = {
  'treble:60': 'Middle C: its own short ledger line just below the treble staff.',
  'treble:67': 'The treble (G) clef curls around this line: G, 2nd line.',
  'treble:72': 'C an octave above middle C: the 3rd space, centre of the staff.',
  'treble:64': 'Bottom line: Every Good Boy Does Fine, the first word: Every.',
  'treble:77': 'Top line: Every Good Boy Does Fine, the last word: Fine.',
  'bass:60': 'Middle C: its own ledger line just above the bass staff.',
  'bass:53': 'The bass (F) clef dots hug this line: F, 4th line.',
  'bass:48': 'C below middle C: the 2nd space (All Cows Eat Grass: Cows).',
  'bass:43': 'Bottom line: Good Boys Do Fine Always, the first word: Good.',
  'bass:57': 'Top line: Good Boys Do Fine Always, the last word: Always.',
};

function noteHint(midi, staff, accidental) {
  const name = noteName(midi, 'letters', { accidental });
  const step = staffStep(midi, staff, accidental);
  const acc = spelling(midi, accidental);
  if (acc === null && LANDMARK_HINTS[`${staff}:${midi}`]) return { name, mnemonic: LANDMARK_HINTS[`${staff}:${midi}`] };
  const pos = positionText(step);
  let mnemonic;
  if (acc !== null) {
    const base = noteName(acc === '#' ? midi - 1 : midi + 1, 'letters', { octave: false });
    mnemonic = `${base} ${acc === '#' ? 'sharp: the black key just above' : 'flat: the black key just below'} ${base} (${pos}).`;
  } else if (step >= 0 && step <= 8) {
    if (step % 2 === 0) {
      const w = (staff === 'bass' ? BASS_LINE_WORDS : TREBLE_LINE_WORDS).slice();
      const i = step / 2;
      w[i] = w[i].toUpperCase();
      mnemonic = `${pos}: ${w.join(' ')}.`;
    } else if (staff === 'bass') {
      const w = BASS_SPACE_WORDS.slice();
      const i = (step - 1) / 2;
      w[i] = w[i].toUpperCase();
      mnemonic = `${pos}: ${w.join(' ')}.`;
    } else {
      mnemonic = `${pos}: spaces spell F-A-C-E from the bottom.`;
    }
  } else {
    mnemonic = `${pos}. Count steps from the nearest landmark.`;
  }
  return { name, mnemonic };
}

const INTERVAL_TIPS = {
  2: 'Neighbours: a line and the very next space.',
  3: 'Skip one: line to line, or space to space.',
  4: 'Three steps: line to space.',
  5: 'Skip three: line to line, or space to space.',
  6: 'Five steps: line to space.',
  8: 'Same letter name: line to space, seven steps.',
};
const SIZE_NAME = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 8: 'octave' };

// ---------------------------------------------------------------------------------------------
// Stage + item construction
// ---------------------------------------------------------------------------------------------

/** @type {Array<object>} */
export const STAGES = [];
/** @type {Record<string, object>} */
export const ITEMS = {};

function addStage(def, items) {
  const stage = { index: STAGES.length, itemIds: [], ...def };
  for (const it of items) {
    if (ITEMS[it.id]) throw new Error(`duplicate curriculum item ${it.id}`);
    const item = { stageId: def.id, kind: def.kind, clef: def.clef, ...it };
    ITEMS[item.id] = item;
    stage.itemIds.push(item.id);
  }
  STAGES.push(stage);
}

function noteItem(prefix, staff, midi, accidental) {
  const gen = { midi, staff };
  if (accidental) gen.accidental = accidental;
  const label = `${noteName(midi, 'letters', { accidental })} (${staff})`;
  return { id: `${prefix}:${staff === 'bass' ? 'b' : 't'}:${midi}`, kind: 'note', clef: staff, label, hint: noteHint(midi, staff, accidental), gen };
}
const tn = (midi, acc) => noteItem('n', 'treble', midi, acc);
const bn = (midi, acc) => noteItem('n', 'bass', midi, acc);

// 0 treble landmarks: C4 G4 C5 then E4 F5
addStage(
  { id: 'treble-landmarks', title: 'Treble landmarks', short: 'Treble anchors', kind: 'note', clef: 'treble', rt: { start: 3500, end: 1500 },
    description: 'Learn the treble anchors: middle C, the G line, the C space, then the bottom and top lines.' },
  [tn(60), tn(67), tn(72), tn(64), tn(77)],
);
// 1 treble staff: fill outward
addStage(
  { id: 'treble-staff', title: 'Treble staff', short: 'Treble staff', kind: 'note', clef: 'treble', rt: { start: 3000, end: 1200 },
    description: 'Read the rest of the treble staff by distance from the landmarks you know.' },
  [tn(62), tn(65), tn(69), tn(71), tn(74), tn(76), tn(79)],
);
// 2 bass landmarks: C4 F3 C3 then G2 A3
addStage(
  { id: 'bass-landmarks', title: 'Bass landmarks', short: 'Bass anchors', kind: 'note', clef: 'bass', rt: { start: 3500, end: 1500 },
    description: 'Learn the bass anchors: middle C above the staff, the F line, the C space, then the bottom and top lines.' },
  [bn(60), bn(53), bn(48), bn(43), bn(57)],
);
// 3 bass staff
addStage(
  { id: 'bass-staff', title: 'Bass staff', short: 'Bass staff', kind: 'note', clef: 'bass', rt: { start: 3000, end: 1200 },
    description: 'Read the rest of the bass staff by distance from the landmarks you know.' },
  [bn(59), bn(55), bn(52), bn(50), bn(47), bn(45), bn(41)],
);
// 4 grand mixed: no new items, references stages 0-3
addStage(
  { id: 'grand-mixed', title: 'Grand staff mix', short: 'Clef switching', kind: 'mix', clef: 'grand', rt: { start: 2500, end: 1100 },
    refs: ['treble-landmarks', 'treble-staff', 'bass-landmarks', 'bass-staff'],
    description: 'Everything so far, shuffled, with the clef changing on every prompt.' },
  [],
);
// 5 ledger lines
addStage(
  { id: 'ledger', title: 'Ledger lines', short: 'Ledger lines', kind: 'note', clef: 'grand', rt: { start: 3500, end: 1400 },
    description: 'Notes that climb above or sink below both staves on ledger lines.' },
  [tn(57), tn(59), tn(81), tn(83), tn(84), bn(40), bn(38), bn(36), bn(62), bn(64)],
);

// 6 intervals: melodic, shape-based
{
  const items = [];
  for (const size of [2, 3, 4, 5, 6, 8]) {
    for (const staff of ['treble', 'bass']) {
      for (const dir of [1, -1]) {
        const sign = dir > 0 ? '+' : '-';
        items.push({
          id: `iv:${staff === 'bass' ? 'b' : 't'}:${sign}${size}`, kind: 'interval', clef: staff,
          label: `${dir > 0 ? 'Up' : 'Down'} a ${SIZE_NAME[size]} (${staff})`,
          hint: { name: `${dir > 0 ? 'Up' : 'Down'} a ${SIZE_NAME[size]}`, mnemonic: INTERVAL_TIPS[size] },
          gen: { size, dir, staff },
        });
      }
    }
  }
  addStage(
    { id: 'intervals', title: 'Intervals', short: 'Melodic intervals', kind: 'interval', clef: 'both', rt: { start: 3000, end: 1300 },
      description: 'The first key is lit. Read the distance on the staff and play the second note.' },
    items,
  );
}

// 7 accidentals
addStage(
  { id: 'accidentals', title: 'Accidentals', short: 'Sharps and flats', kind: 'note', clef: 'grand', rt: { start: 3500, end: 1500 },
    description: 'Sharps and flats: find the letter on the staff, then play the black key beside it.' },
  [tn(66, '#'), tn(70, 'b'), tn(73, '#'), tn(75, 'b'), tn(68, '#'), bn(54, '#'), bn(58, 'b'), bn(51, 'b'), bn(61, '#'), bn(56, 'b')],
);

// 8 dyads: harmonic intervals
{
  const items = [];
  for (const size of [3, 5, 6, 2, 4, 8]) {
    for (const staff of ['treble', 'bass']) {
      items.push({
        id: `dy:${staff === 'bass' ? 'b' : 't'}:${size}`, kind: 'dyad', clef: staff,
        label: `Harmonic ${SIZE_NAME[size]} (${staff})`,
        hint: { name: `A ${SIZE_NAME[size]} stacked`, mnemonic: INTERVAL_TIPS[size] },
        gen: { size, staff },
      });
    }
  }
  addStage(
    { id: 'dyads', title: 'Dyads', short: 'Two notes together', kind: 'dyad', clef: 'both', rt: { start: 4000, end: 1800 },
      description: 'Two notes at once on one staff. Read the shape, play both keys.' },
    items,
  );
}

// 9 hands together: 16 curated (left bass note, right treble note) pairs
{
  const pairs = [
    // octaves
    [48, 60], [50, 62], [52, 64], [55, 67], [57, 69],
    // tenths
    [48, 64], [50, 65], [53, 69], [55, 71],
    // sixths
    [52, 60], [53, 62], [55, 64], [57, 65],
    // fifths
    [53, 60], [55, 62], [57, 64],
  ];
  const kindOf = (l, r) => ({ 12: 'octave', 15: '10th', 16: '10th', 8: '6th', 9: '6th', 7: '5th' })[r - l];
  const items = pairs.map(([l, r]) => ({
    id: `ht:${l}+${r}`, kind: 'hands', clef: 'grand',
    label: `${noteName(l)} + ${noteName(r)}`,
    hint: { name: `Left ${noteName(l)}, right ${noteName(r)}`, mnemonic: `A ${kindOf(l, r)} between the hands: read each staff on its own, then play together.` },
    gen: { left: l, right: r },
  }));
  addStage(
    { id: 'hands-together', title: 'Hands together', short: 'Both hands', kind: 'hands', clef: 'grand', rt: { start: 4500, end: 2000 },
      description: 'One note on each staff: left hand reads bass, right hand reads treble, played at the same time.' },
    items,
  );
}

// 10 triads
const TRIADS = [
  { sym: 'C', name: 'C major', pcs: [0, 4, 7] },
  { sym: 'F', name: 'F major', pcs: [5, 9, 0] },
  { sym: 'G', name: 'G major', pcs: [7, 11, 2] },
  { sym: 'Am', name: 'A minor', pcs: [9, 0, 4] },
  { sym: 'Dm', name: 'D minor', pcs: [2, 5, 9] },
  { sym: 'Em', name: 'E minor', pcs: [4, 7, 11] },
];
const INV_NAME = ['root position', '1st inversion', '2nd inversion'];
const INV_TIP = [
  'Stacked thirds: three lines or three spaces in a row.',
  'A third, then a fourth: the gap is on top.',
  'A fourth, then a third: the gap is at the bottom.',
];
/** Concrete voicing: bass-most note in [lowest, lowest+11], remaining chord tones stacked above. */
function triadVoicing(pcs, inv, staff) {
  const lowest = staff === 'bass' ? 41 : 60; // bass F2..E3, treble C4..B4
  const order = [pcs[inv % 3], pcs[(inv + 1) % 3], pcs[(inv + 2) % 3]];
  let m = lowest;
  while (pcOf(m) !== order[0]) m++;
  const out = [m];
  for (let i = 1; i < 3; i++) {
    let n = out[i - 1] + 1;
    while (pcOf(n) !== order[i]) n++;
    out.push(n);
  }
  return out;
}
{
  const items = [];
  for (const staff of ['treble', 'bass']) {
    for (let inv = 0; inv < 3; inv++) {
      for (const t of TRIADS) {
        const midis = triadVoicing(t.pcs, inv, staff);
        items.push({
          id: `ch:${staff === 'bass' ? 'b' : 't'}:${t.sym}:${inv}`, kind: 'chord', clef: staff,
          label: `${t.sym}, ${INV_NAME[inv]} (${staff})`,
          hint: { name: `${t.name}, ${INV_NAME[inv]}: ${midis.map((m) => noteName(m, 'letters', { octave: false })).join('-')}`, mnemonic: INV_TIP[inv] },
          gen: { staff, sym: t.sym, inv, midis },
        });
      }
    }
  }
  addStage(
    { id: 'triads', title: 'Triads', short: 'Triads and inversions', kind: 'chord', clef: 'both', rt: { start: 5000, end: 2200 },
      description: 'Major and minor triads in root position and both inversions, first in treble then in bass.' },
    items,
  );
}

// 11 hymn chords: hand-checked SATB voicings, [bass, tenor, alto, soprano]
const HYMN_KEYS = [
  { key: 'C', keySig: 0, tonic: 'C major' },
  { key: 'G', keySig: 1, tonic: 'G major' },
  { key: 'F', keySig: -1, tonic: 'F major' },
];
const HYMN_NUMERALS = {
  I: 'Home chord (tonic).',
  IV: 'Subdominant: the step away from home.',
  V: 'Dominant: wants to resolve to I.',
  vi: 'Relative minor: same key signature, minor colour.',
  V7: 'Dominant seventh: V with an extra note, the strongest pull to I.',
};
const HYMN_VOICINGS = {
  C: { I: [48, 55, 64, 72], IV: [53, 60, 65, 69], V: [55, 59, 62, 67], vi: [45, 52, 60, 69], V7: [55, 59, 65, 74] },
  G: { I: [43, 55, 62, 71], IV: [48, 55, 64, 72], V: [50, 57, 66, 74], vi: [52, 59, 67, 76], V7: [50, 60, 66, 69] },
  F: { I: [41, 53, 60, 69], IV: [46, 53, 62, 70], V: [48, 55, 64, 72], vi: [50, 57, 65, 74], V7: [48, 58, 64, 67] },
};
{
  const items = [];
  for (const k of HYMN_KEYS) {
    for (const numeral of Object.keys(HYMN_NUMERALS)) {
      const voices = HYMN_VOICINGS[k.key][numeral];
      const names = [...new Set(voices.map((m) => noteName(m, 'letters', { octave: false })))];
      items.push({
        id: `hy:${k.key}:${numeral}`, kind: 'chord', clef: 'grand',
        label: `${numeral} in ${k.key}`,
        hint: { name: `${numeral} in ${k.tonic}: ${names.join('-')}`, mnemonic: HYMN_NUMERALS[numeral] },
        gen: { key: k.key, keySig: k.keySig, numeral, voices },
      });
    }
  }
  addStage(
    { id: 'hymn-chords', title: 'Hymn chords', short: 'Four-part chords', kind: 'chord', clef: 'grand', rt: { start: 7000, end: 3000 },
      description: 'Four-part hymn chords with a key signature: soprano and alto in the right hand, tenor and bass in the left.' },
    items,
  );
}

// 12 rhythm
const RHYTHM_DUR = { w: 4, h: 2, q: 1, 8: 0.5 };
{
  const patterns = [
    'w', 'h-h', 'q-q-q-q', 'q-q-h', 'h-q-q', 'q-h-q',
    '8-8-q-h', 'q-8-8-h', 'h-8-8-q', '8-8-8-8-h', 'q-q-8-8-q', '8-8-q-8-8-q',
  ];
  const WORD = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth' };
  const items = patterns.map((p) => {
    const tokens = p.split('-');
    let b = 0;
    const count = [];
    for (const t of tokens) {
      count.push(Number.isInteger(b) ? String(b + 1) : '&');
      b += RHYTHM_DUR[t];
    }
    return {
      id: `rh:${p}`, kind: 'rhythm', clef: 'none',
      label: tokens.map((t) => WORD[t]).join(', '),
      hint: { name: tokens.map((t) => WORD[t]).join(', '), mnemonic: `Count: ${count.join(' ')}` },
      gen: { tokens, bpm: 72 },
    };
  });
  addStage(
    { id: 'rhythm', title: 'Rhythm', short: 'Rhythm tapping', kind: 'rhythm', clef: 'none',
      // rt = mean absolute timing error in ms for this stage (see engine rule for rhythm)
      rt: { start: 140, end: 70 },
      description: 'Tap any key in time with the metronome: one bar of 4/4 at a time.' },
    items,
  );
}

// 13 phrases
{
  const T = [
    ['tr-step', 'Treble steps', 'Mostly stepwise melody in the right hand.', 'treble'],
    ['ba-step', 'Bass steps', 'Mostly stepwise melody in the left hand.', 'bass'],
    ['tr-skip', 'Treble skips', 'A melody with several skips, right hand.', 'treble'],
    ['ba-skip', 'Bass skips', 'A melody with several skips, left hand.', 'bass'],
    ['alt', 'Alternating hands', 'Notes alternate between the staves: right, left, right, left.', 'grand'],
  ];
  const items = T.map(([tpl, label, tip, clef]) => ({
    id: `ph:${tpl}`, kind: 'phrase', clef, label,
    hint: { name: label, mnemonic: `${tip} Look at the shape: steps move to the next line or space.` },
    gen: { template: tpl },
  }));
  addStage(
    { id: 'phrases', title: 'Phrases', short: 'Short phrases', kind: 'phrase', clef: 'grand', rt: { start: 1800, end: 900 }, perNote: true,
      description: 'Short melodies of four to eight notes, played note by note from the staff.' },
    items,
  );
}

// P pedal (optional)
{
  const order = [48, 43, 53, 52, 50, 47, 45, 55, 57, 59, 60, 41, 40, 38, 36, 62];
  const items = order.map((midi) => {
    const base = noteItem('pd', 'bass', midi);
    const nm = noteName(midi);
    return { ...base, id: `pd:${midi}`, label: `Pedal ${nm}`, hint: { name: `Pedal ${nm}`, mnemonic: base.hint.mnemonic } };
  });
  addStage(
    { id: 'pedal', title: 'Pedal', short: 'Pedalboard', kind: 'note', clef: 'bass', rt: { start: 3000, end: 1300 }, optional: true, requires: 'bass-staff',
      description: 'Optional: bass-clef notes for the pedalboard, C2 up to D4. Written at sounding pitch.' },
    items,
  );
}

export function getStage(id) {
  return STAGES.find((s) => s.id === id);
}

/** Items of a stage in intro order. Mix stages return the referenced stages' items. */
export function stageItems(stageId) {
  const s = getStage(stageId);
  if (!s) return [];
  if (s.refs) return s.refs.flatMap((r) => stageItems(r));
  return s.itemIds.map((id) => ITEMS[id]);
}

// ---------------------------------------------------------------------------------------------
// Realisation
// ---------------------------------------------------------------------------------------------

const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** Staff-relative window of white-key diatonic indices: staff plus one ledger line each side. */
function diaWindow(staff) {
  const base = STAFF_BASE_DIA[staff];
  return [base - 2, base + 10];
}

function finish(item, notes, answer, extra = {}) {
  const midis = notes.map((n) => n.midi);
  return {
    kind: item.kind,
    clef: item.clef,
    ...extra,
    notes,
    answer,
    range: rangeFor(midis.length ? midis : [60]),
  };
}

function walk(start, n, lo, hi, rng, { pSkip, maxSkips, minSkips, bigSkip }) {
  let out = [start];
  for (let attempt = 0; attempt < 30; attempt++) {
    out = [start];
    let dir = rng() < 0.5 ? 1 : -1;
    let skips = 0;
    for (let i = 1; i < n; i++) {
      const cur = out[i - 1];
      if (rng() < 0.3) dir = -dir;
      let size = 1;
      if (skips < maxSkips && rng() < pSkip) size = bigSkip && rng() < 0.25 ? 3 : 2;
      let next = cur + dir * size;
      if (next < lo || next > hi) {
        dir = -dir;
        next = cur + dir * size;
        if (next < lo || next > hi) next = cur + dir;
        if (next < lo || next > hi) next = cur - dir;
      }
      if (Math.abs(next - cur) > 1) skips++;
      out.push(next);
    }
    if (out.slice(1).filter((d, i) => Math.abs(d - out[i]) > 1).length >= minSkips) return out;
  }
  return out;
}

const PHRASE_START = { treble: [28, 32, 35], bass: [18, 21, 24] }; // C4 G4 C5 / G2 C3 F3
const PHRASE_BOUNDS = { treble: [28, 39], bass: [17, 28] }; // staff steps -2..9 / -1..10

function realizePhrase(item, rng) {
  const tpl = item.gen.template;
  const n = 4 + Math.min(4, Math.floor(rng() * 5));
  const notes = [];
  if (tpl === 'alt') {
    const nt = Math.ceil(n / 2);
    const nb = Math.floor(n / 2);
    const opts = { pSkip: 0.25, maxSkips: 1, minSkips: 0, bigSkip: false };
    const tl = walk(pick(rng, PHRASE_START.treble), nt, PHRASE_BOUNDS.treble[0], PHRASE_BOUNDS.treble[1], rng, opts);
    const bl = walk(pick(rng, PHRASE_START.bass), nb, PHRASE_BOUNDS.bass[0], PHRASE_BOUNDS.bass[1], rng, opts);
    for (let i = 0; i < n; i++) {
      const treble = i % 2 === 0;
      notes.push({ midi: diaToMidi(treble ? tl[i >> 1] : bl[i >> 1]), staff: treble ? 'treble' : 'bass', dur: 'q', beat: i });
    }
  } else {
    const staff = tpl.startsWith('tr') ? 'treble' : 'bass';
    const skipTpl = tpl.endsWith('skip');
    const line = walk(pick(rng, PHRASE_START[staff]), n, PHRASE_BOUNDS[staff][0], PHRASE_BOUNDS[staff][1], rng,
      skipTpl ? { pSkip: 0.55, maxSkips: 99, minSkips: 1, bigSkip: true } : { pSkip: 0.25, maxSkips: 1, minSkips: 0, bigSkip: false });
    line.forEach((d, i) => notes.push({ midi: diaToMidi(d), staff, dur: 'q', beat: i }));
  }
  return finish(item, notes, { type: 'sequence', midis: notes.map((x) => x.midi), given: 0 });
}

/** item: Item object or item id. Pure: randomness only from rng() in [0,1). */
export function realize(item, rng) {
  if (typeof item === 'string') item = ITEMS[item];
  if (!item) throw new Error('realize: unknown item');
  const g = item.gen;
  switch (item.kind) {
    case 'note': {
      const note = { midi: g.midi, staff: g.staff, dur: 'w', beat: 0 };
      if (g.accidental) note.accidental = g.accidental;
      return finish(item, [note], { type: 'set', midis: [g.midi] });
    }
    case 'interval': {
      const [lo, hi] = diaWindow(g.staff);
      const step = g.size - 1;
      const starts = [];
      for (let d = lo; d <= hi; d++) {
        const e = d + g.dir * step;
        if (e >= lo && e <= hi) starts.push(d);
      }
      const d0 = pick(rng, starts);
      const a = diaToMidi(d0);
      const b = diaToMidi(d0 + g.dir * step);
      const notes = [
        { midi: a, staff: g.staff, dur: 'q', beat: 0 },
        { midi: b, staff: g.staff, dur: 'q', beat: 1 },
      ];
      return finish(item, notes, { type: 'sequence', midis: [a, b], given: 1 });
    }
    case 'dyad': {
      const [lo, hi] = diaWindow(g.staff);
      const step = g.size - 1;
      const starts = [];
      for (let d = lo; d + step <= hi; d++) starts.push(d);
      const d0 = pick(rng, starts);
      const a = diaToMidi(d0);
      const b = diaToMidi(d0 + step);
      const notes = [a, b].map((m) => ({ midi: m, staff: g.staff, dur: 'w', beat: 0, group: 0 }));
      return finish(item, notes, { type: 'set', midis: [a, b] });
    }
    case 'hands': {
      const notes = [
        { midi: g.right, staff: 'treble', dur: 'w', beat: 0, group: 0 },
        { midi: g.left, staff: 'bass', dur: 'w', beat: 0, group: 0 },
      ];
      return finish(item, notes, { type: 'set', midis: [g.left, g.right] });
    }
    case 'chord': {
      if (g.voices) {
        // SATB: [bass, tenor, alto, soprano]; S+A on treble, T+B on bass
        const [b, t, a, s] = g.voices;
        const notes = [
          { midi: s, staff: 'treble' }, { midi: a, staff: 'treble' },
          { midi: t, staff: 'bass' }, { midi: b, staff: 'bass' },
        ].map((n) => ({ ...n, dur: 'w', beat: 0, group: 0 }));
        return finish(item, notes, { type: 'set', midis: [b, t, a, s] }, { keySig: g.keySig });
      }
      const notes = g.midis.map((m) => ({ midi: m, staff: g.staff, dur: 'w', beat: 0, group: 0 }));
      return finish(item, notes, { type: 'set', midis: g.midis.slice() });
    }
    case 'rhythm': {
      let b = 0;
      const notes = [];
      const onsets = [];
      for (const t of g.tokens) {
        notes.push({ midi: 71, staff: 'treble', dur: t, beat: b });
        onsets.push(b);
        b += RHYTHM_DUR[t];
      }
      return {
        kind: 'rhythm', clef: 'none', notes,
        answer: { type: 'rhythm', onsets, beats: 4, bpm: g.bpm },
        range: { lo: 48, hi: 72 },
      };
    }
    case 'phrase':
      return realizePhrase(item, rng);
    default:
      throw new Error(`realize: unsupported item kind ${item.kind}`);
  }
}
