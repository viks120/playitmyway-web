# Projectile Range: a 3D projectile motion game for ages 14+

**Date:** 2026-10-09
**Status:** Built on its own branch; the coordinator wires it into the catalogue, homepage, sitemap and offline cache.

## How it plays

- **Each shot:** set the launch angle θ and speed v, then launch from a dome launcher (a critter is the loader). The ball flies on the exact path for the world's gravity, with no air resistance, and drops a dot at equal time steps (0.05 to 0.25 s, at most 40 dots). Evenly spaced dots across show the constant horizontal speed; bunching near the top shows gravity at work.
- **After each shot:**
  - the message strip says what happened ("2.4 m short: it landed at 27.6 m. More speed will carry it further.");
  - the results line shows the measured time, highest point and landing distance;
  - 📐 Working shows every formula with the numbers put in (R = v² sin 2θ / g, H = v² sin² θ / 2g, T = 2v sin θ / g, the landing time at height h, and the height at a wall or platform edge).
- **The camera** follows the ball, closes in on the landing, then shows the whole shot with the previous shot's trail beside it. On tall screens it swings round behind the launcher so the range runs up the screen.
- **Help:** three or four hints per level (the idea, the world's gravity, the formula, then "Try about 30–35°"). After one hit on a two-angle level, the hint names 90° − θ.
- **Predict (🔮, P):** type the landing distance before launching; within 5% earns a bonus tick. Ticks last this visit only; nothing is stored.

## Levels

24 levels in 7 groups, all on Earth (g = 9.8 m/s²) unless stated:

1. **Find the angle** (4 levels): the speed is fixed.
2. **Find the speed** (4 levels): the angle is fixed.
3. **Two angles, one target** (3 levels): hit with θ and 90° − θ.
4. **Over the wall** (3 levels).
5. **Up on the platform** (3 levels).
6. **Other worlds** (4 levels): the Moon (1.6), Mars (3.7) and a heavy planet (24.8).
7. **Sharpshooter** (3 levels): three shots, targets ±0.75 m. Running out keeps your settings for the next try.

Earlier targets are ±1.25 m to ±2 m.

## Controls and steps

- **Angle:** 10° to 80°, in 0.5° steps (about a protractor's resolution). Near 30° a step moves the landing spot about 1% of the range.
- **Speed:** in 0.1 m/s steps, within each world's range. The range goes as v², so a step moves it by 2 × 0.1 / v: 1% at 20 m/s and under 3% even at 7 m/s on the Moon.
- **Keys:** the arrow keys move by 1° and 1 m/s; Shift and the − and + buttons move by one fine step, and holding a button repeats. Enter or Space launches (and skips a flight); H hints, R resets the view, W shows the working, P predicts.
- **Touch and mouse:** real range inputs with labels, drag to look around, and pinch or Ctrl+wheel to zoom.

## Build

`games/projectile-range/` contains:
- `flight.js`: pure logic (window.Flight). The physics, levels, solver, hints, progress and every message.
- `world.js`: the four worlds, the range and measuring tape, the launcher, the ball and trails, labels that keep a set size on screen, and the box-fitting cameras.
- `game.js`: the menu, controls, flight timing on the game clock (dt capped at 0.05 s), messages, cards and input.

**Checks:**
- `docs/tests/projectile-range.test.js`:
  - the formulas against worked examples, and walls, platforms and landings;
  - every level has winning settings on the 0.5° / 0.1 m/s grid (with one at least 0.25 m inside the target), its start settings miss, and every flight lasts under 10 s;
  - each hint's suggested window contains a real solution, and every message fits a phone's message strip.
- A keyboard-only e2e at desktop, phone (with real taps) and reduced motion. It plays levels 1, 2, 9, 12, 18 and 22, covering a deliberate miss, hints, the working, a prediction, both angles, a blocked wall shot, the Moon, running out of shots and the retry. It also checks layout overlap, storage and network.
