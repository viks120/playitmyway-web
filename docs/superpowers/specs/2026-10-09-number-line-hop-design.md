# Number Line Hop: adding and taking away on a 3D number line

**Date:** 2026-10-09
**Status:** Design approved by user section by section, including a playable
mockup of all three stages; the user approved building and releasing it once
everything passes.

## Goal

A 3D game for ages 5+. A critter hops along a number line of lily pads to show
adding and taking away within 10 and 20: counting on, counting back and
crossing ten. It is the site's second 3D game. It keeps every site rule
(static, nothing stored, zero third-party requests, works offline and over
`file://`) and reuses Stepping Stones' critters and look. See
`2026-10-06-stepping-stones-design.md` for the conventions they share.

## Decisions made with user

- **Two games, one after the other.** Number Line Hop (5+) now; Peekaboo Pond
  (3+) next, in its own design, build and release cycle.
- **Three stages in every pond:** "Hop and count", then "Where will you land?",
  then "How far to your friend?". The help fades as the stages go.
- **Five ponds:** Add to 10, Take away from 10, Add to 20, Take away from 20,
  Mix it up. "Jumps of 10" was not chosen.
- **The mockup is approved as shown:**
  - the camera follows the critter;
  - a flat number line in the problem card shows the whole line and every
    jump;
  - stage 1 has a big **Hop!** button.
- **One shared 3D kit:** Three.js, the toon look, the critters and the sounds
  move to `games/shared/3d/`, for Stepping Stones and every later 3D game.
- **Release:** live once every check passes.

## Gameplay

### Ponds

| Id | Title | Line | Operation | Jump sizes | Extra rule |
|---|---|---|---|---|---|
| `add-10` | Add to 10 | 0–10 | + | 1–5 | start ≥ 1 |
| `sub-10` | Take away from 10 | 0–10 | − | 1–5 | |
| `add-20` | Add to 20 | 0–20 | + | 2–9 | start ≥ 1; at least 5 of the 9 problems cross ten |
| `sub-20` | Take away from 20 | 0–20 | − | 2–9 | at least 5 of the 9 cross ten |
| `mix-20` | Mix it up | 0–20 | + and − | 1–9 | at least 3 of each operation |

- **Range:** every problem starts and ends on the line, between 0 and the
  line's top.
- **Crossing ten:** start < 10 < end when adding, start > 10 > end when
  taking away. Landing exactly on 10 does not count.
- **Menu:** order follows the table, and **Add to 10** carries the "Start
  here" badge. Every pond is open.

### A pond

- **Problems:** nine, made fresh every time from a seeded generator, with no
  repeats (the same start, jump and operation) within a pond. Problems 1–3 are
  stage 1, 4–6 stage 2, and 7–9 stage 3.
- **Stage-3 jumps are at least 2,** because a gap of one hop teaches nothing.
- **Stage 1, Hop and count.** The card shows `4 + 3 = ?` and "Plum is on 4.
  Hop 3 more!" (or "Hop 4 back!" when taking away).
  - **Each press of Hop!** makes one hop: the landing number pops up, a note
    plays, and a +1 (or −1) arc appears in 3D and on the flat line.
  - **While hopping,** the message lists the count: "5… 6… 7!".
  - **After the last hop:** `4 + 3 = 7`, "You counted on: 5, 6, 7!" ("You
    counted back: 8, 7, 6, 5!" when taking away), sparkles, and friends
    cheering.
  - Hop! never makes more hops than the problem asks for.
- **Stage 2, Where will you land?** The card shows `4 + 3 = ?` and "Where will
  Plum land? Tap that pad."
  - **Guessing:** one guess per problem. A gold ring marks it, the message says
    "You think 8. Let's hop and see!", and the critter hops by itself.
  - **Right:** "Yes! You guessed 7."
  - **Wrong:** "Plum landed on 7, not 8. Count the hops: 5, 6, 7." It counts
    as a miss.
- **Stage 3, How far to your friend?** One of the three friends pops onto the
  answer pad with a puff, a different friend for each problem. The card shows
  `4 + ? = 7` and "Mango is on 7. How many hops?" ("How many hops back?" when
  taking away).
  - **Buttons:** numbered 1 up to the pond's largest jump, leaving out any
    that would hop off the end of the line.
  - **Right:** "3 hops! 4 + 3 = 7".
  - **Too short:** "Plum landed on 6. Mango is 1 more hop away! Try again."
  - **Too far:** "Too far! 4 + 4 = 8, past Mango. Try again."
  - **After either miss,** the critter hops home and the buttons come back.
  - **A second miss** counts as a miss for stars, and the critter shows the
    way: "Let's count together: 5, 6, 7. That's 3 hops! 4 + 3 = 7".
- **Between problems:** a **Next →** button. The critter pops to the new start
  pad.
- **Pond done:** a dialog with stars and **Next pond**, **Same pond again**
  and **All ponds**. The misses that count are stage-2 wrong guesses and
  stage-3 problems not right first time, six chances in all. 0–1 misses earns
  3 stars, 2–3 earns 2, and 4 or more earns 1. Stars last for this visit only.
  The subtitle reads "Every answer right first time!", or "N of 6 right first
  time."
- **Like Stepping Stones:** pick a critter, pick a pond, switch critters any
  time (the face button), and the other critters cheer from the bank. On a
  long line they hop along the bank to keep up with the camera.

### Messages

All messages come from `lines.js`, so the tests check their exact wording:

| Case | Adding | Taking away |
|---|---|---|
| Stage 1 prompt | `Plum is on 4. Hop 3 more!` | `Plum is on 9. Hop 4 back!` |
| Stage 1 done | `You counted on: 5, 6, 7!` | `You counted back: 8, 7, 6, 5!` |
| Stage 2 prompt | `Where will Plum land? Tap that pad.` | same |
| Stage 2 right | `Yes! You guessed 7.` | same |
| Stage 2 wrong | `Plum landed on 7, not 8. Count the hops: 5, 6, 7.` | `Plum landed on 5, not 6. Count the hops: 8, 7, 6, 5.` |
| Stage 3 prompt | `Mango is on 7. How many hops?` | `Mango is on 5. How many hops back?` |
| Stage 3 right | `3 hops! 4 + 3 = 7` | `4 hops! 9 − 4 = 5` |
| Stage 3 short | `Plum landed on 6. Mango is 1 more hop away! Try again.` | `Plum landed on 7. Mango is 2 more hops away! Try again.` |
| Stage 3 far | `Too far! 4 + 4 = 8, past Mango. Try again.` | `Too far! 9 − 6 = 3, past Mango. Try again.` |
| Stage 3 shown | `Let's count together: 5, 6, 7. That's 3 hops! 4 + 3 = 7` | `Let's count together: 8, 7, 6, 5. That's 4 hops! 9 − 4 = 5` |

"Plum" and "Mango" stand for the playing critter's name and the friend's name.
The minus sign is `−` (U+2212). A single hop is "1 hop" or "1 more hop", never
"1 hops".

## Look and sound

- **Shared look:** the toon look, outlines and critters come from the kit.
- **Pads:** lily pads 1.35 apart along the x axis, numbers increasing to the
  right, each with a cream badge carrying its number in Fredoka 700.
- **Scene:** water, sky fog, and a grassy far bank where the friends stand.
- **Jump arcs:** tubes floating behind the line, violet `#8b5cf6` for adding
  and coral `#f97362` for taking away. They are cleared at each new problem.
- **Camera:** pitch 0.6 rad, following the critter and showing about 5 pads on
  a tall screen and about 7 on a wide one. In stage 3 it widens to show both
  the critter and the friend.
- **The flat number line** (SVG in the problem card):
  - ticks for 0 to the top of the line, every number labelled, multiples of 5
    in bold;
  - the start number coloured, each done jump drawn as an arc labelled +1 or
    −1;
  - the critter as a dot, the stage-2 guess as a gold mark, and the stage-3
    friend's emoji over its pad.
  - It is `role="img"`, with a label such as "Number line from 0 to 10. Plum
    is on 7. Mango is on 9."
- **Sounds,** from the kit: hop; a note per landing, rising when adding and
  falling when taking away; "uh-oh" on a miss; the win jingle at the end of a
  pond; the poof and the voice squeak.
- **5+ band chrome:** amber (`#b45309`, tint `#fef3c7`, deep tint `#d8c897`)
  and theme colour `#b45309`.

## Controls and accessibility

- **Stage 1:** Hop! is a real button and gets focus when a problem starts, so
  Space or Enter keeps hopping.
- **Stage 2:** tap a pad (the nearest pad within 0.75 of the tap counts), or
  use the keyboard on the focused line. ← and → move the gold ring from the
  start pad ("Pad 8" is announced), and Enter guesses.
- **Stage 3:** number buttons are real buttons, and number keys 1–9 press them
  while a stage-3 problem waits for an answer. The first button gets focus.
- **Next → and the dialog's first button** get focus when they appear. Esc
  closes the critter picker; in the dialog it goes to All ponds.
- **Screen readers:** a polite live region carries every prompt, the count as
  it happens, and every result. The stage-2 ring position goes in its own
  polite region.
- **The rest matches Stepping Stones:** reduced motion means no spins or
  confetti; without WebGL a friendly message links to two other 5+ games (Balloon Pop, Sort It Out);
  rendering pauses while the tab is hidden; the pixel ratio is capped at 2.

## Architecture

**Shared kit** `games/shared/3d/`: `three.min.js`, `toon.js`, `critters.js`
and `sound.js`, moved unchanged from `games/stepping-stones/`.

- Stepping Stones' page loads them from `../shared/3d/`.
- `docs/vendor/build-three.js` writes the bundle there.
- The service-worker precache lists the kit once.

`games/number-line-hop/`, all classic scripts loaded in order:

| File | Purpose | Interface |
|---|---|---|
| `index.html` | The page: head, back link, title, stage with HUD markup, how to play, footer, scripts | n/a |
| `lines.js` | Ponds, problem generator, hop choices, every message. Pure: no `THREE`, no DOM | `Lines.LIST`, `Lines.GROUPS`, `Lines.generate(id, seed)` → `{id, title, max, problems[9]}` with each problem `{op, start, jump, end, crosses, stage}`; `Lines.choices(id, problem)`; `Lines.say.*` message builders; `Lines.rng`. `window.Lines` in the browser, `module.exports` in Node |
| `world.js` | Renderer, scene, picker pads, the line of pads, arcs, ring, camera, effects | `World.create(canvas)` → world object or `null` |
| `game.js` | Screens, stages, HUD, flat number line, input, choreography | none |

## Testing

1. **`docs/tests/number-line-hop.test.js`:** every pond across 2,000 seeds.
   - nine problems, in stages 3 + 3 + 3;
   - the sums are right and stay on the line;
   - jump sizes stay in range, and stage-3 jumps are at least 2;
   - no repeats within a pond;
   - adding never starts at 0;
   - the crossing-ten and each-operation quotas hold;
   - `choices` always includes the right answer and never leaves the line;
   - every message in the table above, word for word, plus determinism and
     variety.
2. **`docs/tests/shared-3d.test.js`:**
   - the MIT licence text is present;
   - every `THREE.*` used by any game script exists in the bundle;
   - the critters build in Node.

   These move here from the Stepping Stones test file, whose pond tests stay
   where they are.
3. **A keyboard-only end-to-end player** (scratchpad):
   - plays Add to 10 with one deliberate wrong guess and one stage-3 problem
     missed twice, expecting 2 stars;
   - goes to the next pond, switches critter and plays it perfectly,
     expecting 3 stars;
   - checks the menu's stars, that nothing is stored, and that there are no
     errors and no third-party requests.
4. **Stepping Stones' end-to-end player** runs again after the kit move.
5. **Other checks:** phone and computer screenshots, opening the page as a
   file, and the same play-through against the live site after release
   (Cloudflare's injected analytics beacon set aside, as before).

## Site integration

- **Catalogue entry:** `number-line-hop`, emoji 🐾, age 5, about 10 minutes,
  skill `numbers`. Practises: "Adding and taking away within 10 and 20 by
  hopping along a number line: counting on, counting back and crossing ten,
  then guessing where a hop will land and how far away a friend is."
- **Homepage:** a 5+ card. **Sitemap:** an entry. **Counts:** "30" becomes
  "31" on the homepage and in the manifest.
- **Generated pages:** regenerate with `node docs/build-pages.js`.

## Out of scope

- Jumps of 10.
- Spoken numbers. 5+ children read numerals; the notes and pop-up numbers
  carry the count.
- Remembering progress between visits.
