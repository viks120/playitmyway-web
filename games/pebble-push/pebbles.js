/* Pebble Push: the puzzles. The levels, moving and pushing, spotting a
 * pebble stuck in a corner, a solver (for hints, and to prove every level
 * can be finished), and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Pebbles; in
 * Node it is a CommonJS module.
 *
 * Level maps: # water, a space is a lily pad, . a flower, $ a pebble,
 * * a pebble on a flower, @ the critter, + the critter on a flower.
 */
(function (root) {
  'use strict';

  // made by reverse play (pulling pebbles off their flowers) and checked by the solver
  const LEVELS = [
    // one pebble
    ['#######', '#@ $ .#', '#######'],
    ['#####', '#@  #', '# $ #', '#   #', '# . #', '#####'],
    ['######', '#@   #', '# $  #', '#    #', '#   .#', '######'],
    ['#####', '#   #', '# $ #', '#   #', '#@  #', '# . #', '#####'],
    ['#######', '# @  .#', '#    ##', '#   $ #', '#     #', '#######'],
    ['########', '#   . @#', '#      #', '# $    #', '#      #', '########'],
    // two pebbles
    ['########', '#      #', '# $ # ##', '#.  $@ #', '# .    #', '########'],
    ['#####', '#   #', '#.#.#', '#   #', '#$$ #', '#@ ##', '#####'],
    ['######', '#   .#', '#    #', '# $ $#', '#@   #', '#   .#', '######'],
    ['#######', '#.    #', '#@ $ $#', '#    .#', '#######'],
    ['########', '# #   @#', '#    $ #', '#   $ ##', '#  # .##', '#    .##', '########'],
    ['######', '#. $ #', '#    #', '#. # #', '# @$ #', '#    #', '######'],
    // three pebbles
    ['########', '# .   .#', '#  $   #', '# #   $#', '#.   $@#', '########'],
    ['#######', '#. .$ #', '#   $@#', '#.  $ #', '#######'],
    ['########', '#.     #', '#$ *@$ #', '#.     #', '########'],
    ['########', '#     .#', '#.+$   #', '#   $$ #', '#      #', '########'],
    ['#######', '#.+$  #', '#.$ $ #', '#     #', '#######'],
    ['########', '##     #', '# $$$ ##', '#. .  @#', '#.   # #', '########'],
  ];
  const GROUPS = [
    { title: 'Easy: one pebble', from: 0, to: 6 },
    { title: 'Medium: two pebbles', from: 6, to: 12 },
    { title: 'Tricky: three pebbles', from: 12, to: 18 },
  ];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_NAMES = Object.keys(DIRS);

  // a level map, read into a state: water, flowers, pebbles and the critter
  function parse(rows) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const water = [];
    const goals = [];
    const pebbles = [];
    let player = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x] || '#';
        const c = y * w + x;
        water.push(ch === '#');
        if (ch === '.' || ch === '*' || ch === '+') goals.push(c);
        if (ch === '$' || ch === '*') pebbles.push(c);
        if (ch === '@' || ch === '+') player = c;
      }
    }
    return { w, h, water, goals, pebbles, player };
  }

  /* One step: returns the new state and what happened, or null when the
   * critter cannot go that way (water, or a pebble that cannot move). */
  function step(s, dir) {
    const [dx, dy] = DIRS[dir];
    const x = s.player % s.w;
    const y = Math.floor(s.player / s.w);
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return null;
    const to = ny * s.w + nx;
    if (s.water[to]) return null;
    const hit = s.pebbles.indexOf(to);
    let pebbles = s.pebbles;
    let pushed = -1;
    if (hit >= 0) {
      const bx = nx + dx;
      const by = ny + dy;
      if (bx < 0 || by < 0 || bx >= s.w || by >= s.h) return null;
      const beyond = by * s.w + bx;
      if (s.water[beyond] || s.pebbles.includes(beyond)) return null;
      pebbles = s.pebbles.slice();
      pebbles[hit] = beyond;
      pushed = hit;
    }
    return { state: Object.assign({}, s, { player: to, pebbles }), pushed };
  }

  const solved = (s) => s.pebbles.every((c) => s.goals.includes(c));
  const onFlowers = (s) => s.pebbles.filter((c) => s.goals.includes(c)).length;

  // a pebble off its flower and wedged in a corner can never move again
  function stuck(s, i) {
    const c = s.pebbles[i];
    if (s.goals.includes(c)) return false;
    const wet = (dx, dy) => {
      const x = (c % s.w) + dx;
      const y = Math.floor(c / s.w) + dy;
      return x < 0 || y < 0 || x >= s.w || y >= s.h || s.water[y * s.w + x];
    };
    return (wet(0, -1) || wet(0, 1)) && (wet(-1, 0) || wet(1, 0));
  }

  /* The fewest moves from s to finished, by breadth-first search. Returns
   * { moves, pushes, path } or null when it cannot be finished from here. */
  function solve(s, limit) {
    const key = (p, ps) => p + '|' + ps.slice().sort((a, b) => a - b).join(',');
    if (solved(s)) return { moves: 0, pushes: 0, path: [] };
    const start = { s, prev: null, dir: null, pushes: 0 };
    const seen = new Set([key(s.player, s.pebbles)]);
    let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const node of frontier) {
        for (const dir of DIR_NAMES) {
          const r = step(node.s, dir);
          if (!r) continue;
          if (r.pushed >= 0 && stuck(r.state, r.pushed)) continue;
          const k = key(r.state.player, r.state.pebbles);
          if (seen.has(k)) continue;
          seen.add(k);
          const child = { s: r.state, prev: node, dir, pushes: node.pushes + (r.pushed >= 0 ? 1 : 0) };
          if (r.pushed >= 0 && solved(r.state)) {
            const path = [];
            for (let n = child; n.prev; n = n.prev) path.unshift(n.dir);
            return { moves: path.length, pushes: child.pushes, path };
          }
          next.push(child);
        }
      }
      if (seen.size > (limit || 3e6)) return null;
      frontier = next;
    }
    return null;
  }

  const say = {
    start: (n, pebbles) => `Level ${n}. Push ${pebbles === 1 ? 'the pebble onto the flower' : `the ${pebbles} pebbles onto the flowers`}.`,
    onFlower: (k, n) => `Pebble on a flower! ${k} of ${n}.`,
    done: (n, moves, best) => `Level ${n} done in ${moves} moves!${moves <= best ? ' The fewest possible!' : ''}`,
    stuck: () => 'Oops, that pebble is stuck in a corner. Tap Undo to take it back.',
    hint: (dir) => `Try going ${dir}.`,
    cannot: () => "This one can't be finished from here. Tap Undo or Restart.",
    undo: () => 'Took that move back.',
    restart: () => 'Starting the level again.',
    moves: (n) => `${n} ${n === 1 ? 'move' : 'moves'}`,
  };

  const api = {
    LEVELS: LEVELS.map((rows) => rows.slice()),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    DIRS: DIR_NAMES,
    parse,
    step,
    solved,
    onFlowers,
    stuck,
    solve,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Pebbles = api;
})(this);
