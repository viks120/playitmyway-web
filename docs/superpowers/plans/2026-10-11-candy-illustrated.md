# Candy, Illustrated Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every emoji that stands in for a picture on playitmyway.com with original SVG artwork, put the four critters and a new brand mark on the hero, re-make the favicon and app icons in the site palette, stop short card rows stretching, and retire the last old-palette gradients.

**Architecture:** Pictures are plain SVG files under `icons/` (one per game, one per critter, one mark), shown with `<img>` tags so they work over `file://`, have one source of truth each, and are precached by the generated service worker without any generator change. Hand-maintained `index.html` is edited by throwaway scripts keyed on game slug; the three generated pages come from `docs/build-pages.js` as before. A committed Node test enforces the icon style and checks every page that must show an icon.

**Tech Stack:** Static HTML/CSS/SVG, Node 25 (`node --test`), the installed Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` for screenshots and PNG rasterising (via `puppeteer-core` installed in the OS temp directory, never in the repo). No new files in the repo besides artwork, the test and the plan/spec.

**Spec:** `docs/superpowers/specs/2026-10-11-candy-illustrated-design.md`

## Global Constraints

- Work on branch `candy-illustrated`. Never push `main`; pushing `main` deploys the site.
- Zero third-party requests on any page. All artwork is original and lives in the repo.
- Nothing is stored in the browser (no cookies, localStorage, etc.). Nothing in this plan touches storage.
- Icon files: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` root (games), `0 0 64 60` (critters), `0 0 64 64` (mark); no `width`/`height` on the root; no `<text>`, gradients, filters, scripts, `<image>`, `href=`, `url(`, `<style>`; every filled shape that has an outline gets it in ink `#33302e` at `stroke-width="2.5"`; drawn lines (unfilled strokes, ink or a palette colour) are 1.5 to 7 wide; every stroke has round joins and caps; every shape names a fill, itself or through a wrapping `<g>` (the standard wrapper is `<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`); fills and strokes only from `tokens.css` hex colours plus `#ef4444 #fbbf24 #4ade80 #60a5fa #ff8fab #8b5e3c #94a3b8 #ffffff` (critters may also use any hex colour that appears in `games/shared/3d/critters.js`); exactly one comment per file, `<!-- Name: what it shows -->`, where Name is the catalogue name for a game icon; no two files draw the same picture; no `style=`, single-quoted attributes, event handlers, `<title>`, `<desc>`, `<metadata>` or `<foreignObject>`.
- `games/index.html`, `for-teachers.html`, `404.html` and `sw.js` are GENERATED: edit `docs/catalogue.js` or `docs/build-pages.js` and run `node docs/build-pages.js`. Never hand-edit them.
- Scripts that edit pages must target the FIRST `<h1` only; `drawing-pad` embeds a whole HTML document inside a template literal further down the file.
- Do not run `chrome.exe --version` (it opens a window). Do not launch three or more headless Chromes at once.
- Test command: `node --test docs/tests/*.test.js` (Git Bash). In PowerShell: `node --test (Get-ChildItem docs/tests/*.test.js).FullName`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No competitor or inspiration-source names anywhere in the repo.
- The 3D critter models and every game board are untouched.

---

## File map

| Path | Responsibility |
|---|---|
| `icons/games/<slug>.svg` (45 new) | One picture per game, named by the game's folder slug |
| `icons/critters/clover.svg`, `pip.svg`, `plum.svg`, `mango.svg` (new) | The four critters drawn flat |
| `icons/mark.svg` (new), `favicon.svg` (replaced) | The brand mark; favicon is the same content |
| `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `apple-touch-icon.png` (replaced) | App icons rasterised from the mark |
| `docs/tests/icons.test.js` (new) | Style rules, coverage, page checks, precache check, gradient check |
| `styles.css` | Hero confetti, mark, critters, card grid, icon sizing |
| `components.css` | `.title-icon` rule for game-page titles |
| `index.html` | Hero markup, card images, theme colour |
| `docs/catalogue.js` | Game entries lose `emoji` |
| `docs/build-pages.js` | Cards, table cell, catalogue hero, theme colour, `.page-intro` spacing |
| `games/<slug>/index.html` (45) | Title icon; 4 pages lose gradients, 4 pages gain "kept" comments |

---

### Task 1: The icon rules test

**Files:**
- Create: `docs/tests/icons.test.js`

**Interfaces:**
- Produces: the test file later tasks append to. Helper names used later: `ROOT`, `C`, `read(...parts)`, `exists(...parts)`, `allFiles(dir)`, `hasPicto(string)` (unused until Task 7 appends the page checks).

- [ ] **Step 1: Write the test file with the file rules and the coverage check**

```js
/* The site's original artwork under icons/: every game has a picture, every
 * picture obeys one style, and every page that should show one does.
 *     node --test docs/tests/*.test.js
 * Reads the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'docs', 'catalogue.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const allFiles = (dir) => (exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).sort() : []);
/* Does a string hold an emoji or other pictograph, or one of the invisible
 * joiners and keycaps that ride on them (U+FE0F, U+20E3, U+200D)? Built from
 * code points so this file holds no invisible characters itself. */
const JOINERS = String.fromCodePoint(0xfe0f, 0x20e3, 0x200d);
const hasPicto = (s) => /\p{Extended_Pictographic}/u.test(s) || [...JOINERS].some((c) => s.includes(c));

const INK = '#33302e';
const EXTRA = ['#ef4444', '#fbbf24', '#4ade80', '#60a5fa', '#ff8fab', '#8b5e3c', '#94a3b8', '#ffffff'];
const hexes = (s) => Array.from(new Set((s.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase())));
const PALETTE = new Set(hexes(read('tokens.css')).concat(EXTRA, INK));
const CRITTER_PALETTE = new Set([...PALETTE, ...hexes(read('games', 'shared', '3d', 'critters.js'))]);

const FOLDERS = [
  { dir: 'icons/games', box: '0 0 48 48', palette: PALETTE, needsInk: true },
  { dir: 'icons/critters', box: '0 0 64 60', palette: CRITTER_PALETTE, needsInk: true },
  { dir: 'icons', box: '0 0 64 64', palette: PALETTE, needsInk: false, only: ['mark.svg'] },
];

/* Just enough SVG structure to know, for every shape, the fill, stroke,
 * width, join and cap it ends up with after inheriting from its <g>
 * ancestors. The files are our own and simple; this is not an XML parser. */
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap'];

function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/\s([a-zA-Z:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function walk(body) {
  const shapes = [];
  const stack = [];
  let stray = 0;
  for (const m of body.matchAll(/<\/?([a-zA-Z]+)\b[^>]*>/g)) {
    const tag = m[0];
    const name = m[1];
    if (tag.startsWith('</')) {
      if (name === 'g') {
        if (stack.length) stack.pop();
        else stray++;
      }
      continue;
    }
    const own = attrsOf(tag);
    const eff = Object.assign({}, ...stack);
    for (const k of INHERITED) if (own[k] !== undefined) eff[k] = own[k];
    if (name === 'g') {
      if (!tag.endsWith('/>')) stack.push(Object.fromEntries(INHERITED.filter((k) => own[k] !== undefined).map((k) => [k, own[k]])));
      continue;
    }
    if (SHAPES.has(name)) shapes.push({ tag, eff });
  }
  return { shapes, unclosed: stack.length, stray };
}

/* Every rule a file breaks, so one run reports everything. `game` is the
 * catalogue entry for a game icon, or null. */
function violations(name, svg, f, game) {
  const v = [];
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.box}">`;
  if (!svg.startsWith(root)) {
    const first = (svg.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0');
    v.push(`must start with ${root} but starts with ${JSON.stringify(svg.slice(0, root.length + 1))} (first code point U+${first})`);
  }
  if (!svg.trimEnd().endsWith('</svg>')) v.push('must end with </svg>');
  const comments = svg.match(/<!--[\s\S]*?-->/g) || [];
  if (comments.length !== 1) v.push(`needs exactly one comment, has ${comments.length}`);
  else if (!/^<!-- [^:\n]+: [^\n]+ -->$/.test(comments[0])) v.push(`comment must read <!-- Name: what it shows -->, not ${comments[0]}`);
  else if (comments[0].slice(4, -3).includes('--')) v.push('comment text must not contain --');
  else if (game && !comments[0].startsWith(`<!-- ${game.name}: `)) v.push(`comment must start with the catalogue name ${JSON.stringify(game.name)}`);
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  const lower = body.toLowerCase();
  for (const bad of ['<text', 'gradient', '<filter', '<script', '<image', '<style', '<title', '<desc', '<metadata', '<foreignobject', 'href=', 'url(', 'style=', '@font-face']) {
    if (lower.includes(bad)) v.push(`must not contain ${bad}`);
  }
  if (/\son[a-z]+=/i.test(body)) v.push('must not contain event handler attributes');
  if (/=(?!")|\s=/.test(body)) v.push('attribute values must be double-quoted, with no space around =');
  for (const m of body.matchAll(/\b(fill|stroke)="([^"]+)"/g)) {
    const c = m[2].toLowerCase();
    if (c !== 'none' && !f.palette.has(c)) v.push(`${m[1]} ${m[2]} is not in the palette`);
  }
  const { shapes, unclosed, stray } = walk(body);
  if (unclosed) v.push(`${unclosed} unclosed <g>`);
  if (stray) v.push(`${stray} stray </g>`);
  let inkOutline = false;
  for (const s of shapes) {
    const { fill, stroke } = s.eff;
    if (fill === undefined) v.push(`${s.tag} names no fill, on itself or a <g> around it, so it would render black`);
    if (stroke === undefined || stroke === 'none') continue;
    if (s.eff['stroke-linejoin'] !== 'round' || s.eff['stroke-linecap'] !== 'round') v.push(`${s.tag} is stroked without round joins and caps`);
    const raw = s.eff['stroke-width'] === undefined ? '1' : s.eff['stroke-width'];
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      v.push(`${s.tag} has a stroke-width that is not a plain number`);
      continue;
    }
    const w = Number(raw);
    const outlined = fill !== undefined && fill !== 'none';
    if (outlined) {
      if (stroke.toLowerCase() !== INK) v.push(`${s.tag} is a filled shape outlined in ${stroke}, not ink ${INK}`);
      else {
        inkOutline = true;
        if (w !== 2.5) v.push(`${s.tag} is an ink outline of width ${w}, not 2.5`);
      }
    } else if (w < 1.5 || w > 7) {
      v.push(`${s.tag} is a line of width ${w}, outside 1.5 to 7`);
    }
  }
  if (f.needsInk && !inkOutline) v.push('needs at least one filled shape with an ink outline');
  return v.map((msg) => `${name}: ${msg}`);
}

/* The checker is code too. These pin what it must catch and what it must
 * let through, so a loosened rule fails here before any icon is judged. */
test('the style checker catches what it must', () => {
  const f = FOLDERS[0];
  const wrap = (inner, comment) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${comment || '<!-- Probe: a test icon -->'}\n` +
    `<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${inner}</g>\n</svg>\n`;
  const box = '<rect x="4" y="4" width="40" height="40" fill="#ffffff"/>';
  assert.deepEqual(violations('ok.svg', wrap(box + '<g><g/><path d="M4 4h40" stroke="#ef4444" stroke-width="3"/></g>'), f, null), []);
  const cases = [
    ['<rect x="4" y="4" width="40" height="40"/>', 'names no fill'],
    [box.replace('/>', ' stroke-width="2"/>'), 'ink outline of width 2'],
    [box.replace('/>', ' stroke="#ef4444"/>'), 'outlined in #ef4444'],
    [box.replace('/>', ' stroke="#33302E" stroke-width="4"/>'), 'ink outline of width 4'],
    [box + '<path d="M4 4h40" stroke-width="8"/>', 'line of width 8'],
    [box + '<path d="M4 4h40" stroke-width="2px"/>', 'not a plain number'],
    [box + '<path d="M4 4h40" stroke-width="0x2"/>', 'not a plain number'],
    [box.replace('/>', ' stroke-linecap="butt"/>'), 'round joins and caps'],
    [box.replace('#ffffff', '#123456'), 'not in the palette'],
    [box.replace('/>', ' style="fill:#000"/>'), 'style='],
    [box.replace('x="4"', "x='4'"), 'double-quoted'],
    [box.replace('x="4"', 'x = "4"'), 'double-quoted'],
    [box.replace('/>', ' onclick="x()"/>'), 'event handler'],
    [box + '<text x="1" y="1">a</text>', '<text'],
    [box + '<g>', 'unclosed <g>'],
    [box + '</g>', 'stray </g>'],
    ['<path d="M4 4h40"/>', 'ink outline'],
  ];
  for (const [inner, fragment] of cases) {
    const found = violations('probe.svg', wrap(inner), f, null);
    assert.ok(found.some((m) => m.includes(fragment)), `expected a violation mentioning ${JSON.stringify(fragment)}, got ${JSON.stringify(found)}`);
  }
  const two = violations('c.svg', wrap(box, '<!-- a: b --><!-- c: d -->'), f, null);
  assert.ok(two.some((m) => m.includes('exactly one comment')), JSON.stringify(two));
  const named = violations('n.svg', wrap(box), f, { name: 'Other Game' });
  assert.ok(named.some((m) => m.includes('catalogue name')), JSON.stringify(named));
  const bom = violations('b.svg', String.fromCodePoint(0xfeff) + wrap(box), f, null);
  assert.ok(bom.some((m) => m.includes('U+FEFF')), JSON.stringify(bom));
});

for (const f of FOLDERS) {
  test(`${f.dir}: every file obeys the style rules`, () => {
    const files = (f.only || allFiles(f.dir)).filter((n) => exists(f.dir, n));
    assert.ok(files.length > 0, `${f.dir} has no files yet`);
    const found = [];
    for (const n of files) {
      const game = f.dir === 'icons/games' ? C.games.find((g) => g.slug + '.svg' === n) || null : null;
      found.push(...violations(`${f.dir}/${n}`, read(f.dir, n), f, game));
    }
    assert.deepEqual(found, []);
  });
}

test('no two files draw the same picture', () => {
  const essence = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  const same = [];
  for (const f of FOLDERS) {
    for (const n of (f.only || allFiles(f.dir)).filter((x) => exists(f.dir, x))) {
      const h = crypto.createHash('sha1').update(essence(read(f.dir, n))).digest('hex');
      if (seen.has(h)) same.push(`${f.dir}/${n} draws the same picture as ${seen.get(h)}`);
      else seen.set(h, `${f.dir}/${n}`);
    }
  }
  assert.deepEqual(same, []);
});

test('every game in the catalogue has an icon, and no icon is an orphan', () => {
  const slugs = C.games.map((g) => g.slug);
  const files = allFiles('icons/games');
  const missing = slugs.filter((s) => !files.includes(s + '.svg'));
  const orphans = files.filter((n) => !n.endsWith('.svg') || !slugs.includes(n.slice(0, -4)));
  assert.deepEqual({ missing, orphans }, { missing: [], orphans: [] });
});

test('the four critters and the mark exist', () => {
  assert.deepEqual(allFiles('icons/critters'), ['clover.svg', 'mango.svg', 'pip.svg', 'plum.svg']);
  assert.ok(exists('icons', 'mark.svg'));
});
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

Run: `node --test docs/tests/icons.test.js`
Expected: FAIL, 5 of 6 tests. The three "obeys the style rules" tests fail with `icons/games has no files yet` (and the same for the other folders); the coverage test reports all 45 slugs missing; the critters-and-mark test fails. Only "no two files draw the same picture" passes, vacuously.

- [ ] **Step 3: Commit**

```bash
git add docs/tests/icons.test.js
git commit -m "test: rules for the site's original icon artwork

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Icons for the 2+ and 3+ games (12 files)

**Files:**
- Create: `icons/games/first-strokes.svg`, `rainbow-balloons.svg`, `farm-friends.svg`, `trace-shapes.svg`, `trace-letters.svg`, `trace-name.svg`, `memory-game.svg`, `color-matcher.svg`, `counting-game.svg`, `dot-to-dot.svg`, `drawing-pad.svg`, `peekaboo-pond.svg`

Every file is exactly the content shown, with a trailing newline. The `<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">` wrapper gives each shape its ink outline and a safe no-fill default; filled shapes name their own fill, shapes that should have no outline say `stroke="none"`, and coloured lines set their own `stroke` and `stroke-width` (1.5 to 7). The test reports every rule a file breaks, so fix the file, never the rule.

- [ ] **Step 1: Write the twelve files**

`icons/games/first-strokes.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- First Strokes: a crayon drawing a zigzag -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M5 36l7-12 7 12 7-12" fill="none" stroke-width="7"/><path d="M5 36l7-12 7 12 7-12" fill="none" stroke="#ff6b57" stroke-width="3.5"/><g transform="rotate(35 36 20)"><path d="M32 7l4-5 4 5z" fill="#fbbf24"/><rect x="32" y="7" width="8" height="24" rx="2" fill="#fbbf24"/><rect x="32" y="11" width="8" height="4" fill="#2b2a5e" stroke="none"/></g></g>
</svg>
```

`icons/games/rainbow-balloons.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Rainbow Balloons: three coloured balloons -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M14 26l6 16M34 24l-6 18M24 32l1 10" fill="none" stroke-width="2"/><ellipse cx="14" cy="16" rx="8" ry="10" fill="#ef4444"/><ellipse cx="34" cy="14" rx="8" ry="10" fill="#60a5fa"/><ellipse cx="24" cy="22" rx="8" ry="10" fill="#fbbf24"/></g><ellipse cx="21" cy="17" rx="1.8" ry="3" fill="#ffffff" opacity=".7"/>
</svg>
```

`icons/games/farm-friends.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Farm Friends: a cow's face -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="10" cy="20" rx="5" ry="3" fill="#ff8fab"/><ellipse cx="38" cy="20" rx="5" ry="3" fill="#ff8fab"/><ellipse cx="24" cy="24" rx="14" ry="13" fill="#ffffff"/><path d="M14 16c-2-4 0-8 3-8M34 16c2-4 0-8-3-8" fill="none"/><ellipse cx="24" cy="31" rx="8" ry="5" fill="#ff8fab"/></g><circle cx="18" cy="21" r="2" fill="#33302e"/><circle cx="30" cy="21" r="2" fill="#33302e"/><circle cx="21" cy="31" r="1.3" fill="#33302e"/><circle cx="27" cy="31" r="1.3" fill="#33302e"/><path d="M16 14c3-2 6 0 5 3s-4 2-5-3z" fill="#33302e"/>
</svg>
```

`icons/games/trace-shapes.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Trace Shapes: a star to trace, with the start dot -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 5l5.5 12 13 1.5-9.5 9 2.5 13L24 34l-11.5 6.5 2.5-13-9.5-9 13-1.5z" fill="#fbbf24" stroke-dasharray="5 3"/><circle cx="24" cy="5" r="3.5" fill="#ff6b57"/></g>
</svg>
```

`icons/games/trace-letters.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Trace Letters & Numbers: a capital A on its guide -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M10 40L24 8l14 32M15.5 28h17" fill="none" stroke="#c9c7f5" stroke-width="7"/><path d="M10 40L24 8l14 32M15.5 28h17" fill="none" stroke-dasharray="5 3"/><circle cx="10" cy="40" r="3.5" fill="#ff6b57"/></g>
</svg>
```

`icons/games/trace-name.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Trace Your Name: a name tag with a heart -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="11" width="40" height="26" rx="6" fill="#fff6ea"/><path d="M12 31h24" stroke-dasharray="4 3"/><path d="M24 26c-5-4-7-6-7-9a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 3-2 5-7 9z" fill="#ff6b57"/></g>
</svg>
```

`icons/games/memory-game.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Memory Match: a brain -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M22 10c-6 0-10 4-10 9 0 2-3 4-3 8s3 7 7 7c1 3 4 5 8 5V10z" fill="#ff8fab"/><path d="M26 10c6 0 10 4 10 9 0 2 3 4 3 8s-3 7-7 7c-1 3-4 5-8 5V10z" fill="#ff8fab"/><path d="M24 10v29M15 22c3 0 4 2 4 4M33 22c-3 0-4 2-4 4M18 31c2-1 3-3 3-5M30 31c-2-1-3-3-3-5" fill="none"/></g>
</svg>
```

`icons/games/color-matcher.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Color Matcher: a paint palette -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 8c-10 0-17 7-17 16s7 15 15 15c3 0 4-2 3-4s0-4 3-4h4c4 0 7-3 7-7 0-9-7-16-15-16z" fill="#fff6ea"/><circle cx="15" cy="22" r="3" fill="#ff6b57"/><circle cx="22" cy="15" r="3" fill="#fbbf24"/><circle cx="31" cy="16" r="3" fill="#4ade80"/><circle cx="35" cy="25" r="3" fill="#60a5fa"/></g>
</svg>
```

`icons/games/counting-game.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Count With Me: three blocks with one, two and three dots -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="24" width="16" height="16" rx="3" fill="#60a5fa"/><rect x="26" y="24" width="16" height="16" rx="3" fill="#fbbf24"/><rect x="16" y="7" width="16" height="16" rx="3" fill="#ff6b57"/></g><g fill="#ffffff"><circle cx="14" cy="32" r="2.2"/><circle cx="31" cy="29" r="2.2"/><circle cx="37" cy="35" r="2.2"/><circle cx="20" cy="11" r="2.2"/><circle cx="24" cy="15" r="2.2"/><circle cx="28" cy="19" r="2.2"/></g>
</svg>
```

`icons/games/dot-to-dot.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Dot to Dot: four dots joined by a dashed line -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 7L40 24 24 41 8 24z" stroke-width="2" stroke-dasharray="4 3"/><circle cx="24" cy="7" r="4" fill="#7c3aed"/><circle cx="40" cy="24" r="4" fill="#7c3aed"/><circle cx="24" cy="41" r="4" fill="#7c3aed"/><circle cx="8" cy="24" r="4" fill="#7c3aed"/></g>
</svg>
```

`icons/games/drawing-pad.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Drawing Pad: a sheet with a scribble and two paint dots -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="8" y="6" width="32" height="36" rx="4" fill="#ffffff"/><path d="M14 31c3-8 6-8 9 0s6 8 9 0" fill="none" stroke="#ff6b57" stroke-width="3.5"/><circle cx="18" cy="16" r="4" fill="#4ade80" stroke="none"/><circle cx="30" cy="16" r="4" fill="#60a5fa" stroke="none"/></g>
</svg>
```

`icons/games/peekaboo-pond.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Peekaboo Pond: a lotus on the water -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="24" cy="38" rx="18" ry="6" fill="#60a5fa"/><path d="M24 36c-8-3-12-10-10-18 5 2 9 7 10 12z" fill="#ff8fab"/><path d="M24 36c8-3 12-10 10-18-5 2-9 7-10 12z" fill="#ff8fab"/><path d="M24 36c-5-7-5-18 0-26 5 8 5 19 0 26z" fill="#fff6ea"/></g>
</svg>
```

- [ ] **Step 2: Run the test**

Run: `node --test docs/tests/icons.test.js`
Expected: `icons/games: every file obeys the style rules` PASSES and `no two files draw the same picture` PASSES. The coverage test still FAILS (33 games listed as missing) and the critters/mark tests still fail. If the style test fails it lists every file and rule broken; fix the files, not the rule.

- [ ] **Step 3: Commit**

```bash
git add icons/games
git commit -m "feat(icons): original pictures for the 2+ and 3+ games

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Icons for the 5+ games (10 files)

**Files:**
- Create: `icons/games/sound-it-out.svg`, `sort-it-out.svg`, `tic-tac-toe.svg`, `catch-falling-object.svg`, `balloon-pop.svg`, `whack-a-mole.svg`, `rock-paper-scissors.svg`, `number-line-hop.svg`, `pond-prix.svg`, `pebble-push.svg`

- [ ] **Step 1: Write the ten files**

`icons/games/sound-it-out.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Sound It Out: a speech bubble with sound bars -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8 9h32v23H22l-8 8v-8H8z" fill="#7c3aed"/><path d="M17 17v7M24 14v13M31 17v7" stroke="#ffffff" stroke-width="3.5"/></g>
</svg>
```

`icons/games/sort-it-out.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Sort It Out: a circle and a triangle dropping into two boxes -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="24" width="18" height="18" rx="3" fill="#60a5fa"/><rect x="26" y="24" width="18" height="18" rx="3" fill="#fbbf24"/><circle cx="13" cy="11" r="5" fill="#ef4444"/><path d="M35 5l6 11H29z" fill="#4ade80"/><path d="M13 18v4M35 18v4" stroke-dasharray="2 2"/></g>
</svg>
```

`icons/games/tic-tac-toe.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Tic Tac Toe: the board with a winning line of crosses -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="5" width="38" height="38" rx="5" fill="#fff6ea"/><path d="M18 8v32M30 8v32M8 18h32M8 30h32"/><path d="M10 10l6 6M16 10l-6 6M32 32l6 6M38 32l-6 6M21 21l6 6M27 21l-6 6" stroke="#ff6b57" stroke-width="3"/><circle cx="35" cy="13" r="3.5" fill="none" stroke="#2563eb" stroke-width="3"/><circle cx="13" cy="35" r="3.5" fill="none" stroke="#2563eb" stroke-width="3"/></g>
</svg>
```

`icons/games/catch-falling-object.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Catch the Fruit: an apple -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 14c-3-3-8-3-11 0-5 5-4 16 2 23 3 3 6 3 9 1 3 2 6 2 9-1 6-7 7-18 2-23-3-3-8-3-11 0z" fill="#ef4444"/><path d="M24 14c0-4 2-7 5-8" fill="none"/><path d="M25 11c3-4 8-3 9-2-1 3-5 5-9 2z" fill="#4ade80"/></g>
</svg>
```

`icons/games/balloon-pop.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Balloon Pop: a balloon about to pop -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="22" cy="20" rx="12" ry="14" fill="#ff6b57"/><path d="M19 33h6l-3 4z" fill="#ff6b57"/><path d="M22 37c-3 3 3 6 0 9" fill="none" stroke-width="2"/><path d="M38 6l-3 5M44 12l-5 2M43 4l-5 4" stroke-width="2.5"/></g><ellipse cx="17" cy="14" rx="2.5" ry="4" fill="#ffffff" opacity=".7"/>
</svg>
```

`icons/games/whack-a-mole.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Whack-a-Mole: a mole popping out of its mound -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="24" cy="38" rx="18" ry="6" fill="#b45309"/><ellipse cx="24" cy="36" rx="12" ry="3.5" fill="#33302e" stroke="none"/><ellipse cx="24" cy="26" rx="9" ry="11" fill="#8b5e3c"/><ellipse cx="24" cy="29" rx="3" ry="2" fill="#ff8fab"/></g><circle cx="20.5" cy="24" r="1.8" fill="#33302e"/><circle cx="27.5" cy="24" r="1.8" fill="#33302e"/>
</svg>
```

`icons/games/rock-paper-scissors.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Rock Paper Scissors: a pair of scissors -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M16 21L40 7M16 27l24 14" stroke="#94a3b8" stroke-width="5"/><path d="M16 21L40 7M16 27l24 14" stroke-width="1.5"/><circle cx="11" cy="14" r="6" fill="#ff6b57"/><circle cx="11" cy="34" r="6" fill="#ff6b57"/></g>
</svg>
```

`icons/games/number-line-hop.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Number Line Hop: two hops along a number line -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 34h40"/><path d="M10 30v8M20 30v8M30 30v8M40 30v8"/><path d="M10 28c3-10 7-10 10 0M20 28c3-10 7-10 10 0" fill="none" stroke="#15803d" stroke-width="3"/><circle cx="30" cy="24" r="4" fill="#4ade80"/></g>
</svg>
```

`icons/games/pond-prix.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Pond Prix: a racing kart -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M16 21l4-8h10l4 8z" fill="#c9c7f5"/><rect x="5" y="21" width="38" height="12" rx="4" fill="#ff6b57"/><circle cx="14" cy="34" r="5" fill="#33302e"/><circle cx="34" cy="34" r="5" fill="#33302e"/></g><circle cx="14" cy="34" r="2" fill="#94a3b8"/><circle cx="34" cy="34" r="2" fill="#94a3b8"/>
</svg>
```

`icons/games/pebble-push.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Pebble Push: a pebble pushed towards its target -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M10 10h12M18 6l4 4-4 4" fill="none" stroke="#ff6b57" stroke-width="3"/><circle cx="36" cy="32" r="8" fill="none" stroke-dasharray="3 3"/><ellipse cx="17" cy="32" rx="9" ry="7" fill="#94a3b8"/></g>
</svg>
```

- [ ] **Step 2: Run the test**

Run: `node --test docs/tests/icons.test.js`
Expected: the `icons/games` style test and the duplicate test PASS; the coverage test still FAILS (23 missing).

- [ ] **Step 3: Commit**

```bash
git add icons/games
git commit -m "feat(icons): original pictures for the 5+ games

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Icons for the 7+ games (10 files)

**Files:**
- Create: `icons/games/silly-story-builder.svg`, `clock-shop.svg`, `code-the-robot.svg`, `word-scramble.svg`, `math-puzzle.svg`, `geography-explorer.svg`, `sentence-builder.svg`, `one-line-draw.svg`, `stepping-stones.svg`, `frozen-pond.svg`

- [ ] **Step 1: Write the ten files**

`icons/games/silly-story-builder.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Silly Story Builder: an open book -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 12c-5-4-12-4-18-2v26c6-2 13-2 18 2z" fill="#fff6ea"/><path d="M24 12c5-4 12-4 18-2v26c-6-2-13-2-18 2z" fill="#ffffff"/><path d="M10 18h9M10 24h9M29 18h9M29 24h5" stroke="#c9c7f5"/><path d="M30 31l2 3 3-4" fill="none" stroke="#ff6b57" stroke-width="3"/></g>
</svg>
```

`icons/games/clock-shop.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Clock Shop: a clock face -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><circle cx="24" cy="24" r="18" fill="#ffffff"/><circle cx="24" cy="24" r="14" fill="#dbeafe" stroke="none"/><path d="M24 9v3M24 36v3M9 24h3M36 24h3"/><path d="M24 14v10l7 5" fill="none" stroke-width="3"/><circle cx="24" cy="24" r="2.2" fill="#ff6b57"/></g>
</svg>
```

`icons/games/code-the-robot.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Code the Robot: a robot's head -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 14V9"/><circle cx="24" cy="6" r="3" fill="#ff6b57"/><rect x="10" y="14" width="28" height="24" rx="6" fill="#94a3b8"/><rect x="16" y="20" width="16" height="10" rx="2" fill="#dbeafe"/><path d="M6 22v8M42 22v8"/></g><circle cx="20" cy="25" r="2" fill="#33302e"/><circle cx="28" cy="25" r="2" fill="#33302e"/>
</svg>
```

`icons/games/word-scramble.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Word Scramble: three jumbled letter tiles -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><g transform="rotate(-12 9 24)"><rect x="2" y="17" width="14" height="14" rx="3" fill="#ede9fe"/><path d="M5.5 21h7M9 21v7"/></g><g transform="rotate(8 24 24)"><rect x="17" y="17" width="14" height="14" rx="3" fill="#ede9fe"/><path d="M20.5 28l3.5-8 3.5 8M22 25h4" fill="none"/></g><g transform="rotate(-6 39 24)"><rect x="32" y="17" width="14" height="14" rx="3" fill="#ede9fe"/><path d="M42 21a4.5 4.5 0 1 0 0 6" fill="none"/></g></g>
</svg>
```

`icons/games/math-puzzle.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Math Puzzle: a plus sign and an equals sign -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><circle cx="18" cy="24" r="12" fill="#fef3c7"/><path d="M12 24h12M18 18v12" stroke="#b45309" stroke-width="4"/><path d="M34 19h10M34 29h10" stroke="#2563eb" stroke-width="4"/></g>
</svg>
```

`icons/games/geography-explorer.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Geography Explorer: a globe on its stand -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M16 42h16M24 38v4"/><circle cx="24" cy="22" r="16" fill="#60a5fa"/><path d="M14 14c4-2 8 0 8 4s-5 4-5 8-5 1-6-2 0-8 3-10zM30 26c3-1 6 1 6 4s-4 4-6 2-2-5 0-6zM28 10c3 0 5 2 4 4s-5 0-4-4z" fill="#4ade80"/></g>
</svg>
```

`icons/games/sentence-builder.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Sentence Builder: a noun, a verb and an adjective block in a row -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="18" width="12" height="12" rx="3" fill="#dbeafe"/><rect x="18" y="18" width="12" height="12" rx="3" fill="#fee2e2"/><rect x="32" y="18" width="12" height="12" rx="3" fill="#dcfce7"/><path d="M7 24h6" stroke="#1d4ed8" stroke-width="3"/><path d="M21 24h6" stroke="#b91c1c" stroke-width="3"/><path d="M35 24h6" stroke="#15803d" stroke-width="3"/></g><circle cx="41" cy="36" r="2.2" fill="#33302e"/>
</svg>
```

`icons/games/one-line-draw.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- One Line Draw: the house you draw without lifting the pen -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8 38V18l16-10 16 10v20H8l32-20M8 18l32 20" fill="none" stroke="#7c3aed" stroke-width="3"/><circle cx="8" cy="38" r="3.5" fill="#ff6b57"/></g>
</svg>
```

`icons/games/stepping-stones.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Stepping Stones: stones across the pond, a frog on the far one -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><circle cx="24" cy="24" r="21" fill="#60a5fa" stroke="none"/><ellipse cx="12" cy="34" rx="8" ry="5" fill="#94a3b8"/><ellipse cx="36" cy="34" rx="8" ry="5" fill="#94a3b8"/><ellipse cx="24" cy="19" rx="8" ry="5" fill="#94a3b8"/><circle cx="24" cy="13" r="5" fill="#4ade80"/></g><circle cx="22" cy="11.5" r="1.3" fill="#33302e"/><circle cx="26" cy="11.5" r="1.3" fill="#33302e"/>
</svg>
```

`icons/games/frozen-pond.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Frozen Pond: a snowflake on the ice -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><circle cx="24" cy="24" r="20" fill="#dbeafe"/><path d="M24 8v32M10 16l28 16M10 32l28-16" stroke="#2563eb" stroke-width="3"/><path d="M24 12l-3 3M24 12l3 3M24 36l-3-3M24 36l3-3" stroke="#2563eb" stroke-width="2.5"/><circle cx="24" cy="24" r="4" fill="#ffffff"/></g>
</svg>
```

- [ ] **Step 2: Run the test**

Run: `node --test docs/tests/icons.test.js`
Expected: style and duplicate tests PASS; coverage still FAILS (13 missing).

- [ ] **Step 3: Commit**

```bash
git add icons/games
git commit -m "feat(icons): original pictures for the 7+ games

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Icons for the 14+ games (13 files) and the contact sheet

**Files:**
- Create: `icons/games/science-trivia.svg`, `2048-slider.svg`, `minesweeper.svg`, `sudoku.svg`, `word-guess.svg`, `laser-mirrors.svg`, `twist-cube.svg`, `log-jam.svg`, `molecule-lab.svg`, `projectile-range.svg`, `logic-gates.svg`, `plans-and-elevations.svg`, `net-folding.svg`
- Scratchpad only (not committed): `contact-sheet.html`

- [ ] **Step 1: Write the thirteen files**

`icons/games/science-trivia.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Science Trivia: a flask of green liquid -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M19 6h10v12l10 18a3 3 0 0 1-3 4H12a3 3 0 0 1-3-4l10-18z" fill="#ffffff"/><path d="M15.5 30h17l4.5 8H11z" fill="#4ade80" stroke="none"/><path d="M17 6h14"/></g><circle cx="20" cy="33" r="1.5" fill="#ffffff"/><circle cx="27" cy="35" r="1.2" fill="#ffffff"/>
</svg>
```

`icons/games/2048-slider.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- 2048 Slider: a board with a 2 tile and a 4 tile -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="6" width="36" height="36" rx="5" fill="#d9c8ae"/><rect x="9" y="9" width="14" height="14" rx="2" fill="#fef3c7"/><rect x="25" y="9" width="14" height="14" rx="2" fill="#fbbf24"/><rect x="9" y="25" width="14" height="14" rx="2" fill="#fff6ea" stroke="none"/><rect x="25" y="25" width="14" height="14" rx="2" fill="#fff6ea" stroke="none"/><path d="M13 14c0-3 6-3 6 0 0 2-6 4-6 6h6" fill="none" stroke-width="2.2"/><path d="M34 12v9M30 12l-1 6h6" fill="none" stroke-width="2.2"/></g>
</svg>
```

`icons/games/minesweeper.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Minesweeper: a mine and a flag -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M20 12v6M20 38v6M4 28h6M30 28h6M9 17l4 4M27 35l4 4M9 39l4-4M27 21l4-4" stroke-width="3"/><circle cx="20" cy="28" r="10" fill="#33302e"/><path d="M38 6v18"/><path d="M38 6l8 4-8 4z" fill="#ff6b57"/></g><circle cx="17" cy="25" r="2" fill="#ffffff"/>
</svg>
```

`icons/games/sudoku.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Sudoku: a grid with a few cells filled -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="6" width="36" height="36" rx="3" fill="#ffffff"/><path d="M18 6v36M30 6v36M6 18h36M6 30h36" stroke-width="2"/></g><circle cx="12" cy="12" r="3" fill="#2563eb"/><circle cx="36" cy="24" r="3" fill="#2563eb"/><circle cx="24" cy="36" r="3" fill="#2563eb"/><circle cx="24" cy="12" r="3" fill="#ff6b57"/>
</svg>
```

`icons/games/word-guess.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Word Guess: a row of guess tiles and a question mark -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="16" width="9" height="10" rx="2" fill="#94a3b8"/><rect x="15" y="16" width="9" height="10" rx="2" fill="#fbbf24"/><rect x="26" y="16" width="9" height="10" rx="2" fill="#4ade80"/><rect x="37" y="16" width="9" height="10" rx="2" fill="#4ade80"/><path d="M20 34c0-4 8-4 8 0 0 3-4 3-4 6" fill="none"/></g><circle cx="24" cy="43" r="1.8" fill="#33302e"/>
</svg>
```

`icons/games/laser-mirrors.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Laser Mirrors: a beam bouncing off a mirror to its target -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M10 34h14V14" fill="none" stroke="#ef4444" stroke-width="3.5"/><path d="M18 40l12-12" stroke="#60a5fa" stroke-width="5"/><rect x="2" y="30" width="8" height="8" rx="2" fill="#ff6b57"/><circle cx="24" cy="10" r="4.5" fill="#fbbf24"/></g>
</svg>
```

`icons/games/twist-cube.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Twist Cube: one face of a 2x2 cube and a twist arrow -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="8" width="28" height="28" rx="4" fill="#33302e"/><path d="M40 16a12 12 0 0 1 0 16M38 28l2 5 4-3" fill="none" stroke="#ff6b57" stroke-width="3"/></g><rect x="9" y="11" width="10" height="10" rx="2" fill="#ef4444"/><rect x="21" y="11" width="10" height="10" rx="2" fill="#fbbf24"/><rect x="9" y="23" width="10" height="10" rx="2" fill="#4ade80"/><rect x="21" y="23" width="10" height="10" rx="2" fill="#60a5fa"/>
</svg>
```

`icons/games/log-jam.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Log Jam: logs in a frame, the coral one slides out -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="5" width="38" height="38" rx="4" fill="#dcfce7"/><rect x="9" y="10" width="18" height="6" rx="3" fill="#8b5e3c"/><rect x="29" y="10" width="6" height="18" rx="3" fill="#8b5e3c"/><rect x="9" y="21" width="12" height="6" rx="3" fill="#ff6b57"/><rect x="9" y="32" width="22" height="6" rx="3" fill="#8b5e3c"/><path d="M36 24h6M39 21l3 3-3 3" fill="none" stroke-width="2"/></g>
</svg>
```

`icons/games/molecule-lab.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Molecule Lab: a water molecule -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M24 24L12 36M24 24l12 12"/><circle cx="24" cy="19" r="10" fill="#ef4444"/><circle cx="11" cy="36" r="6" fill="#ffffff"/><circle cx="37" cy="36" r="6" fill="#ffffff"/></g>
</svg>
```

`icons/games/projectile-range.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Projectile Range: a ball on its arc towards the target -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 42h40"/><path d="M8 36c6-26 22-26 32-6" fill="none" stroke-dasharray="3 3"/><rect x="3" y="31" width="10" height="7" rx="2" fill="#94a3b8"/><circle cx="18" cy="17" r="4" fill="#33302e"/><circle cx="40" cy="35" r="5" fill="#ff6b57"/></g><circle cx="40" cy="35" r="2" fill="#ffffff"/>
</svg>
```

`icons/games/logic-gates.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Logic Gates: an AND gate with two inputs on and the output lit -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 18h10M4 30h10M40 24h5"/><path d="M14 10h12a14 14 0 0 1 0 28H14z" fill="#dbeafe"/><circle cx="43" cy="24" r="3" fill="#fbbf24"/></g><circle cx="7" cy="18" r="2.5" fill="#4ade80"/><circle cx="7" cy="30" r="2.5" fill="#4ade80"/>
</svg>
```

`icons/games/plans-and-elevations.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Plans & Elevations: a cube and its plan view -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M4 4h10v10H4zM9 4v10M4 9h10" fill="#ffffff"/><path d="M12 20l14-7 14 7-14 7z" fill="#fff6ea"/><path d="M12 20v14l14 7V27z" fill="#c9c7f5"/><path d="M40 20v14l-14 7V27z" fill="#7c3aed"/></g>
</svg>
```

`icons/games/net-folding.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Net Folding: the cross-shaped net of a cube -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M18 4h12v12h12v12H30v12H18V28H6V16h12z" fill="#dcfce7"/><path d="M18 16h12v12H18z" fill="#ff6b57"/><path d="M18 16V4M30 16V4M18 28v12M30 28v12M6 16h12M30 16h12M6 28h12M30 28h12" stroke-width="2"/></g>
</svg>
```

- [ ] **Step 2: Run the test; coverage must now pass**

Run: `node --test docs/tests/icons.test.js`
Expected: `icons/games: every file obeys the style rules`, `no two files draw the same picture` and `every game in the catalogue has an icon, and no icon is an orphan` all PASS. Only the critters/mark tests still fail.

- [ ] **Step 3: Render a contact sheet and look at it once**

Write this to the session scratchpad as `contact-sheet.html` (NOT in the repo). Replace `C:/Users/shrik/playitmyway-web` if the checkout is elsewhere.

```html
<!doctype html><meta charset="utf-8"><title>icons</title>
<style>body{font:14px system-ui;margin:16px;background:#fff8ef}.g{display:grid;grid-template-columns:repeat(9,1fr);gap:10px}.c{background:#fff;border:2px solid #efe4d3;border-radius:12px;padding:8px;text-align:center}.i{display:inline-grid;place-items:center;width:72px;height:72px;border-radius:50%;background:#ccfbf1}.i img{width:44px;height:44px}.s{width:54px;height:54px;background:#fef3c7}.s img{width:36px;height:36px}</style>
<div class="g" id="g"></div>
<script>
const slugs = ['first-strokes','rainbow-balloons','farm-friends','trace-shapes','trace-letters','trace-name','memory-game','color-matcher','counting-game','dot-to-dot','drawing-pad','peekaboo-pond','sound-it-out','sort-it-out','tic-tac-toe','catch-falling-object','balloon-pop','whack-a-mole','rock-paper-scissors','number-line-hop','pond-prix','pebble-push','silly-story-builder','clock-shop','code-the-robot','word-scramble','math-puzzle','geography-explorer','sentence-builder','one-line-draw','stepping-stones','frozen-pond','science-trivia','2048-slider','minesweeper','sudoku','word-guess','laser-mirrors','twist-cube','log-jam','molecule-lab','projectile-range','logic-gates','plans-and-elevations','net-folding'];
const R = 'file:///C:/Users/shrik/playitmyway-web/icons/games/';
document.getElementById('g').innerHTML = slugs.map(s => `<div class="c"><span class="i"><img src="${R}${s}.svg"></span> <span class="i s"><img src="${R}${s}.svg"></span><br>${s}</div>`).join('');
</script>
```

Run (Git Bash; one Chrome only):
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot="$(cygpath -w "$SCRATCH/contact.png")" "file:///$(cygpath -m "$SCRATCH/contact-sheet.html")"
```
Open `contact.png` with the Read tool and check each icon at both sizes. An icon that is unreadable at 36px, or that could be mistaken for another game's, is redrawn (edit the SVG, keep the rules) and the test re-run. One pass of fixes, then move on.

- [ ] **Step 4: Commit**

```bash
git add icons/games
git commit -m "feat(icons): original pictures for the 14+ games; all 45 games now have one

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The critters, the mark and the favicon

**Files:**
- Create: `icons/critters/clover.svg`, `icons/critters/pip.svg`, `icons/critters/plum.svg`, `icons/critters/mango.svg`, `icons/mark.svg`
- Replace: `favicon.svg`

- [ ] **Step 1: Write the four critters**

`icons/critters/clover.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60"><!-- Clover the Bunny: cream fur, one floppy ear -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M22 26c-4-10-4-20 0-24 4 4 6 14 6 22z" fill="#fff1e4"/><path d="M22 22c-2-7-2-14 0-16 2 2 3 9 3 14z" fill="#ffadc2" stroke="none"/><path d="M40 26c6-8 10-14 16-14-1 6-6 12-12 16z" fill="#fff1e4"/><path d="M42 24c4-5 7-9 11-10-1 4-5 8-9 11z" fill="#ffadc2" stroke="none"/><ellipse cx="32" cy="38" rx="20" ry="17" fill="#fff1e4"/><path d="M28 46q4 3 8 0" fill="none" stroke-width="2"/></g><circle cx="25" cy="36" r="3" fill="#33302e"/><circle cx="39" cy="36" r="3" fill="#33302e"/><circle cx="26" cy="35" r="1" fill="#ffffff"/><circle cx="40" cy="35" r="1" fill="#ffffff"/><ellipse cx="32" cy="42" rx="2.2" ry="1.6" fill="#ff94b0"/><circle cx="19" cy="42" r="3" fill="#ffadc2" opacity=".7"/><circle cx="45" cy="42" r="3" fill="#ffadc2" opacity=".7"/>
</svg>
```

`icons/critters/pip.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60"><!-- Pip the Frog: green, eyes on top -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="32" cy="40" rx="22" ry="16" fill="#97df86"/><circle cx="20" cy="24" r="8" fill="#97df86"/><circle cx="44" cy="24" r="8" fill="#97df86"/><path d="M22 44q10 6 20 0" fill="none" stroke-width="2.2"/></g><circle cx="20" cy="24" r="4" fill="#33302e"/><circle cx="44" cy="24" r="4" fill="#33302e"/><circle cx="21.5" cy="22.5" r="1.3" fill="#ffffff"/><circle cx="45.5" cy="22.5" r="1.3" fill="#ffffff"/><circle cx="14" cy="42" r="3" fill="#ffadc2" opacity=".6"/><circle cx="50" cy="42" r="3" fill="#ffadc2" opacity=".6"/><circle cx="26" cy="34" r="2" fill="#7cc86f"/><circle cx="40" cy="33" r="1.6" fill="#7cc86f"/>
</svg>
```

`icons/critters/plum.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60"><!-- Plum the Baby Dino: lilac, peach spikes, cream tummy -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M20 20l4-9 4 9M28 16l4-9 4 9M36 20l4-9 4 9" fill="#ffb48f"/><ellipse cx="32" cy="38" rx="21" ry="17" fill="#c2b2fb"/><ellipse cx="32" cy="46" rx="11" ry="7" fill="#fff0d4" stroke="none"/><path d="M27 42q5 4 10 0" fill="none" stroke-width="2"/></g><circle cx="24" cy="35" r="3" fill="#33302e"/><circle cx="40" cy="35" r="3" fill="#33302e"/><circle cx="25" cy="34" r="1" fill="#ffffff"/><circle cx="41" cy="34" r="1" fill="#ffffff"/><circle cx="29" cy="39" r="1" fill="#8f7ad8"/><circle cx="35" cy="39" r="1" fill="#8f7ad8"/>
</svg>
```

`icons/critters/mango.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 60"><!-- Mango the Kitten: orange with stripes and whiskers -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M14 30L12 8l16 10z" fill="#ffcf9c"/><path d="M50 30L52 8 36 18z" fill="#ffcf9c"/><path d="M16 26l-1-12 9 6z" fill="#ffb3c6" stroke="none"/><path d="M48 26l1-12-9 6z" fill="#ffb3c6" stroke="none"/><ellipse cx="32" cy="38" rx="21" ry="16" fill="#ffcf9c"/><path d="M26 23l2 6M32 22v6M38 23l-2 6" stroke="#f4a35c" stroke-width="3"/><path d="M30 41h4l-2 2z" fill="#ff8fab" stroke="none"/><path d="M28 46q4 2 8 0M8 38l12 2M8 44l12-1M56 38l-12 2M56 44l-12-1" fill="none" stroke-width="2"/></g><circle cx="24" cy="36" r="3" fill="#33302e"/><circle cx="40" cy="36" r="3" fill="#33302e"/><circle cx="25" cy="35" r="1" fill="#ffffff"/><circle cx="41" cy="35" r="1" fill="#ffffff"/>
</svg>
```

- [ ] **Step 2: Write the mark, and copy it to favicon.svg**

`icons/mark.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><!-- Play It My Way: a play badge with confetti -->
<rect width="64" height="64" rx="16" fill="#ff6b57"/><path d="M25 22l22 13-22 13z" fill="#9a3412"/><path d="M25 18l22 13-22 13z" fill="#fff6ea"/><circle cx="13" cy="13" r="3" fill="#fbbf24"/><circle cx="51" cy="11" r="2.5" fill="#c9c7f5"/><circle cx="53" cy="52" r="3" fill="#4ade80"/><circle cx="11" cy="50" r="2.2" fill="#ff8fab"/>
</svg>
```

Then: `cp icons/mark.svg favicon.svg` (favicon is the same file content; the old controller drawing is gone).

- [ ] **Step 3: Run the test**

Run: `node --test docs/tests/icons.test.js`
Expected: every test in the file PASSES (critters palette check uses the colours from `critters.js`; the mark has no ink stroke and is allowed none).

- [ ] **Step 4: Commit**

```bash
git add icons/critters icons/mark.svg favicon.svg
git commit -m "feat(icons): the four critters drawn flat, and a brand mark that is also the favicon

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Homepage: cards, grid, hero and theme colour

**Files:**
- Modify: `index.html` (lines 8, 73-85 hero, all 45 `.game-icon` spans)
- Modify: `styles.css` (`.hero` at line 37, `.hero h1` at 47, `.game-grid` at 142, `.game-icon` at 178, the 560px and 480px blocks at 322 and 373)
- Modify: `docs/tests/icons.test.js` (append)

**Interfaces:**
- Produces: hero markup pattern (`hero has-critters`, `.hero-mark`, `.hero-critters`) that Task 8 repeats in the generator; card pattern `<span class="game-icon" aria-hidden="true"><img src="…/icons/games/<slug>.svg" alt="" width="44" height="44"></span>`.

- [ ] **Step 1: Append the homepage checks to the test**

Add to the end of `docs/tests/icons.test.js`:

```js
/* Pages that show game cards: no card may still hold an emoji, and every
 * picture must point at a file that exists. `up` is the page's path back to
 * the site root. */
function checkCards(page, up) {
  const html = read(...page.split('/'));
  const cards = Array.from(html.matchAll(/<span class="game-icon" aria-hidden="true">([\s\S]*?)<\/span>/g));
  assert.ok(cards.length > 0, `${page}: no game cards found`);
  for (const [, inner] of cards) {
    /* the prefix group is '' at the root and '../' one folder down */
    const m = inner.trim().match(/^<img src="((?:\.\.\/)*)icons\/games\/([a-z0-9-]+)\.svg" alt="" width="44" height="44">$/);
    assert.ok(m, `${page}: a card still holds ${JSON.stringify(inner.trim())}`);
    assert.equal(m[1], up, `${page}: icon path prefix should be ${JSON.stringify(up)}`);
    assert.ok(exists('icons', 'games', m[2] + '.svg'), `${page}: ${m[2]}.svg does not exist`);
  }
  return cards.length;
}

function checkHero(page, up) {
  const html = read(...page.split('/'));
  assert.ok(html.includes('<header class="hero has-critters">'), `${page}: hero needs has-critters`);
  assert.ok(html.includes(`<img class="hero-mark" src="${up}icons/mark.svg" alt="" width="44" height="44">`), `${page}: hero mark missing`);
  for (const c of ['clover', 'pip', 'plum', 'mango']) {
    assert.ok(html.includes(`<img src="${up}icons/critters/${c}.svg" alt="" width="72" height="68">`), `${page}: ${c} missing from the hero`);
  }
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/)[1];
  assert.ok(!hasPicto(h1), `${page}: the title still holds an emoji`);
}

test('homepage: every card shows its icon, the hero has the mark and the critters', () => {
  assert.equal(checkCards('index.html', ''), C.games.length);
  checkHero('index.html', '');
  assert.ok(read('index.html').includes('<meta name="theme-color" content="#2b2a5e" />'));
});
```

Run: `node --test docs/tests/icons.test.js`
Expected: the new test FAILS with `index.html: a card still holds "🌈"`.

- [ ] **Step 2: Swap the 45 card emoji for images with a throwaway script**

Save as `$SCRATCH/swap-cards.js` (not in the repo) and run `node "$SCRATCH/swap-cards.js" index.html` from the repo root:

```js
const fs = require('fs');
const file = process.argv[2];
let html = fs.readFileSync(file, 'utf8');
let n = 0;
html = html.replace(
  /<a class="game-card" href="games\/([a-z0-9-]+)\/index\.html">(\s*)<span class="game-icon" aria-hidden="true">[^<]*<\/span>/g,
  (m, slug, ws) => {
    n++;
    return `<a class="game-card" href="games/${slug}/index.html">${ws}<span class="game-icon" aria-hidden="true"><img src="icons/games/${slug}.svg" alt="" width="44" height="44"></span>`;
  }
);
fs.writeFileSync(file, html);
console.log(n, 'cards swapped');
```

Expected output: `45 cards swapped`. Then `git diff --stat index.html` shows 45 changed lines.

- [ ] **Step 3: Edit the hero and the theme colour in index.html**

Line 8: `<meta name="theme-color" content="#c2410c" />` → `<meta name="theme-color" content="#2b2a5e" />`

Replace the hero block (lines 73–85) with:

```html
    <header class="hero has-critters">
      <h1><img class="hero-mark" src="icons/mark.svg" alt="" width="44" height="44">Play It My Way</h1>
      <p class="tagline">Seriously fun learning. 45 hand-built games.</p>
      <p class="hero-links">
        <a class="candy candy-coral" href="games/">▶ Pick a game</a>
        <a class="candy candy-cream" href="for-teachers.html">👋 For grown-ups</a>
      </p>
      <ul class="trust-badges">
        <li>No ads. Ever.</li>
        <li>No tracking. Ever.</li>
        <li>Nothing stored. Ever.</li>
        <li>Free. Actually free.</li>
      </ul>
      <!-- the four critters stand on the hero's edge; decorative, so hidden from assistive tech -->
      <ul class="hero-critters" aria-hidden="true">
        <li><img src="icons/critters/clover.svg" alt="" width="72" height="68"></li>
        <li><img src="icons/critters/pip.svg" alt="" width="72" height="68"></li>
        <li><img src="icons/critters/plum.svg" alt="" width="72" height="68"></li>
        <li><img src="icons/critters/mango.svg" alt="" width="72" height="68"></li>
      </ul>
    </header>
```

- [ ] **Step 4: Edit styles.css**

Change the section comment above `.hero` (line 35) from `/* --- Hero: flat deep band, no gradient, no text shadows ------------------ */` to `/* --- Hero: deep band with confetti dots, no text shadows ----------------- */`, then replace the `.hero` rule (line 37) and `.hero h1` (line 47) with:

```css
.hero {
  position: relative;
  text-align: center;
  color: var(--color-deep-ink);
  padding: var(--space-7) var(--space-4) var(--space-6);
  border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  /* confetti: four dot layers on different tile sizes so they never line up
     into a grid. Pure CSS, no asset, and it stays behind the text. */
  background-color: var(--color-deep);
  background-image:
    radial-gradient(circle at 20% 30%, rgba(251, 191, 36, 0.5) 2px, transparent 3px),
    radial-gradient(circle at 70% 60%, rgba(255, 107, 87, 0.5) 2.5px, transparent 3.5px),
    radial-gradient(circle at 40% 85%, rgba(201, 199, 245, 0.55) 1.5px, transparent 2.5px),
    radial-gradient(circle at 85% 15%, rgba(74, 222, 128, 0.45) 2px, transparent 3px);
  background-size: 90px 70px, 120px 90px, 70px 110px, 150px 130px;
}

/* homepage and catalogue: room for the critters standing on the bottom edge */
.hero.has-critters {
  padding-bottom: 64px;
  margin-bottom: 36px;
}

/* The vw term has to be able to win on a phone: with an em-based minimum
   this rendered at 43px on a 390px screen and pushed the games off-screen. */
.hero h1 {
  margin: 0;
  font-size: clamp(1.75rem, 7.5vw, 3.4em);
  font-weight: 700;
  line-height: 1.05;
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
}

/* the brand mark, sized from the heading itself */
.hero-mark {
  width: 0.9em;
  height: 0.9em;
  flex: none;
}

.hero-critters {
  list-style: none;
  margin: 0;
  padding: 0;
  position: absolute;
  left: 0;
  right: 0;
  bottom: -36px;
  display: flex;
  justify-content: center;
  gap: 4px;
  pointer-events: none;
}

.hero-critters img {
  display: block;
  width: 72px;
  height: 68px;
  filter: drop-shadow(0 4px 0 rgba(43, 42, 94, 0.18));
}
```

Replace the `.game-grid` rule (line 142) with:

```css
/* auto-fit (not auto-fill) so a short row collapses its empty tracks and the
   cards centre; the 190px cap stops a two-game band stretching to half-page slabs */
.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 190px));
  justify-content: center;
  gap: var(--space-4);
}
```

After the `.game-icon` rule (line 178) add:

```css
.game-icon img {
  display: block;
  width: 44px;
  height: 44px;
}
```

Inside the `@media (max-width: 560px)` block, after the `.hero` rule there, add:

```css
  .hero.has-critters {
    padding-bottom: 52px;
    margin-bottom: 28px;
  }

  .hero-critters {
    bottom: -28px;
  }

  .hero-critters img {
    width: 56px;
    height: 53px;
  }
```

Inside the `@media (max-width: 480px)` block, after the `.game-icon` rule there, add:

```css
  .game-icon img {
    width: 36px;
    height: 36px;
  }
```

- [ ] **Step 5: Run the test and look once**

Run: `node --test docs/tests/icons.test.js`
Expected: the homepage test PASSES.

Screenshot (Git Bash, from the repo root):
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1400 --screenshot="$(cygpath -w "$SCRATCH/home-desk.png")" "file:///C:/Users/shrik/playitmyway-web/index.html"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=500,1400 --screenshot="$(cygpath -w "$SCRATCH/home-phone.png")" "file:///C:/Users/shrik/playitmyway-web/index.html"
```
(Chrome's minimum window width is about 500px, so the phone shot is taken at 500 and the 480px rules will not be active; the 560px rules will.) Read both PNGs. Check: the mark sits on the title's centre line; the four critters overlap the hero's bottom edge and clear the "AGES 2+" eyebrow; the two First Steps cards are card-sized and centred; icons are crisp in their circles. Fix anything wrong in `styles.css`, re-screenshot once.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css docs/tests/icons.test.js
git commit -m "feat(home): original icons on every card, the critters and the mark on the hero, short rows centred

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The generator and the catalogue

**Files:**
- Modify: `docs/catalogue.js` (every game entry loses `emoji:`; skill entries keep theirs)
- Modify: `docs/build-pages.js` (`head()` theme colour; `PAGE_CSS` `.page-intro`; `TEACHER_CSS`; catalogue hero at line 227; cards at 259 and 396; table cell at 346)
- Regenerate: `games/index.html`, `for-teachers.html`, `404.html`, `sw.js`
- Modify: `docs/tests/icons.test.js` (append)

**Interfaces:**
- Consumes: `checkCards(page, up)` and `checkHero(page, up)` from Task 7's test code.

- [ ] **Step 1: Append the generated-page checks to the test**

```js
test('catalogue and 404: every card shows its icon; the catalogue hero has the critters', () => {
  assert.equal(checkCards('games/index.html', '../'), C.games.length);
  checkHero('games/index.html', '../');
  assert.equal(checkCards('404.html', ''), 6);
});

test('for grown-ups: every table row shows its icon', () => {
  const html = read('for-teachers.html');
  for (const g of C.games) {
    assert.ok(html.includes(`<a href="games/${g.slug}/"><img class="row-icon" src="icons/games/${g.slug}.svg" alt="" width="22" height="22"> `), `${g.slug} row has no icon`);
  }
});

test('the catalogue carries no game emoji any more', () => {
  for (const g of C.games) assert.equal(g.emoji, undefined, `${g.slug} still has an emoji field`);
});

test('the service worker precaches every icon', () => {
  const sw = read('sw.js');
  for (const g of C.games) assert.ok(sw.includes(`"/icons/games/${g.slug}.svg"`), `${g.slug}.svg not precached`);
  for (const c of ['clover', 'pip', 'plum', 'mango']) assert.ok(sw.includes(`"/icons/critters/${c}.svg"`));
  assert.ok(sw.includes('"/icons/mark.svg"'));
});
```

Run: `node --test docs/tests/icons.test.js`
Expected: the four new tests FAIL.

- [ ] **Step 2: Remove `emoji` from every game entry in the catalogue**

In `docs/catalogue.js`, for each of the 45 entries in `games`, delete the ` emoji: '…',` part of the first line, e.g.

```js
    { slug: 'memory-game', name: 'Memory Match', age: '3', mins: '5',
```

Leave the seven `skills` entries exactly as they are. Quick check: `grep -c "emoji:" docs/catalogue.js` prints `7`.

- [ ] **Step 3: Edit the generator**

In `head()`: `<meta name="theme-color" content="#c2410c" />` → `<meta name="theme-color" content="#2b2a5e" />`.

In `PAGE_CSS`, the `.page-intro` rule: change `margin: 0 auto 8px;` to `margin: 12px auto 8px;` (the critters overhang the hero by 36px; the intro must not touch them).

In `TEACHER_CSS`, after the `table.games td.g a:hover { text-decoration: underline; }` line (line 171) add:

```css
      table.games .row-icon { width: 22px; height: 22px; vertical-align: -5px; margin-right: 4px; }
```

In `buildGamesIndex()`, replace the hero (lines 227–236) with:

```js
    <header class="hero has-critters">
      <h1><img class="hero-mark" src="../icons/mark.svg" alt="" width="44" height="44">All Games</h1>
      <p class="tagline">${C.games.length} games. Every one worth playing.</p>
      <ul class="trust-badges">
        <li>No ads. Ever.</li>
        <li>No tracking. Ever.</li>
        <li>Nothing stored. Ever.</li>
        <li>Free. Actually free.</li>
      </ul>
      <ul class="hero-critters" aria-hidden="true">
        <li><img src="../icons/critters/clover.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/pip.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/plum.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/mango.svg" alt="" width="72" height="68"></li>
      </ul>
    </header>
```

The catalogue card (line 259):
```js
            <span class="game-icon" aria-hidden="true"><img src="../icons/games/${g.slug}.svg" alt="" width="44" height="44"></span>
```

The For Grown-Ups table cell (line 346):
```js
                <td class="g"><a href="games/${g.slug}/"><img class="row-icon" src="icons/games/${g.slug}.svg" alt="" width="22" height="22"> ${esc(g.name)}</a></td>
```

The 404 card (line 396):
```js
            <span class="game-icon" aria-hidden="true"><img src="icons/games/${g.slug}.svg" alt="" width="44" height="44"></span>
```

Check nothing else reads a game emoji: `grep -n "g\.emoji" docs/build-pages.js` prints nothing. (`skill.emoji` on line 336 stays.)

- [ ] **Step 4: Regenerate and test**

Run: `node docs/build-pages.js`
Expected: it rewrites `games/index.html`, `for-teachers.html`, `404.html` and `sw.js` without error. `git status --short` lists exactly those four plus the two docs files.

Run: `node --test docs/tests/icons.test.js`
Expected: all tests PASS, including the precache test (the walk already includes `.svg`).

Run: `node docs/build-pages.js && git status --short` once more.
Expected: no new changes (the generator is byte-identical on re-run).

- [ ] **Step 5: Commit**

```bash
git add docs/catalogue.js docs/build-pages.js games/index.html for-teachers.html 404.html sw.js docs/tests/icons.test.js
git commit -m "feat(pages): generated catalogue, 404 and grown-ups pages use the icon files; precache includes them

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Game-page titles

**Files:**
- Modify: `components.css` (append one rule)
- Modify: all 45 `games/<slug>/index.html` (first `<h1>` only)
- Modify: `docs/tests/icons.test.js` (append)

- [ ] **Step 1: Append the title check to the test**

```js
test('every game page shows its icon in the title instead of an emoji', () => {
  for (const g of C.games) {
    const html = read('games', g.slug, 'index.html');
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(m, `${g.slug}: no <h1>`);
    assert.ok(m[1].startsWith(`<img class="title-icon" src="../../icons/games/${g.slug}.svg" alt="" width="40" height="40"> `), `${g.slug}: title does not start with its icon`);
    assert.ok(!hasPicto(m[1]), `${g.slug}: title still holds an emoji`);
    assert.ok(!m[1].includes('<span aria-hidden="true">'), `${g.slug}: title still has an emoji span`);
  }
});
```

Run: `node --test docs/tests/icons.test.js`
Expected: FAILS on the first game (`2048-slider: title does not start with its icon`).

- [ ] **Step 2: Add the sizing rule to components.css**

Append to `components.css`, before the `/* ===== App shell` block:

```css
/* Game-page title icon: the game's own picture from icons/games/, sized from
   the heading so it sits on the text's centre line at any heading size. */
.title-icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.12em;
  margin-right: 0.15em;
}
```

- [ ] **Step 3: Swap every title with a throwaway script**

Save as `$SCRATCH/swap-titles.js` and run `node "$SCRATCH/swap-titles.js" "C:/Users/shrik/playitmyway-web"`:

```js
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const C = require(path.join(ROOT, 'docs', 'catalogue.js'));
/* emoji, plus the invisible joiners and keycaps that ride on them (U+FE0F,
   U+20E3, U+200D), built from code points so this file holds none itself */
const JOINERS = String.fromCodePoint(0xfe0f, 0x20e3, 0x200d);
const LEAD = new RegExp('^[\\s\\p{Extended_Pictographic}' + JOINERS + ']+', 'u');
const TAIL = new RegExp('[\\s\\p{Extended_Pictographic}' + JOINERS + ']+$', 'u');

for (const g of C.games) {
  const file = path.join(ROOT, 'games', g.slug, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<h1([^>]*)>([\s\S]*?)<\/h1>/);      // the FIRST h1 only
  if (!m) throw new Error(g.slug + ': no <h1>');
  let inner = m[2]
    .replace(/<span aria-hidden="true">[^<]*<\/span>/g, '') // legacy pages wrap the emoji
    .replace(LEAD, '')                                      // newer pages put it in the text
    .replace(TAIL, '');
  const img = `<img class="title-icon" src="../../icons/games/${g.slug}.svg" alt="" width="40" height="40"> `;
  html = html.slice(0, m.index) + `<h1${m[1]}>${img}${inner}</h1>` + html.slice(m.index + m[0].length);
  fs.writeFileSync(file, html);
  console.log(g.slug.padEnd(22), JSON.stringify(inner));
}
```

Expected: 45 lines, each showing the clean title text, e.g. `tic-tac-toe            "Tic Tac Toe"` (both of its spans gone), `2048-slider            "2048"`, `plans-and-elevations   "Plans &amp; Elevations"`. `git diff --stat` shows 45 game pages with one changed line each (plus components.css).

- [ ] **Step 4: Run the whole suite**

Run: `node --test docs/tests/*.test.js`
Expected: everything PASSES, including the pre-existing game tests (they read logic out of the pages; the title line does not affect them).

- [ ] **Step 5: Look at two pages once**

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,700 --screenshot="$(cygpath -w "$SCRATCH/memory.png")" "file:///C:/Users/shrik/playitmyway-web/games/memory-game/index.html"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,700 --screenshot="$(cygpath -w "$SCRATCH/logic.png")" "file:///C:/Users/shrik/playitmyway-web/games/logic-gates/index.html"
```
Read both. The icon sits beside the title at the text's size. (Logic Gates draws with WebGL; its board may be blank in a plain headless shot. Only the title matters here.)

- [ ] **Step 6: Commit**

```bash
git add components.css games/*/index.html docs/tests/icons.test.js
git commit -m "feat(games): every game's title shows its own icon instead of an emoji

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: App icons from the mark

**Files:**
- Replace: `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `apple-touch-icon.png`
- Scratchpad only: `raster.js`

- [ ] **Step 1: Install puppeteer-core outside the repo**

```bash
mkdir -p "$TEMP/pimw-puppeteer" && cd "$TEMP/pimw-puppeteer" && npm init -y >/dev/null && npm install puppeteer-core@24 --no-audit --no-fund
```
Expected: `added N packages`. Nothing is written into the repo. (Puppeteer-core drives the Chrome already installed; it downloads no browser.)

- [ ] **Step 2: Write the rasteriser**

Save as `$SCRATCH/raster.js`:

```js
/* Rasterises icons/mark.svg into the PNG app icons, using the installed Chrome. */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const mark = fs.readFileSync(path.join(ROOT, 'icons', 'mark.svg'), 'utf8')
  .replace('<svg ', '<svg style="display:block;width:100%;height:100%" ');

/* scale: how much of the square the mark fills. The maskable icon keeps the
   mark inside the 80% safe zone on a solid blueberry ground; iOS ignores
   transparency, so the Apple icon also gets the ground. */
const jobs = [
  { out: 'icons/icon-192.png', size: 192, bg: 'transparent', scale: 1 },
  { out: 'icons/icon-512.png', size: 512, bg: 'transparent', scale: 1 },
  { out: 'icons/icon-maskable-512.png', size: 512, bg: '#2b2a5e', scale: 0.8 },
  { out: 'apple-touch-icon.png', size: 180, bg: '#2b2a5e', scale: 0.86 },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  for (const j of jobs) {
    await page.setViewport({ width: j.size, height: j.size, deviceScaleFactor: 1 });
    const inner = Math.round(j.size * j.scale);
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${j.size}px;height:${j.size}px;background:${j.bg};display:grid;place-items:center"><div style="width:${inner}px;height:${inner}px">${mark}</div></body></html>`);
    await page.screenshot({
      path: path.join(ROOT, j.out),
      omitBackground: j.bg === 'transparent',
      clip: { x: 0, y: 0, width: j.size, height: j.size },
    });
    console.log('wrote', j.out, j.size + 'x' + j.size);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it and check the sizes**

```bash
NODE_PATH="$TEMP/pimw-puppeteer/node_modules" node "$SCRATCH/raster.js" "C:/Users/shrik/playitmyway-web"
node -e "for (const f of ['icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','apple-touch-icon.png']) { const b=require('fs').readFileSync(f); console.log(f, b.readUInt32BE(16)+'x'+b.readUInt32BE(20)) }"
```
Expected: four `wrote …` lines, then `192x192`, `512x512`, `512x512`, `180x180` (PNG width and height live at bytes 16 and 20). Read `icons/icon-512.png` and `icons/icon-maskable-512.png` with the Read tool: the first is the coral rounded square on transparency, the second the same mark smaller on a blueberry ground.

- [ ] **Step 4: Commit**

```bash
git add icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png apple-touch-icon.png
git commit -m "feat(icons): app icons and the Apple touch icon re-made from the mark

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Legacy gradients

**Files:**
- Modify: `games/memory-game/index.html` (lines 178-227), `games/word-scramble/index.html` (lines 201-207), `games/geography-explorer/index.html` (line 205), `games/tic-tac-toe/index.html` (lines 133-170)
- Modify (comment only): `games/balloon-pop/index.html` (line 133), `games/catch-falling-object/index.html` (107), `games/whack-a-mole/index.html` (144, 172), `games/color-matcher/index.html` (191, 199, 207)
- Modify: `docs/tests/icons.test.js` (append)

- [ ] **Step 1: Append the gradient check to the test**

```js
/* The August restyle left fifteen gradients behind. The old-palette ones
 * (coral-to-teal and friends) are gone; the ones that ARE the game (a sky,
 * the ground, a colour channel) stay and say so in a comment on the line above. */
test('legacy gradients: only game-content ones remain, each with a kept comment', () => {
  for (const slug of ['memory-game', 'word-scramble', 'geography-explorer', 'tic-tac-toe']) {
    assert.ok(!read('games', slug, 'index.html').includes('linear-gradient'), `${slug} still has a gradient`);
  }
  for (const slug of ['balloon-pop', 'catch-falling-object', 'whack-a-mole', 'color-matcher']) {
    const lines = read('games', slug, 'index.html').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('linear-gradient')) {
        assert.ok(/\/\* kept: /.test(lines[i - 1]), `${slug} line ${i + 1}: gradient without a "kept:" comment above it`);
      }
    });
  }
});
```

Run: `node --test docs/tests/icons.test.js`
Expected: FAILS with `memory-game still has a gradient`.

- [ ] **Step 2: Memory Match**

In `games/memory-game/index.html`:

`.card` (line 181): `background: linear-gradient(45deg, #ff6b6b, #4ecdc4);` → `background: var(--color-teal);`

`.card.matched` (line 206): `background: linear-gradient(45deg, #a8e6cf, #88d8c0);` → `background: var(--color-green-tint);`

`.card-front` (lines 223-227), replace the whole rule with:
```css
      .card-front {
        background: var(--color-teal);
        color: white;
      }
```

- [ ] **Step 3: Word Scramble**

In `games/word-scramble/index.html`, replace the comment and the first lines of `.letter-tile` (lines 201-208) so the rule starts:
```css
      /* letter tiles in the page's own violet, on an ink border; the token
         radius, hard under-shadow and sinking press were already here */
      .letter-tile {
        width: 50px;
        height: 50px;
        background: var(--color-violet);
        color: white;
        border: 3px solid var(--candy-violet);
```
(the rest of the rule is unchanged).

- [ ] **Step 4: Geography Explorer**

Line 205: `background: linear-gradient(45deg, #4ecdc4, #44a08d);` → `background: #dbeafe; /* the sea */`

- [ ] **Step 5: Tic Tac Toe**

Line 136: `background: linear-gradient(45deg, #f0f0f0, #e0e0e0);` → `background: white;`
Line 150: `background: linear-gradient(45deg, #e8e8e8, #d8d8d8);` → `background: var(--color-amber-tint);`
Line 169: `background: linear-gradient(45deg, #a8e6cf, #88d8c0);` → `background: var(--color-green-tint);`

Also the two old-palette marks that sit on those cells (lines 154-162): replace both rules with
```css
      .cell.x {
        color: var(--wc-verb);
      }

      .cell.o {
        color: var(--wc-noun);
      }
```
(red X, blue O: both AA on white at this size; the text-shadows go with the gradients).

- [ ] **Step 6: Mark the kept ones**

Insert a comment on the line directly above each remaining gradient, with the file's indentation:

`games/balloon-pop/index.html` above line 133: `        /* kept: this gradient is the sky the balloons float in */`
`games/catch-falling-object/index.html` above line 107: `        /* kept: sky down to grass, the scene the fruit falls through */`
`games/whack-a-mole/index.html` above line 144: `        /* kept: sky, grass and soil, the scene the moles pop out of */` and above line 172: `        /* kept: the soil of the mound */`
`games/color-matcher/index.html` above each of lines 191, 199, 207: `        /* kept: the slider shows its colour channel from none to full */`

- [ ] **Step 7: Test, look once, commit**

Run: `node --test docs/tests/*.test.js`
Expected: all PASS.

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot="$(cygpath -w "$SCRATCH/memory2.png")" "file:///C:/Users/shrik/playitmyway-web/games/memory-game/index.html"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot="$(cygpath -w "$SCRATCH/ttt.png")" "file:///C:/Users/shrik/playitmyway-web/games/tic-tac-toe/index.html"
```
Read both: flat teal card backs with a white question mark; white cells with an ink border.

```bash
git add games/memory-game/index.html games/word-scramble/index.html games/geography-explorer/index.html games/tic-tac-toe/index.html games/balloon-pop/index.html games/catch-falling-object/index.html games/whack-a-mole/index.html games/color-matcher/index.html docs/tests/icons.test.js
git commit -m "style(games): retire the last old-palette gradients; the scene gradients stay and say why

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Final check and hand-off

**Files:** none new.

- [ ] **Step 1: Full suite, generator idempotence, no third-party references**

```bash
node --test docs/tests/*.test.js
node docs/build-pages.js && git status --short
grep -rlE "https?://(fonts\.googleapis|cdn|unpkg|cdnjs)" --include=*.html --include=*.css --include=*.js . | grep -v node_modules | grep -v "^./docs/"
```
Expected: all tests pass; `git status --short` prints nothing (the generator changed nothing); the grep prints nothing.

- [ ] **Step 2: Final screenshots for the hand-off**

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,2200 --screenshot="$(cygpath -w "$SCRATCH/final-home.png")" "file:///C:/Users/shrik/playitmyway-web/index.html"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,1400 --screenshot="$(cygpath -w "$SCRATCH/final-catalogue.png")" "file:///C:/Users/shrik/playitmyway-web/games/index.html"
```
Read both and confirm: no emoji left in any card, critters on both heroes, the mark in both titles, short rows centred.

- [ ] **Step 3: Report**

Report to the user: the branch name, the commit list (`git log --oneline main..candy-illustrated`), the two final screenshots, and that `main` has not been touched. Pushing is the user's decision; the command that avoids the account-picker dialog is `git -c credential.https://github.com.username=viks120 push origin main` after a fast-forward merge.
