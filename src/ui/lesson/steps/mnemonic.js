// mnemonic: (1) words appear one by one as each note lights, bottom to top; (2) notes light in
// order, tap the matching word; (3) five random notes from the set, tap the letter.
import { h, shell, shuffle, chordStaff, shake, clear, refName } from '../common.js';
import { createNamePad } from '../../keyboard.js';
import { voice } from '../kit.js';

export function mount(step, env) {
  const vo = voice(env);
  const refs = step.notes || [];
  const words = step.words && step.words.length === refs.length ? step.words : String(step.phrase || '').split(/\s+/);
  const staff = chordStaff(refs.map((r) => ({ refs: [r] })), { label: `${step.phrase}: ${refs.map((r) => refName(r)).join(' ')}` });
  const staffHost = h('div.st-staff', staff.svg);
  const wordRow = h('div.mn-words', words.map((w) => h('span.mn-word', h('b', w.slice(0, 1)), w.slice(1))));
  const chips = h('div.mn-chips', { role: 'group', 'aria-label': 'Words' });
  const pad = createNamePad({ naming: 'letters', onPick: (m) => pickLetter(m % 12) });
  const padHost = h('div.st-pad', pad.el);
  padHost.hidden = true;
  const prompt = h('p.st-prompt');
  const btn = h('button.btn.btn-primary.btn-block', { type: 'button' }, 'Quiz me');
  const sh = shell(step, { cls: 'st-mnemonic', body: [staffHost, wordRow, chips, padHost], foot: [prompt, btn] });
  let phase = 1, k = 0, n = 0, firstTry = 0, wrong = 0, quiz = [], cur = null;
  const notes = () => staff.svg.__noteEls || [];

  function phase1() {
    phase = 1; btn.hidden = true;
    prompt.textContent = `Every word starts with the note's letter: “${step.phrase}”.`;
    notes().forEach((n0) => n0 && n0.classList.remove('is-lit'));
    [...wordRow.children].forEach((w) => w.classList.remove('is-on'));
    refs.forEach((r, i) => env.later(() => { notes()[i] && notes()[i].classList.add('is-lit'); wordRow.children[i].classList.add('is-on'); vo.play(r.midi, 520); }, 300 + i * 800));
    env.later(() => { btn.hidden = false; btn.onclick = phase2; btn.focus({ preventScroll: true }); }, 300 + refs.length * 800);
  }
  function phase2() {
    phase = 2; btn.hidden = true; k = 0;
    wordRow.hidden = true;
    clear(chips).append(...shuffle(words.map((w, i) => ({ w, i }))).map(({ w, i }) => h('button.chip-btn', { type: 'button', 'data-i': i, onclick: (e) => pickWord(i, e.currentTarget) }, w)));
    light2();
  }
  function light2() {
    notes().forEach((n0, i) => { n0 && n0.classList.remove('is-lit'); staff.setNote(i, i < k ? 'is-correct' : ''); });
    if (k >= refs.length) { phase3(); return; }
    notes()[k] && notes()[k].classList.add('is-lit');
    wrong = 0;
    prompt.textContent = 'Which word goes with the glowing note?';
  }
  function pickWord(i, b) {
    if (phase !== 2) return;
    if (i === k) { n++; if (!wrong) firstTry++; b.classList.add('is-ok'); b.disabled = true; vo.play(refs[k].midi, 400); k++; env.later(light2, 350); }
    else { wrong++; b.classList.add('is-bad'); setTimeout(() => b.classList.remove('is-bad'), 450); prompt.textContent = 'Count up from the bottom line or space.'; }
  }
  function phase3() {
    phase = 3; clear(chips); chips.hidden = true; padHost.hidden = false;
    const pool = [];
    while (pool.length < 5) pool.push(...shuffle(refs));
    quiz = pool.slice(0, 5); k = -1;
    next3();
  }
  function next3() {
    k++;
    if (k >= quiz.length) { env.done({ n: n, firstTry }); return; }
    cur = quiz[k]; wrong = 0;
    staff.svg.remove();
    const one = chordStaff([{ refs: [cur] }], { label: 'Name this note' });
    one.setCol(0, 'is-target');
    clear(staffHost).append(one.svg);
    staffHost.__one = one;
    pad.clearMarks();
    prompt.textContent = `${k + 1} of ${quiz.length}: say the word, then tap the letter.`;
  }
  function pickLetter(p) {
    if (phase !== 3 || !cur) return;
    if (p === cur.midi % 12) {
      n++; if (!wrong) firstTry++;
      pad.mark(cur.midi, 'is-ok', 600); staffHost.__one.setCol(0, 'is-correct'); vo.play(cur.midi, 450);
      const c = cur; cur = null;
      prompt.textContent = refName(c);
      env.later(next3, 650);
    } else { wrong++; pad.mark(60 + p, 'is-bad', 450); shake(staffHost); }
  }
  env.later(phase1, 60);
  env.say(`${step.title}. ${step.phrase}.`);
  return {
    el: sh.el, kb: 'hidden',
    onNote(midi, on) { if (on && phase === 3) pickLetter(midi % 12); },
    onCommand(c) { if (c === 'next' && !btn.hidden) btn.click(); },
    expected: () => (phase === 3 && cur ? [cur.midi] : []),
    destroy() { vo.stop(); },
  };
}
