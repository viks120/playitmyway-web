# Peekaboo Pond Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Peekaboo Pond (ages 3+): a critter hides inside a lotus flower, the flowers slide around, and the child taps to find it. Difficulty adapts, and there is no failing.

**Architecture:** Classic scripts after the shared kit (`games/shared/3d/`). `Rounds` holds the pure logic (levels, seeded swap plans, adaptation, messages) and doubles as a Node module for tests. `World` draws the pond, the hinged-petal flowers, the swap lanes, the surprises and the camera. `game.js` runs the start button and the hide, shuffle, seek and reveal loop.

**Tech Stack:** Three.js r186 via the kit, plain HTML/CSS/JS, Web Audio (kit `Sfx`), `node:test`, puppeteer-core (scratchpad).

**Spec:** `docs/superpowers/specs/2026-10-09-peekaboo-pond-design.md`

## Global Constraints

- Nothing stored, zero third-party requests, works offline and over `file://`; classic scripts with relative paths.
- Sounds through the kit's `Sfx`, which respects `window.pimwMuted`.
- 3+ band chrome: teal `#0f766e`, tint `#ccfbf1`, deep tint `#99d5cb`, button shadow `#134e4a`, theme colour `#0f766e`.
- No reading needed to play; no spoken words; no stars or scores.
- No names of other games or brands in code, comments or commits. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `peekaboo-pond`. Release with `git -c credential.https://github.com.username=viks120 push origin main`, and nothing else on the network meanwhile.

## Decisions made while planning

The spec leaves these details open. They are settled here:
- **Blooms are cup-shaped.** The petals open to 0.74 rad, and flowers stand 2.4 apart, so two open flowers never overlap. In a cup, a critter's head shows above the front petals.
- **Swaps travel along rounded lanes.** A flower swings out (1.05 for neighbours, 2.05 when it passes another flower), slides across, then swings back. Lily pads never cut through each other.
- **Flowers keep their places between rounds.** They are laid out fresh only when the number of flowers changes, and then they pop in with ripples. Otherwise an open flower would visibly jump to a new slot.
- **A tap tries the flower itself first.** If the tap touches no flower, the nearest one within 1.1 of where it meets the water counts, so the top of a bud is tappable.
- **The hidden critter ducks.** It shrinks to 45% as its flower closes, and grows back as the flower opens.
- **The progress row fills on arriving home,** as the spec says. A goldfish splashes with the kit's `splash` sound. The ladybug flutters up on little wings.

## File structure

| File | Responsibility |
|---|---|
| `games/peekaboo-pond/rounds.js` (new) | Levels, plans, adaptation, messages |
| `docs/tests/peekaboo-pond.test.js` (new) | Plan and message tests |
| `games/peekaboo-pond/world.js` (new) | 3D world |
| `games/peekaboo-pond/game.js` (new) | The game |
| `games/peekaboo-pond/index.html` (new) | The page |
| `docs/tests/shared-3d.test.js` (modify) | Also checks the new page's kit paths |
| `docs/catalogue.js`, `index.html`, `sitemap.xml`, `manifest.json` (modify) | Site wiring |
| `games/index.html`, `for-teachers.html`, `404.html`, `sw.js` (regenerate) | `node docs/build-pages.js` |

Scratchpad (`SP`, as in earlier plans): `drafts/harness-flowers.html` and `tools/pp-e2e.cjs`. The preview server on port 47123 serves the repo, plus `/screen/<name>` from `drafts/`.

---

### Task 1: Rounds

**Files:**
- Create: `games/peekaboo-pond/rounds.js`
- Test: `docs/tests/peekaboo-pond.test.js`

**Interfaces:**
- Produces:
  - `Rounds.LEVELS`: 8 levels, each `{buds, swaps, swapTime, near}`.
  - `Rounds.SURPRISE_ORDER`: `['goldfish', 'ladybug']`.
  - `Rounds.plan(seed, round, level)` returns `{hider: round % 4, buds, start, swaps: [[slotA, slotB], …], answer, swapTime}`. Here `start` and `answer` are slots.
  - `Rounds.nextLevel(level, taps)`.
  - `Rounds.say`: `hiding(name)`, `moving()`, `seek(name)`, `found(name, taps)`, `miss(kind, hint)`, `party()`, `focus(slot, n)` and `progress(count)`.
  - `Rounds.rng(seed)`.

- [ ] **Step 1: Write the failing tests**

<!-- file: docs/tests/peekaboo-pond.test.js -->
```js
/* Peekaboo Pond tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/peekaboo-pond/rounds.js and check every plan
 * against the spec, re-simulating each shuffle independently. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Rounds = require(path.join(__dirname, '..', '..', 'games', 'peekaboo-pond', 'rounds.js'));

const TABLE = [
  // flowers, swaps, swap time, neighbours only
  [2, 0, 0, true], [3, 0, 0, true], [3, 1, 1.0, true], [3, 2, 1.0, true],
  [3, 3, 0.8, true], [4, 2, 0.8, false], [4, 3, 0.8, false], [4, 4, 0.62, false],
];

test('eight levels, as the spec table says', () => {
  assert.deepEqual(Rounds.LEVELS.map((l) => [l.buds, l.swaps, l.swapTime, l.near]), TABLE);
});

test('every level: 1,000 seeds × 6 rounds keep every promise', () => {
  TABLE.forEach(([buds, swaps, swapTime, near], level) => {
    for (let seed = 1; seed <= 1000; seed++) {
      for (let round = 0; round < 6; round++) {
        const p = Rounds.plan(seed, round, level);
        const where = `level ${level} seed ${seed} round ${round}`;
        assert.equal(p.buds, buds, where);
        assert.equal(p.swaps.length, swaps, where);
        assert.equal(p.swapTime, swapTime, where);
        assert.equal(p.hider, round % 4, where);
        assert.ok(Number.isInteger(p.start) && p.start >= 0 && p.start < buds, where);
        let at = p.start;
        let moved = 0;
        p.swaps.forEach(([i, j], k) => {
          assert.ok(i !== j && i >= 0 && j >= 0 && i < buds && j < buds, `${where}: bad swap ${i},${j}`);
          if (near) assert.equal(Math.abs(i - j), 1, `${where}: ${i},${j} are not neighbours`);
          if (k > 0) {
            const [a, b] = p.swaps[k - 1];
            assert.ok(!((a === i && b === j) || (a === j && b === i)), `${where}: swap ${k} undoes the one before`);
          }
          if (at === i) {
            at = j;
            moved++;
          } else if (at === j) {
            at = i;
            moved++;
          }
        });
        assert.equal(p.answer, at, `${where}: wrong answer`);
        assert.ok(moved >= Math.ceil(swaps / 2), `${where}: the hidden flower moved only ${moved} times`);
      }
    }
  });
});

test('difficulty adapts: up on a first-tap find, steady on the second, down after that', () => {
  assert.equal(Rounds.nextLevel(0, 1), 1);
  assert.equal(Rounds.nextLevel(7, 1), 7);
  assert.equal(Rounds.nextLevel(3, 2), 3);
  assert.equal(Rounds.nextLevel(3, 3), 2);
  assert.equal(Rounds.nextLevel(5, 4), 4);
  assert.equal(Rounds.nextLevel(0, 3), 0);
});

test('the same seed always plans the same round, and seeds vary', () => {
  assert.deepEqual(Rounds.plan(7, 3, 6), Rounds.plan(7, 3, 6));
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) seen.add(JSON.stringify(Rounds.plan(seed, 0, 7).swaps));
  assert.ok(seen.size > 100, `only ${seen.size} different shuffles in 200 seeds`);
});

test('every message uses the exact wording from the spec', () => {
  const S = Rounds.say;
  assert.equal(S.hiding('Clover'), 'Clover is hiding! Watch the flowers.');
  assert.equal(S.moving(), 'The flowers are moving…');
  assert.equal(S.seek('Clover'), "Where's Clover? Tap a flower.");
  assert.equal(S.found('Clover', 1), 'Peekaboo! You found Clover!');
  assert.equal(S.found('Clover', 2), "Peekaboo! There's Clover!");
  assert.equal(S.miss('goldfish', false), 'Not here! Just a little goldfish. Try another flower.');
  assert.equal(S.miss('ladybug', true), 'Not here! Just a sleepy ladybug. Look, that flower is wiggling!');
  assert.equal(S.party(), 'Five friends found! Party time!');
  assert.equal(S.focus(1, 3), 'Flower 2 of 3');
  assert.equal(S.progress(2), '2 of 5 friends found');
  assert.deepEqual(Rounds.SURPRISE_ORDER, ['goldfish', 'ladybug']);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `node --test docs/tests/*.test.js`
Expected: `Cannot find module …\games\peekaboo-pond\rounds.js`

- [ ] **Step 3: Write `rounds.js`**

<!-- file: games/peekaboo-pond/rounds.js -->
```js
/* Peekaboo Pond: the rounds. Difficulty levels, the swap plans, how the
 * difficulty adapts, and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Rounds; in Node
 * it is a CommonJS module.
 */
(function (root) {
  'use strict';

  /* mulberry32: a tiny seedable generator, so any round can be replayed */
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

  // swapTime in seconds; near means only neighbouring flowers swap
  const LEVELS = [
    { buds: 2, swaps: 0, swapTime: 0, near: true },
    { buds: 3, swaps: 0, swapTime: 0, near: true },
    { buds: 3, swaps: 1, swapTime: 1.0, near: true },
    { buds: 3, swaps: 2, swapTime: 1.0, near: true },
    { buds: 3, swaps: 3, swapTime: 0.8, near: true },
    { buds: 4, swaps: 2, swapTime: 0.8, near: false },
    { buds: 4, swaps: 3, swapTime: 0.8, near: false },
    { buds: 4, swaps: 4, swapTime: 0.62, near: false },
  ];
  const TOP = LEVELS.length - 1;
  const SURPRISES = { goldfish: 'a little goldfish', ladybug: 'a sleepy ladybug' };
  const SURPRISE_ORDER = ['goldfish', 'ladybug'];

  // each round draws its own stream of random numbers from the visit's seed
  const roundSeed = (seed, round) => (Math.imul((seed >>> 0) ^ 0x9e3779b9, 31) + Math.imul(round + 1, 0x85ebca6b)) >>> 0;

  function pickPair(rand, n, near) {
    const i = Math.floor(rand() * n);
    if (near) {
      if (i === 0) return [0, 1];
      if (i === n - 1) return [n - 1, n - 2];
      return [i, rand() < 0.5 ? i - 1 : i + 1];
    }
    let j = Math.floor(rand() * (n - 1));
    if (j >= i) j++;
    return [i, j];
  }
  const samePair = (p, q) => !!q && ((p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

  /* One round's plan: which critter hides (they take turns), in which slot,
   * the swaps, and the slot the hidden critter's flower ends up in. At least
   * half the swaps (rounded up) move that flower, so watching really
   * matters. */
  function plan(seed, round, level) {
    const L = LEVELS[Math.max(0, Math.min(TOP, level))];
    const rand = rng(roundSeed(seed, round));
    const start = Math.floor(rand() * L.buds);
    for (let attempt = 0; attempt < 500; attempt++) {
      const swaps = [];
      let at = start;
      let moved = 0;
      for (let k = 0; k < L.swaps; k++) {
        let pair = pickPair(rand, L.buds, L.near);
        while (samePair(pair, swaps[k - 1])) pair = pickPair(rand, L.buds, L.near);
        swaps.push(pair);
        if (pair[0] === at) {
          at = pair[1];
          moved++;
        } else if (pair[1] === at) {
          at = pair[0];
          moved++;
        }
      }
      if (moved >= Math.ceil(L.swaps / 2)) {
        return { hider: round % 4, buds: L.buds, start, swaps, answer: at, swapTime: L.swapTime };
      }
    }
    throw new Error('Could not plan a round');
  }

  // found on the first tap: a little harder; on the second: the same; later: easier
  const nextLevel = (level, taps) => (taps <= 1 ? Math.min(level + 1, TOP) : taps >= 3 ? Math.max(level - 1, 0) : level);

  const say = {
    hiding: (name) => `${name} is hiding! Watch the flowers.`,
    moving: () => 'The flowers are moving…',
    seek: (name) => `Where's ${name}? Tap a flower.`,
    found: (name, taps) => (taps <= 1 ? `Peekaboo! You found ${name}!` : `Peekaboo! There's ${name}!`),
    miss: (kind, hint) => `Not here! Just ${SURPRISES[kind]}. ${hint ? 'Look, that flower is wiggling!' : 'Try another flower.'}`,
    party: () => 'Five friends found! Party time!',
    focus: (slot, n) => `Flower ${slot + 1} of ${n}`,
    progress: (count) => `${count} of 5 friends found`,
  };

  const api = {
    LEVELS: LEVELS.map((l) => Object.assign({}, l)),
    SURPRISE_ORDER,
    plan,
    nextLevel,
    say,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rounds = api;
})(this);
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test docs/tests/*.test.js`
Expected: all pass, including the 5 new Peekaboo Pond tests.

- [ ] **Step 5: Commit**

```bash
git add games/peekaboo-pond/rounds.js docs/tests/peekaboo-pond.test.js
git commit -m "feat(peekaboo-pond): rounds, swap plans and adaptive difficulty, tested"
```

---

### Task 2: The flower pond

**Files:**
- Create: `games/peekaboo-pond/world.js`
- Scratchpad: `$SP/drafts/harness-flowers.html`

**Interfaces:**
- Consumes: `THREE` and `Toon` from the kit.
- Produces: `World.create(canvas)` returns a world object `W`, or `null`. `W` has:
  - `resize()`, `render()`, `update(t, dt)`.
  - `setFlowers(n)`, `flower(i)` and `slotX(slot, n)`.
    - `flower(i)` returns `{group, petals, o, target, wiggle, grow}`. `o` is the 0..1 openness, eased towards `target`. `wiggle` runs 0..1. `grow` runs 0..1 and eases up to 1 for the pop-in.
  - `placeFlower(i, x, z)`, `slide(a, b, i, j, n, k)` and `flowerTop(i)` (a `Vector3`).
  - `home(k)`: a `Vector3` on the bank for critter k (0..3).
  - `actors` (a `Group`) and `surprises` (`{goldfish, ladybug}` Groups, hidden at first).
  - `ring(x|null)` and `shadow(x, y, z, lift, visible)`.
  - `frame(n, dt, snap)`.
  - `burst(pos, 'sparkle'|'drops'|'confetti')` and `ripple(x, z, from)`.
  - `flowerAt(clientX, clientY)` returns a flower index or `null`; `hits(clientX, clientY, object)`; `toScreen(v)`.

- [ ] **Step 1: Write `world.js`**

<!-- file: games/peekaboo-pond/world.js -->
```js
/* Peekaboo Pond: the 3D world.
 *
 * Owns the renderer, the sky and water, the bank where the critters wait,
 * the lotus flowers (six petals hinged at the base, so one number takes a
 * flower from a shut bud to full bloom), the swap lanes, the two surprises,
 * the keyboard ring, the camera and the effects. It draws; game.js decides.
 * Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const GAP = 2.4;               // between flowers: room for two blooms side by side
  const PAD_TOP = 0.06;
  const BANK_TOP = 0.31;
  const BANK_Z = -3.9;           // where the critters wait their turn
  const PETALS = 6;
  const CLOSED = -0.5;           // petal tilt in a shut bud
  const OPEN = 0.74;             // and in bloom
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => x * x * (3 - 2 * x);
  const backOut = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
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
    scene.fog = new THREE.Fog(SKY, 20, 44);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);

    const M = {
      water: Toon.flat('#93d6ec'),
      pad: Toon.toon('#86d27a', '#5aa74f'),
      petal: Toon.toon('#ffb3c9', '#e88aa5'),
      heart: Toon.toon('#ffe08a'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      blossom: Toon.toon('#ffb3c9'),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      spark: Toon.flat('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.9, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      fish: Toon.toon('#ff9f43', '#d9772a'),
      fin: Toon.toon('#ffc46b', '#d9772a'),
      bug: Toon.toon('#ff5a5a', '#c43b3b'),
      wing: Toon.flat('#ffffff', 0.6),
      ink: Toon.toon('#2b2a5e'),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      pad: padGeometry(0.95),
      lily: padGeometry(1),
      ball: new THREE.SphereGeometry(1, 28, 18),
      tail: new THREE.ConeGeometry(0.2, 0.32, 16),
      ring: new THREE.RingGeometry(1.04, 1.2, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      bit: new THREE.SphereGeometry(1, 10, 8),
      shadow: new THREE.PlaneGeometry(1.2, 1.2),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      bankGrass: new THREE.BoxGeometry(60, 0.14, 6.1),
      bankDirt: new THREE.BoxGeometry(60, 0.5, 6),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(70, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const flowersRoot = new THREE.Group();
    const actors = new THREE.Group();
    scene.add(flowersRoot, actors);

    // the bank where the critters wait: grass over a dirt edge, reeds behind them
    const bankZ = BANK_Z + 0.8 - 3;
    const dirt = new THREE.Mesh(G.bankDirt, M.dirt);
    dirt.position.set(0, -0.06, bankZ);
    const grass = new THREE.Mesh(G.bankGrass, M.grass);
    grass.position.set(0, 0.25, bankZ);
    scene.add(dirt, grass);
    const reeds = [];
    const tails = [];
    const lilies = [];
    const blossoms = [];
    for (let i = 0; i < 34; i++) {
      const x = rand(-26, 26);
      const z = rand(BANK_Z - 4.4, BANK_Z - 1.1);
      const h = rand(0.7, 1.6);
      reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
      if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
    }
    for (let i = 0; i < 18; i++) {
      const x = (Math.random() < 0.5 ? -1 : 1) * rand(6.2, 15);
      const z = rand(-2.6, 3.4);
      const s = rand(0.3, 0.65);
      lilies.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
      if (Math.random() < 0.35) blossoms.push({ x, y: 0.09, z, sx: 0.12, sy: 0.09, sz: 0.12 });
    }
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    scene.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails), lilyMesh);
    if (blossoms.length) scene.add(instanced(G.ball, M.blossom, blossoms));

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 40;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-16, 16), z: rand(-2.5, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const ringMesh = new THREE.Mesh(G.ring, M.ring);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.visible = false;
    scene.add(ringMesh);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    scene.add(shadow);

    /* A lotus: a lily pad and six petals, each hinged at its base, so one
     * number, o, takes it from a shut bud (0) to full bloom (1). */
    const flowers = [];
    function makeFlower() {
      const group = new THREE.Group();
      group.userData.flower = flowers.length;
      const pad = new THREE.Mesh(G.pad, M.pad);
      pad.rotation.y = rand(0, TAU);
      group.add(pad);
      const petals = [];
      for (let k = 0; k < PETALS; k++) {
        const a = (k / PETALS) * TAU;
        const hinge = new THREE.Group();
        hinge.position.set(Math.sin(a) * 0.26, PAD_TOP, Math.cos(a) * 0.26);
        hinge.rotation.order = 'YXZ';          // turn to face outward, then lean
        hinge.rotation.y = a;
        const petal = new THREE.Mesh(G.ball, M.petal);
        petal.scale.set(0.3, 0.68, 0.12);
        petal.position.y = 0.62;
        hinge.add(petal);
        group.add(hinge);
        petals.push(hinge);
      }
      const heart = new THREE.Mesh(G.ball, M.heart);
      heart.scale.set(0.16, 0.07, 0.16);
      heart.position.y = PAD_TOP + 0.04;
      group.add(heart);
      Toon.addOutlines(group);
      group.visible = false;
      flowersRoot.add(group);
      return { group, petals, o: 1, target: 1, wiggle: 0, grow: 1, ph: rand(0, TAU) };
    }

    function makeGoldfish() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.ball, M.fish);
      body.scale.set(0.34, 0.24, 0.2);
      const tail = new THREE.Mesh(G.tail, M.fin);
      tail.rotation.z = -Math.PI / 2;
      tail.position.x = -0.42;
      tail.scale.set(1, 1, 0.45);
      const fin = new THREE.Mesh(G.ball, M.fin);
      fin.scale.set(0.12, 0.08, 0.03);
      fin.position.set(0.02, 0.22, 0);
      g.add(body, tail, fin);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(G.ball, M.white);
        eye.scale.setScalar(0.07);
        eye.position.set(0.2, 0.06, side * 0.15);
        const pupil = new THREE.Mesh(G.ball, M.ink);
        pupil.scale.setScalar(0.04);
        pupil.position.set(0.23, 0.06, side * 0.19);
        g.add(eye, pupil);
      }
      Toon.addOutlines(g);
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeLadybug() {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(G.ball, M.bug);
      shell.scale.set(0.3, 0.2, 0.34);
      const head = new THREE.Mesh(G.ball, M.ink);
      head.scale.setScalar(0.13);
      head.position.set(0, 0.02, 0.33);
      g.add(shell, head);
      for (const [x, y, z] of [[0.12, 0.15, 0.1], [-0.12, 0.15, 0.1], [0.14, 0.12, -0.12], [-0.14, 0.12, -0.12], [0, 0.19, -0.02]]) {
        const dot = new THREE.Mesh(G.ball, M.ink);
        dot.scale.set(0.055, 0.03, 0.055);
        dot.position.set(x, y, z);
        g.add(dot);
      }
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(G.ball, M.white);
        eye.scale.setScalar(0.035);
        eye.position.set(side * 0.05, 0.07, 0.43);
        g.add(eye);
      }
      // little see-through wings, for fluttering up out of the flower
      g.userData.wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.1, 0.17, -0.06);
        const wing = new THREE.Mesh(G.ball, M.wing);
        wing.scale.set(0.26, 0.015, 0.14);
        wing.position.x = side * 0.24;
        pivot.add(wing);
        g.add(pivot);
        return pivot;
      });
      Toon.addOutlines(g);
      g.visible = false;
      scene.add(g);
      return g;
    }

    const surprises = { goldfish: makeGoldfish(), ladybug: makeLadybug() };
    const bits = [];
    const ripples = [];
    let ringX = null;
    let camWidth = 4;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const water0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_TOP);

    const W = { renderer, scene, camera, actors, surprises };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    /* ------------------------------------------------------------ flowers */
    W.setFlowers = (n) => {
      while (flowers.length < n) flowers.push(makeFlower());
      flowers.forEach((f, i) => { f.group.visible = i < n; });
    };
    W.flower = (i) => flowers[i];
    W.slotX = (slot, n) => (slot - (n - 1) / 2) * GAP;
    W.placeFlower = (i, x, z) => {
      flowers[i].group.position.x = x;
      flowers[i].group.position.z = z;
    };
    W.flowerTop = (i) => {
      const p = flowers[i].group.position;
      return new THREE.Vector3(p.x, p.y + PAD_TOP, p.z);
    };

    /* Flower a slides from slot i to slot j while flower b goes the other
     * way, k (0..1) of the way through. One swings out in front and the
     * other behind, then they slide across in lanes wide enough to clear
     * any flower they pass, then swing back in. */
    W.slide = (a, b, i, j, n, k) => {
      const out = Math.abs(i - j) === 1 ? 1.05 : 2.05;
      const z = out * smooth(clamp(Math.min(k, 1 - k) / 0.3, 0, 1));
      const e = smooth(clamp((k - 0.15) / 0.7, 0, 1));
      const xi = W.slotX(i, n);
      const xj = W.slotX(j, n);
      W.placeFlower(a, xi + (xj - xi) * e, z);
      W.placeFlower(b, xj + (xi - xj) * e, -z);
    };

    W.home = (k) => new THREE.Vector3((k - 1.5) * 1.9, BANK_TOP, BANK_Z);
    W.ring = (x) => {
      ringX = x;
      ringMesh.visible = x != null;
    };
    W.shadow = (x, y, z, lift, visible) => {
      shadow.visible = visible;
      if (!visible) return;
      const s = 1 - 0.45 * clamp(lift / 1.0, 0, 1);
      shadow.position.set(x, y + 0.006, z);
      shadow.scale.setScalar(s);
      M.shadow.opacity = 0.5 + 0.5 * s;
    };

    /* Camera: in front and a little above, framing every flower. Tall
     * screens get a wider vertical view so the row still fits across. */
    W.frame = (n, dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.4 / a) * 180) / Math.PI, 38, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const hHalf = Math.tan((vfov * Math.PI) / 360) * a;
      const want = ((n - 1) * GAP) / 2 + 1.7;
      camWidth = snap ? want : camWidth + (want - camWidth) * (1 - Math.exp(-3 * dt));
      const L = clamp(camWidth / hHalf, 7.5, 22);
      const pitch = 0.55;
      camera.position.set(0, 0.5 + L * Math.sin(pitch), L * Math.cos(pitch));
      camera.lookAt(0, 0.5, -0.9);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------- pointer helpers */
    function aim(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }

    /* The flower under a tap: the one the tap touches, or else the nearest
     * within 1.1 of where the tap meets the water, which suits small
     * fingers. */
    W.flowerAt = (clientX, clientY) => {
      aim(clientX, clientY);
      const shown = flowers.filter((f) => f.group.visible);
      const hit = ray.intersectObjects(shown.map((f) => f.group), true)[0];
      if (hit) {
        for (let o = hit.object; o; o = o.parent) if (o.userData.flower != null) return o.userData.flower;
      }
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(water0, p)) return null;
      let best = null;
      let bestD = 1.1;
      shown.forEach((f) => {
        const d = Math.hypot(p.x - f.group.position.x, p.z - f.group.position.z);
        if (d < bestD) {
          bestD = d;
          best = f.group.userData.flower;
        }
      });
      return best;
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

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 12, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.055, life: 0.7 },
      drops: { n: 14, mat: () => M.white, speed: 2.6, up: 1.8, size: 0.05, life: 0.55 },
      confetti: { n: 50, mat: (i) => M.confetti[i % M.confetti.length], speed: 6, up: 4.5, size: 0.065, life: 1.6 },
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

    /* --------------------------------------------------------- every frame */
    W.update = (t, dt) => {
      sparks.forEach((s, i) => {
        const k = Math.max(0, Math.sin(t * s.sp + s.ph)) ** 8;
        v3.set(s.x, 0.012, s.z);
        s3.set(k, k, k);
        sparkMesh.setMatrixAt(i, m4.compose(v3, flatDown, s3));
      });
      sparkMesh.instanceMatrix.needsUpdate = true;

      for (const f of flowers) {
        if (!f.group.visible) continue;
        const step = dt / 0.35;
        f.o += clamp(f.target - f.o, -step, step);
        const tilt = CLOSED + (OPEN - CLOSED) * smooth(f.o);
        f.petals.forEach((h, k) => { h.rotation.x = tilt + 0.04 * Math.sin(t * 2 + k + f.ph); });
        f.group.rotation.z = f.wiggle * 0.14 * Math.sin(t * 16 + f.ph);
        f.group.position.y = 0.02 * Math.sin(t * 1.3 + f.ph);
        if (f.grow < 1) f.grow = Math.min(1, f.grow + dt / 0.45);
        f.group.scale.setScalar(Math.max(0.001, backOut(f.grow)));
      }
      const lady = surprises.ladybug;
      if (lady.visible) lady.userData.wings.forEach((w, s) => { w.rotation.z = (s ? 1 : -1) * (0.55 + 0.3 * Math.sin(t * 40)); });
      if (ringX != null) {
        ringMesh.position.set(ringX, 0.04, 0);
        ringMesh.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
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

- [ ] **Step 2: Look at the flowers**

<!-- scratch: harness-flowers.html -->
```html
<!doctype html>
<meta charset="utf-8">
<title>flowers</title>
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style>
<canvas id="c"></canvas>
<script src="/games/shared/3d/three.min.js"></script>
<script src="/games/shared/3d/toon.js"></script>
<script src="/games/shared/3d/critters.js"></script>
<script src="/games/peekaboo-pond/world.js"></script>
<script>
  // ?mode=bloom: three flowers open, shut and half open, Clover in the open one, both surprises out
  // ?mode=swap: four shut flowers, the outer two a third of the way through swapping
  // ?mode=row: four flowers in bloom
  const mode = (/mode=(\w+)/.exec(location.search) || [])[1] || 'bloom';
  const w = World.create(document.getElementById('c'));
  w.resize();
  const n = mode === 'bloom' ? 3 : 4;
  w.setFlowers(n);
  const open = mode === 'bloom' ? [1, 0, 0.5] : mode === 'swap' ? [0, 0, 0, 0] : [1, 1, 1, 1];
  open.forEach((o, i) => { w.placeFlower(i, w.slotX(i, n), 0); w.flower(i).o = w.flower(i).target = o; });
  if (mode === 'swap') w.slide(0, 3, 0, 3, 4, 0.36);
  const kinds = Object.keys(Critters.KINDS);
  const rigs = kinds.map((k) => { const r = Critters.create(k); r.root.scale.setScalar(0.72); w.actors.add(r.root); return r; });
  if (mode === 'bloom') { w.surprises.goldfish.visible = true; w.surprises.ladybug.visible = true; }
  (function frame(ms) {
    const t = (ms || 0) / 1000;
    w.update(t, 0.016);
    rigs.forEach((r, i) => { r.root.position.copy(i === 0 && mode === 'bloom' ? w.flowerTop(0) : w.home(i)); r.look.pitch = -0.2; r.update(t, 0.016); });
    if (mode === 'bloom') {
      const top = w.flowerTop(2);
      w.surprises.goldfish.position.set(top.x + 0.3, top.y + 1.0, top.z + 0.8);
      w.surprises.goldfish.rotation.set(0, -1.25, 0.3);
      w.surprises.ladybug.position.set(top.x - 0.9, top.y + 0.9, top.z + 0.2);
    }
    w.frame(n, 0.016, true);
    w.render();
    requestAnimationFrame(frame);
  })();
</script>
```

Run: `node $SP/tools/shot.cjs "http://127.0.0.1:47123/screen/harness-flowers.html?mode=bloom" $SP/shots/pp-bloom-desk.png 1500 944 640`. Repeat at phone size (`358 608`), and for `mode=swap` and `mode=row`.

Expected:
- No console errors.
- **bloom:** the left flower is a pink cup with Clover's head showing over the front petals. The middle one is a shut, pointed bud. The right one is half open, with the goldfish leaping and the ladybug fluttering beside it. Pip, Plum and Mango stand on the bank.
- **swap:** the moving pads clear the still ones.
- **row:** four blooms side by side, not touching, and all fit on the phone.

- [ ] **Step 3: Run the tests, then commit**

Run: `node --test docs/tests/*.test.js`. All should pass, since the coverage test checks every `THREE.*` name in `world.js`.

```bash
git add games/peekaboo-pond/world.js
git commit -m "feat(peekaboo-pond): the flower pond: lotus buds that bloom, swap lanes, surprises"
```

---

### Task 3: The page and the game

**Files:**
- Create: `games/peekaboo-pond/index.html`, `games/peekaboo-pond/game.js`
- Modify: `docs/tests/shared-3d.test.js:75`
- Scratchpad: `$SP/tools/pp-e2e.cjs`

**Interfaces:**
- Consumes: the kit, `Rounds` and `World` (as listed in Tasks 1–2). DOM ids: `stage`, `view`, `pondInput`, `startScreen`, `playBtn`, `hud`, `progress`, `bubble`, `tell`, `srFocus`, `noGl`.
- Contracts the e2e player relies on:
  - `?seed=N` makes play repeatable.
  - `#tell` carries the messages.
  - `#pondInput[aria-busy]` is `"false"` exactly while the game waits for a tap.
  - The first arrow press each round shows the ring on slot `floor((n-1)/2)` and announces `Flower k of n` in `#srFocus`; later presses move it, and Enter opens it.
  - `#progress[aria-label]` reads `N of 5 friends found`, updated when the critter gets home.

- [ ] **Step 1: Write the end-to-end player (scratchpad)**

<!-- scratch: pp-e2e.cjs -->
```js
// Keyboard-only end-to-end check of Peekaboo Pond in headless Chrome.
//   node pp-e2e.cjs <pageUrl> <shotsDir> [tag]
// Env: CALM=1 reduced motion; PHONE=1 phone size; SET_ASIDE=<url prefix>
// reports, rather than fails, requests the host injects.
const puppeteer = require('puppeteer-core');
const path = require('path');
const assert = require('assert/strict');
const Rounds = require('C:/Users/shrik/playitmyway-web/games/peekaboo-pond/rounds.js');

const [url, shots, tag = 'pp'] = process.argv.slice(2);
const SEED = 7;
const NAMES = ['Clover', 'Pip', 'Plum', 'Mango'];
const MISSES = { 1: 1, 4: 2 };            // round -> deliberate misses (rounds 2 and 5, counting from 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  if (process.env.PHONE) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1100, height: 900 });
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
  const waiting = () => page.$eval('#pondInput', (e) => e.getAttribute('aria-busy') === 'false');
  const progressIs = (n) => async () => (await page.$eval('#progress', (e) => e.getAttribute('aria-label'))) === Rounds.say.progress(n);

  await page.goto(url + '?seed=' + SEED, { waitUntil: 'load' });
  await sleep(1500);
  await shot('1-start');
  await page.click('#playBtn');

  let level = 0;
  let misses = 0;
  for (let round = 0; round < 6; round++) {
    const plan = Rounds.plan(SEED, round, level);
    const name = NAMES[plan.hider];
    await until(tellIs(Rounds.say.seek(name)), 40000, `round ${round} to reach the seek`);
    await until(waiting, 5000, 'the game to wait for a tap');
    if (round === 0 || round === 4) await shot(`seek-${round}`);
    await page.focus('#pondInput');
    await page.keyboard.press('ArrowLeft');             // the first press shows the ring on the middle flower
    let at = +/Flower (\d+) of/.exec(await text('#srFocus'))[1] - 1;
    assert.equal(at, Math.floor((plan.buds - 1) / 2), 'the ring should start on the middle flower');
    const goTo = async (slot) => {
      while (at !== slot) {
        await page.keyboard.press(slot > at ? 'ArrowRight' : 'ArrowLeft');
        at += slot > at ? 1 : -1;
      }
      assert.equal(await text('#srFocus'), Rounds.say.focus(slot, plan.buds));
    };
    const wrong = [...Array(plan.buds).keys()].filter((s) => s !== plan.answer);
    const misTaps = MISSES[round] || 0;
    for (let m = 0; m < misTaps; m++) {
      await goTo(wrong[m]);
      await page.keyboard.press('Enter');
      const kind = Rounds.SURPRISE_ORDER[misses % 2];
      misses++;
      await until(tellIs(Rounds.say.miss(kind, m >= 1)), 6000, 'the surprise');
      if (round === 1 || m === 1) await shot(`surprise-${round}-${m}`);
      await until(waiting, 6000, 'the flower to close again');
    }
    await goTo(plan.answer);
    await page.keyboard.press('Enter');
    await until(tellIs(Rounds.say.found(name, misTaps + 1)), 6000, `finding ${name}`);
    if (round === 0) await shot('found-0');
    level = Rounds.nextLevel(level, misTaps + 1);
    if (round === 4) {
      await until(tellIs(Rounds.say.party()), 12000, 'the party');
      await shot('party');
    }
  }
  await until(progressIs(1), 8000, 'the sixth find to fill the first spot after the party');

  const stored = await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]);
  assert.deepEqual(stored, [0, 0, '']);
  assert.deepEqual(foreign, [], 'third-party requests');
  assert.deepEqual(problems, [], 'console or page errors');
  if (injected.length) console.log('set aside (host-injected): ' + [...new Set(injected.map((u) => new URL(u).host))].join(', '));
  console.log('E2E PASS (' + tag + ')');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL:', e.message); process.exit(1); });
```

Run: `node $SP/tools/pp-e2e.cjs http://127.0.0.1:47123/games/peekaboo-pond/ $SP/shots`
Expected: `E2E FAIL: …` (there is no page yet).

- [ ] **Step 2: Write `index.html`**

<!-- file: games/peekaboo-pond/index.html -->
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
    <title>Peekaboo Pond – Free 3D Memory Game | Play It My Way</title>
    <meta name="description" content="A cute critter hides in a lotus flower, the flowers slide around, and your child taps to find it. A gentle 3D memory game for ages 3+. No ads." />
    <meta name="keywords" content="memory game for toddlers, peekaboo game, hide and seek game for kids, 3d game for preschoolers, free game ages 3+" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Peekaboo Pond – Free 3D Memory Game for Little Ones" />
    <meta property="og:description" content="Watch where the critter hides, follow the flowers as they slide, then tap to find it. No reading, no failing. Ages 3+. No ads, no download!" />
    <meta property="og:type" content="game" />
    <meta property="og:url" content="https://playitmyway.com/games/peekaboo-pond/" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Peekaboo Pond – Free 3D Memory Game for Little Ones" />
    <meta name="twitter:description" content="A critter hides, the flowers slide, your child finds it. A gentle 3D memory game for ages 3+. No ads, no download!" />

    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="canonical" href="https://playitmyway.com/games/peekaboo-pond/" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="../../tokens.css" />
    <link rel="stylesheet" href="../../components.css" />
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
      html, body {
        background: var(--color-bg);
        /* an accidental pull-to-refresh would end the game */
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
        height: clamp(440px, 72vh, 640px);
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

      .start { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 18px; }
      .start-card {
        background: rgba(255, 255, 255, 0.94); border-radius: 26px; padding: 14px 26px 18px; text-align: center;
        box-shadow: 0 6px 0 var(--band-tint-deep), var(--shadow-lift);
      }
      .start-card h2 { margin: 0; font-size: clamp(24px, 6vw, 32px); }
      .start-card p { margin: 2px 0 12px; color: var(--ink-soft); font-weight: 600; }
      .play-btn {
        width: 96px; height: 96px; border-radius: 50%; border: 0; cursor: pointer;
        background: var(--band); color: #fff; font-size: 44px; line-height: 1; padding-left: 8px;
        box-shadow: 0 7px 0 var(--band-deep);
      }
      .play-btn:active { transform: translateY(5px); box-shadow: 0 2px 0 var(--band-deep); }

      .hud { position: absolute; inset: 0; pointer-events: none; }
      .progress {
        position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; padding: 6px 8px;
        background: rgba(255, 255, 255, 0.92); border-radius: var(--radius-pill); box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .slot {
        width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 20px;
        background: var(--band-tint); box-shadow: inset 0 0 0 2px var(--band-tint-deep);
      }
      .slot.full { background: #fff; box-shadow: inset 0 0 0 2px var(--band); }
      .bubble {
        position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
        min-width: 86px; height: 86px; padding: 0 16px; border-radius: 44px; display: grid; place-items: center;
        background: #fff; font-size: 42px; font-weight: 700; color: var(--band); box-shadow: 0 5px 0 var(--band-tint-deep);
      }
      /* right: 64px keeps the message clear of the site's floating sound button */
      .tell {
        position: absolute; left: 10px; right: 64px; bottom: 10px; margin: 0;
        background: rgba(255, 255, 255, 0.95); border-radius: 18px; padding: 9px 14px;
        text-align: center; font-size: 16px; font-weight: 600; line-height: 1.3;
        box-shadow: 0 4px 0 var(--band-tint-deep);
      }
      .tell:empty { display: none; }

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
      .visually-hidden {
        position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
      }

      @media (max-width: 420px) {
        .slot { width: 26px; height: 26px; font-size: 16px; }
        .bubble { top: 58px; min-width: 70px; height: 70px; font-size: 34px; }
        .tell { font-size: 14.5px; }
      }
    </style>
  </head>
  <body>
    <a class="back-link" href="../../">← Back to Games</a>

    <header class="game-head">
      <h1>🌸 Peekaboo Pond</h1>
      <p>Watch where the critter hides, then find it!</p>
    </header>

    <main class="stage-card">
      <div class="stage" id="stage">
        <canvas id="view" aria-hidden="true"></canvas>
        <div class="pond-input" id="pondInput" tabindex="0" role="application" aria-busy="true"
             aria-label="The pond. Left and right arrows choose a flower, Enter opens it." hidden></div>

        <div class="hud" id="hud" hidden>
          <div class="progress" id="progress" role="img" aria-label="0 of 5 friends found"></div>
          <div class="bubble" id="bubble" aria-hidden="true" hidden></div>
          <p class="tell" id="tell" aria-live="polite"></p>
        </div>

        <section class="start" id="startScreen" aria-labelledby="startTitle">
          <div class="start-card">
            <h2 id="startTitle">Peekaboo Pond</h2>
            <p>Watch where the critter hides!</p>
            <button type="button" class="play-btn" id="playBtn" aria-label="Play">▶</button>
          </div>
        </section>

        <div class="nogl" id="noGl" hidden>
          <p class="nogl-emoji" aria-hidden="true">🌸</p>
          <h2>This game needs 3D graphics</h2>
          <p>This browser or device has 3D graphics switched off. Try one of these instead:</p>
          <p><a href="../memory-game/">🧠 Memory Match</a><a href="../counting-game/">🔢 Count With Me</a></p>
        </div>
      </div>
      <p class="visually-hidden" id="srFocus" aria-live="polite"></p>
    </main>

    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li>Press the big ▶ button.</li>
        <li>Watch! A critter hops into a pink flower, and the flower closes.</li>
        <li>The flowers slide around. Keep your eyes on the right one.</li>
        <li>Tap the flower where the critter is hiding. Peekaboo!</li>
      </ol>
      <p>A wrong flower just holds a surprise, a goldfish or a ladybug, so there is no failing. The game starts with two flowers that stay still, and only adds flowers and moves as your child finds the critter first time. Five finds bring a little party. On a keyboard, the arrow keys choose a flower and Enter opens it. Nothing is saved.</p>
      <h3>What it practises</h3>
      <p>Following a moving object with the eyes, remembering where something is when it cannot be seen, and patience: the skills behind every good game of peekaboo, with Clover, Pip, Plum and Mango taking turns to hide.</p>
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
    <script src="rounds.js"></script>
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

<!-- file: games/peekaboo-pond/game.js -->
```js
/* Peekaboo Pond: the game itself.
 *
 * One big Play button, then round after round: a critter hops into a lotus
 * flower, the flowers slide around, and the child taps to find it. The
 * difficulty adapts by itself, and a wrong flower just holds a surprise.
 * Needs THREE, Toon, Critters, Sfx, Rounds and World, loaded before it.
 * Nothing is stored.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Rounds.say;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const smooth = (x) => x * x * (3 - 2 * x);
  const CRITTER_SIZE = 0.72;

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
  const bubble = $('bubble');
  const progress = $('progress');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const startScreen = $('startScreen');

  function noGl() {
    ['startScreen', 'hud', 'pondInput'].forEach((id) => { $(id).hidden = true; });
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
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);     // repeatable play, for testing
  const S = {
    seed: seedMatch ? +seedMatch[1] : Math.floor(Math.random() * 2147483647),
    phase: 'start',        // start, intro, shuffle, seek, reveal, found, home, party
    round: -1,
    level: 0,
    plan: null,
    n: 0,                  // flowers on the pond
    budAt: [],             // the flower in each slot
    slotOf: [],            // the slot of each flower
    hiderBud: 0,           // the flower the critter hides in
    onFlower: false,       // the round's critter is on (or in) its flower
    swapIndex: 0,
    swap: null,
    taps: 0,
    misses: 0,             // over the whole visit, so the surprises take turns
    row: [],               // critters found since the last party
    cursor: 0,
    keys: false,
    hop: null,
    surprise: null,
    pointer: null,
    timers: [],
  };

  // all four critters wait on the bank, each in its own spot
  const rigs = ORDER.map((kind, k) => {
    const rig = Critters.create(kind);
    rig.root.scale.setScalar(CRITTER_SIZE);
    rig.root.position.copy(world.home(k));
    world.actors.add(rig.root);
    return Object.assign(rig, { home: k, hopAt: -9, partyAt: -9, landAt: -9 });
  });
  const hider = () => rigs[S.plan.hider];
  const hiderKind = () => KINDS[ORDER[S.plan.hider]];

  function later(delay, fn) {
    S.timers.push({ at: time() + delay, fn });
  }
  function runTimers() {
    const t = time();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  function tell(text) {
    tellEl.textContent = text;
  }
  // the pond waits for a tap only while seeking
  function setPhase(phase) {
    S.phase = phase;
    pondInput.setAttribute('aria-busy', String(phase !== 'seek'));
  }

  function drawProgress() {
    progress.textContent = '';
    for (let k = 0; k < 5; k++) {
      const slot = document.createElement('span');
      const kind = S.row[k];
      slot.className = 'slot' + (kind ? ' full' : '');
      slot.textContent = kind ? KINDS[kind].emoji : '';
      progress.appendChild(slot);
    }
    progress.setAttribute('aria-label', say.progress(S.row.length));
  }

  /* ----------------------------------------------------------- rounds */
  function startGame() {
    startScreen.hidden = true;
    hud.hidden = false;
    pondInput.hidden = false;
    drawProgress();
    Sfx.play('voice', 1.2);
    pondInput.focus({ preventScroll: true });
    nextRound();
  }
  $('playBtn').addEventListener('click', startGame);

  // n flowers in bloom, one in each slot; pop sets them growing in fresh
  function layFlowers(n, pop) {
    world.setFlowers(n);
    S.n = n;
    S.budAt = [];
    S.slotOf = [];
    for (let i = 0; i < n; i++) {
      S.budAt[i] = i;
      S.slotOf[i] = i;
      world.placeFlower(i, world.slotX(i, n), 0);
      const f = world.flower(i);
      f.o = f.target = 1;
      f.wiggle = 0;
      if (pop) {
        f.grow = 0;
        world.ripple(world.slotX(i, n), 0, 0.9);
      }
    }
  }

  function nextRound() {
    S.round++;
    S.plan = Rounds.plan(S.seed, S.round, S.level);
    // a flower more or fewer: they all pop up fresh; otherwise each blooms where it stands
    if (S.plan.buds !== S.n) layFlowers(S.plan.buds, true);
    else for (let i = 0; i < S.n; i++) world.flower(i).target = 1;
    S.taps = 0;
    S.keys = false;
    S.hiderBud = S.budAt[S.plan.start];
    bubble.hidden = true;
    setPhase('intro');
    const k = S.plan.hider;
    later(0.7, () => jump(hider(), world.home(k), world.flowerTop(S.hiderBud), arrived));
  }

  // a big hop between the bank and a flower
  function jump(rig, from, to, done) {
    S.hop = { rig, from, to, at: time(), done };
    Sfx.play('hop');
  }

  function arrived() {
    S.onFlower = true;
    const top = world.flowerTop(S.hiderBud);
    world.ripple(top.x, top.z, 0.9);
    hider().hopAt = time() + 0.3;                 // a happy wave of a hop: here I am!
    later(0.4, () => Sfx.play('voice', hiderKind().voice));
    later(1.3, () => {
      tell(say.hiding(hiderKind().name));
      world.flower(S.hiderBud).target = 0;
      Sfx.play('poof');
    });
    later(2.0, () => {
      for (let i = 0; i < S.n; i++) world.flower(i).target = 0;
      Sfx.play('poof');
    });
    later(2.8, shuffle);
  }

  function shuffle() {
    setPhase('shuffle');
    S.swapIndex = 0;
    if (S.plan.swaps.length) tell(say.moving());
    nextSwap();
  }

  function nextSwap() {
    if (S.swapIndex >= S.plan.swaps.length) {
      later(0.3, seek);
      return;
    }
    const [i, j] = S.plan.swaps[S.swapIndex++];
    S.swap = { i, j, a: S.budAt[i], b: S.budAt[j], at: time() };
    Sfx.play('good', Math.min(S.swapIndex - 1, 8));       // a rising note for each swap
  }

  function swapDone() {
    const { i, j, a, b } = S.swap;
    world.slide(a, b, i, j, S.n, 1);
    S.budAt[i] = b;
    S.budAt[j] = a;
    S.slotOf[a] = j;
    S.slotOf[b] = i;
    S.swap = null;
    later(0.15, nextSwap);
  }

  function seek() {
    S.cursor = Math.floor((S.n - 1) / 2);
    bubble.textContent = hiderKind().emoji + '?';
    bubble.hidden = false;
    tell(say.seek(hiderKind().name));
    setPhase('seek');
  }

  function open(slot) {
    if (S.phase !== 'seek') return;
    const bud = S.budAt[slot];
    S.taps++;
    setPhase('reveal');
    world.flower(bud).target = 1;
    later(0.3, () => (bud === S.hiderBud ? found(bud) : miss(bud)));
  }

  function found(bud) {
    const rig = hider();
    const kind = hiderKind();
    rig.hopAt = time();
    Sfx.play('voice', kind.voice);
    world.burst(above(world.flowerTop(bud), 1.1), 'sparkle');
    rigs.forEach((r, k) => { if (r !== rig) r.hopAt = time() + 0.1 + k * 0.08; });    // the friends cheer
    bubble.textContent = kind.emoji + '!';
    tell(say.found(kind.name, S.taps));
    S.level = Rounds.nextLevel(S.level, S.taps);
    setPhase('found');
    later(1.8, () => {
      S.onFlower = false;
      jump(rig, world.flowerTop(bud), world.home(rig.home), home);
    });
  }

  // back on the bank, the critter fills the next spot in the row
  function home() {
    S.row.push(ORDER[S.plan.hider]);
    drawProgress();
    bubble.hidden = true;
    setPhase('home');
    if (S.row.length >= 5) later(0.3, party);
    else later(0.5, nextRound);
  }

  function party() {
    setPhase('party');
    tell(say.party());
    Sfx.play('win');
    rigs.forEach((r, k) => { r.partyAt = time() + k * 0.12; });
    if (!calm()) world.burst(new THREE.Vector3(0, 2.6, -2.4), 'confetti');
    later(2.8, () => {
      S.row = [];
      drawProgress();
      nextRound();
    });
  }

  // a wrong flower holds a surprise, and the surprises take turns
  function miss(bud) {
    const kind = Rounds.SURPRISE_ORDER[S.misses % 2];
    S.misses++;
    S.surprise = { kind, bud, at: time(), splashed: false };
    world.surprises[kind].visible = true;
    Sfx.play('pop');
    tell(say.miss(kind, S.taps >= 2));
    later(1.7, () => {
      world.flower(bud).target = 0;
      later(0.4, () => {
        world.surprises[kind].visible = false;
        S.surprise = null;
        setPhase('seek');
      });
    });
  }

  /* ------------------------------------------------------- every frame */
  function lookAt(rig, dt, chin, target) {
    let yaw = 0;
    let pitch = chin;
    if (target) {
      const p = world.toScreen(above(rig.root.position, rig.root.scale.y));
      yaw = clamp((target.x - p.x) / 220, -0.8, 0.8);
      pitch = clamp((target.y - p.y) / 400, -0.3, 0.35) + chin;
    }
    const k = 1 - Math.exp(-6 * dt);
    rig.look.yaw += (yaw - rig.look.yaw) * k;
    rig.look.pitch += (pitch - rig.look.pitch) * k;
  }
  stage.addEventListener('pointermove', (e) => { S.pointer = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { S.pointer = null; });

  function tick(t, dt) {
    runTimers();

    if (S.swap) {
      const k = Math.min(1, (t - S.swap.at) / S.plan.swapTime);
      if (k >= 1) swapDone();
      else world.slide(S.swap.a, S.swap.b, S.swap.i, S.swap.j, S.n, k);
    }

    // while waiting for a tap the flowers wiggle in turn; after two misses the right one wiggles hard
    const waiting = S.phase === 'seek' || S.phase === 'reveal';
    for (let i = 0; i < S.n; i++) {
      const f = world.flower(i);
      if (!waiting) f.wiggle = 0;
      else if (S.taps >= 2 && i === S.hiderBud) f.wiggle = 1;
      else f.wiggle = 0.5 * Math.max(0, 1 - Math.abs(((t * 1.2) % S.n) - S.slotOf[i]) * 2);
    }

    // the big hop between the bank and a flower, with its shadow on the ground below
    if (S.hop) {
      const H = S.hop;
      const h = hopCurve(t - H.at, 1.3, 0.62);
      const P = H.rig.root.position;
      if (!h || h.phase === 'land') {
        P.copy(H.to);
        H.rig.landAt = t;
        S.hop = null;
        world.shadow(0, 0, 0, 0, false);
        H.done();
      } else {
        P.lerpVectors(H.from, H.to, h.phase === 'air' ? h.p : 0);
        world.shadow(P.x, P.y, P.z, h.y, true);
        P.y += h.y;
        H.rig.sy = h.sy;
        H.rig.root.visible = true;
        H.rig.root.scale.setScalar(CRITTER_SIZE);
        H.rig.turn.rotation.y = turnToward(H.rig.turn.rotation.y, Math.atan2(H.to.x - H.from.x, H.to.z - H.from.z), 1 - Math.exp(-14 * dt));
        H.rig.update(t, dt);
      }
    }

    // the watchers follow the moving flowers with their eyes, or else the pointer
    const target = S.swap
      ? world.toScreen(new THREE.Vector3((world.slotX(S.swap.i, S.n) + world.slotX(S.swap.j, S.n)) / 2, 0.6, 0))
      : S.pointer;
    rigs.forEach((r) => {
      if (S.hop && S.hop.rig === r) return;
      if (S.onFlower && r === hider()) {
        // stands in its flower, ducking down as the petals close over it
        const f = world.flower(S.hiderBud);
        r.root.position.copy(world.flowerTop(S.hiderBud));
        r.root.scale.setScalar(CRITTER_SIZE * (0.45 + 0.55 * smooth(f.o)));
        r.root.visible = f.o > 0.3;
      } else {
        r.root.position.copy(world.home(r.home));
        r.root.scale.setScalar(CRITTER_SIZE);
        r.root.visible = true;
        if (S.phase === 'start' && t - r.hopAt > 1.5 && Math.random() < dt * 0.3) r.hopAt = t;   // a hop now and then, just for joy
      }
      let sy = null;
      let spin = 0;
      const cheer = hopCurve(t - r.hopAt, 0.5);
      if (cheer) {
        r.root.position.y += cheer.y;
        sy = cheer.sy;
      }
      if (t >= r.partyAt && t - r.partyAt < 2.4) {
        const p = hopCurve((t - r.partyAt) % 0.8, 0.6);
        if (p) {
          r.root.position.y += p.y;
          sy = p.sy;
          if (p.phase === 'air' && !calm()) spin = p.p * TAU;
        }
      }
      if (sy == null && t - r.landAt < 0.5) {
        const p = (t - r.landAt) / 0.5;
        sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);       // the landing jelly wobble
      }
      r.sy = sy;
      lookAt(r, dt, -0.18, target);
      if (spin) r.turn.rotation.y = r.look.yaw * 0.6 + spin;
      else r.turn.rotation.y = turnToward(r.turn.rotation.y, r.look.yaw * 0.6, 1 - Math.exp(-12 * dt));
      r.update(t, dt);
    });

    // the surprise in a wrong flower
    if (S.surprise) {
      const s = S.surprise;
      const k = t - s.at;
      const top = world.flowerTop(s.bud);
      const g = world.surprises[s.kind];
      if (s.kind === 'goldfish') {
        // a leap out of the flower and a dive into the pond in front of it
        const p = Math.min(k / 0.9, 1);
        g.position.set(top.x + 0.5 * p, top.y + 0.3 - 0.45 * p + Math.sin(Math.PI * p) - Math.max(0, k - 0.9) * 3, top.z + 1.5 * p);
        g.rotation.set(0, -1.25, (0.5 - p) * 1.6);
        if (k > 0.9 && !s.splashed) {
          s.splashed = true;
          world.ripple(top.x + 0.5, top.z + 1.5, 0.3);
          world.burst(new THREE.Vector3(top.x + 0.5, 0.1, top.z + 1.5), 'drops');
          Sfx.play('splash');
        }
        g.visible = g.position.y > -0.4;
      } else {
        // wakes up, flutters out for a look around, and settles back to sleep
        const up = k < 0.35 ? smooth(k / 0.35) : k < 1.3 ? 1 : 1 - smooth(Math.min(1, (k - 1.3) / 0.3));
        g.position.set(top.x, top.y + 0.15 + 0.75 * up + 0.05 * Math.sin(k * 6) * up, top.z + 0.1);
        g.rotation.set(0, 0.4 * Math.sin(k * 7), 0);
      }
    }

    world.ring(S.keys && S.phase === 'seek' ? world.slotX(S.cursor, S.n) : null);
    world.frame(S.n, dt, false);
  }

  /* -------------------------------------------------------------- input */
  pondInput.addEventListener('keydown', (e) => {
    const arrow = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!arrow && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (S.phase !== 'seek') return;
    if (arrow) {
      if (!S.keys) S.keys = true;                 // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, S.n - 1);
    } else if (S.keys) {
      open(S.cursor);
      return;
    } else {
      S.keys = true;
    }
    srFocus.textContent = say.focus(S.cursor, S.n);
  });

  pondInput.addEventListener('pointerdown', (e) => {
    S.keys = false;
    if (S.phase === 'seek') {
      const bud = world.flowerAt(e.clientX, e.clientY);
      if (bud != null) {
        open(S.slotOf[bud]);
        return;
      }
    }
    // a tap on a critter makes it giggle
    const r = rigs.find((rg) => rg.root.visible && world.hits(e.clientX, e.clientY, rg.root));
    if (r && !(S.hop && S.hop.rig === r)) {
      r.hopAt = time();
      Sfx.play('voice', KINDS[r.kind].voice);
    }
  });

  /* --------------------------------------------------------------- loop */
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
    tick(t, dt);
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
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();
  layFlowers(3, false);          // three flowers in bloom behind the Play button
  world.frame(3, 0, true);
  start();
})();
```

- [ ] **Step 4: Guard the new page's kit paths**

In `docs/tests/shared-3d.test.js`, change `for (const game of ['stepping-stones', 'number-line-hop']) {` to `for (const game of ['stepping-stones', 'number-line-hop', 'peekaboo-pond']) {`.

- [ ] **Step 5: Run the end-to-end player**

Run: `node $SP/tools/pp-e2e.cjs http://127.0.0.1:47123/games/peekaboo-pond/ $SP/shots`, then again with `PHONE=1` (tag `pp-phone`) and with `CALM=1` (tag `pp-calm`).
Expected: `E2E PASS` each time. Then look at the screenshots: the start screen; the seek (shut buds, the bubble showing a face and a question mark); a goldfish and a ladybug surprise; a find; and the party.

- [ ] **Step 6: Run the unit tests and commit**

Run: `node --test docs/tests/*.test.js`, which should all pass.

```bash
git add games/peekaboo-pond/index.html games/peekaboo-pond/game.js docs/tests/shared-3d.test.js
git commit -m "feat(peekaboo-pond): the playable game: hide, shuffle, seek, peekaboo"
```

---

### Task 4: Site wiring and final verification

**Files:**
- Modify: `docs/catalogue.js` (after the `drawing-pad` entry), `index.html` (after the Dot to Dot card; the tagline), `sitemap.xml` (after `dot-to-dot`), `manifest.json` (description)
- Regenerate: `games/index.html`, `for-teachers.html`, `404.html`, `sw.js`

- [ ] **Step 1: Catalogue entry.** Add this after the `drawing-pad` entry in `docs/catalogue.js`:

```js
    { slug: 'peekaboo-pond', name: 'Peekaboo Pond', emoji: '🌸', age: '3', mins: '5',
      skills: ['logic'],
      practises: 'Watching and remembering: following a hidden friend as the flowers slide around, then finding it. It gets trickier only as the child gets it right, and a wrong flower just holds a surprise.' },
```

- [ ] **Step 2: Homepage card.** Add this after the Dot to Dot card in the Little Learners grid of `index.html`:

```html
          <a class="game-card" href="games/peekaboo-pond/index.html">
            <span class="game-icon" aria-hidden="true">🌸</span>
            <span class="game-card-name">Peekaboo Pond</span>
            <span class="game-card-age">3+</span>
          </a>
```

Then change `31 hand-built games.` to `32 hand-built games.` in `index.html`, and `"31 free educational games` to `"32 free educational games` in `manifest.json`.

- [ ] **Step 3: Sitemap entry.** Add this after the `dot-to-dot` block in `sitemap.xml`:

```xml
  <url>
    <loc>https://playitmyway.com/games/peekaboo-pond/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 4: Regenerate**

Run: `node docs/build-pages.js`
Expected: `games/index.html` lists 32 games, and `sw.js` precaches the page and its three scripts as well.

- [ ] **Step 5: Final verification**
  - All unit tests pass.
  - The e2e player passes at computer and phone sizes, and with reduced motion.
  - The `file://` check shows the start screen with no errors except `/manifest.json`.
  - The Stepping Stones and Number Line Hop e2e players still pass.

- [ ] **Step 6: Commit**

```bash
git add docs/catalogue.js index.html sitemap.xml manifest.json games/index.html for-teachers.html 404.html sw.js
git commit -m "feat: Peekaboo Pond joins the catalogue, homepage, sitemap and offline cache"
```

---

### Task 5: Release

- [ ] **Step 1:** Run `git fetch origin` and confirm that `origin/main` is still the merge base.
- [ ] **Step 2:** Run `git checkout main && git merge --ff-only peekaboo-pond && node --test docs/tests/*.test.js`.
- [ ] **Step 3:** Run `git -c credential.https://github.com.username=viks120 push origin main`.
- [ ] **Step 4:** Poll `https://playitmyway.com/games/peekaboo-pond/` until it answers 200 with the right title. Then check the homepage card, "32 hand-built games", `sw.js` and the sitemap.
- [ ] **Step 5:** Run the Peekaboo Pond e2e player against the live site with `SET_ASIDE=https://static.cloudflareinsights.com/`. It must PASS.
- [ ] **Step 6:** Run `git branch -d peekaboo-pond`, then update the memory notes.
