# Stepping Stones: the site's first 3D game

**Date:** 2026-10-06
**Status:** Design approved by user section by section; this written spec awaits review

## Goal

A 3D game for ages 7+ in which a lovable critter hops across a pond, landing
only on stones that fit a maths rule ("Hop on the 3 times table"). It is the
site's first 3D game. It must keep every existing site rule: 100% static, no
build step at runtime, nothing stored, zero third-party requests, works offline
and when opened straight from a file (`file://`, the memory-stick case).

## Decisions made with user

- **Game type:** Stepping Stones, chosen over a maths runner, a free-roam
  island explorer and a compass-reading maze.
- **Characters:** all four candidates from the preview, chosen by the player at
  the start and switchable at any time: **Clover the Bunny, Pip the Frog, Plum
  the Baby Dino, Mango the Kitten.** Three were renamed from the preview
  (Bun-Bun, Rexy, Mochi) because those names belong to well-known characters.
- **Rule families in v1:** odd and even, times tables, number bonds. Word
  stones (nouns, rhymes) are deferred to a later version.
- **"Open source" means legally safe.** Everything in the game is either our
  own original work or open-source code whose licence clearly permits this use:
  - Three.js (MIT licence: free for any use, including commercial; the only
    condition is that its copyright and licence notice travel with the code,
    so the full notice sits at the top of the bundled file);
  - all characters, scenery, sounds and game code are original, made in code;
    no downloaded models, textures, images or sound files;
  - text uses the site's self-hosted Fredoka font (SIL Open Font Licence).

  The repo's own licensing is unchanged.
- **Technical approach:** Three.js r186, trimmed to the parts the game uses and
  copied into the repo as one classic script. Rejected: loading Three.js as
  published (2.1 MB of ES modules, which Chrome refuses to load over `file://`)
  and writing our own 3D engine (weeks of work for a worse result).

## Gameplay

### A pond

- **Grid:** 8 rows by 4 columns of stones between a near bank (start) and a far
  bank (goal). The rule is shown in a banner at the top.
- **Moves:** from a stone, the critter may hop to any stone touching it,
  including diagonals and backwards. From the near bank it may hop to any stone
  in the first row; from any stone in the last row, onto the far bank.
- **Guidance:** reachable stones are marked with a pulsing ring.
- **Right stone:** the critter lands with squash and stretch, a musical note
  rising one step per row plays, sparkles burst, the message strip gives the
  reason ("21 = 3 × 7"), and the friends on the far bank hop and cheer.
- **Wrong stone:** the stone wobbles and sinks, the critter splashes in, and the
  message strip explains why using the nearest right answers ("22 isn't in the 3
  times table: 3 × 7 = 21 and 3 × 8 = 24."). The critter climbs back onto its
  last safe stone. The sunk stone stays gone for the rest of that pond. There
  are no lives and no game over.
- **Never stranded:** only wrong stones sink and the critter only ever stands
  on right stones, so the route back to the guaranteed path always remains.
- **Far bank:** the critter and friends celebrate. Stars depend on splashes in
  that pond: none gives 3, one gives 2, two or more gives 1. Buttons: **Next
  pond**, **Same pond, new stones**, **All ponds**.
- **Hint (💡):** toggles a line under the rule with the list or tip for that pond.

### The 16 ponds

| Family | Pond (menu title) | Rule banner | Right stones | Wrong stones (decoys) |
|---|---|---|---|---|
| Odd & even | Even to 20 | Hop on **even** numbers | even, 2–20 | odd, 1–19 |
| | Odd to 20 | Hop on **odd** numbers | odd, 1–19 | even, 2–20 |
| | Even to 100 | Hop on **even** numbers | even, 10–100 | odd, 11–99 |
| | Odd to 100 | Hop on **odd** numbers | odd, 11–99 | even, 10–100 |
| Times tables | 2, 5, 10, 3, 4, 6, 7, 8, 9 (one pond each) | Hop on the **n times table** | n × 1 … n × 12 | 1 ≤ d < n × 12, never a multiple of n, weighted to near misses |
| Number bonds | Make 10 | Hop on stones that **make 10** | a + b = 10, 1 ≤ a ≤ 9 | a + b = 9 or 11 |
| | Make 20 | Hop on stones that **make 20** | a + b = 20, 1 ≤ a ≤ 19 | a + b = 19 or 21 |
| | Make 100 | Hop on stones that **make 100** | a + b = 100, a and b multiples of 5 | sums of 90, 95, 105 or 110, multiples of 5 |

Menu order is the table order. **Even to 20** carries a "Start here" badge.
Every pond is open; nothing is locked.

**Near misses** for times tables are drawn first from: right answers ±1 and ±2;
numbers sharing a last digit with a right answer (14 for the 4s); multiples of
the neighbouring tables that are not multiples of n; numbers ending in 5 for
the 10s. For parity ponds, decoys are preferably ±1 from right stones in the
same or next row. Decoys never exceed n × 12, because 39 *is* in the 3 times
table even though the game stops at 3 × 12.

**Stone labels:** the number ("21"), or the sum without spaces ("7+3",
"35+65"). Five characters at most.

**Explanation formats** (shown in the message strip and checked by tests):

| Case | Example |
|---|---|
| Times, right | `21 = 3 × 7` |
| Times, wrong, above n | `22 isn't in the 3 times table: 3 × 7 = 21 and 3 × 8 = 24.` |
| Times, wrong, below n | `2 isn't in the 3 times table: it starts at 3 × 1 = 3.` |
| Parity, right | `14 is even: it ends in 4.` |
| Parity, wrong (even pond) | `13 is odd: it ends in 3. Even numbers end in 0, 2, 4, 6 or 8.` |
| Parity, wrong (odd pond) | `14 is even: it ends in 4. Odd numbers end in 1, 3, 5, 7 or 9.` |
| Bonds, right | `7 + 3 = 10` |
| Bonds, wrong | `6 + 3 = 9, not 10. 6 + 4 makes 10.` |

**Hints:** times tables list every right answer (`3 · 6 · 9 · … · 36`); even
and odd ponds give the last-digit tip; Make 10 lists `1+9 · 2+8 · 3+7 · 4+6 ·
5+5`; Make 20 says "Use make 10: 3 + 7 = 10, so 13 + 7 = 20"; Make 100 says
"Think in tens: 30 + 70 = 100, so 35 + 65 = 100".

### Pond generation and the route guarantee

Ponds are generated fresh every time from a seeded random number generator
(the game seeds from `Math.random()`; tests use fixed seeds).

1. **Route first:** pick a start column, then for each next row move the column
   by −1, 0 or +1 within bounds. At least 2 of the 7 moves change column, so
   the route is never a straight line.
2. **Right stones** go on every route cell. Each other cell also becomes a right
   stone with probability 0.15, which makes branches and dead ends, as long
   as its row stays at 2 right stones or fewer. Every row has 1 or 2 right
   stones.
3. **Decoys** fill every other cell, near misses first.
4. **Checks:** no label repeats within a row; no label appears more than twice
   in the pond; a breadth-first search over right stones (8-neighbour moves,
   near bank to row 0, last row to far bank) must reach the far bank. A
   failing pond is regenerated; the tests prove failures are rare.

### Screens and flow

1. **Who's hopping today?** The four critters on lily pads. Tapping one makes
   it hop and squeak in its own voice; **Next** goes to the pond menu.
2. **Pond menu:** pond buttons grouped by family, the "Start here" badge, and
   stars earned in this visit shown on each button. Stars live in memory only
   and vanish on reload, like everything else on the site.
3. **Play:** the pond plus an overlay HUD: critter button (opens a four-critter
   picker), rule banner, 💡 hint, a pond-menu button, and the message strip.
4. **Pond cleared:** dialog with stars and the three buttons listed above.
   **Next pond** follows the menu order; after the last pond (Make 100) it
   returns to the pond menu.

**Switching critters** works on every screen. In a pond, the new critter appears
in a puff of sparkles on the same stone, and the far-bank friends become the
other three. Esc closes the picker and dialogs. The browser's back button
leaves the page as normal; the game does not touch history.

## Look and sound

- **Style:** pastel toon shading (`MeshToonMaterial` with a 3-step ramp),
  coloured outlines one shade darker than each fill (an inverted hull pushed
  out in view space so mesh scale cannot thin it), sky-coloured fog. Light-only,
  like the rest of the site.
- **Critters** (as previewed): each is built from spheres, capsules, cones and
  tubes, with a rig of root → turn → squash groups.
  - **Idle life:** breathing, blinking, and eyes and head following the pointer.
    Between hops the critter faces the player chin-up so its face is visible.
  - **Hops:** crouch, flight and landing curves with squash, stretch and a
    jelly wobble; ears swing with the hop.
  - **Splash reactions, one each:** Clover shakes her ears dry; Pip swims a
    happy circle (frogs like water); Plum blows a bubble; Mango puffs up and
    shakes dramatically.
  - **Celebration:** spin hops with the friends.
- **Scene:** water with twinkles; lily pads, some with pink flowers; reeds and
  cattails; grassy banks over a dirt edge; stones turned on a lathe profile that
  bob gently. Labels are painted on the stone tops: Fredoka 700 drawn to a
  canvas texture, ink `#2b2a5e` with a white halo for legibility.
- **Camera:** pitched about 38° (0.66 rad) and following the critter. On narrow
  screens the vertical field of view widens so all four columns fit at the
  critter's own row. The aim point sits further ahead on tall screens so the
  critter sits low with more pond above it. These values were tuned in the
  mockup; phone and desktop screenshots confirmed the framing.
- **Sound:** all synthesised with Web Audio, with no audio files:
  - a hop "boing";
  - a pentatonic note per right stone, rising row by row;
  - an "uh-oh", a filtered-noise splash and a "glub" for a wrong stone;
  - a jingle on the far bank;
  - a "poof" when switching critters;
  - a squeak in each critter's own pitch when it is chosen.

  Every sound returns early when `window.pimwMuted` is set, so the site's sound
  toggle works as on every other game.

## Controls and accessibility

- **Pointer:** a tap anywhere on the pond is projected onto the water plane, and
  the nearest reachable stone within 0.95 units of that point is chosen. This
  forgives small fingers. Taps further away say "Too far! {critter name} can
  only hop to a stone touching this one."
- **Keyboard:** the arrow keys move a highlight ring one step at a time around
  the critter's 3 × 3 neighbourhood, skipping sunk stones. On the near bank it
  moves along the first row; from the last row, ↑ reaches the far bank. Enter
  or Space hops to the highlighted stone.
- **Screen readers:**
  - the canvas is hidden from assistive technology;
  - a polite live region announces the highlighted stone ("12, ahead on the
    left");
  - the message strip, also a polite live region, announces every result and
    explanation;
  - the menus and dialogs are real buttons, and the dialog moves focus to its
    first button when it opens.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, there are no spins,
  confetti or shakes and the camera follows without swooping. Hops still
  animate, because they are the game.
- **No 3D available:** if the WebGL renderer cannot start, or the context is
  lost, a friendly message ("This game needs 3D graphics, which this browser
  or device has switched off") links to two other 7+ games instead of showing
  a blank box.
- **Performance:**
  - device pixel ratio capped at 2;
  - geometries and materials shared between stones and critters;
  - blob shadows rather than shadow maps;
  - rendering stops while the tab is hidden and resumes when it is visible.

## Architecture

New folder `games/stepping-stones/`. All scripts are classic (not modules) and
load in order with relative paths, so the page works over both `http(s)` and
`file://`.

| File | Purpose | Depends on | Interface |
|---|---|---|---|
| `index.html` | The page: head and meta, back link, title block, game stage with HUD markup, how-to-play, trust footer, app bar, script tags | the scripts below, `tokens.css`, `components.css`, `components.js` | n/a |
| `three.min.js` | Three.js r186, trimmed, IIFE defining global `THREE`; full MIT licence text as the leading comment | nothing | `THREE.*` |
| `critters.js` | The four critters, their rig and animations | `THREE` | `Critters.KINDS` (id → name, kind, emoji, voice pitch); `Critters.create(kind)` → rig with `root`, `turn`, `look`, `sy`, `earX`, `update(t, dt)`, `react(name)` |
| `ponds.js` | Pond definitions, generator, route checker, explanations, hints. Pure logic: no `THREE`, no DOM | nothing | `Ponds.LIST`; `Ponds.generate(id, seed)` → grid of `{ label, ok, why }`; `Ponds.hasRoute(grid)`; `Ponds.rng(seed)`. Exported to `window.Ponds` in the browser and `module.exports` in Node |
| `game.js` | Renderer, scene, camera, input, screens and flow, sound, HUD wiring | `THREE`, `Critters`, `Ponds`, DOM | none: no globals |

Also new:

- `docs/vendor/three-entry.js` lists exactly which Three.js exports the bundle
  contains, with the one-line `npx esbuild` command that rebuilds
  `three.min.js` from the pinned `three@0.186.1`. `docs/` is skipped by the
  service-worker precache.
- `docs/tests/stepping-stones.test.js` holds the pond tests (see Testing).

**Measured bundle size:** 563 KB minified, 146 KB gzip, **122 KB brotli** (what
the host actually sends). It becomes the largest file on the site and is cached
for offline after the first visit.

**Stage sizing:** the game stage fills the card width (max 960 px), with
height `clamp(420px, 72vh, 640px)`. In the site's full-screen mode (`.pimw-fs`)
it grows to the viewport.

## Site integration

- **`docs/catalogue.js`:** add `stepping-stones`, emoji 🐸, age 7, about 10
  minutes, skills `numbers` and `logic`. The `practises` text must describe
  only what ships: "Odd and even, times tables 2–10 and number bonds to 10, 20
  and 100, by hopping only on stones that fit the rule and planning a route
  across the pond. A wrong stone explains itself before you try again."
- **Regenerate** with `node docs/build-pages.js`: games index, grown-ups page,
  404 page and `sw.js`. The precache list picks up the new folder automatically.
- **By hand:**
  - homepage card in the 7+ section;
  - `sitemap.xml` entry for `/games/stepping-stones/`;
  - the game count from 29 to 30 in the `index.html` tagline and the
    `manifest.json` description. The generated pages update themselves from
    the catalogue.
- **Page head:** follows the existing game pages:
  - title of 58 characters or fewer in the "<Game> – Free <hook> | Play It My
    Way" pattern;
  - description of 104–157 characters;
  - canonical, Open Graph and Twitter tags;
  - theme colour violet `#7c3aed` for the 7+ band.

  A "How to play" section of roughly 150 words avoids the thin-content
  problem the SEO audit found on older pages.
- **Repo hygiene:** no names of other games or brands anywhere in code,
  comments or commits.

## Testing

1. **Pond tests:** plain Node with the built-in `node:test`, no installs. Run
   with `node --test docs/tests/`. For every pond type across at least 2,000
   fixed seeds:
   - the grid is 8 × 4;
   - a route exists, checked by an independent search;
   - every right stone passes the rule and every decoy fails it, recomputed in
     the test from the label rather than read from `ok`;
   - decoys stay within the stated ranges (never above n × 12);
   - each row has 1–2 right stones;
   - no label repeats in a row or appears more than twice in a pond;
   - labels are at most 5 characters;
   - the route changes column at least twice;
   - every explanation matches its format and names the correct neighbouring
     answers.
2. **Browser tests:** headless Chrome with SwiftShader, run locally with tooling
   kept out of the repo.
   - The page loads with zero console errors and zero requests to any other
     origin.
   - A scripted player crosses a whole pond using only the keyboard and the
     announced labels, and reaches the "Pond cleared" dialog with 3 stars.
   - A deliberate wrong hop produces the right explanation, and the stone stays
     sunk.
   - Switching critters mid-pond keeps the position and updates the friends.
   - The pond menu, "Next pond" and "Same pond, new stones" work.
   - The page works when opened as a file.
   - Phone (390 × 844) and desktop (1280 × 900) screenshots are checked by eye.
3. **Existing checks:** `node docs/build-pages.js` runs clean; it already
   parse-checks the generated `sw.js`.
4. **Real device:** headless Chrome renders 3D in software, so one real try on
   a phone or tablet is recommended before pushing `main`.

## Delivery

Everything goes on the `stepping-stones` branch, as small commits in logical
steps. Nothing deploys until the user pushes `main`.

## Out of scope for v1

- Word stones (nouns and verbs, rhymes).
- Remembering stars or progress between visits; the site stores nothing.
- Deep links to a specific pond (for example `#times-3` for teachers).
- Outfits or colour choices for the critters.
- Times tables 11 and 12.

## Risks

- **First-load weight:** 122 KB extra compressed download on slow
  connections. Mitigated by the service-worker cache and by the page frame
  rendering before the game script runs.
- **Old school devices without WebGL:** covered by the fallback message.
- **Software rendering in tests** can hide GPU-specific problems, so a real
  device check is part of delivery.
- **Low-end Android performance:** pixel-ratio cap, shared geometry, no shadow
  maps, and pausing while hidden.
