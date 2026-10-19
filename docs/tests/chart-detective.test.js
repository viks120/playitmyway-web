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
