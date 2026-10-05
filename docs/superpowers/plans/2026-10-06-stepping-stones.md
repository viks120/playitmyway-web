# Stepping Stones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Stepping Stones, the site's first 3D game: a cute critter hops across a pond, landing only on stones that fit a maths rule.

**Architecture:** Classic scripts in `games/stepping-stones/` share globals in load order: a trimmed Three.js bundle (`THREE`), the toon look (`Toon`), pure pond logic (`Ponds`, also a Node module for tests), the critters (`Critters`), synthesised sound (`Sfx`), the 3D world (`World`), and the game conductor (`game.js`). The pond logic is tested in Node. The playable page is tested in headless Chrome by a scripted player that uses only the keyboard and the screen-reader announcements.

**Tech Stack:** Three.js r186 (`three@0.186.1`, MIT) bundled with esbuild 0.28.2 into an IIFE; plain HTML/CSS/JS; Web Audio; `node:test`; puppeteer-core with the installed Chrome (scratchpad tooling only, never committed).

**Spec:** `docs/superpowers/specs/2026-10-06-stepping-stones-design.md`

## Global Constraints

- Static site: no runtime build, no backend, **nothing stored** (no cookies, localStorage, sessionStorage or IndexedDB).
- **Zero third-party requests**; works offline (service worker) and over `file://` (memory stick).
- Classic scripts only, no ES modules, all loaded with relative paths.
- Three.js r186 (`three@0.186.1`), trimmed, global `THREE`, **full MIT licence text** as the leading comment.
- Every sound returns early when `window.pimwMuted` is set.
- Light-only, like the rest of the site; page styling uses `tokens.css` variables; theme colour `#7c3aed` (7+ band).
- No names of other games or brands anywhere in code, comments or commit messages.
- Work on branch `stepping-stones`; never push. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Grid 8 rows × 4 columns; critters Clover the Bunny, Pip the Frog, Plum the Baby Dino, Mango the Kitten.

## File structure

| File | Responsibility |
|---|---|
| `games/stepping-stones/ponds.js` (new) | Pond rules, generator, route checker, explanations; pure logic (`window.Ponds` / `module.exports`) |
| `games/stepping-stones/three.min.js` (new, generated) | Trimmed Three.js IIFE, `THREE` global |
| `games/stepping-stones/toon.js` (new) | Toon ramp, flat fills, coloured outlines, disposal (`window.Toon`) |
| `games/stepping-stones/critters.js` (new) | The four critters, rig, reactions, hop curve (`window.Critters`) |
| `games/stepping-stones/sound.js` (new) | Synthesised sounds (`window.Sfx`) |
| `games/stepping-stones/world.js` (new) | Renderer, scene, picker pads, pond meshes, effects, cameras (`window.World`) |
| `games/stepping-stones/game.js` (new) | Screens, movement rules, input, HUD, choreography |
| `games/stepping-stones/index.html` (new) | The page |
| `docs/vendor/three-entry.js` (new) | The Three.js exports the bundle contains |
| `docs/vendor/build-three.js` (new) | Rebuilds `three.min.js` |
| `docs/tests/stepping-stones.test.js` (new) | Pond, bundle and critter tests (`node --test docs/tests/*.test.js`) |
| `docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json` (modify) | Site wiring |
| `games/index.html`, `for-teachers.html`, `404.html`, `sw.js` (regenerate) | via `node docs/build-pages.js` |

Scratchpad only (never committed): `tools/preview-server.cjs` (exists), `tools/shot.cjs` (exists), `tools/harness-world.html`, `tools/e2e.cjs`.

`SP` below means the session scratchpad:
`C:/Users/shrik/AppData/Local/Temp/claude/c--Users-shrik-playitmyway-web/dc31ac27-f660-4f19-a863-0449cae27b09/scratchpad`.
The preview server runs with `ROOT` = the repo and `CONTENT` = `$SP/drafts` on port 47123.

---

### Task 1: Pond rules and generator

**Files:**
- Create: `games/stepping-stones/ponds.js`
- Test: `docs/tests/stepping-stones.test.js`

**Interfaces:**
- Produces: `Ponds.ROWS` (8), `Ponds.COLS` (4), `Ponds.FAMILIES` (`[{id, title}]`), `Ponds.LIST` (`[{id, family, title, start}]`, menu order), `Ponds.generate(id, seed)` returns `{id, family, title, rule (HTML), ruleText, hint, route: number[8], rows: {label, ok, why}[8][4]}`, `Ponds.judge(id, label)` returns `{ok, why}`, `Ponds.hasRoute(rows)` returns a boolean, and `Ponds.rng(seed)` returns a function producing numbers in [0, 1).

- [ ] **Step 1: Write the failing tests**

<!-- file: docs/tests/stepping-stones.test.js -->
```js
/* Stepping Stones tests. Zero dependencies:   node --test docs/tests/*.test.js
 *
 * They load the shipped files from games/stepping-stones, never a copy, and
 * check every pond against an independent restatement of its rule written
 * from the label alone. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME = path.join(__dirname, '..', '..', 'games', 'stepping-stones');
const Ponds = require(path.join(GAME, 'ponds.js'));
const SEEDS = 2000;

const ORDER = [
  'even-20', 'odd-20', 'even-100', 'odd-100',
  'times-2', 'times-5', 'times-10', 'times-3', 'times-4', 'times-6', 'times-7', 'times-8', 'times-9',
  'make-10', 'make-20', 'make-100',
];

/* What the spec allows in each pond, restated without looking at ponds.js. */
function spec(id) {
  let m = /^(even|odd)-(20|100)$/.exec(id);
  if (m) {
    const even = m[1] === 'even';
    const lo = m[2] === '20' ? 1 : 10;
    const hi = +m[2];
    return {
      fits: (l) => (+l % 2 === 0) === even,
      allowed: (l) => /^\d+$/.test(l) && +l >= lo && +l <= hi,
    };
  }
  m = /^times-(\d+)$/.exec(id);
  if (m) {
    const n = +m[1];
    return {
      fits: (l) => +l % n === 0 && +l >= n && +l <= 12 * n,
      allowed: (l) => /^\d+$/.test(l) && +l >= 1 && +l <= 12 * n,
    };
  }
  m = /^make-(\d+)$/.exec(id);
  if (m) {
    const t = +m[1];
    const step = t === 100 ? 5 : 1;
    const misses = t === 100 ? [90, 95, 105, 110] : [t - 1, t + 1];
    const sum = (l) => l.split('+').map(Number).reduce((a, b) => a + b, 0);
    return {
      fits: (l) => sum(l) === t,
      allowed: (l) => {
        if (!/^\d+\+\d+$/.test(l)) return false;
        const [a, b] = l.split('+').map(Number);
        return a >= step && b >= step && a % step === 0 && b % step === 0 && (a + b === t || misses.includes(a + b));
      },
    };
  }
  throw new Error('no spec for ' + id);
}

/* An independent route search, so hasRoute is not marking its own homework. */
function reaches(rows) {
  const R = rows.length;
  const C = rows[0].length;
  let frontier = [];
  for (let c = 0; c < C; c++) if (rows[0][c].ok) frontier.push([0, c]);
  const seen = new Set(frontier.map(([r, c]) => r * C + c));
  while (frontier.length) {
    const next = [];
    for (const [r, c] of frontier) {
      if (r === R - 1) return true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= R || nc < 0 || nc >= C || !rows[nr][nc].ok || seen.has(nr * C + nc)) continue;
          seen.add(nr * C + nc);
          next.push([nr, nc]);
        }
      }
    }
    frontier = next;
  }
  return false;
}

test('sixteen ponds in menu order, three families, Even to 20 marked as the start', () => {
  assert.deepEqual(Ponds.LIST.map((p) => p.id), ORDER);
  assert.deepEqual(Ponds.LIST.filter((p) => p.start).map((p) => p.id), ['even-20']);
  assert.deepEqual(Ponds.FAMILIES.map((f) => f.id), ['parity', 'times', 'bonds']);
  assert.equal(Ponds.ROWS, 8);
  assert.equal(Ponds.COLS, 4);
});

for (const id of ORDER) {
  test(`${id}: ${SEEDS} generated ponds keep every promise`, () => {
    const s = spec(id);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = Ponds.generate(id, seed);
      const where = `${id} seed ${seed}`;
      assert.equal(p.id, id, where);
      assert.equal(p.rows.length, 8, where);
      const count = new Map();
      p.rows.forEach((row, r) => {
        assert.equal(row.length, 4, where);
        assert.equal(new Set(row.map((x) => x.label)).size, 4, `${where}: a label repeats in row ${r}`);
        const rights = row.filter((x) => x.ok).length;
        assert.ok(rights >= 1 && rights <= 2, `${where}: row ${r} has ${rights} right stones`);
        for (const x of row) {
          assert.ok(x.label.length <= 5, `${where}: label ${x.label} is too long`);
          assert.ok(s.allowed(x.label), `${where}: ${x.label} is outside this pond's range`);
          assert.equal(x.ok, s.fits(x.label), `${where}: ${x.label} marked ok=${x.ok}`);
          assert.deepEqual({ ok: x.ok, why: x.why }, Ponds.judge(id, x.label), where);
          count.set(x.label, (count.get(x.label) || 0) + 1);
        }
      });
      for (const [label, n] of count) assert.ok(n <= 2, `${where}: ${label} appears ${n} times`);
      assert.ok(reaches(p.rows), `${where}: no way across`);
      assert.equal(Ponds.hasRoute(p.rows), true, `${where}: hasRoute disagrees`);
      let bends = 0;
      p.route.forEach((c, r) => {
        assert.ok(p.rows[r][c].ok, `${where}: route stone ${r},${c} is not a right stone`);
        if (r > 0) {
          assert.ok(Math.abs(c - p.route[r - 1]) <= 1, `${where}: route jumps at row ${r}`);
          if (c !== p.route[r - 1]) bends++;
        }
      });
      assert.ok(bends >= 2, `${where}: route bends only ${bends} times`);
    }
  });
}

test('the same seed always builds the same pond, and different seeds vary', () => {
  assert.deepEqual(Ponds.generate('times-7', 42), Ponds.generate('times-7', 42));
  const firstRows = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    firstRows.add(Ponds.generate('times-7', seed).rows[0].map((x) => x.label).join());
  }
  assert.ok(firstRows.size > 90, `only ${firstRows.size} different first rows in 100 ponds`);
});

test('explanations use the exact wording from the spec', () => {
  const cases = [
    ['times-3', '21', true, '21 = 3 × 7'],
    ['times-3', '22', false, "22 isn't in the 3 times table: 3 × 7 = 21 and 3 × 8 = 24."],
    ['times-3', '2', false, "2 isn't in the 3 times table: it starts at 3 × 1 = 3."],
    ['even-20', '14', true, '14 is even: it ends in 4.'],
    ['even-20', '13', false, '13 is odd: it ends in 3. Even numbers end in 0, 2, 4, 6 or 8.'],
    ['odd-20', '14', false, '14 is even: it ends in 4. Odd numbers end in 1, 3, 5, 7 or 9.'],
    ['make-10', '7+3', true, '7 + 3 = 10'],
    ['make-10', '6+3', false, '6 + 3 = 9, not 10. 6 + 4 makes 10.'],
  ];
  for (const [id, label, ok, why] of cases) {
    assert.deepEqual(Ponds.judge(id, label), { ok, why }, `${id} ${label}`);
  }
});

test('every wrong times-table stone names the multiples either side of it', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (let v = n + 1; v < 12 * n; v++) {
      if (v % n === 0) continue;
      const k = Math.floor(v / n);
      assert.equal(Ponds.judge('times-' + n, String(v)).why,
        `${v} isn't in the ${n} times table: ${n} × ${k} = ${k * n} and ${n} × ${k + 1} = ${(k + 1) * n}.`);
    }
  }
});

test('hasRoute follows diagonals and stops at gaps', () => {
  const grid = (lines) => lines.map((s) => [...s].map((ch) => ({ ok: ch === 'o' })));
  assert.equal(Ponds.hasRoute(grid(['o...', '.o..', '..o.', '...o', '..o.', '.o..', 'o...', '.o..'])), true);
  assert.equal(Ponds.hasRoute(grid(['o...', '.o..', '....', '...o', '..o.', '.o..', 'o...', '.o..'])), false);
  assert.equal(Ponds.hasRoute(grid(['o..o', 'o..o', 'o..o', '....', 'oooo', 'oooo', 'oooo', 'oooo'])), false);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test docs/tests/*.test.js`
Expected: FAIL with `Cannot find module '…\games\stepping-stones\ponds.js'`

- [ ] **Step 3: Write `ponds.js`**

<!-- file: games/stepping-stones/ponds.js -->
```js
/* Stepping Stones: the ponds. Their rules, the pond generator and the route
 * checker.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Ponds; in Node it
 * is a CommonJS module.
 */
(function (root) {
  'use strict';

  const ROWS = 8;
  const COLS = 4;

  /* mulberry32: a tiny seedable generator, so any pond can be replayed */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];

  function shuffle(rand, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function pickWeighted(rand, items) {
    let total = 0;
    for (const x of items) total += x.w;
    let r = rand() * total;
    for (const x of items) {
      r -= x.w;
      if (r < 0) return x;
    }
    return items[items.length - 1];
  }

  /* ---------------------------------------------------------------- rules
   * Each pond knows its right answers, its decoys (weighted so near misses
   * turn up most), which decoys are near misses of a given right answer, and
   * how to explain any stone. */

  function parityPond(id, title, even, lo, hi) {
    const word = even ? 'even' : 'odd';
    const Word = even ? 'Even' : 'Odd';
    const ends = even ? '0, 2, 4, 6 or 8' : '1, 3, 5, 7 or 9';
    const fits = (v) => (v % 2 === 0) === even;
    const all = range(lo, hi);
    return {
      id,
      family: 'parity',
      title,
      rule: `Hop on <b>${word}</b> numbers`,
      ruleText: `Hop on ${word} numbers`,
      hint: `${Word} numbers end in ${ends}`,
      rights: all.filter(fits).map(String),
      decoys: all.filter((v) => !fits(v)).map((v) => ({ label: String(v), w: 1 })),
      near: (label) => [+label - 1, +label + 1].filter((v) => v >= lo && v <= hi && !fits(v)).map(String),
      judge(label) {
        const v = +label;
        const said = `${v} is ${v % 2 === 0 ? 'even' : 'odd'}: it ends in ${v % 10}.`;
        return fits(v) ? { ok: true, why: said } : { ok: false, why: `${said} ${Word} numbers end in ${ends}.` };
      },
    };
  }

  function timesPond(n) {
    const top = 12 * n;
    const multiples = range(1, 12).map((k) => k * n);
    const endings = new Set(multiples.map((m) => m % 10));
    const decoys = range(1, top - 1).filter((d) => d % n !== 0).map((d) => {
      let w = 1;
      if (Math.min(d % n, n - (d % n)) <= 2) w += 3;                  // just off a right answer
      if (endings.has(d % 10)) w += 2;                                // ends like one: 14 for the 4s
      if ((n > 2 && d % (n - 1) === 0) || d % (n + 1) === 0) w += 2;  // a neighbouring table
      if (n === 10 && d % 5 === 0) w += 4;                            // 15, 25 and so on for the 10s
      return { label: String(d), w };
    });
    const isDecoy = new Set(decoys.map((x) => x.label));
    return {
      id: 'times-' + n,
      family: 'times',
      title: `${n} times table`,
      rule: `Hop on the <b>${n} times table</b>`,
      ruleText: `Hop on the ${n} times table`,
      hint: multiples.join(' · '),
      rights: multiples.map(String),
      decoys,
      near: (label) => [-2, -1, 1, 2].map((d) => String(+label + d)).filter((s) => isDecoy.has(s)),
      judge(label) {
        const v = +label;
        if (v % n === 0 && v >= n && v <= top) return { ok: true, why: `${v} = ${n} × ${v / n}` };
        if (v < n) return { ok: false, why: `${v} isn't in the ${n} times table: it starts at ${n} × 1 = ${n}.` };
        if (v > top) return { ok: false, why: `${v} is past this pond: it stops at ${n} × 12 = ${top}.` };
        const k = Math.floor(v / n);
        return { ok: false, why: `${v} isn't in the ${n} times table: ${n} × ${k} = ${k * n} and ${n} × ${k + 1} = ${(k + 1) * n}.` };
      },
    };
  }

  function bondsPond(target) {
    const step = target === 100 ? 5 : 1;
    const misses = target === 100 ? [90, 95, 105, 110] : [target - 1, target + 1];
    const most = target === 100 ? 95 : target;      // keeps every label within 5 characters
    const firsts = [];
    for (let a = step; a <= target - step; a += step) firsts.push(a);
    const decoys = [];
    for (const sum of misses) {
      for (const a of firsts) {
        const b = sum - a;
        if (b >= step && b <= most && b % step === 0) decoys.push({ label: `${a}+${b}`, w: 1 });
      }
    }
    const isDecoy = new Set(decoys.map((x) => x.label));
    const hints = {
      10: '1+9 · 2+8 · 3+7 · 4+6 · 5+5',
      20: 'Use make 10: 3 + 7 = 10, so 13 + 7 = 20',
      100: 'Think in tens: 30 + 70 = 100, so 35 + 65 = 100',
    };
    return {
      id: 'make-' + target,
      family: 'bonds',
      title: `Make ${target}`,
      rule: `Hop on stones that <b>make ${target}</b>`,
      ruleText: `Hop on stones that make ${target}`,
      hint: hints[target],
      rights: firsts.map((a) => `${a}+${target - a}`),
      decoys,
      near(label) {
        const [a, b] = label.split('+').map(Number);
        const out = [];
        for (const d of [step, -step, 10, -10]) out.push(`${a}+${b + d}`, `${a + d}+${b}`);
        return out.filter((s) => isDecoy.has(s));
      },
      judge(label) {
        const [a, b] = label.split('+').map(Number);
        if (a + b === target) return { ok: true, why: `${a} + ${b} = ${target}` };
        return { ok: false, why: `${a} + ${b} = ${a + b}, not ${target}. ${a} + ${target - a} makes ${target}.` };
      },
    };
  }

  const LIST = [
    parityPond('even-20', 'Even to 20', true, 1, 20),
    parityPond('odd-20', 'Odd to 20', false, 1, 20),
    parityPond('even-100', 'Even to 100', true, 10, 100),
    parityPond('odd-100', 'Odd to 100', false, 10, 100),
    ...[2, 5, 10, 3, 4, 6, 7, 8, 9].map(timesPond),
    bondsPond(10),
    bondsPond(20),
    bondsPond(100),
  ];
  LIST[0].start = true;
  const BY_ID = Object.fromEntries(LIST.map((p) => [p.id, p]));

  const FAMILIES = [
    { id: 'parity', title: 'Odd & even' },
    { id: 'times', title: 'Times tables' },
    { id: 'bonds', title: 'Number bonds' },
  ];

  /* ------------------------------------------------------------ generator */

  /* A route of right stones comes first, so a way across always exists: one
   * stone per row, each touching the last, bending at least twice. */
  function makeRoute(rand) {
    for (;;) {
      const cols = [Math.floor(rand() * COLS)];
      for (let r = 1; r < ROWS; r++) {
        const c = cols[r - 1];
        cols.push(c + pick(rand, [-1, 0, 1].filter((d) => c + d >= 0 && c + d < COLS)));
      }
      let bends = 0;
      for (let r = 1; r < ROWS; r++) if (cols[r] !== cols[r - 1]) bends++;
      if (bends >= 2) return cols;
    }
  }

  function build(def, rand) {
    const route = makeRoute(rand);
    const ok = route.map((rc) => Array.from({ length: COLS }, (_, c) => c === rc));

    // Extra right stones make branches and dead ends. A small decoy pool (odd
    // and even to 20 has only ten decoys, each allowed twice) also forces a
    // minimum number of right stones, so the decoys can fill the rest.
    const need = Math.max(ROWS, ROWS * COLS - 2 * def.decoys.length);
    let rights = ROWS;
    const spare = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!ok[r][c]) spare.push([r, c]);
    for (const [r, c] of shuffle(rand, spare)) {
      if (ok[r].filter(Boolean).length >= 2) continue;
      if (rights < need || rand() < 0.15) {
        ok[r][c] = true;
        rights++;
      }
    }
    if (rights < need) return null;

    const count = new Map();
    const taken = Array.from({ length: ROWS }, () => new Set());
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    function place(r, c, first, all) {
      const free = (x) => !taken[r].has(x) && (count.get(x) || 0) < 2;
      let label = null;
      for (let i = 0; i < 24 && label === null; i++) {
        const x = first();
        if (free(x)) label = x;
      }
      if (label === null) label = shuffle(rand, all.slice()).find(free) || null;
      if (label === null) return false;
      taken[r].add(label);
      count.set(label, (count.get(label) || 0) + 1);
      grid[r][c] = label;
      return true;
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (ok[r][c] && !place(r, c, () => pick(rand, def.rights), def.rights)) return null;
      }
    }
    const decoyLabels = def.decoys.map((x) => x.label);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (ok[r][c]) continue;
        const nearby = [];
        for (let rr = Math.max(0, r - 1); rr <= Math.min(ROWS - 1, r + 1); rr++) {
          for (let cc = 0; cc < COLS; cc++) if (ok[rr][cc]) nearby.push(grid[rr][cc]);
        }
        // mostly near misses of a right stone close by, otherwise any decoy
        const first = () => {
          if (rand() < 0.6) {
            const near = def.near(pick(rand, nearby));
            if (near.length) return pick(rand, near);
          }
          return pickWeighted(rand, def.decoys).label;
        };
        if (!place(r, c, first, decoyLabels)) return null;
      }
    }
    return {
      route,
      rows: grid.map((row) => row.map((label) => Object.assign({ label }, def.judge(label)))),
    };
  }

  /* Breadth-first search over right stones: from the near bank (any stone in
   * the first row) to the far bank (any stone in the last row), hopping to
   * any touching stone, diagonals included. */
  function hasRoute(rows) {
    const R = rows.length;
    const C = rows[0].length;
    const seen = new Set();
    const queue = [];
    for (let c = 0; c < C; c++) {
      if (rows[0][c].ok) {
        queue.push([0, c]);
        seen.add(c);
      }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r === R - 1) return true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          const key = nr * C + nc;
          if ((dr || dc) && nr >= 0 && nr < R && nc >= 0 && nc < C && rows[nr][nc].ok && !seen.has(key)) {
            seen.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }
    return false;
  }

  const rowsOk = (rows) => rows.every((row) => {
    const n = row.filter((x) => x.ok).length;
    return n >= 1 && n <= 2;
  });

  function generate(id, seed) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    const rand = rng(seed);
    for (let attempt = 0; attempt < 50; attempt++) {
      const built = build(def, rand);
      if (built && rowsOk(built.rows) && hasRoute(built.rows)) {
        return {
          id: def.id,
          family: def.family,
          title: def.title,
          rule: def.rule,
          ruleText: def.ruleText,
          hint: def.hint,
          route: built.route,
          rows: built.rows,
        };
      }
    }
    throw new Error('Could not build pond: ' + id);
  }

  function judge(id, label) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    return def.judge(String(label));
  }

  const api = {
    ROWS,
    COLS,
    FAMILIES,
    LIST: LIST.map((p) => ({ id: p.id, family: p.family, title: p.title, start: !!p.start })),
    generate,
    judge,
    hasRoute,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ponds = api;
})(this);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test docs/tests/*.test.js`
Expected: PASS, 21 tests (1 list test, 16 pond tests, 4 others), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add games/stepping-stones/ponds.js docs/tests/stepping-stones.test.js
git commit -m "feat(stepping-stones): pond rules, generator and route checker, tested"
```

---

### Task 2: Trimmed Three.js bundle

**Files:**
- Create: `docs/vendor/three-entry.js`, `docs/vendor/build-three.js`
- Create (generated): `games/stepping-stones/three.min.js`
- Modify: `docs/tests/stepping-stones.test.js` (append)

**Interfaces:**
- Produces: global `THREE` with exactly the exports listed in `three-entry.js`, and a test that fails when any game script uses a `THREE.<name>` missing from the bundle.

- [ ] **Step 1: Append the bundle coverage test**

Append to `docs/tests/stepping-stones.test.js`:

<!-- append: docs/tests/stepping-stones.test.js -->
```js

/* Load the trimmed Three.js bundle the way a browser would: as a classic
 * script whose top-level `var THREE` lands on the global object. */
function loadBundle() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(GAME, 'three.min.js'), 'utf8'), ctx, { filename: 'three.min.js' });
  return ctx;
}

test('three.min.js carries the full MIT licence text', () => {
  const head = fs.readFileSync(path.join(GAME, 'three.min.js'), 'utf8').slice(0, 2000);
  assert.match(head, /The MIT License/);
  assert.match(head, /Copyright © 2010-\d{4} three\.js authors/);
  assert.match(head, /Permission is hereby granted, free of charge/);
  assert.match(head, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test('every THREE name the game scripts use is in the trimmed bundle', () => {
  const exported = new Set(Object.keys(loadBundle().THREE));
  const used = new Set();
  for (const f of fs.readdirSync(GAME)) {
    if (!f.endsWith('.js') || f === 'three.min.js') continue;
    for (const m of fs.readFileSync(path.join(GAME, f), 'utf8').matchAll(/\bTHREE\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter((name) => !exported.has(name)).sort();
  assert.deepEqual(missing, [], 'add these to docs/vendor/three-entry.js, then run node docs/vendor/build-three.js');
});
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

Run: `node --test docs/tests/*.test.js`
Expected: FAIL in the two new tests with `ENOENT: no such file or directory, open '…three.min.js'`

- [ ] **Step 3: Write the export list and the build script**

<!-- file: docs/vendor/three-entry.js -->
```js
/* The parts of Three.js that Stepping Stones uses.
 *
 * docs/vendor/build-three.js bundles this list into
 * games/stepping-stones/three.min.js: one minified classic script that
 * defines a global THREE. It is a classic script rather than an ES module
 * because Chrome refuses module scripts over file://, and the site must open
 * straight off a memory stick. Three.js is MIT licensed; the bundle starts
 * with the full licence text, which is the licence's one condition.
 *
 * Using a new Three.js feature in the game? Add its export here, then run:
 *     node docs/vendor/build-three.js
 * docs/tests/stepping-stones.test.js fails if a game script uses a THREE
 * name that is missing from the bundle.
 */
export {
  BackSide, BoxGeometry, CanvasTexture, CapsuleGeometry, CatmullRomCurve3, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, DataTexture, DirectionalLight, Euler, ExtrudeGeometry, Fog, Group,
  HemisphereLight, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshToonMaterial,
  NearestFilter, PerspectiveCamera, Plane, PlaneGeometry, Quaternion, Raycaster, RedFormat,
  RingGeometry, Scene, ShaderMaterial, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry,
  TubeGeometry, UniformsLib, UniformsUtils, Vector2, Vector3, WebGLRenderer,
} from 'three';
```

<!-- file: docs/vendor/build-three.js -->
```js
/* Rebuilds games/stepping-stones/three.min.js from docs/vendor/three-entry.js.
 *
 *     node docs/vendor/build-three.js
 *
 * Nothing is installed into the repo: the pinned three and esbuild packages
 * go into a scratch folder in the system temp directory, reused on the next
 * run. Needs Node 18+ and npm, and the network on the first run only. */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const THREE_VERSION = '0.186.1';
const ESBUILD_VERSION = '0.28.2';
const OUT = path.join(__dirname, '..', '..', 'games', 'stepping-stones', 'three.min.js');
const WORK = path.join(os.tmpdir(), `pimw-three-${THREE_VERSION}-esbuild-${ESBUILD_VERSION}`);

const installed = (pkg, version) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(WORK, 'node_modules', pkg, 'package.json'), 'utf8')).version === version;
  } catch (e) {
    return false;
  }
};

fs.mkdirSync(WORK, { recursive: true });
if (!installed('three', THREE_VERSION) || !installed('esbuild', ESBUILD_VERSION)) {
  fs.writeFileSync(path.join(WORK, 'package.json'), '{ "private": true }\n');
  execSync(`npm install --no-audit --no-fund three@${THREE_VERSION} esbuild@${ESBUILD_VERSION}`, { cwd: WORK, stdio: 'inherit' });
}
fs.copyFileSync(path.join(__dirname, 'three-entry.js'), path.join(WORK, 'entry.js'));

const licence = fs.readFileSync(path.join(WORK, 'node_modules', 'three', 'LICENSE'), 'utf8').trim();
const banner = [
  '/*!',
  ` * three.js r${THREE_VERSION.split('.')[1]} (https://threejs.org), trimmed to the parts Stepping`,
  ' * Stones uses; the list is docs/vendor/three-entry.js in this site\'s repository.',
  ' *',
  ...licence.split(/\r?\n/).map((line) => (' * ' + line).trimEnd()),
  ' */',
].join('\n');

require(path.join(WORK, 'node_modules', 'esbuild')).buildSync({
  entryPoints: [path.join(WORK, 'entry.js')],
  absWorkingDir: WORK,
  bundle: true,
  format: 'iife',
  globalName: 'THREE',
  minify: true,
  legalComments: 'none',      // three's own short licence comments; the full text is in the banner
  banner: { js: banner },
  outfile: OUT,
  logLevel: 'warning',
});

const built = fs.readFileSync(OUT);
const kb = (n) => Math.round(n / 1024) + ' KB';
console.log(`three.min.js: ${kb(built.length)} on disk, ${kb(zlib.brotliCompressSync(built).length)} with brotli`);
```

- [ ] **Step 4: Build the bundle**

Run: `node docs/vendor/build-three.js`
Expected: `three.min.js: 5xx KB on disk, 1xx KB with brotli` (about 563 KB and 122 KB were measured).
Check: `head -c 700 games/stepping-stones/three.min.js` shows `/*!`, `three.js r186` and `The MIT License`.

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `node --test docs/tests/*.test.js`
Expected: PASS, 23 tests. The coverage test passes trivially until game scripts exist; Tasks 3 to 5 re-run it.

- [ ] **Step 6: Commit**

```bash
git add docs/vendor/three-entry.js docs/vendor/build-three.js games/stepping-stones/three.min.js docs/tests/stepping-stones.test.js
git commit -m "feat(stepping-stones): trimmed Three.js r186 bundle with its MIT licence, and its rebuild script"
```

---

### Task 3: Toon look, critters and sounds

**Files:**
- Create: `games/stepping-stones/toon.js`, `games/stepping-stones/critters.js`, `games/stepping-stones/sound.js`
- Modify: `docs/tests/stepping-stones.test.js` (append)
- Scratchpad: `$SP/drafts/harness-critters.html`

**Interfaces:**
- Consumes: `THREE`.
- Produces:
  - `Toon.toon(color, outlineColor?)` returns a `MeshToonMaterial`; `Toon.flat(color, opacity?)` returns a `MeshBasicMaterial`; `Toon.addOutlines(root)` and `Toon.dispose(root, keepSet?)` return nothing.
  - `Critters.KINDS` is `{bunny|frog|dino|kitten: {name, kind, emoji, voice}}`, in that order.
  - `Critters.create(kind)` returns a rig `{kind, root, turn, parts, hop, sy, earX, look: {yaw, pitch}, update(t, dt), react(name) → seconds, dispose()}`. Reactions: `earshake`, `puff`, `shake`, `bubble`.
  - `Critters.hopCurve(t, H, F = 0.42)` returns `{y, sy, phase: 'crouch'|'air'|'land', p}` or `null`.
  - `Sfx.play(name, arg)` with names `hop`, `good` (row), `uhoh`, `splash`, `win`, `poof`, `pop`, `voice` (pitch).

- [ ] **Step 1: Append the critter test**

<!-- append: docs/tests/stepping-stones.test.js -->
```js

test('the four critters build, react and animate without a browser', () => {
  const ctx = loadBundle();
  for (const f of ['toon.js', 'critters.js']) {
    vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), ctx, { filename: f });
  }
  const { Critters } = ctx;
  assert.deepEqual(Object.keys(Critters.KINDS), ['bunny', 'frog', 'dino', 'kitten']);
  assert.deepEqual(Object.values(Critters.KINDS).map((k) => `${k.name} the ${k.kind}`),
    ['Clover the Bunny', 'Pip the Frog', 'Plum the Baby Dino', 'Mango the Kitten']);
  for (const kind of Object.keys(Critters.KINDS)) {
    const rig = Critters.create(kind);
    let meshes = 0;
    rig.root.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes > 20, `${kind} has only ${meshes} meshes`);
    for (const name of ['earshake', 'puff', 'shake', 'bubble']) assert.ok(rig.react(name) > 0, name);
    for (let t = 1; t < 3; t += 0.05) rig.update(t, 0.05);
    assert.ok(Number.isFinite(rig.root.children[0].rotation.z));
    rig.dispose();
  }
  const h = Critters.hopCurve(0.3, 0.6);
  assert.equal(h.phase, 'air');
  assert.ok(h.y > 0);
  assert.equal(Critters.hopCurve(5, 0.6), null);
});
```

- [ ] **Step 2: Run the tests to confirm the new one fails**

Run: `node --test docs/tests/*.test.js`
Expected: FAIL with `ENOENT … toon.js`

- [ ] **Step 3: Write `toon.js`**

<!-- file: games/stepping-stones/toon.js -->
```js
/* Stepping Stones: the shared toon look.
 *
 * A 3-step light ramp for soft cel shading, flat (unlit) fills, and coloured
 * outlines one shade darker than each fill: never black, which reads harsher
 * to small children. Outlines are inverted hulls pushed out along view-space
 * normals, so a mesh's own scale cannot thin them, and they take the scene's
 * fog like everything else. Needs THREE; sets window.Toon.
 */
(function () {
  'use strict';

  const ramp = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  const VERTEX = [
    '#include <fog_pars_vertex>',
    'uniform float thickness;',
    'void main() {',
    '  vec4 p = vec4(position, 1.0);',
    '  vec3 n = normal;',
    '  #ifdef USE_INSTANCING',
    '    p = instanceMatrix * p;',
    '    n = mat3(instanceMatrix) * n;',
    '  #endif',
    '  vec4 mvPosition = modelViewMatrix * p;',
    '  mvPosition.xyz += normalize(normalMatrix * n) * thickness;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n');

  const FRAGMENT = [
    '#include <fog_pars_fragment>',
    'uniform vec3 color;',
    'void main() {',
    '  gl_FragColor = vec4(color, 1.0);',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n');

  const OUTLINES = new WeakMap();      // fill material -> its outline material

  function outlineMaterial(color) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        color: { value: new THREE.Color(color) },
        thickness: { value: 0.024 },
      }]),
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      fog: true,
    });
  }

  function toon(color, outlineColor) {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    if (outlineColor) OUTLINES.set(m, outlineMaterial(outlineColor));
    return m;
  }

  function flat(color, opacity) {
    const o = opacity == null ? 1 : opacity;
    return new THREE.MeshBasicMaterial({ color, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
  }

  /* Give every mesh under root whose material has an outline colour its
   * hull. Instanced meshes get an instanced hull sharing their matrices. */
  function addOutlines(root) {
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && !o.userData.outline && OUTLINES.has(o.material)) meshes.push(o);
    });
    for (const m of meshes) {
      const mat = OUTLINES.get(m.material);
      let hull;
      if (m.isInstancedMesh) {
        hull = new THREE.InstancedMesh(m.geometry, mat, m.count);
        hull.instanceMatrix = m.instanceMatrix;
        hull.frustumCulled = false;
      } else {
        hull = new THREE.Mesh(m.geometry, mat);
      }
      hull.userData.outline = true;
      hull.raycast = () => {};         // a tap should find the critter, not its outline
      m.add(hull);
    }
  }

  /* Free the GPU copies of everything under root, except shared resources. */
  function dispose(root, keep) {
    const done = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const res of [o.geometry, o.material, o.material && o.material.map]) {
        if (res && !done.has(res) && !(keep && keep.has(res))) {
          done.add(res);
          res.dispose();
        }
      }
      if (o.isInstancedMesh) o.dispose();
    });
  }

  window.Toon = { toon, flat, addOutlines, dispose };
})();
```

- [ ] **Step 4: Write `critters.js`**

<!-- file: games/stepping-stones/critters.js -->
```js
/* Stepping Stones: the four critters. Clover the Bunny, Pip the Frog, Plum
 * the Baby Dino and Mango the Kitten.
 *
 * Each is built from spheres, capsules, cones and a tube with the shared toon
 * look; nothing is downloaded. Needs THREE and Toon; sets window.Critters.
 *
 * A rig is three nested groups: root (the game moves it), turn (which way it
 * faces) and squash (squash and stretch, pivoting at the feet). Each frame the
 * game may set rig.sy (squash, or null to breathe), rig.earX (ear swing) and
 * rig.look.yaw / rig.look.pitch (head), then call rig.update(t, dt).
 */
(function () {
  'use strict';

  const INK = '#2b2a5e';
  const SPHERE = new THREE.SphereGeometry(1, 40, 28);
  const WHITE = Toon.flat('#ffffff');
  const INK_MAT = Toon.toon(INK);
  const BLUSH = Toon.flat('#ff8fb0', 0.55);
  const BLUSH_SOLID = Toon.flat('#ffa3bd');        // half-strength pink turns muddy over green
  const BUBBLE = Toon.flat('#e9f9ff', 0.5);
  const SHARED = new Set([SPHERE, WHITE, INK_MAT, BLUSH, BLUSH_SOLID, BUBBLE]);
  const FORWARD = new THREE.Vector3(0, 0, 1);

  function ball(mat, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.set(x, y, z);
    m.scale.set(r * sx, r * sy, r * sz);
    return m;
  }

  /* Put obj on the surface of an ellipsoid (radii a, b, c around its parent's
   * origin) at a yaw and pitch from straight ahead, facing outward. */
  function stick(obj, a, b, c, yaw, pitch, lift = 0) {
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const p = new THREE.Vector3(d.x * a, d.y * b, d.z * c);
    const n = new THREE.Vector3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    obj.position.copy(p).addScaledVector(n, lift);
    obj.quaternion.setFromUnitVectors(FORWARD, n);
    return obj;
  }

  // big glossy eyes: a dark oval with two white catch-lights
  function eye(s) {
    const g = new THREE.Group();
    g.add(ball(INK_MAT, s, 0, 0, 0, 0.8, 1.1, 0.42));
    g.add(ball(WHITE, s * 0.3, -s * 0.24, s * 0.36, s * 0.34, 1, 1, 0.4));
    g.add(ball(WHITE, s * 0.14, s * 0.26, -s * 0.34, s * 0.34, 1, 1, 0.4));
    return g;
  }

  function smile(r, thick = 0.26, arc = Math.PI) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * thick, 8, 24, arc), INK_MAT);
    m.rotation.z = 1.5 * Math.PI - arc / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  // a little "w" mouth: two tiny smiles side by side
  function wMouth(r) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.3, 8, 20, Math.PI), INK_MAT);
      m.rotation.z = Math.PI;
      m.position.x = sx * r;
      g.add(m);
    }
    return g;
  }

  const blush = (r, mat = BLUSH) => ball(mat, r, 0, 0, 0, 1.35, 0.8, 0.3);

  function addEye(head, s, A, B, C, yaw, pitch) {
    const e = stick(eye(s), A, B, C, yaw, pitch, -0.01);
    head.add(e);
    return e;
  }

  function buildBunny(g) {
    const fur = Toon.toon('#fff1e4', '#e3c2aa');
    const pink = Toon.toon('#ffadc2');
    const pinkDeep = Toon.toon('#ff94b0');
    g.add(ball(fur, 0.5, 0, 0.5, 0, 1, 0.94, 0.95));
    for (const sx of [-1, 1]) {
      g.add(ball(fur, 0.17, sx * 0.22, 0.09, 0.26, 1, 0.62, 1.35));
      g.add(ball(fur, 0.12, sx * 0.36, 0.52, 0.3));
    }
    g.add(ball(fur, 0.17, 0, 0.36, -0.47));
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.02);
    g.add(head);
    const A = 0.64, B = 0.57, C = 0.6;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.15, A, B, C, sx * 0.42, -0.1));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085), A, B, C, sx * 0.72, -0.3));
    const nose = stick(ball(pinkDeep, 0.045, 0, 0, 0, 1.3, 0.85, 0.8), A, B, C, 0, -0.2);
    head.add(nose);
    head.add(stick(wMouth(0.035), A, B, C, 0, -0.33, -0.005));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.24, 0.42, -0.04);
      pivot.rotation.z = -sx * 0.16;
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.62, 8, 24), fur);
      outer.scale.set(1, 1, 0.55);
      outer.position.y = 0.42;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 8, 16), pink);
      inner.scale.set(1, 1, 0.4);
      inner.position.set(0, 0.44, 0.064);
      pivot.add(outer, inner);
      head.add(pivot);
      return pivot;
    });
    ears[1].rotation.z = -0.5;          // one floppy ear
    ears[1].rotation.x = 0.25;
    return { head, eyes, ears, nose, noseY: nose.scale.y, hop: 0.6 };
  }

  function buildFrog(g) {
    const skin = Toon.toon('#97df86', '#5fae5a');
    const spot = Toon.toon('#7cc86f');
    const belly = Toon.toon('#f6f8d8');
    for (const sx of [-1, 1]) {
      g.add(ball(skin, 0.36, sx * 0.56, 0.26, -0.06, 0.75, 0.62, 1.15));
      g.add(ball(skin, 0.15, sx * 0.3, 0.07, 0.6, 1.35, 0.5, 1));
    }
    const head = new THREE.Group();
    head.position.set(0, 0.62, 0);
    g.add(head);
    const A = 0.85, B = 0.6, C = 0.72;
    head.add(ball(skin, 1, 0, 0, 0, A, B, C));
    head.add(stick(ball(belly, 0.42, 0, 0, 0, 1.15, 0.62, 0.45), A, B, C, 0, -0.66, -0.1));
    for (const [yw, pt, r] of [[-0.9, 0.55, 0.09], [0.75, 0.62, 0.07], [3.0, 0.6, 0.1], [2.4, 0.3, 0.07], [-2.5, 0.35, 0.08]]) {
      head.add(stick(ball(spot, r, 0, 0, 0, 1, 1, 0.35), A, B, C, yw, pt));
    }
    const eyes = [-1, 1].map((sx) => {
      const bump = new THREE.Group();
      bump.position.set(sx * 0.38, 0.47, 0.2);
      head.add(bump);
      bump.add(ball(skin, 0.28));
      const e = stick(eye(0.17), 0.28, 0.28, 0.28, sx * 0.12, 0.05, -0.01);
      bump.add(e);
      return e;
    });
    head.add(stick(smile(0.2, 0.09, Math.PI * 0.72), A, B, C, 0, 0.06, -0.005));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085, BLUSH_SOLID), A, B, C, sx * 0.6, 0.1, -0.012));
    return { head, eyes, hop: 0.85, headTurn: 0.5 };
  }

  function buildDino(g) {
    const skin = Toon.toon('#c2b2fb', '#8f7ad8');
    const belly = Toon.toon('#fff0d4', '#e3cfa8');
    const plate = Toon.toon('#ffb48f', '#e88d6c');
    g.add(ball(skin, 0.55, 0, 0.56, 0, 1, 1.02, 1));
    g.add(ball(belly, 0.42, 0, 0.52, 0.28, 0.95, 1.0, 0.55));
    for (const sx of [-1, 1]) {
      g.add(ball(skin, 0.18, sx * 0.24, 0.09, 0.2, 1, 0.6, 1.35));
      g.add(ball(skin, 0.1, sx * 0.42, 0.72, 0.36, 1, 1.25, 1));
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.36, -0.42);
    g.add(tail);
    for (const [y, z, r] of [[0, 0, 0.25], [0.02, -0.3, 0.18], [0.08, -0.52, 0.12], [0.17, -0.68, 0.08]]) tail.add(ball(skin, r, 0, y, z));
    for (const [y, z, r] of [[0.22, -0.12, 0.08], [0.17, -0.38, 0.065], [0.22, -0.58, 0.05]]) tail.add(ball(plate, r, 0, y, z, 0.5, 1, 0.9));
    for (const [y, z, r] of [[1.02, -0.36, 0.1], [0.8, -0.5, 0.1]]) g.add(ball(plate, r, 0, y, z, 0.5, 1, 0.95));
    const head = new THREE.Group();
    head.position.set(0, 1.14, 0.06);
    g.add(head);
    const A = 0.6, B = 0.53, C = 0.58;
    head.add(ball(skin, 1, 0, 0, 0, A, B, C));
    const snout = new THREE.Group();
    snout.position.set(0, -0.17, 0.4);
    head.add(snout);
    snout.add(ball(skin, 1, 0, 0, 0, 0.36, 0.25, 0.3));
    for (const sx of [-1, 1]) snout.add(stick(ball(INK_MAT, 0.022), 0.36, 0.25, 0.3, sx * 0.3, 0.32, -0.005));
    snout.add(stick(smile(0.1, 0.2, Math.PI * 0.8), 0.36, 0.25, 0.3, 0, -0.28, -0.01));
    const bubble = ball(BUBBLE, 1, 0, -0.02, 0.42);
    bubble.add(ball(WHITE, 0.22, -0.35, 0.35, 0.8));
    bubble.visible = false;
    snout.add(bubble);
    const eyes = [-1, 1].map((sx) => addEye(head, 0.14, A, B, C, sx * 0.4, 0.06));
    for (const sx of [-1, 1]) head.add(stick(blush(0.08), A, B, C, sx * 0.78, -0.18));
    for (const [y, z, r] of [[0.5, 0.14, 0.1], [0.55, -0.08, 0.13], [0.43, -0.3, 0.12], [0.2, -0.5, 0.1]]) head.add(ball(plate, r, 0, y, z, 0.62, 1, 0.9));
    return { head, eyes, tail, bubble, hop: 0.6 };
  }

  function buildKitten(g) {
    const fur = Toon.toon('#ffcf9c', '#dc9a5c');
    const stripe = Toon.toon('#f4a35c');
    const cream = Toon.toon('#fff6ec', '#e6cdb4');
    const pink = Toon.toon('#ffb3c6');
    const noseMat = Toon.toon('#ff8fab');
    g.add(ball(fur, 0.48, 0, 0.48, 0, 1, 0.95, 0.95));
    g.add(ball(cream, 0.33, 0, 0.5, 0.25, 1, 1.05, 0.6));
    for (const sx of [-1, 1]) {
      g.add(ball(cream, 0.13, sx * 0.18, 0.09, 0.33, 1, 0.65, 1.25));
      g.add(ball(fur, 0.15, sx * 0.34, 0.1, 0.02, 1, 0.6, 1.3));
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, -0.38);
    g.add(tail);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.12, -0.3),
      new THREE.Vector3(0.18, 0.5, -0.42), new THREE.Vector3(0.3, 0.85, -0.3)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.085, 16, false), fur));
    tail.add(ball(stripe, 0.088, 0.3, 0.85, -0.3));
    const head = new THREE.Group();
    head.position.set(0, 1.06, 0.02);
    g.add(head);
    const A = 0.68, B = 0.55, C = 0.6;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.36, 0.38, -0.04);
      pivot.rotation.z = -sx * 0.38;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.36, 32), fur);
      outer.position.y = 0.12;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 24), pink);
      inner.scale.z = 0.45;
      inner.position.set(0, 0.1, 0.09);
      pivot.add(outer, inner);
      head.add(pivot);
      return pivot;
    });
    for (const sx of [-1, 1]) head.add(stick(ball(cream, 0.11, 0, 0, 0, 1.1, 0.85, 0.7), A, B, C, sx * 0.13, -0.36, -0.03));
    head.add(stick(ball(noseMat, 0.05, 0, 0, 0, 1.3, 0.9, 0.7), A, B, C, 0, -0.24, 0.02));
    head.add(stick(wMouth(0.03), A, B, C, 0, -0.43, 0.012));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.15, A, B, C, sx * 0.4, -0.06));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085), A, B, C, sx * 0.66, -0.28));
    for (const yw of [-0.17, 0, 0.17]) head.add(stick(ball(stripe, 0.07, 0, 0, 0, 0.5, 1.5, 0.35), A, B, C, yw, 0.62));
    return { head, eyes, ears, tail, hop: 0.55 };
  }

  const KINDS = {
    bunny: { name: 'Clover', kind: 'Bunny', emoji: '🐰', voice: 1.25, build: buildBunny },
    frog: { name: 'Pip', kind: 'Frog', emoji: '🐸', voice: 0.8, build: buildFrog },
    dino: { name: 'Plum', kind: 'Baby Dino', emoji: '🦖', voice: 0.95, build: buildDino },
    kitten: { name: 'Mango', kind: 'Kitten', emoji: '🐱', voice: 1.45, build: buildKitten },
  };

  // how long each reaction lasts, in seconds
  const LENGTH = { earshake: 0.9, puff: 0.9, shake: 0.6, bubble: 0.85 };

  function create(kind) {
    const spec = KINDS[kind];
    if (!spec) throw new Error('Unknown critter: ' + kind);
    const root = new THREE.Group();
    const turn = new THREE.Group();
    const squash = new THREE.Group();
    root.add(turn);
    turn.add(squash);
    const parts = spec.build(squash);
    Toon.addOutlines(squash);
    const rest = (parts.ears || []).map((e) => ({ x: e.rotation.x, z: e.rotation.z }));
    const seed = Math.random() * 10;
    const started = {};
    let clock = 0;
    let blinkAt = -1;
    let nextBlink = 1 + Math.random() * 2;

    const rig = {
      kind,
      root,
      turn,
      parts,
      hop: parts.hop,
      sy: null,
      earX: 0,
      look: { yaw: 0, pitch: 0 },
      react(name) {
        started[name] = clock;
        return LENGTH[name] || 0;
      },
      dispose() {
        Toon.dispose(root, SHARED);
      },
      update(t) {
        clock = t;
        const progress = (name) => {
          if (started[name] == null) return -1;
          const p = (t - started[name]) / LENGTH[name];
          if (p >= 1 || p < 0) {
            delete started[name];
            return -1;
          }
          return p;
        };

        // squash and stretch, or gentle breathing; Mango can puff up as well
        let sy = rig.sy == null ? 1 + 0.025 * Math.sin(t * 2.6 + seed) : rig.sy;
        let sxz = 1 / Math.sqrt(sy);
        const puff = progress('puff');
        if (puff >= 0) {
          const k = Math.sin(Math.PI * puff);
          sxz *= 1 + 0.24 * k;
          sy *= 1 + 0.16 * k;
        }
        squash.scale.set(sxz, sy, sxz);
        const shake = progress('shake');
        turn.rotation.z = shake >= 0 ? 0.28 * Math.sin(shake * LENGTH.shake * 34) * (1 - shake) : 0;

        parts.head.rotation.y = rig.look.yaw * (parts.headTurn || 0.6);
        parts.head.rotation.x = rig.look.pitch;
        parts.head.rotation.z = 0.05 * Math.sin(t * 1.3 + seed);

        const flap = progress('earshake');
        (parts.ears || []).forEach((e, i) => {
          const dry = flap >= 0 ? (i ? -1 : 1) * 0.5 * Math.sin(flap * LENGTH.earshake * 40) * (1 - flap) : 0;
          e.rotation.x = rest[i].x + rig.earX + 0.04 * Math.sin(t * 2.1 + i);
          e.rotation.z = rest[i].z + 0.03 * Math.sin(t * 1.7 + i * 2) + dry;
        });
        if (parts.tail) {
          if (kind === 'dino') parts.tail.rotation.y = 0.28 * Math.sin(t * 3.2);
          if (kind === 'kitten') parts.tail.rotation.z = 0.18 * Math.sin(t * 1.6);
        }
        if (parts.nose) {
          const twitch = (t + seed) % 2.2 < 0.35 ? Math.abs(Math.sin(t * 28)) : 0;
          parts.nose.scale.y = parts.noseY * (1 - 0.25 * twitch);
        }
        if (parts.bubble) {
          const b = progress('bubble');
          parts.bubble.visible = b >= 0;
          if (b >= 0) parts.bubble.scale.setScalar(0.04 + 0.28 * b + 0.015 * Math.sin(t * 20));
        }

        // a blink every few seconds
        if (blinkAt < 0 && t > nextBlink) blinkAt = t;
        let open = 1;
        if (blinkAt >= 0) {
          const p = (t - blinkAt) / 0.16;
          if (p >= 1) {
            blinkAt = -1;
            nextBlink = t + 1.8 + Math.random() * 3;
          } else {
            open = 1 - 0.92 * Math.sin(p * Math.PI);
          }
        }
        parts.eyes.forEach((e) => { e.scale.y = open; });
      },
    };
    return rig;
  }

  /* One hop: a crouch, a flight of height H lasting F seconds, then a landing
   * with a jelly wobble. Returns null before it starts and once it is over. */
  function hopCurve(t, H, F = 0.42) {
    const A = 0.1;
    const L = 0.5;
    if (t < 0) return null;
    if (t < A) return { y: 0, sy: 1 - 0.16 * Math.sin((t / A) * Math.PI / 2), phase: 'crouch', p: 0 };
    t -= A;
    if (t < F) {
      const p = t / F;
      return { y: 4 * H * p * (1 - p), sy: 1.12 - 0.15 * p, phase: 'air', p };
    }
    t -= F;
    if (t < L) {
      const p = t / L;
      return { y: 0, sy: 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p), phase: 'land', p: 1 };
    }
    return null;
  }

  const KINDS_PUBLIC = {};
  for (const [id, k] of Object.entries(KINDS)) KINDS_PUBLIC[id] = { name: k.name, kind: k.kind, emoji: k.emoji, voice: k.voice };

  window.Critters = { KINDS: KINDS_PUBLIC, create, hopCurve };
})();
```

- [ ] **Step 5: Write `sound.js`**

<!-- file: games/stepping-stones/sound.js -->
```js
/* Stepping Stones: sounds, all synthesised with Web Audio, so there are no
 * audio files. Every sound is skipped while the site-wide sound toggle is off
 * (window.pimwMuted, owned by components.js). Sets window.Sfx. */
(function () {
  'use strict';

  let ac = null;
  function context() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(a, freq, dur, type, vol, slideTo, delay) {
    const t0 = a.currentTime + (delay || 0);
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // a burst of fading noise through a sweeping band-pass: splashes and puffs
  function noise(a, dur, vol, from, to) {
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource();
    const band = a.createBiquadFilter();
    const gain = a.createGain();
    src.buffer = buf;
    band.type = 'bandpass';
    band.frequency.setValueAtTime(from, a.currentTime);
    band.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
    gain.gain.value = vol;
    src.connect(band);
    band.connect(gain);
    gain.connect(a.destination);
    src.start();
  }

  const C5 = 523.25;
  const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19];      // a pentatonic climb, one note per row
  const note = (step) => C5 * Math.pow(2, step / 12);

  const SOUNDS = {
    hop: (a) => tone(a, 330, 0.13, 'sine', 0.09, 560),
    good: (a, row) => tone(a, note(STEPS[Math.min(Math.max(row || 0, 0), STEPS.length - 1)]), 0.3, 'triangle', 0.13),
    uhoh: (a) => {
      tone(a, 494, 0.14, 'triangle', 0.1);
      tone(a, 370, 0.22, 'triangle', 0.1, null, 0.13);
    },
    splash: (a) => {
      noise(a, 0.45, 0.5, 1400, 300);
      tone(a, 220, 0.25, 'sine', 0.12, 110, 0.12);      // glub
    },
    win: (a) => [0, 4, 7, 12, 16].forEach((s, i) => tone(a, note(s), 0.35, 'triangle', 0.12, null, i * 0.1)),
    poof: (a) => {
      noise(a, 0.18, 0.25, 3000, 1200);
      tone(a, 880, 0.12, 'sine', 0.06, 1500);
    },
    pop: (a) => tone(a, 1200, 0.06, 'sine', 0.1, 400),
    voice: (a, pitch) => {
      const p = pitch || 1;
      tone(a, 620 * p, 0.09, 'sine', 0.1, 900 * p);
      tone(a, 900 * p, 0.12, 'sine', 0.08, 700 * p, 0.08);
    },
  };

  window.Sfx = {
    play(name, arg) {
      if (window.pimwMuted) return;
      const a = context();
      if (!a || !SOUNDS[name]) return;
      try {
        SOUNDS[name](a, arg);
      } catch (e) {
        // a sound must never break the game
      }
    },
  };
})();
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `node --test docs/tests/*.test.js`
Expected: PASS, 24 tests.

- [ ] **Step 7: Look at the critters**

Write `$SP/drafts/harness-critters.html` (scratchpad only):

<!-- scratch: harness-critters.html -->
```html
<!doctype html>
<meta charset="utf-8">
<title>critters</title>
<style>html,body{margin:0;height:100%;background:#dff4ff}canvas{width:100%;height:100%;display:block}</style>
<canvas id="c"></canvas>
<script src="/games/stepping-stones/three.min.js"></script>
<script src="/games/stepping-stones/toon.js"></script>
<script src="/games/stepping-stones/critters.js"></script>
<script>
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dff4ff');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
  const sun = new THREE.DirectionalLight('#fff3df', 2.0);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.1, 50);
  camera.position.set(0, 2.4, 11);
  camera.lookAt(0, 1, 0);
  const rigs = Object.keys(Critters.KINDS).map((k, i) => {
    const r = Critters.create(k);
    r.root.position.x = (i - 1.5) * 2.2;
    r.look.yaw = (i - 1.5) * -0.15;
    scene.add(r.root);
    return r;
  });
  rigs[3].react('puff');
  rigs[2].react('bubble');
  (function frame(ms) {
    rigs.forEach((r) => r.update((ms || 0) / 1000, 0.016));
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  })();
</script>
```

Run: `node $SP/tools/shot.cjs http://127.0.0.1:47123/screen/harness-critters.html $SP/shots/t3-critters.png 600 1280 520`
Expected: no console errors. Four outlined critters stand in a row, faces visible, Plum mid-bubble, matching the approved preview.

- [ ] **Step 8: Commit**

```bash
git add games/stepping-stones/toon.js games/stepping-stones/critters.js games/stepping-stones/sound.js docs/tests/stepping-stones.test.js
git commit -m "feat(stepping-stones): four toon critters with reactions, and synthesised sounds"
```

---

### Task 4: The 3D world

**Files:**
- Create: `games/stepping-stones/world.js`
- Scratchpad: `$SP/drafts/harness-world.html`

**Interfaces:**
- Consumes: `THREE`, `Toon`.
- Produces: `World.create(canvas)` returns a world object `W`, or `null` when WebGL cannot start. `W` has:
  - `show('picker'|'pond')`, `resize()`, `render()`, `update(t, dt)`;
  - `showPicker(rigs)`, `alignPicker(buttonEls)` (sets `rig.baseY`), `framePicker()`;
  - `buildPond(pond)`, `actors` (a Group for the player and friends);
  - `startTop()`, `endTop(c)`, `stoneTop(r, c)`, `nodeTop(node)`, `friendSpot(i)`, `waterAt(r, c)` (all return Vector3), `rowZ(r)`;
  - `dipStone(r, c)`, `wobbleStone(r, c, angle)`, `sinkStone(r, c, k)` (k from 0 to 1);
  - `showRings(nodes)`, `showFocus(node|null)`, `framePond(focusZ, dt, snap)`;
  - `burst(pos, 'sparkle'|'splash'|'drops'|'poof'|'confetti')`, `ripple(x, z, from)`, `shadow(x, y, z, lift, visible)`;
  - `pick(clientX, clientY, planeY)` returns a Vector3 or null, `hits(clientX, clientY, object)` returns a boolean, and `toScreen(v)` returns `{x, y}`.
  - Nodes are `{type: 'start'}`, `{type: 'stone', r, c}` or `{type: 'end', c}`.

- [ ] **Step 1: Write `world.js`**

<!-- file: games/stepping-stones/world.js -->
```js
/* Stepping Stones: the 3D world.
 *
 * Owns the renderer, the sky and water, the lily pads on the critter-picking
 * screen, and the pond itself: stones with their painted labels, banks and
 * reeds, ripples and particles, and both camera framings. It draws; game.js
 * decides what happens. Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const ROWS = 8;
  const COLS = 4;
  const DX = 1.38;              // column spacing: four columns must fit a phone held upright
  const DZ = 1.7;               // row spacing
  const STONE_TOP = 0.34;
  const BANK_TOP = 0.31;
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const colX = (c) => (c - (COLS - 1) / 2) * DX;
  const rowZ = (r) => -r * DZ;

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.3, TAU - 0.3, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  /* A stone's painted number, in the site's own Fredoka, with a white halo so
   * it reads on any stone colour. The canvas top faces away from the camera. */
  function labelTexture(text) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    let size = text.length <= 2 ? 150 : text.length === 3 ? 118 : text.length === 4 ? 92 : 78;
    const font = () => `700 ${size}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    x.font = font();
    while (x.measureText(text).width > 214 && size > 40) {
      size -= 4;
      x.font = font();
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = Math.max(10, size * 0.11);
    x.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    x.strokeText(text, 128, 138);
    x.fillStyle = '#2b2a5e';
    x.fillText(text, 128, 138);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function shadowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(20, 50, 70, 0.42)');
    g.addColorStop(1, 'rgba(20, 50, 70, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    items.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      q.setFromEuler(e.set(0, it.ry || 0, 0));
      s.set(it.sx, it.sy, it.sz);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                    // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 17, 38);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);

    const M = {
      water: Toon.flat('#93d6ec'),
      stones: ['#efe4d3', '#e8dac7', '#f3e9db'].map((c) => Toon.toon(c, '#b8a68c')),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      pad: Toon.toon('#7ccf72', '#55a650'),
      petal: Toon.toon('#ffb3c9'),
      spark: Toon.flat('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
      focus: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.95, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      stone: new THREE.LatheGeometry([[0, -0.14], [0.44, -0.1], [0.54, 0.04], [0.56, 0.18], [0.5, 0.3], [0.4, STONE_TOP], [0, STONE_TOP]]
        .map(([x, y]) => new THREE.Vector2(x, y)), 40),
      decal: new THREE.CircleGeometry(0.43, 40),
      ring: new THREE.RingGeometry(0.62, 0.71, 48),
      focus: new THREE.RingGeometry(0.66, 0.84, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      pad: padGeometry(1),
      bit: new THREE.SphereGeometry(1, 10, 8),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      flower: new THREE.SphereGeometry(1, 12, 8),
      nearDirt: new THREE.BoxGeometry(20, 0.5, 4.2),
      nearGrass: new THREE.BoxGeometry(20.1, 0.14, 4.3),
      farDirt: new THREE.BoxGeometry(20, 0.5, 6),
      farGrass: new THREE.BoxGeometry(20.1, 0.14, 6.1),
      shadow: new THREE.PlaneGeometry(1.3, 1.3),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(80, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const picker = new THREE.Group();
    const pond = new THREE.Group();
    const level = new THREE.Group();          // rebuilt for every pond
    const actors = new THREE.Group();         // the player and the friends
    pond.add(level, actors);
    scene.add(picker, pond);

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 36;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-8, 8), z: rand(-20, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const rings = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(G.ring, M.ring);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      pond.add(m);
      return m;
    });
    const focusRing = new THREE.Mesh(G.focus, M.focus);
    focusRing.rotation.x = -Math.PI / 2;
    focusRing.visible = false;
    pond.add(focusRing);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    pond.add(shadow);

    let stones = [];
    let ringNodes = [];
    let focusNode = null;
    let camZ = 0;
    const bits = [];
    const ripples = [];
    const pickerPads = [];
    let pickerRigs = [];
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const W = { renderer, scene, camera, actors, rowZ };

    W.show = (which) => {
      picker.visible = which === 'picker';
      pond.visible = which === 'pond';
    };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    W.render = () => renderer.render(scene, camera);

    /* ---------------------------------------------------- pointer helpers */
    function aim(clientX, clientY, rect) {
      const r = rect || canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    W.pick = (clientX, clientY, planeY, rect) => {
      aim(clientX, clientY, rect);
      plane.constant = -planeY;
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, hit) ? hit : null;
    };
    W.hits = (clientX, clientY, object) => {
      aim(clientX, clientY);
      return ray.intersectObject(object, true).length > 0;
    };
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };

    /* ------------------------------------------------- the picking screen */
    W.showPicker = (rigs) => {
      pickerRigs.forEach((rg) => picker.remove(rg.root));
      pickerRigs = rigs;
      rigs.forEach((rg, i) => {
        if (!pickerPads[i]) {
          const pad = new THREE.Mesh(G.pad, M.pad);
          Toon.addOutlines(pad);
          picker.add(pad);
          pickerPads[i] = pad;
        }
        picker.add(rg.root);
      });
    };

    /* Stand each critter on a lily pad under its button, whatever the
     * layout: four in a row, or two by two on a tall screen. */
    W.alignPicker = (buttons) => {
      const rect = canvas.getBoundingClientRect();
      buttons.forEach((btn, i) => {
        const rig = pickerRigs[i];
        const pad = pickerPads[i];
        if (!rig || !pad) return;
        const b = btn.getBoundingClientRect();
        const y = b.top + b.height * 0.7;
        const mid = W.pick(b.left + b.width / 2, y, 0, rect);
        const left = W.pick(b.left + b.width * 0.1, y, 0, rect);
        const right = W.pick(b.right - b.width * 0.1, y, 0, rect);
        if (!mid || !left || !right) return;
        const s = clamp(left.distanceTo(right) / 2.4, 0.4, 1.6);
        pad.position.set(mid.x, 0, mid.z);
        pad.scale.setScalar(s * 0.85);
        rig.root.position.x = mid.x;
        rig.root.position.z = mid.z;
        rig.root.scale.setScalar(s * 0.8);
        rig.baseY = 0.05 * s * 0.85;
      });
    };

    W.framePicker = () => {
      if (camera.fov !== 40) {
        camera.fov = 40;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 5.5, 8.5);
      camera.lookAt(0, 0.5, 0);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------- a pond */
    W.buildPond = (data) => {
      level.traverse((o) => {
        if (o.isMesh && o.material && o.material.map && o.material !== M.shadow) {
          o.material.map.dispose();
          o.material.dispose();
        }
        if (o.isInstancedMesh) o.dispose();
      });
      level.clear();
      if (data.rows.length !== ROWS || data.rows[0].length !== COLS) throw new Error('Pond must be ' + ROWS + ' by ' + COLS);

      stones = data.rows.map((row, r) => row.map((item, c) => {
        const g = new THREE.Group();
        g.position.set(colX(c), 0, rowZ(r));
        const body = new THREE.Mesh(G.stone, M.stones[(r * 7 + c * 3) % 3]);
        const decal = new THREE.Mesh(G.decal, new THREE.MeshBasicMaterial({
          map: labelTexture(item.label), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        }));
        decal.rotation.x = -Math.PI / 2;
        decal.position.y = STONE_TOP + 0.006;
        g.add(body, decal);
        Toon.addOutlines(g);
        level.add(g);
        return { g, base: 0, dip: 0, dipV: 0, ph: rand(0, TAU) };
      }));

      // banks: grass over a dirt edge, the near one behind the start
      const nearZ = rowZ(-1) - 0.85 + 2.1;        // front edge 0.85 in front of the start spot
      const farZ = rowZ(ROWS - 1) - 0.85 - 3;
      const add = (geo, mat, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); level.add(m); };
      add(G.nearDirt, M.dirt, -0.06, nearZ);
      add(G.nearGrass, M.grass, 0.25, nearZ);
      add(G.farDirt, M.dirt, -0.06, farZ);
      add(G.farGrass, M.grass, 0.25, farZ);

      // reeds and cattails on both banks, lily pads and flowers on the water
      const reeds = [];
      const tails = [];
      const pads = [];
      const flowers = [];
      for (const [z0, z1] of [[0.95, 4.6], [rowZ(ROWS - 1) - 4.5, rowZ(ROWS - 1) - 1.0]]) {
        for (let i = 0; i < 14; i++) {
          const x = (Math.random() < 0.5 ? -1 : 1) * rand(3.3, 8);
          const z = rand(z0, z1);
          const h = rand(0.7, 1.5);
          reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
          if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
        }
      }
      for (let i = 0; i < 20; i++) {
        const x = (Math.random() < 0.5 ? -1 : 1) * rand(3.3, 7.5);
        const z = rand(rowZ(ROWS - 1) - 0.4, 0.6);
        const s = rand(0.35, 0.7);
        pads.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
        if (Math.random() < 0.35) flowers.push({ x, y: 0.1, z, sx: 0.12, sy: 0.09, sz: 0.12 });
      }
      level.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails));
      const padMesh = instanced(G.pad, M.pad, pads);
      Toon.addOutlines(padMesh);
      level.add(padMesh);
      if (flowers.length) level.add(instanced(G.flower, M.petal, flowers));

      W.showRings([]);
      W.showFocus(null);
    };

    W.startTop = () => new THREE.Vector3(0, BANK_TOP, rowZ(-1));
    W.endTop = (c) => new THREE.Vector3(colX(c) * 0.6, BANK_TOP, rowZ(ROWS) + 0.2);
    W.friendSpot = (i) => new THREE.Vector3((i - 1) * 1.8, BANK_TOP, rowZ(ROWS) - 0.9);
    W.waterAt = (r, c) => new THREE.Vector3(colX(c), 0, rowZ(r));
    W.stoneTop = (r, c) => {
      const g = stones[r][c].g;
      return new THREE.Vector3(g.position.x, g.position.y + STONE_TOP, g.position.z);
    };
    W.nodeTop = (n) => (n.type === 'start' ? W.startTop() : n.type === 'end' ? W.endTop(n.c) : W.stoneTop(n.r, n.c));
    W.dipStone = (r, c) => { stones[r][c].dipV = -1.6; };
    W.wobbleStone = (r, c, angle) => { stones[r][c].g.rotation.z = angle; };
    W.sinkStone = (r, c, k) => {
      const s = stones[r][c];
      s.base = -(k * k) * 0.9;
      if (k >= 1) s.g.visible = false;
    };

    W.showRings = (nodes) => {
      ringNodes = nodes.slice(0, rings.length);
      rings.forEach((m, i) => { m.visible = i < ringNodes.length; });
    };
    W.showFocus = (node) => {
      focusNode = node;
      focusRing.visible = !!node;
    };

    /* Camera for a pond. On narrow screens the vertical field of view widens
     * so the horizontal one still fits all four columns at the critter's own
     * row; on tall screens it aims further ahead, so the critter sits low with
     * more pond above it. */
    W.framePond = (focusZ, dt, snap) => {
      camZ = snap ? focusZ : camZ + (focusZ - camZ) * (1 - Math.exp(-3 * dt));
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.34 / a) * 180) / Math.PI, 40, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const hHalf = Math.tan((vfov * Math.PI) / 360) * a;
      const ahead = clamp(4.6 - 2.2 * a, 1.0, 4.0);
      const pitch = 0.66;
      const halfWidth = 1.5 * DX + 0.56 + 0.2;
      const L = clamp(halfWidth / hHalf + ahead * Math.cos(pitch), 10, 13);
      const tz = camZ - ahead;
      camera.position.set(0, 0.4 + L * Math.sin(pitch), tz + L * Math.cos(pitch));
      camera.lookAt(0, 0.4, tz);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 10, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.05, life: 0.6 },
      splash: { n: 22, mat: () => M.white, speed: 3.4, up: 4.2, size: 0.07, life: 0.8 },
      drops: { n: 14, mat: () => M.white, speed: 2.6, up: 1.6, size: 0.045, life: 0.5 },
      poof: { n: 16, mat: () => M.white, speed: 3, up: 1.4, size: 0.14, life: 0.45 },
      confetti: { n: 40, mat: (i) => M.confetti[i % M.confetti.length], speed: 5, up: 4.5, size: 0.06, life: 1.4 },
    };
    W.burst = (pos, kind) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        scene.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed),
          life: b.life,
          max: b.life,
          size: b.size,
        });
      }
    };
    W.ripple = (x, z, from) => {
      const m = new THREE.Mesh(G.ripple, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.015, z);
      m.scale.setScalar(from);
      scene.add(m);
      ripples.push({ m, t: 0, from });
    };
    W.shadow = (x, y, z, lift, visible) => {
      shadow.visible = visible;
      if (!visible) return;
      const s = 1 - 0.45 * clamp(lift / 0.8, 0, 1);
      shadow.position.set(x, y + 0.006, z);
      shadow.scale.setScalar(s);
      M.shadow.opacity = 0.5 + 0.5 * s;
    };

    /* --------------------------------------------------------- every frame */
    W.update = (t, dt) => {
      sparks.forEach((s, i) => {
        const k = Math.max(0, Math.sin(t * s.sp + s.ph)) ** 8;
        v3.set(s.x, 0.012, s.z);
        s3.set(k, k, k);
        sparkMesh.setMatrixAt(i, m4.compose(v3, flatDown, s3));
      });
      sparkMesh.instanceMatrix.needsUpdate = true;

      for (const row of stones) {
        for (const s of row) {
          s.dipV += (-s.dip * 140 - s.dipV * 9) * dt;
          s.dip += s.dipV * dt;
          s.g.position.y = s.base + 0.025 * Math.sin(t * 1.4 + s.ph) + s.dip * 0.5;
        }
      }

      const pulse = Math.sin(t * 5);
      M.ring.opacity = 0.55 + 0.35 * pulse;
      ringNodes.forEach((n, i) => {
        const p = W.nodeTop(n);
        const onBank = n.type !== 'stone';
        rings[i].position.set(p.x, onBank ? BANK_TOP + 0.02 : 0.03, p.z);
        rings[i].scale.setScalar((onBank ? 1.3 : 1) * (1 + 0.06 * pulse));
      });
      if (focusNode) {
        const p = W.nodeTop(focusNode);
        const onBank = focusNode.type !== 'stone';
        focusRing.position.set(p.x, onBank ? BANK_TOP + 0.03 : 0.04, p.z);
        focusRing.scale.setScalar((onBank ? 1.3 : 1) * (1 + 0.05 * Math.sin(t * 7)));
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.t += dt;
        const k = r.t / 1.1;
        if (k >= 1) {
          scene.remove(r.m);
          r.m.material.dispose();
          ripples.splice(i, 1);
          continue;
        }
        r.m.scale.setScalar(r.from + k * 1.4);
        r.m.material.opacity = 0.8 * (1 - k);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.y -= 9 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    return W;
  }

  window.World = { create };
})();
```

- [ ] **Step 2: Look at a pond**

Write `$SP/drafts/harness-world.html` (scratchpad only):

<!-- scratch: harness-world.html -->
```html
<!doctype html>
<meta charset="utf-8">
<title>world</title>
<link rel="stylesheet" href="/tokens.css">
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style>
<canvas id="c"></canvas>
<script src="/games/stepping-stones/three.min.js"></script>
<script src="/games/stepping-stones/toon.js"></script>
<script src="/games/stepping-stones/ponds.js"></script>
<script src="/games/stepping-stones/critters.js"></script>
<script src="/games/stepping-stones/world.js"></script>
<script>
  document.fonts.load('700 100px Fredoka').then(() => {
    const w = World.create(document.getElementById('c'));
    w.resize();
    w.show('pond');
    const pond = Ponds.generate(location.hash.slice(1) || 'times-3', 7);
    w.buildPond(pond);
    const rig = Critters.create('bunny');
    rig.root.scale.setScalar(0.8);
    w.actors.add(rig.root);
    const at = { type: 'stone', r: 0, c: pond.route[0] };
    const opts = [];
    for (let c = 0; c < 4; c++) for (const r of [0, 1]) if (!(r === at.r && c === at.c) && Math.abs(c - at.c) <= 1) opts.push({ type: 'stone', r, c });
    w.showRings(opts);
    w.showFocus(opts[0]);
    (function frame(ms) {
      const t = (ms || 0) / 1000;
      w.update(t, 0.016);
      rig.root.position.copy(w.nodeTop(at));
      rig.look.pitch = -0.24;
      rig.update(t, 0.016);
      w.shadow(rig.root.position.x, rig.root.position.y, rig.root.position.z, 0, true);
      w.framePond(rig.root.position.z, 0.016, true);
      w.render();
      requestAnimationFrame(frame);
    })();
  });
</script>
```

Run, at phone and desktop sizes:
`node $SP/tools/shot.cjs "http://127.0.0.1:47123/screen/harness-world.html#make-100" $SP/shots/t4-phone.png 1500 390 700`
`node $SP/tools/shot.cjs "http://127.0.0.1:47123/screen/harness-world.html#times-3" $SP/shots/t4-desktop.png 1500 1100 640`
Expected: no console errors; the bunny on a first-row stone facing the camera; all four columns visible on the phone shot; labels readable in Fredoka (including the 5-character `35+65` style); the white rings and the gold focus ring visible; banks, reeds and pads present.

- [ ] **Step 3: Run the tests**

Run: `node --test docs/tests/*.test.js`
Expected: PASS, 24 tests. The coverage test now checks `world.js` too.

- [ ] **Step 4: Commit**

```bash
git add games/stepping-stones/world.js
git commit -m "feat(stepping-stones): the 3D pond: stones with painted labels, banks, effects and cameras"
```

---

### Task 5: The page and the game

**Files:**
- Create: `games/stepping-stones/index.html`, `games/stepping-stones/game.js`
- Scratchpad: `$SP/tools/e2e.cjs`

**Interfaces:**
- Consumes: everything above. DOM ids used by `game.js`: `stage`, `view`, `pondInput`, `screenPick`, `pickGrid`, `pickGo`, `screenMenu`, `menuGroups`, `changeCritter`, `hud`, `whoBtn`, `whoPop`, `ruleText`, `hintText`, `hintBtn`, `menuBtn`, `say`, `srFocus`, `won`, `wonStars`, `wonSub`, `wonNext`, `wonAgain`, `wonAll`, `noGl`.
- Screen-reader announcements (the e2e player parses these): `"<label>, stone <n> of 4 in the first row"` (from the near bank), `"<label>, <ahead on the left|straight ahead|ahead on the right|on the left|on the right|behind on the left|behind|behind on the right>"`, and `"The far bank, where your friends are waiting"`. A `+` in a label is spoken as ` plus `.

- [ ] **Step 1: Write the end-to-end player (scratchpad)**

<!-- scratch: e2e.cjs -->
```js
// End-to-end check of Stepping Stones in headless Chrome (SwiftShader).
//   node e2e.cjs <pageUrl> <shotsDir> [label]
// Plays only by keyboard and the screen-reader announcements, like a
// keyboard user would, and asserts the promises the spec makes.
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert/strict');
const Ponds = require('C:/Users/shrik/playitmyway-web/games/stepping-stones/ponds.js');

const [url, shots, tag = 'run'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WHERE = {
  'ahead on the left': [1, -1], 'straight ahead': [1, 0], 'ahead on the right': [1, 1],
  'on the left': [0, -1], 'on the right': [0, 1],
  'behind on the left': [-1, -1], behind: [-1, 0], 'behind on the right': [-1, 1],
};
const KEYS = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

function parse(text, at) {
  if (/^The far bank/.test(text)) return { end: true };
  let m = /^(.+), stone (\d) of 4 in the first row$/.exec(text);
  if (m) return { label: m[1].replace(' plus ', '+'), r: 0, c: +m[2] - 1 };
  m = /^(.+), (ahead on the left|straight ahead|ahead on the right|on the left|on the right|behind on the left|behind on the right|behind)$/.exec(text);
  if (m) return { label: m[1].replace(' plus ', '+'), r: at.r + WHERE[m[2]][0], c: at.c + WHERE[m[2]][1] };
  throw new Error('cannot parse announcement: ' + JSON.stringify(text));
}
const id = (s) => (s.end ? 'end' : s.r + ',' + s.c);

// Mirror of game.js moveFocus, to plan key presses towards a target.
function planKeys(opts, from, target, at) {
  const pos = (s) => (s.end ? [8, at.c] : [s.r, s.c]);
  const move = (s, dr, dc) => {
    let [r, c] = pos(s);
    for (let i = 0; i < 3; i++) {
      r += dr;
      c += dc;
      const hit = opts.find((o) => { const [orow, ocol] = pos(o); return orow === r && (o.end || ocol === c); });
      if (hit) return hit;
    }
    return s;
  };
  const queue = [[from, []]];
  const seen = new Set([id(from)]);
  while (queue.length) {
    const [s, keys] = queue.shift();
    if (id(s) === id(target)) return keys;
    for (const [k, [dr, dc]] of Object.entries(KEYS)) {
      const n = move(s, dr, dc);
      if (!seen.has(id(n))) { seen.add(id(n)); queue.push([n, keys.concat(k)]); }
    }
  }
  throw new Error('no key path to ' + id(target));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 860 });
  const origin = new URL(url).origin;
  const problems = [];
  const foreign = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) foreign.push(r.url()); });

  const announce = () => page.$eval('#srFocus', (e) => e.textContent);
  const sayText = () => page.$eval('#say', (e) => e.textContent);
  const press = async (k) => { await page.keyboard.press(k); await sleep(70); return announce(); };
  const shot = (name) => page.screenshot({ path: path.join(shots, `${tag}-${name}.png`) });
  async function until(fn, ms, what) {
    const t0 = Date.now();
    for (;;) {
      if (await fn()) return;
      if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what);
      await sleep(80);
    }
  }

  // look at every stone in reach by sweeping the highlight around
  async function scan(at) {
    const seen = new Map();
    const note = (text) => { const s = parse(text, at); seen.set(id(s), s); };
    note(await press('ArrowUp'));
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown',
      'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp']) {
      note(await press(k));
    }
    return [...seen.values()];
  }

  async function hopTo(target, opts, at) {
    const from = parse(await announce(), at);
    for (const k of planKeys(opts, from, target, at)) await press(k);
    assert.equal(id(parse(await announce(), at)), id(target), 'focus did not reach the target');
    await page.keyboard.press('Enter');
  }

  // a perfect player: right stones only, forward first, back out of dead ends
  async function cross(pondId, { wrongFirst = false } = {}) {
    let at = { r: -1, c: 1.5 };
    const visited = new Set();
    const trail = [];
    if (wrongFirst) {
      const opts = await scan(at);
      const wrong = opts.find((o) => !o.end && !Ponds.judge(pondId, o.label).ok);
      await hopTo(wrong, opts, at);
      await until(async () => (await sayText()).startsWith('Splash!'), 4000, 'the splash message');
      await shot('splash');
      assert.equal(await sayText(), 'Splash! ' + Ponds.judge(pondId, wrong.label).why);
      await sleep(2600);                                 // sink, climb out, settle
      const after = await scan(at);
      assert.ok(!after.some((o) => id(o) === id(wrong)), 'the sunk stone can still be reached');
    }
    for (let hops = 0; hops < 80; hops++) {
      const opts = await scan(at);
      const rights = opts.filter((o) => o.end || Ponds.judge(pondId, o.label).ok);
      let target = rights.find((o) => o.end);
      let back = false;
      if (!target) {
        target = rights.filter((o) => !visited.has(id(o))).sort((a, b) => b.r - a.r)[0];
        if (!target) { target = trail.pop(); back = true; }
      }
      assert.ok(target, 'stuck with nowhere to go');
      // a pond may repeat a label, so clear the message rather than wait for it to differ
      await page.$eval('#say', (e) => { e.textContent = ''; });
      await hopTo(target, opts, at);
      if (target.end) {
        await until(() => page.$eval('#won', (e) => !e.hidden), 5000, 'the pond-cleared dialog');
        return;
      }
      await until(async () => (await sayText()).startsWith('✓'), 4000, 'a right-stone message');
      assert.ok((await sayText()).includes(Ponds.judge(pondId, target.label).why));
      if (!back) trail.push(at);
      visited.add(id(target));
      at = { r: target.r, c: target.c };
      await sleep(250);
    }
    throw new Error('took too many hops');
  }

  await page.goto(url, { waitUntil: 'load' });
  await sleep(1500);
  await shot('1-pick');

  // pick Clover, then the 3 times table
  await page.click('.pick-btn[aria-label="Clover the Bunny"]');
  await sleep(300);
  assert.equal(await page.$eval('#pickGo', (e) => e.disabled), false);
  await page.click('#pickGo');
  await until(() => page.$eval('#screenMenu', (e) => !e.hidden), 3000, 'the pond menu');
  await shot('2-menu');
  const buttons = await page.$$('.pond-btn');
  for (const b of buttons) {
    if ((await b.$eval('.pond-title', (e) => e.textContent)) === '3 times table') { await b.click(); break; }
  }
  await until(() => page.$eval('#hud', (e) => !e.hidden), 4000, 'the pond');
  assert.equal(await page.$eval('#ruleText', (e) => e.textContent), 'Hop on the 3 times table');
  await sleep(800);
  await shot('3-pond');

  await cross('times-3');
  await sleep(500);
  await shot('4-won');
  assert.equal(await page.$eval('#wonStars', (e) => e.textContent), '★★★');

  // next pond, switch critter, then one deliberate wrong hop
  await page.click('#wonNext');
  await until(async () => (await page.$eval('#ruleText', (e) => e.textContent)) === 'Hop on the 4 times table', 4000, 'the next pond');
  await sleep(600);
  await page.click('#whoBtn');
  await page.click('.who-opt[aria-label="Pip the Frog"]');
  await sleep(500);
  assert.equal(await sayText(), "Hi, I'm Pip! Let's keep hopping.");
  assert.match(await page.$eval('#whoBtn', (e) => e.getAttribute('aria-label')), /Pip the Frog/);
  await page.focus('#pondInput');
  await cross('times-4', { wrongFirst: true });
  assert.equal(await page.$eval('#wonStars', (e) => e.textContent), '★★☆');

  // same pond, new stones: same rule, a fresh pond, the critter back on the bank
  await page.click('#wonAgain');
  await until(() => page.$eval('#won', (e) => e.hidden), 3000, 'the dialog to close');
  await until(async () => (await sayText()).startsWith('Hop on the 4 times table!'), 4000, 'the fresh pond');
  assert.equal(await page.$eval('#ruleText', (e) => e.textContent), 'Hop on the 4 times table');

  // the menu remembers this visit's stars, in memory only
  await page.click('#menuBtn');
  await until(() => page.$eval('#screenMenu', (e) => !e.hidden), 3000, 'the menu again');
  const labels = await page.$$eval('.pond-btn', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  assert.ok(labels.includes('3 times table, 3 stars this visit'), labels.join(' | '));
  assert.ok(labels.includes('4 times table, 2 stars this visit'), labels.join(' | '));

  // nothing stored, nothing fetched from anywhere else
  const stored = await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]);
  assert.deepEqual(stored, [0, 0, '']);
  assert.deepEqual(foreign, [], 'third-party requests');
  assert.deepEqual(problems, [], 'console or page errors');
  console.log('E2E PASS (' + tag + ')');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
```

Run: `node $SP/tools/e2e.cjs http://127.0.0.1:47123/games/stepping-stones/ $SP/shots`
Expected: `E2E FAIL: …` (404: the page does not exist yet).

- [ ] **Step 2: Write `index.html`**

<!-- file: games/stepping-stones/index.html -->
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="only light" />
    <meta name="darkreader-lock" />
    <meta name="theme-color" content="#7c3aed" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- SEO Meta Tags -->
    <title>Stepping Stones – Free 3D Maths Game | Play It My Way</title>
    <meta name="description" content="Hop a cute critter across a 3D pond, landing only on stones that fit the rule: times tables, odd and even, number bonds. Ages 7+. No ads." />
    <meta name="keywords" content="times tables game for kids, 3d maths game for kids, number bonds game, odd and even numbers game, free maths game ages 7+" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Stepping Stones – Free 3D Maths Game for Kids" />
    <meta property="og:description" content="Hop a cute critter across the pond on stones that fit the rule: times tables, odd and even, number bonds. 16 ponds for ages 7+. No ads, no download!" />
    <meta property="og:type" content="game" />
    <meta property="og:url" content="https://playitmyway.com/games/stepping-stones/" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Stepping Stones – Free 3D Maths Game for Kids" />
    <meta name="twitter:description" content="Hop across a 3D pond on stones that fit the rule: times tables, odd and even, number bonds. Ages 7+. No ads, no download!" />

    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="canonical" href="https://playitmyway.com/games/stepping-stones/" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="../../tokens.css" />
    <link rel="stylesheet" href="../../components.css" />
    <style>
      :root {
        --band: var(--color-violet);
        --band-tint: var(--color-violet-tint);
        --band-tint-deep: #c4b5fd;
        --ink: var(--color-ink);
        --ink-soft: var(--color-ink-soft);
        --deep: var(--color-deep);
      }

      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body {
        background: var(--color-bg);
        /* an accidental pull-to-refresh would throw the pond away */
        overscroll-behavior-y: contain;
      }
      body {
        font-family: var(--font-display);
        color: var(--ink);
        margin: 0;
        padding: 16px 12px 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 100vh;
      }
      button { font-family: inherit; }

      .back-link {
        color: var(--band); text-decoration: none; font-weight: 600;
        font-size: 15px; padding: 9px 14px; border-radius: var(--radius-pill);
        background: var(--band-tint);
        align-self: flex-start; margin-bottom: 6px;
        min-height: 44px; display: inline-flex; align-items: center;
        box-shadow: 0 3px 0 0 var(--band-tint-deep);
        transition: transform var(--ease-quick), box-shadow var(--ease-quick);
      }
      .back-link:hover { transform: translateY(-2px); box-shadow: 0 5px 0 0 var(--band-tint-deep); }
      .back-link:active { transform: translateY(3px); box-shadow: 0 1px 0 0 var(--band-tint-deep); }

      header.game-head { text-align: center; margin: 8px 0 14px; }
      header.game-head h1 { font-size: clamp(26px, 7vw, 34px); font-weight: 700; margin: 0 0 4px; text-wrap: balance; }
      header.game-head p { margin: 0; color: var(--ink-soft); font-size: 16px; }

      .stage-card {
        width: 100%; max-width: 960px;
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-rest);
        padding: 8px;
      }
      .stage {
        position: relative; width: 100%;
        height: clamp(420px, 72vh, 640px);
        border-radius: 18px; overflow: hidden;
        background: #dff4ff; color: var(--deep);
        user-select: none; -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      html.pimw-fs .stage { height: calc(100vh - 96px); height: calc(100dvh - 96px); }
      .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .pond-input { position: absolute; inset: 0; touch-action: none; cursor: pointer; border-radius: 18px; }
      .pond-input:focus { outline: none; }
      .pond-input:focus-visible { box-shadow: inset 0 0 0 4px var(--color-focus); }

      /* screens laid over the 3D view */
      .screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 12px; }
      .screen-title {
        margin: 0; font-size: clamp(21px, 5vw, 28px); font-weight: 700; text-align: center;
        background: rgba(255, 255, 255, 0.92); padding: 6px 18px; border-radius: var(--radius-pill);
        box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .pick-grid { flex: 1; width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .stage.tall .pick-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
      .pick-btn {
        border: 3px solid transparent; border-radius: 22px; background: transparent; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
        padding: 0 4px 8px; color: var(--deep);
      }
      .pick-btn:hover { background: rgba(255, 255, 255, 0.16); }
      .pick-btn[aria-pressed="true"] { border-color: var(--band); background: rgba(255, 255, 255, 0.26); }
      .pick-name {
        background: #fff; border-radius: var(--radius-pill); padding: 4px 14px;
        font-size: 18px; font-weight: 700; box-shadow: 0 3px 0 var(--band-tint-deep);
      }
      .pick-kind {
        font-size: 13px; font-weight: 600; margin-top: 4px;
        background: rgba(255, 255, 255, 0.86); border-radius: var(--radius-pill); padding: 1px 10px;
      }
      .go-btn {
        border: 0; border-radius: var(--radius-pill); background: var(--band); color: #fff;
        font-size: 18px; font-weight: 600; padding: 12px 26px; min-height: 48px; cursor: pointer;
        box-shadow: 0 5px 0 var(--candy-violet);
      }
      .go-btn:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--candy-violet); }
      .go-btn:disabled { background: #b5a6e6; box-shadow: 0 5px 0 #8b7cc4; cursor: default; transform: none; }

      .screen.menu { background: var(--color-bg); overflow-y: auto; align-items: stretch; padding: 16px; gap: 4px; }
      .menu-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .menu-head h2 { margin: 0; font-size: 26px; }
      .chip-btn {
        border: 0; border-radius: var(--radius-pill); background: var(--band-tint); color: var(--band);
        font-weight: 600; font-size: 16px; padding: 10px 16px; min-height: 44px; cursor: pointer;
        box-shadow: 0 3px 0 var(--band-tint-deep);
      }
      .pond-family h3 { margin: 14px 0 8px; font-size: 18px; color: var(--ink-soft); }
      .pond-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
      .pond-btn {
        position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
        text-align: left; border: 0; border-radius: 16px; background: #fff; padding: 12px 14px; min-height: 64px;
        box-shadow: 0 4px 0 var(--candy-card); cursor: pointer; color: var(--ink); font-size: 17px; font-weight: 600;
      }
      .pond-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--candy-card); }
      .pond-stars { color: #d97706; font-size: 15px; letter-spacing: 2px; }
      .pond-badge {
        position: absolute; top: -9px; right: 8px; background: var(--deep); color: #fff;
        font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: var(--radius-pill);
      }

      /* the heads-up display while playing */
      .hud { position: absolute; inset: 0; pointer-events: none; }
      .hud-top { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; align-items: flex-start; }
      .hud-btn {
        pointer-events: auto; flex: none; width: 46px; height: 46px; border-radius: 50%; border: 0;
        background: #fff; font-size: 24px; line-height: 1; cursor: pointer;
        display: grid; place-items: center; box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .hud-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--band-tint-deep); }
      .hud-btn[aria-pressed="true"] { background: #fff4c4; }
      .rule {
        flex: 1; min-width: 0; background: #fff; border-radius: 18px; padding: 7px 10px 8px;
        box-shadow: 0 4px 0 var(--band-tint-deep); text-align: center;
        font-size: 17px; font-weight: 600; line-height: 1.25;
      }
      .rule b { color: var(--band); font-weight: 700; }
      .rule small { display: block; color: var(--ink-soft); font-size: 13.5px; font-weight: 600; margin-top: 2px; }
      /* right: 64px keeps the message clear of the site's floating sound button */
      .say {
        position: absolute; left: 10px; right: 64px; bottom: 10px; margin: 0;
        background: rgba(255, 255, 255, 0.96); border-radius: 18px; padding: 9px 14px;
        text-align: center; font-size: 16px; font-weight: 600; line-height: 1.3;
        box-shadow: 0 4px 0 rgba(43, 42, 94, 0.14);
      }
      .say:empty { display: none; }
      .say.good { box-shadow: 0 4px 0 #86efac; }
      .say.oops { box-shadow: 0 4px 0 #fda4af; }
      .who-pop {
        pointer-events: auto; position: absolute; top: 64px; left: 10px; display: flex; gap: 6px;
        background: #fff; padding: 8px; border-radius: 18px; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
      }
      .who-opt {
        width: 64px; border: 3px solid transparent; border-radius: 14px; background: var(--band-tint);
        cursor: pointer; display: flex; flex-direction: column; align-items: center;
        padding: 6px 2px 4px; font-size: 26px; color: var(--deep);
      }
      .who-opt[aria-pressed="true"] { border-color: var(--band); }
      .who-name { font-size: 12px; font-weight: 600; }

      .won { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(255, 255, 255, 0.35); }
      .won-card {
        background: #fff; border-radius: 24px; padding: 18px 22px 20px; text-align: center;
        box-shadow: 0 8px 0 var(--band-tint-deep), var(--shadow-lift); width: 100%; max-width: 340px;
      }
      .won-card h2 { margin: 0; font-size: 26px; }
      .won-stars { font-size: 38px; letter-spacing: 6px; color: #f59e0b; margin: 6px 0 2px; }
      .won-sub { margin: 0 0 14px; color: var(--ink-soft); font-weight: 600; }
      .won-btns { display: flex; flex-direction: column; gap: 10px; }
      .soft-btn {
        border: 0; border-radius: var(--radius-pill); background: var(--band-tint); color: var(--band);
        font-size: 16px; font-weight: 600; padding: 11px 18px; min-height: 46px; cursor: pointer;
        box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .soft-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--band-tint-deep); }

      .nogl {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 6px; padding: 24px; text-align: center; background: var(--color-bg);
      }
      .nogl-emoji { font-size: 56px; margin: 0; }
      .nogl h2 { margin: 0; }
      .nogl a {
        display: inline-block; margin: 6px; padding: 10px 16px; border-radius: var(--radius-pill);
        background: var(--band-tint); color: var(--band); font-weight: 600; text-decoration: none;
      }

      .how-to {
        width: 100%; max-width: 760px; margin: 22px auto 0; padding: 18px 22px;
        background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-rest);
        line-height: 1.6;
      }
      .how-to h2 { margin: 0 0 8px; font-size: 22px; }
      .how-to h3 { margin: 14px 0 4px; font-size: 18px; }
      .how-to ol { margin: 0; padding-left: 22px; }
      .how-to p { margin: 10px 0 0; }
      kbd { font-family: inherit; background: var(--band-tint); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
      .visually-hidden {
        position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
      }

      @media (max-width: 420px) {
        .hud-btn { width: 42px; height: 42px; font-size: 21px; }
        .rule { font-size: 15px; padding: 6px 8px; }
        .say { font-size: 14.5px; }
        .pick-name { font-size: 16px; }
      }
    </style>
  </head>
  <body>
    <a class="back-link" href="../../">← Back to Games</a>

    <header class="game-head">
      <h1>🐸 Stepping Stones</h1>
      <p>Hop across the pond, only on stones that fit the rule.</p>
    </header>

    <main class="stage-card">
      <div class="stage" id="stage">
        <canvas id="view" aria-hidden="true"></canvas>
        <div class="pond-input" id="pondInput" tabindex="0" role="application"
             aria-label="The pond. Arrow keys choose a stone, Enter hops." hidden></div>

        <section class="screen pick" id="screenPick" aria-labelledby="pickTitle">
          <h2 class="screen-title" id="pickTitle">Who's hopping today?</h2>
          <div class="pick-grid" id="pickGrid" role="group" aria-label="Critters"></div>
          <button type="button" class="go-btn" id="pickGo" disabled>Pick a critter</button>
        </section>

        <section class="screen menu" id="screenMenu" aria-labelledby="menuTitle" hidden>
          <div class="menu-head">
            <h2 id="menuTitle">Pick a pond</h2>
            <button type="button" class="chip-btn" id="changeCritter">Change critter</button>
          </div>
          <div id="menuGroups"></div>
        </section>

        <div class="hud" id="hud" hidden>
          <div class="hud-top">
            <button type="button" class="hud-btn" id="whoBtn" aria-haspopup="true" aria-expanded="false"
                    aria-controls="whoPop" aria-label="Switch critter"></button>
            <div class="rule"><span id="ruleText"></span><small id="hintText" hidden></small></div>
            <button type="button" class="hud-btn" id="hintBtn" aria-pressed="false" aria-label="Hint"><span aria-hidden="true">💡</span></button>
            <button type="button" class="hud-btn" id="menuBtn" aria-label="All ponds"><span aria-hidden="true">🗺️</span></button>
          </div>
          <div class="who-pop" id="whoPop" role="group" aria-label="Switch critter" hidden></div>
          <p class="say" id="say" aria-live="polite"></p>
        </div>

        <div class="won" id="won" hidden>
          <div class="won-card" role="dialog" aria-modal="true" aria-labelledby="wonTitle">
            <h2 id="wonTitle">Pond cleared!</h2>
            <p class="won-stars" id="wonStars" role="img"></p>
            <p class="won-sub" id="wonSub"></p>
            <div class="won-btns">
              <button type="button" class="go-btn" id="wonNext">Next pond →</button>
              <button type="button" class="soft-btn" id="wonAgain">Same pond, new stones</button>
              <button type="button" class="soft-btn" id="wonAll">All ponds</button>
            </div>
          </div>
        </div>

        <div class="nogl" id="noGl" hidden>
          <p class="nogl-emoji" aria-hidden="true">🐸</p>
          <h2>This game needs 3D graphics</h2>
          <p>This browser or device has 3D graphics switched off. Try one of these instead:</p>
          <p><a href="../code-the-robot/">🤖 Code the Robot</a><a href="../math-puzzle/">➕ Math Puzzle</a></p>
        </div>
      </div>
      <p class="visually-hidden" id="srFocus" aria-live="polite"></p>
    </main>

    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li>Pick your critter: Clover the Bunny, Pip the Frog, Plum the Baby Dino or Mango the Kitten.</li>
        <li>Pick a pond. Each one has a rule, like <strong>Hop on the 3 times table</strong> or <strong>Hop on stones that make 10</strong>.</li>
        <li>Tap a glowing stone next to your critter. Only stones that fit the rule hold you up.</li>
        <li>Land on a wrong stone and it sinks. Splash! The game shows why it was wrong, and your critter climbs back to try again.</li>
        <li>Reach the far bank, where your friends are waiting. No splashes earns three stars. Nothing is saved, so stars reset when you leave.</li>
      </ol>
      <p>On a keyboard: the arrow keys <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> choose a stone, and <kbd>Enter</kbd> hops. Tap 💡 for a hint, or the face button to switch critters at any time.</p>
      <h3>What it practises</h3>
      <p>Odd and even numbers, the times tables from 2 to 10, and number bonds to 10, 20 and 100. Every pond is new each time, and the wrong stones are near misses, like 14 in the 4 times table, so guessing does not work.</p>
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

    <script src="three.min.js"></script>
    <script src="toon.js"></script>
    <script src="ponds.js"></script>
    <script src="critters.js"></script>
    <script src="sound.js"></script>
    <script src="world.js"></script>
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

- [ ] **Step 3: Write `game.js`**

<!-- file: games/stepping-stones/game.js -->
```js
/* Stepping Stones: the game itself.
 *
 * Screens (pick a critter, pick a pond, play), the rules of movement, input
 * by tap and by keyboard, the HUD, and the hop, splash and celebrate
 * choreography. Needs THREE, Toon, Ponds, Critters, Sfx and World, loaded
 * before it. Nothing is stored: stars live in this page's memory only.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const ROWS = Ponds.ROWS;
  const COLS = Ponds.COLS;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const fullName = (k) => `${KINDS[k].name} the ${KINDS[k].kind}`;
  const same = (a, b) => !!a && !!b && a.type === b.type && a.r === b.r && a.c === b.c;

  function turnToward(from, to, k) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return from + d * k;
  }

  const stage = $('stage');
  const canvas = $('view');
  const pondInput = $('pondInput');
  const hud = $('hud');
  const say = $('say');
  const srFocus = $('srFocus');
  const ruleText = $('ruleText');
  const hintText = $('hintText');
  const hintBtn = $('hintBtn');
  const whoBtn = $('whoBtn');
  const whoPop = $('whoPop');
  const won = $('won');
  const pickGrid = $('pickGrid');
  const pickGo = $('pickGo');
  const menuGroups = $('menuGroups');
  const screens = { pick: $('screenPick'), menu: $('screenMenu') };

  function noGl() {
    ['screenPick', 'screenMenu', 'hud', 'pondInput', 'won'].forEach((id) => { $(id).hidden = true; });
    $('noGl').hidden = false;
  }

  const world = World.create(canvas);
  if (!world) {
    noGl();
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    noGl();
  });

  /* ------------------------------------------------------------ state */
  const START = { type: 'start' };
  const S = {
    screen: 'pick',
    kind: null,
    pondIndex: 0,
    pond: null,
    sunk: null,
    at: START,
    prev: START,
    endCol: 0,
    mode: 'idle',
    modeAt: 0,
    hop: null,
    bad: null,
    from: null,
    splashes: 0,
    lastStars: 0,
    stars: Object.create(null),       // best stars per pond, this visit only
    focus: null,
    keys: false,
    pointer: null,
    faceAt: 0,
    yawTarget: 0,
    landAt: -9,
    popAt: -9,
    nudgeAt: -9,
    rippleAt: 0,
    splashed: false,
    wonShown: false,
    pendingSwap: null,
    timers: [],
  };
  let player = null;
  let friends = [];
  let pickRigs = [];

  function setMode(m) {
    S.mode = m;
    S.modeAt = time();
  }
  function later(delay, fn) {
    S.timers.push({ at: time() + delay, fn });
  }
  function runTimers() {
    const t = time();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  function tell(text, mood) {
    say.textContent = text;
    say.className = 'say' + (mood ? ' ' + mood : '');
  }

  function showScreen(name) {
    S.screen = name;
    screens.pick.hidden = name !== 'pick';
    screens.menu.hidden = name !== 'menu';
    hud.hidden = name !== 'play';
    pondInput.hidden = name !== 'play';
    won.hidden = true;
    closePop();
    world.show(name === 'play' ? 'pond' : 'picker');
    if (name === 'menu') stop();
    else start();
  }

  /* ------------------------------------------------- pick a critter */
  const pickButtons = ORDER.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-btn';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', fullName(k));
    b.innerHTML = `<span class="pick-name" aria-hidden="true">${KINDS[k].name}</span>` +
      `<span class="pick-kind" aria-hidden="true">the ${KINDS[k].kind}</span>`;
    b.addEventListener('click', () => choose(k));
    pickGrid.appendChild(b);
    return b;
  });

  function choose(k) {
    S.kind = k;
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    const rig = pickRigs[ORDER.indexOf(k)];
    rig.hopAt = time();
    rig.happy = true;
    Sfx.play('voice', KINDS[k].voice);
    world.burst(above(rig.root.position, 1.3 * rig.root.scale.y), 'sparkle');
    pickGo.disabled = false;
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
    updateWho();
  }
  pickGo.addEventListener('click', () => { if (S.kind) showMenu(); });

  function showPick() {
    if (!pickRigs.length) {
      pickRigs = ORDER.map((k) => Object.assign(Critters.create(k), { hopAt: -9, happy: false, baseY: 0 }));
      world.showPicker(pickRigs);
    }
    showScreen('pick');
  }

  function lookAtPointer(rig, dt, chin) {
    let yaw = 0;
    let pitch = chin;
    if (S.pointer) {
      const p = world.toScreen(above(rig.root.position, rig.root.scale.y));
      yaw = clamp((S.pointer.x - p.x) / 220, -0.8, 0.8);
      pitch = clamp((S.pointer.y - p.y) / 400, -0.3, 0.35) + chin;
    }
    const k = 1 - Math.exp(-6 * dt);
    rig.look.yaw += (yaw - rig.look.yaw) * k;
    rig.look.pitch += (pitch - rig.look.pitch) * k;
  }
  stage.addEventListener('pointermove', (e) => { S.pointer = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { S.pointer = null; });

  function tickPick(t, dt) {
    world.framePicker();
    world.alignPicker(pickButtons);
    pickRigs.forEach((rig) => {
      let y = 0;
      let spin = 0;
      rig.sy = null;
      if (rig.hopAt >= 0) {
        const h = hopCurve(t - rig.hopAt, 0.7);
        if (!h) {
          rig.hopAt = -9;
          rig.happy = false;
        } else {
          y = h.y;
          rig.sy = h.sy;
          if (rig.happy && h.phase === 'air' && !calm()) spin = h.p * TAU;
        }
      } else if (Math.random() < dt * 0.25) {
        rig.hopAt = t;                              // a hop now and then, just for joy
      }
      rig.root.position.y = rig.baseY + y * rig.root.scale.y;
      lookAtPointer(rig, dt, -0.12);
      rig.turn.rotation.y = rig.look.yaw * 0.6 + spin;
      rig.update(t, dt);
    });
  }

  /* ---------------------------------------------------- pick a pond */
  function showMenu() {
    menuGroups.textContent = '';
    for (const fam of Ponds.FAMILIES) {
      const sec = document.createElement('section');
      sec.className = 'pond-family';
      const h = document.createElement('h3');
      h.textContent = fam.title;
      const grid = document.createElement('div');
      grid.className = 'pond-grid';
      Ponds.LIST.forEach((p, i) => {
        if (p.family !== fam.id) return;
        const stars = S.stars[p.id] || 0;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pond-btn';
        b.innerHTML = `<span class="pond-title">${p.title}</span>` +
          `<span class="pond-stars" aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` +
          (p.start ? '<span class="pond-badge" aria-hidden="true">Start here</span>' : '');
        b.setAttribute('aria-label', p.title + (p.start ? ', start here' : '') +
          (stars ? `, ${stars} star${stars > 1 ? 's' : ''} this visit` : ''));
        b.addEventListener('click', () => play(i));
        grid.appendChild(b);
      });
      sec.append(h, grid);
      menuGroups.appendChild(sec);
    }
    $('changeCritter').innerHTML = `<span aria-hidden="true">${KINDS[S.kind].emoji}</span> Change critter`;
    showScreen('menu');
    menuGroups.querySelector('.pond-btn').focus({ preventScroll: true });
  }
  $('changeCritter').addEventListener('click', showPick);

  /* --------------------------------------------------------- a pond */
  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  // the stone labels are painted in Fredoka, so wait for it (briefly)
  function play(index) {
    fonts().then(() => begin(index));
  }

  function begin(index) {
    S.pondIndex = index;
    S.pond = Ponds.generate(Ponds.LIST[index].id, Math.floor(Math.random() * 2147483647));
    S.sunk = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    S.at = S.prev = START;
    S.splashes = 0;
    S.focus = null;
    S.wonShown = false;
    S.pendingSwap = null;
    S.timers = [];
    setMode('idle');
    world.buildPond(S.pond);
    placePlayer(world.startTop(), 0);
    makeFriends();
    ruleText.innerHTML = S.pond.rule;
    hintText.textContent = S.pond.hint;
    hintText.hidden = true;
    hintBtn.setAttribute('aria-pressed', 'false');
    showScreen('play');
    world.framePond(player.root.position.z, 0, true);
    tell(`${S.pond.ruleText}! Tap a glowing stone next to ${KINDS[S.kind].name}.`);
    S.faceAt = time();
    afterMove();
    pondInput.focus({ preventScroll: true });
  }

  function placePlayer(pos, yaw) {
    if (player) {
      world.actors.remove(player.root);
      player.dispose();
    }
    player = Critters.create(S.kind);
    player.root.scale.setScalar(0.8);
    player.root.position.copy(pos);
    player.turn.rotation.y = yaw;
    world.actors.add(player.root);
  }

  // the other three wait on the far bank
  function makeFriends() {
    friends.forEach((f) => {
      world.actors.remove(f.root);
      f.dispose();
    });
    friends = ORDER.filter((k) => k !== S.kind).map((k, i) => {
      const f = Object.assign(Critters.create(k), { hopAt: -9, spot: world.friendSpot(i) });
      f.root.scale.setScalar(0.8);
      f.root.position.copy(f.spot);
      world.actors.add(f.root);
      return f;
    });
  }

  /* Where can the critter hop from node n? Any touching stone that has not
   * sunk, diagonals and backwards included; from the near bank, any stone in
   * the first row; from the last row, the far bank too. */
  function options(n) {
    const out = [];
    if (n.type === 'start') {
      for (let c = 0; c < COLS; c++) if (!S.sunk[0][c]) out.push({ type: 'stone', r: 0, c });
      return out;
    }
    if (n.type !== 'stone') return out;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = n.r + dr;
        const c = n.c + dc;
        if ((dr || dc) && r >= 0 && r < ROWS && c >= 0 && c < COLS && !S.sunk[r][c]) out.push({ type: 'stone', r, c });
      }
    }
    if (n.r === ROWS - 1) out.push({ type: 'end', c: n.c });
    return out;
  }

  function afterMove() {
    const opts = options(S.at);
    world.showRings(opts);
    S.focus = defaultFocus(opts);
    world.showFocus(S.keys ? S.focus : null);
  }

  function go(n) {
    if (S.mode !== 'idle') return;
    S.hop = { from: player.root.position.clone(), to: n };
    const d = world.nodeTop(n).sub(player.root.position);
    S.yawTarget = Math.atan2(d.x, d.z);
    setMode('hop');
    Sfx.play('hop');
    world.showRings([]);
    world.showFocus(null);
  }

  function arrive(n) {
    S.landAt = time();
    if (n.type === 'end') {
      win(n);
      return;
    }
    const item = S.pond.rows[n.r][n.c];
    const w = world.waterAt(n.r, n.c);
    world.dipStone(n.r, n.c);
    world.ripple(w.x, w.z, 0.62);
    if (item.ok) {
      S.at = S.prev = n;
      setMode('idle');
      S.faceAt = time() + 0.35;
      Sfx.play('good', n.r);
      world.burst(above(world.nodeTop(n), 0.25), 'sparkle');
      friends.forEach((f, i) => { f.hopAt = time() + 0.05 + i * 0.09; });
      tell(n.r === ROWS - 1
        ? `✓ ${item.why}. Now hop onto the bank: your friends are waiting!`
        : `✓ ${item.why}. Nice hop!`, 'good');
      afterMove();
    } else {
      S.bad = n;
      S.splashed = false;
      setMode('wobble');
      Sfx.play('uhoh');
    }
  }

  function splash() {
    S.splashed = true;
    S.splashes++;
    const w = world.waterAt(S.bad.r, S.bad.c);
    Sfx.play('splash');
    world.burst(above(w, 0.05), 'splash');
    world.ripple(w.x, w.z, 0.4);
    later(0.18, () => world.ripple(w.x, w.z, 0.3));
    tell(`Splash! ${S.pond.rows[S.bad.r][S.bad.c].why}`, 'oops');
  }

  // one personality touch each after a splash; Pip's is the swim itself
  const AFTER_SPLASH = { bunny: ['earshake'], frog: [], dino: ['bubble'], kitten: ['puff', 'shake'] };

  function climbedOut() {
    S.at = S.prev;
    setMode('idle');
    S.faceAt = time() + 0.1;
    world.burst(above(player.root.position, 0.7), 'drops');
    for (const name of AFTER_SPLASH[player.kind]) {
      if (name === 'shake' && calm()) continue;
      const length = player.react(name);
      if (name === 'bubble') later(length, () => Sfx.play('pop'));
    }
    afterMove();
  }

  function win(n) {
    S.at = n;
    S.endCol = n.c;
    setMode('won');
    const stars = S.splashes === 0 ? 3 : S.splashes === 1 ? 2 : 1;
    S.lastStars = stars;
    S.stars[S.pond.id] = Math.max(S.stars[S.pond.id] || 0, stars);
    Sfx.play('win');
    world.showRings([]);
    world.showFocus(null);
    if (!calm()) later(0.4, () => world.burst(above(player.root.position, 1.5), 'confetti'));
    tell(`You made it across! ${S.pond.title} cleared.`, 'good');
  }

  function showWon() {
    S.wonShown = true;
    const n = S.lastStars;
    $('wonStars').textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
    $('wonStars').setAttribute('aria-label', `${n} star${n > 1 ? 's' : ''}`);
    $('wonSub').textContent = S.splashes === 0
      ? 'Not a single splash!'
      : `${S.splashes} splash${S.splashes > 1 ? 'es' : ''} on the way.`;
    won.hidden = false;
    $('wonNext').focus({ preventScroll: true });
  }
  $('wonNext').addEventListener('click', () => {
    if (S.pondIndex < Ponds.LIST.length - 1) play(S.pondIndex + 1);
    else showMenu();
  });
  $('wonAgain').addEventListener('click', () => play(S.pondIndex));
  $('wonAll').addEventListener('click', showMenu);

  /* --------------------------------------------------- every frame */
  function tickPlay(t, dt) {
    runTimers();
    const P = player.root.position;
    let lift = 0;
    player.sy = null;
    player.earX = 0;
    switch (S.mode) {
      case 'idle': {
        P.copy(world.nodeTop(S.at));
        if (t > S.faceAt) {
          lookAtPointer(player, dt, -0.24);          // chin up: the camera looks down on them
          S.yawTarget = player.look.yaw * 0.8;
        }
        if (t - S.nudgeAt < 0.5) player.look.yaw = 0.5 * Math.sin((t - S.nudgeAt) * 30);
        const h = hopCurve(t - S.popAt, 0.35);
        if (h) {
          P.y += h.y;
          lift = h.y;
          player.sy = h.sy;
        }
        if (S.pendingSwap) {
          const k = S.pendingSwap;
          S.pendingSwap = null;
          swap(k);
        }
        break;
      }
      case 'hop': {
        const to = world.nodeTop(S.hop.to);
        const h = hopCurve(t - S.modeAt, player.hop);
        if (!h || h.phase === 'land') {
          P.copy(to);
          arrive(S.hop.to);
          break;
        }
        P.lerpVectors(S.hop.from, to, h.phase === 'air' ? h.p : 0);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        player.earX = h.phase === 'air' ? -0.5 * (1 - h.p) + 0.15 * h.p : 0;
        player.look.yaw *= 0.8;
        player.look.pitch *= 0.8;
        break;
      }
      case 'wobble': {
        const k = t - S.modeAt;
        world.wobbleStone(S.bad.r, S.bad.c, 0.16 * Math.sin(k * 26) * Math.min(1, k * 4));
        P.copy(world.nodeTop(S.bad));
        player.look.yaw = 0.35 * Math.sin(k * 18);
        if (k > 0.5) setMode('sink');
        break;
      }
      case 'sink': {
        const k = t - S.modeAt;
        world.wobbleStone(S.bad.r, S.bad.c, 0);
        world.sinkStone(S.bad.r, S.bad.c, Math.min(1, k / 0.5));
        P.copy(world.nodeTop(S.bad));
        P.y -= Math.min(1, k / 0.45) * 0.4;
        player.sy = 1 + 0.1 * Math.sin(k * 30);
        if (!S.splashed && P.y < 0.15) splash();
        if (k > 0.62) {
          S.sunk[S.bad.r][S.bad.c] = true;
          player.root.visible = false;
          setMode('under');
        }
        break;
      }
      case 'under': {
        if (t - S.modeAt > 0.35) {
          const w = world.waterAt(S.bad.r, S.bad.c);
          player.root.visible = true;
          if (player.kind === 'frog') {           // Pip likes the water: a happy swim first
            S.from = w;
            setMode('swim');
          } else {
            S.from = w.setY(-0.5);
            setMode('climb');
          }
        }
        break;
      }
      case 'swim': {
        const k = (t - S.modeAt) / 1.4;
        const a = Math.min(k, 1) * TAU;
        P.set(S.from.x + Math.sin(a) * 0.55, -0.32 + 0.04 * Math.sin(t * 9), S.from.z + 0.55 - Math.cos(a) * 0.55);
        S.yawTarget = a + Math.PI / 2;
        if (t - S.rippleAt > 0.3) {
          S.rippleAt = t;
          world.ripple(P.x, P.z, 0.3);
        }
        if (k >= 1) {
          S.from = P.clone();
          setMode('climb');
        }
        break;
      }
      case 'climb': {
        const to = world.nodeTop(S.prev);
        const h = hopCurve(t - S.modeAt, 1.0, 0.5);
        if (!h) {
          P.copy(to);
          S.landAt = t;
          climbedOut();
          break;
        }
        P.lerpVectors(S.from, to, h.phase === 'air' ? h.p : h.phase === 'crouch' ? 0 : 1);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        const d = to.clone().sub(S.from);
        S.yawTarget = Math.atan2(d.x, d.z);
        break;
      }
      case 'won': {
        const k = t - S.modeAt;
        P.copy(world.endTop(S.endCol));
        const h = hopCurve(k % 0.9, 0.7);
        if (h) {
          P.y += h.y;
          lift = h.y;
          player.sy = h.sy;
        }
        S.yawTarget = !calm() && k > 0.3 ? ((k % 0.9) / 0.9) * TAU : 0;
        friends.forEach((f, i) => { if (t - f.hopAt > 0.9) f.hopAt = t + i * 0.12; });
        if (k > 0.6 && !S.wonShown) showWon();
        break;
      }
    }
    // the landing jelly wobble carries on after the hop hands over
    if (player.sy == null && t - S.landAt < 0.5) {
      const p = (t - S.landAt) / 0.5;
      player.sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);
    }
    player.turn.rotation.y = turnToward(player.turn.rotation.y, S.yawTarget, 1 - Math.exp(-14 * dt));
    player.update(t, dt);
    const ground = P.y - lift;
    const dry = player.root.visible && S.mode !== 'swim' && !(S.mode === 'sink' && S.splashed) && ground > 0;
    world.shadow(P.x, ground, P.z, lift, dry);

    friends.forEach((f) => {
      const h = hopCurve(t - f.hopAt, 0.45);
      f.root.position.y = f.spot.y + (h ? h.y : 0);
      f.sy = h ? h.sy : null;
      f.turn.rotation.y = S.mode === 'won' && h && h.phase === 'air' && !calm() ? h.p * TAU : 0;
      f.update(t, dt);
    });
    world.framePond(P.z, dt, false);
  }

  /* ----------------------------------------------- switch critters */
  ORDER.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'who-opt';
    b.setAttribute('aria-label', fullName(k));
    b.innerHTML = `<span aria-hidden="true">${KINDS[k].emoji}</span><span class="who-name" aria-hidden="true">${KINDS[k].name}</span>`;
    b.addEventListener('click', () => {
      closePop();
      whoBtn.focus({ preventScroll: true });
      requestSwap(k);
    });
    whoPop.appendChild(b);
  });

  function updateWho() {
    whoBtn.innerHTML = `<span aria-hidden="true">${KINDS[S.kind].emoji}</span>`;
    whoBtn.setAttribute('aria-label', `Switch critter. Now playing: ${fullName(S.kind)}`);
    [...whoPop.children].forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === S.kind)));
  }
  function openPop() {
    whoPop.hidden = false;
    whoBtn.setAttribute('aria-expanded', 'true');
    (whoPop.querySelector('[aria-pressed="true"]') || whoPop.firstElementChild).focus({ preventScroll: true });
  }
  function closePop() {
    if (whoPop.hidden) return;
    whoPop.hidden = true;
    whoBtn.setAttribute('aria-expanded', 'false');
  }
  whoBtn.addEventListener('click', () => (whoPop.hidden ? openPop() : closePop()));

  function requestSwap(k) {
    if (k === S.kind) return;
    if (S.mode === 'idle' || S.mode === 'won') swap(k);
    else S.pendingSwap = k;            // mid-hop: swap as soon as it lands
  }

  function swap(k) {
    S.kind = k;
    updateWho();
    const pos = player.root.position.clone();
    placePlayer(pos, player.turn.rotation.y);
    makeFriends();
    world.burst(above(pos, 0.8), 'poof');
    Sfx.play('poof');
    later(0.15, () => Sfx.play('voice', KINDS[k].voice));
    S.popAt = time();
    tell(`Hi, I'm ${KINDS[k].name}! Let's keep hopping.`);
    // keep the picking screen in step with the new choice
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
  }

  /* ------------------------------------------------- hint and menu */
  hintBtn.addEventListener('click', () => {
    const show = hintText.hidden;
    hintText.hidden = !show;
    hintBtn.setAttribute('aria-pressed', String(show));
    if (show) srFocus.textContent = 'Hint: ' + S.pond.hint;
  });
  $('menuBtn').addEventListener('click', showMenu);

  /* ------------------------------------------------------- keyboard */
  const WHERE = {
    '1,-1': 'ahead on the left', '1,0': 'straight ahead', '1,1': 'ahead on the right',
    '0,-1': 'on the left', '0,1': 'on the right',
    '-1,-1': 'behind on the left', '-1,0': 'behind', '-1,1': 'behind on the right',
  };
  function describe(n) {
    if (n.type === 'end') return 'The far bank, where your friends are waiting';
    const spoken = S.pond.rows[n.r][n.c].label.replace('+', ' plus ');
    if (S.at.type === 'start') return `${spoken}, stone ${n.c + 1} of ${COLS} in the first row`;
    return `${spoken}, ${WHERE[(n.r - S.at.r) + ',' + (n.c - S.at.c)]}`;
  }
  function announceFocus() {
    if (S.focus) srFocus.textContent = describe(S.focus);
  }

  // straight ahead if there is a stone there; from the bank, the middle
  function defaultFocus(opts) {
    if (!opts.length) return null;
    if (S.at.type === 'start') return opts.reduce((best, o) => (Math.abs(o.c - 1.5) < Math.abs(best.c - 1.5) ? o : best));
    const ahead = opts.find((o) => o.type === 'stone' && o.r === S.at.r + 1 && o.c === S.at.c);
    return ahead || opts.find((o) => o.type === 'end') || opts.reduce((best, o) => (o.r > best.r ? o : best));
  }

  /* Move the highlight one step in a direction, skipping the critter's own
   * stone and any gaps; the far bank counts as a row of its own. */
  function moveFocus(dr, dc) {
    const opts = options(S.at);
    if (!opts.length) return;
    if (!S.focus || !opts.some((o) => same(o, S.focus))) S.focus = defaultFocus(opts);
    const at = (n) => (n.type === 'end' ? [ROWS, S.at.c] : [n.r, n.c]);
    let [r, c] = at(S.focus);
    for (let step = 0; step < 3; step++) {
      r += dr;
      c += dc;
      const hit = opts.find((o) => {
        const [orow, ocol] = at(o);
        return orow === r && (o.type === 'end' || ocol === c);
      });
      if (hit) {
        S.focus = hit;
        break;
      }
    }
    world.showFocus(S.focus);
    announceFocus();
  }

  const KEYS = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  pondInput.addEventListener('keydown', (e) => {
    if (S.screen !== 'play') return;
    const dir = KEYS[e.key];
    if (dir) {
      e.preventDefault();
      if (S.mode !== 'idle') return;
      if (!S.keys) {                    // the first press shows where the highlight is
        S.keys = true;
        if (!S.focus) S.focus = defaultFocus(options(S.at));
        world.showFocus(S.focus);
        announceFocus();
        return;
      }
      moveFocus(dir[0], dir[1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      S.keys = true;
      if (S.mode === 'idle' && S.focus) go(S.focus);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!whoPop.hidden) {
        e.preventDefault();
        closePop();
        whoBtn.focus({ preventScroll: true });
      } else if (!won.hidden) {
        e.preventDefault();
        showMenu();
      }
      return;
    }
    if (e.key === 'Tab' && !won.hidden) {          // keep focus inside the dialog
      const btns = [...won.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? btns.length - 1 : 1) + btns.length) % btns.length].focus();
    }
  });

  /* -------------------------------------------------------- pointer */
  function giggle() {
    S.popAt = time();
    Sfx.play('voice', KINDS[S.kind].voice);
  }

  pondInput.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play') return;
    closePop();
    if (S.keys) {
      S.keys = false;
      world.showFocus(null);
    }
    if (S.mode !== 'idle') return;
    if (world.hits(e.clientX, e.clientY, player.root)) {
      giggle();
      return;
    }
    const hit = world.pick(e.clientX, e.clientY, 0.34);
    if (!hit) return;
    const opts = options(S.at);
    const end = opts.find((o) => o.type === 'end');
    if (end && hit.z < world.rowZ(ROWS - 1) - 0.9) {
      go(end);
      return;
    }
    // the nearest stone to the tap counts: small fingers are forgiven
    let best = null;
    let bestD = 0.95;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = world.stoneTop(r, c);
        const d = Math.hypot(p.x - hit.x, p.z - hit.z);
        if (d < bestD) {
          bestD = d;
          best = { type: 'stone', r, c };
        }
      }
    }
    if (!best || same(best, S.at)) return;
    if (S.sunk[best.r][best.c]) {
      tell('That stone has sunk. Pick another one!', 'oops');
      return;
    }
    if (opts.some((o) => same(o, best))) {
      go(best);
      return;
    }
    tell(`Too far! ${KINDS[S.kind].name} can only hop to a stone touching this one.`, 'oops');
    S.nudgeAt = time();
  });

  /* ----------------------------------------------------------- loop */
  let raf = 0;
  let running = false;
  let last = 0;
  function loop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    const t = time();
    const dt = Math.min(Math.max(t - last, 0), 0.05);
    last = t;
    world.update(t, dt);
    if (S.screen === 'pick') tickPick(t, dt);
    else if (S.screen === 'play') tickPlay(t, dt);
    world.render();
    if (running) loop();
  }
  function start() {
    running = true;
    if (!document.hidden) {
      last = time();
      loop();
    }
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (running) {
      last = time();
      loop();
    }
  });

  function fit() {
    world.resize();
    stage.classList.toggle('tall', stage.clientWidth < stage.clientHeight * 0.8);
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();
  fonts();
  showPick();
})();
```

- [ ] **Step 4: Run the end-to-end player**

Run: `node $SP/tools/e2e.cjs http://127.0.0.1:47123/games/stepping-stones/ $SP/shots`
Expected: `E2E PASS (run)`. Then open each screenshot in `$SP/shots/run-*.png` and check that:
- the picker shows four critters on pads;
- the menu shows three groups and the "Start here" badge;
- the pond shows its rule, the critter facing the camera and glowing rings;
- the splash message reads correctly;
- the dialog shows the right stars.

- [ ] **Step 5: Run the unit tests**

Run: `node --test docs/tests/*.test.js`
Expected: PASS, 24 tests, with the coverage test now including `game.js`.

- [ ] **Step 6: Commit**

```bash
git add games/stepping-stones/index.html games/stepping-stones/game.js
git commit -m "feat(stepping-stones): the playable game: pick a critter, pick a pond, hop, splash, celebrate"
```

---

### Task 6: Site wiring and final verification

**Files:**
- Modify: `docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json`
- Regenerate: `games/index.html`, `for-teachers.html`, `404.html`, `sw.js`

- [ ] **Step 1: Add the catalogue entry** after `one-line-draw` in `docs/catalogue.js`:

<!-- edit: docs/catalogue.js -->
```js
    { slug: 'stepping-stones', name: 'Stepping Stones', emoji: '🐸', age: '7', mins: '10',
      skills: ['numbers', 'logic'],
      practises: 'Odd and even, times tables 2–10 and number bonds to 10, 20 and 100, by hopping only on stones that fit the rule and planning a route across the pond. A wrong stone explains itself before you try again.' },
```

- [ ] **Step 2: Add the homepage card** at the end of the 7+ grid in `index.html`, after the Code the Robot card:

<!-- edit: index.html -->
```html
          <a class="game-card" href="games/stepping-stones/index.html">
            <span class="game-icon" aria-hidden="true">🐸</span>
            <span class="game-card-name">Stepping Stones</span>
            <span class="game-card-age">7+</span>
          </a>
```

Also in `index.html` change `Seriously fun learning. 29 hand-built games.` to `Seriously fun learning. 30 hand-built games.`, and in `manifest.json` change `"29 free educational games` to `"30 free educational games`.

- [ ] **Step 3: Add the sitemap entry** after the `code-the-robot` entry in `sitemap.xml`:

<!-- edit: sitemap.xml -->
```xml
  <url>
    <loc>https://playitmyway.com/games/stepping-stones/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 4: Regenerate the generated pages**

Run: `node docs/build-pages.js`
Expected output includes `games/index.html  — 30 games across 5 bands` and `sw.js — precaching N files` (N = previous count + 8).
Check: `grep -c "stepping-stones" sw.js` prints 8 (the page plus 7 scripts), and `grep -o "All Games — 30" games/index.html` matches.

- [ ] **Step 5: Final verification**
  1. `node --test docs/tests/*.test.js` passes.
  2. `node $SP/tools/e2e.cjs http://127.0.0.1:47123/games/stepping-stones/ $SP/shots final` prints `E2E PASS (final)`.
  3. Run `node $SP/tools/shot.cjs file:///C:/Users/shrik/playitmyway-web/games/stepping-stones/index.html $SP/shots/file.png 2500 1100 860`. Expected: no page errors, and the picker renders over `file://`. The only failed request is the absolute `/manifest.json`, which every page has over `file://`.
  4. Take phone (390 × 844) and desktop (1280 × 900) screenshots of the picker and a pond with `shot.cjs` and inspect them.
  5. Run `git diff --stat main` and check that only the expected files changed.

- [ ] **Step 6: Commit**

```bash
git add docs/catalogue.js index.html sitemap.xml manifest.json games/index.html for-teachers.html 404.html sw.js
git commit -m "feat: Stepping Stones joins the catalogue, homepage, sitemap and offline cache"
```
