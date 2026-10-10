# Laser Mirrors: a 3D light-reflection puzzle for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch for the coordinator to merge and wire up.

## How it plays

- **A lab bench** with a lettered, numbered grid. Lasers on the edges fire beams along the squares. The player turns mirrors (and later splitters) on **yellow turntables** so the beams light every crystal at once. Grey bolted pieces never move.
- **The rule:** a mirror sits on a diagonal, `/` or `\`, and a tap, click, Enter or Space flips it. Each mirror turns a beam through 90°, which the how-to ties to the law of reflection (angle in = angle out, with a diagram). Blocks and lasers stop beams; a crystal soaks up the light that lights it; beams pass through each other.
- **Four groups of six:** warm-up (one or two mirrors, one a decoy); decoys and blocks; beam splitters (half-silvered glass that both passes and reflects) with double crystals that need beams from two sides; red and blue lasers with red, blue and purple crystals (purple needs both colours; a wrong colour makes the crystal flicker and the message says why).
- **Feedback every turn:** "Turned the mirror at B2. 1 of 2 crystals lit." plus a note about the most useful unlit crystal. Lit crystals glow and spin; beams are redrawn instantly as glowing cylinders.
- **Help:** Undo (Z), Reset (R) and Hint (H or 💡), which runs the solver from the current setting and names a piece to turn, marking it with an arrow. Level select shows ticks for levels solved this visit only.
- **Controls:** tap a piece; drag to swing the camera a little; keyboard cursor with ← → through the pieces, ↑ ↓ between rows, Enter to turn, Tab to the buttons. Messages go to an aria-live strip; the cursor piece is announced for screen readers.

## Levels

- Levels 1 to 6, 13 and 19 are hand-made to teach each idea, with a one-line note in the start message.
- The rest came from a scratchpad generator (`gen2.cjs`): plant random pieces and a random setting, put crystals on squares the light reaches (preferring squares deep along the beam), then measure with the brute-force solver. A level is kept only if every solution sets the pieces that matter the same way (one answer, give or take decoys the light never needs), every turnable piece can be reached by light in some setting, every laser is needed, and the start is unsolved with at least half the forced pieces wrong. A hill-climb then nudges pieces to raise a difficulty score (log of distinct light routes, forced pieces, near-miss settings). Empty edge rows were trimmed. Candidates were chosen from 3D contact sheets.
- Forced pieces run from 1 (level 1) to 9 (level 24); distinct light routes from 2 to 479. A greedy "turn whatever lights more" strategy fails on most levels from group 2 on.

## Build

`games/laser-mirrors/` contains:
- `optics.js`: levels, parsing, the beam trace, crystal states, beam segments for drawing, the solver, hints and every message. Pure logic, tested in Node.
- `world.js`: the lab, bench, pieces, beams, crystals, cursor, hint marker, camera fitting and picking.
- `game.js`: menu, levels, turns, undo, reset, hint, keyboard and pointer input.

**Checks:**
- `docs/tests/laser-mirrors.test.js`: every level solves with one answer; hints solve every level in the fewest turns (also after a wrong turn); groups get harder; reflection, blocking, crossing, splitting, loops, colours, segments and messages word for word.
- A keyboard e2e (desktop, phone with touch taps, reduced motion) plays levels 1, 2, 3, 7, 13, 19 and 24 by the solver's turns, checks every message against `optics.js` in Node, Undo, Reset, Hint, the done card, the menu ticks, confetti only without reduced motion, no storage, no errors, and only `file://` and `data:` requests.
