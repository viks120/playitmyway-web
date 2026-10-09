/* Pebble Push tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/pebble-push/pebbles.js and prove every level
 * can be finished, getting harder along the way. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const P = require(path.join(__dirname, '..', '..', 'games', 'pebble-push', 'pebbles.js'));

test('18 levels in three groups of six: one, two, then three pebbles', () => {
  assert.equal(P.LEVELS.length, 18);
  assert.deepEqual(P.GROUPS.map((g) => [g.from, g.to]), [[0, 6], [6, 12], [12, 18]]);
  P.LEVELS.forEach((rows, i) => {
    const s = P.parse(rows);
    const want = i < 6 ? 1 : i < 12 ? 2 : 3;
    assert.equal(s.pebbles.length, want, `level ${i + 1} pebbles`);
    assert.equal(s.goals.length, want, `level ${i + 1} flowers`);
    assert.ok(s.player >= 0, `level ${i + 1} has no critter`);
    assert.ok(!P.solved(s), `level ${i + 1} starts finished`);
    // the edge is all water, so nothing can walk or roll off the board
    for (let x = 0; x < s.w; x++) assert.ok(s.water[x] && s.water[(s.h - 1) * s.w + x], `level ${i + 1} open edge`);
    for (let y = 0; y < s.h; y++) assert.ok(s.water[y * s.w] && s.water[y * s.w + s.w - 1], `level ${i + 1} open edge`);
  });
});

test('every level can be finished, and replaying the solver path finishes it', () => {
  let lastGroup = -1;
  let lastMoves = 0;
  P.LEVELS.forEach((rows, i) => {
    const s0 = P.parse(rows);
    const sol = P.solve(s0);
    assert.ok(sol, `level ${i + 1} cannot be finished`);
    let s = s0;
    for (const dir of sol.path) {
      const r = P.step(s, dir);
      assert.ok(r, `level ${i + 1}: the path walks into water`);
      s = r.state;
    }
    assert.ok(P.solved(s), `level ${i + 1}: the path does not finish it`);
    assert.ok(sol.moves >= 3 && sol.moves <= 30, `level ${i + 1} takes ${sol.moves} moves`);
    const group = i < 6 ? 0 : i < 12 ? 1 : 2;
    if (group === lastGroup) assert.ok(sol.moves >= lastMoves - 4, `level ${i + 1} is much easier than the one before`);
    lastGroup = group;
    lastMoves = sol.moves;
  });
});

test('moving: water stops the critter, a pebble moves unless water or another pebble is behind it', () => {
  const s = P.parse(['######', '#@$ .#', '# $$ #', '######']);
  assert.equal(P.step(s, 'up'), null);
  assert.equal(P.step(s, 'left'), null);
  const r = P.step(s, 'right');
  assert.equal(r.pushed, 0);
  assert.equal(r.state.player, 8);
  assert.equal(r.state.pebbles[0], 9);
  const down = P.step(r.state, 'down');
  assert.equal(down, null, 'a pebble with another pebble behind it cannot move');
  assert.equal(P.step(P.parse(['#####', '#@$##', '#####']), 'right'), null, 'a pebble with water behind it cannot move');
});

test('a pebble wedged in a corner off its flower is stuck; on its flower it is not', () => {
  const s = P.parse(['#####', '#$  #', '# @.#', '#####']);
  assert.equal(P.stuck(s, 0), true);
  const t = P.parse(['#####', '#*  #', '# @ #', '#####']);
  assert.equal(P.stuck(t, 0), false);
  const u = P.parse(['#####', '# $ #', '# @.#', '#####']);
  assert.equal(P.stuck(u, 0), false);
  assert.equal(P.solve(s), null, 'a stuck pebble means no way to finish');
});

test('every message, word for word', () => {
  assert.equal(P.say.start(1, 1), 'Level 1. Push the pebble onto the flower.');
  assert.equal(P.say.start(8, 2), 'Level 8. Push the 2 pebbles onto the flowers.');
  assert.equal(P.say.onFlower(1, 2), 'Pebble on a flower! 1 of 2.');
  assert.equal(P.say.done(3, 7, 7), 'Level 3 done in 7 moves! The fewest possible!');
  assert.equal(P.say.done(3, 9, 7), 'Level 3 done in 9 moves!');
  assert.equal(P.say.hint('left'), 'Try going left.');
  assert.equal(P.say.moves(1), '1 move');
  assert.equal(P.say.moves(4), '4 moves');
});
