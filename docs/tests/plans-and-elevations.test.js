/* Plans & Elevations tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/plans-and-elevations/views.js and prove the
 * views are computed the exam way, every level can be built, and the fewest
 * and most cubes are exactly right (checked against brute force). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const V = require(path.join(__dirname, '..', '..', 'games', 'plans-and-elevations', 'views.js'));

const levels = V.LEVELS.map((L, i) => V.level(i));
const rowsOf = (h, w) => {
  const out = [];
  for (let i = 0; i < h.length; i += w) out.push(h.slice(i, i + w).join(''));
  return out;
};

// every height map allowed by the caps, checked against the views: count, fewest, most
function brute(v, limit) {
  const cap = V.caps(v);
  const cells = cap.map((c, i) => i).filter((i) => cap[i] > 0);
  let space = 1;
  for (const i of cells) space *= cap[i];
  if (space > (limit || 2e6)) return null;
  const h = new Array(cap.length).fill(0);
  const out = { total: 0, min: Infinity, max: -Infinity, byCount: {} };
  const walk = (k) => {
    if (k === cells.length) {
      if (V.compare(v, V.views(v.w, v.d, h)).all) {
        const n = V.count(h);
        out.total++;
        out.min = Math.min(out.min, n);
        out.max = Math.max(out.max, n);
        out.byCount[n] = (out.byCount[n] || 0) + 1;
      }
      return;
    }
    for (let a = 1; a <= cap[cells[k]]; a++) {
      h[cells[k]] = a;
      walk(k + 1);
    }
  };
  walk(0);
  return out;
}

/* The fewest cubes by a different route: every column picks the square that
 * reaches its front height, every row the square that reaches its side
 * height, everything else is one cube; keep the cheapest consistent choice. */
function fewestByWitnesses(v) {
  const { w, d, plan, front, side } = v;
  const colOpts = [];
  for (let x = 0; x < w; x++) {
    const o = [];
    for (let z = 0; z < d; z++) if (plan[z * w + x] && side[z] >= front[x]) o.push(z);
    colOpts.push(o);
  }
  const rowOpts = [];
  for (let z = 0; z < d; z++) {
    const o = [];
    for (let x = 0; x < w; x++) if (plan[z * w + x] && front[x] >= side[z]) o.push(x);
    rowOpts.push(o);
  }
  let best = Infinity;
  const colPick = new Array(w).fill(0);
  const rowPick = new Array(d).fill(0);
  const tryRows = (z, h) => {
    if (z === d) {
      if (V.compare(v, V.views(w, d, h)).all) best = Math.min(best, V.count(h));
      return;
    }
    if (side[z] === 0) return tryRows(z + 1, h);
    for (const x of rowOpts[z]) {
      const i = z * w + x;
      if (h[i] > 1 && h[i] !== side[z]) continue;
      const keep = h[i];
      h[i] = side[z];
      tryRows(z + 1, h);
      h[i] = keep;
    }
  };
  const tryCols = (x, h) => {
    if (x === w) return tryRows(0, h);
    if (front[x] === 0) return tryCols(x + 1, h);
    for (const z of colOpts[x]) {
      const i = z * w + x;
      const keep = h[i];
      h[i] = front[x];
      tryCols(x + 1, h);
      h[i] = keep;
    }
  };
  tryCols(0, plan.map((p) => (p ? 1 : 0)));
  void colPick;
  void rowPick;
  return best;
}

test('24 levels in four groups of six, growing from 3 by 3 to 5 by 4', () => {
  assert.equal(V.LEVELS.length, 24);
  assert.deepEqual(V.GROUPS.map((g) => [g.from, g.to]), [[0, 6], [6, 12], [12, 18], [18, 24]]);
  levels.forEach((lv, i) => {
    const tag = `level ${i + 1}`;
    assert.ok(lv.w >= 3 && lv.w <= 5 && lv.d >= 3 && lv.d <= 4, `${tag} size ${lv.w}x${lv.d}`);
    assert.ok(lv.top >= 2 && lv.top <= V.TOP, `${tag} ceiling ${lv.top}`);
    assert.ok(Math.max(...lv.hidden) <= lv.top, `${tag} is taller than its ceiling`);
    assert.ok(lv.target.front.every((k) => k > 0) && lv.target.side.some((k) => k > 0), `${tag} has an empty column`);
    // no floating cubes, by construction: a structure is just a height per square
    lv.hidden.forEach((k) => assert.ok(Number.isInteger(k) && k >= 0));
    if (i < 6) {
      assert.equal(lv.w * lv.d, 9, `${tag}: warm-ups are 3 by 3`);
      assert.ok(Math.max(...lv.hidden) <= 3, `${tag}: warm-ups are low`);
      assert.equal(lv.shapes, 1, `${tag}: warm-ups have exactly one answer`);
    }
    assert.equal(lv.goal, i >= 18 ? 'fewest' : 'match', `${tag} goal`);
    if (i >= 18) assert.equal(V.count(lv.hidden), lv.min, `${tag}: the hidden shape uses the fewest cubes`);
    if (i >= 12 && i < 18) assert.ok(lv.w * lv.d >= 16, `${tag}: hard levels are 4 by 4 or bigger`);
    if (i >= 18) assert.ok(lv.w * lv.d >= levels[i - 1].w * levels[i - 1].d || i === 18, `${tag}: fewest-cubes levels grow`);
  });
  // the hard levels really are harder to read than the warm-ups: more squares and taller
  const area = (a, b) => levels.slice(a, b).reduce((s, lv) => s + lv.target.plan.filter(Boolean).length, 0) / (b - a);
  assert.ok(area(12, 18) > area(6, 12) && area(6, 12) > area(0, 6));
  // each level is different
  assert.equal(new Set(V.LEVELS.map((L) => L.rows.join('/'))).size, 24);
});

test('views are drawn the exam way: plan from above, front from the front, side from the right', () => {
  // back row first:  . 2 .  /  1 1 1  /  . . .
  const s = V.shape(['020', '111', '000']);
  const v = V.views(s.w, s.d, s.h);
  assert.deepEqual(v.plan, [false, true, false, true, true, true, false, false, false]);
  assert.deepEqual(v.front, [1, 2, 1]);
  assert.deepEqual(v.side, [2, 1, 0], 'side heights, back row first');
  // the side drawing is seen from the right, so the FRONT row is its left-hand column
  const side = V.picture('side', v, 3);
  assert.deepEqual(side.labels, ['1', '2', '3']);
  assert.deepEqual(side.on, [
    false, false, false,
    false, false, true,
    false, true, true,
  ]);
  const front = V.picture('front', v, 3);
  assert.deepEqual(front.labels, ['A', 'B', 'C']);
  assert.deepEqual(front.on, [
    false, false, false,
    false, true, false,
    true, true, true,
  ]);
  const plan = V.picture('plan', v, 3);
  assert.deepEqual(plan.on, v.plan, 'plan rows run back to front, so the front edge is at the bottom');
  assert.deepEqual(plan.side, ['3', '2', '1']);
  assert.equal(V.square(0, 2, 3), 'A1', 'A1 is the front-left square');
  assert.equal(V.square(2, 0, 3), 'C3');
  // a tall cube hidden behind a taller one changes neither elevation
  const a = V.views(3, 3, V.shape(['030', '020', '010']).h);
  const b = V.views(3, 3, V.shape(['030', '010', '010']).h);
  assert.deepEqual(a.front, b.front);
  assert.deepEqual(a.side, [3, 2, 1]);
  assert.deepEqual(b.side, [3, 1, 1]);
  const m = V.compare(a, b);
  assert.deepEqual([m.plan, m.front, m.side, m.all, m.n], [true, true, false, false, 2]);
});

test('every level can be built: its hidden shape, the fewest and the most all match the views', () => {
  levels.forEach((lv, i) => {
    const tag = `level ${i + 1}`;
    const { w, d, target } = lv;
    assert.ok(V.possible(target), `${tag} is impossible`);
    assert.ok(V.compare(target, V.views(w, d, lv.hidden)).all, `${tag}: hidden shape`);
    const lo = V.fewest(target);
    const hi = V.most(target);
    assert.ok(V.compare(target, V.views(w, d, lo)).all, `${tag}: fewest shape ${rowsOf(lo, w)}`);
    assert.ok(V.compare(target, V.views(w, d, hi)).all, `${tag}: most shape`);
    assert.equal(V.count(lo), lv.min);
    assert.equal(V.count(hi), lv.max);
    assert.ok(lv.min <= V.count(lv.hidden) && V.count(lv.hidden) <= lv.max);
    assert.ok(hi.every((k) => k <= lv.top), `${tag}: the most shape fits under the ceiling`);
    // the nearest fit to an empty baseplate is a real answer too
    const near = V.nearest(target, V.blank(w, d), lv.goal === 'fewest');
    assert.ok(V.compare(target, V.views(w, d, near)).all, `${tag}: nearest`);
    if (lv.goal === 'fewest') assert.equal(V.count(near), lv.min);
    assert.equal(lv.bonus, lv.goal === 'match' && lv.min < lv.max);
  });
});

test('the fewest and most cubes are exact: brute force agrees on every level small enough', () => {
  let checked = 0;
  levels.forEach((lv, i) => {
    const b = brute(lv.target, 3e6);
    if (!b) return;
    checked++;
    assert.equal(b.min, lv.min, `level ${i + 1} fewest`);
    assert.equal(b.max, lv.max, `level ${i + 1} most`);
    assert.equal(b.total, lv.shapes, `level ${i + 1} number of shapes`);
    assert.equal(b.byCount[lv.min], lv.fewestShapes, `level ${i + 1} shapes with the fewest cubes`);
  });
  assert.ok(checked >= 20, `only ${checked} levels were small enough to brute force`);
});

test('the fewest cubes match a second, independent method on every level', () => {
  levels.forEach((lv, i) => {
    assert.equal(fewestByWitnesses(lv.target), lv.min, `level ${i + 1}`);
  });
});

test('fewest, most and the shape count agree with brute force on 300 random structures', () => {
  const rand = V.rng(2026);
  let checked = 0;
  for (let n = 0; n < 400 && checked < 300; n++) {
    const w = 2 + Math.floor(rand() * 3);
    const d = 2 + Math.floor(rand() * 2);
    const h = [];
    for (let i = 0; i < w * d; i++) h.push(rand() < 0.25 ? 0 : 1 + Math.floor(rand() * 3));
    const v = V.views(w, d, h);
    const b = brute(v, 20000);
    if (!b) continue;
    checked++;
    const tag = `${w}x${d} ${rowsOf(h, w).join('/')}`;
    assert.ok(V.possible(v), tag);
    assert.equal(V.count(V.fewest(v)), b.min, `${tag} fewest`);
    assert.equal(V.count(V.most(v)), b.max, `${tag} most`);
    assert.equal(fewestByWitnesses(v), b.min, `${tag} witnesses`);
    const c = V.census(v);
    assert.equal(c.total, b.total, `${tag} shapes`);
    assert.deepEqual(c.byCount, b.byCount, `${tag} shapes by cubes`);
  }
  assert.equal(checked, 300);
  // views that no structure can have are spotted
  assert.equal(V.possible({ w: 2, d: 1, plan: [true, false], front: [1, 1], side: [1] }), false);
  assert.equal(V.possible({ w: 2, d: 2, plan: [true, false, false, true], front: [2, 1], side: [1, 2] }), false);
});

test('hints: the first names a wrong view, the next a square, and following them always finishes', () => {
  levels.forEach((lv, i) => {
    const tag = `level ${i + 1}`;
    const { w, d } = lv;
    let h = V.blank(w, d);
    const first = V.hint(lv, h, 0);
    assert.equal(first.kind, 'view', tag);
    assert.equal(first.view, 'plan', `${tag}: an empty baseplate first misses a plan square`);
    let steps = 0;
    for (; steps < 80; steps++) {
      const r = V.hint(lv, h, 1);
      if (r.kind === 'done') break;
      assert.equal(r.kind, 'square', tag);
      const { x, z, to } = r.squares[0];
      assert.notEqual(h[z * w + x], to, `${tag}: a hint must change something`);
      assert.ok(to >= 0 && to <= lv.top, `${tag}: hint height ${to}`);
      h = h.slice();
      h[z * w + x] = to;
    }
    assert.ok(steps < 80, `${tag}: hints went round in circles`);
    assert.ok(V.compare(lv.target, V.views(w, d, h)).all, `${tag}: hints did not finish`);
    if (lv.goal === 'fewest') assert.equal(V.count(h), lv.min, `${tag}: hints did not reach the fewest`);
    assert.equal(V.hint(lv, h, 0).text, V.say.hintDone());
  });
  // on star levels, hints can aim for the fewest or the most cubes, and following them gets there
  levels.filter((lv) => lv.bonus).forEach((lv) => {
    for (const aim of ['fewest', 'most']) {
      let h = V.blank(lv.w, lv.d);
      for (let k = 0; k < 80; k++) {
        const r = V.hint(lv, h, 1, aim);
        if (r.kind === 'done') break;
        h = h.slice();
        h[r.squares[0].z * lv.w + r.squares[0].x] = r.squares[0].to;
      }
      assert.ok(V.compare(lv.target, V.views(lv.w, lv.d, h)).all, `level ${lv.index + 1} aiming for the ${aim}`);
      assert.equal(V.count(h), aim === 'fewest' ? lv.min : lv.max, `level ${lv.index + 1} aiming for the ${aim}`);
    }
    const r = V.hint(lv, V.fewest(lv.target), 0, 'most');
    assert.equal(r.kind, 'most');
    assert.equal(r.text, V.say.hintMost(lv.max, lv.min));
    assert.equal(V.hint(lv, V.most(lv.target), 0, 'most').kind, 'done');
  });
  // a fewest-cubes level built with the most cubes: views match, the hint says how to save cubes
  const lv = levels[18];
  const hi = V.most(lv.target);
  const r = V.hint(lv, hi, 0);
  assert.equal(r.kind, 'fewest');
  assert.equal(r.text, V.say.hintFewest(lv.min, V.count(hi)));
  assert.equal(V.hint(lv, hi, 1).kind, 'square');
  // too tall from the front
  const lv2 = levels[1];
  const tall = lv2.hidden.slice();
  tall[8] = 3;
  const t = V.hint(lv2, tall, 0);
  assert.equal(t.view, 'front');
  assert.equal(t.text, 'Hint: from the front, column C should be only 1 high, but it has a stack of 3.');
  assert.deepEqual(t.squares.map((s) => V.square(s.x, s.z, lv2.d)), ['C3', 'C2', 'C1']);
});

test('the quiz: three different drawings, exactly one of them right, for 60 seeds', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const qs = V.quiz(seed);
    assert.equal(qs.length, 8);
    assert.deepEqual(V.quiz(seed).map((q) => q.answer), qs.map((q) => q.answer), 'the same seed gives the same quiz');
    qs.forEach((q, k) => {
      const tag = `seed ${seed} question ${k + 1}`;
      const v = V.views(q.w, q.d, q.h);
      const right = V.picture(q.ask, v, q.top);
      assert.equal(q.options.length, 3, tag);
      assert.ok(V.samePicture(q.options[q.answer].pic, right), `${tag}: the answer is not the ${q.ask}`);
      q.options.forEach((o, j) => {
        if (j !== q.answer) {
          assert.ok(!V.samePicture(o.pic, right), `${tag}: two right answers`);
          assert.ok(V.say.quizWhy(o, q.ask).length > 10, tag);
        }
        q.options.forEach((p, m) => { if (m > j) assert.ok(!V.samePicture(o.pic, p.pic), `${tag}: two options look the same`); });
        assert.equal(o.pic.on.length, o.pic.cols * o.pic.rows);
      });
      assert.ok(Math.max(...q.h) <= q.top);
    });
    assert.deepEqual(qs.map((q) => q.ask), ['front', 'side', 'plan', 'front', 'side', 'plan', 'front', 'side']);
  }
  // answers are not always in the same place
  const places = new Set();
  for (let seed = 1; seed <= 10; seed++) V.quiz(seed).forEach((q) => places.add(q.answer));
  assert.deepEqual([...places].sort(), [0, 1, 2]);
});

test('every message, word for word', () => {
  const s = V.say;
  assert.equal(s.start(3, '', 'match'), 'Level 3. Build a shape that matches all three views.');
  assert.equal(s.start(20, '', 'fewest'), 'Level 20. Match all three views with as few cubes as you can.');
  assert.equal(s.start(1, 'Tap a square.', 'match'), 'Level 1. Tap a square.');
  assert.equal(s.edit('B2', 2, 1), 'B2 is 2 cubes high. 1 of 3 views match.');
  assert.equal(s.edit('A1', 1, 3), 'A1 is 1 cube high. All 3 views match.');
  assert.equal(s.edit('C3', 0, 0), 'C3 is empty. 0 of 3 views match.');
  assert.equal(s.tooTall('B2', 3), 'B2 is already 3 high, the tallest allowed here.');
  assert.equal(s.solved(7, 9), 'All three views match! Level 7 solved with 9 cubes.');
  assert.equal(s.solvedFewest(19, 12), 'All three views match with 12 cubes, the fewest possible! Level 19 solved.');
  assert.equal(s.notFewest(14, 12), "All three views match with 14 cubes, but it can be done with 12. Which cubes can't be seen in any view?");
  assert.equal(s.star('fewest', 10), 'Fewest-cubes star! 10 is the fewest possible.');
  assert.equal(s.star('most', 12), 'Most-cubes star! 12 is the most possible.');
  assert.equal(s.shapes(1), 'Only one shape has these three views, so this was pure deduction.');
  assert.equal(s.shapes(5), '5 different shapes have exactly these three views. Any of them counts.');
  assert.equal(s.hintPlan('B3', true), 'Hint: the plan shows a square at B3, but you have no cubes there.');
  assert.equal(s.hintPlan('B3', false), 'Hint: the plan has no square at B3, so it must stay empty.');
  assert.equal(s.hintSide(2, 3, 1), 'Hint: from the side, row 2 should be 3 high, but its tallest stack is 1.');
  assert.equal(s.hintSquare('C1', 2), 'Hint: try making C1 2 cubes high.');
  assert.equal(s.hintSquare('C1', 0), 'Hint: try making C1 empty.');
  assert.equal(s.turn(0), 'Looking from the front.');
  assert.equal(s.turn(2), 'Looking from the right side.');
  assert.equal(s.turn(-1), 'Looking from the front left.');
  assert.equal(s.quizAsk(2, 8, 'side'), 'Question 2 of 8: which drawing is the side elevation?');
  assert.equal(s.quizRight('plan'), "Yes! That's the plan.");
  assert.equal(s.quizDone(7, 8), '7 out of 8 right.');
  const lv = levels[2];
  assert.equal(V.describe('plan', lv.target), 'Plan, from above: squares A2, B2, C2 and B3 covered.');
  assert.equal(V.describe('front', lv.target), 'Front elevation: column A 1 high, column B 2 high, column C 1 high.');
  assert.equal(V.describe('side', lv.target), 'Side elevation, from the right: row 1 0 high, row 2 1 high, row 3 2 high.');
});
