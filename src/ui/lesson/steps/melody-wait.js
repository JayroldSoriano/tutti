// melody-wait: the score with a cursor that waits on each moment until the right key(s) are down.
// Played notes turn green; a wrong key flashes red on the keyboard only. Runs each pass in turn.
import { h, shell, primaryBtn, clear } from '../common.js';
import { renderScore } from '../../score.js';
import { createWaitPlayer } from '../../../songplay.js';
import { getSong, songBars } from '../../../songs.js';
import { fitKeyboard } from '../common.js';

const HANDS = { rh: 'right hand', lh: 'left hand', both: 'hands together' };

export function runWait({ env, song, bars, pass, pos, host, onDone, onProgress }) {
  const pcMode = env.settings.inputMode === 'names' || env.settings.inputMode === 'mic' || env.settings.octaveStrict === false;
  const box = { w: env.width(), h: Math.max(160, env.height() - 8) };
  const sc = renderScore(song, { bars, hands: pass.hands || 'both', names: !!pass.names, fingers: !!pass.fingers, pos, box, naming: env.naming });
  clear(host).append(sc.el);
  const player = createWaitPlayer(sc.events, { pcMode });
  const midis = sc.events.flatMap((e) => e.midis);
  const restore = fitKeyboard(env, midis.length ? midis : [60]);
  let wrongHere = 0, finished = false;
  function show() {
    const i = player.index;
    const m = player.moment();
    env.kb.clearMarks();
    if (!m) return;
    sc.setCursor(i);
    sc.setState(i, 'is-target');
    wrongHere = 0;
    if (pass.glow) for (const md of m.midis) env.kb.mark(md, 'is-hint', 0);
    const lo = Math.min(...m.midis), hi = Math.max(...m.midis);
    env.kb.showRange(lo, hi, { lo: Math.min(...midis), hi: Math.max(...midis) });
    onProgress && onProgress(i, sc.moments.length);
  }
  show();
  return {
    sc,
    push(midi) {
      if (finished) return;
      const i = player.index;
      const r = player.push(midi);
      if (r.status === 'wrong') {
        env.kb.mark(midi, 'is-bad', 420);
        wrongHere++;
        if (wrongHere >= 2 && !pass.names) sc.reveal(i);
        return;
      }
      env.kb.mark(midi, 'is-ok', 360);
      if (r.status === 'pending') return;
      sc.setState(i, 'is-correct');
      if (r.status === 'done' || !player.moment()) {
        finished = true;
        sc.setCursor(-1);
        env.kb.clearMarks();
        onDone(player.stats());
        return;
      }
      show();
    },
    expected() { const m = player.moment(); return m && !finished ? m.midis.slice() : []; },
    destroy() { restore(); },
  };
}

export function mount(step, env) {
  const base = getSong(step.songId);
  const passes = step.passes && step.passes.length ? step.passes : [{ hands: 'both', names: true, glow: false, fingers: false }];
  const host = h('div.st-score');
  const passLine = h('p.st-pass');
  const prompt = h('p.st-prompt');
  const sh = shell(step, { cls: 'st-melody', body: [passLine, host], foot: prompt });
  if (!base) {
    prompt.textContent = 'This tune is missing. Skipping it.';
    env.later(() => env.done({ passes: [], acc: 0 }), 800);
    return { el: sh.el, kb: 'hidden', destroy() {} };
  }
  const results = [];
  let k = -1, run = null;
  void songBars;
  function startPass() {
    k++;
    if (k >= passes.length) {
      const last = results[results.length - 1] || { acc: 0 };
      env.done({ passes: results, acc: last.acc });
      return;
    }
    const pass = passes[k];
    passLine.textContent = `${passes.length > 1 ? `Pass ${k + 1} of ${passes.length}: ` : ''}${HANDS[pass.hands] || ''}${pass.names ? ', with names' : ', no names'}${pass.fingers ? ' and finger numbers' : ''}`;
    prompt.textContent = 'The cursor waits for you. Take your time.';
    handle.kb = 'play'; env.refreshKb();
    env.say(`${base.title}. ${passLine.textContent}`);
    // measure after the keyboard is back in place
    requestAnimationFrame(() => {
      if (run) run.destroy();
      run = runWait({
        env, song: base, bars: step.bars, pass, pos: step.pos, host,
        onProgress: (i, n) => { prompt.textContent = i === 0 ? 'The cursor waits for you. Take your time.' : `Note ${i + 1} of ${n}`; },
        onDone: (st) => {
          const r = { notes: st.moments, firstTry: st.firstTry, acc: st.acc };
          results.push(r);
          const pct = Math.round(st.acc * 100);
          const more = k < passes.length - 1;
          prompt.textContent = '';
          const go = primaryBtn(more ? `Play pass ${k + 2}` : 'Continue', () => startPass());
          clear(sh.foot).append(h('p.st-prompt', `${st.firstTry} of ${st.moments} notes right first time (${pct}%).`), go);
          handle.onCommand = (c) => { if (c === 'next') go.click(); };
          go.focus({ preventScroll: true });
          env.say(`Pass done. ${pct} percent first time.`);
        },
      });
    });
    clear(sh.foot).append(prompt);
    handle.onCommand = null;
  }
  const handle = {
    el: sh.el, kb: 'play',
    onNote(midi, on) { if (on && run) run.push(midi); },
    expected: () => (run ? run.expected() : []),
    destroy() { if (run) run.destroy(); },
  };
  env.later(startPass, 30);
  return handle;
}
