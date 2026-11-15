// Helpers shared by the lesson step components.
import { h, s, clear } from '../h.js';
import { renderStaff, setNoteState } from '../staff.js';
import { pc, name as nameOf, pretty } from '../music.js';
import * as cur from '../../curriculum.js';
import { linkLayer, staffBody, headEl } from './kit.js';

/** Step frame: title, one-line purpose, a body that grows, and a footer for prompts/buttons. */
export function shell(step, { cls = '', body, foot } = {}) {
  const head = h('header.st-head',
    h('h2.st-title', step.title || ''),
    step.purpose ? h('p.st-why', step.purpose) : null);
  const bodyEl = h('div.st-body', body || null);
  const footEl = h('div.st-foot', foot || null);
  const el = h('section.step' + (cls ? '.' + cls : ''), { 'data-type': step.type }, head, bodyEl, footEl);
  return { el, body: bodyEl, foot: footEl, head };
}

export function primaryBtn(label, onclick, extra = {}) {
  return h('button.btn.btn-primary.btn-block', { type: 'button', onclick, ...extra }, label);
}
export function quietBtn(label, onclick, extra = {}) {
  return h('button.btn.btn-block', { type: 'button', onclick, ...extra }, label);
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const sameFn = (settings) => {
  const pcMode = settings.inputMode === 'names' || settings.inputMode === 'mic' || settings.octaveStrict === false;
  return (a, b) => (pcMode ? pc(a) === pc(b) : a === b);
};

export const refName = (ref, naming = 'letters', octave = false) => pretty(nameOf(ref.midi, naming, { octave, accidental: ref.accidental }));

/** Resolve a guided/progression Target to { refs, midis, label }. */
export function resolveTarget(t, naming = 'letters') {
  if (!t) return null;
  if (Number.isFinite(t.midi)) return { refs: [{ midi: t.midi, staff: t.staff || 'treble', accidental: t.accidental }], midis: [t.midi], label: refName(t, naming) };
  if (Array.isArray(t.notes)) {
    const refs = t.notes.map((n) => ({ midi: n.midi, staff: n.staff || 'treble', accidental: n.accidental }));
    return { refs, midis: refs.map((r) => r.midi), label: refs.slice().sort((a, b) => a.midi - b.midi).map((r) => refName(r, naming)).join(' + ') };
  }
  if (t.itemId && cur.ITEMS[t.itemId]) {
    try {
      const q = cur.realize(t.itemId, () => 0.5);
      const refs = q.notes.map((n) => ({ midi: n.midi, staff: n.staff, accidental: n.accidental }));
      const it = cur.ITEMS[t.itemId];
      const label = it.kind === 'hands'
        ? refs.slice().sort((a, b) => a.midi - b.midi).map((r) => refName(r, naming)).join(' + ')
        : pretty((it.hint && it.hint.name) || it.label || t.itemId);
      return { refs, midis: (q.answer && q.answer.midis) || refs.map((r) => r.midi), label, keySig: q.keySig || 0 };
    } catch { return null; }
  }
  return null;
}

/** A staff showing one or more chords (columns). Returns { svg, setCol(i, cls), noteIdx(i) }. */
export function chordStaff(cols, { label, keySig = 0, maxH } = {}) {
  const refs = [], groups = [];
  cols.forEach((c, i) => c.refs.forEach((r) => { refs.push(r); groups.push(i); }));
  const body = staffBody(refs, { groups });
  body.keySig = keySig;
  const svg = renderStaff(body, { label: label || 'Notes to play' });
  svg.classList.add('st-svg');
  if (maxH) svg.style.maxHeight = maxH + 'px';
  const idx = (i) => groups.map((g, k) => (g === i ? k : -1)).filter((k) => k >= 0);
  return {
    svg, refs,
    noteIdx: idx,
    setCol(i, cls) { for (const k of idx(i)) setNoteState(svg, k, cls); },
    setNote(k, cls) { setNoteState(svg, k, cls); },
    head: (k) => headEl(svg, k),
  };
}

/** Link lines from staff noteheads to the shared keyboard's keys, drawn over the lesson root. */
export function kbLinks(env) {
  const root = env.root;
  let layer = null;
  let timer = null;
  return {
    show(pairs) {
      this.clear();
      if (!root) return;
      layer = layer || linkLayer(root);
      const add = () => {
        if (!layer) return;
        layer.clear();
        for (const { head, midi } of pairs) {
          const key = env.kb.el.querySelector(`.key[data-midi="${midi}"]`);
          if (head && key) layer.add(head, key, { animate: true, cls: 'is-kb' });
        }
      };
      // the keyboard slides into place first
      timer = setTimeout(add, 340);
    },
    relayout() { if (layer) layer.relayout(); },
    clear() { clearTimeout(timer); if (layer) layer.clear(); },
    destroy() { clearTimeout(timer); if (layer) { layer.remove(); layer = null; } },
  };
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('is-shake'); void el.offsetWidth; el.classList.add('is-shake');
  setTimeout(() => el.classList.remove('is-shake'), 420);
}

/** Show a keyboard range wide enough for all midis (zooming out when needed). Returns a restore fn. */
export function fitKeyboard(env, midis, outer) {
  const kb = env.kb;
  if (!kb || !midis.length) return () => {};
  const lo = Math.min(...midis), hi = Math.max(...midis);
  const whites = (a, b) => { let n = 0; for (let m = a; m <= b; m++) if (![1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12)) n++; return n; };
  const need = whites(lo, hi) + 2;
  const prev = kb.octaves;
  const want = Math.max(prev, Math.min(3, Math.ceil(need / 7)));
  if (want !== prev) kb.setOctaves(want);
  kb.showRange(lo, hi, outer);
  return () => { if (kb.octaves !== prev) { kb.setOctaves(prev); } };
}

export function bigName(text, cls = '') {
  return h('p.big-name' + (cls ? '.' + cls : ''), { 'aria-live': 'polite' }, text);
}

export function counter(n, total) {
  return h('span.st-count.num', `${Math.min(n, total)} of ${total}`);
}

export { h, s, clear, renderStaff, setNoteState, pretty, nameOf, cur };
