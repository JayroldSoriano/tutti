// On-screen organ manual: multi-touch keys, zoom 1..3 octaves, minimap scroller, key labels.
// createKeyboard({ onDown(midi, t), onUp(midi, t), labels, octaves }) -> api
import { h, clamp, nowMs } from './h.js';
import { keyLabel, isBlackKey } from './music.js';

const BLACK_SHIFT = { 1: -0.12, 3: 0.12, 6: -0.14, 8: 0, 10: 0.14 };

export function createKeyboard({ onDown, onUp, labels = 'c-only', octaves = 2, lo = 36, hi = 84 } = {}) {
  let fullLo = lo, fullHi = hi;      // inclusive midi range drawn (always starts on C, ends on C)
  let oct = clamp(octaves, 1, 3);
  let offsetWhite = 0;              // index of first visible white key (fractional ok)
  let labelMode = labels;
  let width = 0;
  const keyEls = new Map();          // midi -> element
  const pointers = new Map();        // pointerId -> midi
  const marks = new Map();           // midi -> timeout
  let disabled = false;

  const track = h('div.kb-track');
  const viewport = h('div.kb-viewport', track);
  const win = h('div.kb-mini-win');
  const mini = h('div.kb-mini', { role: 'scrollbar', 'aria-label': 'Keyboard position', 'aria-orientation': 'horizontal', tabindex: '0' }, h('div.kb-mini-keys'), win);
  const zoomOut = h('button.kb-zoom', { type: 'button', 'aria-label': 'Show more keys', title: 'Show more keys', onclick: () => setOctaves(oct + 1) }, '−');
  const zoomIn = h('button.kb-zoom', { type: 'button', 'aria-label': 'Show fewer, larger keys', title: 'Larger keys', onclick: () => setOctaves(oct - 1) }, '+');
  const bar = h('div.kb-bar', zoomOut, mini, zoomIn);
  const el = h('div.kb', { 'data-labels': labelMode }, bar, viewport);

  const whites = () => { const a = []; for (let m = fullLo; m <= fullHi; m++) if (!isBlackKey(m)) a.push(m); return a; };
  const WB = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
  const wb = (m) => Math.floor(m / 12) * 7 + WB[((m % 12) + 12) % 12]; // whites below m
  const whiteIndex = (m) => wb(m) - wb(fullLo);
  const visibleWhites = () => oct * 7 + 1;

  function build() {
    track.textContent = '';
    keyEls.clear();
    const ws = whites();
    track.style.setProperty('--nw', ws.length);
    for (let m = fullLo; m <= fullHi; m++) {
      const black = isBlackKey(m);
      const name = keyLabel(m);
      const k = h('button.key' + (black ? '.key-b' : '.key-w') + (m % 12 === 0 ? '.key-c' : ''), {
        type: 'button', tabindex: '-1', 'aria-label': name, 'data-midi': m,
      });
      if (!black) {
        k.style.setProperty('--i', whiteIndex(m));
        k.appendChild(h('span.key-lbl', { 'aria-hidden': 'true' }, m % 12 === 0 ? name : name.replace(/\d+$/, '')));
      } else {
        k.style.setProperty('--i', whiteIndex(m));
        k.style.setProperty('--shift', BLACK_SHIFT[m % 12] || 0);
      }
      keyEls.set(m, k);
      track.appendChild(k);
    }
    // minimap keys: CSS gradient sized to the number of whites
    mini.firstChild.style.setProperty('--nw', ws.length);
    layout();
  }

  function layout() {
    width = viewport.clientWidth || el.clientWidth || 360;
    const wk = width / visibleWhites();
    track.style.setProperty('--wk', wk + 'px');
    const max = Math.max(0, whites().length - visibleWhites());
    offsetWhite = clamp(offsetWhite, 0, max);
    track.style.transform = `translate3d(${(-offsetWhite * wk).toFixed(2)}px,0,0)`;
    const total = whites().length;
    const fl = offsetWhite / total, fw = Math.min(1, visibleWhites() / total);
    win.style.left = `calc(6px + (100% - 12px) * ${fl.toFixed(4)})`;
    win.style.width = `calc((100% - 12px) * ${fw.toFixed(4)})`;
    zoomOut.disabled = oct >= 3; zoomIn.disabled = oct <= 1;
    mini.setAttribute('aria-valuenow', String(Math.round(offsetWhite)));
  }

  function setOctaves(n) {
    const center = offsetWhite + visibleWhites() / 2;
    oct = clamp(n, 1, 3);
    offsetWhite = center - visibleWhites() / 2;
    el.dataset.oct = oct;
    layout();
    api.onZoom && api.onZoom(oct);
  }

  function ensureRange(lo2, hi2) {
    const nlo = Math.min(36, Math.floor(lo2 / 12) * 12), nhi = Math.max(84, Math.ceil(hi2 / 12) * 12);
    if (nlo !== fullLo || nhi !== fullHi) { fullLo = nlo; fullHi = nhi; build(); }
  }

  /** Centre the visible window on [lo, hi]. */
  function showRange(lo2, hi2, outer) {
    if (lo2 == null || !isFinite(lo2)) return;
    ensureRange(Math.min(lo2, outer ? outer.lo : lo2), Math.max(hi2, outer ? outer.hi : hi2));
    const a = whiteIndex(lo2), b = whiteIndex(hi2);
    const span = b - a + 1;
    const vis = visibleWhites();
    // snap to starting on a C when the range fits, for a familiar layout
    let start = (a + b) / 2 - vis / 2 + 0.5;
    if (span <= vis) {
      // prefer a window that starts on a C (familiar layout) and still shows every key with a margin
      let best = null;
      for (let cm = Math.floor(lo2 / 12) * 12 - 24; cm <= lo2; cm += 12) {
        const ci = whiteIndex(cm);
        if (ci <= a && ci + vis - 1 >= b) {
          const margin = Math.min(a - ci, ci + vis - 1 - b);
          if (!best || margin > best.margin) best = { ci, margin };
        }
      }
      if (best && best.margin >= 1) start = best.ci;
    }
    offsetWhite = Math.round(start);
    layout();
  }

  // ---- pointer handling (multi-touch)
  function keyFromEvent(e) {
    const t = e.target && e.target.closest ? e.target.closest('.key') : null;
    return t ? +t.dataset.midi : null;
  }
  track.addEventListener('pointerdown', (e) => {
    if (disabled) return;
    const m = keyFromEvent(e);
    if (m == null) return;
    e.preventDefault();
    try { e.target.closest('.key').setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, m);
    press(m, true);
    onDown && onDown(m, nowMs(), e);
  });
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const m = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (![...pointers.values()].includes(m)) press(m, false);
    onUp && onUp(m, nowMs(), e);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  track.addEventListener('lostpointercapture', release);
  track.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- minimap scroll + pinch
  const miniPts = new Map();
  let pinch0 = null;
  function miniJump(clientX) {
    const r = mini.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 1);
    offsetWhite = Math.round(f * whites().length - visibleWhites() / 2);
    layout();
  }
  mini.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    miniPts.set(e.pointerId, e.clientX);
    try { mini.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (miniPts.size === 2) { const [a, b] = [...miniPts.values()]; pinch0 = { d: Math.abs(a - b), oct }; }
    else miniJump(e.clientX);
  });
  mini.addEventListener('pointermove', (e) => {
    if (!miniPts.has(e.pointerId)) return;
    miniPts.set(e.pointerId, e.clientX);
    if (miniPts.size >= 2 && pinch0) {
      const [a, b] = [...miniPts.values()];
      const ratio = Math.abs(a - b) / Math.max(10, pinch0.d);
      const n = clamp(Math.round(pinch0.oct / ratio), 1, 3);
      if (n !== oct) setOctaves(n);
    } else if (miniPts.size === 1) miniJump(e.clientX);
  });
  const miniUp = (e) => { miniPts.delete(e.pointerId); if (miniPts.size < 2) pinch0 = null; };
  mini.addEventListener('pointerup', miniUp);
  mini.addEventListener('pointercancel', miniUp);
  mini.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { offsetWhite -= 7; layout(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { offsetWhite += 7; layout(); e.preventDefault(); }
  });

  let ro = null;
  try { ro = new ResizeObserver(() => layout()); ro.observe(viewport); } catch { window.addEventListener('resize', layout); }

  function press(m, on) {
    const k = keyEls.get(m);
    if (k) k.classList.toggle('is-down', !!on);
  }

  /** Transient or sticky mark: 'is-ok' | 'is-bad' | 'is-hint' | 'is-given'. ms=0 -> sticky. */
  function mark(m, cls, ms = 600) {
    const k = keyEls.get(m);
    if (!k) return;
    k.classList.remove(cls); void k.offsetWidth; // restart animation
    k.classList.add(cls);
    const key = m + cls;
    if (marks.has(key)) clearTimeout(marks.get(key));
    if (ms > 0) marks.set(key, setTimeout(() => { k.classList.remove(cls); marks.delete(key); }, ms));
  }
  function clearMarks() {
    for (const t of marks.values()) clearTimeout(t);
    marks.clear();
    for (const k of keyEls.values()) k.classList.remove('is-ok', 'is-bad', 'is-hint', 'is-given', 'is-down');
  }
  function releaseAll() {
    for (const [, m] of pointers) { press(m, false); onUp && onUp(m, nowMs()); }
    pointers.clear();
  }

  const api = {
    el, showRange, mark, clearMarks, releaseAll, setOctaves, press,
    get octaves() { return oct; },
    setLabels(mode) { labelMode = mode; el.dataset.labels = mode; },
    setDisabled(v) { disabled = !!v; el.classList.toggle('is-disabled', disabled); if (disabled) releaseAll(); },
    layout,
    destroy() { try { ro && ro.disconnect(); } catch { /* ignore */ } releaseAll(); clearMarks(); },
    onZoom: null,
  };
  el.dataset.oct = oct;
  build();
  return api;
}

/** Note-name pad for inputMode 'names' (pitch-class answers). */
export function createNamePad({ onPick, naming = 'letters' } = {}) {
  const L = naming === 'solfege' ? ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const whitesPc = [0, 2, 4, 5, 7, 9, 11];
  const blacks = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]; // pc, after white index
  const btns = new Map();
  const mk = (pc, label, cls) => {
    const b = h('button.name-btn' + cls, { type: 'button', 'aria-label': label, 'data-pc': pc }, label);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onPick && onPick(60 + pc, nowMs()); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick && onPick(60 + pc, nowMs()); } });
    btns.set(60 + pc, b);
    return b;
  };
  const top = h('div.names-top');
  for (const [pc, after] of blacks) {
    const sharp = L[after] + '♯', flat = L[(after + 1) % 7] + '♭';
    const lbl = pc === 3 || pc === 10 ? flat : sharp;
    const b = mk(pc, lbl, '.name-acc');
    b.style.setProperty('--col', after);
    top.appendChild(b);
  }
  const row = h('div.names-row', whitesPc.map((pc, i) => mk(pc, L[i], '')));
  const el = h('div.names', top, row);
  return {
    el,
    mark(midi, cls, ms = 600) {
      const b = btns.get(60 + (((midi % 12) + 12) % 12));
      if (!b) return;
      b.classList.remove(cls); void b.offsetWidth; b.classList.add(cls);
      if (ms > 0) setTimeout(() => b.classList.remove(cls), ms);
    },
    clearMarks() { for (const b of btns.values()) b.classList.remove('is-ok', 'is-bad', 'is-hint', 'is-given'); },
    showRange() {}, releaseAll() {}, setLabels() {}, setDisabled(v) { el.classList.toggle('is-disabled', !!v); }, layout() {}, destroy() {}, press() {},
  };
}
