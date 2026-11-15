// melody-tempo: one-bar count-in with the metronome, a moving playhead, graded by gradeTempo.
// Never blocks progress: "Skip" is always offered, and any result continues.
import { h, shell, primaryBtn, quietBtn, clear, fitKeyboard } from '../common.js';
import { renderScore } from '../../score.js';
import { gradeTempo } from '../../../songplay.js';
import { getSong } from '../../../songs.js';
import { voice } from '../kit.js';

export function runTempo({ env, song, bars, hands, bpm, host, onResult }) {
  const pcMode = env.settings.inputMode === 'names' || env.settings.inputMode === 'mic' || env.settings.octaveStrict === false;
  const sc = renderScore(song, { bars, hands, names: false, fingers: false, box: { w: env.width(), h: Math.max(160, env.height() - 8) }, naming: env.naming });
  clear(host).append(sc.el);
  const midis = sc.events.flatMap((e) => e.midis);
  const restore = fitKeyboard(env, midis.length ? midis : [60]);
  const vo = voice(env);
  const beatMs = 60000 / bpm;
  const barBeats = song.time ? song.time[0] : 4;
  const total = sc.moments.length ? Math.max(...sc.events.map((e) => e.t + e.beats)) : 4;
  let startMs = 0, raf = 0, timers = [], played = [], running = false;
  const hit = new Set();
  function start(countEl) {
    stop();
    played = []; hit.clear();
    sc.moments.forEach((_, i) => sc.setState(i, ''));
    running = true;
    const t0 = performance.now() + 250;
    startMs = t0 + barBeats * beatMs;
    for (let b = 0; b < barBeats; b++) timers.push(setTimeout(() => { if (countEl) countEl.textContent = String(b + 1); vo.click(b === 0); }, 250 + b * beatMs));
    const metro = env.settings.metronome !== false;
    for (let b = 0; b < Math.ceil(total); b++) timers.push(setTimeout(() => { if (countEl) countEl.textContent = ''; if (metro) vo.click(b % barBeats === 0); }, 250 + (barBeats + b) * beatMs));
    const tick = () => {
      const beats = (performance.now() - startMs) / beatMs;
      sc.setPlayhead(beats < 0 ? 0 : beats);
      if (beats > total + 0.6) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    sc.setPlayhead(null);
    let g;
    try { g = gradeTempo(sc.events, played, { bpm, startMs, pcMode }); } catch (e) { console.warn(e); g = { onsets: sc.events.length, hit: 0, acc: 0 }; }
    onResult({ onsets: g.onsets, hit: g.hit, acc: g.acc, bpm, missed: g.missed, extra: g.extra });
  }
  function stop() { running = false; cancelAnimationFrame(raf); for (const t of timers) clearTimeout(t); timers = []; sc.setPlayhead(null); }
  return {
    sc, start, stop,
    get running() { return running; },
    note(midi, t) {
      if (!running) return;
      played.push({ midi, tMs: t });
      const beat = (t - startMs) / beatMs;
      const i = sc.moments.findIndex((m, k) => !hit.has(k) && Math.abs(m.t - beat) <= 0.3 && m.midis.some((x) => (pcMode ? x % 12 === midi % 12 : x === midi)));
      if (i >= 0) { hit.add(i); sc.setState(i, 'is-correct'); }
    },
    destroy() { stop(); vo.stop(); restore(); },
  };
}

export function mount(step, env) {
  const song = getSong(step.songId);
  let bpm = step.bpm || (song && song.bpm) || 72;
  const host = h('div.st-score');
  const countEl = h('span.st-countin', { 'aria-hidden': 'true' });
  const info = h('p.st-pass');
  const sh = shell(step, { cls: 'st-tempo', body: [h('div.st-pass-row', info, countEl), host] });
  if (!song) { env.later(() => env.done({ onsets: 0, hit: 0, acc: 0, bpm, skipped: true }), 600); return { el: sh.el, kb: 'hidden', destroy() {} }; }
  let run = null;
  const skip = quietBtn(step.optional ? 'Skip this one' : 'Skip for now', () => env.done({ onsets: 0, hit: 0, acc: 0, bpm, skipped: true }));
  function ready() {
    info.textContent = `${bpm} beats per minute. One bar of clicks, then play with the moving line.`;
    if (run) run.destroy();
    requestAnimationFrame(() => {
      run = runTempo({ env, song, bars: step.bars, hands: step.hands || 'both', bpm, host, onResult: result });
      const go = primaryBtn('Start the count-in', () => { clear(sh.foot); sh.foot.append(h('p.st-prompt', 'Count along. Keep going if you slip.')); run.start(countEl); });
      clear(sh.foot).append(go, skip);
      handle.onCommand = (c) => { if (c === 'next') go.click(); };
    });
  }
  function result(r) {
    const pct = Math.round(r.acc * 100);
    const line = `${r.hit} of ${r.onsets} notes in time (${pct}%).`;
    const slower = quietBtn('Try slower', () => { bpm = Math.max(30, bpm - 12); ready(); });
    const again = quietBtn('Again', () => ready());
    const cont = primaryBtn('Continue', () => env.done(r));
    clear(sh.foot).append(h('p.tempo-line.tempo-result', h('b.num', pct + '%'), r.acc >= 0.8 ? `${line.replace(/ \(.*\)\./, '.')} Steady.` : `${line.replace(/ \(.*\)\./, '.')} Slower is fine.`), h('div.st-actions', slower, again), cont);
    handle.onCommand = (c) => { if (c === 'next') cont.click(); };
    env.say(line);
  }
  const handle = {
    el: sh.el, kb: 'play',
    onNote(midi, on, t) { if (on && run) run.note(midi, t); },
    expected: () => [],
    destroy() { if (run) run.destroy(); },
  };
  env.later(ready, 30);
  return handle;
}
