// Practice loop (PLAN 4.6): draw -> collect -> answer -> feedback -> next.
import { h, s, clear, nowMs, reducedMotion } from '../h.js';
import { renderStaff, setNoteState } from '../staff.js';
import { createKeyboard, createNamePad } from '../keyboard.js';
import { openDialog, toast, announce, dialogOpen } from '../dialog.js';
import { name as noteNameOf, pretty, pc } from '../music.js';
import * as cur from '../../curriculum.js';
import { renderSummary } from './summary.js';

const INSTR = {
  note: 'Play this note',
  interval: 'First key is lit. Play the second note.',
  dyad: 'Play both notes together',
  hands: 'One note in each hand, together',
  chord: 'Play the whole chord',
  rhythm: 'Tap the rhythm on any key',
  phrase: 'Play the phrase, left to right',
};
const CHIP = { new: ['New', ''], due: ['Due for review', '.chip-quiet'], retry: ['Once more', ''], review: ['Review', '.chip-quiet'] };
const MODE_LABEL = { review: 'Quick review', testout: 'Test-out', placement: 'Placement' };

export function renderPractice(ctx, mount) {
  const engine = ctx.engine;
  const settings = ctx.settings();
  const req = ctx.pendingStart || { mode: 'practice' };
  ctx.pendingStart = null;
  ctx.resetPaused();
  const mode = req.mode || 'practice';
  const inputMode = settings.inputMode || 'keys';
  const naming = settings.naming || 'letters';
  const pcMode = inputMode === 'names' || inputMode === 'mic' || settings.octaveStrict === false;
  const same = (a, b) => (pcMode ? pc(a) === pc(b) : a === b);
  const sound = settings.sound !== false;
  const lengthMs = mode === 'review' ? 3 * 60000 : mode === 'practice' ? (settings.sessionMin || 10) * 60000 : undefined;

  let res;
  try {
    res = engine.startSession({ mode, stageId: req.stageId, lengthMs, now: ctx.now(), inputMode, tzOffsetMin: new Date().getTimezoneOffset() });
  } catch (e) { console.warn(e); res = { ok: false, reason: 'error' }; }
  if (res && res.ok === false) return renderUnavailable(ctx, mount, mode, res.reason);

  ctx.sessionRunning = true;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const cancel = (id) => { if (id != null) { clearTimeout(id); timers.delete(id); } };
  const sessionStart = ctx.now();
  let phase = 'idle';
  let p = null, col = null, svg = null;
  let hintShown = false, hintTimer = null, chordTimer = null;
  let expect = [], expectOrdered = false;
  let matchedMarked = new Set();
  const results = [];
  let answersSinceSave = 0;
  let sessionOver = false;
  let paceShown = {};
  let rafId = 0;
  let destroyed = false;
  const queuedDialogs = [];
  let testoutPassed = null;

  // ---- DOM
  const pauseBtn = h('button.btn.btn-icon.btn-quiet', { type: 'button', 'aria-label': 'Pause', onclick: () => pause() },
    s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, s('rect', { x: 6.5, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }), s('rect', { x: 13.9, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' })));
  const timeFill = h('i');
  const timebar = h('div.timebar', { role: 'progressbar', 'aria-label': 'Session time', 'aria-valuemin': '0', 'aria-valuemax': '100' }, timeFill);
  const dots = h('div.dots', { 'aria-label': 'Last answers' });
  const top = h('div.p-top', pauseBtn, MODE_LABEL[mode] ? h('span.mode-lbl', MODE_LABEL[mode]) : null, timebar, dots);

  const instr = h('p.p-instr');
  const chipHost = h('span');
  const staffHost = h('div.p-staff');
  const countin = h('div.countin', { 'aria-hidden': 'true' });
  const hintText = h('span.hint-text');
  const hintBtn = h('button.hint-btn', { type: 'button', onclick: () => showHint() }, 'Show hint');
  const hint = h('div.p-hint', hintBtn, hintText);
  const paceFill = h('i');
  const pace = h('div.pace', { 'aria-hidden': 'true' }, paceFill);
  const card = h('section.paper.p-card', { 'aria-label': 'Prompt' }, h('div.p-meta', instr, chipHost), staffHost, hint, pace);
  const status = h('div.p-status', { 'aria-live': 'off' });

  const kb = inputMode === 'names'
    ? createNamePad({ naming, onPick: (m, t) => { if (sound) { ctx.audio.noteOn(m); later(() => ctx.audio.noteOff(m), 260); } handleInput(m, t); } })
    : createKeyboard({
      labels: settings.labels || 'c-only',
      octaves: ctx.kbOctaves || 2,
      onDown: (m, t) => { if (sound) ctx.audio.noteOn(m); handleInput(m, t); },
      onUp: (m) => ctx.audio.noteOff(m),
    });
  kb.onZoom = (o) => { ctx.kbOctaves = o; };
  const tapPad = h('div.tap-pad', { role: 'button', tabindex: '0', 'aria-label': 'Tap pad' }, 'Tap here');
  tapPad.addEventListener('pointerdown', (e) => { e.preventDefault(); tapPad.classList.add('is-down'); if (sound) ctx.audio.noteOn(71); handleInput(71, nowMs(), true); });
  const tapUp = () => { tapPad.classList.remove('is-down'); ctx.audio.noteOff(71); };
  tapPad.addEventListener('pointerup', tapUp); tapPad.addEventListener('pointercancel', tapUp);
  const input = h('div.p-input', kb.el, tapPad);
  tapPad.hidden = true;

  const wrap = h('div.practice', top, card, status, input);
  mount.append(wrap);

  // external inputs (MIDI / mic / desktop keys)
  ctx.noteHandler = (midi, on, t) => {
    if (on) { if (sound && inputMode !== 'mic') ctx.audio.noteOn(midi); kb.press(midi, true); handleInput(midi, t); }
    else { ctx.audio.noteOff(midi); kb.press(midi, false); }
  };
  ctx.commandHandler = (c) => {
    if (dialogOpen()) return;
    if (c === 'pause') pause();
    else if (c === 'hint') showHint();
    else if (c === 'skip') { if (phase === 'answer') doSkip(); else if (phase === 'rhythm-ready') startCountIn(); }
  };

  const tick = setInterval(() => {
    if (lengthMs) {
      const f = Math.min(1, (ctx.now() - sessionStart) / lengthMs);
      timeFill.style.width = (f * 100).toFixed(1) + '%';
      timebar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    }
  }, 500);

  const onVis = () => { if (document.visibilityState === 'hidden' && !dialogOpen() && phase !== 'done') pause(); };
  document.addEventListener('visibilitychange', onVis);
  let resizeT = null;
  const onResize = () => { cancel(resizeT); resizeT = later(() => { if (p) redrawStaff(); }, 120); };
  window.addEventListener('resize', onResize);

  // ---- helpers
  const required = (q) => (q.answer.type === 'sequence' ? q.answer.midis.slice(q.answer.given || 0) : q.answer.type === 'set' ? q.answer.midis.slice() : []);
  const promptName = (q) => {
    if (q.kind === 'note' && q.notes[0]) return noteNameOf(q.notes[0].midi, naming, { accidental: q.notes[0].accidental, keySig: q.keySig || 0 });
    return pretty((q.hint && q.hint.name) || '');
  };
  const notesList = (q) => required(q).map((m) => {
    const n = q.notes.find((x) => x.midi === m);
    return noteNameOf(m, naming, { accidental: n && n.accidental, keySig: q.keySig || 0 });
  }).join(' ');
  function noteIndexFor(midi) {
    if (!p) return -1;
    if (p.answer.type === 'sequence') {
      const given = p.answer.given || 0;
      // next unmarked index in order
      for (let i = given; i < p.notes.length; i++) if (!matchedMarked.has(i)) return same(p.notes[i].midi, midi) ? i : -1;
      return -1;
    }
    return p.notes.findIndex((n, i) => !matchedMarked.has(i) && same(n.midi, midi));
  }
  function addDot(ok) {
    results.push(ok);
    clear(dots);
    for (const r of results.slice(-10)) dots.appendChild(h('i' + (r ? '.ok' : '.bad')));
  }
  function setStatus(html, tone) {
    status.className = 'p-status' + (tone ? ' is-' + tone : '');
    status.innerHTML = html;
  }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function staffStates() {
    if (!p) return [];
    const given = p.answer.type === 'sequence' ? (p.answer.given || 0) : 0;
    return p.notes.map((_, i) => (i < given ? 'is-given' : 'is-target'));
  }
  function redrawStaff(states, ghosts) {
    const r = staffHost.getBoundingClientRect();
    const phone = window.innerWidth < 600;
    const w = Math.min(Math.max(200, r.width - 4), phone ? 9999 : 640), hh = Math.max(110, r.height - 4);
    const prev = svg;
    svg = renderStaff(p, {
      box: { w, h: hh }, maxSpace: phone ? 21 : 22, minSpace: phone ? 11 : 12,
      states: states || (prev && prev.__states) || staffStates(), ghosts: ghosts || (prev && prev.__ghosts) || [],
      label: labelFor(p),
    });
    svg.__states = states || (prev && prev.__states) || staffStates();
    svg.__ghosts = ghosts || (prev && prev.__ghosts) || [];
    clear(staffHost);
    staffHost.append(svg, countin);
  }
  function labelFor(q) {
    if (q.kind === 'rhythm') return 'Rhythm: ' + ((q.hint && q.hint.name) || '');
    const clefName = q.clef === 'grand' ? 'grand staff' : q.clef + ' clef';
    return `${INSTR[q.kind] || 'Prompt'} on the ${clefName}`;
  }
  function setNoteStateTracked(i, cls) {
    setNoteState(svg, i, cls);
    if (svg && svg.__states) svg.__states[i] = cls;
  }

  // ---- hints + pace bar
  function resetHint() {
    cancel(hintTimer); hintTimer = null;
    hint.classList.remove('is-shown');
    hintText.textContent = '';
    hintBtn.hidden = true;
  }
  function armHint() {
    resetHint();
    if (!p || p.isIntro) return;
    const after = p.hintAfterMs;
    if (!(after >= 0) || after === Infinity || !isFinite(after)) return;
    hintBtn.hidden = false;
    if (after <= 0) showHint();
    else hintTimer = later(() => { if (phase === 'answer') showHint(); }, after);
  }
  function showHint() {
    if (!p || phase !== 'answer' || p.hintAfterMs === Infinity) return;
    hintShown = true;
    hintBtn.hidden = true;
    clear(hintText);
    hintText.append(h('b', promptName(p)), p.hint && p.hint.mnemonic ? pretty(p.hint.mnemonic) : '');
    hint.classList.add('is-shown');
  }
  function startPace() {
    paceFill.style.transition = 'none';
    paceFill.style.transform = 'scaleX(1)';
    pace.style.visibility = p && p.goalMs > 0 && !p.isIntro && p.kind !== 'rhythm' && !reducedMotion() ? 'visible' : 'hidden';
    if (!p || !(p.goalMs > 0)) return;
    void paceFill.offsetWidth;
    paceFill.style.transition = `transform ${p.goalMs}ms linear`;
    paceFill.style.transform = 'scaleX(0)';
  }
  function stopPace() {
    const m = getComputedStyle(paceFill).transform;
    paceFill.style.transition = 'none';
    paceFill.style.transform = m && m !== 'none' ? m : 'scaleX(0)';
  }

  // ---- flow
  function showNext() {
    if (destroyed) return;
    if (queuedDialogs.length) { const d = queuedDialogs.shift(); d().then(() => showNext()); return; }
    if (sessionOver) return finish();
    let q = null;
    try { q = engine.next({ now: ctx.now() }); } catch (e) { console.warn(e); }
    if (!q) return finish();
    draw(q);
  }

  function draw(q) {
    if (ctx.debug && window.__tutti) window.__tutti.prompt = q;
    p = q; ctx.currentPrompt = q;
    hintShown = false; matchedMarked = new Set();
    cancel(chordTimer); chordTimer = null;
    kb.clearMarks();
    const rhythm = q.answer.type === 'rhythm';
    tapPad.hidden = !rhythm;
    kb.el.hidden = rhythm;
    instr.textContent = INSTR[q.kind] || '';
    clear(chipHost);
    const chip = q.isIntro ? ['New', ''] : CHIP[q.reason];
    if (chip && mode !== 'placement' && mode !== 'testout') chipHost.append(h('span.chip' + chip[1], chip[0]));
    if (svg) svg.__states = null;
    svg = null;
    redrawStaff(staffStates(), []);
    setStatus('');
    resetHint();
    if (!rhythm) {
      const req = required(q);
      const all = q.answer.midis || req;
      const lo = Math.min(...all), hi = Math.max(...all);
      // keep every answer key visible; the curriculum range only widens the drawn manual
      kb.showRange(lo, hi, q.range);
      try { ctx.inputs.keys.setOctave && ctx.inputs.keys.setOctave(Math.floor(lo / 12) - 1); } catch { /* ignore */ }
      if (q.answer.type === 'sequence') {
        const given = q.answer.midis.slice(0, q.answer.given || 0);
        for (const m of given) kb.mark(m, 'is-given', 0);
        if (given.length && sound) { ctx.audio.noteOn(given[0]); later(() => ctx.audio.noteOff(given[0]), 420); }
      }
    }
    if (mode === 'testout' || mode === 'placement') {
      const total = mode === 'testout' ? (q.kind === 'chord' ? 15 : 12) : 28;
      const f = Math.min(1, (q.index + 1) / total);
      timeFill.style.width = (f * 100) + '%';
    }

    if (q.isIntro) {
      phase = 'intro';
      expect = required(q); expectOrdered = q.answer.type === 'sequence';
      clear(hintText);
      hintText.append(h('b', promptName(q)), q.hint && q.hint.mnemonic ? pretty(q.hint.mnemonic) : '');
      hint.classList.add('is-shown');
      if (!rhythm) for (const m of expect) kb.mark(m, 'is-hint', 0);
      setStatus(rhythm ? 'Listen first, then tap along.' : `New: <b>${esc(promptName(q))}</b>. Play it once to learn where it lives.`);
      pace.style.visibility = 'hidden';
      announce(`New: ${promptName(q)}. Play it to continue.`);
      if (rhythm) { phase = 'rhythm-ready'; setStatus('New rhythm. Tap the pad to hear it first.'); }
      return;
    }
    if (rhythm) {
      phase = 'rhythm-ready';
      col = engine.collector(q);
      setStatus('Tap the pad to start a one-bar count-in.');
      pace.style.visibility = 'hidden';
      return;
    }
    phase = 'answer';
    col = engine.collector(q);
    col.startAt(nowMs());
    armHint();
    startPace();
  }

  function handleInput(midi, t, isTap) {
    if (destroyed || dialogOpen()) return;
    if (phase === 'rhythm-ready') { startCountIn(); return; }
    if (phase === 'rhythm-play') { rhythmTap(t); return; }
    if (phase === 'answer') {
      let r;
      try { r = col.push({ midi, t }); } catch (e) { console.warn(e); return; }
      if (r.status === 'pending') {
        const i = noteIndexFor(midi);
        if (i >= 0) { matchedMarked.add(i); setNoteStateTracked(i, 'is-correct'); }
        kb.mark(midi, 'is-ok', 500);
        if (p.answer.type === 'set' && r.need > 1 && chordTimer == null) {
          chordTimer = later(() => { if (phase === 'answer') resolve(false, null); }, 1530);
        }
        return;
      }
      if (r.status === 'correct') { kb.mark(midi, 'is-ok', 600); resolve(true); }
      else resolve(false, r.wrongMidi != null ? r.wrongMidi : midi);
      return;
    }
    if (phase === 'repair' || phase === 'intro') {
      if (isTap) return;
      const idx = expectOrdered ? (same(expect[0], midi) ? 0 : -1) : expect.findIndex((m) => same(m, midi));
      if (idx >= 0) {
        const m = expect.splice(idx, 1)[0];
        kb.mark(m, 'is-ok', 600);
        const ni = p.notes.findIndex((n, i) => same(n.midi, m) && !matchedMarked.has(i) && !(p.answer.type === 'sequence' && i < (p.answer.given || 0)));
        if (ni >= 0) { matchedMarked.add(ni); setNoteStateTracked(ni, 'is-correct'); }
        if (!expect.length) finishRepair();
      } else kb.mark(midi, 'is-bad', 380);
    }
  }

  function finishRepair() {
    const wasIntro = phase === 'intro';
    phase = 'wait';
    kb.clearMarks();
    if (wasIntro) {
      let fb = null;
      try { fb = engine.answer({ promptId: p.promptId, correct: true, rtMs: 0, hintShown: true, wrong: [], now: ctx.now() }); } catch (e) { console.warn(e); }
      if (fb) { handleEvents(fb.events || []); if (fb.sessionOver) sessionOver = true; }
      setStatus(`<b>${esc(promptName(p))}</b>`, 'ok');
    } else setStatus('');
    later(showNext, 380);
  }

  function resolve(correct, wrongMidi, fbIn) {
    if (phase !== 'answer' && phase !== 'rhythm-play') return;
    const wasRhythm = phase === 'rhythm-play';
    phase = 'wait';
    cancel(chordTimer); chordTimer = null;
    stopPace();
    pace.style.visibility = 'hidden';
    if (!hintShown) resetHint(); else hintBtn.hidden = true;
    let fb = fbIn;
    if (!fb) {
      const r = col.result();
      try { fb = engine.answer({ promptId: p.promptId, correct: r.correct, rtMs: r.rtMs, hintShown, wrong: r.wrong || [], now: ctx.now() }); }
      catch (e) { console.warn(e); fb = { correct: r.correct, events: [], sessionOver: false }; }
      correct = r.correct;
    }
    addDot(!!correct);
    if (++answersSinceSave >= 20) { answersSinceSave = 0; ctx.save(); }
    if (fb.sessionOver) sessionOver = true;
    handleEvents(fb.events || []);
    const states = p.notes.map(() => (correct ? 'is-correct' : 'is-wrong'));
    if (p.answer.type === 'sequence') for (let i = 0; i < (p.answer.given || 0); i++) states[i] = 'is-given';
    if (!correct && p.answer.type !== 'rhythm') for (const i of matchedMarked) states[i] = 'is-correct';
    const ghosts = !correct && wrongMidi != null && p.answer.type !== 'rhythm' && !p.notes.some((n) => same(n.midi, wrongMidi))
      ? [{ midi: wrongMidi, staff: ghostStaff(wrongMidi), col: ghostCol() }] : [];
    redrawStaff(states, ghosts);

    if (correct) {
      if (sound) ctx.audio.blip('ok');
      const nm = p.kind === 'note' || p.kind === 'chord' || p.kind === 'interval' || p.kind === 'dyad' ? promptName(p) : '';
      setStatus(nm ? `<b>${esc(nm)}</b>` : '', 'ok');
      announce('Correct' + (nm ? ': ' + nm : ''));
      later(showNext, 450);
      return;
    }
    if (sound) ctx.audio.blip('bad');
    const nm = promptName(p);
    if (wasRhythm || p.answer.type === 'rhythm') {
      setStatus(`Not quite. Listen once: <b>${esc(nm)}</b>`, 'bad');
      hint.classList.remove('is-shown');
      announce('Not quite. Listen to the rhythm.');
      demoRhythm(() => later(showNext, 300));
      return;
    }
    const playedTxt = wrongMidi != null ? `You played ${esc(noteNameOf(wrongMidi, naming))}. ` : '';
    const list = p.kind === 'note' ? '' : ` (${esc(notesList(p))})`;
    if (mode === 'testout' || mode === 'placement') {
      setStatus(`${playedTxt}This is <b>${esc(nm)}</b>${list}.`, 'bad');
      for (const m of required(p)) kb.mark(m, 'is-hint', 1300);
      announce(`Incorrect. ${playedTxt}This is ${nm}.`);
      later(showNext, 1500);
      return;
    }
    setStatus(`${playedTxt}This is <b>${esc(nm)}</b>${list}. Play it to continue.`, 'bad');
    announce(`Incorrect. ${playedTxt}This is ${nm}. Play it to continue.`);
    expect = required(p); expectOrdered = p.answer.type === 'sequence';
    matchedMarked = new Set();
    for (const m of expect) kb.mark(m, 'is-hint', 0);
    later(() => { if (phase === 'wait' && expect.length) phase = 'repair'; }, 250);
  }
  function ghostStaff(m) {
    if (p.clef !== 'grand') return p.notes[0] ? p.notes[0].staff : undefined;
    const req = required(p);
    const target = p.notes.find((n) => n.midi === req[0]) || p.notes[0];
    return target ? target.staff : (m < 60 ? 'bass' : 'treble');
  }
  function ghostCol() {
    if (p.answer.type !== 'sequence') return 0;
    // the column of the first unplayed note
    const given = p.answer.given || 0;
    let k = given; while (matchedMarked.has(k)) k++;
    return Math.min(k, p.notes.length - 1);
  }

  function doSkip() {
    if (phase !== 'answer') return;
    let fb;
    try { fb = engine.skip({ promptId: p.promptId, now: ctx.now() }); } catch (e) { console.warn(e); fb = { correct: false, events: [], sessionOver: false }; }
    resolve(false, null, fb);
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

  // ---- rhythm
  function startCountIn() {
    if (phase !== 'rhythm-ready') return;
    const isIntro = p.isIntro;
    if (isIntro) { phase = 'wait'; setStatus('Listen: four clicks, then the rhythm.'); demoRhythm(() => introAnswered()); return; }
    phase = 'rhythm-count';
    const bpm = p.answer.bpm || 72, beatMs = 60000 / bpm;
    const t = nowMs();
    const t0 = t + 4 * beatMs;
    setStatus('Count-in…');
    for (let k = 0; k < 4; k++) later(() => { countin.textContent = String(k + 1); if (sound) ctx.audio.click(k === 0); }, k * beatMs);
    col.startAt(t0);
    later(() => { if (phase === 'rhythm-count') { phase = 'rhythm-play'; } }, Math.max(0, 4 * beatMs - 220));
    later(() => {
      countin.textContent = '';
      setStatus('');
      const beats = p.answer.beats || 4;
      if (settings.metronome !== false && sound) for (let b = 0; b < beats; b++) later(() => ctx.audio.click(b === 0), b * beatMs);
      animatePlayhead(t0, beatMs, beats);
      later(() => { if (phase === 'rhythm-play') resolve(false, null); }, beats * beatMs + 0.45 * beatMs);
    }, 4 * beatMs);
  }
  let introDoneId = null;
  function introAnswered() {
    if (!p || introDoneId === p.promptId) return; introDoneId = p.promptId;
    let fb = null;
    try { fb = engine.answer({ promptId: p.promptId, correct: true, rtMs: 0, hintShown: true, wrong: [], now: ctx.now() }); } catch { /* ignore */ }
    if (fb && fb.sessionOver) sessionOver = true;
    // an intro is not scored; give the learner a real attempt with a fresh prompt
    phase = 'wait';
    later(showNext, 200);
  }
  function rhythmTap(t) {
    let r;
    try { r = col.push({ tap: true, t }); } catch (e) { console.warn(e); return; }
    const k = (r.matched || []).length;
    for (let i = 0; i < k; i++) if (!matchedMarked.has(i)) { matchedMarked.add(i); setNoteStateTracked(sortedIdx(i), 'is-correct'); }
    if (r.status === 'correct') resolve(true);
    else if (r.status === 'wrong') resolve(false, null);
  }
  function sortedIdx(k) {
    const order = p.notes.map((n, i) => [n.beat || 0, i]).sort((a, b) => a[0] - b[0]);
    return order[k] ? order[k][1] : k;
  }
  function animatePlayhead(t0, beatMs, beats) {
    const ph = svg && svg.__playhead;
    if (!ph) return;
    ph.style.opacity = '1';
    const step = () => {
      if (destroyed || !svg || svg.__playhead !== ph) return;
      const b = (nowMs() - t0) / beatMs;
      if (b > beats + 0.2) { ph.style.opacity = '0'; return; }
      ph.setAttribute('x', String(svg.__beatX(Math.max(0, b)) - 1));
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
  function demoRhythm(done) {
    const bpm = p.answer.bpm || 72, beatMs = 60000 / bpm;
    const beats = p.answer.beats || 4;
    const t0 = nowMs() + 300 + 4 * beatMs;
    for (let k = 0; k < 4; k++) later(() => { countin.textContent = String(k + 1); if (sound) ctx.audio.click(k === 0); }, 300 + k * beatMs);
    later(() => {
      countin.textContent = '';
      animatePlayhead(t0, beatMs, beats);
      for (let b = 0; b < beats; b++) later(() => { if (sound) ctx.audio.click(b === 0); }, b * beatMs);
      for (const o of p.answer.onsets) later(() => { if (sound) { ctx.audio.noteOn(71); later(() => ctx.audio.noteOff(71), Math.min(300, beatMs * 0.4)); } }, o * beatMs);
      later(done, beats * beatMs + 200);
    }, 300 + 4 * beatMs);
  }

  // ---- pause
  let pausing = false;
  function pause() {
    if (pausing || phase === 'done') return;
    pausing = true;
    const t = Date.now();
    const wasPhase = phase;
    stopPace();
    cancel(hintTimer);
    kb.releaseAll && kb.releaseAll();
    ctx.audio.allOff && ctx.audio.allOff();
    const canSkip = wasPhase === 'answer';
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
      if (v === 'end') { finish(); return; }
      if (v === 'skip' && phase === 'answer') { doSkip(); return; }
      if (phase === 'answer') {
        if (!matchedMarked.size && col) col.startAt(nowMs());
        armHint(); startPace();
      }
    });
  }

  // ---- end
  function finish() {
    if (phase === 'done' || destroyed) return;
    phase = 'done';
    for (const id of timers) clearTimeout(id);
    timers.clear();
    cancelAnimationFrame(rafId);
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
    window.removeEventListener('resize', onResize);
    try { kb.destroy(); } catch { /* ignore */ }
    try { ctx.audio.allOff(); } catch { /* ignore */ }
  }

  // kick off after layout so the staff can measure its box
  requestAnimationFrame(() => { if (!destroyed) showNext(); });

  return () => {
    // leaving the route mid-session ends it (progress is kept)
    if (phase !== 'done') {
      phase = 'done';
      for (const id of timers) clearTimeout(id);
      try { engine.endSession({ now: ctx.now() }); } catch { /* ignore */ }
      ctx.save({ flush: true });
      ctx.sessionEnded();
      teardownInputs();
    }
    destroyed = true;
    cancelAnimationFrame(rafId);
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
