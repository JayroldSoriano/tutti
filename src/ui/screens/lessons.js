// Lesson path: units, 32 lesson nodes (done with grade mark / next / locked), inserted reviews
// inline, and the song library of unlocked songs.
import { h, s, pct } from '../h.js';
import { LESSONS, UNITS } from '../../lessons.js';
import { SONGS, getSong } from '../../songs.js';
import { nextUp, unlockedSongIds } from '../../lessonProgress.js';
import { localDay } from './lesson.js';
import { itemsText } from '../lesson/steps/recap.js';

const capFirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const REASON = { repeat: 'needs one more pass', weak: 'a few notes are shaky', away: 'welcome back' };

export function renderLessons(ctx, mount) {
  const engine = ctx.engine;
  const now = ctx.now();
  const ls = engine.getLessons();
  let itemStats = {};
  try { itemStats = engine.itemStats({ now }); } catch { /* ignore */ }
  const nu = nextUp(ls, LESSONS, { now, today: localDay(now), itemStats });
  const curId = ls.cur ? ls.cur.id : null;
  const nextCore = LESSONS.find((l) => !ls.done[l.id]);
  const doneN = Object.keys(ls.done).filter((id) => /^L\d\d$/.test(id)).length;
  const settings = ctx.settings();

  const head = h('header.page-head', h('h1', 'Lessons'), h('p', doneN ? `${doneN} of ${LESSONS.length} done. One lesson a day is plenty.` : 'Thirty-two short lessons, from middle C to hymns with both hands.'));

  const reviewRow = (e) => h('li.lp-item.is-review',
    h('span.lp-node', { 'aria-hidden': 'true' }, s('svg', { viewBox: '0 0 24 24', width: 16, height: 16 }, s('path', { d: 'M17 8a6 6 0 1 0 1.2 5', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }), s('path', { d: 'M17.5 4v4.4h-4.4', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))),
    h('div.lp-text', h('div.lp-title', 'Short review'), h('div.lp-sub', e.reason === 'repeat' && itemsText(e.focus, settings.naming) ? `${capFirst(itemsText(e.focus, settings.naming))}: ${REASON.repeat}` : REASON[e.reason] || 'focused practice')),
    h('a.btn.lp-go', { href: '#lesson' }, curId && curId.startsWith('R:') ? 'Continue' : 'Start'));

  const units = UNITS.map((u) => {
    const items = [];
    for (const id of u.lessonIds) {
      const l = LESSONS.find((x) => x.id === id);
      if (!l) continue;
      if (nextCore && l.id === nextCore.id) for (const e of ls.queue) items.push(reviewRow(e));
      const d = ls.done[l.id];
      const isNext = nextCore && l.id === nextCore.id;
      const isCur = curId === l.id;
      const state = d ? 'done' : isNext || isCur ? 'next' : 'locked';
      const grade = d ? d.grade : '';
      const sub = d ? (grade === 'ace' ? 'Aced' : grade === 'skip' ? 'Placed out' : 'Passed') + (d.acc && grade !== 'skip' ? `, checkpoint ${pct(d.acc)}` : '')
        : isCur ? `In progress: step ${(ls.cur.step || 0) + 1} of ${l.steps.length}`
          : isNext ? (nu.kind === 'core' && nu.availability === 'tomorrow' ? 'Opens tomorrow' : l.goal) : l.goal;
      const node = h('span.lp-node' + (grade ? '.g-' + grade : ''), { 'aria-hidden': 'true' }, d ? (grade === 'skip' ? '–' : '✓') : String(l.n));
      const label = `Lesson ${l.n}: ${l.title}. ${d ? sub : state === 'next' ? 'Next up' : 'Locked'}`;
      const title = h('div.lp-title', h('span.lp-n', `${l.n}`), l.title);
      const row = state === 'locked'
        ? h('li.lp-item.is-locked', { 'aria-label': label }, node, h('div.lp-text', title, h('div.lp-sub', sub)))
        : h('li.lp-item.is-' + state, node,
          h('a.lp-text', { href: '#lesson/' + l.id, 'aria-label': label }, title, h('div.lp-sub', sub)),
          state === 'next' ? h('a.btn.btn-primary.lp-go', { href: isCur ? '#lesson/' + l.id : '#lesson' + (nu.kind === 'core' && nu.availability === 'tomorrow' ? '/' + l.id : '') }, isCur ? 'Continue' : 'Start') : h('span.lp-again', 'Replay'));
      items.push(row);
    }
    const doneInUnit = u.lessonIds.filter((id) => ls.done[id]).length;
    return h('section.lp-unit', { 'aria-labelledby': 'unit-' + u.n },
      h('div.lp-unit-head', h('h2', { id: 'unit-' + u.n }, h('span.lp-unit-n', `Unit ${u.n}`), u.title), h('span.lp-unit-prog.num', `${doneInUnit} / ${u.lessonIds.length}`)),
      h('ol.lp-list', items));
  });

  // songs
  const unlocked = unlockedSongIds(ls, LESSONS, SONGS);
  const total = Object.keys(SONGS).length;
  const songs = h('section.card.songs', { 'aria-labelledby': 'songs-h' },
    h('div.lp-unit-head', h('h2#songs-h', 'Songs'), h('span.lp-unit-prog.num', `${unlocked.length} / ${total}`)),
    h('p.muted.small', unlocked.length < total ? `Play any tune you have the notes for. ${total - unlocked.length} more unlock as you go.` : 'Every tune is open.'),
    h('ul.song-list', unlocked.map((id) => getSong(id)).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title)).map((sg) => {
      const rec = ls.songs[sg.id];
      const hands = sg.parts.rh && sg.parts.lh ? 'Both hands' : sg.parts.lh ? 'Left hand' : 'Right hand';
      return h('li', h('a.song-row', { href: '#song/' + sg.id },
        h('span.song-t', sg.title),
        h('span.song-c', `${hands}. ${sg.credit}`),
        h('span.song-b.num', rec && rec.plays ? pct(rec.bestAcc) : '')));
    })));

  mount.append(h('div.lessons', head, units, songs));
}
