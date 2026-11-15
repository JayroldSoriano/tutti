// find-key: keyboard only. Tap every key asked for; found keys stay lit and labelled.
import { h, shell, sameFn, shake, clear, nameOf } from '../common.js';

const LET = { 0: 'C', 1: 'C♯', 2: 'D', 3: 'E♭', 4: 'E', 5: 'F', 6: 'F♯', 7: 'G', 8: 'G♯', 9: 'A', 10: 'B♭', 11: 'B' };
const GROUP = (p) => ([0, 1, 2, 3, 4].includes(p) ? [1, 3] : [6, 8, 10]);

export function mount(step, env) {
  void sameFn;
  const range = step.range || { lo: 36, hi: 84 };
  const pcs = step.pcs || [0];
  const per = {};
  for (const p of pcs) {
    let all = 0;
    for (let m = range.lo; m <= range.hi; m++) if (((m % 12) + 12) % 12 === p) all++;
    per[p] = step.count ? Math.min(step.count, all) : all;
  }
  const total = pcs.reduce((a, p) => a + per[p], 0);
  const found = new Map(); // midi -> true
  const foundBy = {}; for (const p of pcs) foundBy[p] = 0;
  let stage = 0; // index into pcs when ordered
  let firstTry = 0, lastWrong = false, done = false;
  const chips = h('div.fk-chips', pcs.map((p) => h('span.fk-chip', { 'data-pc': p }, h('b', LET[p]), h('span.num', `0 / ${per[p]}`))));
  const big = h('p.fk-prompt', step.prompt || 'Find the keys.');
  const prompt = h('p.st-prompt', step.hintGroups ? 'The outlined black keys are your guide.' : 'Use the black keys as your guide.');
  const sh = shell(step, { cls: 'st-find', body: [big, chips], foot: prompt });
  const kb = env.kb;
  const prevOct = kb.octaves;
  kb.setOctaves(3);
  kb.showRange(Math.max(range.lo, 48), Math.min(range.hi, 72), range);
  function outline() {
    for (const k of kb.el.querySelectorAll('.key-b.is-group')) k.classList.remove('is-group');
    if (!step.hintGroups) return;
    const want = step.ordered ? [pcs[stage]] : pcs;
    const blacks = new Set(want.flatMap(GROUP));
    for (const k of kb.el.querySelectorAll('.key-b')) if (blacks.has(+k.dataset.midi % 12)) k.classList.add('is-group');
  }
  outline();
  function updateChips() {
    for (const c of chips.children) {
      const p = +c.dataset.pc;
      c.querySelector('span').textContent = `${foundBy[p]} / ${per[p]}`;
      c.classList.toggle('is-done', foundBy[p] >= per[p]);
      c.classList.toggle('is-now', !!step.ordered && pcs[stage] === p);
    }
  }
  updateChips();
  function onNote(midi, on) {
    if (!on || done) return;
    const p = ((midi % 12) + 12) % 12;
    const wanted = step.ordered ? [pcs[stage]] : pcs;
    if (midi < range.lo || midi > range.hi) { prompt.textContent = 'That key is outside today’s range.'; return; }
    if (found.has(midi)) return;
    if (wanted.includes(p) && foundBy[p] < per[p]) {
      found.set(midi, true);
      foundBy[p]++;
      if (!lastWrong) firstTry++;
      lastWrong = false;
      kb.mark(midi, 'is-given', 0);
      const key = kb.el.querySelector(`.key[data-midi="${midi}"]`);
      if (key && !key.querySelector('.key-tag')) key.appendChild(h('span.key-tag', { 'aria-hidden': 'true' }, nameOf(midi, env.naming, { octave: true }).replace('#', '♯')));
      updateChips();
      prompt.textContent = `${LET[p]}: ${foundBy[p]} of ${per[p]}.`;
      env.say(prompt.textContent);
      if (step.ordered && foundBy[p] >= per[p] && stage < pcs.length - 1) { stage++; outline(); updateChips(); prompt.textContent = `Now every ${LET[pcs[stage]]}.`; }
      if (found.size >= total) { done = true; prompt.textContent = 'All found.'; env.later(() => env.done({ n: total, firstTry }), 700); }
      return;
    }
    lastWrong = true;
    kb.mark(midi, 'is-bad', 420);
    shake(chips);
    const want = step.ordered ? LET[pcs[stage]] : pcs.map((x) => LET[x]).join(' or ');
    prompt.textContent = `That is ${nameOf(midi, env.naming, { octave: false }).replace('#', '♯')}. Look for ${want}.`;
  }
  return {
    el: sh.el, kb: 'play',
    onNote,
    expected() {
      const want = step.ordered ? [pcs[stage]] : pcs;
      for (let m = range.lo; m <= range.hi; m++) { const p = m % 12; if (want.includes(p) && !found.has(m) && foundBy[p] < per[p]) return [m]; }
      return [];
    },
    destroy() {
      for (const k of kb.el.querySelectorAll('.key-b.is-group')) k.classList.remove('is-group');
      for (const t of kb.el.querySelectorAll('.key-tag')) t.remove();
      kb.clearMarks();
      kb.setOctaves(prevOct);
      void clear;
    },
  };
}
