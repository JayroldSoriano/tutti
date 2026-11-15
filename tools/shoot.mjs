// Integration QA (brief G): node tools/shoot.mjs   -> exits 1 on any failure.
// Scenarios: db-fake persistence, use->null, localStorage disabled, 60-answer fast session,
// wrong-answer run, overflow at 4 widths, note/answer consistency for hymn-chord + ledger prompts.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cur from '../src/curriculum.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + resolve(root, 'dist/index.html') + '#home&debug';
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };

async function newPage({ width = 390, height = 844, init, ctxOpts } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600, ...ctxOpts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  return { ctx, page };
}
const skipPlacement = async (page) => {
  // v2 home: no placement card; mark placement skipped and land on the lesson card
  await page.waitForSelector('.home');
  await page.evaluate(() => { const e = window.__tutti.engine; e.skipPlacement && e.skipPlacement(); window.__tutti.ctx.save({ flush: true }); window.__tutti.ctx.render(); });
  await page.waitForSelector('.lesson-card');
};
const startSession = async (page) => {
  await page.getByRole('button', { name: 'Free practice' }).click();
  await page.waitForSelector('.practice .p-staff svg');
};
const reqOf = (p) => (p.answer.type === 'sequence' ? p.answer.midis.slice(p.answer.given || 0) : p.answer.midis || []);

// Drives the practice screen. mode 'right' | 'wrong'. Counts scored (non-intro) answers.
async function drive(page, n, mode, opts = {}) {
  let scored = 0, guard = 0, lastId = null; const dialogs = drive.dialogs = [];
  while (scored < n && guard++ < n * 6) {
    for (let w = 0; w < 80; w++) {
      if (await page.$('.dialog')) { dialogs.push(await page.locator('.dialog h2, .dialog .dlg-title').first().innerText().catch(() => '?')); await page.locator('.dialog .btn').first().click(); }
      if (await page.evaluate((id) => !!(window.__tutti.prompt && window.__tutti.prompt.promptId !== id), lastId)) break;
      if (await page.$('.summary')) break;
      await page.waitForTimeout(100);
    }
    const p = await page.evaluate(() => window.__tutti.prompt);
    if (!p || p.promptId === lastId) { if (await page.$('.summary')) break; continue; }
    lastId = p.promptId;
    if (await page.$('.dialog')) { await page.locator('.dialog .btn').first().click(); }
    await page.waitForTimeout(opts.settle ?? 60);
    if (p.answer.type === 'rhythm') {
      const bpm = p.answer.bpm || 72, beat = 60000 / bpm;
      await page.click('.tap-pad');
      if (p.isIntro) { await page.waitForTimeout(4 * beat + p.answer.beats * beat + 900); continue; }
      const t0 = Date.now() + 4 * beat;
      await page.waitForTimeout(4 * beat - 20);
      if (mode === 'right') for (const o of p.answer.onsets) { const d = t0 + o * beat - Date.now(); if (d > 0) await page.waitForTimeout(d); await page.dispatchEvent('.tap-pad', 'pointerdown'); }
      await page.waitForTimeout(p.answer.beats * beat + 900);
      scored++; continue;
    }
    const req = reqOf(p);
    if (p.isIntro) { for (const m of req) await page.evaluate((x) => window.__tutti.play(x), m); continue; }
    if (mode === 'wrong') {
      const bad = req[0] + (req[0] % 12 === 4 || req[0] % 12 === 11 ? 1 : 2);
      await page.evaluate((x) => window.__tutti.play(x), bad);
      await page.waitForTimeout(320);
      for (const m of req) await page.evaluate((x) => window.__tutti.play(x), m);
    } else for (const m of req) await page.evaluate((x) => window.__tutti.play(x), m);
    scored++;
    if (await page.$('.dialog')) await page.locator('.dialog .btn').first().click();
  }
  return scored;
}
const state = (page) => page.evaluate(() => window.__tutti.engine.getState());
const endSession = async (page) => {
  if (await page.$('.dialog')) await page.locator('.dialog .btn').first().click().catch(() => {});
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForSelector('.dialog');
  await page.getByRole('button', { name: 'End session' }).click();
  await page.waitForSelector('.summary');
};

// ---------- 1. fake claude db: written after a session, restored on reload (fresh localStorage)
{
  const store = new Map(); let sets = 0;
  const mk = async (width) => {
    const r = await newPage({ width });
    await r.ctx.exposeFunction('__dbGet', (k) => (store.has(k) ? store.get(k) : null));
    await r.ctx.exposeFunction('__dbSet', (k, v) => { store.set(k, v); sets++; });
    await r.ctx.addInitScript(() => {
      window.claude = { use: async (n) => {
        if (n === 'user') return { id: async () => 'u1' };
        if (n === 'db') return { collection: (c) => ({ doc: (d) => ({
          get: async () => { const v = await window.__dbGet(c + '/' + d); return v ? { data: v } : undefined; },
          set: async (o) => { await window.__dbSet(c + '/' + d, JSON.parse(JSON.stringify(o))); },
        }) }) };
        return null;
      } };
    });
    return r;
  };
  const a = await mk(390);
  await a.page.goto(url); await skipPlacement(a.page); await startSession(a.page);
  await drive(a.page, 8, 'right'); await endSession(a.page);
  await a.page.waitForTimeout(2500);
  const total = (await state(a.page)).totalAnswers;
  const saved = [...store.values()][0];
  ok('db: doc written after session', sets > 0 && saved && saved.totalAnswers === total, `sets=${sets} total=${total}`);
  ok('db: backend reported', await a.page.evaluate(() => window.__tutti.store.backend()) === 'db');
  ok('db: no errors (writer)', a.page.errors.length === 0, a.page.errors.join(' | '));
  await a.ctx.close();
  const b = await mk(390); // fresh context => empty localStorage
  await b.page.goto(url); await b.page.waitForSelector('.home'); await b.page.waitForTimeout(1500);
  const s2 = await state(b.page);
  ok('db: progress restored on reload', s2.totalAnswers === total && total > 0, `restored=${s2.totalAnswers}`);
  ok('db: restored placementDone -> no first-run card', await b.page.$('.lesson-card:not(.is-first)') !== null);
  ok('db: no errors (reader)', b.page.errors.length === 0, b.page.errors.join(' | '));
  await b.ctx.close();
}

// ---------- 2. use resolves null -> localStorage path ; 3. localStorage disabled -> memory
for (const [label, init, expectBackend, persists] of [
  ['use->null', () => { window.claude = { use: async () => null }; }, 'local', true],
  ['use throws', () => { window.claude = { use: async () => { throw new Error('nope'); } }; }, 'local', true],
  ['no localStorage', () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); }, 'memory', false],
]) {
  const { ctx, page } = await newPage({ init });
  await page.goto(url); await skipPlacement(page); await startSession(page);
  await drive(page, 6, 'right'); await endSession(page);
  await page.waitForTimeout(1800);
  const be = await page.evaluate(() => window.__tutti.store.backend());
  const total = (await state(page)).totalAnswers;
  ok(`${label}: backend=${be}`, be === expectBackend);
  if (persists) {
    await page.evaluate(() => { location.hash = 'home&debug'; }); await page.reload(); await page.waitForSelector('.home'); await page.waitForTimeout(500);
    ok(`${label}: restored after reload`, (await state(page)).totalAnswers === total && total > 0);
  }
  ok(`${label}: no errors`, page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ---------- 4a. fast, correct 60-answer session -> stage advances
{
  const { ctx, page } = await newPage();
  await page.goto(url); await skipPlacement(page);
  const before = await state(page);
  await startSession(page);
  const n = await drive(page, 60, 'right', { settle: 10 });
  const mid = await state(page);
  await endSession(page);
  const after = await state(page);
  console.log(`      scored=${n} stageIdx ${before.stageIdx} -> ${after.stageIdx}, totalAnswers=${after.totalAnswers}`);
  ok('fast session: 60 scored answers', n >= 60);
  ok('fast session: stage advanced', after.stageIdx > before.stageIdx);
  const passed = Object.entries(after.stages).filter(([, v]) => v.status === 'passed').map(([k, v]) => `${k}:${v.via}`);
  ok('fast session: a stage passed (via shown)', passed.length > 0, passed.join(','));
  await page.getByRole('button', { name: 'Done' }).click(); await page.waitForSelector('.home');
  const stageTitle = await page.locator('#lc-title').innerText();
  console.log('      home lesson card title:', stageTitle);
  await page.click('a.tab[data-route="progress"]'); await page.waitForSelector('.progress');
  ok('fast session: progress screen renders', true);
  ok('fast session: no errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ---------- 4b. run of wrong answers -> reinforcement, no stuck/throw
{
  const { ctx, page } = await newPage();
  await page.goto(url); await skipPlacement(page); await startSession(page);
  const n = await drive(page, 25, 'wrong');
  const hintsSeen = await page.evaluate(() => window.__tutti.prompt && [window.__tutti.prompt.hintAfterMs, window.__tutti.prompt.reason]);
  const s = await state(page);
  ok('wrong run: drove 25 wrong answers without stalling', n >= 25, `n=${n}`);
  console.log(`      last prompt hintAfterMs/reason=${JSON.stringify(hintsSeen)} pace=${s.pace} stageIdx=${s.stageIdx}`);
  // after wrong run a correct answer must still work (not stuck)
  const m = await drive(page, 3, 'right');
  ok('wrong run: recovers with correct answers', m >= 3);
  await endSession(page);
  ok('wrong run: no errors', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ---------- 5. overflow at four widths, home / practice / progress / settings
for (const w of [380, 390, 768, 1280]) {
  const { ctx, page } = await newPage({ width: w, height: w < 600 ? 844 : 900 });
  await page.goto(url); await skipPlacement(page);
  const chk = async (l) => { const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(`overflow ${w} ${l}`, r[0] <= r[1], `${r[0]}>${r[1]}`); };
  await chk('home'); await startSession(page); await page.waitForTimeout(400); await chk('practice');
  await endSession(page); await chk('summary'); await page.getByRole('button', { name: 'Done' }).click();
  await page.click('a.tab[data-route="progress"]'); await page.waitForSelector('.progress'); await chk('progress');
  await page.click('a.tab[data-route="settings"]'); await page.waitForSelector('.settings'); await chk('settings');
  ok(`overflow ${w} no errors`, page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

// ---------- 6. hymn-chord + ledger: rendered noteheads vs answer midis
for (const sid of ['ledger', 'hymn-chords', 'triads', 'bass-staff', 'intervals']) {
  const { ctx, page } = await newPage();
  await page.goto(url); await page.waitForSelector('.home');
  const idxOk = await page.evaluate((sid) => {
    const t = window.__tutti, s = t.engine.getState();
    s.placementDone = true;
    const ids = Object.keys(s.stages), idx = ids.indexOf(sid);
    if (idx < 0) return false;
    ids.forEach((id, i) => { if (id === 'pedal') return; s.stages[id].status = i < idx ? 'passed' : i === idx ? 'active' : 'locked'; });
    s.stageIdx = idx; t.ctx.rebuildEngine(s); t.ctx.pendingStart = { mode: 'practice' }; t.ctx.nav('practice'); return true;
  }, sid);
  if (!idxOk) { ok(`render ${sid}: stage exists`, false); await ctx.close(); continue; }
  await page.waitForSelector('.p-staff svg');
  let checked = 0, bad = [], lastId = null;
  for (let k = 0; k < 14 && checked < 5; k++) {
    await page.waitForFunction((id) => window.__tutti.prompt && window.__tutti.prompt.promptId !== id, lastId, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(120);
    const info = await page.evaluate(() => {
      const p = window.__tutti.prompt, svg = document.querySelector('.p-staff svg');
      const mid = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
      const lineYs = [...svg.querySelectorAll('.st-line')].map(mid).sort((a, b) => a - b);
      const heads = [...svg.querySelectorAll('.st-note:not(.st-ghost)')].map((g) => ({ i: +g.getAttribute('data-i'), y: mid(g.querySelector('.st-head')) }));
      return { p, lineYs, heads };
    });
    if (!info.p || info.p.promptId === lastId) continue;
    lastId = info.p.promptId;
    const noteMidis = info.p.notes.map((n) => n.midi).sort((a, b) => a - b);
    const ans = [...(info.p.answer.midis || [])].sort((a, b) => a - b);
    if (info.p.answer.type !== 'rhythm' && JSON.stringify(noteMidis) !== JSON.stringify(ans)) bad.push(`prompt notes ${noteMidis} != answer ${ans}`);
    // staves: groups of 5 lines (sorted by y); staff name by order (grand: treble first)
    if (info.p.answer.type !== 'rhythm' && info.lineYs.length % 5 === 0) {
      const groups = []; for (let g = 0; g < info.lineYs.length; g += 5) groups.push(info.lineYs.slice(g, g + 5));
      const names = info.p.clef === 'grand' ? ['treble', 'bass'] : [info.p.clef];
      for (const h of info.heads) {
        const n = info.p.notes[h.i]; if (!n) continue;
        const gi = names.indexOf(n.staff); const grp = groups[gi]; if (!grp) { bad.push(`no staff ${n.staff}`); continue; }
        const sp = (grp[4] - grp[0]) / 4;
        const step = (grp[4] - h.y) / (sp / 2);
        const want = cur.staffStep(n.midi, n.staff, n.accidental);
        if (Math.abs(step - want) > 0.35) bad.push(`midi ${n.midi} (${n.staff}) drawn at step ${step.toFixed(2)} want ${want}`);
      }
    }
    if (info.p.answer.type !== 'rhythm' && info.heads.length !== info.p.notes.length) bad.push(`heads ${info.heads.length} != notes ${info.p.notes.length}`);
    checked++;
    for (const m of reqOf(info.p)) await page.evaluate((x) => window.__tutti.play(x), m);
  }
  ok(`render ${sid}: notes==answer midis (${checked} sampled)`, bad.length === 0 && checked > 0, bad.join(' ; '));
  ok(`render ${sid}: no errors`, page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
