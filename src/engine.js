// Tutti adaptive engine. Pure ES module: no DOM, no Date.now / Math.random / performance.now.
// Time arrives as `now` (ms) in every call; randomness comes from a seeded mulberry32 stream
// whose state is persisted in State.rng. Curriculum is injectable via config.curriculum.
import * as DEFAULT_CURRICULUM from './curriculum.js';

export const STATE_VERSION = 1;

const MIN = 60000;
const DAY = 86400000;

export const DEFAULT_CONFIG = {
  alpha: 0.35,
  hintedScore: 0.5,
  rtClampMs: 15000,
  slowMult: 2.5,
  micAllowanceMs: 350,
  prior: 0.5, // acc of a never-seen item
  masteredAt: 0.85,
  masteredStreak: 3,
  masteredN: 4,
  boxMax: 5,
  boxIntervalsMs: [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY],
  forgetMult: 2,
  knownOnSight: 0.6,
  knownOnSightBox: 3,
  reviewShare: { normal: 0.25, struggling: 0.1, flying: 0.4 },
  weight: { base: 1, miss: 4, overdue: 2, isNew: 1.5 },
  newIsN: 3, // item counts as "new" for weighting until it has this many scored answers
  requeue: [2, 5, 10],
  window: 20,
  paceEvery: 5,
  paceUp: 1.25,
  paceDown: 0.7,
  paceMin: 0.5,
  paceMax: 3,
  paceDrift: 0.3,
  paceUpWa: 0.9,
  paceDownWa: 0.7,
  initialActive: 3,
  initialActiveSlow: 2,
  introAt: { slow: 0.8, normal: 0.7, fast: 0.55 },
  introLast: 4,
  struggle: {
    freezeBelow: 0.65,
    resumeAt: 0.8,
    minWindow: 8,
    keepWeak: 3,
    hintMs: 2500,
    hintMsNormal: 5000,
    stepBackBelow: 0.5,
    stepBackMin: 12,
    stepBackLen: 10,
    stepBackPool: 4,
  },
  promote: { masteryFrac: 0.85, wa: 0.85, fastN: 12, fastWa: 0.95, fastWs: 1.0, mixN: 20, mixWa: 0.9, mixWs: 1.1 },
  testout: { n: 12, nChord: 15, acc: 0.9, rtMult: 1.25, seedBox: 3, seedAcc: 0.85 },
  placement: { perStage: 4, pass: 3, rtMult: 1.5, cap: 28, maxStage: 9, seedBox: 2, seedAcc: 0.75 },
  chordWindowMs: 1500,
  rhythmTolBeat: 0.18,
  rhythmTolMinMs: 110,
  defaultSessionMin: 10,
  reviewSessionMs: 3 * MIN,
  idleCapMs: 30000,
  maxSessions: 60,
  curriculum: undefined,
};

const DEFAULT_SETTINGS = {
  sessionMin: 10, dailyGoalMin: 10, inputMode: 'keys', sound: true, hints: true,
  naming: 'letters', octaveStrict: true, labels: 'c-only', metronome: true,
};

// ---------------------------------------------------------------- rng
export function createRng(seed) {
  let a = (Number.isFinite(seed) ? seed : 0) >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.state = () => a;
  f.setState = (s) => { a = (Number.isFinite(s) ? s : 0) >>> 0; };
  return f;
}

// ---------------------------------------------------------------- helpers
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mergeConfig(base, over) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? { ...base[k] } : Array.isArray(base[k]) ? [...base[k]] : base[k];
  if (isObj(over)) {
    for (const k of Object.keys(over)) {
      if (isObj(over[k]) && isObj(out[k])) out[k] = { ...out[k], ...over[k] };
      else out[k] = over[k];
    }
  }
  return out;
}
function dayKey(now, tzOffsetMin) {
  return new Date(now - (tzOffsetMin || 0) * MIN).toISOString().slice(0, 10);
}
function prevDay(key) {
  return new Date(Date.parse(key + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
}
const nonOptional = (cur) => cur.STAGES.filter((s) => !s.optional);

// ---------------------------------------------------------------- state
function freshState(cur, seed) {
  const state = {
    v: 1, updatedAt: 0, totalAnswers: 0, rng: (seed >>> 0) || 0, placementDone: false,
    stageIdx: 0, pace: 1, stages: {}, items: {}, sessions: [], days: {},
    settings: { ...DEFAULT_SETTINGS }, tz: 0,
  };
  for (const st of cur.STAGES) state.stages[st.id] = { status: 'locked', win: [] };
  const first = nonOptional(cur)[0];
  if (first) state.stages[first.id].status = 'active';
  return state;
}

function migrateWith(any, cur, seed = 0) {
  const fresh = freshState(cur, seed);
  if (!isObj(any) || any.v !== 1) return fresh;
  try {
    const s = fresh;
    s.updatedAt = num(any.updatedAt, 0);
    s.totalAnswers = Math.max(0, Math.floor(num(any.totalAnswers, 0)));
    s.rng = num(any.rng, s.rng) >>> 0;
    s.placementDone = !!any.placementDone;
    s.pace = clamp(num(any.pace, 1), 0.5, 3);
    s.tz = num(any.tz, 0);
    const maxIdx = Math.max(0, nonOptional(cur).length - 1);
    s.stageIdx = clamp(Math.floor(num(any.stageIdx, 0)), 0, maxIdx);
    if (isObj(any.settings)) {
      for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof any.settings[k] === typeof DEFAULT_SETTINGS[k]) s.settings[k] = any.settings[k];
      }
    }
    // stages: keep recognised ids; fall back to index-derived statuses when missing
    if (isObj(any.stages)) {
      for (const st of cur.STAGES) {
        const r = any.stages[st.id];
        if (!isObj(r)) continue;
        const status = ['locked', 'active', 'passed'].includes(r.status) ? r.status : 'locked';
        const win = Array.isArray(r.win) ? r.win.filter((e) => Array.isArray(e) && Number.isFinite(e[0])).slice(-DEFAULT_CONFIG.window)
          .map((e) => [e[0], Number.isFinite(e[1]) ? e[1] : null]) : [];
        const o = { status, win };
        if (typeof r.via === 'string') o.via = r.via;
        if (Number.isFinite(r.passedAt)) o.passedAt = r.passedAt;
        if (typeof r.toDay === 'string') o.toDay = r.toDay;
        if (r.sg) o.sg = 1;
        s.stages[st.id] = o;
      }
    }
    if (isObj(any.items)) {
      for (const id of Object.keys(any.items)) {
        const r = any.items[id];
        if (!isObj(r) || !cur.ITEMS[id]) continue;
        s.items[id] = {
          n: Math.max(0, Math.floor(num(r.n, 0))), c: Math.max(0, Math.floor(num(r.c, 0))),
          acc: clamp(num(r.acc, 0.5), 0, 1), rt: Math.max(0, num(r.rt, 0)),
          streak: Math.max(0, Math.floor(num(r.streak, 0))), box: clamp(Math.floor(num(r.box, 0)), 0, 5),
          last: num(r.last, 0), due: num(r.due, 0), intro: Math.max(0, num(r.intro, 0)),
          fs: Math.max(0, Math.floor(num(r.fs, 0))),
        };
        if (r.weak) s.items[id].weak = 1;
      }
    }
    if (Array.isArray(any.sessions)) {
      s.sessions = any.sessions.filter(isObj).slice(-60).map((x) => ({
        t: num(x.t, 0), durMs: num(x.durMs, 0), answers: num(x.answers, 0),
        accuracy: num(x.accuracy, 0), medianRtMs: num(x.medianRtMs, 0),
      }));
    }
    if (isObj(any.days)) {
      for (const k of Object.keys(any.days)) {
        const d = any.days[k];
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(d)) s.days[k] = { ms: num(d.ms, 0), answers: num(d.answers, 0), correct: num(d.correct, 0) };
      }
    }
    // consistency: exactly one stage 'active' among non-optional at stageIdx unless all passed
    const ne = nonOptional(cur);
    ne.forEach((st, i) => {
      const r = s.stages[st.id];
      if (i < s.stageIdx && r.status === 'locked') r.status = 'passed';
      if (i === s.stageIdx && r.status === 'locked') r.status = 'active';
    });
    return s;
  } catch (e) {
    return fresh;
  }
}

export function migrate(any) {
  return migrateWith(any, DEFAULT_CURRICULUM, 0);
}

export function mergeStates(a, b) {
  if (!isObj(a) && !isObj(b)) return migrate(undefined);
  if (!isObj(a)) return clone(b);
  if (!isObj(b)) return clone(a);
  const ta = num(a.totalAnswers, 0), tb = num(b.totalAnswers, 0);
  if (ta !== tb) return clone(ta > tb ? a : b);
  return clone(num(b.updatedAt, 0) > num(a.updatedAt, 0) ? b : a);
}

// ---------------------------------------------------------------- collector
function makeCollector(prompt, { inputMode, octaveStrict, config }) {
  const ans = prompt.answer;
  const pcMode = inputMode === 'names' || inputMode === 'mic' || octaveStrict === false;
  const same = (a, b) => (pcMode ? ((a % 12) + 12) % 12 === ((b % 12) + 12) % 12 : a === b);
  let startT = null;
  let done = null; // final status
  let wrongMidi;
  const wrong = [];
  let lastT = null;
  let firstT = null;
  const clampRt = (v) => clamp(v, 0, config.rtClampMs);

  if (ans.type === 'rhythm') {
    const beatMs = 60000 / ans.bpm;
    const tol = Math.max(config.rhythmTolBeat * beatMs, config.rhythmTolMinMs);
    const errs = [];
    let k = 0;
    const col = {
      startAt(t) { startT = t; },
      push(ev) {
        if (done) return { status: done, matched: errs.map((_, i) => ans.onsets[i]), need: ans.onsets.length };
        const t = ev.t;
        if (startT == null) startT = t - ans.onsets[0] * beatMs;
        const rel = t - startT;
        const target = ans.onsets[k] * beatMs;
        if (Math.abs(rel - target) <= tol) { errs.push(Math.abs(rel - target)); k++; if (k >= ans.onsets.length) done = 'correct'; }
        else done = 'wrong';
        return { status: done || 'pending', matched: ans.onsets.slice(0, k), need: ans.onsets.length };
      },
      result() {
        const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
        return { correct: done === 'correct', rtMs: Math.round(mean), wrong: [] };
      },
    };
    return col;
  }

  const required = ans.type === 'sequence' ? ans.midis.slice(ans.given || 0) : ans.midis.slice();
  const matched = [];
  const used = new Set();
  const need = required.length;
  return {
    startAt(t) { startT = t; },
    push(ev) {
      const status = () => ({ status: done || 'pending', matched: matched.slice(), need, ...(wrongMidi != null ? { wrongMidi } : {}) });
      if (done) return status();
      const t = ev.t;
      if (ev.tap || !Number.isFinite(ev.midi)) return status(); // taps mean nothing for pitch prompts
      if (startT == null) startT = t;
      if (ans.type === 'sequence') {
        const want = required[matched.length];
        if (same(ev.midi, want)) { matched.push(want); lastT = t; if (matched.length >= need) done = 'correct'; }
        else { done = 'wrong'; wrongMidi = ev.midi; wrong.push(ev.midi); }
        return status();
      }
      // set
      if (firstT != null && !done && t - firstT > config.chordWindowMs && matched.length < need) {
        done = 'wrong'; return status();
      }
      const idx = required.findIndex((m, i) => !used.has(i) && same(ev.midi, m));
      if (idx >= 0) {
        used.add(idx); matched.push(required[idx]); lastT = t;
        if (firstT == null) firstT = t;
        if (matched.length >= need) done = 'correct';
      } else if (matched.some((m) => same(ev.midi, m))) {
        // re-press of an already matched key: ignore
      } else { done = 'wrong'; wrongMidi = ev.midi; wrong.push(ev.midi); }
      return status();
    },
    result() {
      const ok = done === 'correct';
      const rt = lastT != null && startT != null ? lastT - startT : config.rtClampMs;
      return { correct: ok, rtMs: Math.round(clampRt(rt)), wrong: wrong.slice() };
    },
  };
}

// ---------------------------------------------------------------- engine
export function createEngine({ state: saved, seed = 1, config: cfgOver } = {}) {
  const config = mergeConfig(DEFAULT_CONFIG, cfgOver);
  const cur = config.curriculum || DEFAULT_CURRICULUM;
  const NONOPT = nonOptional(cur);
  let state = migrateWith(saved, cur, seed);
  const rng = createRng(state.rng);
  let sess = null; // active session
  let lastNow = state.updatedAt || 0;
  let lastSummary = null;
  const prompts = new Map(); // promptId -> meta

  // ---- curriculum accessors
  const stageById = (id) => cur.getStage ? cur.getStage(id) || cur.STAGES.find((s) => s.id === id) : cur.STAGES.find((s) => s.id === id);
  const itemsOf = (stage) => {
    if (!stage) return [];
    const ids = stage.kind === 'mix' || stage.refs ? (stage.refs || []).flatMap((rid) => (stageById(rid) ? stageById(rid).itemIds : [rid])).filter((id, i, a) => cur.ITEMS[id] && a.indexOf(id) === i)
      : stage.itemIds.filter((id) => cur.ITEMS[id]);
    return ids;
  };
  const isMix = (stage) => stage && (stage.kind === 'mix' || (stage.refs && stage.refs.length));
  const stageOfItem = (id) => stageById(cur.ITEMS[id].stageId);
  const curStage = () => NONOPT[state.stageIdx] || NONOPT[NONOPT.length - 1];

  const rec = (id) => state.items[id] || null;
  const ensure = (id) => state.items[id] || (state.items[id] = { n: 0, c: 0, acc: config.prior, rt: 0, streak: 0, box: 0, last: 0, due: 0, intro: 0, fs: 0 });

  function allowance() {
    const im = (sess && sess.inputMode) || state.settings.inputMode;
    return im === 'mic' ? config.micAllowanceMs : 0;
  }
  function scaleOf(id) {
    const it = cur.ITEMS[id];
    if (it && it.kind === 'phrase') return 6; // nominal phrase length for mastery maths (prompts carry actual)
    return 1;
  }
  // goal for an item at a box, in a basis stage, scaled for phrases
  function goalFor(box, stage, scale = 1) {
    const rt = stage.rt || { start: 3000, end: 1200 };
    return lerp(rt.start, rt.end, clamp(box, 0, config.boxMax) / config.boxMax) * scale + allowance();
  }
  function speedOf(r, stage, scale = 1) {
    if (!r.rt) return 0;
    const rtc = stage.rt || { start: 3000, end: 1200 };
    const slow = config.slowMult * rtc.start * scale + allowance();
    const goal = goalFor(r.box, stage, scale);
    if (slow - goal <= 0) return r.rt <= goal ? 1 : 0;
    return clamp((slow - r.rt) / (slow - goal), 0, 1);
  }
  function masteryOf(r, stage, scale = 1) {
    if (!r || !r.n) return 0;
    return 0.6 * r.acc + 0.4 * speedOf(r, stage, scale);
  }
  const itemMastery = (id, scale = scaleOf(id)) => masteryOf(rec(id), stageOfItem(id), scale);
  function isMastered(id, scale = 1) {
    const r = rec(id);
    return !!r && r.n >= config.masteredN && r.streak >= config.masteredStreak && masteryOf(r, stageOfItem(id), scale) >= config.masteredAt;
  }
  const introduced = (stage, st, id) => isMix(stage) || st.status === 'passed' || (rec(id) && rec(id).intro > 0);

  // ---- window stats
  function winStats(stId) {
    const w = state.stages[stId].win;
    if (!w.length) return { n: 0, wa: 0, ws: Infinity };
    const wa = w.reduce((a, e) => a + e[0], 0) / w.length;
    const ratios = w.filter((e) => e[1] != null).map((e) => e[1]);
    return { n: w.length, wa, ws: ratios.length ? median(ratios) : Infinity };
  }

  // ---- day / streak
  function dayRec(now) {
    const k = dayKey(now, state.tz);
    return state.days[k] || (state.days[k] = { ms: 0, answers: 0, correct: 0 });
  }
  function streakDays(now) {
    const goal = state.settings.dailyGoalMin * MIN;
    let k = dayKey(now, state.tz);
    if (!(state.days[k] && state.days[k].ms >= goal)) k = prevDay(k);
    let n = 0;
    while (state.days[k] && state.days[k].ms >= goal) { n++; k = prevDay(k); }
    return n;
  }

  // ---- stage lifecycle
  function seedStage(stage, box, acc, now) {
    for (const id of itemsOf(stage)) {
      const r = ensure(id);
      if (r.n >= 4 && r.box >= box && r.acc >= acc) continue; // never downgrade real data
      const goal = goalFor(box, stageOfItem(id));
      Object.assign(r, {
        n: Math.max(r.n, box >= 3 ? 4 : 3), c: Math.max(r.c, box >= 3 ? 4 : 3), acc, rt: Math.round(goal * (box >= 3 ? 0.8 : 1)),
        streak: box >= 3 ? 3 : 2, box, last: state.totalAnswers, due: now + config.boxIntervalsMs[box], intro: r.intro || state.totalAnswers + 1,
      });
      delete r.weak;
    }
  }
  function passStage(stage, via, now, events) {
    const st = state.stages[stage.id];
    st.status = 'passed'; st.via = via; st.passedAt = now; st.win = []; delete st.sg;
    events.push({ type: 'stage-passed', stageId: stage.id, via });
    const idx = NONOPT.findIndex((s) => s.id === stage.id);
    if (idx >= 0 && idx === state.stageIdx) {
      if (idx + 1 < NONOPT.length) {
        state.stageIdx = idx + 1;
        const nx = state.stages[NONOPT[idx + 1].id];
        if (nx.status === 'locked') nx.status = 'active';
      }
    }
    // unlock optional stages whose requirement is now passed
    for (const o of cur.STAGES) if (o.optional && o.requires === stage.id && state.stages[o.id].status === 'locked') state.stages[o.id].status = 'locked';
  }
  const canPractice = (stage) => {
    const st = state.stages[stage.id];
    if (!st) return false;
    if (st.status !== 'locked') return true;
    return !!(stage.optional && stage.requires && state.stages[stage.requires] && state.stages[stage.requires].status === 'passed');
  };

  // ---- testout / placement eligibility
  function canTestOutAt(stageId, now) {
    const stage = stageById(stageId);
    if (!stage || stage.optional) return false;
    const idx = NONOPT.findIndex((s) => s.id === stageId);
    if (idx < 0) return false;
    if (state.stages[stageId].status === 'passed') return false;
    if (idx !== state.stageIdx && idx !== state.stageIdx + 1) return false;
    return state.stages[stageId].toDay !== dayKey(now, state.tz);
  }

  // ---- weighted draw
  function weightOf(id, now) {
    const r = rec(id);
    const w = config.weight;
    const m = itemMastery(id);
    const overdue = r && r.n > 0 && r.box >= 1 && r.due <= now ? 1 : (r && r.n > 0 && r.box === 0 ? 1 : 0);
    const isNew = !r || r.n < config.newIsN ? 1 : 0;
    return w.base + w.miss * (1 - m) * (1 - m) + w.overdue * overdue + w.isNew * isNew;
  }
  function draw(ids, now, exclude) {
    let pool = ids;
    if (pool.length > 1 && exclude) pool = pool.filter((id) => id !== exclude);
    if (!pool.length) return null;
    const ws = pool.map((id) => weightOf(id, now));
    const tot = ws.reduce((a, b) => a + b, 0);
    let x = rng() * tot;
    for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // ---- prompt building
  function buildPrompt(itemId, { reason, isIntro = false, now, hintOverride, basis }) {
    const item = cur.ITEMS[itemId];
    const owning = stageOfItem(itemId);
    const body = cur.realize(item, rng);
    const bst = basis || owning;
    const nNotes = item.kind === 'phrase' && body.answer && body.answer.midis ? Math.max(1, body.answer.midis.length - (body.answer.given || 0)) : 1;
    const r = rec(itemId);
    const box = r ? r.box : 0;
    const goalMs = Math.round(goalFor(box, bst, nNotes));
    const st = sess.stageRec;
    let hintAfterMs;
    if (hintOverride !== undefined) hintAfterMs = hintOverride;
    else if (!state.settings.hints) hintAfterMs = Infinity;
    else if (isIntro) hintAfterMs = 0;
    else if (isMastered(itemId, scaleOf(itemId))) hintAfterMs = Infinity;
    else if (st && st.sg) hintAfterMs = config.struggle.hintMs;
    else hintAfterMs = config.struggle.hintMsNormal;
    if (isIntro && !state.settings.hints) hintAfterMs = 0; // teaching card always shows its name
    const promptId = `${sess.id}:${++sess.seq}`;
    const prompt = {
      ...clone(body), promptId, itemId, stageId: owning.id, isIntro, hintAfterMs, hint: clone(item.hint || { name: item.label || itemId }),
      goalMs, mode: sess.mode, index: sess.issued++, reason,
    };
    prompts.set(promptId, { itemId, stageId: owning.id, basis: bst, nNotes, isIntro, issuedAt: now, reason, answered: false, goalMs });
    sess.lastPromptId = promptId;
    return prompt;
  }

  // ---- session start
  function startSession({ mode = 'practice', stageId, lengthMs, now = lastNow, inputMode, tzOffsetMin } = {}) {
    lastNow = now;
    if (sess && !sess.ended) endSession({ now });
    if (Number.isFinite(tzOffsetMin)) state.tz = tzOffsetMin;
    const im = inputMode || state.settings.inputMode;
    let stage = stageId ? stageById(stageId) : curStage();
    if (!stage) stage = curStage();
    const s = {
      id: now, mode, startedAt: now, lengthMs: Number.isFinite(lengthMs) ? lengthMs
        : mode === 'review' ? config.reviewSessionMs : state.settings.sessionMin * MIN,
      inputMode: im, stageId: stage.id, seq: 0, issued: 0, answers: 0, correct: 0, rts: [], streak: 0, bestStreak: 0,
      lastItem: null, lastT: now, queue: [], pendingIntros: 0, sb: null, sbCount: {}, mastered: [], introduced: [],
      stageBefore: null, ended: false, over: false, missCount: {}, ok: true, reasonFail: undefined,
      stageRec: null, lastPromptId: null, pace0: state.pace, touched: new Set(),
    };
    // forgetting: overdue by > 2x interval loses a box and becomes due
    for (const id of Object.keys(state.items)) {
      const r = state.items[id];
      if (r.n > 0 && r.box > 0) {
        const iv = config.boxIntervalsMs[r.box];
        if (now - r.due > config.forgetMult * iv) { r.box -= 1; r.due = now; r.streak = Math.min(r.streak, 2); }
      }
    }
    sess = s;
    lastSummary = null;
    if (mode === 'placement') {
      if (state.placementDone) { s.ok = false; s.reasonFail = 'done'; }
      s.ps = { stageI: 0, asked: 0, inStage: [], total: 0, passedIds: [], maxI: Math.min(config.placement.maxStage, NONOPT.length - 1) };
      s.stageBefore = curStage().id;
      s.stageRec = state.stages[curStage().id];
    } else if (mode === 'testout') {
      if (!canTestOutAt(stage.id, now)) { s.ok = false; s.reasonFail = 'unavailable'; }
      else {
        state.stages[stage.id].toDay = dayKey(now, state.tz); // one attempt per day, counted at start
        s.stageBefore = curStage().id;
        s.tstage = stage;
        const ids = itemsOf(stage);
        const total = stage.kind === 'chord' ? config.testout.nChord : config.testout.n;
        const list = [];
        while (list.length < total && ids.length) {
          const batch = [...ids];
          for (let i = batch.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [batch[i], batch[j]] = [batch[j], batch[i]]; }
          for (const b of batch) if (list.length < total) list.push(b);
        }
        // avoid immediate repeats across batch seams
        for (let i = 1; i < list.length; i++) if (list[i] === list[i - 1]) { const j = list.findIndex((x, k) => k > i && x !== list[i]); if (j > 0) [list[i], list[j]] = [list[j], list[i]]; }
        s.tlist = list; s.tres = [];
        s.stageRec = state.stages[stage.id];
      }
    } else {
      if (!canPractice(stage)) stage = curStage();
      s.stageId = stage.id;
      s.stageBefore = stage.id;
      if (stage.optional && state.stages[stage.id].status === 'locked') state.stages[stage.id].status = 'active';
      s.stageRec = state.stages[stage.id];
      s.progress0 = stageProgress(stage.id);
    }
    state.updatedAt = now;
    return { ok: s.ok, mode, stageId: s.stageId, reason: s.reasonFail };
  }

  function stageProgress(stId) {
    const stage = stageById(stId);
    const st = state.stages[stId];
    if (!stage || !st) return 0;
    if (st.status === 'passed') return 1;
    if (st.status === 'locked') return 0;
    if (isMix(stage)) {
      const w = winStats(stId);
      return r3(clamp(Math.min(1, w.n / config.promote.mixN) * clamp(w.wa / config.promote.mixWa, 0, 1), 0, 1));
    }
    const ids = itemsOf(stage);
    if (!ids.length) return 0;
    return r3(ids.reduce((a, id) => a + (rec(id) && rec(id).intro ? Math.min(1, itemMastery(id) / config.masteredAt) : 0), 0) / ids.length);
  }

  // ---- next prompt
  function next({ now = lastNow } = {}) {
    lastNow = now;
    if (!sess || sess.ended || !sess.ok || sess.over) return null;
    const s = sess;
    const timed = s.mode === 'practice' || s.mode === 'review';
    if (timed && now - s.startedAt >= s.lengthMs) { s.over = true; return null; }

    if (s.mode === 'placement') return nextPlacement(now);
    if (s.mode === 'testout') {
      if (s.tres.length >= s.tlist.length) { s.over = true; return null; }
      return buildPrompt(s.tlist[s.tres.length], { reason: 'probe', now, hintOverride: Infinity });
    }

    const stage = stageById(s.stageId);
    const st = state.stages[stage.id];
    const active = st.status === 'active' && s.mode === 'practice';

    // 1. expanding-retrieval retries
    const dueQ = s.queue.filter((q) => q.at <= s.answers && q.itemId !== s.lastItem).sort((a, b) => a.at - b.at)[0];
    if (dueQ) {
      s.queue.splice(s.queue.indexOf(dueQ), 1);
      return finish(buildPrompt(dueQ.itemId, { reason: 'retry', now }));
    }

    // 2. step-back
    if (s.sb) {
      const prev = s.sb.ids;
      const id = draw(prev, now, s.lastItem);
      return finish(buildPrompt(id, { reason: 'review', now }));
    }

    const ids = itemsOf(stage);
    const intro = ids.filter((id) => introduced(stage, st, id));
    // 3. introductions
    if (active && !isMix(stage)) {
      const unintro = ids.filter((id) => !(rec(id) && rec(id).intro > 0));
      if (unintro.length) {
        const sg = !!st.sg;
        const minActive = state.pace < 0.8 ? config.initialActiveSlow : config.initialActive;
        let doIntro = false;
        if (intro.length < minActive) doIntro = true;
        else if (s.pendingIntros > 0 && !sg) doIntro = true;
        else if (!sg) {
          const w = st.win;
          const lastOk = w.length >= config.introLast && w.slice(-config.introLast).every((e) => e[0] === 1);
          const introAt = state.pace >= 2 ? config.introAt.fast : state.pace <= 0.7 ? config.introAt.slow : config.introAt.normal;
          if (lastOk && intro.every((id) => itemMastery(id) >= introAt)) {
            let batch = clamp(Math.round(state.pace), 1, 3);
            if ((s.sbCount[stage.id] || 0) >= 2) batch = Math.max(1, Math.floor(batch / 2));
            s.pendingIntros = batch;
            doIntro = true;
          }
        }
        if (doIntro) {
          if (s.pendingIntros > 0) s.pendingIntros--;
          const id = unintro[0];
          const r = ensure(id);
          r.intro = state.totalAnswers + 1;
          s.introduced.push(id);
          return finish(buildPrompt(id, { reason: 'new', isIntro: true, now }));
        }
      } else s.pendingIntros = 0;
    }

    // 4. weighted draw: current stage vs review
    let main = intro;
    if (active && st.sg && main.length > config.struggle.keepWeak + 1) {
      const sorted = [...main].sort((a, b) => itemMastery(a) - itemMastery(b));
      main = sorted.slice(0, config.struggle.keepWeak);
      main.push(sorted[sorted.length - 1]);
    }
    const reviewIds = [];
    for (const o of cur.STAGES) {
      if (o.id === stage.id || state.stages[o.id].status !== 'passed') continue;
      for (const id of itemsOf(o)) if (rec(id)) reviewIds.push(id);
    }
    const reviewOnly = s.mode === 'review';
    let pool, reason;
    const pace = state.pace;
    const share = (st.sg || pace < 0.8) ? config.reviewShare.struggling : pace >= 2 ? config.reviewShare.flying : config.reviewShare.normal;
    if (reviewOnly) {
      pool = [...new Set([...main.filter((id) => rec(id)), ...reviewIds])];
      if (!pool.length) pool = ids.filter((id) => rec(id));
    } else if (reviewIds.length && (!main.length || rng() < share)) pool = reviewIds;
    else pool = main;
    if (!pool.length) {
      // nothing introduced yet (e.g. non-active stage with no records): fall back to any stage item
      pool = ids.length ? ids : reviewIds;
      if (!pool.length) { s.over = true; return null; }
      for (const id of pool) ensure(id).intro = ensure(id).intro || state.totalAnswers + 1;
    }
    const id = draw(pool, now, s.lastItem);
    const r = rec(id);
    const isReviewItem = stageOfItem(id).id !== stage.id && !(isMix(stage));
    if (reviewOnly || isReviewItem) reason = r && r.box >= 1 && r.n > 0 && r.due <= now ? 'due' : 'review';
    else reason = r && r.n > 0 && r.box >= 1 && r.due <= now ? 'due' : itemMastery(id) < 0.6 ? 'weak' : 'flow';
    return finish(buildPrompt(id, { reason, now, basis: undefined }));
  }
  function finish(p) { sess.lastItem = p.itemId; return p; }

  function nextPlacement(now) {
    const s = sess, ps = s.ps;
    if (ps.total >= config.placement.cap || ps.stageI > ps.maxI) { s.over = true; return null; }
    const stage = NONOPT[ps.stageI];
    const ids = itemsOf(stage);
    const hard = ids.slice(Math.max(0, ids.length - Math.max(config.placement.perStage, Math.ceil(ids.length / 2))));
    const cand = hard.length ? hard : ids;
    let pool = cand.filter((id) => !ps.inStage.some((e) => e.itemId === id));
    if (!pool.length) pool = cand;
    if (pool.length > 1 && s.lastItem) pool = pool.filter((id) => id !== s.lastItem);
    const id = pool[Math.floor(rng() * pool.length)];
    return finish(buildPrompt(id, { reason: 'probe', now, hintOverride: Infinity }));
  }

  // ---- answer
  function feedbackBase(correct, rtMs, goalMs) {
    return { correct, rtMs, goalMs, fast: false, itemMastery: 0, events: [], sessionOver: false };
  }
  function answer({ promptId, correct, rtMs, hintShown = false, wrong = [], now = lastNow } = {}) {
    lastNow = now;
    const meta = prompts.get(promptId);
    const rt = Math.round(clamp(num(rtMs, 0), 0, config.rtClampMs));
    if (!sess || !meta || meta.answered) {
      const fb = feedbackBase(!!correct, rt, meta ? meta.goalMs : 0);
      fb.sessionOver = !sess || sess.over || sess.ended;
      return fb;
    }
    meta.answered = true;
    const s = sess;
    const events = [];
    const fb = feedbackBase(!!correct, rt, meta.goalMs);
    s.touched.add(meta.itemId);
    // active time accounting
    const dt = clamp(now - s.lastT, 0, config.idleCapMs);
    s.lastT = now;
    const day = dayRec(now);
    day.ms += dt;

    if (meta.isIntro) {
      events.push({ type: 'new-item', itemId: meta.itemId });
      fb.events = events;
      fb.itemMastery = 0;
      fb.sessionOver = isOver(now);
      state.updatedAt = now;
      return fb;
    }

    state.totalAnswers++;
    day.answers++; if (correct) day.correct++;
    s.answers++;
    if (correct) { s.correct++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); } else s.streak = 0;
    if (correct && !hintShown) s.rts.push(rt);

    if (s.mode === 'placement') return answerPlacement(meta, correct, rt, now, fb, events);
    if (s.mode === 'testout') return answerTestout(meta, correct, rt, now, fb, events);

    // ---- item model
    const r = ensure(meta.itemId);
    const wasMastered = isMastered(meta.itemId, scaleOf(meta.itemId));
    const goal = meta.goalMs;
    const outcome = correct ? (hintShown ? config.hintedScore : 1) : 0;
    const clean = correct && !hintShown;
    r.acc = r3(r.acc + config.alpha * (outcome - r.acc));
    if (clean) r.rt = Math.round(r.rt ? r.rt + config.alpha * (rt - r.rt) : rt);
    const isFast = clean && rt <= goal;
    if (clean) {
      r.streak++;
      if (isFast) r.box = Math.min(config.boxMax, r.box + 1);
    } else if (!correct) { r.streak = 0; r.box = Math.max(0, r.box - 2); }
    if (r.n < 2) { if (clean && rt < config.knownOnSight * goal) r.fs++; }
    r.n++; if (correct) r.c++;
    if (r.n === 2 && r.fs === 2 && r.box < config.knownOnSightBox) r.box = config.knownOnSightBox;
    r.last = state.totalAnswers;
    r.due = now + config.boxIntervalsMs[r.box];
    if (correct) delete r.weak;
    fb.fast = isFast;
    fb.itemMastery = r3(masteryOf(r, stageOfItem(meta.itemId), scaleOf(meta.itemId)));
    const nowMastered = isMastered(meta.itemId, scaleOf(meta.itemId));
    if (!wasMastered && nowMastered) { events.push({ type: 'item-mastered', itemId: meta.itemId }); s.mastered.push(meta.itemId); }
    // re-queue misses
    if (!correct) {
      s.queue = s.queue.filter((q) => q.itemId !== meta.itemId);
      for (const d of config.requeue) s.queue.push({ itemId: meta.itemId, at: s.answers + d });
    }

    const stage = stageById(s.stageId);
    const st = state.stages[stage.id];
    if (s.sb) {
      s.sb.left--;
      if (s.sb.left <= 0) { s.sb = null; events.push({ type: 'step-back-over' }); }
    } else if (s.mode === 'practice' && meta.stageId === stage.id || (s.mode === 'practice' && isMix(stage) && itemsOf(stage).includes(meta.itemId))) {
      // window of the practiced stage
      let ratio = null;
      if (clean) ratio = r3(rt / Math.max(1, goal));
      st.win.push([hintShown && correct ? config.hintedScore : correct ? 1 : 0, ratio]);
      if (st.win.length > config.window) st.win.shift();
    }

    // pace
    if (s.mode === 'practice' && state.totalAnswers % config.paceEvery === 0 && st.status === 'active') {
      const w = winStats(stage.id);
      const before = state.pace;
      if (w.wa >= config.paceUpWa && w.ws <= 1) state.pace = Math.min(config.paceMax, before * config.paceUp);
      else if (w.wa < config.paceDownWa) state.pace = Math.max(config.paceMin, before * config.paceDown);
      else state.pace = before + (1 - before) * config.paceDrift;
      state.pace = r3(state.pace);
      if (state.pace > before * 1.05 && w.wa >= config.paceUpWa) events.push({ type: 'pace', dir: 'up' });
      else if (state.pace < before * 0.95 && w.wa < config.paceDownWa) events.push({ type: 'pace', dir: 'down' });
    }

    if (s.mode === 'practice' && st.status === 'active' && !s.sb) {
      const w = winStats(stage.id);
      // struggle flag with hysteresis
      if (w.n >= config.struggle.minWindow && w.wa < config.struggle.freezeBelow) st.sg = 1;
      else if (st.sg && w.wa >= config.struggle.resumeAt) delete st.sg;
      // promotion
      const pass = checkPromotion(stage, st, w);
      if (pass) {
        passStage(stage, pass, now, events);
        s.pendingIntros = 0;
        const nxt = NONOPT[state.stageIdx];
        if (nxt && nxt.id !== stage.id && stage.id === s.stageId) {
          s.stageId = nxt.id; s.stageRec = state.stages[nxt.id];
        }
      } else if (w.n >= config.struggle.stepBackMin && w.wa < config.struggle.stepBackBelow) {
        const idx = NONOPT.findIndex((x) => x.id === stage.id);
        const prev = idx > 0 ? NONOPT[idx - 1] : null;
        const pids = prev ? itemsOf(prev).filter((id) => rec(id) && rec(id).n > 0) : [];
        if (pids.length) {
          const sorted = [...pids].sort((a, b) => itemMastery(a) - itemMastery(b)).slice(0, config.struggle.stepBackPool);
          s.sb = { left: config.struggle.stepBackLen, ids: sorted };
          s.sbCount[stage.id] = (s.sbCount[stage.id] || 0) + 1;
          events.push({ type: 'step-back', toStageId: prev.id, answers: w.n });
          st.win = [];
          delete st.sg;
          s.queue = [];
        }
      }
    }
    fb.events = events;
    fb.sessionOver = isOver(now);
    state.updatedAt = now;
    state.rng = rng.state();
    return fb;
  }

  function isOver(now) {
    const s = sess;
    if (s.over) return true;
    if ((s.mode === 'practice' || s.mode === 'review') && now - s.startedAt >= s.lengthMs) return true;
    return false;
  }

  function checkPromotion(stage, st, w) {
    const P = config.promote;
    if (isMix(stage)) return w.n >= P.mixN && w.wa >= P.mixWa && w.ws <= P.mixWs ? 'mastery' : null;
    const ids = itemsOf(stage);
    if (!ids.length) return null;
    if (!ids.every((id) => rec(id) && rec(id).intro > 0)) return null;
    const mastered = ids.filter((id) => isMastered(id, scaleOf(id))).length;
    if (mastered / ids.length >= P.masteryFrac && w.wa >= P.wa) return 'mastery';
    if (w.n >= P.fastN && w.wa >= P.fastWa && w.ws <= P.fastWs && ids.every((id) => rec(id).c > 0)) return 'fast-path';
    return null;
  }

  function answerPlacement(meta, correct, rt, now, fb, events) {
    const s = sess, ps = s.ps;
    ps.inStage.push({ itemId: meta.itemId, correct: !!correct, rt });
    ps.total++;
    const stage = NONOPT[ps.stageI];
    if (ps.inStage.length >= config.placement.perStage) {
      const ok = ps.inStage.filter((e) => e.correct);
      const med = median(ok.map((e) => e.rt));
      const pass = ok.length >= config.placement.pass && med <= config.placement.rtMult * (stage.rt ? stage.rt.start : 3000);
      if (pass) {
        seedStage(stage, config.placement.seedBox, config.placement.seedAcc, now);
        passStage(stage, 'placement', now, events);
        ps.stageI++; ps.inStage = [];
        if (ps.stageI > ps.maxI) s.over = true;
      } else s.over = true;
    }
    if (ps.total >= config.placement.cap) s.over = true;
    if (s.over) {
      state.placementDone = true;
      events.push({ type: 'placement-done', stageId: curStage().id });
    }
    fb.events = events; fb.sessionOver = s.over;
    state.updatedAt = now; state.rng = rng.state();
    return fb;
  }

  function answerTestout(meta, correct, rt, now, fb, events) {
    const s = sess;
    s.tres.push({ itemId: meta.itemId, correct: !!correct, rt });
    if (s.tres.length >= s.tlist.length) {
      s.over = true;
      const ok = s.tres.filter((e) => e.correct);
      const acc = ok.length / s.tres.length;
      const med = median(s.tres.map((e) => e.rt));
      const stage = s.tstage;
      const pass = acc >= config.testout.acc && med <= config.testout.rtMult * (stage.rt ? stage.rt.start : 3000);
      if (pass) {
        const idx = NONOPT.findIndex((x) => x.id === stage.id);
        for (let i = state.stageIdx; i < idx; i++) {
          if (state.stages[NONOPT[i].id].status !== 'passed') { seedStage(NONOPT[i], config.placement.seedBox, config.placement.seedAcc, now); passStage(NONOPT[i], 'testout', now, events); }
        }
        seedStage(stage, config.testout.seedBox, config.testout.seedAcc, now);
        passStage(stage, 'testout', now, events);
      } else {
        for (const e of s.tres) if (!e.correct) {
          const r = ensure(e.itemId);
          r.acc = Math.min(r.acc, 0.4); r.box = 0; r.due = now; r.weak = 1; r.streak = 0;
        }
      }
      events.push({ type: 'testout-result', passed: pass, stageId: stage.id });
    }
    fb.events = events; fb.sessionOver = s.over;
    state.updatedAt = now; state.rng = rng.state();
    return fb;
  }

  function skip({ promptId, now = lastNow } = {}) {
    const meta = prompts.get(promptId);
    const rt = meta ? clamp(now - meta.issuedAt, 0, config.rtClampMs) : 0;
    return answer({ promptId, correct: false, rtMs: rt, hintShown: true, wrong: [], now });
  }

  // ---- end session
  function endSession({ now = lastNow } = {}) {
    lastNow = now;
    if (!sess) return lastSummary || emptySummary(now);
    if (sess.ended && lastSummary) return lastSummary;
    const s = sess;
    s.ended = true;
    const durMs = Math.max(0, now - s.startedAt);
    const accuracy = s.answers ? r3(s.correct / s.answers) : 0;
    const medianRtMs = Math.round(median(s.rts));
    if (s.answers > 0) {
      state.sessions.push({ t: s.startedAt, durMs, answers: s.answers, accuracy, medianRtMs });
      if (state.sessions.length > config.maxSessions) state.sessions.splice(0, state.sessions.length - config.maxSessions);
    }
    const weakest = [...s.touched].filter((id) => rec(id) && rec(id).n > 0)
      .sort((a, b) => itemMastery(a) - itemMastery(b)).slice(0, 3);
    const stAfter = curStage();
    const goalMs = state.settings.dailyGoalMin * MIN;
    const day = state.days[dayKey(now, state.tz)];
    lastSummary = {
      mode: s.mode, startedAt: s.startedAt, durMs, answers: s.answers, correct: s.correct, accuracy, medianRtMs,
      bestStreak: s.bestStreak, itemsMastered: [...new Set(s.mastered)], itemsIntroduced: [...s.introduced], weakest,
      stageBefore: s.stageBefore, stageAfter: stAfter.id, stageProgress: stageProgress(stAfter.id),
      dailyGoalMet: !!(day && day.ms >= goalMs), streakDays: streakDays(now),
    };
    state.updatedAt = now; state.rng = rng.state();
    return lastSummary;
  }
  function emptySummary(now) {
    const st = curStage();
    return { mode: 'practice', startedAt: now, durMs: 0, answers: 0, correct: 0, accuracy: 0, medianRtMs: 0, bestStreak: 0,
      itemsMastered: [], itemsIntroduced: [], weakest: [], stageBefore: st.id, stageAfter: st.id, stageProgress: stageProgress(st.id),
      dailyGoalMet: false, streakDays: streakDays(now) };
  }

  // ---- progress
  function parseHeat(id) {
    let m = /^n:([tb]):(\d+)$/.exec(id);
    if (m) return { midi: +m[2], staff: m[1] === 't' ? 'treble' : 'bass' };
    m = /^pd:(\d+)$/.exec(id);
    if (m) return { midi: +m[1], staff: 'bass' };
    return null;
  }
  function progress({ now = lastNow } = {}) {
    lastNow = now;
    const items = {}, heat = [];
    for (const id of Object.keys(cur.ITEMS)) {
      const r = rec(id);
      const mastery = r4(r ? itemMastery(id, scaleOf(id)) : 0);
      if (r && r.n > 0) items[id] = { mastery, acc: r.acc, rtMs: r.rt, n: r.n, box: r.box };
      const h = parseHeat(id);
      if (h) heat.push({ midi: h.midi, staff: h.staff, mastery, n: r ? r.n : 0 });
    }
    const day = state.days[dayKey(now, state.tz)];
    return {
      stageIdx: state.stageIdx,
      stages: cur.STAGES.map((st) => ({
        id: st.id, title: st.title, status: state.stages[st.id].status, progress: stageProgress(st.id),
        canTestOut: canTestOutAt(st.id, now),
      })),
      items, heat, sessions: state.sessions.slice(-60).map((x) => ({ ...x })),
      today: { ms: day ? Math.round(day.ms) : 0, answers: day ? day.answers : 0, goalMs: state.settings.dailyGoalMin * MIN },
      streakDays: streakDays(now), totalAnswers: state.totalAnswers, pace: state.pace,
    };
  }
  function r4(x) { return Math.round(x * 1000) / 1000; }

  // ---- misc API
  function setSettings(partial) {
    if (!isObj(partial)) return;
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in partial && typeof partial[k] === typeof DEFAULT_SETTINGS[k]) state.settings[k] = partial[k];
    }
  }
  function reset({ now = lastNow } = {}) {
    lastNow = now;
    const settings = { ...state.settings };
    const tz = state.tz;
    state = freshState(cur, rng.state());
    state.settings = settings; state.tz = tz; state.updatedAt = now;
    sess = null; lastSummary = null; prompts.clear();
  }
  function skipPlacement() { state.placementDone = true; }

  return {
    getState() { state.rng = rng.state(); return clone(state); },
    startSession, next, answer, skip, endSession, progress, setSettings, reset, skipPlacement,
    collector(prompt) {
      return makeCollector(prompt, { inputMode: (sess && sess.inputMode) || state.settings.inputMode, octaveStrict: state.settings.octaveStrict, config });
    },
    canTestOut(stageId) { return canTestOutAt(stageId, lastNow); },
  };
}
