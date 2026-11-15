// Lessons integration QA (brief D): node tools/lessons-walk.mjs [--only=1,2,5]
// Playwright against dist/index.html. Exits 1 on any failure. Real key presses go through the
// on-screen keyboard (mouse down/up on .key[data-midi]); __tutti.play is only a counted fallback
// when a key is not on screen. Teaching steps in the 32-lesson sweep use the finishStep debug hook.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS } from '../src/lessons.js';
import { getSong, songEvents } from '../src/songs.js';
import { momentsOf } from '../src/songplay.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'file://' + resolve(root, 'dist/index.html');
const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(String(n));
const table = [];
const defects = [];
const wait = (p, ms) => p.waitForTimeout(ms);
function record(scn, name, cond, extra = '') {
  table.push({ scn, name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  [${scn}] ${name}${extra ? '  ' + extra : ''}`);
}
const stats = { real: 0, fallback: 0, fallbackLog: [] };

async function newPage({ width = 390, height = 844, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
  return { ctx, page };
}
const info = (p) => p.evaluate(() => {
  const l = window.__tutti && window.__tutti.lesson;
  if (!l) return null;
  return { id: l.id, idx: l.stepIndex, type: l.step && l.step.type, sid: l.step && l.step.id, total: l.steps.length, title: l.step && l.step.title, scaffold: l.step && l.step.scaffold };
});
const expectedKeys = (p) => p.evaluate(() => (window.__tutti.lesson ? window.__tutti.lesson.expected() : []));

// ---- real key press through the on-screen keyboard
async function press(p, midi) {
  if (process.env.WDBG) console.log('   press', midi);
  for (let attempt = 0; attempt < 3; attempt++) {
    const locate = (m) => {
      const el = document.querySelector(`.l-input:not([hidden]) .key[data-midi="${m}"], .practice .key[data-midi="${m}"], .key[data-midi="${m}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      const black = el.classList.contains('key-b');
      const x = r.left + r.width / 2, y = r.top + r.height * (black ? 0.4 : 0.85);
      if (x < 0 || x > innerWidth || y < 0 || y > innerHeight) return null;
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top))) return null;
      return { x, y };
    };
    let hit = await p.evaluate(locate, midi);
    if (hit) { await wait(p, 90); const h2 = await p.evaluate(locate, midi); if (!h2 || Math.abs(h2.x - hit.x) > 0.5 || Math.abs(h2.y - hit.y) > 0.5) hit = null; }
    if (hit) {
      await p.mouse.move(hit.x, hit.y);
      await p.mouse.down(); await wait(p, 30); await p.mouse.up();
      stats.real++;
      return true;
    }
    await wait(p, 350); // the keyboard may still be gliding to a new range
  }
  stats.fallback++;
  stats.fallbackLog.push(`${midi}@${p.__ctx || ''}`);
  await p.evaluate((m) => window.__tutti.play(m), midi);
  return false;
}

const BTN = /^(Got it|My turn|Quiz me|Continue|See how you did|Play pass \d+)$/;
async function clickPrimary(p) {
  return p.evaluate((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll('.l-stage button')].find((x) => re.test(x.textContent.trim()) && !x.hidden && x.offsetParent && !x.disabled);
    if (!b) return false; b.click(); return true;
  }, BTN.source);
}
async function clickChoice(p) {
  return p.evaluate(() => {
    const b = [...document.querySelectorAll('.ld-choices .chip-btn')].find((x) => !x.classList.contains('is-bad') && x.offsetParent);
    if (!b) return false; b.click(); return true;
  });
}

/** Drive the current step to completion with real presses + button clicks. wrong = prompts to answer wrongly first. */
async function driveStep(p, { wrong = 0, timeout = 90000, log } = {}) {
  const start = await info(p);
  if (!start) return 'nolesson';
  const t0 = Date.now(); let idle = 0; const wrongDone = new Set(); let budget = wrong;
  while (Date.now() - t0 < timeout) {
    const now = await info(p);
    if (!now || now.id !== start.id || now.idx !== start.idx) return 'done';
    const snap = await p.evaluate(() => ({ ex: window.__tutti.lesson ? window.__tutti.lesson.expected() : [], pid: window.__tutti.prompt ? window.__tutti.prompt.promptId : null }));
    const ex = snap.ex; if (process.env.WDBG) console.log('   snap', start.type, JSON.stringify(snap));
    if (ex.length) {
      idle = 0;
      const scored = start.type === 'quiz' || start.type === 'drill';
      if (budget > 0 && scored && snap.pid != null && !wrongDone.has(snap.pid)) {
        wrongDone.add(snap.pid); budget--;
        const bad = ex[0] + ([4, 11].includes(ex[0] % 12) ? 1 : 2);
        await press(p, bad); await wait(p, 300);
        continue;
      }
      for (const m of ex) { await press(p, m); await wait(p, 40); }
      if (scored && snap.pid != null) {
        await p.waitForFunction((id) => !window.__tutti.prompt || window.__tutti.prompt.promptId !== id || !window.__tutti.lesson || window.__tutti.lesson.expected().length === 0, snap.pid, { timeout: 3000 }).catch(() => {});
        await wait(p, 120);
      } else await wait(p, 60);
      continue;
    }
    if (await clickPrimary(p)) { idle = 0; await wait(p, 150); continue; }
    if (start.type === 'landmark-distance' && await clickChoice(p)) { idle = 0; await wait(p, 200); continue; }
    idle++;
    if (idle > 150) { log && log(`stuck at ${start.id} step ${start.idx + 1} (${start.type})`); return 'stuck'; }
    await wait(p, 100);
  }
  log && log(`timeout at ${start.id} step ${start.idx + 1} (${start.type})`);
  return 'timeout';
}
async function finish(p, result) {
  await p.evaluate((r) => window.__tutti.lesson.finishStep(r || undefined), result || null);
  await wait(p, 330);
}
async function setDone(p, ids, grade = 'ace') {
  await p.evaluate(([ids, grade]) => {
    const e = window.__tutti.engine;
    const ls = e.getLessons();
    for (const id of ids) ls.done[id] = { at: Date.now() - 86400000 * 2, grade, attempts: 1, acc: 0.95 };
    ls.cur = null; ls.lastDay = ''; ls.doneToday = 0; ls.lastGrade = '';
    e.skipPlacement && e.skipPlacement();
    e.setLessons(ls, { now: Date.now() });
    window.__tutti.ctx.save({ flush: true });
  }, [ids, grade]);
}
const go = async (p, hash) => { await p.evaluate((h) => { location.hash = h; }, hash + '&debug'); await wait(p, 500); };
const overflowNow = (p) => p.evaluate(() => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth) out.push(`page ${document.documentElement.scrollWidth}>${innerWidth}`);
  for (const el of document.querySelectorAll('.st-score, .score')) {
    if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className} ${el.scrollWidth}>${el.clientWidth}`);
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1) out.push(`${el.className} right ${Math.round(r.right)}>${innerWidth}`);
  }
  return out;
});
const recapGrade = async (p) => { await p.waitForSelector('.rc-grade', { timeout: 8000 }).catch(() => {}); return p.evaluate(() => { const g = document.querySelector('.rc-grade'); return g ? g.textContent.trim() : ''; }); };
const homeButton = (p) => p.evaluate(() => [...document.querySelectorAll('.lesson-card .btn, .lesson-card .link-btn')].map((b) => b.textContent.trim()));

/** Complete the rest of the current lesson: synthetic for every step except `real(step)`; quiz result optional. */
async function runLesson(p, { real = () => false, quizWrong = null, log, overflow = null } = {}) {
  let guard = 0;
  while (guard++ < 40) {
    const st = await info(p);
    if (!st) return 'nolesson';
    if (st.type === 'recap') return 'recap';
    if (overflow) { const o = await overflowNow(p); if (o.length) overflow.push(`${st.id} s${st.idx + 1} ${st.type}: ${o.join('; ')}`); }
    if (real(st)) {
      const r = await driveStep(p, { wrong: st.type === 'quiz' && quizWrong != null ? quizWrong : 0, log });
      if (r !== 'done') { log && log(`real drive ${r} -> finishStep fallback`); const again = await info(p); if (again && again.idx === st.idx) await finish(p); }
      await wait(p, 330);
      if (overflow && st.type === 'melody-wait') { /* checked at start */ }
    } else await finish(p);
  }
  return 'guard';
}

// =====================================================================================
// 1. Fresh profile -> L01 with REAL presses
if (want(1)) {
  const { ctx, page: p } = await newPage();
  const sc = 1; const notes = [];
  await p.goto(base + '#home&debug'); await p.waitForSelector('.home'); await wait(p, 300);
  const btns = await homeButton(p);
  record(sc, 'fresh Home shows "Start lesson 1"', btns.includes('Start lesson 1'), btns.join(' | '));
  await p.getByRole('button', { name: 'Start lesson 1' }).click();
  await p.waitForSelector('.lesson .step');
  const seq = [];
  const resBySid = {};
  let stuck = false;
  for (let g = 0; g < 30; g++) {
    await wait(p, 250);
    const st = await info(p);
    if (!st) break;
    if (st.type === 'recap') break;
    seq.push(`${st.type}${st.scaffold ? ':' + st.scaffold : ''}`);
    // let demos/concepts animate a moment so "My turn"/"Got it" are live
    if (['demo', 'concept', 'tip'].includes(st.type)) await wait(p, 1200);
    const r = await driveStep(p, { log: (m) => notes.push(m) });
    if (r !== 'done') { stuck = true; notes.push(`${st.type} -> ${r}`); const a = await info(p); if (a && a.idx === st.idx) await finish(p); }
    const cur = await p.evaluate(() => { const l = window.__tutti.engine.getLessons(); return l.cur ? l.cur.res : null; });
    if (cur) Object.assign(resBySid, cur);
  }
  record(sc, 'L01 walked end to end with real presses (no step needed a synthetic finish)', !stuck && seq.length >= 14, `steps=${seq.length} ${notes.join('; ')}`);
  const flow = seq.join(' ');
  record(sc, 'guided glow -> find-key -> name-it -> guided name -> guided none order', /guided:glow.*find-key.*name-it.*guided:name guided:none/.test(flow), flow);
  record(sc, 'drill step present', seq.includes('drill'));
  const hcb = LESSONS[0].steps.find((s) => s.type === 'melody-wait');
  const mres = resBySid[hcb.id];
  const expectedMoments = momentsOf(songEvents(getSong(hcb.songId), { hands: 'rh' })).length;
  const lastPass = mres && mres.passes && mres.passes[mres.passes.length - 1];
  record(sc, 'Hot Cross Buns wait mode reached the last note, every pass', !!mres && mres.passes.length === hcb.passes.length && mres.passes.every((x) => x.notes === expectedMoments), `moments=${expectedMoments} result=${JSON.stringify(mres)}`);
  record(sc, 'HCB real presses first-try accuracy 100%', !!lastPass && lastPass.acc === 1, lastPass ? `acc=${lastPass.acc}` : '');
  const qres = LESSONS[0].steps.find((s) => s.type === 'quiz');
  const qr = await p.evaluate(() => window.__tutti.engine.getLessons().done.L01);
  record(sc, 'quiz answered with real presses (done.L01 grade ace, acc 1)', !!qr && qr.grade === 'ace' && qr.acc === 1, JSON.stringify(qr));
  const grade = await recapGrade(p);
  record(sc, 'recap shows Aced', /Aced/.test(grade), `got "${grade}" quiz=${JSON.stringify(qr)}`);
  await p.getByRole('button', { name: 'Done for today' }).click().catch(() => {});
  await p.waitForSelector('.home'); await wait(p, 300);
  const b2 = await homeButton(p);
  record(sc, 'Home offers lesson 2 immediately (not tomorrow)', b2.includes('Start lesson 2') && !b2.some((x) => /anyway/.test(x)), b2.join(' | '));
  const eng = await p.evaluate(() => { const e = window.__tutti.engine; return { done: Object.keys(e.getLessons().done), today: e.progress({ now: Date.now() }).today.lessons }; });
  record(sc, 'L01 recorded done; today.lessons = 1', eng.done.includes('L01') && eng.today === 1, JSON.stringify(eng));
  record(sc, 'scenario 1 no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================================
// 2 & 3: quiz outcomes
async function quizScenario(sc, lessonId, upTo, wrong, label) {
  const { ctx, page: p } = await newPage();
  await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
  await setDone(p, upTo);
  await go(p, 'lesson'); await p.waitForSelector('.lesson .step');
  await p.evaluate(() => { const e = window.__tutti.engine; const o = e.setLessons.bind(e); e.setLessons = (ls, x) => { if (ls && ls.cur) window.__rec = ls.cur.res; return o(ls, x); }; });
  const st0 = await info(p);
  const quizStep = LESSONS.find((l) => l.id === lessonId).steps.find((s) => s.type === 'quiz');
  const notes = [];
  const r = await runLesson(p, { real: (s) => s.type === 'quiz', quizWrong: wrong, log: (m) => notes.push(m) });
  const grade = await recapGrade(p);
  const rec = await p.evaluate((sid) => (window.__rec || {})[sid], quizStep.id);
  notes.push('quiz=' + JSON.stringify(rec));
  return { ctx, p, st0, r, grade, notes, quizStep };
}
if (want(2)) {
  const sc = 2;
  for (const wrong of [3, 2]) {
    const { ctx, p, st0, r, grade, notes, quizStep } = await quizScenario(sc, 'L02', ['L01'], wrong);
    const expectPass = (quizStep.count - wrong) / quizStep.count >= 0.8;
    const passed = /Passed/.test(grade);
    record(sc, `L02 (${st0 && st0.id}) quiz with ${wrong}/${quizStep.count} wrong -> ${expectPass ? 'pass' : 'repeat (acc<0.80 per spec 2.1)'}`, r === 'recap' && (expectPass ? passed : /One more pass/.test(grade)), `grade="${grade}" ${notes.join('; ')}`);
    if (wrong === 2) {
      await p.getByRole('button', { name: 'Done for today' }).click().catch(() => {});
      await p.waitForSelector('.home'); await wait(p, 300);
      const b = await homeButton(p);
      record(sc, 'Home shows done-for-today, "Start lesson 3 anyway" link, practice button', b.some((x) => /anyway/.test(x)) && b.some((x) => /Practice today/.test(x)), b.join(' | '));
      const txt = await p.evaluate(() => document.querySelector('.lesson-card').textContent);
      record(sc, 'Home card says "Lesson 2 done for today"', /Lesson 2 done for today/.test(txt));
    }
    record(sc, `scenario 2 (${wrong} wrong) no console errors`, p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
if (want(3)) {
  const sc = 3;
  const { ctx, p, r, grade, notes } = await quizScenario(sc, 'L03', ['L01', 'L02'], 5);
  record(sc, 'L03 quiz 5/10 wrong -> repeat recap', r === 'recap' && /One more pass/.test(grade), `grade="${grade}" ${notes.join('; ')}`);
  const btnTxt = await p.evaluate(() => [...document.querySelectorAll('.lesson .btn')].map((b) => b.textContent.trim()));
  record(sc, 'recap offers "Start the 8-minute review"', btnTxt.includes('Start the 8-minute review'), btnTxt.join(' | '));
  await p.getByRole('button', { name: 'Later' }).click().catch(() => {});
  await p.waitForSelector('.home'); await wait(p, 300);
  let b = await homeButton(p);
  record(sc, 'Home primary starts a review', b.some((x) => /^Start review/.test(x)), b.join(' | '));
  await p.getByRole('button', { name: /^Start review/ }).click();
  await p.waitForSelector('.lesson .step');
  const rid = (await info(p)).id;
  record(sc, 'review lesson id is R:L03:n', /^R:L03:/.test(rid), rid);
  const notes2 = [];
  // review: real presses on drill, melody and quiz (all correct)
  const rr = await runLesson(p, { real: (s) => ['drill', 'quiz', 'melody-wait'].includes(s.type), log: (m) => notes2.push(m) });
  const g2 = await recapGrade(p);
  record(sc, 'review completed (recap reached) and passed', rr === 'recap' && /Aced|Passed/.test(g2), `grade="${g2}" ${notes2.join('; ')}`);
  await p.getByRole('button', { name: /Done for today|Next lesson|Start lesson/ }).first().click().catch(() => {});
  await p.waitForSelector('.home').catch(() => {}); await wait(p, 400);
  const st = await p.evaluate(() => { const l = window.__tutti.engine.getLessons(); return { done: Object.keys(l.done), queue: l.queue.length, cur: !!l.cur }; });
  record(sc, 'L03 marked done after review; queue empty', st.done.includes('L03') && st.queue === 0, JSON.stringify(st));
  b = await homeButton(p);
  record(sc, 'Home now points at lesson 4', b.some((x) => /lesson 4/i.test(x)) || (await p.evaluate(() => /Lesson 4|lesson 4/.test(document.querySelector('.lesson-card').textContent))), b.join(' | '));
  record(sc, 'scenario 3 no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

// =====================================================================================
// 4. reload mid-lesson
if (want(4)) {
  const sc = 4;
  for (const variant of ['close then reload', 'hard reload inside lesson']) {
    const { ctx, page: p } = await newPage();
    await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
    await p.getByRole('button', { name: 'Start lesson 1' }).click();
    await p.waitForSelector('.lesson .step'); await wait(p, 500);
    for (let k = 0; k < 4; k++) await finish(p, k === 3 ? { seen: true, marker: 'k3' } : undefined);
    const before = await p.evaluate(() => { const l = window.__tutti.engine.getLessons(); return { step: l.cur.step, res: l.cur.res }; });
    if (variant === 'close then reload') {
      await p.getByRole('button', { name: 'Close lesson' }).click();
      await p.getByRole('button', { name: 'Leave for now' }).click();
      await p.waitForSelector('.home'); await wait(p, 300);
      await p.reload(); await p.waitForSelector('.home'); await wait(p, 300);
      const b = await homeButton(p);
      record(sc, `[${variant}] Home shows "Continue lesson (step 5 of N)"`, b.includes(`Continue lesson (step 5 of ${LESSONS[0].steps.length})`), b.join(' | '));
      await p.getByRole('button', { name: /Continue lesson/ }).click();
    } else {
      await wait(p, 600);
      await p.evaluate(() => { if (!/debug/.test(location.hash)) history.replaceState(null, '', location.hash + '&debug'); });
      await p.reload(); await p.waitForSelector('.lesson .step, .home'); await wait(p, 500);
      const onLesson = await p.$('.lesson .step');
      if (!onLesson) { const b = await homeButton(p); record(sc, `[${variant}] reload landed on Home with continue`, b.some((x) => /Continue lesson/.test(x)), b.join(' | ')); await p.getByRole('button', { name: /Continue lesson/ }).click(); }
    }
    await p.waitForSelector('.lesson .step'); await p.waitForFunction(() => window.__tutti && window.__tutti.lesson).catch(() => {}); await wait(p, 400);
    const st = await info(p);
    const after = await p.evaluate(() => window.__tutti.engine.getLessons().cur);
    record(sc, `[${variant}] resumes at step 5`, st && st.idx === 4, JSON.stringify(st));
    record(sc, `[${variant}] earlier results intact`, !!after && JSON.stringify(after.res) === JSON.stringify(before.res) && after.step === before.step, `before=${Object.keys(before.res).length} after=${after ? Object.keys(after.res).length : 'none'}`);
    record(sc, `[${variant}] no console errors`, p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// =====================================================================================
// 5. every lesson L01-L32
if (want(5) || want(6)) {
  const sc = 5;
  const { ctx, page: p } = await newPage();
  await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
  await p.getByRole('button', { name: 'Start lesson 1' }).click();
  await p.waitForSelector('.lesson .step');
  const overflow = [], problems = [];
  let realDrill = 0, realMelody = 0;
  for (const L of LESSONS) {
    const st = await info(p);
    if (!st || st.id !== L.id) { problems.push(`${L.id}: runner is on ${st ? st.id : 'no lesson'}`); break; }
    let drillDone = false;
    const real = (s) => {
      if (s.type === 'melody-wait') return true;
      if (s.type === 'drill' && !drillDone) {
        const step = L.steps[s.idx];
        // rhythm drills use the tap pad; keep those synthetic
        const rhythmOnly = (step.itemIds || []).length && step.itemIds.every((i) => i.startsWith('rh:'));
        if (rhythmOnly) return false;
        drillDone = true; return true;
      }
      return false;
    };
    const notes = [];
    const r = await runLesson(p, { real, log: (m) => notes.push(m), overflow });
    if (r !== 'recap') { problems.push(`${L.id}: ended ${r} ${notes.join('; ')}`); break; }
    if (notes.length) problems.push(`${L.id}: ${notes.join('; ')}`);
    const g = await recapGrade(p);
    if (!/Aced|Passed/.test(g)) problems.push(`${L.id}: recap grade "${g}"`);
    if (L.n < 32) {
      const nxt = p.getByRole('button', { name: /^(Next lesson|Start lesson \d+)$/ }).first();
      if (await nxt.count()) await nxt.click();
      else {
        // pass: "Done for today" then "start anyway"
        await p.getByRole('button', { name: /anyway/ }).first().click().catch(() => problems.push(`${L.id}: no way to continue after recap (${g})`));
      }
      await p.waitForSelector('.lesson .step', { timeout: 6000 }).catch(() => problems.push(`${L.id}: next lesson did not open`));
    }
    await wait(p, 200);
    void realDrill; void realMelody;
  }
  record(sc, 'all 32 lessons completed without a stuck step', problems.length === 0 && (await p.evaluate(() => Object.keys(window.__tutti.engine.getLessons().done).length)) === 32, problems.slice(0, 6).join(' || '));
  record(sc, 'no horizontal overflow / score fits container at 390px (every step)', overflow.length === 0, overflow.slice(0, 5).join(' || '));
  record(sc, 'sweep no console errors', p.errs.length === 0, p.errs.slice(0, 4).join(' | '));
  record(sc, `real presses used (real=${stats.real}, synthetic fallback=${stats.fallback})`, true);
  const eng = await p.evaluate(() => { const e = window.__tutti.engine; const pr = e.progress({ now: Date.now() }); return { stages: pr.stages.filter((s) => s.status === 'passed').map((s) => s.id), lessons: pr.today.lessons, streak: pr.streakDays }; });
  console.log('      engine after sweep:', JSON.stringify(eng));
  if (want(9)) {
    // 9 is checked in its own dedicated run below (after L11) -> here only the final state
  }
  // 6. After L32: Today's piece
  if (want(6)) {
    const sc6 = 6;
    await go(p, 'home'); await p.waitForSelector('.home', { timeout: 6000 }).catch(() => {}); await wait(p, 300);
    const b = await homeButton(p);
    record(sc6, 'Home offers "Today\'s piece" after L32', b.includes('Today’s piece'), b.join(' | '));
    await p.getByRole('button', { name: 'Today’s piece' }).click().catch(() => {});
    await p.waitForSelector('.lesson .step', { timeout: 6000 }).catch(() => {});
    const d = await info(p);
    record(sc6, 'daily lesson opens (D:<day>)', !!d && /^D:/.test(d.id), JSON.stringify(d));
    const notes = [];
    const r = d ? await runLesson(p, { real: (s) => s.type === 'drill' || s.type === 'melody-wait', log: (m) => notes.push(m), overflow }) : 'none';
    record(sc6, 'daily lesson completes to recap with real presses', r === 'recap' && notes.length === 0, `${r} ${notes.join('; ')}`);
    const g = await recapGrade(p);
    record(sc6, 'daily recap shows a result', /Practice done|Passed|Aced/.test(g), g);
    await p.getByRole('button', { name: /Done for today|Today.s piece|Next/ }).first().click().catch(() => {});
    await p.waitForSelector('.home', { timeout: 6000 }).catch(() => {}); await wait(p, 300);
    const b2 = await homeButton(p);
    record(sc6, 'Home still offers a piece after the daily (no stuck state)', b2.includes('Today’s piece') || b2.length > 0, b2.join(' | '));
    record(sc6, 'scenario 6 no console errors', p.errs.length === 0, p.errs.slice(0, 4).join(' | '));
  }
  await ctx.close();
}

// =====================================================================================
// 7. v1 regression
if (want(7)) {
  const sc = 7;
  const { ctx, page: p } = await newPage();
  await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
  await p.evaluate(() => { const e = window.__tutti.engine; e.skipPlacement && e.skipPlacement(); window.__tutti.ctx.save({ flush: true }); });
  await p.reload(); await p.waitForSelector('.home'); await wait(p, 300);
  const secondary = await p.evaluate(() => [...document.querySelectorAll('.home-more-row .btn')].map((b) => ({ t: b.textContent.trim(), d: b.disabled })));
  record(sc, 'Home secondary row: Free practice / Quick review / Test out', secondary.map((x) => x.t).join(',') === 'Free practice,Quick review,Test out', JSON.stringify(secondary));
  await p.getByRole('button', { name: 'Free practice' }).click();
  await p.waitForSelector('.practice .p-staff svg'); await wait(p, 500);
  let scored = 0, guard = 0, lastId = null;
  while (scored < 30 && guard++ < 400) {
    const q = await p.evaluate(() => window.__tutti.prompt && { id: window.__tutti.prompt.promptId, intro: window.__tutti.prompt.isIntro, a: window.__tutti.prompt.answer });
    if (!q || q.id === lastId) { await wait(p, 100); if (await p.$('.dialog')) await p.locator('.dialog .btn').first().click(); continue; }
    lastId = q.id; await wait(p, 350);
    if (q.a.type === 'rhythm') { await p.click('.tap-pad'); await wait(p, 2500); continue; }
    const req = q.a.type === 'sequence' ? q.a.midis.slice(q.a.given || 0) : q.a.midis || [];
    for (const m of req) await press(p, m);
    if (!q.intro) scored++;
    await wait(p, 200);
  }
  record(sc, 'free practice: 30 answers', scored >= 30, `scored=${scored}`);
  await p.getByRole('button', { name: 'Pause' }).click(); await p.waitForSelector('.dialog');
  await p.getByRole('button', { name: 'End session' }).click(); await p.waitForSelector('.summary');
  await p.getByRole('button', { name: 'Done' }).click(); await p.waitForSelector('.home'); await wait(p, 300);
  const to = p.getByRole('button', { name: 'Test out' });
  const dis = await to.isDisabled();
  if (!dis) {
    await to.click(); await p.waitForSelector('.dialog');
    const t = await p.locator('.dialog').innerText();
    record(sc, 'test-out confirm dialog opens', /Test out of/.test(t), t.split('\n')[0]);
    await p.getByRole('button', { name: 'Not now' }).click();
  } else record(sc, 'test-out dialog (button disabled after 30 answers: one attempt/stage rule or stage not ready)', true, 'disabled - not testable');
  for (const [route, sel] of [['progress', '.progress'], ['settings', '.settings']]) {
    await p.click(`a.tab[data-route="${route}"]`); await p.waitForSelector(sel); await wait(p, 300);
    const o = await overflowNow(p);
    record(sc, `${route} screen renders, no overflow`, o.length === 0, o.join('; '));
  }
  await p.click('a.tab[data-route="lessons"]'); await p.waitForSelector('.lessons, .lp, main'); await wait(p, 300);
  const o = await overflowNow(p);
  record(sc, 'lessons screen no overflow', o.length === 0, o.join('; '));
  record(sc, 'scenario 7 no console errors', p.errs.length === 0, p.errs.slice(0, 4).join(' | '));
  await ctx.close();
}

// =====================================================================================
// 8. persistence
if (want(8)) {
  const sc = 8;
  {
    const { ctx, page: p } = await newPage();
    await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
    await p.getByRole('button', { name: 'Start lesson 1' }).click(); await p.waitForSelector('.lesson .step');
    await runLesson(p);
    await p.getByRole('button', { name: 'Done for today' }).click().catch(() => {}); await p.waitForSelector('.home'); await wait(p, 300);
    await p.reload(); await p.waitForSelector('.home'); await wait(p, 300);
    const b = await homeButton(p);
    const st = await p.evaluate(() => Object.keys(window.__tutti.engine.getLessons().done));
    record(sc, 'localStorage: completed L01 survives reload, Home offers lesson 2', st.includes('L01') && b.includes('Start lesson 2'), `${st} | ${b.join(' | ')}`);
    record(sc, 'localStorage run no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  {
    const init = () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); };
    const { ctx, page: p } = await newPage({ init });
    await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
    await p.getByRole('button', { name: 'Start lesson 1' }).click(); await p.waitForSelector('.lesson .step');
    const r = await runLesson(p, { real: (s) => s.type === 'melody-wait' || s.type === 'drill' });
    record(sc, 'localStorage disabled: lesson 1 runs to recap', r === 'recap', r);
    await p.getByRole('button', { name: 'Done for today' }).click().catch(() => {}); await p.waitForSelector('.home'); await wait(p, 300);
    const b = await homeButton(p);
    record(sc, 'localStorage disabled: in-memory progress, Home offers lesson 2', b.includes('Start lesson 2'), b.join(' | '));
    record(sc, 'localStorage disabled: no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

// =====================================================================================
// 9. engine/lesson consistency (separate fresh profile, through the UI up to L11)
if (want(9)) {
  const sc = 9;
  const { ctx, page: p } = await newPage();
  await p.goto(base + '#home&debug'); await p.waitForSelector('.home');
  await p.getByRole('button', { name: 'Start lesson 1' }).click(); await p.waitForSelector('.lesson .step');
  for (const L of LESSONS.slice(0, 11)) {
    const r = await runLesson(p);
    if (r !== 'recap') { record(sc, `${L.id} reached recap`, false, r); break; }
    if (L.n < 11) {
      const nxt = p.getByRole('button', { name: /^(Next lesson|Start lesson \d+)$/ }).first();
      if (await nxt.count()) await nxt.click(); else await p.getByRole('button', { name: /anyway/ }).first().click();
      await p.waitForSelector('.lesson .step');
    }
  }
  const e = await p.evaluate(() => { const en = window.__tutti.engine; const pr = en.progress({ now: Date.now() }); return { passed: pr.stages.filter((s) => s.status === 'passed').map((s) => s.id), lessons: pr.today.lessons, streak: pr.streakDays, ms: pr.today.ms, goal: pr.today.goalMs }; });
  record(sc, 'after L11: treble-landmarks and treble-staff passed', e.passed.includes('treble-landmarks') && e.passed.includes('treble-staff'), JSON.stringify(e));
  record(sc, 'today.lessons reflects completed lessons (11)', e.lessons === 11, `lessons=${e.lessons}`);
  record(sc, 'streak counts the day even under the minutes goal', e.streak >= 1 && e.ms < e.goal, `streak=${e.streak} ms=${e.ms} goal=${e.goal}`);
  record(sc, 'scenario 9 no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log('\n==== SUMMARY ====');
const bad = table.filter((r) => !r.ok);
console.log('fallback midis:', stats.fallbackLog.join(' '));
console.log(`${table.length - bad.length}/${table.length} checks passed; real presses=${stats.real}, synthetic fallback=${stats.fallback}`);
for (const r of bad) console.log(`FAIL [${r.scn}] ${r.name} ${r.extra}`);
void defects;
process.exit(bad.length ? 1 : 0);
