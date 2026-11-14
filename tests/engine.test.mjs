import test from 'node:test';
import assert from 'node:assert/strict';
import * as ENG from '../src/engine.js';
import * as REAL from '../src/curriculum.js';

const { createEngine, createRng, migrate, mergeStates, DEFAULT_CONFIG } = ENG;
const MIN = 60000, DAY = 86400000;

// ------------------------------------------------------------------ fixture curriculum
function makeFixture() {
  const STAGES = [], ITEMS = {};
  const kinds = ['note', 'note', 'note', 'note', 'mix', 'note', 'note', 'chord', 'note', 'note', 'note'];
  const counts = [5, 7, 5, 7, 0, 6, 6, 6, 6, 6, 6];
  kinds.forEach((kind, i) => {
    const id = 's' + i;
    const st = { id, index: i, title: 'Stage ' + i, short: 'S' + i, description: '', kind, clef: 'treble', itemIds: [],
      rt: i === 0 ? { start: 3500, end: 1500 } : { start: 3000, end: 1200 } };
    if (kind === 'mix') { st.refs = ['s0', 's1', 's2', 's3'].flatMap((x) => STAGES.find((s) => s.id === x).itemIds); st.rt = { start: 2500, end: 1100 }; }
    for (let j = 0; j < counts[i]; j++) {
      const iid = `fx:${i}:${j}`;
      ITEMS[iid] = { id: iid, stageId: id, kind: kind === 'chord' ? 'chord' : 'note', clef: 'treble', label: iid, hint: { name: iid } };
      st.itemIds.push(iid);
    }
    STAGES.push(st);
  });
  STAGES.push({ id: 'pd', index: 11, title: 'Pedal', short: 'P', description: '', kind: 'note', clef: 'bass', itemIds: ['fx:pd:0', 'fx:pd:1'],
    rt: { start: 3000, end: 1300 }, optional: true, requires: 's3' });
  for (const k of [0, 1]) ITEMS[`fx:pd:${k}`] = { id: `fx:pd:${k}`, stageId: 'pd', kind: 'note', clef: 'bass', label: 'pd', hint: { name: 'pd' } };
  const realize = (item, rng) => {
    const midi = 40 + (Math.abs([...item.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 30);
    rng();
    return { kind: item.kind, clef: 'treble', notes: [{ midi, staff: 'treble' }], answer: { type: 'set', midis: [midi] }, range: { lo: 48, hi: 72 } };
  };
  return { STAGES, ITEMS, getStage: (id) => STAGES.find((s) => s.id === id), stageItems: (id) => STAGES.find((s) => s.id === id).itemIds.map((x) => ITEMS[x]), realize };
}
const FX = makeFixture();
const CFG = { curriculum: FX };

// ------------------------------------------------------------------ helpers
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function mkEngine(opts = {}) { return createEngine({ seed: 7, config: CFG, ...opts }); }

/** state with stages < idx passed (items seeded as comfortably known) */
function stateAt(idx, { cur = FX, pace = 1 } = {}) {
  const e = createEngine({ seed: 5, config: { curriculum: cur } });
  const s = e.getState();
  const ne = cur.STAGES.filter((x) => !x.optional);
  ne.forEach((st, i) => {
    if (i < idx) {
      s.stages[st.id].status = 'passed'; s.stages[st.id].via = 'mastery';
      for (const id of (st.refs ? [] : st.itemIds)) s.items[id] = { n: 8, c: 8, acc: 0.95, rt: Math.round(st.rt.end * 1.1), streak: 5, box: 4, last: 0, due: 40 * DAY, intro: 1, fs: 0 };
    } else if (i === idx) s.stages[st.id].status = 'active'; else s.stages[st.id].status = 'locked';
  });
  s.stageIdx = idx; s.pace = pace; s.placementDone = true;
  return s;
}

/**
 * Simulated learner using only the public API.
 * pKnown: initial P(correct) per item; pLearn: learning per scored exposure; rtMult: rt as a multiple of prompt.goalMs.
 */
function sim({ engine, pKnown = 0.9, pLearn = 0, rtMult = 1, rtSd = 0.15, seed = 1, conf = {}, now = 1e12, maxAnswers = 3000,
  stop = () => false, single = false, sessionMs = 10 * MIN, mode = 'practice', stageId, oracle, hintRule }) {
  const rr = createRng(seed);
  const p = {};
  const log = { answers: 0, scored: 0, events: [], prompts: [], now, sessions: 0 };
  const run = () => {
    engine.startSession({ mode, stageId, lengthMs: sessionMs, now: log.now, tzOffsetMin: 0 });
    log.sessions++;
    for (;;) {
      const pr = engine.next({ now: log.now });
      if (!pr) break;
      log.prompts.push(pr);
      if (pr.isIntro) {
        log.now += 1500;
        const fb = engine.answer({ promptId: pr.promptId, correct: true, rtMs: 1500, hintShown: true, wrong: [], now: log.now });
        log.answers++; log.events.push(...fb.events.map((e) => ({ ...e, at: log.scored })));
        continue;
      }
      let ok;
      if (oracle) ok = oracle(pr);
      else {
        if (p[pr.itemId] == null) p[pr.itemId] = conf[pr.itemId] != null ? conf[pr.itemId] : pKnown;
        ok = rr() < p[pr.itemId];
        if (conf[pr.itemId] == null) p[pr.itemId] += pLearn * (1 - p[pr.itemId]);
      }
      const goal = Number.isFinite(pr.goalMs) ? pr.goalMs : 2000;
      const rt = Math.max(250, Math.round(goal * rtMult * Math.exp(rtSd * gauss(rr))));
      log.now += rt + 450;
      const fb = engine.answer({ promptId: pr.promptId, correct: ok, rtMs: rt, hintShown: false, wrong: ok ? [] : [1], now: log.now });
      log.answers++; log.scored++;
      log.events.push(...fb.events.map((e) => ({ ...e, at: log.scored })));
      if (stop(log, fb)) { log.stopped = true; return; }
      if (fb.sessionOver || log.answers >= maxAnswers) break;
    }
    engine.endSession({ now: log.now });
  };
  while (!log.stopped && log.answers < maxAnswers) {
    const before = log.answers;
    run();
    if (single || log.answers === before) break;
    log.now += 20 * MIN;
  }
  return log;
}
const passedStage = (id, via) => (log) => log.events.some((e) => e.type === 'stage-passed' && e.stageId === id && (!via || e.via === via));

// ------------------------------------------------------------------ 1. determinism
test('1 determinism: same seed + same answers -> same prompts and final state', () => {
  const run = () => {
    const e = mkEngine({ state: stateAt(1) });
    const log = sim({ engine: e, pKnown: 0.8, pLearn: 0.05, rtMult: 0.9, seed: 11, maxAnswers: 150 });
    return { seq: log.prompts.map((p) => p.itemId + ':' + p.reason), state: JSON.stringify(e.getState()) };
  };
  const a = run(), b = run();
  assert.deepEqual(a.seq, b.seq);
  assert.equal(a.state, b.state);
  assert.ok(a.seq.length > 100);
});

// ------------------------------------------------------------------ 2. fast vs slow
function fastSlow(cur, stageIdx, stageId) {
  const cfg = { curriculum: cur };
  const fastE = createEngine({ seed: 3, config: cfg, state: stateAt(stageIdx, { cur }) });
  const fast = sim({ engine: fastE, pKnown: 0.97, pLearn: 0, rtMult: 0.6, rtSd: 0.1, seed: 21, stop: passedStage(stageId), maxAnswers: 3000 });
  const slowE = createEngine({ seed: 3, config: cfg, state: stateAt(stageIdx, { cur }) });
  const slow = sim({ engine: slowE, pKnown: 0.72, pLearn: 0.06, rtMult: 1.4, rtSd: 0.15, seed: 22, stop: passedStage(stageId), maxAnswers: 6000 });
  return { fast, slow };
}
function checkFastSlow(label, cur, idx, id) {
  const { fast, slow } = fastSlow(cur, idx, id);
  console.log(`[${label}] fast answers: ${fast.answers} (scored ${fast.scored}); slow answers: ${slow.answers} (scored ${slow.scored})`);
  assert.ok(fast.stopped, 'fast learner passes the stage');
  assert.ok(slow.stopped, 'slow learner passes the stage');
  assert.ok(fast.answers <= 0.45 * slow.answers, `fast ${fast.answers} should be <= 45% of slow ${slow.answers}`);
  const ev = fast.events.find((e) => e.type === 'stage-passed' && e.stageId === id);
  assert.ok(label === 'fixture' ? ev.via === 'fast-path' : ['fast-path', 'mastery'].includes(ev.via));
}
test('2 fast learner passes stage 3 in <=45% of the answers a slow learner needs (fixture)', () => checkFastSlow('fixture', FX, 3, 's3'));

// ------------------------------------------------------------------ 3. confusable items get reinforced
test('3 confusable items are presented at least 2x as often as the others', () => {
  const conf = { 'fx:1:2': 0.4, 'fx:1:5': 0.4 };
  const e = mkEngine({ state: stateAt(1) });
  const log = sim({ engine: e, pKnown: 0.95, pLearn: 0, rtMult: 0.8, seed: 31, conf, maxAnswers: 200 + 40 });
  const ps = log.prompts.filter((p) => !p.isIntro && p.stageId === 's1').slice(0, 200);
  assert.ok(ps.length >= 150, 'enough current-stage prompts: ' + ps.length);
  const cnt = {};
  for (const p of ps) cnt[p.itemId] = (cnt[p.itemId] || 0) + 1;
  const ids = FX.getStage('s1').itemIds;
  const confAvg = (cnt['fx:1:2'] + cnt['fx:1:5']) / 2;
  const others = ids.filter((i) => !(i in conf));
  const othAvg = others.reduce((a, i) => a + (cnt[i] || 0), 0) / others.length;
  console.log(`[reinforcement] confusable avg ${confAvg} vs others avg ${othAvg.toFixed(1)}`);
  assert.ok(confAvg >= 2 * othAvg, `confusable ${confAvg} vs others ${othAvg}`);
});

// ------------------------------------------------------------------ 4. promotion paths
test('4 mastery path and fast path each fire stage-passed with the right via', () => {
  // fast path
  const a = mkEngine({ state: stateAt(1) });
  const la = sim({ engine: a, pKnown: 0.99, rtMult: 0.5, seed: 41, stop: passedStage('s1'), maxAnswers: 600 });
  assert.equal(la.events.find((e) => e.type === 'stage-passed').via, 'fast-path');
  // mastery path: accurate, mid-speed (around goal, never <=1.0 median) so fast path (ws<=1) cannot fire
  const b = mkEngine({ state: stateAt(1) });
  const lb = sim({ engine: b, pKnown: 0.97, rtMult: 1.12, rtSd: 0.08, seed: 42, stop: passedStage('s1'), maxAnswers: 3000 });
  assert.ok(lb.stopped, 'mastery-path learner eventually passes');
  const ev = lb.events.find((e) => e.type === 'stage-passed' && e.stageId === 's1');
  assert.equal(ev.via, 'mastery');
  assert.equal(b.getState().stageIdx, 2);
  assert.equal(b.getState().stages.s2.status, 'active');
  // mix stage promotes on its window rule
  const m = mkEngine({ state: stateAt(4) });
  const lm = sim({ engine: m, pKnown: 0.98, rtMult: 0.8, seed: 43, stop: passedStage('s4'), maxAnswers: 400 });
  assert.ok(lm.stopped);
  assert.ok(lm.scored >= 20);
});

// ------------------------------------------------------------------ 5. step-back
test('5 step-back fires after a run of wrong answers, serves previous-stage items, then returns', () => {
  const e = mkEngine({ state: stateAt(1) });
  let t = 1e12;
  e.startSession({ mode: 'practice', lengthMs: 60 * MIN, now: t });
  let sb = null, scored = 0, guard = 0;
  while (!sb && guard++ < 200) {
    const p = e.next({ now: t });
    t += 2000;
    if (p.isIntro) { e.answer({ promptId: p.promptId, correct: true, rtMs: 1000, now: t }); continue; }
    const fb = e.answer({ promptId: p.promptId, correct: false, rtMs: 2000, wrong: [3], now: t });
    scored++;
    sb = fb.events.find((x) => x.type === 'step-back');
  }
  assert.ok(sb, 'step-back event');
  assert.ok(scored >= 12 && scored <= 25, 'fires after >=12 window answers, got ' + scored);
  assert.equal(sb.toStageId, 's0');
  assert.equal(e.getState().stageIdx, 1);
  const served = [];
  let over = null;
  for (let i = 0; i < 10; i++) {
    const p = e.next({ now: t });
    served.push(p);
    t += 2000;
    const fb = e.answer({ promptId: p.promptId, correct: true, rtMs: 800, now: t });
    over = fb.events.find((x) => x.type === 'step-back-over') || over;
  }
  assert.ok(served.every((p) => p.stageId === 's0'), 'all from previous stage');
  assert.ok(over, 'step-back-over after 10');
  assert.equal(e.getState().stageIdx, 1);
  const after = e.next({ now: t });
  assert.equal(after.stageId, 's1');
});

// ------------------------------------------------------------------ 6. intro freeze and batch size
test('6 intro freezes while wa<.65, resumes after recovery', () => {
  const e = mkEngine({ state: stateAt(1) });
  let t = 1e12;
  e.startSession({ mode: 'practice', lengthMs: 600 * MIN, now: t });
  const ask = (ok) => {
    const p = e.next({ now: t });
    t += 2500;
    e.answer({ promptId: p.promptId, correct: p.isIntro ? true : ok, rtMs: p.isIntro ? 1000 : 900, now: t });
    return p;
  };
  // initial intros (3), then warm up correct until intros of the next batch occur
  let introsSeen = 0;
  for (let i = 0; i < 80 && introsSeen < 4; i++) { if (ask(true).isIntro) introsSeen++; }
  assert.ok(introsSeen >= 4, 'intros happen while doing well');
  // now fail ~45% (wa ~ .55): enough to pass .65 threshold downward but not below .5
  const pat = [true, false, true, false, true, false, true, true, false, true, false, false, true];
  const frozen = [];
  for (let i = 0; i < 40; i++) {
    const p = ask(pat[i % pat.length]);
    const sg = e.getState().stages.s1.win.filter((w) => w[0] < 1).length;
    frozen.push(p.isIntro);
    if (e.getState().stages.s1.sg) break;
    void sg;
  }
  assert.ok(e.getState().stages.s1.sg, 'struggle flag set');
  const stepped = [];
  for (let i = 0; i < 6; i++) { const p = ask(pat[(i * 3) % pat.length]); stepped.push(p.isIntro); }
  assert.ok(stepped.every((x) => !x), 'no intros while struggling');
  // recover with sustained success
  let resumed = false;
  for (let i = 0; i < 80 && !resumed; i++) { const p = ask(true); if (p.isIntro) resumed = true; }
  assert.ok(!e.getState().stages.s1.sg, 'struggle cleared');
  const st = e.getState();
  const allIntroduced = FX.getStage('s1').itemIds.every((id) => st.items[id] && st.items[id].intro > 0);
  assert.ok(resumed || allIntroduced, 'intros resumed after recovery');
});

test('6b batch size follows pace, initial active shrinks when slow', () => {
  const consecutiveIntros = (pace) => {
    const e = mkEngine({ state: stateAt(1, { pace }) });
    let t = 1e12;
    e.startSession({ mode: 'practice', lengthMs: 600 * MIN, now: t });
    const runs = [];
    let run = 0, paceAtStart = null;
    for (let i = 0; i < 60; i++) {
      const pBefore = e.getState().pace;
      const p = e.next({ now: t });
      if (p.stageId === 's2') break;
      t += 1500;
      if (p.isIntro) { if (run === 0) paceAtStart = pBefore; run++; }
      else if (run) { runs.push([run, paceAtStart]); run = 0; }
      e.answer({ promptId: p.promptId, correct: true, rtMs: p.isIntro ? 900 : Math.round(p.goalMs * 0.5), now: t });
    }
    return runs;
  };
  const slow = consecutiveIntros(0.5);
  assert.equal(slow[0][0], 2, 'initial active set is 2 when pace<.8');
  const fast = consecutiveIntros(3);
  assert.equal(fast[0][0], 3, 'initial set is 3');
  const later = fast.slice(1).filter(([n]) => n > 0);
  assert.ok(later.length >= 1);
  let remaining = 7 - fast[0][0];
  for (const [n, pc] of later) { assert.equal(n, Math.min(remaining, Math.min(3, Math.max(1, Math.round(pc)))), `batch ${n} at pace ${pc}`); remaining -= n; }
  assert.ok(later.some(([n]) => n >= 2), 'high pace introduces batches >1');
  // low pace -> batches of 1 (pace stays low only if accuracy is mediocre; check via direct pace read)
  const lowRuns = consecutiveIntros(1).slice(1);
  let rem2 = 4;
  for (const [n, pc] of lowRuns) { assert.equal(n, Math.min(rem2, Math.min(3, Math.max(1, Math.round(pc))))); rem2 -= n; }
});

// ------------------------------------------------------------------ 7. placement
test('7 placement: oracle knowing stages 0-4 lands on 5 within 28 prompts; zero-knowledge lands on 0', () => {
  const run = (knows) => {
    const e = mkEngine();
    e.startSession({ mode: 'placement', now: 1e12 });
    let t = 1e12, n = 0, last = null, done = null;
    for (;;) {
      const p = e.next({ now: t });
      if (!p) break;
      n++;
      assert.equal(p.reason, 'probe');
      assert.equal(p.hintAfterMs, Infinity);
      const stIdx = FX.STAGES.findIndex((s) => s.id === FX.ITEMS[p.itemId].stageId);
      const ok = knows(stIdx);
      t += 1200;
      const fb = e.answer({ promptId: p.promptId, correct: ok, rtMs: ok ? 900 : 4000, now: t });
      done = fb.events.find((x) => x.type === 'placement-done') || done;
      if (fb.sessionOver) break;
    }
    e.endSession({ now: t });
    return { n, state: e.getState(), done };
  };
  const o = run((i) => i <= 4);
  assert.ok(o.n <= 28, 'prompts ' + o.n);
  assert.equal(o.state.stageIdx, 5);
  assert.equal(o.done.stageId, 's5');
  assert.equal(o.state.stages.s2.via, 'placement');
  assert.equal(o.state.items['fx:2:0'].box, 2);
  assert.equal(o.state.stages.s5.status, 'active');
  assert.ok(o.state.placementDone);
  const z = run(() => false);
  assert.equal(z.state.stageIdx, 0);
  assert.equal(z.n, 4);
  // slow correct answers fail the speed gate
  const slowRun = (() => {
    const e = mkEngine(); e.startSession({ mode: 'placement', now: 0 });
    for (let i = 0; i < 4; i++) { const p = e.next({ now: 0 }); e.answer({ promptId: p.promptId, correct: true, rtMs: 9000, now: 100 }); }
    return e.getState().stageIdx;
  })();
  assert.equal(slowRun, 0);
});

// ------------------------------------------------------------------ 8. test-out
test('8 test-out pass and fail paths; one attempt per day', () => {
  const t0 = 5 * DAY + 3600000;
  const mk = () => mkEngine({ state: stateAt(2) });
  const e = mk();
  assert.equal(e.canTestOut('s2'), true);
  assert.equal(e.canTestOut('s3'), true);
  assert.equal(e.canTestOut('s5'), false);
  assert.equal(e.canTestOut('s1'), false);
  e.startSession({ mode: 'testout', stageId: 's2', now: t0 });
  let t = t0, n = 0, hints = new Set(), fbLast;
  for (;;) {
    const p = e.next({ now: t });
    if (!p) break;
    hints.add(p.hintAfterMs); n++;
    t += 1500;
    fbLast = e.answer({ promptId: p.promptId, correct: true, rtMs: 1500, now: t });
    if (fbLast.sessionOver) break;
  }
  assert.equal(n, 12);
  assert.deepEqual([...hints], [Infinity]);
  assert.ok(fbLast.events.some((x) => x.type === 'stage-passed' && x.via === 'testout'));
  assert.ok(fbLast.events.some((x) => x.type === 'testout-result' && x.passed));
  const st = e.getState();
  assert.equal(st.stages.s2.status, 'passed');
  assert.equal(st.stageIdx, 3);
  assert.equal(st.items['fx:2:0'].box, 3);
  assert.equal(st.items['fx:2:0'].acc, 0.85);
  // all 5 items of the stage were covered
  // fail path + one attempt per day
  const f = mk();
  f.startSession({ mode: 'testout', stageId: 's2', now: t0 });
  t = t0; let i = 0, last;
  for (;;) {
    const p = f.next({ now: t }); if (!p) break;
    t += 1500;
    last = f.answer({ promptId: p.promptId, correct: i++ % 2 === 0, rtMs: 1500, now: t });
    if (last.sessionOver) break;
  }
  assert.ok(last.events.some((x) => x.type === 'testout-result' && !x.passed));
  assert.equal(f.getState().stages.s2.status, 'active');
  assert.equal(f.canTestOut('s2'), false, 'second attempt same day blocked');
  const r = f.startSession({ mode: 'testout', stageId: 's2', now: t + 1000 });
  assert.equal(r.ok, false);
  assert.equal(f.next({ now: t + 1000 }), null);
  const nextDay = f.startSession({ mode: 'testout', stageId: 's2', now: t0 + DAY + 5000 });
  assert.equal(nextDay.ok, true);
  // chord stages use 15 prompts, covering all items
  const c = mkEngine({ state: stateAt(7) });
  c.startSession({ mode: 'testout', stageId: 's7', now: t0 });
  const seen = new Set(); let cn = 0;
  for (;;) { const p = c.next({ now: t0 }); if (!p) break; seen.add(p.itemId); cn++; const fb = c.answer({ promptId: p.promptId, correct: true, rtMs: 1000, now: t0 }); if (fb.sessionOver) break; }
  assert.equal(cn, 15);
  assert.equal(seen.size, 6);
});

// ------------------------------------------------------------------ 9. goal tightens with box; slow never mastered
test('9 goalMs non-increasing as box rises; accurate-but-slow never mastered', () => {
  const e = mkEngine({ state: stateAt(1) });
  const log = sim({ engine: e, pKnown: 1, rtMult: 0.7, rtSd: 0.05, seed: 91, maxAnswers: 120 });
  const byItem = {};
  for (const p of log.prompts) if (!p.isIntro) (byItem[p.itemId] ||= []).push(p.goalMs);
  let tightened = false;
  for (const g of Object.values(byItem)) {
    for (let i = 1; i < g.length; i++) assert.ok(g[i] <= g[i - 1], 'goal rises: ' + JSON.stringify(g));
    if (g[g.length - 1] < g[0]) tightened = true;
  }
  assert.ok(tightened, 'at least one goal tightened');
  // accurate (100%) but slow (2x goal): never mastered, never promoted
  const s = mkEngine({ state: stateAt(1) });
  const slow = sim({ engine: s, pKnown: 1, rtMult: 2.0, rtSd: 0.05, seed: 92, maxAnswers: 400 });
  assert.ok(!slow.events.some((x) => x.type === 'item-mastered' && FX.getStage('s1').itemIds.includes(x.itemId)), 'no s1 item mastered');
  assert.ok(!slow.events.some((x) => x.type === 'stage-passed'));
  const st = s.getState();
  for (const id of FX.getStage('s1').itemIds) if (st.items[id]) assert.ok(st.items[id].box === 0);
  const pr = s.progress({ now: slow.now });
  for (const id of FX.getStage('s1').itemIds) if (pr.items[id]) assert.ok(pr.items[id].mastery < 0.85);
});

// ------------------------------------------------------------------ 10. collector
test('10 collector: set / chord window / wrong key / sequence / pitch-class / rhythm', () => {
  const e = mkEngine();
  e.startSession({ mode: 'practice', now: 0, inputMode: 'keys' });
  const mk = (answer, extra = {}) => e.collector({ answer, ...extra });
  // single
  let c = mk({ type: 'set', midis: [60] }); c.startAt(1000);
  let r = c.push({ midi: 60, t: 1700 });
  assert.equal(r.status, 'correct');
  assert.deepEqual(c.result(), { correct: true, rtMs: 700, wrong: [] });
  // single wrong
  c = mk({ type: 'set', midis: [60] }); c.startAt(0);
  r = c.push({ midi: 61, t: 500 });
  assert.equal(r.status, 'wrong'); assert.equal(r.wrongMidi, 61);
  assert.deepEqual(c.result().wrong, [61]);
  assert.equal(c.result().correct, false);
  // chord any order, rt to last key
  c = mk({ type: 'set', midis: [60, 64, 67] }); c.startAt(0);
  assert.equal(c.push({ midi: 67, t: 800 }).status, 'pending');
  assert.equal(c.push({ midi: 60, t: 900 }).need, 3);
  r = c.push({ midi: 64, t: 1100 });
  assert.equal(r.status, 'correct'); assert.equal(c.result().rtMs, 1100);
  // chord window: 1500 ms from first key
  c = mk({ type: 'set', midis: [60, 64] }); c.startAt(0);
  c.push({ midi: 60, t: 500 });
  assert.equal(c.push({ midi: 64, t: 2200 }).status, 'wrong');
  c = mk({ type: 'set', midis: [60, 64] }); c.startAt(0);
  c.push({ midi: 60, t: 500 });
  assert.equal(c.push({ midi: 64, t: 1900 }).status, 'correct');
  // extra wrong key mid-chord is wrong immediately
  c = mk({ type: 'set', midis: [60, 64, 67] }); c.startAt(0);
  c.push({ midi: 60, t: 100 });
  assert.equal(c.push({ midi: 62, t: 200 }).status, 'wrong');
  // octave strictness
  c = mk({ type: 'set', midis: [60] }); c.startAt(0);
  assert.equal(c.push({ midi: 72, t: 100 }).status, 'wrong');
  // pitch-class (names input)
  e.startSession({ mode: 'practice', now: 0, inputMode: 'names' });
  c = mk({ type: 'set', midis: [60] }); c.startAt(0);
  assert.equal(c.push({ midi: 72, t: 100 }).status, 'correct');
  e.startSession({ mode: 'practice', now: 0, inputMode: 'keys' });
  e.setSettings({ octaveStrict: false });
  c = mk({ type: 'set', midis: [60] }); c.startAt(0);
  assert.equal(c.push({ midi: 48, t: 100 }).status, 'correct');
  e.setSettings({ octaveStrict: true });
  // sequence with given
  c = mk({ type: 'sequence', midis: [60, 64, 67], given: 1 }); c.startAt(0);
  r = c.push({ midi: 64, t: 600 });
  assert.equal(r.status, 'pending'); assert.equal(r.need, 2);
  r = c.push({ midi: 67, t: 1300 });
  assert.equal(r.status, 'correct'); assert.equal(c.result().rtMs, 1300);
  c = mk({ type: 'sequence', midis: [60, 64, 67], given: 1 }); c.startAt(0);
  assert.equal(c.push({ midi: 67, t: 500 }).status, 'wrong');
  // rhythm: 72 bpm => beat 833 ms, tol = max(150, 110) = 150 ms
  const rh = { type: 'rhythm', onsets: [0, 1, 2, 2.5], beats: 4, bpm: 72 };
  const beat = 60000 / 72;
  c = mk(rh); c.startAt(1000);
  const times = rh.onsets.map((o, i) => 1000 + o * beat + [20, -40, 60, 0][i]);
  for (const t of times.slice(0, 3)) assert.equal(c.push({ tap: true, t }).status, 'pending');
  assert.equal(c.push({ tap: true, t: times[3] }).status, 'correct');
  assert.equal(c.result().correct, true);
  assert.equal(c.result().rtMs, Math.round((20 + 40 + 60 + 0) / 4));
  c = mk(rh); c.startAt(0);
  assert.equal(c.push({ tap: true, t: 0 + 200 }).status, 'wrong'); // 200ms > 150ms
  c = mk(rh); c.startAt(0);
  c.push({ tap: true, t: 10 }); c.push({ tap: true, t: beat + 10 });
  assert.equal(c.push({ tap: true, t: 2 * beat + 10 }).status, 'pending');
  assert.equal(c.push({ tap: true, t: 3.5 * beat }).status, 'wrong'); // missed 2.5, extra late
  // min tolerance at fast tempo
  c = mk({ type: 'rhythm', onsets: [0, 1], beats: 2, bpm: 200 }); c.startAt(0);
  assert.equal(c.push({ tap: true, t: 100 }).status, 'pending'); // beat=300ms, 18% = 54 -> min 110
  assert.equal(c.push({ tap: true, t: 300 + 109 }).status, 'correct');
});

// ------------------------------------------------------------------ 11. sessions, summary, streak, forgetting
test('11 session ends by time, summary fields, streak across days, forgetting after idle', () => {
  const e = mkEngine({ state: stateAt(1) });
  e.setSettings({ sessionMin: 10, dailyGoalMin: 10 });
  let now = 100 * DAY + 9 * 3600000;
  const days = [];
  for (let d = 0; d < 3; d++) {
    const log = sim({ engine: e, pKnown: 0.9, pLearn: 0.02, rtMult: 0.9, seed: 110 + d, now, maxAnswers: 400, single: true });
    days.push(log);
    now += DAY;
  }
  const st = e.getState();
  assert.equal(st.sessions.length, 3);
  const last = st.sessions[2];
  assert.ok(last.durMs >= 10 * MIN && last.durMs < 11 * MIN, 'session ends once 10 min have elapsed: ' + last.durMs);
  assert.ok(last.answers > 20);
  const pr = e.progress({ now: now - DAY + 3600000 });
  assert.equal(pr.streakDays, 3);
  assert.ok(pr.today.ms >= 10 * MIN);
  assert.equal(pr.today.goalMs, 10 * MIN);
  // summary on a fresh session; safe twice
  e.startSession({ mode: 'practice', lengthMs: 3 * MIN, now });
  let t = now, n = 0;
  for (;;) {
    const p = e.next({ now: t });
    if (!p) break;
    t += 2500;
    const ok = n++ % 5 !== 4;
    const fb = e.answer({ promptId: p.promptId, correct: p.isIntro ? true : ok, rtMs: 1800, now: t });
    if (fb.sessionOver) break;
  }
  const sum = e.endSession({ now: t });
  const sum2 = e.endSession({ now: t + 5 });
  assert.deepEqual(sum, sum2);
  for (const k of ['mode', 'startedAt', 'durMs', 'answers', 'correct', 'accuracy', 'medianRtMs', 'bestStreak', 'itemsMastered',
    'itemsIntroduced', 'weakest', 'stageBefore', 'stageAfter', 'stageProgress', 'dailyGoalMet', 'streakDays']) assert.ok(k in sum, k);
  assert.ok(sum.accuracy > 0.6 && sum.accuracy < 1);
  assert.equal(sum.sessions, undefined);
  assert.ok(sum.stageProgress >= 0 && sum.stageProgress <= 1);
  assert.ok(sum.weakest.length <= 3);
  assert.equal(e.getState().sessions.length, 4);
  // today not yet met does not break the streak
  assert.equal(sum.dailyGoalMet, false);
  assert.equal(sum.streakDays, 3);
  assert.equal(e.progress({ now: t }).streakDays, 3);
  // gap of 2 days breaks it
  assert.equal(e.progress({ now: now + 3 * DAY }).streakDays, 0);

  // forgetting after 30 idle days
  const f = mkEngine({ state: stateAt(1) });
  const before = f.getState().items['fx:0:0'];
  assert.equal(before.box, 4);
  const s0 = f.getState();
  s0.items['fx:0:0'].box = 3; s0.items['fx:0:0'].due = 1000 + 3 * DAY;
  s0.items['fx:0:1'].box = 5; s0.items['fx:0:1'].due = 1000 + 21 * DAY;
  const g = mkEngine({ state: s0 });
  g.startSession({ mode: 'practice', now: 1000 + 33 * DAY });
  const s1 = g.getState();
  assert.equal(s1.items['fx:0:0'].box, 2, 'box 3 item idle 30d loses a box');
  assert.equal(s1.items['fx:0:1'].box, 5, 'box 5 interval is 21d, not overdue by 2x');
  assert.equal(s1.items['fx:0:0'].due, 1000 + 33 * DAY, 'queued as due');
});

// ------------------------------------------------------------------ 12. state round-trip, merge, migrate
test('12 JSON round-trip, mergeStates, migrate robustness', () => {
  const e = mkEngine({ state: stateAt(1) });
  sim({ engine: e, pKnown: 0.85, pLearn: 0.03, rtMult: 1, seed: 120, maxAnswers: 120 });
  const s = e.getState();
  const json = JSON.stringify(s);
  assert.deepEqual(JSON.parse(json), s);
  assert.ok(json.length < 40000);
  const e2 = mkEngine({ state: JSON.parse(json) });
  assert.equal(JSON.stringify(e2.getState()), json);
  // both continue identically
  const l1 = sim({ engine: e, pKnown: 0.85, rtMult: 1, seed: 121, maxAnswers: 60, now: 2e12 });
  const l2 = sim({ engine: e2, pKnown: 0.85, rtMult: 1, seed: 121, maxAnswers: 60, now: 2e12 });
  assert.deepEqual(l1.prompts.map((p) => p.itemId), l2.prompts.map((p) => p.itemId));
  // merge
  const a = { v: 1, totalAnswers: 10, updatedAt: 5 }, b = { v: 1, totalAnswers: 20, updatedAt: 1 };
  assert.equal(mergeStates(a, b).totalAnswers, 20);
  assert.equal(mergeStates(b, a).totalAnswers, 20);
  assert.equal(mergeStates({ ...a, totalAnswers: 20, updatedAt: 9 }, b).updatedAt, 9);
  assert.equal(mergeStates(b, { ...a, totalAnswers: 20, updatedAt: 9 }).updatedAt, 9);
  assert.equal(mergeStates(null, b).totalAnswers, 20);
  assert.equal(mergeStates(a, undefined).totalAnswers, 10);
  assert.notEqual(mergeStates(a, b), b); // cloned
  // migrate never throws
  for (const g of [undefined, null, 5, 'x', [], {}, { v: 2 }, { v: 1, stages: 5, items: 'x', settings: 3, sessions: {}, days: [] },
    { v: 1, items: { nope: { n: 'a' } }, stageIdx: 'q', pace: 99, rng: 'z' }]) {
    const m = migrate(g);
    assert.equal(m.v, 1);
    assert.ok(Number.isFinite(m.pace) && m.pace >= 0.5 && m.pace <= 3);
    assert.ok(Array.isArray(m.sessions) && typeof m.days === 'object');
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(m))), JSON.stringify(m));
    createEngine({ state: g, seed: 3, config: CFG }); // engine accepts garbage too
  }
  assert.equal(ENG.STATE_VERSION, 1);
  assert.ok(DEFAULT_CONFIG.alpha === 0.35);
});

// ------------------------------------------------------------------ extras
test('feedback/prompt contract: skip counts incorrect, intro unscored, hints policy', () => {
  const e = mkEngine({ state: stateAt(1) });
  e.startSession({ mode: 'practice', now: 0 });
  const p = e.next({ now: 0 });
  assert.equal(p.isIntro, true);
  assert.equal(p.hintAfterMs, 0);
  assert.equal(p.reason, 'new');
  const fb = e.answer({ promptId: p.promptId, correct: true, rtMs: 500, now: 500 });
  assert.ok(fb.events.some((x) => x.type === 'new-item'));
  assert.equal(e.getState().totalAnswers, 0);
  let q;
  do { q = e.next({ now: 600 }); if (q.isIntro) e.answer({ promptId: q.promptId, correct: true, rtMs: 1, now: 600 }); } while (q.isIntro);
  assert.equal(q.hintAfterMs, 5000);
  const sk = e.skip({ promptId: q.promptId, now: 3000 });
  assert.equal(sk.correct, false);
  assert.equal(e.getState().totalAnswers, 1);
  assert.equal(e.getState().items[q.itemId].streak, 0);
  e.setSettings({ hints: false });
  const q2 = e.next({ now: 3100 });
  if (!q2.isIntro) assert.equal(q2.hintAfterMs, Infinity);
  JSON.stringify(q2); // prompt serialisable
});

test('optional pedal stage is practicable once its requirement is passed', () => {
  const e = mkEngine({ state: stateAt(4) });
  e.startSession({ mode: 'practice', stageId: 'pd', now: 0 });
  const p = e.next({ now: 0 });
  assert.equal(p.stageId, 'pd');
  assert.equal(e.getState().stageIdx, 4);
  const locked = mkEngine({ state: stateAt(2) });
  locked.startSession({ mode: 'practice', stageId: 'pd', now: 0 });
  assert.equal(locked.next({ now: 0 }).stageId, 's2');
});

test('reset keeps settings, clears progress; review mode never introduces', () => {
  const e = mkEngine({ state: stateAt(2) });
  e.setSettings({ sessionMin: 15 });
  e.startSession({ mode: 'review', now: 0 });
  for (let i = 0; i < 20; i++) { const p = e.next({ now: i * 1000 }); assert.ok(!p.isIntro); e.answer({ promptId: p.promptId, correct: true, rtMs: 1000, now: i * 1000 + 500 }); }
  assert.equal(e.getState().stageIdx, 2);
  e.reset({ now: 5 });
  const s = e.getState();
  assert.equal(s.totalAnswers, 0); assert.equal(s.stageIdx, 0); assert.equal(s.settings.sessionMin, 15);
  assert.equal(e.next({ now: 6 }), null);
});

// ------------------------------------------------------------------ real curriculum (when present)
const realReady = REAL.STAGES.length >= 14 && Object.keys(REAL.ITEMS).length > 50;
test('real curriculum: fast vs slow on stage 3 (bass-staff)', { skip: !realReady && 'curriculum.js not populated yet' }, () => {
  const idx = REAL.STAGES.findIndex((s) => s.id === 'bass-staff');
  assert.equal(idx, 3);
  checkFastSlow('real', REAL, idx, 'bass-staff');
});

test('real curriculum: placement', { skip: !realReady && 'curriculum.js not populated yet' }, () => {
  const ne = REAL.STAGES.filter((s) => !s.optional);
  const run = (knowsUpTo) => {
    const e = createEngine({ seed: 9, config: { curriculum: REAL } });
    e.startSession({ mode: 'placement', now: 0 });
    let t = 0, n = 0;
    for (;;) {
      const p = e.next({ now: t });
      if (!p) break;
      n++;
      const si = ne.findIndex((s) => s.id === REAL.ITEMS[p.itemId].stageId);
      const ok = si <= knowsUpTo;
      t += 1000;
      const fb = e.answer({ promptId: p.promptId, correct: ok, rtMs: ok ? 600 : 5000, now: t });
      if (fb.sessionOver) break;
    }
    return { n, idx: e.getState().stageIdx };
  };
  const o = run(4);
  assert.ok(o.n <= 28); assert.equal(o.idx, 5);
  assert.equal(run(-1).idx, 0);
});
