// name-it: a note on the staff; tap its letter on the name pad (and the hand first when askHand).
// The key then lights and sounds as confirmation.
import { h, shell, shuffle, chordStaff, shake, clear, counter, refName } from '../common.js';
import { createNamePad } from '../../keyboard.js';
import { voice } from '../kit.js';

export function mount(step, env) {
  const order = [];
  for (let r = 0; r < Math.max(1, step.rounds || 1); r++) order.push(...shuffle(step.targets || []));
  const vo = voice(env);
  const staffHost = h('div.st-staff');
  const count = h('div.st-meta');
  const prompt = h('p.st-prompt');
  const handRow = h('div.hand-pick', { role: 'group', 'aria-label': 'Which hand plays it?' });
  const pad = createNamePad({ naming: env.naming, onPick: (m) => pick(m % 12) });
  const padHost = h('div.st-pad', pad.el);
  const sh = shell(step, { cls: 'st-nameit', body: [count, staffHost, handRow, padHost], foot: prompt });
  let i = -1, cur = null, staff = null, phase = 'name', wrong = 0, firstTry = 0, busy = false;
  const mkHand = (hand, label) => h('button.hand-btn', { type: 'button', 'data-hand': hand, onclick: () => pickHand(hand) }, handGlyph(hand), h('span', label));
  if (step.askHand) handRow.append(mkHand('lh', 'Left hand'), mkHand('rh', 'Right hand'));
  handRow.hidden = !step.askHand;

  function next() {
    i++;
    env.kb.clearMarks(); pad.clearMarks();
    if (i >= order.length) { env.done({ n: order.length, firstTry }); return; }
    cur = order[i]; wrong = 0; busy = false;
    clear(count).append(counter(i + 1, order.length));
    staff = chordStaff([{ refs: [cur] }], { label: 'Name this note' });
    staff.setCol(0, 'is-target');
    clear(staffHost).append(staff.svg);
    env.kb.showRange(cur.midi, cur.midi);
    phase = step.askHand ? 'hand' : 'name';
    for (const b of handRow.children) b.classList.remove('is-ok', 'is-bad');
    padHost.classList.toggle('is-waiting', phase === 'hand');
    prompt.textContent = phase === 'hand' ? 'Which hand plays it? The staff decides.' : 'Say the letter out loud, then tap it.';
    env.say(`${i + 1} of ${order.length}. ${prompt.textContent}`);
  }
  function pickHand(hand) {
    if (phase !== 'hand' || busy) return;
    const right = cur.staff === 'bass' ? 'lh' : 'rh';
    const btn = handRow.querySelector(`[data-hand="${hand}"]`);
    if (hand === right) {
      btn.classList.add('is-ok');
      phase = 'name';
      padHost.classList.remove('is-waiting');
      prompt.textContent = `${hand === 'lh' ? 'Left' : 'Right'} hand: the ${cur.staff} staff. Now the letter.`;
    } else {
      wrong++;
      btn.classList.add('is-bad'); setTimeout(() => btn.classList.remove('is-bad'), 500);
      prompt.textContent = `This note is on the ${cur.staff} staff. Try the other hand.`;
    }
  }
  function pick(p) {
    if (busy || !cur) return;
    if (phase === 'hand') { prompt.textContent = 'First choose the hand.'; shake(handRow); return; }
    if (p === ((cur.midi % 12) + 12) % 12) {
      busy = true;
      if (!wrong) firstTry++;
      pad.mark(cur.midi, 'is-ok', 900);
      staff.setCol(0, 'is-correct');
      env.kb.mark(cur.midi, 'is-ok', 900);
      vo.play(cur.midi, 650);
      prompt.textContent = refName(cur, env.naming, true);
      env.say(prompt.textContent);
      env.later(next, 900);
    } else {
      wrong++;
      pad.mark(60 + p, 'is-bad', 450);
      shake(staffHost);
      prompt.textContent = 'Not quite. Find a landmark, then count the steps.';
    }
  }
  env.later(next, 30);
  return {
    el: sh.el, kb: 'play',
    onNote(midi, on) { if (on) pick(((midi % 12) + 12) % 12); },
    expected: () => (cur && !busy && phase === 'name' ? [cur.midi] : []),
    pickHand,
    destroy() { vo.stop(); },
  };
}

function handGlyph(hand) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('aria-hidden', 'true');
  const flip = hand === 'lh' ? ' transform="translate(24 0) scale(-1 1)"' : '';
  svg.innerHTML = `<g${flip} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6.5a1.4 1.4 0 0 1 2.8 0V12M10.8 11V4.8a1.4 1.4 0 0 1 2.8 0V11M13.6 11V5.6a1.4 1.4 0 0 1 2.8 0V12M16.4 12V8a1.4 1.4 0 0 1 2.8 0v6.5c0 3.8-2.6 6.5-6.2 6.5h-1.2c-2.2 0-3.6-1-4.8-2.6L4.6 15a1.4 1.4 0 0 1 2.2-1.7L8 14.6"/></g>`;
  return svg;
}
