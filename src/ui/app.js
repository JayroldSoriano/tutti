// Tutti entry: boot, hash router, state wiring (PLAN 4.6).
import { createEngine, migrate, mergeStates } from '../engine.js';
import { createStore } from '../storage.js';
import { createAudio } from '../audio.js';
import { createMidiInput } from '../input/midi.js';
import { createMicInput } from '../input/mic.js';
import { createKeyInput } from '../input/keys.js';
import { h, clear } from './h.js';
import { toast } from './dialog.js';
import { renderHome } from './screens/home.js';
import { renderPractice } from './screens/practice.js';
import { renderProgress } from './screens/progress.js';
import { renderSettings } from './screens/settings.js';
import { renderLesson } from './screens/lesson.js';
import { renderLessons } from './screens/lessons.js';
import { renderSong } from './screens/song.js';

const ROUTES = ['home', 'practice', 'progress', 'settings', 'lesson', 'lessons', 'song'];
const FULLSCREEN = ['practice', 'lesson', 'song'];

function boot() {
  const root = document.getElementById('app');
  const hash = () => String(location.hash || '');
  const debug = /debug/.test(hash());

  // ---- storage + engine (render before storage resolves)
  const store = createStore({ log: debug ? (...a) => console.warn('[store]', ...a) : undefined });
  let local = null;
  try { local = store.loadLocal(); } catch { local = null; }
  let engine = makeEngine(local);

  function makeEngine(state) {
    let s;
    try { s = state ? migrate(state) : undefined; } catch { s = undefined; }
    try { return createEngine({ state: s, seed: Date.now() >>> 0 }); }
    catch (e) { console.warn('engine state rejected, starting fresh', e); return createEngine({ seed: Date.now() >>> 0 }); }
  }

  const audio = createAudio();
  let settingsCache = null;
  let pausedTotal = 0;
  let pendingRemote = null;
  let backendName = store.backend();
  let syncStatus = 'saved';

  const ctx = {
    debug,
    get engine() { return engine; },
    store, audio,
    inputs: {},
    inputStatus: { midi: null, mic: null },
    sessionRunning: false,
    pendingStart: null,
    noteHandler: null,      // practice screen installs (midi, on, t, source)
    commandHandler: null,
    /** Virtual clock for the engine: wall time minus time spent paused in this session. */
    now: () => Date.now() - pausedTotal,
    addPaused(ms) { pausedTotal += Math.max(0, ms); },
    resetPaused() { pausedTotal = 0; },
    settings() {
      if (!settingsCache) { try { settingsCache = { ...engine.getState().settings }; } catch { settingsCache = {}; } }
      return settingsCache;
    },
    updateSettings(partial) {
      try { engine.setSettings(partial); } catch (e) { console.warn(e); }
      settingsCache = null;
      applySettings();
      // settings alone do not bump updatedAt in the engine; persist a stamped copy (UI adapter)
      try { const s = engine.getState(); s.updatedAt = Date.now(); store.save(s); } catch { /* ignore */ }
    },
    save(opts = {}) { try { store.save(engine.getState(), opts); } catch { /* ignore */ } },
    backend: () => backendName,
    syncStatus: () => syncStatus,
    nav(route) {
      const r = ROUTES.includes(String(route).split('/')[0]) ? route : 'home';
      const want = '#' + r + (debug ? '&debug' : '');
      if (location.hash !== want && location.hash !== '#' + r) location.hash = want; else render();
    },
    pendingLesson: null,
    rebuildEngine(state) { engine = makeEngine(state); settingsCache = null; applySettings(); },
    sessionEnded() {
      ctx.sessionRunning = false;
      if (pendingRemote) { mergeRemote(pendingRemote); pendingRemote = null; }
    },
    render: () => render(),
  };

  // ---- input adapters (all route to the practice screen's handler)
  const onNote = ({ midi, on, t, source }) => {
    unlockAudio();
    if (ctx.noteHandler) ctx.noteHandler(midi, on, t, source);
  };
  ctx.inputs.keys = createKeyInput({ onNote, onCommand: (c) => ctx.commandHandler && ctx.commandHandler(c) });
  ctx.inputs.midi = createMidiInput({ onNote });
  ctx.inputs.mic = createMicInput({ onNote });
  ctx.inputs.keys.start().catch(() => {});

  ctx.startInput = async (mode) => {
    const ad = mode === 'midi' ? ctx.inputs.midi : mode === 'mic' ? ctx.inputs.mic : null;
    if (!ad) return { ok: true };
    let res;
    try { res = await ad.start(); } catch { res = { ok: false, reason: 'unsupported' }; }
    ctx.inputStatus[mode] = res;
    return res;
  };
  ctx.stopInput = (mode) => { try { (mode === 'midi' ? ctx.inputs.midi : ctx.inputs.mic).stop(); } catch { /* ignore */ } };

  function applySettings() {
    const st = ctx.settings();
    try { audio.setEnabled(st.sound !== false); } catch { /* ignore */ }
    try { ctx.inputs.keys.setMode && ctx.inputs.keys.setMode(st.inputMode === 'names' ? 'names' : 'keys'); } catch { /* ignore */ }
  }
  applySettings();
  // re-arm MIDI / mic if chosen previously (no permission prompt for MIDI without a gesture in most browsers)
  const im = ctx.settings().inputMode;
  if (im === 'midi') ctx.startInput('midi');

  // ---- audio unlock on first gesture
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    try { unlocked = !!audio.unlock(); } catch { unlocked = false; }
  }
  const gesture = () => { unlockAudio(); if (unlocked) { window.removeEventListener('pointerdown', gesture, true); window.removeEventListener('keydown', gesture, true); } };
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);

  // ---- remote sync
  store.onStatus((s) => { syncStatus = s; backendName = store.backend(); document.dispatchEvent(new CustomEvent('tutti:sync')); });
  function mergeRemote(remote) {
    try {
      const mine = engine.getState();
      const merged = mergeStates(mine, remote);
      if (merged && (merged.updatedAt !== mine.updatedAt || merged.totalAnswers !== mine.totalAnswers)) {
        ctx.rebuildEngine(merged);
        store.save(engine.getState());
        render();
      }
    } catch (e) { console.warn('merge failed', e); }
  }
  store.connect().then(({ remote, backend }) => {
    backendName = backend;
    if (remote) {
      if (ctx.sessionRunning) pendingRemote = remote;
      else mergeRemote(remote);
    } else if (backend === 'db') {
      ctx.save({ flush: true }); // first sync: push the local copy up
    }
    document.dispatchEvent(new CustomEvent('tutti:sync'));
  }).catch(() => {});

  // ---- save on hide (localStorage synchronously via store.save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') ctx.save();
  });

  // ---- shell
  const tabsDef = [
    ['home', 'Today', iconPipes()],
    ['lessons', 'Lessons', iconBook()],
    ['progress', 'Progress', iconPath()],
    ['settings', 'Settings', iconStops()],
  ];
  const tabLinks = tabsDef.map(([r, label, icon]) => h('a.tab', { href: '#' + r, 'data-route': r }, icon, h('span', label)));
  const nav = h('nav.tabs', { 'aria-label': 'Main' }, h('div.brand', { 'aria-hidden': 'true' }, 'Tutti'), tabLinks);
  const main = h('main.main', { id: 'main' });
  clear(root);
  root.append(nav, main);
  root.removeAttribute('aria-busy');

  let cleanup = null;
  function render() {
    const raw = hash().replace(/^#/, '').split(/[&?/]/)[0];
    const route = ROUTES.includes(raw) ? raw : 'home';
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.warn(e); } }
    cleanup = null;
    clear(main);
    root.classList.toggle('is-practice', FULLSCREEN.includes(route));
    for (const a of tabLinks) {
      const r = a.dataset.route;
      const cur = r === route || (r === 'home' && (route === 'practice' || route === 'lesson')) || (r === 'lessons' && route === 'song');
      if (cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const fn = { home: renderHome, practice: renderPractice, progress: renderProgress, settings: renderSettings, lesson: renderLesson, lessons: renderLessons, song: renderSong }[route];
    try { cleanup = fn(ctx, main); }
    catch (e) {
      console.error(e);
      main.append(h('div.card', h('h2', 'Something went wrong drawing this screen.'), h('p.muted', String(e && e.message || e))));
    }
    if (!FULLSCREEN.includes(route)) window.scrollTo(0, 0);
  }
  if (debug) {
    window.__tutti = {
      get engine() { return engine; }, ctx, store,
      get currentPrompt() { return ctx.currentPrompt || null; },
      play(midi) { onNote({ midi, on: true, t: performance.now(), source: 'key' }); onNote({ midi, on: false, t: performance.now(), source: 'key' }); },
    };
  }
  window.addEventListener('hashchange', render);
  render();

  window.addEventListener('error', () => toast('Something went wrong. Your progress is saved on this device.'));
}

function svgIcon(paths) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true');
  el.innerHTML = paths;
  return el;
}
// an open score
function iconBook() {
  return svgIcon('<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 5.5c3-1 6-1 8.5.8v13c-2.5-1.8-5.5-1.8-8.5-.8z"/><path class="pipe-fill" d="M20.5 5.5c-3-1-6-1-8.5.8v13c2.5-1.8 5.5-1.8 8.5-.8z"/></g>');
}
// organ pipes
function iconPipes() {
  return svgIcon('<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
    '<path class="pipe-fill" d="M10.2 3h3.6v14h-3.6z" fill="none"/><path d="M5 8h3.2v9H5zM15.8 6h3.2v11h-3.2z"/>' +
    '<path d="M3.5 20.5h17"/></g>');
}
function iconPath() {
  return svgIcon('<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="18" r="2.2"/><circle class="pipe-fill" cx="12" cy="11" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M7.6 16.4l2.8-3.8M13.6 9.4l2.8-2.8"/></g>');
}
function iconStops() {
  return svgIcon('<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="8" r="3.2"/><circle class="pipe-fill" cx="17" cy="8" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="3.2"/></g>');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
