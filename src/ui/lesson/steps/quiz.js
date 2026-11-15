// quiz: the checkpoint. A drill with hints off, no retries, every item covered at least once.
import { mountDrill } from './drill.js';

export function mount(step, env) { return mountDrill(step, env, { quiz: true }); }
