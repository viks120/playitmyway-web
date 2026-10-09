/* Pond Prix: the races. The circuit plan, the cups, the questions at the
 * answer gates, finishing places and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Race; in Node it
 * is a CommonJS module.
 */
(function (root) {
  'use strict';

  /* mulberry32: a tiny seedable generator, so any race can be replayed */
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

  const LAPS = 3;
  const LANE_W = 3;               // the road is three lanes wide
  const MINUS = '−';
  const TIMES = '×';
  const TABLES = [2, 3, 4, 5, 10];

  /* The circuit: a closed loop round the pond, as control points (x, z) for
   * a smooth curve. Gates and pads sit at fractions of a lap, the same every
   * lap, so children can learn the track. Lanes: 0 left, 1 middle, 2 right. */
  const TRACK = {
    points: [[0, 55], [40, 52], [70, 32], [80, -5], [62, -40], [22, -52], [-12, -42], [-45, -52], [-76, -32], [-82, 5], [-62, 40], [-30, 56]],
    gates: [0.22, 0.52, 0.8],
    pads: [
      { at: 0.08, lane: 1, kind: 'boost' },
      { at: 0.14, lane: 0, kind: 'mud' },
      { at: 0.33, lane: 2, kind: 'boost' },
      { at: 0.4, lane: 1, kind: 'mud' },
      { at: 0.62, lane: 0, kind: 'boost' },
      { at: 0.7, lane: 2, kind: 'mud' },
      { at: 0.9, lane: 1, kind: 'boost' },
    ],
  };

  const CUPS = [
    { id: 'warmup', title: 'Warm-up', emoji: '🏁', blurb: 'Just drive!' },
    { id: 'count', title: 'Count the fish', emoji: '🐟', blurb: 'Up to 10' },
    { id: 'add10', title: 'Adding', emoji: '➕', blurb: 'Up to 10' },
    { id: 'mix20', title: 'Add and take away', emoji: '🔁', blurb: 'Up to 20' },
    { id: 'times', title: 'Times tables', emoji: '✖️', blurb: '2, 3, 4, 5 and 10' },
  ];
  const GATES = LAPS * TRACK.gates.length;

  function makeQuestion(cup, rand) {
    const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
    let sum = null;
    let answer;
    let extra = [];
    let min = 0;
    if (cup === 'count') {
      answer = int(2, 10);
      min = 1;
    } else if (cup === 'add10') {
      const a = int(1, 9);
      const b = int(1, 10 - a);
      sum = `${a} + ${b}`;
      answer = a + b;
      extra = [Math.abs(a - b)];
    } else if (cup === 'mix20') {
      if (rand() < 0.5) {
        const a = int(2, 18);
        const b = int(1, 20 - a);
        sum = `${a} + ${b}`;
        answer = a + b;
        extra = [Math.abs(a - b), answer + 10];
      } else {
        const a = int(3, 20);
        const b = int(1, a - 1);
        sum = `${a} ${MINUS} ${b}`;
        answer = a - b;
        extra = [a + b, Math.abs(answer - 10)];
      }
    } else {
      const a = TABLES[Math.floor(rand() * TABLES.length)];
      const b = int(1, 10);
      sum = `${a} ${TIMES} ${b}`;
      answer = a * b;
      extra = [a * (b + 1), a * (b - 1), a + b];
    }
    // two wrong answers: near misses and the classic slips, all different
    const pool = [];
    for (const n of [answer - 1, answer + 1, answer - 2, answer + 2].concat(extra)) {
      if (n >= min && n !== answer && pool.indexOf(n) < 0) pool.push(n);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const correct = int(0, 2);
    const choices = [];
    let w = 0;
    for (let lane = 0; lane < 3; lane++) choices.push(lane === correct ? answer : pool[w++]);
    return { cup, sum, answer, choices, correct };
  }

  const keyOf = (q) => q.sum || 'fish ' + q.answer;

  /* A race's questions, one per gate: none for the warm-up. No question
   * comes twice in a row, and sums are not repeated within a race. */
  function plan(seed, cup) {
    if (!CUPS.some((c) => c.id === cup)) throw new Error('Unknown cup: ' + cup);
    const rand = rng(seed);
    const questions = [];
    if (cup === 'warmup') return { cup, questions };
    const used = new Set();
    while (questions.length < GATES) {
      let q;
      for (let tries = 0; tries < 60; tries++) {
        q = makeQuestion(cup, rand);
        const last = questions[questions.length - 1];
        if (last && keyOf(last) === keyOf(q)) continue;
        if (q.sum && used.has(q.sum)) continue;
        break;
      }
      used.add(keyOf(q));
      questions.push(q);
    }
    return { cup, questions };
  }

  // where a lap's gate k sits, as a distance from the start of the race
  const gateAt = (k, lapLength) => Math.floor(k / TRACK.gates.length) * lapLength + TRACK.gates[k % TRACK.gates.length] * lapLength;

  const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  // a place in the race: 1 plus everyone strictly further along
  const place = (mine, others) => 1 + others.filter((d) => d > mine).length;

  const LANE_NAMES = ['Left', 'Middle', 'Right'];
  const fish = (n) => '🐟'.repeat(n);
  const say = {
    lane: (lane) => `${LANE_NAMES[lane]} lane`,
    board: (q) => (q.sum ? `${q.sum} = ?` : `${fish(q.answer)} ?`),
    question: (q) => `${q.sum ? `${q.sum} = ?` : `How many fish? ${fish(q.answer)}.`} Left ${q.choices[0]}, middle ${q.choices[1]}, right ${q.choices[2]}.`,
    right: (q) => (q.sum ? `Boost! ${q.sum} = ${q.answer}.` : `Boost! ${q.answer} fish.`),
    wrong: (q, got) => (q.sum ? `Splash! ${q.sum} = ${q.answer}, not ${got}.` : `Splash! ${q.answer} fish, not ${got}.`),
    lap: (n) => (n >= LAPS ? 'Last lap!' : `Lap ${n} of ${LAPS}`),
    finish: (p) => `You came ${ordinal(p)}!`,
    score: (right, of) => `${right} of ${of} answers right.`,
    warmDone: () => 'Great driving!',
  };

  const api = {
    LAPS,
    LANE_W,
    GATES,
    TRACK,
    CUPS: CUPS.map((c) => Object.assign({}, c)),
    plan,
    gateAt,
    place,
    ordinal,
    say,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Race = api;
})(this);
