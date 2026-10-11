/* Net Folding: the maths, with no 3D library and no page.
 *
 * A net is a set of flat faces (squares, rectangles, triangles) joined in a
 * tree by hinges: every face but the first hangs off its parent along one
 * shared edge. fold() really folds it: each face turns about its hinge by
 * the fold angle for that pair of shapes, carrying its own flaps with it.
 * The faces' final places are then compared with the solid built on the
 * first face, which tells which net faces land on which faces of the solid,
 * which overlap, which stick out and which faces are left open. Cube
 * colourings are compared under the cube's 24 turns, arrows included, and
 * dice are checked against the rule that opposite faces add up to 7. The
 * question streams and every message live here too, so the tests prove them.
 *
 * Coordinates: a net lies in the plane y = 0 with its printed side up (+y);
 * net point (u, v) is the 3D point (u, 0, v), so v runs towards the viewer.
 * Faces fold downwards, away from the print, so the print ends up on the
 * outside and the solid hangs below the first face.
 *
 * In the page this sets window.Nets; in Node it is a CommonJS module.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ random */
  /* mulberry32: a tiny seedable generator, so any question can be replayed */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const streamSeed = (seed, group, index) =>
    (Math.imul((seed >>> 0) ^ 0x9e3779b9, 31) + Math.imul(group + 1, 0x85ebca6b) + Math.imul(index + 1, 0xc2b2ae35)) >>> 0;
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];
  function shuffle(rand, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }

  /* -------------------------------------------------------- 3D vectors */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => {
    const l = len(a);
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const avg = (ps) => ps.reduce((s, p) => add(s, p), [0, 0, 0]).map((x) => x / ps.length);
  const P3 = (q) => [q[0], 0, q[1]];                       // a net point, in 3D
  const ivec = (v) => v.map((x) => Math.round(x) + 0);     // + 0 turns -0 into 0
  const same3 = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

  /* 3×3 matrices, row by row */
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const mulv = (M, v) => [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
  function mul(A, B) {
    const C = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) C.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]);
    }
    return C;
  }
  const transpose = (M) => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
  const det = (M) => M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
  /* a turn of t radians about the unit axis d, right-handed (as Three.js turns) */
  function axisAngle(d, t) {
    const [x, y, z] = d;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const C = 1 - c;
    return [
      c + x * x * C, x * y * C - z * s, x * z * C + y * s,
      y * x * C + z * s, c + y * y * C, y * z * C - x * s,
      z * x * C - y * s, z * y * C + x * s, c + z * z * C,
    ];
  }
  /* the turn taking the perpendicular unit vectors a, b to a2, b2 */
  function turnTaking(a, b, a2, b2) {
    const c = cross(a, b);
    const c2 = cross(a2, b2);
    const M = [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
    const M2 = [a2[0], b2[0], c2[0], a2[1], b2[1], c2[1], a2[2], b2[2], c2[2]];
    return mul(M2, transpose(M));
  }

  /* The cube's 24 turns: every signed permutation matrix with determinant +1. */
  const ROTATIONS = (() => {
    const out = [];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) {
      for (let s = 0; s < 8; s++) {
        const M = new Array(9).fill(0);
        for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
        if (det(M) === 1) out.push(M);
      }
    }
    return out;
  })();

  /* ----------------------------------------------------- flat polygons */
  const SQ3 = Math.sqrt(3);
  const clean = (x) => Math.round(x * 1e9) / 1e9 + 0;
  function signedArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }
  const centre2 = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const near2 = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  const edgeLen = (pts, i) => {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  // do edge i of p and edge j of q join the same two points?
  function sameEdge(p, i, q, j) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const c = q[j];
    const d = q[(j + 1) % q.length];
    return (near2(a, c) && near2(b, d)) || (near2(a, d) && near2(b, c));
  }
  /* Separating-axis test for two convex polygons: true when their insides
   * overlap. Touching along an edge or at a corner is fine. */
  function overlap2(A, B) {
    for (const poly of [A, B]) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const ax = b[1] - a[1];
        const ay = a[0] - b[0];
        let minA = Infinity;
        let maxA = -Infinity;
        let minB = Infinity;
        let maxB = -Infinity;
        for (const p of A) {
          const d = p[0] * ax + p[1] * ay;
          minA = Math.min(minA, d);
          maxA = Math.max(maxA, d);
        }
        for (const p of B) {
          const d = p[0] * ax + p[1] * ay;
          minB = Math.min(minB, d);
          maxB = Math.max(maxB, d);
        }
        if (maxA <= minB + 1e-7 || maxB <= minA + 1e-7) return false;
      }
    }
    return true;
  }
  // the inside angle at corner i of a convex polygon
  function cornerAngle(pts, i) {
    const n = pts.length;
    const p = pts[i];
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    const u = [a[0] - p[0], a[1] - p[1]];
    const w = [b[0] - p[0], b[1] - p[1]];
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])))));
  }

  /* -------------------------------------------------------- building nets */
  const ROOTS = {
    sq: [[0, 0], [1, 0], [1, 1], [0, 1]],
    tri: [[0, 0], [1, 0], [0.5, SQ3 / 2]],
  };
  function startNet(solid, shape, extra) {
    return Object.assign({ solid, faces: [{ pts: ROOTS[shape].map((p) => p.slice()), shape, parent: -1, hinge: null }] }, extra || {});
  }
  /* A new net with one more face, hinged on edge `edge` of face `parent`:
   * an equilateral triangle, or a rectangle `depth` deep. Polygons run
   * anticlockwise (positive area), so outward is to the right of each edge. */
  function withFace(net, parent, edge, shape, depth) {
    const P = net.faces[parent].pts;
    const a = P[edge];
    const b = P[(edge + 1) % P.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    const n = [dy / L, -dx / L];
    let pts;
    let kind = shape;
    if (shape === 'tri') {
      pts = [b, a, [(a[0] + b[0]) / 2 + (n[0] * L * SQ3) / 2, (a[1] + b[1]) / 2 + (n[1] * L * SQ3) / 2]];
    } else {
      pts = [b, a, [a[0] + n[0] * depth, a[1] + n[1] * depth], [b[0] + n[0] * depth, b[1] + n[1] * depth]];
      kind = Math.abs(depth - L) < 1e-6 ? 'sq' : 'rect';
    }
    const face = { pts: pts.map((p) => [clean(p[0]), clean(p[1])]), shape: kind, parent, hinge: [a, b] };
    return Object.assign({}, net, { faces: net.faces.concat([face]) });
  }
  // does a newly added (last) face fit: no overlap, and no edge shared except its hinge
  function fits(net) {
    const k = net.faces.length - 1;
    const f = net.faces[k];
    for (let i = 0; i < k; i++) {
      const g = net.faces[i];
      if (overlap2(f.pts, g.pts)) return false;
      if (i === f.parent) continue;
      for (let e = 0; e < f.pts.length; e++) {
        for (let h = 0; h < g.pts.length; h++) if (sameEdge(f.pts, e, g.pts, h)) return false;
      }
    }
    return true;
  }

  /* ------------------------------------------------- squares on a grid */
  const ARROW2 = [[0, -1], [1, 0], [0, 1], [-1, 0]];        // up, right, down, left on the page
  const ARROW3 = ARROW2.map(P3);
  const arrowIndex = (x, y) => ARROW2.findIndex((d) => Math.abs(d[0] - x) < 1e-6 && Math.abs(d[1] - y) < 1e-6);
  /* the 8 ways to turn or flip the grid, as (x, y) -> (a x + b y, c x + d y) */
  const D4 = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
  function normCells(cells) {
    const mx = Math.min(...cells.map((c) => c.x));
    const my = Math.min(...cells.map((c) => c.y));
    return cells.map((c) => Object.assign({}, c, { x: c.x - mx, y: c.y - my })).sort((p, q) => p.y - q.y || p.x - q.x);
  }
  function turnCells(cells, m) {
    return normCells(cells.map((c) => {
      const out = Object.assign({}, c, { x: m[0] * c.x + m[1] * c.y, y: m[2] * c.x + m[3] * c.y });
      if (c.arrow != null) {
        const d = ARROW2[c.arrow];
        out.arrow = arrowIndex(m[0] * d[0] + m[1] * d[1], m[2] * d[0] + m[3] * d[1]);
      }
      return out;
    }));
  }
  const cellsKey = (cells) => normCells(cells).map((c) => c.x + ',' + c.y).join(' ');
  function shapeKey(cells) {
    let best = null;
    for (const m of D4) {
      const k = cellsKey(turnCells(cells, m));
      if (best === null || k < best) best = k;
    }
    return best;
  }
  const STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  /* A net of unit squares from grid cells. The first face (it stays put,
   * and becomes the top of the cube) is the square with most neighbours,
   * nearest the middle; the rest hang off it, breadth first. Labels on the
   * cells (colour, pips, arrow) travel with their squares. */
  function netFromCells(cells, solid) {
    const key = (x, y) => x + ',' + y;
    const at = new Map(cells.map((c, i) => [key(c.x, c.y), i]));
    const nbrs = (c) => STEPS.map(([dx, dy]) => at.get(key(c.x + dx, c.y + dy))).filter((j) => j != null);
    const mx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
    const my = cells.reduce((s, c) => s + c.y, 0) / cells.length;
    let first = 0;
    cells.forEach((c, i) => {
      const b = cells[first];
      const dn = nbrs(c).length - nbrs(b).length;
      const dd = Math.hypot(c.x - mx, c.y - my) - Math.hypot(b.x - mx, b.y - my);
      if (dn > 0 || (dn === 0 && dd < -1e-9)) first = i;
    });
    const order = [first];
    const parent = new Map([[first, -1]]);
    for (let k = 0; k < order.length; k++) {
      for (const j of nbrs(cells[order[k]])) {
        if (!parent.has(j)) {
          parent.set(j, order[k]);
          order.push(j);
        }
      }
    }
    const slot = new Map(order.map((ci, i) => [ci, i]));
    const faces = order.map((ci) => {
      const c = cells[ci];
      const pts = [[c.x, c.y], [c.x + 1, c.y], [c.x + 1, c.y + 1], [c.x, c.y + 1]];
      const pc = parent.get(ci);
      const face = { pts, shape: 'sq', parent: pc < 0 ? -1 : slot.get(pc), hinge: null, cell: { x: c.x, y: c.y } };
      if (pc >= 0) {
        const q = cells[pc];
        const qp = [[q.x, q.y], [q.x + 1, q.y], [q.x + 1, q.y + 1], [q.x, q.y + 1]];
        for (let e = 0; e < 4; e++) {
          const a = qp[e];
          const b = qp[(e + 1) % 4];
          if (pts.some((p) => near2(p, a)) && pts.some((p) => near2(p, b))) face.hinge = [a, b];
        }
      }
      for (const k of ['colour', 'pips', 'arrow']) if (c[k] != null) face[k] = c[k];
      return face;
    });
    return { solid: solid || 'cube', faces, cells: normCells(cells) };
  }

  /* All free polyominoes of n squares (35 hexominoes), grown one square at
   * a time and told apart by their shape under every turn and flip. */
  function polyominoes(n) {
    let level = new Map([['0,0', [{ x: 0, y: 0 }]]]);
    for (let k = 1; k < n; k++) {
      const next = new Map();
      for (const cells of level.values()) {
        const has = new Set(cells.map((c) => c.x + ',' + c.y));
        for (const c of cells) {
          for (const [dx, dy] of STEPS) {
            const x = c.x + dx;
            const y = c.y + dy;
            if (has.has(x + ',' + y)) continue;
            const grown = normCells(cells.concat([{ x, y }]));
            const key = shapeKey(grown);
            if (!next.has(key)) next.set(key, grown);
          }
        }
      }
      level = next;
    }
    return [...level.values()];
  }
  // the longest straight row or column, and whether four squares make a 2×2 block
  function runOf(cells) {
    const has = new Set(cells.map((c) => c.x + ',' + c.y));
    let best = 0;
    for (const c of cells) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let k = 0;
        while (has.has(c.x + dx * k + ',' + (c.y + dy * k))) k++;
        best = Math.max(best, k);
      }
    }
    return best;
  }
  const blockOf = (cells) => {
    const has = new Set(cells.map((c) => c.x + ',' + c.y));
    return cells.some((c) => has.has(c.x + 1 + ',' + c.y) && has.has(c.x + ',' + (c.y + 1)) && has.has(c.x + 1 + ',' + (c.y + 1)));
  };

  /* ------------------------------------------------------------ folding */
  const SOLIDS = {
    cube: { name: 'cube', faces: 6, corner: 1.5 * Math.PI },
    cuboid: { name: 'cuboid', faces: 6, corner: 1.5 * Math.PI },
    prism: { name: 'triangular prism', faces: 5, corner: (4 * Math.PI) / 3 },
    pyramid: { name: 'square-based pyramid', faces: 5, corner: (4 * Math.PI) / 3 },
    tetra: { name: 'tetrahedron', faces: 4, corner: Math.PI },
  };
  const PRISM_LENGTH = 1.5;           // the prism's rectangles are 1 by 1.5
  const CUBOID = [0.7, 1, 1.5];       // the cuboid's three edge lengths

  /* Each pair of face shapes folds by 180° take away the solid's angle
   * between those two faces (its dihedral angle). */
  function foldAngle(solid, a, b) {
    const pair = [a, b].sort().join('-');
    if (solid === 'tetra') return Math.PI - Math.acos(1 / 3);                                 // 109.47°
    if (solid === 'pyramid') return pair === 'tri-tri' ? Math.PI - Math.acos(-1 / 3) : Math.PI - Math.atan(Math.SQRT2); // 70.53°, 125.26°
    if (solid === 'prism') return pair === 'rect-rect' ? (2 * Math.PI) / 3 : Math.PI / 2;      // 120°, 90°
    return Math.PI / 2;
  }

  // the third edge length of the cuboid, once the base's two are known
  function otherDim(dims, a, b) {
    const left = dims.slice();
    for (const x of [a, b]) {
      const k = left.findIndex((d) => Math.abs(d - x) < 1e-6);
      if (k >= 0) left.splice(k, 1);
    }
    return left[0];
  }

  /* The solid the net should make, built on its first face and hanging
   * below it: prisms (cube, cuboid, triangular prism) drop straight down,
   * pyramids (square-based, tetrahedron) close on an apex. */
  function erect(net) {
    const base = net.faces[0].pts.map(P3);
    const s = len(sub(base[1], base[0]));
    let faces;
    if (net.solid === 'pyramid' || net.solid === 'tetra') {
      const h = net.solid === 'tetra' ? s * Math.sqrt(2 / 3) : s / Math.SQRT2;
      const c = avg(base);
      const apex = [c[0], -h, c[2]];
      faces = [base].concat(base.map((p, i) => [p, base[(i + 1) % base.length], apex]));
    } else {
      let h = s;
      if (net.solid === 'prism') h = net.length;
      if (net.solid === 'cuboid') h = otherDim(net.dims, s, len(sub(base[2], base[1])));
      const low = base.map((p) => [p[0], -h, p[2]]);
      faces = [base, low].concat(base.map((p, i) => {
        const j = (i + 1) % base.length;
        return [p, base[j], low[j], low[i]];
      }));
    }
    const all = [].concat(...faces);
    const lo = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k])));
    const hi = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k])));
    const centre = lo.map((x, k) => (x + hi[k]) / 2);
    const inside = avg(all);
    const normals = faces.map((f) => {
      const n = unit(cross(sub(f[1], f[0]), sub(f[2], f[0])));
      return dot(n, sub(avg(f), inside)) < 0 ? n.map((x) => -x + 0) : n;
    });
    return { faces, normals, centre, size: hi.map((x, k) => x - lo[k]) };
  }
  const samePoly = (a, b) => a.length === b.length && a.every((p) => b.some((q) => len(sub(p, q)) < 1e-5));

  /* Fold the net all the way. Each face's place is its parent's place, then
   * a turn about their shared edge, so a flap carries its own flaps along.
   * Returns where every face ends up, the hinges in folding order (nearest
   * the first face first) with their signed angles, the solid, and how the
   * faces land on it: on[i] is the solid face that net face i covers (or -1
   * when it sticks out), with the overlaps, gaps and strays. */
  function fold(net) {
    const F = net.faces;
    const T = [{ R: I3, t: [0, 0, 0] }];
    const depth = [0];
    const hinges = [];
    for (let i = 1; i < F.length; i++) {
      const f = F[i];
      const p = f.parent;
      const A = P3(f.hinge[0]);
      const d = unit(sub(P3(f.hinge[1]), A));
      const w = sub(P3(centre2(f.pts)), A);
      // turn the way that takes this face below its parent, away from the print
      const angle = (d[2] * w[0] - d[0] * w[2] > 0 ? -1 : 1) * foldAngle(net.solid, F[p].shape, f.shape);
      const R = axisAngle(d, angle);
      const shift = sub(A, mulv(R, A));
      T[i] = { R: mul(T[p].R, R), t: add(mulv(T[p].R, shift), T[p].t) };
      depth[i] = depth[p] + 1;
      hinges.push({ face: i, parent: p, a: f.hinge[0], b: f.hinge[1], axis: d, angle, depth: depth[i] });
    }
    hinges.sort((x, y) => x.depth - y.depth || x.face - y.face);
    const faces = F.map((f, i) => {
      const pts3 = f.pts.map((q) => add(mulv(T[i].R, P3(q)), T[i].t));
      return { pts3, normal: mulv(T[i].R, [0, 1, 0]), centre: avg(pts3), R: T[i].R, t: T[i].t };
    });
    const solid = erect(net);
    const on = faces.map((fc) => solid.faces.findIndex((sf) => samePoly(fc.pts3, sf)));
    const at = solid.faces.map(() => []);
    on.forEach((s, i) => { if (s >= 0) at[s].push(i); });
    const overlaps = [];
    at.forEach((list) => { for (let k = 1; k < list.length; k++) overlaps.push([list[0], list[k]]); });
    const gaps = [];
    at.forEach((list, s) => { if (!list.length) gaps.push(s); });
    const stray = [];
    on.forEach((s, i) => { if (s < 0) stray.push(i); });
    return { valid: !overlaps.length && !gaps.length && !stray.length, faces, hinges, solid, on, overlaps, gaps, stray };
  }

  /* The corner of the flat net with the most faces round it, if the angles
   * there add up to more than any corner of the solid can take. */
  function crowdedCorner(net) {
    const sums = new Map();
    for (const f of net.faces) {
      f.pts.forEach((p, i) => {
        const k = Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
        const e = sums.get(k) || { angle: 0, faces: 0 };
        e.angle += cornerAngle(f.pts, i);
        e.faces++;
        sums.set(k, e);
      });
    }
    let worst = null;
    for (const e of sums.values()) {
      if (e.angle > SOLIDS[net.solid].corner + 1e-6 && (!worst || e.faces > worst.faces)) worst = e;
    }
    return worst;
  }

  /* ------------------------------------------------- cubes and their faces */
  const neg = (v) => v.map((x) => -x + 0);
  const SIDE_NAMES = { '0,1,0': 'top', '0,-1,0': 'bottom', '0,0,1': 'front', '0,0,-1': 'back', '1,0,0': 'right side', '-1,0,0': 'left side' };
  const sideName = (n) => SIDE_NAMES[ivec(n).join(',')];
  /* For a cube net that does not close: the turn of the cube that shows
   * its open side (front, else right or top, the sides the camera sees),
   * and the doubled-up side too if it can. Side names in the messages are
   * for the cube turned this way, so the words match the picture. */
  function cubeView(r) {
    if (r.valid || !r.gaps.length || !r.overlaps.length) return I3.slice();
    const gap = ivec(r.solid.normals[r.gaps[0]]);
    const twice = ivec(r.solid.normals[r.on[r.overlaps[0][0]]]);
    const seen = (v) => (v[2] === 1 ? 3 : v[0] === 1 ? 2 : v[1] === 1 ? 1 : 0);
    let best = null;
    for (const R of ROTATIONS) {
      const k = seen(mulv(R, gap)) * 4 + seen(mulv(R, twice));
      if (!best || k > best.k) best = { R, k };
    }
    return best.R;
  }

  /* A folded cube net's colouring: for each face, its outward direction,
   * its colour or pips, and which way its arrow points in 3D. */
  function cubeOf(net) {
    if (net.solid !== 'cube') return null;
    const r = fold(net);
    if (!r.valid) return null;
    return net.faces.map((f, i) => ({
      n: ivec(r.faces[i].normal),
      colour: f.colour,
      pips: f.pips,
      arrow: f.arrow == null ? null : ivec(mulv(r.faces[i].R, ARROW3[f.arrow])),
    }));
  }
  const faceAt = (cube, n) => cube.find((f) => same3(f.n, n));
  function agrees(fa, fb, R, arrows) {
    if (fa.colour !== fb.colour || fa.pips !== fb.pips) return false;
    if (!arrows) return true;
    if ((fa.arrow == null) !== (fb.arrow == null)) return false;
    return fa.arrow == null || same3(mulv(R, fa.arrow), fb.arrow);
  }
  // how many faces of cube a, turned by R, match cube b (arrows count unless arrows === false)
  const agreement = (a, b, R, arrows) => a.filter((fa) => agrees(fa, faceAt(b, mulv(R, fa.n)), R, arrows !== false)).length;
  function bestTurn(a, b, arrows) {
    let best = null;
    for (const R of ROTATIONS) {
      const k = agreement(a, b, R, arrows);
      if (!best || k > best.k) best = { R, k };
    }
    return best;
  }
  const sameCube = (a, b, arrows) => bestTurn(a, b, arrows).k === 6;
  // the faces of cube a that, turned by R, do not match cube b
  const misfits = (a, b, R) => a.map((fa, i) => (agrees(fa, faceAt(b, mulv(R, fa.n)), R, true) ? -1 : i)).filter((i) => i >= 0);
  // a turn of the cube taking direction n to m, and (if given) n2 to m2
  const turnFor = (n, m, n2, m2) => ROTATIONS.find((R) => same3(ivec(mulv(R, n)), m) && (!n2 || same3(ivec(mulv(R, n2)), m2)));
  const turnCube = (cube, R) => cube.map((f) => Object.assign({}, f, { n: mulv(R, f.n), arrow: f.arrow && mulv(R, f.arrow) }));
  const mirrorCube = (cube) => cube.map((f) => Object.assign({}, f, { n: [-f.n[0] + 0, f.n[1], f.n[2]], arrow: f.arrow && [-f.arrow[0] + 0, f.arrow[1], f.arrow[2]] }));
  // for each face of a folded cube net, the face opposite it (null if it does not fold)
  function opposites(net) {
    const r = fold(net);
    if (!r.valid || net.solid !== 'cube') return null;
    return r.faces.map((f) => r.faces.findIndex((g) => same3(ivec(g.normal), neg(ivec(f.normal)))));
  }
  /* A real die: it folds, it has 1 to 6 once each, and opposite faces add
   * up to 7. Otherwise bad is the first pair (smallest first) that does not. */
  function dieCheck(net) {
    const opp = opposites(net);
    if (!opp) return { ok: false, folds: false, bad: null };
    const pips = net.faces.map((f) => f.pips);
    if (pips.slice().sort().join('') !== '123456') return { ok: false, folds: true, bad: null };
    for (let a = 1; a <= 6; a++) {
      const b = pips[opp[pips.indexOf(a)]];
      if (a + b !== 7) return { ok: false, folds: true, bad: [Math.min(a, b), Math.max(a, b)] };
    }
    return { ok: true, folds: true, bad: null };
  }
  /* Colour a cube net so that it folds into `cube` turned by R⁻¹: each
   * square takes the label of the face it lands on, and an arrow is turned
   * back into the square's own flat directions. */
  function paint(cells, cube, R) {
    const net = netFromCells(cells.map((c) => ({ x: c.x, y: c.y })));
    const r = fold(net);
    const back = transpose(R);
    net.faces.forEach((f, i) => {
      const lab = faceAt(cube, mulv(R, ivec(r.faces[i].normal)));
      if (lab.colour != null) f.colour = lab.colour;
      if (lab.pips != null) f.pips = lab.pips;
      if (lab.arrow) {
        const local = mulv(transpose(r.faces[i].R), mulv(back, lab.arrow));
        f.arrow = arrowIndex(local[0], local[2]);
      }
    });
    return net;
  }
  const cellsOf = (net) => net.faces.map((f) => ({ x: f.cell.x, y: f.cell.y, colour: f.colour, pips: f.pips, arrow: f.arrow }));

  /* ---------------------------------------------- telling nets apart */
  // rounded for keys; the small shift keeps exact halves (like 62.5) away from a rounding edge
  const r3 = (x) => String(Math.round(x * 1000 + 0.31));
  /* The same key for two nets exactly when one is the other turned, flipped
   * or moved. The face (or faces) nearest the middle of the net is found the
   * same way in both, so each of its edges in turn, either way round, is laid
   * along the x axis, both ways up, and the smallest description wins. */
  function netKey(net) {
    const cs = net.faces.map((f) => centre2(f.pts));
    const mid = centre2(cs);
    const dist = cs.map((c) => Math.hypot(c[0] - mid[0], c[1] - mid[1]));
    const least = Math.min(...dist);
    const edges = [];
    net.faces.forEach((f, i) => {
      if (dist[i] > least + 1e-6) return;
      f.pts.forEach((p, k) => {
        const q = f.pts[(k + 1) % f.pts.length];
        edges.push([p, q], [q, p]);
      });
    });
    let best = null;
    for (const [a, b] of edges) {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const c = Math.cos(-ang);
      const s = Math.sin(-ang);
      for (const flip of [1, -1]) {
        const faces = net.faces.map((f) => f.pts.map((p) => {
          const x = p[0] - a[0];
          const y = p[1] - a[1];
          return [x * c - y * s, flip * (x * s + y * c)];
        }));
        const flat = [].concat(...faces);
        const mx = Math.min(...flat.map((p) => p[0]));
        const my = Math.min(...flat.map((p) => p[1]));
        const k = faces.map((pts, i) => net.faces[i].shape + ':' + pts.map((p) => r3(p[0] - mx) + ',' + r3(p[1] - my)).sort().join(';')).sort().join('|');
        if (best === null || k < best) best = k;
      }
    }
    return best;
  }
  // a net turned or flipped on the page by the 2×2 matrix m, moved to start at (0, 0)
  function turnNet(net, m) {
    const tf = (p) => [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
    const faces = net.faces.map((f) => Object.assign({}, f, { pts: f.pts.map(tf), hinge: f.hinge && f.hinge.map(tf) }));
    const flat = [].concat(...faces.map((f) => f.pts));
    const mx = Math.min(...flat.map((p) => p[0]));
    const my = Math.min(...flat.map((p) => p[1]));
    const mv = (p) => [clean(p[0] - mx), clean(p[1] - my)];
    faces.forEach((f) => {
      f.pts = f.pts.map(mv);
      if (signedArea(f.pts) < 0) f.pts.reverse();     // a flip turns the corners round: keep them anticlockwise
      if (f.hinge) f.hinge = f.hinge.map(mv);
    });
    return Object.assign({}, net, { faces });
  }
  // any face with no flaps of its own (never the first)
  const leaves = (net) => net.faces.map((f, i) => i).filter((i) => i > 0 && !net.faces.some((g) => g.parent === i));
  function withoutFace(net, k) {
    const faces = net.faces.filter((f, i) => i !== k).map((f) => Object.assign({}, f, { parent: f.parent > k ? f.parent - 1 : f.parent }));
    return Object.assign({}, net, { faces });
  }

  /* -------------------------------------------- nets of the other solids */
  const PIECES = {
    tetra: { root: 'tri', rest: ['tri', 'tri', 'tri'] },
    pyramid: { root: 'sq', rest: ['tri', 'tri', 'tri', 'tri'] },
    prism: { root: 'tri', rest: ['tri', 'rect', 'rect', 'rect'] },
  };
  // the ways a piece can hang on an edge of length L, as [shape, depth]
  function hangs(piece, L) {
    const one = Math.abs(L - 1) < 1e-6;
    if (piece === 'tri') return one ? [['tri', 0]] : [];
    if (piece === 'sq') return one ? [['sq', 1]] : [];
    const out = [];
    if (one) out.push(['rect', PRISM_LENGTH]);
    if (Math.abs(L - PRISM_LENGTH) < 1e-6) out.push(['rect', 1]);
    return out;
  }
  // every free edge of a net, as [face, edge]
  function freeEdges(net) {
    const F = net.faces;
    const out = [];
    F.forEach((f, fi) => {
      for (let e = 0; e < f.pts.length; e++) {
        if (!F.some((g, gi) => gi !== fi && g.pts.some((_, h) => sameEdge(f.pts, e, g.pts, h)))) out.push([fi, e]);
      }
    });
    return out;
  }
  /* Every flat net (up to turning and flipping) made by hanging the pieces
   * one at a time on free edges, with nothing overlapping on the page. */
  function grow(kind, rootShape, pieces) {
    const extra = kind === 'prism' ? { length: PRISM_LENGTH } : {};
    let level = [{ net: startNet(kind, rootShape, extra), rest: pieces.slice() }];
    for (let step = 0; step < pieces.length; step++) {
      const next = new Map();
      for (const st of level) {
        for (const [fi, e] of freeEdges(st.net)) {
          const L = edgeLen(st.net.faces[fi].pts, e);
          for (const piece of new Set(st.rest)) {
            for (const [shape, depth] of hangs(piece, L)) {
              const net = withFace(st.net, fi, e, shape, depth);
              if (!fits(net)) continue;
              const key = netKey(net);
              if (next.has(key)) continue;
              const rest = st.rest.slice();
              rest.splice(rest.indexOf(piece), 1);
              next.set(key, { net, rest });
            }
          }
        }
      }
      level = [...next.values()];
    }
    return level.map((s) => s.net);
  }

  /* A cuboid net from a tree of six grid squares: fold the squares as a
   * cube to learn which way each one faces, give each square the rectangle
   * for that face, then lay the rectangles out along the same hinges. */
  function cuboidNet(cells, dims) {
    const sq = netFromCells(cells);
    const r = fold(sq);
    const axis = (v) => [0, 1, 2].find((k) => Math.abs(v[k]) > 0.5);
    const box = sq.faces.map((f, i) => ({ w: dims[axis(mulv(r.faces[i].R, [1, 0, 0]))], h: dims[axis(mulv(r.faces[i].R, [0, 0, 1]))] }));
    const pos = [];
    sq.faces.forEach((f, i) => {
      if (f.parent < 0) {
        pos[i] = [0, 0];
        return;
      }
      const p = sq.faces[f.parent];
      const q = pos[f.parent];
      const dx = f.cell.x - p.cell.x;
      const dy = f.cell.y - p.cell.y;
      if (dx === 1) pos[i] = [q[0] + box[f.parent].w, q[1]];
      else if (dx === -1) pos[i] = [q[0] - box[i].w, q[1]];
      else if (dy === 1) pos[i] = [q[0], q[1] + box[f.parent].h];
      else pos[i] = [q[0], q[1] - box[i].h];
    });
    const faces = sq.faces.map((f, i) => {
      const [x, y] = pos[i];
      const { w, h } = box[i];
      return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => [clean(p[0]), clean(p[1])]), shape: 'rect', parent: f.parent, hinge: null, cell: f.cell };
    });
    faces.forEach((f) => {
      if (f.parent < 0) return;
      const P = faces[f.parent].pts;
      for (let e = 0; e < 4; e++) {
        const a = P[e];
        const b = P[(e + 1) % 4];
        if (f.pts.some((p) => near2(p, a)) && f.pts.some((p) => near2(p, b))) f.hinge = [a, b];
      }
    });
    return { solid: 'cuboid', dims: dims.slice(), faces };
  }
  const flatOK = (net) => net.faces.every((f, i) => f.hinge || i === 0) &&
    net.faces.every((f, i) => net.faces.every((g, j) => j <= i || !overlap2(f.pts, g.pts)));
  /* The same net with one end flap a different size: it still lies flat,
   * but it can't meet the edges round it once folded. */
  function resized(net, k, depth) {
    const f = net.faces[k];
    const [a, b] = f.hinge;
    const c = centre2(f.pts);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const L = Math.hypot(c[0] - m[0], c[1] - m[1]);
    const n = [(c[0] - m[0]) / L, (c[1] - m[1]) / L];
    let pts = [a, b, [b[0] + n[0] * depth, b[1] + n[1] * depth], [a[0] + n[0] * depth, a[1] + n[1] * depth]].map((p) => [clean(p[0]), clean(p[1])]);
    if (signedArea(pts) < 0) pts = pts.reverse();
    const faces = net.faces.slice();
    faces[k] = Object.assign({}, f, { pts });
    return Object.assign({}, net, { faces });
  }
  const PERMS3 = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

  /* Everything worked out once: the 35 hexominoes (with the 11 that fold
   * into a cube), and for each other solid its nets and its near misses
   * (the right faces, but they overlap or stick out when folded). */
  let CAT = null;
  function catalogue() {
    if (CAT) return CAT;
    const hexominoes = polyominoes(6).map((cells) => {
      const net = fold(netFromCells(cells)).valid;
      return { cells, key: shapeKey(cells), net, run: runOf(cells), block: blockOf(cells) };
    });
    const nets = { cube: hexominoes.filter((h) => h.net).map((h) => netFromCells(h.cells)) };
    const misses = {};
    for (const kind of Object.keys(PIECES)) {
      const all = grow(kind, PIECES[kind].root, PIECES[kind].rest);
      nets[kind] = all.filter((n) => fold(n).valid);
      misses[kind] = all.filter((n) => !fold(n).valid);
    }
    const good = new Map();
    const bad = new Map();
    hexominoes.filter((h) => !h.block).forEach((h) => {
      PERMS3.forEach((p) => {
        const net = cuboidNet(h.cells, p.map((k) => CUBOID[k]));
        if (!flatOK(net)) return;
        const key = netKey(net);
        (h.net ? good : bad).set(key, net);
      });
    });
    nets.cuboid = [...good.values()];
    // near misses: the layouts where two rectangles fold onto the same face
    misses.cuboid = [...bad.values()].filter((n) => !fold(n).valid);
    CAT = { hexominoes, nets, misses };
    return CAT;
  }
  /* A good cuboid net with one end flap the wrong size, or null if that
   * would not lie flat. */
  function sizeVariant(rand) {
    const net = pick(rand, catalogue().nets.cuboid);
    const k = pick(rand, leaves(net));
    const f = net.faces[k];
    const [a, b] = f.hinge;
    const c = centre2(f.pts);
    // how deep the flap is now: twice its middle's distance from the hinge
    const deep = (2 * Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]))) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    const wrong = resized(net, k, pick(rand, CUBOID.filter((d) => Math.abs(d - deep) > 1e-6)));
    return flatOK(wrong) && !fold(wrong).valid ? turnNet(wrong, pick(rand, D4)) : null;
  }

  /* --------------------------------------------------------- messages */
  const COLOURS = [
    { name: 'Red', hex: '#e5484d', mark: 'circle' },
    { name: 'Blue', hex: '#3e7bfa', mark: 'square' },
    { name: 'Green', hex: '#2f9e5b', mark: 'plus' },
    { name: 'Yellow', hex: '#f2c200', mark: 'diamond' },
    { name: 'Orange', hex: '#f47a1f', mark: 'ring' },
    { name: 'Purple', hex: '#8e4ec6', mark: 'cross' },
  ];
  const LETTERS = 'ABCD';
  const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const low = (c) => COLOURS[c].name.toLowerCase();
  const FACTS = {
    pyramid: 'Four triangles meet at the top.',
    prism: 'The two triangles close the ends.',
    tetra: 'Three faces meet at every corner.',
    cuboid: 'Opposite faces are the same size.',
  };
  const say = {
    prompt: {
      cube: () => 'Which net folds into a cube?',
      opposite: () => 'Fold this net into a cube. Which face ends up opposite red?',
      dice: () => 'Opposite faces of a real die add up to 7. Which net is a real die?',
      solid: (kind) => `Which net folds into this ${SOLIDS[kind].name}?`,
      match: () => 'Which net folds into this cube?',
    },
    ask: (k, n, prompt) => `Question ${k} of ${n}. ${prompt}`,
    right: (core) => `Yes! ${core}`,
    wrong: (core, pointer) => `Not quite. ${core} ${pointer}`,
    pointNet: (L) => `Net ${L} is the one: choose it to watch it fold.`,
    pointColour: (c) => `${COLOURS[c].name} is opposite red.`,
    netOK: (L) => `Net ${L} folds into a cube: every square lands on its own face.`,
    crowded: (L, faces, solid) => `Net ${L} has ${NUM[faces]} faces round one corner, but only three meet at each corner of a ${SOLIDS[solid].name}.`,
    row: (L, k) => `Net ${L} has ${NUM[k]} squares in a row, so it wraps right round and overlaps itself.`,
    sides: (L, side, gap) => `Net ${L} folds two squares onto the ${side} of the cube, leaving the ${gap} open.`,
    overlap: (L, solid) => `Net ${L} folds two faces onto the same face of the ${SOLIDS[solid].name}, leaving a gap.`,
    stray: (L, solid) => `One face of net ${L} sticks out: it doesn't fit the ${SOLIDS[solid].name}.`,
    size: (L) => `One rectangle in net ${L} is the wrong size, so its edges don't meet.`,
    count: (L, n, solid) => `Net ${L} has ${NUM[n]} faces, but a ${SOLIDS[solid].name} has ${NUM[SOLIDS[solid].faces]}.`,
    other: (L, kind, solid) => `Net ${L} folds into a ${SOLIDS[kind].name}, not a ${SOLIDS[solid].name}.`,
    solidOK: (L, kind) => `Net ${L} folds into the ${SOLIDS[kind].name}. ${FACTS[kind]}`,
    dieOK: (L) => `In net ${L}, 1 is opposite 6, 2 is opposite 5 and 3 is opposite 4.`,
    dieBad: (L, a, b) => `In net ${L}, ${a} ends up opposite ${b}, and ${a} + ${b} = ${a + b}, not 7.`,
    matchOK: (L) => `Net ${L} folds into exactly this cube.`,
    pairs: (L, c, x, y) => `In net ${L}, ${low(c)} ends up opposite ${low(x)}, but on this cube ${low(c)} is opposite ${low(y)}.`,
    mirror: (L) => `Net ${L} has the right opposite pairs, but it folds into the mirror image of this cube.`,
    arrow: (L, c) => `Net ${L} has every colour in the right place, but the arrow on ${low(c)} points the wrong way.`,
    oppOK: (c) => `${COLOURS[c].name} ends up opposite red.`,
    oppBad: (c) => `${COLOURS[c].name} folds up next to red.`,
    done: (right, n, best) => `Round complete: ${right} of ${n} right first time. Best streak this visit: ${best}.`,
  };

  /* Why choice i is right or wrong, in one sentence: { ok, text }. */
  function why(q, i) {
    const L = LETTERS[i];
    if (q.kind === 'opposite') {
      const c = q.choices[i];
      const ok = c === q.choices[q.answer];
      return { ok, text: ok ? say.oppOK(c) : say.oppBad(c) };
    }
    const net = q.choices[i];
    const r = fold(net);
    if (q.kind === 'dice') {
      const d = dieCheck(net);
      return { ok: d.ok, text: d.ok ? say.dieOK(L) : say.dieBad(L, d.bad[0], d.bad[1]) };
    }
    if (q.kind === 'match') {
      const mine = cubeOf(net);
      if (sameCube(mine, q.cube)) return { ok: true, text: say.matchOK(L) };
      const opp = (cube, c) => faceAt(cube, neg(cube.find((f) => f.colour === c).n)).colour;
      for (let c = 0; c < COLOURS.length; c++) {
        if (opp(mine, c) !== opp(q.cube, c)) return { ok: false, text: say.pairs(L, c, opp(mine, c), opp(q.cube, c)) };
      }
      const turn = bestTurn(mine, q.cube, false);
      if (turn.k < 6) return { ok: false, text: say.mirror(L) };
      const off = mine.find((f) => !agrees(f, faceAt(q.cube, mulv(turn.R, f.n)), turn.R, true));
      return { ok: false, text: say.arrow(L, off.colour) };
    }
    const want = q.kind === 'solid' ? q.solid : 'cube';
    if (net.solid !== want && r.valid) return { ok: false, text: say.other(L, net.solid, want) };
    if (r.valid) return { ok: true, text: want === 'cube' ? say.netOK(L) : say.solidOK(L, want) };
    if (net.faces.length !== SOLIDS[want].faces) return { ok: false, text: say.count(L, net.faces.length, want) };
    const crowd = crowdedCorner(net);
    if (crowd && want !== 'pyramid') return { ok: false, text: say.crowded(L, crowd.faces, want) };
    if (want === 'cube' && net.cells && runOf(net.cells) >= 5) return { ok: false, text: say.row(L, runOf(net.cells)) };
    if (r.stray.length) return { ok: false, text: want === 'cuboid' ? say.size(L) : say.stray(L, want) };
    if (want === 'cube') {
      const V = cubeView(r);
      const side = sideName(mulv(V, r.solid.normals[r.on[r.overlaps[0][0]]]));
      return { ok: false, text: say.sides(L, side, sideName(mulv(V, r.solid.normals[r.gaps[0]]))) };
    }
    return { ok: false, text: say.overlap(L, want) };
  }
  function check(q, i) {
    const w = why(q, i);
    if (w.ok) return { correct: true, text: say.right(w.text) };
    const pointer = q.kind === 'opposite' ? say.pointColour(q.choices[q.answer]) : say.pointNet(LETTERS[q.answer]);
    return { correct: false, text: say.wrong(w.text, pointer) };
  }

  /* --------------------------------------------------------- questions */
  const ROUND = 8;
  const GROUPS = [
    { id: 'cube', title: 'Cube or not?', emoji: '🧊', blurb: 'Spot the net that folds into a cube.' },
    { id: 'opposite', title: 'Opposite faces', emoji: '🔴', blurb: 'Which face ends up opposite red?' },
    { id: 'dice', title: 'Dice nets', emoji: '🎲', blurb: 'Opposite faces add up to 7.' },
    { id: 'solid', title: 'Other solids', emoji: '🔺', blurb: 'Pyramids, prisms, tetrahedra and cuboids.' },
    { id: 'match', title: 'Match the cube', emoji: '🎨', blurb: 'Colours and arrows: which net makes this cube?' },
  ];
  const tierOf = (index) => (index < 2 ? 0 : index < 5 ? 1 : 2);
  const SOLID_ORDER = ['pyramid', 'prism', 'tetra', 'cuboid'];
  const CROSS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }];
  const AXES = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  const cubeShapes = () => catalogue().hexominoes.filter((h) => h.net);
  const oriented = (rand, cells) => turnCells(cells, pick(rand, D4));
  // a cube net on the page, ready to label
  function cubeNet(rand, cells) {
    const net = netFromCells(oriented(rand, cells));
    net.cells = cellsOf(net);
    return net;
  }
  function labelled(net) {
    net.cells = cellsOf(net);
    return net;
  }
  // a valid net of any solid, turned or flipped at random
  function anyNet(rand, kind) {
    if (kind === 'cube') return cubeNet(rand, pick(rand, cubeShapes()).cells);
    return turnNet(pick(rand, catalogue().nets[kind]), pick(rand, D4));
  }
  // a valid net with one face too few or too many
  function countVariant(rand, kind) {
    const net = pick(rand, catalogue().nets[kind]);
    if (rand() < 0.5) return turnNet(withoutFace(net, pick(rand, leaves(net))), pick(rand, D4));
    const piece = PIECES[kind] ? pick(rand, PIECES[kind].rest) : 'rect';
    for (const [fi, e] of shuffle(rand, freeEdges(net))) {
      const L = edgeLen(net.faces[fi].pts, e);
      const ways = kind === 'cuboid' ? CUBOID.filter((d) => Math.abs(d - L) > 1e-6).map((d) => ['rect', d]) : hangs(piece, L);
      for (const [shape, depth] of ways) {
        const more = withFace(net, fi, e, shape, depth);
        if (fits(more)) return turnNet(more, pick(rand, D4));
      }
    }
    return turnNet(withoutFace(net, pick(rand, leaves(net))), pick(rand, D4));
  }
  function randomCube(rand, arrows) {
    const colours = shuffle(rand, [0, 1, 2, 3, 4, 5]);
    const cube = AXES.map((n, i) => ({ n, colour: colours[i], pips: undefined, arrow: null }));
    shuffle(rand, [0, 1, 2, 3, 4, 5]).slice(0, arrows).forEach((i) => {
      const f = cube[i];
      cube[i] = Object.assign({}, f, { arrow: pick(rand, AXES.filter((a) => dot(a, f.n) === 0)) });
    });
    return cube;
  }
  function randomDie(rand) {
    const pairs = shuffle(rand, [[1, 6], [2, 5], [3, 4]]).map((p) => (rand() < 0.5 ? p : [p[1], p[0]]));
    return AXES.map((n, i) => ({ n, colour: undefined, pips: pairs[i >> 1][i & 1], arrow: null }));
  }
  function swapLabels(cube, i, j, key) {
    const out = cube.map((f) => Object.assign({}, f));
    out[i][key] = cube[j][key];
    out[j][key] = cube[i][key];
    return out;
  }
  const nextTo = (cube) => {
    const out = [];
    cube.forEach((f, i) => cube.forEach((g, j) => { if (j > i && dot(f.n, g.n) === 0) out.push([i, j]); }));
    return out;
  };

  const MAKERS = {
    cube(rand, tier) {
      const H = catalogue().hexominoes;
      const good = pick(rand, H.filter((h) => h.net && (tier > 0 || h.run === 4)));
      const obvious = shuffle(rand, H.filter((h) => !h.net && (h.block || h.run >= 5)));
      const subtle = shuffle(rand, H.filter((h) => !h.net && !h.block && h.run < 5));
      let bad;
      // first, one with a 2×2 block and one with a long row: easy to rule out, and different
      if (tier === 0) bad = [obvious.find((h) => h.block), obvious.find((h) => !h.block)];
      else if (tier === 1) bad = obvious.slice(0, 1).concat(subtle.slice(0, 2));
      else bad = subtle.slice(0, 3).concat(obvious).slice(0, 3);
      const shapes = shuffle(rand, [good].concat(bad));
      return { kind: 'cube', prompt: say.prompt.cube(), choices: shapes.map((h) => cubeNet(rand, h.cells)), answer: shapes.indexOf(good) };
    },

    opposite(rand, tier) {
      const shape = tier === 0 ? CROSS : pick(rand, cubeShapes()).cells;
      const colours = shuffle(rand, [0, 1, 2, 3, 4, 5]);
      const net = labelled(netFromCells(oriented(rand, shape).map((c, i) => Object.assign({}, c, { colour: colours[i] }))));
      const opp = opposites(net);
      const red = net.faces.findIndex((f) => f.colour === 0);
      const answer = net.faces[opp[red]].colour;
      // the tempting wrong answers lie far from red on the flat net
      const far = (c) => {
        const f = net.faces.find((g) => g.colour === c);
        return Math.abs(f.cell.x - net.faces[red].cell.x) + Math.abs(f.cell.y - net.faces[red].cell.y) + rand() * 0.5;
      };
      const others = net.faces.map((f) => f.colour).filter((c) => c !== 0 && c !== answer);
      const wrong = tier === 0 ? shuffle(rand, others).slice(0, 2) : others.sort((a, b) => far(b) - far(a)).slice(0, 3);
      const choices = shuffle(rand, [answer].concat(wrong));
      return { kind: 'opposite', prompt: say.prompt.opposite(), net, red, choices, answer: choices.indexOf(answer) };
    },

    dice(rand, tier) {
      const n = tier === 0 ? 3 : 4;
      const shared = tier < 2 ? oriented(rand, tier === 0 ? CROSS : pick(rand, cubeShapes()).cells) : null;
      const shape = () => shared || oriented(rand, pick(rand, cubeShapes()).cells);
      const choices = [labelled(paint(shape(), randomDie(rand), pick(rand, ROTATIONS)))];
      for (let tries = 0; choices.length < n && tries < 40; tries++) {
        let net;
        const cells = shape();
        const row = tier === 2 ? rowOfFour(cells) : null;
        if (row && choices.length === 1) {
          // the classic trap: a number and its partner at the two ends of a row of four (they meet round the side)
          const a = 1 + Math.floor(rand() * 3);
          const rest = shuffle(rand, [1, 2, 3, 4, 5, 6].filter((p) => p !== a && p !== 7 - a));
          let k = 0;
          net = netFromCells(cells.map((c) => Object.assign({}, c, { pips: c === row[0] ? a : c === row[3] ? 7 - a : rest[k++] })));
        } else {
          const die = randomDie(rand);
          const [i, j] = pick(rand, nextTo(die));
          net = paint(cells, swapLabels(die, i, j, 'pips'), pick(rand, ROTATIONS));
        }
        net = labelled(net);
        const cube = cubeOf(net);
        if (!choices.some((c) => sameCube(cubeOf(c), cube))) choices.push(net);
      }
      const order = shuffle(rand, choices.map((c, i) => i));
      return { kind: 'dice', prompt: say.prompt.dice(), choices: order.map((i) => choices[i]), answer: order.indexOf(0) };
    },

    solid(rand, tier, index) {
      const kind = SOLID_ORDER[index % SOLID_ORDER.length];
      const C = catalogue();
      const good = anyNet(rand, kind);
      const others = SOLID_ORDER.concat(['cube']).filter((k) => k !== kind && !(kind === 'cuboid' && k === 'cube'));
      const misses = shuffle(rand, C.misses[kind]).slice(0, 4).map((m) => turnNet(m, pick(rand, D4)));
      if (kind === 'cuboid') {
        const wrong = sizeVariant(rand);
        if (wrong) misses.splice(Math.floor(rand() * 2), 0, wrong);
      }
      let bad;
      if (tier === 0) bad = shuffle(rand, others).slice(0, 2).map((k) => anyNet(rand, k));
      else if (tier === 1) bad = [anyNet(rand, pick(rand, others)), misses[0], countVariant(rand, kind)];
      else bad = misses.slice(0, kind === 'tetra' ? 1 : 2).concat([countVariant(rand, kind), countVariant(rand, kind)]).slice(0, 3);
      const nets = shuffle(rand, [good].concat(bad));
      const target = { net: good, turn: present(good) };
      return { kind: 'solid', solid: kind, prompt: say.prompt.solid(kind), choices: nets, answer: nets.indexOf(good), target };
    },

    match(rand, tier) {
      const n = tier === 0 ? 3 : 4;
      const base = randomCube(rand, tier === 2 ? 1 + Math.floor(rand() * 2) : 0);
      const shared = tier === 0 ? oriented(rand, pick(rand, cubeShapes()).cells) : null;
      const shape = () => shared || oriented(rand, pick(rand, cubeShapes()).cells);
      const good = labelled(paint(shape(), base, pick(rand, ROTATIONS)));
      const twists = [mirrorCube(base)];
      nextTo(base).forEach(([i, j]) => twists.push(swapLabels(base, i, j, 'colour')));
      base.forEach((f, i) => {
        if (!f.arrow) return;
        const quarter = cross(f.n, f.arrow);
        twists.push(Object.assign(base.slice(), { [i]: Object.assign({}, f, { arrow: quarter }) }));
        twists.push(Object.assign(base.slice(), { [i]: Object.assign({}, f, { arrow: neg(f.arrow) }) }));
      });
      // with arrows about, one wrong answer has only an arrow turned: the subtle one
      const arrowy = shuffle(rand, twists.filter((t, k) => k > 0 && sameCube(t, base, false))).slice(0, 1);
      const order = arrowy.concat(shuffle(rand, twists));
      const picked = [];
      for (const t of order) {
        if (picked.length >= n - 1) break;
        if (sameCube(t, base) || picked.some((p) => sameCube(p, t))) continue;
        picked.push(t);
      }
      const choices = [good].concat(picked.map((t) => labelled(paint(shape(), t, pick(rand, ROTATIONS)))));
      const order2 = shuffle(rand, choices.map((c, i) => i));
      const turn = pick(rand, ROTATIONS.slice(1));
      return {
        kind: 'match', prompt: say.prompt.match(), cube: base, choices: order2.map((i) => choices[i]), answer: order2.indexOf(0),
        target: { net: good, turn },
      };
    },
  };
  function rowOfFour(cells) {
    for (const c of cells) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const row = [0, 1, 2, 3].map((k) => cells.find((d) => d.x === c.x + dx * k && d.y === c.y + dy * k));
        if (row.every(Boolean)) return row;
      }
    }
    return null;
  }

  /* How to stand a solid up to look at it: pyramids point up, the prism
   * lies on a rectangle with its triangles at the sides. A 3×3 turn. */
  function present(net) {
    if (net.solid === 'pyramid' || net.solid === 'tetra') return [1, 0, 0, 0, -1, 0, 0, 0, -1];
    if (net.solid === 'prism') {
      const r = fold(net);
      const side = r.faces.find((f, i) => net.faces[i].shape === 'rect').normal;
      return turnTaking([0, 1, 0], side, [1, 0, 0], [0, -1, 0]);
    }
    return I3.slice();
  }

  // exactly one right answer, and no two choices alike
  function sound(q) {
    const n = q.choices.length;
    if (n < 3 || q.choices.filter((c, i) => why(q, i).ok).length !== 1 || !why(q, q.answer).ok) return false;
    if (q.kind === 'opposite') return new Set(q.choices).size === n;
    if (q.kind === 'dice' || q.kind === 'match') {
      return q.choices.every((c, i) => q.choices.every((d, j) => j <= i || !sameCube(cubeOf(c), cubeOf(d))));
    }
    return new Set(q.choices.map(netKey)).size === n;
  }
  /* Question `index` of a group's stream for this visit. The first two are
   * gentle, the next three a step up, and the rest are the full thing. */
  function question(group, seed, index) {
    const rand = rng(streamSeed(seed, group, index));
    const tier = tierOf(index);
    for (let attempt = 0; attempt < 80; attempt++) {
      const q = MAKERS[GROUPS[group].id](rand, tier, index);
      if (sound(q)) return Object.assign(q, { group, index, tier });
    }
    throw new Error('Could not make a question');
  }

  const api = {
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    ROUND,
    COLOURS,
    LETTERS,
    SOLIDS,
    ROTATIONS,
    CUBOID,
    PRISM_LENGTH,
    rng,
    polyominoes,
    netFromCells,
    turnCells,
    shapeKey,
    netKey,
    fold,
    erect,
    foldAngle,
    crowdedCorner,
    cubeOf,
    sameCube,
    bestTurn,
    misfits,
    turnFor,
    cubeView,
    turnCube,
    mirrorCube,
    opposites,
    dieCheck,
    paint,
    catalogue,
    cuboidNet,
    present,
    question,
    why,
    check,
    say,
    mul,
    transpose,
    mulv,
    sideName,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Nets = api;
})(this);
