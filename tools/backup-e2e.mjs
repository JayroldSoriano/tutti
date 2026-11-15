// End-to-end QA for "Move progress to another device": node tools/backup-e2e.mjs  -> exits 1 on any failure.
// Serves dist over http://localhost (localStorage), makes progress in context A, exports code + file,
// restores into fresh contexts (merge, replace, file, empty device, bad input). Screenshots -> screens/backup/.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'screens/backup');
mkdirSync(outDir, { recursive: true });
const tmp = resolve('/tmp/tutti-backup-e2e'); mkdirSync(tmp, { recursive: true });

const html = readFileSync(resolve(root, 'dist/index.html'));
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/`;

const exe = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const allErrors = [];

async function newPage({ width, height, scheme, perms = [] }) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600, colorScheme: scheme, acceptDownloads: true, reducedMotion: 'reduce' });
  if (perms.length) await ctx.grantPermissions(perms, { origin: base.replace(/\/$/, '') });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  return { ctx, page };
}
const state = (page) => page.evaluate(() => window.__tutti.engine.getState());
const sum = (st) => ({
  total: st.totalAnswers,
  lessons: Object.keys((st.lessons && st.lessons.done) || {}).sort().join(','),
  items: Object.values(st.items).filter((r) => r && r.n > 0).length,
});

async function boot(page) {
  await page.goto(base + '#home&debug');
  await page.waitForSelector('.home');
  await page.evaluate(() => { const e = window.__tutti.engine; e.skipPlacement && e.skipPlacement(); window.__tutti.ctx.save({ flush: true }); window.__tutti.ctx.render(); });
}
async function markLessons(page, ids) {
  await page.evaluate((ids) => {
    const e = window.__tutti.engine; const ls = e.getLessons(); const now = Date.now();
    for (const id of ids) ls.done[id] = { at: now - 3600e3, grade: 'pass', attempts: 1, acc: 0.9 };
    ls.lastActive = now - 3600e3; e.setLessons(ls, { now }); window.__tutti.ctx.save({ flush: true });
  }, ids);
}
const reqOf = (p) => (p.answer.type === 'sequence' ? p.answer.midis.slice(p.answer.given || 0) : p.answer.midis || []);
// Play n scored practice answers through #practice&debug and window.__tutti, then end the session.
async function practise(page, n) {
  await page.evaluate(() => { location.hash = '#home&debug'; });
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: 'Free practice' }).click();
  await page.waitForSelector('.practice .p-staff svg');
  let scored = 0, guard = 0, lastId = null;
  while (scored < n && guard++ < n * 8) {
    for (let w = 0; w < 80; w++) {
      if (await page.$('.dialog')) await page.locator('.dialog .btn').first().click();
      if (await page.evaluate((id) => !!(window.__tutti.prompt && window.__tutti.prompt.promptId !== id), lastId)) break;
      await page.waitForTimeout(100);
    }
    const p = await page.evaluate(() => window.__tutti.prompt);
    if (!p || p.promptId === lastId) continue;
    lastId = p.promptId;
    await page.waitForTimeout(60);
    if (p.answer.type === 'rhythm') { // tap on the beat
      const beat = 60000 / (p.answer.bpm || 72);
      await page.click('.tap-pad');
      if (p.isIntro) { await page.waitForTimeout(4 * beat + p.answer.beats * beat + 900); continue; }
      const t0 = Date.now() + 4 * beat; await page.waitForTimeout(4 * beat - 20);
      for (const o of p.answer.onsets) { const d = t0 + o * beat - Date.now(); if (d > 0) await page.waitForTimeout(d); await page.dispatchEvent('.tap-pad', 'pointerdown'); }
      await page.waitForTimeout(p.answer.beats * beat + 900); scored++; continue;
    }
    for (const m of reqOf(p)) await page.evaluate((x) => window.__tutti.play(x), m);
    if (!p.isIntro) scored++;
  }
  if (await page.$('.dialog')) await page.locator('.dialog .btn').first().click().catch(() => {});
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForSelector('.dialog');
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForSelector('.summary');
  await page.evaluate(() => window.__tutti.ctx.save({ flush: true }));
}
async function toSettings(page) {
  await page.evaluate(() => { location.hash = '#settings&debug'; });
  await page.waitForSelector('.xf');
}
async function shotCard(page, name) {
  await page.locator('.xf').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const c = document.querySelector('.xf'); window.scrollBy(0, c.getBoundingClientRect().top - 70); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(outDir, name + '.png') });
}
const shot = async (page, name) => { await page.waitForTimeout(250); await page.screenshot({ path: resolve(outDir, name + '.png') }); };
async function overflowCheck(page, label) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth; const bad = [];
    for (const el of document.querySelectorAll('.xf *, .xf-help, .dialog, .dialog *')) {
      const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 0.5 || b.left < -0.5)) bad.push(el.className || el.tagName);
    }
    const small = [...document.querySelectorAll('.xf button, .dialog button')].filter((b) => b.offsetParent && (b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44)).map((b) => b.textContent);
    return { bad: bad.slice(0, 5), small };
  });
  ok(`${label}: no horizontal overflow`, r.bad.length === 0, r.bad.join(' '));
  ok(`${label}: targets >= 44px`, r.small.length === 0, r.small.join(' | '));
}
async function pasteAndPreview(page, code) {
  await page.getByRole('button', { name: 'Paste backup code' }).click();
  await page.waitForSelector('.dialog textarea');
  await page.locator('.dialog textarea').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('.dialog .xf-compare');
}
async function liveText(page) { await page.waitForTimeout(120); return page.evaluate(() => document.getElementById('live').textContent); }

async function run({ width, height, scheme, full }) {
  const tag = `${width}-${scheme}`;
  console.log(`\n== ${tag}`);

  // ---------- A: device with progress; export
  const A = await newPage({ width, height, scheme, perms: ['clipboard-read', 'clipboard-write'] });
  await boot(A.page); await markLessons(A.page, ['L01', 'L02', 'L03']); await practise(A.page, full ? 12 : 4);
  const aState = await state(A.page); const aSum = sum(aState);
  ok(`${tag} A: progress made`, aSum.total >= (full ? 12 : 4) && aSum.lessons === 'L01,L02,L03', JSON.stringify(aSum));
  await toSettings(A.page);
  const line = await A.page.locator('.xf-summary').innerText();
  ok(`${tag} A: summary line`, /3 lessons done · \d+ notes practised · last active today/.test(line), line);
  await shotCard(A.page, `card-${tag}`);
  await overflowCheck(A.page, `${tag} card`);

  // copy via clipboard (permission granted)
  await A.page.getByRole('button', { name: 'Copy backup code' }).click();
  await A.page.waitForSelector('.xf-status:not([hidden])');
  const clip = await A.page.evaluate(() => navigator.clipboard.readText());
  ok(`${tag} A: code on clipboard`, /^TUTTI1\.[0-9a-f]{8}\./.test(clip), `len=${clip.length}`);
  ok(`${tag} A: copy announced`, /Code copied/.test(await liveText(A.page)));
  await shotCard(A.page, `card-copied-${tag}`);

  // clipboard fallback dialog
  await A.page.evaluate(() => {
    const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: deny, write: deny, readText: deny }, configurable: true });
  });
  await A.page.getByRole('button', { name: 'Copy backup code' }).click();
  await A.page.waitForSelector('.dialog textarea.xf-code');
  await A.page.waitForTimeout(150);
  const fb = await A.page.evaluate(() => { const t = document.querySelector('.dialog textarea'); return { v: t.value, ro: t.readOnly, sel: t.selectionEnd - t.selectionStart, focus: document.activeElement === t }; });
  ok(`${tag} A: fallback dialog has code, read-only, selected`, fb.v === clip && fb.ro && fb.sel === fb.v.length && fb.focus, `sel=${fb.sel}/${fb.v.length}`);
  await overflowCheck(A.page, `${tag} code dialog`);
  await shot(A.page, `code-dialog-${tag}`);
  await A.page.keyboard.press('Tab'); // select all
  await A.page.keyboard.press('Enter');
  await A.page.getByRole('button', { name: 'Done' }).click();
  ok(`${tag} A: dialog closed`, !(await A.page.$('.dialog')));

  // download
  const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: 'Download backup file' }).click()]);
  const filePath = resolve(tmp, `${tag}-${dl.suggestedFilename()}`);
  await dl.saveAs(filePath);
  const fileJson = JSON.parse(readFileSync(filePath, 'utf8'));
  ok(`${tag} A: file downloaded`, /^tutti-progress-\d{4}-\d\d-\d\d-\d{4}\.json$/.test(dl.suggestedFilename()) && fileJson.format === 'tutti-backup' && fileJson.state.totalAnswers === aSum.total, dl.suggestedFilename());
  ok(`${tag} A: download confirmation`, /Backup saved — open Tutti on your other device/.test(await A.page.locator('.xf-status').innerText()));
  ok(`${tag} A: no console errors`, A.page.errors.length === 0, A.page.errors.join(' | '));
  allErrors.push(...A.page.errors);
  await A.ctx.close();

  // ---------- B: other progress; paste dialog, error, preview, merge
  const B = await newPage({ width, height, scheme });
  await boot(B.page); await markLessons(B.page, ['L01', 'L05']); await practise(B.page, 2);
  const bSum = sum(await state(B.page));
  await toSettings(B.page);
  await B.page.getByRole('button', { name: 'Paste backup code' }).click();
  await B.page.waitForSelector('.dialog textarea'); await B.page.waitForTimeout(120);
  ok(`${tag} B: paste textarea focused`, await B.page.evaluate(() => document.activeElement && document.activeElement.tagName === 'TEXTAREA'));
  await shot(B.page, `paste-dialog-${tag}`);
  await overflowCheck(B.page, `${tag} paste dialog`);
  await B.page.getByRole('button', { name: 'Continue' }).click();
  ok(`${tag} B: empty paste -> inline error`, /Paste your backup code/.test(await B.page.locator('.dialog .xf-error').innerText()));
  await B.page.locator('.dialog textarea').fill(clip.slice(0, clip.length - 40)); // cut short
  await B.page.getByRole('button', { name: 'Continue' }).click();
  await B.page.waitForSelector('.dialog .xf-error:not([hidden])');
  const errText = await B.page.locator('.dialog .xf-error').innerText();
  ok(`${tag} B: truncated code -> friendly error, dialog stays`, /damaged|cut short/i.test(errText) && !!(await B.page.$('.dialog textarea')), errText);
  await shot(B.page, `error-${tag}`);
  await B.page.keyboard.press('Escape');
  ok(`${tag} B: Esc closes dialog`, !(await B.page.$('.dialog')));

  await pasteAndPreview(B.page, `Here is my Tutti code:\n${clip}\n`);
  const prevText = await B.page.locator('.dialog').innerText();
  ok(`${tag} B: preview shows both summaries`, /In the backup/.test(prevText) && /On this device/.test(prevText), '');
  const btns = await B.page.locator('.dialog .d-actions button').allInnerTexts();
  ok(`${tag} B: Merge primary + Replace + Cancel`, btns.length === 3 && /^Merge/.test(btns[0]) && /Replace this device/.test(btns[1]) && btns[2] === 'Cancel', btns.join(' / '));
  const focused = await B.page.waitForFunction(() => /^Merge/.test(document.activeElement.textContent), null, { timeout: 2000 }).then(() => true, () => false);
  ok(`${tag} B: Merge focused by default`, focused);
  await overflowCheck(B.page, `${tag} preview`);
  await shot(B.page, `preview-dialog-${tag}`);
  await B.page.keyboard.press('Enter'); // keyboard: activate focused Merge
  await B.page.waitForSelector('.dialog', { state: 'detached' });
  const merged = sum(await state(B.page));
  ok(`${tag} B: merge keeps both`, merged.lessons === 'L01,L02,L03,L05' && merged.total === Math.max(aSum.total, bSum.total), `${JSON.stringify(bSum)} + A -> ${JSON.stringify(merged)}`);
  ok(`${tag} B: merge announced`, /merged/i.test(await liveText(B.page)));
  ok(`${tag} B: summary line re-rendered`, /^4 lessons done/.test(await B.page.locator('.xf-summary').innerText()));
  const persisted = await B.page.evaluate(() => JSON.parse(localStorage.getItem('tutti.progress.v1')));
  ok(`${tag} B: merge persisted`, sum(persisted).lessons === merged.lessons && persisted.totalAnswers === merged.total);
  ok(`${tag} B: no console errors`, B.page.errors.length === 0, B.page.errors.join(' | '));
  allErrors.push(...B.page.errors);
  await B.ctx.close();

  // ---------- C: other progress; replace
  const C = await newPage({ width, height, scheme });
  await boot(C.page); await markLessons(C.page, ['L07']); await practise(C.page, 2);
  await toSettings(C.page);
  await pasteAndPreview(C.page, clip);
  await C.page.getByRole('button', { name: /Replace this device/ }).click();
  await C.page.waitForSelector('.dialog', { state: 'detached' });
  const replaced = sum(await state(C.page));
  ok(`${tag} C: replace equals A`, JSON.stringify(replaced) === JSON.stringify(aSum), `${JSON.stringify(replaced)} vs ${JSON.stringify(aSum)}`);
  ok(`${tag} C: no console errors`, C.page.errors.length === 0, C.page.errors.join(' | '));
  allErrors.push(...C.page.errors);
  await C.ctx.close();

  // ---------- D: other progress; restore from the downloaded file, merge
  const D = await newPage({ width, height, scheme });
  await boot(D.page); await markLessons(D.page, ['L04']); await practise(D.page, 2);
  await toSettings(D.page);
  const [fc] = await Promise.all([D.page.waitForEvent('filechooser'), D.page.getByRole('button', { name: 'Restore from file' }).click()]);
  await fc.setFiles(filePath);
  await D.page.waitForSelector('.dialog .xf-compare');
  await D.page.getByRole('button', { name: /^Merge/ }).click();
  await D.page.waitForSelector('.dialog', { state: 'detached' });
  const dm = sum(await state(D.page));
  ok(`${tag} D: file merge`, dm.lessons === 'L01,L02,L03,L04' && dm.total === aSum.total, JSON.stringify(dm));
  // bad file -> error dialog
  const badPath = resolve(tmp, 'notes.txt');
  (await import('node:fs')).writeFileSync(badPath, 'shopping list: milk, eggs');
  const [fc2] = await Promise.all([D.page.waitForEvent('filechooser'), D.page.getByRole('button', { name: 'Restore from file' }).click()]);
  await fc2.setFiles(badPath);
  await D.page.waitForSelector('.dialog .xf-error');
  ok(`${tag} D: bad file -> friendly error`, /does not look like a Tutti backup/.test(await D.page.locator('.dialog .xf-error').innerText()));
  await shot(D.page, `error-file-${tag}`);
  await D.page.getByRole('button', { name: 'Cancel' }).click();
  ok(`${tag} D: no console errors`, D.page.errors.length === 0, D.page.errors.join(' | '));
  allErrors.push(...D.page.errors);
  await D.ctx.close();

  // ---------- E: brand-new device; file restore recommends a plain restore
  const E = await newPage({ width, height, scheme });
  await E.page.goto(base + '#settings&debug'); await E.page.waitForSelector('.xf');
  ok(`${tag} E: empty summary`, /Nothing practised/.test(await E.page.locator('.xf-summary').innerText()));
  const [fc3] = await Promise.all([E.page.waitForEvent('filechooser'), E.page.getByRole('button', { name: 'Restore from file' }).click()]);
  await fc3.setFiles(filePath);
  await E.page.waitForSelector('.dialog .xf-compare');
  const eb = await E.page.locator('.dialog .d-actions button').allInnerTexts();
  ok(`${tag} E: empty device -> Restore backup + Cancel`, eb.join('/') === 'Restore backup/Cancel', eb.join('/'));
  await shot(E.page, `preview-empty-${tag}`);
  await E.page.getByRole('button', { name: 'Restore backup' }).click();
  await E.page.waitForSelector('.dialog', { state: 'detached' });
  ok(`${tag} E: restored equals A`, JSON.stringify(sum(await state(E.page))) === JSON.stringify(aSum));
  await E.page.reload(); await E.page.waitForSelector('.xf');
  ok(`${tag} E: survives reload`, JSON.stringify(sum(await state(E.page))) === JSON.stringify(aSum));
  ok(`${tag} E: no console errors`, E.page.errors.length === 0, E.page.errors.join(' | '));
  allErrors.push(...E.page.errors);
  await E.ctx.close();
}

const configs = [
  { width: 390, height: 844, scheme: 'light', full: true },
  { width: 390, height: 844, scheme: 'dark' },
  { width: 1280, height: 800, scheme: 'light' },
  { width: 1280, height: 800, scheme: 'dark' },
];
const only = process.argv[2];
for (const c of configs) if (!only || `${c.width}-${c.scheme}` === only) await run(c);

ok('zero console errors overall', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await browser.close(); server.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
