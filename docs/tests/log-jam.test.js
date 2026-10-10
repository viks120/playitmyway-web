/* Log Jam tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/log-jam/logjam.js and prove every level is a
 * proper board that can be finished in exactly its recorded fewest moves,
 * getting harder group by group. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const L = require(path.join(__dirname, '..', '..', 'games', 'log-jam', 'logjam.js'));

// replay a path of moves from the start, checking every one is legal
function replay(s0, pathOfMoves, label) {
  let s = s0;
  for (const m of pathOfMoves) {
    const next = L.slide(s, m.piece, m.dir, m.dist);
    assert.ok(next, `${label}: illegal move ${JSON.stringify(m)}`);
    s = next;
  }
  return s;
}

test('36 levels in four groups of nine: warm-up, medium, hard, expert', () => {
  assert.equal(L.LEVELS.length, 36);
  assert.deepEqual(L.GROUPS.map((g) => [g.title, g.from, g.to]),
    [['Warm-up', 0, 9], ['Medium', 9, 18], ['Hard', 18, 27], ['Expert', 27, 36]]);
});

test('every level is a proper 6 by 6 board with straight logs, no overlaps and the boat on the third row', () => {
  L.LEVELS.forEach((lv, i) => {
    assert.deepEqual(L.check(lv.rows), [], `level ${i + 1}`);
    const s = L.parse(lv.rows);
    assert.ok(L.grid(s), `level ${i + 1} has overlapping or stray pieces`);
    const boat = s.pieces[0];
    assert.deepEqual([boat.id, boat.len, boat.across, boat.line], ['B', 2, true, L.EXIT_ROW], `level ${i + 1} boat`);
    assert.ok(s.pieces.slice(1).every((p) => p.len === 2 || p.len === 3), `level ${i + 1} log lengths`);
    assert.ok(!L.solved(s), `level ${i + 1} starts already free`);
    // the parsed state draws back into exactly the same map
    const g = L.grid(s);
    const drawn = [];
    for (let y = 0; y < L.SIZE; y++) {
      let r = '';
      for (let x = 0; x < L.SIZE; x++) r += g[y * L.SIZE + x] < 0 ? '.' : s.pieces[g[y * L.SIZE + x]].id;
      drawn.push(r);
    }
    assert.deepEqual(drawn, lv.rows, `level ${i + 1} round trip`);
  });
  const all = new Set(L.LEVELS.map((lv) => lv.rows.join('/')));
  assert.equal(all.size, 36, 'every level is different');
});

test('every level can be finished in exactly its recorded fewest moves, and replaying the solution frees the boat', () => {
  L.LEVELS.forEach((lv, i) => {
    const s0 = L.parse(lv.rows);
    const sol = L.solve(s0);
    assert.ok(sol, `level ${i + 1} cannot be finished`);
    assert.equal(sol.moves, lv.best, `level ${i + 1}: recorded ${lv.best}, the solver says ${sol.moves}`);
    assert.equal(sol.path.length, sol.moves);
    const end = replay(s0, sol.path, `level ${i + 1}`);
    assert.ok(L.solved(end), `level ${i + 1}: the solution does not free the boat`);
    assert.equal(sol.path[sol.path.length - 1].piece, 0, `level ${i + 1}: the last move is the boat's`);
  });
});

test('difficulty rises: each group stays in its band of fewest moves and never gets easier', () => {
  const bands = [[2, 10], [11, 19], [20, 29], [30, 60]];
  let last = 0;
  L.GROUPS.forEach((g, k) => {
    const [lo, hi] = bands[k];
    for (let i = g.from; i < g.to; i++) {
      const best = L.LEVELS[i].best;
      assert.ok(best >= lo && best <= hi, `level ${i + 1} takes ${best} moves, outside ${g.title} (${lo} to ${hi})`);
      assert.ok(best >= last, `level ${i + 1} (${best}) is easier than level ${i} (${last})`);
      last = best;
    }
  });
  assert.equal(L.LEVELS[0].best, 2, 'the first level is a gentle start');
  const logs = (i) => L.parse(L.LEVELS[i].rows).pieces.length - 1;
  assert.ok(logs(0) <= 3, 'the first level has only a few logs');
});

test('sliding: across logs go left and right, along logs up and down, never through anything', () => {
  const s = L.parse([
    'a.....',
    'a..bbb',
    '.BB.c.',
    '....c.',
    'dd....',
    '......',
  ]);
  // pieces: 0 boat (row 3, columns 2-3), 1 a (column 1, rows 1-2), 2 b, 3 c, 4 d
  assert.deepEqual(s.pieces.map((p) => [p.id, p.len, p.across, p.line]),
    [['B', 2, true, 2], ['a', 2, false, 0], ['b', 3, true, 1], ['c', 2, false, 4], ['d', 2, true, 4]]);
  assert.deepEqual(s.pos, [1, 0, 3, 2, 0]);
  assert.equal(L.slide(s, 0, 'up'), null, 'the boat lies across: no up');
  assert.equal(L.slide(s, 1, 'left'), null, 'an along log: no left');
  assert.equal(L.slide(s, 1, 'up'), null, 'the bank is right there');
  assert.equal(L.slide(s, 0, 'right', 2), null, 'the log in column 5 is in the way');
  assert.equal(L.slide(s, 0, 'left', 2), null, 'only one square of room on the left');
  assert.equal(L.slide(s, 4, 'right', 0), null, 'a move goes somewhere');
  const r = L.room(s, 0);
  assert.deepEqual([r.back, r.fwd, r.backStop, r.fwdStop], [1, 1, -1, 3]);
  const down = L.slide(s, 3, 'down', 2);
  assert.deepEqual(down.pos, [1, 0, 3, 4, 0], 'any distance in one move');
  assert.deepEqual(s.pos, [1, 0, 3, 2, 0], 'the old state is left alone');
  assert.ok(L.clearWay(down) && !L.clearWay(s));
  const out = L.slide(down, 0, 'right', 3);
  assert.ok(out && L.solved(out), 'the boat reaches the gap');
  assert.equal(L.slide(s, 1, 'down', 3), null, 'the short log in row 5 stops the log in column 1');
  assert.deepEqual(L.slide(s, 1, 'down', 2).pos[1], 2);
});

test('every legal move can be slid straight back, and moves() lists exactly the legal ones', () => {
  const back = { left: 'right', right: 'left', up: 'down', down: 'up' };
  for (const i of [0, 12, 30]) {
    let s = L.parse(L.LEVELS[i].rows);
    for (let step = 0; step < 40; step++) {
      const all = L.moves(s);
      assert.ok(all.length > 0);
      for (const m of all) {
        const t = L.slide(s, m.piece, m.dir, m.dist);
        assert.ok(t, 'listed moves are legal');
        assert.deepEqual(L.slide(t, m.piece, back[m.dir], m.dist).pos, s.pos);
      }
      // nothing beyond the listed distances is legal
      for (let p = 0; p < s.pieces.length; p++) {
        for (const dir of L.dirsOf(s, p)) {
          const n = all.filter((m) => m.piece === p && m.dir === dir).length;
          assert.equal(L.slide(s, p, dir, n + 1), null);
        }
      }
      const m = all[(step * 7) % all.length];
      s = L.slide(s, m.piece, m.dir, m.dist);
    }
  }
});

test('the solver gives the fewest moves from anywhere, and its first move is a fair hint', () => {
  const lv = L.LEVELS[15];
  const s0 = L.parse(lv.rows);
  const sol = L.solve(s0);
  // one step along the solution leaves one move fewer
  const s1 = L.slide(s0, sol.path[0].piece, sol.path[0].dir, sol.path[0].dist);
  assert.equal(L.solve(s1).moves, lv.best - 1);
  // a step off the solution never makes it shorter than best - 1
  for (const m of L.moves(s0)) {
    const t = L.slide(s0, m.piece, m.dir, m.dist);
    const left = L.solve(t).moves;
    assert.ok(left >= lv.best - 1 && left <= lv.best + 1, `after ${JSON.stringify(m)}: ${left}`);
  }
  assert.deepEqual(L.solve(L.parse(['......', '......', '....BB', '......', '......', '......'])), { moves: 0, path: [] });
  assert.equal(L.solve(L.parse(L.LEVELS[35].rows), 50), null, 'a tiny search limit gives up');
});

test('check() explains what is wrong with a broken map', () => {
  const ok = ['......', '......', 'BB....', '......', '......', '......'];
  assert.deepEqual(L.check(ok), []);
  assert.match(L.check(ok.slice(1)).join(), /6 rows of 6/);
  assert.match(L.check(['a.....', '.a....', 'BB....', '......', '......', '......']).join(), /"a" is not a straight log/);
  assert.match(L.check(['aaaa..', '......', 'BB....', '......', '......', '......']).join(), /"a" is not a straight log/);
  assert.match(L.check(['......', '......', '.B....', '......', '......', '......']).join(), /not a straight log/);
  assert.match(L.check(['BB....', '......', '......', '......', '......', '......']).join(), /third row/);
  assert.match(L.check(['......', '......', 'BB.aa.', '......', '......', '......']).join(), /lies across the boat's row/);
  assert.match(L.check(['......', '......', '....BB', '......', '......', '......']).join(), /starts at the gap/);
  assert.match(L.check(['......', '......', '......', '......', '......', '......']).join(), /no boat/);
  assert.match(L.check(['#.....', '......', 'BB....', '......', '......', '......']).join(), /stray "#"/);
});

test('every message, word for word', () => {
  const s = L.parse([
    'a.....',
    'a..bbb',
    '.BB.c.',
    '....c.',
    'dd....',
    '......',
  ]);
  assert.equal(L.describe(s, 0), 'the boat');
  assert.equal(L.describe(s, 1), 'the short log in column 1, rows 1 to 2');
  assert.equal(L.describe(s, 2), 'the long log in row 2, columns 4 to 6');
  assert.equal(L.where(s, 3), 'rows 3 to 4');
  assert.equal(L.say.start(1, 2), 'Level 1. Free the boat! It can be done in 2 moves.');
  assert.equal(L.say.picked(s, 0), 'The boat. It can slide 1 left or 1 right.');
  assert.equal(L.say.picked(s, 1), 'The short log in column 1, rows 1 to 2. It can slide 2 down.');
  assert.equal(L.say.picked(s, 2), 'The long log in row 2, columns 4 to 6. It can slide 2 left.');
  const boxed = L.parse(['......', '......', 'BBa...', '..a...', '......', '......']);
  assert.equal(L.say.picked(boxed, 0), "The boat. It can't slide yet.");
  assert.equal(L.say.moved(s, 2), 'Columns 4 to 6.');
  assert.equal(L.say.blocked(s, 0, 'right'), "Can't slide right: blocked by the short log in column 5, rows 3 to 4.");
  assert.equal(L.say.blocked(s, 2, 'right'), "Can't slide right: that's the bank.");
  assert.equal(L.say.none('up'), 'No log further up.');
  assert.equal(L.say.hint(s, { piece: 3, dir: 'down', dist: 2 }), 'Hint: slide the short log in column 5, rows 3 to 4 down 2 squares.');
  assert.equal(L.say.hint(s, { piece: 0, dir: 'left', dist: 1 }), 'Hint: slide the boat left 1 square.');
  assert.equal(L.say.done(4, 9, 9), 'Level 4 done in 9 moves! The fewest possible!');
  assert.equal(L.say.done(4, 12, 9), 'Level 4 done in 12 moves! The fewest possible is 9.');
  assert.equal(L.say.clear(), 'The way out is clear!');
  assert.equal(L.say.undo(), 'Took that move back.');
  assert.equal(L.say.restart(), 'Back to the start.');
  assert.equal(L.say.moves(1), '1 move');
  assert.equal(L.say.moves(3), '3 moves');
});
