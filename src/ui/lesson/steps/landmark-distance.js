// landmark-distance: the landmark is a labelled ghost note with its key lit; the target appears.
// Stage 1: choose the distance. Stage 2: play it.
import { h, shell, chordStaff, shake, clear, counter, sameFn, refName } from '../common.js';
import * as cur from '../../../curriculum.js';

const ORD = { 3: '4th', 4: '5th', 5: '6th', 6: '7th', 7: 'octave' };
export function distLabel(d) {
  if (d === 0) return 'same';
  const a = Math.abs(d), dir = d > 0 ? 'up' : 'down';
  if (a === 1) return 'step ' + dir;
  if (a === 2) return 'skip ' + dir;
  return `${ORD[a] || a + 1 + 'th'} ${dir}`;
}

export function mount(step, env) {
  const same = sameFn(env.settings);
  const lm = step.landmark;
  const targets = step.targets || [];
  const staffHost = h('div.st-staff');
  const count = h('div.st-meta');
  const choices = h('div.ld-choices', { role: 'group', 'aria-label': 'How far from the landmark?' });
  const prompt = h('p.st-prompt');
  const sh = shell(step, { cls: 'st-landmark', body: [count, staffHost, choices], foot: prompt });
  let i = -1, t = null, staff = null, phase = 'choose', wrong = 0, firstTry = 0, busy = false, d = 0;
  const stepOf = (r) => cur.staffStep(r.midi, r.staff || 'treble', r.accidental);

  function next() {
    i++;
    env.kb.clearMarks();
    if (i >= targets.length) { env.done({ n: targets.length, firstTry }); return; }
    t = targets[i]; wrong = 0; busy = false; phase = 'choose';
    d = stepOf(t) - stepOf(lm);
    clear(count).append(counter(i + 1, targets.length));
    staff = chordStaff([{ refs: [lm] }, { refs: [t] }], { label: `Landmark ${refName(lm, env.naming)} and a new note` });
    staff.setCol(0, 'is-given');
    staff.setCol(1, 'is-target');
    clear(staffHost).append(h('div.ld-staff', staff.svg, h('span.ld-tag', `${refName(lm, env.naming)}: landmark`)));
    env.kb.showRange(Math.min(lm.midi, t.midi), Math.max(lm.midi, t.midi));
    env.kb.mark(lm.midi, 'is-given', 0);
    const opts = ['skip down', 'step down', 'same', 'step up', 'skip up'];
    const actual = distLabel(d);
    if (!opts.includes(actual)) opts.splice(d > 0 ? opts.length : 0, 0, actual);
    clear(choices).append(...opts.map((o) => h('button.chip-btn', { type: 'button', onclick: () => choose(o, actual) }, o)));
    choices.hidden = false;
    prompt.textContent = 'How far is the new note from the landmark?';
    env.say(`${i + 1} of ${targets.length}. Landmark ${refName(lm, env.naming)}. ${prompt.textContent}`);
  }
  function choose(o, actual) {
    if (phase !== 'choose' || busy) return;
    const btn = [...choices.children].find((b) => b.textContent === o);
    if (o === actual) {
      btn.classList.add('is-ok');
      phase = 'play';
      prompt.textContent = `${actual[0].toUpperCase() + actual.slice(1)} from ${refName(lm, env.naming)}. Now play it.`;
      env.say(prompt.textContent);
    } else {
      wrong++;
      btn.classList.add('is-bad'); setTimeout(() => btn.classList.remove('is-bad'), 500);
      prompt.textContent = 'Not quite. Line to line or space to space is a skip; line to space is a step.';
    }
  }
  function onNote(midi, on) {
    if (!on || !t || busy) return;
    if (phase !== 'play') { if (!same(midi, lm.midi)) { prompt.textContent = 'First choose the distance.'; shake(choices); } return; }
    if (same(midi, t.midi)) {
      busy = true;
      if (!wrong) firstTry++;
      staff.setCol(1, 'is-correct');
      env.kb.mark(midi, 'is-ok', 700);
      prompt.textContent = refName(t, env.naming, true);
      env.later(next, 750);
    } else if (!same(midi, lm.midi)) {
      wrong++;
      env.kb.mark(midi, 'is-bad', 420);
      shake(staffHost);
      prompt.textContent = `Start from ${refName(lm, env.naming)} and move ${distLabel(d)}.`;
    }
  }
  env.later(next, 30);
  return {
    el: sh.el, kb: 'play', onNote,
    expected: () => (t && phase === 'play' && !busy ? [t.midi] : []),
    choose: () => { if (phase === 'choose') choose(distLabel(d), distLabel(d)); },
    destroy() {},
  };
}
