# Log Jam: a 3D sliding-log puzzle for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch; the coordinator wires it into the site.

## How it plays

- **Goal:** a little boat is stuck in a jam of logs on a frozen 6×6 river. Clear a way and slide the boat out through the gap in the right-hand bank (row 3).
- **Rules:** a log lying across slides only left and right; a log lying along the river slides only up and down. Nothing passes through anything else.
- **Moves:** a move is one log sliding any distance one way. Sliding the same log again straight after still counts as that one move, and sliding it back where it began cancels the move. The HUD shows "Moves n / fewest b". Matching the fewest earns a ★ in the level list; finishing earns a ✓ (this visit only, nothing stored).
- **Help:** Undo (Z), Restart (R), and Hint (H or 💡). A hint runs the solver from the current position, names the log and direction ("slide the short log in column 5, rows 3 to 4 down 2 squares"), picks that log and shows an arrow. There are no dead ends, because every slide can be slid back.
- **Controls:**
  - **Pointer:** drag a log along its line. It follows the finger, stops at whatever is in the way, and snaps to a square. Or tap a log, then tap an open square in its line.
  - **Keyboard:** Tab and Shift+Tab pick logs in turn, and focus leaves the board past the last log, so there is no keyboard trap. Arrows along the picked log slide it a square at a time, and holding one keeps it going. Arrows across it pick the nearest log that way. Enter reads where the log can go.
  - **Feedback:** the picked log glows, with darts showing its free directions. Messages go to an aria-live strip, and position read-outs to a hidden live region.

## Levels

- **36 levels in four groups of nine:** warm-up (2 to 10 moves), medium (11 to 19), hard (21 to 29) and expert (30 to 39).
- **The generator** places random logs, explores each board's whole cluster of reachable positions, and keeps the position farthest from any escape. For hard and expert boards, hill climbing adds, moves or removes logs.
- **The picker** keeps one level per move count where it can, and avoids boards that share too many logs in the same places.
- **The logic module** records each level's fewest moves. The tests re-prove every level with the solver.

## Scene

- **The board** sits in a snow slab cut by one extruded shape with holes. The same cut-out makes the open river, which leaves through the gap, bends round behind the board and fades into the mist.
- **The logs** are toon cylinders with bark grooves, growth rings on their ends and the odd branch stub.
- **The boat** is a hull with a hole, extruded, with a pennant and a critter skipper who watches the picked log.
- **Freeing the boat:** it sails out, splashes into the river and drifts away. The skipper cheers, and there is confetti unless reduced motion is on, which also stops the falling snow and river drift.

## Build and checks

- `games/log-jam/`:
  - `logjam.js`: levels, rules, solver, words and messages.
  - `world.js`: scene, pieces, picking and camera framing. The framing is a pure `frameView`, so a test can aim pointer events exactly.
  - `game.js`: menu, input, moves, hints and the win.
  - `index.html`
- `docs/tests/log-jam.test.js` checks that every level is valid and solvable in exactly its recorded fewest moves, that the groups get harder, the sliding rules, reversibility, solver hints, `check()` errors and every message.
- A keyboard end-to-end player runs at desktop size, at phone size with touch, and with reduced motion. It plays levels by the solver and by hints alone, tests holding a key, sliding back, undo, restart, ticks and stars, and drag or tap-to-slide.
