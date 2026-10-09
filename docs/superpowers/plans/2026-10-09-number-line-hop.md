# Number Line Hop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Number Line Hop (ages 5+): a critter hops along a 3D number line of lily pads to show adding and taking away within 10 and 20. On the way, move the 3D engine, critters and sounds into a kit every 3D game shares.

**Architecture:** Classic scripts loaded in order. The shared kit `games/shared/3d/` provides `THREE`, `Toon`, `Critters` and `Sfx`. `games/number-line-hop/` adds `Lines` (pure problem logic, also a Node module for tests), `World` (the 3D line, pads, arcs and cameras) and `game.js` (screens, stages, the flat number line and input). Problem logic is tested in Node. The page is tested by a keyboard-only headless player that reads the screen-reader text.

**Tech Stack:** Three.js r186 (vendored IIFE, MIT), plain HTML/CSS/JS, Web Audio, `node:test`, puppeteer-core with the installed Chrome (scratchpad tooling only).

**Spec:** `docs/superpowers/specs/2026-10-09-number-line-hop-design.md`

## Global Constraints

- Static site: nothing stored (no cookies or web storage), zero third-party requests, works offline and over `file://`.
- Classic scripts only, all loaded with relative paths.
- Every sound returns early when `window.pimwMuted` is set; Sfx in the kit already does this.
- 5+ band chrome: amber `#b45309`, tint `#fef3c7`, deep tint `#d8c897`, theme colour `#b45309`.
- No names of other games or brands in code, comments or commits.
- Branch `number-line-hop`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Release (Task 6) pushes `main` with `git -c credential.https://github.com/.username=viks120 push origin main`. Never run another git network command while a push is waiting.
- Message wording is exactly the spec's table; the minus sign is `−` (U+2212).

## File structure

| File | Responsibility |
|---|---|
| `games/shared/3d/three.min.js`, `toon.js`, `critters.js`, `sound.js` (moved from `games/stepping-stones/`) | The shared 3D kit |
| `games/stepping-stones/index.html` (modify) | Load the kit from `../shared/3d/` |
| `docs/vendor/build-three.js`, `docs/vendor/three-entry.js` (modify) | Build into the kit folder |
| `docs/tests/shared-3d.test.js` (new) | Kit tests: licence, THREE coverage across every game, critters build |
| `docs/tests/stepping-stones.test.js` (modify) | Pond tests only; the kit tests move out |
| `games/number-line-hop/lines.js` (new) | Ponds, problems, hop choices, messages, stars |
| `docs/tests/number-line-hop.test.js` (new) | Problem and message tests |
| `games/number-line-hop/world.js` (new) | 3D world |
| `games/number-line-hop/game.js` (new) | The game |
| `games/number-line-hop/index.html` (new) | The page |
| `docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json` (modify) | Site wiring |
| `games/index.html`, `for-teachers.html`, `404.html`, `sw.js` (regenerate) | `node docs/build-pages.js` |

Scratchpad only: `tools/nlh-e2e.cjs` (new), plus the existing `tools/e2e.cjs` (Stepping Stones), `tools/shot.cjs`, `tools/preview-server.cjs` and `drafts/harness-line.html` (new).
`SP` = `C:/Users/shrik/AppData/Local/Temp/claude/c--Users-shrik-playitmyway-web/dc31ac27-f660-4f19-a863-0449cae27b09/scratchpad`. The preview server serves the repo on port 47123 (`/screen/<name>` serves `$SP/drafts/<name>`).

---

### Task 1: The shared 3D kit

**Files:** move the four kit files; modify `games/stepping-stones/index.html`, `docs/vendor/build-three.js` and `docs/vendor/three-entry.js`; create `docs/tests/shared-3d.test.js`; modify `docs/tests/stepping-stones.test.js`; regenerate `sw.js` and friends.

**Interfaces:**
- Produces: the kit at `games/shared/3d/`, which a game loads with `<script src="../shared/3d/three.min.js">` and the like, giving `THREE`, `Toon`, `Critters` and `Sfx` exactly as before.

- [ ] **Step 1: Write the kit tests (they fail: the kit folder does not exist yet)**

<!-- file: docs/tests/shared-3d.test.js -->
```js
/* Tests for the shared 3D kit in games/shared/3d. Zero dependencies:
 *     node --test docs/tests/*.test.js
 * They load the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAMES = path.join(__dirname, '..', '..', 'games');
const KIT = path.join(GAMES, 'shared', '3d');

/* Load the trimmed Three.js bundle the way a browser would: as a classic
 * script whose top-level `var THREE` lands on the global object. */
function loadKit(files) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['three.min.js'].concat(files || [])) {
    vm.runInContext(fs.readFileSync(path.join(KIT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function scripts(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scripts(p));
    else if (entry.name.endsWith('.js') && entry.name !== 'three.min.js') out.push(p);
  }
  return out;
}

test('three.min.js carries the full MIT licence text', () => {
  const head = fs.readFileSync(path.join(KIT, 'three.min.js'), 'utf8').slice(0, 2000);
  assert.match(head, /The MIT License/);
  assert.match(head, /Copyright © 2010-\d{4} three\.js authors/);
  assert.match(head, /Permission is hereby granted, free of charge/);
  assert.match(head, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test('every THREE name any game script uses is in the trimmed bundle', () => {
  const exported = new Set(Object.keys(loadKit().THREE));
  const used = new Set();
  for (const file of scripts(GAMES)) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bTHREE\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 20, 'expected the 3D games to use THREE');
  const missing = [...used].filter((name) => !exported.has(name)).sort();
  assert.deepEqual(missing, [], 'add these to docs/vendor/three-entry.js, then run node docs/vendor/build-three.js');
});

test('the four critters build, react and animate without a browser', () => {
  const { Critters } = loadKit(['toon.js', 'critters.js']);
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

test('no page loads the kit from anywhere but games/shared/3d', () => {
  for (const game of ['stepping-stones', 'number-line-hop']) {
    const page = path.join(GAMES, game, 'index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    for (const f of ['three.min.js', 'toon.js', 'critters.js', 'sound.js']) {
      assert.ok(html.includes(`<script src="../shared/3d/${f}"></script>`), `${game} must load ../shared/3d/${f}`);
    }
  }
});
```

- [ ] **Step 2: Trim the Stepping Stones test file back to its pond tests**

The kit tests now live in `shared-3d.test.js`. Cut everything from the bundle loader onward, and drop the two `require`s only those tests used:

```bash
node -e "
const fs = require('fs'); const f = 'docs/tests/stepping-stones.test.js';
let s = fs.readFileSync(f, 'utf8');
const cut = s.indexOf('/* Load the trimmed Three.js bundle');
if (cut < 0) throw new Error('marker not found');
s = s.slice(0, cut).trimEnd() + '\n';
s = s.replace(/const fs = require\('fs'\);\r?\n/, '').replace(/const vm = require\('vm'\);\r?\n/, '');
fs.writeFileSync(f, s);
console.log('stepping-stones.test.js now has pond tests only');
"
```

Run: `node --test docs/tests/*.test.js`
Expected: the 21 pond tests pass, and `shared-3d.test.js` fails with `ENOENT … games\shared\3d\three.min.js`.

- [ ] **Step 3: Move the kit and point everything at it**

```bash
mkdir -p games/shared/3d
for f in three.min.js toon.js critters.js sound.js; do git mv games/stepping-stones/$f games/shared/3d/$f; done
node -e "
const fs = require('fs'); const f = 'games/stepping-stones/index.html';
let s = fs.readFileSync(f, 'utf8');
for (const n of ['three.min.js', 'toon.js', 'critters.js', 'sound.js']) {
  const from = '<script src=\"' + n + '\"></script>';
  if (!s.includes(from)) throw new Error('missing ' + from);
  s = s.replace(from, '<script src=\"../shared/3d/' + n + '\"></script>');
}
fs.writeFileSync(f, s);
console.log('stepping-stones/index.html loads the kit');
"
```

In `docs/vendor/build-three.js`, change the output path and the banner wording:

<!-- edit: docs/vendor/build-three.js -->
```js
const OUT = path.join(__dirname, '..', '..', 'games', 'shared', '3d', 'three.min.js');
```

and in its banner, replace the lines

```js
  ` * three.js r${THREE_VERSION.split('.')[1]} (https://threejs.org), trimmed to the parts Stepping`,
  ' * Stones uses; the list is docs/vendor/three-entry.js in this site\'s repository.',
```

with

```js
  ` * three.js r${THREE_VERSION.split('.')[1]} (https://threejs.org), trimmed to the parts the site's`,
  ' * 3D games use; the list is docs/vendor/three-entry.js in this site\'s repository.',
```

In `docs/vendor/three-entry.js`, replace the first two comment lines' "Stepping Stones uses" wording so the comment opens:

<!-- edit: docs/vendor/three-entry.js -->
```js
/* The parts of Three.js that the site's 3D games use.
 *
 * docs/vendor/build-three.js bundles this list into
 * games/shared/3d/three.min.js: one minified classic script that
```

- [ ] **Step 4: Rebuild the bundle, regenerate the site files, run the tests**

Run: `node docs/vendor/build-three.js`
Expected: `three.min.js: 566 KB on disk, 119 KB with brotli`

Run: `node docs/build-pages.js && grep -c "shared/3d" sw.js`
Expected: `sw.js — precaching 55 files` and `4`.

Run: `node --test docs/tests/*.test.js`
Expected: all pass. That is 21 pond tests plus 4 kit tests: licence, coverage, critters, and kit paths.

- [ ] **Step 5: Prove Stepping Stones still plays**

Run: `SET_ASIDE= node $SP/tools/e2e.cjs http://127.0.0.1:47123/games/stepping-stones/ $SP/shots kit`
Expected: `E2E PASS (kit)`

- [ ] **Step 6: Commit**

```bash
git add -A games/shared games/stepping-stones docs/vendor docs/tests sw.js games/index.html for-teachers.html 404.html
git commit -m "refactor: one shared 3D kit for every 3D game"
```

---

### Task 2: Problems and messages

**Files:**
- Create: `games/number-line-hop/lines.js`
- Test: `docs/tests/number-line-hop.test.js`

**Interfaces:**
- Produces:
  - `Lines.LIST`: `[{id, title, max, start}]` in menu order, with `start` true for `add-10`.
  - `Lines.GROUPS`: `[{title, ids}]`.
  - `Lines.generate(id, seed)` returns `{id, title, max, problems}`. `problems` is a list of 9 items, each `{op: '+'|'-', start, jump, end, crosses, stage: 'count'|'guess'|'gap'}`.
  - `Lines.choices(id, problem)` returns the hop counts offered in stage 3, `[1..k]`.
  - `Lines.stars(misses)` returns 1, 2 or 3.
  - `Lines.say`:
    - `equation(p, hide?)`, where `hide` is `'end'` or `'jump'`
    - `prompt(p, name, friend)`
    - `counting(p, hops)` and `counted(p)`
    - `guessing(n)`, `guessRight(p)` and `guessWrong(p, guess, name)`
    - `gapRight(p)`, `gapShort(p, tried, name, friend)`, `gapFar(p, tried, friend)` and `gapShow(p)`
    - `line(max, name, at, friend?, friendAt?)` and `doneSub(misses)`
  - `Lines.rng(seed)`.

- [ ] **Step 1: Write the failing tests**

<!-- file: docs/tests/number-line-hop.test.js -->
```js
/* Number Line Hop tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/number-line-hop/lines.js and check every pond
 * against the spec's rules, restated here without looking at lines.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Lines = require(path.join(__dirname, '..', '..', 'games', 'number-line-hop', 'lines.js'));
const SEEDS = 2000;

const SPEC = {
  'add-10': { max: 10, ops: ['+'], jumps: [1, 5] },
  'sub-10': { max: 10, ops: ['-'], jumps: [1, 5] },
  'add-20': { max: 20, ops: ['+'], jumps: [2, 9], crossing: 5 },
  'sub-20': { max: 20, ops: ['-'], jumps: [2, 9], crossing: 5 },
  'mix-20': { max: 20, ops: ['+', '-'], jumps: [1, 9], eachOp: 3 },
};
const STAGES = ['count', 'count', 'count', 'guess', 'guess', 'guess', 'gap', 'gap', 'gap'];
const crossesTen = (p) => (p.op === '+' ? p.start < 10 && p.end > 10 : p.start > 10 && p.end < 10);

test('five ponds in menu order, in two groups, with Add to 10 as the start', () => {
  assert.deepEqual(Lines.LIST.map((p) => p.id), Object.keys(SPEC));
  assert.deepEqual(Lines.LIST.map((p) => p.title), ['Add to 10', 'Take away from 10', 'Add to 20', 'Take away from 20', 'Mix it up']);
  assert.deepEqual(Lines.LIST.filter((p) => p.start).map((p) => p.id), ['add-10']);
  assert.deepEqual(Lines.GROUPS.map((g) => g.ids).flat(), Object.keys(SPEC));
});

for (const [id, s] of Object.entries(SPEC)) {
  test(`${id}: ${SEEDS} ponds keep every promise`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const pond = Lines.generate(id, seed);
      const where = `${id} seed ${seed}`;
      assert.equal(pond.id, id, where);
      assert.equal(pond.max, s.max, where);
      assert.deepEqual(pond.problems.map((p) => p.stage), STAGES, where);
      const seen = new Set();
      let crossing = 0;
      const ops = { '+': 0, '-': 0 };
      for (const p of pond.problems) {
        const what = `${where}: ${p.start} ${p.op} ${p.jump}`;
        assert.ok(s.ops.includes(p.op), what);
        assert.equal(p.end, p.op === '+' ? p.start + p.jump : p.start - p.jump, what);
        assert.ok(p.start >= 0 && p.start <= s.max && p.end >= 0 && p.end <= s.max, `${what} leaves the line`);
        assert.ok(p.jump >= s.jumps[0] && p.jump <= s.jumps[1], `${what} jump out of range`);
        if (p.op === '+') assert.ok(p.start >= 1, `${what} adds from 0`);
        if (p.stage === 'gap') assert.ok(p.jump >= 2, `${what} is a one-hop gap`);
        assert.equal(p.crosses, crossesTen(p), what);
        const key = p.op + p.start + ':' + p.jump;
        assert.ok(!seen.has(key), `${what} repeats`);
        seen.add(key);
        if (crossesTen(p)) crossing++;
        ops[p.op]++;
        const choices = Lines.choices(id, p);
        assert.deepEqual(choices, choices.map((_, i) => i + 1), `${what} choices not 1..k`);
        assert.ok(choices.includes(p.jump), `${what} choices miss the answer`);
        for (const c of choices) {
          const at = p.op === '+' ? p.start + c : p.start - c;
          assert.ok(at >= 0 && at <= s.max, `${what} choice ${c} hops off the line`);
        }
        assert.ok(choices.length <= s.jumps[1], what);
      }
      if (s.crossing) assert.ok(crossing >= s.crossing, `${where}: only ${crossing} cross ten`);
      if (s.eachOp) for (const op of s.ops) assert.ok(ops[op] >= s.eachOp, `${where}: only ${ops[op]} of ${op}`);
    }
  });
}

test('the same seed always builds the same pond, and different seeds vary', () => {
  assert.deepEqual(Lines.generate('add-20', 42), Lines.generate('add-20', 42));
  const firsts = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const p = Lines.generate('add-20', seed).problems[0];
    firsts.add(p.start + '+' + p.jump);
  }
  assert.ok(firsts.size > 40, `only ${firsts.size} different first problems in 100 ponds`);
});

test('every message uses the exact wording from the spec', () => {
  const add = { op: '+', start: 4, jump: 3, end: 7, stage: 'count' };
  const sub = { op: '-', start: 9, jump: 4, end: 5, stage: 'count' };
  const S = Lines.say;
  assert.equal(S.prompt(add, 'Plum', 'Mango'), 'Plum is on 4. Hop 3 more!');
  assert.equal(S.prompt(sub, 'Plum', 'Mango'), 'Plum is on 9. Hop 4 back!');
  assert.equal(S.counted(add), 'You counted on: 5, 6, 7!');
  assert.equal(S.counted(sub), 'You counted back: 8, 7, 6, 5!');
  assert.equal(S.counting(add, 1), '5…');
  assert.equal(S.counting(add, 3), '5… 6… 7!');
  assert.equal(S.prompt({ ...add, stage: 'guess' }, 'Plum', 'Mango'), 'Where will Plum land? Tap that pad.');
  assert.equal(S.guessing(8), "You think 8. Let's hop and see!");
  assert.equal(S.guessRight(add), 'Yes! You guessed 7.');
  assert.equal(S.guessWrong(add, 8, 'Plum'), 'Plum landed on 7, not 8. Count the hops: 5, 6, 7.');
  assert.equal(S.guessWrong(sub, 6, 'Plum'), 'Plum landed on 5, not 6. Count the hops: 8, 7, 6, 5.');
  assert.equal(S.prompt({ ...add, stage: 'gap' }, 'Plum', 'Mango'), 'Mango is on 7. How many hops?');
  assert.equal(S.prompt({ ...sub, stage: 'gap' }, 'Plum', 'Mango'), 'Mango is on 5. How many hops back?');
  assert.equal(S.gapRight(add), '3 hops! 4 + 3 = 7');
  assert.equal(S.gapRight(sub), '4 hops! 9 − 4 = 5');
  assert.equal(S.gapShort(add, 2, 'Plum', 'Mango'), 'Plum landed on 6. Mango is 1 more hop away! Try again.');
  assert.equal(S.gapShort(sub, 2, 'Plum', 'Mango'), 'Plum landed on 7. Mango is 2 more hops away! Try again.');
  assert.equal(S.gapFar(add, 4, 'Mango'), 'Too far! 4 + 4 = 8, past Mango. Try again.');
  assert.equal(S.gapFar(sub, 6, 'Mango'), 'Too far! 9 − 6 = 3, past Mango. Try again.');
  assert.equal(S.gapShow(add), "Let's count together: 5, 6, 7. That's 3 hops! 4 + 3 = 7");
  assert.equal(S.gapShow(sub), "Let's count together: 8, 7, 6, 5. That's 4 hops! 9 − 4 = 5");
  assert.equal(S.equation(add, 'end'), '4 + 3 = ?');
  assert.equal(S.equation(add, 'jump'), '4 + ? = 7');
  assert.equal(S.equation(sub), '9 − 4 = 5');
  assert.equal(S.line(10, 'Plum', 7, 'Mango', 9), 'Number line from 0 to 10. Plum is on 7. Mango is on 9.');
  assert.equal(S.line(20, 'Pip', 3), 'Number line from 0 to 20. Pip is on 3.');
  assert.equal(S.doneSub(0), 'Every answer right first time!');
  assert.equal(S.doneSub(2), '4 of 6 right first time.');
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(Lines.stars), [3, 3, 2, 2, 1, 1]);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test docs/tests/*.test.js`
Expected: `number-line-hop.test.js` fails with `Cannot find module …lines.js`; the rest pass.

- [ ] **Step 3: Write `lines.js`**

<!-- file: games/number-line-hop/lines.js -->
```js
/* Number Line Hop: the ponds, their problems and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Lines; in Node it
 * is a CommonJS module.
 */
(function (root) {
  'use strict';

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

  function shuffle(rand, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  const LIST = [
    { id: 'add-10', title: 'Add to 10', max: 10, ops: ['+'], jumps: [1, 5], start: true },
    { id: 'sub-10', title: 'Take away from 10', max: 10, ops: ['-'], jumps: [1, 5] },
    { id: 'add-20', title: 'Add to 20', max: 20, ops: ['+'], jumps: [2, 9], crossing: 5 },
    { id: 'sub-20', title: 'Take away from 20', max: 20, ops: ['-'], jumps: [2, 9], crossing: 5 },
    { id: 'mix-20', title: 'Mix it up', max: 20, ops: ['+', '-'], jumps: [1, 9], eachOp: 3 },
  ];
  const BY_ID = Object.fromEntries(LIST.map((d) => [d.id, d]));
  const GROUPS = [
    { title: 'Within 10', ids: ['add-10', 'sub-10'] },
    { title: 'Within 20', ids: ['add-20', 'sub-20', 'mix-20'] },
  ];
  const STAGES = ['count', 'count', 'count', 'guess', 'guess', 'guess', 'gap', 'gap', 'gap'];

  // crossing ten means passing it on the way, not just landing on it
  const crossesTen = (op, start, end) => (op === '+' ? start < 10 && end > 10 : start > 10 && end < 10);

  /* Every problem a pond allows: on the line from start to end, and never
   * adding from 0, which is plain counting rather than counting on. */
  function candidates(def) {
    const out = [];
    for (const op of def.ops) {
      for (let start = 0; start <= def.max; start++) {
        for (let jump = def.jumps[0]; jump <= def.jumps[1]; jump++) {
          const end = op === '+' ? start + jump : start - jump;
          if (end < 0 || end > def.max) continue;
          if (op === '+' && start === 0) continue;
          out.push({ op, start, jump, end, crosses: crossesTen(op, start, end) });
        }
      }
    }
    return out;
  }

  /* Nine different problems: the pond's quotas first (crossing ten, or each
   * operation), then any. Stage 3 gets three with gaps of at least two hops. */
  function generate(id, seed) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    const rand = rng(seed);
    const all = candidates(def);
    for (let attempt = 0; attempt < 100; attempt++) {
      const pool = shuffle(rand, all.slice());
      const chosen = [];
      const take = (wanted, n) => {
        for (const p of pool) {
          if (n <= 0 || chosen.length >= 9) return;
          if (!chosen.includes(p) && wanted(p)) {
            chosen.push(p);
            n--;
          }
        }
      };
      if (def.crossing) take((p) => p.crosses, def.crossing);
      if (def.eachOp) for (const op of def.ops) take((p) => p.op === op, def.eachOp);
      take(() => true, 9 - chosen.length);
      const gaps = chosen.filter((p) => p.jump >= 2);
      if (chosen.length < 9 || gaps.length < 3) continue;
      const gap = shuffle(rand, gaps.slice()).slice(0, 3);
      const rest = shuffle(rand, chosen.filter((p) => !gap.includes(p)));
      return {
        id: def.id,
        title: def.title,
        max: def.max,
        problems: rest.concat(gap).map((p, i) => Object.assign({}, p, { stage: STAGES[i] })),
      };
    }
    throw new Error('Could not build pond: ' + id);
  }

  /* Stage 3's buttons: 1 up to the pond's largest jump, minus any that would
   * hop off the end of the line. */
  function choices(id, p) {
    const def = BY_ID[id];
    const room = p.op === '+' ? def.max - p.start : p.start;
    return Array.from({ length: Math.min(def.jumps[1], room) }, (_, i) => i + 1);
  }

  /* ---------------------------------------------------------------- words */
  const SIGN = { '+': '+', '-': '−' };
  const landing = (p, hops) => (p.op === '+' ? p.start + hops : p.start - hops);
  const walk = (p, hops) => Array.from({ length: hops }, (_, i) => landing(p, i + 1));
  const hopWords = (n) => (n === 1 ? '1 hop' : `${n} hops`);

  function equation(p, hide) {
    return `${p.start} ${SIGN[p.op]} ${hide === 'jump' ? '?' : p.jump} = ${hide === 'end' ? '?' : p.end}`;
  }

  const say = {
    equation,
    prompt(p, name, friend) {
      if (p.stage === 'count') return `${name} is on ${p.start}. Hop ${p.jump} ${p.op === '+' ? 'more' : 'back'}!`;
      if (p.stage === 'guess') return `Where will ${name} land? Tap that pad.`;
      return `${friend} is on ${p.end}. How many hops${p.op === '+' ? '' : ' back'}?`;
    },
    counting(p, hops) {
      return walk(p, hops).join('… ') + (hops < p.jump ? '…' : '!');
    },
    counted(p) {
      return `You counted ${p.op === '+' ? 'on' : 'back'}: ${walk(p, p.jump).join(', ')}!`;
    },
    guessing(guess) {
      return `You think ${guess}. Let's hop and see!`;
    },
    guessRight(p) {
      return `Yes! You guessed ${p.end}.`;
    },
    guessWrong(p, guess, name) {
      return `${name} landed on ${p.end}, not ${guess}. Count the hops: ${walk(p, p.jump).join(', ')}.`;
    },
    gapRight(p) {
      return `${hopWords(p.jump)}! ${equation(p)}`;
    },
    gapShort(p, tried, name, friend) {
      const at = landing(p, tried);
      const left = Math.abs(p.end - at);
      return `${name} landed on ${at}. ${friend} is ${left} more ${left === 1 ? 'hop' : 'hops'} away! Try again.`;
    },
    gapFar(p, tried, friend) {
      return `Too far! ${p.start} ${SIGN[p.op]} ${tried} = ${landing(p, tried)}, past ${friend}. Try again.`;
    },
    gapShow(p) {
      return `Let's count together: ${walk(p, p.jump).join(', ')}. That's ${hopWords(p.jump)}! ${equation(p)}`;
    },
    line(max, name, at, friend, friendAt) {
      return `Number line from 0 to ${max}. ${name} is on ${at}.` + (friend ? ` ${friend} is on ${friendAt}.` : '');
    },
    doneSub(misses) {
      return misses === 0 ? 'Every answer right first time!' : `${6 - misses} of 6 right first time.`;
    },
  };

  // misses: stage-2 wrong guesses plus stage-3 problems not right first time (six chances)
  const stars = (misses) => (misses <= 1 ? 3 : misses <= 3 ? 2 : 1);

  const api = {
    LIST: LIST.map((d) => ({ id: d.id, title: d.title, max: d.max, start: !!d.start })),
    GROUPS,
    generate,
    choices,
    say,
    stars,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lines = api;
})(this);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test docs/tests/*.test.js`
Expected: all pass, with 5 pond tests, 3 others and 1 list test for Number Line Hop.

- [ ] **Step 5: Commit**

```bash
git add games/number-line-hop/lines.js docs/tests/number-line-hop.test.js
git commit -m "feat(number-line-hop): ponds, problems and messages, tested"
```

---

### Task 3: The number-line world

**Files:**
- Create: `games/number-line-hop/world.js`
- Scratchpad: `$SP/drafts/harness-line.html`

**Interfaces:**
- Consumes: `THREE` and `Toon` from the kit.
- Produces: `World.create(canvas)` returns a world object `W`, or `null` when WebGL cannot start. `W` has:
  - `show('picker'|'line')`, `resize()`, `render()`, `update(t, dt)`;
  - `showPicker(rigs)`, `alignPicker(buttons)` (sets `rig.baseY`), `framePicker()`;
  - `buildLine(max)`, `padX(n)`, `padTop(n)` (Vector3), `bankSpot(x)` (Vector3), `camX()`, and `actors` (a Group);
  - `addArc(a, b, op)`, `clearArcs()`, `showRing(n|null)`;
  - `frameLine(focusX, halfWidth, dt, snap)`;
  - `burst(pos, 'sparkle'|'poof'|'confetti'|'drops')`, `ripple(x, z, from)`, `shadow(x, y, z, lift, visible)`;
  - `pick(clientX, clientY, planeY, rect?)`, `nearestPad(clientX, clientY)` (n or null), `hits(clientX, clientY, object)` and `toScreen(v)` (`{x, y}`).

- [ ] **Step 1: Write `world.js`**

<!-- file: games/number-line-hop/world.js -->
```js
/* Number Line Hop: the 3D world.
 *
 * Owns the renderer, the sky and water, the lily pads on the critter-picking
 * screen, and the number line itself: a row of numbered lily pads, the jump
 * arcs, the gold guessing ring, the bank where friends watch, both camera
 * framings and the effects. It draws; game.js decides. Needs THREE and Toon;
 * sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const GAP = 1.35;              // one number per pad
  const PAD_TOP = 0.06;
  const BANK_TOP = 0.31;
  const BANK_Z = -4.4;           // where the friends stand
  const ARC_Z = -0.4;            // jump arcs float just behind the line
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // a pad's number on a cream badge, in the site's own Fredoka
  function badgeMaterial(n) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff8ef';
    x.beginPath();
    x.arc(64, 64, 62, 0, TAU);
    x.fill();
    x.font = `700 ${n >= 10 ? 66 : 78}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#2b2a5e';
    x.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true });
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
    scene.fog = new THREE.Fog(SKY, 16, 40);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    const M = {
      water: Toon.flat('#93d6ec'),
      pad: Toon.toon('#8bd47e', '#5aa74f'),
      pickPad: Toon.toon('#7ccf72', '#55a650'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      petal: Toon.toon('#ffb3c9'),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      spark: Toon.flat('#ffffff'),
      arcs: {
        '+': new THREE.MeshBasicMaterial({ color: '#8b5cf6' }),
        '-': new THREE.MeshBasicMaterial({ color: '#f97362' }),
      },
      ring: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.95, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      pad: padGeometry(0.6),
      pickPad: padGeometry(1),
      lily: padGeometry(1),
      badge: new THREE.CircleGeometry(0.4, 40),
      ring: new THREE.RingGeometry(0.66, 0.82, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      bit: new THREE.SphereGeometry(1, 10, 8),
      flower: new THREE.SphereGeometry(1, 12, 8),
      shadow: new THREE.PlaneGeometry(1.2, 1.2),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      bankGrass: new THREE.BoxGeometry(84, 0.14, 6.1),
      bankDirt: new THREE.BoxGeometry(84, 0.5, 6),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(90, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const picker = new THREE.Group();
    const lineWorld = new THREE.Group();
    const line = new THREE.Group();           // rebuilt for every pond
    const arcs = new THREE.Group();
    const actors = new THREE.Group();          // the player and the friends
    lineWorld.add(line, arcs, actors);
    scene.add(picker, lineWorld);

    // the bank where the friends watch: grass over a dirt edge, reeds behind them
    const bankZ = BANK_Z + 0.8 - 3;
    const dirt = new THREE.Mesh(G.bankDirt, M.dirt);
    dirt.position.set(0, -0.06, bankZ);
    const grass = new THREE.Mesh(G.bankGrass, M.grass);
    grass.position.set(0, 0.25, bankZ);
    lineWorld.add(dirt, grass);
    const reeds = [];
    const tails = [];
    const lilies = [];
    const flowers = [];
    for (let i = 0; i < 46; i++) {
      const x = rand(-38, 38);
      const z = rand(BANK_Z - 4.5, BANK_Z - 1.2);
      const h = rand(0.7, 1.6);
      reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
      if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
    }
    for (let i = 0; i < 36; i++) {
      const x = rand(-34, 34);
      const z = Math.random() < 0.5 ? rand(1.4, 3.4) : rand(-3.0, -1.4);
      const s = rand(0.3, 0.6);
      lilies.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
      if (Math.random() < 0.3) flowers.push({ x, y: 0.09, z, sx: 0.11, sy: 0.08, sz: 0.11 });
    }
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    lineWorld.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails), lilyMesh);
    if (flowers.length) lineWorld.add(instanced(G.flower, M.petal, flowers));

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 50;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-30, 30), z: rand(-3, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const ring = new THREE.Mesh(G.ring, M.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    lineWorld.add(ring);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    lineWorld.add(shadow);

    let max = 10;
    let pads = [];
    let ringN = null;
    let camX = 0;
    const bits = [];
    const ripples = [];
    const pickerPads = [];
    let pickerRigs = [];
    const badges = [];
    const badgeFor = (n) => badges[n] || (badges[n] = badgeMaterial(n));
    const padX = (n) => (n - max / 2) * GAP;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const W = { renderer, scene, camera, actors, padX };

    W.show = (which) => {
      picker.visible = which === 'picker';
      lineWorld.visible = which === 'line';
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
    W.nearestPad = (clientX, clientY) => {
      const hit = W.pick(clientX, clientY, PAD_TOP);
      if (!hit || Math.abs(hit.z) > 0.9) return null;
      const n = Math.round(hit.x / GAP + max / 2);
      if (n < 0 || n > max || Math.abs(hit.x - padX(n)) > 0.75) return null;
      return n;
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
          const pad = new THREE.Mesh(G.pickPad, M.pickPad);
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
        const y = b.top + b.height * 0.74;
        const mid = W.pick(b.left + b.width / 2, y, 0, rect);
        const left = W.pick(b.left + b.width * 0.1, y, 0, rect);
        const right = W.pick(b.right - b.width * 0.1, y, 0, rect);
        if (!mid || !left || !right) return;
        const s = clamp(left.distanceTo(right) / 2.4, 0.4, 2.0);
        pad.position.set(mid.x, 0, mid.z);
        pad.scale.setScalar(s * 1.05);
        rig.root.position.x = mid.x;
        rig.root.position.z = mid.z;
        rig.root.scale.setScalar(s * 1.15);
        rig.baseY = 0.05 * s * 1.05;
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

    /* ----------------------------------------------------------- the line */
    W.buildLine = (top) => {
      line.clear();
      max = top;
      pads = [];
      for (let n = 0; n <= max; n++) {
        const g = new THREE.Group();
        g.position.set(padX(n), 0, 0);
        const pad = new THREE.Mesh(G.pad, M.pad);
        pad.rotation.y = Math.PI / 2 + (n % 3) * 0.4;
        const badge = new THREE.Mesh(G.badge, badgeFor(n));
        badge.rotation.x = -Math.PI / 2;
        badge.position.y = PAD_TOP + 0.005;
        g.add(pad, badge);
        Toon.addOutlines(g);
        line.add(g);
        pads.push({ g, ph: rand(0, TAU) });
      }
      W.clearArcs();
      W.showRing(null);
    };

    W.padTop = (n) => {
      const p = pads[n];
      return new THREE.Vector3(padX(n), PAD_TOP + (p ? p.g.position.y : 0), 0);
    };
    W.bankSpot = (x) => new THREE.Vector3(x, BANK_TOP, BANK_Z);
    W.camX = () => camX;

    W.addArc = (a, b, op) => {
      const x0 = padX(a);
      const x1 = padX(b);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x0, 0.3, ARC_Z),
        new THREE.Vector3((x0 + x1) / 2, 1.2, ARC_Z),
        new THREE.Vector3(x1, 0.3, ARC_Z),
      ]);
      arcs.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.028, 8, false), M.arcs[op]));
    };
    W.clearArcs = () => {
      arcs.children.forEach((m) => m.geometry.dispose());
      arcs.clear();
    };
    W.showRing = (n) => {
      ringN = n;
      ring.visible = n != null;
    };

    /* Camera for the line. It follows the critter, showing about five pads
     * on a tall screen and seven on a wide one, or wider when the game asks
     * (to keep a friend or a guess in view), and stops at the line's ends. */
    W.frameLine = (focusX, halfWidth, dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.36 / a) * 180) / Math.PI, 38, 62);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const hHalf = Math.tan((vfov * Math.PI) / 360) * a;
      const want = Math.max(halfWidth, a > 1.2 ? 4.6 : 2.7);
      const half = (padX(max) - padX(0)) / 2;
      const inset = Math.min(want - 1.2, half);
      const aimX = clamp(focusX, padX(0) + inset, padX(max) - inset);
      camX = snap ? aimX : camX + (aimX - camX) * (1 - Math.exp(-3 * dt));
      const L = clamp(want / hHalf, 6, 22);
      const pitch = 0.6;
      camera.position.set(camX, 0.35 + L * Math.sin(pitch), L * Math.cos(pitch));
      camera.lookAt(camX, 0.35, -0.6);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 10, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.05, life: 0.6 },
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

      pads.forEach((p) => { p.g.position.y = 0.02 * Math.sin(t * 1.3 + p.ph); });
      if (ringN != null) {
        ring.position.set(padX(ringN), 0.04, 0);
        ring.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
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

- [ ] **Step 2: Look at a line**

Write `$SP/drafts/harness-line.html` (scratchpad only):

<!-- scratch: harness-line.html -->
```html
<!doctype html>
<meta charset="utf-8">
<title>line</title>
<link rel="stylesheet" href="/tokens.css">
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style>
<canvas id="c"></canvas>
<script src="/games/shared/3d/three.min.js"></script>
<script src="/games/shared/3d/toon.js"></script>
<script src="/games/shared/3d/critters.js"></script>
<script src="/games/number-line-hop/world.js"></script>
<script>
  document.fonts.load('700 100px Fredoka').then(() => {
    const w = World.create(document.getElementById('c'));
    w.resize();
    w.show('line');
    const max = +(location.hash.slice(1) || 10);
    w.buildLine(max);
    const rig = Critters.create('dino');
    rig.root.scale.setScalar(0.72);
    w.actors.add(rig.root);
    const friend = Critters.create('kitten');
    friend.root.scale.setScalar(0.72);
    w.actors.add(friend.root);
    w.addArc(4, 5, '+'); w.addArc(5, 6, '+'); w.addArc(6, 7, '+');
    w.showRing(9);
    (function frame(ms) {
      const t = (ms || 0) / 1000;
      w.update(t, 0.016);
      rig.root.position.copy(w.padTop(7));
      rig.look.pitch = -0.2;
      rig.update(t, 0.016);
      friend.root.position.copy(w.bankSpot(w.camX() + 2.2));
      friend.update(t, 0.016);
      w.frameLine(w.padX(7), 0, 0.016, true);
      w.render();
      requestAnimationFrame(frame);
    })();
  });
</script>
```

Run: `node $SP/tools/shot.cjs "http://127.0.0.1:47123/screen/harness-line.html#10" $SP/shots/nlh-t3-phone.png 1500 390 700` and `node $SP/tools/shot.cjs "http://127.0.0.1:47123/screen/harness-line.html#20" $SP/shots/nlh-t3-desktop.png 1500 1100 640`
Expected: no console errors. Plum stands on pad 7 with three violet arcs behind it, the gold ring is on pad 9, Mango is on the bank, and the badges are readable in Fredoka on both line lengths.

- [ ] **Step 3: Run the tests**

Run: `node --test docs/tests/*.test.js`
Expected: all pass. The coverage test now also checks `world.js`.

- [ ] **Step 4: Commit**

```bash
git add games/number-line-hop/world.js
git commit -m "feat(number-line-hop): the 3D number line: pads, arcs, bank and camera"
```

---

### Task 4: The page and the game

**Files:**
- Create: `games/number-line-hop/index.html`, `games/number-line-hop/game.js`
- Scratchpad: `$SP/tools/nlh-e2e.cjs`

**Interfaces:**
- Consumes: the kit, `Lines` and `World` as above. DOM ids used by `game.js`: `stage`, `view`, `lineInput`, `screenPick`, `pickGrid`, `pickGo`, `screenMenu`, `menuGroups`, `changeCritter`, `hud`, `whoBtn`, `whoPop`, `menuBtn`, `chip`, `sum`, `tell`, `strip`, `actions`, `float`, `srFocus`, `won`, `wonStars`, `wonSub`, `wonNext`, `wonAgain`, `wonAll`, `noGl`.
- Contracts the e2e player relies on:
  - `#chip` reads "`<stage title>` · `<k>` of 3", with stage titles "Hop and count", "Where will you land?" and "How far to your friend?".
  - `#sum` holds the equation (`4 + 3 = ?`, `4 + ? = 7`, `9 − 4 = 5`).
  - `#tell` holds the messages (polite live region).
  - `#srFocus` reads `Pad <n>` for the stage-2 ring.
  - The Hop button has class `hop-btn`, the number buttons `num-btn`, and Next `next-btn`.
  - The first arrow press in stage 2 shows the ring on the start pad; later presses move it.
  - Number keys 1–9 press stage-3 buttons.

- [ ] **Step 1: Write the end-to-end player (scratchpad)**

<!-- scratch: nlh-e2e.cjs -->
```js
// Keyboard-only end-to-end check of Number Line Hop in headless Chrome.
//   node nlh-e2e.cjs <pageUrl> <shotsDir> [tag]
// Env: CALM=1 emulates reduced motion; SET_ASIDE=<url prefix> reports, rather
// than fails, requests the host injects (the live site's analytics beacon).
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert/strict');
const Lines = require('C:/Users/shrik/playitmyway-web/games/number-line-hop/lines.js');

const [url, shots, tag = 'nlh'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseSum(text) {
  const m = /^(\d+) ([+−]) (\d+|\?) = (\d+|\?)$/.exec(text.trim());
  if (!m) throw new Error('cannot parse sum: ' + JSON.stringify(text));
  const op = m[2] === '+' ? '+' : '-';
  const start = +m[1];
  let jump = m[3] === '?' ? null : +m[3];
  let end = m[4] === '?' ? null : +m[4];
  if (end == null) end = op === '+' ? start + jump : start - jump;
  if (jump == null) jump = Math.abs(end - start);
  return { op, start, jump, end };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  if (process.env.CALM) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const origin = new URL(url).origin;
  const problems = [];
  const foreign = [];
  const injected = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(origin) || u.startsWith('data:')) return;
    if (process.env.SET_ASIDE && u.startsWith(process.env.SET_ASIDE)) injected.push(u);
    else foreign.push(u);
  });

  const text = (sel) => page.$eval(sel, (e) => e.textContent);
  const shot = (name) => page.screenshot({ path: path.join(shots, `${tag}-${name}.png`) });
  async function until(fn, ms, what) {
    const t0 = Date.now();
    for (;;) {
      if (await fn()) return;
      if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what + ' (tell: ' + (await text('#tell')) + ')');
      await sleep(80);
    }
  }
  const tellIs = (want) => async () => (await text('#tell')) === want;
  const nextReady = () => until(() => page.$eval('#actions', (a) => !!a.querySelector('.next-btn')), 20000, 'the Next button');
  const lineMax = async () => +/from 0 to (\d+)/.exec(await page.$eval('#strip', (s) => s.getAttribute('aria-label')))[1];

  // play the current problem by keyboard; wrong makes one deliberate mistake
  async function playProblem(name, wrong) {
    const chip = await text('#chip');
    const p = parseSum(await text('#sum'));
    if (chip.startsWith('Hop and count')) {
      await page.focus('.hop-btn');
      for (let i = 1; i <= p.jump; i++) {
        await page.keyboard.press('Enter');
        await until(tellIs(i < p.jump ? Lines.say.counting(p, i) : Lines.say.counted(p)), 8000, `hop ${i}`);
      }
    } else if (chip.startsWith('Where will you land')) {
      const max = await lineMax();
      const target = wrong ? (p.end + 1 <= max ? p.end + 1 : p.end - 1) : p.end;
      await page.focus('#lineInput');
      await page.keyboard.press('ArrowRight');           // the first press shows the ring on the start pad
      assert.equal(await text('#srFocus'), `Pad ${p.start}`);
      const key = target > p.start ? 'ArrowRight' : 'ArrowLeft';
      for (let i = 0; i < Math.abs(target - p.start); i++) await page.keyboard.press(key);
      assert.equal(await text('#srFocus'), `Pad ${target}`);
      await page.keyboard.press('Enter');
      await until(tellIs(target === p.end ? Lines.say.guessRight(p) : Lines.say.guessWrong(p, target, name)), 15000, 'the guess result');
    } else {
      const friend = (await text('#tell')).split(' ')[0];
      const buttonsReady = () => until(() => page.$$eval('.num-btn', (bs) => bs.length > 0 && bs.every((b) => !b.disabled)), 15000, 'the number buttons');
      if (wrong) {
        const offered = await page.$$eval('.num-btn', (bs) => bs.map((b) => +b.textContent));
        const misses = [p.jump - 1, p.jump + 1].filter((n) => n >= 1 && offered.includes(n));
        for (const n of [misses[0], misses[1] ?? misses[0]]) {
          await buttonsReady();
          await page.keyboard.press(String(n));
          await until(tellIs(n < p.jump ? Lines.say.gapShort(p, n, name, friend) : Lines.say.gapFar(p, n, friend)), 15000, 'the try-again message');
        }
        await until(tellIs(Lines.say.gapShow(p)), 25000, 'the critter showing the way');
      } else {
        await buttonsReady();
        await page.keyboard.press(String(p.jump));
        await until(tellIs(Lines.say.gapRight(p)), 15000, 'the right-answer message');
      }
    }
    await nextReady();
    await page.focus('.next-btn');
    await page.keyboard.press('Enter');
  }

  async function playPond(name, wrongAt) {
    for (let i = 0; i < 9; i++) {
      await until(async () => (await text('#chip')).endsWith(`${(i % 3) + 1} of 3`), 8000, `problem ${i + 1}`);
      await playProblem(name, wrongAt.includes(i));
      if (i === 0 || i === 3 || i === 6) await shot(`problem-${i + 1}`);
    }
    await until(() => page.$eval('#won', (e) => !e.hidden), 8000, 'the pond-done dialog');
  }

  await page.goto(url, { waitUntil: 'load' });
  await sleep(1500);
  await shot('1-pick');
  await page.click('.pick-btn[aria-label="Plum the Baby Dino"]');
  await sleep(300);
  await page.click('#pickGo');
  await until(() => page.$eval('#screenMenu', (e) => !e.hidden), 3000, 'the pond menu');
  await shot('2-menu');
  for (const b of await page.$$('.pond-btn')) {
    if ((await b.$eval('.pond-title', (e) => e.textContent)) === 'Add to 10') { await b.click(); break; }
  }
  await until(() => page.$eval('#hud', (e) => !e.hidden), 5000, 'the pond');
  await sleep(600);

  // Add to 10: one wrong guess (problem 4) and one stage-3 problem missed twice (problem 7)
  await playPond('Plum', [3, 6]);
  await shot('3-done');
  assert.equal(await text('#wonStars'), '★★☆');
  assert.equal(await text('#wonSub'), '4 of 6 right first time.');

  // next pond, switch critter, then a perfect pond
  await page.click('#wonNext');
  await until(async () => (await text('#sum')).includes('−') && (await text('#chip')).startsWith('Hop and count'), 6000, 'Take away from 10');
  await page.click('#whoBtn');
  await page.click('.who-opt[aria-label="Pip the Frog"]');
  await until(tellIs("Hi, I'm Pip! Let's keep hopping."), 4000, 'the swap');
  assert.match(await page.$eval('#whoBtn', (e) => e.getAttribute('aria-label')), /Pip the Frog/);
  await playPond('Pip', []);
  assert.equal(await text('#wonStars'), '★★★');
  assert.equal(await text('#wonSub'), 'Every answer right first time!');

  // the menu remembers this visit's stars, in memory only
  await page.click('#wonAll');
  await until(() => page.$eval('#screenMenu', (e) => !e.hidden), 3000, 'the menu again');
  const labels = await page.$$eval('.pond-btn', (bs) => bs.map((b) => b.getAttribute('aria-label')));
  assert.ok(labels.includes('Add to 10, start here, 2 stars this visit'), labels.join(' | '));
  assert.ok(labels.includes('Take away from 10, 3 stars this visit'), labels.join(' | '));

  const stored = await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]);
  assert.deepEqual(stored, [0, 0, '']);
  assert.deepEqual(foreign, [], 'third-party requests');
  assert.deepEqual(problems, [], 'console or page errors');
  if (injected.length) console.log('set aside (host-injected): ' + [...new Set(injected.map((u) => new URL(u).host))].join(', '));
  console.log('E2E PASS (' + tag + ')');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
```

Run: `node $SP/tools/nlh-e2e.cjs http://127.0.0.1:47123/games/number-line-hop/ $SP/shots`
Expected: `E2E FAIL: …` (there is no page yet).

- [ ] **Step 2: Write `index.html`**

<!-- file: games/number-line-hop/index.html -->
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="only light" />
    <meta name="darkreader-lock" />
    <meta name="theme-color" content="#b45309" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- SEO Meta Tags -->
    <title>Number Line Hop – Free 3D Adding Game | Play It My Way</title>
    <meta name="description" content="Hop a cute critter along a 3D number line to add and take away within 10 and 20: count on, count back, cross ten. Ages 5+. No ads." />
    <meta name="keywords" content="number line game for kids, adding and subtracting game, counting on game, 3d maths game for kids, free maths game ages 5+" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Number Line Hop – Free 3D Adding Game for Kids" />
    <meta property="og:description" content="Hop along a 3D number line of lily pads to add and take away within 10 and 20. Five ponds for ages 5+. No ads, no download!" />
    <meta property="og:type" content="game" />
    <meta property="og:url" content="https://playitmyway.com/games/number-line-hop/" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Number Line Hop – Free 3D Adding Game for Kids" />
    <meta name="twitter:description" content="Add and take away by hopping along a 3D number line of lily pads. Ages 5+. No ads, no download!" />

    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="canonical" href="https://playitmyway.com/games/number-line-hop/" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="../../tokens.css" />
    <link rel="stylesheet" href="../../components.css" />
    <style>
      :root {
        --band: var(--color-amber);
        --band-tint: var(--color-amber-tint);
        --band-tint-deep: #d8c897;
        --band-deep: #7c2d12;
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
        height: clamp(460px, 76vh, 680px);
        border-radius: 18px; overflow: hidden;
        background: #dff4ff; color: var(--deep);
        user-select: none; -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      html.pimw-fs .stage { height: calc(100vh - 96px); height: calc(100dvh - 96px); }
      .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .line-input { position: absolute; inset: 0; touch-action: none; cursor: pointer; border-radius: 18px; }
      .line-input:focus { outline: none; }
      .line-input:focus-visible { box-shadow: inset 0 0 0 4px var(--color-focus); }

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
      .go-btn, .hop-btn, .next-btn {
        border: 0; border-radius: var(--radius-pill); background: var(--band); color: #fff;
        font-size: 18px; font-weight: 600; padding: 12px 26px; min-height: 48px; cursor: pointer;
        box-shadow: 0 5px 0 var(--band-deep);
      }
      .go-btn:active, .hop-btn:active, .next-btn:active { transform: translateY(4px); box-shadow: 0 1px 0 var(--band-deep); }
      .go-btn:disabled { background: #d9a877; box-shadow: 0 5px 0 #b98a5c; cursor: default; transform: none; }
      .hop-btn { font-size: 24px; font-weight: 700; padding: 13px 40px; }

      .screen.menu { background: var(--color-bg); overflow-y: auto; align-items: stretch; padding: 16px; gap: 4px; }
      .menu-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .menu-head h2 { margin: 0; font-size: 26px; }
      .chip-btn {
        border: 0; border-radius: var(--radius-pill); background: var(--band-tint); color: var(--band);
        font-weight: 600; font-size: 16px; padding: 10px 16px; min-height: 44px; cursor: pointer;
        box-shadow: 0 3px 0 var(--band-tint-deep);
      }
      .pond-family h3 { margin: 14px 0 8px; font-size: 18px; color: var(--ink-soft); }
      .pond-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
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

      /* the problem card and the action bar while playing */
      .hud { position: absolute; inset: 0; pointer-events: none; }
      .card {
        position: absolute; top: 10px; left: 10px; right: 10px; pointer-events: auto;
        background: #fff; border-radius: 18px; padding: 6px 8px 2px; text-align: center;
        box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .card-row { display: flex; align-items: center; gap: 6px; }
      .card-mid { flex: 1; min-width: 0; }
      .chip { margin: 0; font-size: 13px; font-weight: 600; color: var(--band); }
      .sum { margin: 0; font-size: 30px; font-weight: 700; line-height: 1.15; letter-spacing: 1px; }
      .tell { margin: 2px 0 0; font-size: 15px; font-weight: 600; color: var(--ink-soft); line-height: 1.3; min-height: 1.3em; }
      .tell.good { color: #15803d; }
      .tell.oops { color: #b4361f; }
      .strip { display: block; width: 100%; height: 50px; }
      .strip text { font-family: inherit; }
      .strip.pickable { cursor: pointer; }
      .hud-btn {
        flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0;
        background: var(--band-tint); font-size: 22px; line-height: 1; cursor: pointer;
        display: grid; place-items: center; box-shadow: 0 3px 0 var(--band-tint-deep);
      }
      .hud-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--band-tint-deep); }
      .who-pop {
        pointer-events: auto; position: absolute; top: 70px; left: 10px; display: flex; gap: 6px; z-index: 2;
        background: #fff; padding: 8px; border-radius: 18px; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
      }
      .who-opt {
        width: 64px; border: 3px solid transparent; border-radius: 14px; background: var(--band-tint);
        cursor: pointer; display: flex; flex-direction: column; align-items: center;
        padding: 6px 2px 4px; font-size: 26px; color: var(--deep);
      }
      .who-opt[aria-pressed="true"] { border-color: var(--band); }
      .who-name { font-size: 12px; font-weight: 600; }
      /* right: 64px keeps the buttons clear of the site's floating sound button */
      .actions {
        position: absolute; left: 10px; right: 64px; bottom: 12px; pointer-events: auto;
        display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .num-btn {
        width: 50px; height: 50px; border: 0; border-radius: 16px; background: #fff; color: var(--deep);
        font-size: 22px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .num-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--band-tint-deep); }
      .num-btn:disabled { opacity: 0.5; cursor: default; transform: none; }
      .float {
        position: absolute; transform: translate(-50%, -50%); pointer-events: none;
        font-size: 18px; font-weight: 700; color: var(--deep); background: rgba(255, 255, 255, 0.94);
        border-radius: var(--radius-pill); padding: 1px 10px; box-shadow: 0 2px 0 var(--band-tint-deep);
      }

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
        .sum { font-size: 26px; }
        .tell { font-size: 14px; }
        .num-btn { width: 44px; height: 44px; font-size: 20px; }
        .pick-name { font-size: 16px; }
      }
    </style>
  </head>
  <body>
    <a class="back-link" href="../../">← Back to Games</a>

    <header class="game-head">
      <h1>🐾 Number Line Hop</h1>
      <p>Hop along the number line to add and take away.</p>
    </header>

    <main class="stage-card">
      <div class="stage" id="stage">
        <canvas id="view" aria-hidden="true"></canvas>
        <div class="line-input" id="lineInput" tabindex="0" role="application"
             aria-label="The number line. Left and right arrows choose a pad, Enter guesses." hidden></div>

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
          <div class="card">
            <div class="card-row">
              <button type="button" class="hud-btn" id="whoBtn" aria-haspopup="true" aria-expanded="false"
                      aria-controls="whoPop" aria-label="Switch critter"></button>
              <div class="card-mid">
                <p class="chip" id="chip"></p>
                <p class="sum" id="sum"></p>
              </div>
              <button type="button" class="hud-btn" id="menuBtn" aria-label="All ponds"><span aria-hidden="true">🗺️</span></button>
            </div>
            <p class="tell" id="tell" aria-live="polite"></p>
            <svg class="strip" id="strip" role="img" viewBox="0 0 340 50"></svg>
          </div>
          <div class="who-pop" id="whoPop" role="group" aria-label="Switch critter" hidden></div>
          <div class="actions" id="actions"></div>
        </div>
        <div class="float" id="float" aria-hidden="true" hidden></div>

        <div class="won" id="won" hidden>
          <div class="won-card" role="dialog" aria-modal="true" aria-labelledby="wonTitle">
            <h2 id="wonTitle">Pond done!</h2>
            <p class="won-stars" id="wonStars" role="img"></p>
            <p class="won-sub" id="wonSub"></p>
            <div class="won-btns">
              <button type="button" class="go-btn" id="wonNext">Next pond →</button>
              <button type="button" class="soft-btn" id="wonAgain">Same pond again</button>
              <button type="button" class="soft-btn" id="wonAll">All ponds</button>
            </div>
          </div>
        </div>

        <div class="nogl" id="noGl" hidden>
          <p class="nogl-emoji" aria-hidden="true">🐾</p>
          <h2>This game needs 3D graphics</h2>
          <p>This browser or device has 3D graphics switched off. Try one of these instead:</p>
          <p><a href="../balloon-pop/">🎈 Balloon Pop</a><a href="../sort-it-out/">🧺 Sort It Out</a></p>
        </div>
      </div>
      <p class="visually-hidden" id="srFocus" aria-live="polite"></p>
    </main>

    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li>Pick your critter: Clover the Bunny, Pip the Frog, Plum the Baby Dino or Mango the Kitten.</li>
        <li>Pick a pond: adding or taking away, within 10 or within 20, or a mix of both.</li>
        <li><strong>Hop and count:</strong> press <strong>Hop!</strong> once for every hop and watch the answer appear as you count on, or back.</li>
        <li><strong>Where will you land?</strong> Tap the pad you think your critter will land on, then watch it hop to check.</li>
        <li><strong>How far to your friend?</strong> A friend waits on a pad. Pick how many hops it takes to reach them.</li>
      </ol>
      <p>On a keyboard: <kbd>Enter</kbd> hops, <kbd>←</kbd> <kbd>→</kbd> and <kbd>Enter</kbd> choose a pad, and the number keys pick how many hops. Tap the face button to switch critters at any time. Nothing is saved, so stars reset when you leave.</p>
      <h3>What it practises</h3>
      <p>Adding and taking away within 10 and 20 on a number line: counting on, counting back and crossing ten, the step many children find hardest. Every hop draws a +1 or −1 arc, just like a number line drawn in class, so the sum and the picture match.</p>
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

    <script src="../shared/3d/three.min.js"></script>
    <script src="../shared/3d/toon.js"></script>
    <script src="../shared/3d/critters.js"></script>
    <script src="../shared/3d/sound.js"></script>
    <script src="lines.js"></script>
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

<!-- file: games/number-line-hop/game.js -->
```js
/* Number Line Hop: the game itself.
 *
 * Screens (pick a critter, pick a pond, play), the three stages, the flat
 * number line, input by tap and keyboard, and the hop choreography. Needs
 * THREE, Toon, Critters, Sfx, Lines and World, loaded before it. Nothing is
 * stored: stars live in this page's memory only.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Lines.say;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const fullName = (k) => `${KINDS[k].name} the ${KINDS[k].kind}`;
  const dirOf = (p) => (p.op === '+' ? 1 : -1);
  const CRITTER_SIZE = 0.72;
  const STAGE_TITLE = { count: 'Hop and count', guess: 'Where will you land?', gap: 'How far to your friend?' };

  function turnToward(from, to, k) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return from + d * k;
  }

  const stage = $('stage');
  const canvas = $('view');
  const lineInput = $('lineInput');
  const hud = $('hud');
  const chip = $('chip');
  const sumEl = $('sum');
  const tellEl = $('tell');
  const strip = $('strip');
  const actions = $('actions');
  const floatEl = $('float');
  const srFocus = $('srFocus');
  const whoBtn = $('whoBtn');
  const whoPop = $('whoPop');
  const won = $('won');
  const pickGrid = $('pickGrid');
  const pickGo = $('pickGo');
  const menuGroups = $('menuGroups');
  const screens = { pick: $('screenPick'), menu: $('screenMenu') };

  function noGl() {
    ['screenPick', 'screenMenu', 'hud', 'lineInput', 'won'].forEach((id) => { $(id).hidden = true; });
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
  const S = {
    screen: 'pick',
    kind: null,
    pondIndex: 0,
    pond: null,
    qi: 0,
    p: null,
    pos: 0,
    mode: 'wait',          // 'wait' for the child, or 'hop' while the critter moves
    dir: 1,
    queue: 0,
    from: 0,
    to: 0,
    hopAt: -1,
    onDone: null,
    arcsOn: true,          // off while hopping home after a miss
    count: 0,              // counted hops in this attempt
    jumps: [],             // [from, to] of each counted hop, for the flat line
    tries: 0,
    tried: 0,
    misses: 0,
    guess: null,
    cursor: 0,
    keys: false,
    finished: false,
    landAt: -9,
    popAt: -9,
    cheerAt: -9,
    floatAt: -9,
    floatN: 0,
    stars: Object.create(null),     // best stars per pond, this visit only
    pointer: null,
    pendingSwap: null,
    timers: [],
  };
  let player = null;
  let friends = [];
  let pickRigs = [];

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
    tellEl.textContent = text;
    tellEl.className = 'tell' + (mood ? ' ' + mood : '');
  }
  const me = () => KINDS[S.kind].name;
  const friendOnPad = () => friends.find((f) => f.onPad != null) || null;
  const friendName = () => {
    const f = friendOnPad();
    return f ? KINDS[f.kind].name : '';
  };

  function showScreen(name) {
    S.screen = name;
    screens.pick.hidden = name !== 'pick';
    screens.menu.hidden = name !== 'menu';
    hud.hidden = name !== 'play';
    lineInput.hidden = name !== 'play';
    floatEl.hidden = true;
    won.hidden = true;
    closePop();
    world.show(name === 'play' ? 'line' : 'picker');
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
    for (const group of Lines.GROUPS) {
      const sec = document.createElement('section');
      sec.className = 'pond-family';
      const h = document.createElement('h3');
      h.textContent = group.title;
      const grid = document.createElement('div');
      grid.className = 'pond-grid';
      for (const id of group.ids) {
        const i = Lines.LIST.findIndex((p) => p.id === id);
        const p = Lines.LIST[i];
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
      }
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

  // the pad numbers are painted in Fredoka, so wait for it (briefly)
  function play(index) {
    fonts().then(() => begin(index));
  }

  function begin(index) {
    S.pondIndex = index;
    S.pond = Lines.generate(Lines.LIST[index].id, Math.floor(Math.random() * 2147483647));
    S.qi = 0;
    S.misses = 0;
    S.finished = false;
    S.timers = [];
    S.pendingSwap = null;
    S.mode = 'wait';
    S.hopAt = -1;
    world.buildLine(S.pond.max);
    S.pos = S.pond.problems[0].start;
    placePlayer(world.padTop(S.pos), 0);
    makeFriends();
    showScreen('play');
    startProblem(true);
  }

  function placePlayer(pos, yaw) {
    if (player) {
      world.actors.remove(player.root);
      player.dispose();
    }
    player = Critters.create(S.kind);
    player.root.scale.setScalar(CRITTER_SIZE);
    player.root.position.copy(pos);
    player.turn.rotation.y = yaw;
    world.actors.add(player.root);
  }

  // the other three watch from the bank, and hop along it to keep up
  function makeFriends() {
    friends.forEach((f) => {
      world.actors.remove(f.rig.root);
      f.rig.dispose();
    });
    friends = ORDER.filter((k) => k !== S.kind).map((kind, i) => {
      const rig = Critters.create(kind);
      rig.root.scale.setScalar(CRITTER_SIZE);
      world.actors.add(rig.root);
      return { kind, rig, x: world.camX() + (i - 1) * 2.2, onPad: null, hopAt: -9, walkAt: -1, walkFrom: 0, walkTo: 0 };
    });
  }

  function startProblem(first) {
    const p = (S.p = S.pond.problems[S.qi]);
    world.clearArcs();
    world.showRing(null);
    Object.assign(S, { jumps: [], count: 0, tries: 0, tried: 0, guess: null, cursor: p.start, keys: false, mode: 'wait', arcsOn: true });
    if (!first) world.burst(above(world.padTop(S.pos), 0.6), 'poof');
    S.pos = p.start;
    S.popAt = time();
    friends.forEach((f) => { f.onPad = null; });
    if (p.stage === 'gap') {
      const f = friends[S.qi % friends.length];
      f.onPad = p.end;
      world.burst(above(world.padTop(p.end), 0.8), 'poof');
      Sfx.play('poof');
    }
    chip.textContent = `${STAGE_TITLE[p.stage]} · ${(S.qi % 3) + 1} of 3`;
    sumEl.textContent = say.equation(p, p.stage === 'gap' ? 'jump' : 'end');
    srFocus.textContent = sumEl.textContent;
    tell(say.prompt(p, me(), friendName()));
    strip.classList.toggle('pickable', p.stage === 'guess');
    drawStrip();
    world.frameLine(focusX(), spanX(), 0, first);
    if (p.stage === 'count') setActions('hop');
    else if (p.stage === 'guess') {
      setActions(null);
      lineInput.focus({ preventScroll: true });
    } else setActions('gap');
  }

  function button(cls, label, onClick, aria) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function setActions(kind) {
    actions.textContent = '';
    if (kind === 'hop') {
      const b = button('hop-btn', 'Hop!', () => {
        // hops already counted, queued, or in the air: never more than the problem asks for
        const pending = S.count + S.queue + (S.hopAt >= 0 ? 1 : 0);
        if (pending >= S.p.jump) return;
        if (S.mode === 'wait') hop(dirOf(S.p), 1, afterCountHop);
        else if (S.onDone === afterCountHop) S.queue++;     // a quick tap mid-hop is queued, not lost
      });
      actions.append(b);
      b.focus({ preventScroll: true });
    } else if (kind === 'gap') {
      for (const n of Lines.choices(S.pond.id, S.p)) {
        actions.append(button('num-btn', String(n), () => chooseHops(n), n === 1 ? '1 hop' : `${n} hops`));
      }
      actions.firstElementChild.focus({ preventScroll: true });
    } else if (kind === 'next') {
      const last = S.qi === S.pond.problems.length - 1;
      const b = button('next-btn', last ? 'Finish ✓' : 'Next →', nextProblem);
      actions.append(b);
      b.focus({ preventScroll: true });
    }
  }

  /* ---------------------------------------------------------- hopping */
  function hop(dir, times, done) {
    S.mode = 'hop';
    S.dir = dir;
    S.queue = times;
    S.onDone = done;
    nextHop();
  }

  function nextHop() {
    // never off the end of the line
    if (S.queue <= 0 || S.pos + S.dir < 0 || S.pos + S.dir > S.pond.max) {
      S.queue = 0;
      S.mode = 'wait';
      const done = S.onDone;
      S.onDone = null;
      if (done) done();
      return;
    }
    S.queue--;
    S.from = S.pos;
    S.to = S.pos + S.dir;
    S.hopAt = time();
    Sfx.play('hop');
  }

  function landed() {
    S.pos = S.to;
    S.landAt = time();
    world.ripple(world.padX(S.pos), 0, 0.62);
    if (S.arcsOn) {
      S.count++;
      S.jumps.push([S.from, S.to]);
      world.addArc(S.from, S.to, S.dir > 0 ? '+' : '-');
      // a note per hop: climbing when adding, falling when taking away
      Sfx.play('good', S.dir > 0 ? Math.min(S.count - 1, 8) : Math.max(8 - S.count, 0));
      S.floatN = S.pos;
      S.floatAt = time();
      tell(say.counting(S.p, S.count));
    }
    drawStrip();
    later(0.16, nextHop);
  }

  function cheer() {
    Sfx.play('good', 8);
    world.burst(above(player.root.position, 1.2), 'sparkle');
    friends.forEach((f, i) => { f.hopAt = time() + 0.05 + i * 0.09; });
    S.cheerAt = time();
  }

  function resultRight(text) {
    sumEl.textContent = say.equation(S.p);
    tell(text, 'good');
    cheer();
    setActions('next');
  }

  /* ---------------------------------------------- stage 1: hop and count */
  function afterCountHop() {
    if (S.count < S.p.jump) return;          // more presses to come
    resultRight(say.counted(S.p));
  }

  /* ---------------------------------------- stage 2: where will you land? */
  function makeGuess(n) {
    if (!S.p || S.p.stage !== 'guess' || S.mode !== 'wait' || S.guess != null) return;
    S.guess = n;
    world.showRing(n);
    tell(say.guessing(n));
    drawStrip();
    S.mode = 'hop';                           // locked while the critter gets ready
    later(0.6, () => hop(dirOf(S.p), S.p.jump, afterGuess));
  }

  function afterGuess() {
    if (S.guess === S.p.end) {
      resultRight(say.guessRight(S.p));
      return;
    }
    S.misses++;
    sumEl.textContent = say.equation(S.p);
    tell(say.guessWrong(S.p, S.guess, me()), 'oops');
    Sfx.play('uhoh');
    setActions('next');
  }

  /* ------------------------------------ stage 3: how far to your friend? */
  function chooseHops(n) {
    if (!S.p || S.p.stage !== 'gap' || S.mode !== 'wait') return;
    actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    S.tried = n;
    hop(dirOf(S.p), n, afterGap);
  }

  function afterGap() {
    const p = S.p;
    if (S.pos === p.end) {
      resultRight(say.gapRight(p));
      return;
    }
    S.tries++;
    if (S.tries === 1) S.misses++;            // not right first time
    const short = p.op === '+' ? S.pos < p.end : S.pos > p.end;
    tell(short ? say.gapShort(p, S.tried, me(), friendName()) : say.gapFar(p, S.tried, friendName()), 'oops');
    Sfx.play('uhoh');
    later(1.5, () => goHome(() => {
      if (S.tries >= 2) showTheWay();
      else setActions('gap');
    }));
  }

  // back to the start pad without counting, ready to try again
  function goHome(then) {
    const back = S.p.start - S.pos;
    S.arcsOn = false;
    hop(Math.sign(back), Math.abs(back), () => {
      S.arcsOn = true;
      S.count = 0;
      S.jumps = [];
      world.clearArcs();
      drawStrip();
      then();
    });
  }

  function showTheWay() {
    hop(dirOf(S.p), S.p.jump, () => {
      sumEl.textContent = say.equation(S.p);
      tell(say.gapShow(S.p), 'good');
      setActions('next');
    });
  }

  function nextProblem() {
    if (S.mode !== 'wait' || S.finished) return;
    S.qi++;
    if (S.qi >= S.pond.problems.length) finish();
    else startProblem(false);
  }

  function finish() {
    S.finished = true;
    const stars = Lines.stars(S.misses);
    S.stars[S.pond.id] = Math.max(S.stars[S.pond.id] || 0, stars);
    friends.forEach((f, i) => {
      f.onPad = null;
      f.hopAt = time() + i * 0.12;
    });
    Sfx.play('win');
    if (!calm()) world.burst(above(player.root.position, 1.5), 'confetti');
    S.cheerAt = time();
    setActions(null);
    tell(`${S.pond.title}: done!`, 'good');
    drawStrip();
    $('wonStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('wonStars').setAttribute('aria-label', `${stars} star${stars > 1 ? 's' : ''}`);
    $('wonSub').textContent = say.doneSub(S.misses);
    later(0.6, () => {
      won.hidden = false;
      $('wonNext').focus({ preventScroll: true });
    });
  }
  $('wonNext').addEventListener('click', () => {
    if (S.pondIndex < Lines.LIST.length - 1) play(S.pondIndex + 1);
    else showMenu();
  });
  $('wonAgain').addEventListener('click', () => play(S.pondIndex));
  $('wonAll').addEventListener('click', showMenu);

  /* --------------------------------------------- the flat number line */
  function drawStrip() {
    const max = S.pond.max;
    const x = (n) => 14 + n * (312 / max);
    const small = max > 10;
    const ink = '#2b2a5e';
    let s = `<line x1="8" y1="30" x2="332" y2="30" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
    for (let n = 0; n <= max; n++) {
      const five = n % 5 === 0;
      s += `<line x1="${x(n)}" y1="25" x2="${x(n)}" y2="35" stroke="${ink}" stroke-width="${five ? 2.2 : 1.4}"/>`;
      s += `<text x="${x(n)}" y="47" font-size="${small ? 8.5 : 10}" text-anchor="middle" font-weight="${five || !small ? 700 : 500}" ` +
        `fill="${S.p && n === S.p.start ? '#b45309' : ink}">${n}</text>`;
    }
    for (const [a, b] of S.jumps) {
      const mid = (x(a) + x(b)) / 2;
      const up = b > a;
      s += `<path d="M ${x(a)} 28 Q ${mid} 8 ${x(b)} 28" fill="none" stroke="${up ? '#8b5cf6' : '#f97362'}" stroke-width="2.2"/>`;
      if (!small) s += `<text x="${mid}" y="14" font-size="9" text-anchor="middle" font-weight="700" fill="${up ? '#7c3aed' : '#d9462d'}">${up ? '+1' : '−1'}</text>`;
    }
    if (S.guess != null) s += `<circle cx="${x(S.guess)}" cy="30" r="8" fill="none" stroke="#ffb020" stroke-width="3"/>`;
    const f = friendOnPad();
    if (f) s += `<text x="${x(f.onPad)}" y="21" font-size="13" text-anchor="middle">${KINDS[f.kind].emoji}</text>`;
    s += `<circle cx="${x(S.pos)}" cy="30" r="6" fill="#b45309" stroke="#fff" stroke-width="2"/>`;
    strip.innerHTML = s;
    strip.setAttribute('aria-label', say.line(max, me(), S.pos, f ? KINDS[f.kind].name : null, f ? f.onPad : null));
  }

  // in stage 2 the flat line is a second way to pick a pad
  strip.addEventListener('click', (e) => {
    if (!S.p || S.p.stage !== 'guess') return;
    const r = strip.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * 340;
    makeGuess(clamp(Math.round(((sx - 14) / 312) * S.pond.max), 0, S.pond.max));
  });

  /* ----------------------------------------------------- every frame */
  // keep whatever matters in view: a friend waiting, or a guess in progress
  function focusX() {
    const x = player ? player.root.position.x : 0;
    if (!S.p) return x;
    if (S.p.stage === 'gap' && friendOnPad()) return (x + world.padX(S.p.end)) / 2;
    const mark = S.guess != null ? S.guess : S.keys ? S.cursor : null;
    if (S.p.stage === 'guess' && mark != null) return (x + world.padX(mark)) / 2;
    if (S.p.stage === 'guess') return world.padX(clamp(S.p.start + dirOf(S.p) * 3, 0, S.pond.max));
    return x;
  }
  function spanX() {
    const x = player ? player.root.position.x : 0;
    if (!S.p) return 0;
    if (S.p.stage === 'gap' && friendOnPad()) return Math.abs(x - world.padX(S.p.end)) / 2 + 1.4;
    const mark = S.guess != null ? S.guess : S.keys ? S.cursor : null;
    if (S.p.stage === 'guess' && mark != null) return Math.abs(x - world.padX(mark)) / 2 + 1.4;
    if (S.p.stage === 'guess') return 3 * 1.35 + 1.4;
    return 0;
  }

  function tickPlay(t, dt) {
    runTimers();
    const P = player.root.position;
    player.sy = null;
    player.earX = 0;
    let lift = 0;
    let yaw = 0;
    if (S.hopAt >= 0) {
      const h = hopCurve(t - S.hopAt, player.hop * 0.85);
      if (!h || h.phase === 'land') {
        S.hopAt = -1;
        P.copy(world.padTop(S.to));
        landed();
      } else {
        P.lerpVectors(world.padTop(S.from), world.padTop(S.to), h.phase === 'air' ? h.p : 0);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        player.earX = h.phase === 'air' ? -0.5 * (1 - h.p) + 0.15 * h.p : 0;
      }
      yaw = S.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      P.copy(world.padTop(S.pos));
      if (S.mode === 'hop') yaw = S.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else {
        lookAtPointer(player, dt, -0.2);
        yaw = player.look.yaw * 0.8;
      }
      const pop = hopCurve(t - S.popAt, 0.35);
      if (pop) {
        P.y += pop.y;
        lift = pop.y;
        player.sy = pop.sy;
      }
      const joy = hopCurve(t - S.cheerAt, 0.6);
      if (joy) {
        P.y += joy.y;
        lift = Math.max(lift, joy.y);
        player.sy = joy.sy;
        if (joy.phase === 'air' && !calm()) yaw = joy.p * TAU;
      }
      if (S.pendingSwap && S.mode === 'wait') {
        const k = S.pendingSwap;
        S.pendingSwap = null;
        swap(k);
      }
    }
    // the landing jelly wobble carries on after the hop hands over
    if (player.sy == null && t - S.landAt < 0.5) {
      const p = (t - S.landAt) / 0.5;
      player.sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);
    }
    player.turn.rotation.y = turnToward(player.turn.rotation.y, yaw, 1 - Math.exp(-14 * dt));
    player.update(t, dt);
    world.shadow(P.x, P.y - lift, P.z, lift, true);

    friends.forEach((f, i) => {
      let base;
      let walkY = 0;
      let face = 0;
      if (f.onPad != null) {
        // waiting on the answer pad; steps back to make room when the critter arrives
        const top = world.padTop(f.onPad);
        const room = S.pos === f.onPad && S.hopAt < 0;
        base = new THREE.Vector3(top.x + (room ? 0.55 : 0), top.y, room ? -0.7 : -0.1);
      } else {
        const target = world.camX() + (i - 1) * 2.2;
        if (f.walkAt < 0 && Math.abs(target - f.x) > 1.6) {
          f.walkFrom = f.x;
          f.walkTo = f.x + Math.sign(target - f.x) * Math.min(1.6, Math.abs(target - f.x));
          f.walkAt = t;
        }
        if (f.walkAt >= 0) {
          const w = hopCurve(t - f.walkAt, 0.3);
          if (!w) {
            f.x = f.walkTo;
            f.walkAt = -1;
          } else {
            f.x = f.walkFrom + (f.walkTo - f.walkFrom) * (w.phase === 'air' ? w.p : w.phase === 'crouch' ? 0 : 1);
            walkY = w.y;
            face = f.walkTo > f.walkFrom ? Math.PI / 2 : -Math.PI / 2;
          }
        }
        base = world.bankSpot(f.x);
      }
      const h = hopCurve(t - f.hopAt, 0.45);
      f.rig.root.position.set(base.x, base.y + walkY + (h ? h.y : 0), base.z);
      f.rig.sy = h ? h.sy : null;
      f.rig.look.pitch = -0.2;
      f.rig.turn.rotation.y = turnToward(f.rig.turn.rotation.y, face, 1 - Math.exp(-10 * dt));
      f.rig.update(t, dt);
    });

    // the counting number pops up over the critter as it lands
    const age = t - S.floatAt;
    if (age < 0.9) {
      const r = stage.getBoundingClientRect();
      const v = world.toScreen(new THREE.Vector3(world.padX(S.floatN), 2.1 - (0.9 - age) * 0.4, 0));
      floatEl.hidden = false;
      floatEl.textContent = String(S.floatN);
      floatEl.style.left = (v.x - r.left) + 'px';
      floatEl.style.top = (v.y - r.top) + 'px';
      floatEl.style.opacity = String(1 - Math.max(0, age - 0.5) / 0.4);
    } else {
      floatEl.hidden = true;
    }
    world.frameLine(focusX(), spanX(), dt, false);
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
    if (S.mode === 'wait') swap(k);
    else S.pendingSwap = k;            // mid-hop: swap as soon as it lands
  }

  function swap(k) {
    S.kind = k;
    updateWho();
    const pos = player.root.position.clone();
    placePlayer(pos, player.turn.rotation.y);
    makeFriends();
    if (S.p && S.p.stage === 'gap' && !S.finished) friends[S.qi % friends.length].onPad = S.p.end;
    world.burst(above(pos, 0.8), 'poof');
    Sfx.play('poof');
    later(0.15, () => Sfx.play('voice', KINDS[k].voice));
    S.popAt = time();
    tell(`Hi, I'm ${KINDS[k].name}! Let's keep hopping.`);
    drawStrip();
    // keep the picking screen in step with the new choice
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
  }

  $('menuBtn').addEventListener('click', showMenu);

  /* ------------------------------------------------------- keyboard */
  lineInput.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' || !S.p || S.p.stage !== 'guess' || S.guess != null || S.mode !== 'wait') return;
    const arrow = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (arrow || e.key === 'Enter' || e.key === ' ') e.preventDefault();
    if (arrow) {
      if (!S.keys) S.keys = true;               // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, S.pond.max);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (S.keys) {
        makeGuess(S.cursor);
        return;
      }
      S.keys = true;
    } else {
      return;
    }
    world.showRing(S.cursor);
    srFocus.textContent = `Pad ${S.cursor}`;
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
      return;
    }
    // number keys answer "how far to your friend?"
    if (/^[1-9]$/.test(e.key) && S.screen === 'play' && S.p && S.p.stage === 'gap' && S.mode === 'wait' && won.hidden && whoPop.hidden) {
      const b = [...actions.querySelectorAll('.num-btn')].find((x) => x.textContent === e.key && !x.disabled);
      if (b) {
        e.preventDefault();
        b.click();
      }
    }
  });

  /* -------------------------------------------------------- pointer */
  lineInput.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play' || !S.p) return;
    closePop();
    if (S.keys && S.guess == null) {
      S.keys = false;
      world.showRing(null);
    }
    if (S.mode === 'wait' && world.hits(e.clientX, e.clientY, player.root)) {
      S.popAt = time();
      Sfx.play('voice', KINDS[S.kind].voice);
      return;
    }
    if (S.p.stage === 'guess') {
      const n = world.nearestPad(e.clientX, e.clientY);
      if (n != null) makeGuess(n);
    }
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

Run: `node $SP/tools/nlh-e2e.cjs http://127.0.0.1:47123/games/number-line-hop/ $SP/shots`
Expected: `E2E PASS (nlh)`. Then look at the `nlh-*.png` screenshots:
- the picker;
- the menu with two groups and the "Start here" badge;
- each stage's first problem, with the card, flat line, arcs and buttons;
- the done dialog with ★★☆.

- [ ] **Step 5: Run the unit tests**

Run: `node --test docs/tests/*.test.js`
Expected: all pass, with the coverage test now including `game.js`.

- [ ] **Step 6: Commit**

```bash
git add games/number-line-hop/index.html games/number-line-hop/game.js
git commit -m "feat(number-line-hop): the playable game: three stages on a 3D number line"
```

---

### Task 5: Site wiring and final verification

**Files:** modify `docs/catalogue.js`, `index.html`, `sitemap.xml` and `manifest.json`; regenerate the generated pages.

- [ ] **Step 1: Catalogue entry**, after the `rock-paper-scissors` entry in the 5+ block of `docs/catalogue.js`:

<!-- edit: docs/catalogue.js -->
```js
    { slug: 'number-line-hop', name: 'Number Line Hop', emoji: '🐾', age: '5', mins: '10',
      skills: ['numbers'],
      practises: 'Adding and taking away within 10 and 20 by hopping along a number line: counting on, counting back and crossing ten, then guessing where a hop will land and how far away a friend is.' },
```

- [ ] **Step 2: Homepage card** at the end of the 5+ grid in `index.html` (after its last card):

<!-- edit: index.html -->
```html
          <a class="game-card" href="games/number-line-hop/index.html">
            <span class="game-icon" aria-hidden="true">🐾</span>
            <span class="game-card-name">Number Line Hop</span>
            <span class="game-card-age">5+</span>
          </a>
```

Also change `30 hand-built games.` to `31 hand-built games.` in `index.html`, and `"30 free educational games` to `"31 free educational games` in `manifest.json`.

- [ ] **Step 3: Sitemap entry** after the last 5+ game's `<url>` block in `sitemap.xml`:

<!-- edit: sitemap.xml -->
```xml
  <url>
    <loc>https://playitmyway.com/games/number-line-hop/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 4: Regenerate**

Run: `node docs/build-pages.js`
Expected: `games/index.html — 31 games across 5 bands`, and `sw.js — precaching 59 files` (55 plus the page and its 3 scripts).

- [ ] **Step 5: Final verification**
  1. `node --test docs/tests/*.test.js`: all pass.
  2. `node $SP/tools/nlh-e2e.cjs http://127.0.0.1:47123/games/number-line-hop/ $SP/shots final`: PASS.
  3. `CALM=1 node $SP/tools/nlh-e2e.cjs … calm`: PASS.
  4. `node $SP/tools/e2e.cjs http://127.0.0.1:47123/games/stepping-stones/ $SP/shots ss-final`: PASS (Stepping Stones on the kit).
  5. `file://` check of `games/number-line-hop/index.html`: the picker renders, and the only failed request is `/manifest.json`.
  6. Phone (390 × 844) screenshots of the picker, a guess stage and a gap stage.

- [ ] **Step 6: Commit**

```bash
git add docs/catalogue.js index.html sitemap.xml manifest.json games/index.html for-teachers.html 404.html sw.js
git commit -m "feat: Number Line Hop joins the catalogue, homepage, sitemap and offline cache"
```

---

### Task 6: Release

- [ ] **Step 1:** `git fetch origin` and confirm `origin/main` equals the merge base, so the merge fast-forwards.
- [ ] **Step 2:** `git checkout main && git merge --ff-only number-line-hop && node --test docs/tests/*.test.js`.
- [ ] **Step 3:** `git -c credential.https://github.com/.username=viks120 push origin main` (and nothing else on the network meanwhile). Expected: `<old>..<new>  main -> main`.
- [ ] **Step 4:** Poll `https://playitmyway.com/games/number-line-hop/` until it answers 200. Then check:
  - the title;
  - the kit files at `/games/shared/3d/`;
  - the homepage card and "31 games";
  - `sw.js`;
  - the sitemap.
- [ ] **Step 5:** Run against the live site: `SET_ASIDE=https://static.cloudflareinsights.com/ node $SP/tools/nlh-e2e.cjs https://playitmyway.com/games/number-line-hop/ $SP/shots live`, and the Stepping Stones e2e the same way. Both PASS.
- [ ] **Step 6:** `git branch -d number-line-hop`.
