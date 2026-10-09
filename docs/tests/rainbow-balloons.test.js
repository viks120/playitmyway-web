/* Rainbow Balloons tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/rainbow-balloons/balloons.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const B = require(path.join(__dirname, '..', '..', 'games', 'rainbow-balloons', 'balloons.js'));

test('six colours, red and blue first; five levels from 2 balloons to 4', () => {
  assert.deepEqual(B.COLOURS.map((c) => c.id), ['red', 'blue', 'yellow', 'green', 'orange', 'purple']);
  assert.deepEqual(B.LEVELS.map((l) => [l.balloons, l.colours]), [[2, 2], [2, 3], [3, 4], [3, 6], [4, 6]]);
});

test('every round, 1,000 seeds × 30 rounds × each level: different colours, the target among them, no repeats', () => {
  B.LEVELS.forEach((L, level) => {
    const inPlay = B.COLOURS.slice(0, L.colours).map((c) => c.id);
    for (let seed = 1; seed <= 1000; seed++) {
      let prev = null;
      for (let n = 0; n < 30; n++) {
        const r = B.round(seed, n, level, prev);
        const where = `level ${level} seed ${seed} round ${n}`;
        assert.equal(r.balloons.length, L.balloons, where);
        assert.equal(new Set(r.balloons).size, L.balloons, `${where}: a colour repeats`);
        assert.ok(r.balloons.includes(r.target), where);
        assert.ok(r.balloons.every((c) => inPlay.includes(c)), `${where}: a colour not yet in play`);
        assert.notEqual(r.target, prev, `${where}: the same target twice in a row`);
        prev = r.target;
      }
    }
  });
});

test('every colour gets asked for, and the target moves around', () => {
  const asked = new Set();
  const slots = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const r = B.round(seed, 0, 4, null);
    asked.add(r.target);
    slots.add(r.balloons.indexOf(r.target));
  }
  assert.equal(asked.size, 6);
  assert.deepEqual([...slots].sort(), [0, 1, 2, 3]);
  assert.deepEqual(B.round(9, 4, 2, 'red'), B.round(9, 4, 2, 'red'));
});

test('the level adapts: up on a first-tap pop, steady on the second, down after that', () => {
  assert.equal(B.nextLevel(0, 1), 1);
  assert.equal(B.nextLevel(4, 1), 4);
  assert.equal(B.nextLevel(2, 2), 2);
  assert.equal(B.nextLevel(2, 3), 1);
  assert.equal(B.nextLevel(0, 5), 0);
});

test('every message, word for word', () => {
  assert.equal(B.say.ask('red'), 'Pop the red balloon!');
  assert.equal(B.say.yes('red'), "Pop! That's red!");
  assert.equal(B.say.no('blue', 'red'), "That's blue. Find red!");
  assert.equal(B.say.party(), 'Five balloons! Hooray!');
  assert.equal(B.say.focus(1, 3, 'blue'), 'Balloon 2 of 3: blue');
  assert.equal(B.say.progress(2), '2 of 5 balloons popped');
});
