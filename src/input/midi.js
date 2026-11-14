// Web MIDI adapter. Nothing touches navigator until start().

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);

export function createMidiInput({ onNote } = {}) {
  let access = null;
  let running = false;

  const hasApi = () => {
    try { return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'; }
    catch { return false; }
  };

  function handle(e) {
    try {
      const d = e.data;
      if (!d || d.length < 2) return;
      const cmd = d[0] & 0xf0;
      if (cmd !== 0x90 && cmd !== 0x80) return;
      const on = cmd === 0x90 && d[2] > 0; // note-on with velocity 0 = note-off
      const t = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : nowMs();
      onNote?.({ midi: d[1], on, t, source: 'midi' });
    } catch { /* ignore */ }
  }

  function hook() {
    if (!access) return 0;
    let n = 0;
    try {
      for (const input of access.inputs.values()) { input.onmidimessage = handle; n++; }
    } catch { /* ignore */ }
    return n;
  }

  const adapter = {
    get available() { return hasApi(); },

    async start() {
      if (!hasApi()) return { ok: false, reason: 'unsupported' };
      try {
        access = await navigator.requestMIDIAccess();
      } catch (e) {
        const name = e && e.name;
        return { ok: false, reason: name === 'NotSupportedError' ? 'unsupported' : (name === 'SecurityError' || name === 'NotAllowedError') ? 'blocked' : 'denied' };
      }
      try {
        access.onstatechange = () => { if (running) hook(); }; // hot-plug
      } catch { /* ignore */ }
      running = true;
      const n = hook();
      // no device: report it, but stay subscribed so a later hot-plug still works (until stop()).
      return n > 0 ? { ok: true } : { ok: false, reason: 'no-device' };
    },

    stop() {
      running = false;
      try {
        if (access) {
          for (const input of access.inputs.values()) input.onmidimessage = null;
          access.onstatechange = null;
        }
      } catch { /* ignore */ }
      access = null;
    },
  };
  return adapter;
}
