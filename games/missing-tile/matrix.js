/* Missing Tile: the puzzles. A 3 by 3 grid of tiles, each showing a few
 * shapes, with the bottom-right tile missing; a tray of answer tiles; and
 * exactly one tile that fits any rule the game knows.
 *
 * Every attribute of a tile (shape, colour, count, size) follows one rule
 * kind across the grid: the same everywhere, one value per row, one value
 * per column, growing along each row, or one of each per row. A level fixes
 * which attributes are ruled and how; its seed draws the values. The
 * generator builds the grid and the answer tiles from the answer, then
 * runs the checker, so the invariants hold for every puzzle that ships.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Matrix; in Node
 * it is a CommonJS module.
 */
(function (root) {
  'use strict';

  const ATTRS = ['shape', 'colour', 'count', 'size'];
  const VALUES = {
    shape: ['ball', 'cube', 'pyramid', 'star', 'heart', 'cross'],
    colour: ['red', 'yellow', 'green', 'blue', 'purple', 'pink'],
    count: [1, 2, 3],
    size: ['small', 'medium', 'big'],
  };
  const KINDS = ['same', 'row', 'col', 'grow', 'each'];
  const MISSING = 8;                    // the gap: bottom-right, row-major
  const OPTIONS = { 1: 4, 2: 5, 3: 6 }; // answer tiles by tier
  const CLASH = [['red', 'pink'], ['blue', 'purple']];   // never both in one colour set
  const ATTEMPTS = 500;
  const ABOVE = 5;                      // the cell above the gap
  const LEFT = 7;                       // the cell left of the gap

  /* The 36 levels: a seed and the ruled attributes with their kinds. Every
   * attribute not listed is `same`. The tier is the number of rules. */
  const TABLE = [
    // one rule
    [48, 'colour row'],
    [85, 'shape row'],
    [122, 'count grow'],
    [159, 'size row'],
    [196, 'colour col'],
    [233, 'shape col'],
    [270, 'size grow'],
    [307, 'count col'],
    [344, 'shape each'],
    [381, 'colour each'],
    [418, 'size col'],
    [455, 'count each'],
    // two rules
    [492, 'colour row, shape col'],
    [529, 'shape row, count grow'],
    [566, 'size row, colour col'],
    [603, 'colour row, size grow'],
    [640, 'shape row, colour each'],
    [677, 'count col, shape each'],
    [714, 'size grow, colour each'],
    [751, 'colour row, count each'],
    [788, 'shape each, colour each'],
    [825, 'colour col, size each'],
    [862, 'count each, shape each'],
    [899, 'count grow, shape each'],
    // three rules
    [936, 'colour row, shape col, count each'],
    [973, 'shape row, count grow, colour each'],
    [1010, 'size row, colour col, shape each'],
    [1047, 'colour row, size grow, shape each'],
    [1084, 'shape row, count col, colour each'],
    [1121, 'count row, colour col, size each'],
    [1158, 'colour row, shape each, count each'],
    [1195, 'shape col, colour each, size each'],
    [1232, 'size grow, colour each, shape each'],
    [1269, 'count row, shape each, colour each'],
    [1306, 'colour col, count each, size each'],
    [1343, 'count grow, shape each, colour each'],
  ];
  const LEVELS = TABLE.map(([seed, spec]) => {
    const rules = spec.split(', ').map((s) => {
      const [attr, kind] = s.split(' ');
      return { attr, kind };
    });
    return { tier: rules.length, seed, rules };
  });
  const GROUPS = [
    { title: 'One rule', from: 0, to: 12 },
    { title: 'Two rules', from: 12, to: 24 },
    { title: 'Three rules', from: 24, to: 36 },
  ];

  // a small seeded random number generator (mulberry32)
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

  const pick = (rand, list) => list[Math.floor(rand() * list.length)];
  function shuffle(rand, list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }
  const row = (i) => Math.floor(i / 3);
  const col = (i) => i % 3;
  const sameCell = (a, b) => ATTRS.every((k) => a[k] === b[k]);
  const copyCell = (c) => ({ shape: c.shape, colour: c.colour, count: c.count, size: c.size });
  const column = (grid, attr) => grid.map((c) => c[attr]);
  const distinct3 = (a, b, c) => a !== b && b !== c && a !== c;

  /* ---------------------------------------------------------------- rules */

  /* Does rule `kind` fit these nine values (row-major) of attribute `attr`? */
  function fits(values9, kind, attr) {
    if (!Array.isArray(values9) || values9.length !== 9) return false;
    const v = values9;
    const rowOf = (r) => [v[3 * r], v[3 * r + 1], v[3 * r + 2]];
    const colOf = (c) => [v[c], v[c + 3], v[c + 6]];
    const constant = (t) => t[0] === t[1] && t[1] === t[2];
    switch (kind) {
      case 'same':
        return v.every((x) => x === v[0]);
      case 'row':
        return [0, 1, 2].every((r) => constant(rowOf(r))) && distinct3(v[0], v[3], v[6]);
      case 'col':
        return [0, 1, 2].every((c) => constant(colOf(c))) && distinct3(v[0], v[1], v[2]);
      case 'grow': {
        if (attr !== 'count' && attr !== 'size') return false;
        const order = VALUES[attr];
        return v.every((x, i) => x === order[col(i)]);
      }
      case 'each': {
        const first = rowOf(0);
        if (!distinct3(first[0], first[1], first[2])) return false;
        return [1, 2].every((r) => {
          const t = rowOf(r);
          return distinct3(t[0], t[1], t[2]) && t.every((x) => first.includes(x));
        });
      }
      default:
        return false;
    }
  }

  /* For each attribute the first kind (in KINDS order) that fits the grid,
   * or null when some attribute fits no kind. A yes/no probe: a `grow` grid
   * reads as `col`, a `col` grid as `col` rather than `each`. */
  function explains(grid9) {
    if (!Array.isArray(grid9) || grid9.length !== 9) return null;
    const out = {};
    for (const attr of ATTRS) {
      const values = column(grid9, attr);
      const kind = KINDS.find((k) => fits(values, k, attr));
      if (!kind) return null;
      out[attr] = kind;
    }
    return out;
  }

  // the non-same rules, in ATTRS order
  function ruled(puzzle) {
    return puzzle.rules
      .filter((r) => r.kind !== 'same')
      .sort((a, b) => ATTRS.indexOf(a.attr) - ATTRS.indexOf(b.attr));
  }

  /* ---------------------------------------------------------------- check */

  // the attributes in which two cells differ
  const diffs = (a, b) => ATTRS.filter((k) => a[k] !== b[k]);

  /* Everything wrong with a puzzle, as a list of sentences (empty when it
   * is fine). The generator redraws on any problem; the tests pin each one
   * with a broken puzzle. */
  function check(puzzle) {
    if (!puzzle || typeof puzzle !== 'object') return ['a puzzle is an object'];
    const { values, rules, grid, options, answer } = puzzle;
    if (!Array.isArray(rules) || rules.length !== 4 || rules.some((r, k) => !r || r.attr !== ATTRS[k] || !KINDS.includes(r.kind))) {
      return ['rules must list shape, colour, count and size in that order, each with a known kind'];
    }
    if (!values || ATTRS.some((a) => !Array.isArray(values[a]) || values[a].length !== 3)) {
      return ['values must hold three values for each attribute'];
    }
    if (!Array.isArray(grid) || grid.length !== 9 || grid.some((c) => !c || typeof c !== 'object')) {
      return ['the grid is nine cells'];
    }
    if (!Array.isArray(options) || options.some((c) => !c || typeof c !== 'object')) {
      return ['the options are a list of cells'];
    }
    const problems = [];
    const R = ruled(puzzle);
    const tier = R.length;
    if (puzzle.tier !== tier) problems.push(`the tier should be ${tier}, the number of ruled attributes, not ${puzzle.tier}`);
    if (!(tier >= 1 && tier <= 3)) problems.push(`a puzzle has one, two or three ruled attributes, not ${tier}`);

    // value sets
    for (const attr of ATTRS) {
      const set = values[attr];
      const legal = set.every((x) => VALUES[attr].includes(x)) && new Set(set).size === 3;
      if (!legal) problems.push(`the ${attr} values must be three different ones of ${VALUES[attr].join(', ')}`);
      else if ((attr === 'count' || attr === 'size') && set.some((x, i) => x !== VALUES[attr][i])) {
        problems.push(`the ${attr} values must be ${VALUES[attr].join(', ')} in that order`);
      }
    }
    for (const [a, b] of CLASH) {
      if (values.colour.includes(a) && values.colour.includes(b)) problems.push(`the colours hold both ${a} and ${b}`);
    }
    grid.forEach((cell, i) => {
      for (const attr of ATTRS) {
        if (!values[attr].includes(cell[attr])) problems.push(`cell ${i} has the ${attr} ${cell[attr]}, outside the puzzle's ${attr} values`);
      }
    });

    // rules
    for (const r of rules) {
      if (r.kind === 'grow' && r.attr !== 'count' && r.attr !== 'size') problems.push(`grow is only for count or size, not ${r.attr}`);
      if (!fits(column(grid, r.attr), r.kind, r.attr)) problems.push(`the ${r.attr} rule, ${r.kind}, does not fit the grid`);
    }
    for (let i = 0; i < R.length; i++) {
      for (let j = i + 1; j < R.length; j++) {
        const a = R[i].attr;
        const b = R[j].attr;
        const pairs = new Set(grid.map((c) => `${c[a]}|${c[b]}`));
        if (pairs.size !== 9) problems.push(`${a} and ${b} move together: only ${pairs.size} different pairs of values, not nine`);
      }
    }
    for (const r of R) {
      if (r.kind !== 'each') continue;
      const v = column(grid, r.attr);
      const latin = [0, 1, 2].every((k) => distinct3(v[3 * k], v[3 * k + 1], v[3 * k + 2]) && distinct3(v[k], v[k + 3], v[k + 6]));
      if (!latin) problems.push(`the ${r.attr} values are not a Latin square: a row or column repeats a value`);
    }

    // options
    if (OPTIONS[tier] && options.length !== OPTIONS[tier]) problems.push(`a tier ${tier} puzzle has ${OPTIONS[tier]} options, not ${options.length}`);
    const keys = new Set(options.map((c) => ATTRS.map((k) => c[k]).join('|')));
    if (keys.size !== options.length) problems.push('two options are the same tile');
    const A = grid[MISSING];
    const validAnswer = Number.isInteger(answer) && answer >= 0 && answer < options.length;
    if (!validAnswer || !sameCell(options[answer], A)) problems.push('the answer option is not the tile missing from the grid');
    const distractors = options.filter((c, i) => i !== answer);
    for (const r of R) {
      const alone = distractors.some((c) => {
        const d = diffs(c, A);
        return d.length === 1 && d[0] === r.attr;
      });
      if (!alone) problems.push(`no option differs from the answer in the ${r.attr} alone`);
    }
    const foils = distractors.filter((c) => {
      const d = diffs(c, A);
      return d.length === 1 && rules[ATTRS.indexOf(d[0])].kind === 'same';
    }).length;
    if (foils !== 1) problems.push(`there ${foils === 0 ? 'is no foil' : `are ${foils} foils`}, not exactly one`);
    if (!explains(grid)) problems.push('the answer does not fit any rule the game knows');
    options.forEach((c, i) => {
      if (i === answer) return;
      const g = grid.slice();
      g[MISSING] = c;
      if (explains(g)) problems.push(`option ${i} also fits the grid`);
    });
    return problems;
  }

  /* ------------------------------------------------------------- generate */

  // three of the six, drawn by seed, kept in VALUES order; colours never clash
  function drawSet(rand, attr) {
    const chosen = [];
    for (const x of shuffle(rand, VALUES[attr])) {
      if (chosen.length === 3) break;
      if (attr === 'colour' && CLASH.some(([a, b]) => (x === a && chosen.includes(b)) || (x === b && chosen.includes(a)))) continue;
      chosen.push(x);
    }
    return chosen.sort((a, b) => VALUES[attr].indexOf(a) - VALUES[attr].indexOf(b));
  }

  /* One draw of a whole puzzle from `rand`: value sets, assignments, grid,
   * options. `full` is the four-entry rule list in ATTRS order. */
  function draw(rand, full) {
    const values = {
      shape: drawSet(rand, 'shape'),
      colour: drawSet(rand, 'colour'),
      count: VALUES.count.slice(),
      size: VALUES.size.slice(),
    };
    // nine values per attribute
    const nine = {};
    let eachDir = 0;
    for (const { attr, kind } of full) {
      const set = values[attr];
      let at;
      if (kind === 'same') {
        const v = pick(rand, set);
        at = () => v;
      } else if (kind === 'row') {
        const perm = shuffle(rand, set);
        at = (i) => perm[row(i)];
      } else if (kind === 'col') {
        const perm = shuffle(rand, set);
        at = (i) => perm[col(i)];
      } else if (kind === 'grow') {
        at = (i) => set[col(i)];
      } else {
        const first = shuffle(rand, set);
        if (eachDir === 0) eachDir = rand() < 0.5 ? 1 : -1;   // the first `each` picks a direction,
        else eachDir = -eachDir;                              // every later one shifts the other way
        const dir = eachDir;
        at = (i) => first[(col(i) + dir * row(i) + 3) % 3];
      }
      nine[attr] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(at);
    }
    const grid = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      shape: nine.shape[i], colour: nine.colour[i], count: nine.count[i], size: nine.size[i],
    }));
    const A = grid[MISSING];

    // the wrong value of each ruled attribute: what a neighbour of the gap carries
    const R = full.filter((r) => r.kind !== 'same');
    const wrong = {};
    for (const { attr, kind } of R) {
      const from = kind === 'row' ? ABOVE : kind === 'each' ? (rand() < 0.5 ? ABOVE : LEFT) : LEFT;
      wrong[attr] = grid[from][attr];
    }
    const withWrong = (attrs) => {
      const c = copyCell(A);
      for (const a of attrs) c[a] = wrong[a];
      return c;
    };
    const list = [copyCell(A)];          // a copy, so the tray and the grid never share a cell
    if (R.length === 1) {
      const attr = R[0].attr;
      for (const v of values[attr]) {
        if (v === A[attr]) continue;
        const c = copyCell(A);
        c[attr] = v;
        list.push(c);
      }
    } else {
      for (const r of R) list.push(withWrong([r.attr]));
      list.push(withWrong([R[0].attr, R[1].attr]));
    }
    // the foil: one `same` attribute set to another of its values
    const sames = full.filter((r) => r.kind === 'same').map((r) => r.attr);
    const foilAttr = pick(rand, sames);
    const foil = copyCell(A);
    foil[foilAttr] = pick(rand, values[foilAttr].filter((v) => v !== A[foilAttr]));
    list.push(foil);

    const options = shuffle(rand, list);
    return { values, grid, options, answer: options.findIndex((c) => sameCell(c, A)) };
  }

  /* A puzzle for these rules (the ruled attributes only; the rest are
   * `same`), drawn from `rand`: redrawn until check() has nothing to say,
   * and an Error after ATTEMPTS draws. */
  function generate(rand, spec) {
    const given = (spec && spec.rules) || [];
    if (!Array.isArray(given)) throw new TypeError('Missing Tile: rules must be a list of { attr, kind }');
    for (const r of given) {
      if (!r || !ATTRS.includes(r.attr) || !KINDS.includes(r.kind)) throw new TypeError(`Missing Tile: unknown rule ${JSON.stringify(r)}`);
    }
    const full = ATTRS.map((attr) => {
      const r = given.find((x) => x.attr === attr);
      return { attr, kind: r ? r.kind : 'same' };
    });
    const tier = full.filter((r) => r.kind !== 'same').length;
    if (!OPTIONS[tier]) throw new RangeError(`Missing Tile: a puzzle has one, two or three ruled attributes, not ${tier}`);
    const nOptions = spec && spec.options != null ? spec.options : OPTIONS[tier];
    if (OPTIONS[tier] && nOptions !== OPTIONS[tier]) throw new RangeError(`Missing Tile: a tier ${tier} puzzle has ${OPTIONS[tier]} options, not ${nOptions}`);
    const seed = spec && spec.seed != null ? spec.seed : null;
    let problems = [];
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const d = draw(rand, full);
      const puzzle = {
        level: -1,
        tier,
        seed,
        values: d.values,
        rules: full.map((r) => ({ attr: r.attr, kind: r.kind })),
        grid: d.grid,
        options: d.options,
        answer: d.answer,
      };
      problems = check(puzzle);
      if (problems.length === 0) return puzzle;
    }
    const spelt = full.filter((r) => r.kind !== 'same').map((r) => `${r.attr} ${r.kind}`).join(', ') || 'no rules';
    throw new Error(`Missing Tile: no puzzle for ${spelt} after ${ATTEMPTS} attempts; the last draw: ${problems.join('; ')}`);
  }

  // the fixed puzzle of level 0..35
  function make(level) {
    const lv = LEVELS[level];
    if (!Number.isInteger(level) || !lv) throw new RangeError(`Missing Tile: no level ${level}`);
    const puzzle = generate(rng(lv.seed), { rules: lv.rules, options: OPTIONS[lv.tier], seed: lv.seed });
    puzzle.level = level;
    return puzzle;
  }

  /* ---------------------------------------------------------------- words */
  const COUNT_WORD = { 1: 'one', 2: 'two', 3: 'three' };
  const PLURAL = { ball: 'balls', cube: 'cubes', pyramid: 'pyramids', star: 'stars', heart: 'hearts', cross: 'crosses' };
  const ATTR_WORD = { shape: 'shape', colour: 'colour', count: 'number of shapes', size: 'size' };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  // "two big red stars", "one small blue ball"
  function describe(cell) {
    const shape = cell.count > 1 ? PLURAL[cell.shape] : cell.shape;
    return `${COUNT_WORD[cell.count]} ${cell.size} ${cell.colour} ${shape}`;
  }
  const attrWord = (attr) => ATTR_WORD[attr];

  const RULE_TEXT = {
    same: {
      shape: 'Every tile has the same shape.',
      colour: 'Every tile has the same colour.',
      count: 'Every tile has the same number of shapes.',
      size: "Every tile's shapes are the same size.",
    },
    row: {
      shape: 'Each row has its own shape.',
      colour: 'Each row has its own colour.',
      count: 'Each row has its own number of shapes.',
      size: 'Each row has its own size of shape.',
    },
    col: {
      shape: 'Each column has its own shape.',
      colour: 'Each column has its own colour.',
      count: 'Each column has its own number of shapes.',
      size: 'Each column has its own size of shape.',
    },
    grow: {
      count: 'Along each row the number grows: one, two, three.',
      size: 'Along each row the shapes get bigger: small, medium, big.',
    },
    each: {
      shape: 'Every row has one of each shape.',
      colour: 'Every row has one of each colour.',
      count: 'Every row has one of each number: one, two and three.',
      size: 'Every row has one of each size: small, medium and big.',
    },
  };
  // one sentence a seven-year-old can act on
  const ruleText = (rule) => (RULE_TEXT[rule.kind] && RULE_TEXT[rule.kind][rule.attr]) || '';

  /* Why option i is wrong: the first ruled attribute (in ATTRS order) where
   * it differs from the answer, else the first `same` one. Null for the
   * answer itself. */
  function whyWrong(puzzle, i) {
    if (i === puzzle.answer) return null;
    const A = puzzle.options[puzzle.answer];
    const o = puzzle.options[i];
    if (!A || !o) return null;
    const ruleOf = (attr) => puzzle.rules.find((r) => r.attr === attr);
    const differs = ATTRS.filter((attr) => o[attr] !== A[attr]);
    const attr = differs.find((a) => ruleOf(a).kind !== 'same') || differs[0];
    if (!attr) return null;
    const rule = ruleOf(attr);
    return { attr, rule, text: `Not that one. Look at the ${attrWord(attr)}: ${lower(ruleText(rule))}` };
  }

  const hintSteps = (puzzle) => puzzle.tier + 2;

  /* Hint step k, cumulative: the attribute to look at, then the rules one by
   * one, then the answer. `spot` is the rule kind the world lights up. */
  function hint(puzzle, step) {
    const R = ruled(puzzle);
    const tier = R.length;
    const k = Math.max(0, Math.min(tier + 1, step | 0));
    if (k === 0) return { text: `Look at the ${attrWord(R[0].attr)}.`, spot: R[0].kind };
    if (k <= tier) return { text: R.slice(0, k).map(ruleText).join(' '), spot: R[k - 1].kind };
    return { text: `The answer is ${describe(puzzle.grid[MISSING])}.`, spot: null };
  }

  function readGrid(puzzle) {
    const d = puzzle.grid.map(describe);
    return `Top row: ${d[0]}, ${d[1]}, ${d[2]}. Middle row: ${d[3]}, ${d[4]}, ${d[5]}. Bottom row: ${d[6]}, ${d[7]}, and the gap.`;
  }
  const readOptions = (puzzle) => `Answer tiles, left to right: ${puzzle.options.map(describe).join('; ')}.`;

  const say = {
    start: (n) => `Level ${n}. Which tile fits the gap?`,
    picked: (cell, i, n) => `Tile ${i + 1} of ${n}: ${describe(cell)}.`,
    chosen: (cell) => `${cap(describe(cell))}. Tap it again, or the gap, to place it.`,
    pickFirst: () => 'Pick a tile from the tray first.',
    right: (firstTry) => (firstTry ? "That's it! First try!" : "That's it!"),
    wrong: (why) => why.text,
    hint: (text) => `Hint: ${text}`,
    done: (n, firstTry, hints) => {
      if (hints === 1) return `Level ${n} done, with a hint.`;
      if (hints > 1) return `Level ${n} done, with hints.`;
      return firstTry ? `Level ${n} done, first try!` : `Level ${n} done!`;
    },
    out: () => 'That tile is already out.',
    none: (dir) => (dir === 'left' ? 'No tile further left.' : 'No tile further right.'),
    tries: (n) => `Tries ${n}`,
    menu: () => 'Pick a puzzle.',
  };

  const api = {
    ATTRS: ATTRS.slice(),
    VALUES: { shape: VALUES.shape.slice(), colour: VALUES.colour.slice(), count: VALUES.count.slice(), size: VALUES.size.slice() },
    KINDS: KINDS.slice(),
    MISSING,
    LEVELS: LEVELS.map((lv) => ({ tier: lv.tier, seed: lv.seed, rules: lv.rules.map((r) => ({ attr: r.attr, kind: r.kind })) })),
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    OPTIONS: Object.assign({}, OPTIONS),
    rng,
    make,
    generate,
    fits,
    explains,
    check,
    ruled,
    describe,
    attrWord,
    ruleText,
    whyWrong,
    hint,
    hintSteps,
    readGrid,
    readOptions,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Matrix = api;
})(this);
