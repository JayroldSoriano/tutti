import { h, s, pct } from '../h.js';
import { renderStaff } from '../staff.js';
import * as cur from '../../curriculum.js';
import { openDialog } from '../dialog.js';

export function renderProgress(ctx, mount) {
  let pr = null;
  try { pr = ctx.engine.progress({ now: ctx.now() }); } catch (e) { console.warn(e); }
  if (!pr) { mount.append(h('p.empty', 'Progress is not available right now.')); return; }

  const head = h('header.page-head', h('h1', 'Progress'), h('p', pr.totalAnswers ? 'Every note you read moves you along this path.' : 'Your first session will start filling this in.'));

  // ---- stage map
  const byId = Object.fromEntries(pr.stages.map((x) => [x.id, x]));
  const path = h('ol.path', { 'aria-label': 'Stages' }, cur.STAGES.map((st) => {
    const p = byId[st.id] || { status: 'locked', progress: 0 };
    const status = p.status || 'locked';
    const sub = status === 'passed' ? 'Passed' : status === 'active'
      ? h('span.s-sub', h('span.bar', h('i', { style: { width: pct(p.progress) } })), h('span.num', pct(p.progress)))
      : st.optional ? 'Optional' : 'Locked';
    const btn = p.canTestOut ? h('button.btn', { type: 'button', onclick: () => testOut(ctx, st) }, 'Test out') : null;
    return h('li.' + status, { 'aria-label': `${st.title}: ${status}` },
      h('span.node', { 'aria-hidden': 'true' }, status === 'passed' ? '✓' : st.optional ? 'P' : String(st.index + 1)),
      h('div', h('div.s-title', st.title), typeof sub === 'string' ? h('div.s-sub', sub) : sub),
      btn || h('span'));
  }));

  // ---- heat map (one notehead per single-note item; dedupe staff+midi keeping the best)
  const seen = new Map();
  for (const x of pr.heat || []) {
    const k = x.staff + x.midi;
    const prev = seen.get(k);
    if (!prev || (x.n > 0 && (prev.n === 0 || x.mastery > prev.mastery))) seen.set(k, x);
  }
  const heat = [...seen.values()];
  const heatSvg = renderStaff(null, { heat, box: { w: Math.min(820, (mount.clientWidth || 360) - 40), h: 240 }, maxSpace: 12, minSpace: 10, label: 'Mastery of each note on the grand staff' });
  const legend = h('div.legend',
    legendItem('heat-none', 'not seen yet', 0),
    legendItem('heat-1', 'learning', 0.25),
    legendItem('heat-4', 'fluent', 1),
    h('span', 'Thicker ring = stronger'));

  // ---- speed sparkline
  const sessions = (pr.sessions || []).filter((x) => x.answers > 0 && x.medianRtMs > 0);
  const spark = sessions.length >= 2 ? sparkline(sessions) : h('p.empty', 'After two sessions you will see your reading speed trend here. Lower is better.');

  const totalMin = Math.round((pr.sessions || []).reduce((a, x) => a + (x.durMs || 0), 0) / 60000);
  const totals = h('div.totals',
    stat(pr.totalAnswers || 0, 'notes read'),
    stat((pr.sessions || []).length, 'sessions'),
    stat(totalMin, 'minutes'),
    stat(pr.streakDays || 0, 'day streak'));

  mount.append(h('div.progress', head,
    h('section.card', h('h2.section-title', 'Stages'), path),
    h('section.paper.card', h('h2.section-title', 'Note mastery'), h('div.heat-wrap', heatSvg), legend),
    h('section.card', h('h2.section-title', 'Reading speed'), h('p.muted.small', 'Median time per prompt, by session'), spark),
    totals));
}

function stat(v, label) { return h('div.stat', h('b.num', String(v)), h('span', label)); }

function legendItem(cls, text, m) {
  const svg = s('svg', { width: 26, height: 20, viewBox: '-13 -10 26 20', 'aria-hidden': 'true', class: 'staff' },
    s('g', { class: 'st-note st-heat ' + cls },
      s('ellipse', { class: 'st-head', cx: 0, cy: 0, rx: 6.2, ry: 4.4, transform: 'rotate(-20)' }),
      cls !== 'heat-none' ? s('ellipse', { class: 'st-ring', cx: 0, cy: 0, rx: 8.6, ry: 6.4, transform: 'rotate(-20)', 'stroke-width': (0.6 + 2.2 * m).toFixed(2) }) : null));
  return h('span', svg, text);
}

function sparkline(sessions) {
  const W = 320, H = 120, padL = 8, padR = 52, padT = 18, padB = 22;
  const vals = sessions.map((x) => x.medianRtMs / 1000);
  const max = Math.max(...vals) * 1.1, min = Math.min(...vals) * 0.85;
  const x = (i) => padL + (i / (vals.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / Math.max(0.001, max - min)) * (H - padT - padB);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(0)},${H - padB}L${pts.join('L')}L${x(vals.length - 1)},${H - padB}Z`;
  const last = vals.length - 1;
  return s('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Median time went from ${vals[0].toFixed(1)} to ${vals[last].toFixed(1)} seconds over ${vals.length} sessions` },
    s('path', { class: 'sp-area', d: area }),
    s('polyline', { class: 'sp-line', points: pts.join(' '), 'vector-effect': 'non-scaling-stroke' }),
    s('circle', { class: 'sp-dot', cx: x(0), cy: y(vals[0]), r: 3.2 }),
    s('circle', { class: 'sp-dot', cx: x(last), cy: y(vals[last]), r: 3.6 }),
    s('text', { class: 'sp-lbl', x: x(0) + 6, y: y(vals[0]) - 7, text: vals[0].toFixed(1) + ' s' }),
    s('text', { class: 'sp-lbl', x: x(last) + 7, y: y(vals[last]) + 4, text: vals[last].toFixed(1) + ' s' }),
    s('text', { x: padL, y: H - 5, text: 'first' }),
    s('text', { x: x(last), y: H - 5, 'text-anchor': 'end', text: 'latest' }));
}

function testOut(ctx, st) {
  const n = st.kind === 'chord' ? 15 : 12;
  openDialog({
    title: `Test out of ${st.title}?`,
    body: h('div', h('p', `${n} prompts, no hints. Get 90% right at a steady pace and the stage is marked passed.`), h('p', 'Nothing is lost if it does not go well. One attempt per day.')),
    actions: [{ label: 'Start test-out', value: true, kind: 'primary' }, { label: 'Not now', value: false, kind: 'quiet' }],
  }).then((v) => { if (v) { ctx.pendingStart = { mode: 'testout', stageId: st.id }; ctx.nav('practice'); } });
}
