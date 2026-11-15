// guided: one target at a time, untimed. glow: key pulses + name printed + a line from the note to
// its key. name: name only. none: nothing; after 2 wrong keys the key glows. Wrong = soft shake.
import { h, shell, shuffle, sameFn, resolveTarget, chordStaff, kbLinks, shake, fitKeyboard, bigName, counter, clear } from '../common.js';

export function mount(step, env) {
  const same = sameFn(env.settings);
  const targets = (step.targets || []).map((t) => resolveTarget(t, env.naming)).filter(Boolean);
  const order = [];
  for (let r = 0; r < Math.max(1, step.rounds || 1); r++) order.push(...(step.shuffle ? shuffle(targets) : targets));
  const allMidis = targets.flatMap((t) => t.midis);
  const restore = fitKeyboard(env, allMidis);
  const links = kbLinks(env);
  const staffHost = h('div.st-staff');
  const nameHost = h('div.st-name');
  const prompt = h('p.st-prompt', 'Say it, then play it.');
  const count = h('div.st-meta');
  const sh = shell(step, { cls: 'st-guided', body: [count, nameHost, staffHost], foot: prompt });
  let i = -1, cur = null, staff = null, got = new Set(), wrong = 0, firstTry = 0, glowing = false, busy = false;

  function next() {
    i++;
    links.clear();
    env.kb.clearMarks();
    if (i >= order.length) { env.done({ n: order.length, firstTry }); return; }
    cur = order[i]; got = new Set(); wrong = 0; glowing = false; busy = false;
    clear(count).append(counter(i + 1, order.length));
    staff = chordStaff([{ refs: cur.refs }], { label: `Play ${cur.label}`, keySig: cur.keySig || 0 });
    staff.setCol(0, 'is-target');
    clear(staffHost).append(staff.svg);
    clear(nameHost);
    if (step.scaffold === 'glow' || step.scaffold === 'name') nameHost.append(bigName(cur.label));
    env.kb.showRange(Math.min(...cur.midis), Math.max(...cur.midis), { lo: Math.min(...allMidis), hi: Math.max(...allMidis) });
    if (step.scaffold === 'glow') glow();
    prompt.textContent = step.scaffold === 'none' ? 'Read it from the staff, say it, then play it.' : 'Say it, then play it.';
    env.say(`${i + 1} of ${order.length}. ${step.scaffold === 'none' ? 'Read the note and play it.' : cur.label + '. Say it, then play it.'}`);
  }
  function glow() {
    glowing = true;
    for (const m of cur.midis) env.kb.mark(m, 'is-hint', 0);
    if (cur.refs.length <= 2) links.show(cur.refs.map((r, k) => ({ head: staff.head(k), midi: r.midi })));
  }
  function onNote(midi, on) {
    if (!on || !cur || busy) return;
    const idx = cur.midis.findIndex((m, k) => !got.has(k) && same(m, midi));
    if (idx >= 0) {
      got.add(idx);
      env.kb.mark(midi, 'is-ok', 700);
      staff.setNote(idx, 'is-correct');
      if (got.size === cur.midis.length) {
        busy = true;
        if (!wrong) firstTry++;
        prompt.textContent = cur.label;
        env.later(next, 650);
      }
      return;
    }
    if (cur.midis.some((m) => same(m, midi))) return; // a repeated correct key
    wrong++;
    env.kb.mark(midi, 'is-bad', 420);
    shake(staffHost);
    if (step.scaffold === 'none' && wrong >= 2 && !glowing) { glow(); prompt.textContent = 'Here it is. Play the glowing key.'; }
    else prompt.textContent = 'Not that one. Look again: no rush.';
  }
  env.later(next, 30);
  return {
    el: sh.el, kb: 'play',
    onNote,
    expected: () => (cur ? cur.midis.filter((_, k) => !got.has(k)) : []),
    relayout: () => links.relayout(),
    destroy() { links.destroy(); restore(); },
  };
}
