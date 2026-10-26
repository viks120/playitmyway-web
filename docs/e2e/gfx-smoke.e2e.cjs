/* Graphics smoke player: opens each converted 2D game in headless Chrome,
 * starts a round, and fails on any page error, any console error, any
 * request off the page's own origin, or any emoji left in the play area.
 * It also writes screenshots (desktop and phone) and a contact sheet, so a
 * person can look at every game after a change.
 *
 * Run from the repo root, over file:// (the default):
 *   node docs/e2e/gfx-smoke.e2e.cjs
 * Options (environment variables):
 *   URL=https://playitmyway.com   play the live site instead of the files on disk
 *   ONLY=memory-game,sudoku       only these slugs
 *   OUT=dir                       where screenshots go (default %TEMP%\pimw-gfx-smoke)
 *   ALLOW=a,b                     request-URL prefixes allowed besides the page's own origin
 *   PUPPETEER=                    path to puppeteer-core (default %TEMP%\pimw-puppeteer\node_modules\puppeteer-core)
 * Exit code 1 when any game fails; the reasons are printed per game. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PUPPETEER = process.env.PUPPETEER || 'C:/Users/shrik/AppData/Local/Temp/pimw-puppeteer/node_modules/puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.OUT || path.join(process.env.TEMP || '/tmp', 'pimw-gfx-smoke');
const LIVE = process.env.URL ? process.env.URL.replace(/\/$/, '') : null;
const ALLOW = (process.env.ALLOW || '').split(',').filter(Boolean);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

/* How to get each game from its first screen into play, and where its play
 * area is. `start` is a list of steps: a CSS selector to click, or
 * text:<label> for the first visible button whose text starts with the
 * label. `area` is the selector whose text must hold no emoji once play has
 * begun; `keys` are pressed after starting, to prove keyboard play still
 * works. Games not listed here use the fallback: click the first button
 * that looks like a start button, check <main>. */
const GAMES = {
  'memory-game': { start: ['text:Easy'], area: '#gameBoard' },
  'counting-game': { start: ['text:New Game'], area: '#objectsContainer' },
  'whack-a-mole': { start: ['text:New Game'], area: '#moleGrid' },
  'catch-falling-object': { start: ['text:Start'], area: '#gameArea', keys: ['ArrowLeft', 'ArrowRight'] },
  'sound-it-out': { start: ['.chip[data-set="a"]'], area: '#picGlyph' },
  'sort-it-out': { start: ['.chip[data-pack="living"]'], area: '.stage' },
  'trace-letters': { start: [], area: '#board' },
  'dot-to-dot': { start: [], area: '#board' },
  'balloon-pop': { start: ['text:Start'], area: '#gameArea' },
  'tic-tac-toe': { start: ['text:New Game'], area: '#board' },
  'rock-paper-scissors': { start: ['text:Rock'], area: '.arena' },
  'code-the-robot': { start: [], area: '#boardWrap' },
  'geography-explorer': { start: [], area: '#worldMap' },
  '2048-slider': { start: ['text:New Game'], area: '#grid', keys: ['ArrowLeft', 'ArrowUp'], noPictures: true },
  'minesweeper': { start: ['text:Easy'], area: '#grid' },
};
const START_RE = /^(▶|play|start|go|begin|new game|easy)/i;
const JOINERS = String.fromCodePoint(0xfe0f, 0x20e3, 0x200d);
const hasPicto = (s) => /\p{Extended_Pictographic}/u.test(s) || [...JOINERS].some((c) => s.includes(c));

const catalogue = require(path.join(ROOT, 'docs', 'catalogue.js'));
const slugs = Object.keys(GAMES).filter((s) => catalogue.games.some((g) => g.slug === s)).filter((s) => !ONLY || ONLY.includes(s));

function pageUrl(slug) {
  if (LIVE) return `${LIVE}/games/${slug}/`;
  return 'file:///' + path.join(ROOT, 'games', slug, 'index.html').replace(/\\/g, '/');
}

async function clickStep(page, step) {
  if (step.startsWith('text:')) {
    const label = step.slice(5);
    return page.evaluate((label, re) => {
      const rx = new RegExp(re, 'i');
      const els = [...document.querySelectorAll('button, a.candy, [role="button"], label')];
      const vis = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10 && getComputedStyle(e).visibility !== 'hidden'; });
      const hit = vis.find((e) => (e.textContent || '').trim().startsWith(label)) || (label === '' ? vis.find((e) => rx.test((e.textContent || '').trim())) : null);
      if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 30); }
      return null;
    }, label, START_RE.source);
  }
  const el = await page.$(step);
  if (!el) return null;
  await el.click();
  return step;
}

async function run(browser, slug, phone) {
  const spec = GAMES[slug];
  const page = await browser.newPage();
  const problems = [];
  const origin = LIVE ? new URL(LIVE).origin : 'file:';
  page.on('pageerror', (e) => problems.push('page error: ' + String(e.message).slice(0, 160)));
  /* Over file:// the root-absolute manifest and touch-icon links cannot resolve; that is the host's job, not the game's. */
  const KNOWN_FILE_MISSES = ['/manifest.json', '/apple-touch-icon.png', '/sw.js'];
  page.on('requestfailed', (r) => { const u = r.url(); if (LIVE || !KNOWN_FILE_MISSES.some((k) => u.endsWith(k))) problems.push('request failed: ' + u.slice(0, 120)); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console error: ' + m.text().slice(0, 160)); });
  page.on('request', (r) => {
    const u = r.url();
    const own = u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:') || (!LIVE && u.startsWith('file:'));
    if (!own && !ALLOW.some((a) => u.startsWith(a))) problems.push('request off-origin: ' + u.slice(0, 120));
  });
  if (phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  try {
    await page.goto(pageUrl(slug), { waitUntil: 'load', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));
    for (const step of spec.start) {
      const did = await clickStep(page, step);
      if (!did) problems.push(`start step not found: ${step}`);
      await new Promise((r) => setTimeout(r, 700));
    }
    for (const k of spec.keys || []) { await page.keyboard.press(k); await new Promise((r) => setTimeout(r, 150)); }
    const found = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? { text: el.textContent || '' } : null; }, spec.area);
    const text = found ? found.text : '';
    if (!found) problems.push(`play area not found: ${spec.area}`);
    else if (hasPicto(text)) problems.push('emoji still in the play area: ' + [...text].filter((ch) => /\p{Extended_Pictographic}/u.test(ch)).slice(0, 8).join(' '));
    const sprite = await page.evaluate(() => !!document.getElementById('pictures-sprite'));
    if (!sprite && !spec.noPictures) problems.push('the picture sprite is not in the page');
    const broken = await page.evaluate(() => [...document.querySelectorAll('svg.pic use')].filter((u) => { const id = (u.getAttribute('href') || '').slice(1); return !document.getElementById(id); }).length);
    if (broken) problems.push(`${broken} pictures point at a symbol the sprite lacks`);
    await page.screenshot({ path: path.join(OUT, `${slug}${phone ? '-phone' : ''}.png`) });
  } catch (e) {
    problems.push('failed: ' + String(e.message).slice(0, 160));
  }
  await page.close();
  return problems;
}

async function sheet(browser) {
  const cells = slugs.map((s) => `<figure><img src="file:///${path.join(OUT, s + '.png').replace(/\\/g, '/')}"><img src="file:///${path.join(OUT, s + '-phone.png').replace(/\\/g, '/')}" class="phone"><figcaption>${s}</figcaption></figure>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;color:#eee;font:13px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:12px;width:1600px;box-sizing:border-box}figure{margin:0;display:grid;grid-template-columns:1fr 180px;gap:6px}img{width:100%;display:block;border-radius:6px}figcaption{grid-column:1/3;font-weight:600}</style><main>${cells}</main>`;
  const file = path.join(OUT, 'sheet.html');
  fs.writeFileSync(file, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const puppeteer = require(PUPPETEER);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
  let failed = 0;
  for (const slug of slugs) {
    for (const phone of [false, true]) {
      const problems = await run(browser, slug, phone);
      const tag = `${slug}${phone ? ' (phone)' : ''}`;
      if (problems.length) { failed++; console.log(`FAIL ${tag}\n  ${problems.join('\n  ')}`); }
      else console.log(`ok   ${tag}`);
    }
  }
  await sheet(browser);
  await browser.close();
  console.log(`${slugs.length} games, ${failed} failing runs; screenshots and sheet.png in ${OUT}`);
  process.exit(failed ? 1 : 0);
})();
