# Plans & Elevations: a 3D GCSE views puzzle for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch, ready for the coordinator to wire into the catalogue.

## How it plays

- **Each level** shows three squared-paper drawings of a hidden shape made of cubes: the **plan** (from above, front edge at the bottom), the **front elevation** and the **side elevation** (seen from the right, so its left edge is the front). Columns are lettered A, B, C from the left and rows numbered 1, 2, 3 from the front, on the drawings and on the 3D baseplate, which also says FRONT and SIDE.
- **Build** by tapping a square, the top of a cube (stack) or the side of a cube (build next to it). Erase with the − Erase tool, a right-click or a long press. Drag, ↺ ↻ or Q/E turn the view; T tilts it.
- **Live checking:** each drawing carries a ✓ or ✗ for the build's own view. 👁 Compare marks missing squares in amber and extra ones with a red cross. The level is solved when all three views match.
- **Any matching shape counts.** The done card says how many shapes share the three views ("5 different shapes have exactly these three views"), or that only one does.
- **Stars** on medium and hard levels where the fewest and most cubes differ. The numbers are revealed on the done card; "Keep building" lets the player chase the missing star.
- **Hints:** the first press names one wrong view ("from the front, column C should be only 1 high, but it has a stack of 3"), glows the squares and turns Compare on; the second names a square and a height on the way to the nearest fitting shape. After a star level is solved, hints aim at the missing star.
- **Keyboard:** arrows move a cursor (relative to the view), + or Enter adds, − or Delete removes, Z undoes, H hints, C compares. A screen reader hears each drawing described and, on each square, what the drawings require there.
- **Quick quiz:** 8 questions; a model and three unlabelled drawings: which is the front elevation, side elevation or plan? Wrong picks explain themselves (the view from the back, the plan flipped, one column a cube too tall).
- **Nothing is stored:** ticks and stars last only this visit.

## Levels

24 levels in four groups of six: warm-up (3 by 3, low, exactly one answer each, with a tip per level), medium (taller, several answers), hard (4 by 4 and 5 by 4, up to 4 high) and fewest cubes (the views must be matched with the fewest cubes possible).

## The maths (views.js, tested in Node)

- A structure is a height per square, so there are no floating cubes. Front = tallest stack per column, side = tallest per row, plan = covered squares.
- **Most cubes:** every covered square as tall as both elevations allow, min(front, side).
- **Fewest cubes:** one cube per covered square, plus raising one square per column and per row to its height; a square can serve its column and its row at once when both need the same height, so the saving is a maximum bipartite matching per height.
- **Shapes sharing the views** are counted row by row, remembering which columns have reached their height.
- **Checks:** `docs/tests/plans-and-elevations.test.js` brute-forces every level small enough and 300 random structures (fewest, most and the shape counts agree), confirms the fewest by a second independent search, replays hints to a finish, and checks 60 quiz seeds. A keyboard e2e (desktop, phone, reduced motion) plays levels 1–4, 7 and 19 and a full quiz, with real taps, a right-click or long press and a drag.
