import { h, s, pct } from '../h.js';
import { renderStaff } from '../staff.js';
import * as cur from '../../curriculum.js';
import { pretty } from '../music.js';
import { openDialog } from '../dialog.js';
import { LESSONS, getLesson } from '../../lessons.js';
import { nextUp, placeOut } from '../../lessonProgress.js';
import { localDay } from './lesson.js';
import { itemsText } from '../lesson/steps/recap.js';

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
  const today = localDay(now);
  let prog;
  try { prog = engine.progress({ now }); } catch (e) { console.warn(e); prog = null; }
  let state = engine.getState();
  const settings = ctx.settings();
  const stages = cur.STAGES;
  const stage = stages[(prog && prog.stageIdx) || 0] || stages[0];
  const sp = prog && prog.stages ? prog.stages.find((x) => x.id === (stage && stage.id)) : null;
  const streak = (prog && prog.streakDays) || 0;

  // v1 learners: place them on the lesson path once, from the stages they already passed
  if (!state.lessons && (state.placementDone || state.totalAnswers > 0)) {
    try {
      const passed = (prog ? prog.stages : []).filter((x) => x.status === 'passed').map((x) => x.id);
      engine.setLessons(placeOut(engine.getLessons(), LESSONS, passed, { now }), { now });
      ctx.save();
      state = engine.getState();
    } catch (e) { console.warn(e); }
  }
  const ls = engine.getLessons();
  let itemStats = {};
  try { itemStats = engine.itemStats({ now }); } catch { /* ignore */ }
  const nu = nextUp(ls, LESSONS, { now, today, itemStats });
  const firstLaunch = !state.placementDone && !(state.totalAnswers > 0) && !Object.keys(ls.done).length && !ls.cur;
  const lessonsToday = (prog && prog.today && prog.today.lessons) || 0;

  const start = (mode, stageId, extra) => {
    ctx.pendingStart = { mode, stageId, ...(extra || {}) };
    ctx.nav('practice');
  };
  const goLesson = (anyway) => { if (anyway) ctx.pendingLesson = { anyway: true }; ctx.nav('lesson'); };

  const head = h('header.home-head',
    h('div.greet',
      h('p.wordmark', 'Tutti'),
      h('h1', greeting()),
      h('p', streak > 0 ? `${streak}-day streak. Keep it going.` : firstLaunch ? 'Short daily lessons that teach you to read and play by sight.' : 'Ready when you are.')),
    h('div.home-knob', knob(prog ? prog.today.ms : 0, prog ? prog.today.goalMs : settings.dailyGoalMin * 60000),
      lessonsToday ? h('p.knob-tick', h('span', { 'aria-hidden': 'true' }, '✓'), 'Lesson done today') : null));

  const parts = [head];
  parts.push(firstLaunch ? firstCard(ctx, engine) : lessonCard(ctx, ls, nu, goLesson, start));

  if (!firstLaunch && stage) {
    const canTest = !!(sp && sp.canTestOut);
    parts.push(h('section.home-more', { 'aria-label': 'More practice' },
      h('p.home-more-title', 'Practice on your own'),
      h('div.home-more-row',
        h('button.btn', { type: 'button', onclick: () => start('practice') }, 'Free practice'),
        h('button.btn', { type: 'button', disabled: !(state.totalAnswers > 0), onclick: () => start('review') }, 'Quick review'),
        h('button.btn', { type: 'button', disabled: !canTest, title: canTest ? '' : 'One test-out attempt per stage per day', onclick: () => confirmTestOut(stage, () => start('testout', stage.id)) }, 'Test out'))));
  }
  mount.append(h('div.home', parts));
}

function estMinutes(lesson) { return Math.max(5, Math.min(15, Math.round((lesson.steps || []).length * 0.8))); }

function teachStaff(lesson) {
  const refs = (lesson.teaches || []).filter((r) => Number.isFinite(r.midi));
  if (!refs.length) return null;
  const staves = new Set(refs.map((r) => r.staff));
  const clef = staves.size > 1 ? 'grand' : [...staves][0];
  return renderStaff({ kind: 'phrase', clef, notes: refs.map((r) => ({ midi: r.midi, staff: r.staff, accidental: r.accidental, dur: 'w' })), answer: { type: 'sequence', midis: [], given: 0 } },
    { box: { w: 560, h: clef === 'grand' ? 190 : 130 }, maxSpace: 11, label: 'Notes this lesson teaches: ' + refs.map((r) => pretty(cur.noteName(r.midi, 'letters', { accidental: r.accidental }))).join(', ') });
}

function lessonCard(ctx, ls, nu, goLesson, start) {
  const plan = /^L\d\d$/.test(nu.lessonId) ? getLesson(nu.lessonId) : null;
  const total = LESSONS.length;
  let eyebrow, title, desc, staff = null, btn, extra = null, check = null;
  if (nu.kind === 'resume') {
    const l = plan || { title: nu.lessonId.startsWith('R:') ? 'Short review' : 'Daily practice', steps: [] };
    const n = (l.steps || []).length;
    eyebrow = plan ? `Lesson ${plan.n} of ${total}` : 'In progress';
    title = l.title; desc = plan ? plan.goal : 'Pick up where you left off.';
    staff = plan ? teachStaff(plan) : null;
    btn = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => goLesson() }, n ? `Continue lesson (step ${Math.min(n, nu.stepIndex + 1)} of ${n})` : 'Continue lesson');
  } else if (nu.kind === 'review') {
    const forL = nu.entry ? getLesson(nu.entry.forLesson) : null;
    const focus = nu.entry ? itemsText(nu.entry.focus, ctx.settings().naming) : '';
    eyebrow = 'Short review';
    title = nu.reason === 'away' ? 'Welcome back' : nu.reason === 'weak' ? 'Shore up a few notes' : `${forL ? 'Lesson ' + forL.n + ', ' : ''}one more pass`;
    desc = nu.reason === 'repeat' ? `${focus ? focus.charAt(0).toUpperCase() + focus.slice(1) : 'A few notes'} ${focus.includes(' and ') ? 'need' : 'needs'} one more pass. About 8 minutes.` : nu.reason === 'away' ? 'A quick refresher on what you learned before the break.' : 'A few notes have been slipping. A focused 8 minutes fixes that.';
    const line = nu.reason === 'repeat' ? 'one more pass' : nu.reason === 'away' ? 'welcome back' : 'shaky notes';
    btn = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => goLesson() }, `Start review: ${line}`);
  } else if (nu.kind === 'core' && nu.availability === 'tomorrow') {
    const last = Object.entries(ls.done).filter(([id]) => /^L\d\d$/.test(id)).sort((a, b) => b[1].at - a[1].at)[0];
    const lastL = last ? getLesson(last[0]) : null;
    eyebrow = `Lesson ${plan.n} of ${total}`;
    check = h('p.lc-done', h('span.lc-tick', { 'aria-hidden': 'true' }, '✓'), lastL ? `Lesson ${lastL.n} done for today` : 'Today’s lesson is done');
    title = `Tomorrow: ${plan.title}`;
    desc = 'Let today’s notes settle overnight. A few minutes of review now makes tomorrow easier.';
    const items = lastL && lastL.items.length ? lastL.items : (lastL ? lastL.teaches.map((t) => t.itemId).filter(Boolean) : []);
    btn = h('button.btn.btn-primary.btn-block', { type: 'button', disabled: !items.length, onclick: () => start('lesson', undefined, { itemIds: items }) }, 'Practice today’s notes (5 min)');
    extra = h('button.link-btn', { type: 'button', onclick: () => goLesson(true) }, `Start lesson ${plan.n} anyway`);
  } else if (nu.kind === 'core') {
    eyebrow = `Lesson ${plan.n} of ${total}`;
    title = plan.title; desc = plan.goal;
    staff = teachStaff(plan);
    btn = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => goLesson() }, `Start lesson ${plan.n}`);
  } else {
    eyebrow = 'All 32 lessons done';
    title = 'Today’s piece'; desc = 'A warm-up and two tunes you have not played in a while. Ten minutes keeps it all fresh.';
    btn = h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => goLesson() }, 'Today’s piece');
  }
  const minutes = plan && nu.kind !== 'review' && !(nu.kind === 'core' && nu.availability === 'tomorrow') ? `about ${estMinutes(plan)} min, ${plan.steps.length} steps` : nu.kind === 'review' ? 'about 8 min' : '';
  return h('section.paper.lesson-card', { 'aria-labelledby': 'lc-title' },
    h('div.eyebrow', h('span', eyebrow), minutes ? h('span', minutes) : null),
    check,
    h('h2#lc-title', title),
    h('p.desc', desc),
    staff ? h('div.mini-staff', staff) : null,
    nu.softCap ? h('p.lc-soft', 'Three lessons today already. Spacing beats cramming; tomorrow will stick better.') : null,
    h('div.home-actions', btn, extra));
}

function firstCard(ctx, engine) {
  const staff = teachStaff(getLesson('L01'));
  return h('section.paper.lesson-card.is-first', { 'aria-labelledby': 'lc-title' },
    h('div.eyebrow', h('span', 'Lesson 1 of 32'), h('span', 'about 12 min')),
    h('h2#lc-title', 'Start with middle C'),
    h('p.desc', 'Find your way around the keyboard, read your first three notes and play a real tune today. Each lesson teaches, then lets you try, then checks.'),
    staff ? h('div.mini-staff', staff) : null,
    h('div.home-actions',
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => { try { engine.skipPlacement && engine.skipPlacement(); } catch { /* ignore */ } ctx.save(); ctx.nav('lesson'); } }, 'Start lesson 1'),
      h('button.btn.btn-block', { type: 'button', onclick: () => { ctx.pendingStart = { mode: 'placement' }; ctx.nav('practice'); } }, 'I can already read some music')));
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
