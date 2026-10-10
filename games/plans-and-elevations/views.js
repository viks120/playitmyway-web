/* Plans & Elevations: the maths. The levels, the three views of a block
 * structure (plan, front elevation, side elevation), checking a build
 * against them, the fewest and the most cubes a set of views allows, how
 * many different structures share them, hints, the "which view?" quiz and
 * every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Views; in Node
 * it is a CommonJS module.
 *
 * A structure is a grid of columns (w wide, d deep), each 0 or more cubes
 * high, stored row by row from the BACK row to the FRONT row: h[z * w + x],
 * x = 0 on the left. Cubes always stand on the baseplate or on another cube.
 *
 * The views, as exam questions draw them:
 *   plan   which squares are covered, seen from above (front edge at the bottom)
 *   front  how tall each column A, B, C... looks from the front
 *   side   how tall each row looks from the right-hand side (front on the left)
 * Squares are named like a chessboard seen from the front: columns A, B, C
 * from the left, rows 1, 2, 3 from the front. A1 is the front-left square.
 */
(function (root) {
  'use strict';

  const LETTERS = 'ABCDEFGH';
  const TOP = 4;                       // no column is ever taller than this

  /* The hidden structures, back row first. Every level's views come from its
   * hidden structure, so every level can be built; the tests prove the rest. */
  const LEVELS = [
    // warm-up: 3 by 3, low, one answer each
    { rows: ['000', '100', '111'], top: 2, tip: 'Tap a square on the baseplate to place a cube. The plan shows which squares are covered.' },
    { rows: ['000', '110', '121'], top: 3, tip: 'Tap a cube to stack another on top. The front elevation shows how tall each column looks from the front.' },
    { rows: ['020', '111', '000'], top: 3, tip: 'The side elevation is the view from the right-hand side, so its left edge is the front.' },
    { rows: ['001', '011', '112'], top: 3, tip: 'Drag to look around, or turn the view with the turn buttons or Q and E.' },
    { rows: ['210', '200', '111'], top: 3, tip: 'Remove a cube with the eraser, a right-click or a long press.' },
    { rows: ['000', '230', '011'], top: 3, tip: 'Compare shades the squares you are missing and crosses out the extra ones.' },
    // medium: taller, and more than one answer
    { rows: ['321', '211', '100'], top: 3, tip: 'Different shapes can have the same three views. Any shape that matches all three counts.' },
    { rows: ['112', '101', '211'], top: 3 },
    { rows: ['0310', '1211', '0110'], top: 4 },
    { rows: ['030', '213', '010'], top: 3 },
    { rows: ['1221', '1001', '1111'], top: 3 },
    { rows: ['2013', '1112', '0011'], top: 4 },
    // hard: bigger and trickier
    { rows: ['3001', '1110', '0121', '1003'], top: 4 },
    { rows: ['0040', '1210', '0121', '0300'], top: 4 },
    { rows: ['11111', '10301', '12021', '00100'], top: 4 },
    { rows: ['2102', '0430', '1211', '3001'], top: 4 },
    { rows: ['10203', '01110', '30102', '11011'], top: 4 },
    { rows: ['31001', '30021', '02111', '02341'], top: 4 },
    // fewest cubes: the hidden cubes are the whole puzzle
    { rows: ['211', '121', '112'], top: 3, goal: 'fewest', tip: 'A cube can hide behind others in every view. Match all three views with as few cubes as you can.' },
    { rows: ['1003', '2111', '1311'], top: 3, goal: 'fewest' },
    { rows: ['1012', '1331', '2101'], top: 3, goal: 'fewest' },
    { rows: ['0032', '1201', '3111', '1011'], top: 3, goal: 'fewest' },
    { rows: ['1121', '3010', '0113', '1311'], top: 3, goal: 'fewest' },
    { rows: ['11103', '11441', '30011', '03111'], top: 4, goal: 'fewest' },
  ];
  const GROUPS = [
    { title: 'Warm-up: 3 by 3, low', from: 0, to: 6 },
    { title: 'Medium: taller, more than one answer', from: 6, to: 12 },
    { title: 'Hard: bigger and trickier', from: 12, to: 18 },
    { title: 'Fewest cubes: find the hidden ones', from: 18, to: 24 },
  ];

  /* ------------------------------------------------------------ shapes */
  function shape(rows) {
    const d = rows.length;
    const w = rows[0].length;
    const h = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) h.push(Number(rows[z][x]) || 0);
    return { w, d, h };
  }
  const count = (h) => h.reduce((a, b) => a + b, 0);
  const blank = (w, d) => new Array(w * d).fill(0);
  const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // the three views of a structure
  function views(w, d, h) {
    const plan = h.map((v) => v > 0);
    const front = [];
    const side = [];
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let z = 0; z < d; z++) m = Math.max(m, h[z * w + x]);
      front.push(m);
    }
    for (let z = 0; z < d; z++) {
      let m = 0;
      for (let x = 0; x < w; x++) m = Math.max(m, h[z * w + x]);
      side.push(m);
    }
    return { w, d, plan, front, side };
  }

  // which of the three views match
  function compare(target, mine) {
    const plan = sameList(target.plan, mine.plan);
    const front = sameList(target.front, mine.front);
    const side = sameList(target.side, mine.side);
    return { plan, front, side, all: plan && front && side, n: (plan ? 1 : 0) + (front ? 1 : 0) + (side ? 1 : 0) };
  }

  /* --------------------------------------------- fewest and most cubes */
  // the tallest a column may be and still fit the views: 0 off the plan
  function caps(v) {
    return v.plan.map((p, i) => (p ? Math.min(v.front[i % v.w], v.side[Math.floor(i / v.w)]) : 0));
  }

  // can any structure have these views?
  function possible(v) {
    const { w, d, plan, front, side } = v;
    for (let i = 0; i < w * d; i++) if (plan[i] && (front[i % w] < 1 || side[Math.floor(i / w)] < 1)) return false;
    for (let x = 0; x < w; x++) {
      let ok = front[x] === 0;
      for (let z = 0; z < d && !ok; z++) ok = plan[z * w + x] && side[z] >= front[x];
      if (!ok) return false;
    }
    for (let z = 0; z < d; z++) {
      let ok = side[z] === 0;
      for (let x = 0; x < w && !ok; x++) ok = plan[z * w + x] && front[x] >= side[z];
      if (!ok) return false;
    }
    return true;
  }

  // the most cubes: every column as tall as both elevations allow
  const most = (v) => caps(v);

  /* The fewest cubes. Every covered square needs one cube; every column must
   * reach its front height somewhere and every row its side height somewhere.
   * One stack can do both jobs when its column and row need the same height,
   * so pair them up as much as possible (a bipartite matching). */
  function fewest(v) {
    const { w, d, plan, front, side } = v;
    const rowOfCol = new Array(w).fill(-1);
    const colOfRow = new Array(d).fill(-1);
    const edge = (x, z) => plan[z * w + x] && front[x] > 1 && front[x] === side[z];
    function augment(x, seen) {
      for (let z = 0; z < d; z++) {
        if (!edge(x, z) || seen[z]) continue;
        seen[z] = true;
        if (colOfRow[z] < 0 || augment(colOfRow[z], seen)) {
          colOfRow[z] = x;
          rowOfCol[x] = z;
          return true;
        }
      }
      return false;
    }
    for (let x = 0; x < w; x++) augment(x, []);
    const h = plan.map((p) => (p ? 1 : 0));
    for (let x = 0; x < w; x++) {
      if (front[x] < 2) continue;
      let z = rowOfCol[x];
      for (let k = 0; z < 0 && k < d; k++) if (plan[k * w + x] && side[k] >= front[x]) z = k;
      h[z * w + x] = front[x];
    }
    for (let z = 0; z < d; z++) {
      if (side[z] < 2) continue;
      let done = false;
      for (let x = 0; x < w; x++) if (h[z * w + x] === side[z]) done = true;
      if (done) continue;
      let x = colOfRow[z];
      for (let k = 0; x < 0 && k < w; k++) if (plan[z * w + k] && front[k] >= side[z]) x = k;
      h[z * w + x] = side[z];
    }
    return h;
  }

  /* How many different structures have these views, by number of cubes.
   * Row by row, remembering which columns have already reached their front
   * height. Returns { total, byCount: { cubes: ways } }. */
  function census(v) {
    const { w, d, plan, front } = v;
    const cap = caps(v);
    const full = front.reduce((m, f, x) => (f > 0 ? m | (1 << x) : m), 0);
    let states = new Map([[0, new Map([[0, 1]])]]);
    for (let z = 0; z < d; z++) {
      // every way to fill this row that reaches its side height: (columns reached, cubes) -> ways
      const opts = new Map();
      const vals = new Array(w).fill(0);
      const walk = (x) => {
        if (x === w) {
          let top = 0;
          let mask = 0;
          let n = 0;
          for (let k = 0; k < w; k++) {
            top = Math.max(top, vals[k]);
            if (vals[k] > 0 && vals[k] === front[k]) mask |= 1 << k;
            n += vals[k];
          }
          if (top !== v.side[z]) return;
          const key = mask * 1000 + n;
          opts.set(key, (opts.get(key) || 0) + 1);
          return;
        }
        const c = cap[z * w + x];
        if (!plan[z * w + x]) {
          vals[x] = 0;
          walk(x + 1);
          return;
        }
        for (let k = 1; k <= c; k++) {
          vals[x] = k;
          walk(x + 1);
        }
      };
      walk(0);
      const next = new Map();
      for (const [mask, hist] of states) {
        for (const [key, ways] of opts) {
          const m2 = mask | Math.floor(key / 1000);
          const n2 = key % 1000;
          let to = next.get(m2);
          if (!to) next.set(m2, (to = new Map()));
          for (const [n, k] of hist) to.set(n + n2, (to.get(n + n2) || 0) + k * ways);
        }
      }
      states = next;
    }
    const byCount = {};
    let total = 0;
    const hist = states.get(full) || new Map();
    for (const [n, k] of hist) {
      byCount[n] = k;
      total += k;
    }
    return { total, byCount };
  }

  /* The structure with these views closest to the build h (fewest columns
   * changed, counting each cube added or taken away). With fewestOnly, only
   * structures that use the fewest cubes are allowed. Each column chooses
   * which square reaches its front height; given those choices every row
   * picks its own best square, so the search is small. */
  function nearest(v, h, fewestOnly) {
    const { w, d, plan, front, side } = v;
    const cap = caps(v);
    const base = cap.map((c, i) => (c === 0 ? 0 : fewestOnly ? 1 : Math.min(Math.max(h[i], 1), c)));
    const cols = [];
    for (let x = 0; x < w; x++) {
      if (front[x] < 2) continue;
      const opts = [];
      for (let z = 0; z < d; z++) if (plan[z * w + x] && side[z] >= front[x]) opts.push(z);
      cols.push({ x, opts });
    }
    let best = null;
    let bestKey = null;
    const pick = new Array(cols.length).fill(0);
    for (;;) {
      const s = base.slice();
      cols.forEach((c, k) => { s[c.opts[pick[k]] * w + c.x] = front[c.x]; });
      for (let z = 0; z < d; z++) {
        if (side[z] < 2) continue;
        let done = false;
        for (let x = 0; x < w; x++) if (s[z * w + x] === side[z]) done = true;
        if (done) continue;
        let bx = -1;
        let bCost = Infinity;
        for (let x = 0; x < w; x++) {
          const i = z * w + x;
          if (!plan[i] || front[x] < side[z]) continue;
          const cost = Math.abs(side[z] - h[i]) - Math.abs(s[i] - h[i]);
          if (cost < bCost) {
            bCost = cost;
            bx = x;
          }
        }
        s[z * w + bx] = side[z];
      }
      let dist = 0;
      for (let i = 0; i < s.length; i++) dist += Math.abs(s[i] - h[i]);
      const key = fewestOnly ? [count(s), dist] : [dist, count(s)];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = s;
        bestKey = key;
      }
      let k = 0;
      while (k < cols.length && ++pick[k] >= cols[k].opts.length) pick[k++] = 0;
      if (k >= cols.length) break;
    }
    return best;
  }

  /* --------------------------------------------------------- the levels */
  const square = (x, z, d) => LETTERS[x] + (d - z);

  // everything the game needs about level i
  function level(i) {
    const L = LEVELS[i];
    const s = shape(L.rows);
    const target = views(s.w, s.d, s.h);
    const lo = count(fewest(target));
    const hi = count(most(target));
    const c = census(target);
    return {
      index: i,
      w: s.w,
      d: s.d,
      top: L.top || TOP,
      goal: L.goal || 'match',
      tip: L.tip || '',
      hidden: s.h,
      target,
      min: lo,
      max: hi,
      shapes: c.total,
      fewestShapes: c.byCount[lo] || 0,
      bonus: !L.goal && lo < hi,
    };
  }

  /* ---------------------------------------------------------- pictures
   * A view drawn on squared paper: cols x rows squares, row 0 at the top. */
  function picture(kind, v, top) {
    const { w, d } = v;
    if (kind === 'plan') {
      return { kind, cols: w, rows: d, on: v.plan.slice(), labels: LETTERS.slice(0, w).split(''), side: rowNumbers(d) };
    }
    const heights = kind === 'front' ? v.front : v.side.slice().reverse();   // the side view puts the front on the left
    const cols = heights.length;
    const on = [];
    for (let r = 0; r < top; r++) for (let c = 0; c < cols; c++) on.push(heights[c] >= top - r);
    const labels = kind === 'front' ? LETTERS.slice(0, w).split('') : rowNumbers(d).reverse();
    return { kind, cols, rows: top, on, labels };
  }
  function rowNumbers(d) {
    const out = [];
    for (let z = 0; z < d; z++) out.push(String(d - z));     // back row first: d ... 1
    return out;
  }
  const samePicture = (a, b) => a.cols === b.cols && a.rows === b.rows && sameList(a.on, b.on);

  /* ------------------------------------------------------------- hints */
  // what is wrong, in the order a hint talks about it
  function mismatches(target, mine) {
    const { w, d } = target;
    const out = [];
    for (let z = d - 1; z >= 0; z--) {
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        if (target.plan[i] !== mine.plan[i]) out.push({ view: 'plan', x, z, want: target.plan[i] ? 1 : 0, have: mine.plan[i] ? 1 : 0 });
      }
    }
    for (let x = 0; x < w; x++) if (target.front[x] !== mine.front[x]) out.push({ view: 'front', x, want: target.front[x], have: mine.front[x] });
    for (let z = d - 1; z >= 0; z--) if (target.side[z] !== mine.side[z]) out.push({ view: 'side', z, want: target.side[z], have: mine.side[z] });
    return out;
  }

  /* A hint for build h on level lv. Step 0 names one thing that is wrong
   * (and which squares it is about); step 1 names a square to change, on the
   * way to the nearest structure that fits. aim ('fewest' or 'most') steers
   * towards a star; a fewest-cubes level always aims for the fewest. */
  function hint(lv, h, step, aim) {
    const { w, d, target } = lv;
    const mine = views(w, d, h);
    const wrong = mismatches(target, mine);
    const want = lv.goal === 'fewest' ? 'fewest' : aim || null;
    const n = count(h);
    const short = want === 'fewest' ? n > lv.min : want === 'most' ? n < lv.max : false;
    if (!wrong.length && !short) return { kind: 'done', text: say.hintDone(), squares: [] };
    if (step === 0 && !wrong.length) {
      return want === 'fewest'
        ? { kind: 'fewest', text: say.hintFewest(lv.min, n), squares: [] }
        : { kind: 'most', text: say.hintMost(lv.max, n), squares: [] };
    }
    if (step === 0) {
      const m = wrong[0];
      if (m.view === 'plan') return { kind: 'view', view: 'plan', text: say.hintPlan(square(m.x, m.z, d), m.want === 1), squares: [{ x: m.x, z: m.z }] };
      if (m.view === 'front') {
        const squares = [];
        for (let z = 0; z < d; z++) squares.push({ x: m.x, z });
        return { kind: 'view', view: 'front', text: say.hintFront(LETTERS[m.x], m.want, m.have), squares };
      }
      const squares = [];
      for (let x = 0; x < w; x++) squares.push({ x, z: m.z });
      return { kind: 'view', view: 'side', text: say.hintSide(d - m.z, m.want, m.have), squares };
    }
    const goal = want === 'most' ? most(target) : nearest(target, h, want === 'fewest');
    // a square in the part of the drawing the first hint talked about, if there is one
    const near = (i) => {
      if (!wrong.length) return 0;
      const m = wrong[0];
      const x = i % w;
      const z = Math.floor(i / w);
      if (m.view === 'plan') return x === m.x && z === m.z ? 2 : 0;
      if (m.view === 'front') return x === m.x ? 2 : 0;
      return z === m.z ? 2 : 0;
    };
    let pick = -1;
    let score = -1;
    for (let i = 0; i < h.length; i++) {
      if (goal[i] === h[i]) continue;
      const sc = near(i) * 10 + Math.abs(goal[i] - h[i]);
      if (sc > score) {
        score = sc;
        pick = i;
      }
    }
    const x = pick % w;
    const z = Math.floor(pick / w);
    return { kind: 'square', text: say.hintSquare(square(x, z, d), goal[pick]), squares: [{ x, z, to: goal[pick] }] };
  }

  /* -------------------------------------------------------------- quiz
   * "Which drawing is the front elevation?" Each question shows a model and
   * three drawings: the right one and two classic mix-ups. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const QUIZ_ASKS = ['front', 'side', 'plan', 'front', 'side', 'plan', 'front', 'side'];

  function mirror(p) {
    const on = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) on.push(p.on[r * p.cols + (p.cols - 1 - c)]);
    return Object.assign({}, p, { on });
  }
  function flip(p) {
    const on = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) on.push(p.on[(p.rows - 1 - r) * p.cols + c]);
    return Object.assign({}, p, { on });
  }
  // the same drawing with one column a square taller or shorter (or one plan square changed)
  function tweak(p, rand) {
    const on = p.on.slice();
    if (p.kind === 'plan') {
      const i = Math.floor(rand() * on.length);
      on[i] = !on[i];
      if (!on.some(Boolean)) on[(i + 1) % on.length] = true;
      return { pic: Object.assign({}, p, { on }), col: i % p.cols, row: Math.floor(i / p.cols) };
    }
    const heights = [];
    for (let c = 0; c < p.cols; c++) {
      let n = 0;
      for (let r = 0; r < p.rows; r++) if (on[r * p.cols + c]) n++;
      heights.push(n);
    }
    const c = Math.floor(rand() * p.cols);
    const up = heights[c] <= 1 || (heights[c] < p.rows && rand() < 0.5);
    heights[c] += up ? 1 : -1;
    for (let r = 0; r < p.rows; r++) for (let k = 0; k < p.cols; k++) on[r * p.cols + k] = heights[k] >= p.rows - r;
    return { pic: Object.assign({}, p, { on }), col: c, row: -1 };
  }

  function quizShape(rand, n) {
    for (;;) {
      const h = [];
      for (let i = 0; i < n * n; i++) h.push(rand() < 0.28 ? 0 : 1 + Math.floor(rand() * rand() * 3));
      const v = views(n, n, h);
      const f = picture('front', v, 3);
      const s = picture('side', v, 3);
      const p = picture('plan', v, 3);
      const ok = v.front.every((k) => k > 0) && v.side.every((k) => k > 0) &&
        !samePicture(f, s) && !samePicture(f, mirror(f)) && !samePicture(s, mirror(s)) &&
        !samePicture(p, mirror(p)) && !samePicture(p, flip(p)) && count(h) >= n + 2;
      if (ok) return { w: n, d: n, h, v };
    }
  }

  function quiz(seed, length) {
    const rand = rng(seed || 1);
    const out = [];
    const total = length || QUIZ_ASKS.length;
    for (let q = 0; q < total; q++) {
      const ask = QUIZ_ASKS[q % QUIZ_ASKS.length];
      const n = q < total / 2 ? 3 : 4;
      const m = quizShape(rand, n);
      const right = picture(ask, m.v, 3);
      const pool = [];
      if (ask === 'front') {
        pool.push({ why: 'side', pic: picture('side', m.v, 3) });
        pool.push({ why: 'back', pic: mirror(right) });
      } else if (ask === 'side') {
        pool.push({ why: 'front', pic: picture('front', m.v, 3) });
        pool.push({ why: 'left', pic: mirror(right) });
      } else {
        pool.push({ why: 'mirror', pic: mirror(right) });
        pool.push({ why: 'flip', pic: flip(right) });
      }
      for (let tries = 0; tries < 20; tries++) {
        const t = tweak(right, rand);
        if (!samePicture(t.pic, right) && pool.every((o) => !samePicture(o.pic, t.pic))) {
          pool.push({ why: 'tweak', pic: t.pic, col: t.col, row: t.row });
          break;
        }
      }
      // two different wrong drawings, picked at random from the mix-ups
      const wrong = [];
      pool.forEach((o) => {
        if (!samePicture(o.pic, right) && wrong.every((k) => !samePicture(k.pic, o.pic))) wrong.push(o);
      });
      while (wrong.length > 2) wrong.splice(Math.floor(rand() * wrong.length), 1);
      if (wrong.length < 2) {
        q--;                              // not enough different mix-ups for this model: make another
        continue;
      }
      const options = [{ why: 'right', pic: right }].concat(wrong);
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      out.push({
        w: m.w,
        d: m.d,
        top: 3,
        h: m.h,
        ask,
        options,
        answer: options.findIndex((o) => o.why === 'right'),
      });
    }
    return out;
  }

  /* ---------------------------------------------------- words for views */
  const VIEW_NAMES = { plan: 'plan', front: 'front elevation', side: 'side elevation' };
  const cubes = (n) => `${n} ${n === 1 ? 'cube' : 'cubes'}`;
  const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  // a drawing in words, for screen readers
  function describe(kind, v) {
    const { w, d } = v;
    if (kind === 'plan') {
      const on = [];
      for (let z = d - 1; z >= 0; z--) for (let x = 0; x < w; x++) if (v.plan[z * w + x]) on.push(square(x, z, d));
      return on.length ? `Plan, from above: ${on.length === 1 ? 'square' : 'squares'} ${list(on)} covered.` : 'Plan, from above: nothing covered.';
    }
    if (kind === 'front') return `Front elevation: ${v.front.map((k, x) => `column ${LETTERS[x]} ${k} high`).join(', ')}.`;
    const parts = [];
    for (let z = d - 1; z >= 0; z--) parts.push(`row ${d - z} ${v.side[z]} high`);
    return `Side elevation, from the right: ${parts.join(', ')}.`;
  }

  // a picture in words (the quiz options)
  function describePicture(p) {
    if (p.kind === 'plan') {
      const on = [];
      for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) if (p.on[r * p.cols + c]) on.push(LETTERS[c] + (p.rows - r));
      return `squares ${list(on)} covered`;
    }
    const parts = [];
    for (let c = 0; c < p.cols; c++) {
      let n = 0;
      for (let r = 0; r < p.rows; r++) if (p.on[r * p.cols + c]) n++;
      parts.push(String(n));
    }
    return `column heights ${parts.join(', ')} from left to right`;
  }

  const TURNS = ['the front', 'the front right', 'the right side', 'the back right', 'the back', 'the back left', 'the left side', 'the front left'];

  /* ------------------------------------------------------------ messages */
  const say = {
    start: (n, tip, goal) => `Level ${n}. ${tip || (goal === 'fewest' ? 'Match all three views with as few cubes as you can.' : 'Build a shape that matches all three views.')}`,
    edit: (sq, high, matching) => `${sq} is ${high ? `${cubes(high)} high` : 'empty'}. ${matching === 3 ? 'All 3 views match.' : `${matching} of 3 views match.`}`,
    edge: () => 'There is no square beyond the edge of the baseplate.',
    tooTall: (sq, top) => `${sq} is already ${top} high, the tallest allowed here.`,
    nothing: (sq) => `${sq} has no cubes to remove.`,
    undo: () => 'Took that back.',
    noUndo: () => 'Nothing to undo yet.',
    clear: () => 'Cleared the baseplate. Undo brings it back.',
    alreadyEmpty: () => 'The baseplate is already empty.',
    keep: (min, max, st) => {
      const left = [];
      if (!st.fewest) left.push(`the fewest is ${min}`);
      if (!st.most) left.push(`the most is ${max}`);
      return `Keep building for the stars: ${left.join(' and ')}.`;
    },
    solved: (n, k) => `All three views match! Level ${n} solved with ${cubes(k)}.`,
    solvedFewest: (n, k) => `All three views match with ${cubes(k)}, the fewest possible! Level ${n} solved.`,
    notFewest: (k, min) => `All three views match with ${cubes(k)}, but it can be done with ${min}. Which cubes can't be seen in any view?`,
    star: (kind, k) => (kind === 'fewest' ? `Fewest-cubes star! ${k} is the fewest possible.` : `Most-cubes star! ${k} is the most possible.`),
    stillMatch: (k) => `Still a match, with ${cubes(k)}.`,
    shapes: (total) => (total === 1
      ? 'Only one shape has these three views, so this was pure deduction.'
      : `${total} different shapes have exactly these three views. Any of them counts.`),
    fewestShapes: (min, total) => (total === 1
      ? `Only one shape matches with ${min} cubes.`
      : `${total} different shapes match with just ${min} cubes.`),
    bonusLine: (min, max) => `The fewest cubes possible is ${min}; the most is ${max}.`,
    cursor: (sq, high, planWant, colName, colWant, rowName, rowWant) =>
      `${sq}: ${high ? `${cubes(high)} high` : 'empty'}. Plan: ${planWant ? 'covered' : 'empty'}. Column ${colName} is ${colWant} high from the front. Row ${rowName} is ${rowWant} high from the side.`,
    turn: (k) => `Looking from ${TURNS[((k % 8) + 8) % 8]}.`,
    tool: (erase) => (erase ? 'Eraser: tap a cube to take the top one off its stack.' : 'Build: tap a square or a cube to add a cube.'),
    compare: (on) => (on ? 'Compare is on: amber squares are missing from your build, red crosses are extra.' : 'Compare is off.'),
    hintPlan: (sq, wanted) => (wanted
      ? `Hint: the plan shows a square at ${sq}, but you have no cubes there.`
      : `Hint: the plan has no square at ${sq}, so it must stay empty.`),
    hintFront: (col, want, have) => (want > have
      ? `Hint: from the front, column ${col} should be ${want} high, but its tallest stack is ${have}.`
      : `Hint: from the front, column ${col} should be only ${want} high, but it has a stack of ${have}.`),
    hintSide: (row, want, have) => (want > have
      ? `Hint: from the side, row ${row} should be ${want} high, but its tallest stack is ${have}.`
      : `Hint: from the side, row ${row} should be only ${want} high, but it has a stack of ${have}.`),
    hintFewest: (min, k) => `Hint: ${min} cubes is enough, and you have ${k}. One stack can show in the front view and the side view at once when its column and its row need the same height.`,
    hintMost: (max, k) => `Hint: ${max} cubes is the most, and you have ${k}. Make every covered square as tall as both its column and its row allow.`,
    hintSquare: (sq, to) => (to ? `Hint: try making ${sq} ${cubes(to)} high.` : `Hint: try making ${sq} empty.`),
    hintDone: () => 'Everything matches already!',
    quizAsk: (q, total, ask) => `Question ${q} of ${total}: which drawing is the ${VIEW_NAMES[ask]}?`,
    quizRight: (ask) => `Yes! That's the ${VIEW_NAMES[ask]}.`,
    // why a wrong drawing is wrong; opt is the quiz option that was picked
    quizWhy: (opt, ask) => {
      const why = opt.why;
      if (why === 'side') return 'Not quite: that one is the side elevation, the view from the right.';
      if (why === 'front') return 'Not quite: that one is the front elevation.';
      if (why === 'back') return 'Not quite: that is the view from the back, the front elevation flipped left to right.';
      if (why === 'left') return 'Not quite: that is the view from the left, the side elevation flipped.';
      if (why === 'mirror') return 'Not quite: that is the plan flipped left to right.';
      if (why === 'flip') return 'Not quite: that plan is upside down. The front edge goes at the bottom.';
      if (ask === 'plan') return `Close, but look at square ${LETTERS[opt.col]}${opt.pic.rows - opt.row}.`;
      if (ask === 'front') return `Close, but look at column ${LETTERS[opt.col]}: its height is wrong.`;
      return `Close, but look at row ${opt.col + 1}: its height is wrong.`;
    },
    quizDone: (right, total) => `${right} out of ${total} right.`,
    quizVerdict: (right, total) => (right === total ? 'Perfect: you read every view right.' : right >= total - 2 ? 'Great reading of the views.' : 'Keep at it: try turning the model to look from each side.'),
  };

  const api = {
    LETTERS,
    TOP,
    LEVELS: LEVELS.map((L) => Object.assign({}, L, { rows: L.rows.slice() })),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    shape,
    count,
    blank,
    views,
    compare,
    caps,
    possible,
    most,
    fewest,
    census,
    nearest,
    level,
    square,
    picture,
    samePicture,
    mirror,
    flip,
    mismatches,
    hint,
    rng,
    quiz,
    describe,
    describePicture,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Views = api;
})(this);
