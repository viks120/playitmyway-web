# Rainbow Balloons: a 3D colour game for ages 2+

**Date:** 2026-10-09
**Status:** Built and released. The user asked for a colour identifier for ages 2+, and agreed that games for non-readers may speak using the device's own voice, never an online one.

## How it plays

- **One big ▶ button.** Two to four big balloons rise into the sky over the meadow, with the four critters below, and a colour is asked for.
  - The prompt is spoken ("Pop the red balloon!"), shown as a big balloon of that colour at the top, and written in the message strip for grown-ups and screen readers.
  - A 🔊 button says it again.
- **The right balloon** pops into confetti in its colour, the critters hop and cheer, and the voice says "Pop! That's red!". The other balloons float away and a new set rises.
- **A wrong balloon** wiggles and says its own colour ("That's blue. Find red!"). After two wrong taps, the right balloon bounces as a hint.
- **No failing and no score.** Every 5 pops brings a party with confetti and spins (calmer with reduced motion).
- **Difficulty adapts.** Found first time moves up a level; a second try stays; more tries move down.

| Level | Balloons | Colours in play |
|---|---|---|
| 0 | 2 | red, blue |
| 1 | 2 | + yellow |
| 2 | 3 | + green |
| 3 | 3 | + orange, purple |
| 4 | 4 | all six |

- **Balloons in a round** are all different colours, and the same colour is never asked for twice in a row.
- **On tall screens,** balloons sit in rows of two so each stays big enough for a small finger.
- **On a keyboard,** the arrows move a ring between balloons and Enter pops one.

## The voice

`games/shared/voice.js` is new and shared by every game for non-readers. It picks an on-device English voice (`localService` true), preferring the device default, then British, then American. It never uses an online voice; with no local voice it stays silent and the picture clue carries the game. It follows the site's sound toggle, and `docs/tests/voice.test.js` covers the choice.

## Build

`games/rainbow-balloons/` contains:
- `balloons.js`: the colours, levels, rounds and messages, tested in Node.
- `world.js`: the meadow, pond, clouds, balloons, keyboard ring, camera and confetti.
- `game.js`: the rounds, input and voice.

**Checks:**
- Keyboard-only play-throughs on desktop, phone and reduced motion. A fake speech engine offers an online voice and an on-device one, and every line spoken must use the on-device voice.
- Opening the page over `file://`.
