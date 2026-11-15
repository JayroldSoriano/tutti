// Tutti v2 play-along logic. Pure ES module: no imports, no DOM, no clocks, no randomness.

const EPS = 1e-6;
const pcOf = (m) => ((m % 12) + 12) % 12;

// Group Events with equal t into Moments, sorted by t.
export function momentsOf(events) {
  const evs = (Array.isArray(events) ? events : []).filter((e) => e && Number.isFinite(e.t) && Array.isArray(e.midis) && e.midis.length)
    .map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
  const out = [];
  for (const ev of evs) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.t - ev.t) < EPS) {
      last.events.push(ev);
      for (const m of ev.midis) if (!last.midis.includes(m)) last.midis.push(m);
      last.beats = Math.max(last.beats, ev.beats || 0);
    } else {
      out.push({ t: ev.t, beats: ev.beats || 0, midis: [...new Set(ev.midis)], events: [ev] });
    }
  }
  return out;
}

export function createWaitPlayer(events, { pcMode = false } = {}) {
  const moments = momentsOf(events);
  const same = (a, b) => (pcMode ? pcOf(a) === pcOf(b) : a === b);
  let index = 0;
  let matched = []; // required midis matched in the current moment
  let flawed = false; // current moment already had a wrong key
  let firstTry = 0;
  let wrong = 0;
  const remaining = () => {
    const m = moments[index];
    if (!m) return [];
    const left = m.midis.slice();
    for (const x of matched) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); }
    return left;
  };
  return {
    moment() { return index < moments.length ? moments[index] : null; },
    get index() { return index; },
    // matched: required midis matched so far in the moment that was evaluated; need: required midis still missing
    push(midi) {
      const m = moments[index];
      if (!m) return { status: 'done', matched: [], need: [] };
      const left = remaining();
      const hit = left.findIndex((x) => same(midi, x));
      if (hit >= 0) {
        matched.push(left[hit]);
        if (matched.length >= m.midis.length) {
          const done = matched.slice();
          if (!flawed) firstTry++;
          index++; matched = []; flawed = false;
          return { status: index >= moments.length ? 'done' : 'advance', matched: done, need: [] };
        }
        return { status: 'pending', matched: matched.slice(), need: remaining() };
      }
      if (matched.some((x) => same(midi, x))) return { status: 'pending', matched: matched.slice(), need: left }; // re-press
      wrong++; flawed = true;
      return { status: 'wrong', matched: matched.slice(), need: left };
    },
    stats() {
      return { moments: moments.length, firstTry, wrong, acc: moments.length ? firstTry / moments.length : 0 };
    },
  };
}

// Grade a timed run. played = [{ midi, tMs }]; startMs = time of beat 0 (after the count-in).
// Each sounded note of the song is a target onset; it is hit when a same-pitch played note
// lies within max(tolBeat * beatMs, tolMinMs) of its time. Unmatched played notes are `extra`.
export function gradeTempo(events, played, { bpm, startMs = 0, tolBeat = 0.25, tolMinMs = 130, pcMode = false } = {}) {
  const same = (a, b) => (pcMode ? pcOf(a) === pcOf(b) : a === b);
  const beatMs = 60000 / (bpm > 0 ? bpm : 60);
  const tol = Math.max(tolBeat * beatMs, tolMinMs);
  const targets = [];
  for (const m of momentsOf(events)) for (const midi of m.midis) targets.push({ midi, at: startMs + m.t * beatMs });
  const notes = (Array.isArray(played) ? played : []).filter((p) => p && Number.isFinite(p.midi) && Number.isFinite(p.tMs));
  const used = new Array(notes.length).fill(false);
  let hit = 0;
  let sumAbs = 0;
  for (const t of targets) {
    let best = -1, bestD = Infinity;
    notes.forEach((p, i) => {
      if (used[i] || !same(p.midi, t.midi)) return;
      const d = Math.abs(p.tMs - t.at);
      if (d <= tol && d < bestD) { best = i; bestD = d; }
    });
    if (best >= 0) { used[best] = true; hit++; sumAbs += bestD; }
  }
  const onsets = targets.length;
  return {
    onsets, hit, missed: onsets - hit, extra: notes.length - hit,
    acc: onsets ? hit / onsets : 0, meanAbsMs: hit ? Math.round(sumAbs / hit) : 0,
  };
}
