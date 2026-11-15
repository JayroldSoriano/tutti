// Lesson UI screenshots (brief C): node tools/shoot-lessons.mjs [390|1280] [light|dark]
// Writes screens/lessons/*.png and exits 1 on any console error or page error.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSong, songEvents } from '../src/songs.js';
import { momentsOf } from '../src/songplay.js';
import { LESSONS } from '../src/lessons.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'screens/lessons');
mkdirSync(outDir, { recursive: true });
const base = 'file://' + resolve(root, 'dist/index.html');
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const sizes = process.argv[2] ? [+process.argv[2]] : [390, 1280];
const schemes = process.argv[3] ? [process.argv[3]] : ['light', 'dark'];
const only = process.argv[4] ? process.argv[4].split(',') : null;
let errors = 0;

async function newPage(width, scheme) {
  const height = width < 600 ? 844 : 800;
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: width < 600, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.errs = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  return { ctx, page };
}
const wait = (p, ms) => p.waitForTimeout(ms);
const lessonState = (p) => p.evaluate(() => window.__tutti.lesson && { idx: window.__tutti.lesson.stepIndex, type: window.__tutti.lesson.step && window.__tutti.lesson.step.type, id: window.__tutti.lesson.id });
async function finish(p, result) { await p.evaluate((r) => window.__tutti.lesson.finishStep(r || undefined), result || null); await wait(p, 420); }
async function toStep(p, pred, max = 30) {
  for (let k = 0; k < max; k++) {
    const st = await lessonState(p);
    if (!st) return null;
    if (pred(st)) return st;
    await finish(p);
  }
  return null;
}
async function setDone(p, ids, grade = 'pass') {
  await p.evaluate(([ids, grade]) => {
    const e = window.__tutti.engine;
    const ls = e.getLessons();
    for (const id of ids) ls.done[id] = { at: Date.now() - 86400000 * 2, grade, attempts: 1, acc: 0.9 };
    ls.cur = null; ls.lastDay = ''; ls.doneToday = 0; ls.lastGrade = '';
    e.skipPlacement && e.skipPlacement();
    e.setLessons(ls, { now: Date.now() });
    window.__tutti.ctx.save({ flush: true });
  }, [ids, grade]);
}
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash + '&debug'); await wait(p, 500); }
async function playExpected(p, n = 1) {
  for (let k = 0; k < n; k++) {
    const ex = await p.evaluate(() => (window.__tutti.lesson ? window.__tutti.lesson.expected() : []));
    for (const m of ex) await p.evaluate((x) => window.__tutti.play(x), m);
    await wait(p, 120);
  }
}

for (const width of sizes) for (const scheme of schemes) {
  const tag = `${width}-${scheme}`;
  const { ctx, page: p } = await newPage(width, scheme);
  const shot = async (name) => { if (only && !only.some((o) => name.startsWith(o))) return; await p.screenshot({ path: resolve(outDir, `${name}-${tag}.png`) }); };
  await p.goto(base + '#home&debug');
  await p.waitForSelector('.home');
  await wait(p, 300);
  await shot('home-first');

  // ---- Lesson 1, step by step
  await p.getByRole('button', { name: 'Start lesson 1' }).click();
  await p.waitForSelector('.lesson .step');
  await wait(p, 1800);
  const seen = new Set();
  for (let k = 0; k < 20; k++) {
    const st = await lessonState(p);
    if (!st || st.type === 'recap') break;
    const name = `step-L01-${String(st.idx + 1).padStart(2, '0')}-${st.type}`;
    if (st.type === 'guided' || st.type === 'name-it' || st.type === 'find-key') { await wait(p, 500); await playExpected(p, 1); await wait(p, 500); }
    if (st.type === 'drill') {
      await wait(p, 600); await playExpected(p, 1); await wait(p, 700);
      const ex = await p.evaluate(() => window.__tutti.lesson.expected());
      if (ex.length) { await p.evaluate((x) => window.__tutti.play(x), ex[0] + 2); await wait(p, 900); await shot('step-drill-reveal'); }
      await playExpected(p, 1); await wait(p, 500);
    }
    if (st.type === 'quiz') { await wait(p, 600); await playExpected(p, 2); await wait(p, 300); }
    if (st.type === 'concept' || st.type === 'tip') await wait(p, 3200);
    if (st.type === 'melody-wait') { await wait(p, 600); await playExpected(p, 5); await wait(p, 300); }
    if (st.type === 'demo') await wait(p, 2600);
    await shot(name);
    seen.add(st.type);
    if (st.type === 'quiz') { await finish(p, { n: 8, correct: 8, acc: 1, medianRatio: 0.7, missed: [] }); break; }
    await finish(p);
  }
  await wait(p, 700);
  await shot('recap-ace');
  // Home: next lesson available (ace)
  await p.getByRole('button', { name: 'Done for today' }).click();
  await wait(p, 500);
  await shot('home-after-ace');

  // ---- L02 with a pass -> done for today
  await go(p, 'lesson');
  await toStep(p, (s) => s.type === 'landmark-distance');
  await wait(p, 600);
  await shot('step-landmark-distance');
  await p.evaluate(() => { const b = document.querySelector('.ld-choices .chip-btn'); b && b.click(); });
  await wait(p, 300);
  await toStep(p, (s) => s.type === 'quiz');
  await finish(p, { n: 10, correct: 8, acc: 0.8, medianRatio: 1.2, missed: ['n:t:65', 'n:t:67'] });
  await wait(p, 700);
  await shot('recap-pass');
  await p.getByRole('button', { name: 'Done for today' }).click();
  await wait(p, 500);
  await shot('home-done-today');

  // ---- L03 started anyway, then failed -> repeat
  await p.getByRole('button', { name: /anyway/ }).click();
  await p.waitForSelector('.lesson .step');
  await toStep(p, (s) => s.type === 'flash');
  await wait(p, 400);
  await shot('step-flash');
  await wait(p, 1600);
  await shot('step-flash-covered');
  await toStep(p, (s) => s.idx >= 5);
  // close mid-lesson -> Home "Continue lesson"
  await p.getByRole('button', { name: 'Close lesson' }).click();
  await wait(p, 300);
  await shot('dialog-close');
  await p.getByRole('button', { name: 'Leave for now' }).click();
  await wait(p, 500);
  await shot('home-in-progress');
  await p.getByRole('button', { name: /Continue lesson/ }).click();
  await p.waitForSelector('.lesson .step');
  await toStep(p, (s) => s.type === 'quiz');
  await finish(p, { n: 10, correct: 5, acc: 0.5, medianRatio: 1.6, missed: ['iv:t:+3', 'n:t:62'] });
  await wait(p, 700);
  await shot('recap-repeat');
  await p.getByRole('button', { name: 'Later' }).click();
  await wait(p, 500);
  await shot('home-review-pending');
  await go(p, 'lessons');
  await shot('lessons-path');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(p, 200);
  await shot('lessons-songs');
  await p.evaluate(() => window.scrollTo(0, 0));

  // ---- other step types through replays of later lessons
  await setDone(p, LESSONS.slice(0, 31).map((l) => l.id), 'pass');
  const visit = [
    ['L04', 'melody-tempo'], ['L11', 'mnemonic'], ['L26', 'progression'], ['L07', 'name-it'], ['L19', 'find-key'],
    ['L17', 'guided'], ['L05', 'tip'],
  ];
  for (const [lid, type] of visit) {
    await go(p, 'lesson/' + lid);
    await p.waitForSelector('.lesson .step');
    const st = await toStep(p, (s) => s.type === type);
    if (!st) { console.log('could not reach', lid, type); continue; }
    await wait(p, type === 'mnemonic' ? 4800 : 900);
    if (type === 'progression' || type === 'name-it' || type === 'guided') { await playExpected(p, 1); await wait(p, 400); }
    if (type === 'name-it') { await p.evaluate(() => { const h = window.__tutti.lesson.handle(); h && h.pickHand && h.pickHand(window.__tutti.lesson.step.targets[0].staff === 'bass' ? 'lh' : 'rh'); }); await wait(p, 200); }
    await shot(`step-${lid}-${type}`);
    if (type === 'melody-tempo') {
      // run the count-in with a few notes played roughly in time
      await p.getByRole('button', { name: 'Start the count-in' }).click();
      const song = getSong('ode-to-joy');
      const ev = songEvents(song, { hands: 'rh' });
      const beat = 60000 / 72;
      const t0 = Date.now() + 250 + 4 * beat;
      for (const e of ev.slice(0, 12)) { const d = t0 + e.t * beat - Date.now(); if (d > 0) await wait(p, d); await p.evaluate((x) => window.__tutti.play(x), e.midis[0]); }
      await wait(p, 300);
      await shot('step-tempo-running');
      await p.waitForSelector('.tempo-result', { timeout: 60000 });
      await wait(p, 300);
      await shot('tempo-result');
    }
    await p.getByRole('button', { name: 'Close lesson' }).click();
    await wait(p, 200);
    const leave = p.getByRole('button', { name: 'Leave for now' });
    if (await leave.count()) await leave.click();
    await wait(p, 300);
  }

  // ---- the six scores in wait mode mid-song (song screen)
  for (const id of ['hot-cross-buns', 'amazing-grace', 'greensleeves', 'mary-chords', 'old-hundredth-duet', 'middle-c-meeting']) {
    await go(p, 'song/' + id);
    await p.waitForSelector('.score');
    await wait(p, 400);
    const ms = momentsOf(songEvents(getSong(id), { hands: 'both' }));
    const n = Math.min(ms.length - 1, Math.round(ms.length * 0.45));
    for (const m of ms.slice(0, n)) { for (const x of m.midis) await p.evaluate((v) => window.__tutti.play(v), x); }
    await wait(p, 700);
    await shot(`score-${id}`);
  }
  await go(p, 'progress');
  await shot('progress');

  if (p.errs.length) { errors += p.errs.length; console.log(tag, p.errs.slice(0, 8)); }
  else console.log(tag, 'ok, no console errors');
  await ctx.close();
}
await browser.close();
process.exit(errors ? 1 : 0);
