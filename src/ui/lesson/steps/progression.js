// progression: engine chord items in order, wait mode, each realised once.
import { h, shell, resolveTarget, chordStaff, shake, clear, counter, kbLinks, sameFn, fitKeyboard, bigName } from '../common.js';

export function mount(step, env) {
  const same = sameFn(env.settings);
  const chords = (step.itemIds || []).map((id) => resolveTarget({ itemId: id }, env.naming)).filter(Boolean);
  const staff = chordStaff(chords.map((c) => ({ refs: c.refs })), { label: 'Chord progression', keySig: chords[0] ? chords[0].keySig : 0 });
  const links = kbLinks(env);
  const count = h('div.st-meta');
  const nameHost = h('div.st-name');
  const prompt = h('p.st-prompt');
  const sh = shell(step, { cls: 'st-prog', body: [count, h('div.st-staff', staff.svg), nameHost], foot: prompt });
  const all = chords.flatMap((c) => c.midis);
  const restore = fitKeyboard(env, all.length ? all : [60]);
  let i = -1, got = new Set(), wrong = 0, firstTry = 0, busy = false, glowing = false;
  function next() {
    i++;
    links.clear(); env.kb.clearMarks();
    if (i >= chords.length) { env.done({ n: chords.length, firstTry }); return; }
    const c = chords[i];
    got = new Set(); wrong = 0; busy = false; glowing = false;
    chords.forEach((_, k) => staff.setCol(k, k < i ? 'is-correct' : k === i ? 'is-target' : 'is-dim'));
    clear(count).append(counter(i + 1, chords.length));
    clear(nameHost);
    if (step.scaffold !== 'none') nameHost.append(bigName(c.label, 'is-small'));
    if (step.scaffold === 'glow') glow();
    prompt.textContent = 'Play all the notes of the chord together. Hold what the chords share.';
    env.say(`Chord ${i + 1} of ${chords.length}. ${step.scaffold !== 'none' ? c.label : ''}`);
  }
  function glow() {
    glowing = true;
    const c = chords[i];
    for (const m of c.midis) env.kb.mark(m, 'is-hint', 0);
    // chords: the glowing keys are enough; four link lines would only tangle
  }
  function onNote(midi, on) {
    if (!on || busy || i < 0 || i >= chords.length) return;
    const c = chords[i];
    const k = c.midis.findIndex((m, j) => !got.has(j) && same(m, midi));
    if (k >= 0) {
      got.add(k); env.kb.mark(midi, 'is-ok', 600);
      const nk = staff.noteIdx(i).find((n) => staff.refs[n].midi === c.midis[k]);
      if (nk != null) staff.setNote(nk, 'is-correct');
      if (got.size === c.midis.length) { busy = true; if (!wrong) firstTry++; env.later(next, 700); }
      return;
    }
    if (c.midis.some((m) => same(m, midi))) return;
    wrong++;
    env.kb.mark(midi, 'is-bad', 420);
    shake(sh.body);
    if (step.scaffold === 'none' && wrong >= 2 && !glowing) glow();
  }
  env.later(next, 30);
  return {
    el: sh.el, kb: 'play', onNote,
    expected: () => (chords[i] ? chords[i].midis.filter((_, j) => !got.has(j)) : []),
    relayout: () => links.relayout(),
    destroy() { links.destroy(); restore(); },
  };
}
