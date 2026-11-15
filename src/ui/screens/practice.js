// Practice loop (PLAN 4.6): draw -> collect -> answer -> feedback -> next.
import { h, s, clear, nowMs } from '../h.js';
import { createKeyboard, createNamePad } from '../keyboard.js';
import { openDialog, toast, dialogOpen } from '../dialog.js';
import { pretty } from '../music.js';
import { createPromptRunner } from '../promptRunner.js';
import * as cur from '../../curriculum.js';
import { renderSummary } from './summary.js';

const MODE_LABEL = { review: 'Quick review', testout: 'Test-out', placement: 'Placement', lesson: 'Today’s notes' };

export function renderPractice(ctx, mount) {
  const engine = ctx.engine;
  const settings = ctx.settings();
  const req = ctx.pendingStart || { mode: 'practice' };
  ctx.pendingStart = null;
  ctx.resetPaused();
  const mode = req.mode || 'practice';
  const inputMode = settings.inputMode || 'keys';
  const naming = settings.naming || 'letters';
  const sound = settings.sound !== false;
  const lengthMs = mode === 'review' ? 3 * 60000 : mode === 'practice' ? (settings.sessionMin || 10) * 60000 : mode === 'lesson' ? 5 * 60000 : undefined;

  let res;
  try {
    res = mode === 'lesson'
      ? engine.startSession({ mode: 'lesson', itemIds: req.itemIds || [], count: 30, min: 30, hints: 'auto', stopEarly: false, retries: true, now: ctx.now(), inputMode, tzOffsetMin: new Date().getTimezoneOffset() })
      : engine.startSession({ mode, stageId: req.stageId, lengthMs, now: ctx.now(), inputMode, tzOffsetMin: new Date().getTimezoneOffset() });
  } catch (e) { console.warn(e); res = { ok: false, reason: 'error' }; }
  if (res && res.ok === false) return renderUnavailable(ctx, mount, mode, res.reason);

  ctx.sessionRunning = true;
  const sessionStart = ctx.now();
  const results = [];
  let answersSinceSave = 0;
  let sessionOver = false;
  const paceShown = {};
  let destroyed = false;
  let done = false;
  const queuedDialogs = [];
  let testoutPassed = null;

  // ---- DOM
  const pauseBtn = h('button.btn.btn-icon.btn-quiet', { type: 'button', 'aria-label': 'Pause', onclick: () => pause() },
    s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, s('rect', { x: 6.5, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }), s('rect', { x: 13.9, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' })));
  const timeFill = h('i');
  const timebar = h('div.timebar', { role: 'progressbar', 'aria-label': 'Session time', 'aria-valuemin': '0', 'aria-valuemax': '100' }, timeFill);
  const dots = h('div.dots', { 'aria-label': 'Last answers' });
  const top = h('div.p-top', pauseBtn, MODE_LABEL[mode] ? h('span.mode-lbl', MODE_LABEL[mode]) : null, timebar, dots);

  let runner = null;
  const kb = inputMode === 'names'
    ? createNamePad({ naming, onPick: (m, t) => { if (sound) { ctx.audio.noteOn(m); setTimeout(() => ctx.audio.noteOff(m), 260); } input(m, t); } })
    : createKeyboard({
      labels: settings.labels || 'c-only',
      octaves: ctx.kbOctaves || 2,
      onDown: (m, t) => { if (sound) ctx.audio.noteOn(m); input(m, t); },
      onUp: (m) => ctx.audio.noteOff(m),
    });
  kb.onZoom = (o) => { ctx.kbOctaves = o; };
  function input(m, t, isTap) { if (!destroyed && !dialogOpen() && runner) runner.handleInput(m, t, isTap); }

  runner = createPromptRunner({
    ctx, engine, kb, mode, settings,
    onAnswer: ({ correct }) => {
      addDot(correct);
      if (++answersSinceSave >= 20) { answersSinceSave = 0; ctx.save(); }
    },
    onEvents: (events, fb) => { if (fb && fb.sessionOver) sessionOver = true; handleEvents(events); },
    beforeNext: () => (queuedDialogs.length ? queuedDialogs.shift()() : null),
    isOver: () => sessionOver,
    onProgress: (q) => {
      if (mode === 'testout' || mode === 'placement') {
        const total = mode === 'testout' ? (q.kind === 'chord' ? 15 : 12) : 28;
        const f = Math.min(1, (q.index + 1) / total);
        timeFill.style.width = (f * 100) + '%';
      }
    },
    onFinish: () => finish(),
  });
  const inputEl = h('div.p-input', kb.el, runner.tapPad);
  const wrap = h('div.practice', top, runner.card, runner.status, inputEl);
  mount.append(wrap);

  // external inputs (MIDI / mic / desktop keys)
  ctx.noteHandler = (midi, on, t) => {
    if (on) { if (sound && inputMode !== 'mic') ctx.audio.noteOn(midi); kb.press(midi, true); input(midi, t); }
    else { ctx.audio.noteOff(midi); kb.press(midi, false); }
  };
  ctx.commandHandler = (c) => {
    if (dialogOpen()) return;
    if (c === 'pause') pause();
    else if (c === 'hint') runner.showHint();
    else if (c === 'skip') { if (runner.phase === 'answer') runner.skip(); else if (runner.phase === 'rhythm-ready') runner.handleInput(71, nowMs(), true); }
  };

  const tick = setInterval(() => {
    if (lengthMs) {
      const f = Math.min(1, (ctx.now() - sessionStart) / lengthMs);
      timeFill.style.width = (f * 100).toFixed(1) + '%';
      timebar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    }
  }, 500);

  const onVis = () => { if (document.visibilityState === 'hidden' && !dialogOpen() && !done) pause(); };
  document.addEventListener('visibilitychange', onVis);

  function addDot(ok) {
    results.push(ok);
    clear(dots);
    for (const r of results.slice(-10)) dots.appendChild(h('i' + (r ? '.ok' : '.bad')));
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'testout-result') testoutPassed = !!ev.passed;
      if (ev.type === 'item-mastered') {
        const it = cur.ITEMS[ev.itemId];
        toast(`Mastered: ${pretty(it ? it.label : ev.itemId)}`, { tone: 'brass' });
      } else if (ev.type === 'stage-passed' && mode !== 'placement' && mode !== 'testout') {
        queuedDialogs.push(() => stagePassedDialog(ev));
      } else if (ev.type === 'step-back') {
        const st = cur.getStage(ev.toStageId);
        toast(`Revisiting ${st ? st.title : 'the previous stage'} for a few prompts.`);
      } else if (ev.type === 'step-back-over') {
        toast('Back to the current stage.');
      } else if (ev.type === 'pace' && !paceShown[ev.dir]) {
        paceShown[ev.dir] = true;
        toast(ev.dir === 'up' ? 'Good pace. Mixing in more variety.' : 'Slowing down to consolidate.');
      }
    }
  }

  function stagePassedDialog(ev) {
    const st = cur.getStage(ev.stageId);
    const nextStage = st ? cur.STAGES.find((x) => x.index === st.index + 1 && !x.optional) : null;
    const why = ev.via === 'fast-path' ? 'You read these quickly and accurately, so the rest of the drill is skipped.' : 'Every note here is now fluent.';
    ctx.save();
    return openDialog({
      title: `${st ? st.title : 'Stage'} passed`,
      body: h('div', h('p', why), nextStage ? h('p', `Next up: ${nextStage.title}.`) : null),
      actions: [{ label: 'Keep going', value: 'go', kind: 'primary' }, { label: 'End session', value: 'end', kind: 'quiet' }],
      dismissable: true,
    }).then((v) => { if (v === 'end') sessionOver = true; });
  }

  // ---- pause
  let pausing = false;
  function pause() {
    if (pausing || done) return;
    pausing = true;
    const t = Date.now();
    const canSkip = runner.phase === 'answer';
    runner.pause();
    openDialog({
      title: 'Paused',
      body: h('p', 'The clock is stopped. Take your time.'),
      actions: [
        { label: 'Resume', value: 'resume', kind: 'primary' },
        canSkip ? { label: 'Skip this one', value: 'skip', kind: 'quiet' } : null,
        { label: 'End session', value: 'end', kind: 'quiet' },
      ].filter(Boolean),
    }).then((v) => {
      pausing = false;
      ctx.addPaused(Date.now() - t);
      if (destroyed) return;
      if (v === 'end') { runner.finish(); return; }
      if (v === 'skip' && runner.phase === 'answer') { runner.skip(); return; }
      runner.resume();
    });
  }

  // ---- end
  function finish() {
    if (done || destroyed) return;
    done = true;
    let summary = null;
    try { summary = engine.endSession({ now: ctx.now() }); } catch (e) { console.warn(e); }
    ctx.save({ flush: true });
    ctx.sessionEnded();
    teardownInputs();
    document.getElementById('app').classList.remove('is-practice');
    clear(mount);
    renderSummary(ctx, mount, { ...(summary || {}), testoutPassed }, {
      onAgain: () => { ctx.pendingStart = { mode: mode === 'review' ? 'review' : 'practice' }; document.getElementById('app').classList.add('is-practice'); ctx.render(); },
    });
    window.scrollTo(0, 0);
  }

  function teardownInputs() {
    ctx.noteHandler = null; ctx.commandHandler = null; ctx.currentPrompt = null;
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVis);
    try { runner.destroy(); } catch { /* ignore */ }
    try { kb.destroy(); } catch { /* ignore */ }
    try { ctx.audio.allOff(); } catch { /* ignore */ }
  }

  runner.start();

  return () => {
    // leaving the route mid-session ends it (progress is kept)
    if (!done) {
      done = true;
      try { engine.endSession({ now: ctx.now() }); } catch { /* ignore */ }
      ctx.save({ flush: true });
      ctx.sessionEnded();
      teardownInputs();
    }
    destroyed = true;
  };
}

function renderUnavailable(ctx, mount, mode, reason) {
  document.getElementById('app').classList.remove('is-practice');
  const copy = mode === 'testout'
    ? ['Test-out used for today', 'Each stage allows one test-out attempt per day. Practise normally and try again tomorrow.']
    : mode === 'placement'
      ? ['Placement already done', 'Your starting stage is set. Head home to keep practising.']
      : ['Could not start a session', reason ? `Reason: ${reason}.` : 'Try again from the home screen.'];
  mount.append(h('div.summary',
    h('h1', copy[0]), h('p.lead', copy[1]),
    h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => ctx.nav('home') }, 'Back to home')));
  return null;
}
