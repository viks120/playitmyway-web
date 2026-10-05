/* Stepping Stones: the ponds. Their rules, the pond generator and the route
 * checker.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Ponds; in Node it
 * is a CommonJS module.
 */
(function (root) {
  'use strict';

  const ROWS = 8;
  const COLS = 4;

  /* mulberry32: a tiny seedable generator, so any pond can be replayed */
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

  const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const pick = (rand, list) => list[Math.floor(rand() * list.length)];

  function shuffle(rand, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function pickWeighted(rand, items) {
    let total = 0;
    for (const x of items) total += x.w;
    let r = rand() * total;
    for (const x of items) {
      r -= x.w;
      if (r < 0) return x;
    }
    return items[items.length - 1];
  }

  /* ---------------------------------------------------------------- rules
   * Each pond knows its right answers, its decoys (weighted so near misses
   * turn up most), which decoys are near misses of a given right answer, and
   * how to explain any stone. */

  function parityPond(id, title, even, lo, hi) {
    const word = even ? 'even' : 'odd';
    const Word = even ? 'Even' : 'Odd';
    const ends = even ? '0, 2, 4, 6 or 8' : '1, 3, 5, 7 or 9';
    const fits = (v) => (v % 2 === 0) === even;
    const all = range(lo, hi);
    return {
      id,
      family: 'parity',
      title,
      rule: `Hop on <b>${word}</b> numbers`,
      ruleText: `Hop on ${word} numbers`,
      hint: `${Word} numbers end in ${ends}`,
      rights: all.filter(fits).map(String),
      decoys: all.filter((v) => !fits(v)).map((v) => ({ label: String(v), w: 1 })),
      near: (label) => [+label - 1, +label + 1].filter((v) => v >= lo && v <= hi && !fits(v)).map(String),
      judge(label) {
        const v = +label;
        const said = `${v} is ${v % 2 === 0 ? 'even' : 'odd'}: it ends in ${v % 10}.`;
        return fits(v) ? { ok: true, why: said } : { ok: false, why: `${said} ${Word} numbers end in ${ends}.` };
      },
    };
  }

  function timesPond(n) {
    const top = 12 * n;
    const multiples = range(1, 12).map((k) => k * n);
    const endings = new Set(multiples.map((m) => m % 10));
    const decoys = range(1, top - 1).filter((d) => d % n !== 0).map((d) => {
      let w = 1;
      if (Math.min(d % n, n - (d % n)) <= 2) w += 3;                  // just off a right answer
      if (endings.has(d % 10)) w += 2;                                // ends like one: 14 for the 4s
      if ((n > 2 && d % (n - 1) === 0) || d % (n + 1) === 0) w += 2;  // a neighbouring table
      if (n === 10 && d % 5 === 0) w += 4;                            // 15, 25 and so on for the 10s
      return { label: String(d), w };
    });
    const isDecoy = new Set(decoys.map((x) => x.label));
    return {
      id: 'times-' + n,
      family: 'times',
      title: `${n} times table`,
      rule: `Hop on the <b>${n} times table</b>`,
      ruleText: `Hop on the ${n} times table`,
      hint: multiples.join(' · '),
      rights: multiples.map(String),
      decoys,
      near: (label) => [-2, -1, 1, 2].map((d) => String(+label + d)).filter((s) => isDecoy.has(s)),
      judge(label) {
        const v = +label;
        if (v % n === 0 && v >= n && v <= top) return { ok: true, why: `${v} = ${n} × ${v / n}` };
        if (v < n) return { ok: false, why: `${v} isn't in the ${n} times table: it starts at ${n} × 1 = ${n}.` };
        if (v > top) return { ok: false, why: `${v} is past this pond: it stops at ${n} × 12 = ${top}.` };
        const k = Math.floor(v / n);
        return { ok: false, why: `${v} isn't in the ${n} times table: ${n} × ${k} = ${k * n} and ${n} × ${k + 1} = ${(k + 1) * n}.` };
      },
    };
  }

  function bondsPond(target) {
    const step = target === 100 ? 5 : 1;
    const misses = target === 100 ? [90, 95, 105, 110] : [target - 1, target + 1];
    const most = target === 100 ? 95 : target;      // keeps every label within 5 characters
    const firsts = [];
    for (let a = step; a <= target - step; a += step) firsts.push(a);
    const decoys = [];
    for (const sum of misses) {
      for (const a of firsts) {
        const b = sum - a;
        if (b >= step && b <= most && b % step === 0) decoys.push({ label: `${a}+${b}`, w: 1 });
      }
    }
    const isDecoy = new Set(decoys.map((x) => x.label));
    const hints = {
      10: '1+9 · 2+8 · 3+7 · 4+6 · 5+5',
      20: 'Use make 10: 3 + 7 = 10, so 13 + 7 = 20',
      100: 'Think in tens: 30 + 70 = 100, so 35 + 65 = 100',
    };
    return {
      id: 'make-' + target,
      family: 'bonds',
      title: `Make ${target}`,
      rule: `Hop on stones that <b>make ${target}</b>`,
      ruleText: `Hop on stones that make ${target}`,
      hint: hints[target],
      rights: firsts.map((a) => `${a}+${target - a}`),
      decoys,
      near(label) {
        const [a, b] = label.split('+').map(Number);
        const out = [];
        for (const d of [step, -step, 10, -10]) out.push(`${a}+${b + d}`, `${a + d}+${b}`);
        return out.filter((s) => isDecoy.has(s));
      },
      judge(label) {
        const [a, b] = label.split('+').map(Number);
        if (a + b === target) return { ok: true, why: `${a} + ${b} = ${target}` };
        return { ok: false, why: `${a} + ${b} = ${a + b}, not ${target}. ${a} + ${target - a} makes ${target}.` };
      },
    };
  }

  const LIST = [
    parityPond('even-20', 'Even to 20', true, 1, 20),
    parityPond('odd-20', 'Odd to 20', false, 1, 20),
    parityPond('even-100', 'Even to 100', true, 10, 100),
    parityPond('odd-100', 'Odd to 100', false, 10, 100),
    ...[2, 5, 10, 3, 4, 6, 7, 8, 9].map(timesPond),
    bondsPond(10),
    bondsPond(20),
    bondsPond(100),
  ];
  LIST[0].start = true;
  const BY_ID = Object.fromEntries(LIST.map((p) => [p.id, p]));

  const FAMILIES = [
    { id: 'parity', title: 'Odd & even' },
    { id: 'times', title: 'Times tables' },
    { id: 'bonds', title: 'Number bonds' },
  ];

  /* ------------------------------------------------------------ generator */

  /* A route of right stones comes first, so a way across always exists: one
   * stone per row, each touching the last, bending at least twice. */
  function makeRoute(rand) {
    for (;;) {
      const cols = [Math.floor(rand() * COLS)];
      for (let r = 1; r < ROWS; r++) {
        const c = cols[r - 1];
        cols.push(c + pick(rand, [-1, 0, 1].filter((d) => c + d >= 0 && c + d < COLS)));
      }
      let bends = 0;
      for (let r = 1; r < ROWS; r++) if (cols[r] !== cols[r - 1]) bends++;
      if (bends >= 2) return cols;
    }
  }

  function build(def, rand) {
    const route = makeRoute(rand);
    const ok = route.map((rc) => Array.from({ length: COLS }, (_, c) => c === rc));

    // Extra right stones make branches and dead ends. A small decoy pool (odd
    // and even to 20 has only ten decoys, each allowed twice) also forces a
    // minimum number of right stones, so the decoys can fill the rest.
    const need = Math.max(ROWS, ROWS * COLS - 2 * def.decoys.length);
    let rights = ROWS;
    const spare = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!ok[r][c]) spare.push([r, c]);
    for (const [r, c] of shuffle(rand, spare)) {
      if (ok[r].filter(Boolean).length >= 2) continue;
      if (rights < need || rand() < 0.15) {
        ok[r][c] = true;
        rights++;
      }
    }
    if (rights < need) return null;

    const count = new Map();
    const taken = Array.from({ length: ROWS }, () => new Set());
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    function place(r, c, first, all) {
      const free = (x) => !taken[r].has(x) && (count.get(x) || 0) < 2;
      let label = null;
      for (let i = 0; i < 24 && label === null; i++) {
        const x = first();
        if (free(x)) label = x;
      }
      if (label === null) label = shuffle(rand, all.slice()).find(free) || null;
      if (label === null) return false;
      taken[r].add(label);
      count.set(label, (count.get(label) || 0) + 1);
      grid[r][c] = label;
      return true;
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (ok[r][c] && !place(r, c, () => pick(rand, def.rights), def.rights)) return null;
      }
    }
    const decoyLabels = def.decoys.map((x) => x.label);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (ok[r][c]) continue;
        const nearby = [];
        for (let rr = Math.max(0, r - 1); rr <= Math.min(ROWS - 1, r + 1); rr++) {
          for (let cc = 0; cc < COLS; cc++) if (ok[rr][cc]) nearby.push(grid[rr][cc]);
        }
        // mostly near misses of a right stone close by, otherwise any decoy
        const first = () => {
          if (rand() < 0.6) {
            const near = def.near(pick(rand, nearby));
            if (near.length) return pick(rand, near);
          }
          return pickWeighted(rand, def.decoys).label;
        };
        if (!place(r, c, first, decoyLabels)) return null;
      }
    }
    return {
      route,
      rows: grid.map((row) => row.map((label) => Object.assign({ label }, def.judge(label)))),
    };
  }

  /* Breadth-first search over right stones: from the near bank (any stone in
   * the first row) to the far bank (any stone in the last row), hopping to
   * any touching stone, diagonals included. */
  function hasRoute(rows) {
    const R = rows.length;
    const C = rows[0].length;
    const seen = new Set();
    const queue = [];
    for (let c = 0; c < C; c++) {
      if (rows[0][c].ok) {
        queue.push([0, c]);
        seen.add(c);
      }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r === R - 1) return true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          const key = nr * C + nc;
          if ((dr || dc) && nr >= 0 && nr < R && nc >= 0 && nc < C && rows[nr][nc].ok && !seen.has(key)) {
            seen.add(key);
            queue.push([nr, nc]);
          }
        }
      }
    }
    return false;
  }

  const rowsOk = (rows) => rows.every((row) => {
    const n = row.filter((x) => x.ok).length;
    return n >= 1 && n <= 2;
  });

  function generate(id, seed) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    const rand = rng(seed);
    for (let attempt = 0; attempt < 50; attempt++) {
      const built = build(def, rand);
      if (built && rowsOk(built.rows) && hasRoute(built.rows)) {
        return {
          id: def.id,
          family: def.family,
          title: def.title,
          rule: def.rule,
          ruleText: def.ruleText,
          hint: def.hint,
          route: built.route,
          rows: built.rows,
        };
      }
    }
    throw new Error('Could not build pond: ' + id);
  }

  function judge(id, label) {
    const def = BY_ID[id];
    if (!def) throw new Error('Unknown pond: ' + id);
    return def.judge(String(label));
  }

  const api = {
    ROWS,
    COLS,
    FAMILIES,
    LIST: LIST.map((p) => ({ id: p.id, family: p.family, title: p.title, start: !!p.start })),
    generate,
    judge,
    hasRoute,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ponds = api;
})(this);
