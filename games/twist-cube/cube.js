/* Twist Cube: the puzzle itself. The cube, its twists, the levels, the
 * hint and every message, with no 3D and no DOM.
 *
 * A cube of n×n×n small blocks (n is 2 or 3) is modelled by its stickers:
 * six faces of n×n, each sticker holding the number of the colour it shows
 * (0 to 5, one per face of a solved cube). Every twist is a permutation
 * table worked out once from geometry: each sticker has a position, and a
 * twist turns the positions in one outer layer a quarter turn. The same
 * tables turn the whole cube, so a position is recognised however the cube
 * is held.
 *
 * Notation, as the player sees it: U (up), D (down), L (left), R (right),
 * F (front) and B (back) name a face. A letter alone is a quarter turn
 * clockwise as you look straight at that face; with a prime (R′, typed R')
 * it is anticlockwise. Inside this file a twist is a string: "R" or "R'".
 *
 * The tests load this exact file in Node. In the page it is a classic script
 * that sets window.CubeLogic; in Node it is a CommonJS module.
 */
(function (root) {
  'use strict';

  const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  // each face's outward direction, in the cube's own frame: x right, y up, z towards you
  const AXIS = { U: [0, 1, 0], D: [0, -1, 0], L: [-1, 0, 0], R: [1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  // looking straight at a face from outside: which ways are right and down across it
  const ACROSS = {
    U: { right: [1, 0, 0], down: [0, 0, 1] },
    D: { right: [1, 0, 0], down: [0, 0, -1] },
    L: { right: [0, 0, 1], down: [0, -1, 0] },
    R: { right: [0, 0, -1], down: [0, -1, 0] },
    F: { right: [1, 0, 0], down: [0, -1, 0] },
    B: { right: [-1, 0, 0], down: [0, -1, 0] },
  };
  const MOVES = [];
  FACES.forEach((f) => MOVES.push(f, f + "'"));
  const AXIS_NAME = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };
  const WHOLE = { x: 'R', y: 'U', z: 'F' };   // whole-cube turns go the way these faces twist

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vkey = (v) => v.join(',');
  const faceOf = (v) => FACES.find((f) => AXIS[f][0] === v[0] && AXIS[f][1] === v[1] && AXIS[f][2] === v[2]);

  /* A quarter turn of v about the unit axis a: clockwise as seen looking at
   * the face that a points out of, or anticlockwise. */
  function quarter(a, v, clockwise) {
    const s = clockwise ? -1 : 1;
    const c = cross(a, v);
    const d = dot(a, v);
    return [s * c[0] + a[0] * d, s * c[1] + a[1] * d, s * c[2] + a[2] * d];
  }

  /* ------------------------------------------- the 24 ways to hold a cube */
  // A rotation is three columns: where the cube's own x, y and z axes point.
  const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const mul = (M, v) => [0, 1, 2].map((k) => v[0] * M[0][k] + v[1] * M[1][k] + v[2] * M[2][k]);
  const mulT = (M, v) => M.map((col) => dot(col, v));
  const compose = (A, B) => B.map((col) => mul(A, col));           // B first, then A
  const transpose = (M) => [0, 1, 2].map((k) => M.map((col) => col[k]));
  const mkey = (M) => M.map(vkey).join('|');
  const spin = (M, axis, clockwise) => M.map((col) => quarter(axis, col, clockwise));
  const ROTATIONS = [IDENTITY];
  const ROT_INDEX = new Map([[mkey(IDENTITY), 0]]);
  for (let i = 0; i < ROTATIONS.length; i++) {
    for (const f of ['R', 'U']) {
      const M = spin(ROTATIONS[i], AXIS[f], true);
      if (!ROT_INDEX.has(mkey(M))) {
        ROT_INDEX.set(mkey(M), ROTATIONS.length);
        ROTATIONS.push(M);
      }
    }
  }

  /* ------------------------------------------------------ the sticker model */
  const GEO = {};
  const pull = (dest) => {
    const src = new Array(dest.length);
    dest.forEach((d, i) => { src[d] = i; });
    return src;
  };

  /* Where every sticker sits on an n×n×n cube, and a table for every twist
   * and every whole-cube turn. Positions are in half-block units, so they
   * stay whole numbers: blocks sit at -(n-1), ..., n-1 along each axis and
   * the faces at ±n. A table lists, for each sticker spot, the spot whose
   * sticker moves into it. */
  function geo(n) {
    if (GEO[n]) return GEO[n];
    const vals = [];
    for (let k = 1 - n; k <= n - 1; k += 2) vals.push(k);
    const slots = [];
    const at = new Map();
    FACES.forEach((f) => {
      const a = AXIS[f];
      const { right, down } = ACROSS[f];
      vals.forEach((r, row) => vals.forEach((c, col) => {
        const p = [0, 1, 2].map((k) => n * a[k] + c * right[k] + r * down[k]);
        at.set(vkey(p), slots.length);
        slots.push({ face: f, row, col, p, normal: a });
      }));
    });
    const twists = {};
    for (const m of MOVES) {
      const a = AXIS[m[0]];
      const cw = m.length === 1;
      // the outer layer: the face itself (at n) and the edges of its neighbours (at n - 1)
      twists[m] = pull(slots.map((s, i) => (dot(s.p, a) >= n - 1 ? at.get(vkey(quarter(a, s.p, cw))) : i)));
    }
    const turns = ROTATIONS.map((M) => pull(slots.map((s) => at.get(vkey(mul(M, s.p))))));
    // what pins down how the cube is held: the middle stickers of U and F on
    // a 3×3×3 (they never move), the down-back-left corner on a 2×2×2
    const refs = n % 2
      ? [[0, n, 0], [0, 0, n]]
      : [[1 - n, -n, 1 - n], [1 - n, 1 - n, -n], [-n, 1 - n, 1 - n]];
    const ref = refs.map((p) => {
      const i = at.get(vkey(p));
      return { i, colour: FACES.indexOf(slots[i].face) };
    });
    GEO[n] = { n, slots, twists, turns, ref };
    return GEO[n];
  }

  const sizeOf = (s) => Math.round(Math.sqrt(s.length / 6));
  const permute = (s, src) => src.map((j) => s[j]);

  const solved = (n) => geo(n).slots.map((sl) => FACES.indexOf(sl.face));
  function twist(s, m) {
    const t = geo(sizeOf(s)).twists[m];
    if (!t) throw new Error('Not a twist: ' + m);
    return permute(s, t);
  }
  const apply = (s, moves) => moves.reduce(twist, s);
  // the whole cube turned to the r-th of the 24 ways to hold it (stickers and all)
  const turnWhole = (s, r) => permute(s, geo(sizeOf(s)).turns[r]);
  const key = (s) => s.join('');

  // solved when every face shows a single colour, however the cube is held
  function isSolved(s) {
    const k = s.length / 6;
    for (let f = 0; f < 6; f++) {
      for (let i = 1; i < k; i++) if (s[f * k + i] !== s[f * k]) return false;
    }
    return true;
  }

  /* The same position, turned to a standard way of holding it: one string per
   * position however the cube is held, plus which of the 24 turns did it. */
  function canon(s) {
    const g = geo(sizeOf(s));
    for (let r = 0; r < g.turns.length; r++) {
      const src = g.turns[r];
      if (g.ref.every(({ i, colour }) => s[src[i]] === colour)) return { key: key(permute(s, src)), rot: r };
    }
    throw new Error('Not a cube position');
  }

  /* ----------------------------------------------------------- notation */
  const inverse = (m) => (m.length > 1 ? m[0] : m + "'");
  const invert = (moves) => moves.slice().reverse().map(inverse);
  const axisOf = (m) => AXIS_NAME[m[0]];
  // "R U' F2" (2 means twice; ' ′ and ’ all mean prime) into ["R", "U'", "F", "F"]
  function parse(text) {
    const out = [];
    for (const tok of String(text).trim().split(/\s+/).filter(Boolean)) {
      const m = /^([UDLRFB])(2|['′’])?$/.exec(tok);
      if (!m) throw new Error('Not a twist: ' + tok);
      if (m[2] === '2') out.push(m[1], m[1]);
      else out.push(m[1] + (m[2] ? "'" : ''));
    }
    return out;
  }
  const label = (m) => m[0] + (m.length > 1 ? '′' : '');
  const format = (moves) => moves.map(label).join(' ');

  /* ---------------------------------------------- how the player holds it */
  // `view` is one of the 24 ways to hold the cube (0: as it started). The
  // letters always belong to the player's view: F is the face towards them.
  const toView = (view, m) => faceOf(mul(ROTATIONS[view], AXIS[m[0]])) + m.slice(1);
  const toCube = (view, m) => faceOf(mulT(ROTATIONS[view], AXIS[m[0]])) + m.slice(1);
  // turn the whole cube: x, y or z, the way R, U or F twist, with a prime for the other way
  const turnView = (view, t) => ROT_INDEX.get(mkey(spin(ROTATIONS[view], AXIS[WHOLE[t[0]]], t.length === 1)));

  /* ----------------------------------------------------------- scrambles */
  /* Twists on one axis (R and L, say) don't interfere, so they count as one
   * run. A good scramble never wastes a twist: in a run, a face turns one
   * way only and at most twice (a third R is just R′). On a 2×2×2 a run
   * stops at two twists, and never pairs R with L′: together those just
   * turn the whole cube. */
  function fits(n, seq, m) {
    let same = 0;
    let all = 0;
    for (let i = seq.length - 1; i >= 0 && axisOf(seq[i]) === axisOf(m); i--) {
      const p = seq[i];
      all++;
      if (p[0] === m[0]) {
        if (p !== m) return false;
        same++;
      } else if (n === 2 && (p.length > 1) !== (m.length > 1)) {
        return false;
      }
    }
    return same < 2 && (n !== 2 || all < 2);
  }
  function scramble(n, length, rand) {
    const rnd = rand || Math.random;
    const out = [];
    while (out.length < length) {
      const m = MOVES[Math.floor(rnd() * MOVES.length)];
      if (fits(n, out, m)) out.push(m);
    }
    return out;
  }

  /* ---------------------------------------------------- the inverse path */
  /* Every position on the way back along a scramble. The way back is the
   * scramble backwards with every twist flipped, but twists in one run can
   * be undone in any order, so all of those positions count too. Each is
   * filed under its standard string, with how many twists are left from it
   * and the scramble twist to undo next. */
  function guide(n, moves) {
    const runs = [];
    for (const m of moves) {
      const run = runs[runs.length - 1];
      if (run && axisOf(run[0]) === axisOf(m)) run.push(m);
      else runs.push([m]);
    }
    const points = new Map();
    let base = solved(n);
    let done = [];
    for (const run of runs) {
      for (let mask = 0; mask < 1 << run.length; mask++) {
        const part = run.filter((_, i) => mask & (1 << i));
        const c = canon(apply(base, part));
        const left = done.length + part.length;
        const was = points.get(c.key);
        if (!was || was.left > left) {
          points.set(c.key, { left, rot: c.rot, last: part.length ? part[part.length - 1] : done[done.length - 1] });
        }
      }
      base = apply(base, run);
      done = done.concat(run);
    }
    return { n, moves: moves.slice(), points, start: base };
  }

  /* Where the player is against the scramble: solved; on the way back (and
   * the twist to make next, named for the cube as it is now held, even when
   * a 2×2×2 has quietly turned round); or off it, with how many of their
   * own twists to take back (`history` lists the positions before each). */
  function where(g, s, history) {
    if (isSolved(s)) return { solved: true, on: true, left: 0 };
    const c = canon(s);
    const p = g.points.get(c.key);
    if (p) {
      const G = compose(transpose(ROTATIONS[c.rot]), ROTATIONS[p.rot]);
      const m = inverse(p.last);
      return { solved: false, on: true, left: p.left, next: faceOf(mul(G, AXIS[m[0]])) + m.slice(1) };
    }
    const past = history || [];
    for (let u = 1; u <= past.length; u++) {
      if (g.points.has(canon(past[past.length - u]).key)) return { solved: false, on: false, back: u };
    }
    return { solved: false, on: false, back: 0 };
  }

  /* -------------------------------------------------------------- levels */
  /* "Undo the twists": each scramble is as short as it can be (the tests
   * prove no shorter way back exists), so its length is the par. Then free
   * play on a fresh random scramble of each size. */
  const LEVELS = [
    // 2×2×2: the first four use only the faces you can see (U, R and F)
    { n: 2, scramble: "R", tip: 'Your turn: undo that twist by turning the same face back the other way.' },
    { n: 2, scramble: "R U", tip: 'Undo the last twist first, then the one before: like taking off shoes before socks.' },
    { n: 2, scramble: "R U' F", tip: 'Stuck? 📜 shows the scramble and 💡 gives a hint.' },
    { n: 2, scramble: "R U F F", tip: 'Two twists of one face in a row make a half turn.' },
    { n: 2, scramble: "U' F' R D L", tip: 'Some twists now happen round the back: turn the cube to watch them.' },
    { n: 2, scramble: "F R F D' B' U" },
    { n: 2, scramble: "F U' B L' D' R' F' R" },
    { n: 2, scramble: "R U' L U' F' U L' D B D'" },
    // 3×3×3
    { n: 3, scramble: "F", tip: 'On a 3×3×3 the middle stickers never move, so they show which colour each face should be.' },
    { n: 3, scramble: "F U'" },
    { n: 3, scramble: "U R F'" },
    { n: 3, scramble: "R U U L" },
    { n: 3, scramble: "U' R' F D' R" },
    { n: 3, scramble: "B R' D' F' U B" },
    { n: 3, scramble: "U R B' L D' R' F L'" },
    { n: 3, scramble: "R U B' R D F' L U F' D'" },
    // free play on a fresh random scramble
    { n: 2, free: 16 },
    { n: 3, free: 30 },
  ].map((lv) => {
    if (lv.free) return { n: lv.n, free: true, length: lv.free };
    const moves = parse(lv.scramble);
    return { n: lv.n, free: false, moves, par: moves.length, tip: lv.tip || '' };
  });
  const GROUPS = [
    { title: '2×2×2: undo the twists', from: 0, to: 8 },
    { title: '3×3×3: undo the twists', from: 8, to: 16 },
    { title: 'Full scramble: free play', from: 16, to: 18 },
  ];

  /* ------------------------------------------------------------ messages */
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many || one + 's'}`;
  const tw = (k) => plural(k, 'twist');
  const NICE = { U: 'top', D: 'bottom', L: 'left', R: 'right', F: 'front', B: 'back' };
  const describe = (m) => `${NICE[m[0]]} face, ${m.length > 1 ? 'anticlockwise' : 'clockwise'}`;
  const sizeName = (n) => `${n}×${n}×${n}`;
  const say = {
    watch: (k) => `Watch closely: ${tw(k)} coming…`,
    mixing: (k) => `Scrambling with ${k} random twists…`,
    go: (lv) => (lv.free
      ? 'Your turn: solve it any way you like. Hints walk you back along the scramble.'
      : `${lv.tip || `Your turn: undo the ${tw(lv.par)}.`} Par is ${lv.par}.`),
    twist: (m) => `${label(m)}: ${describe(m)}.`,
    turn: () => 'Whole cube turned. F is always the face towards you.',
    home: () => 'Back to the starting view.',
    undo: (m) => `Took back ${label(m)}.`,
    noUndo: () => 'Nothing to take back yet.',
    reset: () => 'Back to the start of the scramble.',
    hint: (m, left) => `Hint: twist ${label(m)} (${describe(m)}). ${left === 1 ? 'That one solves it!' : `${tw(left)} to go.`}`,
    stray: (back) => `You've left the scramble's path. Undo ${tw(back)} to get back on it, then ask again.`,
    lost: () => "You've left the scramble's path. Reset to start again.",
    solved: (lv, moves) => {
      if (lv.free) return `Solved in ${tw(moves)}! The scramble was ${tw(lv.length)}.`;
      if (moves === lv.par) return `Solved in ${tw(moves)}: exactly par!`;
      if (moves < lv.par) return `Solved in ${tw(moves)}: under par!`;
      return `Solved in ${tw(moves)}. Par is ${lv.par}: the scramble done backwards.`;
    },
    help: (hints, peeked) => {
      if (!hints && !peeked) return 'No hints and no peeking. Brilliant!';
      const bits = [];
      if (hints) bits.push(plural(hints, 'hint'));
      if (peeked) bits.push('a look at the scramble');
      return `With ${bits.join(' and ')}.`;
    },
    scramble: (moves) => `Scramble: ${format(moves)}`,
    way: (moves) => `Undo: ${format(invert(moves))}`,
    status: (w, k) => {
      if (w.solved) return 'Solved!';
      if (w.on) return `On the path: ${k - w.left} of ${k} undone.`;
      return w.back ? `Off the path: undo ${tw(w.back)} to get back.` : 'Off the path: reset to start again.';
    },
    moves: (k) => tw(k),
    size: sizeName,
  };

  const api = {
    FACES: FACES.slice(),
    MOVES: MOVES.slice(),
    ROTATIONS: ROTATIONS.map((M) => M.map((c) => c.slice())),
    LEVELS,
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    slots: (n) => geo(n).slots.map((s) => ({ face: s.face, row: s.row, col: s.col, p: s.p.slice(), normal: s.normal.slice() })),
    axis: (f) => AXIS[f].slice(),
    solved,
    twist,
    apply,
    turnWhole,
    isSolved,
    key,
    canon,
    inverse,
    invert,
    axisOf,
    parse,
    label,
    format,
    describe,
    toView,
    toCube,
    turnView,
    fits,
    scramble,
    guide,
    where,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeLogic = api;
})(this);
