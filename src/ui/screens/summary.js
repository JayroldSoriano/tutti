import { h, pct } from '../h.js';
import { renderStaff } from '../staff.js';
import { pretty } from '../music.js';
import * as cur from '../../curriculum.js';
import { placementResult } from './placement.js';

const secs = (ms) => (ms > 0 ? (ms / 1000).toFixed(1) + ' s' : '–');

export function renderSummary(ctx, mount, sm, { onAgain } = {}) {
  let prev = null;
  try {
    const pr = ctx.engine.progress({ now: ctx.now() });
    const ss = pr.sessions || [];
    prev = sm.answers > 0 ? ss[ss.length - 2] : ss[ss.length - 1];
  } catch { /* ignore */ }

  const label = (id) => pretty((cur.ITEMS[id] && cur.ITEMS[id].label) || id);
  const stBefore = cur.getStage(sm.stageBefore), stAfter = cur.getStage(sm.stageAfter);
  const moved = stBefore && stAfter && stAfter.index > stBefore.index;
  const isRhythm = stAfter && stAfter.kind === 'rhythm';

  let title = 'Session complete', lead = '';
  if (sm.mode === 'placement') ({ title, lead } = placementResult(sm));
  else if (sm.mode === 'testout') {
    const passed = sm.testoutPassed != null ? sm.testoutPassed : moved;
    title = passed ? `${stBefore ? stBefore.title : 'Stage'} passed` : 'Not this time';
    lead = passed ? 'Those items are now part of your review mix.' : 'Nothing is lost. The notes you missed will come up more often in practice.';
  } else if (sm.mode === 'review') title = 'Review done';
  if (!lead) {
    lead = sm.answers
      ? `${sm.correct} of ${sm.answers} correct${sm.medianRtMs && !isRhythm ? `, typically ${secs(sm.medianRtMs)} per prompt` : ''}.`
      : 'No answers this time. Even two minutes counts, so come back soon.';
  }

  const delta = prev && prev.medianRtMs && sm.medianRtMs ? sm.medianRtMs - prev.medianRtMs : null;
  const deltaEl = delta != null && Math.abs(delta) >= 50
    ? h('span.delta' + (delta < 0 ? '.up' : '.down'), `${(Math.abs(delta) / 1000).toFixed(1)} s ${delta < 0 ? 'faster' : 'slower'}`)
    : null;

  const stats = h('div.big-stats',
    h('div.big-stat', h('b.num', pct(sm.accuracy || 0)), h('span', 'accuracy')),
    h('div.big-stat', h('b.num', secs(sm.medianRtMs)), h('span', 'median time '), deltaEl),
    h('div.big-stat', h('b.num', String(sm.bestStreak || 0)), h('span', 'best run in a row')),
    h('div.big-stat', h('b.num', String(sm.streakDays || 0)), h('span', sm.dailyGoalMet ? 'day streak, goal met today' : 'day streak')));

  const parts = [h('header', h('h1', title), h('p.lead', lead)), stats];

  if (stAfter) {
    parts.push(h('section.card.stack',
      h('div.setting-head', h('span.lbl', moved ? `Moved up to ${stAfter.title}` : stAfter.title), h('span.num.muted', pct(sm.stageProgress || 0))),
      h('div.bar', { role: 'progressbar', 'aria-label': 'Stage progress', 'aria-valuenow': String(Math.round((sm.stageProgress || 0) * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: { width: pct(sm.stageProgress || 0) } }))));
  }

  if ((sm.itemsMastered || []).length) {
    parts.push(h('h2.section-title', 'Mastered'), h('ul.list-plain', sm.itemsMastered.map((id) => h('li', label(id)))));
  }
  if ((sm.itemsIntroduced || []).length) {
    parts.push(h('h2.section-title', 'New this session'), h('ul.list-plain', sm.itemsIntroduced.map((id) => h('li', label(id)))));
  }
  const weak = (sm.weakest || []).filter((id) => cur.ITEMS[id]).slice(0, 3);
  if (weak.length) {
    parts.push(h('h2.section-title', 'Worth another look'));
    parts.push(h('div.weak-list', weak.map((id) => {
      let body = null;
      try { let k = 0; body = cur.realize(cur.ITEMS[id], () => [0.3, 0.6, 0.1][k++ % 3]); } catch { /* ignore */ }
      const art = body ? renderStaff(body.kind === 'note' && body.clef === 'grand' ? { ...body, clef: body.notes[0].staff } : body, { box: { w: 150, h: 104 }, maxSpace: 8, label: label(id) }) : null;
      return h('div.paper.weak', art, h('span', label(id)));
    })));
  }

  parts.push(h('div.home-actions',
    sm.mode === 'placement' || sm.mode === 'testout'
      ? h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => { ctx.pendingStart = { mode: 'practice' }; onAgain ? onAgain() : ctx.nav('practice'); } }, 'Start practising')
      : h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => onAgain && onAgain() }, 'Again'),
    h('button.btn.btn-block', { type: 'button', onclick: () => ctx.nav('home') }, 'Done')));

  const wrap = h('div.summary.main-pad', parts);
  mount.append(wrap);
}
