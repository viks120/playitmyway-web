/* The spot-the-difference scene kit's logic: a seeded scene, its two sides
 * and the differences between them, every one fair by construction (see
 * docs/superpowers/specs/2026-10-18-spot-the-difference-design.md).
 * Pure, so docs/tests/spot.test.js loads this exact file in Node. In the
 * page it is a classic script that sets window.Spot.Scenes. */
(function (root) {
  'use strict';

  const W = 400, H = 300, PAD = 4, GAP = 6;
  const THEMES = ['pond', 'meadow', 'farm'];
  const PALETTE = {
    red: '#ef4444', orange: '#fb923c', yellow: '#fbbf24', green: '#4ade80', teal: '#2dd4bf', blue: '#60a5fa',
    purple: '#a78bfa', pink: '#ff8fab', brown: '#8b5e3c', grey: '#94a3b8', white: '#ffffff', ink: '#33302e',
  };
  const WHEEL = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
  // where an item's BASE (the bottom of its box) may lie
  const LANES = { sky: [30, 90], back: [150, 175], air: [100, 190], water: [170, 255], ground: [200, 295] };
  const LANE_ORDER = ['sky', 'back', 'air', 'water', 'ground'];
  const SHIFT = [14, 20];
  const TILT = 20;

  /* name: the spoken phrase; w, h: half-extents at scale 1; family: the
   * silhouette (swaps go between families); max: how many one scene holds */
  const K = (name, lane, w, h, family, extra) =>
    Object.assign({ name, lane, w, h, family, asym: false, colours: null, states: null, counts: null, themes: THEMES, max: 2 }, extra || {});
  const P = ['pond'], M = ['meadow'], F = ['farm'];
  const KINDS = {
    sun: K('the sun', 'sky', 16, 16, 'sun', { colours: ['yellow', 'orange'], max: 1 }),
    cloud: K('the cloud', 'sky', 22, 12, 'cloud', { counts: [2, 3], max: 3 }),
    bird: K('the bird', 'sky', 12, 8, 'bird', { asym: true }),
    clover: K('Clover', 'ground', 32, 30, 'clover', { max: 1 }),   // the critter files are 64×60
    pip: K('Pip', 'ground', 32, 30, 'pip', { max: 1 }),
    plum: K('Plum', 'ground', 32, 30, 'plum', { max: 1 }),
    mango: K('Mango', 'ground', 32, 30, 'mango', { max: 1 }),
    lilypad: K('the lily pad', 'water', 18, 9, 'lilypad', { states: ['plain', 'bud'], themes: P, max: 3 }),
    frog: K('the frog', 'water', 16, 13, 'frog', { asym: true, states: ['open', 'shut'], colours: ['green', 'teal'], themes: P }),
    fish: K('the fish', 'water', 16, 9, 'fish', { asym: true, counts: [2, 3], colours: ['orange', 'blue', 'pink', 'yellow'], themes: P, max: 3 }),
    duck: K('the duck', 'water', 16, 14, 'duck', { asym: true, colours: ['yellow', 'white'], themes: P }),
    boat: K('the boat', 'water', 24, 18, 'boat', { asym: true, states: ['flag', 'none'], colours: ['red', 'blue', 'green'], themes: P, max: 1 }),
    turtle: K('the turtle', 'water', 16, 10, 'turtle', { asym: true, colours: ['green', 'teal', 'brown'], themes: P }),
    dragonfly: K('the dragonfly', 'air', 16, 8, 'dragonfly', { asym: true, colours: ['blue', 'teal', 'purple'], themes: P }),
    reeds: K('the reeds', 'ground', 12, 24, 'reeds', { counts: [3, 4], themes: P }),
    stone: K('the stone', 'ground', 14, 9, 'stone', { colours: ['grey', 'brown'], themes: P }),
    flower: K('the flower', 'ground', 11, 20, 'flower', { states: ['open', 'bud'], colours: ['red', 'yellow', 'pink', 'purple', 'orange', 'blue'], themes: ['pond', 'meadow'], max: 3 }),
    tree: K('the tree', 'back', 28, 42, 'tree', { counts: [2, 4], themes: ['meadow', 'farm'] }),
    bush: K('the bush', 'back', 22, 14, 'bush', { colours: ['green', 'teal'], themes: M }),
    fence: K('the fence', 'back', 36, 14, 'fence', { counts: [3, 4], themes: ['meadow', 'farm'], max: 1 }),
    mushroom: K('the mushroom', 'ground', 13, 15, 'mushroom', { counts: [3, 4], colours: ['red', 'orange', 'purple'], themes: M }),
    butterfly: K('the butterfly', 'air', 15, 11, 'butterfly', { colours: ['orange', 'blue', 'pink', 'purple', 'yellow'], themes: M }),
    bee: K('the bee', 'air', 11, 9, 'bee', { asym: true, themes: M }),
    ladybird: K('the ladybird', 'ground', 11, 8, 'ladybird', { asym: true, counts: [3, 4], themes: M }),
    snail: K('the snail', 'ground', 15, 11, 'snail', { asym: true, colours: ['yellow', 'orange', 'pink', 'purple'], themes: M }),
    kite: K('the kite', 'sky', 14, 22, 'kite', { asym: true, colours: ['red', 'blue', 'green', 'purple', 'orange'], themes: M, max: 1 }),
    basket: K('the basket', 'ground', 17, 13, 'basket', { counts: [2, 3], themes: M, max: 1 }),
    barn: K('the barn', 'back', 42, 40, 'barn', { states: ['open', 'shut'], counts: [1, 2], colours: ['red', 'blue'], themes: F, max: 1 }),
    hay: K('the hay bale', 'ground', 17, 13, 'hay', { counts: [1, 2], themes: F }),
    cow: K('the cow', 'ground', 25, 18, 'cow', { asym: true, counts: [2, 3], themes: F, max: 1 }),
    pig: K('the pig', 'ground', 21, 14, 'pig', { asym: true, colours: ['pink', 'green', 'red'], themes: F }),
    sheep: K('the sheep', 'ground', 21, 16, 'sheep', { asym: true, states: ['open', 'shut'], themes: F }),
    chick: K('the chick', 'ground', 9, 9, 'chick', { asym: true, colours: ['yellow', 'orange'], themes: F, max: 3 }),
    hen: K('the hen', 'ground', 15, 15, 'hen', { asym: true, colours: ['brown', 'white'], themes: F }),
    pumpkin: K('the pumpkin', 'ground', 15, 12, 'pumpkin', { colours: ['orange', 'green'], themes: F }),
    scarecrow: K('the scarecrow', 'back', 18, 40, 'scarecrow', { states: ['hat', 'none'], themes: F, max: 1 }),
    tractor: K('the tractor', 'ground', 28, 20, 'tractor', { asym: true, colours: ['red', 'green', 'blue'], themes: F, max: 1 }),
  };

  const row = (diffs, items, kinds, minR, sizeFactor, minHalf) => ({ diffs, items, kinds, minR, sizeFactor, minHalf });
  const L4 = ['missing', 'colour', 'swap', 'size'];
  const LITTLE = [
    row(2, 6, ['missing', 'colour'], 36, 1.8, 16),
    row(2, 7, ['missing', 'colour', 'swap'], 36, 1.8, 16),
    row(3, 7, ['missing', 'colour', 'swap'], 36, 1.8, 16),
    row(3, 8, L4, 36, 1.8, 16),
    row(3, 9, L4, 36, 1.8, 16),
    row(4, 9, L4, 36, 1.8, 16),
    row(4, 10, L4, 36, 1.8, 16),
    row(4, 10, L4, 36, 1.8, 12),
  ];
  const B0 = ['missing', 'colour', 'swap', 'size', 'flip'];
  const B1 = B0.concat('count', 'state');
  const B2 = B1.concat('shade', 'shift');
  const B3 = B2.concat('tilt');
  const BIG = [row(5, 12, B0, 24, 1.3, 10), row(6, 14, B1, 24, 1.3, 10), row(7, 16, B2, 24, 1.3, 10), row(8, 18, B3, 24, 1.3, 8)];
  const tier = (round) => (round <= 2 ? 0 : round <= 5 ? 1 : round <= 9 ? 2 : 3);

  // ---- seeded random (mulberry32) ----
  function rng32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (v) => Math.floor(Number(v)) || 0;
  const mix = (seed, salt) => (Math.imul(int(seed), 1000003) + Math.imul(salt, 7919) + 12345) >>> 0;
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  function shuffle(r, list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---- geometry ----
  function box(item) {
    const d = KINDS[item.kind];
    let w = d.w * item.s, h = d.h * item.s;
    if (item.rot) {
      const a = (Math.abs(item.rot) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const rw = w * c + h * s, rh = w * s + h * c;
      w = rw; h = rh;
    }
    return { x0: item.x - w, y0: item.y - h, x1: item.x + w, y1: item.y + h };
  }
  const half = (item) => Math.max(KINDS[item.kind].w, KINDS[item.kind].h) * item.s;
  const base = (item) => item.y + KINDS[item.kind].h * item.s;
  const overlaps = (p, q, pad) => p.x0 - pad < q.x1 && q.x0 - pad < p.x1 && p.y0 - pad < q.y1 && q.y0 - pad < p.y1;
  const inside = (b) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H;
  function inLane(item) {
    const lane = LANES[KINDS[item.kind].lane], b = base(item);
    return b >= lane[0] && b <= lane[1];
  }
  // inside the picture, base in its lane, clear of every other item by PAD
  function fits(item, others) {
    const b = box(item);
    if (!inside(b) || !inLane(item)) return false;
    return others.every((o) => o.id === item.id || !overlaps(b, box(o), PAD));
  }

  // ---- layout: exactly row.items items, or null ----
  function fresh(r, d) {
    return {
      flip: d.asym && r() < 0.5,
      colour: d.colours ? pick(r, d.colours) : null,
      state: d.states ? pick(r, d.states) : null,
      count: d.counts ? d.counts[0] + Math.floor(r() * (d.counts[1] - d.counts[0] + 1)) : null,
    };
  }
  function layout(r, row, theme) {
    const kinds = Object.keys(KINDS).filter((k) => KINDS[k].themes.includes(theme));
    const items = [];
    const used = {};
    for (let tries = 0; items.length < row.items && tries < 600; tries++) {
      const kind = pick(r, kinds), d = KINDS[kind];
      if ((used[kind] || 0) >= d.max) continue;
      const s = Math.round((0.9 + r() * 0.35) * 100) / 100;
      const item = Object.assign({ id: 'p' + items.length, kind, x: 0, y: 0, s, rot: 0 }, fresh(r, d));
      const lane = LANES[d.lane];
      for (let k = 0; k < 40; k++) {
        item.y = lane[0] + r() * (lane[1] - lane[0]) - d.h * s;
        item.x = d.w * s + PAD + r() * (W - 2 * (d.w * s + PAD));
        if (fits(item, items)) {
          items.push(item);
          used[kind] = (used[kind] || 0) + 1;
          break;
        }
      }
    }
    return items.length === row.items ? items : null;
  }

  // ---- differences ----
  function wheelDist(c1, c2) {
    const i = WHEEL.indexOf(c1), j = WHEEL.indexOf(c2);
    if (i < 0 || j < 0) return -1;
    const d = Math.abs(i - j);
    return Math.min(d, 8 - d);
  }
  /* Each returns the changed fields, null for "gone", or false when this
   * item cannot take this kind of change. `cur` is the changed side so far. */
  const CHANGES = {
    missing: () => null,
    colour: (r, it, d) => {
      const c = d.colours ? d.colours.filter((x) => wheelDist(x, it.colour) >= 3) : [];
      return c.length ? { colour: pick(r, c) } : false;
    },
    shade: (r, it, d) => {
      if (half(it) < 14) return false;
      const c = d.colours ? d.colours.filter((x) => wheelDist(x, it.colour) === 1) : [];
      return c.length ? { colour: pick(r, c) } : false;
    },
    flip: (r, it, d) => (d.asym ? { flip: !it.flip } : false),
    state: (r, it, d) => (d.states ? { state: d.states[0] === it.state ? d.states[1] : d.states[0] } : false),
    count: (r, it, d) => {
      if (!d.counts) return false;
      const up = it.count === d.counts[0] ? true : it.count === d.counts[1] ? false : r() < 0.5;
      return { count: it.count + (up ? 1 : -1) };
    },
    tilt: (r, it) => (half(it) < 14 ? false : { rot: r() < 0.5 ? TILT : -TILT }),
    size: (r, it, d, row) => {
      const s = r() < 0.5 ? it.s * row.sizeFactor : it.s / row.sizeFactor;
      return { s, y: base(it) - d.h * s };                 // the base stays put
    },
    shift: (r, it) => {
      const m = SHIFT[0] + r() * (SHIFT[1] - SHIFT[0]), a = r() * Math.PI * 2;
      return { x: it.x + m * Math.cos(a), y: it.y + m * Math.sin(a) };
    },
    swap: (r, it, d, row, cur, kinds) => {
      const cands = kinds.filter((k) => k !== it.kind && KINDS[k].lane === d.lane && KINDS[k].family !== d.family &&
        cur.filter((o) => o.kind === k).length < KINDS[k].max);
      if (!cands.length) return false;
      const k = pick(r, cands), nd = KINDS[k];
      return Object.assign({ kind: k, y: base(it) - nd.h * it.s }, fresh(r, nd));
    },
  };
  function regionOf(before, after, minR) {
    const p = box(before), q = after ? box(after) : p;
    const x0 = Math.min(p.x0, q.x0), y0 = Math.min(p.y0, q.y0), x1 = Math.max(p.x1, q.x1), y1 = Math.max(p.y1, q.y1);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.max(minR, Math.max(x1 - x0, y1 - y0) / 2 + 4) };
  }
  function differ(r, row, items, theme) {
    const kinds = Object.keys(KINDS).filter((k) => KINDS[k].themes.includes(theme));
    const cur = { a: items.map((o) => Object.assign({}, o)), b: items.map((o) => Object.assign({}, o)) };
    const diffs = [];
    for (const it of shuffle(r, items.filter((o) => half(o) >= row.minHalf))) {
      if (diffs.length >= row.diffs) break;
      const d = KINDS[it.kind];
      const side = r() < 0.5 ? 'a' : 'b';
      let made = null;
      for (const kind of shuffle(r, row.kinds)) {
        for (let t = 0; t < 8 && !made; t++) {
          const after = CHANGES[kind](r, it, d, row, cur[side], kinds);
          if (after === false) break;
          const changed = after === null ? null : Object.assign({}, it, after);
          if (changed && !fits(changed, cur[side])) continue;
          const region = regionOf(it, changed, row.minR);
          if (region.x - region.r < 0 || region.y - region.r < 0 || region.x + region.r > W || region.y + region.r > H) continue;
          if (diffs.some((q) => Math.hypot(q.region.x - region.x, q.region.y - region.y) < q.region.r + region.r + GAP)) continue;
          const before = {};
          if (after) for (const key of Object.keys(after)) before[key] = it[key];
          made = { id: 'd' + diffs.length, kind, item: it.id, side, region, before, after };
          cur[side] = changed ? cur[side].map((o) => (o.id === it.id ? changed : o)) : cur[side].filter((o) => o.id !== it.id);
        }
        if (made) break;
      }
      if (made) diffs.push(made);
    }
    return diffs.length === row.diffs ? { a: cur.a, b: cur.b, diffs } : null;
  }
  /* A fair scene for this seed: lay out, then change. A layout that cannot
   * host the differences is dropped and the next internal seed is tried, so
   * the result always exists and the same seed always gives the same scene. */
  function make(seed, row, theme) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const r = rng32(mix(seed, attempt));
      const items = layout(r, row, theme);
      if (!items) continue;
      const out = differ(r, row, items, theme);
      if (out) return { theme, seed, a: out.a, b: out.b, diffs: out.diffs };
    }
    throw new Error('no fair scene for seed ' + seed);
  }

  // ---- the rest of the rules ----
  function theme(band, round, seed) {
    if (band === 'little') return THEMES[(round - 1) % 3];
    let t = ((int(seed) % 3) + 3) % 3;
    // each later round: one of the two themes that are not the previous one
    for (let n = 2; n <= round; n++) t = (t + 1 + ((int(seed) + n) & 1)) % 3;
    return THEMES[t];
  }
  function hit(diffs, found, x, y) {
    for (const d of diffs) {
      if (found.has ? found.has(d.id) : found.indexOf(d.id) >= 0) continue;
      if (Math.hypot(d.region.x - x, d.region.y - y) <= d.region.r) return d;
    }
    return null;
  }
  const nextLevel = (level, autoHints) => (autoHints === 0 ? Math.min(7, level + 1) : autoHints >= 2 ? Math.max(0, level - 1) : level);
  const stars = (hints, gaveUp) => (gaveUp ? 0 : hints === 0 ? 3 : hints === 1 ? 2 : 1);
  function label(kind) {
    const n = KINDS[kind].name;
    if (n.indexOf('the ') !== 0) return n;
    const rest = n.slice(4);
    return (/^[aeiou]/.test(rest) ? 'an ' : 'a ') + rest;
  }

  const api = { W, H, PAD, GAP, THEMES, PALETTE, WHEEL, LANES, LANE_ORDER, SHIFT, TILT, KINDS, LITTLE, BIG, tier, theme, make, box, half, base, hit, nextLevel, stars, label };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.Spot = root.Spot || {};
    root.Spot.Scenes = api;
  }
})(this);
