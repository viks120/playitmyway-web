/* Laser Mirrors: the optics. The levels, how a beam travels across the
 * bench, which crystals glow, a solver that tries every way the turnable
 * pieces can be set (to prove each level can be solved, and to give hints),
 * and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Optics; in Node
 * it is a CommonJS module.
 *
 * A level is rows of two-character cells, split by spaces:
 *   ..  empty bench            ##  block (stops any beam)
 *   >w  laser firing right: ^ up, > right, v down, < left; w white, r red, b blue
 *   M/  mirror you can turn    m/  mirror bolted down   (/ or \ is how it sits)
 *   S/  splitter you can turn  s/  splitter bolted down (half-silvered glass)
 *   Cw  crystal (any light)    C2  double crystal (beams from two sides)
 *   Cr  red crystal            Cb  blue crystal         Cp  purple crystal (red + blue)
 * Capital letters can be turned. A turnable piece's / or \ is how it starts.
 *
 * Grid directions are 0 up, 1 right, 2 down, 3 left, with y growing down
 * the screen. A / mirror swaps up with right and down with left (d ^ 1);
 * a \ mirror swaps up with left and right with down (3 - d).
 */
(function (root) {
  'use strict';

  const WHITE = 1;
  const RED = 2;
  const BLUE = 4;
  const PURPLE = RED | BLUE;
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];
  const DIR_NAMES = ['up', 'right', 'down', 'left'];
  const COLOUR = { w: WHITE, r: RED, b: BLUE };
  const NEED = { w: 'any', 2: 'two', r: 'red', b: 'blue', p: 'purple' };
  // how far a beam reaches past the last square's centre (in squares) when it
  // runs off the bench, hits a block, or hits the back of a laser
  const REACH = { edge: 1.5, block: 0.58, source: 0.7 };

  const LEVELS = [
    // ------------------------------------------------ warm-up: one or two mirrors
    {
      note: 'Tap the mirror on the yellow turntable (or press Enter) to turn it.',
      rows: [
        '.. .. Cw ..',
        '>w .. M\\ ..',
        '.. .. .. ..',
      ],
    },
    {
      note: 'Two mirrors this time. Each one turns the beam through a right angle.',
      rows: [
        '.. .. .. .. ..',
        '>w .. M/ .. ..',
        '.. .. .. .. ..',
        '.. .. M/ .. Cw',
      ],
    },
    {
      note: 'Not every turntable matters. Which mirror does the beam really need?',
      rows: [
        '.. .. M/ .. ..',
        '.. .. M\\ .. <w',
        '.. .. Cw .. ..',
      ],
    },
    {
      note: 'Two lasers, two crystals.',
      rows: [
        'vw .. .. Cw ..',
        'M/ Cw .. .. ..',
        '.. .. .. .. ..',
        '.. .. .. M/ <w',
      ],
    },
    {
      note: 'One mirror can turn two beams at once. A beam that hits a laser stops.',
      rows: [
        '.. .. vw .. ..',
        '>w .. M/ .. M/',
        '.. .. .. .. Cw',
        '.. .. Cw .. ..',
      ],
    },
    {
      note: 'Blocks stop beams dead.',
      rows: [
        '.. .. .. .. Cw',
        '.. M\\ .. .. M\\',
        '## .. .. .. M/',
        '.. ^w .. .. ..',
      ],
    },
    // ------------------------------------------------ decoys and blocks
    {
      note: 'Grey bolted mirrors never move. Some turntables are decoys the light never needs.',
      rows: [
        '.. vw .. .. .. ..',
        'Cw M\\ .. .. .. M\\',
        'm\\ .. M/ M/ M/ M\\',
        '.. .. .. Cw .. ..',
        '.. .. ^w .. .. ..',
      ],
    },
    {
      rows: [
        '.. .. Cw M\\ .. ##',
        '>w .. M\\ .. M/ ..',
        '>w .. .. M\\ .. ..',
        '.. .. .. .. ## ..',
        '.. Cw M\\ M\\ M/ ..',
      ],
    },
    {
      rows: [
        '.. .. .. vw .. ..',
        'M/ M\\ Cw .. M/ m/',
        '>w M/ .. .. .. ..',
        '.. .. .. M/ M\\ ..',
        'M/ M\\ Cw .. .. ..',
      ],
    },
    {
      rows: [
        'Cw M/ m\\ .. .. ..',
        '.. .. .. m\\ .. ..',
        '>w M\\ Cw M/ M/ ..',
        '>w .. .. .. M/ ##',
        '.. .. .. M\\ M\\ M/',
      ],
    },
    {
      rows: [
        '.. m/ .. M\\ ..',
        '.. M\\ M/ M/ <w',
        'Cw .. M/ M/ ..',
        '.. m\\ M\\ .. <w',
        '.. m\\ M\\ .. ..',
        '.. .. .. Cw ..',
      ],
    },
    {
      rows: [
        'Cw vw .. .. ..',
        'M/ m\\ M/ .. ##',
        '>w M/ M/ Cw ..',
        '>w M/ .. M\\ ..',
        '.. M/ M\\ .. ..',
        '.. Cw .. .. ..',
      ],
    },
    // ------------------------------------------------ beam splitters
    {
      note: 'New: a splitter (striped glass) lets the beam through and reflects it too. The double crystal needs beams from two sides.',
      rows: [
        '.. .. .. .. ..',
        '>w .. S/ .. M/',
        '.. .. .. .. ..',
        '.. .. M/ .. C2',
      ],
    },
    {
      rows: [
        '>w .. .. C2 .. ..',
        '.. .. .. S/ .. M/',
        '.. .. ## .. Cw M/',
        '.. M\\ .. S/ .. <w',
        '.. .. M\\ M/ m/ ..',
        '.. m\\ .. .. .. ..',
      ],
    },
    {
      rows: [
        '.. M\\ .. M/ m\\ .. ..',
        '.. .. M/ .. .. S/ <w',
        '.. .. M/ .. M/ .. ..',
        '>w .. .. M/ .. .. ##',
        '.. .. .. C2 S\\ .. ..',
        '.. .. .. .. Cw .. ..',
      ],
    },
    {
      rows: [
        '.. C2 .. S/ S/ ..',
        '>w M\\ .. M/ .. ..',
        '.. .. .. .. .. Cw',
        '.. .. .. M/ .. M\\',
        '.. .. ## .. .. M/',
        '.. M/ .. S\\ ^w ..',
      ],
    },
    {
      rows: [
        '.. C2 M/ m/ m\\ .. ..',
        '## M/ S\\ .. S/ .. <w',
        'm/ S\\ .. .. M/ .. m\\',
        'M\\ .. .. M/ M\\ m\\ ..',
        '## .. m\\ .. .. .. ..',
        '.. .. .. .. Cw .. ..',
      ],
    },
    {
      rows: [
        'm/ M/ .. .. .. m\\',
        '.. M/ M\\ .. C2 ..',
        'm\\ .. S\\ .. M\\ M/',
        '.. m\\ .. .. S/ ..',
        '.. .. .. Cw S\\ Cw',
        '.. .. .. ## M/ <w',
        '.. .. ^w .. ## ..',
      ],
    },
    // ------------------------------------------------ red, blue and purple
    {
      note: 'New: red and blue lasers. A red crystal needs red light only, and a blue crystal blue only.',
      rows: [
        '.. M/ .. M\\ ..',
        '.. .. .. M/ Cb',
        '>b M\\ Cr .. ..',
        '.. ^r .. .. ..',
      ],
    },
    {
      note: 'A purple crystal needs red and blue light together.',
      rows: [
        'S\\ .. M/ .. Cp <b',
        '.. M\\ S/ .. .. ..',
        '## Cr M/ .. .. <r',
        '.. .. M\\ .. M\\ ..',
      ],
    },
    {
      rows: [
        '.. .. .. .. vb ..',
        '.. .. .. M/ M/ Cp',
        '.. .. Cr M\\ .. M\\',
        '.. .. .. .. M/ M\\',
        '>r .. M\\ S/ .. ..',
        '.. m\\ M/ .. .. <r',
      ],
    },
    {
      rows: [
        '.. ## M/ S/ vr ..',
        '>r .. M\\ .. .. M\\',
        '.. m/ .. .. .. m/',
        'Cr S/ M\\ M/ .. ..',
        '.. Cb M\\ s/ Cp ..',
        '.. .. M/ M\\ .. ..',
        '.. .. ^b .. .. ..',
      ],
    },
    {
      rows: [
        '.. .. m/ .. ## ..',
        '.. .. S\\ .. .. ..',
        '.. .. .. .. Cr ..',
        '>b .. S/ M/ .. ..',
        'S\\ M\\ M\\ Cb .. ..',
        '>r S\\ S/ .. M\\ <r',
        'Cp .. m/ .. m\\ M\\',
      ],
    },
    {
      rows: [
        '.. vb vr .. .. ..',
        'm/ .. S/ m\\ Cr ..',
        'M/ M/ .. S/ M\\ ..',
        '.. Cp .. M/ m\\ m\\',
        'M/ .. S/ M\\ M/ m/',
        '.. .. Cp .. ## ..',
      ],
    },
  ];
  const GROUPS = [
    { title: 'Warm-up: one or two mirrors', from: 0, to: 6 },
    { title: 'Decoys and blocks', from: 6, to: 12 },
    { title: 'Beam splitters', from: 12, to: 18 },
    { title: 'Red, blue and purple', from: 18, to: 24 },
  ];

  const bits = (m) => {
    let n = 0;
    for (let v = m; v; v &= v - 1) n++;
    return n;
  };
  const cellName = (x, y) => String.fromCharCode(65 + x) + (y + 1);

  /* ------------------------------------------------------------- reading */
  function parse(level) {
    const rows = (level.rows || level).map((r) => r.trim().split(/\s+/));
    const h = rows.length;
    const w = rows[0].length;
    const cells = new Array(w * h).fill(null);
    const sources = [];
    const crystals = [];
    const turn = [];
    const fixed = [];
    const blocks = [];
    let start = 0;
    rows.forEach((row, y) => {
      if (row.length !== w) throw new Error(`row ${y + 1} has ${row.length} squares, not ${w}`);
      row.forEach((tok, x) => {
        const c = y * w + x;
        const a = tok[0];
        const b = tok[1];
        let p = null;
        if (tok === '..') return;
        if (tok.length !== 2) throw new Error(`bad square "${tok}" at ${cellName(x, y)}`);
        if (tok === '##') {
          p = { kind: 'block' };
          blocks.push(c);
        } else if ('^>v<'.includes(a) && COLOUR[b]) {
          p = { kind: 'source', dir: '^>v<'.indexOf(a), col: COLOUR[b], k: sources.length };
          sources.push(c);
        } else if ('MmSs'.includes(a) && (b === '/' || b === '\\')) {
          p = { kind: a === 'M' || a === 'm' ? 'mirror' : 'splitter', slant: b === '/' ? 0 : 1, turn: -1 };
          if (a === 'M' || a === 'S') {
            p.turn = turn.length;
            if (p.slant) start |= 1 << p.turn;
            turn.push(c);
          } else {
            fixed.push(c);
          }
        } else if (a === 'C' && NEED[b]) {
          p = { kind: 'crystal', need: NEED[b], k: crystals.length };
          crystals.push(c);
        } else {
          throw new Error(`bad square "${tok}" at ${cellName(x, y)}`);
        }
        p.c = c;
        p.x = x;
        p.y = y;
        cells[c] = p;
      });
    });
    return { w, h, cells, sources, crystals, turn, fixed, blocks, start, note: level.note || '' };
  }

  // how turnable piece i sits in state mask: 0 is /, 1 is \
  const slantOf = (mask, i) => (mask >> i) & 1;
  const flip = (mask, i) => mask ^ (1 << i);
  const reflect = (d, slant) => (slant ? 3 - d : d ^ 1);

  /* ------------------------------------------------------------ the light */
  /* Follow every beam from every laser for the turnable pieces set as in
   * mask. Light travels square to square; mirrors turn it a right angle,
   * splitters send it both straight on and turned, and blocks, lasers and
   * crystals stop it (a crystal soaks up the light that lights it). Beams
   * pass through each other. A beam that comes back round a loop stops,
   * because nothing new can happen to it. */
  function trace(lv, mask) {
    const { w, h, cells } = lv;
    const n = w * h;
    const seen = new Uint8Array(n * 4);       // colours already sent from a square in a direction
    const link = new Uint8Array(n * 2);       // colours along the link right of, and below, each square
    const stub = new Uint8Array(n * 4);       // colours from a square towards a block, a laser or the edge
    const glint = new Uint8Array(n);          // colours turned or split at a square
    const col = new Uint8Array(lv.crystals.length);
    const sides = new Uint8Array(lv.crystals.length);
    const order = [];                         // turnable pieces in the order light first reaches them
    let touched = 0;
    const queue = [];
    const send = (c, d, k) => {
      const i = c * 4 + d;
      if (seen[i] & k) return;
      seen[i] |= k;
      queue.push(c, d, k);
    };
    for (const c of lv.sources) send(c, cells[c].dir, cells[c].col);
    for (let q = 0; q < queue.length; q += 3) {
      const c = queue[q];
      const d = queue[q + 1];
      const k = queue[q + 2];
      const x = c % w;
      const nx = x + DX[d];
      const ny = (c - x) / w + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        stub[c * 4 + d] |= k;                 // off the edge of the bench
        continue;
      }
      const to = ny * w + nx;
      const p = cells[to];
      if (p && (p.kind === 'block' || p.kind === 'source')) {
        stub[c * 4 + d] |= k;
        continue;
      }
      if (d === 1) link[c * 2] |= k;
      else if (d === 3) link[to * 2] |= k;
      else if (d === 2) link[c * 2 + 1] |= k;
      else link[to * 2 + 1] |= k;
      if (!p) {
        send(to, d, k);
      } else if (p.kind === 'crystal') {
        col[p.k] |= k;
        sides[p.k] |= 1 << d;
      } else {
        const slant = p.turn >= 0 ? slantOf(mask, p.turn) : p.slant;
        if (p.turn >= 0 && !(touched & (1 << p.turn))) {
          touched |= 1 << p.turn;
          order.push(p.turn);
        }
        glint[to] |= k;
        send(to, reflect(d, slant), k);
        if (p.kind === 'splitter') send(to, d, k);
      }
    }
    const state = lv.crystals.map((c, i) => crystalState(lv.cells[c].need, col[i], sides[i]));
    const lit = state.filter((s) => s === 'lit').length;
    return { col, sides, state, lit, solved: lit === state.length, touched, order, link, stub, glint };
  }

  /* dark: no light at all; lit: just what it needs; part: half of what a
   * double or purple crystal needs; wrong: the wrong colour is reaching it. */
  function crystalState(need, col, sides) {
    if (!col) return 'dark';
    if (need === 'any') return 'lit';
    if (need === 'two') return bits(sides) >= 2 ? 'lit' : 'part';
    if (need === 'red') return col === RED ? 'lit' : 'wrong';
    if (need === 'blue') return col === BLUE ? 'lit' : 'wrong';
    if (col === PURPLE) return 'lit';
    return col === RED || col === BLUE ? 'part' : 'wrong';
  }

  /* The beams as straight glowing runs for drawing: { x1, y1, x2, y2, col }
   * in squares, where square (x, y) has its centre at (x, y). Pieces of the
   * same colour that meet end to end are joined; where a red and a blue beam
   * share a stretch, col holds both and it is drawn purple. */
  function segments(lv, tr) {
    const { w, h, cells } = lv;
    const bits4 = [];
    for (let c = 0; c < w * h; c++) {
      const x = c % w;
      const y = (c - x) / w;
      if (tr.link[c * 2]) bits4.push([0, y, x, x + 1, tr.link[c * 2]]);
      if (tr.link[c * 2 + 1]) bits4.push([1, x, y, y + 1, tr.link[c * 2 + 1]]);
      for (let d = 0; d < 4; d++) {
        const k = tr.stub[c * 4 + d];
        if (!k) continue;
        const nx = x + DX[d];
        const ny = y + DY[d];
        const off = nx < 0 || ny < 0 || nx >= w || ny >= h;
        const len = off ? REACH.edge : REACH[cells[ny * w + nx].kind];
        const along = d === 1 || d === 3 ? 0 : 1;
        const at = along ? y : x;
        const end = at + (d === 1 || d === 2 ? len : -len);
        bits4.push([along, along ? x : y, Math.min(at, end), Math.max(at, end), k]);
      }
    }
    bits4.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const runs = [];
    for (const p of bits4) {
      const last = runs[runs.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1] && last[3] === p[2] && last[4] === p[4]) last[3] = p[3];
      else runs.push(p.slice());
    }
    return runs.map(([along, line, a, b, k]) => (along
      ? { x1: line, y1: a, x2: line, y2: b, col: k }
      : { x1: a, y1: line, x2: b, y2: line, col: k }));
  }

  // where beams turn or split: little glints of light on mirrors and splitters
  function glints(lv, tr) {
    const out = [];
    tr.glint.forEach((k, c) => {
      if (k) out.push({ x: c % lv.w, y: Math.floor(c / lv.w), col: k });
    });
    return out;
  }

  /* ------------------------------------------------------------ the solver */
  /* Try every way the turnable pieces can sit (2 to the power of how many
   * there are). Returns every solving mask, plus:
   *   forced / value: the pieces every solution sets the same way, and how;
   *   unique: true when the solutions are exactly "set the forced pieces
   *     right, the rest don't matter" (so there is one answer, give or take
   *     pieces the light never needs);
   *   paths: how many different ways the light can run across the bench
   *     (a measure of how much there is to think about);
   *   reached: the turnable pieces some setting can bring light to. */
  function solve(lv) {
    const n = lv.turn.length;
    const all = 1 << n;
    const solutions = [];
    const paths = new Set();
    let reached = 0;
    for (let m = 0; m < all; m++) {
      const tr = trace(lv, m);
      reached |= tr.touched;
      paths.add(tr.touched * all + (m & tr.touched));
      if (tr.solved) solutions.push(m);
    }
    let and = all - 1;
    let or = 0;
    for (const s of solutions) {
      and &= s;
      or |= s;
    }
    const forced = solutions.length ? (all - 1) & ~(and ^ or) : 0;
    const unique = solutions.length > 0 && solutions.length === 2 ** (n - bits(forced));
    return { solutions, forced, value: and & forced, unique, paths: paths.size, reached };
  }

  // the fewest turns from mask to a solution
  function turnsLeft(sol, mask) {
    let best = Infinity;
    for (const s of sol.solutions) best = Math.min(best, bits(s ^ mask));
    return best;
  }

  /* A hint: a piece to turn on the way to the nearest solution, preferring
   * one the light reaches now (the first it reaches), so turning it shows
   * something. Returns the turnable piece's index, or -1 when there is
   * nothing to turn. */
  function hint(lv, sol, mask) {
    let best = -1;
    let bestD = Infinity;
    for (const s of sol.solutions) {
      const d = bits(s ^ mask);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (best < 0 || bestD === 0) return -1;
    const diff = best ^ mask;
    for (const i of trace(lv, mask).order) if (diff & (1 << i)) return i;
    for (let i = 0; i < lv.turn.length; i++) if (diff & (1 << i)) return i;
    return -1;
  }

  // every turn, in order, that the hints would ask for from mask
  function plan(lv, sol, mask) {
    const out = [];
    let m = mask;
    for (let i = hint(lv, sol, m); i >= 0; i = hint(lv, sol, m)) {
      out.push(i);
      m = flip(m, i);
    }
    return out;
  }

  /* ------------------------------------------------------------ messages */
  const COLOUR_WORD = { [WHITE]: 'white', [RED]: 'red', [BLUE]: 'blue', [PURPLE]: 'red and blue' };
  const CRYSTAL_WORD = { any: 'crystal', two: 'double crystal', red: 'red crystal', blue: 'blue crystal', purple: 'purple crystal' };
  const SLANT_WORD = ['/', '\\'];

  // what a piece is, in words: "mirror", "red laser", "double crystal"…
  function pieceWord(p) {
    if (p.kind === 'crystal') return CRYSTAL_WORD[p.need];
    if (p.kind === 'source') return p.col === WHITE ? 'laser' : `${COLOUR_WORD[p.col]} laser`;
    return p.kind;
  }
  const at = (p) => cellName(p.x, p.y);

  // the most useful thing to say about a crystal that is not lit yet
  function crystalNote(lv, tr) {
    for (let i = 0; i < lv.crystals.length; i++) {
      const p = lv.cells[lv.crystals[i]];
      const s = tr.state[i];
      const k = tr.col[i];
      if (s === 'wrong') {
        if (p.need === 'purple') return `The purple crystal at ${at(p)} needs red and blue light, not white.`;
        const want = p.need === 'red' ? RED : BLUE;
        if (k & want) return `The ${p.need} crystal at ${at(p)} is getting ${p.need === 'red' ? 'blue' : 'red'} light too, so it glows purple.`;
        return `The ${p.need} crystal at ${at(p)} needs ${p.need} light, not ${COLOUR_WORD[k]}.`;
      }
    }
    for (let i = 0; i < lv.crystals.length; i++) {
      const p = lv.cells[lv.crystals[i]];
      if (tr.state[i] !== 'part') continue;
      if (p.need === 'two') return `The double crystal at ${at(p)} needs a second beam from another side.`;
      const has = tr.col[i] === RED ? 'red' : 'blue';
      return `The purple crystal at ${at(p)} has ${has} light and needs ${has === 'red' ? 'blue' : 'red'} too.`;
    }
    return '';
  }

  const say = {
    start: (n, lv) => {
      const k = lv.crystals.length;
      const goal = k === 1 ? 'Light the crystal.' : `Light all ${k} crystals at once.`;
      return `Level ${n}. ${goal}${lv.note ? ' ' + lv.note : ''}`;
    },
    status: (lv, tr) => {
      const k = lv.crystals.length;
      const count = k === 1 ? (tr.lit ? 'The crystal is lit.' : 'The crystal is still dark.') : `${tr.lit} of ${k} crystals lit.`;
      const note = crystalNote(lv, tr);
      return note ? `${count} ${note}` : count;
    },
    turned: (lv, i) => `Turned the ${pieceWord(lv.cells[lv.turn[i]])} at ${at(lv.cells[lv.turn[i]])}.`,
    piece: (lv, i, mask, tr) => {
      const p = lv.cells[lv.turn[i]];
      const word = pieceWord(p);
      const lit = tr.touched & (1 << i) ? ', in a beam' : '';
      return `${word[0].toUpperCase()}${word.slice(1)} ${at(p)}, set ${SLANT_WORD[slantOf(mask, i)]}${lit}.`;
    },
    look: (lv, c, tr) => {
      const p = lv.cells[c];
      if (!p) return `${cellName(c % lv.w, Math.floor(c / lv.w))} is empty bench.`;
      const word = pieceWord(p);
      if (p.kind === 'block') return `A block at ${at(p)}. It stops any beam.`;
      if (p.kind === 'source') return `A ${word} at ${at(p)}, firing ${DIR_NAMES[p.dir]}. Lasers never turn.`;
      if (p.kind === 'crystal') {
        const need = {
          any: 'any light', two: 'beams from two sides', red: 'red light only',
          blue: 'blue light only', purple: 'red and blue light',
        }[p.need];
        const s = tr.state[p.k];
        return `A ${word} at ${at(p)}. It needs ${need}. ${s === 'lit' ? 'Lit!' : s === 'dark' ? 'Dark.' : 'Not lit yet.'}`;
      }
      if (p.turn < 0) return `The ${word} at ${at(p)} is bolted down. Only pieces on yellow turntables turn.`;
      return '';
    },
    hint: (lv, i) => `Hint: turn the ${pieceWord(lv.cells[lv.turn[i]])} at ${at(lv.cells[lv.turn[i]])}.`,
    undo: () => 'Took that turn back.',
    noUndo: () => 'Nothing to undo yet.',
    reset: () => 'Back to the start.',
    done: (n, turns, best) => `Level ${n} solved in ${turns} ${turns === 1 ? 'turn' : 'turns'}!${
      turns <= best ? ' The fewest possible!' : ` It can be done in ${best}.`}`,
    turns: (n) => `${n} ${n === 1 ? 'turn' : 'turns'}`,
  };

  const api = {
    LEVELS: LEVELS.map((l) => ({ note: l.note || '', rows: l.rows.slice() })),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    WHITE,
    RED,
    BLUE,
    PURPLE,
    DIRS: DIR_NAMES,
    REACH: Object.assign({}, REACH),
    bits,
    cellName,
    parse,
    slantOf,
    flip,
    reflect,
    trace,
    crystalState,
    segments,
    glints,
    solve,
    turnsLeft,
    hint,
    plan,
    pieceWord,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Optics = api;
})(this);
