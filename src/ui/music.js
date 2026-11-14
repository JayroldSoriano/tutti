// Pitch spelling + naming helpers used by the renderer and screens.
// Self-contained (does not depend on curriculum internals), consistent with PLAN 4.1:
// treble bottom line E4 = step 0, bass bottom line G2 = step 0.
import * as cur from '../curriculum.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (letter indices)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F

export const pc = (m) => ((m % 12) + 12) % 12;
export const isBlackKey = (m) => [1, 3, 6, 8, 10].includes(pc(m));

/** Alteration (+1/-1/0) a key signature applies to a letter index. */
export function keySigAlter(letter, keySig = 0) {
  if (keySig > 0) return SHARP_ORDER.slice(0, keySig).includes(letter) ? 1 : 0;
  if (keySig < 0) return FLAT_ORDER.slice(0, -keySig).includes(letter) ? -1 : 0;
  return 0;
}

/**
 * Spell a midi pitch. accidental: '#'|'b'|'n'|undefined.
 * Returns { letter (0..6), octave, alter (-1,0,1) }.
 */
export function spell(midi, accidental, keySig = 0) {
  const p = pc(midi);
  let alter;
  if (accidental === '#') alter = 1;
  else if (accidental === 'b') alter = -1;
  else if (accidental === 'n') alter = 0;
  else if (!isBlackKey(midi)) {
    // white key: prefer natural spelling (B#/Cb/E#/Fb never used in this app)
    alter = 0;
  } else if (keySig > 0) alter = 1;
  else if (keySig < 0) alter = -1;
  else alter = (p === 3 || p === 10) ? -1 : 1; // default spelling: C#, Eb, F#, G#, Bb
  let natPc = p - alter;
  let octShift = 0;
  if (natPc < 0) { natPc += 12; octShift = 1; }
  if (natPc > 11) { natPc -= 12; octShift = -1; }
  let letter = LETTER_PC.indexOf(natPc);
  if (letter < 0) { // inconsistent accidental (e.g. '#' on a white key that has no sharp spelling): fall back
    alter = isBlackKey(midi) ? 1 : 0; natPc = p - alter; letter = LETTER_PC.indexOf(natPc); octShift = 0;
  }
  const octave = Math.floor(midi / 12) - 1 + octShift;
  return { letter, octave, alter };
}

/** Diatonic steps above the staff's bottom line. */
export function stepOf(midi, staff, accidental, keySig = 0) {
  const { letter, octave } = spell(midi, accidental, keySig);
  const dia = octave * 7 + letter; // C0 = 0
  const base = staff === 'bass' ? 2 * 7 + 4 /* G2 */ : 4 * 7 + 2 /* E4 */;
  return dia - base;
}

/** Which accidental glyph (if any) must be drawn given the key signature. */
export function shownAccidental(midi, accidental, keySig = 0) {
  const sp = spell(midi, accidental, keySig);
  const ks = keySigAlter(sp.letter, keySig);
  if (sp.alter === ks) return null;
  if (sp.alter === 0) return 'n';
  return sp.alter > 0 ? '#' : 'b';
}

/** Name with octave or without. naming 'letters' | 'solfege'. */
export function name(midi, naming = 'letters', { octave = true, accidental, keySig = 0 } = {}) {
  try {
    const r = cur.noteName && cur.noteName(midi, naming, { octave, accidental });
    if (typeof r === 'string' && r) return r;
  } catch { /* fall through */ }
  const sp = spell(midi, accidental, keySig);
  const acc = sp.alter > 0 ? '♯' : sp.alter < 0 ? '♭' : '';
  const base = naming === 'solfege' ? SOLFEGE[sp.letter] : LETTERS[sp.letter];
  return base + acc + (octave && naming !== 'solfege' ? sp.octave : '');
}

/** Pretty name: converts '#'/'b' ascii accidentals to ♯/♭ for display. */
export function pretty(str) {
  return String(str || '').replace(/([A-G]|Do|Re|Mi|Fa|Sol|La|Ti)#/g, '$1♯').replace(/([A-G]|Do|Re|Mi|Fa|Sol|La|Ti)b(?=\d|$|\s)/g, '$1♭');
}

export function keyLabel(midi) {
  const sp = spell(midi, undefined, 0);
  return LETTERS[sp.letter] + (sp.alter > 0 ? '♯' : '') + sp.octave;
}

export const LETTER_NAMES = LETTERS;
export const SOLFEGE_NAMES = SOLFEGE;
