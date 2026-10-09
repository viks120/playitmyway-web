# Pebble Push: a 3D thinking-ahead puzzle for ages 5+

**Date:** 2026-10-09
**Status:** Built and released. The user picked it from three proposals for a 5+ 3D puzzle.

## How it plays

- **Start.** Pick a critter and one of 18 levels. Then hop round the lily pads (open water is the edge) and push the pebbles onto the pink flowers.
- **The core rule:** a pebble moves one pad when hopped into, unless water or another pebble is behind it. Pebbles cannot be pulled.
- **Flowers bloom** round a pebble that lands on them. The level ends when every pebble sits on a flower, with confetti (none with reduced motion) and "Level 3 done in 9 moves! The fewest possible!" when it was.
- **Help is always there:**
  - **Undo** (Z) takes a move back, and **Restart** (R) starts the level again.
  - **Hint** (H or 💡) runs the solver from the current position and shows an arrow for the first move ("Try going up."). If the level can no longer be finished, it says so.
  - **A gentle warning** comes when a pushed pebble wedges in a corner away from a flower.
- **Controls:** the arrow keys or WASD, swipes, a tap on a pad (one step towards it), or the on-screen buttons. On phones held upright, those buttons become a row under the board.
- **Nothing is stored.** Ticks for finished levels last only this visit.

## Levels

- **Three groups:** six easy levels with one pebble, six medium with two, and six tricky with three.
- **The first three are hand-made:** a straight push, a push you must walk round to, and a push in two directions.
- **The rest come from a generator:**
  - It works in reverse: it starts with the pebbles on their flowers and walks the critter about, pulling pebbles away, so a solution always exists.
  - A breadth-first solver then measures the fewest moves.
  - Candidates were picked for a gentle ramp, from 3 to 23 moves.

## Build

`games/pebble-push/` contains:
- `pebbles.js`: the levels, parsing, stepping, stuck detection, the solver and the messages, all tested in Node.
- `world.js`: the pond and board, the blooming flowers, the pebbles with little faces, the hint arrow, camera and picking.
- `game.js`: the menu, levels, moves, undo, restart, hint and input.

**Checks:**
- `docs/tests/pebble-push.test.js`: every level is solved, and the solver's path is replayed to a finish.
- A keyboard e2e (desktop, phone and reduced motion):
  - solves levels 1, 2, 8 and 14 by the solver's paths;
  - wedges a pebble to check the warning and the "can't be finished" hint;
  - checks Undo, Restart and the ticks on the level menu.
- Opening the page over `file://`.
