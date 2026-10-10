# Twist Cube: a 3D twisting cube puzzle for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch; the coordinator wires it into the site.

## How it plays

- **Undo the twists:**
  - Watch a solved cube get scrambled, one animated twist at a time, then undo it with the face letters U D L R F B (R′ is anticlockwise).
  - There are 1, 2, 3, 4, 5, 6, 8 and 10 twists on a 2×2×2, then the same on a 3×3×3.
  - Par is the scramble's length, and a search proves nothing shorter works.
  - The first levels twist only faces in view, and carry a short tip.
- **Full scramble:** free play on a fresh random scramble of each size.
- **The letters go with the player's view.** Dragging (or the arrow keys) turns the cube, and it settles square to the nearest of the 24 ways to hold it. Badges name the faces.
- **Help:**
  - Undo (Z or Backspace) and Reset (0, since R is a twist).
  - The scramble on request (S), with progress ticks.
  - A Hint (H). It names the next twist back along the known scramble, shown by an arrow on the face, or a glowing badge if the face is hidden. It accepts commuting reorders and a 2×2×2 that has turned round. Off the path, it says how many twists to undo.
  - The done card counts hints and peeks, and shows the scramble.
- **Access:** fully keyboard playable, with an aria-live message strip and optional shapes on the sticker colours. Reduced motion means quick but held twists and no confetti or spin.

## Build and checks

- `cube.js` (CubeLogic, pure): the sticker model, with permutation tables for every twist and whole-cube turn worked out from geometry. Also the levels, scrambles, inverse path, hint and messages.
- `world.js`: draws the cube and queues the twist animation. The stickers are repainted from the logic after each twist, so the picture cannot drift from the puzzle.
- `game.js`: the flow and input.

`docs/tests/twist-cube.test.js` proves:
- every twist has order 4, and a twist then its inverse restores the cube;
- opposite faces commute;
- scrambles followed by their inverses come back solved;
- solved is spotted in all 24 orientations;
- each par is exact (by bidirectional search);
- following the hint solves every level in par twists.

A keyboard e2e at desktop size, phone size and with reduced motion solves five levels and checks every control.
