# Farm Friends: a 3D animal game for ages 2+

**Date:** 2026-10-09
**Status:** Built and released. The user asked for a 3D animal identifier for ages 2+. Like Rainbow Balloons, it speaks with the device's own voice only (`games/shared/voice.js`).

## How it plays

- **One big ▶ button.** Two to four animals pop up in a farmyard (red barn, fence, hay bales, pond).
- **The question** comes three ways at once: spoken ("Where's the cow?"), as a picture at the top, and as the animal's own call (a moo). A 🔊 button repeats the voice and the call.
- **Tapping an animal** makes it hop and call.
  - **The right one** spins, sends up hearts and hears "Yes! That's the cow! Moo!".
  - **A wrong one** says who it is: "That's the pig. Oink! Where's the cow?". After two wrong taps, the right one bounces as a hint.
  - The voice waits until the animal's call has finished. A newer line replaces one not yet spoken.
- **No failing and no score.** Every 5 finds brings a dance party (no spins or confetti with reduced motion).
- **Difficulty adapts** as in Rainbow Balloons.

| Level | Animals | In play |
|---|---|---|
| 0 | 2 | cow, duck |
| 1 | 2 | + pig, sheep |
| 2 | 3 | + dog, cat |
| 3 | 3 | + horse, chicken |
| 4 | 4 | all eight |

- **On tall screens,** animals stand in two rows and the camera looks down more, so the rows separate and each animal stays big enough to tap.
- **On a keyboard,** the arrows move a ring between animals and Enter picks one.

## Build

- **`farm.js`:** the animals, levels, rounds and messages, tested in Node.
- **`animals.js`:** eight animals built from simple shapes in the critters' style, each with the features a toddler knows it by.
- **`world.js`:** the farmyard, layout, camera, picking, the keyboard ring, and heart and puff effects.
- **`game.js`:** the rounds, input and voice.
- **Shared kit:**
  - `critters.js` now exports `Critters.rig(kind, build)` and `Critters.parts` (the eye, blush and shape helpers), so other games can build animals that breathe, blink and hop like the critters. Tail wagging moved to `parts.wag`, with no change to the critters.
  - `sound.js` gained `call()`, a voice-like synthesiser, and eight animal calls: moo, quack, oink, baa, woof, meow, neigh and cluck. They are synthesised in the browser, with no audio files.

**Checks:**
- Node tests build all eight animals with the real kit.
- Keyboard-only play-throughs on desktop, phone and reduced motion, with a fake speech engine; every line must use the on-device voice.
- Opening the page over `file://`.
- Regression runs of the other games that use the kit.
