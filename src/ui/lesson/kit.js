// Shared drawing kit for lesson visuals and steps: an SVG keyboard slice, the staff-to-key link
// (the centrepiece: a line from each notehead down to its key, lighting together with the sound),
// small staff helpers and a cancellable timeline.
import { h, s, clear, reducedMotion } from '../h.js';
import { renderStaff } from '../staff.js';
import { renderScore } from '../score.js';
import { isBlackKey, name as nameOf, pretty } from '../music.js';

export const WK = 22, WH = 88, BK = 13.4, BH = 55;
const BLACK_SHIFT = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };
const WB = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
const wb = (m) => Math.floor(m / 12) * 7 + WB[((m % 12) + 12) % 12];

/** Cancellable timers + a reduced-motion flag. */
export function timeline() {
  const ids = new Set();
  return {
    rm: reducedMotion(),
    at(ms, fn) { const id = setTimeout(() => { ids.delete(id); fn(); }, ms); ids.add(id); return id; },
    clear() { for (const id of ids) clearTimeout(id); ids.clear(); },
  };
}

/** Sound helper that respects the sound setting. */
export function voice(env) {
  const audio = env && (env.audio || (env.ctx && env.ctx.audio));
  const settings = (env && env.settings) || {};
  const on = () => audio && settings.sound !== false;
  const held = new Set();
  return {
    play(midi, ms = 600) {
      if (!on()) return;
      const ms2 = Math.max(80, ms);
      try { audio.noteOn(midi); held.add(midi); } catch { /* ignore */ }
      setTimeout(() => { try { audio.noteOff(midi); held.delete(midi); } catch { /* ignore */ } }, ms2);
    },
    click(accent) { if (on()) try { audio.click(accent); } catch { /* ignore */ } },
    stop() { for (const m of held) try { audio.noteOff(m); } catch { /* ignore */ } held.clear(); },
  };
}

export const noteLabel = (ref, naming = 'letters', octave = false) => pretty(nameOf(ref.midi, naming, { octave, accidental: ref.accidental }));

/** Range of white keys around a set of midis: at least `minWhites`, starting near a C when possible. */
export function sliceRange(midis, { pad = 2, minWhites = 10 } = {}) {
  let lo = Math.min(...midis), hi = Math.max(...midis);
  const down = (m) => { m--; while (isBlackKey(m)) m--; return m; };
  const up = (m) => { m++; while (isBlackKey(m)) m++; return m; };
  if (isBlackKey(lo)) lo = down(lo);
  if (isBlackKey(hi)) hi = up(hi);
  for (let i = 0; i < pad; i++) { lo = down(lo); hi = up(hi); }
  let n = wb(hi) - wb(lo) + 1;
  let flip = 0;
  while (n < minWhites) { if (flip++ % 2) lo = down(lo); else hi = up(hi); n++; }
  return { lo, hi };
}

/**
 * SVG keyboard slice. keys(lo, hi, { labels: 'c'|'none'|'all', cls }) ->
 *   { svg, g, W, H, el(midi), center(midi) -> { x, y }, light(midi, cls, on), clearLights(), label(midi, text) }
 */
export function keys(lo, hi, opts = {}) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const W = whites.length * WK, H = WH;
  const g = s('g', { class: 'vk' });
  const els = new Map();
  const lbls = new Map();
  const x0 = (m) => (wb(m) - wb(lo)) * WK;
  for (const m of whites) {
    const r = s('rect', { class: 'vk-w' + (m % 12 === 0 ? ' vk-c' : ''), x: x0(m) + 0.5, y: 0, width: WK - 1, height: WH, rx: 3, 'data-midi': m });
    g.appendChild(r); els.set(m, r);
  }
  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) continue;
    const x = x0(m) - BK / 2 + (BLACK_SHIFT[m % 12] || 0) * BK;
    const r = s('rect', { class: 'vk-b', x, y: 0, width: BK, height: BH, rx: 2, 'data-midi': m });
    els.set(m, r);
  }
  // black keys on top
  for (const [m, r] of els) if (isBlackKey(m)) g.appendChild(r);
  const lblG = s('g', { class: 'vk-lbls' });
  g.appendChild(lblG);
  const center = (m) => {
    if (isBlackKey(m)) return { x: x0(m) + (BLACK_SHIFT[m % 12] || 0) * BK, y: BH * 0.62, top: 0 };
    return { x: x0(m) + WK / 2, y: WH * 0.8, top: BH + 4 };
  };
  const label = (m, text, cls = '') => {
    let t = lbls.get(m);
    if (!t) { t = s('text', { class: 'vk-lbl ' + (isBlackKey(m) ? 'on-b ' : '') + cls, 'text-anchor': 'middle' }); lblG.appendChild(t); lbls.set(m, t); }
    const c = center(m);
    t.setAttribute('x', c.x.toFixed(2));
    t.setAttribute('y', (isBlackKey(m) ? BH - 7 : WH - 9).toFixed(2));
    t.textContent = text;
    return t;
  };
  if (opts.labels === 'c' || !opts.labels) for (const m of whites) if (m % 12 === 0) label(m, 'C' + (Math.floor(m / 12) - 1), 'is-quiet');
  if (opts.labels === 'all') for (const m of whites) label(m, nameOf(m, 'letters', { octave: false }), 'is-quiet');
  const svg = s('svg', { class: 'vk-svg ' + (opts.cls || ''), viewBox: `-1 -1 ${W + 2} ${H + 2}`, role: 'img', 'aria-label': opts.label || 'Keyboard' }, g);
  return {
    svg, g, W, H, lo, hi,
    el: (m) => els.get(m),
    center, label,
    x0,
    light(m, cls = 'is-lit', on = true) { const e = els.get(m); if (e) e.classList.toggle(cls, on); },
    clearLights(cls = 'is-lit') { for (const e of els.values()) e.classList.remove(cls); },
    unlabel(m) { const t = lbls.get(m); if (t) { t.remove(); lbls.delete(m); } },
  };
}

/** Draw curved link lines from element rects (staff noteheads) to keys, inside `host` (position: relative). */
export function linkLayer(host) {
  const svg = s('svg', { class: 'link-layer', 'aria-hidden': 'true' });
  host.appendChild(svg);
  const lines = [];
  function geom(fromEl, toEl, toPoint) {
    const hr = host.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    let bx, by;
    if (toPoint) ({ x: bx, y: by } = toPoint());
    else { const b = toEl.getBoundingClientRect(); const black = toEl.classList && (toEl.classList.contains('vk-b') || toEl.classList.contains('key-b')); bx = b.left + b.width / 2; by = b.top + b.height * (black ? 0.5 : 0.74); }
    return { x1: a.left + a.width / 2 - hr.left, y1: a.bottom - hr.top + 2, x2: bx - hr.left, y2: by - hr.top };
  }
  function pathOf(g) {
    const dy = Math.max(20, g.y2 - g.y1);
    return `M${g.x1.toFixed(1)} ${g.y1.toFixed(1)}C${g.x1.toFixed(1)} ${(g.y1 + dy * 0.55).toFixed(1)} ${g.x2.toFixed(1)} ${(g.y2 - dy * 0.5).toFixed(1)} ${g.x2.toFixed(1)} ${g.y2.toFixed(1)}`;
  }
  return {
    svg,
    add(fromEl, toEl, { animate = true, cls = '', toPoint } = {}) {
      const p = s('path', { class: 'link ' + cls });
      const d1 = s('circle', { class: 'link-dot ' + cls, r: 3.2 });
      const d2 = s('circle', { class: 'link-dot ' + cls, r: 3.2 });
      svg.append(p, d1, d2);
      const rec = { p, d1, d2, fromEl, toEl, toPoint };
      lines.push(rec);
      place(rec);
      if (animate && !reducedMotion()) {
        let len = 200;
        try { len = p.getTotalLength(); } catch { /* ignore */ }
        p.style.strokeDasharray = `${len} ${len}`;
        p.style.strokeDashoffset = String(len);
        d2.style.opacity = '0';
        void p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset .5s cubic-bezier(.3,.6,.2,1)';
        p.style.strokeDashoffset = '0';
        setTimeout(() => { d2.style.transition = 'opacity .2s'; d2.style.opacity = '1'; p.style.strokeDasharray = ''; }, 480);
      }
      return rec;
    },
    relayout() { for (const r of lines) place(r); },
    clear() { for (const r of lines) { r.p.remove(); r.d1.remove(); r.d2.remove(); } lines.length = 0; },
    remove() { svg.remove(); },
  };
  function place(r) {
    if (!r.fromEl.isConnected || (r.toEl && !r.toEl.isConnected)) return;
    const g = geom(r.fromEl, r.toEl, r.toPoint);
    r.p.setAttribute('d', pathOf(g));
    r.d1.setAttribute('cx', g.x1.toFixed(1)); r.d1.setAttribute('cy', g.y1.toFixed(1));
    r.d2.setAttribute('cx', g.x2.toFixed(1)); r.d2.setAttribute('cy', g.y2.toFixed(1));
  }
}

/** Staff body for a list of NoteRefs, one per column (or grouped when `group` given). */
export function staffBody(refs, { dur = 'w', groups } = {}) {
  const staves = new Set(refs.map((r) => r.staff || 'treble'));
  const clef = staves.size > 1 ? 'grand' : [...staves][0];
  const notes = refs.map((r, i) => ({ midi: r.midi, staff: r.staff || 'treble', accidental: r.accidental, dur, beat: i, group: groups ? groups[i] : i }));
  return { kind: 'phrase', clef, notes, answer: { type: 'sequence', midis: [], given: 0 } };
}

export function headEl(svg, i) {
  const n = svg && svg.__noteEls && svg.__noteEls[i];
  return n ? (n.querySelector('.st-head') || n) : null;
}

/** BBox of note i in the staff's own units (for drawing labels into the staff svg). */
export function headBox(svg, i) {
  const el = headEl(svg, i);
  try { return el ? el.getBBox() : null; } catch { return null; }
}

/** Append a text label inside a staff svg at staff units. */
export function staffText(svg, x, y, text, cls = 'vis-st-lbl') {
  const root = svg.firstChild;
  const t = s('text', { class: cls, x, y, 'text-anchor': 'middle', text });
  root.appendChild(t);
  return t;
}

/** Fake song for score-based visuals: parts as arrays of bars of [midi|null, dur, acc?]. */
export function miniSong({ rh, lh, key = 0, time = null, title = 'Example' }) {
  const BEATS = { w: 4, 'h.': 3, h: 2, 'q.': 1.5, q: 1, 8: 0.5 };
  const conv = (bars) => bars.map((bar) => bar.map(([m, dur, acc]) => ({
    midis: m == null ? [] : Array.isArray(m) ? m : [m], accidentals: m == null ? [] : (Array.isArray(m) ? m.map(() => acc || null) : [acc || null]), dur, beats: BEATS[dur],
  })));
  const parts = {};
  if (rh) parts.rh = conv(rh);
  if (lh) parts.lh = conv(lh);
  return { id: 'mini', title, credit: '', original: true, time, key, bpm: 80, pickup: 0, parts };
}

/**
 * The staff-key link: a staff above a keyboard slice, a line drawn from each notehead to its key,
 * key and notehead lighting together with the sound.
 * createStaffKeyLink({ notes: NoteRef[], env, names = true, tags?: string[], naming, compact, extraKeys })
 *   -> { el, play(), light(i), lightAll(), staff, kb, destroy() }
 */
export function createStaffKeyLink({ notes, env, names = true, tags, naming = 'letters', compact = false, groups, label } = {}) {
  const refs = (notes || []).filter((n) => n && Number.isFinite(n.midi));
  const tl = timeline();
  const v = voice(env);
  const body = staffBody(refs, { groups });
  const staff = renderStaff(body, { label: label || 'Notes on the staff' });
  staff.classList.add('skl-staff');
  const range = sliceRange(refs.map((r) => r.midi), { minWhites: compact ? 8 : 10 });
  const kb = keys(range.lo, range.hi, { labels: 'c', label: 'Keyboard: ' + refs.map((r) => noteLabel(r, naming)).join(', ') });
  const tagEls = [];
  const el = h('figure.skl' + (compact ? '.is-compact' : ''), h('div.skl-staff-wrap', staff), h('div.skl-kb', kb.svg));
  let tagged = false;
  function placeTags() {
    if (tagged || !tags) return; tagged = true;
    refs.forEach((r, i) => {
      const b = headBox(staff, i); if (!b) return;
      const t = staffText(staff, b.x + b.width / 2, Math.min(b.y - 6, -6), tags[i] || '', 'vis-st-lbl skl-tag');
      tagEls[i] = t;
    });
  }
  let layer = null;
  let ro = null;
  const shown = new Set();
  function ensureLayer() {
    if (layer) return;
    layer = linkLayer(el);
    try { ro = new ResizeObserver(() => layer && layer.relayout()); ro.observe(el); } catch { /* ignore */ }
  }
  function light(i, { sound = true, animate = true } = {}) {
    const r = refs[i]; if (!r) return;
    ensureLayer();
    const head = headEl(staff, i);
    const note = staff.__noteEls[i];
    if (note) note.classList.add('is-lit');
    kb.light(r.midi, 'is-lit', true);
    if (names) kb.label(r.midi, noteLabel(r, naming), 'is-name');
    placeTags();
    if (tagEls[i]) tagEls[i].classList.add('is-on');
    if (head && !shown.has(i)) { shown.add(i); layer.add(head, kb.el(r.midi), { animate }); }
    if (sound) v.play(r.midi, 650);
  }
  function reset() {
    tl.clear(); v.stop();
    if (layer) layer.clear();
    shown.clear();
    for (const n of staff.__noteEls || []) n && n.classList.remove('is-lit');
    kb.clearLights();
    for (const r of refs) kb.unlabel(r.midi);
    for (const t of tagEls) t && t.classList.remove('is-on');
  }
  return {
    el, staff, kb, refs,
    light,
    lightAll({ sound = false } = {}) { refs.forEach((_, i) => light(i, { sound, animate: false })); },
    play({ gap = 900, loops = 1, onStep, onDone } = {}) {
      reset();
      if (tl.rm) { refs.forEach((_, i) => light(i, { sound: false, animate: false })); if (refs[0]) v.play(refs[0].midi, 500); onDone && onDone(); return; }
      let k = 0;
      for (let L = 0; L < loops; L++) {
        refs.forEach((_, i) => {
          tl.at(250 + k * gap, () => {
            if (L > 0) { kb.clearLights(); for (const n of staff.__noteEls) n && n.classList.remove('is-lit'); }
            light(i); onStep && onStep(i, L);
          });
          k++;
        });
      }
      tl.at(250 + k * gap, () => { refs.forEach((_, i) => light(i, { sound: false, animate: false })); onDone && onDone(); });
    },
    relayout() { if (layer) layer.relayout(); },
    reset,
    destroy() { reset(); try { ro && ro.disconnect(); } catch { /* ignore */ } },
  };
}

export { renderScore, renderStaff, clear };
