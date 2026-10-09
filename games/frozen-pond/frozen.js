/* Frozen Pond: the puzzles. The levels, sliding on ice, a solver (for hints
 * and the fewest slides, and to prove every level can be finished), and
 * every message.
 *
 * The rule: on ice you slide until a rock or the bank stops you, or until
 * you reach snow, which stops you on the spot. The fish spot is snowy ground
 * too, so arriving there stops you.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Frozen; in Node
 * it is a CommonJS module.
 *
 * Level maps: # rock (or the bank), a space is ice, : snow, @ the critter
 * (standing on snow), F the fish spot.
 */
(function (root) {
  'use strict';

  // made by a generator and checked by the solver, getting harder as they go
  const LEVELS = [
    // gentle
    ['#######', '#@   F#', '#######'],
    ['######', '#@   #', '#    #', '#   F#', '######'],
    ['#######', '# #   #', '#  #  #', '#   F #', '# #  @#', '#     #', '#######'],
    ['#######', '#   # #', '##F   #', '#     #', '#@   ##', '#######'],
    ['#######', '#   # #', '#     #', '#   @ #', '#  F# #', '#  #  #', '#######'],
    ['########', '#@     #', '#  F#  #', '# #    #', '#     ##', '#      #', '##     #', '########'],
    // medium
    ['########', '# #  F #', '#     ##', '#      #', '#@     #', '## :   #', '## #  ##', '########'],
    ['########', '##  #  #', '#  #@ ##', '#      #', '##F#   #', '#  #   #', '#    : #', '########'],
    ['#########', '#  #    #', '# F  :  #', '#    #  #', '# ##    #', '#     # #', '# #@    #', '#########'],
    ['########', '#:     #', '#  ##  #', '##  @  #', '#  F # #', '#  #   #', '########'],
    ['#########', '##  #   #', '#  #    #', '# F     #', '#       #', '# ## @#:#', '#       #', '#########'],
    ['#########', '#     # #', '#       #', '##:   @##', '#      ##', '###     #', '#   F#  #', '#########'],
    // hard
    ['#########', '#  :    #', '# @ # : #', '#       #', '#       #', '#    F  #', '#   ##  #', '#########'],
    ['#########', '## F#   #', '#     # #', '#    #  #', '# :     #', '##      #', '#    # @#', '#     : #', '#########'],
    ['#########', '#       #', '#  :    #', '##    #@#', '# #     #', '#    F  #', '##   #  #', '# :  # ##', '#########'],
    ['##########', '#   #    #', '# ##    :#', '#        #', '#@#  # : #', '#      F #', '#        #', '#   #    #', '##########'],
    ['##########', '#  #    ##', '#   :   ##', '# # :  # #', '# F      #', '#  #   # #', '#       @#', '#    #   #', '#   #    #', '##########'],
    ['#########', '#      ##', '##      #', '#: F#   #', '#      ##', '#  #    #', '##@:#   #', '#########'],
  ];
  const GROUPS = [
    { title: 'Gentle slopes', from: 0, to: 6 },
    { title: 'Medium: snow patches', from: 6, to: 12 },
    { title: 'Hard: think it through', from: 12, to: 18 },
  ];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const DIR_NAMES = Object.keys(DIRS);

  function parse(rows) {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const rock = [];
    const snow = [];
    let start = -1;
    let goal = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x] || '#';
        const c = y * w + x;
        rock.push(ch === '#');
        snow.push(ch === ':' || ch === '@');
        if (ch === '@') start = c;
        if (ch === 'F') goal = c;
      }
    }
    return { w, h, rock, snow, start, goal };
  }

  const stops = (lv, c) => lv.snow[c] || c === lv.goal;

  /* One slide from cell `from`: every cell passed on the way, ending where
   * it stops. An empty path means a rock was right there: no move. */
  function slide(lv, from, dir) {
    const [dx, dy] = DIRS[dir];
    const path = [];
    let c = from;
    for (;;) {
      const x = (c % lv.w) + dx;
      const y = Math.floor(c / lv.w) + dy;
      if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) break;
      const n = y * lv.w + x;
      if (lv.rock[n]) break;
      c = n;
      path.push(c);
      if (stops(lv, c)) break;
    }
    return { to: c, path };
  }

  // the fewest slides from `from` to the fish; null if the fish cannot be reached from there
  function solve(lv, from) {
    const start = from == null ? lv.start : from;
    if (start === lv.goal) return { moves: 0, path: [] };
    const prev = new Map([[start, null]]);
    let frontier = [start];
    while (frontier.length) {
      const next = [];
      for (const c of frontier) {
        for (const dir of DIR_NAMES) {
          const { to } = slide(lv, c, dir);
          if (to === c || prev.has(to)) continue;
          prev.set(to, { c, dir });
          if (to === lv.goal) {
            const path = [];
            for (let k = to; prev.get(k); k = prev.get(k).c) path.unshift(prev.get(k).dir);
            return { moves: path.length, path };
          }
          next.push(to);
        }
      }
      frontier = next;
    }
    return null;
  }

  const plural = (n) => `${n} ${n === 1 ? 'slide' : 'slides'}`;
  const say = {
    start: (n, best) => `Level ${n}. Slide to the fish! It can be done in ${plural(best)}.`,
    bump: () => "A rock's in the way. Try another direction.",
    done: (n, moves, best) => `Level ${n} done in ${plural(moves)}!${moves <= best ? ' The fewest possible!' : ` It can be done in ${best}.`}`,
    hint: (dir) => `Try sliding ${dir}.`,
    cannot: () => "The fish can't be reached from here. Tap Undo or Restart.",
    undo: () => 'Took that slide back.',
    restart: () => 'Back to the start.',
    moves: plural,
  };

  const api = {
    LEVELS: LEVELS.map((rows) => rows.slice()),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    DIRS: DIR_NAMES,
    parse,
    slide,
    solve,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Frozen = api;
})(this);
