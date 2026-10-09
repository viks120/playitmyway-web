/* Peekaboo Pond: the rounds. Difficulty levels, the swap plans, how the
 * difficulty adapts, and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Rounds; in Node
 * it is a CommonJS module.
 */
(function (root) {
  'use strict';

  /* mulberry32: a tiny seedable generator, so any round can be replayed */
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

  // swapTime in seconds; near means only neighbouring flowers swap
  const LEVELS = [
    { buds: 2, swaps: 0, swapTime: 0, near: true },
    { buds: 3, swaps: 0, swapTime: 0, near: true },
    { buds: 3, swaps: 1, swapTime: 1.0, near: true },
    { buds: 3, swaps: 2, swapTime: 1.0, near: true },
    { buds: 3, swaps: 3, swapTime: 0.8, near: true },
    { buds: 4, swaps: 2, swapTime: 0.8, near: false },
    { buds: 4, swaps: 3, swapTime: 0.8, near: false },
    { buds: 4, swaps: 4, swapTime: 0.62, near: false },
  ];
  const TOP = LEVELS.length - 1;
  const SURPRISES = { goldfish: 'a little goldfish', ladybug: 'a sleepy ladybug' };
  const SURPRISE_ORDER = ['goldfish', 'ladybug'];

  // each round draws its own stream of random numbers from the visit's seed
  const roundSeed = (seed, round) => (Math.imul((seed >>> 0) ^ 0x9e3779b9, 31) + Math.imul(round + 1, 0x85ebca6b)) >>> 0;

  function pickPair(rand, n, near) {
    const i = Math.floor(rand() * n);
    if (near) {
      if (i === 0) return [0, 1];
      if (i === n - 1) return [n - 1, n - 2];
      return [i, rand() < 0.5 ? i - 1 : i + 1];
    }
    let j = Math.floor(rand() * (n - 1));
    if (j >= i) j++;
    return [i, j];
  }
  const samePair = (p, q) => !!q && ((p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]));

  /* One round's plan: which critter hides (they take turns), in which slot,
   * the swaps, and the slot the hidden critter's flower ends up in. At least
   * half the swaps (rounded up) move that flower, so watching really
   * matters. */
  function plan(seed, round, level) {
    const L = LEVELS[Math.max(0, Math.min(TOP, level))];
    const rand = rng(roundSeed(seed, round));
    const start = Math.floor(rand() * L.buds);
    for (let attempt = 0; attempt < 500; attempt++) {
      const swaps = [];
      let at = start;
      let moved = 0;
      for (let k = 0; k < L.swaps; k++) {
        let pair = pickPair(rand, L.buds, L.near);
        while (samePair(pair, swaps[k - 1])) pair = pickPair(rand, L.buds, L.near);
        swaps.push(pair);
        if (pair[0] === at) {
          at = pair[1];
          moved++;
        } else if (pair[1] === at) {
          at = pair[0];
          moved++;
        }
      }
      if (moved >= Math.ceil(L.swaps / 2)) {
        return { hider: round % 4, buds: L.buds, start, swaps, answer: at, swapTime: L.swapTime };
      }
    }
    throw new Error('Could not plan a round');
  }

  // found on the first tap: a little harder; on the second: the same; later: easier
  const nextLevel = (level, taps) => (taps <= 1 ? Math.min(level + 1, TOP) : taps >= 3 ? Math.max(level - 1, 0) : level);

  const say = {
    hiding: (name) => `${name} is hiding! Watch the flowers.`,
    moving: () => 'The flowers are moving…',
    seek: (name) => `Where's ${name}? Tap a flower.`,
    found: (name, taps) => (taps <= 1 ? `Peekaboo! You found ${name}!` : `Peekaboo! There's ${name}!`),
    miss: (kind, hint) => `Not here! Just ${SURPRISES[kind]}. ${hint ? 'Look, that flower is wiggling!' : 'Try another flower.'}`,
    party: () => 'Five friends found! Party time!',
    focus: (slot, n) => `Flower ${slot + 1} of ${n}`,
    progress: (count) => `${count} of 5 friends found`,
  };

  const api = {
    LEVELS: LEVELS.map((l) => Object.assign({}, l)),
    SURPRISE_ORDER,
    plan,
    nextLevel,
    say,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rounds = api;
})(this);
