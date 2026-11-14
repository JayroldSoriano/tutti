// Tiny DOM helpers. h('div.card#id', {onclick, class, style, aria-*}, ...children)
const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, props) {
  if (!props) return;
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') { el.setAttribute('class', (el.getAttribute('class') ? el.getAttribute('class') + ' ' : '') + v); }
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'ref' && typeof v === 'function') v(el);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

function parseTag(tag) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const name = (m && m[1]) || 'div';
  const cls = []; let id = null;
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) {
    if (part[0] === '.') cls.push(part.slice(1)); else id = part.slice(1);
  }
  return { name, cls, id };
}

export function h(tag, props, ...kids) {
  if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) { kids.unshift(props); props = null; }
  const { name, cls, id } = parseTag(tag);
  const el = document.createElement(name);
  if (cls.length) el.setAttribute('class', cls.join(' '));
  if (id) el.id = id;
  apply(el, props);
  append(el, kids);
  return el;
}

export function s(tag, props, ...kids) {
  if (props instanceof Node || Array.isArray(props) || typeof props !== 'object' || props === null) { kids.unshift(props); props = null; }
  const el = document.createElementNS(SVGNS, tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
  }
  append(el, kids);
  return el;
}

export const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmtSec = (ms) => (ms == null || !isFinite(ms) ? '–' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s');
export const pct = (x) => (x == null || !isFinite(x) ? '–' : Math.round(x * 100) + '%');
export const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
