# Peekaboo Pond: watch and remember, for ages 3+

**Date:** 2026-10-09
**Status:** The user chose the concept (a critter hides, the hiding places
slide around, the child taps to find it) and asked for it to be built and
released in one go. The finer decisions below were made on that brief and
are recorded here so they can be revisited.

## Goal

A 3D game for ages 3+. One of the four critters hides inside a lotus flower,
the flowers slide around on the pond, and the child taps the flower they
think it is in. It practises following with the eyes, short-term memory and
patience. It is the site's third 3D game. It uses the shared kit
(`games/shared/3d/`) and keeps every site rule: static, nothing stored, zero
third-party requests, works offline and over `file://`.

## Decisions

- **No reading needed, and no failing.** Everything the child needs is shown,
  not written: the critter visibly hides, the flowers visibly move, and the
  flowers wiggle when it is time to tap. A wrong flower holds a little
  surprise instead of an error. Text exists for parents and screen readers.
- **No spoken words.** Browser speech can quietly use online voices that
  send text to a server. Critter squeaks and sound effects carry the
  feedback instead.
- **No menus, levels or stars.** One big ▶ Play button starts the game, which
  also unlocks sound on phones. Difficulty adapts by itself.
- **All four critters play.** They take turns hiding (Clover, Pip, Plum,
  Mango, Clover…) while the other three watch and cheer from the bank.
  There is no critter picker.
- **Flowers, not cups:** pink lotus buds that close over the critter and
  bloom open when tapped. All buds look identical, so position is the only
  clue.

## Gameplay

### A round

1. **Hide.** The flowers on the pond are open. The round's critter hops from
   the bank onto one flower's pad, waves (a happy hop and a squeak), and the
   flower closes over it. Then the others close. Message: "Clover is hiding!
   Watch the flowers."
2. **Shuffle.** The flowers swap places in pairs along curved paths, one
   swinging out in front and the other behind, so they never pass through
   each other. Message: "The flowers are moving…"
3. **Seek.** The flowers take turns giving a little wiggle, as if inviting a
   tap. A bubble at the top shows the hidden critter's face with a question
   mark. Message: "Where's Clover? Tap a flower."
4. **Tap.** The tapped flower blooms open:
   - **Found:** the critter pops up with sparkles, a squeak and a happy hop,
     and the friends on the bank cheer. Message: "Peekaboo! You found
     Clover!" on the first tap, or "Peekaboo! There's Clover!" after a miss.
   - **Not found:** a surprise is inside, a little goldfish or a sleepy
     ladybug, taking turns. Message: "Not here! Just a little goldfish. Try
     another flower." The flower closes again. After two misses in a round,
     the right flower wiggles harder ("Look, that flower is wiggling!").
5. **Home.** The critter hops back to the bank and fills the next progress
   slot. The next round starts with the next critter.

**Party:** after every 5 finds, all four critters hop together, confetti
falls ("Five friends found! Party time!"), and the progress row empties.
Play goes on until the child stops.

### Adaptive difficulty

| Level | Flowers | Swaps | Swap time | Swap rule |
|---|---|---|---|---|
| 0 | 2 | 0 | n/a | n/a |
| 1 | 3 | 0 | n/a | n/a |
| 2 | 3 | 1 | 1.0 s | neighbours only |
| 3 | 3 | 2 | 1.0 s | neighbours only |
| 4 | 3 | 3 | 0.8 s | neighbours only |
| 5 | 4 | 2 | 0.8 s | any pair |
| 6 | 4 | 3 | 0.8 s | any pair |
| 7 | 4 | 4 | 0.62 s | any pair |

- **Start:** play begins at level 0.
- **Adapting:** after each round, found on the first tap means up a level
  (to at most 7), on the second tap stays put, and on the third or later
  goes down a level (to at least 0).
- **Swap plans** come from a seeded generator:
  - each swap exchanges the flowers in two different slots;
  - the same pair is never swapped twice in a row, since that would undo the
    move;
  - at least half the swaps (rounded up) involve the hiding critter's
    flower, so it really moves;
  - the answer is wherever that flower ends up.
- **Seeds:** the page takes an optional `?seed=` number for repeatable play,
  which the end-to-end test uses. Without it, each visit is random.

## Look and sound

- **Look:** the shared toon look and critters on the same pond as the other
  3D games. The bank is behind the flowers, with reeds, and the three
  watchers stand on it.
- **Flowers:** a lily pad, and on it six pink petals (`#ffb3c9`, outline
  `#e88aa5`) hinged at the base. Closed, they lean in to make a bud about 1.3
  tall. Open, they lean out into a bloom.
  - **Opening and closing** takes 0.35 s.
  - **While seeking,** they sway gently and wiggle in turn.
- **Surprises:** the goldfish is an orange body, a tail and big eyes; it
  jumps out and splashes back. The ladybug is a red dome with black spots
  and a tiny face; it wiggles.
- **Camera:** in front and a little above, framing every flower (2 to 4) on
  any screen. Tall screens get a wider vertical view so the row still fits.
- **Sounds,** all from the kit:
  - a hop;
  - a poof when a flower closes;
  - a soft rising note for each swap;
  - the critter's voice squeak on a find, plus the win jingle on a party;
  - "uh-oh" is not used, because nothing is wrong. A wrong flower gives the
    pop sound.
- **3+ band chrome:** teal `#0f766e`, tint `#ccfbf1`, deep tint `#99d5cb`,
  button shadow `#134e4a`, and theme colour `#0f766e`.

## Controls and accessibility

- **Pointer:** tap a flower. The nearest flower within 1.1 units of the tap
  counts, which suits small fingers. Taps during the hide and shuffle are
  ignored.
- **Keyboard:** the pond is a focusable `role="application"` region. The
  first ← or → shows a teal ring on the middle flower; later presses move it,
  and Enter or Space opens the flower. Ring moves are announced as "Flower 2
  of 3".
- **Screen readers** hear every message through a polite live region. The
  game is still a visual tracking game, so the messages mainly serve
  parents and keep the state readable.
- **Reduced motion:** no confetti and no party spins. The swaps stay,
  because they are the game.
- **The rest matches the other 3D games:** a friendly fallback without WebGL
  (linking to Memory Match and Count With Me), pausing when the tab is
  hidden, and the pixel ratio capped at 2.

## Architecture

`games/peekaboo-pond/`, all classic scripts loaded after the kit:

| File | Purpose | Interface |
|---|---|---|
| `index.html` | The page: head, back link, title, stage with start overlay, progress bubble and message strip, how to play (for parents), footer | n/a |
| `rounds.js` | Levels, swap plans, adaptation, messages. Pure: no `THREE`, no DOM | `Rounds.LEVELS`, `Rounds.plan(seed, round, level)` → `{hider, buds, start, swaps, answer, swapTime}`; `Rounds.nextLevel(level, taps)`; `Rounds.say.*`; `Rounds.rng`. `window.Rounds` in the browser, `module.exports` in Node |
| `world.js` | Renderer, scene, flowers with hinged petals, surprises, bank, ring, camera, effects | `World.create(canvas)` → world object, or `null` |
| `game.js` | Start, rounds, hiding, shuffling, seeking, revealing, party, input | none |

## Testing

1. **`docs/tests/peekaboo-pond.test.js`**, across every level, 1,000 seeds and
   6 rounds each:
   - flower and swap counts match the level;
   - the neighbours-only rule holds where it applies;
   - no pair repeats back to back;
   - at least half the swaps (rounded up) move the critter;
   - the answer agrees with an independent re-simulation;
   - the hider takes turns;
   - adaptation follows the table;
   - every message is word for word;
   - the same seed gives the same plan.
2. **Shared kit tests** pick the new scripts up automatically (THREE
   coverage, and loading the kit from `../shared/3d/`).
3. **A keyboard-only end-to-end player** (scratchpad):
   - loads `?seed=…`, presses Play, and plays 6 rounds, following the plans
     computed in Node;
   - misses deliberately in rounds 2 and 5, checking every message and that
     the level adapts;
   - checks the party after 5 finds, that nothing is stored, and that there
     are no errors and no third-party requests;
   - runs at computer and phone sizes, and with reduced motion.
4. **Other checks:** screenshots, opening the page as a file, and the same
   play-through against the live site after release.

## Site integration

- **Catalogue entry:** `peekaboo-pond`, emoji 🌸, age 3, about 5 minutes,
  skill `logic`. Practises: "Watching and remembering: following a hidden
  friend as the flowers slide around, then finding it. It gets trickier only
  as the child gets it right, and a wrong flower just holds a surprise."
- **Homepage:** a card in the 3+ Little Learners grid. **Sitemap:** an
  entry. **Counts:** "31" becomes "32" on the homepage and in the manifest.
- **Generated pages:** regenerate with `node docs/build-pages.js`.

## Out of scope

- Spoken instructions.
- Choosing a level or a critter.
- More surprise kinds than the two.
- Remembering anything between visits.
