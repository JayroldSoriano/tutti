// Placement: first-launch invitation card, and the result copy used by the summary screen.
import { h } from '../h.js';
import { renderStaff } from '../staff.js';
import * as cur from '../../curriculum.js';

export function placementCard(ctx, { onPlace, onZero }) {
  const staff = renderStaff({
    kind: 'phrase', clef: 'grand',
    notes: [
      { midi: 60, staff: 'treble', dur: 'w' }, { midi: 67, staff: 'treble', dur: 'w' }, { midi: 72, staff: 'treble', dur: 'w' },
      { midi: 53, staff: 'bass', dur: 'w' }, { midi: 48, staff: 'bass', dur: 'w' }, { midi: 43, staff: 'bass', dur: 'w' },
    ],
    answer: { type: 'sequence', midis: [], given: 0 },
  }, { box: { w: 560, h: 210 }, maxSpace: 10, label: 'Landmark notes on the grand staff' });
  return h('section.paper.stage-card.placement-card', { 'aria-labelledby': 'pl-title' },
    h('h2#pl-title', 'Where should you start?'),
    h('p', 'A short check finds the first stage you cannot yet read fluently, so you never drill what you already know. About 3 minutes, up to 28 notes, no hints.'),
    h('div.mini-staff', staff),
    h('div.home-actions',
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: onPlace }, 'Find my starting stage'),
      h('button.btn.btn-block', { type: 'button', onclick: onZero }, 'I’m starting from zero')));
}

export function placementResult(summary) {
  const st = cur.getStage(summary.stageAfter);
  const idx = st ? st.index : 0;
  if (!idx) return { title: 'You start at the beginning', lead: 'Treble landmarks first: three anchor notes you will read on sight within a few sessions.' };
  return { title: `You start at ${st.title}`, lead: `${idx} stage${idx === 1 ? '' : 's'} marked as passed. Their notes will come back now and then to confirm you really own them.` };
}
