// Tutti v2 lesson-progress logic. Pure ES module: no imports, no DOM, no Date.now / Math.random.
// All functions return new objects; inputs are never mutated.

export const LESSON_CONFIG = {
  passAcc: 0.8, aceAcc: 0.9, aceRatio: 1.0, aceMelody: 0.85,
  melodyPass: 0.8, melodyAce: 0.92,
  relaxedPassAcc: 0.6, maxFails: 2,
  weakMastery: 0.5, weakMinN: 3, weakBacklog: 4, warmupFloor: 0.7, warmupMinN: 6,
  awayDays: 3, awayMinDone: 3, warmupCount: 8, softCapPerDay: 3,
};

const DAY_MS = 86400000;
const GRADE_RANK = { skip: 0, pass: 1, ace: 2 };
const KINDS = ['core', 'review', 'daily'];
const REASONS = ['repeat', 'weak', 'away'];

// ---------------------------------------------------------------- helpers
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const clone = (o) => JSON.parse(JSON.stringify(o));
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const goodKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= 64 && !BAD_KEYS.has(k);
const str = (x, d = '') => (typeof x === 'string' ? x : d);
const cfgOf = (cfg) => ({ ...LESSON_CONFIG, ...(isObj(cfg) ? cfg : {}) });
const pad2 = (n) => String(n).padStart(2, '0');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
const byId = (lessons, id) => (Array.isArray(lessons) ? lessons.find((l) => l && l.id === id) : undefined);

function sanitizeEntry(e) {
  if (!isObj(e)) return null;
  if (!REASONS.includes(e.reason)) return null;
  const forLesson = str(e.forLesson);
  if (!forLesson) return null;
  const focus = Array.isArray(e.focus) ? e.focus.filter((x) => typeof x === 'string' && x.length <= 40).slice(0, 12) : [];
  return { kind: 'review', reason: e.reason, forLesson, focus, attempt: Math.max(1, Math.floor(num(e.attempt, 1))) };
}

// ---------------------------------------------------------------- state
export function freshLessonState() {
  return {
    v: 1, updatedAt: 0, done: {}, cur: null, queue: [], fails: {}, songs: {},
    lastDay: '', doneToday: 0, lastGrade: '', lastActive: 0, override: '',
  };
}

export function sanitizeLessonState(any) {
  if (!isObj(any)) return undefined;
  const s = freshLessonState();
  try {
    s.updatedAt = Math.max(0, num(any.updatedAt, 0));
    if (isObj(any.done)) {
      for (const id of Object.keys(any.done)) {
        const d = any.done[id];
        if (!goodKey(id) || !isObj(d) || !(d.grade in GRADE_RANK)) continue;
        s.done[id] = { at: num(d.at, 0), grade: d.grade, attempts: Math.max(0, Math.floor(num(d.attempts, 0))), acc: clamp(num(d.acc, 0), 0, 1) };
      }
    }
    if (isObj(any.cur) && goodKey(any.cur.id)) {
      const c = any.cur;
      const cur = {
        id: c.id, kind: KINDS.includes(c.kind) ? c.kind : 'core', step: Math.max(0, Math.floor(num(c.step, 0))),
        startedAt: num(c.startedAt, 0), res: {},
      };
      if (isObj(c.res)) {
        for (const k of Object.keys(c.res)) {
          if (!goodKey(k) || !isObj(c.res[k])) continue;
          try { cur.res[k] = JSON.parse(JSON.stringify(c.res[k])); } catch (e) { /* skip unserialisable */ }
        }
      }
      const entry = sanitizeEntry(c.entry);
      if (entry) cur.entry = entry;
      s.cur = cur;
    }
    if (Array.isArray(any.queue)) s.queue = any.queue.map(sanitizeEntry).filter(Boolean).slice(0, 20);
    if (isObj(any.fails)) {
      for (const id of Object.keys(any.fails)) if (goodKey(id)) s.fails[id] = Math.max(0, Math.floor(num(any.fails[id], 0)));
    }
    if (isObj(any.songs)) {
      for (const id of Object.keys(any.songs)) {
        const r = any.songs[id];
        if (!goodKey(id) || !isObj(r)) continue;
        s.songs[id] = { plays: Math.max(0, Math.floor(num(r.plays, 0))), bestAcc: clamp(num(r.bestAcc, 0), 0, 1), bestTempo: Math.max(0, num(r.bestTempo, 0)) };
      }
    }
    s.lastDay = typeof any.lastDay === 'string' && DAY_RE.test(any.lastDay) ? any.lastDay : '';
    s.doneToday = Math.max(0, Math.floor(num(any.doneToday, 0)));
    s.lastGrade = any.lastGrade in GRADE_RANK ? any.lastGrade : '';
    s.lastActive = Math.max(0, num(any.lastActive, 0));
    s.override = typeof any.override === 'string' && DAY_RE.test(any.override) ? any.override : '';
    return s;
  } catch (e) {
    return freshLessonState();
  }
}

export function mergeLessonState(a, b) {
  const A = sanitizeLessonState(a) || freshLessonState();
  const B = sanitizeLessonState(b) || freshLessonState();
  const later = B.updatedAt > A.updatedAt ? B : A;
  const out = clone(later);
  out.done = {};
  for (const src of [A, B]) {
    for (const id of Object.keys(src.done)) {
      const d = src.done[id], cur = out.done[id];
      if (!cur || GRADE_RANK[d.grade] > GRADE_RANK[cur.grade] || (GRADE_RANK[d.grade] === GRADE_RANK[cur.grade] && d.at > cur.at)) out.done[id] = { ...d };
    }
  }
  out.songs = {};
  for (const src of [A, B]) {
    for (const id of Object.keys(src.songs)) {
      const r = src.songs[id], cur = out.songs[id];
      out.songs[id] = cur
        ? { plays: Math.max(cur.plays, r.plays), bestAcc: Math.max(cur.bestAcc, r.bestAcc), bestTempo: Math.max(cur.bestTempo, r.bestTempo) }
        : { ...r };
    }
  }
  out.updatedAt = Math.max(A.updatedAt, B.updatedAt);
  return out;
}

// ---------------------------------------------------------------- step results
const stepKey = (lessonId, i) => `${lessonId}.s${pad2(i + 1)}`;
const stepKey0 = (lessonId, i) => `${lessonId}.s${pad2(i)}`;

// results is cur.res. Step ids in lessons are the keys; tolerate 1-based / 0-based derived keys.
function resOf(lesson, res, stepId) {
  if (!isObj(res)) return undefined;
  if (isObj(res[stepId])) return res[stepId];
  const i = lesson && Array.isArray(lesson.steps) ? lesson.steps.findIndex((s) => s.id === stepId) : -1;
  if (i >= 0 && lesson) {
    if (isObj(res[stepKey(lesson.id, i)])) return res[stepKey(lesson.id, i)];
    if (isObj(res[stepKey0(lesson.id, i)])) return res[stepKey0(lesson.id, i)];
  }
  return undefined;
}
const accOf = (r) => {
  if (!isObj(r)) return 0;
  if (Number.isFinite(r.acc)) return r.acc;
  if (Array.isArray(r.passes) && r.passes.length) return num(r.passes[r.passes.length - 1].acc, 0);
  return 0;
};

// ---------------------------------------------------------------- grading
// results = ls.cur.res. cfg may carry `fails` (the fail count of the lesson being graded).
export function gradeLesson(lesson, results, cfg) {
  const c = cfgOf(cfg);
  const relaxed = num(c.fails, 0) >= c.maxFails;
  const cp = (lesson && lesson.checkpoint) || { kind: 'quiz' };
  const r = resOf(lesson, results, cp.stepId);
  const acc = accOf(r);
  if (cp.kind === 'melody') {
    const pass = relaxed ? c.relaxedPassAcc : Number.isFinite(cp.passAcc) ? cp.passAcc : c.melodyPass;
    const ace = Number.isFinite(cp.aceAcc) ? cp.aceAcc : c.melodyAce;
    if (!r || acc < pass) return 'repeat';
    return !relaxed && acc >= ace ? 'ace' : 'pass';
  }
  const pass = relaxed ? c.relaxedPassAcc : Number.isFinite(cp.passAcc) ? cp.passAcc : c.passAcc;
  const ace = Number.isFinite(cp.aceAcc) ? cp.aceAcc : c.aceAcc;
  if (!r || acc < pass) return 'repeat';
  if (relaxed) return 'pass';
  const ratio = num(r.medianRatio, 0);
  // last melody-wait of the lesson
  const waits = (lesson.steps || []).filter((s) => s.type === 'melody-wait');
  let melodyOk = true;
  if (waits.length) {
    const last = waits[waits.length - 1];
    const mr = resOf(lesson, results, last.id);
    melodyOk = !!mr && accOf(mr) >= c.aceMelody;
  }
  return acc >= ace && ratio <= c.aceRatio && melodyOk ? 'ace' : 'pass';
}

// ---------------------------------------------------------------- availability / nextUp
function effDoneToday(ls, today) { return ls.lastDay === today ? ls.doneToday : 0; }
function coreAvailability(ls, today) {
  if (ls.lastDay !== today) return 'now';
  if (ls.lastGrade === 'ace' || ls.lastGrade === 'skip' || ls.lastGrade === '') return 'now';
  if (ls.override === today) return 'now';
  return 'tomorrow';
}
const parseRef = (id) => {
  const m = /^n:([tb]):(\d+)$/.exec(id);
  return m ? { midi: +m[2], staff: m[1] === 't' ? 'treble' : 'bass' } : null;
};
const highestDoneN = (ls, lessons) => {
  let hi = 0;
  for (const id of Object.keys(ls.done)) {
    const l = byId(lessons, id);
    if (l && l.n > hi) hi = l.n;
  }
  return hi;
};
function nextCore(ls, lessons) {
  return (Array.isArray(lessons) ? lessons : []).find((l) => !ls.done[l.id]);
}

export function nextUp(ls, lessons, { now = 0, today = '', itemStats = {} } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  const softCap = effDoneToday(s, today) >= LESSON_CONFIG.softCapPerDay;
  if (s.cur) {
    return { kind: 'resume', lessonId: s.cur.id, reason: s.cur.entry ? s.cur.entry.reason : undefined, availability: 'now', stepIndex: s.cur.step, softCap, ...(s.cur.entry ? { entry: s.cur.entry } : {}) };
  }
  const core = nextCore(s, lessons);
  const doneCount = Object.keys(s.done).length;
  if (core && s.lastActive > 0 && now - s.lastActive >= LESSON_CONFIG.awayDays * DAY_MS
    && doneCount >= LESSON_CONFIG.awayMinDone && !s.queue.some((e) => e.reason === 'away')) {
    const focus = pickWarmup(core.n, lessons, itemStats, { now, count: 10 });
    const entry = { kind: 'review', reason: 'away', forLesson: core.id, focus, attempt: 1 };
    return { kind: 'review', lessonId: `R:${core.id}:1`, reason: 'away', availability: 'now', stepIndex: 0, softCap, entry };
  }
  if (s.queue.length) {
    const e = s.queue[0];
    return { kind: 'review', lessonId: `R:${e.forLesson}:${e.attempt}`, reason: e.reason, availability: 'now', stepIndex: 0, softCap, entry: e };
  }
  if (core) {
    return { kind: 'core', lessonId: core.id, availability: coreAvailability(s, today), stepIndex: 0, softCap };
  }
  return { kind: 'daily', lessonId: `D:${today}`, availability: 'now', stepIndex: 0, softCap, entry: { kind: 'daily', day: today } };
}

// ---------------------------------------------------------------- begin / record / abandon
export function beginLesson(ls, plan, { now = 0, today = '' } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  const id = plan && plan.id ? plan.id : '';
  const kind = plan && KINDS.includes(plan.kind) ? plan.kind : id.startsWith('R:') ? 'review' : id.startsWith('D:') ? 'daily' : 'core';
  s.cur = { id, kind, step: 0, startedAt: now, res: {} };
  if (kind === 'review' && plan.entry) {
    const e = sanitizeEntry(plan.entry);
    if (e) {
      s.cur.entry = e;
      // away entries are materialised here; repeat/weak entries are already queued
      const queued = s.queue.some((q) => q.reason === e.reason && q.forLesson === e.forLesson && q.attempt === e.attempt);
      if (!queued) s.queue.unshift(e);
    }
  }
  s.lastActive = now;
  s.updatedAt = now;
  void today;
  return s;
}

export function recordStep(ls, stepIndex, result, { now = 0, stepId } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  if (!s.cur) return s;
  const key = typeof stepId === 'string' && goodKey(stepId) ? stepId : stepKey(s.cur.id, stepIndex);
  let r = {};
  try { r = isObj(result) ? JSON.parse(JSON.stringify(result)) : {}; } catch (e) { r = {}; }
  s.cur.res[key] = r;
  s.cur.step = Math.max(0, Math.floor(num(stepIndex, 0))) + 1;
  s.lastActive = now;
  s.updatedAt = now;
  return s;
}

export function abandonLesson(ls, { now = 0 } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  s.cur = null;
  s.lastActive = now;
  s.updatedAt = now;
  return s;
}

// ---------------------------------------------------------------- item picking
function lessonsBefore(lessons, n) {
  return (Array.isArray(lessons) ? lessons : []).filter((l) => l.n < n);
}
function itemsThrough(lessons, n) {
  return uniq((Array.isArray(lessons) ? lessons : []).filter((l) => l.n <= n).flatMap((l) => l.items || []));
}
const statOf = (itemStats, id) => (isObj(itemStats) && isObj(itemStats[id]) ? itemStats[id] : null);

export function pickWarmup(lessonN, lessons, itemStats, { now = 0, count = LESSON_CONFIG.warmupCount } = {}) {
  const ids = uniq(lessonsBefore(lessons, lessonN).flatMap((l) => l.items || [])).filter((id) => {
    const st = statOf(itemStats, id);
    return st && st.n > 0;
  });
  if (ids.length < 3) return [];
  const st = (id) => itemStats[id];
  const isDue = (id) => st(id).box >= 1 && st(id).due <= now;
  const due = ids.filter(isDue).sort((a, b) => st(a).due - st(b).due || (a < b ? -1 : 1));
  const rest1 = ids.filter((id) => !isDue(id));
  const weak = rest1.filter((id) => st(id).mastery < 0.6).sort((a, b) => st(a).mastery - st(b).mastery || (a < b ? -1 : 1));
  const rest = rest1.filter((id) => st(id).mastery >= 0.6).sort((a, b) => st(a).box - st(b).box || st(a).mastery - st(b).mastery || (a < b ? -1 : 1));
  return [...due, ...weak, ...rest].slice(0, Math.max(0, count));
}

export function pickQuiz(lesson, lessons, itemStats, count) {
  const own = uniq(lesson.items || []);
  const m = (id) => { const s = statOf(itemStats, id); return s && s.n > 0 ? s.mastery : 0.5; };
  const ordered = (arr) => [...arr].sort((a, b) => m(a) - m(b) || (a < b ? -1 : 1));
  if (own.length >= count) return ordered(own).slice(0, count);
  const earlier = uniq([...lessonsBefore(lessons, lesson.n)].reverse().flatMap((l) => l.items || [])).filter((id) => !own.includes(id));
  const fill = ordered(earlier).slice(0, Math.max(0, count - own.length));
  return [...own, ...fill];
}

export function resolveDrillItems(step, lesson, lessons, itemStats, { now = 0 } = {}) {
  const src = step.source;
  if (src === 'warmup') return pickWarmup(lesson.n, lessons, itemStats, { now, count: step.count || LESSON_CONFIG.warmupCount });
  if (src === 'today') {
    const own = uniq(lesson.items || []);
    if (own.length) return own;
    const recent = uniq([...lessonsBefore(lessons, lesson.n)].reverse().flatMap((l) => l.items || [])).slice(0, 8);
    return recent;
  }
  if (src === 'mixed') return itemsThrough(lessons, lesson.n).filter((id) => /^n:[tb]:\d+$/.test(id));
  if (src === 'items') return uniq(Array.isArray(step.itemIds) ? step.itemIds : []);
  return [];
}

// ---------------------------------------------------------------- songs
function songRefs(lesson) {
  const ids = [];
  for (const s of lesson.steps || []) if (s && typeof s.songId === 'string') ids.push(s.songId);
  for (const id of lesson.spares || []) ids.push(id);
  return ids;
}
function songList(songs) {
  if (Array.isArray(songs)) return songs.filter(Boolean);
  if (isObj(songs)) return Object.keys(songs).map((id) => ({ id, ...songs[id] }));
  return [];
}
function songMinLessonOf(song, lessons) {
  if (Number.isFinite(song.minLesson)) return song.minLesson;
  let min = Infinity;
  for (const l of Array.isArray(lessons) ? lessons : []) if (songRefs(l).includes(song.id) && l.n < min) min = l.n;
  return min;
}

export function unlockedSongIds(ls, lessons, songs) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  const hi = highestDoneN(s, lessons) + 1;
  return songList(songs).filter((song) => songMinLessonOf(song, lessons) <= hi).map((song) => song.id).sort();
}
function leastPlayed(ids, ls) {
  const r = (id) => ls.songs[id] || { plays: 0, bestAcc: 0 };
  return [...ids].sort((a, b) => r(a).plays - r(b).plays || r(a).bestAcc - r(b).bestAcc || (a < b ? -1 : 1));
}
function handsOf(songs, id) {
  const song = isObj(songs) ? songs[id] : Array.isArray(songs) ? songs.find((x) => x && x.id === id) : undefined;
  const p = song && song.parts;
  if (p && p.rh && p.lh) return 'both';
  if (p && p.lh && !p.rh) return 'lh';
  return 'rh';
}

// ---------------------------------------------------------------- generated lessons
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (midi) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const LANDMARKS = { treble: [60, 67, 72, 77, 84], bass: [36, 43, 48, 53, 60] };

function nearestLandmark(ref) {
  const list = LANDMARKS[ref.staff] || LANDMARKS.treble;
  let best = list[0];
  for (const m of list) if (Math.abs(m - ref.midi) < Math.abs(best - ref.midi)) best = m;
  return best;
}

function reviewShell(id, forLesson, extra) {
  return {
    id, n: forLesson ? forLesson.n : 0, unit: forLesson ? forLesson.unit : 0, title: '', goal: '', preview: '',
    teaches: [], items: [], features: [], passesStages: [], placeOut: [], spares: [], ...extra,
  };
}

export function buildReviewLesson(entry, lessons, songs, ls, itemStats, { now = 0 } = {}) {
  const state = sanitizeLessonState(ls) || freshLessonState();
  const lessonsArr = Array.isArray(lessons) ? lessons : [];
  void now;

  // ---- daily
  if (!entry || entry.kind === 'daily') {
    const day = (entry && entry.day) || '';
    const id = `D:${day}`;
    const lastN = lessonsArr.length ? lessonsArr[lessonsArr.length - 1].n : 0;
    const unlocked = unlockedSongIds(state, lessonsArr, songs);
    const picks = leastPlayed(unlocked, state).slice(0, 2);
    const steps = [];
    const push = (st) => steps.push({ id: stepKey(id, steps.length), ...st });
    push({ type: 'drill', title: 'Warm-up', purpose: 'Wake up what you already know.', source: 'warmup', count: 10, min: 6, hints: 'auto', stopEarly: false });
    for (const songId of picks) {
      push({ type: 'melody-wait', title: 'Play along', purpose: 'Sight-read a tune without names.', songId, passes: [{ hands: handsOf(songs, songId), names: false, glow: false, fingers: false }], checkpoint: songId === picks[picks.length - 1] });
    }
    push({ type: 'recap' });
    const cpStep = picks.length ? steps[steps.length - 2] : steps[0];
    return reviewShell(id, null, {
      n: lastN + 1, unit: 0, kind: 'daily', title: 'Daily practice', goal: 'Keep everything fresh.', preview: 'Tomorrow: another daily practice.',
      checkpoint: picks.length ? { kind: 'melody', stepId: cpStep.id, passAcc: LESSON_CONFIG.melodyPass, aceAcc: LESSON_CONFIG.melodyAce }
        : { kind: 'quiz', stepId: cpStep.id, passAcc: LESSON_CONFIG.passAcc, aceAcc: LESSON_CONFIG.aceAcc },
      steps,
    });
  }

  // ---- review
  const forLesson = byId(lessonsArr, entry.forLesson);
  const attempt = Math.max(1, Math.floor(num(entry.attempt, 1)));
  const id = `R:${entry.forLesson}:${attempt}`;
  let focus = uniq(Array.isArray(entry.focus) ? entry.focus : []);
  if (!focus.length && forLesson) focus = uniq(forLesson.items || []);
  const noteFocus = focus.map(parseRef).filter(Boolean);
  const hard = attempt >= 2;
  const scaffold = hard ? 'glow' : 'name';
  const steps = [];
  const push = (st) => steps.push({ id: stepKey(id, steps.length), ...st });

  if (noteFocus.length) {
    const hasT = noteFocus.some((r) => r.staff === 'treble'), hasB = noteFocus.some((r) => r.staff === 'bass');
    push({
      type: 'concept', title: 'Your landmarks', purpose: 'Anchor each note to a landmark you know.',
      body: [`Today we sharpen: ${noteFocus.map((r) => nameOf(r.midi)).join(', ')}.`.slice(0, 110), 'Find a landmark, then read a step or a skip from it.'],
      visual: { kind: 'landmarks', staff: hasT && hasB ? 'grand' : hasB ? 'bass' : 'treble', notes: noteFocus.map((r) => ({ ...r })) },
    });
    push({ type: 'guided', title: 'Say it, play it', purpose: 'Slow, errorless repetition.', scaffold, targets: noteFocus.map((r) => ({ ...r })), rounds: 2, shuffle: true });
    const groups = new Map();
    for (const ref of noteFocus) {
      const lm = nearestLandmark(ref);
      if (lm === ref.midi) continue;
      if (!groups.has(`${ref.staff}:${lm}`)) groups.set(`${ref.staff}:${lm}`, { landmark: { midi: lm, staff: ref.staff }, targets: [] });
      groups.get(`${ref.staff}:${lm}`).targets.push({ ...ref });
    }
    for (const g of groups.values()) push({ type: 'landmark-distance', title: 'Read by distance', purpose: 'Find it from a landmark.', landmark: g.landmark, targets: g.targets });
  }
  const strong = uniq((forLesson ? itemsThrough(lessonsArr, forLesson.n) : []).filter((x) => !focus.includes(x)))
    .filter((x) => { const s = statOf(itemStats, x); return s && s.n > 0; })
    .sort((a, b) => itemStats[b].mastery - itemStats[a].mastery || (a < b ? -1 : 1)).slice(0, 4);
  push({ type: 'drill', title: 'Drill', purpose: 'Mixed practice on the shaky items.', source: 'items', itemIds: [...focus, ...strong], count: hard ? 12 : 16, min: hard ? 8 : 10, hints: 'auto', stopEarly: true });

  // song
  let songId;
  if (entry.reason === 'repeat' && forLesson) {
    songId = (forLesson.steps || []).filter((s) => s.type === 'melody-wait' && s.songId).map((s) => s.songId)[0] || (forLesson.spares || [])[0];
  }
  if (!songId) songId = leastPlayed(unlockedSongIds(state, lessonsArr, songs), state)[0];
  if (songId) push({ type: 'melody-wait', title: 'Play along', purpose: 'Use the notes in real music.', songId, passes: [{ hands: handsOf(songs, songId), names: !!hard, glow: false, fingers: false }] });
  push({ type: 'quiz', title: 'Checkpoint', purpose: 'Show it stuck.', count: 10, itemIds: uniq([...focus, ...strong]).slice(0, Math.max(10, focus.length)), passAcc: 0.8 });
  const quizId = steps[steps.length - 1].id;
  push({ type: 'recap' });
  return reviewShell(id, forLesson, {
    kind: 'review', entry: { kind: 'review', reason: entry.reason, forLesson: entry.forLesson, focus, attempt },
    title: 'Focused review', goal: 'Strengthen the notes that slipped.', preview: '',
    items: focus, spares: [],
    checkpoint: { kind: 'quiz', stepId: quizId, passAcc: LESSON_CONFIG.passAcc, aceAcc: LESSON_CONFIG.aceAcc },
    steps,
  });
}

// ---------------------------------------------------------------- completion
function collectMissed(res) {
  const out = [];
  for (const k of Object.keys(res || {})) {
    const r = res[k];
    if (isObj(r) && Array.isArray(r.missed)) for (const id of r.missed) if (typeof id === 'string') out.push(id);
  }
  return uniq(out);
}

function applySongStats(s, lesson, res) {
  for (const st of lesson.steps || []) {
    if (!st || typeof st.songId !== 'string' || !goodKey(st.songId)) continue;
    if (st.type !== 'melody-wait' && st.type !== 'melody-tempo') continue;
    const r = resOf(lesson, res, st.id);
    if (!r) continue;
    const rec = s.songs[st.songId] || (s.songs[st.songId] = { plays: 0, bestAcc: 0, bestTempo: 0 });
    rec.plays++;
    rec.bestAcc = Math.max(rec.bestAcc, clamp(accOf(r), 0, 1));
    if (st.type === 'melody-tempo' && accOf(r) >= 0.8) rec.bestTempo = Math.max(rec.bestTempo, num(r.bpm, num(st.bpm, 0)));
  }
}

export function completeLesson(ls, lesson, { now = 0, today = '', itemStats = {}, lessons = [] } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  const res = s.cur ? s.cur.res : {};
  const kind = s.cur ? s.cur.kind : lesson.kind || (lesson.id.startsWith('R:') ? 'review' : lesson.id.startsWith('D:') ? 'daily' : 'core');
  const entry = (s.cur && s.cur.entry) || lesson.entry || null;
  const outcome = { grade: 'repeat', passed: false, advance: false, relaxed: false, insertedReview: null, nextAvailability: 'now', passesStages: [], weakItems: [] };
  applySongStats(s, lesson, res);
  s.cur = null;
  s.lastActive = now;
  s.updatedAt = now;
  const stamp = (grade, acc) => {
    s.doneToday = s.lastDay === today ? s.doneToday + 1 : 1;
    s.lastDay = today;
    s.lastGrade = grade;
    void acc;
  };
  const cpRes = resOf(lesson, res, lesson.checkpoint && lesson.checkpoint.stepId);
  const cpAcc = clamp(accOf(cpRes), 0, 1);
  const missedAll = collectMissed(res);

  if (kind === 'daily') {
    const grade = gradeLesson(lesson, res, {});
    outcome.grade = grade; outcome.passed = true; outcome.advance = true;
    stamp(grade === 'repeat' ? 'pass' : grade, cpAcc);
    outcome.nextAvailability = 'now';
    return { state: s, outcome };
  }

  if (kind === 'review' && entry) {
    const forId = entry.forLesson;
    const fails = s.fails[forId] || 0;
    const grade = gradeLesson(lesson, res, { fails });
    outcome.grade = grade;
    outcome.relaxed = entry.reason === 'repeat' && fails >= LESSON_CONFIG.maxFails && grade !== 'repeat';
    const idx = s.queue.findIndex((q) => q.reason === entry.reason && q.forLesson === forId && q.attempt === entry.attempt);
    if (idx >= 0) s.queue.splice(idx, 1);
    if (entry.reason !== 'repeat') {
      // weak / away: no gate, just counts as practice
      outcome.passed = grade !== 'repeat'; outcome.advance = true;
      outcome.nextAvailability = coreAvailability(s, today);
      return { state: s, outcome };
    }
    if (grade === 'repeat') {
      s.fails[forId] = fails + 1;
      const missed = missedAll.length ? missedAll.slice(0, 8) : entry.focus;
      const next = { kind: 'review', reason: 'repeat', forLesson: forId, focus: missed.length ? missed : entry.focus, attempt: entry.attempt + 1 };
      s.queue.unshift(next);
      outcome.insertedReview = next;
      outcome.nextAvailability = 'now';
      return { state: s, outcome };
    }
    outcome.passed = true; outcome.advance = true;
    s.done[forId] = { at: now, grade: 'pass', attempts: fails + 1, acc: cpAcc };
    const fl = byId(lessons, forId);
    outcome.passesStages = fl && Array.isArray(fl.passesStages) ? fl.passesStages.slice() : [];
    outcome.weakItems = outcome.relaxed ? missedAll : [];
    stamp('pass', cpAcc);
    outcome.nextAvailability = coreAvailability(s, today);
    return { state: s, outcome };
  }

  // ---- core lesson
  const fails = s.fails[lesson.id] || 0;
  const grade = gradeLesson(lesson, res, { fails });
  outcome.grade = grade;
  if (grade === 'repeat') {
    s.fails[lesson.id] = fails + 1;
    const missed = missedAll.slice(0, 8);
    const focus = missed.length ? missed : uniq(lesson.items || []).slice(0, 8);
    const e = { kind: 'review', reason: 'repeat', forLesson: lesson.id, focus, attempt: 1 };
    s.queue.unshift(e);
    outcome.insertedReview = e;
    outcome.nextAvailability = 'now';
    return { state: s, outcome };
  }
  outcome.passed = true; outcome.advance = true;
  outcome.relaxed = fails >= LESSON_CONFIG.maxFails;
  outcome.weakItems = outcome.relaxed ? missedAll : [];
  outcome.passesStages = Array.isArray(lesson.passesStages) ? lesson.passesStages.slice() : [];
  s.done[lesson.id] = { at: now, grade, attempts: fails + 1, acc: cpAcc };
  stamp(grade, cpAcc);

  // weak-backlog insert
  const nextLesson = (Array.isArray(lessons) ? lessons : []).find((l) => l.n > lesson.n && !s.done[l.id]);
  if (nextLesson && !s.queue.some((q) => q.reason === 'weak')) {
    const taught = itemsThrough(lessons, lesson.n);
    const withStats = taught.filter((id) => { const st = statOf(itemStats, id); return st && st.n > 0; });
    const weakItems = withStats.filter((id) => itemStats[id].n >= LESSON_CONFIG.weakMinN && itemStats[id].mastery < LESSON_CONFIG.weakMastery);
    const wStep = (lesson.steps || []).find((st) => st.type === 'drill' && st.source === 'warmup');
    const wr = wStep ? resOf(lesson, res, wStep.id) : null;
    const warmBad = !!wr && num(wr.n, 0) >= LESSON_CONFIG.warmupMinN && num(wr.acc, 1) < LESSON_CONFIG.warmupFloor;
    if (weakItems.length >= LESSON_CONFIG.weakBacklog || warmBad) {
      const rank = (arr) => [...arr].sort((a, b) => itemStats[a].mastery - itemStats[b].mastery || (a < b ? -1 : 1));
      let focus = rank(withStats).slice(0, 6);
      if (warmBad && Array.isArray(wr.missed) && wr.missed.length && weakItems.length < LESSON_CONFIG.weakBacklog) focus = uniq([...wr.missed, ...focus]).slice(0, 6);
      if (focus.length) {
        const e = { kind: 'review', reason: 'weak', forLesson: nextLesson.id, focus, attempt: 1 };
        s.queue.push(e);
        outcome.insertedReview = e;
      }
    }
  }
  outcome.nextAvailability = outcome.insertedReview ? 'now' : coreAvailability(s, today);
  return { state: s, outcome };
}

// ---------------------------------------------------------------- place-out
export function placeOut(ls, lessons, passedStageIds, { now = 0 } = {}) {
  const s = sanitizeLessonState(ls) || freshLessonState();
  const passed = new Set(Array.isArray(passedStageIds) ? passedStageIds : []);
  let prevMarked = false;
  let any = false;
  for (const l of Array.isArray(lessons) ? lessons : []) {
    const req = Array.isArray(l.placeOut) ? l.placeOut : [];
    const ok = req.length ? req.every((id) => passed.has(id)) : prevMarked;
    if (!ok) break;
    prevMarked = true;
    if (!s.done[l.id]) { s.done[l.id] = { at: now, grade: 'skip', attempts: 0, acc: 0 }; any = true; }
  }
  if (any) { s.lastActive = now; s.updatedAt = now; }
  return s;
}
