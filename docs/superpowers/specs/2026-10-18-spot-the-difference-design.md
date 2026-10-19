# What's Different? (3+) and Spot the Difference (7+): two picture-comparison games on one scene kit

**Date:** 2026-10-18
**Status:** Approved in conversation. Vikrant chose two versions over one adaptive game, flat 2D pictures over 3D or a hand-drawn fixed set, and "no clock, just subtler" for the older game. This note is the build contract for the agents that make it and for the coordinator who wires it into the site.

## Goal

Two spot-the-difference games that share one scene kit, so a three-year-old and an eight-year-old each get a game pitched at them, and the pictures never run out.

| | **What's Different?** | **Spot the Difference** |
|---|---|---|
| Folder | `games/whats-different/` | `games/spot-the-difference/` |
| Band | 3+ Little Learners, teal (`--color-teal`, theme-color `#0f766e`) | 7+ Brain Boosters, violet (`--color-violet`, theme-color `#7c3aed`) |
| Catalogue | `age: '3'`, `mins: '5'`, `skills: ['logic']` | `age: '7'`, `mins: '10'`, `skills: ['logic']` |
| Differences a picture | 2 to 4, big and obvious | 5 to 8, down to a changed shade |
| Items a picture | 6 to 10, well spaced | 12 to 18, busier |
| Menus and scores | none; the page opens on a picture | a round counter and stars |
| Hints | automatic, with a spoken "Look here!" | a Hint button, free, and a "Show me the rest" link |
| Voice | yes, on-device only | no |
| Gets harder | one step after a round with no hint | every few rounds |

Both games keep the site's rules: nothing stored, no fetch, no third-party requests, works over `file://`, keyboard playable, and only original artwork drawn in code.

## How a round plays

1. Two pictures of the same scene appear: side by side when the viewport is wider than it is tall, stacked on a portrait phone. Each is a 4:3 inline `<svg viewBox="0 0 400 300">`. A row of hollow dots, one per difference, shows how many there are to find.
2. The child taps anything, in either picture. A tap inside an unfound difference's region finds it: a ring appears around that spot in **both** pictures, one dot fills, a ping sounds, and the live region says "Found the frog! 2 of 5." A tap anywhere else makes a small ripple that fades and a soft "boop". Wrong taps cost nothing and are not counted anywhere.
3. When every dot is filled: confetti (not under `prefers-reduced-motion`), a fanfare, "You found them all!", and a **Next picture** button. The next round starts on that tap, never by itself.

Taps within 250 ms of a find are ignored, so a double tap does not count as a wrong tap.

### Layout

- Landscape or desktop (viewport wider than tall): the two pictures sit side by side, the pair at most 960 px wide.
- Portrait: the pictures stack, and **both must fit on screen at once** below the back link, title and intro, down to a 390×667 phone. They shrink to achieve that, but never below 280 px wide; on a screen too short even for that, the page scrolls instead. Pinch zoom stays available (no `maximum-scale`).
- `touch-action: manipulation` on the pictures, so a tap is not delayed and a double tap does not zoom.

### What's Different? (3+)

- Opens straight into the first picture, like Peekaboo Pond. No play button, no level picker, no stars.
- A short intro line above the pictures: "Tap what's different!"
- The voice speaks the four lines in the strings table through `games/shared/voice.js`, which only ever uses a voice that runs on the device.
- **Automatic hints.** Fifteen seconds after the picture appears, or after the last find, with nothing found since, one unfound difference pulses in both pictures for two seconds and the voice says "Look here!". If it is still not found, the pulse comes back every twelve seconds. There is no hint button.
- **Levels 0 to 7**, adapting like Peekaboo Pond: one up after a round with no automatic hint, one down after a round with two or more, otherwise the same. Never below 0 or above 7. Wrong taps never change the level.

| Level | Differences | Items | Kinds of difference | Smallest item that may carry a difference (longer half-extent) |
|---|---|---|---|---|
| 0 | 2 | 6 | missing, colour | 16 |
| 1 | 2 | 7 | missing, colour, swap | 16 |
| 2 | 3 | 7 | missing, colour, swap | 16 |
| 3 | 3 | 8 | missing, colour, swap, size | 16 |
| 4 | 3 | 9 | missing, colour, swap, size | 16 |
| 5 | 4 | 9 | missing, colour, swap, size | 16 |
| 6 | 4 | 10 | missing, colour, swap, size | 16 |
| 7 | 4 | 10 | missing, colour, swap, size | 12 |

- Themes cycle pond, meadow, farm, pond, and so on from the first round.

### Spot the Difference (7+)

- Intro line: "Find all 5 differences. Tap them in either picture." (the number follows the tier).
- A toolbar under the pictures: **Hint** (a candy button), a round counter ("Round 3") and the stars earned so far this visit; a small text button **Show me the rest** sits at the end of the toolbar.
- **Hint** pulses one unfound difference for two seconds in both pictures and counts as one hint used. Hints are never limited.
- **Show me the rest** draws dashed rings round every unfound difference, ends the round with no stars, and shows the Next picture button.
- **Stars** for a round: 3 with no hint, 2 with one hint, 1 with two or more, 0 after Show me the rest. The done card says, for example, "Round 3 done! ★★☆ One hint used." Stars add up on the toolbar for the visit only; nothing is stored.
- **Tiers** by round number:

| Tier | Rounds | Differences | Items | Kinds of difference | Smallest item that may carry a difference |
|---|---|---|---|---|---|
| 0 | 1 to 2 | 5 | 12 | missing, colour, swap, size, flip | 10 |
| 1 | 3 to 5 | 6 | 14 | those, and count, state | 10 |
| 2 | 6 to 9 | 7 | 16 | those, and shade, shift | 10 |
| 3 | 10 on | 8 | 18 | those, and tilt | 8 |

- Themes come from the seed, never the same theme twice in a row (the rule is in Interfaces).

### Seeds

`?seed=N` fixes the first round's seed; round *n* (counting from 1) uses seed + *n*. Without it the page draws a seed from `Math.random()`. The end-to-end player loads `scenes.js` in Node with the same seed to know every difference.

## The pictures

### Themes and items

Three themes, drawn from the site's own world, so there is nothing to license. Each scene has a flat backdrop that is the same in both pictures and a set of **items** placed on it. Every item is a small parametrised drawing: kind, position, scale, flip, colour, state and count. Four items are common to every theme; each theme adds its own, at least ten kinds in all.

Backdrops, by `Draw.backdrop(theme)`: pond is a pale sky, a far green bank with two soft hills, blue water over the lower half and a sandy near bank along the bottom; meadow is a pale sky, two green hills and a flat green field; farm is a pale sky, a yellow-green field and a brown track along the bottom.

| Theme | Items (lane) |
|---|---|
| common | sun (sky), cloud (sky, 2 or 3 puffs), bird (sky), the critters Clover, Pip, Plum and Mango (ground), each its own kind |
| pond | lily pad (water, with or without a bud), frog (water, eyes open or shut), fish (water, 2 or 3 stripes), duck (water), boat (water, flag or none), turtle (water), dragonfly (air), reeds (ground, 3 or 4 stalks), stone (ground), flower (ground, open or bud) |
| meadow | tree (back, 2 to 4 apples), bush (back), fence (back, 3 or 4 posts), flower (ground, open or bud), mushroom (ground, 3 or 4 spots), butterfly (air), bee (air), ladybird (ground, 3 or 4 spots), snail (ground), kite (sky), basket (ground, 2 or 3 apples) |
| farm | barn (back, door open or shut, 1 or 2 windows), hay bale (ground, 1 or 2 stacked), cow (ground, 2 or 3 patches), pig (ground), sheep (ground, eyes open or shut), chick (ground), hen (ground), pumpkin (ground), scarecrow (back, hat or none), tractor (ground), fence (back, 3 or 4 posts) |

The critters are the four flat pictures in `icons/critters/`, placed as `<image href="<critters>clover.svg" x="-32" y="-30" width="64" height="60">` so they match the rest of the site and load over `file://`. They are final and are not redrawn. Everything else is drawn in `draw.js` in the house style: ink `#33302e` outlines of width 2.5 in picture units with round joins and caps, flat fills from the scene palette, no gradients, no text, no filters.

Every kind carries, in `scenes.js`:

| Field | Meaning |
|---|---|
| `name` | the spoken phrase: "the frog", "the lily pad", "Clover" |
| `lane` | `sky`, `back`, `air`, `water` or `ground` |
| `w`, `h` | half-width and half-height in picture units at scale 1 |
| `family` | its silhouette: swaps only go between kinds of the same lane and a different family (frog → duck, flower → mushroom, Clover → Pip; the four critters are four families) |
| `asym` | drawn facing one way, so a flip shows |
| `colours` | the palette names it may be painted, or none |
| `states` | its two states, or none |
| `counts` | `[min, max]` of its counted part, or none |
| `themes` | the themes it appears in |
| `max` | how many of it one scene may hold (sun 1, barn 1, tree 2, cloud 3, and so on) |

A kind with no `colours` is never picked for colour or shade; no `states`, never for state; no `counts`, never for count; not `asym`, never for flip.

**Lanes** fix where an item's **base** (the bottom of its bounding box) may lie, so a tall tree or barn stands on the horizon with its top in the sky, and a boat is never in the sky: sky 30 to 90, back 150 to 175, air 100 to 190, water 170 to 255, ground 200 to 295 (pond's bank is its ground lane). Within its lane an item's *x* is random, and its whole bounding box stays inside the picture. Items are drawn back to front: sky, back, air, water, ground, and within a lane by base, so an item lower on the page is in front.

An item's `x`, `y` is the centre of its bounding box; the drawer draws in a local box of ±`w`, ±`h` around 0,0.

### The palette

Eight hues in a wheel, plus three neutrals:

| Name | Hex | | Name | Hex |
|---|---|---|---|---|
| red | `#ef4444` | | purple | `#a78bfa` |
| orange | `#fb923c` | | pink | `#ff8fab` |
| yellow | `#fbbf24` | | brown | `#8b5e3c` |
| green | `#4ade80` | | grey | `#94a3b8` |
| teal | `#2dd4bf` | | white | `#ffffff` |
| blue | `#60a5fa` | | ink | `#33302e` |

Two hues are **far** when they are three or four steps apart on the wheel (red and green, yellow and blue, orange and purple) and **near** when they are one step apart (red and orange, blue and purple, green and teal). Backdrop fills and the fixed parts of items (a frog's eyes, a tree's trunk) may use other flat colours, but anything a difference can change comes from this table.

### The kinds of difference

A difference changes exactly one item, on one side chosen at random, so neither picture is "the original". The two sides are called `a` and `b`.

| Kind | What changes | `before` → `after` | 3+ | 7+ |
|---|---|---|---|---|
| missing | the item is absent on one side | `{}` → `null` | ✓ | ✓ |
| colour | a far hue | `{ colour }` | ✓ | ✓ |
| swap | the item becomes a kind of the same lane and a different family | `{ kind }` | ✓ | ✓ |
| size | the item is scaled by ×1.8 (3+) or ×1.3 (7+), up or down | `{ s }` | ✓ | ✓ |
| flip | mirrored left to right; `asym` kinds only | `{ flip }` | | ✓ |
| count | one more or one fewer of the counted part, within the kind's range | `{ count }` | | ✓ |
| state | the other state (eyes shut, bud, door shut, flag gone) | `{ state }` | | ✓ |
| shade | a near hue; the item's longer half-extent must be at least 14 | `{ colour }` | | ✓ |
| shift | moved 14 to 20 units in any direction | `{ x, y }` | | ✓ |
| tilt | rotated 20° either way; the item's longer half-extent must be at least 14 | `{ rot }` | | ✓ |

Each difference has a **region**: a circle at the item's centre with radius *r* = max(the band's minimum, the item's longer half-extent after the change + 4). For a shift the circle sits halfway between the two positions, with *r* = max(the band's minimum, the longer half-extent + half the shift + 4). The band minimum is **36 units** for 3+ (about 64 px across on a 360 px-wide picture) and **24 units** for 7+ (about 43 px). A tap counts when it lands inside a region, in either picture.

### Fair, by construction and by test

`scenes.js` guarantees all of the following, and `docs/tests/spot.test.js` checks every one over 1,000 seeds for every level, tier and theme:

- exactly the requested number of items, each within its kind's `max`, every one with its base in its lane and its whole bounding box inside the picture;
- no two items' bounding boxes overlap, with 4 units of padding, in either picture, including after a size change or a shift;
- exactly the requested number of differences, on distinct items, only of the kinds the level or tier allows;
- every region lies wholly inside the picture, and any two regions are at least 6 units apart edge to edge;
- the changed item's longer half-extent, before the change, is at least the level's or tier's minimum from the tables above (and at least 14 for shade and tilt);
- magnitudes as the table says: far hues for colour, near for shade, the band's size factor, a shift of 14 to 20 units, a tilt of 20°, a count of exactly ±1 within the kind's range, a swap to a kind of the same lane and a different family that also fits where the item stands, a flip only on an `asym` kind;
- rendered through `draw.js` with the same `side`, the two pictures differ in exactly the `<g>` groups of the changed items and nowhere else; a missing item's group is absent on its side.

If a layout cannot host the requested differences, `make` discards it and lays out again from the next internal seed, so the result always exists and the same seed always gives the same scene.

### Hints and rings

- A found difference: a ring of radius *r* in `#ef4444`, 4 units wide, over a white halo 7 units wide, in both pictures. It stays for the round.
- A hint: the same ring, dashed, pulsing between 0.9× and 1.1× for two seconds, in both pictures. Under reduced motion it shows steady for two seconds.
- Show me the rest: steady dashed rings on every unfound difference.
- Rings and the focus ring are drawn inside the SVG, after the items, so they are never hidden under one.

## Accessibility

- **Keyboard: roving tabindex per picture**, the pattern the site's grids already use. In each picture exactly one item has `tabindex="0"` and the rest `-1`, so each picture is one tab stop. Arrow keys move focus to the nearest item in that direction (focus stays put if there is none), Enter or Space checks the focused item exactly as a tap at its centre would, and a dashed ink-and-white focus ring is drawn round it in the SVG, because `:focus-visible` on an SVG group is not reliable. Every item's centre lies inside its own region, so the keyboard can find every difference.
- Items are `<g class="item" id="<side>-<item id>" data-id="<item id>" role="button" aria-label="a frog">`; the side prefix keeps ids unique across the two pictures. The label names only the kind, never its colour, size or state, so it gives nothing away except on a swap, where the two sides do name different kinds; that is accepted, because the game is visual and the label exists for navigation.
- One `aria-live="polite"` region carries every message: found, not there, hint, all found, and the round summary on 7+. One `<main>`. Buttons are real `<button>`s with a 44 px minimum size. Controls appear by removing `hidden`, never through `visibility`, so they can take focus under reduced motion (a past trap: `tokens.css` makes every transition 0.01 ms there).
- The hit test converts a pointer position to picture units with `getScreenCTM()`, so it is right at any zoom; the SVG box is exactly 4:3, so the viewBox maps linearly onto it, which is what the end-to-end player relies on.
- Colour is never the only signal: a found difference has its ring and its dot, a hint pulses and is announced.

## Sound and voice

- `play.js` makes its own sounds with WebAudio: a ping on a find, a soft boop on a miss, a fanfare on all found, a short chime with a hint. The AudioContext is created on the first tap. Every sound starts with `if (window.pimwMuted) return;`, so the shared toggle works.
- The 3+ page loads `games/shared/voice.js` and passes it to `Play.start` as `voice`; the 7+ page does not load it. The voice follows `pimwMuted` by itself. On a find the voice says the base item's `name` (the kind before any swap), capitalised, with an exclamation mark: "The frog!", "Clover!".

### Strings

| Key | 3+ | 7+ |
|---|---|---|
| intro | "Tap what's different!" | "Find all N differences. Tap them in either picture." |
| start (spoken) | "Find what's different!" | — |
| found | live region "Found the frog! 2 of 4."; spoken "The frog!" | live region "Found the frog! 2 of 5." |
| miss | "Not there." | "Not there." |
| hint | spoken "Look here!"; live region "Look here!" | "Here's one." |
| done | "You found them all!" (also spoken) | "Round 3 done! ★★☆ One hint used." / "No hints!" / "Two hints used." / "Shown." |
| next | "Next picture" | "Next picture" |

## Build

### Files

`games/shared/spot/`, loaded by both games from `../shared/spot/`:

| File | Purpose |
|---|---|
| `scenes.js` | Pure logic, tested in Node: the kinds table, the palette, the level and tier tables, the seeded scene maker, the difference engine, the hit test, `theme`, `nextLevel` and `stars`. A classic script that sets `window.Spot.Scenes`, or `module.exports` in Node. |
| `draw.js` | Turns a scene into SVG markup: `backdrop(theme)` and one drawer per kind, each returning a string in the item's own box. Pure string building, no DOM, so a test can render every seed in Node. Sets `window.Spot.Draw` or `module.exports`. |
| `play.js` | The shared play loop: builds the two pictures, hit-testing by pointer and keyboard, rings, dots, hints, sounds, the live region, confetti, the toolbar and the Next button. Sets `window.Spot.Play`. |

Each game folder has `index.html` (the usual head, `tokens.css`, `components.css`, band colours, the title icon, the page's own styles) and a short `game.js` that calls `Play.start` with its band and strings. Scripts load in this order: `../shared/voice.js` (3+ only), `../shared/spot/scenes.js`, `../shared/spot/draw.js`, `../shared/spot/play.js`, `game.js`, `../../components.js`. `components.js` adds the sound and fullscreen buttons by itself.

### Interfaces

- `Scenes.KINDS[kind] = { name, lane, w, h, family, asym, colours, states, counts, themes, max }`; `Scenes.PALETTE` (name → hex); `Scenes.WHEEL` (the eight hues in order); `Scenes.LANES` (lane → `[baseMin, baseMax]`); `Scenes.SHIFT = [14, 20]`; `Scenes.TILT = 20`.
- `Scenes.LITTLE[0..7]` and `Scenes.BIG[0..3]`, each row `{ diffs, items, kinds, minR, sizeFactor, minHalf }`; `Scenes.tier(round)` → 0 to 3.
- `Scenes.make(seed, row, theme)` → `{ theme, seed, a, b, diffs }`. `a` and `b` are the two item lists; each item is `{ id, kind, x, y, s, flip, colour, state, count, rot }` with `flip` a boolean, `rot` in degrees, and `colour`, `state`, `count` `null` where the kind has none. Each of `diffs` is `{ id, kind, item, side, region: { x, y, r }, before, after }`, where `item` is the item's id, `side` is `'a'` or `'b'` (the changed side), and `before`/`after` are as the kinds table says.
- `Scenes.theme(band, round, seed)`: for `'little'`, pond, meadow, farm in turn from round 1; for `'big'`, round 1 takes theme `seed mod 3` of [pond, meadow, farm], and each later round takes one of the two themes that are not the previous round's, chosen by the parity of seed + round. Deterministic, so the player can reproduce it.
- `Scenes.hit(diffs, found, x, y)` → the first difference not in `found` (a set of difference ids) whose region holds the point, or `null`.
- `Scenes.nextLevel(level, autoHints)` and `Scenes.stars(hints, gaveUp)`.
- `Draw.picture(items, { theme, critters, side })` → the SVG inner markup for one side: the backdrop, then one group per item in draw order. The group is `<g class="item" id="<side>-<id>" data-id="<id>" role="button" aria-label="…" tabindex="-1" transform="translate(x y) rotate(rot) scale(sx s)" fill="none" stroke="#33302e" stroke-width="<2.5 / s>" stroke-linejoin="round" stroke-linecap="round">` with `sx` = −`s` when flipped, so a scaled item keeps 2.5-unit outlines. Drawers never set `stroke-width`; every shape they emit names its own fill. `Draw.backdrop(theme)`; `Draw.DRAWERS[kind](item, { critters })` where `critters` is the path to `icons/critters/` (from a game page, `../../icons/critters/`).
- `Play.start({ band, mount, seed, strings, voice })` → a live handle `{ round, level, tier, seed, diffs, found, hints, stars }` for the end-to-end player, which `game.js` assigns to `window.spot`. `band` is `'little'` or `'big'`; Play knows which tables, hints and toolbar each band uses. `voice` is the `Voice` object or `null`.

### Icons

Two new files in `icons/games/`, obeying every rule in `docs/tests/icons.test.js` (48 box, ink outlines at 2.5, palette fills, one comment, no text):

- `whats-different.svg`: two small framed pictures side by side, a hill and a sun in one, the same hill and no sun in the other.
- `spot-the-difference.svg`: a magnifying glass over two overlapping framed pictures.

Each game's `<h1>` shows its icon as `<img class="title-icon" src="../../icons/games/<slug>.svg" alt="" width="40" height="40">`.

### Wiring

Done once by the coordinator on the release branch, never by the game agents:

- two entries in `docs/catalogue.js`, with a `practises` line that says what each game actually does;
- homepage cards in the Little Learners and Brain Boosters sections of `index.html`;
- two `<url>` entries in `sitemap.xml`;
- the game count in the homepage tagline and `manifest.json`, which rises by two from whatever `main` holds at release (another 7+ game, Missing Tile, has a note dated the same day);
- `node docs/build-pages.js` to regenerate `games/index.html`, `for-teachers.html`, `404.html` and `sw.js`; the precache walk picks up `games/shared/spot/` and the icons by itself.

### Checks

- `docs/tests/spot.test.js`: the tables pinned; the fairness rules above over 1,000 seeds per level, tier and theme; every kind has a drawer and every drawer a kind; rendered markup is well formed, uses only the palette plus backdrop colours, holds no `<text>`, script or event attributes, and references `<image>` only for critters; `hit`, `nextLevel`, `stars`, `tier` and `theme`; both pages' wiring (stylesheets, script order, title icon, canonical and Open Graph URLs, the `pimwMuted` guard, voice on the 3+ page only, no `localStorage`, `fetch`, cookies or external URLs in any new file).
- A keyboard-and-tap end-to-end player (puppeteer-core with the installed Chrome, scripts kept in the plan, run over `file://` at desktop and phone sizes and with reduced motion, then against the live site after deploy). For each game it plays three rounds by seed: finds every difference by tap on one side and by keyboard on the other, makes a wrong tap and sees no penalty, uses a hint, checks the rings, dots, live-region text, the done state, confetti only without reduced motion, the level or stars rule through `window.spot`, that both pictures fit the phone viewport, that the 3+ voice stub was called with a local voice only, that no request left `file://` (or the site's own origin, live), and that nothing was stored.
- Both pages opened over `file://` by hand once.

### Release

Built on one branch. Agents commit as soon as their unit tests pass. The coordinator merges, wires, runs every test and the merged-branch e2e, then merges to `main` and pushes with `git -c credential.https://github.com.username=viks120 push origin main` when Vikrant says so, checks the Cloudflare Pages check-run on the commit, waits for all three of the homepage, a game page and the kit to answer with the new content, runs the live e2e, and confirms the live pages make no third-party request.

## Out of scope

No clock, no strikes, no level picker, no printing, no saved progress, no new critters, no more than three themes. Any of these can come later without changing the kit's interfaces.
