# What's Different? and Spot the Difference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two spot-the-difference games, What's Different? (3+) and Spot the Difference (7+), built on one shared 2D scene kit, as specified in `docs/superpowers/specs/2026-10-18-spot-the-difference-design.md`.

**Architecture:** `games/shared/spot/scenes.js` is pure logic (seeded scenes, the difference engine, fairness by construction) and runs in Node for tests; `draw.js` turns a scene into SVG strings, also in Node; `play.js` is the DOM play loop both pages share. Each game is `index.html` + a ten-line `game.js` that calls `Play.start` with its band. Icons, catalogue, homepage, sitemap, counts and generated pages are wired in one task at the end so the icon coverage tests stay green at every commit.

**Tech Stack:** plain HTML/CSS/JS (classic scripts, no modules, no build), inline SVG, WebAudio, `games/shared/voice.js`, `node:test`, puppeteer-core with the installed Chrome for the end-to-end player (scratchpad only, never in the repo).

## Global Constraints

- Nothing stored: no cookies, no `localStorage`, no `sessionStorage`, no `fetch`, no third-party requests. Every page must open over `file://`, so scripts are classic `<script src>` with relative paths, never `type="module"`.
- Only the site's own artwork, drawn in code: ink `#33302e` outlines at 2.5 picture units with round joins and caps, flat fills, no gradients, no `<text>`, no filters. The four critters are placed as `<image>` from `icons/critters/` and are never redrawn.
- Voice (3+ only) goes through `games/shared/voice.js` (`Voice.say`, `Voice.stop`, `Voice.ready`); it already honours `window.pimwMuted` and only uses on-device voices.
- Every sound function starts with `if (window.pimwMuted) return;`.
- Picture box `viewBox="0 0 400 300"`; lanes by item base: sky 30–90, back 150–175, air 100–190, water 170–255, ground 200–295; bounding-box padding 4; region gap 6; 3+ minimum region radius 36, size factor 1.8, minimum half-extent 16 (12 at level 7); 7+ minimum radius 24, size factor 1.3, minimum half-extent 10 (8 at tier 3); shade and tilt need a half-extent of at least 14; shift 14–20 units; tilt 20°.
- Script order on a page: `../shared/voice.js` (3+ only), `../shared/spot/scenes.js`, `../shared/spot/draw.js`, `../shared/spot/play.js`, `game.js`, `../../components.js`.
- Tests: `node --test docs/tests/*.test.js` (in PowerShell: `node --test (Get-ChildItem docs/tests/*.test.js).FullName`). Never run `python`; never run `chrome.exe --version`.
- Edit files with the Write/Edit tools or node, never a PowerShell read-replace-write (encoding traps). Bash heredocs over ~70 lines fail here; use the Write tool.
- The icon test `docs/tests/icons.test.js` fails on any icon without a catalogue entry and any catalogue entry without a homepage card, a generated card, a title icon and a precache line, so **icons, catalogue, homepage cards, sitemap, counts and `node docs/build-pages.js` land together in Task 6** and never earlier.
- Another session is building a different game (Missing Tile) in the main working tree. **Work in a git worktree on branch `spot-the-difference`** (`git worktree add .claude/worktrees/spot -b spot-the-difference`), and never touch `docs/vendor/three-entry.js`, `games/missing-tile/` or that spec. Commit as soon as each task's tests pass.
- Game count wiring (homepage tagline, `manifest.json`) rises by **two from whatever `main` holds at release**, not to a fixed number.

## File map

| File | Responsibility |
|---|---|
| `games/shared/spot/scenes.js` | kinds table, palette, lanes, level/tier tables, seeded layout, differences, regions, `hit`, `theme`, `tier`, `nextLevel`, `stars`, `box` |
| `games/shared/spot/draw.js` | `backdrop(theme)`, `DRAWERS[kind]`, `picture(items, opts)`, `COLOURS` |
| `games/shared/spot/play.js` | `Play.start(config)`: rendering, pointer and keyboard hit-testing, rings, dots, hints, sounds, confetti, toolbar, done, next |
| `games/whats-different/index.html`, `game.js` | the 3+ page and its `Play.start({ band: 'little', voice: Voice, … })` |
| `games/spot-the-difference/index.html`, `game.js` | the 7+ page and its `Play.start({ band: 'big', … })` |
| `icons/games/whats-different.svg`, `icons/games/spot-the-difference.svg` | title and card icons |
| `docs/tests/spot.test.js` | every Node test for the kit and the two pages |
| `docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json`, generated pages, `sw.js` | wiring (Task 6) |

---

### Task 0: Worktree and branch

**Files:** none changed.

- [ ] **Step 1: Create the worktree**

```powershell
git worktree add .claude/worktrees/spot -b spot-the-difference main
cd .claude/worktrees/spot
node --test (Get-ChildItem docs/tests/*.test.js).FullName
```

Expected: every existing test passes (the baseline). All later commands in this plan run inside `.claude/worktrees/spot`.

---

### Task 1: `scenes.js`, the pure logic

**Files:**
- Create: `games/shared/spot/scenes.js`
- Test: `docs/tests/spot.test.js`

**Interfaces:**
- Produces (used by every later task): `Scenes.KINDS`, `Scenes.PALETTE`, `Scenes.WHEEL`, `Scenes.LANES`, `Scenes.LANE_ORDER`, `Scenes.THEMES`, `Scenes.SHIFT`, `Scenes.TILT`, `Scenes.W = 400`, `Scenes.H = 300`, `Scenes.LITTLE[0..7]`, `Scenes.BIG[0..3]`, `Scenes.tier(round)`, `Scenes.theme(band, round, seed)`, `Scenes.make(seed, row, theme) → { theme, seed, a, b, diffs }`, `Scenes.box(item) → { x0, y0, x1, y1 }` (the item's axis-aligned bounding box, rotation included), `Scenes.half(item)` (its longer half-extent), `Scenes.hit(diffs, found, x, y)`, `Scenes.nextLevel(level, autoHints)`, `Scenes.stars(hints, gaveUp)`, `Scenes.label(kind)` ("a frog", "Clover").
- Item: `{ id, kind, x, y, s, flip, colour, state, count, rot }`. Diff: `{ id, kind, item, side, region: { x, y, r }, before, after }`.

- [ ] **Step 1: Write the failing tests**

Create `docs/tests/spot.test.js`:

```js
/* The spot-the-difference scene kit and its two pages.
 *     node --test docs/tests/*.test.js
 * Loads the shipped games/shared/spot/scenes.js and draw.js in Node and
 * checks every fairness promise in the spec over 1,000 seeds. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'games', 'shared', 'spot', 'scenes.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SEEDS = 1000;
const overlap = (p, q, pad) => p.x0 - pad < q.x1 && q.x0 - pad < p.x1 && p.y0 - pad < q.y1 && q.y0 - pad < p.y1;
const far = (c1, c2) => { const d = Math.abs(S.WHEEL.indexOf(c1) - S.WHEEL.indexOf(c2)); return Math.min(d, 8 - d) >= 3; };
const near = (c1, c2) => { const d = Math.abs(S.WHEEL.indexOf(c1) - S.WHEEL.indexOf(c2)); return Math.min(d, 8 - d) === 1; };

test('the tables, as the spec says', () => {
  assert.deepEqual(S.LITTLE.map((r) => [r.diffs, r.items, r.kinds.length, r.minR, r.sizeFactor, r.minHalf]), [
    [2, 6, 2, 36, 1.8, 16], [2, 7, 3, 36, 1.8, 16], [3, 7, 3, 36, 1.8, 16], [3, 8, 4, 36, 1.8, 16],
    [3, 9, 4, 36, 1.8, 16], [4, 9, 4, 36, 1.8, 16], [4, 10, 4, 36, 1.8, 16], [4, 10, 4, 36, 1.8, 12],
  ]);
  assert.deepEqual(S.LITTLE[0].kinds, ['missing', 'colour']);
  assert.deepEqual(S.LITTLE[3].kinds, ['missing', 'colour', 'swap', 'size']);
  assert.deepEqual(S.BIG.map((r) => [r.diffs, r.items, r.kinds.length, r.minR, r.sizeFactor, r.minHalf]), [
    [5, 12, 5, 24, 1.3, 10], [6, 14, 7, 24, 1.3, 10], [7, 16, 9, 24, 1.3, 10], [8, 18, 10, 24, 1.3, 8],
  ]);
  assert.deepEqual(S.BIG[3].kinds, ['missing', 'colour', 'swap', 'size', 'flip', 'count', 'state', 'shade', 'shift', 'tilt']);
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 40].map(S.tier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(S.LANES, { sky: [30, 90], back: [150, 175], air: [100, 190], water: [170, 255], ground: [200, 295] });
  assert.deepEqual(S.WHEEL, ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']);
  assert.equal(S.PALETTE.ink, '#33302e');
  assert.equal(Object.keys(S.PALETTE).length, 12);
});

test('every kind is complete, and each theme has at least ten', () => {
  for (const [k, d] of Object.entries(S.KINDS)) {
    assert.ok(/^(the [a-z ]+|Clover|Pip|Plum|Mango)$/.test(d.name), `${k}: name ${d.name}`);
    assert.ok(S.LANES[d.lane], `${k}: lane ${d.lane}`);
    assert.ok(d.w > 0 && d.h > 0 && d.w <= 44 && d.h <= 44, `${k}: size`);
    assert.ok(typeof d.family === 'string' && typeof d.asym === 'boolean' && d.max >= 1, `${k}: family/asym/max`);
    if (d.colours) for (const c of d.colours) assert.ok(S.WHEEL.includes(c) || ['brown', 'grey', 'white'].includes(c), `${k}: colour ${c}`);
    if (d.states) assert.equal(d.states.length, 2, `${k}: two states`);
    if (d.counts) assert.ok(d.counts[0] < d.counts[1], `${k}: counts`);
    assert.ok(d.themes.every((t) => S.THEMES.includes(t)), `${k}: themes`);
  }
  for (const t of S.THEMES) assert.ok(Object.values(S.KINDS).filter((d) => d.themes.includes(t)).length >= 10, `${t} has too few kinds`);
  assert.equal(S.label('frog'), 'a frog');
  assert.equal(S.label('clover'), 'Clover');
});

function checkScene(scene, row, theme, where) {
  const { a, b, diffs } = scene;
  assert.equal(diffs.length, row.diffs, `${where}: ${diffs.length} differences`);
  for (const [name, side] of [['a', a], ['b', b]]) {
    const gone = diffs.filter((d) => d.kind === 'missing' && d.side === name).length;
    assert.equal(side.length, row.items - gone, `${where}: side ${name} has ${side.length} items`);
    for (const it of side) {
      const d = S.KINDS[it.kind];
      assert.ok(d && d.themes.includes(theme), `${where}: ${it.kind} is not in ${theme}`);
      const bx = S.box(it);
      assert.ok(bx.x0 >= 0 && bx.y0 >= 0 && bx.x1 <= S.W && bx.y1 <= S.H, `${where}: ${it.id} leaves the picture`);
      const [lo, hi] = S.LANES[d.lane];
      if (it.rot === 0) assert.ok(it.y + d.h * it.s >= lo - 0.01 && it.y + d.h * it.s <= hi + 0.01, `${where}: ${it.id} base off its lane`);
      if (d.colours) assert.ok(d.colours.includes(it.colour), `${where}: ${it.id} colour`); else assert.equal(it.colour, null);
      if (d.states) assert.ok(d.states.includes(it.state), `${where}: ${it.id} state`); else assert.equal(it.state, null);
      if (d.counts) assert.ok(it.count >= d.counts[0] && it.count <= d.counts[1], `${where}: ${it.id} count`); else assert.equal(it.count, null);
      if (!d.asym) assert.equal(it.flip, false, `${where}: ${it.id} flipped but symmetric`);
    }
    for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) {
      assert.ok(!overlap(S.box(side[i]), S.box(side[j]), 4), `${where}: ${side[i].id} and ${side[j].id} overlap`);
    }
    const perKind = {};
    for (const it of side) perKind[it.kind] = (perKind[it.kind] || 0) + 1;
    for (const [k, n] of Object.entries(perKind)) assert.ok(n <= S.KINDS[k].max, `${where}: ${n} × ${k}`);
  }
  const ids = new Set(diffs.map((d) => d.item));
  assert.equal(ids.size, diffs.length, `${where}: two differences on one item`);
  for (const d of diffs) {
    assert.ok(row.kinds.includes(d.kind), `${where}: ${d.kind} not allowed`);
    assert.ok(d.side === 'a' || d.side === 'b', `${where}: side`);
    const same = (d.side === 'a' ? b : a).find((it) => it.id === d.item);
    const changed = (d.side === 'a' ? a : b).find((it) => it.id === d.item);
    assert.ok(same, `${where}: ${d.item} missing on the unchanged side`);
    assert.ok(S.half(same) >= row.minHalf - 0.01, `${where}: ${d.item} too small (${S.half(same)})`);
    const { x, y, r } = d.region;
    assert.ok(r >= row.minR && x - r >= 0 && y - r >= 0 && x + r <= S.W && y + r <= S.H, `${where}: region ${JSON.stringify(d.region)}`);
    assert.ok(Math.hypot(same.x - x, same.y - y) <= r, `${where}: ${d.item} centre outside its region`);
    if (changed) assert.ok(Math.hypot(changed.x - x, changed.y - y) <= r, `${where}: changed ${d.item} centre outside its region`);
    const k = S.KINDS[same.kind];
    switch (d.kind) {
      case 'missing': assert.equal(changed, undefined); assert.equal(d.after, null); break;
      case 'colour': assert.ok(far(same.colour, changed.colour), `${where}: ${same.colour}→${changed.colour} not far`); break;
      case 'shade': assert.ok(near(same.colour, changed.colour) && S.half(same) >= 14, `${where}: shade`); break;
      case 'swap': assert.ok(changed.kind !== same.kind && S.KINDS[changed.kind].lane === k.lane && S.KINDS[changed.kind].family !== k.family, `${where}: swap`); break;
      case 'size': assert.ok(Math.abs(changed.s / same.s - row.sizeFactor) < 0.01 || Math.abs(same.s / changed.s - row.sizeFactor) < 0.01, `${where}: size ${same.s}→${changed.s}`); break;
      case 'flip': assert.ok(k.asym && changed.flip !== same.flip, `${where}: flip`); break;
      case 'count': assert.equal(Math.abs(changed.count - same.count), 1, `${where}: count`); break;
      case 'state': assert.ok(changed.state !== same.state, `${where}: state`); break;
      case 'shift': { const m = Math.hypot(changed.x - same.x, changed.y - same.y); assert.ok(m >= 13.99 && m <= 20.01, `${where}: shift ${m}`); break; }
      case 'tilt': assert.ok(Math.abs(changed.rot) === 20 && same.rot === 0 && S.half(same) >= 14, `${where}: tilt`); break;
      default: assert.fail(`${where}: unknown kind ${d.kind}`);
    }
  }
  for (let i = 0; i < diffs.length; i++) for (let j = i + 1; j < diffs.length; j++) {
    const p = diffs[i].region, q = diffs[j].region;
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + 6 - 0.01, `${where}: regions ${i} and ${j} too close`);
  }
  const untouched = a.filter((it) => !ids.has(it.id));
  assert.deepEqual(untouched, b.filter((it) => !ids.has(it.id)), `${where}: an unchanged item differs`);
}

test('3+: every level and theme keeps every promise over 1,000 seeds', () => {
  S.LITTLE.forEach((row, level) => {
    for (const theme of S.THEMES) for (let seed = 1; seed <= SEEDS; seed++) {
      checkScene(S.make(seed, row, theme), row, theme, `little level ${level} ${theme} seed ${seed}`);
    }
  });
});

test('7+: every tier and theme keeps every promise over 1,000 seeds', () => {
  S.BIG.forEach((row, tier) => {
    for (const theme of S.THEMES) for (let seed = 1; seed <= SEEDS; seed++) {
      checkScene(S.make(seed, row, theme), row, theme, `big tier ${tier} ${theme} seed ${seed}`);
    }
  });
});

test('the same seed gives the same scene; different seeds differ', () => {
  assert.deepEqual(S.make(42, S.BIG[2], 'farm'), S.make(42, S.BIG[2], 'farm'));
  assert.notDeepEqual(S.make(42, S.BIG[2], 'farm'), S.make(43, S.BIG[2], 'farm'));
});

test('every kind of difference actually occurs', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) for (const theme of S.THEMES) {
    for (const d of S.make(seed, S.BIG[3], theme).diffs) seen.add(d.kind);
    for (const d of S.make(seed, S.LITTLE[7], theme).diffs) seen.add(d.kind + '@little');
  }
  for (const k of S.BIG[3].kinds) assert.ok(seen.has(k), `${k} never happens at tier 3`);
  for (const k of S.LITTLE[7].kinds) assert.ok(seen.has(k + '@little'), `${k} never happens at level 7`);
});

test('hit: the first unfound region holding the point', () => {
  const diffs = [{ id: 'd0', region: { x: 100, y: 100, r: 30 } }, { id: 'd1', region: { x: 300, y: 200, r: 24 } }];
  assert.equal(S.hit(diffs, new Set(), 110, 120).id, 'd0');
  assert.equal(S.hit(diffs, new Set(['d0']), 110, 120), null);
  assert.equal(S.hit(diffs, new Set(), 300, 224).id, 'd1');
  assert.equal(S.hit(diffs, new Set(), 300, 225), null);
});

test('themes: 3+ cycles; 7+ never repeats and is deterministic', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => S.theme('little', n, 99)), ['pond', 'meadow', 'farm', 'pond']);
  for (const seed of [1, 2, 3, 1000]) {
    let prev = null;
    for (let n = 1; n <= 30; n++) {
      const t = S.theme('big', n, seed);
      assert.ok(S.THEMES.includes(t) && t !== prev, `seed ${seed} round ${n}`);
      assert.equal(t, S.theme('big', n, seed));
      prev = t;
    }
  }
  assert.equal(S.theme('big', 1, 0), 'pond');
  assert.equal(S.theme('big', 1, 2), 'farm');
});

test('levels adapt and stars count', () => {
  assert.equal(S.nextLevel(0, 0), 1);
  assert.equal(S.nextLevel(7, 0), 7);
  assert.equal(S.nextLevel(3, 1), 3);
  assert.equal(S.nextLevel(3, 2), 2);
  assert.equal(S.nextLevel(0, 5), 0);
  assert.deepEqual([S.stars(0, false), S.stars(1, false), S.stars(2, false), S.stars(9, false), S.stars(0, true)], [3, 2, 1, 1, 0]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test docs/tests/spot.test.js`
Expected: FAIL, `Cannot find module '.../games/shared/spot/scenes.js'`.

- [ ] **Step 3: Write `scenes.js`**

Create `games/shared/spot/scenes.js`:

```js
/* The spot-the-difference scene kit's logic: a seeded scene, its two sides
 * and the differences between them, every one fair by construction (see
 * docs/superpowers/specs/2026-10-18-spot-the-difference-design.md).
 * Pure, so docs/tests/spot.test.js loads this exact file in Node. In the
 * page it is a classic script that sets window.Spot.Scenes. */
(function (root) {
  'use strict';

  const W = 400, H = 300, PAD = 4, GAP = 6;
  const THEMES = ['pond', 'meadow', 'farm'];
  const PALETTE = {
    red: '#ef4444', orange: '#fb923c', yellow: '#fbbf24', green: '#4ade80', teal: '#2dd4bf', blue: '#60a5fa',
    purple: '#a78bfa', pink: '#ff8fab', brown: '#8b5e3c', grey: '#94a3b8', white: '#ffffff', ink: '#33302e',
  };
  const WHEEL = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
  // where an item's BASE (the bottom of its box) may lie
  const LANES = { sky: [30, 90], back: [150, 175], air: [100, 190], water: [170, 255], ground: [200, 295] };
  const LANE_ORDER = ['sky', 'back', 'air', 'water', 'ground'];
  const SHIFT = [14, 20];
  const TILT = 20;

  /* name: the spoken phrase; w, h: half-extents at scale 1; family: the
   * silhouette (swaps go between families); max: how many one scene holds */
  const K = (name, lane, w, h, family, extra) =>
    Object.assign({ name, lane, w, h, family, asym: false, colours: null, states: null, counts: null, themes: THEMES, max: 2 }, extra || {});
  const P = ['pond'], M = ['meadow'], F = ['farm'];
  const KINDS = {
    sun: K('the sun', 'sky', 16, 16, 'sun', { colours: ['yellow', 'orange'], max: 1 }),
    cloud: K('the cloud', 'sky', 22, 12, 'cloud', { counts: [2, 3], max: 3 }),
    bird: K('the bird', 'sky', 12, 8, 'bird', { asym: true }),
    clover: K('Clover', 'ground', 32, 30, 'clover', { max: 1 }),   // the critter files are 64×60
    pip: K('Pip', 'ground', 32, 30, 'pip', { max: 1 }),
    plum: K('Plum', 'ground', 32, 30, 'plum', { max: 1 }),
    mango: K('Mango', 'ground', 32, 30, 'mango', { max: 1 }),
    lilypad: K('the lily pad', 'water', 18, 9, 'lilypad', { states: ['plain', 'bud'], themes: P, max: 3 }),
    frog: K('the frog', 'water', 16, 13, 'frog', { asym: true, states: ['open', 'shut'], colours: ['green', 'teal'], themes: P }),
    fish: K('the fish', 'water', 16, 9, 'fish', { asym: true, counts: [2, 3], colours: ['orange', 'blue', 'pink', 'yellow'], themes: P, max: 3 }),
    duck: K('the duck', 'water', 16, 14, 'duck', { asym: true, colours: ['yellow', 'white'], themes: P }),
    boat: K('the boat', 'water', 24, 18, 'boat', { asym: true, states: ['flag', 'none'], colours: ['red', 'blue', 'green'], themes: P, max: 1 }),
    turtle: K('the turtle', 'water', 16, 10, 'turtle', { asym: true, colours: ['green', 'teal', 'brown'], themes: P }),
    dragonfly: K('the dragonfly', 'air', 16, 8, 'dragonfly', { asym: true, colours: ['blue', 'teal', 'purple'], themes: P }),
    reeds: K('the reeds', 'ground', 12, 24, 'reeds', { counts: [3, 4], themes: P }),
    stone: K('the stone', 'ground', 14, 9, 'stone', { colours: ['grey', 'brown'], themes: P }),
    flower: K('the flower', 'ground', 11, 20, 'flower', { states: ['open', 'bud'], colours: ['red', 'yellow', 'pink', 'purple', 'orange', 'blue'], themes: ['pond', 'meadow'], max: 3 }),
    tree: K('the tree', 'back', 28, 42, 'tree', { counts: [2, 4], themes: ['meadow', 'farm'] }),
    bush: K('the bush', 'back', 22, 14, 'bush', { colours: ['green', 'teal'], themes: M }),
    fence: K('the fence', 'back', 36, 14, 'fence', { counts: [3, 4], themes: ['meadow', 'farm'], max: 1 }),
    mushroom: K('the mushroom', 'ground', 13, 15, 'mushroom', { counts: [3, 4], colours: ['red', 'orange', 'purple'], themes: M }),
    butterfly: K('the butterfly', 'air', 15, 11, 'butterfly', { colours: ['orange', 'blue', 'pink', 'purple', 'yellow'], themes: M }),
    bee: K('the bee', 'air', 11, 9, 'bee', { asym: true, themes: M }),
    ladybird: K('the ladybird', 'ground', 11, 8, 'ladybird', { asym: true, counts: [3, 4], themes: M }),
    snail: K('the snail', 'ground', 15, 11, 'snail', { asym: true, colours: ['yellow', 'orange', 'pink', 'purple'], themes: M }),
    kite: K('the kite', 'sky', 14, 22, 'kite', { asym: true, colours: ['red', 'blue', 'green', 'purple', 'orange'], themes: M, max: 1 }),
    basket: K('the basket', 'ground', 17, 13, 'basket', { counts: [2, 3], themes: M, max: 1 }),
    barn: K('the barn', 'back', 42, 40, 'barn', { states: ['open', 'shut'], counts: [1, 2], colours: ['red', 'blue'], themes: F, max: 1 }),
    hay: K('the hay bale', 'ground', 17, 13, 'hay', { counts: [1, 2], themes: F }),
    cow: K('the cow', 'ground', 25, 18, 'cow', { asym: true, counts: [2, 3], themes: F, max: 1 }),
    pig: K('the pig', 'ground', 21, 14, 'pig', { asym: true, colours: ['pink', 'green', 'red'], themes: F }),
    sheep: K('the sheep', 'ground', 21, 16, 'sheep', { asym: true, states: ['open', 'shut'], themes: F }),
    chick: K('the chick', 'ground', 9, 9, 'chick', { asym: true, colours: ['yellow', 'orange'], themes: F, max: 3 }),
    hen: K('the hen', 'ground', 15, 15, 'hen', { asym: true, colours: ['brown', 'white'], themes: F }),
    pumpkin: K('the pumpkin', 'ground', 15, 12, 'pumpkin', { colours: ['orange', 'green'], themes: F }),
    scarecrow: K('the scarecrow', 'back', 18, 40, 'scarecrow', { states: ['hat', 'none'], themes: F, max: 1 }),
    tractor: K('the tractor', 'ground', 28, 20, 'tractor', { asym: true, colours: ['red', 'green', 'blue'], themes: F, max: 1 }),
  };

  const row = (diffs, items, kinds, minR, sizeFactor, minHalf) => ({ diffs, items, kinds, minR, sizeFactor, minHalf });
  const L4 = ['missing', 'colour', 'swap', 'size'];
  const LITTLE = [
    row(2, 6, ['missing', 'colour'], 36, 1.8, 16),
    row(2, 7, ['missing', 'colour', 'swap'], 36, 1.8, 16),
    row(3, 7, ['missing', 'colour', 'swap'], 36, 1.8, 16),
    row(3, 8, L4, 36, 1.8, 16),
    row(3, 9, L4, 36, 1.8, 16),
    row(4, 9, L4, 36, 1.8, 16),
    row(4, 10, L4, 36, 1.8, 16),
    row(4, 10, L4, 36, 1.8, 12),
  ];
  const B0 = ['missing', 'colour', 'swap', 'size', 'flip'];
  const B1 = B0.concat('count', 'state');
  const B2 = B1.concat('shade', 'shift');
  const B3 = B2.concat('tilt');
  const BIG = [row(5, 12, B0, 24, 1.3, 10), row(6, 14, B1, 24, 1.3, 10), row(7, 16, B2, 24, 1.3, 10), row(8, 18, B3, 24, 1.3, 8)];
  const tier = (round) => (round <= 2 ? 0 : round <= 5 ? 1 : round <= 9 ? 2 : 3);

  // ---- seeded random (mulberry32) ----
  function rng32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (v) => Math.floor(Number(v)) || 0;
  const mix = (seed, salt) => (Math.imul(int(seed), 1000003) + Math.imul(salt, 7919) + 12345) >>> 0;
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function shuffle(r, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- geometry ----
  function box(item) {
    const d = KINDS[item.kind];
    let w = d.w * item.s, h = d.h * item.s;
    if (item.rot) {
      const a = (Math.abs(item.rot) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const rw = w * c + h * s, rh = w * s + h * c;
      w = rw; h = rh;
    }
    return { x0: item.x - w, y0: item.y - h, x1: item.x + w, y1: item.y + h };
  }
  const half = (item) => Math.max(KINDS[item.kind].w, KINDS[item.kind].h) * item.s;
  const base = (item) => item.y + KINDS[item.kind].h * item.s;
  const overlaps = (p, q, pad) => p.x0 - pad < q.x1 && q.x0 - pad < p.x1 && p.y0 - pad < q.y1 && q.y0 - pad < p.y1;
  const inside = (b) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H;
  function inLane(item) {
    const lane = LANES[KINDS[item.kind].lane], b = base(item);
    return b >= lane[0] && b <= lane[1];
  }
  // inside the picture, base in its lane, clear of every other item by PAD
  function fits(item, others) {
    const b = box(item);
    if (!inside(b) || !inLane(item)) return false;
    return others.every((o) => o.id === item.id || !overlaps(b, box(o), PAD));
  }

  // ---- layout: exactly row.items items, or null ----
  function fresh(r, d) {
    return {
      flip: d.asym && r() < 0.5,
      colour: d.colours ? pick(r, d.colours) : null,
      state: d.states ? pick(r, d.states) : null,
      count: d.counts ? d.counts[0] + Math.floor(r() * (d.counts[1] - d.counts[0] + 1)) : null,
    };
  }
  function layout(r, row, theme) {
    const kinds = Object.keys(KINDS).filter((k) => KINDS[k].themes.includes(theme));
    const items = [];
    const used = {};
    for (let tries = 0; items.length < row.items && tries < 600; tries++) {
      const kind = pick(r, kinds), d = KINDS[kind];
      if ((used[kind] || 0) >= d.max) continue;
      const s = Math.round((0.9 + r() * 0.35) * 100) / 100;
      const item = Object.assign({ id: 'p' + items.length, kind, x: 0, y: 0, s, rot: 0 }, fresh(r, d));
      const lane = LANES[d.lane];
      for (let k = 0; k < 40; k++) {
        item.y = lane[0] + r() * (lane[1] - lane[0]) - d.h * s;
        item.x = d.w * s + PAD + r() * (W - 2 * (d.w * s + PAD));
        if (fits(item, items)) {
          items.push(item);
          used[kind] = (used[kind] || 0) + 1;
          break;
        }
      }
    }
    return items.length === row.items ? items : null;
  }

  // ---- differences ----
  function wheelDist(c1, c2) {
    const i = WHEEL.indexOf(c1), j = WHEEL.indexOf(c2);
    if (i < 0 || j < 0) return -1;
    const d = Math.abs(i - j);
    return Math.min(d, 8 - d);
  }
  /* Each returns the changed fields, null for "gone", or false when this
   * item cannot take this kind of change. `cur` is the changed side so far. */
  const CHANGES = {
    missing: () => null,
    colour: (r, it, d) => {
      const c = d.colours ? d.colours.filter((x) => wheelDist(x, it.colour) >= 3) : [];
      return c.length ? { colour: pick(r, c) } : false;
    },
    shade: (r, it, d) => {
      if (half(it) < 14) return false;
      const c = d.colours ? d.colours.filter((x) => wheelDist(x, it.colour) === 1) : [];
      return c.length ? { colour: pick(r, c) } : false;
    },
    flip: (r, it, d) => (d.asym ? { flip: !it.flip } : false),
    state: (r, it, d) => (d.states ? { state: d.states[0] === it.state ? d.states[1] : d.states[0] } : false),
    count: (r, it, d) => {
      if (!d.counts) return false;
      const up = it.count === d.counts[0] ? true : it.count === d.counts[1] ? false : r() < 0.5;
      return { count: it.count + (up ? 1 : -1) };
    },
    tilt: (r, it) => (half(it) < 14 ? false : { rot: r() < 0.5 ? TILT : -TILT }),
    size: (r, it, d, row) => {
      const s = r() < 0.5 ? it.s * row.sizeFactor : it.s / row.sizeFactor;
      return { s, y: base(it) - d.h * s };                 // the base stays put
    },
    shift: (r, it) => {
      const m = SHIFT[0] + r() * (SHIFT[1] - SHIFT[0]), a = r() * Math.PI * 2;
      return { x: it.x + m * Math.cos(a), y: it.y + m * Math.sin(a) };
    },
    swap: (r, it, d, row, cur, kinds) => {
      const cands = kinds.filter((k) => k !== it.kind && KINDS[k].lane === d.lane && KINDS[k].family !== d.family &&
        cur.filter((o) => o.kind === k).length < KINDS[k].max);
      if (!cands.length) return false;
      const k = pick(r, cands), nd = KINDS[k];
      return Object.assign({ kind: k, y: base(it) - nd.h * it.s }, fresh(r, nd));
    },
  };
  function regionOf(before, after, minR) {
    const p = box(before), q = after ? box(after) : p;
    const x0 = Math.min(p.x0, q.x0), y0 = Math.min(p.y0, q.y0), x1 = Math.max(p.x1, q.x1), y1 = Math.max(p.y1, q.y1);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(minR, Math.max(x1 - x0, y1 - y0) / 2 + 4) };
  }
  function differ(r, row, items, theme) {
    const kinds = Object.keys(KINDS).filter((k) => KINDS[k].themes.includes(theme));
    const cur = { a: items.map((o) => Object.assign({}, o)), b: items.map((o) => Object.assign({}, o)) };
    const diffs = [];
    for (const it of shuffle(r, items.filter((o) => half(o) >= row.minHalf))) {
      if (diffs.length >= row.diffs) break;
      const d = KINDS[it.kind];
      const side = r() < 0.5 ? 'a' : 'b';
      let made = null;
      for (const kind of shuffle(r, row.kinds)) {
        for (let t = 0; t < 8 && !made; t++) {
          const after = CHANGES[kind](r, it, d, row, cur[side], kinds);
          if (after === false) break;
          const changed = after === null ? null : Object.assign({}, it, after);
          if (changed && !fits(changed, cur[side])) continue;
          const region = regionOf(it, changed, row.minR);
          if (region.x - region.r < 0 || region.y - region.r < 0 || region.x + region.r > W || region.y + region.r > H) continue;
          if (diffs.some((q) => Math.hypot(q.region.x - region.x, q.region.y - region.y) < q.region.r + region.r + GAP)) continue;
          const before = {};
          if (after) for (const key of Object.keys(after)) before[key] = it[key];
          made = { id: 'd' + diffs.length, kind, item: it.id, side, region, before, after };
          cur[side] = changed ? cur[side].map((o) => (o.id === it.id ? changed : o)) : cur[side].filter((o) => o.id !== it.id);
        }
        if (made) break;
      }
      if (made) diffs.push(made);
    }
    return diffs.length === row.diffs ? { a: cur.a, b: cur.b, diffs } : null;
  }
  /* A fair scene for this seed: lay out, then change. A layout that cannot
   * host the differences is dropped and the next internal seed is tried, so
   * the result always exists and the same seed always gives the same scene. */
  function make(seed, row, theme) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const r = rng32(mix(seed, attempt));
      const items = layout(r, row, theme);
      if (!items) continue;
      const out = differ(r, row, items, theme);
      if (out) return { theme, seed, a: out.a, b: out.b, diffs: out.diffs };
    }
    throw new Error('no fair scene for seed ' + seed);
  }

  // ---- the rest of the rules ----
  function theme(band, round, seed) {
    if (band === 'little') return THEMES[(round - 1) % 3];
    let t = ((int(seed) % 3) + 3) % 3;
    // each later round: one of the two themes that are not the previous one
    for (let n = 2; n <= round; n++) t = (t + 1 + ((int(seed) + n) & 1)) % 3;
    return THEMES[t];
  }
  function hit(diffs, found, x, y) {
    for (const d of diffs) {
      if (found.has ? found.has(d.id) : found.indexOf(d.id) >= 0) continue;
      if (Math.hypot(d.region.x - x, d.region.y - y) <= d.region.r) return d;
    }
    return null;
  }
  const nextLevel = (level, autoHints) => (autoHints === 0 ? Math.min(7, level + 1) : autoHints >= 2 ? Math.max(0, level - 1) : level);
  const stars = (hints, gaveUp) => (gaveUp ? 0 : hints === 0 ? 3 : hints === 1 ? 2 : 1);
  function label(kind) {
    const n = KINDS[kind].name;
    if (n.indexOf('the ') !== 0) return n;
    const rest = n.slice(4);
    return (/^[aeiou]/.test(rest) ? 'an ' : 'a ') + rest;
  }

  const api = { W, H, PAD, GAP, THEMES, PALETTE, WHEEL, LANES, LANE_ORDER, SHIFT, TILT, KINDS, LITTLE, BIG, tier, theme, make, box, half, base, hit, nextLevel, stars, label };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.Spot = root.Spot || {};
    root.Spot.Scenes = api;
  }
})(this);
```

- [ ] **Step 4: Run the tests until they pass**

Run: `node --test docs/tests/spot.test.js`
Expected: every test in the file passes; the two 1,000-seed tests take well under a minute together. If `make` throws `no fair scene`, print the seed, level and theme, lower nothing in the tables, and look at why the layout or the change failed (usually a kind with `max` too small for the lane, or a region that cannot fit near an edge): fix `scenes.js`, never the test.

- [ ] **Step 5: Commit**

```bash
git add games/shared/spot/scenes.js docs/tests/spot.test.js
git commit -m "feat(spot): scene kit logic: seeded scenes, fair differences, hit test, levels, tiers, themes"
```

---

### Task 2: `draw.js`, the pictures

**Files:**
- Create: `games/shared/spot/draw.js`
- Modify: `docs/tests/spot.test.js` (append)

**Interfaces:**
- Consumes: `Scenes.KINDS`, `Scenes.PALETTE`, `Scenes.LANE_ORDER`, `Scenes.base`, `Scenes.label` from Task 1.
- Produces: `Draw.backdrop(theme) → string`, `Draw.DRAWERS[kind](item, ctx) → string` (shapes in the item's local box, ±w by ±h around 0,0, y down), `Draw.picture(items, { theme, critters, side }) → string` (the inner markup of one `<svg viewBox="0 0 400 300">`), `Draw.COLOURS` (every flat hex the backdrops and fixed parts use beyond the palette), `Draw.group(item, side, ctx)`.
- Every item group is exactly: `<g class="item" id="<side>-<id>" data-id="<id>" role="button" aria-label="<label>" tabindex="-1" transform="translate(x y) rotate(rot) scale(sx s)" fill="none" stroke="#33302e" stroke-width="<2.5/s>" stroke-linejoin="round" stroke-linecap="round">…</g>`, `sx` being `-s` when flipped, numbers to one decimal.

- [ ] **Step 1: Append the failing tests**

Append to `docs/tests/spot.test.js`:

```js
const D = require(path.join(ROOT, 'games', 'shared', 'spot', 'draw.js'));
const HEAD = /^<g class="item" id="([abx])-(p\d+)" data-id="(p\d+)" role="button" aria-label="([^"]+)" tabindex="-1" transform="translate\(-?[\d.]+ -?[\d.]+\) rotate\(-?[\d.]+\) scale\(-?[\d.]+ [\d.]+\)" fill="none" stroke="#33302e" stroke-width="([\d.]+)" stroke-linejoin="round" stroke-linecap="round">/;
const groupsOf = (markup) => {
  const out = {};
  for (const part of markup.split('<g class="item" ').slice(1)) out[/data-id="(p\d+)"/.exec(part)[1]] = part;
  return out;
};

test('draw: every kind has a drawer, every drawer a kind, every theme a backdrop', () => {
  assert.deepEqual(Object.keys(D.DRAWERS).sort(), Object.keys(S.KINDS).sort());
  for (const t of S.THEMES) assert.ok(D.backdrop(t).startsWith('<rect width="400" height="300"'), `${t} backdrop`);
  assert.ok(D.COLOURS.length <= 12 && D.COLOURS.every((c) => /^#[0-9a-f]{6}$/.test(c)));
});

test('draw: every seed renders well-formed markup in the house style', () => {
  const allowed = new Set(Object.values(S.PALETTE).concat(D.COLOURS));
  for (const [row, band] of [[S.LITTLE[7], 'little'], [S.BIG[3], 'big']]) for (const theme of S.THEMES) for (let seed = 1; seed <= 60; seed++) {
    const scene = S.make(seed, row, theme);
    for (const [side, items] of [['a', scene.a], ['b', scene.b]]) {
      const m = D.picture(items, { theme, critters: '../../icons/critters/', side });
      const where = `${band} ${theme} seed ${seed} side ${side}`;
      const lower = m.toLowerCase();
      for (const bad of ['<text', '<script', 'gradient', '<filter', 'style=', 'url(', '<foreignobject', 'opacity=']) assert.ok(!lower.includes(bad), `${where}: ${bad}`);
      assert.ok(!/\son[a-z]+=/i.test(m), `${where}: event handler`);
      let depth = 0;
      for (const t of m.matchAll(/<(\/?)g\b[^>]*?(\/?)>/g)) { if (t[1]) depth--; else if (!t[2]) depth++; assert.ok(depth >= 0, `${where}: stray </g>`); }
      assert.equal(depth, 0, `${where}: unclosed <g>`);
      for (const c of m.match(/#[0-9a-f]{6}\b/gi) || []) assert.ok(allowed.has(c.toLowerCase()), `${where}: colour ${c}`);
      const groups = groupsOf(m);
      assert.equal(Object.keys(groups).length, items.length, `${where}: one group per item`);
      for (const it of items) {
        const g = '<g class="item" ' + groups[it.id];
        const h = HEAD.exec(g);
        assert.ok(h, `${where}: bad group head for ${it.id}: ${g.slice(0, 160)}`);
        assert.equal(h[1], side);
        assert.equal(h[4], S.label(it.kind));
        assert.ok(Math.abs(Number(h[5]) - 2.5 / it.s) < 0.06, `${where}: stroke-width ${h[5]} for s=${it.s}`);
        const isCritter = ['clover', 'pip', 'plum', 'mango'].includes(it.kind);
        const images = g.match(/<image\b[^>]*>/g) || [];
        if (isCritter) assert.ok(images.length === 1 && images[0].includes(`href="../../icons/critters/${it.kind}.svg"`), `${where}: critter image`);
        else assert.equal(images.length, 0, `${where}: <image> outside a critter`);
      }
    }
  }
});

test('draw: the two sides differ in exactly the changed groups', () => {
  for (const theme of S.THEMES) for (let seed = 1; seed <= 200; seed++) {
    const scene = S.make(seed, S.BIG[3], theme);
    const ga = groupsOf(D.picture(scene.a, { theme, critters: 'c/', side: 'x' }));
    const gb = groupsOf(D.picture(scene.b, { theme, critters: 'c/', side: 'x' }));
    const changed = new Set(scene.diffs.map((d) => d.item));
    for (const id of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
      if (changed.has(id)) assert.notEqual(ga[id], gb[id], `${theme} seed ${seed}: ${id} should differ`);
      else assert.equal(ga[id], gb[id], `${theme} seed ${seed}: ${id} should match`);
    }
    assert.equal(D.backdrop(theme), D.picture([], { theme, critters: 'c/', side: 'x' }));
  }
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test docs/tests/spot.test.js`
Expected: the three `draw:` tests fail with `Cannot find module '.../draw.js'`; the Task 1 tests still pass.

- [ ] **Step 3: Write `draw.js`**

Create `games/shared/spot/draw.js`. Every drawer draws in its kind's local box (±w by ±h around 0,0, y downwards, scale 1); the group around it applies position, flip, rotation and scale and carries the ink stroke, so drawers never set `stroke-width` and every shape names its fill. `col(it, fallback)` is the item's palette colour or the fallback.

```js
/* Draws a spot-the-difference scene as SVG markup: a flat backdrop and one
 * <g class="item"> per item, in the house style (ink outlines, flat fills).
 * Pure string building, so docs/tests/spot.test.js renders every seed in
 * Node; in the page it is a classic script that sets window.Spot.Draw. */
(function (root) {
  'use strict';
  const Scenes = typeof module === 'object' && module.exports ? require('./scenes.js') : root.Spot.Scenes;
  const PAL = Scenes.PALETTE;
  const INK = PAL.ink, WHITE = PAL.white, BROWN = PAL.brown, GREY = PAL.grey;
  // flat colours for backdrops and fixed parts; everything a difference can change is palette
  const SKY = '#dff4ff', HILL = '#a7e3a1', WATER = '#8ed0ff', SAND = '#f1dcb0', FIELD = '#9be28f', CROP = '#d9e37a', TRACK = '#c9a87a', LEAF = '#2e9e5b';
  const COLOURS = [SKY, HILL, WATER, SAND, FIELD, CROP, TRACK, LEAF];

  const f = (n) => String(Math.round(n * 10) / 10);
  const col = (it, fallback) => (it.colour ? PAL[it.colour] : fallback);
  const circle = (cx, cy, r, fill) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
  const ellipse = (cx, cy, rx, ry, fill) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"/>`;
  const rect = (x, y, w, h, fill, rx) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"/>`;
  const path = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
  const line = (d, stroke) => `<path d="${d}" fill="none"${stroke ? ` stroke="${stroke}"` : ''}/>`;
  const eye = (cx, cy, shut) => (shut ? line(`M${f(cx - 2)} ${f(cy)} h4`) : circle(cx, cy, 1.6, INK));
  const first = (positions, n) => positions.slice(0, n);

  function backdrop(theme) {
    const sky = `<rect width="400" height="300" fill="${SKY}"/>`;
    if (theme === 'pond') {
      return sky + path('M0 150 q100 -40 200 0 t200 0 V300 H0 z', HILL) +
        path('M0 150 V232 q100 12 200 0 t200 0 V150 z', WATER) +
        path('M0 232 q100 12 200 0 t200 0 V300 H0 z', SAND);
    }
    if (theme === 'meadow') {
      return sky + path('M0 160 q120 -50 240 -10 t160 10 V300 H0 z', HILL) + rect(0, 180, 400, 120, FIELD);
    }
    return sky + rect(0, 165, 400, 135, CROP) + path('M0 262 q200 -10 400 0 V300 H0 z', TRACK);
  }

  const DRAWERS = {
    sun: (it) => {
      const c = col(it, PAL.yellow);
      let rays = '';
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        rays += line(`M${f(12.5 * Math.cos(a))} ${f(12.5 * Math.sin(a))} L${f(16 * Math.cos(a))} ${f(16 * Math.sin(a))}`, c);
      }
      return rays + circle(0, 0, 10.5, c);
    },
    cloud: (it) => (it.count === 3
      ? path('M-21 10 a7 7 0 0 1 2 -13 a11 11 0 0 1 20 -5 a10 10 0 0 1 17 6 a7 7 0 0 1 3 12 z', WHITE)
      : path('M-19 10 a8 8 0 0 1 3 -14 a12 12 0 0 1 22 0 a8 8 0 0 1 13 14 z', WHITE)),
    bird: () => ellipse(0, 1, 9, 5, WHITE) + path('M-2 -1 l-7 -6 l9 2 z', WHITE) + path('M9 0 l4 1 l-4 2 z', PAL.orange) + circle(5, -1, 1.2, INK),
    clover: (it, ctx) => `<image href="${ctx.critters}clover.svg" x="-32" y="-30" width="64" height="60"/>`,
    pip: (it, ctx) => `<image href="${ctx.critters}pip.svg" x="-32" y="-30" width="64" height="60"/>`,
    plum: (it, ctx) => `<image href="${ctx.critters}plum.svg" x="-32" y="-30" width="64" height="60"/>`,
    mango: (it, ctx) => `<image href="${ctx.critters}mango.svg" x="-32" y="-30" width="64" height="60"/>`,
    lilypad: (it) => ellipse(0, 0, 17, 8, PAL.green) + path('M0 0 L17 -4 L17 4 z', WATER) +
      (it.state === 'bud' ? path('M-6 -2 l4 -9 l4 9 z', PAL.pink) : ''),
    frog: (it) => {
      const c = col(it, PAL.green), shut = it.state === 'shut';
      return ellipse(0, 3, 14, 9, c) + circle(-4, -8, 4, c) + circle(6, -8, 4, c) + eye(-4, -8, shut) + eye(6, -8, shut) +
        line('M-2 6 q5 3 10 0') + ellipse(-11, 8, 4, 3, c) + ellipse(11, 9, 4, 3, c);
    },
    fish: (it) => {
      const c = col(it, PAL.orange);
      return path('M8 0 l7 -7 v14 z', c) + ellipse(-3, 0, 11, 7, c) +
        first(['M-5 -6 v12', 'M0 -7 v14', 'M-9 -4 v8'], it.count).map((d) => line(d)).join('') + circle(-9, -2, 1.4, INK);
    },
    duck: (it) => {
      const c = col(it, PAL.yellow);
      return ellipse(-1, 6, 13, 8, c) + circle(8, -6, 6, c) + path('M13 -6 l6 2 l-6 2 z', PAL.orange) + circle(9, -7, 1.3, INK) + path('M-14 4 l-5 -8 l9 4 z', c);
    },
    boat: (it) => {
      const c = col(it, PAL.red);
      return path('M-22 6 h44 l-6 10 h-32 z', c) + line('M0 6 v-22') + path('M2 -16 l14 14 h-14 z', WHITE) +
        (it.state === 'flag' ? path('M0 -17 l8 3 l-8 3 z', PAL.red) : '');
    },
    turtle: (it) => {
      const c = col(it, PAL.green);
      return ellipse(-9, 5, 3, 3, c) + ellipse(7, 6, 3, 3, c) + circle(13, 1, 4, c) + ellipse(-1, -1, 11, 7, c) +
        line('M-5 -5 v8 M1 -7 v12 M7 -5 v8') + circle(14, 0, 1.2, INK);
    },
    dragonfly: (it) => {
      const c = col(it, PAL.blue);
      return ellipse(-4, -4, 7, 3, WHITE) + ellipse(5, -4, 7, 3, WHITE) + rect(-14, 0, 26, 4, c, 2) + circle(13, 2, 3, c) + circle(14, 1, 1, INK);
    },
    reeds: (it) => (it.count === 4 ? [-11, -4, 4, 11] : [-8, 0, 8]).map((x) => line(`M${x} 24 V-12`, LEAF) + rect(x - 2.5, -24, 5, 12, BROWN, 2.5)).join(''),
    stone: (it) => path('M-13 8 q-2 -12 10 -15 q14 -2 16 8 q0 7 -8 8 z', col(it, GREY)) + line('M-6 -2 q4 -4 9 -2', WHITE),
    flower: (it) => {
      const c = col(it, PAL.pink);
      let s = line('M0 20 V-2', LEAF) + ellipse(5, 10, 5, 2.5, LEAF);
      if (it.state === 'bud') return s + ellipse(0, -10, 5, 8, c);
      for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5 - Math.PI / 2; s += circle(6 * Math.cos(a), -10 + 6 * Math.sin(a), 4.5, c); }
      return s + circle(0, -10, 3.5, PAL.yellow);
    },
    tree: (it) => rect(-5, 10, 10, 32, BROWN) + circle(-14, -4, 14, PAL.green) + circle(14, -4, 14, PAL.green) + circle(0, -16, 20, PAL.green) +
      first([[-8, -4], [10, -10], [-2, -24], [14, 2]], it.count).map(([x, y]) => circle(x, y, 3.5, PAL.red)).join(''),
    bush: (it) => path('M-21 13 a9 9 0 0 1 6 -16 a12 12 0 0 1 30 0 a9 9 0 0 1 6 16 z', col(it, PAL.green)),
    fence: (it) => rect(-36, -5, 72, 4, WHITE) + rect(-36, 5, 72, 4, WHITE) +
      first(it.count === 4 ? [-33, -11, 11, 33] : [-30, 0, 30], it.count).map((x) => path(`M${x - 3} 14 v-24 l3 -4 l3 4 v24 z`, WHITE)).join(''),
    mushroom: (it) => rect(-5, 0, 10, 15, WHITE, 3) + path('M-13 2 a13 13 0 0 1 26 0 z', col(it, PAL.red)) +
      first([[-6, -4], [4, -7], [8, -2], [-1, -10]], it.count).map(([x, y]) => circle(x, y, 2, WHITE)).join(''),
    butterfly: (it) => {
      const c = col(it, PAL.orange);
      return ellipse(-7, -4, 7, 6, c) + ellipse(7, -4, 7, 6, c) + ellipse(-6, 5, 5, 4, c) + ellipse(6, 5, 5, 4, c) +
        rect(-1.5, -9, 3, 18, INK, 1.5) + line('M-1 -9 l-4 -6 M1 -9 l4 -6');
    },
    bee: () => ellipse(-2, -7, 5, 3, WHITE) + ellipse(-1, 0, 9, 6, PAL.yellow) + line('M-4 -5.5 v11 M1 -5.5 v11') + circle(9, 0, 3, INK),
    ladybird: (it) => ellipse(-1, 0, 10, 7, PAL.red) + circle(9, 0, 3, INK) + line('M-1 -7 V7') +
      first([[-6, -3], [-5, 3], [3, -3], [3, 3]], it.count).map(([x, y]) => circle(x, y, 1.5, INK)).join(''),
    snail: (it) => path('M-14 10 q0 -6 6 -6 h22 q4 0 1 6 z', PAL.green) + circle(-4, 1, 8.5, col(it, PAL.yellow)) +
      line('M-4 1 a3 3 0 0 1 3 -3 a5 5 0 0 1 2 6') + line('M10 4 l3 -10 M14 4 l2 -10') + circle(13, -7, 1.5, INK) + circle(16, -7, 1.5, INK),
    kite: (it) => path('M0 -22 L13 -6 L0 10 L-13 -6 z', col(it, PAL.red)) + line('M0 -22 V10 M-13 -6 h26') + line('M0 10 q-6 6 0 12', INK) + circle(-3, 16, 2, PAL.yellow),
    basket: (it) => line('M-9 -2 a9 9 0 0 1 18 0') +
      first([[-5, -5], [5, -5], [0, -9]], it.count).map(([x, y]) => circle(x, y, 4, PAL.red)).join('') + path('M-16 -2 h32 l-4 15 h-24 z', BROWN),
    barn: (it) => {
      const c = col(it, PAL.red);
      return rect(-34, -10, 68, 50, c) + path('M-42 -10 L0 -40 L42 -10 z', BROWN) +
        rect(-9, 16, 18, 24, it.state === 'open' ? INK : BROWN, 2) + (it.state === 'open' ? '' : line('M-9 16 l18 24 M9 16 l-18 24')) +
        first([[-26, -2], [16, -2]], it.count).map(([x, y]) => rect(x, y, 10, 10, WHITE, 2)).join('');
    },
    hay: (it) => (it.count === 2
      ? rect(-16, -13, 32, 12, PAL.yellow, 6) + rect(-16, 1, 32, 12, PAL.yellow, 6)
      : rect(-16, -12, 32, 24, PAL.yellow, 8) + line('M-6 -12 v24 M6 -12 v24')),
    cow: (it) => rect(-14, 6, 5, 12, WHITE) + rect(5, 6, 5, 12, WHITE) + rect(-18, -10, 36, 20, WHITE, 10) + circle(18, -6, 8, WHITE) +
      ellipse(22, -2, 4, 2.5, PAL.pink) + circle(16, -8, 1.3, INK) + path('M12 -13 l-4 -5 l6 1 z', WHITE) +
      first([[-9, -3], [3, 2], [-2, -8]], it.count).map(([x, y]) => ellipse(x, y, 5, 4, INK)).join(''),
    pig: (it) => {
      const c = col(it, PAL.pink);
      return rect(-12, 6, 5, 8, c) + rect(5, 6, 5, 8, c) + ellipse(-2, 0, 18, 11, c) + circle(13, -2, 7, c) +
        ellipse(17, 0, 3.5, 2.5, PAL.red) + circle(12, -5, 1.3, INK) + path('M9 -8 l-3 -6 l6 1 z', c) + line('M-20 -2 q-4 4 0 6');
    },
    sheep: (it) => {
      const shut = it.state === 'shut';
      return rect(-12, 8, 4, 8, INK) + rect(6, 8, 4, 8, INK) + ellipse(-2, 0, 16, 10, WHITE) + circle(-12, -4, 6, WHITE) + circle(2, -8, 6, WHITE) +
        circle(14, -3, 6, INK) + (shut ? line('M11 -4 h3 M16 -4 h3', WHITE) : circle(12, -4, 1.3, WHITE) + circle(17, -4, 1.3, WHITE));
    },
    chick: (it) => {
      const c = col(it, PAL.yellow);
      return circle(0, 0, 7, c) + path('M7 0 l4 1.5 l-4 1.5 z', PAL.orange) + circle(3, -2, 1.1, INK) + line('M-3 7 v2 M1 7 v2', PAL.orange);
    },
    hen: (it) => {
      const c = col(it, BROWN);
      return path('M-11 2 l-4 -8 l4 2 l1 -5 l3 5 z', c) + ellipse(0, 4, 12, 9, c) + circle(9, -6, 6, c) + circle(8, -12, 2, PAL.red) + circle(11, -11, 2, PAL.red) +
        path('M14 -6 l5 1.5 l-5 1.5 z', PAL.orange) + circle(10, -7, 1.2, INK) + line('M-4 13 v2 M3 13 v2', PAL.orange);
    },
    pumpkin: (it) => {
      const c = col(it, PAL.orange);
      return rect(-2, -12, 4, 5, BROWN, 1) + ellipse(0, 1, 15, 10, c) + line('M-7 -8 q-3 9 0 18 M7 -8 q3 9 0 18');
    },
    scarecrow: (it) => line('M0 40 V-8') + line('M-16 -4 h32') + rect(-8, -8, 16, 26, PAL.blue, 3) + circle(0, -18, 8, PAL.yellow) +
      circle(-3, -19, 1.2, INK) + circle(3, -19, 1.2, INK) + line('M-3 -15 q3 2 6 0') +
      (it.state === 'hat' ? path('M-11 -24 h22 l-4 -8 h-14 z', BROWN) : ''),
    tractor: (it) => {
      const c = col(it, PAL.red);
      return rect(-26, -2, 38, 12, c, 2) + rect(-2, -18, 16, 16, c, 2) + rect(1, -15, 10, 8, WHITE, 1) + rect(-22, -10, 3, 8, GREY) +
        circle(-16, 11, 9, INK) + circle(-16, 11, 3.5, GREY) + circle(16, 13, 6, INK) + circle(16, 13, 2.5, GREY);
    },
  };

  function group(it, side, ctx) {
    const sx = it.flip ? -it.s : it.s;
    return `<g class="item" id="${side}-${it.id}" data-id="${it.id}" role="button" aria-label="${Scenes.label(it.kind)}" tabindex="-1"` +
      ` transform="translate(${f(it.x)} ${f(it.y)}) rotate(${f(it.rot)}) scale(${f(sx)} ${f(it.s)})"` +
      ` fill="none" stroke="${INK}" stroke-width="${f(2.5 / it.s)}" stroke-linejoin="round" stroke-linecap="round">${DRAWERS[it.kind](it, ctx)}</g>`;
  }
  // back to front: sky, back, air, water, ground; within a lane by base
  function picture(items, opts) {
    const ctx = { critters: opts.critters || '' };
    const lane = (it) => Scenes.LANE_ORDER.indexOf(Scenes.KINDS[it.kind].lane);
    const order = items.slice().sort((p, q) => lane(p) - lane(q) || Scenes.base(p) - Scenes.base(q) || (p.id < q.id ? -1 : 1));
    return backdrop(opts.theme) + order.map((it) => group(it, opts.side || 'a', ctx)).join('');
  }

  const api = { COLOURS, backdrop, DRAWERS, group, picture };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.Spot = root.Spot || {};
    root.Spot.Draw = api;
  }
})(this);
```

- [ ] **Step 4: Run the tests**

Run: `node --test docs/tests/spot.test.js`
Expected: all pass. A `colour #… ` failure means a drawer used a hex outside the palette and `COLOURS`; add the colour to `COLOURS` only if it is a backdrop or fixed-part colour, otherwise use a palette name.

- [ ] **Step 5: Judge the art by eye with a contact sheet**

Write `$SCRATCH/spot/sheet.html` (the session scratchpad, never the repo) that loads the three kit files from the worktree with absolute `file://` paths and renders, for every kind, every state, count and colour, one `<svg viewBox="-48 -48 96 96" width="96" height="96">` holding `Draw.group({ id: 'p0', kind, x: 0, y: 0, s: 1, flip: false, rot: 0, colour, state, count }, 'a', { critters: 'file:///C:/Users/shrik/playitmyway-web/.claude/worktrees/spot/icons/critters/' })`, plus one full picture per theme at `Scenes.make(7, Scenes.BIG[3], theme)` as two side-by-side `<svg viewBox="0 0 400 300" width="400">`. Screenshot it with puppeteer-core (Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, headless, `page.setViewport({ width: 1200, height: 2400 })`) and look at the PNG. Fix any drawer that does not read as its kind at 96 px, re-run the tests, and re-shoot. Expect two or three rounds.

- [ ] **Step 6: Commit**

```bash
git add games/shared/spot/draw.js docs/tests/spot.test.js
git commit -m "feat(spot): draw.js: backdrops and every item kind as flat ink-outlined SVG, tested in Node"
```

---

### Task 3: `play.js` and `spot.css`, the shared play loop

**Files:**
- Create: `games/shared/spot/play.js`
- Create: `games/shared/spot/spot.css` (rings, dots, ripple, confetti; one copy for both pages — a small addition to the spec's file list)

**Interfaces:**
- Consumes: `Scenes.*` (Task 1), `Draw.picture` (Task 2), `window.pimwMuted` (components.js), `Voice.say` (3+ only).
- Produces: `Play.start({ band, mount, seed, strings, voice, critters })` → handle `{ round, level, tier, seed, theme, diffs, found, hints, stars }` (live getters).
- Expects these ids inside `mount`: `picA`, `picB` (`<svg viewBox="0 0 400 300">`), `dots`, `tell` (live region), `intro`, `nextBtn`; optional `hintBtn`, `showBtn`, `roundLabel`, `starsLabel`, `done`, `doneTitle`, `doneSub` (7+ only).
- `strings` from the page: `intro(n)`, `found(name, k, n)`, `miss`, `hint`, and for 3+ `start`, `spoken(name)`, `done`; for 7+ `doneTitle(round)`, `doneSub(stars, hints, gaveUp)`, `round(r)`, `stars(total)`.

- [ ] **Step 1: Write `spot.css`**

Create `games/shared/spot/spot.css`:

```css
/* Shared by What's Different? and Spot the Difference: the two pictures,
   the found rings, the progress dots, a miss ripple and the confetti. */
.pics { display: grid; gap: 10px; width: 100%; max-width: 960px; justify-items: center; }
.pic {
  display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 16px; background: #dff4ff;
  touch-action: manipulation; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.pic .item { outline: none; cursor: pointer; }
/* side by side when wider than tall; stacked and fitted to the screen when upright */
@media (min-aspect-ratio: 1/1) { .pics { grid-template-columns: 1fr 1fr; } }
@media (max-aspect-ratio: 1/1) {
  .pic { width: min(100%, max(280px, calc((100vh - 250px) * 2 / 3))); }
  .pic { width: min(100%, max(280px, calc((100dvh - 250px) * 2 / 3))); }
}
.ring { fill: none; stroke: #ef4444; stroke-width: 4; }
.halo { fill: none; stroke: #ffffff; stroke-width: 7; }
.hint .ring, .shown .ring { stroke-dasharray: 9 6; }
.hint { transform-box: fill-box; transform-origin: center; animation: spotPulse 0.6s ease-in-out infinite alternate; }
@keyframes spotPulse { from { transform: scale(0.9); } to { transform: scale(1.1); } }
.focus { fill: none; stroke: #33302e; stroke-width: 3; stroke-dasharray: 6 4; }
.focus-halo { fill: none; stroke: #ffffff; stroke-width: 6; }
.ripple { fill: none; stroke: #33302e; stroke-width: 3; animation: spotRipple 0.5s ease-out forwards; transform-box: fill-box; transform-origin: center; }
@keyframes spotRipple { from { transform: scale(0.4); opacity: 0.9; } to { transform: scale(1.4); opacity: 0; } }
.dots { display: flex; justify-content: center; gap: 8px; margin: 10px 0; }
.dot { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #ef4444; background: transparent; }
.dot.on { background: #ef4444; }
.confetti-bit {
  position: fixed; top: -14px; width: 10px; height: 14px; border-radius: 3px; pointer-events: none; z-index: 50;
  animation: confettiFall linear forwards;
}
@keyframes confettiFall { to { transform: translateY(105vh) rotate(720deg); opacity: 0.7; } }
@media (prefers-reduced-motion: reduce) {
  .hint, .ripple { animation: none; }
  .ripple { opacity: 0.6; }
  .confetti-bit { display: none; }
}
```

- [ ] **Step 2: Write `play.js`**

Create `games/shared/spot/play.js`:

```js
/* The shared play loop for What's Different? (3+) and Spot the Difference
 * (7+): two pictures, taps and keys, rings, dots, hints, sounds and the
 * round-to-round rules from the spec. Classic script; sets window.Spot.Play.
 * Nothing is stored: every number here lasts only this visit. */
(function (root) {
  'use strict';
  const Scenes = root.Spot.Scenes, Draw = root.Spot.Draw;
  const NS = 'http://www.w3.org/2000/svg';
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---- a tiny WebAudio synth; silent while the site's sound toggle is off ----
  const AudioCtx = root.AudioContext || root.webkitAudioContext;
  let audio = null;
  function tone(freq, when, dur, gain) {
    const osc = audio.createOscillator(), g = audio.createGain();
    osc.connect(g); g.connect(audio.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audio.currentTime + when);
    g.gain.setValueAtTime(gain, audio.currentTime + when);
    g.gain.linearRampToValueAtTime(0.001, audio.currentTime + when + dur);
    osc.start(audio.currentTime + when);
    osc.stop(audio.currentTime + when + dur);
  }
  function sound(kind) {
    if (root.pimwMuted) return;
    if (!AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'ping') { tone(660, 0, 0.12, 0.1); tone(990, 0.1, 0.18, 0.1); }
      else if (kind === 'boop') tone(260, 0, 0.16, 0.05);
      else if (kind === 'chime') { tone(784, 0, 0.1, 0.07); tone(1046, 0.09, 0.14, 0.07); }
      else if (kind === 'tada') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 0.1));
    } catch (e) { /* sound is optional */ }
  }
  function confetti() {
    const colours = ['#f59e0b', '#fbbf24', '#ff6b57', '#15803d', '#7c3aed', '#2563eb'];
    for (let i = 0; i < 60; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colours[i % colours.length];
      bit.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
      bit.style.animationDelay = Math.random() * 0.6 + 's';
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 5000);
    }
  }

  function start(config) {
    const band = config.band, mount = config.mount || document, T = config.strings, voice = config.voice || null;
    const critters = config.critters || '../../icons/critters/';
    const $ = (id) => mount.querySelector('#' + id);
    const svg = { a: $('picA'), b: $('picB') };
    const S = { seed: config.seed === undefined ? Math.floor(Math.random() * 1e9) : config.seed, round: 0, level: 0,
      hints: 0, autoHints: 0, stars: 0, found: new Set(), scene: null, row: null, theme: null, over: false, gaveUp: false, lastFind: -1e9, timer: 0 };
    const say = (text) => { if (voice && voice.say) voice.say(text); };
    const tell = (text) => { $('tell').textContent = text; };
    const el = (name, attrs) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const marks = (side) => svg[side].querySelector('.marks');

    // ---- pictures ----
    function render(side) {
      const s = svg[side];
      s.innerHTML = Draw.picture(S.scene[side], { theme: S.theme, critters, side }) + '<g class="marks"></g>';
      const first = s.querySelector('.item');
      if (first) first.setAttribute('tabindex', '0');
    }
    function ring(side, region, cls) {
      const g = el('g', { class: cls });
      g.appendChild(el('circle', { class: 'halo', cx: region.x, cy: region.y, r: region.r }));
      g.appendChild(el('circle', { class: 'ring', cx: region.x, cy: region.y, r: region.r }));
      marks(side).appendChild(g);
      return g;
    }
    function ripple(side, x, y) {
      const c = el('circle', { class: 'ripple', cx: x, cy: y, r: 22 });
      marks(side).appendChild(c);
      setTimeout(() => c.remove(), 500);
    }
    function dots() {
      const d = $('dots');
      d.innerHTML = '';
      S.scene.diffs.forEach((diff) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (S.found.has(diff.id) ? ' on' : '');
        d.appendChild(dot);
      });
    }
    function toPicture(side, cx, cy) {
      const s = svg[side], pt = s.createSVGPoint();
      pt.x = cx; pt.y = cy;
      const p = pt.matrixTransform(s.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    }
    const itemOf = (side, id) => S.scene[side].find((it) => it.id === id);

    // ---- a tap or a keypress at a point ----
    function check(side, x, y) {
      if (S.over) return;
      const now = performance.now();
      if (now - S.lastFind < 250) return;
      const d = Scenes.hit(S.scene.diffs, S.found, x, y);
      if (!d) { ripple(side, x, y); sound('boop'); tell(T.miss); return; }
      S.found.add(d.id);
      S.lastFind = now;
      ring('a', d.region, 'found'); ring('b', d.region, 'found');
      dots();
      sound('ping');
      const base = itemOf(d.side === 'a' ? 'b' : 'a', d.item);   // the unchanged side holds the kind before any swap
      const name = Scenes.KINDS[base.kind].name;
      tell(T.found(name, S.found.size, S.scene.diffs.length));
      if (band === 'little') { say(T.spoken(name)); schedule(15000); }
      if (S.found.size === S.scene.diffs.length) finish(false);
    }

    // ---- hints ----
    let hintRings = [];
    function hint(auto) {
      if (S.over) return;
      const left = S.scene.diffs.filter((d) => !S.found.has(d.id));
      if (!left.length) return;
      const d = left[Math.floor(Math.random() * left.length)];
      hintRings.forEach((g) => g.remove());
      hintRings = [ring('a', d.region, 'hint'), ring('b', d.region, 'hint')];
      setTimeout(() => { hintRings.forEach((g) => g.remove()); hintRings = []; if ($('hintBtn')) $('hintBtn').disabled = false; }, 2000);
      if (auto) S.autoHints++; else S.hints++;
      if ($('hintBtn')) $('hintBtn').disabled = true;
      sound('chime');
      tell(T.hint);
      if (band === 'little') say(T.hint);
    }
    function schedule(ms) {
      clearTimeout(S.timer);
      if (band !== 'little' || S.over) return;
      S.timer = setTimeout(() => { hint(true); schedule(12000); }, ms);
    }
    function showRest() {
      if (S.over) return;
      S.scene.diffs.filter((d) => !S.found.has(d.id)).forEach((d) => { ring('a', d.region, 'shown'); ring('b', d.region, 'shown'); });
      finish(true);
    }

    // ---- the end of a round, and the next ----
    function finish(gaveUp) {
      S.over = true;
      S.gaveUp = gaveUp;
      clearTimeout(S.timer);
      if (!gaveUp) { sound('tada'); if (!calm()) confetti(); }
      if (band === 'little') {
        tell(T.done);
        say(T.done);
      } else {
        const st = Scenes.stars(S.hints, gaveUp);
        S.stars += st;
        $('starsLabel').textContent = T.stars(S.stars);
        $('doneTitle').textContent = T.doneTitle(S.round);
        $('doneSub').textContent = T.doneSub(st, S.hints, gaveUp);
        $('done').hidden = false;
        tell(T.doneTitle(S.round) + ' ' + T.doneSub(st, S.hints, gaveUp));
        if ($('hintBtn')) $('hintBtn').disabled = true;
        if ($('showBtn')) $('showBtn').disabled = true;
      }
      $('nextBtn').hidden = false;
      $('nextBtn').focus();
    }
    function newRound() {
      if (S.round > 0 && band === 'little') S.level = Scenes.nextLevel(S.level, S.autoHints);
      S.round++;
      S.found = new Set(); S.hints = 0; S.autoHints = 0; S.over = false; S.gaveUp = false; S.lastFind = -1e9;
      hintRings = [];
      S.theme = Scenes.theme(band, S.round, S.seed);
      S.row = band === 'little' ? Scenes.LITTLE[S.level] : Scenes.BIG[Scenes.tier(S.round)];
      S.scene = Scenes.make(S.seed + S.round, S.row, S.theme);
      render('a'); render('b');
      dots();
      $('intro').textContent = T.intro(S.row.diffs);
      $('nextBtn').hidden = true;
      if ($('done')) $('done').hidden = true;
      if ($('roundLabel')) $('roundLabel').textContent = T.round(S.round);
      if ($('starsLabel')) $('starsLabel').textContent = T.stars(S.stars);
      if ($('hintBtn')) $('hintBtn').disabled = false;
      if ($('showBtn')) $('showBtn').disabled = false;
      tell('');
      if (band === 'little') { say(T.start); schedule(15000); }
    }

    // ---- keyboard: roving focus among a picture's items ----
    function focusRing(side, item) {
      marks(side).querySelectorAll('.focus, .focus-halo').forEach((e) => e.remove());
      if (!item) return;
      const r = Scenes.half(item) + 6;
      marks(side).appendChild(el('circle', { class: 'focus-halo', cx: item.x, cy: item.y, r }));
      marks(side).appendChild(el('circle', { class: 'focus', cx: item.x, cy: item.y, r }));
    }
    function move(side, fromEl, key) {
      const from = itemOf(side, fromEl.dataset.id);
      const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
      let best = null, bestD = Infinity;
      for (const it of S.scene[side]) {
        if (it.id === from.id) continue;
        const dx = it.x - from.x, dy = it.y - from.y;
        const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]);
        if (along <= 0 || across > along) continue;                // a 90° cone ahead
        const dist = Math.hypot(dx, dy);
        if (dist < bestD) { bestD = dist; best = it; }
      }
      if (!best) return;
      fromEl.setAttribute('tabindex', '-1');
      const to = svg[side].querySelector('#' + side + '-' + best.id);
      to.setAttribute('tabindex', '0');
      to.focus();
    }
    for (const side of ['a', 'b']) {
      svg[side].addEventListener('click', (e) => {
        const p = toPicture(side, e.clientX, e.clientY);
        check(side, p.x, p.y);
      });
      svg[side].addEventListener('keydown', (e) => {
        const g = e.target.closest ? e.target.closest('.item') : null;
        if (!g) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const it = itemOf(side, g.dataset.id);
          check(side, it.x, it.y);
        } else if (e.key.indexOf('Arrow') === 0) {
          e.preventDefault();
          move(side, g, e.key);
        }
      });
      svg[side].addEventListener('focusin', (e) => {
        const g = e.target.closest ? e.target.closest('.item') : null;
        focusRing(side, g ? itemOf(side, g.dataset.id) : null);
      });
      svg[side].addEventListener('focusout', () => focusRing(side, null));
    }
    $('nextBtn').addEventListener('click', newRound);
    if ($('hintBtn')) $('hintBtn').addEventListener('click', () => hint(false));
    if ($('showBtn')) $('showBtn').addEventListener('click', showRest);

    newRound();
    return {
      get round() { return S.round; }, get level() { return band === 'little' ? S.level : null; },
      get tier() { return band === 'big' ? Scenes.tier(S.round) : null; }, get seed() { return S.seed; },
      get theme() { return S.theme; }, get diffs() { return S.scene.diffs; }, get found() { return Array.from(S.found); },
      get hints() { return band === 'little' ? S.autoHints : S.hints; }, get stars() { return S.stars; }, get over() { return S.over; },
    };
  }

  root.Spot = root.Spot || {};
  root.Spot.Play = { start };
})(this);
```

- [ ] **Step 3: Syntax-check both files and commit**

Run: `node --check games/shared/spot/play.js` — Expected: no output. (The loop is exercised by the pages' wiring test in Task 4 and the end-to-end player in Task 7; it has no Node test of its own because it is all DOM.)

```bash
git add games/shared/spot/play.js games/shared/spot/spot.css
git commit -m "feat(spot): shared play loop: taps, roving keyboard focus, rings, dots, hints, sounds, rounds"
```

---

### Task 4: The two pages

**Files:**
- Create: `games/whats-different/index.html`, `games/whats-different/game.js`
- Create: `games/spot-the-difference/index.html`, `games/spot-the-difference/game.js`
- Modify: `docs/tests/spot.test.js` (append)

**Interfaces:**
- Consumes: `Play.start` (Task 3), `window.Voice` from `games/shared/voice.js` (3+ only).
- Produces: `window.spot`, the live handle the end-to-end player reads (Task 7).

- [ ] **Step 1: Write the 3+ page**

Create `games/whats-different/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="only light" />
    <meta name="darkreader-lock" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- SEO Meta Tags -->
    <title>What's Different? – Free Spot the Difference Game for Little Ones | Play It My Way</title>
    <meta name="description" content="Two pictures of the same pond, meadow or farm, and two to four big things changed. Tap what's different! A gentle looking game for ages 3+ with a friendly voice. No ads." />
    <meta name="keywords" content="spot the difference for toddlers, whats different game, preschool picture game, looking game for 3 year olds, free game ages 3+" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="What's Different? – Free Spot the Difference Game for Little Ones" />
    <meta property="og:description" content="Two pictures, a few big differences, a voice that names what your child finds. No reading, no failing. Ages 3+. No ads, no download!" />
    <meta property="og:type" content="game" />
    <meta property="og:url" content="https://playitmyway.com/games/whats-different/" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="What's Different? – Free Spot the Difference Game for Little Ones" />
    <meta name="twitter:description" content="Two pictures, a few big differences, a voice that names what your child finds. Ages 3+. No ads, no download!" />

    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="canonical" href="https://playitmyway.com/games/whats-different/" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="../../tokens.css" />
    <link rel="stylesheet" href="../../components.css" />
    <link rel="stylesheet" href="../shared/spot/spot.css" />
    <style>
      :root {
        --band: var(--color-teal);
        --band-tint: var(--color-teal-tint);
        --band-tint-deep: #99d5cb;
        --band-deep: #134e4a;
        --ink: var(--color-ink);
        --ink-soft: var(--color-ink-soft);
        --deep: var(--color-deep);
      }
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body { background: var(--color-bg); overscroll-behavior-y: contain; }
      body {
        font-family: var(--font-display); color: var(--ink); margin: 0; padding: 16px 12px 48px;
        display: flex; flex-direction: column; align-items: center; min-height: 100vh;
      }
      button { font-family: inherit; }
      .back-link {
        color: var(--band); text-decoration: none; font-weight: 600; font-size: 15px; padding: 9px 14px;
        border-radius: var(--radius-pill); background: var(--band-tint); align-self: flex-start; margin-bottom: 6px;
        min-height: 44px; display: inline-flex; align-items: center; box-shadow: 0 3px 0 0 var(--band-tint-deep);
        transition: transform var(--ease-quick), box-shadow var(--ease-quick);
      }
      .back-link:hover { transform: translateY(-2px); box-shadow: 0 5px 0 0 var(--band-tint-deep); }
      .back-link:active { transform: translateY(3px); box-shadow: 0 1px 0 0 var(--band-tint-deep); }
      header.game-head { text-align: center; margin: 4px 0 8px; }
      header.game-head h1 { font-size: clamp(26px, 7vw, 34px); font-weight: 700; margin: 0; text-wrap: balance; }
      .stage-card {
        width: 100%; max-width: 980px; background: var(--color-surface); border-radius: var(--radius-lg);
        box-shadow: var(--shadow-rest); padding: 10px; display: flex; flex-direction: column; align-items: center;
      }
      .intro { margin: 0 0 8px; font-size: 20px; font-weight: 700; color: var(--deep); text-align: center; }
      .tell { min-height: 26px; margin: 0; text-align: center; font-size: 18px; font-weight: 600; color: var(--deep); }
      .go-btn {
        border: 0; border-radius: var(--radius-pill); font-size: 22px; font-weight: 700; padding: 14px 30px; min-height: 56px;
        margin-top: 10px; cursor: pointer; background: var(--band); color: #fff; box-shadow: 0 6px 0 var(--band-deep);
      }
      .go-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 var(--band-deep); }
      .how-to {
        width: 100%; max-width: 760px; margin: 22px auto 0; padding: 18px 22px; background: var(--color-surface);
        border-radius: var(--radius-lg); box-shadow: var(--shadow-rest); line-height: 1.6;
      }
      .how-to h2 { margin: 0 0 8px; font-size: 22px; }
      .how-to h3 { margin: 14px 0 4px; font-size: 18px; }
      .how-to ol { margin: 0; padding-left: 22px; }
      .how-to p { margin: 10px 0 0; }
      kbd { font-family: inherit; background: var(--band-tint); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <a class="back-link" href="../../">← Back to Games</a>

    <header class="game-head">
      <h1><img class="title-icon" src="../../icons/games/whats-different.svg" alt="" width="40" height="40"> What's Different?</h1>
    </header>

    <main class="stage-card">
      <p class="intro" id="intro">Tap what's different!</p>
      <div class="pics">
        <svg class="pic" id="picA" viewBox="0 0 400 300" role="group" aria-label="Left picture"></svg>
        <svg class="pic" id="picB" viewBox="0 0 400 300" role="group" aria-label="Right picture"></svg>
      </div>
      <div class="dots" id="dots" aria-hidden="true"></div>
      <p class="tell" id="tell" aria-live="polite"></p>
      <button type="button" class="go-btn" id="nextBtn" hidden>Next picture →</button>
    </main>

    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li>Look at the two pictures. They are nearly the same.</li>
        <li>Tap anything that is different, in either picture. A ring shows every one you find.</li>
        <li>Find them all and a new picture comes. It gets a little trickier only as your child gets them.</li>
      </ol>
      <p>If nothing is found for a while, one difference glows and the voice says "Look here!". Wrong taps never matter. With a keyboard, <kbd>Tab</kbd> into a picture, move with the arrow keys and press <kbd>Enter</kbd>. The voice is your device's own; nothing is sent anywhere, and nothing is saved.</p>
      <h3>What it practises</h3>
      <p>Looking carefully and comparing: noticing that something is missing, a different colour, or bigger, and holding one picture in mind while looking at the other.</p>
    </section>

    <footer class="site-footer">
      <p class="site-footer-badges">🚫 No ads · 🔒 No tracking · 🍪 Nothing stored · 💯 100% free</p>
      <nav class="site-footer-links" aria-label="Site links">
        <a href="../../">🏠 All games</a>
        <a href="../../privacy-policy.html">Privacy</a>
        <a href="../../disclaimer.html">Disclaimer</a>
        <a href="mailto:contact@playitmyway.com">Contact</a>
      </nav>
    </footer>

    <script src="../shared/voice.js"></script>
    <script src="../shared/spot/scenes.js"></script>
    <script src="../shared/spot/draw.js"></script>
    <script src="../shared/spot/play.js"></script>
    <script src="game.js"></script>
    <script src="../../components.js"></script>
    <script>
      /* Installed-app flag: drives the bottom bar. display-mode covers Android
         and modern iOS; navigator.standalone is the older iOS signal. */
      if (
        (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ||
        navigator.standalone
      ) {
        document.documentElement.classList.add("pimw-installed");
      }
      /* Back, with a floor: a game opened directly from a search result has no
         history to go back to, so fall through to the games index. */
      function pimwBack() {
        if (history.length > 1) history.back();
        else location.href = "/games/";
      }
      /* offline support; skipped over file:// where service workers do not run */
      if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
        addEventListener("load", function () {
          navigator.serviceWorker.register("/sw.js").catch(function () {});
        });
      }
    </script>
    <nav class="pimw-appbar" aria-label="App navigation">
      <button type="button" class="pimw-appbar-btn" onclick="pimwBack()">
        <span class="pimw-appbar-ic" aria-hidden="true">←</span>
        <span class="pimw-appbar-label">Back</span>
      </button>
      <a class="pimw-appbar-btn" href="/">
        <span class="pimw-appbar-ic" aria-hidden="true">🏠</span>
        <span class="pimw-appbar-label">Home</span>
      </a>
      <a class="pimw-appbar-btn" href="/games/">
        <span class="pimw-appbar-ic" aria-hidden="true">🎮</span>
        <span class="pimw-appbar-label">Games</span>
      </a>
    </nav>
  </body>
</html>
```

- [ ] **Step 2: Write the 3+ `game.js`**

Create `games/whats-different/game.js`:

```js
/* What's Different?: the 3+ game on the shared spot kit. All the rules live
 * in ../shared/spot/play.js; this file is the band and the words. */
(function () {
  'use strict';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const seedParam = new URLSearchParams(location.search).get('seed');
  window.spot = window.Spot.Play.start({
    band: 'little',
    seed: seedParam === null ? undefined : Number(seedParam),
    voice: window.Voice || null,
    strings: {
      intro: () => "Tap what's different!",
      start: "Find what's different!",
      found: (name, k, n) => 'Found ' + name + '! ' + k + ' of ' + n + '.',
      spoken: (name) => cap(name) + '!',
      miss: 'Not there.',
      hint: 'Look here!',
      done: 'You found them all!',
    },
  });
})();
```

- [ ] **Step 3: Write the 7+ page**

Create `games/spot-the-difference/index.html`. Its `<head>` is the 3+ page's head with these exact changes: `theme-color` `#7c3aed`; `<title>Spot the Difference – Free Picture Puzzle for Kids | Play It My Way</title>`; description `Two busy pictures of a pond, meadow or farm, five to eight differences between them. Free hints, no clock, stars for finding them all. Ages 7+. No ads.`; keywords `spot the difference for kids, find the differences game, picture puzzle for children, observation game ages 7+, free puzzle game`; `og:title` and `twitter:title` `Spot the Difference – Free Picture Puzzle for Kids`; `og:description` and `twitter:description` `Find every difference between two busy pictures: a missing item, a changed shade, an extra apple, a flipped boat. Free hints, no clock. Ages 7+. No ads, no download!`; `og:url` and canonical `https://playitmyway.com/games/spot-the-difference/`; the `:root` block becomes

```css
      :root {
        --band: var(--color-violet);
        --band-tint: var(--color-violet-tint);
        --band-tint-deep: #c9bbf0;
        --band-deep: var(--candy-violet);
        --ink: var(--color-ink);
        --ink-soft: var(--color-ink-soft);
        --deep: var(--color-deep);
      }
```

and these rules are added after `.go-btn:active`:

```css
      .toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 16px; margin: 4px 0 6px; }
      .soft-btn {
        border: 0; border-radius: var(--radius-pill); font-size: 17px; font-weight: 600; padding: 10px 18px; min-height: 44px;
        cursor: pointer; background: var(--band-tint); color: var(--band); box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .soft-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--band-tint-deep); }
      .soft-btn:disabled { opacity: 0.55; cursor: default; }
      .label { font-weight: 700; font-size: 17px; color: var(--deep); }
      .text-btn { border: 0; background: none; color: var(--band); font-size: 15px; font-weight: 600; text-decoration: underline; min-height: 44px; padding: 0 8px; cursor: pointer; }
      .text-btn:disabled { opacity: 0.55; cursor: default; }
      .done { width: 100%; display: flex; justify-content: center; margin-top: 10px; }
      .done-card {
        background: #fff; border-radius: 24px; padding: 16px 22px 18px; text-align: center; width: 100%; max-width: 360px;
        box-shadow: 0 8px 0 var(--band-tint-deep), var(--shadow-lift);
      }
      .done-card h2 { margin: 0; font-size: 26px; }
      .done-sub { margin: 4px 0 0; color: var(--ink-soft); font-weight: 600; font-size: 18px; }
```

The `<body>` is the 3+ body with the title `<h1><img class="title-icon" src="../../icons/games/spot-the-difference.svg" alt="" width="40" height="40"> Spot the Difference</h1>`, no `../shared/voice.js` script, and this `<main>`:

```html
    <main class="stage-card">
      <p class="intro" id="intro">Find all 5 differences. Tap them in either picture.</p>
      <div class="pics">
        <svg class="pic" id="picA" viewBox="0 0 400 300" role="group" aria-label="Left picture"></svg>
        <svg class="pic" id="picB" viewBox="0 0 400 300" role="group" aria-label="Right picture"></svg>
      </div>
      <div class="dots" id="dots" aria-hidden="true"></div>
      <div class="toolbar">
        <button type="button" class="soft-btn" id="hintBtn">💡 Hint</button>
        <span class="label" id="roundLabel">Round 1</span>
        <span class="label" id="starsLabel">★ 0</span>
        <button type="button" class="text-btn" id="showBtn">Show me the rest</button>
      </div>
      <p class="tell" id="tell" aria-live="polite"></p>
      <section class="done" id="done" hidden aria-labelledby="doneTitle">
        <div class="done-card">
          <h2 id="doneTitle"></h2>
          <p class="done-sub" id="doneSub"></p>
          <button type="button" class="go-btn" id="nextBtn" hidden>Next picture →</button>
        </div>
      </section>
    </main>
```

and this how-to:

```html
    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li>The two pictures look the same, but five or more things are different: something missing, a different colour or shade, bigger or smaller, flipped, moved, tilted, or one more apple than before.</li>
        <li>Tap each difference in either picture. A ring marks it in both.</li>
        <li>Find them all for stars: three with no hint, two with one, one with more. Stuck? 💡 Hint shows one; "Show me the rest" gives up the round.</li>
      </ol>
      <p>There is no clock and wrong taps cost nothing. Each round has a few more, and smaller, differences than the last. With a keyboard, <kbd>Tab</kbd> into a picture, move with the arrow keys and press <kbd>Enter</kbd>. Nothing is saved: the stars last only this visit.</p>
      <h3>What it practises</h3>
      <p>Careful, systematic looking and visual memory: comparing two scenes part by part, noticing small changes of colour, size, position and number, and keeping track of what has been checked.</p>
    </section>
```

- [ ] **Step 4: Write the 7+ `game.js`**

Create `games/spot-the-difference/game.js`:

```js
/* Spot the Difference: the 7+ game on the shared spot kit. All the rules
 * live in ../shared/spot/play.js; this file is the band and the words. */
(function () {
  'use strict';
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const seedParam = new URLSearchParams(location.search).get('seed');
  window.spot = window.Spot.Play.start({
    band: 'big',
    seed: seedParam === null ? undefined : Number(seedParam),
    strings: {
      intro: (n) => 'Find all ' + n + ' differences. Tap them in either picture.',
      found: (name, k, n) => 'Found ' + name + '! ' + k + ' of ' + n + '.',
      miss: 'Not there.',
      hint: "Here's one.",
      doneTitle: (round) => 'Round ' + round + ' done!',
      doneSub: (stars, hints, gaveUp) =>
        '★'.repeat(stars) + '☆'.repeat(3 - stars) + ' ' +
        (gaveUp ? 'Shown.' : hints === 0 ? 'No hints!' : hints === 1 ? 'One hint used.' : (WORDS[hints] || hints) + ' hints used.'),
      round: (round) => 'Round ' + round,
      stars: (total) => '★ ' + total,
    },
  });
})();
```

- [ ] **Step 5: Append the page-wiring tests**

Append to `docs/tests/spot.test.js`:

```js
const PAGES = [
  { slug: 'whats-different', band: 'little', title: "What's Different?", voice: true, theme: '#0f766e' },
  { slug: 'spot-the-difference', band: 'big', title: 'Spot the Difference', voice: false, theme: '#7c3aed' },
];

test('pages: shell, script order, title icon, live region, no storage, no foreign URLs', () => {
  for (const p of PAGES) {
    const html = read('games', p.slug, 'index.html');
    const js = read('games', p.slug, 'game.js');
    for (const need of [
      '<link rel="stylesheet" href="../../tokens.css" />', '<link rel="stylesheet" href="../../components.css" />', '<link rel="stylesheet" href="../shared/spot/spot.css" />',
      `<link rel="canonical" href="https://playitmyway.com/games/${p.slug}/" />`, `<meta property="og:url" content="https://playitmyway.com/games/${p.slug}/" />`,
      `<meta name="theme-color" content="${p.theme}" />`,
      `<h1><img class="title-icon" src="../../icons/games/${p.slug}.svg" alt="" width="40" height="40"> ${p.title}</h1>`,
      'id="picA" viewBox="0 0 400 300" role="group" aria-label="Left picture"', 'id="picB" viewBox="0 0 400 300" role="group" aria-label="Right picture"',
      'id="dots" aria-hidden="true"', 'id="tell" aria-live="polite"', 'id="nextBtn"', 'id="intro"', 'class="site-footer"', 'class="pimw-appbar"',
    ]) assert.ok(html.includes(need), `${p.slug}: missing ${need}`);
    assert.equal((html.match(/<main\b/g) || []).length, 1, `${p.slug}: one <main>`);
    assert.equal((html.match(/aria-live=/g) || []).length, 1, `${p.slug}: one live region`);
    const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
    const want = (p.voice ? ['../shared/voice.js'] : []).concat(['../shared/spot/scenes.js', '../shared/spot/draw.js', '../shared/spot/play.js', 'game.js', '../../components.js']);
    assert.deepEqual(scripts, want, `${p.slug}: script order`);
    assert.ok(!html.includes('type="module"'), `${p.slug}: no modules (file://)`);
    assert.ok(js.includes(`band: '${p.band}'`), `${p.slug}: band`);
    assert.ok(js.includes('window.spot = window.Spot.Play.start('), `${p.slug}: handle for the e2e`);
    if (p.voice) assert.ok(js.includes('voice: window.Voice || null'), 'the 3+ page speaks');
    else assert.ok(!js.includes('Voice') && !html.includes('voice.js'), 'the 7+ page does not');
    for (const src of [html, js]) {
      for (const bad of ['localStorage', 'sessionStorage', 'document.cookie', 'fetch(', 'XMLHttpRequest', 'googleapis', 'cloudflareinsights']) assert.ok(!src.includes(bad), `${p.slug}: ${bad}`);
      for (const u of src.match(/https?:\/\/[^"'\s<)]+/g) || []) assert.ok(u.startsWith('https://playitmyway.com/'), `${p.slug}: foreign URL ${u}`);
    }
  }
  const big = read('games', 'spot-the-difference', 'index.html'), little = read('games', 'whats-different', 'index.html');
  for (const id of ['hintBtn', 'showBtn', 'roundLabel', 'starsLabel', 'done', 'doneTitle', 'doneSub']) {
    assert.ok(big.includes(`id="${id}"`), `7+ needs #${id}`);
    assert.ok(!little.includes(`id="${id}"`), `3+ must not have #${id}`);
  }
});

test('the kit stores nothing, fetches nothing and guards every sound', () => {
  for (const f of ['scenes.js', 'draw.js', 'play.js', 'spot.css']) {
    const src = read('games', 'shared', 'spot', f);
    for (const bad of ['localStorage', 'sessionStorage', 'cookie', 'fetch(', 'XMLHttpRequest', 'import(']) assert.ok(!src.includes(bad), `${f}: ${bad}`);
    for (const u of src.match(/https?:\/\/[^"'\s<)]+/g) || []) assert.ok(u.startsWith('http://www.w3.org/'), `${f}: foreign URL ${u}`);
  }
  const play = read('games', 'shared', 'spot', 'play.js');
  assert.ok(play.includes('function sound(kind) {\n    if (root.pimwMuted) return;'), 'sound() must start with the mute guard');
  assert.ok(play.includes("'(prefers-reduced-motion: reduce)'"), 'confetti must respect reduced motion');
});
```

- [ ] **Step 6: Run the tests, open both pages, commit**

Run: `node --test docs/tests/spot.test.js` — Expected: all pass.

Open `file:///C:/Users/shrik/playitmyway-web/.claude/worktrees/spot/games/whats-different/index.html?seed=7` and `.../spot-the-difference/index.html?seed=7` in Chrome by hand (the title icons are missing until Task 6; everything else must work): two pictures, taps ring both sides, dots fill, Next appears; on 7+ Hint pulses and Show me the rest ends the round with ☆☆☆. Also narrow the window to a portrait shape and confirm the pictures stack and both fit.

```bash
git add games/whats-different games/spot-the-difference docs/tests/spot.test.js
git commit -m "feat(spot): the What's Different? (3+) and Spot the Difference (7+) pages"
```

---

### Task 5: Icons and site wiring (one commit, so every icon test stays green)

**Files:**
- Create: `icons/games/whats-different.svg`, `icons/games/spot-the-difference.svg`
- Modify: `docs/catalogue.js` (two entries), `index.html` (two cards + the tagline count), `sitemap.xml` (two urls), `manifest.json` (the count)
- Regenerate: `games/index.html`, `for-teachers.html`, `404.html`, `sw.js` via `node docs/build-pages.js`

**Interfaces:**
- Consumes: the two page folders from Task 4 (the icon test reads every catalogue game's `index.html` title).
- Produces: nothing new for later tasks; after this task `node --test docs/tests/*.test.js` is green across the whole suite.

- [ ] **Step 1: Run the icon test to see what it will demand**

Run: `node --test docs/tests/icons.test.js` — Expected: PASS (the new pages are not in the catalogue yet, so nothing is checked). After Step 3 it will fail until every step below is done; that is the point of doing them together.

- [ ] **Step 2: Draw the two icons**

Create `icons/games/whats-different.svg` (exactly this, one line of shapes, no leading BOM):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- What's Different?: two framed pictures of a hill, the sun in only one -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="10" width="19" height="28" rx="3" fill="#60a5fa"/><path d="M3 32q6-9 19-3v9H3z" fill="#4ade80"/><circle cx="12" cy="19" r="4" fill="#fbbf24"/><rect x="26" y="10" width="19" height="28" rx="3" fill="#60a5fa"/><path d="M26 32q6-9 19-3v9h-19z" fill="#4ade80"/></g>
</svg>
```

Create `icons/games/spot-the-difference.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Spot the Difference: a magnifying glass over two overlapping pictures -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><rect x="4" y="6" width="22" height="18" rx="3" fill="#ffffff"/><path d="M4 20q6-6 22-2v6H4z" fill="#4ade80"/><rect x="14" y="14" width="22" height="18" rx="3" fill="#ffffff"/><path d="M14 28q6-6 22-2v6H14z" fill="#4ade80"/><circle cx="30" cy="30" r="8" fill="#ccfbf1"/><path d="M36 36l8 8" stroke-width="4"/></g>
</svg>
```

Both use only the palette the icon test allows (`tokens.css` colours such as `#ccfbf1`, plus the fixed extras `#60a5fa`, `#4ade80`, `#fbbf24`, `#ffffff`, and ink). Look at each at 36 px (open the file in Chrome and zoom out, or add them to the Task 2 contact sheet) and adjust shapes, never the rules.

- [ ] **Step 3: Add the catalogue entries**

In `docs/catalogue.js`, directly after the `peekaboo-pond` entry (the last one before the `// --- 5+ ---` comment) add:

```js
    { slug: 'whats-different', name: "What's Different?", age: '3', mins: '5',
      skills: ['logic'],
      practises: "Looking carefully and comparing: two pictures of the same scene with two to four big things changed, such as a missing frog, a red flower turned blue or a bigger boat. The voice names each find, a hint glows by itself when the child is stuck, and wrong taps never matter." },
```

and directly after the `frozen-pond` entry (the last 7+ entry, before the `// --- 14+ ---` comment) add:

```js
    { slug: 'spot-the-difference', name: 'Spot the Difference', age: '7', mins: '10',
      skills: ['logic'],
      practises: 'Careful, systematic looking and visual memory: five to eight differences between two busy pictures, from a missing item or a far colour to a changed shade, an extra apple, a flipped boat or a tilted tree. Free hints, no clock, stars for finding them all.' },
```

- [ ] **Step 4: Add the homepage cards**

In `index.html`, directly after the `peekaboo-pond` card (inside the `Little Learners` `.game-grid`) add:

```html
          <a class="game-card" href="games/whats-different/index.html">
            <span class="game-icon" aria-hidden="true"><img src="icons/games/whats-different.svg" alt="" width="44" height="44"></span>
            <span class="game-card-name">What's Different?</span>
            <span class="game-card-age">3+</span>
          </a>
```

and directly after the `frozen-pond` card (inside the `Brain Boosters` `.game-grid`) add:

```html
          <a class="game-card" href="games/spot-the-difference/index.html">
            <span class="game-icon" aria-hidden="true"><img src="icons/games/spot-the-difference.svg" alt="" width="44" height="44"></span>
            <span class="game-card-name">Spot the Difference</span>
            <span class="game-card-age">7+</span>
          </a>
```

- [ ] **Step 5: Sitemap and counts**

In `sitemap.xml`, after the last game `<url>` block, add:

```xml
  <url>
    <loc>https://playitmyway.com/games/whats-different/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://playitmyway.com/games/spot-the-difference/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

Write `$SCRATCH/spot/counts.cjs` (scratchpad, not the repo) and run it from the worktree root with `node $SCRATCH/spot/counts.cjs`; it sets both counts to the catalogue's length, whatever `main` held when the branch was cut:

```js
const fs = require('fs');
const n = require(process.cwd() + '/docs/catalogue.js').games.length;
for (const [file, re] of [['index.html', /(\d+) hand-built games/], ['manifest.json', /(\d+) free educational games/]]) {
  const s = fs.readFileSync(file, 'utf8');
  if (!re.test(s)) throw new Error(file + ': count not found');
  fs.writeFileSync(file, s.replace(re, (m, d) => m.replace(d, String(n))));
}
console.log('games: ' + n);
```

Expected output: `games: 47` (or two more than whatever the branch started with).

- [ ] **Step 6: Regenerate and run the whole suite**

Run: `node docs/build-pages.js` — Expected: `games/index.html  — 47 games across 5 bands` (plus the other generated files; the number matches Step 5).

Run: `node --test (Get-ChildItem docs/tests/*.test.js).FullName` — Expected: every test file passes, including `icons.test.js` (coverage, no orphans, the two title icons, precache lines for both icons and both pages) and `spot.test.js`.

- [ ] **Step 7: Commit**

```bash
git add icons/games/whats-different.svg icons/games/spot-the-difference.svg docs/catalogue.js index.html sitemap.xml manifest.json games/index.html for-teachers.html 404.html sw.js
git commit -m "feat(spot): icons, catalogue, homepage cards, sitemap, counts and generated pages for the two games"
```

---

### Task 6: The end-to-end player

**Files:**
- Create (scratchpad only, never the repo): `$SCRATCH/spot/e2e.cjs`; puppeteer-core is already installed in `$env:TEMP/pimw-puppeteer` (`node_modules` there); run with `NODE_PATH=$env:TEMP/pimw-puppeteer/node_modules` or copy the script beside it.

**Interfaces:**
- Consumes: `window.spot` (Task 4), `scenes.js` in Node (Task 1), the page ids from Task 3.

- [ ] **Step 1: Write the player**

```js
// Plays What's Different? (little) or Spot the Difference (big) in headless Chrome,
// by tap on one picture and by keyboard on the other, three rounds by seed.
//   node e2e.cjs <little|big> <pageUrl> <shotsDir> [tag]
// Env: PHONE=1 (390x844, touch taps); SHORT=1 (390x667, both pictures must fit);
//      CALM=1 (reduced motion); ROOT=<repo root for scenes.js>;
//      ALLOW=<comma-separated URL prefixes the host may inject> (reported, not failed).
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert/strict');
const ROOT = process.env.ROOT || 'C:/Users/shrik/playitmyway-web/.claude/worktrees/spot';
const S = require(ROOT + '/games/shared/spot/scenes.js');
const [band, url, shots, tag = band] = process.argv.slice(2);
const SEED = 7;
const phone = !!(process.env.PHONE || process.env.SHORT);
const calm = !!process.env.CALM;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALLOW = (process.env.ALLOW || '').split(',').filter(Boolean);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  if (process.env.SHORT) await page.setViewport({ width: 390, height: 667, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else if (process.env.PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1200, height: 860 });
  if (calm) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // the voice: an online default and one local voice; record every line spoken
  await page.evaluateOnNewDocument(() => {
    const voices = [
      { name: 'Online', lang: 'en-US', localService: false, default: true, voiceURI: 'o' },
      { name: 'Local UK', lang: 'en-GB', localService: true, default: false, voiceURI: 'l' },
    ];
    window.__spoken = [];
    window.speechSynthesis = {
      getVoices: () => voices, cancel() {}, addEventListener() {},
      speak(u) { window.__spoken.push({ text: u.text, local: !!(u.voice && u.voice.localService) }); },
    };
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  });
  const own = (u) => u.startsWith('file://') || u.startsWith('data:') || u.startsWith(new URL(url).origin + '/');
  const problems = [], foreign = [], injected = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (own(u)) return;
    if (ALLOW.some((p) => u.startsWith(p))) injected.push(u); else foreign.push(u);
  });

  const text = (sel) => page.$eval(sel, (e) => e.textContent);
  const count = (sel) => page.$$eval(sel, (es) => es.length);
  const shot = (name) => page.screenshot({ path: path.join(shots, `${tag}-${name}.png`) });
  const state = () => page.evaluate(() => ({ round: spot.round, level: spot.level, tier: spot.tier, seed: spot.seed, theme: spot.theme, found: spot.found, hints: spot.hints, stars: spot.stars, over: spot.over, diffs: spot.diffs }));
  async function until(fn, ms, what) {
    const t0 = Date.now();
    for (;;) {
      if (await fn()) return;
      if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what + ' (tell: ' + (await text('#tell')) + ')');
      await sleep(60);
    }
  }
  const SIDE = { a: '#picA', b: '#picB' };
  async function tap(side, x, y) {
    const r = await page.$eval(SIDE[side], (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
    const cx = r.left + (x / 400) * r.width, cy = r.top + (y / 300) * r.height;
    if (phone) await page.touchscreen.tap(cx, cy); else await page.mouse.click(cx, cy);
  }
  // a point in neither region, for a deliberate miss
  function missPoint(diffs) {
    for (let y = 30; y < 280; y += 10) for (let x = 30; x < 380; x += 10) {
      if (diffs.every((d) => Math.hypot(d.region.x - x, d.region.y - y) > d.region.r + 12)) return { x, y };
    }
    throw new Error('no miss point');
  }
  // keyboard: walk the roving focus to the item, then press Enter
  async function keyFind(side, d, scene) {
    const items = scene[side];
    const target = items.find((it) => it.id === d.item);
    await page.focus(SIDE[side] + ' .item[tabindex="0"]');
    for (let presses = 0; presses < 60; presses++) {
      const at = await page.evaluate(() => document.activeElement && document.activeElement.dataset.id);
      assert.ok(at, 'focus is on an item');
      if (at === target.id) { await page.keyboard.press('Enter'); return; }
      const cur = items.find((it) => it.id === at);
      const dx = target.x - cur.x, dy = target.y - cur.y;
      const keys = Math.abs(dx) >= Math.abs(dy)
        ? [dx > 0 ? 'ArrowRight' : 'ArrowLeft', dy > 0 ? 'ArrowDown' : 'ArrowUp']
        : [dy > 0 ? 'ArrowDown' : 'ArrowUp', dx > 0 ? 'ArrowRight' : 'ArrowLeft'];
      for (const k of keys) {
        await page.keyboard.press(k);
        const now = await page.evaluate(() => document.activeElement.dataset.id);
        if (now !== at) break;
      }
    }
    throw new Error('could not walk the focus to ' + target.id);
  }

  await page.goto(url + '?seed=' + SEED, { waitUntil: 'load', timeout: 180000 });
  await sleep(600);
  await shot('start');
  if (process.env.SHORT) {
    const fit = await page.evaluate(() => { window.scrollTo(0, 0); const a = document.getElementById('picA').getBoundingClientRect(), b = document.getElementById('picB').getBoundingClientRect(); return { top: a.top, bottom: b.bottom, h: innerHeight, w: a.width }; });
    assert.ok(fit.top >= 0 && fit.bottom <= fit.h + 1, 'both pictures fit a 390x667 phone: ' + JSON.stringify(fit));
    assert.ok(fit.w >= 280, 'pictures never narrower than 280px');
  }

  let level = 0;
  for (let round = 1; round <= 3; round++) {
    const st = await state();
    assert.equal(st.round, round); assert.equal(st.seed, SEED);
    const row = band === 'little' ? S.LITTLE[level] : S.BIG[S.tier(round)];
    const theme = S.theme(band, round, SEED);
    assert.equal(st.theme, theme, 'theme');
    if (band === 'little') assert.equal(st.level, level, 'level');
    const scene = S.make(SEED + round, row, theme);
    assert.deepEqual(st.diffs, scene.diffs, 'the page and Node agree on the differences');
    const n = scene.diffs.length;
    assert.equal(await text('#intro'), band === 'little' ? "Tap what's different!" : `Find all ${n} differences. Tap them in either picture.`);
    assert.equal(await count('#dots .dot'), n);
    assert.equal(await count('#dots .dot.on'), 0);
    if (band === 'little') await until(async () => (await page.evaluate(() => window.__spoken.map((s) => s.text))).includes("Find what's different!"), 3000, 'the start line');

    const miss = missPoint(scene.diffs);
    await tap('a', miss.x, miss.y);
    await until(async () => (await text('#tell')) === 'Not there.', 3000, 'the miss');
    assert.equal((await state()).found.length, 0, 'a miss costs nothing');

    if (band === 'big' && round === 2) {
      await page.click('#hintBtn');
      await until(async () => (await count('#picA .hint')) === 1 && (await count('#picB .hint')) === 1, 2000, 'the hint rings');
      assert.equal(await text('#tell'), "Here's one.");
      assert.equal(await page.$eval('#hintBtn', (b) => b.disabled), true, 'no double hints');
      await until(async () => (await count('#picA .hint')) === 0, 3500, 'the hint to fade');
    }
    if (band === 'little' && round === 2) {
      await until(async () => (await count('#picA .hint')) === 1, 17000, 'the automatic hint after 15 s');
      const spoken = await page.evaluate(() => window.__spoken.map((s) => s.text));
      assert.equal(spoken[spoken.length - 1], 'Look here!');
      await shot('auto-hint');
    }

    const stopAt = band === 'big' && round === 3 ? 2 : n;    // round 3 on 7+: give up after two
    for (let i = 0; i < stopAt; i++) {
      const d = scene.diffs[i];
      const other = d.side === 'a' ? 'b' : 'a';
      if (i % 2 === 0) await tap(i % 4 === 0 ? d.side : other, d.region.x, d.region.y);
      else await keyFind(d.kind === 'missing' ? other : 'b', d, scene);
      await until(async () => (await state()).found.length === i + 1, 3000, `find ${i + 1}`);
      const base = scene[other].find((it) => it.id === d.item);
      assert.equal(await text('#tell'), `Found ${S.KINDS[base.kind].name}! ${i + 1} of ${n}.`);
      assert.equal(await count('#picA .found'), i + 1); assert.equal(await count('#picB .found'), i + 1);
      assert.equal(await count('#dots .dot.on'), i + 1);
      if (band === 'little') {
        const spoken = await page.evaluate(() => window.__spoken);
        const name = S.KINDS[base.kind].name;
        assert.equal(spoken[spoken.length - 1].text, name.charAt(0).toUpperCase() + name.slice(1) + '!');
      }
      if (round === 1 && i === 0) await shot('first-find');
      await sleep(320);                                        // the 250 ms double-tap guard
    }
    if (stopAt < n) {
      await page.click('#showBtn');
      await until(async () => (await count('#picA .shown')) === n - stopAt, 2000, 'the shown rings');
    }
    await until(async () => (await state()).over, 3000, 'the round to end');
    if (band === 'little') {
      assert.equal(await text('#tell'), 'You found them all!');
    } else {
      assert.equal(await page.$eval('#done', (e) => e.hidden), false);
      assert.equal(await text('#doneTitle'), `Round ${round} done!`);
      const sub = await text('#doneSub');
      assert.equal(sub, round === 1 ? '★★★ No hints!' : round === 2 ? '★★☆ One hint used.' : '☆☆☆ Shown.');
      assert.equal((await state()).stars, round === 1 ? 3 : 5);
    }
    const bits = await count('.confetti-bit');
    if (calm || stopAt < n) assert.equal(bits, 0, 'no confetti'); else assert.ok(bits > 0, 'confetti');
    await shot(`done-${round}`);
    await page.click('#nextBtn');
    if (band === 'little') level = S.nextLevel(level, round === 2 ? 1 : 0);
    await until(async () => (await state()).round === round + 1, 3000, 'the next round');
  }
  if (band === 'little') {
    assert.equal((await state()).level, 2, 'up, steady, up');
    const spoken = await page.evaluate(() => window.__spoken);
    assert.ok(spoken.length > 6 && spoken.every((s) => s.local), 'every line used the local voice: ' + JSON.stringify(spoken.slice(0, 3)));
  }

  const stored = await page.evaluate(() => { try { return [localStorage.length, sessionStorage.length, document.cookie]; } catch (e) { return [0, 0, '']; } });
  assert.deepEqual(stored, [0, 0, ''], 'nothing stored');
  assert.deepEqual(foreign, [], 'third-party requests');
  assert.deepEqual(problems, [], 'console or page errors');
  if (injected.length) console.log('set aside (host-injected): ' + [...new Set(injected.map((u) => new URL(u).host))].join(', '));
  console.log('E2E PASS (' + tag + ')');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it over `file://` in every mode, one Chrome at a time**

From the worktree root, with `$SP = "$env:TEMP\...scratchpad\spot"` and `New-Item -ItemType Directory -Force "$SP\shots"`:

```powershell
$env:NODE_PATH = "$env:TEMP\pimw-puppeteer\node_modules"
$L = "file:///C:/Users/shrik/playitmyway-web/.claude/worktrees/spot/games/whats-different/index.html"
$B = "file:///C:/Users/shrik/playitmyway-web/.claude/worktrees/spot/games/spot-the-difference/index.html"
node "$SP\e2e.cjs" little $L "$SP\shots" little-desktop
node "$SP\e2e.cjs" big $B "$SP\shots" big-desktop
$env:PHONE = '1'; node "$SP\e2e.cjs" little $L "$SP\shots" little-phone; node "$SP\e2e.cjs" big $B "$SP\shots" big-phone; Remove-Item env:PHONE
$env:SHORT = '1'; node "$SP\e2e.cjs" little $L "$SP\shots" little-short; node "$SP\e2e.cjs" big $B "$SP\shots" big-short; Remove-Item env:SHORT
$env:CALM = '1'; node "$SP\e2e.cjs" little $L "$SP\shots" little-calm; node "$SP\e2e.cjs" big $B "$SP\shots" big-calm; Remove-Item env:CALM
```

Expected: `E2E PASS (…)` eight times. Look at `start`, `first-find`, `auto-hint` and `done-*` screenshots for each run and judge them by eye: rings on both pictures, dots, the stacked phone layout with both pictures visible. A failure is a bug in the kit or the page unless the message names the player itself (for example `could not walk the focus`, which means the arrow-key cone rule left an item unreachable: fix `move()` in `play.js` so every item is reachable, not the player).

- [ ] **Step 3: Record and commit**

Copy the player's final code into this plan under "Changes made while building" if it differs from Step 1. Commit any `play.js` or page fixes with their own messages, for example `fix(spot): arrow keys reach every item`.

---

### Task 7: Merge, release, live check

**Files:** none new in the repo; `MEMORY.md` and `playitmyway-site-context.md` in the memory directory are updated by the coordinator at the end.

- [ ] **Step 1: Bring the branch up to date with `main`**

In the worktree: `git log --oneline spot-the-difference..main`. If it prints anything (Missing Tile has landed), run `git rebase main`; conflicts can only be in the wiring files (`docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json`, `sw.js`, `games/index.html`, `for-teachers.html`, `404.html`). Resolve by keeping both games' entries, cards and urls, then re-run `node $SCRATCH/spot/counts.cjs` and `node docs/build-pages.js`, `git add` the result and `git rebase --continue`.

- [ ] **Step 2: Full verification on the branch**

```powershell
node --test (Get-ChildItem docs/tests/*.test.js).FullName
```

Expected: every file passes. Then re-run the two desktop e2e commands from Task 6 Step 2 against the worktree.

- [ ] **Step 3: Merge to `main`** (only after Vikrant has seen the e2e results and said to release)

From the main working tree (`C:\Users\shrik\playitmyway-web`): `git status --short` must show nothing of ours; then `git merge --ff-only spot-the-difference`. If the other session's uncommitted edits make `main` unsafe to touch, wait for Vikrant.

- [ ] **Step 4: Push and watch the deploy**

```powershell
git -c credential.https://github.com.username=viks120 push origin main
```

If it prints `failed to push some refs`, re-run once. Then poll the deploy:

```powershell
curl -s -H "Accept: application/vnd.github+json" https://api.github.com/repos/viks120/playitmyway-web/commits/$(git rev-parse HEAD)/check-runs
```

until the `Cloudflare Pages` check shows `"conclusion": "success"`. If it shows `failure` within the same second it started, push an empty commit (`git commit --allow-empty -m "chore: retry the Cloudflare Pages deploy"`) and push again. Then confirm all three serve the new content before the live e2e: `curl -s https://playitmyway.com/ | findstr whats-different`, `curl -s https://playitmyway.com/games/spot-the-difference/ | findstr title-icon`, `curl -s https://playitmyway.com/games/shared/spot/play.js | findstr "Spot.Play"`.

- [ ] **Step 5: Live e2e and the third-party check**

```powershell
$env:ALLOW = 'https://static.cloudflareinsights.com/'
node "$SP\e2e.cjs" little https://playitmyway.com/games/whats-different/ "$SP\shots" little-live
node "$SP\e2e.cjs" big https://playitmyway.com/games/spot-the-difference/ "$SP\shots" big-live
Remove-Item env:ALLOW
curl -s https://playitmyway.com/games/whats-different/ | findstr /i cloudflareinsights
```

Expected: `E2E PASS` twice with no `set aside` line, and the `findstr` prints nothing (the site makes no third-party request). If `set aside` names `static.cloudflareinsights.com`, tell Vikrant: the beacon is back in the Cloudflare dashboard, not in the repo.

- [ ] **Step 6: Tidy and record**

`git worktree remove .claude/worktrees/spot` and `git branch -d spot-the-difference`. Append a `## Changes made while building` section to this plan listing every deviation, commit it (`docs: what changed while building the two spot-the-difference games`), and push. Update the memory file `playitmyway-site-context.md` with one bullet: the two games, their slugs, the kit at `games/shared/spot/`, the date and the `main` commit, and that the e2e passed live.

---

## Changes made while building

Built inline on 2026-10-19 in the worktree `.claude/worktrees/spot`, branch `spot-the-difference`, while another session built Missing Tile in the main working tree.

- **Task 2, art judged on the contact sheet:** the bird, dragonfly and ladybird were redrawn (the bird and ladybird read as ink blobs, the dragonfly as a car); the ladybird grew to 13×9 and its spots are drawn with `stroke="none"`, because a 2.5-unit outline round a 2-unit spot was all outline; frog and sheep eyes grew so the open/shut state shows; the pond's shoreline moved from y 232 to 256 so water-lane items (bases up to 255) never sit on sand.
- **Task 2, a fairness rule added:** `count` and `state` differences need a half-extent of at least 12 (a ladybird's spots at 20 px on a phone were not a fair difference), checked in `spot.test.js` alongside the 14 for shade and tilt. The spec's table is updated to match.
- **Task 3:** `games/shared/spot/spot.css` holds the shared styles (one copy for both pages). `hint()` re-enables the Hint button only while the round is still on. `newRound()` scrolls the intro line back into view from round 2 on: the 7+ done card's Next button sits below the pictures, focusing it scrolled a phone down, and the next round started with both pictures off the top of the screen (found by the phone e2e, which tapped at a negative y).
- **Task 4:** the pages were checked headlessly (screenshots at 1200×860, 390×844 and 390×667 after one find) rather than by hand; both pictures fit the short phone with 60 px to spare.
- **Task 5:** as planned; the suite went from 183 to 197 tests, all green, counts 47.
- **Task 6, the player as finally run** (`$SCRATCH/spot/e2e.cjs`, the Step 1 script with these five changes): over `file://` every page on the site logs a manifest CORS error and a missing `/apple-touch-icon.png` (absolute links), so console errors from exactly those two URLs are ignored when the page URL is `file:`; `window.speechSynthesis` is a read-only accessor, so the stub is installed with `Object.defineProperty` (a plain assignment is silently ignored and no line is ever "spoken"); `page.focus()` refuses SVG elements, so the roving item is focused with `$eval(el => el.focus())`; the last find's live text and spoken line are replaced at once by the done line, so the player checks the previous spoken line and skips the live text on the last find; before giving up round 3 it waits for round 2's confetti to clear (bits live 5 s). A `DEBUG=1` env prints the miss tap's coordinates and the element under them. All eight runs pass: desktop, phone, short phone and reduced motion, for both games.

## Self-review notes

- Spec coverage: the two games' rules (Tasks 3–4), the pictures and fairness (Tasks 1–2 with the 1,000-seed tests), accessibility (Task 3 keyboard, Task 4 live region and labels), sound and voice (Task 3, Task 4 strings), icons and wiring (Task 5), checks (Tasks 1, 2, 4, 6), release (Task 7). One addition to the spec's file list: `games/shared/spot/spot.css`, so the two pages do not carry two copies of the ring, dot and confetti styles.
- Names used across tasks: `Scenes.make/box/half/base/hit/theme/tier/nextLevel/stars/label/LITTLE/BIG/KINDS/PALETTE/WHEEL/LANES/LANE_ORDER/THEMES`, `Draw.picture/backdrop/DRAWERS/group/COLOURS`, `Play.start`, page ids `picA picB dots tell intro nextBtn hintBtn showBtn roundLabel starsLabel done doneTitle doneSub`, the handle `window.spot` with `round level tier seed theme diffs found hints stars over`. Each is defined where it is first produced and used with the same spelling afterwards.

