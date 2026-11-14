// Microphone pitch input: YIN on 2048-sample frames. Monophonic.

export const FRAME = 2048;

/**
 * YIN pitch detection. Returns { freq, clarity } or null when no clear pitch.
 * clarity = 1 - cumulative-mean-normalised difference at the chosen lag (0..1).
 */
export function yin(buf, sampleRate, threshold = 0.15) {
  const n = buf.length;
  const half = n >> 1;
  const tauMin = Math.max(2, Math.floor(sampleRate / 2000)); // up to ~2 kHz
  const d = new Float32Array(half);
  for (let tau = 1; tau < half; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) { const x = buf[i] - buf[i + tau]; sum += x * x; }
    d[tau] = sum;
  }
  // cumulative mean normalised difference
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau < half; tau++) {
    run += d[tau];
    d[tau] = run === 0 ? 1 : (d[tau] * tau) / run;
  }
  let tau = -1;
  for (let t = tauMin; t < half - 1; t++) {
    if (d[t] < threshold) {
      while (t + 1 < half - 1 && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation
  const a = d[tau - 1], b = d[tau], c = d[tau + 1];
  const den = a - 2 * b + c;
  const shift = den === 0 ? 0 : (a - c) / (2 * den);
  const better = tau + Math.max(-1, Math.min(1, shift));
  const freq = sampleRate / better;
  if (!isFinite(freq) || freq <= 0) return null;
  return { freq, clarity: Math.max(0, Math.min(1, 1 - b)) };
}

export const freqToMidi = (f) => Math.round(69 + 12 * Math.log2(f / 440));

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);

export function createMicInput({ onNote, rmsGate = 0.01, agree = 3, clarityMin = 0.9 } = {}) {
  let stream = null, ctx = null, analyser = null, timer = null, src = null;
  let buf = null;
  let cand = null, candCount = 0, current = null, silentFrames = 0;

  const hasApi = () => {
    try { return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'; }
    catch { return false; }
  };

  function emit(midi, on) {
    try { onNote?.({ midi, on, t: nowMs(), source: 'mic' }); } catch { /* ignore */ }
  }

  function release() {
    if (current != null) { emit(current, false); current = null; }
    cand = null; candCount = 0;
  }

  function frame() {
    try {
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (rms < rmsGate) {
        if (++silentFrames >= 3) release();
        cand = null; candCount = 0;
        return;
      }
      silentFrames = 0;
      const r = yin(buf, ctx.sampleRate);
      if (!r || r.clarity <= clarityMin) { cand = null; candCount = 0; return; }
      const m = freqToMidi(r.freq);
      if (m === cand) candCount++; else { cand = m; candCount = 1; }
      if (candCount >= agree && m !== current) {
        if (current != null) emit(current, false);
        current = m;
        emit(m, true);
      }
    } catch { /* ignore */ }
  }

  const adapter = {
    get available() { return hasApi(); },

    async start() {
      if (!hasApi()) return { ok: false, reason: 'unsupported' };
      if (timer) return { ok: true };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        const name = e && e.name;
        const reason = name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-device'
          : name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'denied';
        return { ok: false, reason };
      }
      try {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) throw new Error('no audio');
        ctx = new Ctor();
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        src = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = FRAME;
        src.connect(analyser);
        buf = new Float32Array(FRAME);
        timer = setInterval(frame, Math.max(10, Math.floor((FRAME / ctx.sampleRate) * 1000 / 2)));
        return { ok: true };
      } catch {
        adapter.stop();
        return { ok: false, reason: 'unsupported' };
      }
    },

    stop() {
      try { if (timer) clearInterval(timer); } catch { /* ignore */ }
      timer = null;
      release();
      try { stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* ignore */ }
      try { src?.disconnect?.(); } catch { /* ignore */ }
      try { ctx?.close?.(); } catch { /* ignore */ }
      stream = ctx = analyser = src = null;
    },
  };
  return adapter;
}
