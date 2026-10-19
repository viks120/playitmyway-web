/* Chart Detective: the cases. The themes, the five stages, a seeded random
 * generator and generateRound(), which returns one complete case: the chart,
 * the things that arrive to be counted, and every question with its answer,
 * its options, a hint, a worked explanation and a finding. check() marks an
 * answer and picks the hint. Pure, so docs/tests/chart-detective.test.js
 * loads this exact file in Node; in the page it is a classic script that
 * sets window.ChartDetective. Nothing is stored: a case lives only while
 * the page is open. */
(function (root) {
  'use strict';

  // ---- themes ------------------------------------------------------------
  // id: the glyph (g-<id> in glyphs.js); name: the label under the glyph and
  // the word the voice says as a thing arrives; plural: the phrase questions use.
  // Plurals are nouns, so every question template reads as a sentence
  // ("how many extra do sunny days have?"). verb/base: the past and base forms
  // used by the stage 5 tables ("Pip picked", "did Pip pick"), table themes only.
  const cat = (id, name, plural) => ({ id, name, plural: plural || name + 's' });
  const THEMES = [
    { id: 'bugs', title: 'Minibeast hunt', unit: 'minibeasts', verb: 'saw', base: 'see', table: true,
      most: 'Which minibeast did we see most?', least: 'Which minibeast did we see least?',
      cats: [cat('ladybird', 'ladybird'), cat('ant', 'ant'), cat('snail', 'snail'), cat('bee', 'bee'), cat('butterfly', 'butterfly', 'butterflies')] },
    { id: 'fruit', title: 'Picnic fruit', unit: 'fruits', verb: 'picked', base: 'pick', table: true,
      most: 'Which fruit was picked most?', least: 'Which fruit was picked least?',
      cats: [cat('apple', 'apple'), cat('banana', 'banana'), cat('grapes', 'grapes', 'grapes'), cat('orange', 'orange'), cat('strawberry', 'strawberry', 'strawberries')] },
    { id: 'pets', title: 'Pets', unit: 'pets', table: false,
      most: 'Which pet is there most of?', least: 'Which pet is there least of?',
      cats: [cat('dog', 'dog'), cat('cat', 'cat'), cat('fish', 'fish', 'fish'), cat('rabbit', 'rabbit'), cat('bird', 'bird')] },
    { id: 'weather', title: 'Weather diary', unit: 'days', table: false, stages: [1, 2],
      most: 'Which weather came most?', least: 'Which weather came least?',
      cats: [cat('sunny', 'sunny', 'sunny days'), cat('cloudy', 'cloudy', 'cloudy days'), cat('rainy', 'rainy', 'rainy days'), cat('windy', 'windy', 'windy days'), cat('snowy', 'snowy', 'snowy days')] },
    { id: 'beach', title: 'Beach finds', unit: 'things', verb: 'found', base: 'find', table: true,
      most: 'Which did we find most?', least: 'Which did we find least?',
      cats: [cat('shell', 'shell'), cat('starfish', 'starfish', 'starfish'), cat('pebble', 'pebble'), cat('feather', 'feather'), cat('crab', 'crab')] },
    { id: 'shapes', title: 'Shape spotting', unit: 'shapes', verb: 'spotted', base: 'spot', table: true,
      most: 'Which shape did we spot most?', least: 'Which shape did we spot least?',
      cats: [cat('circle', 'circle'), cat('square', 'square'), cat('triangle', 'triangle'), cat('star', 'star'), cat('heart', 'heart')] },
  ];

  // ---- stages ------------------------------------------------------------
  const STAGES = [
    { id: 1, name: 'Tally Time', ages: 'ages 5+', blurb: 'Count with tally marks', collect: true, questions: 3 },
    { id: 2, name: 'Picture It', ages: 'ages 5+', blurb: 'Pictograms and block charts', collect: true, questions: 3 },
    { id: 3, name: 'Key of Two', ages: 'ages 7+', blurb: 'One picture stands for 2, 5 or 10', collect: false, questions: 4 },
    { id: 4, name: 'Bar Charts', ages: 'ages 7+', blurb: 'Read the numbers up the side', collect: false, questions: 4 },
    { id: 5, name: 'Tables', ages: 'ages 7+', blurb: 'Rows, columns and totals', collect: false, questions: 4 },
  ];
  const KEYS = [2, 2, 5, 10];          // stage 3, by case number within the visit
  const STEPS = [2, 5, 10];            // stage 4, by case number within the visit
  const ROWS = ['Clover', 'Pip', 'Plum'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday'];
  const SCALE_OPTIONS = [1, 2, 5, 10];

  // ---- a seeded random generator (mulberry32) ----------------------------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // n distinct multiples of `unit` between lo and hi (inclusive), in random order
  function distinct(r, n, lo, hi, unit) {
    const pool = [];
    for (let v = Math.ceil(lo / unit) * unit; v <= hi; v += unit) pool.push(v);
    if (pool.length < n) throw new Error('not enough values between ' + lo + ' and ' + hi + ' in steps of ' + unit);
    return shuffle(r, pool).slice(0, n);
  }

  // ---- small helpers the page shares -------------------------------------
  // 7 -> [5, 2]: the groups of strokes in a tally
  function tallyGroups(n) {
    const g = [];
    for (let left = n; left > 0; left -= 5) g.push(Math.min(5, left));
    return g;
  }
  // 5 with a key of 2 -> { whole: 2, half: true }: the pictures in a pictogram column
  function symbolsFor(value, key) {
    return { whole: Math.floor(value / key), half: value % key !== 0 };
  }
  const plural = (c) => c.plural;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---- the counts --------------------------------------------------------
  function countsFor(stage, r, caseIndex) {
    if (stage === 1) {
      // three distinct counts from 1 to 8 whose total is 9 to 15
      for (let tries = 0; tries < 1000; tries++) {
        const c = distinct(r, 3, 1, 8, 1);
        const total = c[0] + c[1] + c[2];
        if (total >= 9 && total <= 15) return { counts: c, key: 1, step: 1, unit: 1, max: 8 };
      }
      throw new Error('stage 1 counts');
    }
    if (stage === 2) {
      const n = between(r, 3, 4);
      return { counts: distinct(r, n, 2, 10, 1), key: 1, step: 1, unit: 1, max: 10 };
    }
    if (stage === 3) {
      const key = KEYS[caseIndex % KEYS.length];
      const unit = key === 5 ? 5 : key / 2;          // half pictures only where a half is a whole number
      return { counts: distinct(r, 4, unit, 10 * key, unit), key, step: 1, unit, max: 10 * key };
    }
    if (stage === 4) {
      const step = STEPS[caseIndex % STEPS.length];
      const max = step === 2 ? 20 : 50;
      const halfway = caseIndex >= 2 && step !== 5;  // later cases only, and never a bar at 2.5
      const unit = halfway ? step / 2 : step;
      const n = between(r, 4, 5);
      for (let tries = 0; tries < 1000; tries++) {
        const c = distinct(r, n, unit, max, unit);
        if (!halfway || c.some((v) => v % step !== 0)) return { counts: c, key: 1, step, unit, max, halfway };
      }
      throw new Error('stage 4 counts');
    }
    throw new Error('no counts for stage ' + stage);
  }

  // ---- options for a number question ------------------------------------
  // the answer, every trap that differs from it, then fillers one unit apart
  function numberOptions(r, answer, traps, unit) {
    const set = [answer];
    for (const t of traps || []) if (t !== answer && t >= 0 && !set.includes(t)) set.push(t);
    for (let d = 1; set.length < 4; d++) {
      for (const v of [answer + d * unit, answer - d * unit]) {
        if (set.length < 4 && v >= 0 && !set.includes(v)) set.push(v);
      }
    }
    return shuffle(r, set.slice(0, 4));
  }

  // ---- questions ---------------------------------------------------------
  // Every question: { type, kind, text, say, targets, answer, options, hint,
  // traps: { option: hint }, explanation, finding }. kind is 'number' (chips),
  // 'category' (tap a column), 'bool' (true/false chips) or 'name' (row chips).
  function q(type, kind, text, targets, answer, options, hint, traps, explanation, finding) {
    const t = Object.assign({}, traps || {});
    delete t[String(answer)];                        // a trap that happens to equal the answer is no trap
    return { type, kind, text, say: text, targets, answer, options, hint, traps: t, explanation, finding };
  }
  const countWord = (round) => (round.chart === 'tally' ? 'strokes' : round.chart === 'block' ? 'blocks' : round.chart === 'bar' ? 'bar' : 'pictures');

  function qHowMany(r, round, i) {
    const c = round.categories[i];
    const v = round.counts[i];
    const traps = {};
    const trapValues = [];
    let explanation;
    if (round.chart === 'pictogram' && round.key > 1) {
      const s = symbolsFor(v, round.key);
      const seq = [];
      for (let k = round.key; k <= s.whole * round.key; k += round.key) seq.push(k);
      const counted = seq.length ? 'count in ' + round.key + 's: ' + seq.join(', ') + (s.half ? ', and a half picture is ' + round.key / 2 : '') + '.' : 'a half picture is ' + round.key / 2 + '.';
      const hint = 'Each picture is ' + round.key + '. Count in ' + round.key + 's.';
      if (s.whole !== v) { traps[s.whole] = hint; trapValues.push(s.whole); }
      if (s.half && s.whole + 1 !== v) { traps[s.whole + 1] = 'The half picture is only ' + round.key / 2 + '. ' + hint; trapValues.push(s.whole + 1); }
      explanation = cap(plural(c)) + ': ' + counted + ' That is ' + v + '.';
    } else if (round.chart === 'bar') {
      const below = Math.floor(v / round.step) * round.step;
      const above = below + round.step;
      if (v % round.step !== 0) {
        traps[below] = 'The bar goes past ' + below + '. It stops halfway between ' + below + ' and ' + above + '.';
        traps[above] = 'The bar does not reach ' + above + '. It stops halfway between ' + below + ' and ' + above + '.';
        explanation = cap(plural(c)) + ': the bar stops halfway between ' + below + ' and ' + above + '. That is ' + v + '.';
      } else {
        explanation = cap(plural(c)) + ': the bar stops at the line for ' + v + '.';
      }
    } else {
      explanation = cap(plural(c)) + ': ' + v + ' ' + (round.chart === 'tally' ? 'strokes' : round.chart === 'block' ? 'blocks' : 'pictures') + '. That is ' + v + '.';
    }
    const hint = round.chart === 'bar'
      ? 'Follow the top of the ' + plural(c) + ' bar across to the numbers.'
      : round.key > 1
        ? 'Each picture is ' + round.key + '. Count the ' + plural(c) + ' in ' + round.key + 's.'
        : 'Count the ' + countWord(round) + ' for ' + plural(c) + '.';
    return q('howMany', 'number', 'How many ' + plural(c) + '?', [i], v,
      numberOptions(r, v, trapValues, round.unit), hint, traps, explanation, v + ' ' + plural(c) + '.');
  }

  function qMostLeast(round, most) {
    const counts = round.counts;
    let best = 0;
    for (let i = 1; i < counts.length; i++) if (most ? counts[i] > counts[best] : counts[i] < counts[best]) best = i;
    let other = 0;
    for (let i = 1; i < counts.length; i++) if (most ? counts[i] < counts[other] : counts[i] > counts[other]) other = i;
    const theme = round.themeData;
    const list = cap(round.categories.map((c, i) => plural(c) + ' ' + counts[i]).join(', '));
    const traps = {};
    traps[round.categories[other].id] = most ? 'That is the smallest. Most means the biggest.' : 'That is the biggest. Least means the smallest.';
    const tall = round.chart === 'tally' ? 'longest' : 'tallest';
    const short = round.chart === 'tally' ? 'shortest' : 'shortest';
    return q(most ? 'most' : 'least', 'category', most ? theme.most : theme.least, [best], round.categories[best].id,
      round.categories.map((c) => c.id),
      most ? 'Most means the biggest number. Which is ' + tall + '?' : 'Least means the smallest number. Which is ' + short + '?',
      traps,
      list + '. ' + counts[best] + ' is the ' + (most ? 'biggest' : 'smallest') + ', so ' + plural(round.categories[best]) + '.',
      (most ? 'Most: ' : 'Least: ') + plural(round.categories[best]) + '.');
  }

  // a and b are indexes with counts[a] > counts[b]
  function qMore(r, round, a, b, fewer) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const d = x - y;
    const traps = {};
    traps[x] = 'That is how many ' + plural(A) + '. We want the difference. Line them up.';
    traps[x + y] = 'That is both added together. We want how many ' + (fewer ? 'fewer' : 'more') + '.';
    const text = fewer ? 'How many fewer ' + plural(B) + ' than ' + plural(A) + '?' : 'How many more ' + plural(A) + ' than ' + plural(B) + '?';
    return q(fewer ? 'fewer' : 'more', 'number', text, [a, b], d,
      numberOptions(r, d, [x, x + y], round.unit),
      fewer
        ? 'Find ' + plural(B) + ' and ' + plural(A) + '. How many fewer do ' + plural(B) + ' have?'
        : 'Find ' + plural(A) + ' and ' + plural(B) + '. How many extra do ' + plural(A) + ' have?',
      traps,
      cap(plural(A)) + ' ' + x + ', ' + plural(B) + ' ' + y + '. ' + x + ' take away ' + y + ' is ' + d + '.',
      fewer ? cap(plural(B)) + ': ' + d + ' fewer than ' + plural(A) + '.' : cap(plural(A)) + ': ' + d + ' more than ' + plural(B) + '.');
  }

  function qTogether(r, round, a, b) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const traps = {};
    traps[Math.abs(x - y)] = 'That is the difference. Together means add.';
    return q('together', 'number', 'How many ' + plural(A) + ' and ' + plural(B) + ' together?', [a, b], x + y,
      numberOptions(r, x + y, [Math.abs(x - y)], round.unit),
      'Add ' + plural(A) + ' and ' + plural(B) + '.', traps,
      cap(plural(A)) + ' ' + x + ' and ' + plural(B) + ' ' + y + '. ' + x + ' add ' + y + ' is ' + (x + y) + '.',
      cap(plural(A)) + ' and ' + plural(B) + ' together: ' + (x + y) + '.');
  }

  function qTrueFalse(round, a, b) {
    const A = round.categories[a], B = round.categories[b];
    const x = round.counts[a], y = round.counts[b];
    const truth = x > y;
    return q('trueFalse', 'bool', 'True or false: more ' + plural(A) + ' than ' + plural(B) + '?', [a, b], truth ? 'true' : 'false',
      ['true', 'false'],
      'Compare ' + plural(A) + ' and ' + plural(B) + '. Which number is bigger?', {},
      cap(plural(A)) + ' ' + x + ', ' + plural(B) + ' ' + y + '. ' + x + ' is ' + (truth ? 'more' : 'less') + ' than ' + y + ', so ' + (truth ? 'true' : 'false') + '.',
      (truth ? 'True: ' : 'False: ') + 'more ' + plural(A) + ' than ' + plural(B) + '.');
  }

  function qKey(round) {
    const k = round.key;
    return q('key', 'number', 'Each picture stands for how many?', [], k, SCALE_OPTIONS.slice(),
      'Look at the key under the chart.', {},
      'The key says one picture is ' + k + '.', 'Each picture is ' + k + '.');
  }

  function qAxis(round) {
    const s = round.step;
    return q('axis', 'number', 'The numbers go up in steps of what?', [], s, SCALE_OPTIONS.slice(),
      'Read the numbers up the side, from the bottom.', {},
      'The numbers go 0, ' + s + ', ' + 2 * s + ', ' + 3 * s + '. Steps of ' + s + '.', 'The numbers go up in ' + s + 's.');
  }

  // ---- the table (stage 5) ----------------------------------------------
  function makeTable(r) {
    for (let tries = 0; tries < 1000; tries++) {
      const cells = ROWS.map(() => DAYS.map(() => between(r, 1, 12)));
      const r0 = between(r, 0, 2), c0 = between(r, 0, 2);   // the hidden cell
      const days = shuffle(r, [0, 1, 2].filter((c) => c !== c0));
      const dayMost = days.find((c) => new Set(cells.map((row) => row[c])).size === 3);
      if (dayMost === undefined) continue;
      return { cells, r0, c0, dayMost };
    }
    throw new Error('table');
  }

  function tableQuestions(r, round) {
    const t = round.table;
    const unit = round.tableUnit, verb = round.themeData.verb, base = round.themeData.base;
    const rowsVisible = [0, 1, 2].filter((i) => i !== t.r0);
    // a visible cell, in a fully shown row
    const cr = pick(r, rowsVisible), cc = between(r, 0, 2);
    const cellV = t.cells[cr][cc];
    const qCell = q('cell', 'number', 'How many ' + unit + ' did ' + ROWS[cr] + ' ' + base + ' on ' + DAYS[cc] + '?', [cr, cc], cellV,
      numberOptions(r, cellV, [], 1), 'Find ' + ROWS[cr] + "'s row, then " + DAYS[cc] + "'s column.", {},
      ROWS[cr] + "'s row, " + DAYS[cc] + "'s column: " + cellV + '.', ROWS[cr] + ' ' + verb + ' ' + cellV + ' on ' + DAYS[cc] + '.');
    // the total of the other fully shown row
    const tr = rowsVisible.find((i) => i !== cr);
    const row = t.cells[tr];
    const total = row[0] + row[1] + row[2];
    const qTotal = q('rowTotal', 'number', 'How many ' + unit + ' did ' + ROWS[tr] + ' ' + base + ' altogether?', [tr, -1], total,
      numberOptions(r, total, [Math.max.apply(null, row)], 1), "Add up all three numbers in " + ROWS[tr] + "'s row.",
      Object.fromEntries([[Math.max.apply(null, row), 'That is one day. Altogether means add all three.']]),
      ROWS[tr] + ': ' + row[0] + ' add ' + row[1] + ' add ' + row[2] + ' is ' + total + '.', ROWS[tr] + ' ' + verb + ' ' + total + ' altogether.');
    // who found most on a day with three different numbers
    const col = t.cells.map((rw) => rw[t.dayMost]);
    let best = 0;
    for (let i = 1; i < 3; i++) if (col[i] > col[best]) best = i;
    const qMost = q('mostOnDay', 'name', 'Who ' + verb + ' most on ' + DAYS[t.dayMost] + '?', [-1, t.dayMost], ROWS[best], ROWS.slice(),
      'Look down ' + DAYS[t.dayMost] + "'s column. Which number is biggest?", {},
      DAYS[t.dayMost] + ': ' + ROWS.map((n, i) => n + ' ' + col[i]).join(', ') + '. ' + ROWS[best] + ' ' + verb + ' most.',
      ROWS[best] + ' ' + verb + ' most on ' + DAYS[t.dayMost] + '.');
    // the hidden cell from the shown total
    const hr = t.cells[t.r0];
    const hTotal = hr[0] + hr[1] + hr[2];
    const seen = [0, 1, 2].filter((c) => c !== t.c0).map((c) => hr[c]);
    const hidden = hr[t.c0];
    const traps = {};
    traps[hTotal] = 'That is the whole row. Take away the two you can see.';
    traps[seen[0] + seen[1]] = 'That is the two you can see added. Take it away from ' + hTotal + '.';
    const qMissing = q('missingCell', 'number', ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. How many on ' + DAYS[t.c0] + '?', [t.r0, t.c0], hidden,
      numberOptions(r, hidden, [hTotal, seen[0] + seen[1]], 1),
      ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. Add the two you can see, then take them away from ' + hTotal + '.', traps,
      ROWS[t.r0] + ' ' + verb + ' ' + hTotal + ' in all. ' + seen[0] + ' add ' + seen[1] + ' is ' + (seen[0] + seen[1]) + '. ' + hTotal + ' take away ' + (seen[0] + seen[1]) + ' is ' + hidden + '.',
      ROWS[t.r0] + ' ' + verb + ' ' + hidden + ' on ' + DAYS[t.c0] + '.');
    return [qCell, qTotal, qMost, qMissing];
  }

  // ---- a whole case ------------------------------------------------------
  // two different indexes, the first with the bigger count
  function pair(r, counts) {
    const idx = shuffle(r, counts.map((_, i) => i)).slice(0, 2);
    return counts[idx[0]] > counts[idx[1]] ? idx : [idx[1], idx[0]];
  }

  function generateRound(stageId, seed, caseIndex) {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage) throw new Error('no stage ' + stageId);
    const ci = caseIndex || 0;
    const r = rng(seed);
    const round = { stage: stageId, seed: seed >>> 0, caseIndex: ci, collect: stage.collect, key: 1, step: 1, unit: 1 };

    if (stageId === 5) {
      const theme = pick(r, THEMES.filter((t) => t.table));
      round.theme = theme.id; round.title = theme.title; round.themeData = theme;
      round.chart = 'table';
      round.categories = []; round.counts = []; round.arrivals = [];
      round.tableUnit = plural(pick(r, theme.cats));
      round.rows = ROWS.slice(); round.days = DAYS.slice();
      round.table = makeTable(r);
      round.questions = tableQuestions(r, round);
      return round;
    }

    const theme = pick(r, THEMES.filter((t) => !t.stages || t.stages.includes(stageId)));
    round.theme = theme.id; round.title = theme.title; round.themeData = theme;
    const made = countsFor(stageId, r, ci);
    round.counts = made.counts; round.key = made.key; round.step = made.step; round.unit = made.unit; round.max = made.max;
    round.halfway = !!made.halfway;
    round.categories = shuffle(r, theme.cats).slice(0, made.counts.length);
    round.chart = stageId === 1 ? 'tally' : stageId === 2 ? (ci % 2 === 0 ? 'pictogram' : 'block') : stageId === 3 ? 'pictogram' : 'bar';
    // the things that arrive, in a random order, for the collecting stages
    const arrivals = [];
    if (stage.collect) {
      round.counts.forEach((n, i) => { for (let k = 0; k < n; k++) arrivals.push(i); });
    }
    round.arrivals = shuffle(r, arrivals);

    const qs = [];
    if (stageId === 1) {
      qs.push(qHowMany(r, round, between(r, 0, 2)), qMostLeast(round, true), qMostLeast(round, false));
    } else if (stageId === 2) {
      const [a, b] = pair(r, round.counts);
      const bank = shuffle(r, ['howMany', 'mostLeast', 'more', 'together']).slice(0, 3);
      for (const t of bank) {
        if (t === 'howMany') qs.push(qHowMany(r, round, between(r, 0, round.counts.length - 1)));
        else if (t === 'mostLeast') qs.push(qMostLeast(round, r() < 0.5));
        else if (t === 'more') qs.push(qMore(r, round, a, b, false));
        else qs.push(qTogether(r, round, a, b));
      }
    } else if (stageId === 3) {
      const [a, b] = pair(r, round.counts);
      qs.push(qKey(round), qHowMany(r, round, between(r, 0, 3)));
      const bank = shuffle(r, ['more', 'together', 'trueFalse']).slice(0, 2);
      for (const t of bank) {
        if (t === 'more') qs.push(qMore(r, round, a, b, r() < 0.5));
        else if (t === 'together') qs.push(qTogether(r, round, a, b));
        else { const [c, d] = shuffle(r, [a, b]); qs.push(qTrueFalse(round, c, d)); }
      }
    } else {
      const [a, b] = pair(r, round.counts);
      // the bar to read: one between gridlines when the case has any
      const idxs = round.counts.map((_, i) => i);
      const off = idxs.filter((i) => round.counts[i] % round.step !== 0);
      qs.push(qAxis(round), qHowMany(r, round, off.length ? pick(r, off) : pick(r, idxs)));
      const bank = shuffle(r, ['mostLeast', 'more', 'together', 'trueFalse']).slice(0, 2);
      for (const t of bank) {
        if (t === 'mostLeast') qs.push(qMostLeast(round, r() < 0.5));
        else if (t === 'more') qs.push(qMore(r, round, a, b, r() < 0.5));
        else if (t === 'together') qs.push(qTogether(r, round, a, b));
        else { const [c, d] = shuffle(r, [a, b]); qs.push(qTrueFalse(round, c, d)); }
      }
    }
    round.questions = qs;
    return round;
  }

  // ---- marking -----------------------------------------------------------
  // choice: a number, a category id, 'true' / 'false', or a row name
  function check(round, qi, choice) {
    const question = round.questions[qi];
    const right = String(choice) === String(question.answer);
    const hint = right ? null : (Object.prototype.hasOwnProperty.call(question.traps, String(choice)) ? question.traps[String(choice)] : question.hint);
    return { right, hint, explanation: question.explanation };
  }

  // one sentence per category, for the hidden table's caption and the tests
  function readChart(round) {
    if (round.chart === 'table') {
      return round.rows.map((n, i) => n + ': ' + round.days.map((d, j) => (i === round.table.r0 && j === round.table.c0 ? d + ' hidden' : d + ' ' + round.table.cells[i][j])).join(', ') + '.').join(' ');
    }
    return round.categories.map((c, i) => cap(plural(c)) + ': ' + round.counts[i] + '.').join(' ');
  }

  const api = { THEMES, STAGES, KEYS, STEPS, ROWS, DAYS, SCALE_OPTIONS, rng, tallyGroups, symbolsFor, generateRound, check, readChart };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChartDetective = api;
})(typeof window !== 'undefined' ? window : globalThis);
