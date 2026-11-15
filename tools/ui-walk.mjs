// UI walkthrough (brief F): node tools/ui-walk.mjs [--only=390-light]
// Loads dist/index.html from file://, walks home -> placement skip -> practice (5 right, 2 wrong)
// -> summary -> progress -> settings -> reset confirm. Saves screens/<screen>-<width>-<scheme>.png.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + resolve(root, 'dist/index.html');
const outDir = resolve(root, 'screens');
mkdirSync(outDir, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const combos = [[390, 844, 'light'], [390, 844, 'dark'], [1280, 800, 'light'], [1280, 800, 'dark']]
  .filter(([w, , sc]) => !only || only === `${w}-${sc}`);
let failures = 0;

for (const [w, hgt, scheme] of combos) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: w < 600 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${outDir}/${name}-${w}-${scheme}.png` }); };
  const tag = `${w}-${scheme}`;
  const check = async (label) => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
    if (r.sw > r.iw) { errors.push(`${label}: horizontal overflow ${r.sw} > ${r.iw}`); }
    return r;
  };

  await page.goto(url + '#home&debug');
  await page.waitForSelector('.home');
  await check('home-first');
  await shot('home-first');
  // new Home: skip placement (what "Start lesson 1" does), then land on the Today card with the practice row
  await page.evaluate(() => { window.__tutti.engine.skipPlacement(); window.__tutti.ctx.save({ flush: true }); });
  await page.reload();
  await page.waitForSelector('.lesson-card');
  await page.waitForSelector('.home-more-row');
  await check('home');
  await shot('home');

  await page.getByRole('button', { name: 'Free practice' }).click();
  await page.waitForSelector('.practice .p-staff svg');
  await page.waitForTimeout(300);
  const pr = await check('practice');
  if (pr.sh > pr.ih) errors.push(`practice: vertical scroll ${pr.sh} > ${pr.ih}`);

  const press = async (m) => {
    const sel = `.key[data-midi="${m}"]`;
    const el = await page.$(sel);
    if (!el) { await page.evaluate((mm) => window.__tutti.play(mm), m); return; }
    const box = await el.boundingBox();
    const vp = page.viewportSize();
    if (!box || box.x < 0 || box.x + box.width > vp.width) { await page.evaluate((mm) => window.__tutti.play(mm), m); return; }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  };
  let right = 0, wrong = 0, guard = 0, shotIntro = false, shotWrong = false, shotPrompt = false;
  while ((right < 5 || wrong < 2) && guard++ < 40) {
    await page.waitForFunction(() => window.__tutti && window.__tutti.prompt && document.querySelector('.p-staff svg'));
    await page.waitForTimeout(420); // keyboard glides to the new range
    const p = await page.evaluate(() => window.__tutti.prompt);
    const req = p.answer.type === 'sequence' ? p.answer.midis.slice(p.answer.given || 0) : p.answer.midis || [];
    if (p.isIntro) {
      if (!shotIntro) { await shot('practice-intro'); shotIntro = true; }
      for (const m of req) await press(m);
    } else if (wrong < 2 && right >= 2 + wrong * 2) {
      if (!shotPrompt) { await shot('practice'); shotPrompt = true; }
      const bad = req[0] + (req[0] % 12 === 4 || req[0] % 12 === 11 ? 1 : 2);
      await press(bad);
      await page.waitForTimeout(350);
      if (!shotWrong) { await shot('practice-wrong'); shotWrong = true; }
      for (const m of req) await press(m);
      wrong++;
    } else {
      for (const m of req) await press(m);
      right++;
      if (right === 1) { await page.waitForTimeout(80); await shot('practice-correct'); }
    }
    await page.waitForFunction((id) => !window.__tutti.prompt || window.__tutti.prompt.promptId !== id || document.querySelector('.dialog'), p.promptId, { timeout: 5000 }).catch(() => errors.push('prompt did not advance'));
    if (await page.$('.dialog')) { await shot('practice-dialog'); await page.locator('.dialog .btn').first().click(); }
  }

  // end session via pause sheet
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForSelector('.dialog');
  await shot('pause');
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForSelector('.summary');
  await check('summary');
  await shot('summary');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.home');
  await page.click('a.tab[data-route="progress"]');
  await page.waitForSelector('.progress');
  await check('progress');
  await shot('progress');
  await page.screenshot({ path: `${outDir}/progress-full-${w}-${scheme}.png`, fullPage: true });

  await page.click('a.tab[data-route="settings"]');
  await page.waitForSelector('.settings');
  await check('settings');
  await shot('settings');
  await page.screenshot({ path: `${outDir}/settings-full-${w}-${scheme}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.waitForSelector('.dialog');
  await shot('reset-confirm');
  await page.locator('.dialog').getByRole('button', { name: 'Reset progress' }).click();
  await page.waitForSelector('.home');
  await page.waitForTimeout(300);
  await shot('home-after-reset');

  console.log(`${tag}: right=${right} wrong=${wrong} errors=${errors.length}`);
  for (const e of errors) console.log('   ' + e);
  failures += errors.length;
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
