# Logic Gates: a 3D Boolean logic puzzle for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch for the coordinator to wire into the catalogue.

## How it plays

- **A circuit board in 3D:** switches on the left, lamps on the right, wires already laid between fixed sockets, and empty slots between. The player picks a gate for every slot (AND, OR, NOT, XOR, NAND, NOR; some levels restrict the box, e.g. NAND only) by tapping a slot and choosing from the buttons under the board, tapping the slot again to step through, or pressing 1 to 6.
- **The goal is a truth table** beside the board (under it on a phone): the target for every lamp in every row, the circuit's own answer worked out live, and a ✓ or ✗ per row. A level is solved when every row ticks.
- **Instant feedback:** wires carrying a 1 glow and current flows along them; a tick or cross by each lamp shows the row on the switches. Flip switches by tapping them, pressing their letter, or tapping a table row; **Test** (T) steps through every row and reads each one out.
- **Help:** Undo (Z), Clear (R), a Hint (H) from the solver that names a wrong or empty slot first and a gate on the second press, and a gate guide (I) with each symbol, its rule in plain words and its truth table. Every solved level ends with a one-line explanation of the idea it taught.
- **One wire into a two-input gate** feeds both inputs, so NAND or NOR there act as NOT (how the NAND-only levels work); NOT only fits a one-wire slot and the game says so.
- **Keys:** Tab/arrows between switches and slots, Enter or Space to flip or change, 1 to 6 for a gate, Delete to empty, letters to flip switches, T, Z, R, H, I. Messages go to an aria-live strip; the dialogs trap Tab.
- **Nothing stored.** Ticks last only this visit. Reduced motion stops the current pulses, drops and confetti.

## Levels

Four groups of six, 24 in all: meet the six gates one by one (identify each from its table); gates together (NAND from AND and NOT, A but not B, a burglar alarm, implication, De Morgan's two laws); NAND does it all (NOT, AND, OR and a four-NAND XOR from NAND alone) and two XOR builds from AND, OR and NOT; real circuits (half adder, parity, 2-input multiplexer, majority vote, full adder, 2-bit equality comparator). Every level is proved solvable by a brute-force solver that tries every gate in every slot; 22 have a unique answer and two have exactly two (the majority vote's AND/OR dual and the full adder's OR-or-XOR carry).

## Build

`games/logic-gates/`: `gates.js` (gates, levels, evaluation, solver, hints, the wire router that lays out each board, messages; pure, tested in Node), `symbols.js` (the standard gate shapes as paths shared by the 3D blocks and the 2D buttons), `world.js` (board, switches, gate blocks, lamps, wires with junction dots and crossing bridges, current, camera, picking), `game.js` (menu, truth table, input, test, hints, guide).

**Checks:** `docs/tests/logic-gates.test.js` (gate tables, joined inputs, every level solvable and nearly unique, the adders add, De Morgan and NAND-only answers, hints converge, every board routes without wires through parts or on top of each other, messages); a keyboard e2e over `file://` at desktop, phone (with touch) and reduced motion that solves levels 1 to 7, 23 and 24 with a wrong gate, hints, test, flips, undo, clear, guide and ticks checked; a touch-tap check on the 3D board.
