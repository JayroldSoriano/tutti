// flash: a pattern is shown for showMs, then covered; play it from memory. On an error the pattern
// is uncovered and you get one more try. `pairs: true` = consecutive bass+treble pairs sound together.
import { h, shell, chordStaff, shake, clear, counter, sameFn } from '../common.js';

export function mount(step, env) {
  const same = sameFn(env.settings);
  const showMs = step.showMs || 1500;
  const patterns = step.patterns || [];
  const staffHost = h('div.st-staff.fl-host');
  const cover = h('div.fl-cover', h('span', 'Play it from memory'));
  const count = h('div.st-meta');
  const prompt = h('p.st-prompt');
  const again = h('button.btn.btn-quiet', { type: 'button', onclick: () => reveal(true) }, 'Show it again');
  const sh = shell(step, { cls: 'st-flash', body: [count, h('div.fl-wrap', staffHost, cover)], foot: [prompt, again] });
  let i = -1, groups = [], g = 0, got = new Set(), staff = null, tries = 0, firstTry = 0, phase = 'show', busy = false;

  function grouping(p) {
    if (step.pairs) { const out = []; for (let k = 0; k < p.length; k += 2) out.push(p.slice(k, k + 2)); return out; }
    return p.map((r) => [r]);
  }
  function next() {
    i++;
    env.kb.clearMarks();
    if (i >= patterns.length) { env.done({ n: patterns.length, firstTry }); return; }
    groups = grouping(patterns[i]); g = 0; got = new Set(); tries = 0; busy = false;
    clear(count).append(counter(i + 1, patterns.length));
    staff = chordStaff(groups.map((refs) => ({ refs })), { label: 'Pattern to remember' });
    clear(staffHost).append(staff.svg);
    const all = patterns[i].map((r) => r.midi);
    env.kb.showRange(Math.min(...all), Math.max(...all));
    reveal(false);
  }
  function reveal(isRetry) {
    if (busy) return;
    phase = 'show';
    cover.classList.remove('is-on');
    again.hidden = true;
    prompt.textContent = isRetry ? 'Look again: notice the shape.' : 'Look at the shape. It hides in a moment.';
    env.say(prompt.textContent);
    env.later(() => {
      if (phase !== 'show') return;
      cover.classList.add('is-on');
      phase = 'play';
      again.hidden = false;
      prompt.textContent = 'Now play it from memory.';
    }, showMs);
  }
  function onNote(midi, on) {
    if (!on || busy || !groups.length) return;
    if (phase === 'show') { cover.classList.add('is-on'); phase = 'play'; again.hidden = false; }
    const need = groups[g].map((r) => r.midi);
    const k = need.findIndex((m, j) => !got.has(j) && same(m, midi));
    if (k >= 0) {
      got.add(k);
      env.kb.mark(midi, 'is-ok', 500);
      if (got.size === need.length) {
        staff.setCol(g, 'is-correct');
        g++; got = new Set();
        if (g >= groups.length) {
          busy = true;
          if (tries === 0) firstTry++;
          cover.classList.remove('is-on');
          prompt.textContent = 'From memory. Well read.';
          env.later(next, 800);
        }
      }
      return;
    }
    if (need.some((m) => same(m, midi))) return;
    env.kb.mark(midi, 'is-bad', 420);
    tries++;
    g = 0; got = new Set();
    groups.forEach((_, j) => staff.setCol(j, ''));
    shake(staffHost);
    if (tries >= 2) {
      // second miss: uncover and guide through it so the step never gets stuck
      cover.classList.remove('is-on'); phase = 'guide';
      prompt.textContent = 'Here it is. Play along with the glowing keys.';
      for (const r of groups[0]) env.kb.mark(r.midi, 'is-hint', 0);
      phase = 'play';
      guideMode = true;
      return;
    }
    reveal(true);
  }
  let guideMode = false;
  const wrapped = (midi, on) => {
    onNote(midi, on);
    if (guideMode && on && !busy && g < groups.length) { env.kb.clearMarks(); for (const r of groups[g]) env.kb.mark(r.midi, 'is-hint', 0); }
    if (busy) guideMode = false;
  };
  env.later(next, 30);
  return {
    el: sh.el, kb: 'play', onNote: wrapped,
    expected: () => (groups[g] && !busy ? groups[g].map((r) => r.midi).filter((_, j) => !got.has(j)) : []),
    destroy() {},
  };
}
