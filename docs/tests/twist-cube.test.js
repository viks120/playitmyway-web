/* Twist Cube tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/twist-cube/cube.js and prove the cube model
 * (twists, inverses, whole-cube turns), the levels (every par is reachable
 * and is the true shortest way back), the hint and the messages. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const C = require(path.join(__dirname, '..', '..', 'games', 'twist-cube', 'cube.js'));

// a small seeded random number generator, so every run checks the same scrambles
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const same = (a, b) => C.key(a) === C.key(b);
const SIZES = [2, 3];

test('the sticker model: six faces of n×n stickers, each face one colour when solved', () => {
  for (const n of SIZES) {
    const s = C.solved(n);
    assert.equal(s.length, 6 * n * n);
    assert.ok(C.isSolved(s));
    for (let f = 0; f < 6; f++) assert.equal(new Set(s.slice(f * n * n, (f + 1) * n * n)).size, 1);
    const slots = C.slots(n);
    assert.equal(new Set(slots.map((sl) => sl.p.join(','))).size, slots.length, 'every sticker has its own spot');
    // every sticker sits on its face, at ±n along that face's axis
    slots.forEach((sl) => assert.deepEqual(sl.p.map((v, k) => (sl.normal[k] ? v : 0)), sl.normal.map((v) => v * n)));
  }
});

test('the twists match the standard notation', () => {
  const look = (s, n, face, row, col) => C.FACES[s[C.slots(n).findIndex((sl) => sl.face === face && sl.row === row && sl.col === col)]];
  const s = C.solved(3);
  assert.equal(look(C.twist(s, 'U'), 3, 'L', 0, 1), 'F', 'U carries the front of the top layer to the left');
  assert.equal(look(C.twist(s, 'R'), 3, 'U', 1, 2), 'F', 'R carries the front of the right layer up');
  assert.equal(look(C.twist(s, 'F'), 3, 'R', 1, 0), 'U', 'F carries the top of the front layer to the right');
  assert.equal(look(C.twist(s, 'D'), 3, 'R', 2, 1), 'F', 'D carries the front of the bottom layer to the right');
  assert.equal(look(C.twist(s, 'L'), 3, 'D', 1, 0), 'F', 'L carries the front of the left layer down');
  assert.equal(look(C.twist(s, 'B'), 3, 'L', 1, 0), 'U', 'B carries the top of the back layer to the left');
  // a twist moves the 12 edge stickers round its layer (8 on a 2×2×2) and keeps the middle sticker still
  for (const n of SIZES) {
    for (const m of C.MOVES) {
      const t = C.twist(C.solved(n), m);
      assert.equal(t.filter((c, i) => c !== C.solved(n)[i]).length, 4 * n, `${n}: ${m}`);
    }
  }
});

test('every twist has order 4, and a twist then its inverse puts the cube back', () => {
  const r = rng(1);
  for (const n of SIZES) {
    const starts = [C.solved(n), C.apply(C.solved(n), C.scramble(n, 25, r))];
    for (const s0 of starts) {
      for (const m of C.MOVES) {
        let s = s0;
        const back = [];
        for (let k = 1; k <= 4; k++) {
          s = C.twist(s, m);
          back.push(same(s, s0));
        }
        assert.deepEqual(back, [false, false, false, true], `${n}: ${m} four times`);
        assert.ok(same(C.twist(C.twist(s0, m), C.inverse(m)), s0), `${n}: ${m} then ${C.inverse(m)}`);
        assert.ok(same(C.twist(C.twist(s0, C.inverse(m)), m), s0), `${n}: ${C.inverse(m)} then ${m}`);
        assert.ok(same(C.apply(s0, [m, m, m]), C.twist(s0, C.inverse(m))), `${n}: three ${m} make one ${C.inverse(m)}`);
      }
    }
  }
});

test('opposite faces commute; faces that share an edge do not', () => {
  const s0 = C.apply(C.solved(3), ["R", "U'", 'F']);
  for (const n of SIZES) {
    const s = n === 3 ? s0 : C.apply(C.solved(2), ["R", "U'", 'F']);
    for (const a of C.MOVES) {
      for (const b of C.MOVES) {
        const ab = C.apply(s, [a, b]);
        const ba = C.apply(s, [b, a]);
        if (C.axisOf(a) === C.axisOf(b)) assert.ok(same(ab, ba), `${n}: ${a} ${b} = ${b} ${a}`);
        else assert.ok(!same(ab, ba), `${n}: ${a} ${b} differs from ${b} ${a}`);
      }
    }
  }
});

test('random scrambles followed by their inverses come back to solved', () => {
  const r = rng(2);
  for (const n of SIZES) {
    for (let i = 0; i < 300; i++) {
      const moves = C.scramble(n, 1 + Math.floor(r() * 40), r);
      const s = C.apply(C.solved(n), moves);
      assert.ok(C.isSolved(C.apply(s, C.invert(moves))), `${n}: ${C.format(moves)}`);
    }
  }
  assert.deepEqual(C.invert(['R', "U'", 'F', 'F']), ["F'", "F'", 'U', "R'"]);
});

test('solved is spotted however the cube is held', () => {
  assert.equal(C.ROTATIONS.length, 24, 'a cube can be held 24 ways');
  for (const n of SIZES) {
    const s = C.solved(n);
    const one = C.twist(s, 'R');
    const turned = new Set();
    for (let r = 0; r < 24; r++) {
      const t = C.turnWhole(s, r);
      turned.add(C.key(t));
      assert.ok(C.isSolved(t), `${n}: held the ${r}th way, still solved`);
      assert.ok(!C.isSolved(C.turnWhole(one, r)), `${n}: one twist from solved, held the ${r}th way`);
      assert.equal(C.canon(t).key, C.canon(s).key, 'one standard string per position');
    }
    assert.equal(turned.size, 24, `${n}: the 24 ways all look different`);
  }
  // with no middle stickers, R then L′ on a 2×2×2 just turns the whole cube: solved
  assert.ok(C.isSolved(C.apply(C.solved(2), ['R', "L'"])));
  assert.ok(C.isSolved(C.apply(C.solved(2), ['U', "D'", 'F', "B'"])));
  assert.ok(!C.isSolved(C.apply(C.solved(3), ['R', "L'"])), 'on a 3×3×3 it is not');
  assert.ok(!C.isSolved(C.apply(C.solved(2), ['R', 'L'])));
});

test('the letters stay with the player: turning the whole cube renames its faces', () => {
  let v = 0;
  assert.equal(C.toView(v, "R'"), "R'");
  v = C.turnView(0, 'y');                  // like U: the front goes to the left
  assert.equal(C.toView(v, 'R'), 'F', 'the old right face now faces you');
  assert.equal(C.toCube(v, "F'"), "R'");
  assert.equal(C.toView(C.turnView(0, 'x'), 'F'), 'U', 'x tips the front up to the top');
  assert.equal(C.toView(C.turnView(0, 'z'), 'U'), 'R', 'z rolls the top over to the right');
  // a turn and its prime cancel, four turns come back, and every move round-trips
  for (const t of ['x', 'y', 'z']) {
    assert.equal(C.turnView(C.turnView(0, t), t + "'"), 0);
    assert.equal([1, 2, 3, 4].reduce((w) => C.turnView(w, t), 0), 0);
  }
  for (let w = 0; w < 24; w++) for (const m of C.MOVES) assert.equal(C.toCube(w, C.toView(w, m)), m);
  // held any of the 24 ways, twisting the face you see as F is the same as
  // turning the stickers into your view, twisting F there, and looking again
  for (const n of SIZES) {
    const s = C.apply(C.solved(n), ['R', "U'", 'F', 'L']);
    for (let w = 0; w < 24; w++) {
      for (const m of C.MOVES) {
        const mine = C.turnWhole(C.twist(s, C.toCube(w, m)), w);
        const seen = C.twist(C.turnWhole(s, w), m);
        assert.ok(same(mine, seen), `${n}: held the ${w}th way, ${m}`);
      }
    }
  }
});

/* positions within `depth` twists of solved, by standard string */
function ball(n, depth) {
  const start = C.solved(n);
  const dist = new Map([[C.canon(start).key, 0]]);
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    for (const s of frontier) {
      for (const m of C.MOVES) {
        const t = C.twist(s, m);
        const k = C.canon(t).key;
        if (!dist.has(k)) {
          dist.set(k, d);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/* true when no way back shorter than `moves` exists: everything within b
 * twists of the start is more than a twists from solved, with a + b = k - 1 */
function shortest(n, moves, near) {
  const k = moves.length;
  const start = C.apply(C.solved(n), moves);
  const a = Math.min(5, k - 1);
  const b = k - 1 - a;
  let frontier = [start];
  const seen = new Set([C.canon(start).key]);
  for (let j = 0; ; j++) {
    for (const s of frontier) {
      const d = near.get(C.canon(s).key);
      if (d !== undefined && d <= a) return false;
    }
    if (j === b) return true;
    const next = [];
    for (const s of frontier) {
      for (const m of C.MOVES) {
        const t = C.twist(s, m);
        const key = C.canon(t).key;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
}

test('18 levels: 2×2×2 then 3×3×3 scrambles of 1, 2, 3, 4, 5, 6, 8 and 10 twists, then free play', () => {
  assert.equal(C.LEVELS.length, 18);
  assert.deepEqual(C.GROUPS.map((g) => [g.from, g.to]), [[0, 8], [8, 16], [16, 18]]);
  const lengths = [1, 2, 3, 4, 5, 6, 8, 10];
  assert.deepEqual(C.LEVELS.slice(0, 8).map((lv) => [lv.n, lv.par]), lengths.map((k) => [2, k]));
  assert.deepEqual(C.LEVELS.slice(8, 16).map((lv) => [lv.n, lv.par]), lengths.map((k) => [3, k]));
  assert.deepEqual(C.LEVELS.slice(16).map((lv) => [lv.n, lv.free, lv.length]), [[2, true, 16], [3, true, 30]]);
  // the first scrambles use only the three faces in view
  for (const i of [0, 1, 2, 3, 8, 9, 10]) assert.ok(C.LEVELS[i].moves.every((m) => 'URF'.includes(m[0])), `level ${i + 1}`);
  C.LEVELS.slice(0, 16).forEach((lv, i) => {
    assert.ok(lv.moves.every((m, j) => C.fits(lv.n, lv.moves.slice(0, j), m)), `level ${i + 1} wastes a twist`);
  });
});

test("every level's par is reachable, and no shorter way back exists", () => {
  const near = { 2: ball(2, 5), 3: ball(3, 5) };
  C.LEVELS.slice(0, 16).forEach((lv, i) => {
    const start = C.apply(C.solved(lv.n), lv.moves);
    assert.ok(!C.isSolved(start), `level ${i + 1} starts solved`);
    const back = C.invert(lv.moves);
    assert.equal(back.length, lv.par);
    assert.ok(C.isSolved(C.apply(start, back)), `level ${i + 1}: the scramble backwards solves it`);
    assert.ok(shortest(lv.n, lv.moves, near[lv.n]), `level ${i + 1}: there is a way back shorter than par ${lv.par}`);
  });
});

test('random scrambles: no twist wasted, the right length, and well mixed for free play', () => {
  const r = rng(3);
  for (const n of SIZES) {
    for (let i = 0; i < 200; i++) {
      const s = C.scramble(n, 30, r);
      assert.equal(s.length, 30);
      for (let j = 1; j < s.length; j++) {
        assert.notEqual(s[j], C.inverse(s[j - 1]), 'a twist straight after its own undo');
        assert.ok(!(s[j] === s[j - 1] && s[j] === s[j - 2]), 'three of one twist in a row');
      }
    }
    // a free-play scramble leaves no face finished, nearly always
    const lv = C.LEVELS.find((l) => l.free && l.n === n);
    let tidy = 0;
    for (let i = 0; i < 200; i++) {
      const s = C.apply(C.solved(n), C.scramble(n, lv.length, r));
      const k = n * n;
      for (let f = 0; f < 6; f++) if (new Set(s.slice(f * k, f * k + k)).size === 1) tidy++;
    }
    assert.ok(tidy < 10, `${n}: ${tidy} finished faces in 200 scrambles`);
  }
  // on a 2×2×2, R with L′ (a whole-cube turn) is never generated
  assert.equal(C.fits(2, ['R'], "L'"), false);
  assert.equal(C.fits(3, ['R'], "L'"), true);
  assert.equal(C.fits(3, ['R', 'L'], "R'"), false);
});

test('the hint walks the scramble backwards, whatever the order of twists that commute', () => {
  const g = C.guide(3, ['R', "U'", 'F']);
  let s = g.start;
  let w = C.where(g, s, []);
  assert.deepEqual([w.on, w.left, w.next], [true, 3, "F'"]);
  s = C.twist(s, "F'");
  w = C.where(g, s, [g.start]);
  assert.deepEqual([w.on, w.left, w.next], [true, 2, 'U']);
  // a wrong twist: off the path, one twist to take back
  const off = C.twist(s, 'D');
  w = C.where(g, off, [g.start, s]);
  assert.deepEqual([w.on, w.back], [false, 1]);
  const off2 = C.twist(off, 'L');
  assert.deepEqual(C.where(g, off2, [g.start, s, off]).back, 2);
  assert.ok(C.where(g, C.solved(3), []).solved);

  // R and L don't interfere, so undoing R′ first is still on the path
  const h = C.guide(3, ['U', 'R', 'L']);
  assert.equal(C.where(h, h.start, []).next, "L'");
  const swapped = C.twist(h.start, "R'");
  w = C.where(h, swapped, [h.start]);
  assert.deepEqual([w.on, w.left, w.next], [true, 2, "L'"]);
});

test('on a 2×2×2 the hint still knows a position that has turned round', () => {
  const g = C.guide(2, ['R', 'U']);
  // D′ instead of U′: on a 2×2×2 that is the same as U′ with the whole cube turned
  const s = C.twist(g.start, "D'");
  const w = C.where(g, s, [g.start]);
  assert.equal(w.on, true);
  assert.equal(w.left, 1);
  assert.ok(C.isSolved(C.twist(s, w.next)), `the hint ${w.next} solves it`);
});

test('following the hint from any level start solves it in exactly par twists, held any way', () => {
  const r = rng(4);
  C.LEVELS.forEach((lv, i) => {
    const moves = lv.free ? C.scramble(lv.n, lv.length, r) : lv.moves;
    const g = C.guide(lv.n, moves);
    let s = g.start;
    let view = 0;
    let count = 0;
    while (!C.isSolved(s)) {
      const w = C.where(g, s, []);
      assert.ok(w.on, `level ${i + 1}: lost the path after ${count}`);
      assert.equal(w.left, moves.length - count);
      // the player turns the cube now and then; the hint is named for their view
      view = C.turnView(view, ['x', "y'", 'z'][count % 3]);
      const seen = C.toView(view, w.next);
      s = C.twist(s, C.toCube(view, seen));
      count++;
      assert.ok(count <= moves.length, `level ${i + 1}: too many twists`);
    }
    assert.equal(count, moves.length, `level ${i + 1}`);
  });
});

test('notation: reading and writing twists', () => {
  assert.deepEqual(C.parse("R U' F2 B′ D’"), ['R', "U'", 'F', 'F', "B'", "D'"]);
  assert.throws(() => C.parse('R X'), /Not a twist: X/);
  assert.equal(C.format(['R', "U'", 'F']), 'R U′ F');
  assert.equal(C.label("L'"), 'L′');
  assert.equal(C.describe("B'"), 'back face, anticlockwise');
  assert.equal(C.describe('U'), 'top face, clockwise');
  assert.throws(() => C.twist(C.solved(3), 'Q'), /Not a twist/);
});

test('every message, word for word', () => {
  const say = C.say;
  const lv1 = C.LEVELS[0];
  const lv12 = C.LEVELS[11];
  const free = C.LEVELS[17];
  assert.equal(say.watch(1), 'Watch closely: 1 twist coming…');
  assert.equal(say.watch(4), 'Watch closely: 4 twists coming…');
  assert.equal(say.mixing(30), 'Scrambling with 30 random twists…');
  assert.equal(say.go(lv1), 'Your turn: undo that twist by turning the same face back the other way. Par is 1.');
  assert.equal(say.go(lv12), 'Your turn: undo the 4 twists. Par is 4.');
  assert.equal(say.go(free), 'Your turn: solve it any way you like. Hints walk you back along the scramble.');
  assert.equal(say.twist("R'"), 'R′: right face, anticlockwise.');
  assert.equal(say.twist('F'), 'F: front face, clockwise.');
  assert.equal(say.turn(), 'Whole cube turned. F is always the face towards you.');
  assert.equal(say.home(), 'Back to the starting view.');
  assert.equal(say.undo("U'"), 'Took back U′.');
  assert.equal(say.noUndo(), 'Nothing to take back yet.');
  assert.equal(say.reset(), 'Back to the start of the scramble.');
  assert.equal(say.hint("F'", 3), 'Hint: twist F′ (front face, anticlockwise). 3 twists to go.');
  assert.equal(say.hint('R', 1), 'Hint: twist R (right face, clockwise). That one solves it!');
  assert.equal(say.stray(1), "You've left the scramble's path. Undo 1 twist to get back on it, then ask again.");
  assert.equal(say.stray(3), "You've left the scramble's path. Undo 3 twists to get back on it, then ask again.");
  assert.equal(say.lost(), "You've left the scramble's path. Reset to start again.");
  assert.equal(say.solved(lv12, 4), 'Solved in 4 twists: exactly par!');
  assert.equal(say.solved(lv12, 7), 'Solved in 7 twists. Par is 4: the scramble done backwards.');
  assert.equal(say.solved(lv1, 1), 'Solved in 1 twist: exactly par!');
  assert.equal(say.solved(free, 52), 'Solved in 52 twists! The scramble was 30 twists.');
  assert.equal(say.help(0, false), 'No hints and no peeking. Brilliant!');
  assert.equal(say.help(1, false), 'With 1 hint.');
  assert.equal(say.help(2, true), 'With 2 hints and a look at the scramble.');
  assert.equal(say.help(0, true), 'With a look at the scramble.');
  assert.equal(say.scramble(['R', "U'"]), 'Scramble: R U′');
  assert.equal(say.way(['R', "U'"]), 'Undo: U R′');
  assert.equal(say.status({ solved: false, on: true, left: 1 }, 3), 'On the path: 2 of 3 undone.');
  assert.equal(say.status({ solved: false, on: false, back: 2 }, 3), 'Off the path: undo 2 twists to get back.');
  assert.equal(say.status({ solved: true, on: true, left: 0 }, 3), 'Solved!');
  assert.equal(say.moves(1), '1 twist');
  assert.equal(say.size(3), '3×3×3');
});
