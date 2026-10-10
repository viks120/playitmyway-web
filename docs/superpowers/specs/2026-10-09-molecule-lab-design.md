# Molecule Lab: build covalent molecules in 3D, for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch, waiting to be wired into the site.

## How it plays

- **Pick a task:** 20 molecules in five groups: single bonds (H₂ to CH₄), double and triple bonds (O₂, N₂, CO₂, HCN), carbon chains (ethane, ethene, ethyne, chloromethane), oxygen joins in (methanol, ethanol, ethanal, methanoic acid) and isomers (methoxymethane, propane, propene). There is also a free build.
- **Build:**
  - A palette atom (H, C, N, O, Cl in the teaching colours) bonds to the selected atom. Yellow studs show its open bonding slots (valency H 1, Cl 1, O 2, N 3, C 4), and a full atom settles with a chime.
  - **Bond** cycles the bond between the last two atoms picked: single, double, triple, then none. A bond that cannot grow goes back to none, and the message says which atom had no room.
  - **Pointer:** tap an atom to pick it, tap a bond to change it, drag from atom to atom to bond them, drag empty space to turn the view, pinch or scroll to zoom.
- **Checking:** after every change, the build is compared with the target as a graph (elements, bonds and bond orders, any atom order).
  - **A match:** the molecule moves into its VSEPR shape, fitted onto the build so atoms barely jump. It shows a bond-angle arc and the lone pairs, then a card with the shape, the ideal angle and a "did you know".
  - **A full molecule that isn't the target:** the message names it if the lab knows it ("This is ethanol, an isomer…"), then says how the target is put together.
- **Help:** Hint (? or Shift+H) gives the next step, worded "Oxygen needs 2 bonds: it has 1. Add a hydrogen to it". When something is wrong, it finds the one change that would fix it and selects the atoms involved. Undo, Clear and Delete (which also removes the deleted atom's hydrogens) are always there.
- **Keyboard:** H C N O L or 1–5 add atoms. Tab and arrows pick atoms (Space jumps to an atom with an open slot), B bonds, Delete, Z, X, M; Shift+arrows turn the view. Esc then Tab leaves the builder, so the keyboard is never trapped.
- **Nothing is stored.** Ticks last only this visit.

## Chemistry decisions

- **Targets** are written in a tiny SMILES-style notation and filled with hydrogens. The tests check that every valency is exactly satisfied and that the written formula (C₂H₅OH, CH₃CHO…) has the same atom counts.
- **Matching:** colour refinement plus backtracking decides isomorphism. Hints use a sub-graph test ("can this still grow into the target?").
- **Shapes** come from bonded atoms plus lone pairs. The model angles are the ideal ones: linear 180°, trigonal planar 120°, tetrahedral 109.5°, trigonal pyramidal 107°, bent 104.5°. Atoms round a C=C lie flat, and chains are staggered. The game says plainly that real angles differ by a few degrees, and the methoxymethane fact gives its real C–O–C angle of about 112°.
- **The free build** names 52 molecules: every task plus 32 more, including cyclopropane, the propene isomer the checker must reject.

## Build

`games/molecule-lab/` contains:
- `chem.js`: pure logic, tested in Node. Elements, building moves, matching, tasks, library, hints, VSEPR geometry, rigid fit, the springy building layout and every message.
- `world.js`: atoms, letters, studs, two-tone bonds, rings, arcs, lone pairs, and the camera, which uses a view offset to frame the molecule in the space the panels leave free. Also picking with a touch-friendly margin.
- `game.js`: state, input, the success flow and layout.

**Checks:**
- `docs/tests/molecule-lab.test.js`: valid targets, isomers apart, random player-order builds accepted, a hint-following bot finishes every task, and ideal angles in every library shape.
- A keyboard-only e2e at desktop, phone and reduced motion: 13 tasks built, including O₂, N₂, CO₂, HCN and an isomer.
- Pointer and touch gesture runs, found on screen by colour.
