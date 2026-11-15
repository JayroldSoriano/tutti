// tip: an organ-technique micro-tip; same interaction as a concept card.
import { mount as concept } from './concept.js';

export function mount(step, env) {
  const hnd = concept(step, env);
  hnd.el.classList.add('st-tip');
  return hnd;
}
