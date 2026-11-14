// In-page modal (focus trap, Esc, restores focus) and toasts. No alert/confirm/prompt anywhere.
import { h } from './h.js';

let openCount = 0;
export const dialogOpen = () => openCount > 0;

/**
 * openDialog({ title, body, art, actions: [{ label, value, kind }], dismissable }) -> Promise<value|null>
 */
export function openDialog({ title, body, art, actions = [{ label: 'OK', value: true, kind: 'primary' }], dismissable = true, onOpen } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const titleId = 'dlg-' + Math.random().toString(36).slice(2, 8);
    const btns = actions.map((a) => h('button.btn.btn-block' + (a.kind ? '.btn-' + a.kind : ''), {
      type: 'button', onclick: () => close(a.value),
    }, a.label));
    const dlg = h('div.dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      art ? h('div.d-art', art) : null,
      h('h2', { id: titleId }, title),
      body ? h('div.d-body', typeof body === 'string' ? h('p', body) : body) : null,
      h('div.d-actions', btns));
    const scrim = h('div.scrim', dlg);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && dismissable) close(null); });
    const focusables = () => [...dlg.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (dismissable) close(null); return; }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    let done = false;
    function close(v) {
      if (done) return; done = true;
      openCount = Math.max(0, openCount - 1);
      document.removeEventListener('keydown', onKey, true);
      scrim.remove();
      try { prev && prev.focus && prev.focus({ preventScroll: true }); } catch { /* ignore */ }
      resolve(v);
    }
    openCount++;
    document.body.appendChild(scrim);
    const pick = btns.find((b, i) => actions[i].autofocus) || btns[0];
    setTimeout(() => { try { pick && pick.focus({ preventScroll: true }); } catch { /* ignore */ } }, 0);
    onOpen && onOpen({ close });
  });
}

export function confirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return openDialog({
    title, body,
    actions: [
      { label: confirm, value: true, kind: danger ? 'danger' : 'primary' },
      { label: cancel, value: false, kind: 'quiet', autofocus: true },
    ],
  }).then((v) => v === true);
}

export function toast(msg, { tone, ms = 2600 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = h('div.toast' + (tone ? '.is-' + tone : ''), { role: 'status' }, msg);
  host.appendChild(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, ms);
}

export function announce(msg) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}
