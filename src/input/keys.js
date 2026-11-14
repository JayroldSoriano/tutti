// Desktop keyboard adapter. Piano row A W S E D F T G Y H U J K = C..C (chromatic).
// Z / X = octave down / up, Space = skip/next, ? = hint, Esc = pause.
// In 'names' mode (setMode('names')) plain letters C D E F G A B play that note instead.

const ROW = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };
const NAMES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : 0);

function ignoreTarget(t) {
  try {
    if (!t) return false;
    const tag = (t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return true;
    if (typeof t.closest === 'function' && t.closest('[role="dialog"],[aria-modal="true"],dialog')) return true;
    if (typeof document !== 'undefined' && document.querySelector?.('dialog[open],[aria-modal="true"]')) return true;
  } catch { /* ignore */ }
  return false;
}

export function createKeyInput({ onNote, onCommand, octave = 4 } = {}) {
  let oct = octave;      // octave of the 'A' key (C of that octave); C4 = midi 60
  let mode = 'keys';
  let attached = false;
  const down = new Map(); // key -> midi currently sounding

  const hasWin = () => typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  const baseMidi = () => 12 * (oct + 1);

  function cmd(name, e) {
    try { e.preventDefault(); onCommand?.(name); } catch { /* ignore */ }
  }

  function onKeyDown(e) {
    try {
      if (e.ctrlKey || e.metaKey || e.altKey || ignoreTarget(e.target)) return;
      const k = (e.key || '').toLowerCase();
      if (e.key === ' ' || e.code === 'Space') { if (!e.repeat) cmd('skip', e); else e.preventDefault(); return; }
      if (e.key === 'Escape') { cmd('pause', e); return; }
      if (e.key === '?') { cmd('hint', e); return; }
      if (e.repeat) return;
      if (k === 'z') { oct = Math.max(0, oct - 1); cmd('octave-down', e); return; }
      if (k === 'x') { oct = Math.min(7, oct + 1); cmd('octave-up', e); return; }
      const table = mode === 'names' ? NAMES : ROW;
      if (!(k in table) || k.length !== 1 || down.has(k)) return;
      const midi = baseMidi() + table[k];
      down.set(k, midi);
      e.preventDefault();
      onNote?.({ midi, on: true, t: nowMs(), source: 'key' });
    } catch { /* ignore */ }
  }

  function onKeyUp(e) {
    try {
      const k = (e.key || '').toLowerCase();
      if (!down.has(k)) return;
      const midi = down.get(k);
      down.delete(k);
      onNote?.({ midi, on: false, t: nowMs(), source: 'key' });
    } catch { /* ignore */ }
  }

  function onBlur() {
    for (const [k, midi] of [...down]) { down.delete(k); try { onNote?.({ midi, on: false, t: nowMs(), source: 'key' }); } catch { /* ignore */ } }
  }

  return {
    get available() { return hasWin(); },
    async start() {
      if (!hasWin()) return { ok: false, reason: 'unsupported' };
      if (attached) return { ok: true };
      try {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        attached = true;
        return { ok: true };
      } catch { return { ok: false, reason: 'unsupported' }; }
    },
    stop() {
      try {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      } catch { /* ignore */ }
      attached = false;
      down.clear();
    },
    // extras (not in the frozen shape; optional for the UI)
    setMode(m) { mode = m === 'names' ? 'names' : 'keys'; },
    setOctave(o) { oct = Math.max(0, Math.min(7, o | 0)); },
    getOctave() { return oct; },
  };
}
