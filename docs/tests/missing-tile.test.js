/* Missing Tile tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/missing-tile/matrix.js and prove every level
 * is a well-formed puzzle with exactly one tile that fits any rule the game
 * knows, that the generator never needs a second draw for any rule set in
 * the table, and that every word the game says is the one in the design
 * note. The last two tests check the page's wiring and the world's pure
 * framing maths. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const GAME = path.join(ROOT, 'games', 'missing-tile');
const KIT = path.join(ROOT, 'games', 'shared', '3d');
const M = require(path.join(GAME, 'matrix.js'));

const clone = (p) => JSON.parse(JSON.stringify(p));
const diffs = (a, b) => M.ATTRS.filter((k) => a[k] !== b[k]);
const sameCell = (a, b) => diffs(a, b).length === 0;
const rowOf = (i) => Math.floor(i / 3);
const colOf = (i) => i % 3;
const levels = M.LEVELS.map((lv, i) => M.make(i));
// the kinds of the rule on each attribute of a puzzle
const kindOf = (p, attr) => p.rules.find((r) => r.attr === attr).kind;
// a grid from nine values per attribute
const gridOf = (shape, colour, count, size) => [...Array(9)].map((_, i) => ({ shape: shape[i], colour: colour[i], count: count[i], size: size[i] }));
const nine = (v) => Array(9).fill(v);
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);

const TABLE = [
  'colour row', 'shape row', 'count grow', 'size row', 'colour col', 'shape col',
  'size grow', 'count col', 'shape each', 'colour each', 'size col', 'count each',
  'colour row, shape col', 'shape row, count grow', 'size row, colour col', 'colour row, size grow',
  'shape row, colour each', 'count col, shape each', 'size grow, colour each', 'colour row, count each',
  'shape each, colour each', 'colour col, size each', 'count each, shape each', 'count grow, shape each',
  'colour row, shape col, count each', 'shape row, count grow, colour each', 'size row, colour col, shape each',
  'colour row, size grow, shape each', 'shape row, count col, colour each', 'count row, colour col, size each',
  'colour row, shape each, count each', 'shape col, colour each, size each', 'size grow, colour each, shape each',
  'count row, shape each, colour each', 'colour col, count each, size each', 'count grow, shape each, colour each',
];

/* ------------------------------------------------------------- the table */

test('the public constants: attributes, values, kinds in order, the gap, options by tier', () => {
  assert.deepEqual(M.ATTRS, ['shape', 'colour', 'count', 'size']);
  assert.deepEqual(M.VALUES, {
    shape: ['ball', 'cube', 'pyramid', 'star', 'heart', 'cross'],
    colour: ['red', 'yellow', 'green', 'blue', 'purple', 'pink'],
    count: [1, 2, 3],
    size: ['small', 'medium', 'big'],
  });
  assert.deepEqual(M.KINDS, ['same', 'row', 'col', 'grow', 'each']);
  assert.equal(M.MISSING, 8);
  assert.deepEqual(M.OPTIONS, { 1: 4, 2: 5, 3: 6 });
});

test('36 levels in three groups of twelve, one rule then two then three, exactly the designed table', () => {
  assert.equal(M.LEVELS.length, 36);
  assert.deepEqual(M.GROUPS, [
    { title: 'One rule', from: 0, to: 12 },
    { title: 'Two rules', from: 12, to: 24 },
    { title: 'Three rules', from: 24, to: 36 },
  ]);
  M.GROUPS.forEach((g, k) => {
    for (let i = g.from; i < g.to; i++) assert.equal(M.LEVELS[i].tier, k + 1, `level ${i + 1} is in ${g.title}`);
  });
  assert.deepEqual(M.LEVELS[0], { tier: 1, seed: M.LEVELS[0].seed, rules: [{ attr: 'colour', kind: 'row' }] });
  assert.deepEqual(M.LEVELS[35].rules, [{ attr: 'count', kind: 'grow' }, { attr: 'shape', kind: 'each' }, { attr: 'colour', kind: 'each' }]);
  assert.deepEqual(M.LEVELS.map((lv) => lv.rules.map((r) => `${r.attr} ${r.kind}`).join(', ')), TABLE);
  M.LEVELS.forEach((lv, i) => {
    assert.equal(lv.rules.length, lv.tier, `level ${i + 1}: tier is the number of rules`);
    assert.ok(Number.isInteger(lv.seed), `level ${i + 1} has an integer seed`);
    for (const r of lv.rules) {
      assert.ok(M.ATTRS.includes(r.attr) && M.KINDS.includes(r.kind) && r.kind !== 'same', `level ${i + 1}: ${r.attr} ${r.kind}`);
      if (r.kind === 'grow') assert.ok(r.attr === 'count' || r.attr === 'size', `level ${i + 1}: grow only on count or size`);
    }
    assert.equal(new Set(lv.rules.map((r) => r.attr)).size, lv.rules.length, `level ${i + 1}: one rule per attribute`);
    // never row+row, col+col, col+grow or grow+grow: they would move together
    const kinds = lv.rules.map((r) => r.kind);
    for (let a = 0; a < kinds.length; a++) {
      for (let b = a + 1; b < kinds.length; b++) {
        const pair = [kinds[a], kinds[b]].sort().join('+');
        assert.ok(!['row+row', 'col+col', 'col+grow', 'grow+grow'].includes(pair), `level ${i + 1} pairs ${pair}`);
      }
    }
  });
  assert.equal(new Set(M.LEVELS.map((lv) => lv.seed)).size, 36, 'every seed is different');
});

test('every attribute is ruled at least four times across the table', () => {
  for (const attr of M.ATTRS) {
    const n = M.LEVELS.filter((lv) => lv.rules.some((r) => r.attr === attr)).length;
    assert.ok(n >= 4, `${attr} is ruled ${n} times`);
  }
});

/* ------------------------------------------------------------ the levels */

test('make() is deterministic and labels the puzzle with its level, tier and seed', () => {
  M.LEVELS.forEach((lv, i) => {
    const a = M.make(i);
    const b = M.make(i);
    assert.deepEqual(a, b, `level ${i + 1} is the same every time`);
    assert.notEqual(a, b, 'and a fresh object');
    assert.equal(a.level, i);
    assert.equal(a.tier, lv.tier);
    assert.equal(a.seed, lv.seed);
    assert.deepEqual(a.rules.map((r) => r.attr), M.ATTRS, 'four rules in ATTRS order, same included');
    for (const r of lv.rules) assert.equal(kindOf(a, r.attr), r.kind);
    assert.equal(a.rules.filter((r) => r.kind === 'same').length, 4 - lv.tier);
  });
  assert.throws(() => M.make(36), RangeError);
  assert.throws(() => M.make(-1), RangeError);
});

test('every level: check() clean, the option count, distinct options, the answer in the gap, every rule fits, the tier', () => {
  levels.forEach((p, i) => {
    assert.deepEqual(M.check(p), [], `level ${i + 1}`);
    assert.equal(p.options.length, M.OPTIONS[p.tier], `level ${i + 1} options`);
    assert.equal(new Set(p.options.map((c) => M.ATTRS.map((k) => c[k]).join('|'))).size, p.options.length, `level ${i + 1} distinct options`);
    assert.deepEqual(p.options[p.answer], p.grid[M.MISSING], `level ${i + 1} answer`);
    assert.equal(p.grid.length, 9);
    for (const r of p.rules) assert.ok(M.fits(p.grid.map((c) => c[r.attr]), r.kind, r.attr), `level ${i + 1}: ${r.attr} ${r.kind} fits`);
    assert.equal(M.ruled(p).length, p.tier, `level ${i + 1} tier`);
    assert.deepEqual(M.ruled(p).map((r) => r.attr), M.ATTRS.filter((a) => kindOf(p, a) !== 'same'), 'ruled() in ATTRS order');
    for (const attr of M.ATTRS) {
      assert.equal(p.values[attr].length, 3);
      for (const c of p.grid.concat(p.options)) assert.ok(p.values[attr].includes(c[attr]), `level ${i + 1}: ${attr} ${c[attr]} in the value set`);
    }
    assert.deepEqual(p.values.count, [1, 2, 3]);
    assert.deepEqual(p.values.size, ['small', 'medium', 'big']);
  });
});

test('every level: the answer is explainable and no distractor is, whatever rule the game knows', () => {
  levels.forEach((p, i) => {
    assert.ok(M.explains(p.grid), `level ${i + 1}: the answer fits`);
    p.options.forEach((o, k) => {
      if (k === p.answer) return;
      const g = p.grid.slice();
      g[M.MISSING] = o;
      assert.equal(M.explains(g), null, `level ${i + 1}: option ${k} (${M.describe(o)}) also fits`);
    });
  });
});

test('every level: the distractors are the answer with the neighbour\'s wrong values, plus exactly one foil', () => {
  levels.forEach((p, i) => {
    const A = p.grid[M.MISSING];
    const R = M.ruled(p);
    const others = p.options.filter((c, k) => k !== p.answer);
    assert.ok(others.every((c) => !sameCell(c, A)), `level ${i + 1}: the answer appears once`);
    const neighbours = (r) => (r.kind === 'row' ? [p.grid[5]] : r.kind === 'each' ? [p.grid[5], p.grid[7]] : [p.grid[7]]).map((c) => c[r.attr]);
    for (const r of R) {
      const alone = others.filter((c) => diffs(c, A).join() === r.attr);
      if (p.tier === 1) {
        assert.equal(alone.length, 2, `level ${i + 1}: both other ${r.attr} values`);
        assert.deepEqual(alone.map((c) => c[r.attr]).sort(), p.values[r.attr].filter((v) => v !== A[r.attr]).sort());
        assert.ok(alone.some((c) => neighbours(r).includes(c[r.attr])), `level ${i + 1}: one copies the tile next door`);
      } else {
        assert.equal(alone.length, 1, `level ${i + 1}: one option wrong in ${r.attr} alone`);
        assert.ok(neighbours(r).includes(alone[0][r.attr]), `level ${i + 1}: the wrong ${r.attr} is a neighbour's`);
        for (const n of neighbours(r)) assert.notEqual(n, A[r.attr], `level ${i + 1}: the neighbour's ${r.attr} differs from the answer's`);
      }
    }
    const foils = others.filter((c) => {
      const d = diffs(c, A);
      return d.length === 1 && kindOf(p, d[0]) === 'same';
    });
    assert.equal(foils.length, 1, `level ${i + 1}: exactly one foil`);
    if (p.tier >= 2) {
      const both = others.filter((c) => diffs(c, A).join() === [R[0].attr, R[1].attr].join());
      assert.equal(both.length, 1, `level ${i + 1}: one option wrong in the first two ruled attributes`);
      const single = (attr) => others.find((c) => diffs(c, A).join() === attr);
      assert.equal(both[0][R[0].attr], single(R[0].attr)[R[0].attr]);
      assert.equal(both[0][R[1].attr], single(R[1].attr)[R[1].attr]);
    }
    const expected = p.tier === 1 ? 3 : p.tier === 2 ? 4 : 5;
    assert.equal(others.length, expected, `level ${i + 1}: every distractor accounted for`);
  });
});

test('every level: ruled attributes are independent (nine distinct pairs), each-attributes are Latin squares, colours never clash', () => {
  levels.forEach((p, i) => {
    const R = M.ruled(p);
    for (let a = 0; a < R.length; a++) {
      for (let b = a + 1; b < R.length; b++) {
        const pairs = new Set(p.grid.map((c) => `${c[R[a].attr]}|${c[R[b].attr]}`));
        assert.equal(pairs.size, 9, `level ${i + 1}: ${R[a].attr} and ${R[b].attr} move together`);
      }
    }
    for (const r of R) {
      if (r.kind !== 'each') continue;
      const v = p.grid.map((c) => c[r.attr]);
      for (let k = 0; k < 3; k++) {
        assert.equal(new Set([v[3 * k], v[3 * k + 1], v[3 * k + 2]]).size, 3, `level ${i + 1}: ${r.attr} row ${k}`);
        assert.equal(new Set([v[k], v[k + 3], v[k + 6]]).size, 3, `level ${i + 1}: ${r.attr} column ${k}`);
      }
    }
    const c = p.values.colour;
    assert.ok(!(c.includes('red') && c.includes('pink')), `level ${i + 1}: red and pink`);
    assert.ok(!(c.includes('blue') && c.includes('purple')), `level ${i + 1}: blue and purple`);
  });
});

test('no two levels show the same grid', () => {
  assert.equal(new Set(levels.map((p) => JSON.stringify(p.grid))).size, 36);
});

/* ---------------------------------------------------------- the rules */

test('fits(): truth tables for every kind', () => {
  const same = nine('red');
  const row = ['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c'];
  const col = ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'];
  const latin = ['a', 'b', 'c', 'b', 'c', 'a', 'c', 'a', 'b'];
  const each = ['a', 'b', 'c', 'a', 'b', 'c', 'b', 'a', 'c']; // rows only: not a Latin square
  const grow = [1, 2, 3, 1, 2, 3, 1, 2, 3];
  const table = [
    //              same   row    col    grow   each
    [same, 'shape', [true, false, false, false, false]],
    [row, 'shape', [false, true, false, false, false]],
    [col, 'shape', [false, false, true, false, true]],
    [latin, 'shape', [false, false, false, false, true]],
    [each, 'shape', [false, false, false, false, true]],
    [grow, 'count', [false, false, true, true, true]],
    [['small', 'medium', 'big', 'small', 'medium', 'big', 'small', 'medium', 'big'], 'size', [false, false, true, true, true]],
    [[2, 1, 3, 2, 1, 3, 2, 1, 3], 'count', [false, false, true, false, true]],
    [[1, 1, 1, 2, 2, 2, 3, 3, 3], 'count', [false, true, false, false, false]],
    [['red', 'yellow', 'green', 'red', 'yellow', 'green', 'red', 'yellow', 'green'], 'colour', [false, false, true, false, true]],
    [['ball', 'cube', 'pyramid', 'ball', 'cube', 'pyramid', 'ball', 'cube', 'pyramid'], 'shape', [false, false, true, false, true]],
  ];
  for (const [values, attr, truth] of table) {
    assert.deepEqual(M.KINDS.map((k) => M.fits(values, k, attr)), truth, `${attr} ${values.join(',')}`);
  }
  assert.ok(M.fits([1, 2, 3, 1, 2, 3, 1, 2, 3], 'grow', 'count'));
  // negatives
  assert.ok(!M.fits(['a', 'a', 'a', 'b', 'b', 'b', 'a', 'a', 'a'], 'row', 'shape'), 'rows must hold three different values');
  assert.ok(!M.fits(['a', 'a', 'b', 'b', 'b', 'b', 'c', 'c', 'c'], 'row', 'shape'), 'rows must be constant');
  assert.ok(!M.fits(['a', 'b', 'a', 'a', 'b', 'a', 'a', 'b', 'a'], 'col', 'shape'), 'columns must hold three different values');
  assert.ok(!M.fits(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'a'], 'col', 'shape'), 'columns must be constant');
  assert.ok(!M.fits(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'a'], 'each', 'shape'), 'a row with a repeat');
  assert.ok(!M.fits(['a', 'b', 'c', 'a', 'b', 'd', 'a', 'b', 'c'], 'each', 'shape'), 'rows must hold the same three values');
  assert.ok(!M.fits(['a', 'a', 'b', 'a', 'a', 'b', 'a', 'a', 'b'], 'each', 'shape'), 'row 0 with a repeat');
  assert.ok(!M.fits(nine(1), 'grow', 'count'));
  assert.ok(!M.fits([1, 2, 3, 1, 2, 3, 1, 2, 2], 'grow', 'count'));
  assert.ok(!M.fits([3, 2, 1, 3, 2, 1, 3, 2, 1], 'grow', 'count'), 'grow reads one, two, three');
  assert.ok(!M.fits(nine('red').slice(0, 8), 'same', 'colour'), 'nine values');
  assert.ok(!M.fits(same, 'diagonal', 'colour'), 'unknown kind');
  // col is a special case of each; grow a special case of col
  for (const v of [col, grow, [2, 1, 3, 2, 1, 3, 2, 1, 3]]) {
    const attr = typeof v[0] === 'number' ? 'count' : 'shape';
    assert.ok(M.fits(v, 'col', attr) && M.fits(v, 'each', attr), 'col implies each');
    if (M.fits(v, 'grow', attr)) assert.ok(M.fits(v, 'col', attr), 'grow implies col');
  }
});

test('explains(): the first kind in KINDS order per attribute in ATTRS order, or null', () => {
  const flat = gridOf(nine('ball'), nine('red'), nine(1), nine('big'));
  assert.deepEqual(Object.keys(M.explains(flat)), M.ATTRS);
  assert.deepEqual(M.explains(flat), { shape: 'same', colour: 'same', count: 'same', size: 'same' });
  const mixed = gridOf(
    ['ball', 'cube', 'star', 'ball', 'cube', 'star', 'ball', 'cube', 'star'],  // col (also each): reads col
    ['red', 'red', 'red', 'blue', 'blue', 'blue', 'green', 'green', 'green'], // row
    [1, 2, 3, 1, 2, 3, 1, 2, 3],                                              // grow (also col, each): reads col
    ['small', 'medium', 'big', 'medium', 'big', 'small', 'big', 'small', 'medium'], // a Latin square: each
  );
  assert.deepEqual(M.explains(mixed), { shape: 'col', colour: 'row', count: 'col', size: 'each' });
  const broken = clone(mixed);
  broken[0].colour = 'blue';
  assert.equal(M.explains(broken), null, 'a colour that fits no kind');
  assert.equal(M.explains(mixed.slice(0, 8)), null, 'nine cells');
});

/* ------------------------------------------------------- the generator */

test('generate(): 600 seeds for every rule set in the table, every one clean on the first draw', () => {
  const seen = new Set();
  M.LEVELS.forEach((lv, li) => {
    const key = lv.rules.map((r) => `${r.attr} ${r.kind}`).join(', ');
    if (seen.has(key)) return;
    seen.add(key);
    for (let s = 0; s < 600; s++) {
      const base = M.rng(s * 7919 + li * 131 + 1);
      let calls = 0;
      const rand = () => { calls++; return base(); };
      const p = M.generate(rand, { rules: lv.rules, options: M.OPTIONS[lv.tier], seed: s });
      const problems = M.check(p);
      assert.deepEqual(problems, [], `${key}, seed ${s}`);
      assert.equal(p.level, -1);
      assert.equal(p.seed, s);
      assert.equal(p.tier, lv.tier);
      assert.equal(p.options.length, M.OPTIONS[lv.tier]);
      // one draw spends at most 27 random numbers; a retry would spend at least 20 more
      assert.ok(calls <= 30, `${key}, seed ${s}: ${calls} draws means a redraw happened`);
    }
  });
  assert.ok(seen.size >= 30, `${seen.size} distinct rule sets`);
  assert.equal(M.generate(M.rng(5), { rules: M.LEVELS[0].rules, options: 4 }).seed, null, 'seed null when not given');
  assert.equal(M.generate(M.rng(5), { rules: M.LEVELS[0].rules }).options.length, 4, 'the option count defaults by tier');
});

test('generate() throws on an impossible spec, after its attempts', () => {
  assert.throws(() => M.generate(M.rng(1), { rules: [{ attr: 'colour', kind: 'grow' }], options: 4 }), /500 attempts/);
  assert.throws(() => M.generate(M.rng(1), { rules: [{ attr: 'shape', kind: 'row' }, { attr: 'colour', kind: 'row' }], options: 5 }), /500 attempts/);
  assert.throws(() => M.generate(M.rng(1), { rules: [{ attr: 'shape', kind: 'each' }, { attr: 'colour', kind: 'each' }, { attr: 'count', kind: 'each' }], options: 6 }), /500 attempts/);
  assert.throws(() => M.generate(M.rng(1), { rules: [{ attr: 'colour', kind: 'row' }], options: 6 }), RangeError);
  assert.throws(() => M.generate(M.rng(1), { rules: [{ attr: 'hue', kind: 'row' }] }), TypeError);
  assert.throws(() => M.generate(M.rng(1), { rules: [] }), /one, two or three ruled attributes, not 0/);
  assert.throws(() => M.generate(M.rng(1), { rules: M.ATTRS.map((attr) => ({ attr, kind: 'each' })) }), /one, two or three ruled attributes, not 4/);
});

test('check() names each problem with a broken puzzle', () => {
  const one = levels[0];      // colour row
  const two = levels[12];     // colour row, shape col
  const latin = levels[8];    // shape each
  assert.deepEqual(M.check(one), []);
  const other = (p, attr, not) => p.values[attr].find((v) => v !== not);
  let p;

  p = clone(two);
  p.options.push(Object.assign({}, p.grid[8], { size: other(p, 'size', p.grid[8].size) }));
  assert.match(M.check(p).join('\n'), /a tier 2 puzzle has 5 options, not 6/);

  p = clone(two);
  const d = [...p.options.keys()].filter((k) => k !== p.answer);
  p.options[d[0]] = clone(p.options[d[1]]);
  assert.match(M.check(p).join('\n'), /two options are the same tile/);

  p = clone(two);
  p.answer = (p.answer + 1) % p.options.length;
  assert.match(M.check(p).join('\n'), /the answer option is not the tile missing from the grid/);

  p = clone(two);
  p.grid[0].shape = M.VALUES.shape.find((s) => !p.values.shape.includes(s));
  assert.match(M.check(p).join('\n'), /cell 0 has the shape \w+, outside the puzzle's shape values/);

  p = clone(one);
  p.grid[0].colour = p.grid[3].colour;
  const broken = M.check(p).join('\n');
  assert.match(broken, /the colour rule, row, does not fit the grid/);
  assert.match(broken, /the answer does not fit any rule the game knows/);

  p = clone(one);
  p.rules[1].kind = 'grow';
  assert.match(M.check(p).join('\n'), /grow is only for count or size, not colour/);

  p = clone(two);   // shape now follows the rows, exactly as colour does
  p.grid.forEach((c, i) => { c.shape = p.values.shape[rowOf(i)]; });
  p.rules[0].kind = 'row';
  assert.match(M.check(p).join('\n'), /shape and colour move together: only 3 different pairs of values, not nine/);

  p = clone(latin);   // every row holds each shape, but the columns repeat
  p.grid.forEach((c, i) => { c.shape = p.values.shape[colOf(i)]; });
  assert.match(M.check(p).join('\n'), /the shape values are not a Latin square/);

  const recolour = (q, to) => {
    const map = {};
    q.values.colour.forEach((v, k) => { map[v] = to[k]; });
    q.values.colour = to.slice();
    q.grid.concat(q.options).forEach((c) => { c.colour = map[c.colour]; });
  };
  p = clone(one);
  recolour(p, ['red', 'yellow', 'pink']);
  assert.match(M.check(p).join('\n'), /the colours hold both red and pink/);
  p = clone(one);
  recolour(p, ['yellow', 'blue', 'purple']);
  assert.match(M.check(p).join('\n'), /the colours hold both blue and purple/);

  p = clone(two);
  const A = p.grid[8];
  const alone = p.options.find((c) => diffs(c, A).join() === 'colour');
  alone.size = other(p, 'size', A.size);
  assert.match(M.check(p).join('\n'), /no option differs from the answer in the colour alone/);

  p = clone(one);
  const foil = p.options.find((c) => diffs(c, p.grid[8]).length === 1 && kindOf(p, diffs(c, p.grid[8])[0]) === 'same');
  const foilAttr = diffs(foil, p.grid[8])[0];
  const another = M.ATTRS.find((a) => a !== foilAttr && kindOf(p, a) === 'same');
  foil[another] = other(p, another, p.grid[8][another]);
  assert.match(M.check(p).join('\n'), /there is no foil, not exactly one/);

  p = clone(one);
  const k = p.options.findIndex((c) => diffs(c, p.grid[8]).join() === 'colour');
  p.options[k] = Object.assign({}, p.grid[8], { count: other(p, 'count', p.grid[8].count) });
  assert.match(M.check(p).join('\n'), /there are 2 foils, not exactly one/);

  p = clone(two);
  p.options[d[0]] = clone(p.grid[8]);
  assert.match(M.check(p).join('\n'), new RegExp(`option ${d[0]} also fits the grid`));

  p = clone(one);
  p.tier = 3;
  assert.match(M.check(p).join('\n'), /the tier should be 1, the number of ruled attributes, not 3/);

  p = clone(one);
  p.values.count = [3, 2, 1];
  assert.match(M.check(p).join('\n'), /the count values must be 1, 2, 3 in that order/);

  p = clone(one);
  p.values.shape = ['ball', 'ball', 'cube'];
  assert.match(M.check(p).join('\n'), /the shape values must be three different ones of/);

  p = clone(one);
  p.rules = p.rules.slice(1);
  assert.match(M.check(p).join('\n'), /rules must list shape, colour, count and size in that order/);

  p = clone(one);
  p.grid = p.grid.slice(0, 8);
  assert.match(M.check(p).join('\n'), /the grid is nine cells/);
  assert.match(M.check(null).join('\n'), /a puzzle is an object/);

  p = clone(one);
  delete p.values.colour;
  assert.match(M.check(p).join('\n'), /values must hold three values for each attribute/);

  p = clone(one);
  p.options = 'nope';
  assert.match(M.check(p).join('\n'), /the options are a list of cells/);

  p = clone(one);
  p.rules = p.rules.map((r) => ({ attr: r.attr, kind: 'same' }));
  assert.match(M.check(p).join('\n'), /one, two or three ruled attributes, not 0/);
});

/* ---------------------------------------------------------------- words */

test('describe(): count word, size, colour, shape, plural past one', () => {
  assert.equal(M.describe({ shape: 'star', colour: 'red', count: 2, size: 'big' }), 'two big red stars');
  assert.equal(M.describe({ shape: 'ball', colour: 'blue', count: 1, size: 'small' }), 'one small blue ball');
  assert.equal(M.describe({ shape: 'cross', colour: 'green', count: 3, size: 'medium' }), 'three medium green crosses');
  const plural = { ball: 'balls', cube: 'cubes', pyramid: 'pyramids', star: 'stars', heart: 'hearts', cross: 'crosses' };
  for (const shape of M.VALUES.shape) {
    assert.equal(M.describe({ shape, colour: 'pink', count: 1, size: 'big' }), `one big pink ${shape}`);
    assert.equal(M.describe({ shape, colour: 'purple', count: 2, size: 'small' }), `two small purple ${plural[shape]}`);
    assert.equal(M.describe({ shape, colour: 'yellow', count: 3, size: 'medium' }), `three medium yellow ${plural[shape]}`);
  }
});

test('attrWord() and ruleText(), word for word', () => {
  assert.deepEqual(M.ATTRS.map(M.attrWord), ['shape', 'colour', 'number of shapes', 'size']);
  const expected = {
    same: ['Every tile has the same shape.', 'Every tile has the same colour.', 'Every tile has the same number of shapes.', "Every tile's shapes are the same size."],
    row: ['Each row has its own shape.', 'Each row has its own colour.', 'Each row has its own number of shapes.', 'Each row has its own size of shape.'],
    col: ['Each column has its own shape.', 'Each column has its own colour.', 'Each column has its own number of shapes.', 'Each column has its own size of shape.'],
    grow: ['', '', 'Along each row the number grows: one, two, three.', 'Along each row the shapes get bigger: small, medium, big.'],
    each: ['Every row has one of each shape.', 'Every row has one of each colour.', 'Every row has one of each number: one, two and three.', 'Every row has one of each size: small, medium and big.'],
  };
  for (const kind of M.KINDS) {
    assert.deepEqual(M.ATTRS.map((attr) => M.ruleText({ attr, kind })), expected[kind], kind);
  }
});

test('whyWrong(): every level, every distractor names an attribute that really differs, a ruled one first', () => {
  levels.forEach((p, i) => {
    assert.equal(M.whyWrong(p, p.answer), null, `level ${i + 1}: the answer is not wrong`);
    const A = p.options[p.answer];
    p.options.forEach((o, k) => {
      if (k === p.answer) return;
      const w = M.whyWrong(p, k);
      const d = diffs(o, A);
      const ruledDiff = d.filter((a) => kindOf(p, a) !== 'same');
      assert.equal(w.attr, ruledDiff.length ? ruledDiff[0] : d[0], `level ${i + 1} option ${k}: the first ruled attribute that differs, else the first that differs`);
      assert.notEqual(o[w.attr], A[w.attr], 'it really differs');
      assert.deepEqual(w.rule, p.rules.find((r) => r.attr === w.attr), 'the rule is that attribute\'s entry');
      assert.equal(w.rule, p.rules[M.ATTRS.indexOf(w.attr)], 'the very entry');
      const sentence = lower(M.ruleText(w.rule));
      assert.equal(w.text, `Not that one. Look at the ${M.attrWord(w.attr)}: ${sentence}`);
      assert.ok(w.text.endsWith(sentence));
      assert.match(sentence, /^[a-z]/);
    });
  });
  const p = levels[0];
  const colourWrong = p.options.findIndex((o) => o.colour !== p.grid[8].colour);
  assert.equal(M.whyWrong(p, colourWrong).text, 'Not that one. Look at the colour: each row has its own colour.');
});

test('hint(): every step and its spot, cumulative, clamped; hintSteps() is tier + 2', () => {
  levels.forEach((p, i) => {
    const R = M.ruled(p);
    const n = M.hintSteps(p);
    assert.equal(n, p.tier + 2, `level ${i + 1}`);
    assert.deepEqual(M.hint(p, 0), { text: `Look at the ${M.attrWord(R[0].attr)}.`, spot: R[0].kind });
    for (let k = 1; k <= p.tier; k++) {
      assert.deepEqual(M.hint(p, k), { text: R.slice(0, k).map(M.ruleText).join(' '), spot: R[k - 1].kind }, `level ${i + 1} step ${k}`);
    }
    const last = { text: `The answer is ${M.describe(p.grid[8])}.`, spot: null };
    assert.deepEqual(M.hint(p, n - 1), last);
    assert.deepEqual(M.hint(p, n), last, 'a step past the last is the last');
    assert.deepEqual(M.hint(p, 99), last);
    assert.deepEqual(M.hint(p, -2), M.hint(p, 0), 'and a step before the first is the first');
    // each step from 2 on keeps the whole of the step before and adds one more sentence
    for (let k = 2; k < n - 1; k++) {
      assert.ok(M.hint(p, k).text.startsWith(M.hint(p, k - 1).text + ' '), `level ${i + 1} step ${k} is cumulative`);
    }
  });
  const p = levels[12];   // colour row, shape col
  assert.deepEqual(M.hint(p, 0), { text: 'Look at the shape.', spot: 'col' });
  assert.deepEqual(M.hint(p, 1), { text: 'Each column has its own shape.', spot: 'col' });
  assert.deepEqual(M.hint(p, 2), { text: 'Each column has its own shape. Each row has its own colour.', spot: 'row' });
  assert.equal(M.hint(p, 3).spot, null);
});

test('readGrid() and readOptions(), word for word', () => {
  const cell = (count, size, colour, shape) => ({ shape, colour, count, size });
  const p = {
    grid: [
      cell(1, 'big', 'red', 'star'), cell(2, 'big', 'red', 'star'), cell(3, 'big', 'red', 'star'),
      cell(1, 'small', 'blue', 'ball'), cell(2, 'small', 'blue', 'ball'), cell(3, 'small', 'blue', 'ball'),
      cell(1, 'medium', 'green', 'cross'), cell(2, 'medium', 'green', 'cross'), cell(3, 'medium', 'green', 'cross'),
    ],
    options: [cell(1, 'big', 'red', 'star'), cell(2, 'big', 'red', 'star'), cell(3, 'big', 'red', 'star'), cell(1, 'small', 'red', 'star')],
  };
  assert.equal(M.readGrid(p), 'Top row: one big red star, two big red stars, three big red stars. Middle row: one small blue ball, two small blue balls, three small blue balls. Bottom row: one medium green cross, two medium green crosses, and the gap.');
  assert.equal(M.readOptions(p), 'Answer tiles, left to right: one big red star; two big red stars; three big red stars; one small red star.');
  levels.forEach((q) => {
    const d = q.grid.map(M.describe);
    assert.equal(M.readGrid(q), `Top row: ${d[0]}, ${d[1]}, ${d[2]}. Middle row: ${d[3]}, ${d[4]}, ${d[5]}. Bottom row: ${d[6]}, ${d[7]}, and the gap.`);
    assert.equal(M.readOptions(q), `Answer tiles, left to right: ${q.options.map(M.describe).join('; ')}.`);
  });
});

test('say: every message, word for word', () => {
  const stars = { shape: 'star', colour: 'red', count: 2, size: 'big' };
  assert.equal(M.say.start(3), 'Level 3. Which tile fits the gap?');
  assert.equal(M.say.picked(stars, 1, 5), 'Tile 2 of 5: two big red stars.');
  assert.equal(M.say.chosen(stars), 'Two big red stars. Tap it again, or the gap, to place it.');
  assert.equal(M.say.pickFirst(), 'Pick a tile from the tray first.');
  assert.equal(M.say.right(true), "That's it! First try!");
  assert.equal(M.say.right(false), "That's it!");
  assert.equal(M.say.wrong({ attr: 'colour', rule: { attr: 'colour', kind: 'row' }, text: 'Not that one. Look at the colour: each row has its own colour.' }), 'Not that one. Look at the colour: each row has its own colour.');
  assert.equal(M.say.wrong(M.whyWrong(levels[0], levels[0].options.findIndex((o) => o.colour !== levels[0].grid[8].colour))), 'Not that one. Look at the colour: each row has its own colour.');
  assert.equal(M.say.hint('Look at the colour.'), 'Hint: Look at the colour.');
  assert.equal(M.say.done(3, false, 1), 'Level 3 done, with a hint.');
  assert.equal(M.say.done(3, true, 1), 'Level 3 done, with a hint.');
  assert.equal(M.say.done(3, false, 2), 'Level 3 done, with hints.');
  assert.equal(M.say.done(3, true, 4), 'Level 3 done, with hints.');
  assert.equal(M.say.done(3, true, 0), 'Level 3 done, first try!');
  assert.equal(M.say.done(3, false, 0), 'Level 3 done!');
  assert.equal(M.say.out(), 'That tile is already out.');
  assert.equal(M.say.none('left'), 'No tile further left.');
  assert.equal(M.say.none('right'), 'No tile further right.');
  assert.equal(M.say.tries(2), 'Tries 2');
  assert.equal(M.say.menu(), 'Pick a puzzle.');
});

/* ------------------------------------------------------- page and world */

const SCRIPTS = [
  '../shared/3d/three.min.js', '../shared/3d/toon.js', '../shared/3d/critters.js', '../shared/3d/sound.js',
  '../shared/voice.js', 'matrix.js', 'world.js', 'game.js', '../../components.js',
];

test('the page loads the scripts in order, starts its title with the icon, and no game script touches storage or the network', () => {
  const page = path.join(GAME, 'index.html');
  assert.ok(fs.existsSync(page), 'games/missing-tile/index.html exists');
  const html = fs.readFileSync(page, 'utf8');
  let at = -1;
  for (const src of SCRIPTS) {
    const i = html.indexOf(`<script src="${src}"></script>`);
    assert.ok(i > at, `${src} is loaded, after the one before it`);
    at = i;
  }
  assert.match(html, /<h1><img class="title-icon" src="\.\.\/\.\.\/icons\/games\/missing-tile\.svg" alt="" width="40" height="40"> Missing Tile<\/h1>/);
  const banned = /localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\b|XMLHttpRequest|WebSocket|import\(/;
  for (const f of ['matrix.js', 'world.js', 'game.js', 'index.html']) {
    const file = path.join(GAME, f);
    assert.ok(fs.existsSync(file), `${f} exists`);
    const text = fs.readFileSync(file, 'utf8');
    const m = banned.exec(text);
    assert.equal(m, null, `${f} uses ${m && m[0]}`);
  }
});

test('world.js: layout by aspect and a finite orthographic framing, without a browser', () => {
  const world = path.join(GAME, 'world.js');
  assert.ok(fs.existsSync(world), 'games/missing-tile/world.js exists');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['three.min.js', 'toon.js']) vm.runInContext(fs.readFileSync(path.join(KIT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(world, 'utf8'), ctx, { filename: 'world.js' });
  const { World, THREE } = ctx;
  assert.ok(World, 'window.World is set');
  assert.equal(World.layout(1.5), 'wide');
  assert.equal(World.layout(0.6), 'tall');
  const view = World.frameView(new THREE.OrthographicCamera(), 390, 600, { top: 64, bottom: 76, left: 6, right: 6 }, 'tall');
  assert.ok(view && typeof view === 'object');
  for (const k of ['x', 'z', 'zoom']) assert.ok(Number.isFinite(view[k]), `${k} is a finite number`);
});
