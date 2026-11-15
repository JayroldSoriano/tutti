// Inline-SVG notation renderer.
// renderStaff(body, opts) -> SVGSVGElement
//   body: PromptBody (PLAN 4.1) — kind, clef, keySig, notes[], answer
//   opts: {
//     box: { w, h }        target pixel box; staff lines stretch to fill the width
//     maxSpace: px          largest staff-space size (default 18)
//     minSpace: px          smallest staff-space size before horizontal overflow (default 0)
//     states: string[]      per-note classes, e.g. 'is-target' | 'is-correct' | 'is-wrong' | 'is-ghost' | 'is-given'
//     ghosts: [{ midi, staff, col? }]  extra hollow ghost heads (e.g. the key that was played)
//     heat: [{ midi, staff, mastery, n, accidental? }]  heat-map mode (grand staff, whole notes)
//     fixed: bool           fixed vertical extent per clef so the staff never jumps (default true)
//     label: string         aria-label
//     dur: 'w'|'h'|'q'      default duration when notes carry none
//   }
// Helpers: setNoteState(svg, i, cls), svg.__beatX(beat) for rhythm prompts.
import { s } from './h.js';
import { clefs, brace, ellipse, ACC, ACC_W, FLAG_UP, FLAG_DOWN } from './glyphs.js';
import { stepOf, shownAccidental, isBlackKey } from './music.js';

const SP = 10;               // staff space in units
const HEAD_RX = 6.2, HEAD_RY = 4.3, HEAD_ROT = -20;
const STEM_W = 1.25, STEM_LEN = 35;
const LEDGER_EXT = 4.2;
const GRAND_BASS_Y0 = 100;
const STATE_CLASSES = ['is-target', 'is-correct', 'is-wrong', 'is-ghost', 'is-given', 'is-dim'];

const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];

function staffY0(clef, staff) {
  if (clef === 'grand') return staff === 'bass' ? GRAND_BASS_Y0 : 0;
  return 0;
}
export const yOf = (y0, step) => y0 + 40 - 5 * step;

export function headPath(cx, cy, dur) {
  if (dur === 'w') return ellipse(cx, cy, 7.4, 4.8, 0) + ellipse(cx, cy, 3.9, 2.6, -58);
  if (dur === 'h') return ellipse(cx, cy, HEAD_RX, HEAD_RY, HEAD_ROT) + ellipse(cx, cy, 4.9, 2.05, -34);
  return ellipse(cx, cy, HEAD_RX, HEAD_RY, HEAD_ROT);
}
export const headHalfW = (dur) => (dur === 'w' ? 7.4 : 6.2);

export function staffLines(g, y0, x1, x2) {
  for (let i = 0; i < 5; i++) g.appendChild(s('line', { class: 'st-line', x1, x2, y1: y0 + i * SP, y2: y0 + i * SP }));
}

export function drawKeySig(g, keySig, staff, y0, x) {
  const n = Math.min(7, Math.abs(keySig || 0));
  if (!n) return x;
  const sharp = keySig > 0;
  const steps = sharp ? SHARP_STEPS : FLAT_STEPS;
  for (let i = 0; i < n; i++) {
    const st = steps[i] - (staff === 'bass' ? 2 : 0);
    const ax = x + 5 + i * (sharp ? 9 : 8);
    g.appendChild(s('path', { class: 'st-glyph', d: ACC[sharp ? '#' : 'b'], transform: `translate(${ax} ${yOf(y0, st)})` }));
  }
  return x + 6 + n * (sharp ? 9 : 8);
}

/** Group notes into columns (sounded together) in reading order. */
function columnsOf(body) {
  const notes = body.notes || [];
  const cols = [];
  const byKey = new Map();
  notes.forEach((n, i) => {
    let key;
    if (body.kind === 'rhythm' && n.beat != null) key = 'b' + n.beat;
    else if (n.group != null) key = 'g' + n.group;
    else if (n.beat != null) key = 'b' + n.beat;
    else if (body.kind === 'note' || body.kind === 'dyad' || body.kind === 'chord' || body.kind === 'hands') key = 'all';
    else key = 'i' + i;
    let c = byKey.get(key);
    if (!c) { c = { key, notes: [], beat: n.beat, order: cols.length }; byKey.set(key, c); cols.push(c); }
    c.notes.push({ ...n, i });
  });
  if (body.kind === 'rhythm') cols.sort((a, b) => (a.beat || 0) - (b.beat || 0));
  return cols;
}

export function layoutCluster(notes, dur, stemDirForced) {
  // notes: [{ step, ... }] on one staff, one column
  const sorted = notes.slice().sort((a, b) => a.step - b.step);
  const lo = sorted[0].step, hi = sorted[sorted.length - 1].step;
  let dir = stemDirForced || ((hi - 4) > (4 - lo) ? 'down' : (hi - 4) < (4 - lo) ? 'up' : (lo >= 4 ? 'down' : 'up'));
  if (sorted.length === 1) dir = stemDirForced || (lo >= 4 ? 'down' : 'up');
  // seconds: offset heads to the other side of the stem
  const hw = headHalfW(dur) * 2 - 1.2;
  if (dir === 'up') {
    let prevShift = false;
    for (let k = 0; k < sorted.length; k++) {
      const n = sorted[k];
      n.dx = 0;
      if (k > 0 && n.step - sorted[k - 1].step === 1 && !prevShift) { n.dx = hw; prevShift = true; } else prevShift = false;
    }
  } else {
    let prevShift = false;
    for (let k = sorted.length - 1; k >= 0; k--) {
      const n = sorted[k];
      n.dx = 0;
      if (k < sorted.length - 1 && sorted[k + 1].step - n.step === 1 && !prevShift) { n.dx = -hw; prevShift = true; } else prevShift = false;
    }
  }
  // accidental columns (top to bottom)
  const accs = sorted.filter((n) => n.acc).reverse();
  const placed = [];
  for (const n of accs) {
    let col = 0;
    while (placed.some((p) => p.col === col && Math.abs(p.step - n.step) < 6)) col++;
    n.accCol = col; placed.push({ col, step: n.step });
  }
  const accCols = placed.length ? Math.max(...placed.map((p) => p.col)) + 1 : 0;
  const minDx = Math.min(0, ...sorted.map((n) => n.dx));
  const maxDx = Math.max(0, ...sorted.map((n) => n.dx));
  return { sorted, dir, lo, hi, accCols, minDx, maxDx };
}

export function renderStaff(body, opts = {}) {
  body = body || { kind: 'note', clef: 'treble', notes: [] };
  const heat = opts.heat;
  const clef = heat ? 'grand' : (body.clef || 'treble');
  const kind = heat ? 'heat' : body.kind;
  const rhythm = clef === 'none' || kind === 'rhythm';
  const keySig = body.keySig || 0;
  const states = opts.states || [];
  const C = clefs();

  const root = s('g', { class: 'st-root' });
  const notesG = s('g', { class: 'st-notes' });
  const noteEls = [];
  const fg = s('g', { class: 'st-fg' });

  // ---- vertical extent
  let top, bottom;
  if (rhythm) { top = -52; bottom = 34; }
  else if (clef === 'grand') { top = -32; bottom = GRAND_BASS_Y0 + 72; }
  else { top = -32; bottom = 72; }

  // ---- header: brace, clefs, key signature, time signature
  const staves = rhythm ? [] : clef === 'grand' ? ['treble', 'bass'] : [clef === 'bass' ? 'bass' : 'treble'];
  let x = 0;
  const header = s('g', { class: 'st-header' });
  if (clef === 'grand') {
    header.appendChild(s('path', { class: 'st-glyph st-brace', d: brace(0, GRAND_BASS_Y0 + 40, -13.5) }));
    header.appendChild(s('line', { class: 'st-sysline', x1: 0, x2: 0, y1: 0, y2: GRAND_BASS_Y0 + 40 }));
  }
  if (rhythm) {
    header.appendChild(s('rect', { class: 'st-glyph', x: 7, y: -10, width: 3.2, height: 20 }));
    header.appendChild(s('rect', { class: 'st-glyph', x: 13, y: -10, width: 3.2, height: 20 }));
    x = 22;
  } else {
    for (const st of staves) {
      const y0 = staffY0(clef, st);
      header.appendChild(s('path', { class: 'st-glyph st-clef', d: st === 'bass' ? C.bass : C.treble, transform: `translate(5 ${y0})` }));
    }
    x = 36;
    let kx = x;
    for (const st of staves) kx = Math.max(kx, drawKeySig(header, keySig, st, staffY0(clef, st), x));
    x = kx;
  }
  let beats = 4;
  if (rhythm) {
    beats = (body.answer && body.answer.beats) || 4;
    header.appendChild(s('text', { class: 'st-time', x: x + 9, y: -3, 'text-anchor': 'middle', text: String(beats) }));
    header.appendChild(s('text', { class: 'st-time', x: x + 9, y: 21, 'text-anchor': 'middle', text: '4' }));
    x += 22;
  }
  const notesStart = x + 8;

  // ---- prepare columns
  let cols;
  if (heat) {
    cols = [];
    const sorted = heat.slice().sort((a, b) => (a.staff === b.staff ? a.midi - b.midi : a.staff === 'treble' ? -1 : 1));
    // one row per staff, independent x positions
    for (const st of ['treble', 'bass']) {
      const row = sorted.filter((h) => h.staff === st);
      row.forEach((h, k) => cols.push({ heatStaff: st, k, notes: [{ ...h, i: -1, dur: 'w', accidental: h.accidental || heatAcc(h) }] }));
    }
  } else cols = columnsOf(body);

  const defaultDur = opts.dur || (kind === 'chord' && clef === 'grand' ? 'h' : 'q');
  for (const c of cols) {
    c.dur = c.notes[0].dur || (rhythm ? 'q' : heat ? 'w' : defaultDur);
    c.clusters = [];
    const perStaff = {};
    for (const n of c.notes) {
      const st = rhythm ? 'rh' : (n.staff || (staves.length === 1 ? staves[0] : n.midi < 60 ? 'bass' : 'treble'));
      (perStaff[st] = perStaff[st] || []).push(n);
    }
    for (const st in perStaff) {
      const y0 = rhythm ? 0 : staffY0(clef, st);
      const ns = perStaff[st].map((n) => {
        const step = rhythm ? 4 : stepOf(n.midi, st, n.accidental, keySig);
        const acc = rhythm ? null : (heat ? (n.accidental && isBlackKey(n.midi) ? n.accidental : null) : shownAccidental(n.midi, n.accidental, keySig));
        return { ...n, st, step, acc, y: rhythm ? 0 : yOf(y0, step) };
      });
      // SATB: two voices per staff in a grand-staff chord -> split stems
      if (kind === 'chord' && clef === 'grand' && ns.length === 2 && c.dur !== 'w') {
        const [a, b] = ns.slice().sort((p, q) => q.step - p.step); // a = upper voice
        const up = layoutCluster([a], c.dur, 'up');
        const dn = layoutCluster([b], c.dur, 'down');
        if (a.step - b.step <= 1) { // unison/second between voices: shift lower voice right
          b.dx = a.step === b.step ? 0 : headHalfW(c.dur) * 2 - 1.2;
        }
        const acc = layoutCluster(ns.map((n) => ({ ...n })), c.dur, 'up');
        c.clusters.push({ st, y0, parts: [up, dn], accCols: acc.accCols, accSrc: acc });
      } else {
        const lc = layoutCluster(ns, c.dur, rhythm ? 'up' : null);
        c.clusters.push({ st, y0, parts: [lc], accCols: lc.accCols, accSrc: lc });
      }
    }
    c.accCols = Math.max(0, ...c.clusters.map((k) => k.accCols));
    c.minDx = Math.min(0, ...c.clusters.flatMap((k) => k.parts.map((p) => p.minDx)));
    c.maxDx = Math.max(0, ...c.clusters.flatMap((k) => k.parts.map((p) => p.maxDx)));
  }

  // ---- horizontal layout
  const H = bottom - top;
  const box = opts.box || null;
  const maxSpace = opts.maxSpace || 18;
  const minSpace = opts.minSpace || 0;
  const n = cols.length;
  const accW = 10;
  // natural column width
  let colBase = rhythm ? 0 : heat ? 19 : n <= 1 ? 40 : n <= 3 ? 36 : n <= 5 ? 32 : 28;
  if (kind === 'chord' || kind === 'hands' || kind === 'dyad') colBase = Math.max(colBase, 40);
  const colW = cols.map((c) => (heat ? colBase + (c.notes[0].accidental ? 9 : 0) : colBase + c.accCols * accW + (c.maxDx - c.minDx)));
  let contentW;
  if (heat) {
    const rowW = (st) => cols.filter((c) => c.heatStaff === st).reduce((a, _c, i) => a + colW[cols.indexOf(_c)], 0);
    contentW = notesStart + Math.max(rowW('treble'), rowW('bass')) + 10;
  } else if (rhythm) contentW = notesStart + beats * 34 + 14;
  else contentW = notesStart + colW.reduce((a, b) => a + b, 0) + 16;

  let scale = maxSpace / SP;
  let W = contentW;
  if (box && box.w > 0) {
    const hs = box.h > 0 ? box.h / H : Infinity;
    scale = Math.min(maxSpace / SP, hs, box.w / contentW);
    if (minSpace && scale * SP < minSpace) scale = Math.min(minSpace / SP, hs);
    W = Math.max(contentW, box.w / scale);
  }

  // left padding for brace
  const left = clef === 'grand' ? -18 : -4;
  const right = W + left;
  // distribute columns across the available note area
  const area = right - 14 - notesStart;
  const natural = colW.reduce((a, b) => a + b, 0);
  const xs = [];
  if (heat) {
    for (const st of ['treble', 'bass']) {
      const row = cols.filter((c) => c.heatStaff === st);
      const rowNat = row.reduce((a, c) => a + colW[cols.indexOf(c)], 0);
      let cx = notesStart + Math.max(0, (area - rowNat) / 2);
      for (const c of row) { const w = colW[cols.indexOf(c)]; xs[cols.indexOf(c)] = cx + w - 8; cx += w; }
    }
  } else if (!rhythm) {
    const extra = Math.max(0, area - natural);
    const grow = n <= 1 ? 0 : Math.min(extra / n, 30);
    const used = natural + grow * n;
    let cx = notesStart + Math.max(0, (area - used) / 2);
    cols.forEach((c, i) => {
      const w = colW[i] + grow;
      // head centre sits after its accidentals / left-shifted seconds
      xs[i] = cx + c.accCols * accW + (-c.minDx) + (w - colW[i]) / 2 + 10;
      cx += w;
    });
  }
  const beatW = rhythm ? (right - 12 - notesStart - 6) / beats : 0;
  const beatX = (b) => notesStart + 8 + b * beatW;
  if (rhythm) cols.forEach((c, i) => { xs[i] = beatX(c.beat || 0); });

  // ---- staff lines
  const linesG = s('g', { class: 'st-lines' });
  if (rhythm) linesG.appendChild(s('line', { class: 'st-line', x1: 0, x2: right - 2, y1: 0, y2: 0 }));
  else for (const st of staves) staffLines(linesG, staffY0(clef, st), 0, right - 2);
  // end barline(s)
  if (rhythm) {
    linesG.appendChild(s('line', { class: 'st-bar', x1: right - 7, x2: right - 7, y1: -10, y2: 10 }));
    linesG.appendChild(s('rect', { class: 'st-glyph', x: right - 4.6, y: -10, width: 2.8, height: 20 }));
  } else {
    const yt = staffY0(clef, staves[0]), yb = staffY0(clef, staves[staves.length - 1]) + 40;
    linesG.appendChild(s('line', { class: 'st-bar', x1: right - 2.5, x2: right - 2.5, y1: yt, y2: yb }));
  }

  // ---- rhythm beat grid
  if (rhythm) {
    const grid = s('g', { class: 'st-grid' });
    for (let b = 0; b < beats; b++) {
      grid.appendChild(s('line', { class: 'st-tick', x1: beatX(b), x2: beatX(b), y1: 14, y2: 19 }));
      grid.appendChild(s('text', { class: 'st-count', x: beatX(b), y: 30, 'text-anchor': 'middle', text: String(b + 1) }));
      if (b < beats) grid.appendChild(s('line', { class: 'st-tick st-tick-half', x1: beatX(b + 0.5), x2: beatX(b + 0.5), y1: 15.5, y2: 17.5 }));
    }
    root.appendChild(grid);
  }

  // ---- notes
  const stemTips = []; // for beams: { col, x, y }
  cols.forEach((c, ci) => {
    const cx0 = xs[ci];
    const colG = s('g', { class: 'st-col' });
    for (const cl of c.clusters) {
      const allNotes = cl.parts.flatMap((p) => p.sorted);
      // ledger lines (for the whole cluster)
      if (!rhythm) {
        const lo = Math.min(...allNotes.map((q) => q.step)), hi = Math.max(...allNotes.map((q) => q.step));
        const hw = headHalfW(c.dur);
        const lx1 = cx0 + c.minDx - hw - LEDGER_EXT, lx2 = cx0 + c.maxDx + hw + LEDGER_EXT;
        for (let st = -2; st >= lo; st -= 2) colG.appendChild(s('line', { class: 'st-ledger', x1: lx1, x2: lx2, y1: yOf(cl.y0, st), y2: yOf(cl.y0, st) }));
        for (let st = 10; st <= hi; st += 2) colG.appendChild(s('line', { class: 'st-ledger', x1: lx1, x2: lx2, y1: yOf(cl.y0, st), y2: yOf(cl.y0, st) }));
      }
      // accidentals
      for (const q of cl.accSrc.sorted) {
        if (!q.acc) continue;
        const ax = cx0 + c.minDx - headHalfW(c.dur) - 3 - ACC_W[q.acc] / 2 - (q.accCol || 0) * accW;
        q.accEl = s('path', { class: 'st-glyph st-acc', d: ACC[q.acc], transform: `translate(${ax.toFixed(2)} ${q.y})` });
      }
      for (const part of cl.parts) {
        const single = part.sorted.length === 1 && cl.parts.length === 1;
        let stemEl = null;
        if (c.dur !== 'w') {
          const hiY = Math.min(...part.sorted.map((q) => q.y)), loY = Math.max(...part.sorted.map((q) => q.y));
          const midY = rhythm ? 0 : cl.y0 + 20;
          const off = HEAD_RX - STEM_W / 2 - 0.35;
          if (part.dir === 'up') {
            const sx = cx0 + off;
            const tip = rhythm ? -STEM_LEN : Math.min(hiY - STEM_LEN, midY);
            stemEl = s('rect', { class: 'st-stem', x: sx - STEM_W / 2, y: tip, width: STEM_W, height: loY - 1 - tip });
            stemTips.push({ ci, x: sx + STEM_W / 2, y: tip, dir: 'up', dur: c.dur, beat: c.beat, g: colG, part });
          } else {
            const sx = cx0 - off;
            const tip = Math.max(loY + STEM_LEN, midY);
            stemEl = s('rect', { class: 'st-stem', x: sx - STEM_W / 2, y: hiY + 1, width: STEM_W, height: tip - hiY - 1 });
            stemTips.push({ ci, x: sx - STEM_W / 2, y: tip, dir: 'down', dur: c.dur, beat: c.beat, g: colG, part });
          }
        }
        const groupCls = single ? null : s('g', { class: 'st-chord' });
        for (const q of part.sorted) {
          const ng = s('g', { class: 'st-note', 'data-i': q.i });
          if (q.accEl) ng.appendChild(q.accEl);
          const hx = cx0 + (q.dx || 0);
          if (heat) {
            const m = Math.max(0, Math.min(1, q.mastery || 0));
            const unseen = !q.n;
            ng.setAttribute('class', 'st-note st-heat ' + (unseen ? 'heat-none' : 'heat-' + Math.min(4, Math.floor(m * 5))));
            ng.appendChild(s('path', { class: 'st-head', d: ellipse(hx, q.y, 6.6, 4.6, HEAD_ROT) }));
            if (!unseen) ng.appendChild(s('ellipse', { class: 'st-ring', cx: hx, cy: q.y, rx: 8.6, ry: 6.4, transform: `rotate(${HEAD_ROT} ${hx} ${q.y})`, 'stroke-width': (0.6 + 2.2 * m).toFixed(2) }));
            const t = s('title'); t.textContent = `${q.label || ''}`.trim(); if (t.textContent) ng.appendChild(t);
          } else {
            ng.appendChild(s('path', { class: 'st-head', d: headPath(hx, q.y, c.dur), 'fill-rule': 'evenodd' }));
          }
          if (single && stemEl) ng.appendChild(stemEl);
          const stc = states[q.i];
          if (stc) for (const k of String(stc).split(/\s+/)) if (k) ng.classList.add(k);
          if (q.i >= 0) noteEls[q.i] = ng;
          (groupCls || colG).appendChild(ng);
        }
        if (groupCls) { if (stemEl) groupCls.insertBefore(stemEl, groupCls.firstChild); colG.appendChild(groupCls); }
      }
    }
    notesG.appendChild(colG);
  });

  // ---- flags and beams (eighths)
  const eighths = stemTips.filter((t) => t.dur === '8');
  const used = new Set();
  if (rhythm) {
    for (const a of eighths) {
      if (used.has(a)) continue;
      const b = eighths.find((e) => !used.has(e) && e !== a && e.beat === a.beat + 0.5 && Math.floor(a.beat) === a.beat);
      if (b) {
        used.add(a); used.add(b);
        const y = Math.min(a.y, b.y);
        fg.appendChild(s('path', { class: 'st-beam', d: `M${a.x - STEM_W} ${y}L${b.x} ${y}L${b.x} ${y + 5}L${a.x - STEM_W} ${y + 5}Z` }));
      }
    }
  }
  for (const t of eighths) {
    if (used.has(t)) continue;
    const d = t.dir === 'up' ? FLAG_UP : FLAG_DOWN;
    const fx = t.dir === 'up' ? t.x - 0.2 : t.x + 0.2;
    const flag = s('path', { class: 'st-flag', d, transform: `translate(${fx} ${t.y})` });
    if (t.part.sorted.length === 1) {
      const el = noteEls[t.part.sorted[0].i]; if (el) el.appendChild(flag); else fg.appendChild(flag);
    } else fg.appendChild(flag);
  }

  // ---- ghost heads (e.g. the wrong key that was played)
  if (opts.ghosts && opts.ghosts.length && !rhythm) {
    for (const gh of opts.ghosts) {
      const ci = Math.max(0, Math.min(cols.length - 1, gh.col == null ? 0 : gh.col));
      const st = gh.staff || (staves.length === 1 ? staves[0] : gh.midi < 60 ? 'bass' : 'treble');
      const y0 = staffY0(clef, st);
      const step = stepOf(gh.midi, st, gh.accidental, keySig);
      const y = yOf(y0, step);
      const cx = (xs[ci] || notesStart + 20) + (cols[ci] ? cols[ci].maxDx : 0) + 15;
      const gg = s('g', { class: 'st-note st-ghost is-ghost' });
      const hw = 6.2;
      for (let k = -2; k >= step; k -= 2) gg.appendChild(s('line', { class: 'st-ledger', x1: cx - hw - 3, x2: cx + hw + 3, y1: yOf(y0, k), y2: yOf(y0, k) }));
      for (let k = 10; k <= step; k += 2) gg.appendChild(s('line', { class: 'st-ledger', x1: cx - hw - 3, x2: cx + hw + 3, y1: yOf(y0, k), y2: yOf(y0, k) }));
      const acc = shownAccidental(gh.midi, gh.accidental, keySig);
      if (acc) gg.appendChild(s('path', { class: 'st-acc', d: ACC[acc], transform: `translate(${cx - hw - 3 - ACC_W[acc] / 2} ${y})` }));
      gg.appendChild(s('path', { class: 'st-head', d: ellipse(cx, y, HEAD_RX, HEAD_RY, HEAD_ROT) }));
      fg.appendChild(gg);
    }
  }

  root.appendChild(linesG);
  root.appendChild(header);
  root.appendChild(notesG);
  root.appendChild(fg);

  let playhead = null;
  if (rhythm) {
    playhead = s('rect', { class: 'st-playhead', x: -1, y: -46, width: 2, height: 64, rx: 1 });
    playhead.style.opacity = '0';
    root.appendChild(playhead);
  }

  const vbX = left, vbW = W;
  const svg = s('svg', {
    class: 'staff staff-' + clef + (heat ? ' staff-heat' : '') + (rhythm ? ' staff-rhythm' : ''),
    viewBox: `${vbX.toFixed(2)} ${top} ${vbW.toFixed(2)} ${H}`,
    role: 'img', 'aria-label': opts.label || 'Music notation',
    preserveAspectRatio: 'xMidYMid meet',
  }, root);
  if (box && box.w > 0) {
    svg.setAttribute('width', String(Math.round(vbW * scale)));
    svg.setAttribute('height', String(Math.round(H * scale)));
  }
  svg.__noteEls = noteEls;
  svg.__beatX = beatX;
  svg.__playhead = playhead;
  svg.__scale = scale;
  return svg;
}

function heatAcc(h) {
  const p = ((h.midi % 12) + 12) % 12;
  if (p === 1 || p === 6) return '#';
  if (p === 3 || p === 10) return 'b';
  if (p === 8) return h.staff === 'bass' ? 'b' : '#';
  return undefined;
}

export function setNoteState(svg, i, cls) {
  const el = svg && svg.__noteEls && svg.__noteEls[i];
  if (!el) return;
  for (const c of STATE_CLASSES) el.classList.remove(c);
  if (cls) for (const k of String(cls).split(/\s+/)) if (k) el.classList.add(k);
}

export function setAllNoteStates(svg, cls) {
  if (!svg || !svg.__noteEls) return;
  svg.__noteEls.forEach((_, i) => setNoteState(svg, i, cls));
}
