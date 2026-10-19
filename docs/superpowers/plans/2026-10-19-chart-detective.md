# Chart Detective Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-10-19
**Spec:** `docs/superpowers/specs/2026-10-19-chart-detective-design.md` (approved; the amendments in Task 6 record where the build departs from it and why).
**Branch:** `chart-detective`, in its own git worktree (three other Claude sessions share the main working tree on this machine).

**Goal:** A data-handling game for ages 5+, `games/chart-detective/`, in which things arrive one at a time to be tallied or stacked into a chart, then a detective critter asks the school's questions about it (how many, most, least, how many more, altogether, true or false), across five stages from tally charts to two-way tables, with a two-step hint ladder on wrong answers.

**Architecture:** A pure logic module `charts.js` (themes, the five stage rules, a seeded generator that returns a complete case with every question, answer, option, hint, worked explanation and finding, plus a marker) that also loads in Node; a pure `glyphs.js` with the thirty category pictures as SVG symbols; a page `index.html` plus `game.js` that only renders and runs the flow. A Node test proves 500 seeds per stage obey every rule in the spec; an end-to-end player drives the real page in headless Chrome on desktop, phone and reduced motion.

**Tech Stack:** static HTML/CSS/JS (no build step, no framework); Node 25 for tests and the page generator; puppeteer-core at `%TEMP%\pimw-puppeteer` with the installed Chrome for the end-to-end player and screenshots.

**Every line of code in this plan was written and run in a scratch mirror of the site before the plan was written:** the Node test passed (12 tests, 500 seeds per stage), the end-to-end player passed on desktop, phone and reduced motion, and every stage was checked by eye at 360px and 1000px. Copy the files exactly; do not improve them while copying. If something fails, the cause is the copy or the environment, not the design.

## Global Constraints

- **Nothing is stored anywhere:** no cookies, `localStorage`, `sessionStorage` or IndexedDB; a case lives only while the page is open. The test and the e2e both check this.
- **Zero third-party requests:** no CDNs, no web fonts, no analytics. Every `src` and `href` is same-origin. The e2e fails on any request outside the page's origin (or `file:`).
- **Works over `file://`:** every path is relative (`../../tokens.css`, `../shared/voice.js`); no fetch, no modules, classic scripts only.
- **Spoken words only through `games/shared/voice.js`** (on-device voices, silent if none, obeys `window.pimwMuted`). The e2e checks every utterance used the local voice.
- **Original artwork only, in the house style:** ink `#33302e` outlines, flat fills from the palette, no text in SVG. The game icon must pass `docs/tests/icons.test.js` unchanged (fix the file, never the rule).
- **The catalogue text describes what the game actually does.** A parent reads it to decide whether to trust the site.
- **Wrong answers teach:** a hint and another go, then the worked answer; never a bare cross.
- **Phones:** everything fits a 360px wide viewport with nothing wider than the page (a wider element makes a phone zoom the whole page out and every tap lands elsewhere; the e2e checks). Keyboard: every control is a real `<button>`; number keys 1 to 5 pick a column.
- **git here checks files out with CRLF:** tests normalise with `.replace(/\r\n/g, '\n')` before matching text.
- **Headless Chrome:** never run more than two at once (SwiftShader makes the machine crawl); run the e2e's three modes one after another.
- **Commit at the end of every task.** Every commit keeps `node --test docs/tests/*.test.js` green. Commit messages end with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Generated pages:** never hand-edit `games/index.html`, `for-teachers.html`, `404.html` or `sw.js`; edit `docs/catalogue.js` and run `node docs/build-pages.js`.
- **Never push:** pushing `main` deploys the live site. Task 6 ends with the branch ready; Vikrant decides when it goes live.

## File Structure

| File | Responsibility |
|---|---|
| `games/chart-detective/charts.js` (new) | Pure data and logic: `THEMES`, `STAGES`, the seeded generator, `generateRound`, `check`, `readChart`, `tallyGroups`, `symbolsFor`. Classic script setting `window.ChartDetective`; `module.exports` in Node. |
| `games/chart-detective/glyphs.js` (new) | Pure: the thirty category glyphs as `<symbol>` strings, `sprite()`. Sets `window.ChartDetectiveGlyphs`; `module.exports` in Node. |
| `games/chart-detective/index.html` (new) | The page: head, styles, markup for the start screen, the detective bubble, the spotlight, the chart, the hidden table, the chips and the case-closed card; how-to; footer; the site's script tail. |
| `games/chart-detective/game.js` (new) | The page's behaviour: start screen, drawing each chart kind, the collecting phase, the questions and the hint ladder, the worked answer, case closed, keyboard, voice, sound. |
| `icons/games/chart-detective.svg` (new) | The game icon, 48 by 48, under the icon rules. |
| `docs/tests/chart-detective.test.js` (new) | 500 seeds per stage against the spec; the glyphs; the page wiring; the catalogue text. |
| `docs/e2e/chart-detective.e2e.cjs` (new) | The end-to-end player (desktop, `PHONE=1`, `CALM=1`, `URL=` for the live site). |
| `docs/catalogue.js` (modify) | The 5+ band outcome gains "charts"; the game's entry after Pebble Push. |
| `index.html` (modify) | A card at the end of the 5+ row; the tagline count 48 → 49. |
| `sitemap.xml` (modify) | One `<url>` after Spot the Difference. |
| `games/index.html`, `for-teachers.html`, `404.html`, `sw.js` (regenerated) | By `node docs/build-pages.js`. |
| `docs/superpowers/specs/2026-10-19-chart-detective-design.md` (modify) | An "Amendments while building" section. |

---

### Task 1: The cases module and its test

**Files:**
- Create: `games/chart-detective/charts.js`
- Create: `docs/tests/chart-detective.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2 to 5):
  - `generateRound(stageId, seed, caseIndex) → round` with `{ stage, seed, caseIndex, collect, chart: 'tally'|'pictogram'|'block'|'bar'|'table', key, step, unit, max, halfway, theme, title, themeData, categories: [{ id, name, plural }], counts: number[], arrivals: number[] (category indexes, collecting stages only), questions: Question[] }`; table cases add `rows: ['Clover','Pip','Plum']`, `days: ['Monday','Tuesday','Wednesday']`, `table: { cells: number[3][3], r0, c0, dayMost }`, `tableUnit`.
  - `Question = { type, kind: 'number'|'category'|'bool'|'name', text, say, targets: number[], answer, options: (number|string)[], hint, traps: { [option]: hint }, explanation, finding }`.
  - `check(round, qi, choice) → { right, hint (null when right; the trap's hint or the general one), explanation }`.
  - `tallyGroups(n) → number[]` (7 → [5, 2]); `symbolsFor(value, key) → { whole, half }`; `readChart(round) → string`.
  - `THEMES`, `STAGES` (`{ id, name, ages, blurb, collect, questions }`), `KEYS = [2, 2, 5, 10]`, `STEPS = [2, 5, 10]`, `ROWS`, `DAYS`, `SCALE_OPTIONS`, `rng(seed)`.

- [ ] **Step 1: Write the failing test**

Create `docs/tests/chart-detective.test.js` with exactly this content (the glyph, page and catalogue tests are appended in later tasks):

```js
/* Chart Detective: the cases in charts.js, the glyphs, and the page that uses them.
 *     node --test docs/tests/*.test.js
 * Loads the shipped games/chart-detective/charts.js in Node and checks every
 * promise in docs/superpowers/specs/2026-10-19-chart-detective-design.md
 * over 500 seeds per stage. Reads the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'games', 'chart-detective');
const CD = require(path.join(DIR, 'charts.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const SEEDS = 500;
const CASES = [0, 1, 2, 3, 4, 5];   // case numbers within a visit: keys 2,2,5,10 and steps 2,5,10 all come round
const every = (stage, fn) => {
  for (let seed = 1; seed <= SEEDS; seed++) for (const ci of CASES) fn(CD.generateRound(stage, seed, ci), `stage ${stage} seed ${seed} case ${ci}`);
};
const uniq = (a) => new Set(a).size === a.length;

test('the tables, as the spec says', () => {
  assert.deepEqual(CD.STAGES.map((s) => [s.id, s.name, s.collect, s.questions]), [
    [1, 'Tally Time', true, 3], [2, 'Picture It', true, 3], [3, 'Key of Two', false, 4], [4, 'Bar Charts', false, 4], [5, 'Tables', false, 4],
  ]);
  assert.deepEqual(CD.THEMES.map((t) => t.id), ['bugs', 'fruit', 'pets', 'weather', 'beach', 'shapes']);
  for (const t of CD.THEMES) {
    assert.equal(t.cats.length, 5, `${t.id} has five categories`);
    assert.ok(uniq(t.cats.map((c) => c.id)), `${t.id} category ids`);
    for (const c of t.cats) assert.ok(c.id && c.name && c.plural, `${t.id}: ${JSON.stringify(c)}`);
    assert.ok(t.most && t.least && t.unit, `${t.id} question words`);
    if (t.table) assert.ok(t.verb && t.base, `${t.id} table verbs`);
  }
  assert.deepEqual(CD.THEMES.find((t) => t.id === 'weather').stages, [1, 2]);
  assert.deepEqual(CD.THEMES.filter((t) => t.table).map((t) => t.id), ['bugs', 'fruit', 'beach', 'shapes']);
  assert.deepEqual([CD.KEYS, CD.STEPS, CD.ROWS, CD.DAYS], [[2, 2, 5, 10], [2, 5, 10], ['Clover', 'Pip', 'Plum'], ['Monday', 'Tuesday', 'Wednesday']]);
  assert.deepEqual([0, 1, 4, 5, 6, 7, 12].map(CD.tallyGroups), [[], [1], [4], [5], [5, 1], [5, 2], [5, 5, 2]]);
  assert.deepEqual([CD.symbolsFor(5, 2), CD.symbolsFor(8, 2), CD.symbolsFor(25, 10), CD.symbolsFor(15, 5)],
    [{ whole: 2, half: true }, { whole: 4, half: false }, { whole: 2, half: true }, { whole: 3, half: false }]);
});

test('the same seed gives the same case, and different seeds differ', () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    assert.deepEqual(CD.generateRound(stage, 42, 1), CD.generateRound(stage, 42, 1), `stage ${stage}`);
    const a = JSON.stringify(CD.generateRound(stage, 1, 0)), b = JSON.stringify(CD.generateRound(stage, 2, 0));
    assert.notEqual(a, b, `stage ${stage}: seeds 1 and 2 give the same case`);
  }
});

test('every case has the right shape and exactly one right option per question', () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    every(stage, (round, at) => {
      const def = CD.STAGES[stage - 1];
      assert.equal(round.questions.length, def.questions, `${at}: questions`);
      assert.equal(round.collect, def.collect, `${at}: collect`);
      if (stage !== 5) {
        assert.equal(round.categories.length, round.counts.length, `${at}: categories and counts`);
        assert.ok(uniq(round.categories.map((c) => c.id)), `${at}: categories repeat`);
        const theme = CD.THEMES.find((t) => t.id === round.theme);
        for (const c of round.categories) assert.ok(theme.cats.some((d) => d.id === c.id), `${at}: ${c.id} is not in ${theme.id}`);
        if (theme.stages) assert.ok(theme.stages.includes(stage), `${at}: ${theme.id} is not for stage ${stage}`);
        assert.equal(round.arrivals.length, round.collect ? round.counts.reduce((a, b) => a + b, 0) : 0, `${at}: arrivals`);
        round.counts.forEach((n, i) => assert.equal(round.arrivals.filter((x) => x === i).length, round.collect ? n : 0, `${at}: arrivals of ${i}`));
      }
      for (const [qi, qq] of round.questions.entries()) {
        const where = `${at} q${qi} ${qq.type}`;
        assert.ok(qq.text && qq.say && qq.hint && qq.explanation && qq.finding, `${where}: text, say, hint, explanation and finding`);
        assert.ok(['number', 'category', 'bool', 'name'].includes(qq.kind), `${where}: kind ${qq.kind}`);
        assert.ok(uniq(qq.options), `${where}: options repeat ${JSON.stringify(qq.options)}`);
        assert.equal(qq.options.filter((o) => String(o) === String(qq.answer)).length, 1, `${where}: the answer must be among the options once`);
        if (qq.kind === 'number') {
          assert.equal(qq.options.length, 4, `${where}: four chips`);
          for (const o of qq.options) assert.ok(Number.isInteger(o) && o >= 0, `${where}: option ${o}`);
          assert.ok(qq.explanation.includes(String(qq.answer)), `${where}: the explanation must mention ${qq.answer}: ${qq.explanation}`);
        }
        if (qq.kind === 'category') assert.deepEqual(qq.options, round.categories.map((c) => c.id), `${where}: category options`);
        if (qq.kind === 'bool') assert.deepEqual(qq.options, ['true', 'false'], `${where}: bool options`);
        if (qq.kind === 'name') assert.deepEqual(qq.options, CD.ROWS, `${where}: name options`);
        for (const [opt, hint] of Object.entries(qq.traps)) {
          assert.notEqual(opt, String(qq.answer), `${where}: a trap equals the answer`);
          assert.ok(typeof hint === 'string' && hint.length > 10, `${where}: trap hint for ${opt}`);
        }
        // marking: right answer, a trap, and a plain wrong answer
        assert.deepEqual(CD.check(round, qi, qq.answer), { right: true, hint: null, explanation: qq.explanation }, `${where}: check right`);
        const wrong = qq.options.find((o) => String(o) !== String(qq.answer));
        const marked = CD.check(round, qi, wrong);
        assert.equal(marked.right, false, `${where}: check wrong`);
        assert.equal(marked.hint, qq.traps[String(wrong)] || qq.hint, `${where}: the hint for ${wrong}`);
      }
    });
  }
});

test('stage 1: tally charts of three distinct counts 1 to 8, total 9 to 15; how many, most, least', () => {
  every(1, (round, at) => {
    assert.equal(round.chart, 'tally', at);
    assert.equal(round.counts.length, 3, at);
    assert.ok(uniq(round.counts), `${at}: counts repeat ${round.counts}`);
    for (const n of round.counts) assert.ok(n >= 1 && n <= 8, `${at}: count ${n}`);
    const total = round.counts.reduce((a, b) => a + b, 0);
    assert.ok(total >= 9 && total <= 15, `${at}: total ${total}`);
    assert.deepEqual(round.questions.map((q) => q.type), ['howMany', 'most', 'least'], at);
    assert.equal(round.key, 1, at);
  });
});

test('stage 2: pictograms and block charts of 3 or 4 distinct counts 2 to 10; differences 1 to 5 would need no cap because counts are small', () => {
  const types = new Set();
  const charts = new Set();
  every(2, (round, at) => {
    charts.add(round.chart);
    assert.ok(['pictogram', 'block'].includes(round.chart), at);
    assert.equal(round.chart, round.caseIndex % 2 === 0 ? 'pictogram' : 'block', `${at}: pictograms and block charts alternate`);
    assert.ok(round.counts.length === 3 || round.counts.length === 4, at);
    assert.ok(uniq(round.counts), `${at}: counts repeat`);
    for (const n of round.counts) assert.ok(n >= 2 && n <= 10, `${at}: count ${n}`);
    assert.equal(round.key, 1, at);
    for (const q of round.questions) {
      types.add(q.type);
      assert.ok(['howMany', 'most', 'least', 'more', 'together'].includes(q.type), `${at}: ${q.type}`);
      if (q.type === 'more') { assert.ok(q.answer >= 1 && q.answer <= 8, `${at}: difference ${q.answer}`); assert.ok(q.traps[String(round.counts[q.targets[0]])], `${at}: the bigger count is a trap`); }
      if (q.type === 'together') assert.ok(q.answer <= 19, `${at}: total ${q.answer}`);
    }
    assert.ok(uniq(round.questions.map((q) => q.type.replace(/^(most|least)$/, 'mostLeast'))), `${at}: a question type repeats`);
  });
  assert.deepEqual([...types].sort(), ['howMany', 'least', 'more', 'most', 'together']);
  assert.deepEqual([...charts].sort(), ['block', 'pictogram']);
});

test('stage 3: scaled pictograms with keys 2, 2, 5, 10 by case; halves only where they are whole numbers; the key warm-up first', () => {
  const keys = [];
  every(3, (round, at) => {
    assert.equal(round.chart, 'pictogram', at);
    assert.equal(round.key, CD.KEYS[round.caseIndex % 4], `${at}: key`);
    keys.push(round.key);
    assert.equal(round.counts.length, 4, at);
    assert.ok(uniq(round.counts), `${at}: counts repeat`);
    const half = round.key === 5 ? 5 : round.key / 2;
    for (const n of round.counts) {
      assert.ok(n >= half && n <= 10 * round.key, `${at}: count ${n} with key ${round.key}`);
      assert.equal(n % half, 0, `${at}: ${n} is not a multiple of ${half}`);
    }
    assert.equal(round.questions[0].type, 'key', at);
    assert.equal(round.questions[0].answer, round.key, at);
    assert.equal(round.questions[1].type, 'howMany', at);
    const hm = round.questions[1];
    const v = round.counts[hm.targets[0]];
    const whole = Math.floor(v / round.key);
    if (whole !== v) assert.ok(hm.options.includes(whole) && hm.traps[String(whole)], `${at}: the picture count ${whole} must be a trap for ${v}`);
    for (const q of round.questions.slice(2)) assert.ok(['more', 'fewer', 'together', 'trueFalse'].includes(q.type), `${at}: ${q.type}`);
    for (const q of round.questions) if (q.type === 'trueFalse') assert.notEqual(round.counts[q.targets[0]], round.counts[q.targets[1]], `${at}: an equal claim`);
  });
  assert.deepEqual([...new Set(keys)].sort((a, b) => a - b), [2, 5, 10]);
});

test('stage 4: bar charts with steps 2, 5, 10 by case; bars on gridlines, or exactly halfway only from the third case; the axis warm-up first', () => {
  let halfwayCases = 0;
  every(4, (round, at) => {
    assert.equal(round.chart, 'bar', at);
    assert.equal(round.step, CD.STEPS[round.caseIndex % 3], `${at}: step`);
    assert.equal(round.max, round.step === 2 ? 20 : 50, `${at}: axis max`);
    assert.ok(round.counts.length === 4 || round.counts.length === 5, at);
    assert.ok(uniq(round.counts), `${at}: counts repeat`);
    const allowHalf = round.caseIndex >= 2 && round.step !== 5;
    let anyHalf = false;
    for (const n of round.counts) {
      assert.ok(n >= 1 && n <= round.max, `${at}: value ${n}`);
      if (n % round.step !== 0) {
        assert.ok(allowHalf, `${at}: ${n} is off the gridlines in an early case`);
        assert.equal(n % (round.step / 2), 0, `${at}: ${n} is not exactly halfway`);
        anyHalf = true;
      }
    }
    if (allowHalf) { assert.ok(anyHalf, `${at}: a later case must have a bar between gridlines`); halfwayCases++; }
    assert.equal(round.questions[0].type, 'axis', at);
    assert.equal(round.questions[0].answer, round.step, at);
    const rb = round.questions[1];
    assert.equal(rb.type, 'howMany', at);
    const v = round.counts[rb.targets[0]];
    if (anyHalf) {
      assert.notEqual(v % round.step, 0, `${at}: the bar to read must be the one between gridlines`);
      const below = Math.floor(v / round.step) * round.step;
      assert.ok(rb.traps[String(below)] && rb.traps[String(below + round.step)], `${at}: the gridlines either side must be traps`);
    }
    for (const q of round.questions.slice(2)) assert.ok(['most', 'least', 'more', 'fewer', 'together', 'trueFalse'].includes(q.type), `${at}: ${q.type}`);
    for (const q of round.questions) if (q.kind === 'number' && q.type !== 'axis') for (const o of q.options) assert.equal(o % round.unit, 0, `${at}: chip ${o} is not in the chart's unit ${round.unit}`);
  });
  assert.ok(halfwayCases > 0);
});

test('stage 5: a 3 by 3 table of 1 to 12 with one hidden cell and its row total; cell, row total, most on a day, missing cell', () => {
  every(5, (round, at) => {
    assert.equal(round.chart, 'table', at);
    assert.deepEqual([round.rows, round.days], [CD.ROWS, CD.DAYS], at);
    const t = round.table;
    assert.equal(t.cells.length, 3, at);
    for (const row of t.cells) { assert.equal(row.length, 3, at); for (const v of row) assert.ok(v >= 1 && v <= 12, `${at}: cell ${v}`); }
    assert.ok(t.r0 >= 0 && t.r0 <= 2 && t.c0 >= 0 && t.c0 <= 2, at);
    assert.notEqual(t.dayMost, t.c0, `${at}: most-on-a-day must not use the hidden cell's column`);
    assert.ok(uniq(t.cells.map((row) => row[t.dayMost])), `${at}: the day for most must have three different numbers`);
    assert.ok(['bugs', 'fruit', 'beach', 'shapes'].includes(round.theme), `${at}: theme ${round.theme}`);
    assert.match(round.questions[0].text, /^How many [a-z ]+ did (Clover|Pip|Plum) (see|pick|find|spot) on (Monday|Tuesday|Wednesday)\?$/, `${at}: ${round.questions[0].text}`);
    assert.deepEqual(round.questions.map((q) => q.type), ['cell', 'rowTotal', 'mostOnDay', 'missingCell'], at);
    const [qc, qt, qm, qx] = round.questions;
    assert.notEqual(qc.targets[0], t.r0, `${at}: the cell question must not sit in the hidden row`);
    assert.equal(qc.answer, t.cells[qc.targets[0]][qc.targets[1]], at);
    assert.notEqual(qt.targets[0], t.r0, `${at}: the row total must be a fully shown row`);
    assert.notEqual(qt.targets[0], qc.targets[0], `${at}: the row total must be a different row from the cell question`);
    assert.equal(qt.answer, t.cells[qt.targets[0]].reduce((a, b) => a + b, 0), at);
    assert.equal(qm.kind, 'name', at);
    assert.equal(qx.answer, t.cells[t.r0][t.c0], at);
    const total = t.cells[t.r0].reduce((a, b) => a + b, 0);
    assert.ok(qx.text.includes(String(total)), `${at}: the missing-cell question must state the total ${total}`);
    assert.ok(qx.traps[String(total)], `${at}: the total is a trap`);
    assert.ok(/hidden/.test(CD.readChart(round)), at);
  });
});

test('readChart names every category with its count', () => {
  const round = CD.generateRound(2, 7, 0);
  const text = CD.readChart(round);
  round.categories.forEach((c, i) => assert.ok(text.includes(': ' + round.counts[i] + '.'), `${c.id}: ${text}`));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: every test fails at the `require` of `charts.js` with `Cannot find module`.

- [ ] **Step 3: Write the module**

Create `games/chart-detective/charts.js` with exactly this content:

```js
/* Chart Detective: the cases. The themes, the five stages, a seeded random
 * generator and generateRound(), which returns one complete case: the chart,
 * the things that arrive to be counted, and every question with its answer,
 * its options, a hint, a worked explanation and a finding. check() marks an
 * answer and picks the hint. Pure, so docs/tests/chart-detective.test.js
 * loads this exact file in Node; in the page it is a classic script that
 * sets window.ChartDetective. Nothing is stored: a case lives only while
 * the page is open. */
(function (root) {
  'use strict';

  // ---- themes ------------------------------------------------------------
  // id: the glyph (g-<id> in glyphs.js); name: the label under the glyph and
  // the word the voice says as a thing arrives; plural: the phrase questions use.
  // Plurals are nouns, so every question template reads as a sentence
  // ("how many extra do sunny days have?"). verb/base: the past and base forms
  // used by the stage 5 tables ("Pip picked", "did Pip pick"), table themes only.
  const cat = (id, name, plural) => ({ id, name, plural: plural || name + 's' });
  const THEMES = [
    { id: 'bugs', title: 'Minibeast hunt', unit: 'minibeasts', verb: 'saw', base: 'see', table: true,
      most: 'Which minibeast did we see most?', least: 'Which minibeast did we see least?',
      cats: [cat('ladybird', 'ladybird'), cat('ant', 'ant'), cat('snail', 'snail'), cat('bee', 'bee'), cat('butterfly', 'butterfly', 'butterflies')] },
    { id: 'fruit', title: 'Picnic fruit', unit: 'fruits', verb: 'picked', base: 'pick', table: true,
      most: 'Which fruit was picked most?', least: 'Which fruit was picked least?',
      cats: [cat('apple', 'apple'), cat('banana', 'banana'), cat('grapes', 'grapes', 'grapes'), cat('orange', 'orange'), cat('strawberry', 'strawberry', 'strawberries')] },
    { id: 'pets', title: 'Pets', unit: 'pets', table: false,
      most: 'Which pet is there most of?', least: 'Which pet is there least of?',
      cats: [cat('dog', 'dog'), cat('cat', 'cat'), cat('fish', 'fish', 'fish'), cat('rabbit', 'rabbit'), cat('bird', 'bird')] },
    { id: 'weather', title: 'Weather diary', unit: 'days', table: false, stages: [1, 2],
      most: 'Which weather came most?', least: 'Which weather came least?',
      cats: [cat('sunny', 'sunny', 'sunny days'), cat('cloudy', 'cloudy', 'cloudy days'), cat('rainy', 'rainy', 'rainy days'), cat('windy', 'windy', 'windy days'), cat('snowy', 'snowy', 'snowy days')] },
    { id: 'beach', title: 'Beach finds', unit: 'things', verb: 'found', base: 'find', table: true,
      most: 'Which did we find most?', least: 'Which did we find least?',
      cats: [cat('shell', 'shell'), cat('starfish', 'starfish', 'starfish'), cat('pebble', 'pebble'), cat('feather', 'feather'), cat('crab', 'crab')] },
    { id: 'shapes', title: 'Shape spotting', unit: 'shapes', verb: 'spotted', base: 'spot', table: true,
      most: 'Which shape did we spot most?', least: 'Which shape did we spot least?',
      cats: [cat('circle', 'circle'), cat('square', 'square'), cat('triangle', 'triangle'), cat('star', 'star'), cat('heart', 'heart')] },
  ];

  // ---- stages ------------------------------------------------------------
  const STAGES = [
    { id: 1, name: 'Tally Time', ages: 'ages 5+', blurb: 'Count with tally marks', collect: true, questions: 3 },
    { id: 2, name: 'Picture It', ages: 'ages 5+', blurb: 'Pictograms and block charts', collect: true, questions: 3 },
    { id: 3, name: 'Key of Two', ages: 'ages 7+', blurb: 'One picture stands for 2, 5 or 10', collect: false, questions: 4 },
    { id: 4, name: 'Bar Charts', ages: 'ages 7+', blurb: 'Read the numbers up the side', collect: false, questions: 4 },
    { id: 5, name: 'Tables', ages: 'ages 7+', blurb: 'Rows, columns and totals', collect: false, questions: 4 },
  ];
  const KEYS = [2, 2, 5, 10];          // stage 3, by case number within the visit
  const STEPS = [2, 5, 10];            // stage 4, by case number within the visit
  const ROWS = ['Clover', 'Pip', 'Plum'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday'];
  const SCALE_OPTIONS = [1, 2, 5, 10];

  // ---- a seeded random generator (mulberry32) ----------------------------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // n distinct multiples of `unit` between lo and hi (inclusive), in random order
  function distinct(r, n, lo, hi, unit) {
    const pool = [];
    for (let v = Math.ceil(lo / unit) * unit; v <= hi; v += unit) pool.push(v);
    if (pool.length < n) throw new Error('not enough values between ' + lo + ' and ' + hi + ' in steps of ' + unit);
    return shuffle(r, pool).slice(0, n);
  }

  // ---- small helpers the page shares -------------------------------------
  // 7 -> [5, 2]: the groups of strokes in a tally
  function tallyGroups(n) {
    const g = [];
    for (let left = n; left > 0; left -= 5) g.push(Math.min(5, left));
    return g;
  }
  // 5 with a key of 2 -> { whole: 2, half: true }: the pictures in a pictogram column
  function symbolsFor(value, key) {
    return { whole: Math.floor(value / key), half: value % key !== 0 };
  }
  const plural = (c) => c.plural;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---- the counts --------------------------------------------------------
  function countsFor(stage, r, caseIndex) {
    if (stage === 1) {
      // three distinct counts from 1 to 8 whose total is 9 to 15
      for (let tries = 0; tries < 1000; tries++) {
        const c = distinct(r, 3, 1, 8, 1);
        const total = c[0] + c[1] + c[2];
        if (total >= 9 && total <= 15) return { counts: c, key: 1, step: 1, unit: 1, max: 8 };
      }
      throw new Error('stage 1 counts');
    }
    if (stage === 2) {
      const n = between(r, 3, 4);
      return { counts: distinct(r, n, 2, 10, 1), key: 1, step: 1, unit: 1, max: 10 };
    }
    if (stage === 3) {
      const key = KEYS[caseIndex % KEYS.length];
      const unit = key === 5 ? 5 : key / 2;          // half pictures only where a half is a whole number
      return { counts: distinct(r, 4, unit, 10 * key, unit), key, step: 1, unit, max: 10 * key };
    }
    if (stage === 4) {
      const step = STEPS[caseIndex % STEPS.length];
      const max = step === 2 ? 20 : 50;
      const halfway = caseIndex >= 2 && step !== 5;  // later cases only, and never a bar at 2.5
      const unit = halfway ? step / 2 : step;
      const n = between(r, 4, 5);
      for (let tries = 0; tries < 1000; tries++) {
        const c = distinct(r, n, unit, max, unit);
        if (!halfway || c.some((v) => v % step !== 0)) return { counts: c, key: 1, step, unit, max, halfway };
      }
      throw new Error('stage 4 counts');
    }
    throw new Error('no counts for stage ' + stage);
  }

  // ---- options for a number question ------------------------------------
  // the answer, every trap that differs from it, then fillers one unit apart
  function numberOptions(r, answer, traps, unit) {
    const set = [answer];
    for (const t of traps || []) if (t !== answer && t >= 0 && !set.includes(t)) set.push(t);
    for (let d = 1; set.length < 4; d++) {
      for (const v of [answer + d * unit, answer - d * unit]) {
        if (set.length < 4 && v >= 0 && !set.includes(v)) set.push(v);
      }
    }
    return shuffle(r, set.slice(0, 4));
  }

  // ---- questions ---------------------------------------------------------
  // Every question: { type, kind, text, say, targets, answer, options, hint,
  // traps: { option: hint }, explanation, finding }. kind is 'number' (chips),
  // 'category' (tap a column), 'bool' (true/false chips) or 'name' (row chips).
  function q(type, kind, text, targets, answer, options, hint, traps, explanation, finding) {
    const t = Object.assign({}, traps || {});
    delete t[String(answer)];                        // a trap that happens to equal the answer is no trap
    return { type, kind, text, say: text, targets, answer, options, hint, traps: t, explanation, finding };
  }
  const countWord = (round) => (round.chart === 'tally' ? 'strokes' : round.chart === 'block' ? 'blocks' : round.chart === 'bar' ? 'bar' : 'pictures');

  function qHowMany(r, round, i) {
    const c = round.categories[i];
    const v = round.counts[i];
    const traps = {};
    const trapValues = [];
    let explanation;
    if (round.chart === 'pictogram' && round.key > 1) {
      const s = symbolsFor(v, round.key);
      const seq = [];
      for (let k = round.key; k <= s.whole * round.key; k += round.key) seq.push(k);
      const counted = seq.length ? 'count in ' + round.key + 's: ' + seq.join(', ') + (s.half ? ', and a half picture is ' + round.key / 2 : '') + '.' : 'a half picture is ' + round.key / 2 + '.';
      const hint = 'Each picture is ' + round.key + '. Count in ' + round.key + 's.';
      if (s.whole !== v) { traps[s.whole] = hint; trapValues.push(s.whole); }
      if (s.half && s.whole + 1 !== v) { traps[s.whole + 1] = 'The half picture is only ' + round.key / 2 + '. ' + hint; trapValues.push(s.whole + 1); }
      explanation = cap(plural(c)) + ': ' + counted + ' That is ' + v + '.';
    } else if (round.chart === 'bar') {
      const below = Math.floor(v / round.step) * round.step;
      const above = below + round.step;
      if (v % round.step !== 0) {
        traps[below] = 'The bar goes past ' + below + '. It stops halfway between ' + below + ' and ' + above + '.';
        traps[above] = 'The bar does not reach ' + above + '. It stops halfway between ' + below + ' and ' + above + '.';
        explanation = cap(plural(c)) + ': the bar stops halfway between ' + below + ' and ' + above + '. That is ' + v + '.';
      } else {
        explanation = cap(plural(c)) + ': the bar stops at the line for ' + v + '.';
      }
    } else {
      explanation = cap(plural(c)) + ': ' + v + ' ' + (round.chart === 'tally' ? 'strokes' : round.chart === 'block' ? 'blocks' : 'pictures') + '. That is ' + v + '.';
    }
    const hint = round.chart === 'bar'
      ? 'Follow the top of the ' + plural(c) + ' bar across to the numbers.'
      : round.key > 1
        ? 'Each picture is ' + round.key + '. Count the ' + plural(c) + ' in ' + round.key + 's.'
        : 'Count the ' + countWord(round) + ' for ' + plural(c) + '.';
    return q('howMany', 'number', 'How many ' + plural(c) + '?', [i], v,
      numberOptions(r, v, trapValues, round.unit), hint, traps, explanation, v + ' ' + plural(c) + '.');
  }

  function qMostLeast(round, most) {
    const counts = round.counts;
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (most ? counts[i] > counts[best] : counts[i] < counts[best]) best = i;
    let other = 0;
    for (let i = 1; i < counts.length; i++) if (most ? counts[i] < counts[other] : counts[i] > counts[other]) other = i;
    const theme = round.themeData;
    const list = cap(round.categories.map((c, i) => plural(c) + ' ' + counts[i]).join(', '));
    const traps = {};
    traps[round.categories[other].id] = most ? 'That is the smallest. Most means the biggest.' : 'That is the biggest. Least means the smallest.';
    const tall = round.chart === 'tally' ? 'longest' : 'tallest';
    const short = round.chart === 'tally' ? 'shortest' : 'shortest';
    return q(most ? 'most' : 'least', 'category', most ? theme.most : theme.least, [best], round.categories[best].id,
      round.categories.map((c) => c.id),
      most ? 'Most means the biggest number. Which is ' + tall + '?' : 'Least means the smallest number. Which is ' + short + '?',
      traps,
      list + '. ' + counts[best] + ' is the ' + (most ? 'biggest' : 'smallest') + ', so ' + plural(round.categories[best]) + '.',
      (most ? 'Most: ' : 'Least: ') + plural(round.categories[best]) + '.');
  }

  // a and b are indexes with counts[a] > counts[b]
  function qMore(r, round, a, b, fewer) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const d = x - y;
    const traps = {};
    traps[x] = 'That is how many ' + plural(A) + '. We want the difference. Line them up.';
    traps[x + y] = 'That is both added together. We want how many ' + (fewer ? 'fewer' : 'more') + '.';
    const text = fewer ? 'How many fewer ' + plural(B) + ' than ' + plural(A) + '?' : 'How many more ' + plural(A) + ' than ' + plural(B) + '?';
    return q(fewer ? 'fewer' : 'more', 'number', text, [a, b], d,
      numberOptions(r, d, [x, x + y], round.unit),
      fewer
        ? 'Find ' + plural(B) + ' and ' + plural(A) + '. How many fewer do ' + plural(B) + ' have?'
        : 'Find ' + plural(A) + ' and ' + plural(B) + '. How many extra do ' + plural(A) + ' have?',
      traps,
      cap(plural(A)) + ' ' + x + ', ' + plural(B) + ' ' + y + '. ' + x + ' take away ' + y + ' is ' + d + '.',
      fewer ? cap(plural(B)) + ': ' + d + ' fewer than ' + plural(A) + '.' : cap(plural(A)) + ': ' + d + ' more than ' + plural(B) + '.');
  }

  function qTogether(r, round, a, b) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const traps = {};
    traps[Math.abs(x - y)] = 'That is the difference. Together means add.';
    return q('together', 'number', 'How many ' + plural(A) + ' and ' + plural(B) + ' together?', [a, b], x + y,
      numberOptions(r, x + y, [Math.abs(x - y)], round.unit),
      'Add ' + plural(A) + ' and ' + plural(B) + '.', traps,
      cap(plural(A)) + ' ' + x + ' and ' + plural(B) + ' ' + y + '. ' + x + ' add ' + y + ' is ' + (x + y) + '.',
      cap(plural(A)) + ' and ' + plural(B) + ' together: ' + (x + y) + '.');
  }

  function qTrueFalse(round, a, b) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const truth = x > y;
    return q('trueFalse', 'bool', 'True or false: more ' + plural(A) + ' than ' + plural(B) + '?', [a, b], truth ? 'true' : 'false',
      ['true', 'false'],
      'Compare ' + plural(A) + ' and ' + plural(B) + '. Which number is bigger?', {},
      cap(plural(A)) + ' ' + x + ', ' + plural(B) + ' ' + y + '. ' + x + ' is ' + (truth ? 'more' : 'less') + ' than ' + y + ', so ' + (truth ? 'true' : 'false') + '.',
      (truth ? 'True: ' : 'False: ') + 'more ' + plural(A) + ' than ' + plural(B) + '.');
  }

  function qKey(round) {
    const k = round.key;
    return q('key', 'number', 'Each picture stands for how many?', [], k, SCALE_OPTIONS.slice(),
      'Look at the key under the chart.', {},
      'The key says one picture is ' + k + '.', 'Each picture is ' + k + '.');
  }

  function qAxis(round) {
    const s = round.step;
    return q('axis', 'number', 'The numbers go up in steps of what?', [], s, SCALE_OPTIONS.slice(),
      'Read the numbers up the side, from the bottom.', {},
      'The numbers go 0, ' + s + ', ' + 2 * s + ', ' + 3 * s + '. Steps of ' + s + '.', 'The numbers go up in ' + s + 's.');
  }

  // ---- the table (stage 5) ----------------------------------------------
  function makeTable(r) {
    for (let tries = 0; tries < 1000; tries++) {
      const cells = ROWS.map(() => DAYS.map(() => between(r, 1, 12)));
      const r0 = between(r, 0, 2), c0 = between(r, 0, 2);   // the hidden cell
      const days = shuffle(r, [0, 1, 2].filter((c) => c !== c0));
      const dayMost = days.find((c) => new Set(cells.map((row) => row[c])).size === 3);
      if (dayMost === undefined) continue;
      return { cells, r0, c0, dayMost };
    }
    throw new Error('table');
  }

  function tableQuestions(r, round) {
    const t = round.table;
    const unit = round.tableUnit, verb = round.themeData.verb, base = round.themeData.base;
    const rowsVisible = [0, 1, 2].filter((i) => i !== t.r0);
    // a visible cell, in a fully shown row
    const cr = pick(r, rowsVisible), cc = between(r, 0, 2);
    const cellV = t.cells[cr][cc];
    const qCell = q('cell', 'number', 'How many ' + unit + ' did ' + ROWS[cr] + ' ' + base + ' on ' + DAYS[cc] + '?', [cr, cc], cellV,
      numberOptions(r, cellV, [], 1), 'Find ' + ROWS[cr] + "'s row, then " + DAYS[cc] + "'s column.", {},
      ROWS[cr] + "'s row, " + DAYS[cc] + "'s column: " + cellV + '.', ROWS[cr] + ' ' + verb + ' ' + cellV + ' on ' + DAYS[cc] + '.');
    // the total of the other fully shown row
    const tr = rowsVisible.find((i) => i !== cr);
    const row = t.cells[tr];
    const total = row[0] + row[1] + row[2];
    const qTotal = q('rowTotal', 'number', 'How many ' + unit + ' did ' + ROWS[tr] + ' ' + base + ' altogether?', [tr, -1], total,
      numberOptions(r, total, [Math.max.apply(null, row)], 1), "Add up all three numbers in " + ROWS[tr] + "'s row.",
      Object.fromEntries([[Math.max.apply(null, row), 'That is one day. Altogether means add all three.']]),
      ROWS[tr] + ': ' + row[0] + ' add ' + row[1] + ' add ' + row[2] + ' is ' + total + '.', ROWS[tr] + ' ' + verb + ' ' + total + ' altogether.');
    // who found most on a day with three different numbers
    const col = t.cells.map((rw) => rw[t.dayMost]);
    let best = 0;
    for (let i = 1; i < 3; i++) if (col[i] > col[best]) best = i;
    const qMost = q('mostOnDay', 'name', 'Who ' + verb + ' most on ' + DAYS[t.dayMost] + '?', [-1, t.dayMost], ROWS[best], ROWS.slice(),
      'Look down ' + DAYS[t.dayMost] + "'s column. Which number is biggest?", {},
      DAYS[t.dayMost] + ': ' + ROWS.map((n, i) => n + ' ' + col[i]).join(', ') + '. ' + ROWS[best] + ' ' + verb + ' most.',
      ROWS[best] + ' ' + verb + ' most on ' + DAYS[t.dayMost] + '.');
    // the hidden cell from the shown total
    const hr = t.cells[t.r0];
    const hTotal = hr[0] + hr[1] + hr[2];
    const seen = [0, 1, 2].filter((c) => c !== t.c0).map((c) => hr[c]);
    const hidden = hr[t.c0];
    const traps = {};
    traps[hTotal] = 'That is the whole row. Take away the two you can see.';
    traps[seen[0] + seen[1]] = 'That is the two you can see added. Take it away from ' + hTotal + '.';
    const qMissing = q('missingCell', 'number', ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. How many on ' + DAYS[t.c0] + '?', [t.r0, t.c0], hidden,
      numberOptions(r, hidden, [hTotal, seen[0] + seen[1]], 1),
      ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. Add the two you can see, then take them away from ' + hTotal + '.', traps,
      ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. ' + seen[0] + ' add ' + seen[1] + ' is ' + (seen[0] + seen[1]) + '. ' + hTotal + ' take away ' + (seen[0] + seen[1]) + ' is ' + hidden + '.',
      ROWS[t.r0] + ' ' + verb + ' ' + hidden + ' on ' + DAYS[t.c0] + '.');
    return [qCell, qTotal, qMost, qMissing];
  }

  // ---- a whole case ------------------------------------------------------
  // two different indexes, the first with the bigger count
  function pair(r, counts) {
    const idx = shuffle(r, counts.map((_, i) => i)).slice(0, 2);
    return counts[idx[0]] > counts[idx[1]] ? idx : [idx[1], idx[0]];
  }

  function generateRound(stageId, seed, caseIndex) {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) throw new Error('no stage ' + stageId);
    const ci = caseIndex || 0;
    const r = rng(seed);
    const round = { stage: stageId, seed: seed >>> 0, caseIndex: ci, collect: stage.collect, key: 1, step: 1, unit: 1 };

    if (stageId === 5) {
      const theme = pick(r, THEMES.filter((t) => t.table));
      round.theme = theme.id; round.title = theme.title; round.themeData = theme;
      round.chart = 'table';
      round.categories = []; round.counts = []; round.arrivals = [];
      round.tableUnit = plural(pick(r, theme.cats));
      round.rows = ROWS.slice(); round.days = DAYS.slice();
      round.table = makeTable(r);
      round.questions = tableQuestions(r, round);
      return round;
    }

    const theme = pick(r, THEMES.filter((t) => !t.stages || t.stages.includes(stageId)));
    round.theme = theme.id; round.title = theme.title; round.themeData = theme;
    const made = countsFor(stageId, r, ci);
    round.counts = made.counts; round.key = made.key; round.step = made.step; round.unit = made.unit; round.max = made.max;
    round.halfway = !!made.halfway;
    round.categories = shuffle(r, theme.cats).slice(0, made.counts.length);
    round.chart = stageId === 1 ? 'tally' : stageId === 2 ? (ci % 2 === 0 ? 'pictogram' : 'block') : stageId === 3 ? 'pictogram' : 'bar';
    // the things that arrive, in a random order, for the collecting stages
    const arrivals = [];
    if (stage.collect) {
      round.counts.forEach((n, i) => { for (let k = 0; k < n; k++) arrivals.push(i); });
    }
    round.arrivals = shuffle(r, arrivals);

    const qs = [];
    if (stageId === 1) {
      qs.push(qHowMany(r, round, between(r, 0, 2)), qMostLeast(round, true), qMostLeast(round, false));
    } else if (stageId === 2) {
      const [a, b] = pair(r, round.counts);
      const bank = shuffle(r, ['howMany', 'mostLeast', 'more', 'together']).slice(0, 3);
      for (const t of bank) {
        if (t === 'howMany') qs.push(qHowMany(r, round, between(r, 0, round.counts.length - 1)));
        else if (t === 'mostLeast') qs.push(qMostLeast(round, r() < 0.5));
        else if (t === 'more') qs.push(qMore(r, round, a, b, false));
        else qs.push(qTogether(r, round, a, b));
      }
    } else if (stageId === 3) {
      const [a, b] = pair(r, round.counts);
      qs.push(qKey(round), qHowMany(r, round, between(r, 0, 3)));
      const bank = shuffle(r, ['more', 'together', 'trueFalse']).slice(0, 2);
      for (const t of bank) {
        if (t === 'more') qs.push(qMore(r, round, a, b, r() < 0.5));
        else if (t === 'together') qs.push(qTogether(r, round, a, b));
        else { const [c, d] = shuffle(r, [a, b]); qs.push(qTrueFalse(round, c, d)); }
      }
    } else {
      const [a, b] = pair(r, round.counts);
      // the bar to read: one between gridlines when the case has any
      const idxs = round.counts.map((_, i) => i);
      const off = idxs.filter((i) => round.counts[i] % round.step !== 0);
      qs.push(qAxis(round), qHowMany(r, round, off.length ? pick(r, off) : pick(r, idxs)));
      const bank = shuffle(r, ['mostLeast', 'more', 'together', 'trueFalse']).slice(0, 2);
      for (const t of bank) {
        if (t === 'mostLeast') qs.push(qMostLeast(round, r() < 0.5));
        else if (t === 'more') qs.push(qMore(r, round, a, b, r() < 0.5));
        else if (t === 'together') qs.push(qTogether(r, round, a, b));
        else { const [c, d] = shuffle(r, [a, b]); qs.push(qTrueFalse(round, c, d)); }
      }
    }
    round.questions = qs;
    return round;
  }

  // ---- marking -----------------------------------------------------------
  // choice: a number, a category id, 'true' / 'false', or a row name
  function check(round, qi, choice) {
    const question = round.questions[qi];
    const right = String(choice) === String(question.answer);
    const hint = right ? null : (Object.prototype.hasOwnProperty.call(question.traps, String(choice)) ? question.traps[String(choice)] : question.hint);
    return { right, hint, explanation: question.explanation };
  }

  // one sentence per category, for the hidden table's caption and the tests
  function readChart(round) {
    if (round.chart === 'table') {
      return round.rows.map((n, i) => n + ': ' + round.days.map((d, j) => (i === round.table.r0 && j === round.table.c0 ? d + ' hidden' : d + ' ' + round.table.cells[i][j])).join(', ') + '.').join(' ');
    }
    return round.categories.map((c, i) => cap(plural(c)) + ': ' + round.counts[i] + '.').join(' ');
  }

  const api = { THEMES, STAGES, KEYS, STEPS, ROWS, DAYS, SCALE_OPTIONS, rng, tallyGroups, symbolsFor, generateRound, check, readChart };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChartDetective = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 9` and `ℹ fail 0`.

- [ ] **Step 5: Read a few cases aloud**

Run this and read the questions, hints, explanations and findings as a child would hear them:

```bash
node -e "
const CD=require('./games/chart-detective/charts.js');
for (const [s,seed,ci] of [[1,3,0],[2,5,1],[3,8,0],[4,9,2],[5,16,0]]) {
  const r=CD.generateRound(s,seed,ci);
  console.log('== stage',s,r.title,r.chart,'key',r.key,'step',r.step, r.chart==='table'? JSON.stringify(r.table.cells)+' hidden '+r.table.r0+','+r.table.c0 : r.categories.map((c,i)=>c.id+'='+r.counts[i]).join(' '));
  for (const q of r.questions) console.log('  Q:',q.text,'| A:',q.answer,'| opts:',JSON.stringify(q.options),'\n     hint:',q.hint,'\n     expl:',q.explanation,'\n     find:',q.finding);
}"
```

Expected (among others): stage 5 asks `How many shells did Plum find on Wednesday?` (base verb after "did"), and a stage 2 finding reads `Pebbles: 1 more than crabs.`

- [ ] **Step 6: Commit**

```bash
git add games/chart-detective/charts.js docs/tests/chart-detective.test.js
git commit -m "feat(chart-detective): the cases: themes, five stages, a seeded generator and the questions, tested over 500 seeds a stage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The thirty glyphs

**Files:**
- Create: `games/chart-detective/glyphs.js`
- Modify: `docs/tests/chart-detective.test.js` (append)

**Interfaces:**
- Consumes: `THEMES` from Task 1 (every category id must have a glyph).
- Produces: `window.ChartDetectiveGlyphs = { PALETTE, GLYPHS, ids(), symbol(id), sprite() }`; `sprite()` returns thirty `<symbol id="g-<id>" viewBox="0 0 32 32">…</symbol>` strings joined, which the page puts inside one hidden `<svg>` and draws with `<use href="#g-<id>">`.

- [ ] **Step 1: Append the failing test**

Append to the end of `docs/tests/chart-detective.test.js`:

```js
// ---- part: glyphs ----
test('every category has a glyph in the house style, and no glyph is an orphan', () => {
  const Gl = require(path.join(DIR, 'glyphs.js'));
  const wanted = CD.THEMES.flatMap((t) => t.cats.map((c) => c.id));
  assert.deepEqual(Gl.ids().sort(), wanted.slice().sort());
  assert.equal(Gl.ids().length, 30);
  const palette = new Set(Object.values(Gl.PALETTE).map((h) => h.toLowerCase()));
  assert.equal(Gl.PALETTE.ink, '#33302e');
  for (const id of Gl.ids()) {
    const s = Gl.symbol(id);
    assert.ok(s.startsWith(`<symbol id="g-${id}" viewBox="0 0 32 32"><g fill="none" stroke="#33302e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`), `${id}: wrapper`);
    assert.ok(s.endsWith('</g></symbol>'), `${id}: closing`);
    for (const bad of ['<text', 'gradient', '<image', 'style=', 'opacity=', 'href=']) assert.ok(!s.includes(bad), `${id}: contains ${bad}`);
    for (const m of s.matchAll(/\b(fill|stroke)="([^"]+)"/g)) assert.ok(m[2] === 'none' || palette.has(m[2].toLowerCase()), `${id}: ${m[1]} ${m[2]} is off the palette`);
    assert.ok(/<(circle|ellipse|path|rect)\b[^>]*fill="#(?!33302e)[0-9a-f]{6}"/i.test(s.replace(/stroke="none"/g, '')), `${id}: needs a filled, ink-outlined shape`);
  }
  assert.equal((Gl.sprite().match(/<symbol /g) || []).length, 30);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 9`, `ℹ fail 1`, the new test failing with `Cannot find module` for `glyphs.js`.

- [ ] **Step 3: Write the glyphs**

Create `games/chart-detective/glyphs.js` with exactly this content:

```js
/* Chart Detective: the thirty category glyphs, as SVG <symbol>s in the
 * house style (ink outlines, flat fills, no text), one per category of
 * every theme in charts.js. Pure string building, so the tests check every
 * glyph in Node; in the page it is a classic script that sets
 * window.ChartDetectiveGlyphs, and the page puts the symbols in one hidden
 * <svg> and draws each glyph with <use href="#g-<id>">. Each symbol has a
 * 32 by 32 box and reads at 24px: one big shape, few details. */
(function (root) {
  'use strict';

  const P = {
    ink: '#33302e', white: '#ffffff', red: '#ef4444', orange: '#fb923c', yellow: '#fbbf24', green: '#4ade80',
    teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#ff8fab', brown: '#8b5e3c', grey: '#94a3b8',
  };
  // every shape sits in a <g> that gives the ink outline; a shape that wants no outline says stroke="none"
  const OUT = `<g fill="none" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`;
  const END = '</g>';
  const c = (cx, cy, r, fill, extra) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra || ''}/>`;
  const e = (cx, cy, rx, ry, fill, extra) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra || ''}/>`;
  const p = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/>`;
  const l = (d, extra) => `<path d="${d}"${extra || ''}/>`;
  const dot = (cx, cy, r) => c(cx, cy, r || 1.6, P.ink, ' stroke="none"');
  const star = (cx, cy, R, r) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  };
  const cloud = (fill) => p('M8 22h16a5 5 0 0 0 0-10 7 7 0 0 0-13-2 5 5 0 0 0-3 12z', fill);

  const GLYPHS = {
    // --- minibeast hunt ---
    ladybird: e(16, 18, 10, 8, P.red) + c(16, 9, 4.5, P.ink) + l('M16 12v14') + dot(11, 16, 1.8) + dot(21, 16, 1.8) + dot(12, 22, 1.5) + dot(20, 22, 1.5),
    ant: l('M8 12l-3-4M24 12l3-4M6 20l-3 3M26 20l3 3M10 23l-2 5M22 23l2 5') + c(8, 16, 4, P.brown) + c(16, 16, 3.5, P.brown) + c(24, 17, 4.5, P.brown) + dot(7, 15, 1.2),
    snail: p('M4 25c0-4 6-6 10-6h10c3 0 5 2 5 4H4z', P.green) + c(19, 14, 8, P.brown) + l('M25 14a6 6 0 1 0-6 6a3 3 0 1 0 3-3') + l('M7 19l-2-6M11 19l1-6') + dot(5, 12, 1.5) + dot(12.5, 12.5, 1.5),
    bee: e(10, 10, 5, 3.5, P.white) + e(22, 10, 5, 3.5, P.white) + e(16, 19, 10, 7, P.yellow) + l('M11 13v12M16 12v14M21 13v12') + c(16, 19, 0, P.yellow) + l('M26 19l3 1'),
    butterfly: p('M16 16C12 6 3 6 4 13c1 5 7 6 12 6zM16 16c4-10 13-10 12-3-1 5-7 6-12 6z', P.purple) + p('M16 18c-6 0-11 2-10 6 1 3 6 2 10-3zM16 18c6 0 11 2 10 6-1 3-6 2-10-3z', P.pink) + l('M16 10v15M16 10l-3-4M16 10l3-4'),
    // --- picnic fruit ---
    apple: c(16, 18, 10, P.red) + l('M16 8V4') + e(20, 6, 4, 2, P.green),
    banana: p('M5 8C3 22 14 30 27 26C17 25 8 18 5 8z', P.yellow) + l('M5 8L4 4M27 26l3 1'),
    grapes: l('M16 8V4') + c(16, 11, 4, P.purple) + c(11, 16, 4, P.purple) + c(21, 16, 4, P.purple) + c(16, 20, 4, P.purple) + c(12, 24, 3.5, P.purple) + c(20, 24, 3.5, P.purple) + c(16, 27, 3, P.purple),
    orange: c(16, 18, 10, P.orange) + e(20, 6, 4, 2, P.green) + dot(12, 15, 1.2) + dot(18, 21, 1.2),
    strawberry: p('M16 28C8 22 6 16 7 11h18c1 5-1 11-9 17z', P.red) + p('M8 11l4-4 4 3 4-3 4 4z', P.green) + dot(13, 16, 1.2) + dot(19, 16, 1.2) + dot(16, 21, 1.2),
    // --- pets ---
    dog: e(8, 14, 3.5, 7, P.brown) + e(24, 14, 3.5, 7, P.brown) + c(16, 16, 9, P.brown) + e(16, 21, 4.5, 3, P.white) + dot(12.5, 14) + dot(19.5, 14) + dot(16, 20, 1.8),
    cat: p('M8 12l2-8 6 5zM24 12l-2-8-6 5z', P.orange) + c(16, 17, 9, P.orange) + dot(12.5, 15) + dot(19.5, 15) + l('M4 18h6M4 22h6M22 18h6M22 22h6') + dot(16, 19, 1.4),
    fish: p('M23 16l6-6v12z', P.blue) + e(14, 16, 10, 7, P.blue) + dot(9, 14) + l('M14 10c3 3 3 9 0 12'),
    rabbit: e(11, 8, 3.5, 7, P.white) + e(21, 8, 3.5, 7, P.white) + c(16, 20, 9, P.white) + dot(12.5, 18) + dot(19.5, 18) + dot(16, 22, 1.4),
    bird: p('M24 15l6 1-6 3z', P.yellow) + c(15, 16, 9, P.blue) + p('M9 20c3 1 8 0 10-4-6-1-9 1-10 4z', P.teal) + p('M4 14l4 2-4 4z', P.blue) + dot(18, 12),
    // --- weather diary ---
    sunny: l('M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3') + c(16, 16, 7, P.yellow),
    cloudy: cloud(P.grey),
    rainy: cloud(P.grey) + l('M10 25v4M16 25v4M22 25v4', ` stroke="${P.blue}"`),
    windy: l('M3 11h16a3 3 0 1 0-3-3M3 17h22a3 3 0 1 1-3 3M3 23h12a3 3 0 1 1-3 3', ` stroke="${P.blue}"`) + p('M22 24c0-4 3-7 7-7 0 4-3 7-7 7z', P.green),
    snowy: l('M16 4v24M6 10l20 12M6 22l20-12M16 4l-3 3M16 4l3 3M16 28l-3-3M16 28l3-3', ` stroke="${P.blue}"`) + c(16, 16, 3, P.white),
    // --- beach finds ---
    shell: p('M16 27L4 15c0-6 5-10 12-10s12 4 12 10z', P.pink) + l('M16 27L8 12M16 27V8M16 27l8-15'),
    starfish: p(star(16, 17, 14, 7), P.orange) + dot(16, 11, 1.2) + dot(11, 18, 1.2) + dot(21, 18, 1.2),
    pebble: p('M6 20c-2-8 6-14 14-12s10 10 6 15-18 5-20-3z', P.grey) + l('M12 13c2-2 6-3 8-2', ` stroke="${P.white}"`),
    feather: p('M26 5c-10 1-18 9-20 22 11-1 19-9 20-22z', P.white) + l('M6 27L26 5M12 20l6-1M9 24l3-5M16 15l6-1M13 18l2-5'),
    crab: c(6, 11, 4, P.red) + c(26, 11, 4, P.red) + l('M9 13l4 4M23 13l-4 4M6 22l-3 3M8 25l-2 4M26 22l3 3M24 25l2 4') + e(16, 21, 10, 7, P.red) + l('M12 14v-3M20 14v-3') + dot(12, 10) + dot(20, 10),
    // --- shape spotting ---
    circle: c(16, 16, 11, P.blue),
    square: p('M6 6h20v20H6z', P.green),
    triangle: p('M16 5L28 27H4z', P.yellow),
    star: p(star(16, 17, 13, 6), P.orange),
    heart: p('M16 27C8 21 4 17 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-4 9-12 15z', P.pink),
  };

  const symbol = (id) => `<symbol id="g-${id}" viewBox="0 0 32 32">${OUT}${GLYPHS[id]}${END}</symbol>`;
  const ids = () => Object.keys(GLYPHS);
  const sprite = () => ids().map(symbol).join('');

  const api = { PALETTE: P, GLYPHS, ids, symbol, sprite };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChartDetectiveGlyphs = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 10` and `ℹ fail 0`.

- [ ] **Step 5: Look at them**

Two scratch files, kept OUT of the repo (write them in your scratchpad folder; `cd/...` below means the repo root, so adjust the two `src` paths to point at the repo):

`sheet.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>glyph sheet</title>
<style>
body{font-family:sans-serif;background:#fff;margin:16px}
.row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px}
.g{display:flex;flex-direction:column;align-items:center;width:84px;font-size:11px}
svg.big{width:64px;height:64px} svg.small{width:24px;height:24px}
h2{font-size:14px;margin:8px 0 2px}
</style></head><body>
<svg hidden id="sprite"></svg>
<div id="out"></div>
<script src="cd/games/chart-detective/charts.js"></script>
<script src="cd/games/chart-detective/glyphs.js"></script>
<script>
document.getElementById('sprite').innerHTML = ChartDetectiveGlyphs.sprite();
const out = document.getElementById('out');
for (const t of ChartDetective.THEMES) {
  const h = document.createElement('h2'); h.textContent = t.title; out.appendChild(h);
  const row = document.createElement('div'); row.className = 'row';
  for (const c of t.cats) {
    const g = document.createElement('div'); g.className = 'g';
    g.innerHTML = '<svg class="big"><use href="#g-' + c.id + '"/></svg><svg class="small"><use href="#g-' + c.id + '"/></svg><span>' + c.name + '</span>';
    row.appendChild(g);
  }
  out.appendChild(row);
}
</script></body></html>
```

`shot.cjs` (used again in Task 3):

```js
#!/usr/bin/env node
/* Screenshot a page in headless Chrome.
 *   node shot.cjs <url-or-file> <out.png> [width] [height] [phone] [fullpage] [js-to-run-first]
 * phone=1 emulates a 360-wide touch phone (the site's narrowest rule). */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('C:/Users/shrik/AppData/Local/Temp/pimw-puppeteer/node_modules/puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [,, target, out, w, h, phone, full, js, wait] = process.argv;
(async () => {
  const q = target.indexOf('?');
  const filePart = q < 0 ? target : target.slice(0, q);
  const url = /^[a-z]+:/i.test(target) ? target : pathToFileURL(path.resolve(filePart)).href + (q < 0 ? '' : target.slice(q));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/manifest|apple-touch/.test(m.text() + ((m.location() || {}).url || ''))) errors.push('console: ' + m.text()); });
  if (phone === '1') await page.setViewport({ width: +w || 360, height: +h || 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: +w || 1000, height: +h || 800, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (js) await page.evaluate(js);
  await new Promise((r) => setTimeout(r, +wait || 600));
  await page.screenshot({ path: out, fullPage: full === '1' });
  console.log('shot ' + out + (errors.length ? '\n' + errors.join('\n') : ' (no errors)'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
```

Run: `node shot.cjs sheet.html sheet.png 760 620 0 1` and open `sheet.png`.
Expected: six rows of five pictures, each shown at 64px and 24px with its name; every one recognisable at 24px (the banana is a crescent, the snail's shell shows a spiral, the windy glyph has a small green leaf). If a glyph is not recognisable, fix its path in `glyphs.js`, not the test.

- [ ] **Step 6: Commit**

```bash
git add games/chart-detective/glyphs.js docs/tests/chart-detective.test.js
git commit -m "feat(chart-detective): thirty category glyphs as SVG symbols, in the house style, tested in Node

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The page

**Files:**
- Create: `games/chart-detective/index.html`
- Create: `games/chart-detective/game.js`
- Modify: `docs/tests/chart-detective.test.js` (append)

**Interfaces:**
- Consumes: `window.ChartDetective` (Task 1), `window.ChartDetectiveGlyphs` (Task 2), `window.Voice` from `games/shared/voice.js`, `window.pimwMuted` from `components.js`.
- Produces, for the e2e in Task 5: the URL parameters `?stage=1..5` (start that stage at once) and `&seed=N` (the first case uses seed N, the next N+1, and so on; without it seeds are random); `window.cdTest.round()` (the current case, as JSON) and `window.cdTest.state()` → `{ phase, qi, attempts, arrival, placed, stage }`; `#playView[data-phase]` in `pick | collect | counted | ask | right | worked | done`; `#chart[data-stage]`; column buttons `#chart button.col[data-i][data-cat]`; chips `#chips .chip[data-choice]`; `#nextQBtn` after a worked answer; `#nextStageBtn`, `#nextCaseBtn`, `#casesBtn`, `#sayBtn`, `#spotCount` ("3 of 12"), `#tell` (the one live region), `#srBody tr` (the hidden table's rows), `#findings li` (class `helped` when the answer needed help).

Things the page does that are easy to break while copying, each learned the hard way in the scratch build:

- The glyph sprite is hidden with CSS (`.sprite { width: 0; height: 0; position: absolute }`), never with the `hidden` attribute, which does nothing on an SVG element and leaves a 300 by 150 blank.
- The hidden screen-reader table sits inside a `<div class="sr-only">`; the class is on the wrapper, not the table. A table ignores a 1px width, lays out at its content width (402px with a bar-chart caption) and widens the whole page, and a phone then zooms out so every tap lands on the wrong button.
- `.plot .col` has no padding and no border: a bar's height is a percentage of its column, which must be exactly the plot's height, or every bar stops short of its gridline.
- Scrolling is instant (`scrollIntoView({ block: 'start' })` with no `behavior`), never smooth: a tap that lands while the page is still gliding hits whatever slid under the finger.
- After the last thing is placed the phase is `counted` (not `ask`) until the first question renders 1.4 s later.
- The spotlight stays hidden when a case starts and is shown by the first arrival, so a new case never flashes the previous case's "14 of 14".

- [ ] **Step 1: Append the failing test**

Append to the end of `docs/tests/chart-detective.test.js`:

```js
// ---- part: page ----
test('the page is wired the way the site expects', () => {
  const page = read('games', 'chart-detective', 'index.html');
  const order = ['<script src="../shared/voice.js"></script>', '<script src="charts.js"></script>', '<script src="glyphs.js"></script>', '<script src="game.js"></script>', '<script src="../../components.js"></script>'];
  let at = -1;
  for (const tag of order) { const i = page.indexOf(tag); assert.ok(i > at, `${tag} must come after the previous script`); at = i; }
  assert.equal((page.match(/<main\b/g) || []).length, 1, 'one <main>');
  assert.equal((page.match(/aria-live=/g) || []).length, 1, 'one live region');
  assert.ok(page.includes('<img class="title-icon" src="../../icons/games/chart-detective.svg" alt="" width="40" height="40">'), 'the title icon');
  assert.ok(page.includes('href="../../tokens.css"') && page.includes('href="../../components.css"'), 'the shared stylesheets');
  assert.ok(page.includes('src="../../icons/critters/mango.svg"'), 'Mango is the detective');
  assert.ok(page.includes('<svg class="sprite" id="sprite"'), 'the glyph sprite, hidden by CSS (the hidden attribute does nothing on an SVG element)');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(page + read('games', 'chart-detective', 'game.js')), 'nothing is stored');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 10`, `ℹ fail 1`, the new test failing with `ENOENT` for `games/chart-detective/index.html`.

- [ ] **Step 3: Write the page**

Create `games/chart-detective/index.html` with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="color-scheme" content="only light" />
    <meta name="darkreader-lock" />
    <meta name="theme-color" content="#b45309" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- SEO Meta Tags -->
    <title>Chart Detective – Free Tally Chart, Pictogram and Bar Chart Game for Kids | Play It My Way</title>
    <meta name="description" content="Count things as they arrive, build the tally chart or pictogram, then answer the detective's questions: most, least, how many more. Grows into pictograms with a key, bar charts and tables. Ages 5+. No ads." />
    <meta name="keywords" content="tally chart game for kids, pictogram game ks1, bar chart game ks2, data handling game, statistics game year 2, reading charts for children, free maths game ages 5+" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="index, follow, max-image-preview:large" />

    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="Chart Detective – Free Tally Chart, Pictogram and Bar Chart Game for Kids" />
    <meta property="og:description" content="Count things as they arrive, build the chart, then solve the case: most, least, how many more. Tally charts to bar charts and tables. Ages 5+. No ads, no download!" />
    <meta property="og:type" content="game" />
    <meta property="og:url" content="https://playitmyway.com/games/chart-detective/" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Chart Detective – Free Tally Chart, Pictogram and Bar Chart Game for Kids" />
    <meta name="twitter:description" content="Build the chart, then solve the case: most, least, how many more. Tally charts to bar charts and tables. Ages 5+. No ads, no download!" />

    <link rel="icon" type="image/svg+xml" href="../../favicon.svg" />
    <link rel="canonical" href="https://playitmyway.com/games/chart-detective/" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="../../tokens.css" />
    <link rel="stylesheet" href="../../components.css" />
    <style>
      :root {
        --band: var(--color-amber);
        --band-tint: var(--color-amber-tint);
        --band-tint-deep: #d8c897;
        --band-deep: #7c2d12;
        --ink: var(--color-ink);
        --ink-soft: var(--color-ink-soft);
        --deep: var(--color-deep);
        --right: #15803d;
        --right-tint: #dcfce7;
        --wrong: #b91c1c;
        --wrong-tint: #fee2e2;
        --lit: #fde68a;
      }
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body { background: var(--color-bg); overscroll-behavior-y: contain; }
      body {
        font-family: var(--font-display); color: var(--ink); margin: 0; padding: 16px 12px 48px;
        display: flex; flex-direction: column; align-items: center; min-height: 100vh;
      }
      button { font-family: inherit; }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      .sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
      .back-link {
        color: var(--band); text-decoration: none; font-weight: 600; font-size: 15px; padding: 9px 14px;
        border-radius: var(--radius-pill); background: var(--band-tint); align-self: flex-start; margin-bottom: 6px;
        min-height: 44px; display: inline-flex; align-items: center; box-shadow: 0 3px 0 0 var(--band-tint-deep);
        transition: transform var(--ease-quick), box-shadow var(--ease-quick);
      }
      .back-link:hover { transform: translateY(-2px); box-shadow: 0 5px 0 0 var(--band-tint-deep); }
      .back-link:active { transform: translateY(3px); box-shadow: 0 1px 0 0 var(--band-tint-deep); }
      header.game-head { text-align: center; margin: 4px 0 8px; }
      header.game-head h1 { font-size: clamp(26px, 7vw, 34px); font-weight: 700; margin: 0; text-wrap: balance; }
      .stage-card {
        width: 100%; max-width: 760px; background: var(--color-surface); border-radius: var(--radius-lg);
        box-shadow: var(--shadow-rest); padding: 12px 10px; display: flex; flex-direction: column; align-items: center;
      }
      .intro { margin: 0 0 10px; font-size: 22px; font-weight: 700; color: var(--deep); text-align: center; }

      /* ---- picking a case ---- */
      .stages { display: grid; grid-template-columns: 1fr; gap: 10px; width: 100%; max-width: 520px; }
      @media (min-width: 560px) { .stages { grid-template-columns: 1fr 1fr; } .stages .stage-btn:last-child { grid-column: 1 / -1; } }
      .stage-btn {
        display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; text-align: left;
        border: 0; border-radius: var(--radius-lg); padding: 10px 12px; min-height: 64px; cursor: pointer; color: var(--ink);
        background: var(--band-tint); box-shadow: 0 4px 0 0 var(--band-tint-deep);
      }
      .stage-btn:active { transform: translateY(3px); box-shadow: 0 1px 0 0 var(--band-tint-deep); }
      .stage-btn .num { grid-row: 1 / 3; width: 44px; height: 44px; border-radius: 50%; background: var(--band); color: #fff; font-size: 22px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
      .stage-btn .name { font-size: 20px; font-weight: 700; }
      .stage-btn .blurb { font-size: 14px; color: var(--ink-soft); }

      /* ---- the detective and the bubble ---- */
      .bubble-row { display: flex; align-items: center; gap: 8px; width: 100%; margin-bottom: 8px; }
      .detective { flex: 0 0 auto; width: 56px; height: 52px; }
      .bubble {
        flex: 1 1 auto; position: relative; background: var(--band-tint); border-radius: 16px; padding: 10px 12px; min-height: 52px;
        display: flex; align-items: center;
      }
      .bubble::before { content: ""; position: absolute; left: -8px; top: 20px; border: 8px solid transparent; border-right-color: var(--band-tint); border-left: 0; }
      .tell { margin: 0; font-size: 19px; font-weight: 600; color: var(--deep); line-height: 1.25; }
      .tell.is-right { color: var(--right); }
      .tell.is-wrong { color: var(--wrong); }
      .say-btn {
        flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--band); color: #fff; font-size: 20px;
        cursor: pointer; box-shadow: 0 3px 0 0 var(--band-deep);
      }
      .say-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--band-deep); }

      /* ---- the spotlight: what is arriving ---- */
      .spot {
        display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; margin-bottom: 8px; padding: 8px 12px;
        border-radius: 14px; background: #fff7e6; border: 2px dashed var(--band-tint-deep);
      }
      .spot .glyph { width: 48px; height: 48px; }
      .spot-name { font-size: 20px; font-weight: 700; }
      .spot-count { font-size: 14px; color: var(--ink-soft); margin-left: auto; }
      @media (prefers-reduced-motion: no-preference) {
        .spot.pop .glyph { animation: spotPop 0.35s ease-out; }
        @keyframes spotPop { from { transform: scale(0.4); } to { transform: scale(1); } }
      }

      /* ---- charts ---- */
      .chart-wrap { width: 100%; }
      .chart-title { margin: 0 0 6px; text-align: center; font-size: 17px; font-weight: 700; color: var(--ink-soft); }
      .chart { width: 100%; }
      .glyph { width: 24px; height: 24px; flex: 0 0 auto; }
      .col {
        border: 2px solid transparent; border-radius: 12px; background: #fff; padding: 4px 2px 6px; cursor: default; color: var(--ink); font: inherit;
        display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0;
      }
      .col .label { font-size: 12px; line-height: 1.1; text-align: center; overflow-wrap: anywhere; }
      .col.pickable { cursor: pointer; border-color: var(--band-tint-deep); background: var(--band-tint); }
      .col.pickable:hover, .col.pickable:focus-visible { border-color: var(--band); }
      .col.lit { background: var(--lit); border-color: var(--band); }
      .col.is-right { background: var(--right-tint); border-color: var(--right); }
      .col.is-wrong { background: var(--wrong-tint); border-color: var(--wrong); }
      @media (prefers-reduced-motion: no-preference) {
        .col.nudge { animation: nudge 0.3s ease; }
        @keyframes nudge { 0%, 100% { transform: translateX(0); } 30% { transform: translateX(-6px); } 70% { transform: translateX(6px); } }
      }
      /* tally: one row per category */
      .chart.tally { display: flex; flex-direction: column; gap: 6px; }
      .chart.tally .col { flex-direction: row; justify-content: flex-start; gap: 8px; padding: 6px 8px; min-height: 48px; }
      .chart.tally .label { width: 78px; text-align: left; font-size: 14px; flex: 0 0 auto; }
      .tally-marks { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .tally-marks svg { width: 34px; height: 28px; }
      .tally-marks path { stroke: var(--ink); stroke-width: 3; stroke-linecap: round; fill: none; }
      .tally-marks .new path { stroke: var(--band); }
      /* pictogram, block and bar: columns side by side */
      .chart.cols { display: flex; align-items: flex-end; gap: 6px; }
      .chart.cols .col { flex: 1 1 0; }
      .stack { display: flex; flex-direction: column-reverse; align-items: center; justify-content: flex-start; gap: 2px; height: 224px; }
      .stack .glyph { width: 22px; height: 22px; }
      .stack .glyph.half { clip-path: inset(0 50% 0 0); }
      .stack .block { width: 22px; height: 18px; border-radius: 4px; border: 2px solid var(--ink); }
      .stack .extra { outline: 3px solid var(--band); outline-offset: 1px; border-radius: 4px; }
      @media (prefers-reduced-motion: no-preference) {
        .stack .extra { animation: pulse 0.7s ease-in-out infinite alternate; }
        @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.18); } }
      }
      .chart.bars { display: grid; grid-template-columns: 30px 1fr; column-gap: 2px; }
      .axis { position: relative; height: 224px; }
      .axis span { position: absolute; right: 2px; transform: translateY(50%); font-size: 12px; color: var(--ink-soft); }
      .plot { position: relative; display: flex; align-items: flex-end; gap: 6px; height: 224px; border-left: 2px solid var(--ink); border-bottom: 2px solid var(--ink); padding-left: 4px; }
      .plot .grid { position: absolute; left: 0; right: 0; border-top: 1px solid var(--band-tint-deep); pointer-events: none; }
      /* no padding or border here: the bar's height is a percentage of the column, which must equal the plot */
      .plot .col { flex: 1 1 0; height: 100%; justify-content: flex-end; background: transparent; border: 0; border-radius: 8px 8px 0 0; padding: 0; }
      .plot .col.pickable { background: var(--band-tint); }
      .plot .col.lit { background: var(--lit); }
      .plot .col.is-right { background: var(--right-tint); }
      .plot .col.is-wrong { background: var(--wrong-tint); }
      .bar { width: 70%; border: 2px solid var(--ink); border-bottom: 0; border-radius: 6px 6px 0 0; }
      .bar-labels { grid-column: 2; display: flex; gap: 6px; padding-left: 4px; }
      .bar-labels .lab { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; text-align: center; overflow-wrap: anywhere; min-width: 0; }
      .chart-key { margin: 8px 0 0; text-align: center; font-size: 15px; display: flex; align-items: center; justify-content: center; gap: 6px; }
      /* the table */
      table.data { border-collapse: collapse; margin: 0 auto; font-size: 17px; }
      table.data th, table.data td { border: 2px solid var(--band-tint-deep); padding: 6px 10px; text-align: center; min-width: 44px; }
      table.data .short { display: none; }
      @media (max-width: 480px) {
        table.data { font-size: 15px; }
        table.data th, table.data td { padding: 5px 6px; min-width: 40px; }
        table.data .long { display: none; }
        table.data .short { display: inline; }
      }
      table.data th { background: var(--band-tint); font-weight: 700; }
      table.data th.name { text-align: left; }
      table.data td.hidden-cell { font-weight: 700; color: var(--band); }
      table.data td.lit { background: var(--lit); }
      table.data th.total { background: #fff7e6; }
      .c-blue { background: #60a5fa; } .c-green { background: #4ade80; } .c-yellow { background: #fbbf24; } .c-purple { background: #a78bfa; } .c-pink { background: #ff8fab; }

      /* ---- answers ---- */
      .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: 100%; margin-top: 12px; min-height: 52px; }
      .chip {
        min-width: 64px; min-height: 52px; padding: 8px 16px; border: 2px solid var(--band); border-radius: var(--radius-pill); font-size: 22px; font-weight: 700; cursor: pointer;
        background: #fff; color: var(--band-deep); box-shadow: 0 4px 0 0 var(--band);
      }
      .chip:active { transform: translateY(3px); box-shadow: 0 1px 0 0 var(--band); }
      .chip.is-right { background: var(--right-tint); color: var(--right); border-color: var(--right); box-shadow: 0 4px 0 0 var(--right); }
      .chip.is-wrong { background: var(--wrong-tint); color: var(--wrong); border-color: #fca5a5; box-shadow: 0 4px 0 0 #fca5a5; text-decoration: line-through; }
      .chip:disabled { cursor: default; }
      .chips .note { width: 100%; text-align: center; font-size: 15px; color: var(--ink-soft); margin: 0; }
      .go-btn {
        border: 0; border-radius: var(--radius-pill); font-size: 20px; font-weight: 700; padding: 12px 24px; min-height: 52px;
        cursor: pointer; background: var(--band); color: #fff; box-shadow: 0 5px 0 var(--band-deep);
      }
      .go-btn:active { transform: translateY(3px); box-shadow: 0 2px 0 var(--band-deep); }
      .soft-btn {
        border: 0; border-radius: var(--radius-pill); font-size: 16px; font-weight: 600; padding: 10px 18px; min-height: 44px; cursor: pointer;
        background: var(--band-tint); color: var(--band); box-shadow: 0 3px 0 0 var(--band-tint-deep);
      }
      .soft-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 0 var(--band-tint-deep); }
      .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; width: 100%; margin-top: 12px; }

      /* ---- case closed ---- */
      .done { width: 100%; margin-top: 12px; padding: 12px; border-radius: 16px; background: #fff7e6; }
      .done-head { margin: 0 0 6px; text-align: center; font-size: 24px; color: var(--deep); }
      .findings { list-style: none; margin: 0; padding: 0; font-size: 17px; }
      .findings li { padding: 4px 0; }
      .findings li::before { content: "✔ "; color: var(--right); }
      .findings li.helped::before { content: "• "; color: var(--band); }

      .how-to {
        width: 100%; max-width: 760px; margin: 22px auto 0; padding: 18px 22px; background: var(--color-surface);
        border-radius: var(--radius-lg); box-shadow: var(--shadow-rest); line-height: 1.6;
      }
      .how-to h2 { margin: 0 0 8px; font-size: 22px; }
      .how-to h3 { margin: 14px 0 4px; font-size: 18px; }
      .how-to ol { margin: 0; padding-left: 22px; }
      .how-to p { margin: 10px 0 0; }
      kbd { font-family: inherit; background: var(--band-tint); border-radius: 6px; padding: 1px 6px; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <a class="back-link" href="../../">← Back to Games</a>

    <header class="game-head">
      <h1><img class="title-icon" src="../../icons/games/chart-detective.svg" alt="" width="40" height="40"> Chart Detective</h1>
    </header>

    <main class="stage-card">
      <svg class="sprite" id="sprite" aria-hidden="true" focusable="false"></svg>

      <section id="pickView" aria-label="Pick a case">
        <p class="intro">Pick a case</p>
        <div class="stages" id="stages" role="group" aria-label="Stages"></div>
      </section>

      <section id="playView" aria-label="The case" hidden data-phase="pick" data-qi="0" data-attempts="0">
        <div class="bubble-row">
          <img class="detective" src="../../icons/critters/mango.svg" alt="" width="64" height="60" />
          <div class="bubble"><p class="tell" id="tell" aria-live="polite"></p></div>
          <button type="button" class="say-btn" id="sayBtn" aria-label="Say it again">🔊</button>
        </div>

        <div class="spot" id="spot" hidden>
          <svg class="glyph" id="spotGlyph" aria-hidden="true" focusable="false"><use id="spotUse" href="#g-apple" /></svg>
          <span class="spot-name" id="spotName"></span>
          <span class="spot-count" id="spotCount"></span>
        </div>

        <div class="chart-wrap">
          <p class="chart-title" id="chartTitle"></p>
          <div class="chart" id="chart" role="group" aria-label="The chart"></div>
          <p class="chart-key" id="chartKey" hidden></p>
          <!-- the wrapper is clipped, not the table: a table ignores a 1px width and would widen the page on phones -->
          <div class="sr-only"><table id="srTable"><caption id="srCaption"></caption><tbody id="srBody"></tbody></table></div>
        </div>

        <div class="chips" id="chips" role="group" aria-label="Answers"></div>

        <div class="done" id="done" hidden>
          <h2 class="done-head" id="doneHead" tabindex="-1">Case closed!</h2>
          <ul class="findings" id="findings"></ul>
          <div class="controls">
            <button type="button" class="go-btn" id="nextStageBtn" hidden>Next stage →</button>
            <button type="button" class="go-btn" id="nextCaseBtn">Next case →</button>
          </div>
        </div>

        <div class="controls">
          <button type="button" class="soft-btn" id="casesBtn">All cases</button>
        </div>
      </section>
    </main>

    <section class="how-to">
      <h2>🤔 How to play</h2>
      <ol>
        <li><strong>Pick a case.</strong> Tally Time and Picture It are for ages 5 and up; Key of Two, Bar Charts and Tables are for 7 and up.</li>
        <li><strong>Count what arrives.</strong> In the first two cases things come one at a time. Tap the row or column where each one goes and watch the chart grow.</li>
        <li><strong>Answer the detective.</strong> Which was most? How many more? Tap a column on the chart, or tap a number.</li>
        <li><strong>Case closed.</strong> Every finding is read back, then it's on to the next case, or the next stage when every answer was right first time.</li>
      </ol>
      <p>A wrong answer gets a hint and another go. A second wrong answer gets the worked answer, with the two columns lit up, before the case moves on. On a keyboard, the number keys <kbd>1</kbd> to <kbd>5</kbd> pick a column, <kbd>Tab</kbd> and <kbd>Enter</kbd> press any button. The voice is your device's own; nothing is sent anywhere, and nothing is saved.</p>
      <h3>What it practises</h3>
      <p>Reading and making charts, as taught from Year 1 to Year 4: tally marks in fives, pictograms and block diagrams, then pictograms with a key, bar charts with axis steps of 2, 5 and 10, and two-way tables. The questions are the ones the school asks: which is most or least, how many more or fewer, how many altogether, and true or false.</p>
    </section>

    <footer class="site-footer">
      <p class="site-footer-badges">🚫 No ads · 🔒 No tracking · 🍪 Nothing stored · 💯 100% free</p>
      <nav class="site-footer-links" aria-label="Site links">
        <a href="../../">🏠 All games</a>
        <a href="../../privacy-policy.html">Privacy</a>
        <a href="../../disclaimer.html">Disclaimer</a>
        <a href="mailto:contact@playitmyway.com">Contact</a>
      </nav>
    </footer>

    <script src="../shared/voice.js"></script>
    <script src="charts.js"></script>
    <script src="glyphs.js"></script>
    <script src="game.js"></script>
    <script src="../../components.js"></script>
    <script>
      /* Installed-app flag: drives the bottom bar. display-mode covers Android
         and modern iOS; navigator.standalone is the older iOS signal. */
      if (
        (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ||
        navigator.standalone
      ) {
        document.documentElement.classList.add("pimw-installed");
      }
      /* Back, with a floor: a game opened directly from a search result has no
         history to go back to, so fall through to the games index. */
      function pimwBack() {
        if (history.length > 1) history.back();
        else location.href = "/games/";
      }
      /* offline support; skipped over file:// where service workers do not run */
      if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
        addEventListener("load", function () {
          navigator.serviceWorker.register("/sw.js").catch(function () {});
        });
      }
    </script>
    <nav class="pimw-appbar" aria-label="App navigation">
      <button type="button" class="pimw-appbar-btn" onclick="pimwBack()">
        <span class="pimw-appbar-ic" aria-hidden="true">←</span>
        <span class="pimw-appbar-label">Back</span>
      </button>
      <a class="pimw-appbar-btn" href="/">
        <span class="pimw-appbar-ic" aria-hidden="true">🏠</span>
        <span class="pimw-appbar-label">Home</span>
      </a>
      <a class="pimw-appbar-btn" href="/games/">
        <span class="pimw-appbar-ic" aria-hidden="true">🎮</span>
        <span class="pimw-appbar-label">Games</span>
      </a>
    </nav>
  </body>
</html>
```

- [ ] **Step 4: Write the page's script**

Create `games/chart-detective/game.js` with exactly this content:

```js
/* Chart Detective: the page. Picks a case, draws the chart (tally,
 * pictogram, block diagram, bar chart or table), runs the collecting phase,
 * asks the questions with the two-step hint ladder, and closes the case.
 * All the numbers and words come from charts.js; this file only renders.
 * Nothing is stored: a case lives only while the page is open. */
(function () {
  'use strict';
  const CD = window.ChartDetective;
  const G = window.ChartDetectiveGlyphs;
  const Voice = window.Voice;
  const $ = (id) => document.getElementById(id);
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COLOURS = ['c-blue', 'c-green', 'c-yellow', 'c-purple', 'c-pink'];

  // ---- a tiny synth; silent while the site's sound toggle is off ----------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audio = null;
  function tone(freq, when, dur, gain) {
    const osc = audio.createOscillator(), g = audio.createGain();
    osc.connect(g); g.connect(audio.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audio.currentTime + when);
    g.gain.setValueAtTime(gain, audio.currentTime + when);
    g.gain.linearRampToValueAtTime(0.001, audio.currentTime + when + dur);
    osc.start(audio.currentTime + when);
    osc.stop(audio.currentTime + when + dur);
  }
  function sound(kind) {
    if (window.pimwMuted || !AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'place') tone(520, 0, 0.06, 0.05);
      else if (kind === 'right') { tone(660, 0, 0.14, 0.1); tone(880, 0.12, 0.2, 0.1); }
      else if (kind === 'oops') { tone(294, 0, 0.14, 0.06); tone(247, 0.13, 0.22, 0.05); }
      else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.28, 0.1));
    } catch (e) { /* sound is optional */ }
  }
  const say = (text) => { try { if (Voice) Voice.say(text); } catch (e) { /* a voice must never break the game */ } };

  // ---- state ---------------------------------------------------------------
  const el = {
    pick: $('pickView'), play: $('playView'), stages: $('stages'), tell: $('tell'), sayBtn: $('sayBtn'),
    spot: $('spot'), spotUse: $('spotUse'), spotName: $('spotName'), spotCount: $('spotCount'),
    chartTitle: $('chartTitle'), chart: $('chart'), chartKey: $('chartKey'), srCaption: $('srCaption'), srBody: $('srBody'),
    chips: $('chips'), done: $('done'), doneHead: $('doneHead'), findings: $('findings'),
    nextStage: $('nextStageBtn'), nextCase: $('nextCaseBtn'), cases: $('casesBtn'),
  };
  const params = new URLSearchParams(location.search);
  const fixedSeed = /^\d+$/.test(params.get('seed') || '') ? Number(params.get('seed')) : null;   // for the end-to-end player
  let seedNext = fixedSeed === null ? null : fixedSeed;
  const casesPlayed = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };   // this visit only: picks the key or the axis step
  const S = { stage: 0, round: null, placed: [], arrival: 0, qi: 0, attempts: 0, phase: 'pick', findings: [], timer: 0, lastSaid: '' };

  function nextSeed() {
    if (seedNext !== null) return seedNext++;
    return Math.floor(Math.random() * 2147483647);
  }
  function setPhase(phase) {
    S.phase = phase;
    el.play.setAttribute('data-phase', phase);
    el.play.setAttribute('data-qi', String(S.qi));
    el.play.setAttribute('data-attempts', String(S.attempts));
  }
  function tell(text, mood, speak) {
    el.tell.textContent = text;
    el.tell.className = 'tell' + (mood ? ' is-' + mood : '');
    S.lastSaid = speak === undefined ? text : speak;
    if (S.lastSaid) say(S.lastSaid);
  }
  const later = (fn, ms) => { clearTimeout(S.timer); S.timer = setTimeout(fn, calm() ? Math.min(ms, 300) : ms); };

  // ---- the start screen ------------------------------------------------------
  function buildStages() {
    el.stages.innerHTML = '';
    for (const st of CD.STAGES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'stage-btn'; b.dataset.stage = String(st.id);
      b.innerHTML = '<span class="num" aria-hidden="true">' + st.id + '</span><span class="name"></span><span class="blurb"></span>';
      b.querySelector('.name').textContent = st.name;
      b.querySelector('.blurb').textContent = st.blurb + ' · ' + st.ages;
      b.setAttribute('aria-label', 'Stage ' + st.id + ', ' + st.name + ': ' + st.blurb + ', ' + st.ages);
      b.addEventListener('click', () => startCase(st.id));
      el.stages.appendChild(b);
    }
  }
  function showPick() {
    clearTimeout(S.timer);
    setPhase('pick');
    el.play.hidden = true;
    el.pick.hidden = false;
    const first = el.stages.querySelector('.stage-btn');
    if (first) first.focus();
  }

  // ---- drawing the chart ------------------------------------------------------
  const glyph = (id, cls) => '<svg class="glyph' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#g-' + id + '"/></svg>';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function tallyMarks(n, fresh) {
    const groups = CD.tallyGroups(n);
    return groups.map((g, gi) => {
      let d = '';
      for (let i = 0; i < Math.min(g, 4); i++) d += 'M' + (5 + i * 7) + ' 4v20';
      if (g === 5) d += 'M2 22L30 6';
      const isNew = fresh && gi === groups.length - 1;
      return '<svg viewBox="0 0 34 28" aria-hidden="true" focusable="false" class="' + (isNew ? 'new' : '') + '"><path d="' + d + '"/></svg>';
    }).join('');
  }

  // a column button: the label it carries is the category's name while
  // collecting, and name plus count once the chart is complete
  function colButton(i, inner) {
    const r = S.round, c = r.categories[i];
    const collecting = S.phase === 'collect';
    const label = collecting ? c.name : c.plural + ': ' + S.placed[i];
    return '<button type="button" class="col' + (collecting ? ' pickable' : '') + '" data-i="' + i + '" data-cat="' + c.id + '" aria-label="' + label + '">' + inner + '</button>';
  }

  function drawChart(fresh) {
    const r = S.round;
    const chart = el.chart;
    el.chartTitle.textContent = r.chart === 'table' ? cap(r.tableUnit) + ' ' + r.themeData.verb + ' this week' : r.title;
    el.chartKey.hidden = true;
    let html = '';
    if (r.chart === 'tally') {
      chart.className = 'chart tally';
      html = r.categories.map((c, i) => colButton(i, glyph(c.id) + '<span class="label">' + c.name + '</span><span class="tally-marks">' + tallyMarks(S.placed[i], fresh === i) + '</span>')).join('');
    } else if (r.chart === 'pictogram' || r.chart === 'block') {
      chart.className = 'chart cols';
      html = r.categories.map((c, i) => {
        let stack = '';
        if (r.chart === 'block') {
          for (let k = 0; k < S.placed[i]; k++) stack += '<span class="block ' + COLOURS[i % COLOURS.length] + '"></span>';
        } else {
          const s = CD.symbolsFor(S.placed[i], r.key);
          for (let k = 0; k < s.whole; k++) stack += glyph(c.id);
          if (s.half) stack += glyph(c.id, 'half');
        }
        return colButton(i, '<span class="stack">' + stack + '</span>' + glyph(c.id) + '<span class="label">' + c.name + '</span>');
      }).join('');
      if (r.chart === 'pictogram') {
        el.chartKey.hidden = false;
        el.chartKey.innerHTML = '<span>Key:</span>' + glyph(r.categories[0].id) + '<span>= ' + r.key + '</span>';
      }
    } else if (r.chart === 'bar') {
      chart.className = 'chart bars';
      let axis = '', grid = '';
      for (let v = 0; v <= r.max; v += r.step) {
        const pct = (100 * (1 - v / r.max)).toFixed(2);
        axis += '<span style="top:' + pct + '%">' + v + '</span>';
        if (v > 0) grid += '<div class="grid" style="top:' + pct + '%"></div>';
      }
      const bars = r.categories.map((c, i) => colButton(i, '<span class="bar ' + COLOURS[i % COLOURS.length] + '" style="height:' + (100 * S.placed[i] / r.max).toFixed(2) + '%"></span>')).join('');
      const labels = r.categories.map((c) => '<span class="lab">' + glyph(c.id) + c.name + '</span>').join('');
      html = '<div class="axis" aria-hidden="true">' + axis + '</div><div class="plot">' + grid + bars + '</div><div class="bar-labels" aria-hidden="true">' + labels + '</div>';
    } else {
      chart.className = 'chart';
      const t = r.table;
      html = '<table class="data"><thead><tr><th class="name" scope="col"><span class="sr-only">Who</span></th>' + r.days.map((d) => '<th scope="col"><span class="long">' + d + '</span><abbr class="short" title="' + d + '">' + d.slice(0, 3) + '</abbr></th>').join('') + '<th scope="col" class="total">Total</th></tr></thead><tbody>';
      r.rows.forEach((name, i) => {
        const total = t.cells[i].reduce((a, b) => a + b, 0);
        html += '<tr><th class="name" scope="row">' + name + '</th>' + t.cells[i].map((v, j) => (i === t.r0 && j === t.c0 ? '<td class="hidden-cell" data-r="' + i + '" data-c="' + j + '" aria-label="hidden">?</td>' : '<td data-r="' + i + '" data-c="' + j + '">' + v + '</td>')).join('') +
          (i === t.r0 ? '<td class="total" data-r="' + i + '" data-c="-1">' + total + '</td>' : '<td class="total" aria-label="not shown"></td>') + '</tr>';
      });
      html += '</tbody></table>';
    }
    chart.innerHTML = html;
    drawSrTable();
  }

  // the same numbers as a real table, for screen readers
  function drawSrTable() {
    const r = S.round;
    if (r.chart === 'table') { el.srCaption.textContent = ''; el.srBody.innerHTML = ''; return; }
    const kind = r.chart === 'tally' ? 'Tally chart' : r.chart === 'block' ? 'Block diagram' : r.chart === 'bar' ? 'Bar chart' : 'Pictogram';
    el.srCaption.textContent = kind + ': ' + r.title + (r.chart === 'pictogram' ? '. Each picture stands for ' + r.key : r.chart === 'bar' ? '. The axis goes up in steps of ' + r.step : '') + '.';
    el.srBody.innerHTML = r.categories.map((c, i) => '<tr><th scope="row"></th><td></td></tr>').join('');
    const rows = el.srBody.querySelectorAll('tr');
    r.categories.forEach((c, i) => { rows[i].firstChild.textContent = cap(c.plural); rows[i].lastChild.textContent = String(S.placed[i]); });
  }

  const cols = () => Array.from(el.chart.querySelectorAll('button.col'));
  const colOf = (i) => el.chart.querySelector('button.col[data-i="' + i + '"]');
  function clearMarks() {
    for (const b of cols()) b.classList.remove('lit', 'is-right', 'is-wrong', 'pickable', 'nudge');
    for (const x of el.chart.querySelectorAll('.extra')) x.classList.remove('extra');
    for (const td of el.chart.querySelectorAll('td.lit')) td.classList.remove('lit');
  }

  // ---- a case ------------------------------------------------------------------
  function startCase(stageId) {
    clearTimeout(S.timer);
    S.stage = stageId;
    S.round = CD.generateRound(stageId, nextSeed(), casesPlayed[stageId]);
    S.findings = [];
    S.qi = 0; S.attempts = 0;
    el.pick.hidden = true;
    el.play.hidden = false;
    el.done.hidden = true;
    el.chips.innerHTML = '';
    el.chart.setAttribute('data-stage', String(stageId));
    el.chart.setAttribute('data-seed', String(S.round.seed));
    el.chart.setAttribute('data-case', String(S.round.caseIndex));
    if (S.round.collect) {
      S.placed = S.round.counts.map(() => 0);
      S.arrival = 0;
      setPhase('collect');
      drawChart();
      el.spot.hidden = true;                      // shown by the first arrival
      tell('Tap where each one goes!', '', '');
      later(showArrival, 600);
    } else {
      S.placed = S.round.counts.slice();
      setPhase('ask');
      drawChart();
      el.spot.hidden = true;
      askQuestion(0);
    }
    // The title stays on screen, so the site's fixed full-screen button never
    // covers the speak button. An instant jump, never smooth: a tap that lands
    // while the page is still gliding hits whatever slid under the finger.
    document.querySelector('header.game-head').scrollIntoView({ block: 'start' });
  }

  function showArrival() {
    const r = S.round;
    const c = r.categories[r.arrivals[S.arrival]];
    el.spot.hidden = false;
    el.spotUse.setAttribute('href', '#g-' + c.id);
    el.spotName.textContent = cap(c.name);
    el.spotCount.textContent = (S.arrival + 1) + ' of ' + r.arrivals.length;
    el.spot.classList.remove('pop');
    void el.spot.offsetWidth;
    el.spot.classList.add('pop');
    el.spot.setAttribute('aria-label', 'Now arriving: ' + c.name);
    tell(cap(c.name) + '!', '', c.name);
  }

  function place(i) {
    const r = S.round;
    const want = r.arrivals[S.arrival];
    const b = colOf(i);
    if (i !== want) {
      b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
      sound('oops');
      const slot = r.chart === 'tally' ? 'row' : 'column';
      tell("That's the " + r.categories[i].name + ' ' + slot + '. Find the ' + r.categories[want].name + ' ' + slot + '.', 'wrong');
      return;
    }
    S.placed[i]++;
    S.arrival++;
    sound('place');
    drawChart(i);
    if (S.arrival < r.arrivals.length) { showArrival(); return; }
    el.spot.hidden = true;
    setPhase('counted');
    drawChart();
    tell('All counted! Now the questions.', 'right');
    later(() => askQuestion(0), 1400);
  }

  // ---- the questions ------------------------------------------------------------
  function askQuestion(qi) {
    const r = S.round;
    const q = r.questions[qi];
    S.qi = qi; S.attempts = 0;
    setPhase('ask');
    clearMarks();
    el.chips.innerHTML = '';
    if (q.kind === 'category') {
      for (const b of cols()) b.classList.add('pickable');
      const note = document.createElement('p');
      note.className = 'note'; note.textContent = 'Tap a ' + (r.chart === 'tally' ? 'row' : 'column') + ' on the chart.';
      el.chips.appendChild(note);
    } else {
      for (const o of q.options) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.dataset.choice = String(o);
        b.textContent = o === 'true' ? 'True' : o === 'false' ? 'False' : String(o);
        b.addEventListener('click', () => answer(String(o), b));
        el.chips.appendChild(b);
      }
    }
    tell(q.text, '', q.say);
  }

  function answer(choice, btn) {
    if (S.phase !== 'ask') return;
    const r = S.round;
    const q = r.questions[S.qi];
    const res = CD.check(r, S.qi, choice);
    if (res.right) {
      if (btn) btn.classList.add('is-right');
      if (q.kind === 'category') colOf(q.targets[0]).classList.add('is-right');
      for (const b of el.chips.querySelectorAll('.chip')) b.disabled = true;
      for (const b of cols()) b.classList.remove('pickable');
      S.findings.push({ text: q.finding, firstTry: S.attempts === 0 });
      sound('right');
      setPhase('right');
      tell('Yes! ' + q.finding, 'right');
      later(nextQuestion, 1500);
      return;
    }
    S.attempts++;
    setPhase('ask');
    sound('oops');
    if (btn) { btn.classList.add('is-wrong'); btn.disabled = true; }
    if (q.kind === 'category') { const b = colOf(r.categories.findIndex((c) => c.id === choice)); if (b) { b.classList.add('is-wrong'); b.classList.remove('pickable'); } }
    if (S.attempts === 1) { tell(res.hint, 'wrong'); return; }
    // the second wrong answer: the worked answer, then the case moves on
    for (const b of el.chips.querySelectorAll('.chip')) { b.disabled = true; if (String(q.answer) === b.dataset.choice) b.classList.add('is-right'); }
    for (const b of cols()) b.classList.remove('pickable');
    S.findings.push({ text: q.finding, firstTry: false });
    showWorked(q);
    setPhase('worked');
    tell(res.explanation, 'wrong');
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'go-btn'; next.id = 'nextQBtn'; next.textContent = 'Next →';
    next.addEventListener('click', nextQuestion);
    el.chips.appendChild(next);
    next.focus({ preventScroll: true });
  }

  // light the columns the explanation talks about, and ring the extra blocks
  function showWorked(q) {
    const r = S.round;
    if (r.chart === 'table') {
      const [row, col] = q.targets;
      for (const td of el.chart.querySelectorAll('td[data-r]')) {
        const tr = Number(td.dataset.r), tc = Number(td.dataset.c);
        if ((row === -1 || tr === row) && (col === -1 || tc === col || col === -1 && tc === -1)) td.classList.add('lit');
        if (q.type === 'missingCell' && tr === row && tc === -1) td.classList.add('lit');
      }
      return;
    }
    const targets = q.kind === 'category' ? r.categories.map((_, i) => i) : q.targets;
    for (const i of targets) { const b = colOf(i); if (b) b.classList.add('lit'); }
    if (q.kind === 'category') { const b = colOf(q.targets[0]); if (b) b.classList.add('is-right'); }
    if ((q.type === 'more' || q.type === 'fewer') && r.chart !== 'bar') {
      const [a, b] = q.targets;
      const small = Math.min(r.counts[a], r.counts[b]);
      const items = colOf(a).querySelectorAll('.stack > *, .tally-marks svg');
      const per = r.chart === 'tally' ? 5 : r.chart === 'pictogram' ? r.key : 1;
      items.forEach((it, k) => { if ((k + 1) * per > small) it.classList.add('extra'); });
    }
  }

  function nextQuestion() {
    clearTimeout(S.timer);
    const r = S.round;
    if (S.qi + 1 < r.questions.length) { askQuestion(S.qi + 1); return; }
    closeCase();
  }

  // ---- case closed --------------------------------------------------------------
  function closeCase() {
    casesPlayed[S.stage]++;
    clearMarks();
    el.chips.innerHTML = '';
    setPhase('done');
    el.findings.innerHTML = '';
    for (const f of S.findings) {
      const li = document.createElement('li');
      li.textContent = f.text;
      if (!f.firstTry) li.classList.add('helped');
      el.findings.appendChild(li);
    }
    const perfect = S.findings.every((f) => f.firstTry);
    el.nextStage.hidden = !(perfect && S.stage < 5);
    el.done.hidden = false;
    sound('done');
    tell(perfect ? 'Case closed! Every answer right first time.' : 'Case closed!', 'right');
    el.doneHead.focus({ preventScroll: true });
    el.chart.scrollIntoView({ block: 'start' });   // instant, for the same reason as in startCase
  }

  // ---- wiring -------------------------------------------------------------------
  el.chart.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.col');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (S.phase === 'collect') place(i);
    else if (S.phase === 'ask' && S.round.questions[S.qi].kind === 'category' && b.classList.contains('pickable')) answer(b.dataset.cat, null);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (el.play.hidden) return;
    const n = Number(ev.key);
    if (!(n >= 1 && n <= 5)) return;
    const b = colOf(n - 1);
    if (!b) return;
    if (S.phase === 'collect' || (S.phase === 'ask' && b.classList.contains('pickable'))) { ev.preventDefault(); b.click(); }
  });
  el.sayBtn.addEventListener('click', () => { if (S.lastSaid) say(S.lastSaid); });
  el.nextCase.addEventListener('click', () => startCase(S.stage));
  el.nextStage.addEventListener('click', () => startCase(Math.min(5, S.stage + 1)));
  el.cases.addEventListener('click', showPick);

  $('sprite').innerHTML = G.sprite();
  buildStages();
  const startStage = Number(params.get('stage'));
  if (startStage >= 1 && startStage <= 5) startCase(startStage);
  else showPick();

  // for the end-to-end player: the current case and where it is
  window.cdTest = {
    round: () => JSON.parse(JSON.stringify(S.round)),
    state: () => ({ phase: S.phase, qi: S.qi, attempts: S.attempts, arrival: S.arrival, placed: S.placed.slice(), stage: S.stage }),
  };
})();
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 11` and `ℹ fail 0`.

- [ ] **Step 6: Look at every stage at phone width**

With `shot.cjs` from Task 2 in your scratchpad, from the repo root (`P` is the page; the title icon does not exist yet, so its image is blank in these shots):

```bash
P="games/chart-detective/index.html"
AUTO='(() => { const t = window.cdTest; let n = 0; while (t.state().phase === "collect" && n++ < 100) { const i = t.round().arrivals[t.state().arrival]; document.querySelector(`button.col[data-i="${i}"]`).click(); } })()'
node shot.cjs "$P" start.png 1000 760 0 0
node shot.cjs "$P?stage=1&seed=3" s1-collect.png 360 740 1 0
node shot.cjs "$P?stage=1&seed=3" s1-ask.png 360 740 1 0 "$AUTO" 2500
node shot.cjs "$P?stage=2&seed=5" s2-ask.png 360 740 1 0 "$AUTO" 2500
node shot.cjs "$P?stage=3&seed=8" s3.png 360 740 1 0
node shot.cjs "$P?stage=4&seed=9" s4.png 360 740 1 0
node shot.cjs "$P?stage=5&seed=16" s5.png 360 740 1 0
```

Expected, each with `(no errors)` on its line: `start.png` shows "Pick a case" and five stage buttons in two columns; `s1-collect.png` shows Mango's bubble saying "Feather!", a dashed spotlight "Feather 1 of 14" and three tinted rows (crab, feather, shell); `s1-ask.png` shows "How many crabs?" over tally rows (the fifth stroke crosses the four) and four white chips with amber borders; `s2-ask.png` shows a pictogram of four columns of pictures with "Key: [crab] = 1" and a question about pebbles and crabs; `s3.png` shows "Each picture stands for how many?", a pictogram with a half ladybird at the top of one column, "Key: [ladybird] = 2" and chips 1, 2, 5, 10; `s4.png` shows "The numbers go up in steps of what?", an axis 0 to 20 in twos, five bars with their tops on gridlines, glyphs and names under the bars; `s5.png` shows a table headed Mon, Tue, Wed, Total with one `?` cell and one total, fitting the width with room to spare. Nothing may be cut off at the right edge.

- [ ] **Step 7: Commit**

```bash
git add games/chart-detective/index.html games/chart-detective/game.js docs/tests/chart-detective.test.js
git commit -m "feat(chart-detective): the page: five chart kinds, collecting, the questions with the hint ladder, the worked answer and case closed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Listing the game

**Files:**
- Create: `icons/games/chart-detective.svg`
- Modify: `docs/catalogue.js` (the 5+ band outcome; a new entry after `pebble-push`)
- Modify: `index.html` (one card after the Pebble Push card; the tagline count)
- Modify: `sitemap.xml` (one `<url>` after `spot-the-difference`)
- Regenerate: `games/index.html`, `for-teachers.html`, `404.html`, `sw.js`
- Modify: `docs/tests/chart-detective.test.js` (append)

**Interfaces:**
- Consumes: the page from Task 3.
- Produces: the catalogue entry `{ slug: 'chart-detective', name: 'Chart Detective', age: '5', mins: '10', skills: ['numbers', 'logic'] }` that every generated page and the icon test read.

- [ ] **Step 1: Append the failing test**

Append to the end of `docs/tests/chart-detective.test.js`:

```js
// ---- part: catalogue ----
test('the catalogue lists the game honestly', () => {
  const C = require(path.join(ROOT, 'docs', 'catalogue.js'));
  const entry = C.games.find((g) => g.slug === 'chart-detective');
  assert.ok(entry, 'the catalogue entry');
  assert.equal(entry.age, '5');
  assert.deepEqual(entry.skills, ['numbers', 'logic']);
  for (const word of ['tally', 'pictograms', 'block diagrams', 'bar charts', 'tables', 'key', 'most or least', 'how many more']) assert.ok(entry.practises.toLowerCase().includes(word), `the catalogue text must mention ${word}`);
  assert.ok(C.bands.find((b) => b.id === '5').outcome.includes('charts'), 'the 5+ band outcome names charts');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test docs/tests/chart-detective.test.js`
Expected: `ℹ pass 11`, `ℹ fail 1`: `the catalogue entry`.

- [ ] **Step 3: The icon**

Create `icons/games/chart-detective.svg` with exactly this content (one line of shapes; the file must start with `<svg xmlns=` and hold exactly one comment):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Chart Detective: a magnifying glass over three bars of a chart -->
<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M5 43h38"/><rect x="7" y="27" width="9" height="16" rx="2" fill="#60a5fa"/><rect x="19.5" y="15" width="9" height="28" rx="2" fill="#4ade80"/><rect x="32" y="22" width="9" height="21" rx="2" fill="#fbbf24"/><path d="M35 27l8 8" stroke-width="5"/><circle cx="28" cy="20" r="10" fill="#fef3c7"/><path d="M23 20h10M28 15v10"/></g>
</svg>
```

- [ ] **Step 4: The catalogue**

In `docs/catalogue.js`, change the 5+ band's outcome line:

```js
    { id: '5',  label: 'Ages 5+',  title: 'Fun & Games',     band: 'band-5',
      outcome: 'Phonics, sorting, charts, quick reactions and fair play.' },
```

and add the entry immediately after the `pebble-push` entry (before the `// --- 7+ ---` comment):

```js
    { slug: 'chart-detective', name: 'Chart Detective', age: '5', mins: '10',
      skills: ['numbers', 'logic'],
      practises: 'Reading and making charts: tally marks in fives, pictograms and block diagrams, then pictograms with a key, bar charts with axis steps of 2, 5 and 10, and two-way tables. Things arrive one at a time to be counted, then the questions ask which was most or least, how many more, and how many altogether. A wrong answer gets a hint and another go, then the worked answer with the columns it is about lit up.' },
```

- [ ] **Step 5: The homepage card and count**

In `index.html`, after the Pebble Push card (the last `<a class="game-card"` inside `<section class="age-section band-5">`, just before that section's `</div>`), add:

```html
          <a class="game-card" href="games/chart-detective/index.html">
            <span class="game-icon" aria-hidden="true"><img src="icons/games/chart-detective.svg" alt="" width="44" height="44"></span>
            <span class="game-card-name">Chart Detective</span>
            <span class="game-card-age">5+</span>
          </a>
```

and change the tagline `Seriously fun learning. 48 hand-built games.` to `Seriously fun learning. 49 hand-built games.`

- [ ] **Step 6: The sitemap**

In `sitemap.xml`, after the `spot-the-difference` `<url>` block (before the `<!-- Legal Pages -->` comment), add:

```xml
  <url>
    <loc>https://playitmyway.com/games/chart-detective/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 7: Regenerate the generated pages**

Run: `node docs/build-pages.js`
Expected: it reports the four files written, `sw.js` precaching a count that includes the new game's files (`games/chart-detective/index.html`, `charts.js`, `glyphs.js`, `game.js` and the icon).

Run: `git status --short`
Expected: exactly `M 404.html`, `M docs/catalogue.js`, `M docs/tests/chart-detective.test.js`, `M for-teachers.html`, `M games/index.html`, `M index.html`, `M sitemap.xml`, `M sw.js`, `?? icons/games/chart-detective.svg`.

- [ ] **Step 8: Run the whole suite**

Run: `node --test docs/tests/*.test.js`
Expected: every file reports `fail 0`; `chart-detective.test.js` reports `pass 12`; `icons.test.js` passes in full (style rules, coverage, every card on the homepage and catalogue, the title icon, the precache).

- [ ] **Step 9: Open the live-looking pages**

Run: `node shot.cjs index.html home.png 1000 1400 0 1` and `node shot.cjs games/index.html all.png 1000 1400 0 1`
Expected: the Chart Detective card with its icon appears at the end of the Ages 5+ row on both pages, and the title says 49 games.

- [ ] **Step 10: Commit**

```bash
git add icons/games/chart-detective.svg docs/catalogue.js docs/tests/chart-detective.test.js index.html sitemap.xml games/index.html for-teachers.html 404.html sw.js
git commit -m "feat(chart-detective): icon, catalogue entry, homepage card, sitemap, counts and the generated pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The end-to-end player

**Files:**
- Create: `docs/e2e/chart-detective.e2e.cjs`

**Interfaces:**
- Consumes: `charts.js` in Node (Task 1) and the page's test hooks (Task 3).
- Produces: a player that runs from the repo root over `file://` and, with `URL=https://playitmyway.com/games/chart-detective/`, against the live site.

- [ ] **Step 1: Write the player**

Create `docs/e2e/chart-detective.e2e.cjs` with exactly this content:

```js
#!/usr/bin/env node
/* Chart Detective: end-to-end player in headless Chrome.
 *
 * Opens the page at ?stage=1&seed=3, so every case is known in advance: it
 * loads the game's pure logic module (games/chart-detective/charts.js) in
 * Node and computes the same cases the page will. It then plays:
 *   case 1 (stage 1, seed 3): one wrong tap while collecting, then the first
 *          question wrong twice (the hint, then the worked answer and Next),
 *          the rest right; Case closed with Next stage hidden; Next case;
 *   case 2 (stage 1, seed 4): everything right first time; Next stage;
 *   cases 3 to 6 (stages 2 to 5, seeds 5 to 8): everything right first time,
 *          Next stage each time; after stage 5 Next stage is hidden;
 *   then All cases returns to the start screen.
 * It also presses Say it again, and checks the page's case equals Node's.
 *
 * Run from the repo root (desktop, over file://):
 *   node docs/e2e/chart-detective.e2e.cjs
 *
 * Env (all optional):
 *   PHONE=1      360 x 740, isMobile, hasTouch; plays by taps on the buttons
 *   CALM=1       emulates prefers-reduced-motion: reduce (desktop, keyboard)
 *   URL=...      page URL, e.g. https://playitmyway.com/games/chart-detective/
 *                (default: the repo's file:// path to games/chart-detective/index.html)
 *   ALLOW=a,b    request-URL prefixes allowed besides the page's own origin, file:,
 *                data: and blob: (default https://playitmyway.com/); against the live
 *                site use ALLOW=https://playitmyway.com/,https://static.cloudflareinsights.com/
 *   SHOTS=dir    screenshot folder (collecting, the worked answer, case closed, any failure)
 *   ROOT=dir     repo root for requiring charts.js (default: two folders up from here)
 *   PUPPETEER=   path to puppeteer-core (default %TEMP%\pimw-puppeteer\node_modules\puppeteer-core)
 *
 * Desktop, PHONE=1 and CALM=1 are three sequential runs; never run more than two
 * headless Chromes at once.
 *
 * Fails (exit 1) on any pageerror, console error, request outside the allowed
 * list, speech through a non-local voice, anything left in localStorage,
 * sessionStorage or document.cookie, or any assertion below. Over file:// the
 * one console error ignored is Chrome's complaint about the site-wide
 * <link rel="manifest" href="/manifest.json">, which resolves to file:///C:/manifest.json.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');

const ROOT = process.env.ROOT || path.resolve(__dirname, '..', '..');
const PUPPETEER = process.env.PUPPETEER || 'C:/Users/shrik/AppData/Local/Temp/pimw-puppeteer/node_modules/puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PHONE = !!process.env.PHONE;
const CALM = !!process.env.CALM;
const SHOTS = process.env.SHOTS || '';
const FAIL_SHOTS = SHOTS || path.join(os.tmpdir(), 'pimw-chart-detective-e2e');
const ALLOW = (process.env.ALLOW || 'https://playitmyway.com/').split(',').map((s) => s.trim()).filter(Boolean);
const URL_BASE = process.env.URL || pathToFileURL(path.join(ROOT, 'games', 'chart-detective', 'index.html')).href;
const TAG = PHONE ? 'phone' : CALM ? 'calm' : 'desktop';
const SEED = 3;
const QUICK = 8000;      // synchronous DOM changes after a key or tap
const SLOW = 20000;      // timers: the next question after a right answer, the first arrival

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (v) => (v === null || v === undefined ? '(none)' : JSON.stringify(v));

let browser = null;
let page = null;
let where = 'launch';

async function main() {
  let puppeteer;
  try { puppeteer = require(PUPPETEER); } catch (e) { throw new Error('puppeteer-core not found at ' + PUPPETEER + ' (set PUPPETEER=<path>): ' + e.message); }
  let CD;
  const modPath = path.join(ROOT, 'games', 'chart-detective', 'charts.js');
  try { CD = require(modPath); } catch (e) { throw new Error('cannot load ' + modPath + ' (set ROOT=<repo root>): ' + e.message); }
  if (!fs.existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME);
  fs.mkdirSync(FAIL_SHOTS, { recursive: true });

  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  page = await browser.newPage();
  if (PHONE) await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  if (CALM) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);

  // A speechSynthesis stub with an online default voice and a local one; the
  // shared voice keeps only localService === true, so every utterance must
  // name 'Local'. Own properties, because the real ones are prototype
  // accessors that ignore plain assignment.
  await page.evaluateOnNewDocument(() => {
    const voices = [
      { name: 'Cloud', lang: 'en-US', localService: false, default: true, voiceURI: 'Cloud' },
      { name: 'Local', lang: 'en-GB', localService: true, default: false, voiceURI: 'Local' },
    ];
    window.__spoken = [];
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices: () => voices.slice(),
      speak: (u) => { window.__spoken.push({ text: u && u.text, voice: u && u.voice ? u.voice.name : null }); },
      cancel: () => {}, pause: () => {}, resume: () => {}, addEventListener: () => {}, removeEventListener: () => {}, onvoiceschanged: null,
    };
    function Utterance(text) { this.text = text || ''; this.voice = null; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
    // every click the page receives, for the failure report
    window.__clicks = [];
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? (e.target.closest('button, a') || e.target) : e.target;
      window.__clicks.push({ x: e.clientX, y: e.clientY, scrollY: window.scrollY, target: t ? (t.id ? '#' + t.id : t.tagName + '.' + t.className) : '?' });
    }, true);
  });

  const origin = new URL(URL_BASE).origin;          // 'null' over file://
  const problems = [];
  const foreign = [];
  const allowed = (u) => (origin !== 'null' && u.startsWith(origin)) || u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || ALLOW.some((a) => u.startsWith(a));
  page.on('pageerror', (e) => problems.push('pageerror: ' + (e && e.message ? e.message : String(e))));
  page.on('error', (e) => problems.push('page crashed: ' + (e && e.message ? e.message : String(e))));
  const fileNoise = (m) => {
    if (origin !== 'null') return false;
    const loc = m.location ? m.location() : null;
    const s = m.text() + ' ' + ((loc && loc.url) || '');
    return /manifest\.json|apple-touch-icon\.png/.test(s);
  };
  page.on('console', (m) => { if (m.type() === 'error' && !fileNoise(m)) problems.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!allowed(u)) foreign.push(u); });

  // ---- helpers ----------------------------------------------------------
  const text = (sel) => page.$eval(sel, (e) => (e.textContent || '').trim()).catch(() => null);
  const visible = (sel) => page.$eval(sel, (e) => { if (e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).catch(() => false);
  const state = () => page.evaluate(() => (window.cdTest ? window.cdTest.state() : null));
  const pageRound = () => page.evaluate(() => (window.cdTest ? window.cdTest.round() : null));
  async function until(fn, ms, what) {
    const t0 = Date.now();
    let lastErr = '';
    for (;;) {
      let ok = false;
      try { ok = await fn(); lastErr = ''; } catch (e) { lastErr = e && e.message ? e.message : String(e); }
      if (ok) return;
      if (Date.now() - t0 > ms) {
        const s = await state();
        throw new Error(`timed out after ${ms} ms waiting for ${what} [tell: ${show(await text('#tell'))}, state: ${show(s)}${lastErr ? ', last error: ' + lastErr : ''}]`);
      }
      await sleep(80);
    }
  }
  const phaseIs = (p) => async () => ((await state()) || {}).phase === p;
  const qiIs = (n) => async () => { const s = await state(); return !!s && s.phase === 'ask' && s.qi === n; };
  async function shot(name) {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `chart-detective-${TAG}-${name}.png`) });
  }
  // the page jumps to the title or the chart as a case starts or closes; a tap
  // aimed before the jump lands on whatever moved under it, so wait until the
  // scroll position has held still for three readings
  async function settle() {
    let last = await page.evaluate(() => window.scrollY);
    let still = 0;
    for (let i = 0; i < 60 && still < 3; i++) {
      await sleep(100);
      const y = await page.evaluate(() => window.scrollY);
      still = y === last ? still + 1 : 0;
      last = y;
    }
  }
  // Brings a button to the middle of the screen (away from the site's fixed
  // corner buttons), then names what is really under its centre, so a tap
  // that would land elsewhere fails with the culprit instead of a mystery.
  async function covered(sel) {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'missing';
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit) return 'off screen at ' + Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2);
      return el === hit || el.contains(hit) ? '' : (hit.id ? '#' + hit.id : hit.tagName + '.' + hit.className) + ' covers it at ' + Math.round(r.top + r.height / 2) + 'px';
    }, sel);
  }
  const push = async (sel) => {
    await settle();
    const c = await covered(sel);
    assert.equal(c, '', `${where}: ${sel} cannot be tapped: ${c}`);
    if (PHONE) await page.tap(sel); else await page.click(sel);
  };
  const eq = (got, want, what) => assert.equal(got, want, `${where}: ${what}`);
  const colSel = (i) => `#chart button.col[data-i="${i}"]`;
  // a column: the number key on a keyboard, a tap on a phone
  async function pressCol(i) { if (PHONE) { await settle(); await page.tap(colSel(i)); } else await page.keyboard.press(String(i + 1)); }
  async function chip(choice) { await push(`#chips .chip[data-choice="${choice}"]`); }
  async function answerRight(round, qi) {
    const q = round.questions[qi];
    if (q.kind === 'category') await pressCol(round.categories.findIndex((c) => c.id === q.answer));
    else await chip(q.answer);
  }
  // Nothing may be wider than the viewport: a phone zooms the whole page out
  // to fit the widest element, and every tap then lands somewhere else.
  async function expectNoOverflow() {
    const r = await page.evaluate(() => {
      const w = document.documentElement.scrollWidth;
      if (w <= window.innerWidth && window.innerWidth === (window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth)) return '';
      let widest = null;
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && (!widest || b.right > widest.right)) widest = { right: b.right, name: el.id ? '#' + el.id : el.tagName + '.' + el.className };
      }
      return `the page is ${w}px wide in a ${window.innerWidth}px viewport (widest: ${widest ? widest.name + ' to ' + Math.round(widest.right) + 'px' : 'none'})`;
    });
    assert.equal(r, '', `${where}: ${r}`);
  }
  async function expectRound(stage, seed, caseIndex) {
    const want = CD.generateRound(stage, seed, caseIndex);
    const got = await pageRound();
    assert.deepEqual(got, JSON.parse(JSON.stringify(want)), `${where}: the page's case differs from charts.js for stage ${stage} seed ${seed} case ${caseIndex}`);
    await expectNoOverflow();
    return want;
  }
  async function collectAll(round, wrongAt) {
    for (let k = 0; k < round.arrivals.length; k++) {
      const want = round.arrivals[k];
      await until(async () => ((await state()) || {}).arrival === k && (await text('#spotCount')) === `${k + 1} of ${round.arrivals.length}`, SLOW, `arrival ${k} in the spotlight`);
      if (k === wrongAt) {
        const other = (want + 1) % round.counts.length;
        await pressCol(other);
        await until(async () => /^That's the /.test((await text('#tell')) || ''), QUICK, 'the wrong-column message');
        const slot = round.chart === 'tally' ? 'row' : 'column';
        eq(await text('#tell'), `That's the ${round.categories[other].name} ${slot}. Find the ${round.categories[want].name} ${slot}.`, 'the wrong-column message');
        eq(((await state()) || {}).arrival, k, 'a wrong column places nothing');
      }
      await pressCol(want);
      await until(async () => { const s = await state(); return !!s && (s.arrival === k + 1 || s.phase === 'ask'); }, QUICK, `placing arrival ${k}`);
    }
    // the hidden table carries the finished counts
    const rows = await page.$$eval('#srBody tr', (trs) => trs.map((tr) => tr.textContent.trim()));
    for (let i = 0; i < round.counts.length; i++) assert.ok(rows[i].endsWith(String(round.counts[i])), `${where}: hidden table row ${i} is ${rows[i]}`);
  }
  async function answerAllRight(round, from) {
    for (let qi = from || 0; qi < round.questions.length; qi++) {
      await until(qiIs(qi), SLOW, `question ${qi}`);
      eq(await text('#tell'), round.questions[qi].text, `question ${qi} text`);
      await answerRight(round, qi);
      await until(async () => ((await state()) || {}).phase === 'right', QUICK, `question ${qi} marked right`);
      eq(await text('#tell'), 'Yes! ' + round.questions[qi].finding, `question ${qi} finding`);
    }
    await until(phaseIs('done'), SLOW, 'case closed');
  }
  async function expectDone(round, helped, nextStage) {
    const items = await page.$$eval('#findings li', (lis) => lis.map((li) => ({ text: li.textContent.trim(), helped: li.classList.contains('helped') })));
    assert.deepEqual(items.map((i) => i.text), round.questions.map((q) => q.finding), `${where}: the findings`);
    assert.deepEqual(items.map((i) => i.helped), round.questions.map((_, i) => helped.includes(i)), `${where}: which findings needed help`);
    eq(await visible('#nextStageBtn'), nextStage, 'Next stage shown');
    eq(await visible('#nextCaseBtn'), true, 'Next case shown');
    eq(await page.evaluate(() => document.activeElement && document.activeElement.id), 'doneHead', 'focus on the case-closed heading');
    await expectNoOverflow();
  }

  // ---- load --------------------------------------------------------------
  where = 'load';
  await page.goto(URL_BASE + '?stage=1&seed=' + SEED, { waitUntil: 'load', timeout: 180000 });
  await until(async () => !!(await state()), QUICK, 'the page script');
  eq(await visible('#pickView'), false, 'the start screen is skipped with ?stage=');
  eq(await page.$eval('#sprite', (s) => s.querySelectorAll('symbol').length), 30, 'thirty glyph symbols');

  // ---- case 1: stage 1, a wrong tap, the first question wrong twice ------
  where = 'case 1 collect';
  let round = await expectRound(1, SEED, 0);
  eq(round.collect, true, 'stage 1 collects');
  await until(phaseIs('collect'), QUICK, 'the collecting phase');
  await until(async () => (await text('#spotCount')) === `1 of ${round.arrivals.length}`, SLOW, 'the first arrival');
  eq(await visible('#spot'), true, 'the spotlight shows the first arrival');
  await shot('collecting');
  await collectAll(round, 2);
  where = 'case 1 questions';
  await until(qiIs(0), SLOW, 'question 0');
  const q0 = round.questions[0];
  eq(q0.kind, 'number', 'stage 1 opens with how many');
  const wrongs = q0.options.filter((o) => String(o) !== String(q0.answer));
  await chip(wrongs[0]);
  await until(async () => ((await state()) || {}).attempts === 1, QUICK, 'the first wrong answer');
  eq(await text('#tell'), CD.check(round, 0, wrongs[0]).hint, 'the hint after one wrong answer');
  eq(await page.$eval(`#chips .chip[data-choice="${wrongs[0]}"]`, (b) => b.disabled && b.classList.contains('is-wrong')), true, 'the wrong chip is struck out');
  await chip(wrongs[1]);
  await until(phaseIs('worked'), QUICK, 'the worked answer');
  eq(await text('#tell'), q0.explanation, 'the worked answer after two wrong answers');
  eq(await page.$eval(colSel(q0.targets[0]), (b) => b.classList.contains('lit')), true, 'the column the answer is about is lit');
  eq(await page.$eval(`#chips .chip[data-choice="${q0.answer}"]`, (b) => b.classList.contains('is-right')), true, 'the right chip is shown');
  await shot('worked-answer');
  await push('#nextQBtn');
  await answerAllRight(round, 1);
  where = 'case 1 closed';
  await expectDone(round, [0], false);
  await shot('case-closed');
  // say it again speaks the last line once more
  const before = await page.evaluate(() => window.__spoken.length);
  await push('#sayBtn');
  eq(await page.evaluate(() => window.__spoken.length), before + 1, 'Say it again speaks once');
  await push('#nextCaseBtn');

  // ---- case 2: stage 1 again, all right first time -----------------------
  where = 'case 2';
  await until(phaseIs('collect'), SLOW, 'the second case');
  round = await expectRound(1, SEED + 1, 1);
  await collectAll(round, -1);
  await answerAllRight(round, 0);
  await expectDone(round, [], true);
  await push('#nextStageBtn');

  // ---- cases 3 to 6: stages 2 to 5 up the ladder -------------------------
  for (let stage = 2; stage <= 5; stage++) {
    where = `case ${stage + 1} (stage ${stage})`;
    const seed = SEED + stage;
    await until(async () => { const s = await state(); return !!s && s.stage === stage && (s.phase === 'collect' || s.phase === 'ask'); }, SLOW, `stage ${stage} to start`);
    round = await expectRound(stage, seed, 0);
    eq(await page.$eval('#chart', (c) => c.className), stage === 2 ? 'chart cols' : stage === 3 ? 'chart cols' : stage === 4 ? 'chart bars' : 'chart', 'the chart kind');
    if (round.collect) await collectAll(round, -1);
    else eq(await visible('#spot'), false, 'no spotlight when the chart is given');
    if (stage === 3) eq(await text('#chartKey'), `Key:= ${round.key}`, 'the key line');
    if (stage === 5) eq(await page.$$eval('#chart td.hidden-cell', (t) => t.length), 1, 'one hidden cell');
    await answerAllRight(round, 0);
    await expectDone(round, [], stage < 5);
    if (stage < 5) await push('#nextStageBtn');
  }

  // ---- back to the start screen -------------------------------------------
  where = 'all cases';
  await push('#casesBtn');
  await until(phaseIs('pick'), QUICK, 'the start screen');
  eq(await visible('#pickView'), true, 'the start screen is back');
  eq(await page.$$eval('#stages .stage-btn', (b) => b.length), 5, 'five stage buttons');

  // ---- the house rules -----------------------------------------------------
  where = 'final checks';
  const stored = await page.evaluate(() => {
    let a = 0, b = 0, c = '';
    try { a = localStorage.length; } catch (e) { a = 0; }
    try { b = sessionStorage.length; } catch (e) { b = 0; }
    try { c = document.cookie; } catch (e) { c = ''; }
    return [a, b, c];
  });
  assert.deepEqual(stored, [0, 0, ''], `${where}: [localStorage.length, sessionStorage.length, document.cookie]`);
  const spoken = await page.evaluate(() => window.__spoken || []);
  assert.ok(spoken.length >= 20, `${where}: too little was spoken (${spoken.length})`);
  assert.deepEqual(spoken.filter((u) => u.voice !== 'Local'), [], `${where}: every utterance must use the local voice`);
  assert.deepEqual(foreign, [], `${where}: requests outside the allowed list (own origin, file:, data:, blob:, ${ALLOW.join(', ')})`);
  assert.deepEqual(problems, [], `${where}: page errors or console errors`);

  console.log(`E2E PASS chart-detective (${TAG}; 6 cases, stages 1-5; ${spoken.length} utterances, all local; ${foreign.length} foreign requests; ${problems.length} errors; ${URL_BASE})`);
  await browser.close();
  browser = null;
}

main().then(() => process.exit(0)).catch(async (e) => {
  console.error('E2E FAIL [' + TAG + ', ' + where + ']: ' + (e && e.message ? e.message : String(e)));
  if (page) {
    try {
      const clicks = await page.evaluate(() => (window.__clicks || []).slice(-4));
      console.error('last clicks the page received: ' + JSON.stringify(clicks));
    } catch (e4) { /* the page may be gone */ }
    try {
      fs.mkdirSync(FAIL_SHOTS, { recursive: true });
      const file = path.join(FAIL_SHOTS, `chart-detective-${TAG}-FAIL-${where.replace(/[^A-Za-z0-9]+/g, '-')}.png`);
      await page.screenshot({ path: file });
      console.error('failure screenshot: ' + file);
    } catch (e2) { console.error('(no failure screenshot: ' + (e2 && e2.message ? e2.message : e2) + ')'); }
  }
  try { if (browser) await browser.close(); } catch (e3) { /* already gone */ }
  process.exit(1);
});
```

- [ ] **Step 2: Desktop**

Run: `node docs/e2e/chart-detective.e2e.cjs`
Expected (about two minutes): `E2E PASS chart-detective (desktop; 6 cases, stages 1-5; 114 utterances, all local; 0 foreign requests; 0 errors; file:///...)`.

- [ ] **Step 3: Phone**

Run: `PHONE=1 SHOTS=<your scratchpad>/shots node docs/e2e/chart-detective.e2e.cjs` (in PowerShell: `$env:PHONE='1'; $env:SHOTS='...'; node docs/e2e/chart-detective.e2e.cjs; Remove-Item Env:PHONE,Env:SHOTS`)
Expected: `E2E PASS chart-detective (phone; ...)`, and three screenshots in the shots folder: `chart-detective-phone-collecting.png`, `-worked-answer.png` (the crab row lit, the right chip green, the struck-out wrong chips, a "Next →" button) and `-case-closed.png` (the findings list with a dot for the helped one and ticks for the rest).

- [ ] **Step 4: Reduced motion**

Run: `CALM=1 node docs/e2e/chart-detective.e2e.cjs`
Expected: `E2E PASS chart-detective (calm; ...)`.

- [ ] **Step 5: Commit**

```bash
git add docs/e2e/chart-detective.e2e.cjs
git commit -m "test(chart-detective): end-to-end player: six cases up the stage ladder, the hint ladder, the house rules, on desktop, phone and reduced motion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Record the amendments and hand over

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-chart-detective-design.md`

- [ ] **Step 1: Add the amendments to the spec**

Append this section to the end of the spec:

```markdown
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
```

- [ ] **Step 2: Run everything once more**

Run: `node --test docs/tests/*.test.js`
Expected: every file reports `fail 0`.

Run: `node docs/e2e/chart-detective.e2e.cjs`
Expected: `E2E PASS chart-detective (desktop; ...)`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-19-chart-detective-design.md
git commit -m "docs(chart-detective): what changed while building, and why

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand over**

Use the superpowers:finishing-a-development-branch skill. The branch merges fast-forward onto `main` (the other sessions have been adding games to `main`; if `docs/catalogue.js`, `index.html` or `sitemap.xml` conflict, keep both games' lines and re-run `node docs/build-pages.js` before committing the merge). **Do not push.** Pushing `main` deploys the site; Vikrant says when. After it is live, the player runs against the site with `URL=https://playitmyway.com/games/chart-detective/ ALLOW=https://playitmyway.com/,https://static.cloudflareinsights.com/`.
