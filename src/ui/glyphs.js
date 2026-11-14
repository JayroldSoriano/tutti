// Hand-authored notation glyphs as SVG path data, in staff units (1 staff space = 10).
// Clefs and the brace are built as calligraphic outlines around a centre line with a varying
// nib width (smoothed Catmull-Rom spline) so thick/thin swells look engraved rather than stroked.

function catmull(pts, samples) {
  const out = [];
  const n = pts.length;
  const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < samples; k++) {
      const t = k / samples, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  out.push(pts[n - 1].slice());
  return out;
}

/** pts: [x, y, width][] -> closed outline path */
export function swell(pts, samples = 10) {
  const c = catmull(pts, samples);
  const L = [], R = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = Math.max(0.25, c[i][2]) / 2;
    L.push([c[i][0] - dy * w, c[i][1] + dx * w]);
    R.push([c[i][0] + dy * w, c[i][1] - dx * w]);
  }
  const f = (p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  // round caps
  const s0 = c[0], s1 = c[c.length - 1];
  const r0 = Math.max(0.25, s0[2]) / 2, r1 = Math.max(0.25, s1[2]) / 2;
  let d = 'M' + f(L[0]);
  for (let i = 1; i < L.length; i++) d += 'L' + f(L[i]);
  d += `A${r1.toFixed(2)} ${r1.toFixed(2)} 0 0 1 ${f(R[R.length - 1])}`;
  for (let i = R.length - 2; i >= 0; i--) d += 'L' + f(R[i]);
  d += `A${r0.toFixed(2)} ${r0.toFixed(2)} 0 0 1 ${f(L[0])}Z`;
  return d;
}

export function circle(cx, cy, r) {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

/** Rotated ellipse as path (used for noteheads; combine two with evenodd for hollow heads). */
export function ellipse(cx, cy, rx, ry, deg) {
  const a = deg * Math.PI / 180;
  const x1 = cx + rx * Math.cos(a), y1 = cy + rx * Math.sin(a);
  const x2 = cx - rx * Math.cos(a), y2 = cy - rx * Math.sin(a);
  const f = (v) => v.toFixed(2);
  return `M${f(x1)} ${f(y1)}A${rx} ${ry} ${deg} 1 0 ${f(x2)} ${f(y2)}A${rx} ${ry} ${deg} 1 0 ${f(x1)} ${f(y1)}Z`;
}

let cache = null;
export function clefs() {
  if (cache) return cache;
  // Treble (G) clef. Origin: staff top line y=0, G line y=30, bottom line y=40. Glyph x 0..27.
  const treble =
    swell([
      [6.4, 53.6, 2.0], [9.6, 56.6, 2.0], [12.7, 53.4, 2.0], [13.2, 44, 2.3], [13.6, 28, 2.5],
      [14.1, 12, 2.6], [14.8, 0, 2.5], [15.8, -8, 2.2], [17.2, -13.6, 1.4], [19.6, -12.2, 2.2],
      [21.8, -6.5, 3.6], [20.4, 0.5, 4.6], [14.6, 7.5, 5.0], [7.2, 15.0, 5.0], [2.0, 23.0, 5.0],
      [1.6, 32.0, 4.6], [5.4, 39.0, 3.2], [12.6, 42.4, 1.8], [20.4, 40.2, 2.4], [25.0, 34.0, 4.2],
      [24.6, 26.6, 4.0], [19.6, 21.8, 2.4], [13.2, 22.6, 1.7], [9.6, 27.2, 1.5], [10.6, 32.6, 1.3],
      [14.0, 34.6, 1.1],
    ], 10) + circle(6.7, 51.6, 3.5);
  // Bass (F) clef. Origin: staff top line y=0, F line y=10. Glyph x 0..28.
  const bass =
    swell([
      [1.6, 8.0, 2.4], [5.0, 2.0, 1.6], [11.0, -0.2, 2.2], [17.6, 2.4, 4.0], [20.6, 9.6, 5.4],
      [19.4, 17.4, 5.0], [14.8, 24.6, 3.8], [8.4, 30.4, 2.2], [3.0, 33.8, 1.0], [0.6, 35.0, 0.4],
    ], 12) + circle(4.4, 9.6, 4.0) + circle(25.6, 5.0, 1.75) + circle(25.6, 15.0, 1.75);
  // Brace for a system of height 1 (scaled by caller): computed for height 140.
  cache = { treble, bass };
  return cache;
}

export function brace(top, bottom, x) {
  const hgt = bottom - top, m = (top + bottom) / 2;
  const sc = (v) => v;
  const upper = swell([
    [x + 9.5, top + 0.6, 0.5], [x + 6.2, top + hgt * 0.035, 1.6], [x + 4.2, top + hgt * 0.12, 3.4],
    [x + 3.8, top + hgt * 0.26, 4.4], [x + 3.2, top + hgt * 0.4, 3.6], [x + 1.4, top + hgt * 0.47, 1.8], [x - 0.8, m, 0.4],
  ], 10);
  const lower = swell([
    [x - 0.8, m, 0.4], [x + 1.4, bottom - hgt * 0.47, 1.8], [x + 3.2, bottom - hgt * 0.4, 3.6],
    [x + 3.8, bottom - hgt * 0.26, 4.4], [x + 4.2, bottom - hgt * 0.12, 3.4], [x + 6.2, bottom - hgt * 0.035, 1.6], [x + 9.5, bottom - 0.6, 0.5],
  ], 10);
  void sc;
  return upper + lower;
}

// Accidentals centred on (0,0) = the note's staff position.
export const SHARP =
  'M-3.1 -12.2h1.25v25.4h-1.25zM1.85 -14.4h1.25v25.4h-1.25z' +
  'M-5 -1.6L5 -5.2v3.4L-5 1.8zM-5 6.6L5 3.0v3.4L-5 10z';
export const FLAT =
  'M-3.6 -17.6h1.3v24.6h-1.3z' +
  'M-2.6 -1.0C0.6 -5.0 6.6 -5.2 6.6 -1.0C6.6 2.6 1.8 5.0 -2.6 7.6L-2.6 5.2C0.6 3.4 3.8 1.4 3.8 -0.8C3.8 -3.0 0.8 -3.0 -2.6 0.6Z';
export const NATURAL =
  'M-3.4 -14.2h1.3v22.6h-1.3zM2.1 -8.4h1.3v22.6h-1.3z' +
  'M-3.4 -3.0L3.4 -5.4v3.4L-3.4 0.4zM-3.4 5.0L3.4 2.6v3.4L-3.4 8.4z';
export const ACC = { '#': SHARP, b: FLAT, n: NATURAL };
export const ACC_W = { '#': 11, b: 10, n: 9 };

// Eighth flag for a stem-up note, origin at the stem tip (x = stem right edge, y = tip).
export const FLAG_UP = 'M0 0C0.6 5.2 3.8 7.6 6.6 11.0C9.4 14.4 9.6 19.6 7.4 24.0C8.4 19.2 7.2 15.6 4.0 13.4C2.4 12.2 1.0 11.6 0 11.4Z';
// Stem-down flag: origin at stem tip (x = stem left edge, y = tip)
export const FLAG_DOWN = 'M0 0C0.6 -5.0 3.8 -7.4 6.6 -10.6C9.4 -13.8 9.8 -19.0 7.6 -23.4C8.6 -18.6 7.4 -15.2 4.2 -13.0C2.6 -11.8 1.0 -11.2 0 -11.0Z';

