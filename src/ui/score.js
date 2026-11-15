// Multi-system melody renderer (PLAN-LESSONS 4.6).
// renderScore(song, opts) -> ScoreHandle
//   opts: { hands: 'rh'|'lh'|'both', bars?: [from, to], names, fingers, pos?: { rh?, lh? },
//           box: { w, h }, naming, maxSpace?: px per staff space, label? }
//   ScoreHandle: { el, moments, events, setState(i, cls), setCursor(i), setPlayhead(beats|null),
//                  reveal(i), destroy() }
// Draws clef(s), key signature, time signature, barlines, dotted notes, beamed eighth pairs,
// whole/half/quarter rests, one-hand chords, ledger lines, note names above and finger numbers
// below each staff. Wraps into systems (2 bars at 390 px, 4 at >= 880 px) stacked in a vertical
// scroller that keeps the current system (and, near its end, the next one) in view.
import { h, s, clamp, reducedMotion } from './h.js';
import { clefs, brace, ACC, ACC_W, FLAG_UP, FLAG_DOWN } from './glyphs.js';
import { headPath, headHalfW, layoutCluster, drawKeySig, yOf, staffLines } from './staff.js';
import { spell, stepOf, keySigAlter, name as nameOf, pretty } from './music.js';
import { songBars, songEvents } from '../songs.js';
import { momentsOf } from '../songplay.js';

const STEM_W = 1.25, STEM_LEN = 35, LEDGER_EXT = 4.2;
const NAME_ROW = 15, FINGER_ROW = 14;
const STATE = ['is-target', 'is-correct', 'is-wrong'];
const EPS = 1e-6;
const tkey = (hand, t) => hand + '@' + (Math.round(t * 1000) / 1000);

// rest glyphs (centre-line relative; y0 = staff top line)
const QUARTER_REST = 'M-1.6 -12.4L3.6 -5.6C1.6 -3.6 0.9 -1.6 3.4 2.4L2.8 3.0C0.6 1.6 -2.6 2.6 -0.6 6.6L-1.2 7.0C-4.6 4.0 -3.6 0.2 0.4 0.6L-3.2 -4.0C-0.6 -6.4 -0.6 -9.2 -2.4 -11.6Z';
const EIGHTH_REST = 'M-3.4 -5.2A2.2 2.2 0 1 1 0.6 -4.4C1.6 -4.2 2.8 -5.0 3.6 -6.6L4.4 -6.4L-0.4 7.6L-1.6 7.6L2.4 -3.4C0.8 -2.4 -2.8 -2.2 -3.4 -5.2Z';

function headKind(dur) { return dur === 'w' ? 'w' : dur === 'h' || dur === 'h.' ? 'h' : 'q'; }
const isDotted = (dur) => dur === 'h.' || dur === 'q.';
const dia = (midi, acc, key) => { const sp = spell(midi, acc || undefined, key); return sp.octave * 7 + sp.letter; };

/** Finger number (1-5) for a note given the hand position, or null. */
export function fingerFor(midi, acc, key, hand, pos) {
  if (hand === 'rh') {
    const thumb = pos && Number.isFinite(pos.rh) ? pos.rh : 60;
    const f = dia(midi, acc, key) - dia(thumb, null, key) + 1;
    return f >= 1 && f <= 5 ? f : null;
  }
  const pinky = pos && Number.isFinite(pos.lh) ? pos.lh : 48;
  const f = 5 - (dia(midi, acc, key) - dia(pinky, null, key));
  return f >= 1 && f <= 5 ? f : null;
}

/** Build the column/bar model of a (sliced) song. Pure apart from music helpers. */
function buildModel(song, opts) {
  const key = song.key || 0;
  const parts = song.parts || {};
  const hands = ['rh', 'lh'].filter((hd) => parts[hd] && parts[hd].length);
  const staffOf = (hd) => (hd === 'rh' ? 'treble' : 'bass');
  const nBars = Math.max(0, ...hands.map((hd) => parts[hd].length));
  const barLen = song.time ? song.time[0] * (4 / song.time[1]) : 4;
  const playHands = opts.hands === 'both' || !opts.hands ? hands : hands.filter((hd) => hd === opts.hands);
  const bars = [];
  let t0 = 0;
  for (let b = 0; b < nBars; b++) {
    const cols = new Map();
    let len = 0;
    for (const hd of hands) {
      const bar = parts[hd][b] || [];
      const st = staffOf(hd);
      let t = 0;
      const alters = new Map(); // diatonic -> alteration in force in this bar (per staff)
      bar.forEach((tok, k) => {
        const rest = !tok.midis || !tok.midis.length;
        const notes = rest ? [] : tok.midis.map((m, j) => {
          const a = tok.accidentals ? tok.accidentals[j] : null;
          const sp = spell(m, a || undefined, key);
          const d = sp.octave * 7 + sp.letter;
          const cur = alters.has(d) ? alters.get(d) : keySigAlter(sp.letter, key);
          const show = sp.alter !== cur ? (sp.alter === 0 ? 'n' : sp.alter > 0 ? '#' : 'b') : null;
          alters.set(d, sp.alter);
          return { midi: m, accidental: a, step: stepOf(m, st, a || undefined, key), acc: show, i: j };
        });
        const ck = Math.round(t * 1000) / 1000;
        let col = cols.get(ck);
        if (!col) { col = { tl: t, toks: {} }; cols.set(ck, col); }
        col.toks[hd] = { hand: hd, staff: st, tok, rest, notes, dur: tok.dur, beats: tok.beats, tl: t, idx: k, bar: b };
        t += tok.beats;
      });
      len = Math.max(len, t);
    }
    const list = [...cols.values()].sort((a, c) => a.tl - c.tl);
    list.forEach((c, i) => { c.gap = (i + 1 < list.length ? list[i + 1].tl : len) - c.tl; c.t = t0 + c.tl; });
    // metric offset for the pickup bar (its notes sit at the end of a full bar)
    const metricOff = b === 0 && song.pickup > 0 ? barLen - len : 0;
    bars.push({ b, t0, len, cols: list, metricOff, full: Math.abs(len - barLen) < EPS });
    t0 += len;
  }
  return { key, hands, playHands, staves: hands.map(staffOf), bars, barLen, total: t0, staffOf };
}

function colMetrics(col, opts) {
  let accCols = 0, minDx = 0, maxDx = 0, dotted = false, nameW = 0;
  for (const hd in col.toks) {
    const tk = col.toks[hd];
    if (tk.rest) { if (isDotted(tk.dur)) dotted = true; continue; }
    const lc = layoutCluster(tk.notes.map((n) => ({ ...n })), headKind(tk.dur), null);
    tk.cluster = lc;
    accCols = Math.max(accCols, lc.accCols);
    minDx = Math.min(minDx, lc.minDx); maxDx = Math.max(maxDx, lc.maxDx);
    if (isDotted(tk.dur)) dotted = true;
    if (opts.names) nameW = Math.max(nameW, tk.notes.length * 7.5 + 4);
  }
  // engraving-style spacing: the space after a note grows with its duration; only that part stretches
  const base = 10 + 15 * Math.sqrt(Math.max(0.25, col.gap));
  col.left = accCols * 9.5 + (-minDx) + 1;
  col.right = maxDx + (dotted ? 6 : 0);
  col.stretch = Math.max(base, nameW, 15 + col.right);
  col.w = col.left + col.stretch;
}

/** Natural widths: header for system start, and each bar. */
function headerWidth(model, first) {
  const ksN = Math.abs(model.key || 0);
  let x = 36 + (ksN ? 6 + ksN * (model.key > 0 ? 9 : 8) : 0);
  if (first) x += 24;
  return x + 6;
}

export function renderScore(song, opts = {}) {
  const sliced = opts.bars ? songBars(song, opts.bars) : song;
  const hands = opts.hands || 'both';
  const naming = opts.naming || 'letters';
  const model = buildModel(sliced, { ...opts, hands });
  const events = songEvents(sliced, { hands });
  const moments = momentsOf(events);
  const C = clefs();
  const grand = model.staves.length === 2;

  for (const bar of model.bars) {
    bar.cols.forEach((c) => colMetrics(c, opts));
    bar.fixed = 9 + bar.cols.reduce((a, c) => a + c.left, 0);
    bar.stretch = bar.cols.reduce((a, c) => a + c.stretch, 0);
    bar.w = bar.fixed + bar.stretch;
  }

  // ---- vertical extents per staff (relative to staff top line)
  const ext = {};
  for (const st of model.staves) ext[st] = { top: -6, bottom: 46 };
  for (const bar of model.bars) for (const c of bar.cols) for (const hd in c.toks) {
    const tk = c.toks[hd];
    if (tk.rest) continue;
    const ys = tk.notes.map((n) => yOf(0, n.step));
    const e = ext[tk.staff];
    const hi = Math.min(...ys), lo = Math.max(...ys);
    e.top = Math.min(e.top, hi - 7); e.bottom = Math.max(e.bottom, lo + 7);
    if (tk.dur !== 'w') {
      // generous stem allowance (beams may lengthen a stem slightly)
      const dir = tk.cluster ? tk.cluster.dir : 'up';
      if (dir === 'up') e.top = Math.min(e.top, Math.min(hi - STEM_LEN - 4, 16));
      else e.bottom = Math.max(e.bottom, Math.max(lo + STEM_LEN + 4, 24));
    }
  }
  model.ext = ext;
  const showNames = !!opts.names;
  const rowsFor = (st) => ({ above: NAME_ROW, below: opts.fingers ? FINGER_ROW : 4 });
  // names row is always reserved so revealing a name never moves the layout
  const y0 = {};
  let yy = 4;
  for (const st of model.staves) {
    const r = rowsFor(st);
    yy += r.above - ext[st].top;
    if (st === 'bass' && grand) yy = Math.max(yy, y0.treble + 92);
    y0[st] = yy;
    yy += ext[st].bottom + r.below;
  }
  const sysH = yy + 4;

  // ---- systems
  const boxW = Math.max(240, (opts.box && opts.box.w) || 360);
  let perSys = opts.barsPerSystem || (boxW < 520 ? 2 : boxW < 880 ? 3 : 4);
  const maxScale = (opts.maxSpace || (boxW < 600 ? 13 : 14)) / 10;
  let systems, scale;
  const plan = (n) => {
    // a pickup bar rides along with the first system instead of taking a full slot
    const out = [];
    const lead = model.bars.length && !model.bars[0].full && model.bars[0].len < model.barLen ? 1 : 0;
    for (let i = 0; i < model.bars.length;) { const k = i === 0 ? n + lead : n; out.push(model.bars.slice(i, i + k)); i += k; }
    return out;
  };
  for (;;) {
    systems = plan(perSys).map((bars, si) => ({ bars, hw: headerWidth(model, si === 0) }));
    const natMax = Math.max(...systems.map((sy) => (grand ? 18 : 4) + sy.hw + sy.bars.reduce((a, b) => a + b.w, 0) + 6));
    scale = Math.min(maxScale, boxW / natMax);
    if (scale >= 0.86 || perSys <= 1) break;
    perSys--;
  }
  if (opts.box && opts.box.h > 0) scale = Math.min(scale, Math.max(0.7, opts.box.h / sysH));
  const W = boxW / scale;

  const momentEls = moments.map(() => []);
  const momentNames = moments.map(() => []);
  const momentSys = moments.map(() => 0);
  const momentX = moments.map(() => 0);
  const tokIndex = new Map(); // key -> { els, names, sys, x }
  const sysEls = [];
  const sysInfo = [];

  systems.forEach((sy, si) => {
    const last = si === systems.length - 1;
    const left = grand ? -18 : -4;
        const fixed = sy.bars.reduce((a, b) => a + b.fixed, 0);
    const stretch = sy.bars.reduce((a, b) => a + b.stretch, 0) || 1;
    const avail = W + left - sy.hw - 6;
    let f = Math.max(1, (avail - fixed) / stretch);
    if (last && systems.length > 1 && sy.bars.length < perSys) {
      const s0 = systems[0];
      const f0 = (W + left - s0.hw - 6 - s0.bars.reduce((a, b) => a + b.fixed, 0)) / (s0.bars.reduce((a, b) => a + b.stretch, 0) || 1);
      f = Math.max(1, Math.min(f, f0));
    }
    const root = s('g', { class: 'sc-sys' });
    const under = s('g', { class: 'sc-under' });
    const lines = s('g', { class: 'st-lines' });
    const header = s('g', { class: 'st-header' });
    const notesG = s('g', { class: 'st-notes' });
    const over = s('g', { class: 'sc-over' });
    const endX = sy.hw + fixed + stretch * f;
    for (const st of model.staves) staffLines(lines, y0[st], 0, endX);
    const yTop = y0[model.staves[0]], yBot = y0[model.staves[model.staves.length - 1]] + 40;
    if (grand) {
      header.appendChild(s('path', { class: 'st-glyph st-brace', d: brace(y0.treble, yBot, -13.5) }));
      lines.appendChild(s('line', { class: 'st-sysline', x1: 0, x2: 0, y1: yTop, y2: yBot }));
    }
    let hx = 0;
    for (const st of model.staves) {
      header.appendChild(s('path', { class: 'st-glyph st-clef', d: st === 'bass' ? C.bass : C.treble, transform: `translate(5 ${y0[st]})` }));
      hx = Math.max(hx, drawKeySig(header, model.key, st, y0[st], 36));
    }
    if (si === 0 && sliced.time) {
      for (const st of model.staves) {
        const tx = hx + 11;
        header.appendChild(s('text', { class: 'st-time sc-time', x: tx, y: y0[st] + 10, 'text-anchor': 'middle', 'dominant-baseline': 'central', text: String(sliced.time[0]) }));
        header.appendChild(s('text', { class: 'st-time sc-time', x: tx, y: y0[st] + 30, 'text-anchor': 'middle', 'dominant-baseline': 'central', text: String(sliced.time[1]) }));
      }
    } else if (si > 0) {
      const bn = (opts.bars ? opts.bars[0] : 1) + sy.bars[0].b;
      header.appendChild(s('text', { class: 'sc-barno', x: 2, y: yTop - NAME_ROW + 1, text: String(bn) }));
    }

    const cursor = s('rect', { class: 'sc-cursor', x: 0, y: yTop - NAME_ROW + 2, width: 22, height: yBot - yTop + NAME_ROW + (opts.fingers ? FINGER_ROW : 4) - 2, rx: 7 });
    cursor.style.display = 'none';
    under.appendChild(cursor);
    const playhead = s('rect', { class: 'sc-playhead', x: 0, y: yTop - 8, width: 2, height: yBot - yTop + 16, rx: 1 });
    playhead.style.display = 'none';
    over.appendChild(playhead);

    const anchors = []; // { t, x } for playhead interpolation
    let bx = sy.hw;
    const beamQueue = [];
    sy.bars.forEach((bar, bi) => {
      let cx = bx + 7;
      anchors.push({ t: bar.t0, x: bx + 3 });
      for (const c of bar.cols) {
        const x = cx + c.left + headHalfW('q');
        c.x = x;
        anchors.push({ t: c.t, x });
        cx += c.left + c.stretch * f;
        for (const hd in c.toks) {
          const tk = c.toks[hd];
          const g = drawToken(tk, x, y0[tk.staff], bar, c, notesG, model, opts, naming, beamQueue, cx - x);
          const k = tkey(hd, c.t);
          const rec = { els: [g.el], names: g.names, sys: si, x };
          tokIndex.set(k, rec);
          if (!model.playHands.includes(hd)) g.el.classList.add('sc-dim');
        }
      }
      // whole-bar rests centred in the bar
      const bw = bar.fixed + bar.stretch * f;
      bx += bw;
      const isLastBar = last && bi === sy.bars.length - 1;
      for (const el of notesG.querySelectorAll('.sc-rest-bar:not([data-placed])')) {
        el.setAttribute('data-placed', '1');
        el.setAttribute('transform', `translate(${(bx - bw / 2).toFixed(2)} 0)`);
      }
      if (isLastBar) {
        lines.appendChild(s('line', { class: 'st-bar', x1: bx - 5.4, x2: bx - 5.4, y1: yTop, y2: yBot }));
        lines.appendChild(s('rect', { class: 'st-glyph', x: bx - 3.2, y: yTop, width: 3.4, height: yBot - yTop }));
      } else {
        lines.appendChild(s('line', { class: 'st-bar', x1: bx, x2: bx, y1: yTop, y2: yBot }));
      }
      if (grand && !isLastBar) { /* barline already spans the gap between staves */ }
    });
    anchors.push({ t: sy.bars.length ? sy.bars[sy.bars.length - 1].t0 + sy.bars[sy.bars.length - 1].len : 0, x: bx - 2 });
    drawBeams(beamQueue, notesG);

    root.append(under, lines, header, notesG, over);
    const svg = s('svg', {
      class: 'staff score-sys' + (grand ? ' staff-grand' : ''),
      viewBox: `${left} 0 ${W.toFixed(2)} ${sysH.toFixed(2)}`,
      width: String(Math.round(W * scale)), height: String(Math.round(sysH * scale)),
      role: 'img', 'aria-label': `${sliced.title || 'Score'}, system ${si + 1} of ${systems.length}`,
    }, root);
    sysEls.push(svg);
    sysInfo.push({ cursor, playhead, anchors, t0: sy.bars.length ? sy.bars[0].t0 : 0, t1: anchors[anchors.length - 1].t, x0: sy.hw, x1: bx, left });
  });

  moments.forEach((m, i) => {
    for (const ev of m.events) {
      const rec = tokIndex.get(tkey(ev.hand, ev.t));
      if (!rec) continue;
      momentEls[i].push(...rec.els);
      momentNames[i].push(...rec.names);
      momentSys[i] = rec.sys; momentX[i] = rec.x;
    }
  });

  const title = sliced.title || 'Score';
  const viewport = h('div.score-vp', sysEls.map((svg) => h('div.score-line', svg)));
  const el = h('div.score', { role: 'group', 'aria-label': opts.label || `${title}: ${model.bars.length} bars, ${moments.length} notes to play` }, viewport);
  el.style.setProperty('--sc-scale', String(scale));
  if (opts.box && opts.box.h > 0) viewport.style.maxHeight = Math.round(opts.box.h) + 'px';

  let curIdx = -1;
  let lastScroll = -1;
  function scrollToSys(si, frac) {
    const lineEls = viewport.children;
    const line = lineEls[si];
    if (!line) return;
    const vh = viewport.clientHeight;
    if (!vh || viewport.scrollHeight <= vh + 2) return;
    let target = line.offsetTop - 6;
    const next = lineEls[si + 1];
    if (frac > 0.8 && next) {
      const want = next.offsetTop + next.offsetHeight - vh + 6;
      target = Math.max(target, Math.min(want, line.offsetTop + line.offsetHeight * 0.4));
    }
    target = clamp(target, 0, viewport.scrollHeight - vh);
    if (Math.abs(target - lastScroll) < 2) return;
    lastScroll = target;
    try { viewport.scrollTo({ top: target, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { viewport.scrollTop = target; }
  }
  const fracOf = (si, x) => { const inf = sysInfo[si]; return inf ? (x - inf.left) / (W) : 0; };

  const handle = {
    el, moments, events, systems: sysEls.length, scale,
    setState(i, cls) {
      const els = momentEls[i]; if (!els) return;
      for (const e of els) { for (const c of STATE) e.classList.remove(c); if (cls) for (const k of String(cls).split(/\s+/)) if (k) e.classList.add(k); }
    },
    setCursor(i) {
      for (const inf of sysInfo) inf.cursor.style.display = 'none';
      curIdx = i;
      if (i == null || i < 0 || i >= moments.length) return;
      const inf = sysInfo[momentSys[i]];
      if (!inf) return;
      inf.cursor.setAttribute('x', (momentX[i] - 12).toFixed(2));
      inf.cursor.style.display = '';
      scrollToSys(momentSys[i], fracOf(momentSys[i], momentX[i]));
    },
    setPlayhead(beats) {
      for (const inf of sysInfo) inf.playhead.style.display = 'none';
      if (beats == null || !isFinite(beats)) return;
      let si = sysInfo.findIndex((inf) => beats >= inf.t0 - EPS && beats < inf.t1 - EPS);
      if (si < 0) si = beats < 0 ? 0 : sysInfo.length - 1;
      const inf = sysInfo[si];
      const a = inf.anchors;
      let x = a[0].x;
      if (beats <= a[0].t) x = a[0].x - Math.min(1, a[0].t - beats) * 0;
      else {
        for (let k = 0; k < a.length - 1; k++) {
          if (beats >= a[k].t && beats <= a[k + 1].t) {
            const span = a[k + 1].t - a[k].t;
            x = span > EPS ? a[k].x + (a[k + 1].x - a[k].x) * ((beats - a[k].t) / span) : a[k + 1].x;
            break;
          }
          x = a[a.length - 1].x;
        }
      }
      inf.playhead.setAttribute('x', (x - 1).toFixed(2));
      inf.playhead.style.display = '';
      scrollToSys(si, fracOf(si, x));
    },
    reveal(i) {
      for (const n of momentNames[i] || []) n.classList.remove('is-hidden');
    },
    hideNames() { for (const arr of momentNames) for (const n of arr) n.classList.add('is-hidden'); },
    get cursor() { return curIdx; },
    destroy() { el.remove(); },
  };
  if (!showNames) handle.hideNames();
  return handle;
}

// ------------------------------------------------------------------ token drawing
function drawToken(tk, x, y0, bar, col, parent, model, opts, naming, beamQueue, roomRight) {
  const g = s('g', { class: 'st-note sc-tok' + (tk.rest ? ' sc-rest' : ''), 'data-hand': tk.hand });
  parent.appendChild(g);
  const names = [];
  if (tk.rest) {
    const wholeBar = tk.tl < EPS && Math.abs(tk.beats - bar.len) < EPS && bar.len >= 2;
    const rg = wholeBar ? s('g', { class: 'sc-rest-bar' }) : null;
    const rx = rg ? 0 : x;
    const host = rg || g;
    if (tk.dur === 'w' || rg) host.appendChild(s('rect', { class: 'st-glyph', x: rx - 6, y: y0 + 10, width: 12, height: 5 }));
    else if (tk.dur === 'h' || tk.dur === 'h.') {
      host.appendChild(s('rect', { class: 'st-glyph', x: rx - 6, y: y0 + 15, width: 12, height: 5 }));
      if (tk.dur === 'h.') host.appendChild(s('circle', { class: 'st-glyph', cx: rx + 10, cy: y0 + 15, r: 1.6 }));
    } else if (tk.dur === '8') host.appendChild(s('path', { class: 'st-glyph', d: EIGHTH_REST, transform: `translate(${rx} ${y0 + 20})` }));
    else {
      host.appendChild(s('path', { class: 'st-glyph', d: QUARTER_REST, transform: `translate(${rx} ${y0 + 20})` }));
      if (tk.dur === 'q.') host.appendChild(s('circle', { class: 'st-glyph', cx: rx + 7, cy: y0 + 15, r: 1.6 }));
    }
    if (rg) g.appendChild(rg);
    return { el: g, names };
  }
  const kind = headKind(tk.dur);
  const lc = tk.cluster || layoutCluster(tk.notes.map((n) => ({ ...n })), kind, null);
  const sorted = lc.sorted;
  const hw = headHalfW(kind);
  // ledger lines
  const lo = lc.lo, hi = lc.hi;
  const lx1 = x + lc.minDx - hw - LEDGER_EXT, lx2 = x + lc.maxDx + hw + LEDGER_EXT;
  for (let st = -2; st >= lo; st -= 2) g.appendChild(s('line', { class: 'st-ledger', x1: lx1, x2: lx2, y1: yOf(y0, st), y2: yOf(y0, st) }));
  for (let st = 10; st <= hi; st += 2) g.appendChild(s('line', { class: 'st-ledger', x1: lx1, x2: lx2, y1: yOf(y0, st), y2: yOf(y0, st) }));
  // heads, accidentals, dots
  for (const n of sorted) {
    const cy = yOf(y0, n.step);
    const hx = x + (n.dx || 0);
    if (n.acc) {
      const ax = x + lc.minDx - hw - 3 - ACC_W[n.acc] / 2 - (n.accCol || 0) * 9.5;
      g.appendChild(s('path', { class: 'st-glyph st-acc', d: ACC[n.acc], transform: `translate(${ax.toFixed(2)} ${cy})` }));
    }
    g.appendChild(s('path', { class: 'st-head', d: headPath(hx, cy, kind), 'fill-rule': 'evenodd' }));
    if (isDotted(tk.dur)) {
      const dy = n.step % 2 === 0 ? -5 : 0;
      g.appendChild(s('circle', { class: 'st-head sc-dot', cx: x + lc.maxDx + hw + 4.2, cy: cy + dy, r: 1.65 }));
    }
  }
  // stem (+ flag or beam)
  if (kind !== 'w') {
    const ys = sorted.map((n) => yOf(y0, n.step));
    const hiY = Math.min(...ys), loY = Math.max(...ys);
    const mid = y0 + 20;
    const off = 6.2 - STEM_W / 2 - 0.35;
    const stem = s('rect', { class: 'st-stem' });
    g.appendChild(stem);
    const info = { tk, g, stem, x, dir: lc.dir, hiY, loY, mid, off, bar, col };
    const setStem = (dir, tipY) => {
      info.dir = dir;
      if (dir === 'up') {
        const sx = x + off;
        stem.setAttribute('x', (sx - STEM_W / 2).toFixed(2)); stem.setAttribute('y', tipY.toFixed(2));
        stem.setAttribute('width', STEM_W); stem.setAttribute('height', (loY - 1 - tipY).toFixed(2));
        info.sx = sx + STEM_W / 2;
      } else {
        const sx = x - off;
        stem.setAttribute('x', (sx - STEM_W / 2).toFixed(2)); stem.setAttribute('y', (hiY + 1).toFixed(2));
        stem.setAttribute('width', STEM_W); stem.setAttribute('height', (tipY - hiY - 1).toFixed(2));
        info.sx = sx - STEM_W / 2;
      }
      info.tip = tipY;
    };
    info.setStem = setStem;
    setStem(lc.dir, lc.dir === 'up' ? Math.min(hiY - STEM_LEN, mid) : Math.max(loY + STEM_LEN, mid));
    if (tk.dur === '8') beamQueue.push(info);
  }
  // names above, finger numbers below
  const label = sorted.map((n) => pretty(nameOf(n.midi, naming, { octave: false, accidental: n.accidental || undefined, keySig: model.key }))).join(' ');
  // names live in the reserved row above the staff's extent, so they never collide with notes
  const nm = s('text', { class: 'sc-name', x, y: rowY(model, tk, y0, 'name'), 'text-anchor': 'middle', text: label });
  g.appendChild(nm); names.push(nm);
  if (opts.fingers) {
    const fs = sorted.map((n) => fingerFor(n.midi, n.accidental, model.key, tk.hand, opts.pos)).filter((v) => v != null);
    if (fs.length) g.appendChild(s('text', { class: 'sc-finger', x, y: rowY(model, tk, y0, 'finger'), 'text-anchor': 'middle', text: fs.join(' ') }));
  }
  void roomRight; void col;
  return { el: g, names };
}

function rowY(model, tk, y0, which) {
  const e = model.ext[tk.staff];
  return which === 'name' ? y0 + e.top - 3 : y0 + e.bottom + 10;
}

function drawBeams(queue, parent) {
  const used = new Set();
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    if (used.has(a)) continue;
    const b = queue.find((q) => !used.has(q) && q !== a && q.tk.hand === a.tk.hand && q.bar === a.bar &&
      Math.abs(q.tk.tl - a.tk.tl - 0.5) < EPS);
    const pos = a.tk.tl + a.bar.metricOff;
    if (b && Math.abs(pos - Math.round(pos)) < EPS) {
      used.add(a); used.add(b);
      // shared direction: away from the middle line on average
      const avg = (a.hiY + a.loY + b.hiY + b.loY) / 4 - a.mid;
      const dir = avg <= 0 ? 'down' : 'up';
      const dx = (b.x - a.x) || 1;
      const slope = clamp(((dir === 'up' ? b.hiY - a.hiY : b.loY - a.loY)) / dx, -0.11, 0.11);
      let ya;
      if (dir === 'up') ya = Math.min(a.hiY - STEM_LEN, b.hiY - STEM_LEN - slope * dx, a.mid + 0 - (b.x - a.x) * 0);
      else ya = Math.max(a.loY + STEM_LEN, b.loY + STEM_LEN - slope * dx);
      a.setStem(dir, ya);
      b.setStem(dir, ya + slope * (b.x - a.x));
      const x1 = a.sx - (dir === 'up' ? STEM_W : 0), x2 = b.sx + (dir === 'down' ? STEM_W : 0);
      const y1 = ya, y2 = ya + slope * (x2 - x1);
      const t = dir === 'up' ? 5 : -5;
      const beam = s('path', { class: 'st-beam', d: `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}L${x2.toFixed(2)} ${(y2 + t).toFixed(2)}L${x1.toFixed(2)} ${(y1 + t).toFixed(2)}Z` });
      a.g.appendChild(beam);
      continue;
    }
  }
  for (const q of queue) {
    if (used.has(q)) continue;
    const d = q.dir === 'up' ? FLAG_UP : FLAG_DOWN;
    const fx = q.dir === 'up' ? q.sx - 0.2 : q.sx + 0.2;
    q.g.appendChild(s('path', { class: 'st-flag', d, transform: `translate(${fx.toFixed(2)} ${q.tip.toFixed(2)})` }));
  }
  void parent;
}
