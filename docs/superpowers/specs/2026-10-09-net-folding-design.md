# Net Folding: a 3D nets-of-shapes game for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch. The site wiring (catalogue, homepage, sitemap, offline cache) is left to the coordinator.

## How it plays

- **Five challenges, eight questions a round:**
  1. *Cube or not?* Which net folds into a cube?
  2. *Opposite faces:* which face ends up opposite red?
  3. *Dice nets:* which net is a real die, with opposite faces adding up to 7?
  4. *Other solids:* which net makes this square-based pyramid, triangular prism, tetrahedron or cuboid?
  5. *Match the cube:* colours and arrows, so which net makes this cube?
- **Every choice folds up in 3D,** hinge by hinge, nearest the first face first. A wrong net shows why: doubled-up faces are tinted red, the open side shows as a red gap, and the cube turns so the gap faces the player. A good match turns to line up with the target.
- **Explanations, not just a cross.** Examples: "Net B folds two squares onto the right side of the cube, leaving the front open." "In net C, 2 ends up opposite 4, and 2 + 4 = 6, not 7." "Net D has the right opposite pairs, but it folds into the mirror image of this cube."
- **A gentle start.** Each challenge is a seeded stream. The first two questions have three choices and easy distractors. The next three get harder, and the rest use the most tempting wrong answers: subtle non-nets, a die with 1 and 6 at the two ends of a row of four, or an arrow turned the wrong way.
- **Exploring is allowed.** After answering, any other net can be folded too. Score, streak and ticks live in memory only.
- **Controls:** arrows or Tab move between answers, Enter (or 1 to 4) chooses, Space replays the fold, Q/E turn and R/F tilt, N goes on, and dragging turns the view. Each colour also has a symbol. With reduced motion, the hinges snap one at a time and there is no sparkle.

## The maths (`nets.js`, tested in Node)

- A net is a set of polygons in a tree of hinges. `fold()` turns each face about its shared edge by 180° minus the solid's dihedral angle: 90° for a cube or cuboid, 109.47° for a tetrahedron, 125.26° and 70.53° for the pyramid, and 90° and 120° for the prism. Then it matches each face's final corners against the solid built on the first face. That gives the landings, overlaps, gaps and faces that stick out.
- **The net lists are not typed in by hand; they are enumerated.** The program grows all 35 hexominoes, and also every tree of triangles, squares and rectangles that lies flat. A congruence key tells nets apart.
- **The tests check against outside facts.** The 11 cube nets were drawn by hand. The known net counts are 2, 8, 9 and 54, and every good net folds to a closed surface. The tests also check opposite faces, the 24 cube turns, mirror images, the dice rule, and exactly one right answer in every question.

## Build

`games/net-folding/` holds four files:
- `nets.js`: the maths and messages.
- `world.js`: card slabs with printed decals in hinge-group chains, the ghost outline, marks, layout and camera.
- `game.js`: menu, questions, input and loop.
- `index.html`

A keyboard e2e plays at desktop and phone sizes and with reduced motion.
