/* Rainbow Balloons: the rounds. The colours, how many balloons and colours
 * each level uses, each round's balloons, how the level adapts, and every
 * message (the same words are shown and spoken).
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Balloons; in
 * Node it is a CommonJS module.
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

  // the order colours join the game: red and blue first
  const COLOURS = [
    { id: 'red', hex: '#ff5252' },
    { id: 'blue', hex: '#3d8bff' },
    { id: 'yellow', hex: '#ffd23f' },
    { id: 'green', hex: '#3ec46d' },
    { id: 'orange', hex: '#ff9a2e' },
    { id: 'purple', hex: '#a066f0' },
  ];
  // balloons in the sky, and how many colours are in play
  const LEVELS = [
    { balloons: 2, colours: 2 },
    { balloons: 2, colours: 3 },
    { balloons: 3, colours: 4 },
    { balloons: 3, colours: 6 },
    { balloons: 4, colours: 6 },
  ];
  const TOP = LEVELS.length - 1;

  const roundSeed = (seed, n) => (Math.imul((seed >>> 0) ^ 0x9e3779b9, 31) + Math.imul(n + 1, 0x85ebca6b)) >>> 0;

  /* Round n's balloons: all different colours, one of them the target, and
   * never the same target twice in a row. */
  function round(seed, n, level, avoid) {
    const L = LEVELS[Math.max(0, Math.min(TOP, level))];
    const rand = rng(roundSeed(seed, n));
    const inPlay = COLOURS.slice(0, L.colours).map((c) => c.id);
    const targets = inPlay.filter((c) => c !== avoid);
    const target = targets[Math.floor(rand() * targets.length)];
    const others = inPlay.filter((c) => c !== target);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const balloons = [target].concat(others.slice(0, L.balloons - 1));
    for (let i = balloons.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [balloons[i], balloons[j]] = [balloons[j], balloons[i]];
    }
    return { target, balloons };
  }

  // popped first time: a little harder; on the second tap: the same; later: easier
  const nextLevel = (level, taps) => (taps <= 1 ? Math.min(level + 1, TOP) : taps >= 3 ? Math.max(level - 1, 0) : level);

  const say = {
    ask: (c) => `Pop the ${c} balloon!`,
    yes: (c) => `Pop! That's ${c}!`,
    no: (tapped, target) => `That's ${tapped}. Find ${target}!`,
    party: () => 'Five balloons! Hooray!',
    focus: (i, n, c) => `Balloon ${i + 1} of ${n}: ${c}`,
    progress: (n) => `${n} of 5 balloons popped`,
  };

  const api = {
    COLOURS: COLOURS.map((c) => Object.assign({}, c)),
    LEVELS: LEVELS.map((l) => Object.assign({}, l)),
    round,
    nextLevel,
    say,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Balloons = api;
})(this);
