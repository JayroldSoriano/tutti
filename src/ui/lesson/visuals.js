// Teaching visuals (PLAN-LESSONS section 3). renderVisual(visual, env) -> { el, play(), destroy() }
// Every visual is inline SVG animated with CSS transitions and timers, has a readable static end
// state (shown immediately under prefers-reduced-motion) and is replayed by calling play() again.
import { h, s, clear } from '../h.js';
import { renderStaff } from '../staff.js';
import { renderScore } from '../score.js';
import { headPath, yOf } from '../staff.js';
import { clefs } from '../glyphs.js';
import { isBlackKey, name as nameOf, pretty } from '../music.js';
import * as cur from '../../curriculum.js';
import { getSong } from '../../songs.js';
import {
  timeline, voice, keys, sliceRange, createStaffKeyLink, staffBody, headBox, staffText, miniSong, noteLabel, WK, WH, BH,
} from './kit.js';

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const T = (midi, staff = 'treble', accidental) => ({ midi, staff, ...(accidental ? { accidental } : {}) });
const LANDMARK_NAMES = { 't:60': 'Middle C', 'b:60': 'Middle C', 't:67': 'Treble G', 't:72': 'Treble C', 't:77': 'Top-line F', 't:84': 'High C', 'b:53': 'Bass F', 'b:48': 'Bass C', 'b:43': 'Bottom-line G', 'b:36': 'Low C' };
const ALL_LANDMARKS = [T(43, 'bass'), T(48, 'bass'), T(53, 'bass'), T(60, 'treble'), T(67, 'treble'), T(72, 'treble'), T(77, 'treble')];

function frame(kind, ...kids) { return h('figure.vis.vis-' + kind, ...kids); }
function caption(text) { return h('figcaption.vis-cap', text); }

export function renderVisual(visual, env = {}) {
  const fn = VISUALS[visual && visual.kind];
  if (!fn) return { el: h('div.vis'), play() {}, destroy() {} };
  try { return fn(visual, env); } catch (e) {
    console.warn('visual failed', visual, e);
    return { el: h('div.vis'), play() {}, destroy() {} };
  }
}

// ------------------------------------------------------------------ keyboard geography
function kbGroups(v, env) {
  const tl = timeline();
  const kb = keys(48, 72, { labels: 'none', label: 'Keyboard with black keys in groups of two and three' });
  const groups = [];
  for (let oct = 48; oct < 72; oct += 12) {
    groups.push({ n: 2, lo: oct + 1, hi: oct + 3 });
    groups.push({ n: 3, lo: oct + 6, hi: oct + 10 });
  }
  const overlays = groups.map((gr) => {
    const a = kb.center(gr.lo).x - 9, b = kb.center(gr.hi).x + 9;
    const g = s('g', { class: 'vk-group vk-group-' + gr.n },
      s('rect', { x: a, y: -2, width: b - a, height: BH + 6, rx: 6 }),
      s('text', { x: (a + b) / 2, y: BH + 22, 'text-anchor': 'middle', text: String(gr.n) }));
    kb.g.appendChild(g);
    return g;
  });
  const el = frame('kb-groups', h('div.vis-kb', kb.svg), caption('Two, three, two, three: the pattern repeats in every octave.'));
  const vo = voice(env);
  return {
    el,
    play() {
      tl.clear();
      overlays.forEach((o) => o.classList.toggle('is-on', tl.rm));
      if (tl.rm) return;
      overlays.forEach((o, i) => tl.at(300 + i * 650, () => {
        o.classList.add('is-on');
        const gr = groups[i];
        for (let m = gr.lo; m <= gr.hi; m++) if (isBlackKey(m)) { kb.light(m, 'is-lit'); tl.at(420, () => kb.light(m, 'is-lit', false)); }
        vo.play(gr.lo, 260);
      }));
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function kbNames(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const letters = v.letters || ['C'];
  const kb = keys(48, 71, { labels: 'none', label: 'Keyboard with ' + letters.join(', ') + ' marked' });
  const pcs = letters.map((l) => LETTER_PC[l]).filter((x) => x != null);
  const useTwo = pcs.some((p) => p <= 4), useThree = pcs.some((p) => p >= 5);
  for (let oct = 48; oct < 72; oct += 12) {
    const add = (lo, hi) => {
      const a = kb.center(lo).x - 9, b = kb.center(hi).x + 9;
      kb.g.insertBefore(s('rect', { class: 'vk-ring', x: a, y: -2, width: b - a, height: BH + 6, rx: 6 }), kb.g.lastChild);
    };
    if (useTwo) add(oct + 1, oct + 3);
    if (useThree) add(oct + 6, oct + 10);
  }
  const targets = [];
  for (let oct = 48; oct < 72; oct += 12) for (const p of pcs) targets.push(oct + p);
  const el = frame('kb-names', h('div.vis-kb', kb.svg), caption(letters.join(', ') + ': find them by the black keys around them.'));
  const show = (m) => { kb.light(m, 'is-lit'); kb.label(m, nameOf(m, 'letters', { octave: false }), 'is-name'); };
  return {
    el,
    play() {
      tl.clear(); kb.clearLights(); for (const m of targets) kb.unlabel(m);
      if (tl.rm) { targets.forEach(show); return; }
      // first octave one by one with sound, then the second octave together
      const first = targets.filter((m) => m < 60), second = targets.filter((m) => m >= 60);
      first.forEach((m, i) => tl.at(300 + i * 700, () => { show(m); vo.play(m, 520); }));
      tl.at(300 + first.length * 700 + 300, () => { second.forEach(show); });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

// ------------------------------------------------------------------ staff to key
function staffKeyLink(v, env) {
  const link = createStaffKeyLink({ notes: v.notes || [], env, naming: env.naming });
  const el = frame('staff-key-link', link.el);
  return { el, play: () => link.play(), destroy: () => link.destroy() };
}

function lineSpace(v, env) {
  const staff = v.staff || 'treble';
  const refs = [];
  for (let m = v.from; m <= v.to; m++) if (!isBlackKey(m)) refs.push(T(m, staff));
  const tags = refs.map((r) => { const st = cur.staffStep(r.midi, staff); return st % 2 === 0 ? 'line' : 'space'; });
  const link = createStaffKeyLink({ notes: refs, env, tags, naming: env.naming });
  const el = frame('line-space', link.el, caption('Line, space, line, space: each step up the ladder is the next white key.'));
  return { el, play: () => link.play({ gap: 650 }), destroy: () => link.destroy() };
}

function stepSkip(v, env) {
  const staff = v.staff || 'treble';
  const a = staff === 'bass' ? 48 : 64;
  const size = v.size === 3 ? 3 : 2;
  const b = size === 2 ? (staff === 'bass' ? 50 : 65) : (staff === 'bass' ? 52 : 67);
  const refs = [T(a, staff), T(b, staff)];
  const sa = cur.staffStep(a, staff) % 2 === 0 ? 'line' : 'space', sb = cur.staffStep(b, staff) % 2 === 0 ? 'line' : 'space';
  const link = createStaffKeyLink({ notes: refs, env, tags: [sa, sb], naming: env.naming });
  // bracket across the keys
  const ca = link.kb.center(a), cb = link.kb.center(b);
  const y = WH + 8;
  const br = s('g', { class: 'vk-bracket' },
    s('path', { d: `M${ca.x} ${y - 5}V${y}H${cb.x}V${y - 5}` }),
    s('text', { x: (ca.x + cb.x) / 2, y: y + 13, 'text-anchor': 'middle', text: size === 2 ? 'next key' : 'miss one key' }));
  link.kb.g.appendChild(br);
  link.kb.svg.setAttribute('viewBox', `-1 -1 ${link.kb.W + 2} ${WH + 26}`);
  const el = frame('step-skip', link.el, caption(size === 2 ? `A step: ${sa} to ${sb}, the neighbouring key.` : `A skip: ${sa} to ${sb}, one key missed out.`));
  return {
    el,
    play() { br.classList.remove('is-on'); link.play({ gap: 800, onDone: () => br.classList.add('is-on') }); },
    destroy: () => link.destroy(),
  };
}

function ledger(v, env) {
  const refs = (v.notes || []).map((n) => ({ ...n, staff: n.staff || v.staff || 'treble' }));
  const link = createStaffKeyLink({ notes: refs, env, naming: env.naming });
  const el = frame('ledger', link.el, caption('Short ledger lines carry the same line-space ladder past the staff.'));
  return { el, play: () => link.play({ gap: 800 }), destroy: () => link.destroy() };
}

// ------------------------------------------------------------------ clefs and landmarks
function clef(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const bass = v.clef === 'bass';
  const C = clefs();
  const lm = v.landmark || (bass ? T(53, 'bass') : T(67, 'treble'));
  const lineY = bass ? 10 : 30;
  const g = s('g');
  for (let i = 0; i < 5; i++) g.appendChild(s('line', { class: 'st-line' + (i * 10 === lineY ? ' vis-lm-line' : ''), x1: -4, x2: 150, y1: i * 10, y2: i * 10 }));
  const glyph = s('path', { class: 'vis-clef-glyph', d: bass ? C.bass : C.treble, transform: 'translate(10 0) scale(1)', pathLength: '1' });
  g.appendChild(glyph);
  const head = s('path', { class: 'st-head vis-lm-head', d: headPath(96, lineY, 'w'), 'fill-rule': 'evenodd' });
  const lbl = s('text', { class: 'vis-lm-lbl', x: 96, y: bass ? 58 : 58, 'text-anchor': 'middle', text: noteLabel(lm, 'letters', true) });
  const arrow = s('text', { class: 'vis-lm-arrow', x: 112, y: lineY - 4, text: bass ? 'the F line' : 'the G line' });
  g.append(head, lbl, arrow);
  const svg = s('svg', { class: 'staff vis-clef-svg', viewBox: '-8 -24 170 100', role: 'img', 'aria-label': bass ? 'Bass clef: its dots hug the F line' : 'Treble clef: it curls around the G line' }, g);
  const el = frame('clef', svg, caption(bass ? 'The bass clef is an F: its two dots sit either side of the F line.' : 'The treble clef is a G: its curl wraps the G line.'));
  return {
    el,
    play() {
      tl.clear();
      el.classList.remove('is-drawn', 'is-lm');
      if (tl.rm) { el.classList.add('is-drawn', 'is-lm'); return; }
      void el.offsetWidth;
      tl.at(60, () => el.classList.add('is-drawn'));
      tl.at(1900, () => { el.classList.add('is-lm'); vo.play(lm.midi, 900); });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function landmarks(v, env) {
  const tl = timeline();
  const vo = voice(env);
  let refs = v.notes && v.notes.length ? v.notes.slice() : null;
  if (!refs) {
    const taught = env.taught || null;
    refs = ALL_LANDMARKS.filter((r) => !taught || taught.has((r.staff === 'bass' ? 'b:' : 't:') + r.midi));
    if (v.staff === 'treble') refs = refs.filter((r) => r.staff === 'treble');
    if (v.staff === 'bass') refs = refs.filter((r) => r.staff === 'bass');
    if (!refs.length) refs = ALL_LANDMARKS.slice(1, 5);
  }
  refs = refs.map((r) => ({ ...r, staff: r.staff || (v.staff === 'bass' ? 'bass' : 'treble') })).sort((a, b) => a.midi - b.midi || (a.staff === 'bass' ? -1 : 1));
  const body = staffBody(refs);
  if (v.staff === 'grand') body.clef = 'grand';
  const svg = renderStaff(body, { label: 'Landmark notes: ' + refs.map((r) => LANDMARK_NAMES[(r.staff === 'bass' ? 'b:' : 't:') + r.midi] || noteLabel(r, 'letters', true)).join(', ') });
  const el = frame('landmarks', h('div.vis-staff', svg), caption('Landmarks: know these on sight, read everything else as a step or skip from them.'));
  let decorated = false;
  const labels = [];
  function decorate() {
    if (decorated) return; decorated = true;
    refs.forEach((r, i) => {
      const b = headBox(svg, i); if (!b) return;
      const key = (r.staff === 'bass' ? 'b:' : 't:') + r.midi;
      const nm = LANDMARK_NAMES[key] || noteLabel(r, 'letters', true);
      const below = r.staff === 'bass' && body.clef === 'grand' ? true : r.staff === 'bass';
      const y = below ? Math.max(b.y + b.height + 12, (body.clef === 'grand' ? 140 : 40) + 14) : Math.min(b.y - 7, -8);
      const words = nm.split(' ');
      const t = staffText(svg, b.x + b.width / 2, y, '', 'vis-st-lbl');
      words.forEach((w, k) => t.appendChild(s('tspan', { x: b.x + b.width / 2, dy: k === 0 ? 0 : 9, text: w })));
      if (!below && words.length > 1) t.setAttribute('y', String(y - 9));
      labels.push(t);
    });
  }
  return {
    el,
    play() {
      tl.clear();
      decorate();
      const all = svg.__noteEls || [];
      all.forEach((n) => n && n.classList.toggle('is-lit', tl.rm));
      labels.forEach((t) => t.classList.toggle('is-on', tl.rm));
      if (tl.rm) return;
      refs.forEach((r, i) => tl.at(300 + i * 700, () => { all[i] && all[i].classList.add('is-lit'); labels[i] && labels[i].classList.add('is-on'); vo.play(r.midi, 520); }));
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function mnemonic(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const refs = (v.notes || []).slice();
  let words = v.words && v.words.length === refs.length ? v.words : String(v.phrase || '').split(/\s+/);
  if (words.length === 1 && words[0].length === refs.length) words = words[0].split('');
  words = words.slice(0, refs.length);
  while (words.length < refs.length) words.push(noteLabel(refs[words.length]));
  const svg = renderStaff(staffBody(refs), { label: `${v.phrase}: ${refs.map((r) => noteLabel(r)).join(' ')}` });
  const chips = h('div.mn-words', words.map((w) => h('span.mn-word', h('b', w.slice(0, 1)), w.slice(1))));
  const el = frame('mnemonic', h('div.vis-staff', svg), chips, caption(`“${v.phrase}”: the first letters name the ${cur.staffStep(refs[0].midi, refs[0].staff || 'treble') % 2 === 0 ? 'lines' : 'spaces'}, bottom to top.`));
  return {
    el,
    play() {
      tl.clear();
      const all = svg.__noteEls || [];
      [...chips.children].forEach((c) => c.classList.toggle('is-on', tl.rm));
      all.forEach((n) => n && n.classList.toggle('is-lit', tl.rm));
      if (tl.rm) return;
      refs.forEach((r, i) => tl.at(300 + i * 750, () => { all[i] && all[i].classList.add('is-lit'); chips.children[i].classList.add('is-on'); vo.play(r.midi, 560); }));
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

// ------------------------------------------------------------------ hands
const HAND_FINGERS = [ // rh, palm-down, thumb on the left: [baseX, baseY, length, angle(deg), width]
  [26, 92, 40, -48, 17], [46, 60, 50, -8, 15.5], [64, 56, 56, 0, 15.5], [82, 60, 51, 7, 15], [99, 70, 40, 15, 13.5],
];
function handSvg(hand, { numbers = true } = {}) {
  const g = s('g', { class: 'hand' });
  const mirror = hand === 'lh';
  const X = (x) => (mirror ? 126 - x : x);
  const palm = s('path', { class: 'hand-palm', d: mirror
    ? `M${X(36)} 64C${X(38)} 126 ${X(52)} 138 ${X(70)} 140C${X(92)} 141 ${X(106)} 128 ${X(108)} 108L${X(108)} 70C${X(96)} 58 ${X(48)} 56 ${X(36)} 64Z`
    : 'M36 64C38 126 52 138 70 140C92 141 106 128 108 108L108 70C96 58 48 56 36 64Z' });
  const tips = [];
  HAND_FINGERS.forEach(([bx, by, len, ang, w], i) => {
    const a = (mirror ? -ang : ang) * Math.PI / 180;
    const x0 = X(bx), y0 = by;
    const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
    g.appendChild(s('line', { class: 'hand-finger-edge', x1: x0, y1: y0, x2: x1, y2: y1, 'stroke-width': w + 2.8 }));
    g.appendChild(s('line', { class: 'hand-finger', x1: x0, y1: y0, x2: x1, y2: y1, 'stroke-width': w }));
    tips.push({ x: x1, y: y1, f: i + 1 });
  });
  g.appendChild(palm);
  const nums = tips.map((t) => s('g', { class: 'hand-num' },
    s('circle', { cx: t.x, cy: t.y + 2, r: 8.2 }),
    s('text', { x: t.x, y: t.y + 5.6, 'text-anchor': 'middle', text: String(t.f) })));
  if (numbers) nums.forEach((n) => g.appendChild(n));
  return { g, nums, tips };
}

function fingerNumbers(v, env) {
  const tl = timeline();
  const hand = v.hand === 'lh' ? 'lh' : 'rh';
  const hs = handSvg(hand);
  const svg = s('svg', { class: 'vis-hand-svg', viewBox: '-4 -8 134 156', role: 'img', 'aria-label': `${hand === 'rh' ? 'Right' : 'Left'} hand: thumb is 1, little finger is 5` }, hs.g);
  const el = frame('finger-numbers', h('div.vis-hand', svg, h('p.vis-hand-lbl', hand === 'rh' ? 'Right hand' : 'Left hand')), caption('Thumb is 1 on both hands; the little finger is 5.'));
  void env;
  return {
    el,
    play() {
      tl.clear();
      hs.nums.forEach((n) => n.classList.toggle('is-on', tl.rm));
      if (tl.rm) return;
      hs.nums.forEach((n, i) => tl.at(250 + i * 380, () => n.classList.add('is-on')));
    },
    destroy() { tl.clear(); },
  };
}

function handPosition(v, env) {
  const tl = timeline();
  const vo = voice(env);
  if (v.posture) return posture(v, env);
  const hand = v.hand === 'lh' ? 'lh' : 'rh';
  const whitesFrom = (m, n) => { const out = []; let x = m; while (out.length < n) { if (!isBlackKey(x)) out.push(x); x++; } return out; };
  const anchor = hand === 'rh' ? (Number.isFinite(v.thumb) ? v.thumb : 60) : (Number.isFinite(v.pinky) ? v.pinky : 48);
  const five = whitesFrom(anchor, 5);
  const fingerOf = (i) => (hand === 'rh' ? i + 1 : 5 - i);
  const extra = v.shift ? whitesFrom(anchor, 7) : five;
  const r = sliceRange(extra, { pad: 2, minWhites: 11 });
  const kb = keys(r.lo, r.hi, { labels: 'c', label: `${hand === 'rh' ? 'Right' : 'Left'} hand position` });
  const marks = s('g', { class: 'hp-marks' });
  kb.g.appendChild(marks);
  const markAt = (m, f, cls = '') => {
    const c = kb.center(m);
    return s('g', { class: 'hp-mark ' + cls, transform: `translate(${c.x} ${WH - 30})` },
      s('circle', { r: 9 }), s('text', { y: 3.8, 'text-anchor': 'middle', text: String(f) }));
  };
  const base = five.map((m, i) => markAt(m, fingerOf(i)));
  base.forEach((g) => marks.appendChild(g));
  let stretch = null, shifted = [];
  if (v.shift) {
    stretch = markAt(extra[5], 5, 'is-alt');
    marks.appendChild(stretch);
    shifted = whitesFrom(extra[1], 5).map((m, i) => markAt(m, i + 1, 'is-alt2'));
    shifted.forEach((g) => marks.appendChild(g));
  }
  const names = five.map((m) => nameOf(m, 'letters', { octave: false })).join('-');
  const cap = v.shift ? 'Stretch finger 5 to reach one key further, or move the whole hand up.' : `${hand === 'rh' ? 'Thumb' : 'Little finger'} on ${nameOf(anchor, 'letters')}: fingers rest on ${names}.`;
  const el = frame('hand-position', h('div.vis-kb', kb.svg), v.shift ? h('div.hp-legend', h('span.hp-a', 'stretch'), h('span.hp-b', 'or move the hand')) : null, caption(cap));
  return {
    el,
    play() {
      tl.clear();
      const all = [...base, ...(stretch ? [stretch] : []), ...shifted];
      all.forEach((g) => g.classList.remove('is-on'));
      if (tl.rm) { base.forEach((g) => g.classList.add('is-on')); if (stretch) stretch.classList.add('is-on'); return; }
      base.forEach((g, i) => tl.at(250 + i * 330, () => { g.classList.add('is-on'); vo.play(five[i], 300); }));
      if (v.shift) {
        tl.at(2200, () => { base[4].classList.add('is-ghost'); stretch.classList.add('is-on'); vo.play(extra[5], 400); });
        tl.at(3600, () => { base.forEach((g) => g.classList.add('is-ghost')); stretch.classList.remove('is-on'); shifted.forEach((g) => g.classList.add('is-on')); });
        tl.at(5600, () => { shifted.forEach((g) => g.classList.remove('is-on')); base.forEach((g) => g.classList.remove('is-ghost')); stretch.classList.add('is-on'); });
      }
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function posture() {
  const tl = timeline();
  const g = s('g', { class: 'posture' },
    s('rect', { class: 'po-bench', x: 8, y: 110, width: 74, height: 9, rx: 3 }),
    s('rect', { class: 'po-leg', x: 14, y: 119, width: 6, height: 33 }), s('rect', { class: 'po-leg', x: 70, y: 119, width: 6, height: 33 }),
    s('rect', { class: 'po-organ', x: 152, y: 92, width: 66, height: 60, rx: 4 }),
    s('rect', { class: 'po-keys', x: 132, y: 84, width: 86, height: 8, rx: 2 }),
    s('path', { class: 'po-thigh', d: 'M46 106L104 106L108 150' }),
    s('path', { class: 'po-body', d: 'M46 106L50 52' }),
    s('circle', { class: 'po-headc', cx: 52, cy: 34, r: 12 }),
    s('path', { class: 'po-arm', d: 'M50 56L76 82L132 80' }),
    s('path', { class: 'po-finger', d: 'M132 80C137 77 141 78 143 84' }),
    s('path', { class: 'po-guide', d: 'M80 70L150 70' }),
    s('text', { class: 'po-lbl', x: 70, y: 30, text: 'sit tall' }),
    s('text', { class: 'po-lbl', x: 80, y: 64, text: 'forearm level with the keys' }),
    s('text', { class: 'po-lbl', x: 218, y: 106, 'text-anchor': 'end', text: 'curved fingers' }));
  const svg = s('svg', { class: 'vis-posture-svg', viewBox: '0 0 226 156', role: 'img', 'aria-label': 'Side view: sit tall, forearms level with the keys, wrists loose' }, g);
  const el = frame('hand-position', h('div.vis-posture', svg), caption('Sit tall, forearms level with the keys, wrists loose.'));
  return {
    el,
    play() { tl.clear(); el.classList.remove('is-on'); if (tl.rm) { el.classList.add('is-on'); return; } void el.offsetWidth; tl.at(80, () => el.classList.add('is-on')); },
    destroy() { tl.clear(); },
  };
}

// ------------------------------------------------------------------ rhythm
function glyph(dur, x, y) {
  const g = s('g', { class: 'nv-glyph' });
  const kind = dur === 'w' ? 'w' : dur === 'h' || dur === 'h.' ? 'h' : 'q';
  g.appendChild(s('path', { d: headPath(x, y, kind), 'fill-rule': 'evenodd' }));
  if (kind !== 'w') g.appendChild(s('rect', { x: x + 5.1, y: y - 30, width: 1.3, height: 30 }));
  if (dur === '8') g.appendChild(s('path', { d: `M${x + 6.3} ${y - 30}c.6 5 4 7.4 6.6 10.8c2.8 3.4 3 8.6.8 13c1-4.8-.2-8.4-3.4-10.6c-1.6-1.2-3-1.8-4-2Z` }));
  if (dur === 'h.' || dur === 'q.') g.appendChild(s('circle', { cx: x + 11, cy: y - 2, r: 1.7 }));
  return g;
}
function restGlyph(dur, x, y) {
  const g = s('g', { class: 'nv-glyph' });
  if (dur === 'w') g.appendChild(s('rect', { x: x - 6, y: y - 5, width: 12, height: 5 }));
  else if (dur === 'h') g.appendChild(s('rect', { x: x - 6, y: y, width: 12, height: 5 }));
  else g.appendChild(s('path', { transform: `translate(${x} ${y + 2})`, d: 'M-1.6 -12.4L3.6 -5.6C1.6 -3.6 0.9 -1.6 3.4 2.4L2.8 3.0C0.6 1.6 -2.6 2.6 -0.6 6.6L-1.2 7.0C-4.6 4.0 -3.6 0.2 0.4 0.6L-3.2 -4.0C-0.6 -6.4 -0.6 -9.2 -2.4 -11.6Z' }));
  return g;
}

function noteValues(v, env) {
  const tl = timeline();
  const vo = voice(env);
  let rows;
  if (v.rests) rows = [['w', [4], 'Whole rest: 4 beats', true], ['h', [2, 2], 'Half rest: 2 beats', true], ['q', [1, 1, 1, 1], 'Quarter rest: 1 beat', true]];
  else if (v.eighths) rows = [['q', [1, 1, 1, 1], 'Quarter: 1 beat'], ['8', [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 'Eighths: two per beat']];
  else if (v.dots) rows = [['h.', [3, 1], 'Dotted half: 2 + 1 = 3 beats'], ['q.', [1.5, 0.5, 1.5, 0.5], 'Dotted quarter: 1½ beats']];
  else rows = [['w', [4], 'Whole: 4 beats'], ['h', [2, 2], 'Half: 2 beats'], ['q', [1, 1, 1, 1], 'Quarter: 1 beat']];
  const W = 300, gx = 112, gw = 182, rowH = 46;
  const g = s('g');
  for (let b = 0; b <= 4; b++) g.appendChild(s('line', { class: 'nv-grid' + (b % 4 === 0 ? ' is-bar' : ''), x1: gx + b * gw / 4, x2: gx + b * gw / 4, y1: 12, y2: 14 + rows.length * rowH }));
  for (let b = 0; b < 4; b++) g.appendChild(s('text', { class: 'nv-count', x: gx + (b + 0.5) * gw / 4, y: 8, 'text-anchor': 'middle', text: String(b + 1) }));
  const fills = [];
  rows.forEach(([dur, parts, lbl, rest], ri) => {
    const y = 18 + ri * rowH;
    g.appendChild(rest ? restGlyph(dur, 20, y + 20) : glyph(dur, 18, y + 26));
    g.appendChild(s('text', { class: 'nv-lbl', x: 40, y: y + 21, text: lbl.split(':')[0] }));
    g.appendChild(s('text', { class: 'nv-sub', x: 40, y: y + 33, text: (lbl.split(':')[1] || '').trim() }));
    let t = 0;
    for (const p of parts) {
      const x = gx + t * gw / 4 + 1.5, w = p * gw / 4 - 3;
      g.appendChild(s('rect', { class: 'nv-slot', x, y: y + 8, width: w, height: 24, rx: 5 }));
      const f = s('rect', { class: 'nv-fill' + (rest ? ' is-rest' : ''), x, y: y + 8, width: w, height: 24, rx: 5 });
      f.style.transformOrigin = `${x}px 0`;
      g.appendChild(f);
      fills.push({ el: f, t, p, row: ri, rest });
      t += p;
    }
  });
  const svg = s('svg', { class: 'vis-nv-svg', viewBox: `0 0 ${W} ${22 + rows.length * rowH}`, role: 'img', 'aria-label': rows.map((r) => r[2]).join('. ') }, g);
  const el = frame('note-values', svg, caption(v.rests ? 'A rest is silence that still counts its beats.' : 'Each bar holds four beats; longer notes fill more of them.'));
  const beatMs = 520;
  return {
    el,
    play() {
      tl.clear(); vo.stop();
      fills.forEach((f) => { f.el.classList.toggle('is-on', tl.rm); f.el.style.transitionDuration = tl.rm ? '0s' : `${f.p * beatMs}ms`; });
      if (tl.rm) return;
      let base = 300;
      rows.forEach((row, ri) => {
        for (let b = 0; b < 4; b++) tl.at(base + b * beatMs, () => vo.click(b === 0));
        fills.filter((f) => f.row === ri).forEach((f) => tl.at(base + f.t * beatMs, () => {
          f.el.classList.add('is-on');
          if (!f.rest) vo.play(67, f.p * beatMs - 40);
        }));
        base += 4 * beatMs + 500;
      });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function timeSig(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const [n, d] = v.time || [4, 4];
  const g = s('g');
  g.appendChild(s('text', { class: 'ts-num', x: 30, y: 40, 'text-anchor': 'middle', text: String(n) }));
  g.appendChild(s('text', { class: 'ts-num', x: 30, y: 84, 'text-anchor': 'middle', text: String(d) }));
  g.appendChild(s('text', { class: 'ts-lbl', x: 62, y: 32, text: `${n} beats in every bar` }));
  g.appendChild(s('text', { class: 'ts-lbl', x: 62, y: 76, text: 'a quarter note gets one beat' }));
  const dots = [];
  const pickup = !!v.pickup;
  const total = pickup ? 1 + n : n;
  const x0 = 70, dx = Math.min(38, 200 / total);
  for (let i = 0; i < total; i++) {
    const beat = pickup ? (i === 0 ? n : i) : i + 1;
    const x = x0 + i * dx + (pickup && i > 0 ? 14 : 0);
    const dg = s('g', { class: 'ts-beat' + (beat === 1 ? ' is-one' : '') + (pickup && i === 0 ? ' is-pickup' : '') },
      s('circle', { cx: x, cy: 112, r: 10 }), s('text', { x, y: 116, 'text-anchor': 'middle', text: String(beat) }));
    g.appendChild(dg); dots.push(dg);
  }
  if (pickup) {
    const bx = x0 + dx * 0.5 + 7;
    g.appendChild(s('line', { class: 'ts-bar', x1: bx, x2: bx, y1: 96, y2: 128 }));
    g.appendChild(s('text', { class: 'ts-sub', x: x0, y: 142, 'text-anchor': 'middle', text: 'pickup' }));
  }
  const svg = s('svg', { class: 'vis-ts-svg', viewBox: '0 0 300 150', role: 'img', 'aria-label': `${n}/${d}: ${n} beats in every bar${pickup ? '; the tune starts with a pickup on the last beat' : ''}` }, g);
  const el = frame('time-sig', svg, caption(pickup ? `In ${n}/${d}, count ${n} per bar. A pickup starts on the last beat, before the first bar line.` : `Count ${Array.from({ length: n }, (_, i) => i + 1).join(' ')} in every bar; bar lines are the fence posts.`));
  return {
    el,
    play() {
      tl.clear();
      dots.forEach((d0) => d0.classList.remove('is-on'));
      if (tl.rm) { dots.forEach((d0) => d0.classList.add('is-seen')); return; }
      for (let loop = 0; loop < 2; loop++) dots.forEach((d0, i) => {
        const t = 300 + (loop * dots.length + i) * 600;
        tl.at(t, () => { dots.forEach((x) => x.classList.remove('is-on')); d0.classList.add('is-on', 'is-seen'); vo.click(d0.classList.contains('is-one')); });
      });
      tl.at(300 + 2 * dots.length * 600, () => dots.forEach((x) => x.classList.remove('is-on')));
    },
    destroy() { tl.clear(); },
  };
}

function legato(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const rows = [['Gap', 'you can hear the silence', [[0, 0.7], [1, 1.7], [2, 2.7]]], ['Legato', 'release as the next key goes down', [[0, 1], [1, 2], [2, 3]]], ['Overlap', 'the notes blur together', [[0, 1.35], [1, 2.35], [2, 3]]]];
  const notes = [64, 65, 67];
  const g = s('g');
  const X = (t) => 96 + t * 62;
  const heads = [];
  rows.forEach(([lbl, sub, bars], ri) => {
    const y = 14 + ri * 46;
    g.appendChild(s('text', { class: 'lg-lbl' + (ri === 1 ? ' is-good' : ''), x: 0, y: y + 12, text: lbl }));
    g.appendChild(s('text', { class: 'lg-sub', x: 0, y: y + 25, text: sub }));
    bars.forEach(([a, b], k) => g.appendChild(s('rect', { class: 'lg-bar' + (ri === 1 ? ' is-good' : ''), x: X(a), y: y + 2 + k * 8 - 2, width: X(b) - X(a), height: 7, rx: 3.5 })));
    const ph = s('rect', { class: 'lg-head', x: X(0) - 1, y: y - 2, width: 2, height: 30, rx: 1 });
    ph.style.opacity = '0';
    g.appendChild(ph); heads.push(ph);
  });
  const svg = s('svg', { class: 'vis-lg-svg', viewBox: '0 0 290 150', role: 'img', 'aria-label': 'Gap, legato and overlap: on the organ, release each key exactly as the next goes down' }, g);
  const el = frame('legato', svg, caption('Organ tone never fades, so every gap is audible. Join the notes: no gap, no overlap.'));
  return {
    el,
    play() {
      tl.clear(); vo.stop();
      heads.forEach((p) => { p.style.opacity = '0'; });
      if (tl.rm) return;
      const beat = 480;
      rows.forEach(([, , bars], ri) => {
        const base = 300 + ri * (3.6 * beat + 400);
        tl.at(base, () => { const p = heads[ri]; p.style.opacity = '1'; p.style.transition = 'none'; p.setAttribute('x', X(0) - 1); void p.getBoundingClientRect(); p.style.transition = `x ${3 * beat}ms linear`; p.setAttribute('x', X(3) - 1); });
        bars.forEach(([a, b], k) => tl.at(base + a * beat, () => vo.play(notes[k], (b - a) * beat)));
        tl.at(base + 3.3 * beat, () => { heads[ri].style.opacity = '0'; });
      });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

// ------------------------------------------------------------------ intervals and chords
const SIZE_TEXT = { 2: 'step: line to space', 3: 'skip: line to line', 4: '4th: line to space', 5: '5th: line to line, one line between', 6: '6th: line to space', 8: 'octave: same letter' };
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const upWhite = (m, steps) => { const d = Math.floor(m / 12) * 7 + WHITE.indexOf(m % 12) + steps; return Math.floor(d / 7) * 12 + WHITE[((d % 7) + 7) % 7]; };

function intervalShapes(v, env) {
  const tl = timeline();
  const vo = voice(env);
  if (v.song) return songShapes(v, env);
  const sizes = v.sizes && v.sizes.length ? v.sizes : [2, 3];
  const harmonic = !!v.harmonic;
  const base = 64;
  const refs = [], groups = [];
  sizes.forEach((sz, i) => {
    const top = upWhite(base, sz - 1);
    refs.push(T(base), T(top));
    groups.push(harmonic ? i * 2 : i * 2, harmonic ? i * 2 : i * 2 + 1);
  });
  const svg = renderStaff(staffBody(refs, { groups }), { label: 'Interval shapes: ' + sizes.map((z) => SIZE_TEXT[z] || z + 'th').join('; ') });
  const el = frame('interval-shapes', h('div.vis-staff', svg), h('ul.vis-list', sizes.map((z) => h('li', SIZE_TEXT[z] || `${z}th`))), caption(harmonic ? 'Stacked notes sound together; read the shape, not two names.' : 'Read the distance between the notes as a shape.'));
  const all = () => svg.__noteEls || [];
  return {
    el,
    play() {
      tl.clear();
      all().forEach((n) => n && n.classList.toggle('is-lit', tl.rm));
      [...el.querySelectorAll('.vis-list li')].forEach((li) => li.classList.toggle('is-on', tl.rm));
      if (tl.rm) return;
      sizes.forEach((z, i) => {
        const t0 = 300 + i * 1500;
        tl.at(t0, () => { all()[i * 2] && all()[i * 2].classList.add('is-lit'); vo.play(refs[i * 2].midi, harmonic ? 900 : 450); if (harmonic) { all()[i * 2 + 1].classList.add('is-lit'); vo.play(refs[i * 2 + 1].midi, 900); } });
        if (!harmonic) tl.at(t0 + 500, () => { all()[i * 2 + 1] && all()[i * 2 + 1].classList.add('is-lit'); vo.play(refs[i * 2 + 1].midi, 600); });
        tl.at(t0 + 600, () => { const li = el.querySelectorAll('.vis-list li')[i]; li && li.classList.add('is-on'); });
      });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function songShapes(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const song = getSong(v.song);
  if (!song) return { el: h('div.vis'), play() {}, destroy() {} };
  const sc = renderScore(song, { bars: v.bars, hands: song.parts.rh ? 'rh' : 'lh', names: false, box: { w: envW(env) }, naming: env.naming, barsPerSystem: envW(env) < 600 ? 1 : 2 });
  const el = frame('interval-shapes', sc.el, caption('Name the first note, then follow the shape: same, step or skip.'));
  let decorated = false;
  const labels = [];
  function decorate() {
    if (decorated) return; decorated = true;
    const ms = sc.moments;
    for (let i = 1; i < ms.length; i++) {
      const a = sc.el.querySelectorAll('.sc-tok:not(.sc-rest):not(.sc-dim)')[i - 1], b = sc.el.querySelectorAll('.sc-tok:not(.sc-rest):not(.sc-dim)')[i];
      if (!a || !b || a.ownerSVGElement !== b.ownerSVGElement) continue;
      const ha = a.querySelector('.st-head').getBBox(), hb = b.querySelector('.st-head').getBBox();
      const st = (m) => cur.staffStep(m, ms[0].events[0].staff);
      const d = st(ms[i].midis[0]) - st(ms[i - 1].midis[0]);
      const txt = d === 0 ? 'same' : Math.abs(d) === 1 ? (d > 0 ? 'step ↑' : 'step ↓') : Math.abs(d) === 2 ? (d > 0 ? 'skip ↑' : 'skip ↓') : `${Math.abs(d) + 1}th ${d > 0 ? '↑' : '↓'}`;
      const root = a.ownerSVGElement.querySelector('.sc-sys');
      const t = s('text', { class: 'vis-shape-lbl', x: (ha.x + hb.x + hb.width) / 2, y: Math.min(ha.y, hb.y) - 14, 'text-anchor': 'middle', text: txt });
      root.appendChild(t);
      labels.push({ t, i });
    }
  }
  return {
    el,
    play() {
      tl.clear();
      decorate();
      labels.forEach((l) => l.t.classList.toggle('is-on', tl.rm));
      sc.moments.forEach((_, i) => sc.setState(i, ''));
      if (tl.rm) return;
      sc.moments.forEach((m, i) => tl.at(300 + i * 520, () => {
        sc.setState(i, 'is-target'); if (i > 0) sc.setState(i - 1, '');
        vo.play(m.midis[0], 460);
        labels.filter((l) => l.i === i).forEach((l) => l.t.classList.add('is-on'));
      }));
      tl.at(300 + sc.moments.length * 520, () => sc.setState(sc.moments.length - 1, ''));
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function triadRefs(id) {
  if (cur.ITEMS[id]) {
    try {
      const q = cur.realize(id, () => 0.5);
      return { refs: q.notes.map((n) => ({ midi: n.midi, staff: n.staff, accidental: n.accidental })), label: pretty((cur.ITEMS[id].hint && cur.ITEMS[id].hint.name) || cur.ITEMS[id].label || id), keySig: q.keySig || 0 };
    } catch { /* fall through */ }
  }
  const root = 60 + (LETTER_PC[String(id).charAt(0)] || 0);
  return { refs: [T(root), T(upWhite(root, 2)), T(upWhite(root, 4))], label: `${String(id).charAt(0)} chord`, keySig: 0 };
}

function chordStack(v, env) {
  const tl = timeline();
  const vo = voice(env);
  let cols = []; // [{ refs, label }]
  let cap = '';
  if (v.pairs) {
    cols = v.pairs.map((p) => ({ refs: p.slice(), label: p.map((r) => noteLabel(r)).join(' + ') }));
    cap = 'Notes in one column sound together: read the bass note first, then the treble.';
  } else if (v.triads) {
    cols = v.triads.map((t) => triadRefs(t));
    cap = 'Three chords harmonise most simple tunes.';
  } else if (v.triad) {
    cols = [triadRefs(v.triad)];
    const r = cols[0].refs;
    cap = cur.staffStep(r[0].midi, r[0].staff || 'treble') % 2 === 0 ? 'A snowman: line, line, line. Drop the hand as one unit.' : 'A snowman: space, space, space. Drop the hand as one unit.';
  } else if (v.satb) {
    const ids = Array.isArray(v.satb) ? v.satb : [v.satb];
    cols = ids.map((id) => triadRefs(id));
    cap = ids.length > 1 ? 'Away, then home: the Amen is IV then I.' : 'Soprano and alto in the right hand, tenor and bass in the left.';
  } else if (v.motion) {
    cols = [
      { refs: [T(48, 'bass'), T(64)], label: '' }, { refs: [T(50, 'bass'), T(65)], label: 'same' },
      { refs: [T(53, 'bass'), T(64)], label: '' }, { refs: [T(50, 'bass'), T(67)], label: 'opposite' },
      { refs: [T(48, 'bass'), T(64)], label: '' }, { refs: [T(48, 'bass'), T(69)], label: 'oblique' },
    ];
    cap = 'Hands move the same way, opposite ways, or one holds while the other moves.';
  }
  const refs = [], groups = [];
  cols.forEach((c, i) => c.refs.forEach((r) => { refs.push({ ...r, staff: r.staff || 'treble' }); groups.push(i); }));
  const body = staffBody(refs, { groups });
  if (cols[0] && cols[0].keySig) body.keySig = cols[0].keySig;
  const svg = renderStaff(body, { label: cap });
  const allMidis = refs.map((r) => r.midi);
  const rg = sliceRange(allMidis, { minWhites: 10, pad: 1 });
  const kb = keys(rg.lo, rg.hi, { labels: 'c' });
  const labelRow = h('div.cs-labels', cols.map((c) => h('span', c.label || '')));
  const el = frame('chord-stack', h('div.vis-staff', svg), labelRow, h('div.vis-kb.is-small', kb.svg), caption(cap));
  if (v.satb && !Array.isArray(v.satb)) {
    // label the four voices once laid out
    el.__satb = true;
  }
  let decorated = false;
  function decorate() {
    if (decorated || !el.__satb) return; decorated = true;
    const order = ['S', 'A', 'T', 'B'];
    const sorted = refs.map((r, i) => ({ r, i })).sort((a, b) => b.r.midi - a.r.midi);
    sorted.forEach(({ i }, k) => { const b = headBox(svg, i); if (b) staffText(svg, b.x + b.width + 12, b.y + b.height - 1, order[k] || '', 'vis-st-lbl is-on'); });
  }
  const colIdx = (i) => refs.map((_, k) => k).filter((k) => groups[k] === i);
  return {
    el,
    play() {
      tl.clear(); vo.stop();
      decorate();
      const notes = svg.__noteEls || [];
      notes.forEach((n) => n && n.classList.toggle('is-lit', tl.rm));
      [...labelRow.children].forEach((c) => c.classList.toggle('is-on', tl.rm));
      kb.clearLights();
      if (tl.rm) { allMidis.forEach((m) => kb.light(m)); return; }
      cols.forEach((c, i) => tl.at(300 + i * 1100, () => {
        kb.clearLights();
        notes.forEach((n) => n && n.classList.remove('is-now'));
        for (const k of colIdx(i)) { notes[k] && notes[k].classList.add('is-lit', 'is-now'); kb.light(refs[k].midi); vo.play(refs[k].midi, 950); }
        labelRow.children[i] && labelRow.children[i].classList.add('is-on');
      }));
      tl.at(300 + cols.length * 1100, () => { notes.forEach((n) => n && n.classList.remove('is-now')); });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

// ------------------------------------------------------------------ staves, keys and signs
function grandStaff(v, env) {
  const tl = timeline();
  const vo = voice(env);
  if (v.song) {
    const song = getSong(v.song);
    const sc = song ? renderScore(song, { bars: v.bars || [1, Math.min(4, Math.max(...Object.values(song.parts).map((p) => p.length)))], hands: 'both', names: false, box: { w: Math.min(envW(env), 560) }, naming: env.naming }) : null;
    const items = v.checklist ? ['Clefs: treble on top, bass below', `Key signature: ${song && song.key ? (song.key > 0 ? song.key + ' sharp' : -song.key + ' flat') : 'none'}`, `Time signature: ${song ? song.time.join('/') : ''}`, 'First note of each hand', 'Highest and lowest note'] : null;
    const list = items ? h('ol.vis-check', items.map((t) => h('li', t))) : null;
    const el = frame('grand-staff', sc ? sc.el : null, list, caption(v.checklist ? 'Before you play: run down this list, every time.' : 'Learn a hymn one hand at a time, then put the hands together.'));
    return {
      el,
      play() {
        tl.clear();
        if (list) [...list.children].forEach((li) => li.classList.toggle('is-on', tl.rm));
        if (tl.rm || !list) return;
        [...list.children].forEach((li, i) => tl.at(300 + i * 700, () => li.classList.add('is-on')));
      },
      destroy() { tl.clear(); },
    };
  }
  const refs = [T(60, 'treble'), T(67, 'treble'), T(53, 'bass'), T(60, 'bass')];
  const body = staffBody(refs);
  const svg = renderStaff(body, { label: 'Grand staff: treble staff for the right hand, bass staff for the left hand, joined by a brace' });
  const el = frame('grand-staff', h('div.gs-wrap', h('div.gs-hands', h('span.gs-rh', 'Right hand'), h('span.gs-lh', 'Left hand')), h('div.vis-staff', svg)), caption('Treble staff: right hand. Bass staff: left hand. The brace joins them into one keyboard.'));
  return {
    el,
    play() {
      tl.clear();
      const notes = svg.__noteEls || [];
      el.classList.toggle('is-rh', tl.rm); el.classList.toggle('is-lh', tl.rm);
      notes.forEach((n) => n && n.classList.toggle('is-lit', tl.rm));
      if (tl.rm) return;
      tl.at(300, () => { el.classList.add('is-rh'); notes[0].classList.add('is-lit'); notes[1].classList.add('is-lit'); vo.play(60, 400); tl.at(450, () => vo.play(67, 400)); });
      tl.at(1600, () => { el.classList.add('is-lh'); notes[2].classList.add('is-lit'); notes[3].classList.add('is-lit'); vo.play(53, 400); tl.at(450, () => vo.play(60, 400)); });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function accidental(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const note = v.note || T(65);
  const sign = v.sign || '#';
  let bars, captionText, keysToLight, natural, altered;
  if (sign === 'n') {
    altered = note.midi + 1; natural = note.midi;
    bars = [[[altered, 'h', '#'], [natural, 'h']]];
    captionText = 'A natural sign cancels the sharp or flat: back to the white key.';
    keysToLight = [altered, natural];
  } else {
    natural = note.midi; altered = note.midi + (sign === '#' ? 1 : -1);
    if (v.carry) {
      bars = [[[altered, 'q', sign], [altered, 'q', sign], [natural + 2, 'h']], [[natural, 'w']]];
      captionText = 'An accidental lasts until the bar line; the next bar is back to normal.';
    } else {
      bars = [[[natural, 'h'], [altered, 'h', sign]]];
      captionText = sign === '#' ? 'A sharp: the very next key to the right, usually black.' : 'A flat: the very next key to the left, usually black.';
    }
    keysToLight = [natural, altered];
  }
  const song = miniSong({ rh: bars });
  const sc = renderScore(song, { hands: 'rh', names: true, box: { w: Math.min(envW(env), 420) }, naming: env.naming });
  const rg = sliceRange(keysToLight, { minWhites: 8, pad: 2 });
  const kb = keys(rg.lo, rg.hi, { labels: 'c' });
  const a = kb.center(natural), b = kb.center(altered);
  const dir = b.x > a.x ? 1 : -1;
  const ay = WH + 9;
  const arrow = s('path', { class: 'acc-arrow', d: `M${a.x} ${ay}H${b.x - dir * 3}` });
  const tip = s('path', { class: 'acc-tip', d: `M${b.x} ${ay}l${-dir * 6} -3.6v7.2Z` });
  const what = s('text', { class: 'acc-txt', x: (a.x + b.x) / 2, y: ay + 13, 'text-anchor': 'middle', text: sign === 'n' ? 'back to the white key' : sign === '#' ? 'one key right' : 'one key left' });
  kb.g.append(arrow, tip, what);
  kb.svg.setAttribute('viewBox', `-1 -1 ${kb.W + 2} ${WH + 26}`);
  const el = frame('accidental', sc.el, h('div.vis-kb.is-small', kb.svg), caption(captionText));
  return {
    el,
    play() {
      tl.clear(); kb.clearLights();
      sc.moments.forEach((_, i) => sc.setState(i, ''));
      el.classList.toggle('is-on', tl.rm);
      if (tl.rm) { keysToLight.forEach((m) => kb.light(m)); return; }
      sc.moments.forEach((m, i) => tl.at(300 + i * 800, () => {
        sc.moments.forEach((_, k) => sc.setState(k, k === i ? 'is-target' : ''));
        kb.clearLights(); kb.light(m.midis[0]); vo.play(m.midis[0], 600);
      }));
      tl.at(300 + sc.moments.length * 800, () => { sc.moments.forEach((_, k) => sc.setState(k, '')); keysToLight.forEach((m) => kb.light(m)); el.classList.add('is-on'); });
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

function keySignature(v, env) {
  const tl = timeline();
  const vo = voice(env);
  const key = v.key || 1;
  const sharp = key > 0;
  const pcAlt = sharp ? 6 : 10; // F sharp / B flat
  const tr = sharp ? [[66, 'h', '#'], [78, 'h', '#']] : [[70, 'h', 'b'], [82, 'h', 'b']];
  const bs = sharp ? [[54, 'h', '#'], [42, 'h', '#']] : [[58, 'h', 'b'], [46, 'h', 'b']];
  const song = miniSong({ rh: [tr], lh: [bs], key });
  const sc = renderScore(song, { hands: 'both', names: true, box: { w: Math.min(envW(env), 420) }, naming: env.naming });
  const kb = keys(41, 84, { labels: 'c' });
  const lights = []; for (let m = 41; m <= 84; m++) if (m % 12 === pcAlt) lights.push(m);
  const el = frame('key-signature', sc.el, h('div.vis-kb.is-small', kb.svg), caption(sharp ? 'One sharp at the start of every line: every F is F sharp, in every octave.' : 'One flat at the start of every line: every B is B flat, in every octave.'));
  return {
    el,
    play() {
      tl.clear(); kb.clearLights();
      if (tl.rm) { lights.forEach((m) => kb.light(m)); return; }
      lights.forEach((m, i) => tl.at(300 + i * 380, () => { kb.light(m); vo.play(m, 340); }));
    },
    destroy() { tl.clear(); vo.stop(); },
  };
}

const VISUALS = {
  'kb-groups': kbGroups,
  'kb-names': kbNames,
  'staff-key-link': staffKeyLink,
  clef,
  'line-space': lineSpace,
  'step-skip': stepSkip,
  'interval-shapes': intervalShapes,
  landmarks,
  mnemonic,
  'finger-numbers': fingerNumbers,
  'hand-position': handPosition,
  'note-values': noteValues,
  'time-sig': timeSig,
  'grand-staff': grandStaff,
  accidental,
  'key-signature': keySignature,
  ledger,
  'chord-stack': chordStack,
  legato,
};
export const VISUAL_KINDS = Object.keys(VISUALS);
void clear; void yOf;
function envW(env) {
  const w = typeof env.width === 'function' ? env.width() : env.width;
  return Number.isFinite(w) && w > 0 ? Math.min(w, 560) : 340;
}
