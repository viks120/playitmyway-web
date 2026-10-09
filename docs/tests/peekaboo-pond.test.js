/* Peekaboo Pond tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/peekaboo-pond/rounds.js and check every plan
 * against the spec, re-simulating each shuffle independently. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Rounds = require(path.join(__dirname, '..', '..', 'games', 'peekaboo-pond', 'rounds.js'));

const TABLE = [
  // flowers, swaps, swap time, neighbours only
  [2, 0, 0, true], [3, 0, 0, true], [3, 1, 1.0, true], [3, 2, 1.0, true],
  [3, 3, 0.8, true], [4, 2, 0.8, false], [4, 3, 0.8, false], [4, 4, 0.62, false],
];

test('eight levels, as the spec table says', () => {
  assert.deepEqual(Rounds.LEVELS.map((l) => [l.buds, l.swaps, l.swapTime, l.near]), TABLE);
});

test('every level: 1,000 seeds × 6 rounds keep every promise', () => {
  TABLE.forEach(([buds, swaps, swapTime, near], level) => {
    for (let seed = 1; seed <= 1000; seed++) {
      for (let round = 0; round < 6; round++) {
        const p = Rounds.plan(seed, round, level);
        const where = `level ${level} seed ${seed} round ${round}`;
        assert.equal(p.buds, buds, where);
        assert.equal(p.swaps.length, swaps, where);
        assert.equal(p.swapTime, swapTime, where);
        assert.equal(p.hider, round % 4, where);
        assert.ok(Number.isInteger(p.start) && p.start >= 0 && p.start < buds, where);
        let at = p.start;
        let moved = 0;
        p.swaps.forEach(([i, j], k) => {
          assert.ok(i !== j && i >= 0 && j >= 0 && i < buds && j < buds, `${where}: bad swap ${i},${j}`);
          if (near) assert.equal(Math.abs(i - j), 1, `${where}: ${i},${j} are not neighbours`);
          if (k > 0) {
            const [a, b] = p.swaps[k - 1];
            assert.ok(!((a === i && b === j) || (a === j && b === i)), `${where}: swap ${k} undoes the one before`);
          }
          if (at === i) {
            at = j;
            moved++;
          } else if (at === j) {
            at = i;
            moved++;
          }
        });
        assert.equal(p.answer, at, `${where}: wrong answer`);
        assert.ok(moved >= Math.ceil(swaps / 2), `${where}: the hidden flower moved only ${moved} times`);
      }
    }
  });
});

test('difficulty adapts: up on a first-tap find, steady on the second, down after that', () => {
  assert.equal(Rounds.nextLevel(0, 1), 1);
  assert.equal(Rounds.nextLevel(7, 1), 7);
  assert.equal(Rounds.nextLevel(3, 2), 3);
  assert.equal(Rounds.nextLevel(3, 3), 2);
  assert.equal(Rounds.nextLevel(5, 4), 4);
  assert.equal(Rounds.nextLevel(0, 3), 0);
});

test('the same seed always plans the same round, and seeds vary', () => {
  assert.deepEqual(Rounds.plan(7, 3, 6), Rounds.plan(7, 3, 6));
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) seen.add(JSON.stringify(Rounds.plan(seed, 0, 7).swaps));
  assert.ok(seen.size > 100, `only ${seen.size} different shuffles in 200 seeds`);
});

test('every message uses the exact wording from the spec', () => {
  const S = Rounds.say;
  assert.equal(S.hiding('Clover'), 'Clover is hiding! Watch the flowers.');
  assert.equal(S.moving(), 'The flowers are moving…');
  assert.equal(S.seek('Clover'), "Where's Clover? Tap a flower.");
  assert.equal(S.found('Clover', 1), 'Peekaboo! You found Clover!');
  assert.equal(S.found('Clover', 2), "Peekaboo! There's Clover!");
  assert.equal(S.miss('goldfish', false), 'Not here! Just a little goldfish. Try another flower.');
  assert.equal(S.miss('ladybug', true), 'Not here! Just a sleepy ladybug. Look, that flower is wiggling!');
  assert.equal(S.party(), 'Five friends found! Party time!');
  assert.equal(S.focus(1, 3), 'Flower 2 of 3');
  assert.equal(S.progress(2), '2 of 5 friends found');
  assert.deepEqual(Rounds.SURPRISE_ORDER, ['goldfish', 'ladybug']);
});
