#!/usr/bin/env node
/* Chart Detective: end-to-end player in headless Chrome.
 *
 * Opens the page at ?stage=1&seed=3, so every case is known in advance: it
 * loads the game's pure logic module (games/chart-detective/charts.js) in
 * Node and computes the same cases the page will. It then plays:
 *   case 1 (stage 1, seed 3): one wrong tap while collecting, then the first
 *          question wrong twice (the hint, then the worked answer and Next),
 *          the rest right; Case closed with Next stage hidden; Next case;
 *   case 2 (stage 1, seed 4): everything right first time; Next stage;
 *   cases 3 to 6 (stages 2 to 5, seeds 5 to 8): everything right first time,
 *          Next stage each time; after stage 5 Next stage is hidden;
 *   then All cases returns to the start screen.
 * It also presses Say it again, and checks the page's case equals Node's.
 *
 * Run from the repo root (desktop, over file://):
 *   node docs/e2e/chart-detective.e2e.cjs
 *
 * Env (all optional):
 *   PHONE=1      360 x 740, isMobile, hasTouch; plays by taps on the buttons
 *   CALM=1       emulates prefers-reduced-motion: reduce (desktop, keyboard)
 *   URL=...      page URL, e.g. https://playitmyway.com/games/chart-detective/
 *                (default: the repo's file:// path to games/chart-detective/index.html)
 *   ALLOW=a,b    request-URL prefixes allowed besides the page's own origin, file:,
 *                data: and blob: (default https://playitmyway.com/); against the live
 *                site use ALLOW=https://playitmyway.com/,https://static.cloudflareinsights.com/
 *   SHOTS=dir    screenshot folder (collecting, the worked answer, case closed, any failure)
 *   ROOT=dir     repo root for requiring charts.js (default: two folders up from here)
 *   PUPPETEER=   path to puppeteer-core (default %TEMP%\pimw-puppeteer\node_modules\puppeteer-core)
 *
 * Desktop, PHONE=1 and CALM=1 are three sequential runs; never run more than two
 * headless Chromes at once.
 *
 * Fails (exit 1) on any pageerror, console error, request outside the allowed
 * list, speech through a non-local voice, anything left in localStorage,
 * sessionStorage or document.cookie, or any assertion below. Over file:// the
 * one console error ignored is Chrome's complaint about the site-wide
 * <link rel="manifest" href="/manifest.json">, which resolves to file:///C:/manifest.json.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');

const ROOT = process.env.ROOT || path.resolve(__dirname, '..', '..');
const PUPPETEER = process.env.PUPPETEER || 'C:/Users/shrik/AppData/Local/Temp/pimw-puppeteer/node_modules/puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PHONE = !!process.env.PHONE;
const CALM = !!process.env.CALM;
const SHOTS = process.env.SHOTS || '';
const FAIL_SHOTS = SHOTS || path.join(os.tmpdir(), 'pimw-chart-detective-e2e');
const ALLOW = (process.env.ALLOW || 'https://playitmyway.com/').split(',').map((s) => s.trim()).filter(Boolean);
const URL_BASE = process.env.URL || pathToFileURL(path.join(ROOT, 'games', 'chart-detective', 'index.html')).href;
const TAG = PHONE ? 'phone' : CALM ? 'calm' : 'desktop';
const SEED = 3;
const QUICK = 8000;      // synchronous DOM changes after a key or tap
const SLOW = 20000;      // timers: the next question after a right answer, the first arrival

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (v) => (v === null || v === undefined ? '(none)' : JSON.stringify(v));

let browser = null;
let page = null;
let where = 'launch';

async function main() {
  let puppeteer;
  try { puppeteer = require(PUPPETEER); } catch (e) { throw new Error('puppeteer-core not found at ' + PUPPETEER + ' (set PUPPETEER=<path>): ' + e.message); }
  let CD;
  const modPath = path.join(ROOT, 'games', 'chart-detective', 'charts.js');
  try { CD = require(modPath); } catch (e) { throw new Error('cannot load ' + modPath + ' (set ROOT=<repo root>): ' + e.message); }
  if (!fs.existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME);
  fs.mkdirSync(FAIL_SHOTS, { recursive: true });

  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  if (PHONE) await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  if (CALM) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  // A speechSynthesis stub with an online default voice and a local one; the
  // shared voice keeps only localService === true, so every utterance must
  // name 'Local'. Own properties, because the real ones are prototype
  // accessors that ignore plain assignment.
  await page.evaluateOnNewDocument(() => {
    const voices = [
      { name: 'Cloud', lang: 'en-US', localService: false, default: true, voiceURI: 'Cloud' },
      { name: 'Local', lang: 'en-GB', localService: true, default: false, voiceURI: 'Local' },
    ];
    window.__spoken = [];
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices: () => voices.slice(),
      speak: (u) => { window.__spoken.push({ text: u && u.text, voice: u && u.voice ? u.voice.name : null }); },
      cancel: () => {}, pause: () => {}, resume: () => {}, addEventListener: () => {}, removeEventListener: () => {}, onvoiceschanged: null,
    };
    function Utterance(text) { this.text = text || ''; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
    // every click the page receives, for the failure report
    window.__clicks = [];
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? (e.target.closest('button, a') || e.target) : e.target;
      window.__clicks.push({ x: e.clientX, y: e.clientY, scrollY: window.scrollY, target: t ? (t.id ? '#' + t.id : t.tagName + '.' + t.className) : '?' });
    }, true);
  });

  const origin = new URL(URL_BASE).origin;          // 'null' over file://
  const problems = [];
  const foreign = [];
  const allowed = (u) => (origin !== 'null' && u.startsWith(origin)) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || ALLOW.some((a) => u.startsWith(a));
  page.on('pageerror', (e) => problems.push('pageerror: ' + (e && e.message ? e.message : String(e))));
  page.on('error', (e) => problems.push('page crashed: ' + (e && e.message ? e.message : String(e))));
  const fileNoise = (m) => {
    if (origin !== 'null') return false;
    const loc = m.location ? m.location() : null;
    const s = m.text() + ' ' + ((loc && loc.url) || '');
    return /manifest\.json|apple-touch-icon\.png/.test(s);
  };
  page.on('console', (m) => { if (m.type() === 'error' && !fileNoise(m)) problems.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!allowed(u)) foreign.push(u); });

  // ---- helpers ----------------------------------------------------------
  const text = (sel) => page.$eval(sel, (e) => (e.textContent || '').trim()).catch(() => null);
  const visible = (sel) => page.$eval(sel, (e) => { if (e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).catch(() => false);
  const state = () => page.evaluate(() => (window.cdTest ? window.cdTest.state() : null));
  const pageRound = () => page.evaluate(() => (window.cdTest ? window.cdTest.round() : null));
  async function until(fn, ms, what) {
    const t0 = Date.now();
    let lastErr = '';
    for (;;) {
      let ok = false;
      try { ok = await fn(); lastErr = ''; } catch (e) { lastErr = e && e.message ? e.message : String(e); }
      if (ok) return;
      if (Date.now() - t0 > ms) {
        const s = await state();
        throw new Error(`timed out after ${ms} ms waiting for ${what} [tell: ${show(await text('#tell'))}, state: ${show(s)}${lastErr ? ', last error: ' + lastErr : ''}]`);
      }
      await sleep(80);
    }
  }
  const phaseIs = (p) => async () => ((await state()) || {}).phase === p;
  const qiIs = (n) => async () => { const s = await state(); return !!s && s.phase === 'ask' && s.qi === n; };
  async function shot(name) {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `chart-detective-${TAG}-${name}.png`) });
  }
  // the page jumps to the title or the chart as a case starts or closes; a tap
  // aimed before the jump lands on whatever moved under it, so wait until the
  // scroll position has held still for three readings
  async function settle() {
    let last = await page.evaluate(() => window.scrollY);
    let still = 0;
    for (let i = 0; i < 60 && still < 3; i++) {
      await sleep(100);
      const y = await page.evaluate(() => window.scrollY);
      still = y === last ? still + 1 : 0;
      last = y;
    }
  }
  // Brings a button to the middle of the screen (away from the site's fixed
  // corner buttons), then names what is really under its centre, so a tap
  // that would land elsewhere fails with the culprit instead of a mystery.
  async function covered(sel) {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'missing';
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit) return 'off screen at ' + Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2);
      return el === hit || el.contains(hit) ? '' : (hit.id ? '#' + hit.id : hit.tagName + '.' + hit.className) + ' covers it at ' + Math.round(r.top + r.height / 2) + 'px';
    }, sel);
  }
  const push = async (sel) => {
    await settle();
    const c = await covered(sel);
    assert.equal(c, '', `${where}: ${sel} cannot be tapped: ${c}`);
    if (PHONE) await page.tap(sel); else await page.click(sel);
  };
  const eq = (got, want, what) => assert.equal(got, want, `${where}: ${what}`);
  const colSel = (i) => `#chart button.col[data-i="${i}"]`;
  // a column: the number key on a keyboard, a tap on a phone
  async function pressCol(i) { if (PHONE) { await settle(); await page.tap(colSel(i)); } else await page.keyboard.press(String(i + 1)); }
  async function chip(choice) { await push(`#chips .chip[data-choice="${choice}"]`); }
  async function answerRight(round, qi) {
    const q = round.questions[qi];
    if (q.kind === 'category') await pressCol(round.categories.findIndex((c) => c.id === q.answer));
    else await chip(q.answer);
  }
  // Nothing may be wider than the viewport: a phone zooms the whole page out
  // to fit the widest element, and every tap then lands somewhere else.
  async function expectNoOverflow() {
    const r = await page.evaluate(() => {
      const w = document.documentElement.scrollWidth;
      if (w <= window.innerWidth && window.innerWidth === (window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth)) return '';
      let widest = null;
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (!widest || b.right > widest.right)) widest = { right: b.right, name: el.id ? '#' + el.id : el.tagName + '.' + el.className };
      }
      return `the page is ${w}px wide in a ${window.innerWidth}px viewport (widest: ${widest ? widest.name + ' to ' + Math.round(widest.right) + 'px' : 'none'})`;
    });
    assert.equal(r, '', `${where}: ${r}`);
  }
  async function expectRound(stage, seed, caseIndex) {
    const want = CD.generateRound(stage, seed, caseIndex);
    const got = await pageRound();
    assert.deepEqual(got, JSON.parse(JSON.stringify(want)), `${where}: the page's case differs from charts.js for stage ${stage} seed ${seed} case ${caseIndex}`);
    await expectNoOverflow();
    return want;
  }
  async function collectAll(round, wrongAt) {
    for (let k = 0; k < round.arrivals.length; k++) {
      const want = round.arrivals[k];
      await until(async () => ((await state()) || {}).arrival === k && (await text('#spotCount')) === `${k + 1} of ${round.arrivals.length}`, SLOW, `arrival ${k} in the spotlight`);
      if (k === wrongAt) {
        const other = (want + 1) % round.counts.length;
        await pressCol(other);
        await until(async () => /^That's the /.test((await text('#tell')) || ''), QUICK, 'the wrong-column message');
        const slot = round.chart === 'tally' ? 'row' : 'column';
        eq(await text('#tell'), `That's the ${round.categories[other].name} ${slot}. Find the ${round.categories[want].name} ${slot}.`, 'the wrong-column message');
        eq(((await state()) || {}).arrival, k, 'a wrong column places nothing');
      }
      await pressCol(want);
      await until(async () => { const s = await state(); return !!s && (s.arrival === k + 1 || s.phase === 'ask'); }, QUICK, `placing arrival ${k}`);
    }
    // the hidden table carries the finished counts
    const rows = await page.$$eval('#srBody tr', (trs) => trs.map((tr) => tr.textContent.trim()));
    for (let i = 0; i < round.counts.length; i++) assert.ok(rows[i].endsWith(String(round.counts[i])), `${where}: hidden table row ${i} is ${rows[i]}`);
  }
  async function answerAllRight(round, from) {
    for (let qi = from || 0; qi < round.questions.length; qi++) {
      await until(qiIs(qi), SLOW, `question ${qi}`);
      eq(await text('#tell'), round.questions[qi].text, `question ${qi} text`);
      await answerRight(round, qi);
      await until(async () => ((await state()) || {}).phase === 'right', QUICK, `question ${qi} marked right`);
      eq(await text('#tell'), 'Yes! ' + round.questions[qi].finding, `question ${qi} finding`);
    }
    await until(phaseIs('done'), SLOW, 'case closed');
  }
  async function expectDone(round, helped, nextStage) {
    const items = await page.$$eval('#findings li', (lis) => lis.map((li) => ({ text: li.textContent.trim(), helped: li.classList.contains('helped') })));
    assert.deepEqual(items.map((i) => i.text), round.questions.map((q) => q.finding), `${where}: the findings`);
    assert.deepEqual(items.map((i) => i.helped), round.questions.map((_, i) => helped.includes(i)), `${where}: which findings needed help`);
    eq(await visible('#nextStageBtn'), nextStage, 'Next stage shown');
    eq(await visible('#nextCaseBtn'), true, 'Next case shown');
    eq(await page.evaluate(() => document.activeElement && document.activeElement.id), 'doneHead', 'focus on the case-closed heading');
    await expectNoOverflow();
  }

  // ---- load --------------------------------------------------------------
  where = 'load';
  await page.goto(URL_BASE + '?stage=1&seed=' + SEED, { waitUntil: 'load', timeout: 180000 });
  await until(async () => !!(await state()), QUICK, 'the page script');
  eq(await visible('#pickView'), false, 'the start screen is skipped with ?stage=');
  eq(await page.$eval('#sprite', (s) => s.querySelectorAll('symbol').length), 30, 'thirty glyph symbols');

  // ---- case 1: stage 1, a wrong tap, the first question wrong twice ------
  where = 'case 1 collect';
  let round = await expectRound(1, SEED, 0);
  eq(round.collect, true, 'stage 1 collects');
  await until(phaseIs('collect'), QUICK, 'the collecting phase');
  await until(async () => (await text('#spotCount')) === `1 of ${round.arrivals.length}`, SLOW, 'the first arrival');
  eq(await visible('#spot'), true, 'the spotlight shows the first arrival');
  await shot('collecting');
  await collectAll(round, 2);
  where = 'case 1 questions';
  await until(qiIs(0), SLOW, 'question 0');
  const q0 = round.questions[0];
  eq(q0.kind, 'number', 'stage 1 opens with how many');
  const wrongs = q0.options.filter((o) => String(o) !== String(q0.answer));
  await chip(wrongs[0]);
  await until(async () => ((await state()) || {}).attempts === 1, QUICK, 'the first wrong answer');
  eq(await text('#tell'), CD.check(round, 0, wrongs[0]).hint, 'the hint after one wrong answer');
  eq(await page.$eval(`#chips .chip[data-choice="${wrongs[0]}"]`, (b) => b.disabled && b.classList.contains('is-wrong')), true, 'the wrong chip is struck out');
  await chip(wrongs[1]);
  await until(phaseIs('worked'), QUICK, 'the worked answer');
  eq(await text('#tell'), q0.explanation, 'the worked answer after two wrong answers');
  eq(await page.$eval(colSel(q0.targets[0]), (b) => b.classList.contains('lit')), true, 'the column the answer is about is lit');
  eq(await page.$eval(`#chips .chip[data-choice="${q0.answer}"]`, (b) => b.classList.contains('is-right')), true, 'the right chip is shown');
  await shot('worked-answer');
  await push('#nextQBtn');
  await answerAllRight(round, 1);
  where = 'case 1 closed';
  await expectDone(round, [0], false);
  await shot('case-closed');
  // say it again speaks the last line once more
  const before = await page.evaluate(() => window.__spoken.length);
  await push('#sayBtn');
  eq(await page.evaluate(() => window.__spoken.length), before + 1, 'Say it again speaks once');
  await push('#nextCaseBtn');

  // ---- case 2: stage 1 again, all right first time -----------------------
  where = 'case 2';
  await until(phaseIs('collect'), SLOW, 'the second case');
  round = await expectRound(1, SEED + 1, 1);
  await collectAll(round, -1);
  await answerAllRight(round, 0);
  await expectDone(round, [], true);
  await push('#nextStageBtn');

  // ---- cases 3 to 6: stages 2 to 5 up the ladder -------------------------
  for (let stage = 2; stage <= 5; stage++) {
    where = `case ${stage + 1} (stage ${stage})`;
    const seed = SEED + stage;
    await until(async () => { const s = await state(); return !!s && s.stage === stage && (s.phase === 'collect' || s.phase === 'ask'); }, SLOW, `stage ${stage} to start`);
    round = await expectRound(stage, seed, 0);
    eq(await page.$eval('#chart', (c) => c.className), stage === 2 ? 'chart cols' : stage === 3 ? 'chart cols' : stage === 4 ? 'chart bars' : 'chart', 'the chart kind');
    if (round.collect) await collectAll(round, -1);
    else eq(await visible('#spot'), false, 'no spotlight when the chart is given');
    if (stage === 3) eq(await text('#chartKey'), `Key:= ${round.key}`, 'the key line');
    if (stage === 5) eq(await page.$$eval('#chart td.hidden-cell', (t) => t.length), 1, 'one hidden cell');
    await answerAllRight(round, 0);
    await expectDone(round, [], stage < 5);
    if (stage < 5) await push('#nextStageBtn');
  }

  // ---- back to the start screen -------------------------------------------
  where = 'all cases';
  await push('#casesBtn');
  await until(phaseIs('pick'), QUICK, 'the start screen');
  eq(await visible('#pickView'), true, 'the start screen is back');
  eq(await page.$$eval('#stages .stage-btn', (b) => b.length), 5, 'five stage buttons');

  // ---- the house rules -----------------------------------------------------
  where = 'final checks';
  const stored = await page.evaluate(() => {
    let a = 0, b = 0, c = '';
    try { a = localStorage.length; } catch (e) { a = 0; }
    try { b = sessionStorage.length; } catch (e) { b = 0; }
    try { c = document.cookie; } catch (e) { c = ''; }
    return [a, b, c];
  });
  assert.deepEqual(stored, [0, 0, ''], `${where}: [localStorage.length, sessionStorage.length, document.cookie]`);
  const spoken = await page.evaluate(() => window.__spoken || []);
  assert.ok(spoken.length >= 20, `${where}: too little was spoken (${spoken.length})`);
  assert.deepEqual(spoken.filter((u) => u.voice !== 'Local'), [], `${where}: every utterance must use the local voice`);
  assert.deepEqual(foreign, [], `${where}: requests outside the allowed list (own origin, file:, data:, blob:, ${ALLOW.join(', ')})`);
  assert.deepEqual(problems, [], `${where}: page errors or console errors`);

  console.log(`E2E PASS chart-detective (${TAG}; 6 cases, stages 1-5; ${spoken.length} utterances, all local; ${foreign.length} foreign requests; ${problems.length} errors; ${URL_BASE})`);
  await browser.close();
  browser = null;
}

main().then(() => process.exit(0)).catch(async (e) => {
  console.error('E2E FAIL [' + TAG + ', ' + where + ']: ' + (e && e.message ? e.message : String(e)));
  if (page) {
    try {
      const clicks = await page.evaluate(() => (window.__clicks || []).slice(-4));
      console.error('last clicks the page received: ' + JSON.stringify(clicks));
    } catch (e4) { /* the page may be gone */ }
    try {
      fs.mkdirSync(FAIL_SHOTS, { recursive: true });
      const file = path.join(FAIL_SHOTS, `chart-detective-${TAG}-FAIL-${where.replace(/[^A-Za-z0-9]+/g, '-')}.png`);
      await page.screenshot({ path: file });
      console.error('failure screenshot: ' + file);
    } catch (e2) { console.error('(no failure screenshot: ' + (e2 && e2.message ? e2.message : e2) + ')'); }
  }
  try { if (browser) await browser.close(); } catch (e3) { /* already gone */ }
  process.exit(1);
});
