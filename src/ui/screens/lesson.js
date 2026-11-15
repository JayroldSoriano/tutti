// Lesson runner (PLAN-LESSONS 4.6): one step mounted at a time over a shared keyboard.
// env.done(result) -> recordStep -> engine.setLessons -> ctx.save() -> next step. Before the recap:
// completeLesson -> setLessons -> passStages + markLessonDay when passed -> save(flush) -> recap.
import { h, s, clear } from '../h.js';
import { createKeyboard } from '../keyboard.js';
import { openDialog, toast, announce, dialogOpen } from '../dialog.js';
import { name as nameOf, pretty } from '../music.js';
import { LESSONS, getLesson, taughtThrough } from '../../lessons.js';
import { SONGS } from '../../songs.js';
import {
  nextUp, beginLesson, recordStep, completeLesson, buildReviewLesson,
} from '../../lessonProgress.js';
import * as concept from '../lesson/steps/concept.js';
import * as tip from '../lesson/steps/tip.js';
import * as demo from '../lesson/steps/demo.js';
import * as guided from '../lesson/steps/guided.js';
import * as findKey from '../lesson/steps/find-key.js';
import * as nameIt from '../lesson/steps/name-it.js';
import * as landmark from '../lesson/steps/landmark-distance.js';
import * as mnemonic from '../lesson/steps/mnemonic.js';
import * as flash from '../lesson/steps/flash.js';
import * as drill from '../lesson/steps/drill.js';
import * as melodyWait from '../lesson/steps/melody-wait.js';
import * as melodyTempo from '../lesson/steps/melody-tempo.js';
import * as progression from '../lesson/steps/progression.js';
import * as quiz from '../lesson/steps/quiz.js';
import * as recap from '../lesson/steps/recap.js';

export const STEP_MODULES = {
  concept, tip, demo, guided, 'find-key': findKey, 'name-it': nameIt, 'landmark-distance': landmark,
  mnemonic, flash, drill, 'melody-wait': melodyWait, 'melody-tempo': melodyTempo, progression, quiz, recap,
};
const SCORED = new Set(['drill', 'quiz']);
const GRADE_RANK = { skip: 0, pass: 1, ace: 2 };

export function localDay(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Synthetic step results (debug hook and QA). */
export function syntheticResult(step) {
  switch (step.type) {
    case 'concept': case 'tip': case 'demo': case 'recap': return { seen: true };
    case 'drill': case 'quiz': return { n: 10, correct: 10, acc: 1, medianRatio: 0.8, missed: [] };
    case 'melody-wait': return { passes: (step.passes || [{}]).map(() => ({ notes: 10, firstTry: 10, acc: 1 })), acc: 1 };
    case 'melody-tempo': return { onsets: 10, hit: 10, acc: 1, bpm: step.bpm || 72 };
    default: return { n: 4, firstTry: 4 };
  }
}

/** Resolve a lesson plan (core or generated) by id; `entry` for reviews. */
export function planFor(id, ls, { entry, itemStats, now } = {}) {
  if (/^L\d\d$/.test(id)) return getLesson(id) || null;
  if (id.startsWith('D:')) return buildReviewLesson({ kind: 'daily', day: id.slice(2) }, LESSONS, SONGS, ls, itemStats, { now });
  if (id.startsWith('R:')) {
    const e = entry || (ls.cur && ls.cur.id === id && ls.cur.entry) || ls.queue.find((q) => `R:${q.forLesson}:${q.attempt}` === id);
    return e ? buildReviewLesson(e, LESSONS, SONGS, ls, itemStats, { now }) : null;
  }
  return null;
}

export function renderLesson(ctx, mount) {
  const engine = ctx.engine;
  const settings = ctx.settings();
  const naming = settings.naming || 'letters';
  const sound = settings.sound !== false;
  const now0 = ctx.now();
  const today = localDay(now0);
  const pending = ctx.pendingLesson || {};
  ctx.pendingLesson = null;
  const arg = String(location.hash || '').replace(/^#/, '').split(/[&?]/)[0].split('/')[1] || '';
  let ls = engine.getLessons();
  let itemStats = {};
  try { itemStats = engine.itemStats({ now: now0 }); } catch { itemStats = {}; }

  // ---- choose the lesson
  let lesson = null, replay = false;
  const highestDone = () => Math.max(0, ...Object.keys(ls.done).map((id) => (getLesson(id) || { n: 0 }).n));
  if (arg) {
    const id = decodeURIComponent(arg);
    lesson = planFor(id, ls, { itemStats, now: now0 });
    if (!lesson) return bounce('That lesson could not be found.');
    if (/^L\d\d$/.test(id)) {
      const isCur = ls.cur && ls.cur.id === id;
      if (ls.done[id]) replay = true;
      else if (!isCur && lesson.n > highestDone() + 1) return bounce(`Lesson ${lesson.n} opens after lesson ${lesson.n - 1}.`);
    }
  } else {
    const nu = nextUp(ls, LESSONS, { now: now0, today, itemStats });
    if (nu.kind === 'core' && nu.availability === 'tomorrow' && !pending.anyway) return bounce('Today’s lesson is done. The next one opens tomorrow.', 'home');
    if (nu.kind === 'core' && nu.availability === 'tomorrow' && pending.anyway) {
      ls = { ...ls, override: today };
      engine.setLessons(ls, { now: now0 });
      ls = engine.getLessons();
    }
    lesson = nu.kind === 'resume' ? planFor(nu.lessonId, ls, { entry: nu.entry, itemStats, now: now0 })
      : nu.kind === 'core' ? getLesson(nu.lessonId)
        : buildReviewLesson(nu.entry, LESSONS, SONGS, ls, itemStats, { now: now0 });
    if (!lesson) return bounce('Could not open the lesson.', 'home');
  }
  const steps = lesson.steps || [];
  let startIndex = 0;
  let results = {};
  if (ls.cur && ls.cur.id === lesson.id) {
    startIndex = Math.min(steps.length - 1, Math.max(0, ls.cur.step || 0));
    results = { ...(ls.cur.res || {}) };
  } else {
    ls = beginLesson(ls, lesson, { now: now0, today });
    engine.setLessons(ls, { now: now0 });
    ctx.save();
  }
  // a recap can only be shown after completion; never resume straight into it
  if (steps[startIndex] && steps[startIndex].type === 'recap') startIndex = Math.max(0, startIndex - 1);

  ctx.sessionRunning = true;
  ctx.resetPaused && ctx.resetPaused();
  const taught = new Set((taughtThrough(lesson.n || 1).pitches) || []);

  // ---- DOM
  const closeBtn = h('button.btn.btn-icon.btn-quiet.l-close', { type: 'button', 'aria-label': 'Close lesson', onclick: () => askClose() },
    s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, s('path', { d: 'M6 6l12 12M18 6L6 18', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' })));
  const kindLabel = lesson.kind === 'review' ? 'Review' : lesson.kind === 'daily' ? 'Daily practice' : `Lesson ${lesson.n}`;
  const titleEl = h('p.l-title', h('b', kindLabel), h('span', lesson.title && lesson.kind !== 'daily' && lesson.kind !== 'review' ? lesson.title : (lesson.goal || '')));
  const countEl = h('span.l-count.num');
  const segs = h('div.l-segs', { role: 'progressbar', 'aria-label': 'Lesson progress', 'aria-valuemin': '1', 'aria-valuemax': String(steps.length) }, steps.map(() => h('i')));
  const top = h('header.l-top', h('div.l-row', closeBtn, titleEl, countEl), segs);
  const stage = h('main.l-stage', { id: 'lesson-stage' });
  const kb = createKeyboard({
    labels: settings.labels || 'c-only', octaves: ctx.kbOctaves || 2,
    onDown: (m, t) => { if (sound) ctx.audio.noteOn(m); deliver(m, true, t, 'touch'); },
    onUp: (m, t) => { ctx.audio.noteOff(m); deliver(m, false, t, 'touch'); },
  });
  kb.onZoom = (o) => { ctx.kbOctaves = o; setTimeout(() => handle && handle.relayout && handle.relayout(), 320); };
  const inputEl = h('div.l-input', kb.el);
  const root = h('div.lesson', top, stage, inputEl);
  mount.append(root);

  let idx = -1, handle = null, destroyed = false, completing = false, outcome = null;
  let stepStart = ctx.now(), hiddenAt = 0, hiddenMs = 0;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms); timers.add(id); return id; };

  function deliver(midi, on, t, source) {
    if (destroyed || dialogOpen() || !handle || !handle.onNote) return;
    try { handle.onNote(midi, on, t, source); } catch (e) { console.warn(e); }
  }
  ctx.noteHandler = (midi, on, t, source) => {
    if (on) { if (sound && source !== 'mic') ctx.audio.noteOn(midi); kb.press(midi, true); }
    else { ctx.audio.noteOff(midi); kb.press(midi, false); }
    deliver(midi, on, t, source);
  };
  ctx.commandHandler = (c) => {
    if (dialogOpen()) return;
    if (c === 'pause') { askClose(); return; }
    if (handle && handle.onCommand) handle.onCommand(c === 'skip' ? 'next' : c);
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = ctx.now(); if (handle && handle.pause) handle.pause(); }
    else if (hiddenAt) { hiddenMs += ctx.now() - hiddenAt; hiddenAt = 0; if (handle && handle.resume) handle.resume(); }
  };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => { if (handle && handle.relayout) handle.relayout(); };
  window.addEventListener('resize', onResize);

  function setKb(mode) {
    const hide = mode === 'hidden';
    inputEl.hidden = hide;
    root.classList.toggle('no-kb', hide);
  }

  function makeEnv(step, i) {
    let doneOnce = false;
    const env = {
      ctx, lesson, step, index: i, kb, root, audio: ctx.audio, settings, itemStats, naming, taught, results,
      outcome, nextPreview: '', recapActions: null,
      noteName: (r) => pretty(nameOf(r.midi, naming, { octave: false, accidental: r.accidental })),
      width: () => Math.max(260, (stage.querySelector('.st-body') || stage).clientWidth || stage.clientWidth || 340),
      height: () => { const b = stage.querySelector('.st-body'); return Math.max(140, (b && b.clientHeight) || 320); },
      later, say: (t) => announce(t),
      setSessionActive() {},
      refreshKb: () => setKb(handle ? handle.kb : 'play'),
      done(result) {
        if (doneOnce || destroyed || i !== idx) return;
        doneOnce = true;
        stepDone(i, result || {});
      },
    };
    return env;
  }

  function show(i) {
    if (destroyed) return;
    if (handle) { try { handle.destroy(); } catch (e) { console.warn(e); } handle = null; }
    kb.clearMarks();
    idx = i;
    const step = steps[i];
    if (!step) { goHome(); return; }
    const mod = STEP_MODULES[step.type];
    const env = makeEnv(step, i);
    if (step.type === 'recap') { env.outcome = outcome; Object.assign(env, recapEnv()); }
    clear(stage);
    try { handle = mod ? mod.mount(step, env) : null; } catch (e) { console.error(e); handle = null; }
    if (!handle) { handle = { el: h('p.st-empty', 'This step could not be shown.'), kb: 'hidden', destroy() {} }; later(() => env.done({ seen: true }), 600); }
    setKb(handle.kb || 'play');
    handle.el.classList.add('is-enter');
    stage.append(handle.el);
    stage.scrollTop = 0;
    later(() => handle && handle.el.classList.remove('is-enter'), 400);
    if (handle.focus) later(() => { try { handle.focus.focus({ preventScroll: true }); } catch { /* ignore */ } }, 60);
    updateTop();
    stepStart = ctx.now(); hiddenMs = 0;
    announce(`Step ${i + 1} of ${steps.length}: ${step.title || step.type}.`);
    exposeDebug();
  }

  function updateTop() {
    countEl.textContent = `${Math.min(idx + 1, steps.length)} / ${steps.length}`;
    [...segs.children].forEach((el, k) => { el.className = k < idx ? 'is-done' : k === idx ? 'is-now' : ''; });
    segs.setAttribute('aria-valuenow', String(idx + 1));
  }

  const finished = new Set();
  function stepDone(i, result) {
    if (finished.has(i) || destroyed) return;
    finished.add(i);
    const step = steps[i];
    const now = ctx.now();
    results[step.id] = result;
    if (step.type !== 'recap') {
      try {
        ls = recordStep(engine.getLessons(), i, result, { now, stepId: step.id });
        engine.setLessons(ls, { now });
      } catch (e) { console.warn(e); }
      if (!SCORED.has(step.type)) {
        const ms = Math.min(180000, Math.max(0, now - stepStart - hiddenMs));
        try { engine.addActiveMs(ms, { now }); } catch { /* ignore */ }
      }
      ctx.save();
    }
    const n = i + 1;
    if (n >= steps.length || steps[n].type === 'recap') {
      if (!outcome) complete();
      if (n < steps.length) later(() => show(n), 220);
      else goHome();
      return;
    }
    later(() => show(n), 220);
  }

  function complete() {
    if (completing) return;
    completing = true;
    const now = ctx.now();
    const before = engine.getLessons();
    let stats = itemStats;
    try { stats = engine.itemStats({ now }); } catch { /* ignore */ }
    let res;
    try { res = completeLesson(before, lesson, { now, today, itemStats: stats, lessons: LESSONS }); }
    catch (e) { console.warn(e); res = { state: before, outcome: { grade: 'pass', passed: true, advance: true, nextAvailability: 'now', passesStages: [], weakItems: [], insertedReview: null } }; }
    let st = res.state;
    outcome = res.outcome;
    if (replay && /^L\d\d$/.test(lesson.id)) {
      // a replay never gates or queues anything; it can only improve the grade and song scores
      st = { ...st, queue: before.queue, fails: before.fails, lastDay: before.lastDay, doneToday: before.doneToday, lastGrade: before.lastGrade };
      const prev = before.done[lesson.id];
      const nw = st.done[lesson.id];
      if (prev && (!nw || GRADE_RANK[prev.grade] >= GRADE_RANK[nw.grade])) st.done = { ...st.done, [lesson.id]: prev };
      outcome = { ...outcome, nextAvailability: 'now', insertedReview: outcome.grade === 'repeat' ? null : outcome.insertedReview };
      if (outcome.grade === 'repeat') outcome = { ...outcome, replayMiss: true };
    }
    try { engine.setLessons(st, { now }); } catch (e) { console.warn(e); }
    if (outcome.passed) {
      try { if (outcome.passesStages && outcome.passesStages.length) engine.passStages(outcome.passesStages, { now }); } catch (e) { console.warn(e); }
      try { engine.markLessonDay({ now }); } catch (e) { console.warn(e); }
    }
    ls = engine.getLessons();
    ctx.save({ flush: true });
  }

  function recapEnv() {
    const now = ctx.now();
    let nu = null;
    try { nu = nextUp(engine.getLessons(), LESSONS, { now, today, itemStats: engine.itemStats({ now }) }); } catch { nu = null; }
    const nextCore = LESSONS.find((l) => !engine.getLessons().done[l.id]);
    const nextLabel = nu && nu.kind === 'review' ? 'Start the review' : nu && nu.kind === 'core' ? `Start lesson ${(getLesson(nu.lessonId) || {}).n}` : nu && nu.kind === 'daily' ? 'Today’s piece' : 'Next lesson';
    return {
      nextPreview: nextCore ? `${nextCore.preview || nextCore.title}` : 'A daily piece to keep everything fresh.',
      recapActions: {
        nextLabel,
        anywayLabel: nextCore ? `Start lesson ${nextCore.n} anyway` : 'Start next lesson anyway',
        next: () => go('lesson'),
        home: () => goHome(),
        anyway: () => { ctx.pendingLesson = { anyway: true }; go('lesson'); },
        startReview: () => go('lesson'),
      },
    };
  }

  function go(hash) {
    if (String(location.hash).replace(/^#/, '').split(/[&?]/)[0] === hash) ctx.render();
    else location.hash = hash + (ctx.debug ? '&debug' : '');
  }
  function goHome() { go('home'); }

  function askClose() {
    if (dialogOpen()) return;
    if (outcome) { goHome(); return; }
    if (handle && handle.pause) handle.pause();
    openDialog({
      title: 'Leave the lesson?',
      body: h('p', `Your progress is kept. Next time you continue at step ${idx + 1} of ${steps.length}.`),
      actions: [{ label: 'Keep going', value: false, kind: 'primary', autofocus: true }, { label: 'Leave for now', value: true, kind: 'quiet' }],
    }).then((v) => {
      if (v) goHome();
      else if (handle && handle.resume) handle.resume();
    });
  }

  function exposeDebug() {
    if (!ctx.debug || !window.__tutti) return;
    window.__tutti.lesson = {
      id: lesson.id,
      get stepIndex() { return idx; },
      get step() { return steps[idx]; },
      get steps() { return steps; },
      get outcome() { return outcome; },
      expected() { try { return handle && handle.expected ? handle.expected() : []; } catch { return []; } },
      finishStep(result) { const st = steps[idx]; if (!st) return; stepDone(idx, result || syntheticResult(st)); },
      handle: () => handle,
    };
  }

  function bounce(msg, to = 'lessons') {
    ctx.sessionRunning = false;
    toast(msg);
    setTimeout(() => { location.hash = to + (ctx.debug ? '&debug' : ''); }, 0);
    return () => {};
  }

  show(startIndex);

  return () => {
    destroyed = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (handle) { try { handle.destroy(); } catch { /* ignore */ } }
    ctx.noteHandler = null; ctx.commandHandler = null;
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    try { kb.destroy(); } catch { /* ignore */ }
    try { ctx.audio.allOff(); } catch { /* ignore */ }
    ctx.save({ flush: true });
    ctx.sessionEnded();
    if (ctx.debug && window.__tutti) window.__tutti.lesson = null;
  };
}
