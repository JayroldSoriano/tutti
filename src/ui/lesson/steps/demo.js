// demo: watch and listen. Key and notehead light together, the name appears. "Play it again" / "My turn".
import { h, shell, primaryBtn, quietBtn } from '../common.js';
import { createStaffKeyLink } from '../kit.js';
import { getSong, songEvents } from '../../../songs.js';
import { renderScore } from '../../score.js';
import { voice } from '../kit.js';

export function mount(step, env) {
  const bpm = step.bpm || 60;
  const gap = Math.max(450, 60000 / bpm);
  const loops = step.loops || 2;
  let link = null, sc = null, timers = [];
  const vo = voice(env);
  let body;
  if (step.songId && getSong(step.songId)) {
    const song = getSong(step.songId);
    sc = renderScore(song, { bars: step.bars, hands: 'both', names: step.showNames !== false, box: { w: env.width(), h: env.height() * 0.62 }, naming: env.naming });
    body = sc.el;
  } else {
    link = createStaffKeyLink({ notes: step.notes || [], env, names: step.showNames !== false, naming: env.naming });
    body = link.el;
  }
  const status = h('p.st-prompt', 'Listen and watch.');
  const again = quietBtn('Play it again', () => play());
  const mine = primaryBtn('My turn', () => env.done({ seen: true }));
  const sh = shell(step, { cls: 'st-demo', body, foot: [status, h('div.st-actions', again, mine)] });
  function play() {
    for (const t of timers) clearTimeout(t); timers = [];
    status.textContent = 'Listen and watch.';
    if (link) link.play({ gap, loops, onStep: (i) => { const r = link.refs[i]; status.textContent = r ? `${link.kb && ''}${noteText(r)}` : ''; }, onDone: () => { status.textContent = 'Your turn when you are ready.'; } });
    else if (sc) {
      const beat = 60000 / bpm;
      sc.moments.forEach((m, i) => timers.push(setTimeout(() => {
        sc.setCursor(i); sc.setState(i, 'is-target'); if (i) sc.setState(i - 1, 'is-correct');
        for (const md of m.midis) vo.play(md, m.beats * beat * 0.92);
      }, 300 + m.t * beat)));
      const end = sc.moments.length ? sc.moments[sc.moments.length - 1] : null;
      if (end) timers.push(setTimeout(() => { sc.setCursor(-1); status.textContent = 'Your turn when you are ready.'; }, 300 + (end.t + end.beats) * beat));
    }
  }
  function noteText(r) { return (env.noteName ? env.noteName(r) : String(r.midi)); }
  env.later(play, 120);
  env.say(`${step.title}. Listen and watch.`);
  void songEvents;
  return {
    el: sh.el, kb: 'hidden', focus: mine,
    onCommand(c) { if (c === 'next') mine.click(); if (c === 'replay') play(); },
    destroy() { for (const t of timers) clearTimeout(t); vo.stop(); if (link) link.destroy(); },
  };
}
