# Game graphics: implementation plan

Spec: `docs/superpowers/specs/2026-10-23-game-graphics-design.md`. Branch `game-graphics`. Every task keeps the game's rules, layout, timers and input exactly as they are; only how pieces and the play area are drawn changes. The full code audit of each game (where its pictures are rendered, the play-area container, animations, input, rules and risks) was done by read-only agents on 2026-10-23 and drives the per-game notes below.

## Foundations (done, committed as 1585d76)

- `docs/tests/svg-style.js`: the one style checker; `icons.test.js` uses it.
- `games/shared/art/pictures.js`: the library API; `docs/tests/pictures.test.js`; `.sprite` and `.pic` in `components.css`.
- `docs/e2e/gfx-smoke.e2e.cjs`: the smoke player with a start-step table per game.

## Task 0: the pictures

Seven artists draw the groups (animals, food, flags, objects-a, objects-b, nature-shapes, people-faces) as sections, each checked with the style checker and viewed rendered at 64px and 32px, then merged into `pictures.js` in one commit. Flags are `flag-<country-kebab>`; `flag-blank` is the placeholder. After the merge: `node --test docs/tests/*.test.js` green, `node docs/build-pages.js` so `sw.js` precaches the new script.

## Stage 1

1. **Memory Match** (`games/memory-game/index.html`). The pair array becomes picture ids, in this order so the fixed level prefixes stay meaningful: clover, pip, plum, mango, dog, cat, mouse, hamster, bear, panda, fox, koala, tiger, lion, cow, pig. `createCard` writes an `<img>` for the four critter ids and `Pictures.use` for the rest, sized 60% of the card so the three font-size breakpoints need no change; `data-emoji` becomes `data-pic`; the match test stays exact string equality; `flipCard`'s aria-labels and live-region text use the picture's label. The card front keeps the flat teal tint and the ink question mark. `pictures.js` loads as a classic script before the inline game script (which calls `initializeGame` at parse time), and `Pictures.install` runs before it. No gradients (the icons test forbids them on this page).
2. **Count With Me** (`games/counting-game/index.html`). The `objects` array becomes `{ id, name, plural }` entries because the fruit name is spliced into the question and hint strings and spoken; tiles render `Pictures.use(id, { label: name })` so each toggle button keeps an accessible name; the `.object` hover and `.selected` scale transitions stay. A wooden tray strip (`#d9a066`) sits behind `#objectsContainer` as an inline SVG; Clover asks the question from a bubble row beside the hint pill.
3. **Whack-a-Mole** (`games/whack-a-mole/index.html`). The eight pop-ups become Clover, Pip, Plum, Mango (as `<img>`) plus hamster, dog, bear and panda from the library; the picture box gets an explicit size so `translateY(120%)` still hides it; the meadow scene (sky, hills, field) replaces the kept gradient on `#gameArea`, and each `.hole-bg` becomes a drawn mound with a front rim that clips the piece. Every pop-up scores as today: the game has no must-not-tap piece despite the catalogue line, and that rule is not added here; the sleeping snail stays in the library for a later sleeper mode. The `.animal` labels stay generic ("animal up").
4. **Catch the Fruit** (`games/catch-falling-object/index.html`). Items get explicit 40 by 40 (35 by 35 bad) boxes holding `Pictures.use`; the bomb is unmistakable at 35px; Mango and the basket become one moving `.basket` element so the hit box is the basket's as before; the orchard scene replaces the kept gradient; hearts come from the library (`heart`, `heart-empty`); the fall duration is set inline with `!important` so Reduce Motion no longer collapses it; the start and game-over overlays show Clover.
5. **Sound It Out** (`games/sound-it-out/index.html`). The 67 word pictures come from the library through `Pictures.use(id, { label: word })` inside `#picBtn`, keeping the pop animation on the button and the speakable behaviour; concept words (nap, sad, mad, hot, yum, hug, zap, wet, red, dot, win, run) use the agreed ids; pairs that share a list stay visually distinct. Pip hosts the prompt line.

## Stage 2

6. **Sort It Out**: card `emoji` fields become ids; `#cardGlyph` renders `Pictures.use(id, { label })`; the bin symbols stay beside their text; no picture may leak the answer (no water lines, no living/not-living colour code); Clover explains from the feedback box.
7. **Trace Letters & Numbers**: the 26 `e` fields become ids; the tab labels keep their leading emoji word because a regex strips it; the win overlay shows a critter.
8. **Dot to Dot**: the reward picture renders on a cream plate inside the navy win overlay; each drawing must match the polygon's silhouette and orientation; Pip hosts the prompt row.
9. **Balloon Pop**: balloons become drawn SVG shapes on the palette with the label as text on top; the wrong-tap shrink and the float animation stay on the button; `pop-burst` from the library; a sky scene with clouds; Pip on the start overlay.
10. **Tic Tac Toe**: `mark-x` and `mark-o` from the library, cells as candy tiles; `cellLabel` text unchanged; Plum appears as the computer's face in vs Computer mode.
11. **Rock Paper Scissors**: `hand-rock`, `hand-paper`, `hand-scissors`; the opponent becomes Plum with `plum-happy`, `plum-dizzy`, `plum-puzzled` replacing the face lists; page copy that names Robo changes to Plum; the title keeps "vs computer".
12. **Code the Robot**: `robot`, `wall`, `star` and the four arrows from the library sized in em so the 5/6/7 grids still scale; `#robotInner` stays a `<span>`; garden tiles for the board; Pip waits at the goal.

## Stage 3

13. **Geography Explorer**: the map is page-level inline SVG (`scratchpad/art/map.svg` drawn by an artist) with one `<path role="button" tabindex="0">` per continent carrying `data-continent`, keeping `checkContinentAnswer`; a pin group; hover scale uses `transform-box: fill-box`; labels as HTML overlays; flags from the library (`flag-<country>`), `flag-blank` before reveal; Clover asks the question from a bubble row. A page test runs the checker on the map markup allowing no text.
14. **2048 Slider**: twelve tile looks on the palette as a strictly increasing ramp with the candy hard shadow; no transform in hover or keyframes; no library needed, so the smoke player's sprite check is skipped for it.
15. **Minesweeper**: `mine` and `marker-flag` (the library's `flag`) replace the CSS `content` emoji; cells become candy tiles; the pictures test's data range points at the style block.

## After each stage

`node --test docs/tests/*.test.js`; `node docs/e2e/gfx-smoke.e2e.cjs` with `ONLY=` the stage's games; the contact sheet to Vikrant; a commit per game plus one for the library. Nothing is pushed to `main` until he says so.
