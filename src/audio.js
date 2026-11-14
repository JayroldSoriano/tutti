// Organ tone synth + metronome click. No AudioContext until unlock().

const HARMONICS = [1, 2, 3, 4, 6, 8];
const GAINS = [1, 0.55, 0.3, 0.22, 0.1, 0.06];
const GAIN_SUM = GAINS.reduce((a, b) => a + b, 0);
const ATTACK = 0.012;
const RELEASE = 0.06;
const MAX_VOICES = 8;

const hasPerf = () => typeof performance !== 'undefined' && typeof performance.now === 'function';

function getCtor() {
  try {
    const g = globalThis;
    return g.AudioContext || g.webkitAudioContext || null;
  } catch { return null; }
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;
  const voices = new Map(); // midi -> { gain, oscs, order }
  let order = 0;

  const audio = {
    available: !!getCtor(),

    unlock() {
      try {
        if (!ctx) {
          const Ctor = getCtor();
          if (!Ctor) { audio.available = false; return false; }
          ctx = new Ctor();
          const comp = ctx.createDynamicsCompressor();
          master = ctx.createGain();
          master.gain.value = 0.5;
          master.connect(comp);
          comp.connect(ctx.destination);
        }
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        audio.available = true;
        return true;
      } catch {
        ctx = null; master = null;
        audio.available = false;
        return false;
      }
    },

    noteOn(midi, { velocity = 0.8 } = {}) {
      try {
        if (!enabled || !ctx || !master) return;
        if (voices.has(midi)) audio.noteOff(midi);
        if (voices.size >= MAX_VOICES) {
          let oldest = null;
          for (const [m, v] of voices) if (!oldest || v.order < oldest.v.order) oldest = { m, v };
          if (oldest) audio.noteOff(oldest.m);
        }
        const t = ctx.currentTime;
        const f0 = 440 * Math.pow(2, (midi - 69) / 12);
        const vg = ctx.createGain();
        const peak = Math.max(0.02, Math.min(1, velocity)) * 0.5 / GAIN_SUM * 2;
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(peak, t + ATTACK);
        vg.connect(master);
        const oscs = [];
        HARMONICS.forEach((h, i) => {
          const fr = f0 * h;
          if (fr > 12000) return;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(fr, t);
          g.gain.value = GAINS[i];
          o.connect(g); g.connect(vg);
          o.start(t);
          oscs.push(o);
        });
        voices.set(midi, { gain: vg, oscs, order: ++order });
      } catch { /* ignore */ }
    },

    noteOff(midi) {
      try {
        const v = voices.get(midi);
        if (!v || !ctx) return;
        voices.delete(midi);
        const t = ctx.currentTime;
        try { v.gain.gain.cancelScheduledValues(t); } catch { /* ignore */ }
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0, t + RELEASE);
        for (const o of v.oscs) { try { o.stop(t + RELEASE + 0.02); } catch { /* ignore */ } }
        setTimeout(() => { try { v.gain.disconnect(); } catch { /* ignore */ } }, (RELEASE + 0.1) * 1000);
      } catch { /* ignore */ }
    },

    allOff() {
      try { for (const m of [...voices.keys()]) audio.noteOff(m); } catch { /* ignore */ }
    },

    blip(kind) {
      try {
        if (!enabled || !ctx || !master) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = kind === 'bad' ? 'triangle' : 'sine';
        const f = kind === 'bad' ? [200, 150] : [880, 1320];
        o.frequency.setValueAtTime(f[0], t);
        o.frequency.setValueAtTime(f[1], t + 0.05);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.14);
      } catch { /* ignore */ }
    },

    click(accent) {
      try {
        if (!enabled || !ctx || !master) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = accent ? 1500 : 1000;
        g.gain.setValueAtTime(accent ? 0.16 : 0.09, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.05);
      } catch { /* ignore */ }
    },

    now() {
      try {
        if (ctx) return ctx.currentTime * 1000;
      } catch { /* ignore */ }
      return hasPerf() ? performance.now() : 0;
    },

    setEnabled(b) {
      enabled = !!b;
      if (!enabled) audio.allOff();
    },
  };
  return audio;
}
