// recap: grade as a calm mark, notes learned on a mini staff, song result, streak, tomorrow's
// preview, and buttons by outcome.
import { h, s, shell, primaryBtn, quietBtn, renderStaff, pretty, cur } from '../common.js';
import { staffBody } from '../kit.js';
import { getSong } from '../../../songs.js';
import { name as nameOf } from '../../music.js';

const parseRef = (id) => { const m = /^n:([tb]):(\d+)$/.exec(id); return m ? { midi: +m[2], staff: m[1] === 't' ? 'treble' : 'bass' } : null; };

export function itemsText(ids, naming = 'letters') {
  const names = [];
  for (const id of ids || []) {
    const r = parseRef(id);
    let nm = r ? pretty(nameOf(r.midi, naming, { octave: false })) : pretty((cur.ITEMS[id] && (cur.ITEMS[id].hint && cur.ITEMS[id].hint.name || cur.ITEMS[id].label)) || '');
    if (!r && nm && !/^[A-G]([♯♭]|\b)/.test(nm)) nm = nm.charAt(0).toLowerCase() + nm.slice(1);
    if (nm && !names.includes(nm)) names.push(nm);
  }
  if (!names.length) return '';
  const list = names.slice(0, 4);
  return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function mark(grade) {
  const g = s('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (grade === 'ace') {
    g.append(s('circle', { class: 'rc-ring', cx: 40, cy: 40, r: 34, 'stroke-width': 3 }), s('circle', { class: 'rc-ring', cx: 40, cy: 40, r: 27, 'stroke-width': 1.6 }),
      s('path', { class: 'rc-check', d: 'M27 41l9 9 17-20', 'stroke-width': 4 }));
  } else if (grade === 'repeat') {
    g.append(s('circle', { class: 'rc-ring is-open', cx: 40, cy: 40, r: 32, 'stroke-width': 2.4, 'stroke-dasharray': '6 5' }),
      s('path', { class: 'rc-check', d: 'M52 30a15 15 0 1 0 3 12', 'stroke-width': 3 }), s('path', { class: 'rc-check', d: 'M53 22v9h-9', 'stroke-width': 3 }));
  } else {
    g.append(s('circle', { class: 'rc-ring', cx: 40, cy: 40, r: 32, 'stroke-width': 2.6 }), s('path', { class: 'rc-check', d: 'M28 41l8 8 16-19', 'stroke-width': 3.6 }));
  }
  return s('svg', { class: 'rc-mark', viewBox: '0 0 80 80', width: 72, height: 72, 'aria-hidden': 'true' }, g);
}

export function mount(step, env) {
  const out = env.outcome || { grade: 'pass', passed: true };
  const lesson = env.lesson;
  const grade = out.grade;
  const kind = lesson.kind || 'core';
  const title = out.replayMiss ? 'Practice run' : grade === 'ace' ? 'Aced' : grade === 'repeat' ? 'One more pass' : kind === 'daily' ? 'Practice done' : 'Passed';
  const focusTxt = out.insertedReview && out.insertedReview.reason === 'repeat' ? itemsText(out.insertedReview.focus, env.naming) : '';
  const lead = out.replayMiss ? 'A few notes slipped this time. This was a replay, so your path is unchanged; the misses will show up in your warm-ups.'
    : grade === 'ace' ? 'Clean and quick. The next lesson is open now.'
    : grade === 'repeat' ? (focusTxt ? `${cap(focusTxt)} ${focusTxt.includes(' and ') ? 'need' : 'needs'} one more pass. A short review comes first; it takes about 8 minutes.` : 'A few notes need one more pass. A short review comes first; it takes about 8 minutes.')
      : kind === 'daily' ? 'Everything stays fresh when you play a little every day.'
        : out.relaxed ? 'Passed. The shaky notes will come back in your warm-ups.' : 'Good work. Let it settle overnight; spacing helps it stick.';

  // notes learned
  const teaches = (lesson.teaches || []).filter((r) => Number.isFinite(r.midi));
  const focusRefs = (lesson.items || []).map(parseRef).filter(Boolean);
  const refs = teaches.length ? teaches : kind === 'review' ? focusRefs : [];
  let staff = null;
  if (refs.length) {
    staff = renderStaff(staffBody(refs.slice(0, 8)), { label: 'Notes learned: ' + refs.map((r) => pretty(nameOf(r.midi, env.naming, { octave: false }))).join(', ') });
    staff.classList.add('rc-staff');
  }
  // song result
  const res = env.results || {};
  let song = null;
  for (const st of lesson.steps || []) {
    if (st.type !== 'melody-wait') continue;
    const r = res[st.id];
    if (r && Number.isFinite(r.acc) && (!song || r.acc >= song.acc)) song = { id: st.songId, acc: r.acc };
  }
  const sObj = song && getSong(song.id);
  let prog = null;
  try { prog = env.ctx.engine.progress({ now: env.ctx.now() }); } catch { prog = null; }
  const streak = prog ? prog.streakDays || 0 : 0;
  const preview = env.nextPreview || '';

  const facts = h('dl.rc-facts',
    sObj ? h('div', h('dt', 'Tune'), h('dd', `${sObj.title}: ${Math.round(song.acc * 100)}% first time`)) : null,
    h('div', h('dt', 'Streak'), h('dd', streak ? `${streak} day${streak === 1 ? '' : 's'}` : 'Starts today')),
    preview && grade !== 'repeat' ? h('div', h('dt', grade === 'ace' ? 'Next' : 'Tomorrow'), h('dd', preview)) : null);

  const a = env.recapActions || {};
  let primary, secondary;
  if (out.replayMiss) {
    primary = primaryBtn('Done for today', () => a.home && a.home());
    secondary = quietBtn('Back to the lesson path', () => { location.hash = 'lessons'; });
  } else if (grade === 'repeat') {
    primary = primaryBtn('Start the 8-minute review', () => a.startReview && a.startReview());
    secondary = quietBtn('Later', () => a.home && a.home());
  } else if (kind === 'daily') {
    primary = primaryBtn('Done for today', () => a.home && a.home());
  } else if (out.nextAvailability === 'now') {
    primary = primaryBtn(a.nextLabel || 'Next lesson', () => a.next && a.next());
    secondary = quietBtn('Done for today', () => a.home && a.home());
  } else {
    primary = primaryBtn('Done for today', () => a.home && a.home());
    secondary = quietBtn(a.anywayLabel || 'Start next lesson anyway', () => a.anyway && a.anyway());
  }
  const body = [
    h('div.rc-head', mark(grade), h('div', h('p.rc-grade', title), h('p.rc-lead', lead))),
    staff ? h('div.rc-notes', h('p.rc-label', kind === 'review' ? 'Notes you sharpened' : 'Notes you learned'), staff) : null,
    facts,
  ];
  const sh = shell({ ...step, title: lesson.title ? `${kind === 'core' ? 'Lesson ' + lesson.n + ': ' : ''}${lesson.title}` : 'Recap', purpose: '' }, { cls: 'st-recap', body, foot: h('div.st-actions.is-stack', primary, secondary || null) });
  env.say(`${title}. ${lead}`);
  return {
    el: sh.el, kb: 'hidden', focus: primary,
    onCommand(c) { if (c === 'next') primary.click(); },
    destroy() {},
  };
}
