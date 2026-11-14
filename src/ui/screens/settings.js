import { h } from '../h.js';
import { confirmDialog, toast } from '../dialog.js';

const REASON = {
  unsupported: 'Not supported in this browser.',
  blocked: 'Blocked inside this page. Open Tutti in its own tab to use it.',
  'no-device': 'No MIDI device found. Plug one in and it will connect.',
  denied: 'Permission was denied.',
};

export function renderSettings(ctx, mount) {
  const st = () => ctx.settings();
  const set = (partial) => { ctx.updateSettings(partial); };

  function seg(key, options, { label, help, onPick } = {}) {
    const cur = st()[key];
    const btns = options.map(([value, text, sub]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(cur === value),
      onclick: async (e) => {
        if (onPick) { const ok = await onPick(value); if (ok === false) return; }
        set({ [key]: value });
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
      },
    }, text, sub ? h('span.na', sub) : null));
    const id = 'lbl-' + key;
    return h('div.setting',
      h('div.setting-head', h('span.lbl', { id }, label)),
      help ? h('p.help', help) : null,
      h('div.seg', { role: 'radiogroup', 'aria-labelledby': id }, btns));
  }

  function toggle(key, label, help) {
    const id = 'sw-' + key;
    const sw = h('button.switch', {
      type: 'button', role: 'switch', id, 'aria-checked': String(!!st()[key]),
      onclick: () => { const v = !st()[key]; set({ [key]: v }); sw.setAttribute('aria-checked', String(v)); },
    });
    return h('div.setting', h('div.switch-row', h('label', { for: id }, label), sw), help ? h('p.help', help) : null);
  }

  // input mode with availability checks
  const inputNote = h('p.note-line', { 'aria-live': 'polite' });
  const status = ctx.inputStatus || {};
  const sub = (m) => (status[m] && !status[m].ok && status[m].reason !== 'no-device' ? 'unavailable here' : '');
  const inputSeg = seg('inputMode', [['keys', 'Keys'], ['names', 'Names'], ['midi', 'MIDI', sub('midi')], ['mic', 'Mic', sub('mic')]], {
    label: 'Answer with',
    help: 'Keys: tap the on-screen manual. Names: tap note letters (any octave counts). MIDI: a real keyboard. Mic: play a real instrument.',
    onPick: async (v) => {
      inputNote.textContent = ''; inputNote.className = 'note-line';
      if (v !== 'midi') ctx.stopInput('midi');
      if (v !== 'mic') ctx.stopInput('mic');
      if (v === 'midi' || v === 'mic') {
        inputNote.textContent = v === 'midi' ? 'Looking for MIDI devices…' : 'Asking for the microphone…';
        const r = await ctx.startInput(v);
        if (!r.ok && r.reason !== 'no-device') {
          inputNote.textContent = `${v === 'midi' ? 'MIDI' : 'Microphone'} is unavailable here. ${REASON[r.reason] || ''} Staying with your current input.`;
          inputNote.className = 'note-line warn';
          const btn = [...inputSeg.querySelectorAll('button')].find((b) => b.textContent.startsWith(v === 'midi' ? 'MIDI' : 'Mic'));
          if (btn && !btn.querySelector('.na')) btn.append(h('span.na', 'unavailable here'));
          return false;
        }
        inputNote.textContent = r.ok ? (v === 'midi' ? 'MIDI connected. Play any key.' : 'Microphone on. Play one note at a time.') : REASON['no-device'];
      }
      return true;
    },
  });
  inputSeg.append(inputNote);

  const syncLine = h('div.sync');
  const paintSync = () => {
    const b = ctx.backend();
    const text = b === 'db' ? 'Synced to your account' : b === 'local' ? 'Saved on this device only' : 'Not saved: storage is unavailable, progress lasts until you close the page';
    syncLine.replaceChildren(h('i.' + b), h('span', text));
  };
  paintSync();
  const onSync = () => paintSync();
  document.addEventListener('tutti:sync', onSync);

  const resetBtn = h('button.btn.btn-danger.btn-block', {
    type: 'button',
    onclick: async () => {
      const ok = await confirmDialog({
        title: 'Reset all progress?',
        body: 'This clears every stage, note and session on this device and in your synced copy. Your settings stay. This cannot be undone.',
        confirm: 'Reset progress', cancel: 'Keep my progress', danger: true,
      });
      if (!ok) return;
      try { ctx.engine.reset({ now: ctx.now() }); } catch (e) { console.warn(e); }
      try { const s = ctx.engine.getState(); s.updatedAt = Date.now(); ctx.store.save(s, { flush: true }); } catch { /* ignore */ }
      toast('Progress reset');
      ctx.nav('home');
    },
  }, 'Reset progress');

  mount.append(h('div.settings',
    h('header.page-head', h('h1', 'Settings')),
    h('section.card.group',
      seg('sessionMin', [[5, '5 min'], [10, '10'], [15, '15'], [20, '20']], { label: 'Session length' }),
      seg('dailyGoalMin', [[5, '5 min'], [10, '10'], [15, '15'], [20, '20'], [30, '30']], { label: 'Daily goal' })),
    h('section.card.group',
      inputSeg,
      seg('naming', [['letters', 'C D E'], ['solfege', 'Do Re Mi']], { label: 'Note names' }),
      seg('labels', [['none', 'None'], ['c-only', 'C only'], ['all', 'All']], { label: 'Key labels' }),
      toggle('octaveStrict', 'Exact octave', 'When off, any C counts for a C. Keep it on to learn where notes live on the keyboard.')),
    h('section.card.group',
      toggle('sound', 'Sound'),
      toggle('metronome', 'Metronome in rhythm drills'),
      toggle('hints', 'Hints', 'A hint appears after a few seconds on notes you have not mastered. Hinted answers count half.')),
    h('section.card.group',
      h('div.setting', h('span.lbl', 'Sync'), syncLine),
      h('div.setting', resetBtn))));

  return () => document.removeEventListener('tutti:sync', onSync);
}
