/* Net Folding tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/net-folding/nets.js and check the folding
 * against things known independently: the 11 cube nets drawn by hand, the
 * known numbers of nets of each solid, closed surfaces, opposite faces, the
 * dice rule, and exactly one right answer in every question. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const N = require(path.join(__dirname, '..', '..', 'games', 'net-folding', 'nets.js'));

// '#' marks a square
const cells = (rows) => {
  const out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') out.push({ x, y }); }));
  return out;
};
const D4 = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
const ivec = (v) => v.map((x) => Math.round(x) + 0);

// the 11 nets of a cube, drawn by hand
const CUBE_NETS = [
  ['#...', '####', '#...'], ['#...', '####', '.#..'], ['#...', '####', '..#.'], ['#...', '####', '...#'],
  ['.#..', '####', '.#..'], ['.#..', '####', '..#.'],
  ['##..', '.###', '.#..'], ['##..', '.###', '..#.'], ['##..', '.###', '...#'],
  ['##..', '.##.', '..##'],
  ['###..', '..###'],
];

test('35 hexominoes, and exactly the 11 cube nets fold into a cube', () => {
  const hex = N.polyominoes(6);
  assert.equal(hex.length, 35);
  assert.equal(new Set(hex.map(N.shapeKey)).size, 35, 'no two hexominoes are the same shape turned or flipped');
  const want = new Set(CUBE_NETS.map((rows) => N.shapeKey(cells(rows))));
  assert.equal(want.size, 11, 'the hand-drawn nets are 11 different shapes');
  let folds = 0;
  for (const h of hex) {
    const key = N.shapeKey(h);
    // every way round on the page gives the same answer
    const answers = D4.map((m) => N.fold(N.netFromCells(N.turnCells(h, m))).valid);
    assert.ok(answers.every((a) => a === answers[0]), `${key} folds one way round but not another`);
    assert.equal(answers[0], want.has(key), `${key} ${answers[0] ? 'folds' : 'does not fold'} into a cube`);
    if (answers[0]) folds++;
  }
  assert.equal(folds, 11);
  const C = N.catalogue();
  assert.equal(C.hexominoes.filter((h) => h.net).length, 11);
  // a 2×2 block or five in a row can never fold up
  for (const h of C.hexominoes) if (h.block || h.run >= 5) assert.equal(h.net, false);
});

test('folding a cube net: every square on its own face, opposite faces where they should be', () => {
  // the cross: middle M, arms up U, left L, right R, down D, and a tail T under D
  const net = N.netFromCells(cells(['.#.', '###', '.#.', '.#.']));
  const at = (x, y) => net.faces.findIndex((f) => f.cell.x === x && f.cell.y === y);
  const M = at(1, 1);
  const opp = N.opposites(net);
  assert.equal(opp[at(1, 0)], at(1, 2), 'up is opposite down');
  assert.equal(opp[at(0, 1)], at(2, 1), 'left is opposite right');
  assert.equal(opp[M], at(1, 3), 'the middle is opposite the tail');
  for (const rows of CUBE_NETS) {
    for (const m of D4) {
      const n = N.netFromCells(N.turnCells(cells(rows), m));
      const r = N.fold(n);
      assert.ok(r.valid);
      const normals = r.faces.map((f) => ivec(f.normal).join(','));
      assert.equal(new Set(normals).size, 6, 'six different faces');
      const o = N.opposites(n);
      o.forEach((j, i) => {
        assert.equal(o[j], i, 'opposite works both ways');
        assert.notEqual(j, i);
      });
      // squares side by side on the page end up side by side on the cube; the two ends of a row of three end up opposite
      const has = (x, y) => n.faces.findIndex((f) => f.cell.x === x && f.cell.y === y);
      n.faces.forEach((f, i) => {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const j = has(f.cell.x + dx, f.cell.y + dy);
          if (j < 0) continue;
          const d = r.faces[i].normal.reduce((s, x, k) => s + x * r.faces[j].normal[k], 0);
          assert.ok(Math.abs(d) < 1e-9, 'neighbours on the page meet at a right angle');
          const k = has(f.cell.x + 2 * dx, f.cell.y + 2 * dy);
          if (k >= 0) assert.equal(o[i], k, 'the ends of a row of three are opposite');
        }
      });
    }
  }
});

// every edge of every folded face is shared with exactly one other face: a closed surface
function closed(r) {
  return r.faces.every((f, i) => f.pts3.every((p, k) => {
    const q = f.pts3[(k + 1) % f.pts3.length];
    const others = r.faces.filter((g, j) => j !== i && g.pts3.some((a, e) => {
      const b = g.pts3[(e + 1) % g.pts3.length];
      return (near(a, p) && near(b, q)) || (near(a, q) && near(b, p));
    }));
    return others.length === 1;
  }));
}

test('the other solids: the known numbers of nets, each folding to a closed solid', () => {
  const C = N.catalogue();
  const known = { cube: 11, tetra: 2, pyramid: 8, prism: 9, cuboid: 54 };
  for (const kind of Object.keys(known)) {
    const nets = C.nets[kind];
    assert.equal(nets.length, known[kind], `${kind} nets`);
    assert.equal(new Set(nets.map(N.netKey)).size, nets.length, `${kind}: no two nets the same shape`);
    for (const net of nets) {
      assert.equal(net.solid, kind);
      const r = N.fold(net);
      assert.ok(r.valid, `a ${kind} net does not fold`);
      assert.equal(net.faces.length, N.SOLIDS[kind].faces);
      assert.equal(new Set(r.on).size, net.faces.length, 'each face lands on a different face of the solid');
      assert.ok(closed(r), `a ${kind} net leaves an open edge`);
      assert.equal(N.crowdedCorner(net), null, 'no corner of a good net is crowded');
      // flat on the page: no two faces overlap
      net.faces.forEach((f, i) => net.faces.forEach((g, j) => {
        if (j > i) assert.ok(overlapArea(f.pts, g.pts) < 1e-6, `two faces of a ${kind} net overlap on the page`);
      }));
    }
  }
  // near misses have the right faces but do not close
  for (const kind of ['tetra', 'pyramid', 'prism', 'cuboid']) {
    assert.ok(C.misses[kind].length >= 1, `${kind} has near misses`);
    for (const net of C.misses[kind]) {
      const r = N.fold(net);
      assert.equal(r.valid, false);
      assert.ok(r.overlaps.length + r.stray.length > 0 && r.gaps.length > 0, 'a miss overlaps or sticks out, and leaves a gap');
      assert.equal(closed(r), false);
    }
  }
});

test('fold angles: 180° take away the angle between the faces of the solid', () => {
  const deg = (r) => Math.round((r * 180) / Math.PI * 100) / 100;
  assert.equal(deg(N.foldAngle('cube', 'sq', 'sq')), 90);
  assert.equal(deg(N.foldAngle('tetra', 'tri', 'tri')), 109.47);
  assert.equal(deg(N.foldAngle('pyramid', 'sq', 'tri')), 125.26);
  assert.equal(deg(N.foldAngle('pyramid', 'tri', 'tri')), 70.53);
  assert.equal(deg(N.foldAngle('prism', 'rect', 'rect')), 120);
  assert.equal(deg(N.foldAngle('prism', 'tri', 'rect')), 90);
  // and each hinge turns its face below its parent, about their shared edge
  const net = N.catalogue().nets.pyramid[0];
  const r = N.fold(net);
  r.hinges.forEach((h, k) => {
    if (k) assert.ok(h.depth >= r.hinges[k - 1].depth, 'hinges fold nearest the first face first');
    const f = net.faces[h.face];
    const p = net.faces[h.parent];
    for (const end of [h.a, h.b]) {
      assert.ok(f.pts.some((q) => Math.hypot(q[0] - end[0], q[1] - end[1]) < 1e-9));
      assert.ok(p.pts.some((q) => Math.hypot(q[0] - end[0], q[1] - end[1]) < 1e-9));
    }
    assert.ok(r.faces[h.face].centre[1] < r.faces[h.parent].centre[1] + 1e-9 || h.depth > 1);
  });
  assert.ok(r.faces.slice(1).every((f) => f.centre[1] < 0), 'everything folds down, away from the print');
});

test('cube colourings: 24 turns, mirror images and arrows', () => {
  assert.equal(N.ROTATIONS.length, 24);
  assert.equal(new Set(N.ROTATIONS.map((R) => R.join(','))).size, 24);
  const axes = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const cube = axes.map((n, i) => ({ n, colour: i, pips: undefined, arrow: i === 0 ? [1, 0, 0] : null }));
  for (const R of N.ROTATIONS) assert.ok(N.sameCube(N.turnCube(cube, R), cube), 'a turned cube is the same cube');
  assert.equal(N.sameCube(N.mirrorCube(cube), cube), false, 'six colours: the mirror image is a different cube');
  const turned = cube.map((f, i) => (i === 0 ? Object.assign({}, f, { arrow: [0, 0, 1] }) : f));
  assert.equal(N.sameCube(turned, cube), false, 'an arrow a quarter turn round is a different cube');
  assert.ok(N.sameCube(turned, cube, false), 'but the colours alone match');
  // painting a net to match a cube, then folding it, gives that cube back, on every net and every turn
  for (const rows of CUBE_NETS) {
    for (const R of N.ROTATIONS) {
      const net = N.paint(cells(rows), cube, R);
      assert.ok(N.sameCube(N.cubeOf(net), cube));
    }
    const mirror = N.paint(cells(rows).map((c) => ({ x: -c.x, y: c.y })), N.mirrorCube(cube), N.ROTATIONS[5]);
    assert.equal(N.sameCube(N.cubeOf(mirror), cube), false);
  }
});

test('dice: opposite faces of a real die add up to 7', () => {
  const axes = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const die = axes.map((n, i) => ({ n, colour: undefined, pips: [1, 6, 2, 5, 3, 4][i], arrow: null }));
  for (const rows of CUBE_NETS) {
    for (const R of N.ROTATIONS) {
      const net = N.paint(cells(rows), die, R);
      assert.ok(N.dieCheck(net).ok, 'a real die on every net');
      const opp = N.opposites(net);
      net.faces.forEach((f, i) => assert.equal(f.pips + net.faces[opp[i]].pips, 7));
    }
  }
  // swap two numbers on faces that meet: two pairs break
  const net = N.paint(cells(CUBE_NETS[4]), die, N.ROTATIONS[0]);
  const opp = N.opposites(net);
  const j = net.faces.findIndex((f, k) => k !== 0 && k !== opp[0]);
  const swapped = Object.assign({}, net, { faces: net.faces.map((f, k) => Object.assign({}, f, { pips: k === 0 ? net.faces[j].pips : k === j ? net.faces[0].pips : f.pips })) });
  const d = N.dieCheck(swapped);
  assert.equal(d.ok, false);
  assert.notEqual(d.bad[0] + d.bad[1], 7);
  // the trap: 1 and 6 at the two ends of a row of four meet round the side
  const trap = N.netFromCells(cells(['#...', '####', '...#']).map((c, k) => Object.assign(c, { pips: [2, 1, 3, 4, 6, 5][k] })));
  assert.equal(N.dieCheck(trap).ok, false);
});

test('every question has exactly one right answer, and no two choices alike', () => {
  for (let g = 0; g < N.GROUPS.length; g++) {
    for (let seed = 1; seed <= 6; seed++) {
      for (let i = 0; i < 12; i++) {
        const q = N.question(g, seed, i);
        const n = q.choices.length;
        assert.equal(n, i < 2 ? 3 : 4, `group ${g} question ${i}`);
        const right = q.choices.map((c, k) => N.why(q, k).ok);
        assert.equal(right.filter(Boolean).length, 1, `group ${g} seed ${seed} question ${i}`);
        assert.equal(right.indexOf(true), q.answer);
        if (i < 2) {
          const again = N.question(g, seed, i);
          assert.equal(JSON.stringify(again.choices), JSON.stringify(q.choices), 'the same seed gives the same question');
          assert.equal(again.answer, q.answer);
        }
        if (q.kind === 'opposite') {
          assert.equal(N.opposites(q.net)[q.red], q.net.faces.findIndex((f) => f.colour === q.choices[q.answer]));
          continue;
        }
        if (q.kind === 'solid') assert.ok(N.fold(q.target.net).valid);
        if (q.kind === 'match') assert.ok(N.sameCube(N.cubeOf(q.target.net), q.cube));
        if (q.kind === 'cube' || q.kind === 'solid') assert.equal(new Set(q.choices.map(N.netKey)).size, n);
        for (const net of q.choices) {
          net.faces.forEach((f, a) => net.faces.forEach((h, b) => {
            if (b > a) assert.equal(overlapArea(f.pts, h.pts) > 1e-6, false, 'faces overlap on the page');
          }));
        }
      }
    }
  }
});

// area shared by two convex polygons, by clipping one against the other
function overlapArea(A, B) {
  const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  const ccw = (p) => (p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) > 0 ? p : p.slice().reverse());
  let out = ccw(A);
  const clip = ccw(B);
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inp = out;
    out = [];
    inp.forEach((p, k) => {
      const q = inp[(k + 1) % inp.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    });
  }
  return out.length > 2 ? area(out) : 0;
}

test('every message, word for word', () => {
  const q = N.question(0, 7, 3);
  const ok = q.answer;
  assert.equal(N.check(q, ok).text, `Yes! Net ${N.LETTERS[ok]} folds into a cube: every square lands on its own face.`);
  const no = (ok + 1) % q.choices.length;
  assert.match(N.check(q, no).text, new RegExp(`^Not quite\\. .* Net ${N.LETTERS[ok]} is the one: choose it to watch it fold\\.$`));
  assert.equal(N.say.ask(2, 8, 'Which net folds into a cube?'), 'Question 2 of 8. Which net folds into a cube?');
  assert.equal(N.say.dieBad('B', 2, 4), 'In net B, 2 ends up opposite 4, and 2 + 4 = 6, not 7.');
  assert.equal(N.say.count('A', 5, 'cuboid'), 'Net A has five faces, but a cuboid has six.');
  assert.equal(N.say.other('C', 'prism', 'pyramid'), 'Net C folds into a triangular prism, not a square-based pyramid.');
  assert.equal(N.say.sides('D', 'left side', 'front'), 'Net D folds two squares onto the left side of the cube, leaving the front open.');
  assert.equal(N.say.oppBad(1), 'Blue folds up next to red.');
  assert.equal(N.say.pointColour(2), 'Green is opposite red.');
  assert.equal(N.say.done(7, 8, 5), 'Round complete: 7 of 8 right first time. Best streak this visit: 5.');
  assert.equal(N.say.prompt.solid('tetra'), 'Which net folds into this tetrahedron?');
});
