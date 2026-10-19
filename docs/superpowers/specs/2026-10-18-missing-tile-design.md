# Missing Tile: a 3D matrix-reasoning puzzle for ages 7+

**Date:** 2026-10-18 (revised 2026-10-19 after a three-lens design review)
**Status:** Design and build contract. Five agents build from this note in parallel (logic, world, controller + page, icon + wiring, end-to-end player); an integrator joins the parts; the coordinator releases.

## What it is

A 3×3 grid of tiles lies on a wooden table. Each tile shows a few shapes. The bottom-right tile is missing, and a tray of answer tiles sits in front. The child works out what changes along the rows and down the columns, then picks the one tile that fits the gap.

This is matrix reasoning, the shape of puzzle used in non-verbal reasoning papers. Every puzzle is made by a generator and checked by code so that **exactly one** answer tile fits any rule the game knows. It is practice, not a test: nothing is scored, nothing is saved, and the page never says "IQ", "test prep" or "11+". We never copy a published test item.

- **Age band:** 7+ (Brain Boosters, violet band). Slug `missing-tile`, name **Missing Tile**.
- **Helper:** one of the four critters sits behind the board, watches the picked tile, cheers a right answer and shakes its head at a wrong one. The critters are final; do not restyle them.
- **Nothing stored.** Ticks and stars last only this visit. No cookies, no localStorage, no fetch, no third-party requests. Classic scripts only (the site must open over `file://`).

## The puzzles

### Cells

A cell (one tile) has four attributes:

| attribute | values, in this order | ordered? |
|---|---|---|
| `shape`  | `ball`, `cube`, `pyramid`, `star`, `heart`, `cross` | no |
| `colour` | `red`, `yellow`, `green`, `blue`, `purple`, `pink` | no |
| `count`  | `1`, `2`, `3` (numbers) | yes |
| `size`   | `small`, `medium`, `big` | yes |

A puzzle has, for each attribute, a **value set** of three values: for `count` and `size` always all three, in order; for `shape` and `colour` three of the six drawn by seed, and a colour set never holds both `red` and `pink`, nor both `blue` and `purple` (the closest hues). The grid is nine cells in row-major order (row 0 at the top, far from the viewer); cell 8 (bottom-right) is the gap.

### Rule kinds

Every attribute has exactly one rule kind in a puzzle. `fits(values9, kind, attr)` judges the nine values of one attribute:

| kind | fits when |
|---|---|
| `same` | all nine values are equal |
| `row`  | each row is constant, and the three rows hold three different values |
| `col`  | each column is constant, and the three columns hold three different values |
| `grow` | `attr` is `count` or `size`, and every row reads `VALUES[attr][0]`, `[1]`, `[2]` left to right; always false for `shape` and `colour` |
| `each` | every row holds three different values, and all three rows hold the same three values (rows only; the generator makes Latin squares, so columns hold each value once too, and a test pins that) |

`KINDS = ['same', 'row', 'col', 'grow', 'each']` is public API (the tests pin the order). `explains(grid9)` returns, per attribute in `ATTRS` order, the first kind in `KINDS` order that fits, or `null` if some attribute fits no kind. It is a yes/no explainability probe, never a recovery of the intended rules: a `grow` grid also fits `col`, and a `col` grid also fits `each`. **No test compares `explains(grid)` to `puzzle.rules`.**

A puzzle's **tier** is the number of attributes whose kind is not `same` (the *ruled* attributes): 1, 2 or 3. `ruled(puzzle)` lists those rules in `ATTRS` order.

**Independence.** Two ruled attributes must not be perfectly correlated, or a two-rule level plays as one rule. For every pair of ruled attributes the nine `(value, value)` pairs over the grid must be nine distinct pairs. The generator guarantees it (below) and `check()` reports a breach. The schedule never pairs `row`+`row`, `col`+`col`, `col`+`grow` or `grow`+`grow`; two `each` attributes in one puzzle use opposite cycle directions, which makes the two Latin squares orthogonal.

**Value assignment.** `row` and `col` assign the value set to the three rows or columns in a seeded random permutation (so `col` on count is not always 1, 2, 3 left to right). `grow` is fixed. `each` builds a 3×3 Latin square: row 0 a seeded random permutation of the value set, then each later row the previous one shifted left or right (direction by seed); a second `each` in the same puzzle shifts the other way.

### Why the answer is unique

With the gap at corner cell 8, every kind determines the gap's value from the eight known cells, and any two kinds that both fit the known cells force the same value. So no distractor built from a different value can ever be explainable: uniqueness holds by construction. `check()` still verifies it as an invariant (the answer is explainable, no distractor is), and the tests fuzz the generator through `check()`. Patterns a child might perceive that the grammar does not model (diagonals, column-wise growth, copying a neighbour) always agree with the forced value on any grid this grammar makes; they were checked by hand in the review and need no checker kinds. If the gap ever moves off a corner or a non-forcing kind is added, extend the checker first.

### Options

Distractors are built from the answer `A = grid[8]`, never drawn freely.

- The **wrong value** of a ruled attribute is the value a neighbour of the gap carries, so "copy the tile next door" is a real temptation: cell 5 (above) for `row`; cell 7 (left) for `col` and `grow`; cell 5 or cell 7 by seed for `each`. Each differs from `A` under its kind.
- A **foil** is `A` with exactly one `same` attribute (chosen by seed) set to another value of that attribute's value set (chosen by seed).
- **Tier 1** (ruled `X`; 4 options): `A`; `A` with `X` set to each of the two other values of `X`'s set; one foil.
- **Tier 2** (ruled `X`, `Y`; 5 options): `A`; `A` with `X` wrong; `A` with `Y` wrong; `A` with both wrong; one foil.
- **Tier 3** (ruled `X`, `Y`, `Z`; 6 options): `A`; one per ruled attribute with only that attribute wrong (3); `A` with the first two ruled attributes (in `ATTRS` order) both wrong; one foil.

Options are shuffled by seed; `puzzle.answer` is `A`'s index. All options are distinct by construction. Options may equal cells already on the board (in tier 1 every option is a copy of some board cell); **tests must not forbid that.** `check()` reports a puzzle whose option count is wrong, whose options are not distinct, whose `options[answer]` is not `grid[8]`, that lacks for some ruled attribute the option differing from `A` in that attribute alone, or that has any number of foils other than one.

### Levels

36 levels in three groups of twelve. Each level is a fixed `{ tier, seed, rules }` where `rules` lists the ruled attributes and their kinds exactly; the seed draws only the value sets, the row/column assignments, the Latin squares, the foil, the `each` neighbour choice and the option order. So level 7 is the same puzzle for everyone, the ramp is designed rather than lucky, and the tests pin the table.

| level | rules | level | rules | level | rules |
|---|---|---|---|---|---|
| 1 | colour row | 13 | colour row, shape col | 25 | colour row, shape col, count each |
| 2 | shape row | 14 | shape row, count grow | 26 | shape row, count grow, colour each |
| 3 | count grow | 15 | size row, colour col | 27 | size row, colour col, shape each |
| 4 | size row | 16 | colour row, size grow | 28 | colour row, size grow, shape each |
| 5 | colour col | 17 | shape row, colour each | 29 | shape row, count col, colour each |
| 6 | shape col | 18 | count col, shape each | 30 | count row, colour col, size each |
| 7 | size grow | 19 | size grow, colour each | 31 | colour row, shape each, count each |
| 8 | count col | 20 | colour row, count each | 32 | shape col, colour each, size each |
| 9 | shape each | 21 | shape each, colour each | 33 | size grow, colour each, shape each |
| 10 | colour each | 22 | colour col, size each | 34 | count row, shape each, colour each |
| 11 | size col | 23 | count each, shape each | 35 | colour col, count each, size each |
| 12 | count each | 24 | count grow, shape each | 36 | count grow, shape each, colour each |

`GROUPS = [{ title: 'One rule', from: 0, to: 12 }, { title: 'Two rules', from: 12, to: 24 }, { title: 'Three rules', from: 24, to: 36 }]`. Seeds are the logic agent's choice (distinct integers); every one of the 36 grids must differ from every other.

### Words

- `describe(cell)` → `"two big red stars"`, `"one small blue ball"`, `"three medium green crosses"`: count word (one/two/three), size, colour, shape, plural when the count is more than one (balls, cubes, pyramids, stars, hearts, crosses).
- `attrWord(attr)` → `"shape"`, `"colour"`, `"number of shapes"`, `"size"`.
- `ruleText({ attr, kind })`, one sentence a seven-year-old can act on:
  - `same`: `"Every tile has the same shape."` / `"Every tile has the same colour."` / `"Every tile has the same number of shapes."` / `"Every tile's shapes are the same size."`
  - `row`: `"Each row has its own shape."` / `"Each row has its own colour."` / `"Each row has its own number of shapes."` / `"Each row has its own size of shape."`
  - `col`: as `row` with `"Each column has its own …"`.
  - `grow`: `"Along each row the number grows: one, two, three."` / `"Along each row the shapes get bigger: small, medium, big."`
  - `each`: `"Every row has one of each shape."` / `"Every row has one of each colour."` / `"Every row has one of each number: one, two and three."` / `"Every row has one of each size: small, medium and big."`
- `whyWrong(puzzle, i)` → `null` when `i === puzzle.answer`; otherwise `{ attr, rule, text }` for the first attribute in `ATTRS` order whose rule is not `same` **and** whose value in option `i` differs from the answer's; if none, the first `same` attribute that differs. `rule` is that attribute's entry in `puzzle.rules`; `text` is `"Not that one. Look at the colour: each row has its own colour."` (the attribute word, a colon, then the rule sentence with its first letter lowercased).
- `hintSteps(puzzle)` → `tier + 2`. `hint(puzzle, step)` → `{ text, spot }`, cumulative, one new fact per step:
  - step 0: `"Look at the colour."` (`attrWord` of the first ruled rule); `spot` = that rule's kind.
  - step k for k in 1..tier: the sentences of the first k ruled rules joined with single spaces; `spot` = the kind of ruled rule k (1-based).
  - step tier + 1 (the last): `"The answer is two big red stars."`; `spot` = `null`.
  - a step past the last is clamped to the last.
- `readGrid(puzzle)` → `"Top row: one big red star, two big red stars, three big red stars. Middle row: …, …, …. Bottom row: …, …, and the gap."`
- `readOptions(puzzle)` → `"Answer tiles, left to right: one big red star; two big red stars; three big red stars; one small red star."` (descriptions joined with `"; "`, then a full stop).
- `say`:
  - `start(level)` → `"Level 3. Which tile fits the gap?"` (1-based)
  - `picked(cell, i, n)` → `"Tile 2 of 5: two big red stars."` (i is 0-based)
  - `chosen(cell)` → `"Two big red stars. Tap it again, or the gap, to place it."`
  - `pickFirst()` → `"Pick a tile from the tray first."`
  - `right(firstTry)` → `"That's it! First try!"` / `"That's it!"`
  - `wrong(why)` → `why.text`
  - `hint(text)` → `"Hint: " + text`
  - `done(level, firstTry, hints)` → `"Level 3 done, with a hint."` (hints is 1) / `"Level 3 done, with hints."` (more) / `"Level 3 done, first try!"` (no hints, first try) / `"Level 3 done!"`
  - `out()` → `"That tile is already out."`
  - `none(dir)` → `"No tile further left."` / `"No tile further right."` (only those two)
  - `tries(n)` → `"Tries 2"`
  - `menu()` → `"Pick a puzzle."`

## Files and APIs (the contract)

`games/missing-tile/` holds four files, loaded in this order:

```html
<script src="../shared/3d/three.min.js"></script>
<script src="../shared/3d/toon.js"></script>
<script src="../shared/3d/critters.js"></script>
<script src="../shared/3d/sound.js"></script>
<script src="../shared/voice.js"></script>
<script src="matrix.js"></script>
<script src="world.js"></script>
<script src="game.js"></script>
<script src="../../components.js"></script>
```

### `matrix.js` → `window.Matrix` / `module.exports` (pure: no DOM, no THREE)

Module wrapper exactly as `games/log-jam/logjam.js` (an IIFE taking `root`, `module.exports` in Node, `root.Matrix` in the page). `rng` is the `rng` function in `games/stepping-stones/ponds.js`, verbatim.

```js
Matrix.ATTRS            // ['shape', 'colour', 'count', 'size']
Matrix.VALUES           // { shape: [6], colour: [6], count: [1, 2, 3], size: ['small', 'medium', 'big'] }
Matrix.KINDS            // ['same', 'row', 'col', 'grow', 'each']
Matrix.MISSING          // 8
Matrix.LEVELS           // 36 × { tier, seed, rules: [{ attr, kind }, ...ruled only] }
Matrix.GROUPS
Matrix.OPTIONS          // { 1: 4, 2: 5, 3: 6 }
Matrix.rng(seed)        // → () => [0, 1)
Matrix.make(level)      // → puzzle, deterministic, level 0..35: generate(rng(LEVELS[level].seed), { rules, options: OPTIONS[tier], seed }) then puzzle.level = level
Matrix.generate(rand, { rules, options, seed })   // → puzzle with level -1 (seed null when not given); draws value sets, assignments, foil, order; redraws on any check() problem; throws after 500 attempts
Matrix.fits(values9, kind, attr)
Matrix.explains(grid9)          // { shape: kind, colour: kind, count: kind, size: kind } or null
Matrix.check(puzzle)            // [] or plain-English problems (each one pinned by a test with a broken puzzle)
Matrix.ruled(puzzle)            // the non-same rules in ATTRS order
Matrix.describe(cell)
Matrix.attrWord(attr)
Matrix.ruleText(rule)
Matrix.whyWrong(puzzle, i)
Matrix.hint(puzzle, step)       // { text, spot }
Matrix.hintSteps(puzzle)
Matrix.readGrid(puzzle)
Matrix.readOptions(puzzle)
Matrix.say
```

A puzzle:

```js
{
  level, tier, seed,
  values: { shape: [3], colour: [3], count: [1, 2, 3], size: ['small', 'medium', 'big'] },
  rules: [{ attr, kind }, ...],      // four entries in ATTRS order, `same` included
  grid: [9 cells],                   // cell 8 is the answer
  options: [cells],                  // 4, 5 or 6 distinct cells, shuffled
  answer,                            // index into options
}
```

A cell is `{ shape, colour, count, size }`; `count` is a number.

### `world.js` → `window.World` (draws; decides nothing)

**Coordinates.** Board centre at the origin; cell (row r, column c) has its centre at `x = c − 1`, `z = r − 1`, row 0 far from the camera (−z). Tile pitch 1.0, tiles 0.92 square and 0.08 thick, tops at `y = 0.08`, in a shallow wooden frame. Tray slots are tiles of the **same size and pitch** (never scaled down), in reading order (left to right, then the next row): on the **tall** layout the tray lies below the board, rows of three centred on x = 0 at z = 2.3 and z = 3.3 (4 options → 2 + 2 at x = ±0.5; 5 → 3 + 2; 6 → 3 + 3); on the **wide** layout two columns to the board's right at x = 2.6 and 3.6, rows at z = −1, 0, 1 (4 → 2 × 2 on z = ±0.5; 5 → 2 + 2 + 1; 6 → 3 × 2). `World.layout(aspect)` → `'wide'` when aspect > 1.05 else `'tall'`.

**Camera.** A `THREE.OrthographicCamera` (now in the bundle) pitched 62° down, yaw 0, so every tile and shape is drawn at the same pixel scale wherever it sits: `size` is a ruled attribute and perspective must not fake a size step. `World.frameView(camera, w, h, insets, layout)` is pure: it fits the scene's bounding points (frame corners at the table and at tile-top height, every tray slot, the critter's head point) into the canvas rectangle left free by the insets (CSS px: `top`, `bottom`, `left`, `right`), sets the frustum and `zoom`, and returns `{ x, z, zoom }` (`layout` defaults to `World.layout(w / h)`). The tall scene is about 3.3 units wide and 5.6 projected units tall, so on a 390 × 844 phone (stage 350 × 641, insets 6 / 64 / 76) the scale is about 90 px per unit: tiles about 83 px, shapes about 16 / 23 / 34 px.

**Shapes.** One unit geometry per shape, built once in `create()` and scaled per size on the mesh: ball `SphereGeometry(1, 18, 12)`; cube `BoxGeometry(1.5, 1.5, 1.5)`; pyramid `ConeGeometry(1, 1.4, 3)` (three sides, so its silhouette is a triangle); star an `ExtrudeGeometry` of a five-point `THREE.Shape` (outer 1, inner 0.45, depth 0.4, `bevelSegments` ≤ 2, `curveSegments` ≤ 6) lying flat; heart an extruded heart 2 wide, depth 0.4, lying flat; cross two `BoxGeometry(2, 0.5, 0.6)` bars crossed. Radii (half-widths) `small 0.09`, `medium 0.13`, `big 0.19`; every shape rests on the tile top. Layout depends on the count alone, whatever the size: one at the tile centre; two at `x = ±(r + 0.02)`; three at `(±(r + 0.02), z = +0.5 r)` and `(0, z = −1.25 r)`. Eighteen toon fills (colour × size) via `Toon.toon(fill, darker)`, shared by every cell; after `Toon.addOutlines` the world sets each fill's hull `material.uniforms.thickness.value` to 0.012 / 0.017 / 0.024 for small / medium / big so small stars keep their points. The cube, cross bar and pyramid have flat per-face normals, which would push an edge-on wall sideways and leave them without a flank outline, so their hulls use a copy of the geometry with smoothed normals, scaled up 7%, kept with the shared geometries. Colours: red `#ef4444`, yellow `#f5b921`, green `#34c76f`, blue `#3b82f6`, purple `#a78bfa`, pink `#ff8fab`.

**Look.** Scene background and `.stage` background both `#f7e8d3`; a warm wooden table and frame; tile tops parchment `#f3eadb` with rim `#e2d6c4`. The gap at cell 8 is a dark-wood recess `#8b5e34` with a cream `#fff3c4` glow plate that pulses only while no option is selected (and never in calm mode). Selection: the tile lifts 0.08 with a white `#ffffff` flat ring under it, never a palette colour. `spot(kind)`: the lit tiles' tops go `#ffffff` and rise 0.05 while every other board tile's top dims to `#e4dccd` (a luminance cue, so it works for colour-blind children): `row`, `grow` and `each` light the bottom row, `col` the right column, `same` the whole board. `out(i)`: the tile sinks 0.05 under a translucent grey box (`Toon.flat('#7a7470', 0.5)`) so its shapes keep their colours; no ✗ badge (it would look like the cross shape). That box exists, hidden, on every tray tile and is excluded from raycasting (`raycast = () => {}`), because three's Raycaster hits invisible meshes and its taller top face would steal taps along the lower edge of the tile in front. Selection, gap glow and spot are flat plates or per-tile top materials, never edits to the shared shape materials. No shadows; pixel ratio ≤ 2.

**The critter's seat.** `W.seat()` returns a `THREE.Group` that exists from `create()` and survives `build()`: on the tall layout behind the board's far-left corner at (−1.1, 0, −1.95), scaled 0.35; on the wide layout left of the board at (−2.4, 0, 0.6), scaled 0.5; turned to face the camera, so a rig added at (0, 0, 0) with rotation 0 looks at the viewer. Its head point (y = 1.25 × scale plus the hop height) is in the framing set, so it is never cropped and never in front of a tile. `W.lookYaw(i)` → radians for `rig.look.yaw` towards option i (i = −1 → towards the gap), computed from the seat's world matrix; game.js clamps to ±1.3 and eases as Log Jam's `tick()` does.

**Time.** `t` and `dt` are **seconds**. game.js computes `t = performance.now() / 1000` once per frame and passes that same `t` to every World call; the world stores start times and compares them with the `t` given to `update(t, dt)`. The world never calls `performance.now`, `Date.now`, `setTimeout` or `requestAnimationFrame`. Every duration a method returns is already shortened when `calm(true)` is on. Reference durations (calm in brackets): `fly` 0.45 (0.2); `accept` 0.6 (0.3); `reject` 0.8 = shake 0.35 + return (0.35); `drop` 0.3 (0.12).

```js
World.create(canvas)        // → W, or null when WebGL is unavailable
World.layout(aspect)
World.frameView(camera, w, h, insets, layout)
W.build(puzzle)             // removes the previous board, tray, tile-in-gap and effects and frees them with Toon.dispose(group, KEEP)
                            // (KEEP = the shared geometries, materials, outline materials and textures made once in create());
                            // draws grid[0..7], the gap at cell 8 and options in slot order; clears selection (-1), outs, spot, drag
                            // and any running flight. Never reads puzzle.answer. Safe at any moment, mid-animation included.
W.resize({ top, bottom, left, right })   // insets in CSS px; recomputes the layout from the canvas, moves the tray slots if it changed, re-frames
W.update(t, dt); W.render(); W.calm(on)
W.select(i)                 // option i lifts with its white ring; -1 none
W.out(i)                    // applies at once, persists through select/drag/reject until build()
W.spot(kind | null)
W.optionAt(clientX, clientY)    // → option index or -1 (outed options too)
W.overGap(clientX, clientY)     // → true within 0.75 units of the gap centre on the table plane (children drop "near", not "on")
W.optionScreen(i); W.gapScreen(); W.tileScreen(i)   // → { x, y } client px of the centre (tileScreen for board cells 0..8)
W.drag(i, clientX, clientY) // the tile follows the pointer's table point, floating 0.5 units up-screen (−z) of it and lifted 0.15 so a fingertip does not hide it
W.drop(i, t)                // → seconds: floats back to its slot; no state change
W.fly(i, t)                 // → seconds: option i lifts out of its slot and flies into the gap from wherever it is drawn now (a tile mid-drag can be flown); the slot stays empty (faint shadow); i stays selected
W.accept(i, t)              // → seconds: option i, already in the gap, settles flush; the board glows; sparkles and, unless calm, confetti (accept owns the effects); selection cleared as select(-1)
W.reject(i, t)              // → seconds: option i shakes in the gap, then flies back to its slot; its out state is untouched
W.seat(); W.lookYaw(i)
```

The world's top level defines constants and functions only (no `document`, textures or renderer until `create()`), so a Node `vm` test can load `three.min.js`, `toon.js` and `world.js` and call `World.layout` and `World.frameView`.

**THREE names.** Use only these bundle exports: `Scene`, `OrthographicCamera`, `WebGLRenderer`, `Color`, `Fog`, `HemisphereLight`, `DirectionalLight`, `Group`, `Mesh`, `InstancedMesh`, `BoxGeometry`, `PlaneGeometry`, `SphereGeometry`, `ConeGeometry`, `CylinderGeometry`, `TorusGeometry`, `CircleGeometry`, `RingGeometry`, `Shape`, `ExtrudeGeometry`, `MeshBasicMaterial`, `MeshToonMaterial` (via Toon), `CanvasTexture`, `SRGBColorSpace`, `Raycaster`, `Plane`, `Vector2`, `Vector3`, `Matrix4`, `Quaternion`, `Euler`, `BackSide`. Not in the bundle, do not use: `MathUtils`, `DoubleSide`, `FrontSide`, `AmbientLight`, `PointLight`, `MeshStandardMaterial`, `MeshLambertMaterial`, `ShapeGeometry`, `BufferGeometry`, `BufferAttribute`, `Clock`, `Box3`, `Sprite`, `AdditiveBlending`, `TetrahedronGeometry`, `OctahedronGeometry`, `EdgesGeometry`, `Line`. **No build agent edits `docs/vendor/three-entry.js` or `games/shared/3d/three.min.js`** (the coordinator added `OrthographicCamera` and rebuilt the bundle before the build).

### `game.js` (the controller) and `index.html`

Page: copy Log Jam's page skeleton (head and meta, `.stage` sizing and fullscreen rule, menu, HUD, done card, `.nogl`, how-to, footer, app bar, service-worker snippet) with the violet band (`--band: var(--color-violet); --band-tint: var(--color-violet-tint); --band-tint-deep: #c4b5fd; --band-deep: #4c1d95;`, theme-color `#7c3aed`), `.stage { background: #f7e8d3 }`, the title `<h1><img class="title-icon" src="../../icons/games/missing-tile.svg" alt="" width="40" height="40"> Missing Tile</h1>`. `.tell` may wrap to three lines (`line-height: 1.3`, no `white-space: nowrap`); every message and hint step is at most three short sentences. The done card is compact (23 px title, 14 px rules, buttons in a wrapping row) and `.done` aligns it to the bottom (`align-items: flex-end`), which on a 390 × 844 phone leaves the finished bottom row in view above it; on a wide stage `fit()` adds the class `wide` and the card sits at the right over the tray, which is finished with, so the whole board stays in view; on a stage 640 px tall or less it sits at the top, covering the top row rather than the one with the tile just placed. `#tries` is a pill hidden until the first wrong pick. The page title is `Missing Tile – Free 3D Pattern Puzzle for Kids | Play It My Way`; meta, Open Graph and Twitter copy never say IQ, test prep or 11+.

IDs and hooks (the tests and the end-to-end player rely on them): `#stage`, `#view` (canvas), `#board` (`role="application"`, `tabindex="0"`, `touch-action: none`, the input layer, hidden on the menu), `#hud`, `#hudTop`, `#tell` (`aria-live="polite"`), `#srFocus` (visually hidden, `aria-live="polite"`), `#menu`, `#pickRow` with `.pick[data-kind]`, `#levelGroups` with `.level-btn[data-level]` (1-based), `#done` with `#doneTitle`, `#doneSub`, `#doneWhy`, `#nextLevel`, `#again`, `#allLevels`; `#menuBtn`, `#hintBtn`, `#levelName`, `#tries`, `#noGl` (links to Frozen Pond and One Line Draw).

`#board` attributes, all set synchronously in the call that changes them, before any `later()`: `data-state` ∈ `pick` (waiting for a choice) / `busy` (animating) / `done`; `data-sel` = the selected option index, `-1` for none; `data-out` = `''` or ascending outed indices joined by `,`; `data-hints` = hint steps revealed; `data-tries` = wrong picks; `data-level` = the 1-based level. `aria-label`: `"The puzzle board. The arrow keys pick an answer tile; Enter puts it in the gap. G reads the puzzle, H gives a hint."`

**Boot.** `const m = /[?&]level=(\d+)/.exec(location.search)`. `World.create(canvas)` or the `#noGl` fallback; `pickCritter('frog', true)` (the rig goes into `W.seat()` at position 0; the seat already carries the scale); build level 0 behind the menu as Log Jam's `background(0)`; then `startLevel(+m[1] − 1)` if it is 1..36 and set `window.mtTest = { optionScreen: (i) => W.optionScreen(i), gapScreen: () => W.gapScreen(), tileScreen: (i) => W.tileScreen(i), puzzle: () => S.puzzle }` (absent otherwise, the `window.peTest` pattern of Plans & Elevations); else `showMenu()`.

**State.** `S.screen` (`menu` | `play`), `S.puzzle`, `S.level`, `S.sel` (−1 none), `S.outs` (Set), `S.tries`, `S.hintStep`, `S.state`, `S.drag`, `S.tap`, `S.timers` (Log Jam's `later(delay, fn)` / `runTimers()` from the frame loop; never `setTimeout`), `S.results: Map(level → 'tick' | 'star')`.

**startLevel(i).** `S.puzzle = Matrix.make(i)`; `W.build`; `sel = -1`, outs cleared, tries 0, hintStep 0, state `pick`; menu hidden, HUD and `#board` shown; `#levelName` = `"Level n"`; `#tries` hidden; `#hintBtn` `aria-disabled="false"`; `tell(say.start(n))`; `srSay('')` then `later(0.6, () => srSay(say.start(n) + ' ' + Matrix.readGrid(p) + ' ' + Matrix.readOptions(p)))`; `Voice.say(say.start(n))` when `Voice.ready()`; `fit()`; focus `#board` (`preventScroll`). The critter watches the gap while nothing is selected.

**Selecting.** `select(i, how)`: `S.sel = i`, `W.select(i)`, `data-sel`; `how = 'sr'` → `srSay(say.picked(cell, i, n))`; `how = 'full'` → that plus `tell(say.chosen(cell))`. Option k sits in slot k, so `ArrowRight`/`ArrowDown` go to the next live (not outed) option and `ArrowLeft`/`ArrowUp` to the previous, on every layout; from −1, right/down goes to the first live option and left/up to the last; no wrap; at an end `srSay(say.none('left' | 'right'))`. Arrows select with `'sr'` (a keyboard player needs no "tap it again" line and would otherwise hear every selection twice); a finger selects with `'full'`.

**Placing.** `place(i)` runs only when `data-state === 'pick'`; an outed i → `tell(say.out())`; otherwise state `busy`, `W.spot(null)`, `d = W.fly(i, t)`, `later(d, land)`. `land`: if `i === answer`: `W.accept(i, t)`, `Sfx.play('good')` then `later(0.3, win)`, the critter `react('puff')` and a `hopCurve` cheer, `Voice.say`, `tell(say.right(tries === 0))`, outcome recorded (below), state `done`, `later(2.2 or 1.2 calm, done card)`. Otherwise: `tries + 1`, `#tries` shown with `say.tries(n)`, `S.outs.add(i)`, `W.out(i)`, `d = W.reject(i, t)`, `Sfx.play('uhoh')`, the critter `react('shake')`, `tell(say.wrong(Matrix.whyWrong(p, i)))`, `Voice.say` the same, and `later(d, ...)`: state `pick`, then, if the pick came from the keyboard, `select(nearest live, 'sr')` where nearest = the smallest live index above i, else the largest below (the wrong message stays on `#tell`); if it came from a finger or the mouse, `select(-1)`, so the next tap on the gap can never place a tile the child did not choose (`place(i, via)` records `via` as `'key'` or `'pointer'`).

**Enter / Space on `#board`.** `sel === -1` → `tell(say.pickFirst())`; else `place(sel)`.

**Pointer (on `#board`).** `pointerdown` only in `pick` with no drag (mouse: button 0); focus `#board`. `i = W.optionAt`: an outed option → remember a tap `{ out: true }`; a live option → `wasSel = (S.sel === i)`, `select(i, 'full')` if not, then start the drag `{ i, id, x0, y0, wasSel, moved: false }` with `setPointerCapture` (as Log Jam's pointerdown, try/catch); no option → remember a tap `{ gap: W.overGap(x, y) }`. `pointermove` with a drag: past 12 px `moved = true`; `W.drag(i, x, y)`. `pointerup` with a drag: not moved → a tap on that option: `wasSel` → `place(i)`, else it just stays selected; moved → `W.overGap(x, y)` ? `place(i)` : `W.drop(i, t)`. `pointerup` with a remembered tap within 12 px: `out` → `tell(say.out())`; `gap` → `sel >= 0 ? place(sel) : tell(say.pickFirst())`. `pointercancel` / `lostpointercapture` end a drag as a drop, never a pick. So a double-tap selects then places, mirroring arrow-then-Enter.

**Gating.** In `busy` and `done`: pointerdown, taps, Enter/Space, arrows and H are ignored silently; G still reads; `#menuBtn` works at any time (clears `S.timers`, drops any drag, `W.spot(null)`, state back to `pick`, `showMenu()`). While `S.drag` is set, keys are ignored and a second pointerdown is ignored. Every pick path checks `data-state === 'pick'` first, so a tap and an Enter in the same frame cannot both fly. Key auto-repeat (`e.repeat`) is ignored for everything but the arrows: a held H or Enter must not run through the hints or the tray. Pointerdowns are ignored for 0.35 s after `startLevel` (a double-tap on Next must not reach the tray under it). `pointerup`/`pointercancel` on `window` end a drag as a drop when capture was refused and the pointer was released off the board. `tell()` called with the words already showing clears the strip and sets them again next frame, so a repeated "Pick a tile from the tray first." is announced and noticed again.

**Hints.** `#hintBtn` or `H`, only in `pick` and while `hintStep < hintSteps`: `h = Matrix.hint(p, hintStep)`, `tell(say.hint(h.text))`, `W.spot(h.spot)`, `Sfx.play('good', 2)`, `Voice.say`, `hintStep + 1`, `data-hints`; at the last step `#hintBtn` gets `aria-disabled="true"` and further presses do nothing. `W.spot(null)` also runs on `fly` and (inside the world) on `build`.

**G** reads: `srSay('')`, then on the next frame `srSay(say.start(n) + ' ' + readGrid + ' ' + readOptions)`.

**Outcome.** On a win: `outcome = (tries === 0 && hintStep === 0 && !S.results.has(level)) ? 'star' : 'tick'`; `S.results.set(level, star beats tick)`. The done card: `#doneTitle` = `"First try! ★"` when this win's outcome is `star`, else `"That's it!"`; `#doneSub` = `say.done(n, tries === 0, hintStep)`; `#doneWhy` = the ruled rules' sentences joined with single spaces; `#nextLevel` hidden on level 36; focus `#nextLevel` (or `#again`). Next level → `startLevel(i + 1)`; Play it again → `startLevel(i)` (a replay can earn a ✓, never a ★); All levels → menu. Level buttons: `aria-label` `"Level 7"` / `"Level 7, done this visit"` / `"Level 7, done this visit, first try with no hints"`, with aria-hidden ✓ / ★ glyphs; `.menu-note` `"✓ done this visit · ★ first try, no hints"`.

**Sound and voice.** `Sfx.play('voice', KINDS[kind].voice)` when a critter is chosen in the menu (not when quiet) and 0.5 s after the win sound. `Voice.say` (on-device only, follows `pimwMuted`) for the start line, a wrong pick, each hint and the right answer; never for selections.

**Frame loop and fit.** As Log Jam: `requestAnimationFrame`, `visibilitychange`, `dt` clamped to 0.05, `runTimers()`, the critter's gaze and cheer in `tick()`, `world.update`, `world.render`. `fit()` sets insets `{ top: HUD row bottom + 8 (min 64), bottom: #tell's rendered height + 16 (min 76), left: 6, right: 6 }`; it runs on resize and whenever `tell()` changes the text, so the strip never covers the tray's near row.

**Copy.** How to play (parents read it): what the gap is, "A row goes across. A column goes down.", the two-step tap, the keyboard, the hints, that a wrong tile greys out and explains itself, that nothing is saved. What it practises: `"Matrix reasoning: spotting what changes along the rows and down the columns, then finding the tile that fits. It is the shape of puzzle used in non-verbal reasoning papers, but this is practice, not a test: nothing is scored and nothing is saved."`

## Wiring (the icon-and-wiring agent)

- `icons/games/missing-tile.svg`: a 3×3 grid of little coloured shapes with the bottom-right cell empty and the answer tile floating towards it. Must pass `docs/tests/icons.test.js`: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` first, exactly one comment starting `<!-- Missing Tile: `, colours only from `tokens.css` hexes plus `#ef4444 #fbbf24 #4ade80 #60a5fa #ff8fab #8b5e3c #94a3b8 #ffffff` and ink `#33302e` (the icon's purple is `#7c3aed` or `#ede9fe`, never the scene's `#a78bfa`), every filled shape outlined in ink at width 2.5 with round joins and caps, bare lines 1.5–7 wide, no text, gradients, opacity, style attributes or `<g>` left open.
- `docs/catalogue.js`: after `frozen-pond`: `{ slug: 'missing-tile', name: 'Missing Tile', age: '7', mins: '10', skills: ['logic'], practises: 'Matrix reasoning: spotting what changes along the rows and down the columns of a 3×3 grid, then finding the one tile that fits the gap. 36 puzzles from one rule to three, each checked by computer to have exactly one answer, with hints that name the rule and a wrong tile that explains itself. Practice, not a test: nothing is scored or saved.' }`. The 7+ band outcome becomes `'Time, grammar, coding, maps, patterns and logic.'` in `catalogue.js` **and** in the hand-maintained `index.html`.
- `index.html`: a card after Frozen Pond in the 7+ grid (same markup as its neighbours); tagline 45 → 46. `manifest.json` description 45 → 46. `sitemap.xml`: a `games/missing-tile/` entry after frozen-pond. Then `node docs/build-pages.js` (regenerates `games/index.html`, `for-teachers.html`, `404.html`, `sw.js`; never hand-edit those). The integrator re-runs it after the merge so `sw.js` precaches the game's files.

## Review findings folded in (2026-10-19)

Three read-only reviewers (puzzle logic, controller and page, world) went over the built game after the integrator had it passing. Fixed from their findings: the answer option was the very same object as `grid[8]` (now a copy); `generate()` gave a `TypeError` for zero or four ruled attributes (now a `RangeError` naming the rule); three `check()` messages were unpinned; held keys auto-repeated through the hints and the tray; the done card covered the finished bottom row on phones and desktops; a wrong tap auto-selected a neighbour the child never chose; a drag whose capture was refused could stick; the tray's hidden out-veil stole taps along the lower edge of the tile in front; cubes, crosses and pyramids had no flank outline; the selection ring's far arc hid under the frame lip; the frame's slab and lip shared a face plane; `lookYaw` allocated every frame. Verified clean by probe: 54,000 generated puzzles with no explainable distractor and thirteen child-plausible alternative readings that never force a wrong tile; resource lifetime over 72 builds; raycasting with the orthographic camera; framing at 320×560 to 2560×900.

## Checks

- `docs/tests/missing-tile.test.js` (Node, zero dependencies, loads the shipped `matrix.js`): the 36 levels, groups and tiers, the table's first and last entries, `grow` only ever on count or size, no forbidden pairs; `make()` deterministic; for every level: `check()` clean, option count by tier, distinct options, `options[answer]` deep-equals `grid[8]`, every rule in `puzzle.rules` fits (`fits(values, rule.kind, rule.attr)`), the tier's number of ruled attributes, `explains(grid)` non-null, and for every distractor `explains(grid with that option in cell 8)` is null; the distractor structure (one option per ruled attribute differing in that attribute alone; exactly one foil); nine distinct value pairs for every pair of ruled attributes; every `each` attribute a full Latin square (columns too); colour sets never red + pink or blue + purple; every attribute ruled at least four times and no two grids equal; `fits()` truth tables for every kind (including `fits([1,2,3,1,2,3,1,2,3], 'grow', 'count')` true, `grow` false for colour, the `col` ⊂ `each` and `grow` ⊂ `col` relations); `explains` order; a fuzz of at least 600 seeds for every distinct rule set in the table through `generate()` + `check()`, never hitting the attempt cap; `generate` throws on an impossible spec; a `check()` negative test with one broken puzzle per reported problem; every word of `describe`, `attrWord`, `ruleText`, `whyWrong` (for every level and every distractor the named attribute really differs, prefers a ruled one, `rule` is that attribute's entry, `text` ends with the lowercased sentence; `whyWrong(p, answer)` null), `hint` (every step, `spot`, clamping), `hintSteps`, `readGrid`, `readOptions` and `say`; page wiring (script order as above, the title icon, no `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie`/`fetch`/`XMLHttpRequest`/`WebSocket`/`import(` in the game's scripts or page); a `vm` test that loads `three.min.js`, `toon.js`, `world.js` as `shared-3d.test.js` does and asserts `World.layout(1.5) === 'wide'`, `World.layout(0.6) === 'tall'`, and that `frameView(new THREE.OrthographicCamera(), 390, 600, { top: 64, bottom: 76, left: 6, right: 6 }, 'tall')` returns finite numbers.
- `node --test docs/tests/*.test.js` all green, including `icons.test.js` and `shared-3d.test.js`. Before integration only the logic agent's own test can be fully green; the world and controller agents pass `shared-3d.test.js`; the icon-and-wiring agent passes the icon style tests (the page-wiring and card-count tests need every part). Nobody stubs another agent's file to make a test pass.
- **End-to-end player** at `docs/e2e/missing-tile.e2e.cjs` (committed; `docs/` is outside the precache walk). `puppeteer-core` is required from `%TEMP%\pimw-puppeteer\node_modules\puppeteer-core` (`process.env.PUPPETEER` overrides), Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` with args `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --autoplay-policy=no-user-gesture-required`; `page.goto(url, { waitUntil: 'load', timeout: 180000 })`. Env: `URL` (page URL, default the repo's `file://` path), `ROOT` (repo root for requiring `matrix.js`), `ALLOW` (comma-separated request-URL prefixes allowed besides the page's own origin, `file:` and `data:`; default `https://playitmyway.com/`), `PHONE=1` (390 × 844, `isMobile`, `hasTouch`, taps via `page.touchscreen.tap`), `CALM=1` (`emulateMediaFeatures` reduced motion), `SHOTS` (screenshot folder), `LEVELS` (optional subset for quick runs). It stubs `speechSynthesis` with an online and a local voice (as the other games' players do) and asserts every utterance used the local one. It fails on any `pageerror`, console error or disallowed request, and finishes by asserting `[localStorage.length, sessionStorage.length, document.cookie]` is `[0, 0, '']`.
  - One page load at `?level=1`, advancing with `#nextLevel`, so ticks and stars accumulate. For each level it computes `Matrix.make(level)` in Node, waits for `#tell` = `say.start`, and plays by keyboard: on level 1 first `Enter` with nothing selected → `say.pickFirst()`, `ArrowLeft` → the last option and `say.none('left')` at the end; then arrows to the answer (checking `#srFocus` = `say.picked`), `Enter`, `#tell` = `say.right(...)`, the done card's title, sub and why, then Next.
  - Plan: a wrong pick first on levels 2, 15 and 30 (`#tell` = `say.wrong(Matrix.whyWrong(p, i))`, `data-out` contains i, `data-sel` has moved to the nearest live option by keyboard and to −1 by touch, `#tries` reads `say.tries(1)`); one hint on 5 and two on 25 (texts = `say.hint(Matrix.hint(p, k).text)`); on level 12 every hint step, the last naming the answer and `#hintBtn` `aria-disabled`; a mouse drag of the answer into the gap on level 3 (desktop) and a drop short of the gap first; on the phone, taps: tap the answer twice on most levels and tap-then-gap on some. Expected menu marks at the end (`#allLevels`): ★ on every level except ✓ on 2, 5, 12, 15, 25, 30.
  - Phone run: asserts `tileScreen(4).x − tileScreen(3).x ≥ 80` and `optionScreen(1).x − optionScreen(0).x` within 2 px of that pitch; saves screenshots at level 1 and level 30 with a hint spot showing, for a human look at small stars, hearts and crosses.
  - Desktop, `PHONE=1` and `CALM=1` are three sequential runs; never more than two headless Chromes at once; give finishes long waits (SwiftShader is slow).
