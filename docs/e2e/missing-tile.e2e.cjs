#!/usr/bin/env node
/* Missing Tile: end-to-end player in headless Chrome.
 *
 * Plays all 36 levels in ONE page load (starting at ?level=1 and advancing
 * with #nextLevel) so ticks and stars accumulate, then checks the menu marks.
 * It knows every answer because it loads the game's pure logic module
 * (games/missing-tile/matrix.js) in Node and computes Matrix.make(level).
 *
 * Run from the repo root (desktop, over file://):
 *   node docs/e2e/missing-tile.e2e.cjs
 *
 * Env (all optional):
 *   PHONE=1      390 x 844, isMobile, hasTouch; plays by taps at window.mtTest points
 *   CALM=1       emulates prefers-reduced-motion: reduce (keyboard play, desktop size)
 *   URL=...      page URL, e.g. https://playitmyway.com/games/missing-tile/
 *                (default: the repo's file:// path to games/missing-tile/index.html)
 *   ALLOW=a,b    request-URL prefixes allowed besides the page's own origin, file:,
 *                data: and blob: (default https://playitmyway.com/); against the live
 *                site use ALLOW=https://playitmyway.com/,https://static.cloudflareinsights.com/
 *   SHOTS=dir    screenshot folder (level 1 start, level 30 hint spot, and any failure)
 *   LEVELS=1,2,3 or 1-5,12,36: a subset for quick runs (non-consecutive levels are
 *                reached through the menu)
 *   ROOT=dir     repo root for requiring matrix.js (default: two folders up from here)
 *   PUPPETEER=   path to puppeteer-core (default %TEMP%\pimw-puppeteer\node_modules\puppeteer-core)
 *
 * Desktop, PHONE=1 and CALM=1 are three sequential runs; never run more than two
 * headless Chromes at once (SwiftShader makes the machine crawl).
 *
 * Fails (exit 1) on any pageerror, console error, request outside the allowed
 * list, speech through a non-local voice, anything left in localStorage,
 * sessionStorage or document.cookie, or any assertion below. On a failure it
 * saves a screenshot named by level and step into SHOTS (or the OS temp folder).
 * The one console error ignored, and only over file://, is Chrome's CORS complaint
 * about the site-wide <link rel="manifest" href="/manifest.json">, which every game
 * page carries and which resolves to file:///C:/manifest.json off the web.
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
const FAIL_SHOTS = SHOTS || path.join(os.tmpdir(), 'pimw-missing-tile-e2e');
const ALLOW = (process.env.ALLOW || 'https://playitmyway.com/').split(',').map((s) => s.trim()).filter(Boolean);
const URL_BASE = process.env.URL || pathToFileURL(path.join(ROOT, 'games', 'missing-tile', 'index.html')).href;
const TAG = PHONE ? 'phone' : CALM ? 'calm' : 'desktop';

// The plan (from the design note's "End-to-end player" checks).
const WRONG_FIRST = new Set([2, 15, 30]);           // a wrong pick before the answer
const HINTS = { 5: 1, 12: 'all', 25: 2, 30: 1 };    // hint presses per level ('all' = every step, then one too many)
const DRAG_LEVEL = 3;                               // desktop: a drop short of the gap, then a drag into it
const G_LEVEL = 7;                                  // desktop: G reads the whole puzzle
const SHOT_LEVELS = { 1: 'start', 30: 'hint-spot' };
const TICK_LEVELS = new Set([2, 5, 12, 15, 25, 30]); // every other level ends with a star
const ANIM = 30000;                                 // SwiftShader is slow: animations get up to 30 s
const QUICK = 8000;                                 // synchronous DOM changes after a key or tap

function parseLevels(spec) {
  if (!spec) return Array.from({ length: 36 }, (_, i) => i + 1);
  const set = new Set();
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error('LEVELS: cannot read "' + part + '" (use 1,2,3 or 1-5)');
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    for (let n = a; n <= b; n++) if (n >= 1 && n <= 36) set.add(n);
  }
  const list = [...set].sort((x, y) => x - y);
  if (!list.length) throw new Error('LEVELS: no level between 1 and 36 in "' + spec + '"');
  return list;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (v) => (v === null || v === undefined ? '(none)' : JSON.stringify(v));

let browser = null;
let page = null;
let where = 'launch';                                // the current level and step, for messages and failure shots

async function main() {
  const LEVELS = parseLevels(process.env.LEVELS);

  let puppeteer;
  try {
    puppeteer = require(PUPPETEER);
  } catch (e) {
    throw new Error('puppeteer-core not found at ' + PUPPETEER + ' (set PUPPETEER=<path to puppeteer-core>): ' + e.message);
  }
  let Matrix;
  const matrixPath = path.join(ROOT, 'games', 'missing-tile', 'matrix.js');
  try {
    Matrix = require(matrixPath);
  } catch (e) {
    throw new Error('cannot load the logic module ' + matrixPath + ' (set ROOT=<repo root>): ' + e.message);
  }
  for (const name of ['make', 'ruled', 'ruleText', 'whyWrong', 'hint', 'hintSteps', 'readGrid', 'readOptions', 'say']) {
    if (!Matrix[name]) throw new Error('matrix.js exports no "' + name + '" (the contract lists it)');
  }
  const say = Matrix.say;
  if (!fs.existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME);
  fs.mkdirSync(FAIL_SHOTS, { recursive: true });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  if (PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  if (CALM) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  // A speechSynthesis stub with an online default voice and a local one. The
  // shared voice (games/shared/voice.js) keeps only localService === true, so
  // every utterance must name 'Local'. Defined as own properties because the
  // real ones are prototype accessors that ignore plain assignment.
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
      cancel: () => {}, pause: () => {}, resume: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      onvoiceschanged: null,
    };
    function Utterance(text) { this.text = text || ''; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
  });

  const origin = new URL(URL_BASE).origin;           // 'null' over file://
  const problems = [];
  const foreign = [];
  const allowed = (u) =>
    (origin !== 'null' && u.startsWith(origin)) ||
    u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') ||
    ALLOW.some((a) => u.startsWith(a));
  page.on('pageerror', (e) => problems.push('pageerror: ' + (e && e.message ? e.message : String(e))));
  page.on('error', (e) => problems.push('page crashed: ' + (e && e.message ? e.message : String(e))));
  // Over file:// the site-wide <link rel="manifest" href="/manifest.json"> (Log Jam's page
  // skeleton, which the contract tells the page to copy) resolves to file:///C:/manifest.json
  // and Chrome logs a CORS error plus a "Failed to load resource" for it. That is the one
  // console error ignored, and only over file://: on http(s) the manifest must load.
  const manifestNoise = (m) => {
    if (origin !== 'null') return false;
    const loc = m.location ? m.location() : null;
    return /manifest\.json/.test(m.text()) || /manifest\.json/.test((loc && loc.url) || '');
  };
  page.on('console', (m) => { if (m.type() === 'error' && !manifestNoise(m)) problems.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!allowed(u)) foreign.push(u); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('navigated: ' + f.url()); });

  // ---- helpers ----------------------------------------------------------
  const text = (sel) => page.$eval(sel, (e) => (e.textContent || '').trim()).catch(() => null);
  const attr = (sel, name) => page.$eval(sel, (e, n) => e.getAttribute(n), name).catch(() => null);
  const board = (name) => attr('#board', 'data-' + name);
  const visible = (sel) => page.$eval(sel, (e) => {
    if (e.hidden) return false;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).catch(() => false);
  const snapshot = () => page.evaluate(() => {
    const g = (id) => document.getElementById(id);
    const b = g('board');
    const t = (id) => (g(id) ? (g(id).textContent || '').trim() : null);
    return {
      tell: t('tell'), sr: t('srFocus'),
      state: b ? b.getAttribute('data-state') : null, sel: b ? b.getAttribute('data-sel') : null,
      out: b ? b.getAttribute('data-out') : null, level: b ? b.getAttribute('data-level') : null,
    };
  }).catch(() => ({}));
  async function until(fn, ms, what) {
    const t0 = Date.now();
    let lastErr = '';
    for (;;) {
      let ok = false;
      try { ok = await fn(); lastErr = ''; } catch (e) { lastErr = e && e.message ? e.message : String(e); }
      if (ok) return;
      if (Date.now() - t0 > ms) {
        const s = await snapshot();
        throw new Error(`timed out after ${ms} ms waiting for ${what} [tell: ${show(s.tell)}, #board data-state: ${show(s.state)}, data-sel: ${show(s.sel)}, data-out: ${show(s.out)}, data-level: ${show(s.level)}, srFocus: ${show(s.sr)}${lastErr ? ', last error: ' + lastErr : ''}]`);
      }
      await sleep(80);
    }
  }
  const tellIs = (want) => async () => (await text('#tell')) === want;
  const srIs = (want) => async () => (await text('#srFocus')) === want;
  const selIs = (i) => async () => (await board('sel')) === String(i);
  const stateIs = (s) => async () => (await board('state')) === s;
  const all = (...fns) => async () => { for (const f of fns) if (!(await f())) return false; return true; };
  async function shot(name) {
    const dir = SHOTS || FAIL_SHOTS;
    const file = path.join(dir, `missing-tile-${TAG}-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  }
  const press = (key) => page.keyboard.press(key);
  const mt = (fn, i) => page.evaluate((f, k) => {
    const t = window.mtTest;
    if (!t || typeof t[f] !== 'function') throw new Error('window.mtTest.' + f + ' is absent (set only when the page opens with ?level=1..36)');
    const p = k === undefined ? t[f]() : t[f](k);
    return { x: p.x, y: p.y };
  }, fn, i === undefined ? undefined : i);
  const tapAt = async (p) => { if (PHONE) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
  const pushButton = async (sel) => { if (PHONE) await page.tap(sel); else await page.click(sel); };
  const fullRead = (n, p) => say.start(n) + ' ' + Matrix.readGrid(p) + ' ' + Matrix.readOptions(p);
  const eq = (got, want, what) => assert.equal(got, want, `${where}: ${what}`);

  // ---- load --------------------------------------------------------------
  const first = LEVELS[0];
  const startUrl = URL_BASE + '?level=' + first;
  where = 'load';
  try {
    await page.goto(startUrl, { waitUntil: 'load', timeout: 180000 });
  } catch (e) {
    throw new Error('the page did not load (' + e.message + '), so #tell never appeared');
  }
  await until(async () => !!(await page.$('#tell')), 30000, '#tell to appear (is ' + startUrl + ' the Missing Tile page?)');

  const marks = new Map();                           // level -> 'star' | 'tick' (what this run earned)

  // ---- one level ---------------------------------------------------------
  async function waitStart(n, p) {
    where = `L${n} start`;
    await until(all(async () => (await board('level')) === String(n), tellIs(say.start(n))), ANIM, `level ${n} to start (#board data-level ${n} and #tell = say.start)`);
    eq(await board('state'), 'pick', 'data-state at the start');
    eq(await board('sel'), '-1', 'data-sel at the start');
    eq(await board('out'), '', 'data-out at the start');
    eq(await board('hints'), '0', 'data-hints at the start');
    eq(await board('tries'), '0', 'data-tries at the start');
    eq(await attr('#hintBtn', 'aria-disabled'), 'false', '#hintBtn aria-disabled at the start');
    eq(await text('#levelName'), 'Level ' + n, '#levelName');
    assert.ok(!(await visible('#tries')), `${where}: #tries should be hidden at the start`);
    assert.ok(!(await visible('#done')), `${where}: #done should be hidden at the start`);
    // startLevel reads the whole puzzle to the screen reader 0.6 s in; wait for it so it
    // cannot land on top of a later "picked" announcement.
    await until(srIs(fullRead(n, p)), 15000, 'the start screen-reader read (say.start + readGrid + readOptions)');
  }

  // Keyboard: walk the selection over live options to `target`, checking every stop.
  async function goTo(target, p, live) {
    const n = p.options.length;
    for (let guard = 0; guard <= n + 1; guard++) {
      const cur = +(await board('sel'));
      if (cur === target) return;
      const right = cur === -1 || target > cur;
      let next;
      if (cur === -1) next = right ? live[0] : live[live.length - 1];
      else next = right ? live.find((k) => k > cur) : [...live].reverse().find((k) => k < cur);
      if (next === undefined) throw new Error(`${where}: no live option ${right ? 'right' : 'left'} of ${cur} on the way to ${target}`);
      await press(right ? 'ArrowRight' : 'ArrowLeft');
      await until(all(selIs(next), srIs(say.picked(p.options[next], next, n))), QUICK, `Arrow${right ? 'Right' : 'Left'} to select option ${next} (from ${cur}) and announce say.picked`);
      // the keyboard announces only to the screen reader; the strip keeps its message
      assert.notEqual(await text('#tell'), say.chosen(p.options[next]), `${where}: #tell should not repeat the chosen line for an arrow key`);
    }
    throw new Error(`${where}: could not reach option ${target} by arrows`);
  }

  // Phone: tap an option (selects it), then tap it again or tap the gap (places it).
  async function tapSelect(i, p) {
    const o = await mt('optionScreen', i);
    await page.touchscreen.tap(o.x, o.y);
    await until(all(selIs(i), tellIs(say.chosen(p.options[i]))), QUICK, `a tap on option ${i} to select it`);
    return o;
  }
  async function tapPlace(i, p, viaGap) {
    const o = await tapSelect(i, p);
    if (viaGap) { const g = await mt('gapScreen'); await page.touchscreen.tap(g.x, g.y); } else await page.touchscreen.tap(o.x, o.y);
  }

  // Select-and-place by the run's input method; `live` is the sorted live option list.
  async function placeOption(i, p, live, n) {
    if (PHONE) await tapPlace(i, p, n % 4 === 0);
    else { await goTo(i, p, live); await press('Enter'); }
  }

  async function wrongPick(n, p, i, outs, ctx) {
    where = `L${n} wrong pick ${i}`;
    const live = p.options.map((_, k) => k).filter((k) => !outs.has(k));
    await placeOption(i, p, live, n);
    const why = Matrix.whyWrong(p, i);
    assert.ok(why, `${where}: Matrix.whyWrong(p, ${i}) should not be null for a distractor`);
    await until(tellIs(say.wrong(why)), ANIM, `#tell = say.wrong after placing distractor ${i}`);
    outs.add(i);
    ctx.tries++;
    const nowLive = p.options.map((_, k) => k).filter((k) => !outs.has(k));
    // after a wrong pick the keyboard is moved to the nearest live tile (and hears it); a finger starts afresh
    const nearest = PHONE ? -1 : (nowLive.find((k) => k > i) !== undefined ? nowLive.find((k) => k > i) : [...nowLive].reverse().find((k) => k < i));
    await until(all(stateIs('pick'), selIs(nearest)), ANIM, `the reject to finish (data-state pick, data-sel ${nearest})`);
    eq(await board('out'), [...outs].sort((a, b) => a - b).join(','), 'data-out after the wrong pick');
    eq(await board('tries'), String(ctx.tries), 'data-tries after the wrong pick');
    assert.ok((await board('sel')) !== String(i), `${where}: data-sel should have moved off the outed option ${i}`);
    assert.ok(await visible('#tries'), `${where}: #tries should be visible after a wrong pick`);
    eq(await text('#tries'), say.tries(ctx.tries), '#tries text');
    if (!PHONE) eq(await text('#srFocus'), say.picked(p.options[nearest], nearest, p.options.length), '#srFocus after the reject (nearest live option announced)');
    eq(await text('#tell'), say.wrong(why), '#tell keeps the wrong message after the reject');
    // The outed tile again: arrows skip it, so point at it (twice, like a double tap).
    where = `L${n} outed option ${i} again`;
    const o = await mt('optionScreen', i);
    await tapAt(o);
    await sleep(150);
    await tapAt(o);
    await until(tellIs(say.out()), QUICK, '#tell = say.out after pointing at the outed option');
    eq(await board('state'), 'pick', 'data-state after pointing at an outed option');
    eq(await board('out'), [...outs].sort((a, b) => a - b).join(','), 'data-out unchanged after pointing at an outed option');
  }

  async function hintPress() { if (PHONE) await page.tap('#hintBtn'); else await press('h'); }
  async function takeHints(n, p, ctx) {
    const steps = Matrix.hintSteps(p);
    const want = HINTS[n] === 'all' ? steps : HINTS[n];
    for (let k = 0; k < want; k++) {
      where = `L${n} hint ${k + 1}`;
      const h = Matrix.hint(p, k);
      await hintPress();
      await until(all(tellIs(say.hint(h.text)), async () => (await board('hints')) === String(k + 1)), QUICK, `hint step ${k} (#tell = say.hint and data-hints ${k + 1})`);
      ctx.hints++;
      if (SHOT_LEVELS[n] === 'hint-spot' && k === 0 && SHOTS) { await sleep(1500); console.log('shot: ' + (await shot(`L${n}-hint-spot`))); }
    }
    if (HINTS[n] === 'all') {
      where = `L${n} hints exhausted`;
      eq(await text('#tell'), say.hint(Matrix.hint(p, steps - 1).text), 'the last hint names the answer');
      assert.equal(Matrix.hint(p, steps - 1).spot, null, `${where}: the last hint step has no spot`);
      await until(async () => (await attr('#hintBtn', 'aria-disabled')) === 'true', QUICK, '#hintBtn aria-disabled="true" after the last step');
      const before = await snapshot();
      await hintPress();
      await sleep(500);
      const after = await snapshot();
      eq(after.tell, before.tell, '#tell after one hint press too many');
      eq(await board('hints'), String(steps), 'data-hints after one hint press too many');
      eq(await attr('#hintBtn', 'aria-disabled'), 'true', '#hintBtn stays aria-disabled');
    }
  }

  async function dragChecks(n, p) {
    where = `L${n} drag short of the gap`;
    const a = await mt('optionScreen', p.answer);
    const g = await mt('gapScreen');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(g.x + 220, g.y, { steps: 8 });  // 220 px right of the gap: well outside overGap's 0.75 units
    await sleep(150);
    eq(await board('sel'), String(p.answer), 'data-sel during the drag (pointerdown selects)');
    await page.mouse.up();
    await sleep(1500);                                      // W.drop floats it home; no state change
    eq(await board('state'), 'pick', 'data-state after a drop short of the gap');
    eq(await board('sel'), String(p.answer), 'data-sel after a drop short of the gap');
    eq(await board('tries'), '0', 'data-tries after a drop short of the gap');
    eq(await text('#tell'), say.chosen(p.options[p.answer]), '#tell after a drop short of the gap');
    where = `L${n} drag into the gap`;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(g.x, g.y, { steps: 8 });
    await page.mouse.up();
  }

  async function finish(n, p, ctx) {
    where = `L${n} right answer`;
    const firstTry = ctx.tries === 0;
    await until(tellIs(say.right(firstTry)), ANIM, `#tell = say.right(${firstTry})`);
    where = `L${n} done card`;
    await until(() => visible('#done'), ANIM, 'the done card (#done visible)');
    eq(await board('state'), 'done', 'data-state with the done card up');
    const star = ctx.tries === 0 && ctx.hints === 0;        // and always a first play in this one page load
    eq(await text('#doneTitle'), star ? 'First try! ★' : "That's it!", '#doneTitle');
    eq(await text('#doneSub'), say.done(n, firstTry, ctx.hints), '#doneSub');
    eq(await text('#doneWhy'), Matrix.ruled(p).map(Matrix.ruleText).join(' '), '#doneWhy');
    eq(await board('tries'), String(ctx.tries), 'data-tries on the done card');
    eq(await board('hints'), String(ctx.hints), 'data-hints on the done card');
    marks.set(n, star ? 'star' : 'tick');
    return star;
  }

  for (let li = 0; li < LEVELS.length; li++) {
    const n = LEVELS[li];
    const p = Matrix.make(n - 1);
    assert.ok(p && Array.isArray(p.options) && Number.isInteger(p.answer), `Matrix.make(${n - 1}) gave no puzzle`);
    const ctx = { tries: 0, hints: 0 };
    const outs = new Set();
    const live = () => p.options.map((_, k) => k).filter((k) => !outs.has(k));
    await waitStart(n, p);
    if (!PHONE) await page.focus('#board');

    if (n === 1) {
      if (PHONE) {
        where = 'L1 phone pitch';
        const t3 = await mt('tileScreen', 3);
        const t4 = await mt('tileScreen', 4);
        const o0 = await mt('optionScreen', 0);
        const o1 = await mt('optionScreen', 1);
        const pitch = t4.x - t3.x;
        assert.ok(pitch >= 80, `${where}: tile pitch ${pitch.toFixed(1)} px should be at least 80 px (tileScreen(4).x - tileScreen(3).x)`);
        assert.ok(Math.abs(o1.x - o0.x - pitch) <= 2, `${where}: tray pitch ${(o1.x - o0.x).toFixed(1)} px should match the board pitch ${pitch.toFixed(1)} px within 2 px`);
        if (SHOTS) { await sleep(1500); console.log('shot: ' + (await shot('L1-start'))); }
        where = 'L1 gap tap with nothing selected';
        const g = await mt('gapScreen');
        await page.touchscreen.tap(g.x, g.y);
        await until(tellIs(say.pickFirst()), QUICK, '#tell = say.pickFirst after a gap tap with nothing selected');
        eq(await board('sel'), '-1', 'data-sel after the gap tap');
      } else {
        if (SHOTS) { await sleep(1500); console.log('shot: ' + (await shot('L1-start'))); }
        where = 'L1 Enter with nothing selected';
        await press('Enter');
        await until(tellIs(say.pickFirst()), QUICK, '#tell = say.pickFirst after Enter with nothing selected');
        eq(await board('sel'), '-1', 'data-sel after Enter with nothing selected');
        eq(await board('state'), 'pick', 'data-state after Enter with nothing selected');
        where = 'L1 ArrowLeft from nothing';
        const last = p.options.length - 1;
        await press('ArrowLeft');
        await until(all(selIs(last), srIs(say.picked(p.options[last], last, p.options.length))), QUICK, 'ArrowLeft from -1 to select the last option');
        eq(await text('#tell'), say.pickFirst(), '#tell untouched by an arrow key (still the pick-first line)');
        where = 'L1 ArrowLeft to the first option';
        await goTo(0, p, live());
        where = 'L1 ArrowLeft past the first option';
        await press('ArrowLeft');
        await until(srIs(say.none('left')), QUICK, "#srFocus = say.none('left') at the left end");
        eq(await board('sel'), '0', 'data-sel stays on option 0 at the left end');
      }
    }

    if (HINTS[n]) await takeHints(n, p, ctx);
    if (WRONG_FIRST.has(n)) {
      const i = p.answer === 0 ? 1 : 0;              // the lowest index that is not the answer
      await wrongPick(n, p, i, outs, ctx);
    }

    where = `L${n} place the answer`;
    if (!PHONE && n === DRAG_LEVEL) {
      await dragChecks(n, p);
    } else if (!PHONE && n === G_LEVEL) {
      await goTo(p.answer, p, live());                 // srFocus now holds say.picked, so the G read is a real change
      where = `L${n} G reads the puzzle`;
      await press('g');
      await until(srIs(fullRead(n, p)), QUICK, '#srFocus = say.start + readGrid + readOptions after G');
      eq(await board('sel'), String(p.answer), 'data-sel unchanged by G');
      where = `L${n} place the answer`;
      await press('Enter');
    } else {
      await placeOption(p.answer, p, live(), n);
    }
    const star = await finish(n, p, ctx);
    console.log(`L${n} ok (${star ? 'star' : 'tick'}; tries ${ctx.tries}, hints ${ctx.hints})`);

    where = `L${n} advance`;
    const next = LEVELS[li + 1];
    if (n === 36) {
      assert.ok(!(await visible('#nextLevel')), `${where}: #nextLevel should be hidden on level 36`);
      await pushButton('#allLevels');
    } else if (next === n + 1) {
      assert.ok(await visible('#nextLevel'), `${where}: #nextLevel should be visible on level ${n}`);
      await pushButton('#nextLevel');
    } else {
      await pushButton('#allLevels');
      if (next !== undefined) {
        await until(() => visible('#menu'), QUICK, 'the menu after All levels');
        await pushButton(`.level-btn[data-level="${next}"]`);
      }
    }
  }

  // ---- the menu marks ----------------------------------------------------
  where = 'menu marks';
  await until(() => visible('#menu'), ANIM, 'the menu after the last level');
  assert.ok(!(await visible('#board')), `${where}: #board should be hidden on the menu`);
  const labels = await page.$$eval('.level-btn[data-level]', (es) => es.map((e) => [e.getAttribute('data-level'), e.getAttribute('aria-label')]));
  eq(labels.length, 36, 'number of .level-btn[data-level] buttons');
  for (const [lv, label] of labels) {
    const n = +lv;
    const mark = marks.get(n);
    const want = mark === 'star' ? `Level ${n}, done this visit, first try with no hints` : mark === 'tick' ? `Level ${n}, done this visit` : `Level ${n}`;
    eq(label, want, `aria-label of level button ${n}`);
    if (LEVELS.length === 36) eq(mark, TICK_LEVELS.has(n) ? 'tick' : 'star', `the planned outcome of level ${n}`);
  }

  // ---- the house rules ---------------------------------------------------
  where = 'final checks';
  const stored = await page.evaluate(() => {
    let a = 0; let b = 0; let c = '';
    try { a = localStorage.length; } catch (e) { a = 0; }
    try { b = sessionStorage.length; } catch (e) { b = 0; }
    try { c = document.cookie; } catch (e) { c = ''; }
    return [a, b, c];
  });
  assert.deepEqual(stored, [0, 0, ''], `${where}: [localStorage.length, sessionStorage.length, document.cookie]`);
  const spoken = await page.evaluate(() => window.__spoken || []);
  assert.ok(spoken.length >= 1, `${where}: nothing was spoken (Voice.say never reached speechSynthesis.speak)`);
  const nonLocal = spoken.filter((u) => u.voice !== 'Local');
  assert.deepEqual(nonLocal, [], `${where}: every utterance must use the local voice`);
  assert.deepEqual(foreign, [], `${where}: requests outside the allowed list (own origin, file:, data:, blob:, ${ALLOW.join(', ')})`);
  assert.deepEqual(problems, [], `${where}: page errors or console errors`);

  console.log(`E2E PASS missing-tile (${TAG}${CALM && PHONE ? ', calm' : ''}; levels ${LEVELS.length === 36 ? '1-36' : LEVELS.join(',')}; ${spoken.length} utterances, all local; ${foreign.length} foreign requests; ${problems.length} errors; ${URL_BASE})`);
  await browser.close();
  browser = null;
}

main().then(() => process.exit(0)).catch(async (e) => {
  console.error('E2E FAIL [' + TAG + ', ' + where + ']: ' + (e && e.message ? e.message : String(e)));
  if (page) {
    try {
      fs.mkdirSync(FAIL_SHOTS, { recursive: true });
      const file = path.join(FAIL_SHOTS, `missing-tile-${TAG}-FAIL-${where.replace(/[^A-Za-z0-9]+/g, '-')}.png`);
      await page.screenshot({ path: file });
      console.error('failure screenshot: ' + file);
    } catch (e2) {
      console.error('(no failure screenshot: ' + (e2 && e2.message ? e2.message : e2) + ')');
    }
  }
  try { if (browser) await browser.close(); } catch (e3) { /* already gone */ }
  process.exit(1);
});
