# Game graphics: original pictures and meadow scenes for the older 2D games

**Date:** 2026-10-23
**Status:** Approved in conversation. Vikrant chose the scope (the older 2D games, not the 3D ones), the critters in those games wherever they fit, depth B (pictures and scenes, candy tiles only for the text games), and from live mockups: the icon drawing style, the meadow scene family, and a colour per continent for the Geography map. Then: "finish all stages without ask".

## Why

The October artwork pass gave every game an icon and the hero its critters but deliberately left the emoji inside gameplay and every game board alone. So fifteen of the older 2D games still draw with emoji, which look different on every phone (Windows cannot draw flag emoji at all), on plain boxes and gradients, while the newer games and the 3D games share one drawn look. This work brings those fifteen games into the same family.

## Scope

In scope, in three stages:

- **Stage 1:** Memory Match, Count With Me, Whack-a-Mole, Catch the Fruit, Sound It Out.
- **Stage 2:** Sort It Out, Trace Letters & Numbers, Dot to Dot, Balloon Pop, Tic Tac Toe, Rock Paper Scissors, Code the Robot.
- **Stage 3:** Geography Explorer, 2048 Slider, Minesweeper.

Out of scope: the 17 3D games, Sudoku, the word and quiz games that have no pictures (Word Guess, Word Scramble, Math Puzzle, Science Trivia, Sentence Builder, Silly Story Builder), the tracing games' guides (First Strokes, Trace Shapes, Trace Your Name already draw in the house style), emoji used only as button glyphs or in feedback messages, the critters' designs (final), and every game's rules, layout, timers and input handling.

## The picture library

- **File:** `games/shared/art/pictures.js`, a classic script in the pattern of `games/chart-detective/glyphs.js`: pure string building, `module.exports` in Node, `window.Pictures` in a page. One request, about 70 KB raw; the service-worker generator precaches it because it walks every `.js` file.
- **Pictures:** one entry per id in the `PICTURES` object, built with `pic(label, markup)` (48 by 48 box) or `flag(country, markup)` (72 by 48). Ids are lower-case kebab-case English nouns (`cat`, `ice-cream`, `hand-rock`, `flag-united-kingdom`). The label is what a screen reader says when the picture carries meaning.
- **Style:** the Candy, illustrated rules, checked by `docs/tests/svg-style.js`, which is now the one checker for `icons/` and for these symbols: every filled shape outlined in ink `#33302e` at width 2.5, round joins and caps, lines 1.5 to 7 wide, flat fills only from the library's palette `P` (the icon palette, the critters' colours from `icons/critters/*.svg`, and the scene colours listed in `pictures.test.js`), no text, gradients, filters, styles, images or opacity. One big shape and few details, so a picture reads at 32px.
- **Markup in a page:** `Pictures.install(ids)` puts one hidden `<svg class="sprite" id="pictures-sprite">` of symbols at the top of the body; `Pictures.use(id, { size, label, cls })` returns `<svg class="pic" width height viewBox><use href="#p-id"/></svg>`, with `role="img"` and an `aria-label` when `label` is given and `aria-hidden` otherwise. `components.css` holds `.sprite` (zero-sized) and `.pic` (inline-block, no shrink), so no page needs its own rule.
- **Critters:** never copied into the library. Pages show the existing `icons/critters/<name>.svg` files with `<img>`, which works over `file://` and animates with CSS transforms. A picture that depicts a critter's face (a sad face, a napping frog) is drawn in the library in the critter's colours.
- **Works everywhere:** same-document `<use>` works over `file://`; nothing is fetched beyond the one script; nothing is stored.

## Scenes

The meadow family, drawn flat with the same ink outline: sky `#dff4ff`, far hills `#a7e3a1`, field `#9be28f`, earth mounds `#8b5e3c` with dark openings `#5a3b22` and grass tufts `#2e9e5b`, an orchard canopy in `#4ade80`, water `#8ed0ff` only where a game already has water. A scene is an inline `<svg class="scene" aria-hidden="true" preserveAspectRatio="xMidYMid slice">` placed as the first child of the play area, absolutely positioned behind the pieces with `pointer-events: none`, so hit-testing, layout and timers are untouched. Each game owns its scene markup in its own page (the single-file rule for the older pages stands); only colours are shared, by value.

## The games

Rules that hold for every game: the game's data arrays reference picture ids instead of emoji; pieces are rendered with `Pictures.use`; labels that mattered (a word's picture in Sound It Out, a card's name in Sort It Out) are kept as `aria-label`s; the page loads `../shared/art/pictures.js` before its own script and calls `Pictures.install` with the ids it uses; reduced motion keeps whatever the page did before.

- **Memory Match:** the 16 animal faces come from the library on the card backs; the card front keeps its flat teal tint and ink question mark; a critter sits beside the board and hops (CSS) on a match and cheers on a win.
- **Count With Me:** the fruit come from the library and sit on a wooden tray strip (`#d9a066`); Pip holds the question in a speech bubble; buttons and ten-frame unchanged.
- **Whack-a-Mole:** the meadow scene with nine earth mounds in the existing grid; the pieces that pop up are the four critters, each clipped by its mound's front rim; the piece you must not tap keeps its rule and is drawn as a sleeping snail in the library; score, timer and difficulty unchanged.
- **Catch the Fruit:** the orchard scene (sky, canopy, hills, ground); fruit, the star and the bad item come from the library; Mango carries the basket, drawn as one moving element so the basket's hit box stays what it was; the Reduce Motion bug (the fall animation shrunk to 0.01 ms by `tokens.css`) is fixed with an inline `!important` fall duration.
- **Sound It Out:** every word's picture comes from the library, labelled with the word; the chips and the ladder unchanged.
- **Sort It Out:** every card's picture comes from the library, labelled with the card's name.
- **Trace Letters & Numbers:** the 26 letter pictures come from the library.
- **Dot to Dot:** the reward picture shown at the end comes from the library; the dots and the drawn outline unchanged.
- **Balloon Pop:** a sky scene with clouds; balloons are drawn as ink-outlined SVG shapes that still carry their number or letter as text on top.
- **Tic Tac Toe:** drawn candy X and O marks from the library; the board cells become candy tiles; the computer opponent is shown with Plum's face.
- **Rock Paper Scissors:** three drawn hands (`hand-rock`, `hand-paper`, `hand-scissors`); the opponent is Plum, with three drawn expressions (win, lose, tie) replacing the face lists; the name shown is Plum.
- **Code the Robot:** a drawn robot and goal star from the library; the grid becomes garden tiles with hedges for walls; Pip waits at the goal.
- **Geography Explorer:** an original world map in a 360 by 200 box with one path per continent, coloured North America green, South America yellow, Europe blue, Africa orange, Asia pink, Oceania purple, each a tappable, keyboard-focusable element that keeps the existing continent logic; a pin drops on the country's position when the right continent is tapped; the 30 flags come from the library as 72 by 48 symbols and replace the emoji flags.
- **2048 Slider and Minesweeper:** tiles become candy tiles (flat band colours with the hard `0 Npx 0 0` shadow of the candy buttons); Minesweeper's mine and flag come from the library. Logic untouched.

## Tests and checks

- `docs/tests/pictures.test.js`: palette, every symbol against the shared checker, no duplicates, the sprite and `use()` markup, and a `USERS` entry per converted game asserting that the page loads the library before its own script, that every id it uses exists, and that its gameplay data holds no emoji.
- `docs/tests/icons.test.js` keeps its own self-test of the checker; the checker's rules did not change.
- `docs/e2e/gfx-smoke.e2e.cjs`: opens each converted game over `file://` (or the live site with `URL=`) at desktop and phone size, starts a round, and fails on a page error, a console error, a request off the origin, an emoji in the play area, a missing sprite or a `<use>` that points at nothing; it writes screenshots and a contact sheet for a person to look at.
- The full suite stays green: `node --test docs/tests/*.test.js`.

## Process

- Branch `game-graphics`; `.superpowers/` is git-ignored first, because the mockups live there and everything pushed to `main` goes live.
- The pictures are drawn by several agents in parallel, one per group (animals, food, objects, nature, hands and faces, flags), each checking its own drawings with the style checker and looking at a rendered sheet before handing over; the sections are merged into the one file.
- Each game is converted by one builder agent working in the same tree and touching only its own game folder (and its `USERS` entry in the test), reviewed read-only against this note.
- After each stage: tests, the smoke player, a contact sheet for Vikrant. Nothing is pushed to `main` until he says so.
- Commit messages and comments name no competitor and no brand.
