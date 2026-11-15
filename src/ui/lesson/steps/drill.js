// drill: the v1 prompt loop driven by an engine `lesson` session. Feeds the mastery model.
import { h, shell, primaryBtn, clear } from '../common.js';
import { createPromptRunner } from '../../promptRunner.js';
import { keys, sliceRange, linkLayer } from '../kit.js';
import { resolveDrillItems, pickQuiz } from '../../../lessonProgress.js';
import { LESSONS } from '../../../lessons.js';
import { toast } from '../../dialog.js';
import { pretty } from '../../music.js';
import * as cur from '../../../curriculum.js';

export function mountDrill(step, env, { quiz = false } = {}) {
  const ctx = env.ctx, engine = ctx.engine;
  const now = ctx.now();
  let itemIds = [];
  try {
    if (quiz) itemIds = step.itemIds && step.itemIds.length ? step.itemIds.slice() : pickQuiz(env.lesson, LESSONS, env.itemStats, step.count || 10);
    else itemIds = resolveDrillItems(step, env.lesson, LESSONS, env.itemStats, { now });
  } catch (e) { console.warn(e); itemIds = step.itemIds || []; }
  const count = step.count || (quiz ? 10 : 12);
  const res = (() => {
    if (!itemIds.length) return { ok: false, reason: 'empty' };
    try {
      return engine.startSession({
        mode: 'lesson', itemIds, count, min: quiz ? count : Math.min(count, step.min || count),
        hints: quiz ? 'off' : (step.hints === 'auto' ? 'auto' : step.hints === 'on' ? 'on' : 'off'),
        stopEarly: quiz ? false : !!step.stopEarly, retries: !quiz, now,
        inputMode: env.settings.inputMode || 'keys', tzOffsetMin: new Date().getTimezoneOffset(),
      });
    } catch (e) { console.warn(e); return { ok: false, reason: 'error' }; }
  })();
  const empty = { n: 0, correct: 0, acc: 0, medianRatio: 0, missed: [] };
  if (!res || res.ok === false) {
    // nothing to warm up yet: skip quietly
    const sh = shell(step, { cls: 'st-drill', body: h('p.st-empty', 'Nothing to review yet. On to the new material.') });
    env.later(() => env.done({ ...empty, skipped: true }), quiz ? 900 : 700);
    return { el: sh.el, kb: 'hidden', destroy() {} };
  }
  env.setSessionActive(true);
  let layer = null;
  const dropLayer = () => { if (layer) { layer.remove(); layer = null; } };
  let answered = 0, right = 0, ended = false;
  const tally = h('span.st-count.num', '');
  const runner = createPromptRunner({
    ctx, engine, kb: env.kb, mode: 'lesson', settings: env.settings, quiz,
    showChips: !quiz,
    // a miss on a single note: draw the staff-to-key line from the prompt's own notehead to a key slice
    revealer: (p) => {
      if (p.kind !== 'note' || !p.notes[0]) return null;
      const n = p.notes[0];
      const r = sliceRange([n.midi], { minWhites: 9, pad: 3 });
      const slice = keys(r.lo, r.hi, { labels: 'c', label: 'Where it lives on the keyboard' });
      slice.light(n.midi);
      slice.label(n.midi, env.noteName({ midi: n.midi, accidental: n.accidental }), 'is-name');
      const el = h('div.reveal-link', slice.svg);
      setTimeout(() => {
        const card = el.closest('.p-card');
        const head = card && card.querySelector('.p-staff .st-note:not(.st-ghost) .st-head');
        if (!card || !head) return;
        dropLayer();
        layer = linkLayer(card);
        layer.add(head, slice.el(n.midi), { animate: true });
      }, 40);
      return el;
    },
    onProgress: () => dropLayer(),
    onAnswer: ({ correct }) => { answered++; if (correct) right++; tally.textContent = quiz ? `${answered} of ${count}` : `${right} of ${answered} right`; },
    onEvents: (events, fb) => {
      if (fb && fb.sessionOver) ended = true;
      for (const ev of events || []) if (ev.type === 'item-mastered') { const it = cur.ITEMS[ev.itemId]; toast(`Mastered: ${pretty(it ? it.label : ev.itemId)}`, { tone: 'brass' }); }
    },
    isOver: () => ended,
    onFinish: () => finish(),
  });
  const sh = shell(step, { cls: 'st-drill' + (quiz ? '.st-quiz' : ''), body: [h('div.st-meta', tally), runner.card, runner.tapPad], foot: runner.status });
  tally.textContent = quiz ? `0 of ${count}` : '';
  let summary = null;
  function endSession() {
    if (summary) return summary;
    try { summary = engine.endSession({ now: ctx.now() }); } catch (e) { console.warn(e); summary = {}; }
    env.setSessionActive(false);
    return summary;
  }
  function finish() {
    dropLayer();
    const sm = endSession();
    const result = { n: sm.answers || 0, correct: sm.correct || 0, acc: sm.accuracy || 0, medianRatio: sm.medianRatio || 0, missed: sm.missed || [] };
    env.kb.clearMarks();
    env.kb.el.hidden = false;
    const pct = Math.round(result.acc * 100);
    const line = quiz ? `${result.correct} of ${result.n} right.` : `${result.correct} of ${result.n} right${result.missed.length ? '; the misses will come back soon.' : '.'}`;
    const go = primaryBtn(quiz ? 'See how you did' : 'Continue', () => env.done(result));
    clear(sh.body).append(h('div.st-result', h('p.st-result-num.num', pct + '%'), h('p', line)));
    clear(sh.foot).append(go);
    go.focus({ preventScroll: true });
    handle.kb = 'hidden'; env.refreshKb();
    handle.onCommand = (c) => { if (c === 'next') go.click(); };
    env.say(line);
  }
  runner.start();
  const handle = {
    el: sh.el, kb: 'play',
    onNote(midi, on, t) { if (on) runner.handleInput(midi, t); },
    onCommand(c) {
      if (c === 'hint') runner.showHint();
      if (c === 'next' && runner.phase === 'rhythm-ready') runner.handleInput(71, performance.now(), true);
    },
    expected: () => runner.expected(),
    pause: () => runner.pause(), resume: () => runner.resume(),
    destroy() {
      dropLayer();
      runner.destroy();
      endSession();
      env.kb.el.hidden = false;
    },
  };
  return handle;
}

export function mount(step, env) { return mountDrill(step, env, { quiz: false }); }
