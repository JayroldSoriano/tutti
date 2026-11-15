// concept: read, watch the visual (auto-plays once, replay button), tap "Got it".
import { h, shell, primaryBtn } from '../common.js';
import { renderVisual } from '../visuals.js';

export function mount(step, env) {
  const vis = step.visual ? renderVisual(step.visual, env) : null;
  const lines = (step.body || []).map((t) => h('p', t));
  const replay = vis ? h('button.btn.btn-quiet.btn-replay', { type: 'button', onclick: () => vis.play(), 'aria-label': 'Replay the animation' }, replayIcon(), 'Replay') : null;
  const go = primaryBtn('Got it', () => env.done({ seen: true }));
  const sh = shell(step, {
    cls: 'st-concept',
    body: [vis ? h('div.st-visual', vis.el, replay) : null, h('div.st-text', lines)],
    foot: go,
  });
  env.later(() => { if (vis) vis.play(); }, 60);
  env.say(`${step.title}. ${(step.body || []).join(' ')}`);
  return {
    el: sh.el, kb: 'hidden', focus: go,
    onCommand(c) { if (c === 'next') go.click(); if (c === 'replay' && vis) vis.play(); },
    destroy() { if (vis) vis.destroy(); },
  };
}

export function replayIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 3.5v4.2h4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}
