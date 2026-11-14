import { h, s, pct } from '../h.js';
import { renderStaff } from '../staff.js';
import * as cur from '../../curriculum.js';
import { pretty } from '../music.js';
import { openDialog } from '../dialog.js';
import { placementCard } from './placement.js';

export function stageBody(stage) {
  if (!stage) return null;
  const items = cur.stageItems(stage.id) || [];
  const notes = items.filter((it) => it.gen && Number.isFinite(it.gen.midi));
  if (notes.length && (stage.kind === 'note' || stage.kind === 'mix')) {
    let pick = notes;
    if (stage.kind === 'mix') pick = notes.filter((_, i) => i % 3 === 0);
    pick = pick.slice(0, 7);
    const staves = new Set(pick.map((it) => it.gen.staff));
    const clef = staves.size > 1 ? 'grand' : [...staves][0];
    return { kind: 'phrase', clef, notes: pick.map((it) => ({ midi: it.gen.midi, staff: it.gen.staff, accidental: it.gen.accidental, dur: 'w' })), answer: { type: 'sequence', midis: [], given: 0 } };
  }
  const first = items[Math.min(items.length - 1, stage.kind === 'chord' ? 0 : 1)] || items[0];
  if (!first) return null;
  try {
    let k = 0; const seq = [0.42, 0.17, 0.73, 0.31, 0.58, 0.9, 0.05];
    return cur.realize(first, () => seq[k++ % seq.length]);
  } catch { return null; }
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Late practice.' : hr < 12 ? 'Good morning.' : hr < 18 ? 'Good afternoon.' : 'Good evening.';
}

function knob(todayMs, goalMs) {
  const r = 46, c = 2 * Math.PI * r;
  const f = goalMs > 0 ? Math.min(1, todayMs / goalMs) : 0;
  const min = Math.floor(todayMs / 60000);
  const goalMin = Math.round(goalMs / 60000);
  const ring = s('circle', { class: 'k-ring', cx: 54, cy: 54, r, 'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': (c * (1 - f)).toFixed(2) });
  if (f <= 0) ring.style.opacity = '0';
  return h('div.knob', { role: 'img', 'aria-label': `${min} of ${goalMin} minutes practised today` },
    s('svg', { viewBox: '0 0 108 108' }, s('circle', { class: 'k-track', cx: 54, cy: 54, r }), ring),
    h('div.k-face', h('span.k-min.num', String(min)), h('span.k-lbl', `of ${goalMin} min`)));
}

export function renderHome(ctx, mount) {
  const engine = ctx.engine;
  const now = ctx.now();
  let prog;
  try { prog = engine.progress({ now }); } catch (e) { console.warn(e); prog = null; }
  const state = engine.getState();
  const settings = ctx.settings();
  const stages = cur.STAGES;
  const stage = stages[(prog && prog.stageIdx) || 0] || stages[0];
  const sp = prog && prog.stages ? prog.stages.find((x) => x.id === (stage && stage.id)) : null;
  const firstLaunch = !state.placementDone && !(state.totalAnswers > 0);
  const sessionMin = settings.sessionMin || 10;
  const streak = (prog && prog.streakDays) || 0;

  const start = (mode, stageId) => {
    ctx.pendingStart = { mode, stageId };
    ctx.nav('practice');
  };

  const head = h('header.home-head',
    h('div.greet',
      h('p.wordmark', 'Tutti'),
      h('h1', greeting()),
      h('p', streak > 0 ? `${streak}-day streak. Keep it going.` : firstLaunch ? 'Short, focused sessions. Ten minutes a day is plenty.' : 'Ready when you are.')),
    knob(prog ? prog.today.ms : 0, prog ? prog.today.goalMs : settings.dailyGoalMin * 60000));

  const parts = [head];

  if (firstLaunch) {
    parts.push(placementCard(ctx, { onPlace: () => start('placement'), onZero: () => { try { engine.skipPlacement && engine.skipPlacement(); } catch { /* ignore */ } ctx.save({ flush: true }); ctx.render(); } }));
  } else if (stage) {
    const body = stageBody(stage);
    const mini = body ? renderStaff(body, { box: { w: 560, h: 150 }, maxSpace: 11, label: `Notes in ${stage.title}` }) : null;
    const progress = sp ? sp.progress : 0;
    const canTest = !!(sp && sp.canTestOut);
    const card = h('section.paper.stage-card', { 'aria-labelledby': 'stage-title' },
      h('div.eyebrow', h('span', `Stage ${stage.index + 1} of ${stages.filter((x) => !x.optional).length}`), h('span', stage.short || '')),
      h('h2#stage-title', stage.title),
      h('p.desc', stage.description || ''),
      mini ? h('div.mini-staff', mini) : null,
      h('div.prog', h('div.bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-label': 'Stage progress' }, h('i', { style: { width: pct(progress) } })), h('span.num', pct(progress))),
      h('div.home-actions',
        h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => start('practice') }, `Start ${sessionMin}-minute session`),
        h('div.row',
          h('button.btn', { type: 'button', disabled: !canTest, title: canTest ? '' : 'One test-out attempt per stage per day', onclick: () => confirmTestOut(stage, () => start('testout', stage.id)) }, 'Test out'),
          h('button.btn', { type: 'button', disabled: !(state.totalAnswers > 0), onclick: () => start('review') }, 'Quick review'))));
    parts.push(card);
  }

  if (prog && !firstLaunch) {
    const last = prog.sessions && prog.sessions[prog.sessions.length - 1];
    parts.push(h('div.stats-row',
      h('div.stat', h('b.num', String(prog.totalAnswers || 0)), h('span', 'notes read')),
      h('div.stat', h('b.num', last && last.medianRtMs ? (last.medianRtMs / 1000).toFixed(1) + ' s' : '–'), h('span', 'last median time')),
      h('div.stat', h('b.num', String(streak)), h('span', streak === 1 ? 'day streak' : 'days streak'))));
  }

  mount.append(h('div.home', parts));
}

function confirmTestOut(stage, go) {
  const n = stage.kind === 'chord' ? 15 : 12;
  openDialog({
    title: `Test out of ${stage.title}?`,
    body: h('div', h('p', `${n} prompts, no hints. Get 90% right at a steady pace and the stage is marked passed.`), h('p', 'If it does not go well, nothing is lost. One attempt per day.')),
    actions: [{ label: 'Start test-out', value: true, kind: 'primary' }, { label: 'Not now', value: false, kind: 'quiet' }],
  }).then((v) => { if (v) go(); });
}

export { pretty };
