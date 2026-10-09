/* Pond Prix tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/pond-prix/race.js and check every race plan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Race = require(path.join(__dirname, '..', '..', 'games', 'pond-prix', 'race.js'));
const SUMS = ['count', 'add10', 'mix20', 'times'];

test('five cups, the warm-up first, and nine gates a race', () => {
  assert.deepEqual(Race.CUPS.map((c) => c.id), ['warmup', 'count', 'add10', 'mix20', 'times']);
  assert.equal(Race.LAPS, 3);
  assert.equal(Race.GATES, 9);
  assert.deepEqual(Race.plan(1, 'warmup').questions, []);
  assert.throws(() => Race.plan(1, 'nope'));
});

test('every question, 1,000 seeds per cup, offers three different answers with the right one in its lane', () => {
  const lanesUsed = new Set();
  for (const cup of SUMS) {
    for (let seed = 1; seed <= 1000; seed++) {
      const { questions } = Race.plan(seed, cup);
      assert.equal(questions.length, 9);
      questions.forEach((q, k) => {
        const where = `${cup} seed ${seed} gate ${k}`;
        assert.equal(q.choices.length, 3, where);
        assert.equal(new Set(q.choices).size, 3, `${where}: answers repeat ${q.choices}`);
        assert.equal(q.choices[q.correct], q.answer, where);
        assert.ok(q.choices.every((c) => Number.isInteger(c) && c >= (cup === 'count' ? 1 : 0)), `${where}: ${q.choices}`);
        lanesUsed.add(q.correct);
        if (k > 0) assert.notEqual(q.sum || q.answer, questions[k - 1].sum || questions[k - 1].answer, `${where}: same as the gate before`);
        if (cup === 'count') {
          assert.equal(q.sum, null);
          assert.ok(q.answer >= 2 && q.answer <= 10, where);
          return;
        }
        const m = /^(\d+) ([+−×]) (\d+)$/.exec(q.sum);
        assert.ok(m, `${where}: ${q.sum}`);
        const a = +m[1], b = +m[3];
        const value = m[2] === '+' ? a + b : m[2] === '−' ? a - b : a * b;
        assert.equal(q.answer, value, where);
        if (cup === 'add10') assert.ok(m[2] === '+' && a >= 1 && b >= 1 && value <= 10, where);
        if (cup === 'mix20') assert.ok(m[2] !== '×' && value >= 1 && value <= 20 && a <= 20, where);
        if (cup === 'times') assert.ok(m[2] === '×' && [2, 3, 4, 5, 10].includes(a) && b >= 1 && b <= 10, where);
      });
      const sums = questions.map((q) => q.sum).filter(Boolean);
      assert.equal(new Set(sums).size, sums.length, `${cup} seed ${seed}: a sum repeats`);
    }
  }
  assert.deepEqual([...lanesUsed].sort(), [0, 1, 2]);
});

test('the same seed always plans the same race, and seeds vary', () => {
  assert.deepEqual(Race.plan(9, 'times'), Race.plan(9, 'times'));
  const seen = new Set();
  for (let seed = 1; seed <= 100; seed++) seen.add(JSON.stringify(Race.plan(seed, 'add10').questions));
  assert.equal(seen.size, 100);
});

test('the track: gates and pads sit inside a lap, in real lanes, never on top of each other', () => {
  const { gates, pads } = Race.TRACK;
  assert.deepEqual(gates, [...gates].sort((x, y) => x - y));
  for (const g of gates) assert.ok(g > 0.1 && g < 0.95);
  for (const p of pads) {
    assert.ok([0, 1, 2].includes(p.lane) && ['boost', 'mud'].includes(p.kind));
    assert.ok(p.at > 0.05 && p.at < 0.95, `pad at ${p.at} is too near the start line`);
    for (const g of gates) assert.ok(Math.abs(p.at - g) >= 0.05, `pad at ${p.at} is too near the gate at ${g}`);
  }
  assert.equal(Race.gateAt(0, 100), gates[0] * 100);
  assert.equal(Race.gateAt(4, 100), 100 + gates[1] * 100);
  assert.equal(Race.gateAt(8, 100), 200 + gates[2] * 100);
});

test('places and their names', () => {
  assert.equal(Race.place(50, [10, 20, 30]), 1);
  assert.equal(Race.place(50, [60, 20, 70]), 3);
  assert.equal(Race.place(50, [50, 20, 30]), 1);
  assert.deepEqual([1, 2, 3, 4].map(Race.ordinal), ['1st', '2nd', '3rd', '4th']);
});

test('every message, word for word', () => {
  const S = Race.say;
  const sum = { sum: '3 + 4', answer: 7, choices: [6, 7, 9], correct: 1 };
  const fish = { sum: null, answer: 4, choices: [4, 5, 3], correct: 0 };
  assert.equal(S.board(sum), '3 + 4 = ?');
  assert.equal(S.board(fish), '🐟🐟🐟🐟 ?');
  assert.equal(S.question(sum), '3 + 4 = ? Left 6, middle 7, right 9.');
  assert.equal(S.question(fish), 'How many fish? 🐟🐟🐟🐟. Left 4, middle 5, right 3.');
  assert.equal(S.right(sum), 'Boost! 3 + 4 = 7.');
  assert.equal(S.right(fish), 'Boost! 4 fish.');
  assert.equal(S.wrong(sum, 9), 'Splash! 3 + 4 = 7, not 9.');
  assert.equal(S.wrong(fish, 5), 'Splash! 4 fish, not 5.');
  assert.equal(S.lane(0), 'Left lane');
  assert.equal(S.lane(2), 'Right lane');
  assert.equal(S.lap(2), 'Lap 2 of 3');
  assert.equal(S.lap(3), 'Last lap!');
  assert.equal(S.finish(2), 'You came 2nd!');
  assert.equal(S.score(7, 9), '7 of 9 answers right.');
  assert.equal(S.warmDone(), 'Great driving!');
});
