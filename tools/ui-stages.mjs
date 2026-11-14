// Screenshots of the practice screen for each prompt kind: node tools/ui-stages.mjs [scheme] [names]
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const scheme = process.argv[2] || 'light';
const names = process.argv[3] === 'names';
const exe = ['/usr/bin/google-chrome'].find((p) => existsSync(p));
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const stages = process.env.STAGES ? process.env.STAGES.split(',') : ['ledger', 'intervals', 'accidentals', 'dyads', 'hands-together', 'triads', 'hymn-chords', 'rhythm', 'phrases', 'bass-staff'];
let errs = 0;
for (const sid of stages) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => { errs++; console.log('E:', sid, e.message); });
  pg.on('console', (m) => { if (m.type() === 'error') { errs++; console.log('C:', sid, m.text()); } });
  await pg.goto('file:///home/claude/organ-trainer/dist/index.html#home&debug');
  await pg.waitForSelector('.home');
  await pg.evaluate(({ sid, names }) => {
    const t = window.__tutti;
    const s = t.engine.getState();
    s.placementDone = true;
    const ids = Object.keys(s.stages);
    const idx = ids.indexOf(sid);
    ids.forEach((id, i) => { if (id === 'pedal') return; s.stages[id].status = i < idx ? 'passed' : i === idx ? 'active' : 'locked'; });
    s.stageIdx = idx;
    if (names) s.settings.inputMode = 'names';
    t.ctx.rebuildEngine(s);
    t.ctx.pendingStart = { mode: 'practice' };
    t.ctx.nav('practice');
  }, { sid, names });
  await pg.waitForSelector('.p-staff svg');
  for (let k = 0; k < 6; k++) {
    await pg.waitForTimeout(500);
    const p = await pg.evaluate(() => window.__tutti.prompt);
    if (!p) break;
    if (!p.isIntro) break;
    if (p.answer.type === 'rhythm') { await pg.click('.tap-pad'); await pg.waitForTimeout(6000); continue; }
    const req = p.answer.type === 'sequence' ? p.answer.midis.slice(p.answer.given || 0) : p.answer.midis;
    for (const m of req) await pg.evaluate((mm) => window.__tutti.play(mm), m);
  }
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `screens/kind-${sid}-390-${scheme}${names ? '-names' : ''}.png` });
  await ctx.close();
}
await b.close();
console.log('errors', errs);
