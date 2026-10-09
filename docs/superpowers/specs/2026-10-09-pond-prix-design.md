# Pond Prix: a 3D kart race with answer gates, for ages 5+

**Date:** 2026-10-09
**Status:** Built and released in one go. The user approved this concept in the conversation: a 3-lap race round the pond, the four critters in karts, and answer gates for boosts.

## Goal

A racing game that is genuinely exciting and still teaches. The karts follow the road by themselves, so no child can crash or get lost. The only skills needed are changing lane and knowing the answer.

## How it plays

- **Start.** Pick a racer (Clover, Pip, Plum or Mango), then a race. A countdown of 3, 2, 1, Go! follows. The player starts in the middle of the pack, behind two rivals.
- **Driving.** There are three lanes. Change lane with ← or →, a tap on the left or right half of the race, or a tap on an answer chip. Space honks.
  - Karts cannot drive through each other, so a slower kart ahead has to be passed in another lane.
  - Orange arrow pads give a short boost, and brown mud slows you down. Both sit in fixed lanes, the same every lap.
- **Answer gates.** There are 3 per lap, so 9 a race.
  - The question appears on a card and as three chips that match the lanes.
  - Each lane has an arch with a big number sign.
  - **The right arch** gives a 2-second boost, sparkles and "Boost! 3 + 4 = 7."
  - **A wrong arch** gives a mud splash and "Splash! 3 + 4 = 7, not 6." The signs then show the right answer in green.
- **Rivals.** They take the right arch 62%, 70% and 78% of the time, steer round mud, and sometimes go for a boost pad. Gentle rubber-banding keeps every race close.
- **The finish.** Confetti, unless reduced motion is on. A results card shows the place, "8 of 9 answers right." and the finishing order. Its buttons are Race again, Next race and Change racer.

## Races

| Cup | Questions |
|---|---|
| Warm-up | None: just drive |
| Count the fish | 2 to 10 fish |
| Adding | Sums up to 10 |
| Add and take away | Add or take away, with answers from 1 to 20 |
| Times tables | The 2, 3, 4, 5 and 10 times tables |

- **Wrong answers** are near misses and classic slips, such as the next row of a table or adding instead of taking away.
- **Each sum** is used only once per race, and no question comes twice in a row.
- **`?seed=N`** makes the first race repeatable, for the end-to-end test.

## Build

`games/pond-prix/` uses classic scripts after the shared kit:

| File | Purpose |
|---|---|
| `race.js` | Pure logic: the track plan (control points, gate and pad positions), cups, question plans, places and messages. Tested in Node. |
| `world.js` | The circuit, scenery, gates and signs, pads, karts, cameras and effects. |
| `game.js` | Menu, countdown, driving, rivals, gates, laps and the finish. |

- **The road** is a `PlaneGeometry` bent into a ribbon along the centreline, so the Three.js bundle did not need rebuilding.
- **The circuit** is about 450 units long. Its tightest bend has a radius of 14, and no two parts of the loop come within 37 of each other; a script checked all three numbers.
- **Checks:**
  - `docs/tests/pond-prix.test.js`: 1,000 seeds per cup, plus the track layout and messages.
  - Keyboard-only full races for every cup, on desktop, on a phone and with reduced motion.
  - Opening the page over `file://`.
