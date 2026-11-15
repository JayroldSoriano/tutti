// Settings card: move progress to another device with no backend (a backup file or a backup code).
import { h } from './h.js';
import { openDialog, toast, announce } from './dialog.js';
import {
  summarizeState, makeBackup, backupFileName, backupToJSON, encodeBackupCode,
  parseBackup, applyBackup, compareSummaries,
} from '../backup.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SAVED_MSG = 'Backup saved — open Tutti on your other device and choose Restore.';

// ---------------------------------------------------------------- wording
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function whenText(ts, now = Date.now()) {
  if (!(ts > 0)) return null;
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((day(now) - day(ts)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// an empty device: no recorded activity and nothing that a Replace could lose
const isEmpty = (s) => !s || (!(s.lastActiveAt > 0) && !(s.totalAnswers > 0) && !(s.lessonsDone > 0));

function summaryLine(s) {
  if (isEmpty(s)) return 'Nothing practised on this device yet.';
  const parts = [plural(s.lessonsDone || 0, 'lesson done', 'lessons done'), plural(s.totalAnswers || 0, 'note practised', 'notes practised')];
  const when = whenText(s.lastActiveAt);
  if (when) parts.push('last active ' + when);
  return parts.join(' · ');
}

// ---------------------------------------------------------------- icons
function icon(d) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('aria-hidden', 'true'); el.setAttribute('class', 'xf-ico');
  el.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
  return el;
}
const ICON = {
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.2"/><path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8"/>',
  file: '<path d="M13.5 3.5H7.2A2.2 2.2 0 0 0 5 5.7v12.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V9z"/><path d="M13.5 3.5V9H19M12 17.5v-6M9.5 14 12 11.5l2.5 2.5"/>',
  paste: '<rect x="5" y="5" width="14" height="15.5" rx="2.2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
};

// ---------------------------------------------------------------- card
export function renderBackupCard(ctx) {
  const getState = () => ctx.engine.getState();
  const localSummary = () => summarizeState(getState());

  const summaryEl = h('p.xf-summary', { id: 'xf-summary' }, summaryLine(localSummary()));
  const statusEl = h('p.xf-status', { role: 'status', 'aria-live': 'polite', hidden: true });

  function showStatus(msg) {
    statusEl.replaceChildren(icon('<path d="M5 12.5 10 17.5 19 7"/>'), h('span', msg));
    statusEl.hidden = false;
    announce(msg);
  }

  // Pre-encode the code so "Copy" can write to the clipboard synchronously inside the tap (Safari).
  let cached = { sig: null, code: null, pending: null };
  const sigOf = (st) => JSON.stringify([st.updatedAt, st.totalAnswers, st.lessons && st.lessons.lastActive, st.settings]);
  function codeFor(st) {
    const sig = sigOf(st);
    if (cached.sig === sig && (cached.code || cached.pending)) return cached;
    const backup = makeBackup(st, { now: Date.now() });
    const entry = { sig, code: null, pending: null };
    entry.pending = encodeBackupCode(backup).then((c) => { entry.code = c || null; entry.pending = null; return c; });
    cached = entry;
    return entry;
  }
  try { codeFor(getState()); } catch { /* encoded on demand */ }

  // ---- save: file
  function downloadFile() {
    let url;
    try {
      const now = Date.now();
      const json = backupToJSON(makeBackup(getState(), { now }));
      const blob = new Blob([json], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: backupFileName(now), hidden: true });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showStatus(SAVED_MSG);
    } catch (e) {
      console.warn(e);
      if (url) URL.revokeObjectURL(url);
      toast('Could not create the backup file. Try “Copy backup code” instead.');
    }
  }

  // ---- save: code
  async function copyCode() {
    const entry = codeFor(getState());
    const clip = navigator.clipboard;
    let ok = false;
    try {
      if (entry.code && clip && clip.writeText) {
        await clip.writeText(entry.code); ok = true;            // still inside the tap
      } else if (clip && clip.write && typeof ClipboardItem === 'function') {
        const blob = entry.pending.then((c) => { if (!c) throw new Error('encode failed'); return new Blob([c], { type: 'text/plain' }); });
        await clip.write([new ClipboardItem({ 'text/plain': blob })]); ok = true;
      } else if (clip && clip.writeText) {
        const c = entry.code || await entry.pending;
        if (c) { await clip.writeText(c); ok = true; }
      }
    } catch { ok = false; }
    if (ok) {
      toast('Backup code copied');
      showStatus('Code copied — paste it into Tutti on your other device under Restore.');
      return;
    }
    const code = entry.code || await entry.pending;
    if (!code) { toast('Could not make a backup code. Try “Download backup file” instead.'); return; }
    showCodeDialog(code);
  }

  function showCodeDialog(code) {
    const ta = h('textarea.xf-code', {
      readonly: true, rows: 6, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      'aria-label': 'Backup code', 'aria-describedby': 'xf-code-help',
    });
    ta.value = code;
    const selectAll = () => {
      try { ta.focus({ preventScroll: true }); ta.select(); ta.setSelectionRange(0, ta.value.length); } catch { /* ignore */ }
    };
    ta.addEventListener('focus', () => setTimeout(selectAll, 0));
    const selBtn = h('button.btn.btn-quiet.xf-selbtn', { type: 'button', onclick: () => {
      selectAll();
      let copied = false;
      try { copied = document.execCommand && document.execCommand('copy'); } catch { copied = false; }
      if (copied) { toast('Backup code copied'); showStatus('Code copied — paste it into Tutti on your other device under Restore.'); }
      else announce('Code selected. Copy it with your device’s Copy command.');
    } }, 'Select all');
    openDialog({
      title: 'Your backup code',
      className: 'xf-dialog',
      body: h('div.xf-body',
        h('p', { id: 'xf-code-help' }, 'Copy this code and send it to your other device — Notes or Messages work well. It’s long; that’s normal, just copy all of it.'),
        ta, selBtn),
      actions: [{ label: 'Done', value: true, kind: 'primary' }],
      onOpen: () => setTimeout(selectAll, 30),
    });
  }

  // ---- restore: file
  const fileInput = h('input.xf-file', {
    type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true, tabindex: '-1', 'aria-hidden': 'true',
    onchange: async () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      let res;
      if (f.size > MAX_FILE_BYTES) res = { ok: false, message: 'That file is too large to be a Tutti backup.' };
      else {
        try { res = await parseBackup(await f.arrayBuffer()); }
        catch { res = { ok: false, message: 'That file could not be read. Try choosing it again.' }; }
      }
      if (!res.ok) { fileError(res.message); return; }
      preview(res);
    },
  });

  async function fileError(message) {
    const v = await openDialog({
      title: 'That file didn’t work',
      className: 'xf-dialog',
      body: h('p.xf-error', { role: 'alert' }, message || 'That does not look like a Tutti backup.'),
      actions: [
        { label: 'Choose another file', value: 'again', kind: 'primary' },
        { label: 'Cancel', value: null, kind: 'quiet' },
      ],
    });
    if (v === 'again') fileInput.click();
  }

  // ---- restore: code
  async function pasteCode() {
    const errId = 'xf-err-' + Math.random().toString(36).slice(2, 7);
    const ta = h('textarea.xf-code.xf-paste', {
      rows: 5, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      placeholder: 'TUTTI1.…', 'aria-label': 'Backup code', 'aria-describedby': errId,
    });
    const err = h('p.xf-error', { id: errId, role: 'alert', hidden: true });
    const setErr = (msg) => {
      err.textContent = msg || ''; err.hidden = !msg;
      ta.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    ta.addEventListener('input', () => setErr(''));
    let parsed = null;
    const v = await openDialog({
      title: 'Paste backup code',
      className: 'xf-dialog',
      body: h('div.xf-body',
        h('p', 'On your other device, choose “Copy backup code”, then paste it here.'),
        ta, err),
      actions: [
        {
          label: 'Continue', value: 'go', kind: 'primary',
          run: async () => {
            const text = ta.value;
            if (!text.trim()) { setErr('Paste your backup code into the box first.'); ta.focus(); return false; }
            const res = await parseBackup(text);
            if (!res.ok) { setErr(res.message || 'That does not look like a Tutti backup.'); ta.focus(); return false; }
            parsed = res; return true;
          },
        },
        { label: 'Cancel', value: null, kind: 'quiet' },
      ],
      onOpen: () => setTimeout(() => { try { ta.focus({ preventScroll: true }); } catch { /* ignore */ } }, 30),
    });
    if (v === 'go' && parsed) preview(parsed);
  }

  // ---- preview + apply
  function col(title, s, extra) {
    const row = (k, v) => h('div.xf-row', h('dt', k), h('dd.num', v));
    return h('div.xf-col',
      h('h3', title),
      isEmpty(s)
        ? h('p.xf-none', 'No progress yet')
        : h('dl',
          row('Lessons done', (s.lessonsDone || 0).toLocaleString()),
          row('Notes practised', (s.totalAnswers || 0).toLocaleString()),
          row('Last active', whenText(s.lastActiveAt) || '—')),
      extra || null);
  }

  async function preview(res) {
    const local = localSummary();
    const incoming = res.summary || summarizeState(res.state);
    const localEmpty = isEmpty(local);
    const cmp = compareSummaries(local, incoming);
    const saved = whenText(res.backup && res.backup.createdAt);

    let note;
    if (localEmpty) note = 'This device has no progress yet, so the backup will simply be loaded here.';
    else if (isEmpty(incoming)) note = 'This backup has no progress in it. Merging keeps everything on this device.';
    else if (!cmp.incomingHasMore && !cmp.incomingIsNewer) note = 'This device looks further along than the backup. Merging won’t lose anything here.';
    else note = 'Merge keeps the best of both: every finished lesson and the further-along practice record.';

    const body = h('div.xf-body',
      h('div.xf-compare',
        col('In the backup', incoming, saved ? h('p.xf-saved', 'Saved ' + saved) : null),
        col('On this device', local)),
      h('p.xf-note', note));

    const actions = localEmpty
      ? [
        { label: 'Restore backup', value: 'replace', kind: 'primary' },
        { label: 'Cancel', value: null, kind: 'quiet' },
      ]
      : [
        { label: 'Merge — keeps the best of both', value: 'merge', kind: 'primary' },
        { label: 'Replace this device’s progress', value: 'replace', kind: 'danger' },
        { label: 'Cancel', value: null, kind: 'quiet' },
      ];
    const mode = await openDialog({ title: 'Restore this backup?', className: 'xf-dialog', body, actions });
    if (mode !== 'merge' && mode !== 'replace') return;
    apply(res.state, mode);
  }

  function apply(imported, mode) {
    const before = getState();
    let next;
    try { next = applyBackup(before, imported, mode, { now: ctx.now() }); }
    catch (e) { console.warn(e); toast('Could not restore that backup. Nothing was changed.'); return; }
    const want = summarizeState(next);
    try {
      ctx.rebuildEngine(next);
      const got = summarizeState(ctx.engine.getState());
      if (got.totalAnswers !== want.totalAnswers || got.lessonsDone !== want.lessonsDone) throw new Error('state rejected');
    } catch (e) {
      console.warn(e);
      try { ctx.rebuildEngine(before); } catch { /* ignore */ }
      toast('Could not restore that backup. Nothing was changed.');
      return;
    }
    ctx.save({ flush: true });
    const msg = mode === 'merge' ? 'Progress merged from your backup' : 'Progress restored from your backup';
    toast(msg, { tone: 'brass' });
    announce(msg + '.');
    ctx.render();
  }

  // ---- layout
  const btn = (label, ico, onclick, extra = {}) => h('button.btn.xf-btn', { type: 'button', onclick, ...extra }, icon(ICON[ico]), h('span', label));

  const card = h('section.card.group.xf', { 'aria-labelledby': 'xf-title' },
    h('div.setting',
      h('h2.xf-title', { id: 'xf-title' }, 'Move progress to another device'),
      summaryEl),
    h('div.setting',
      h('span.lbl.xf-lbl', { id: 'xf-save' }, 'Save from this device'),
      h('div.xf-actions', { role: 'group', 'aria-labelledby': 'xf-save' },
        btn('Download backup file', 'download', downloadFile),
        btn('Copy backup code', 'copy', copyCode)),
      statusEl),
    h('div.setting',
      h('span.lbl.xf-lbl', { id: 'xf-restore' }, 'Restore on this device'),
      h('div.xf-actions', { role: 'group', 'aria-labelledby': 'xf-restore' },
        btn('Restore from file', 'file', () => fileInput.click()),
        btn('Paste backup code', 'paste', pasteCode)),
      fileInput));

  const help = h('p.xf-help',
    'On iPhone, the file goes to Files › Downloads and can be AirDropped to your Mac. ',
    'The code works through Notes or Messages too.');

  return [card, help];
}
