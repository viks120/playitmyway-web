/* Farm Friends: the rounds. The animals and their sounds, how many animals
 * each level uses, each round's animals, how the level adapts, and every
 * message (the same words are shown and spoken).
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Farm; in Node it
 * is a CommonJS module.
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

  // the order animals join the game: the cow and the duck first
  const ANIMALS = [
    { id: 'cow', sound: 'Moo!' },
    { id: 'duck', sound: 'Quack!' },
    { id: 'pig', sound: 'Oink!' },
    { id: 'sheep', sound: 'Baa!' },
    { id: 'dog', sound: 'Woof!' },
    { id: 'cat', sound: 'Meow!' },
    { id: 'horse', sound: 'Neigh!' },
    { id: 'chicken', sound: 'Cluck!' },
  ];
  // animals on the grass, and how many kinds are in play
  const LEVELS = [
    { animals: 2, inPlay: 2 },
    { animals: 2, inPlay: 4 },
    { animals: 3, inPlay: 6 },
    { animals: 3, inPlay: 8 },
    { animals: 4, inPlay: 8 },
  ];
  const TOP = LEVELS.length - 1;
  const SOUND = {};
  ANIMALS.forEach((a) => { SOUND[a.id] = a.sound; });

  const roundSeed = (seed, n) => (Math.imul((seed >>> 0) ^ 0x51ed270b, 31) + Math.imul(n + 1, 0x85ebca6b)) >>> 0;

  /* Round n's animals: all different, one of them the one to find, and never
   * the same one twice in a row. */
  function round(seed, n, level, avoid) {
    const L = LEVELS[Math.max(0, Math.min(TOP, level))];
    const rand = rng(roundSeed(seed, n));
    const inPlay = ANIMALS.slice(0, L.inPlay).map((a) => a.id);
    const targets = inPlay.filter((a) => a !== avoid);
    const target = targets[Math.floor(rand() * targets.length)];
    const others = inPlay.filter((a) => a !== target);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const animals = [target].concat(others.slice(0, L.animals - 1));
    for (let i = animals.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [animals[i], animals[j]] = [animals[j], animals[i]];
    }
    return { target, animals };
  }

  // found first time: a little harder; on the second tap: the same; later: easier
  const nextLevel = (level, taps) => (taps <= 1 ? Math.min(level + 1, TOP) : taps >= 3 ? Math.max(level - 1, 0) : level);

  const say = {
    ask: (a) => `Where's the ${a}?`,
    yes: (a) => `Yes! That's the ${a}! ${SOUND[a]}`,
    no: (tapped, target) => `That's the ${tapped}. ${SOUND[tapped]} Where's the ${target}?`,
    party: () => 'Five animals found! Hooray!',
    focus: (i, n, a) => `Animal ${i + 1} of ${n}: ${a}`,
    progress: (n) => `${n} of 5 animals found`,
  };

  const api = {
    ANIMALS: ANIMALS.map((a) => Object.assign({}, a)),
    LEVELS: LEVELS.map((l) => Object.assign({}, l)),
    round,
    nextLevel,
    say,
    rng,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Farm = api;
})(this);
