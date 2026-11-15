// Free play of one unlocked song: wait mode and tempo mode. Updates lessons.songs.
import { h, s, clear } from '../h.js';
import { createKeyboard } from '../keyboard.js';
import { toast, dialogOpen, announce } from '../dialog.js';
import { getSong, SONGS } from '../../songs.js';
import { LESSONS } from '../../lessons.js';
import { unlockedSongIds } from '../../lessonProgress.js';
import { runWait } from '../lesson/steps/melody-wait.js';
import { runTempo } from '../lesson/steps/melody-tempo.js';

export function renderSong(ctx, mount) {
  const engine = ctx.engine;
  const settings = ctx.settings();
  const sound = settings.sound !== false;
  const id = decodeURIComponent(String(location.hash || '').replace(/^#/, '').split(/[&?]/)[0].split('/')[1] || '');
  const song = getSong(id);
  const ls0 = engine.getLessons();
  if (!song || !unlockedSongIds(ls0, LESSONS, SONGS).includes(id)) {
    toast(song ? 'That tune unlocks later in the lessons.' : 'That tune could not be found.');
    setTimeout(() => { location.hash = 'lessons' + (ctx.debug ? '&debug' : ''); }, 0);
    return () => {};
  }
  ctx.sessionRunning = true;
  const both = !!(song.parts.rh && song.parts.lh);
  let mode = 'wait', hands = both ? 'both' : song.parts.rh ? 'rh' : 'lh', names = false;
  const rec0 = ls0.songs[id];
  let bpm = Math.max(40, Math.min(song.bpm || 80, rec0 && rec0.bestTempo ? rec0.bestTempo + 6 : (song.bpm || 80) - 12));

  const back = h('a.btn.btn-icon.btn-quiet', { href: '#lessons', 'aria-label': 'Back to lessons' },
    s('svg', { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true' }, s('path', { d: 'M15 5l-7 7 7 7', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
  const best = h('span.sg-best.num');
  const top = h('header.l-top.sg-top', h('div.l-row', back, h('p.l-title', h('b', song.title), h('span', song.credit)), best));
  const seg = (label, opts, get, set) => h('div.seg.sg-seg', { role: 'radiogroup', 'aria-label': label }, opts.map(([v, t]) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === v), onclick: () => { set(v); for (const x of b.parentNode.children) x.setAttribute('aria-checked', String(x === b)); start(); } }, t);
    return b;
  }));
  const modeSeg = seg('Mode', [['wait', 'Wait for me'], ['tempo', 'In time']], () => mode, (v) => { mode = v; });
  const handSeg = both ? seg('Hands', [['rh', 'Right'], ['lh', 'Left'], ['both', 'Both']], () => hands, (v) => { hands = v; }) : null;
  const namesBtn = h('button.switch', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Show note names', onclick: () => { names = !names; namesBtn.setAttribute('aria-checked', String(names)); start(); } });
  const bpmVal = h('span.num.sg-bpm-v');
  const bpmCtl = h('div.sg-bpm', h('button.kb-zoom', { type: 'button', 'aria-label': 'Slower', onclick: () => { bpm = Math.max(30, bpm - 6); start(); } }, '−'), bpmVal, h('button.kb-zoom', { type: 'button', 'aria-label': 'Faster', onclick: () => { bpm = Math.min(160, bpm + 6); start(); } }, '+'));
  const controls = h('div.sg-controls', modeSeg, handSeg, h('label.sg-names', namesBtn, h('span', 'Names')), bpmCtl);
  const host = h('div.st-score');
  const foot = h('div.st-foot');
  const body = h('div.st-body', host);
  const stepEl = h('section.step.st-song', controls, body, foot);
  const stage = h('main.l-stage', stepEl);
  const kb = createKeyboard({
    labels: settings.labels || 'c-only', octaves: ctx.kbOctaves || 2,
    onDown: (m, t) => { if (sound) ctx.audio.noteOn(m); deliver(m, true, t); },
    onUp: (m) => ctx.audio.noteOff(m),
  });
  kb.onZoom = (o) => { ctx.kbOctaves = o; };
  const inputEl = h('div.l-input', kb.el);
  const root = h('div.lesson.song-screen', top, stage, inputEl);
  mount.append(root);
  const timers = new Set();
  const env = {
    ctx, kb, settings, naming: settings.naming || 'letters', audio: ctx.audio,
    width: () => Math.max(260, body.clientWidth || 340), height: () => Math.max(160, body.clientHeight || 320),
    later: (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); },
  };
  let run = null;
  function deliver(midi, on, t) {
    if (!on || dialogOpen() || !run) return;
    if (mode === 'wait') run.push(midi); else run.note(midi, t);
  }
  ctx.noteHandler = (midi, on, t, source) => {
    if (on) { if (sound && source !== 'mic') ctx.audio.noteOn(midi); kb.press(midi, true); } else { ctx.audio.noteOff(midi); kb.press(midi, false); }
    deliver(midi, on, t);
  };
  ctx.commandHandler = (c) => { if (c === 'skip' && foot.querySelector('.btn-primary')) foot.querySelector('.btn-primary').click(); if (c === 'pause') location.hash = 'lessons'; };

  function updateBest() {
    const r = engine.getLessons().songs[id];
    best.textContent = r && r.plays ? `Best ${Math.round(r.bestAcc * 100)}%` : '';
  }
  function saveResult({ acc, tempoBpm }) {
    const now = ctx.now();
    const ls = engine.getLessons();
    const r = ls.songs[id] || { plays: 0, bestAcc: 0, bestTempo: 0 };
    const nr = { plays: r.plays + 1, bestAcc: Math.max(r.bestAcc, Math.max(0, Math.min(1, acc || 0))), bestTempo: tempoBpm && acc >= 0.8 ? Math.max(r.bestTempo || 0, tempoBpm) : r.bestTempo || 0 };
    engine.setLessons({ ...ls, songs: { ...ls.songs, [id]: nr } }, { now });
    ctx.save();
    updateBest();
  }
  function start() {
    if (run) { try { run.destroy(); } catch { /* ignore */ } run = null; }
    bpmCtl.hidden = mode !== 'tempo';
    bpmVal.textContent = `${bpm} bpm`;
    clear(foot);
    requestAnimationFrame(() => {
      if (mode === 'wait') {
        run = runWait({
          env, song, pass: { hands, names, glow: false, fingers: false }, host,
          onProgress: () => {},
          onDone: (st) => {
            saveResult({ acc: st.acc });
            const line = `${st.firstTry} of ${st.moments} notes right first time (${Math.round(st.acc * 100)}%).`;
            clear(foot).append(h('p.st-prompt', line), h('button.btn.btn-primary.btn-block', { type: 'button', onclick: start }, 'Play again'));
            announce(line);
          },
        });
        foot.append(h('p.st-prompt', 'The cursor waits for you.'));
      } else {
        const countEl = h('span.st-countin', { 'aria-hidden': 'true' });
        run = runTempo({
          env, song, hands, bpm, host,
          onResult: (r) => {
            saveResult({ acc: r.acc, tempoBpm: bpm });
            const line = `${r.hit} of ${r.onsets} notes in time at ${bpm} bpm (${Math.round(r.acc * 100)}%).`;
            clear(foot).append(h('p.st-prompt', line), h('div.st-actions',
              h('button.btn', { type: 'button', onclick: () => { bpm = Math.max(30, bpm - 12); start(); } , 'aria-label': `Try slower, ${Math.max(30, bpm - 12)} bpm` }, 'Try slower'),
              h('button.btn.btn-primary', { type: 'button', onclick: start }, 'Again')));
            announce(line);
          },
        });
        foot.append(h('div.st-actions', countEl, h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => { clear(foot).append(countEl, h('p.st-prompt', 'Count along; keep going if you slip.')); run.start(countEl); } }, 'Start the count-in')));
      }
    });
  }
  updateBest();
  start();
  return () => {
    for (const t of timers) clearTimeout(t);
    if (run) { try { run.destroy(); } catch { /* ignore */ } }
    ctx.noteHandler = null; ctx.commandHandler = null;
    try { kb.destroy(); } catch { /* ignore */ }
    try { ctx.audio.allOff(); } catch { /* ignore */ }
    ctx.save({ flush: true });
    ctx.sessionEnded();
  };
}
