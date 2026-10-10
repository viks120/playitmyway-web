/* Log Jam: the puzzles. The levels, the rules for sliding logs, a solver
 * (for hints and the fewest moves, and to prove every level can be
 * finished), the words that describe a log, and every message.
 *
 * The rules: a log lying across the river slides only left and right; a log
 * lying along it slides only up and down. Nothing can pass through anything
 * else or through the bank. The boat lies across the third row, and it is
 * free once it reaches the gap in the right-hand bank. A move is sliding one
 * log (or the boat) any distance in one direction.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.LogJam; in Node
 * it is a CommonJS module.
 *
 * Level maps: 6 rows of 6 squares, from the far bank (top) to the near bank.
 * '.' is open ice, 'B' the boat, and each lowercase letter is one log: its 2
 * or 3 squares in a straight line.
 */
(function (root) {
  'use strict';

  const SIZE = 6;
  const EXIT_ROW = 2;                   // the boat's row, with the gap at its right-hand end
  const GOAL = SIZE - 2;                // the boat's left end once its bow is in the gap

  // made by a generator and checked by the solver; `best` is the fewest moves
  const LEVELS = [
    // warm-up
    { best: 2, rows: ['......', '....a.', '..BBa.', '.bbb..', '......', '......'] },
    { best: 3, rows: ['......', '..a...', 'BBab..', 'c..b..', 'c.....', 'c.....'] },
    { best: 4, rows: ['......', '.....a', 'BB.b.a', '...b..', '...b..', '...cc.'] },
    { best: 5, rows: ['......', '.....a', 'BB..ba', '....ba', '...cb.', '...cdd'] },
    { best: 6, rows: ['....a.', '....ab', '.cBBab', '.c.ddd', '......', '....ee'] },
    { best: 7, rows: ['..aaab', '....cb', 'BBd.cb', '..d.ee', '......', '...fff'] },
    { best: 8, rows: ['....a.', '...bac', '.BBbac', '..ddd.', '...eff', '...e..'] },
    { best: 9, rows: ['.aa.bc', '.d..bc', '.dBBbc', '......', '..efgg', '..ef..'] },
    { best: 10, rows: ['.....a', '...bca', 'BB.bca', 'd...ee', 'dffggg', 'd...hh'] },
    // medium
    { best: 11, rows: ['abbb..', 'a..c.d', 'BBecfd', '..egfd', '...g..', '...ghh'] },
    { best: 12, rows: ['aabbbc', 'd..efc', 'dBBef.', 'gg.ef.', 'h..iii', 'h..jj.'] },
    { best: 13, rows: ['.aaabc', '..d.bc', 'BBd.bc', '......', 'eff.gg', 'ehh.ii'] },
    { best: 14, rows: ['.aa.bc', 'ddd.bc', '.efBBc', '.efg..', 'hiig..', 'h..gjj'] },
    { best: 15, rows: ['......', 'aa.bcd', 'BB.bcd', 'eefffd', 'ghhiii', 'g...jj'] },
    { best: 16, rows: ['.aaa.b', 'c...db', 'cBB.de', '..ffde', '..ghhh', '..giii'] },
    { best: 17, rows: ['a..bbb', 'acccd.', 'BBefd.', '..efgg', '..hhhi', '...jji'] },
    { best: 18, rows: ['..aaab', '.cddeb', 'fcBBeg', 'fc..eg', '..h.ii', 'jjh...'] },
    { best: 19, rows: ['abbccd', 'a....d', 'a.BBed', 'ffghe.', '..ghii', '.jjh..'] },
    // hard
    { best: 21, rows: ['..abbb', '.ca.de', 'fcBBde', 'fghhhe', 'ig..jj', 'ikklll'] },
    { best: 22, rows: ['.aabb.', '.ccdde', 'fgBBhe', 'fg..he', '.gijkk', 'llijmm'] },
    { best: 23, rows: ['aaabbc', 'dd.e.c', 'BB.efg', 'hijjfg', 'hik.fg', 'h.k.ll'] },
    { best: 24, rows: ['..abbb', 'c.adee', 'cBBdfg', 'hijjfg', 'hikkkl', '.mmm.l'] },
    { best: 25, rows: ['a...bb', 'a.ccdd', 'BBe..f', 'ggehif', 'jjjhik', 'lll..k'] },
    { best: 26, rows: ['..aabb', 'ccd...', 'efdBBg', 'efhhig', 'efjkig', 'lljkmm'] },
    { best: 27, rows: ['abbc..', 'addce.', 'aBBfeg', 'hhifeg', '..ijjk', '.llmmk'] },
    { best: 28, rows: ['a.bbcc', 'a.ddde', 'BBf..e', 'g.f.hh', 'giiijk', 'llmmjk'] },
    { best: 29, rows: ['.abbcd', '.ae.cd', 'fgeBBd', 'fghijj', 'k.hi..', 'kllmm.'] },
    // expert
    { best: 30, rows: ['aaa.bc', 'd.eebc', 'd.BBbf', '..ghhf', 'i.gjkk', 'illj..'] },
    { best: 31, rows: ['.aaabc', '..ddbc', 'BBef..', 'g.efhh', 'giijjk', 'llmmmk'] },
    { best: 32, rows: ['abccdd', 'abee.f', '.bBBgf', 'hhijgf', '..ijkk', '.llmm.'] },
    { best: 33, rows: ['abbccd', 'a.effd', 'BBeg..', '...ghh', 'iiijk.', 'llljk.'] },
    { best: 34, rows: ['abb.cd', 'a...cd', 'efgBBh', 'efgiih', '..gjkk', 'lllj..'] },
    { best: 35, rows: ['aaabb.', '...cdd', 'BBec.f', 'g.ehhf', 'gii.jk', 'llmmjk'] },
    { best: 37, rows: ['aaa.bc', 'dee.bc', 'dBB.fg', '.hiifg', '.hjkkg', 'llj...'] },
    { best: 38, rows: ['...aaa', 'bccdef', 'bBBdef', 'ghiie.', 'ghjkkl', 'mmj..l'] },
    { best: 39, rows: ['...abb', '.c.ad.', 'ecBBdf', 'egghhf', 'e.ijjf', 'kkill.'] },
  ];
  const GROUPS = [
    { title: 'Warm-up', from: 0, to: 9 },
    { title: 'Medium', from: 9, to: 18 },
    { title: 'Hard', from: 18, to: 27 },
    { title: 'Expert', from: 27, to: 36 },
  ];
  const SIGN = { left: -1, right: 1, up: -1, down: 1 };
  const DIR_NAMES = Object.keys(SIGN);
  const across = (dir) => dir === 'left' || dir === 'right';

  /* Everything wrong with a level map, as a list of sentences (empty when it
   * is fine): the size, stray characters, logs that are not straight lines
   * of 2 or 3, and a boat that is missing, misplaced or already out. */
  function check(rows) {
    const problems = [];
    if (!Array.isArray(rows) || rows.length !== SIZE || rows.some((r) => typeof r !== 'string' || r.length !== SIZE)) {
      return [`a level is ${SIZE} rows of ${SIZE} squares`];
    }
    const found = new Map();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        if (!/^[a-zB]$/.test(ch)) {
          problems.push(`stray "${ch}" at row ${y + 1}, column ${x + 1}`);
          continue;
        }
        if (!found.has(ch)) found.set(ch, []);
        found.get(ch).push([x, y]);
      }
    }
    for (const [id, cells] of found) {
      const flat = cells.every((c) => c[1] === cells[0][1]);
      const upright = cells.every((c) => c[0] === cells[0][0]);
      const k = flat ? 0 : 1;
      const run = cells.map((c) => c[k]).sort((a, b) => a - b);
      const straight = (flat || upright) && run.every((v, i) => v === run[0] + i);
      if (!straight || cells.length < 2 || cells.length > 3) problems.push(`"${id}" is not a straight log of 2 or 3 squares`);
      else if (id === 'B' && (!flat || cells.length !== 2 || cells[0][1] !== EXIT_ROW)) problems.push('the boat lies across the third row, 2 squares long');
      else if (id !== 'B' && flat && cells[0][1] === EXIT_ROW) problems.push(`"${id}" lies across the boat's row`);
    }
    if (!found.has('B')) problems.push('there is no boat');
    else if (problems.length === 0 && Math.min(...found.get('B').map((c) => c[0])) === GOAL) problems.push('the boat starts at the gap');
    return problems;
  }

  /* A level map, read into a state: the pieces (the boat first, then the
   * logs by letter) and where each one is. `pos` is the column of a lying-
   * across piece's left end, or the row of a lying-along piece's top end. */
  function parse(rows) {
    const found = new Map();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        if (!found.has(ch)) found.set(ch, []);
        found.get(ch).push([x, y]);
      }
    }
    const ids = [...found.keys()].sort((a, b) => (a === 'B' ? -1 : b === 'B' ? 1 : a < b ? -1 : 1));
    const pieces = [];
    const pos = [];
    for (const id of ids) {
      const cells = found.get(id);
      const flat = cells.every((c) => c[1] === cells[0][1]);
      pieces.push({ id, len: cells.length, across: flat, line: flat ? cells[0][1] : cells[0][0] });
      pos.push(Math.min(...cells.map((c) => (flat ? c[0] : c[1]))));
    }
    return { pieces, pos };
  }

  // the squares piece i covers, as y * SIZE + x
  function cells(s, i) {
    const p = s.pieces[i];
    const out = [];
    for (let k = 0; k < p.len; k++) out.push(p.across ? p.line * SIZE + s.pos[i] + k : (s.pos[i] + k) * SIZE + p.line);
    return out;
  }

  /* Which piece covers each square (-1 for open ice), or null when two
   * pieces overlap or one hangs off the board. */
  function grid(s) {
    const g = new Array(SIZE * SIZE).fill(-1);
    for (let i = 0; i < s.pieces.length; i++) {
      const p = s.pieces[i];
      if (s.pos[i] < 0 || s.pos[i] + p.len > SIZE || p.line < 0 || p.line >= SIZE) return null;
      for (const c of cells(s, i)) {
        if (g[c] !== -1) return null;
        g[c] = i;
      }
    }
    return g;
  }

  // the square at distance v along piece i's line
  const along = (p, v) => (p.across ? p.line * SIZE + v : v * SIZE + p.line);

  /* How far piece i can slide each way: back (left or up) and fwd (right
   * or down), and what stops it there: a piece index, or -1 for the bank. */
  function room(s, i, g) {
    const board = g || grid(s);
    const p = s.pieces[i];
    const at = s.pos[i];
    let back = 0;
    while (at - back - 1 >= 0 && board[along(p, at - back - 1)] === -1) back++;
    let fwd = 0;
    while (at + p.len + fwd < SIZE && board[along(p, at + p.len + fwd)] === -1) fwd++;
    const backStop = at - back - 1 >= 0 ? board[along(p, at - back - 1)] : -1;
    const fwdStop = at + p.len + fwd < SIZE ? board[along(p, at + p.len + fwd)] : -1;
    return { back, fwd, backStop, fwdStop };
  }

  // the two directions piece i can ever slide
  const dirsOf = (s, i) => (s.pieces[i].across ? ['left', 'right'] : ['up', 'down']);

  /* Slide piece i `dist` squares (default 1) in direction dir. Returns the
   * new state, or null if that is not a legal move. */
  function slide(s, i, dir, dist) {
    const d = dist == null ? 1 : dist;
    if (!(i >= 0 && i < s.pieces.length) || !SIGN[dir] || across(dir) !== s.pieces[i].across || !(d >= 1)) return null;
    const r = room(s, i);
    if (d > (SIGN[dir] < 0 ? r.back : r.fwd)) return null;
    const pos = s.pos.slice();
    pos[i] += SIGN[dir] * d;
    return { pieces: s.pieces, pos };
  }

  // every legal move from s: { piece, dir, dist }
  function moves(s) {
    const g = grid(s);
    const out = [];
    for (let i = 0; i < s.pieces.length; i++) {
      const r = room(s, i, g);
      const [b, f] = dirsOf(s, i);
      for (let d = 1; d <= r.back; d++) out.push({ piece: i, dir: b, dist: d });
      for (let d = 1; d <= r.fwd; d++) out.push({ piece: i, dir: f, dist: d });
    }
    return out;
  }

  const solved = (s) => s.pos[0] === GOAL;

  // nothing between the boat's bow and the gap
  function clearWay(s) {
    const r = room(s, 0);
    return s.pos[0] + s.pieces[0].len + r.fwd === SIZE;
  }

  /* The fewest moves from s until the boat is out, by breadth-first search.
   * Returns { moves, path: [{ piece, dir, dist }] }, or null if there is no
   * way (never for a real level: every slide can be slid back) or the
   * search passes `limit` positions. */
  function solve(s, limit) {
    if (solved(s)) return { moves: 0, path: [] };
    const n = s.pieces.length;
    const P = s.pieces;
    const key = (pos) => {
      let k = 0;
      for (let i = 0; i < n; i++) k = k * 8 + pos[i];
      return k;
    };
    const seen = new Set([key(s.pos)]);
    const states = [s.pos.slice()];
    const parent = [-1];
    const how = [null];
    const g = new Int8Array(SIZE * SIZE);
    for (let head = 0; head < states.length; head++) {
      const pos = states[head];
      g.fill(-1);
      for (let i = 0; i < n; i++) {
        const p = P[i];
        for (let k = 0; k < p.len; k++) g[along(p, pos[i] + k)] = i;
      }
      for (let i = 0; i < n; i++) {
        const p = P[i];
        const at = pos[i];
        for (const sign of [-1, 1]) {
          for (let d = 1; ; d++) {
            const v = sign < 0 ? at - d : at + p.len - 1 + d;
            if (v < 0 || v >= SIZE || g[along(p, v)] !== -1) break;
            const next = pos.slice();
            next[i] = at + sign * d;
            const k = key(next);
            if (seen.has(k)) continue;
            seen.add(k);
            states.push(next);
            parent.push(head);
            how.push({ piece: i, dir: p.across ? (sign < 0 ? 'left' : 'right') : (sign < 0 ? 'up' : 'down'), dist: d });
            if (i === 0 && next[0] === GOAL) {
              const path = [];
              for (let at2 = states.length - 1; parent[at2] >= 0; at2 = parent[at2]) path.unshift(how[at2]);
              return { moves: path.length, path };
            }
          }
        }
      }
      if (limit && seen.size > limit) return null;
    }
    return null;
  }

  /* --------------------------------------------------------------- words */
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const span = (a, b) => `${a} to ${b}`;

  // "the boat", "the short log in row 5, columns 2 to 3", "the long log in column 4, rows 1 to 3"
  function describe(s, i) {
    const p = s.pieces[i];
    if (i === 0) return 'the boat';
    const size = p.len === 3 ? 'long' : 'short';
    const a = s.pos[i] + 1;
    const b = s.pos[i] + p.len;
    return p.across ? `the ${size} log in row ${p.line + 1}, columns ${span(a, b)}` : `the ${size} log in column ${p.line + 1}, rows ${span(a, b)}`;
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // where piece i is now, in a few words: "columns 3 to 4" or "rows 2 to 4"
  function where(s, i) {
    const p = s.pieces[i];
    return p.across ? `columns ${span(s.pos[i] + 1, s.pos[i] + p.len)}` : `rows ${span(s.pos[i] + 1, s.pos[i] + p.len)}`;
  }

  const say = {
    start: (n, best) => `Level ${n}. Free the boat! It can be done in ${plural(best, 'move', 'moves')}.`,
    // what the keyboard has picked, and where it can go
    picked: (s, i) => {
      const r = room(s, i);
      const [b, f] = dirsOf(s, i);
      const ways = [r.back ? `${r.back} ${b}` : '', r.fwd ? `${r.fwd} ${f}` : ''].filter(Boolean);
      return `${cap(describe(s, i))}. ${ways.length ? `It can slide ${ways.join(' or ')}.` : "It can't slide yet."}`;
    },
    moved: (s, i) => `${cap(where(s, i))}.`,
    blocked: (s, i, dir) => {
      const r = room(s, i);
      const stop = SIGN[dir] < 0 ? r.backStop : r.fwdStop;
      return `Can't slide ${dir}: ${stop < 0 ? "that's the bank" : `blocked by ${describe(s, stop)}`}.`;
    },
    none: (dir) => `No log further ${dir}.`,
    clear: () => 'The way out is clear!',
    tapLine: () => 'Tap an open square in line with the glowing log to slide it there, or drag the log.',
    hint: (s, m) => `Hint: slide ${describe(s, m.piece)} ${m.dir} ${plural(m.dist, 'square', 'squares')}.`,
    done: (n, moves, best) => `Level ${n} done in ${plural(moves, 'move', 'moves')}!${moves <= best ? ' The fewest possible!' : ` The fewest possible is ${best}.`}`,
    undo: () => 'Took that move back.',
    restart: () => 'Back to the start.',
    nothing: () => 'Nothing to undo yet.',
    moves: (n) => plural(n, 'move', 'moves'),
  };

  const api = {
    SIZE,
    EXIT_ROW,
    GOAL,
    LEVELS: LEVELS.map((lv) => ({ best: lv.best, rows: lv.rows.slice() })),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    DIRS: DIR_NAMES,
    check,
    parse,
    cells,
    grid,
    room,
    dirsOf,
    slide,
    moves,
    solved,
    clearWay,
    solve,
    describe,
    where,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogJam = api;
})(this);
