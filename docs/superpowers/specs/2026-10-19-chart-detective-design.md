# Chart Detective: a data-handling game for ages 5+

**Date:** 2026-10-19
**Status:** Design approved; not yet built. Vikrant asked for a game that builds analytical skills, picked a data-handling game from four candidates (the others were a rule-finding game, a clue-deduction game and a visual-pattern game), chose a 2D illustrated page over a 3D scene, and chose "Survey then Read" over "Detective Cases" (read-only charts, 7+) and "Snack Stall" (stock a shop from a chart).

## Why

Statistics is the one strand of the primary curriculum the site has no game for, and reading data is the clearest way to practise analytical thinking: read information, compare, draw a conclusion. The catalogue's logic games are planning puzzles (Pebble Push, Frozen Pond, One Line Draw, Log Jam) and 14+ constraint deduction (Sudoku, Minesweeper, Word Guess). This is the only game of its kind on the site, so it covers the whole strand from Year 1 to Year 4 rather than one corner of it.

## Listing

- **Name:** Chart Detective. **Slug:** `chart-detective`. **Band:** 5+. **Minutes:** 10. **Skills:** numbers, logic.
- **Practises (catalogue text):** "Reading and making charts: tally marks in fives, pictograms and block diagrams, then pictograms with a key, bar charts with axis steps of 2, 5 and 10, and two-way tables. Things arrive one at a time to be counted, then the questions ask which was most or least, how many more, and how many altogether. A wrong answer gets a hint, then the two bars are compared block by block."
- The 5+ band outcome line in `docs/catalogue.js` gains the word "charts".
- **Icon:** `icons/games/chart-detective.svg`, a magnifying glass over three small bars, obeying `docs/tests/icons.test.js`.

## How it plays

### A case

A case is one round. The start screen shows the five stage cards (below), the first highlighted; the child picks any.

- **Stages 1 and 2 collect, then read.** Things arrive one at a time under a spotlight at the top of the chart (a ladybird crawls in, an apple drops in, a day's weather appears). The child taps the matching row or column and the thing animates into the chart: a tally stroke, a symbol, a block. A wrong column nudges and names itself ("That's a snail"), the way Farm Friends does, and the thing waits. When the last one is placed the chart is complete and the questions begin.
- **Stages 3 to 5 read a given chart.** The chart is handed over complete and the case opens with a one-tap warm-up on the key or the axis ("Each symbol stands for how many?", "The axis goes up in steps of...?"). The warm-up counts as a question.
- **Questions:** three in stages 1 and 2, four in stages 3 to 5 (including the warm-up). Each is one short sentence in a speech bubble from the detective critter, spoken by the on-device voice.
- **Case closed:** the chart, the findings as sentences ("Most were ladybirds. 3 more ladybirds than ants."), a **Next case** button (same stage, new case) and, when every answer was right first time, a **Next stage** button shown first. Nothing is saved, so a reload returns to the start screen. Three to five cases fill five to ten minutes.

### The stage ladder

Counts are always distinct whenever a most, least or compare question will be asked, so there is never a tie.

| Stage | Years | Chart | Categories and counts | Question types |
|---|---|---|---|---|
| 1 Tally Time | 1 to 2 | Tally chart; strokes in fives, the fifth crossing the four | 3 categories, counts 1 to 8, total 9 to 15 | how many; most; least |
| 2 Picture It | 2 | Pictogram with one symbol per thing, or a block diagram on alternate cases | 3 or 4 categories, counts 2 to 10 | how many; most or least; how many more (difference 1 to 5); two together (total up to 20) |
| 3 Key of Two | 3 | Scaled pictogram with a key: 2 first, then 5 and 10; half symbols allowed | 4 categories, counts up to 20 (key 2), 50 (key 5), 100 (key 10) | warm-up: what the symbol stands for; how many; how many more or fewer; two together; true or false |
| 4 Bar Charts | 3 to 4 | Bar chart with axis steps of 2, 5 or 10; early cases land every bar on a gridline, later cases put some bars exactly halfway between | 4 or 5 categories, counts up to 50 | warm-up: what the axis goes up in; read a bar; most or least; how many more or fewer; two together; true or false |
| 5 Tables | 3 to 4 | Two-way table: three critters by three days, with a row total shown for one critter | cells 1 to 12 | read a cell; a row total; who found most on a day; the missing cell from a given total (two-step) |

Example cases:

- **Stage 1,** minibeast hunt: ladybird 7, ant 4, snail 2. How many ants? **4.** Which did we see most? **ladybird.** Which did we see least? **snail.**
- **Stage 2,** picnic fruit: apple 6, banana 9, grapes 3, orange 5. How many more bananas than apples? **3.** How many grapes and oranges together? **8.** Which fruit was picked least? **grapes.**
- **Stage 3,** pets, key 2: dog 8, cat 5, fish 12, rabbit 3. Each symbol stands for how many? **2.** How many cats? **5** (the chips offer 2 and 3 as well, the symbol count and the half-symbol trap). How many more fish than dogs? **4.** True or false: more rabbits than cats? **False.**
- **Stage 4,** ways to school, step 5: walk 20, bike 10, bus 25, car 15, scooter 5. The axis goes up in steps of? **5.** How many more come by bus than by car? **10.** How many walk or bike? **30.** Which is least? **scooter.**
- **Stage 5,** shells found: Clover 3, 5, 4; Pip 6, 2, 5; Plum 4, 4, 1 on Monday, Tuesday, Wednesday, with Clover's total 12 shown. How many did Pip find on Tuesday? **2.** How many did Plum find altogether? **9.** Who found most on Monday? **Pip.** Clover found 12 in all; how many on Wednesday? **4** (the table hides that cell for this question).

### Wrong answers teach, in two steps

- **First wrong answer:** a hint aimed at the likely mistake, then try again.
  - how many on a keyed pictogram, symbol count chosen: "Each symbol is 2. Count in twos: 2, 4, 6..."
  - how many more, the bigger count chosen: "That's how many fish. We want the difference. Line them up."
  - least, the biggest chosen: "Least means the smallest. Which is shortest?"
  - a bar between gridlines: "It stops halfway between 10 and 20."
  - otherwise: the general hint for the question type ("Count the blocks in that column.").
- **Second wrong answer:** the worked answer. The columns involved highlight, the extra blocks pulse and count out one by one, and the sentence is shown and spoken: "Fish 12, dogs 8. Four more fish." Then the case moves on.
- **Right first time:** a tick, and the finding joins the case notes.
- The distractor chips are built from the same misconceptions: on a keyed pictogram, the raw symbol count; on how many more, the bigger count and the sum; on a bar between gridlines, the gridline below and above.

### Themes and artwork

Six themes of five categories each; a case uses three to five of them. Each category has an original inline SVG glyph in the site's ink-outline style (`#33302e` outlines, palette fills), legible at 24px. Categories are told apart by shape and label, never by colour alone.

| Theme | Categories |
|---|---|
| Minibeast hunt | ladybird, ant, snail, bee, butterfly |
| Picnic fruit | apple, banana, grapes, orange, strawberry |
| Pets | dog, cat, fish, rabbit, bird |
| Weather week (stages 1 and 2 only; the things are days) | sunny, cloudy, rainy, windy, snowy |
| Beach finds | shell, starfish, pebble, feather, crab |
| Ways to school | walk, bike, bus, car, scooter |

Stage 5 tables use the critters Clover, Pip and Plum by Monday, Tuesday, Wednesday, counting things from any theme. The detective is the fourth critter, Mango, asking from a speech bubble; the flat critters come from `icons/critters/`.

### Interaction and access

- **Answering:** most or least by tapping the column itself; numbers from four chips under the question; true or false from two chips. During collecting the columns are the buttons too.
- **Keyboard:** every control is a real `<button>`; number keys 1 to 5 pick columns; the chart is one keyboard group; Enter or Space activates.
- **Screen reader:** a visually hidden `<table>` mirrors the chart with its caption, key and one row per category, and updates as things are collected. Column buttons are labelled with the category name while collecting and with name and count once the chart is complete. One `<main>` and one `aria-live="polite"` region, which carries the question and the feedback.
- **Voice:** `games/shared/voice.js` says each question when it appears and again on a repeat button, names each thing as it arrives ("Ladybird!"), and reads the findings. It obeys `window.pimwMuted`. With no local voice everything is still on screen: every sentence is short, and the category appears as glyph and word.
- **Colour:** category colours never repeat within a theme, and colour is never the only cue.
- **Phone:** at 360px the layout is the question card, the chart, then the chips, top to bottom. Up to five columns of 60px; pictogram symbols 22px; a 28px axis gutter on bar charts; tally rows laid horizontally with the glyph on the left. Reduced motion stops the arrival animations and the pulse; the counting-out still steps.
- **Sound:** short synthesised sounds as the other games use, with the page's own mute button honouring `window.pimwMuted`, as Sort It Out does.

## Build

`games/chart-detective/` contains:

- `charts.js`: a classic script that sets `window.CHART_DETECTIVE` and also `module.exports`. Pure: the themes, the stage rules, a seeded random generator (mulberry32), `generateRound(stageId, seed)` and `check(round, questionIndex, choice)`.
  - `generateRound` returns a complete case: `{ stage, theme, chart, key, step, categories: [{ id, name, glyph }], counts, questions: [{ type, text, say, targets, answer, options, hint, explanation, finding }] }`. Table cases carry `rows`, `cols`, `cells` and the shown total. The page only renders what it is given.
- `index.html`: the page, its styles, the five chart renderers (tally, pictogram, block, bar, table), the collecting phase, the question flow, the hint ladder, voice and sound, the hidden table, the case-closed card.

Also: `icons/games/chart-detective.svg`; the catalogue entry; `node docs/build-pages.js` regenerates `games/index.html`, `for-teachers.html`, `404.html` and `sw.js`; a card in the homepage 5+ row and a line in `sitemap.xml` by hand.

**Checks:**

- `docs/tests/chart-detective.test.js`, 500 seeds per stage:
  - counts inside the stage's range, and distinct wherever a most, least or compare question is asked;
  - scaled values are multiples of the key or half the key; bar values land on a gridline or exactly halfway, and never halfway in early cases;
  - differences and totals inside the stage's limits;
  - four distinct non-negative options with exactly one right, and the misconception distractor present where the type has one; true or false claims strictly more or fewer, never equal;
  - table totals add up, and the hidden cell is recoverable from the shown total;
  - every question has a hint, an explanation and a finding that mention the right numbers;
  - the same seed gives the same case;
  - the page loads `charts.js` before its own script, and every glyph the themes name exists in the page;
  - the catalogue text names the five chart types the stages render.
- A keyboard play-through (desktop and 360px, reduced motion): collects a stage 1 case by number keys, answers one question wrong twice to see the hint and the worked answer, closes a case, and takes Next stage.
- Opening the page over `file://`.

**Size:** M, two to three days. The thirty glyphs are likely to take longer than the code.

## Left out

- Line and time graphs, pie charts, the mean and timetables (Years 4 to 6): a later stage or a second game.
- Typed answers, saved progress of any kind, printable sheets, and any case-file text beyond one sentence per question.
- Halfway-between-gridlines bars appear only in stage 4's later cases, because they are the hardest reading in the game.

## Amendments while building (2026-10-19)

- **"Ways to school" became "Shape spotting"** (circle, square, triangle, star, heart). Its categories were phrases ("by bus"), and every question template that uses a category as a subject ("how many extra do by bus have?") broke. Nouns only now, so every sentence reads.
- **"Weather week" is "Weather diary":** stage 1 has 9 to 15 days and stage 2 up to 34, more than a week.
- **The tables' verbs:** themes used for tables carry both forms, "picked" and "pick", so "did Pip pick" is grammatical.
- **The page's logic lives in `game.js`**, a classic script beside `index.html`, as the newest games do, so the test can read it without parsing the page.
- **Sound uses the site-wide toggle** from `components.js` (bottom right), not a mute button of the page's own; it honours `window.pimwMuted` the same way.
- **Scrolling is instant, never smooth:** a tap during a smooth scroll lands on whatever slid under the finger. Found by the phone end-to-end run.
- **The hidden screen-reader table is wrapped** in a clipped `<div class="sr-only">`: the class on the table itself left it 402px wide and made phones zoom the whole page out. Found by the phone end-to-end run; the player now fails on any element wider than the viewport.
- **A `counted` phase** sits between collecting and the first question, so nothing (and nobody) acts on an empty question.
- **The worked answer lights the columns the explanation is about** and, on tally, pictogram and block charts, rings the extra blocks for how-many-more questions; on bar charts the columns light up without block-by-block counting. The catalogue text says so.
- **The catalogue text** reads: "A wrong answer gets a hint and another go, then the worked answer with the columns it is about lit up."
- **The homepage's own 5+ outcome line** was updated by hand to match the catalogue's, as the homepage is not generated.
