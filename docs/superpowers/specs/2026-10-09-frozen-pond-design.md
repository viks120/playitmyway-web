# Frozen Pond: a 3D ice-sliding puzzle for ages 7+

**Date:** 2026-10-09
**Status:** Built and released. The user picked it from three proposals for a 7+ 3D puzzle.

## How it plays

- **Start.** Pick a critter and one of 18 levels, then slide across a frozen pond to the fishing hole.
- **The rule:**
  - On ice you keep sliding until a rock, or the snowbank round the edge, stops you.
  - White snow patches stop you on the spot, and so does the fishing hole.
  - Pressing towards a rock right beside you does nothing, and says so: "A rock's in the way."
- **Each level states its target:** "It can be done in 8 slides." Finishing in that many earns "The fewest possible!". Otherwise the message says how many it could take.
- **Help is always there:**
  - **Undo** (Z) takes a slide back, and **Restart** (R) starts the level again.
  - **Hint** (H or 💡) runs the solver from where you are. It shows an arrow for the next slide, or says the fish can no longer be reached.
- **Controls:** the arrow keys or WASD, swipes, a tap on a square in a direction, or the on-screen buttons. On phones held upright, those buttons become a row under the board.
- **The scene:** snowy pines, gently falling snow (stopped with reduced motion), and a fish that peeks out of its hole and jumps when you arrive. There's confetti too, except with reduced motion.

## Levels

- **Three groups:** six gentle levels (1 to 4 slides), six medium with snow patches (5 to 6), and six hard (8 to 10).
- **The first two are hand-made** to teach the rule: one slide, then two round a corner.
- **The rest come from a generator:** random rocks and snow on boards from 5×5 to 8×8, measured by a breadth-first solver. A level is kept only if its fewest slides fall in the group's range and you can go wrong along the way: at least 4 more reachable resting spots than the solution needs.

## Build

`games/frozen-pond/` contains:
- `frozen.js`: the levels, parsing, sliding, the solver and the messages, all tested in Node.
- `world.js`: the winter scene, board, fish, hint arrow, camera, picking and effects.
- `game.js`: the menu, levels, slides, undo, restart, hint and input.

The hint arrow in Pebble Push moved to the same place beside the critter.

**Checks:**
- `docs/tests/frozen-pond.test.js`:
  - every level solves within its group's range, and replaying the path reaches the fish;
  - the sliding rules hold;
  - the solver reports when the fish can no longer be reached.
- A keyboard e2e (desktop, phone and reduced motion):
  - solves levels 1, 2, 7 and 13 by the solver's paths;
  - checks the bump message, a hint from a wrong spot, Undo, Restart and the menu ticks.
- Opening the page over `file://`.
