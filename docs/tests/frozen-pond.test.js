/* Frozen Pond tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/frozen-pond/frozen.js and prove every level
 * can be finished, getting harder group by group. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const F = require(path.join(__dirname, '..', '..', 'games', 'frozen-pond', 'frozen.js'));

test('18 levels in three groups of six, each with a start, a fish and a closed bank', () => {
  assert.equal(F.LEVELS.length, 18);
  assert.deepEqual(F.GROUPS.map((g) => [g.from, g.to]), [[0, 6], [6, 12], [12, 18]]);
  F.LEVELS.forEach((rows, i) => {
    const lv = F.parse(rows);
    assert.ok(rows.every((r) => r.length === lv.w), `level ${i + 1} has a ragged row`);
    assert.ok(lv.start >= 0 && lv.goal >= 0 && lv.start !== lv.goal, `level ${i + 1}`);
    assert.ok(lv.snow[lv.start], `level ${i + 1} should start on snow`);
    for (let x = 0; x < lv.w; x++) assert.ok(lv.rock[x] && lv.rock[(lv.h - 1) * lv.w + x], `level ${i + 1} open bank`);
    for (let y = 0; y < lv.h; y++) assert.ok(lv.rock[y * lv.w] && lv.rock[y * lv.w + lv.w - 1], `level ${i + 1} open bank`);
  });
});

test('every level can be finished; the groups get harder; replaying the path reaches the fish', () => {
  const ranges = [[1, 4], [5, 7], [8, 12]];
  F.LEVELS.forEach((rows, i) => {
    const lv = F.parse(rows);
    const sol = F.solve(lv);
    assert.ok(sol, `level ${i + 1} cannot be finished`);
    const [lo, hi] = ranges[Math.floor(i / 6)];
    assert.ok(sol.moves >= lo && sol.moves <= hi, `level ${i + 1} takes ${sol.moves} slides, outside ${lo}-${hi}`);
    let at = lv.start;
    for (const dir of sol.path) at = F.slide(lv, at, dir).to;
    assert.equal(at, lv.goal, `level ${i + 1}: the path misses the fish`);
  });
  assert.deepEqual(F.LEVELS.slice(0, 2).map((r) => F.solve(F.parse(r)).moves), [1, 2]);
});

test('sliding: ice carries you to the next rock, snow and the fish stop you, a rock next to you means no move', () => {
  const lv = F.parse(['########', '#@  : F#', '#  #   #', '########']);
  const right = F.slide(lv, lv.start, 'right');
  assert.equal(right.to, 1 * 8 + 4, 'snow stops the slide');
  assert.deepEqual(right.path, [10, 11, 12]);
  assert.equal(F.slide(lv, right.to, 'right').to, lv.goal, 'arriving at the fish stops you');
  assert.equal(F.slide(lv, lv.start, 'up').path.length, 0, 'the bank is right there');
  const down = F.slide(lv, 1 * 8 + 2, 'down');
  assert.equal(down.to, 2 * 8 + 2, 'the bank stops you after one square');
  const blocked = F.parse(['#####', '#@#F#', '#   #', '#####']);
  assert.equal(F.slide(blocked, blocked.start, 'right').path.length, 0);
});

test('the solver says when the fish can no longer be reached', () => {
  // from the bottom-right corner nothing can lead back: right and down are banks, left and up slide into dead ends
  const lv = F.parse(['######', '#@ #F#', '#:#  #', '#    #', '######']);
  assert.ok(F.solve(lv));
  assert.equal(F.solve(F.parse(['#####', '#@# #', '###F#', '#####'])), null);
});

test('every message, word for word', () => {
  assert.equal(F.say.start(1, 1), 'Level 1. Slide to the fish! It can be done in 1 slide.');
  assert.equal(F.say.start(4, 3), 'Level 4. Slide to the fish! It can be done in 3 slides.');
  assert.equal(F.say.done(4, 3, 3), 'Level 4 done in 3 slides! The fewest possible!');
  assert.equal(F.say.done(4, 5, 3), 'Level 4 done in 5 slides! It can be done in 3.');
  assert.equal(F.say.hint('up'), 'Try sliding up.');
  assert.equal(F.say.moves(1), '1 slide');
});
