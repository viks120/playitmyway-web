/* Draws a spot-the-difference scene as SVG markup: a flat backdrop and one
 * <g class="item"> per item, in the house style (ink outlines, flat fills).
 * Pure string building, so docs/tests/spot.test.js renders every seed in
 * Node; in the page it is a classic script that sets window.Spot.Draw. */
(function (root) {
  'use strict';
  const Scenes = typeof module === 'object' && module.exports ? require('./scenes.js') : root.Spot.Scenes;
  const PAL = Scenes.PALETTE;
  const INK = PAL.ink, WHITE = PAL.white, BROWN = PAL.brown, GREY = PAL.grey;
  // flat colours for backdrops and fixed parts; everything a difference can change is palette
  const SKY = '#dff4ff', HILL = '#a7e3a1', WATER = '#8ed0ff', SAND = '#f1dcb0', FIELD = '#9be28f', CROP = '#d9e37a', TRACK = '#c9a87a', LEAF = '#2e9e5b';
  const COLOURS = [SKY, HILL, WATER, SAND, FIELD, CROP, TRACK, LEAF];

  const f = (n) => String(Math.round(n * 10) / 10);
  const col = (it, fallback) => (it.colour ? PAL[it.colour] : fallback);
  const circle = (cx, cy, r, fill) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
  const ellipse = (cx, cy, rx, ry, fill) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"/>`;
  const rect = (x, y, w, h, fill, rx) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''} fill="${fill}"/>`;
  const path = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
  const line = (d, stroke) => `<path d="${d}" fill="none"${stroke ? ` stroke="${stroke}"` : ''}/>`;
  const eye = (cx, cy, shut) => (shut ? line(`M${f(cx - 2.5)} ${f(cy)} h5`) : circle(cx, cy, 2.2, INK));
  const first = (positions, n) => positions.slice(0, n);

  function backdrop(theme) {
    const sky = `<rect width="400" height="300" fill="${SKY}"/>`;
    if (theme === 'pond') {
      // the shoreline sits under the water lane (bases up to 255), so nothing swims on sand
      return sky + path('M0 150 q100 -40 200 0 t200 0 V300 H0 z', HILL) +
        path('M0 150 V256 q100 10 200 0 t200 0 V150 z', WATER) +
        path('M0 256 q100 10 200 0 t200 0 V300 H0 z', SAND);
    }
    if (theme === 'meadow') {
      return sky + path('M0 160 q120 -50 240 -10 t160 10 V300 H0 z', HILL) + rect(0, 180, 400, 120, FIELD);
    }
    return sky + rect(0, 165, 400, 135, CROP) + path('M0 262 q200 -10 400 0 V300 H0 z', TRACK);
  }

  const DRAWERS = {
    sun: (it) => {
      const c = col(it, PAL.yellow);
      let rays = '';
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        rays += line(`M${f(12.5 * Math.cos(a))} ${f(12.5 * Math.sin(a))} L${f(16 * Math.cos(a))} ${f(16 * Math.sin(a))}`, c);
      }
      return rays + circle(0, 0, 10.5, c);
    },
    cloud: (it) => (it.count === 3
      ? path('M-21 10 a7 7 0 0 1 2 -13 a11 11 0 0 1 20 -5 a10 10 0 0 1 17 6 a7 7 0 0 1 3 12 z', WHITE)
      : path('M-19 10 a8 8 0 0 1 3 -14 a12 12 0 0 1 22 0 a8 8 0 0 1 13 14 z', WHITE)),
    bird: () => path('M-8 1 l-4 -3 l1 4 z', WHITE) + ellipse(-1, 1, 7, 4, WHITE) + path('M-3 0 l-5 -7 l9 3 z', WHITE) +
      circle(7, -2, 3.5, WHITE) + path('M10.5 -2 l3 1 l-3 1 z', PAL.orange) + circle(8, -2.5, 1, INK),
    clover: (it, ctx) => `<image href="${ctx.critters}clover.svg" x="-32" y="-30" width="64" height="60"/>`,
    pip: (it, ctx) => `<image href="${ctx.critters}pip.svg" x="-32" y="-30" width="64" height="60"/>`,
    plum: (it, ctx) => `<image href="${ctx.critters}plum.svg" x="-32" y="-30" width="64" height="60"/>`,
    mango: (it, ctx) => `<image href="${ctx.critters}mango.svg" x="-32" y="-30" width="64" height="60"/>`,
    lilypad: (it) => ellipse(0, 0, 17, 8, PAL.green) + path('M0 0 L17 -4 L17 4 z', WATER) +
      (it.state === 'bud' ? path('M-6 -2 l4 -9 l4 9 z', PAL.pink) : ''),
    frog: (it) => {
      const c = col(it, PAL.green), shut = it.state === 'shut';
      return ellipse(0, 3, 14, 9, c) + circle(-4, -8, 4.5, c) + circle(6, -8, 4.5, c) + eye(-4, -8, shut) + eye(6, -8, shut) +
        line('M-2 6 q5 3 10 0') + ellipse(-11, 8, 4, 3, c) + ellipse(11, 9, 4, 3, c);
    },
    fish: (it) => {
      const c = col(it, PAL.orange);
      return path('M8 0 l7 -7 v14 z', c) + ellipse(-3, 0, 11, 7, c) +
        first(['M-5 -6 v12', 'M0 -7 v14', 'M-9 -4 v8'], it.count).map((d) => line(d)).join('') + circle(-9, -2, 1.4, INK);
    },
    duck: (it) => {
      const c = col(it, PAL.yellow);
      return ellipse(-1, 6, 13, 8, c) + circle(8, -6, 6, c) + path('M13 -6 l6 2 l-6 2 z', PAL.orange) + circle(9, -7, 1.3, INK) + path('M-14 4 l-5 -8 l9 4 z', c);
    },
    boat: (it) => {
      const c = col(it, PAL.red);
      return path('M-22 6 h44 l-6 10 h-32 z', c) + line('M0 6 v-22') + path('M2 -16 l14 14 h-14 z', WHITE) +
        (it.state === 'flag' ? path('M0 -17 l8 3 l-8 3 z', PAL.red) : '');
    },
    turtle: (it) => {
      const c = col(it, PAL.green);
      return ellipse(-9, 5, 3, 3, c) + ellipse(7, 6, 3, 3, c) + circle(13, 1, 4, c) + ellipse(-1, -1, 11, 7, c) +
        line('M-5 -5 v8 M1 -7 v12 M7 -5 v8') + circle(14, 0, 1.2, INK);
    },
    dragonfly: (it) => {
      const c = col(it, PAL.blue);
      const wing = (cx, cy, a) => `<ellipse cx="${cx}" cy="${cy}" rx="7" ry="2.5" fill="${WHITE}" transform="rotate(${a} ${cx} ${cy})"/>`;
      return wing(-7, -4, -30) + wing(2, -4, -30) + wing(-7, 4, 30) + wing(2, 4, 30) +
        rect(-15, -1.5, 26, 3, c, 1.5) + circle(13, 0, 3, c) + circle(14, -1, 1, INK);
    },
    reeds: (it) => (it.count === 4 ? [-11, -4, 4, 11] : [-8, 0, 8]).map((x) => line(`M${x} 24 V-12`, LEAF) + rect(x - 2.5, -24, 5, 12, BROWN, 2.5)).join(''),
    stone: (it) => path('M-13 8 q-2 -12 10 -15 q14 -2 16 8 q0 7 -8 8 z', col(it, GREY)) + line('M-6 -2 q4 -4 9 -2', WHITE),
    flower: (it) => {
      const c = col(it, PAL.pink);
      let s = line('M0 20 V-2', LEAF) + ellipse(5, 10, 5, 2.5, LEAF);
      if (it.state === 'bud') return s + ellipse(0, -10, 5, 8, c);
      for (let k = 0; k < 5; k++) { const a = (k * 2 * Math.PI) / 5 - Math.PI / 2; s += circle(6 * Math.cos(a), -10 + 6 * Math.sin(a), 4.5, c); }
      return s + circle(0, -10, 3.5, PAL.yellow);
    },
    tree: (it) => rect(-5, 10, 10, 32, BROWN) + circle(-14, -4, 14, PAL.green) + circle(14, -4, 14, PAL.green) + circle(0, -16, 20, PAL.green) +
      first([[-8, -4], [10, -10], [-2, -24], [14, 2]], it.count).map(([x, y]) => circle(x, y, 3.5, PAL.red)).join(''),
    bush: (it) => path('M-21 13 a9 9 0 0 1 6 -16 a12 12 0 0 1 30 0 a9 9 0 0 1 6 16 z', col(it, PAL.green)),
    fence: (it) => rect(-36, -5, 72, 4, WHITE) + rect(-36, 5, 72, 4, WHITE) +
      first(it.count === 4 ? [-33, -11, 11, 33] : [-30, 0, 30], it.count).map((x) => path(`M${x - 3} 14 v-24 l3 -4 l3 4 v24 z`, WHITE)).join(''),
    mushroom: (it) => rect(-5, 0, 10, 15, WHITE, 3) + path('M-13 2 a13 13 0 0 1 26 0 z', col(it, PAL.red)) +
      first([[-6, -4], [4, -7], [8, -2], [-1, -10]], it.count).map(([x, y]) => circle(x, y, 2, WHITE)).join(''),
    butterfly: (it) => {
      const c = col(it, PAL.orange);
      return ellipse(-7, -4, 7, 6, c) + ellipse(7, -4, 7, 6, c) + ellipse(-6, 5, 5, 4, c) + ellipse(6, 5, 5, 4, c) +
        rect(-1.5, -9, 3, 18, INK, 1.5) + line('M-1 -9 l-4 -6 M1 -9 l4 -6');
    },
    bee: () => ellipse(-2, -7, 5, 3, WHITE) + ellipse(-1, 0, 9, 6, PAL.yellow) + line('M-4 -5.5 v11 M1 -5.5 v11') + circle(9, 0, 3, INK),
    ladybird: (it) => ellipse(-1, 0, 12, 8, PAL.red) + circle(10, 0, 3.2, INK) + line('M-1 -8 V8') +
      first([[-7, -3], [-6, 3.5], [3, -3.5], [3, 3.5]], it.count).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${INK}" stroke="none"/>`).join(''),
    snail: (it) => path('M-14 10 q0 -6 6 -6 h22 q4 0 1 6 z', PAL.green) + circle(-4, 1, 8.5, col(it, PAL.yellow)) +
      line('M-4 1 a3 3 0 0 1 3 -3 a5 5 0 0 1 2 6') + line('M10 4 l3 -10 M14 4 l2 -10') + circle(13, -7, 1.5, INK) + circle(16, -7, 1.5, INK),
    kite: (it) => path('M0 -22 L13 -6 L0 10 L-13 -6 z', col(it, PAL.red)) + line('M0 -22 V10 M-13 -6 h26') + line('M0 10 q-6 6 0 12', INK) + circle(-3, 16, 2, PAL.yellow),
    basket: (it) => line('M-9 -2 a9 9 0 0 1 18 0') +
      first([[-5, -5], [5, -5], [0, -9]], it.count).map(([x, y]) => circle(x, y, 4, PAL.red)).join('') + path('M-16 -2 h32 l-4 15 h-24 z', BROWN),
    barn: (it) => {
      const c = col(it, PAL.red);
      return rect(-34, -10, 68, 50, c) + path('M-42 -10 L0 -40 L42 -10 z', BROWN) +
        rect(-9, 16, 18, 24, it.state === 'open' ? INK : BROWN, 2) + (it.state === 'open' ? '' : line('M-9 16 l18 24 M9 16 l-18 24')) +
        first([[-26, -2], [16, -2]], it.count).map(([x, y]) => rect(x, y, 10, 10, WHITE, 2)).join('');
    },
    hay: (it) => (it.count === 2
      ? rect(-16, -13, 32, 12, PAL.yellow, 6) + rect(-16, 1, 32, 12, PAL.yellow, 6)
      : rect(-16, -12, 32, 24, PAL.yellow, 8) + line('M-6 -12 v24 M6 -12 v24')),
    cow: (it) => rect(-14, 6, 5, 12, WHITE) + rect(5, 6, 5, 12, WHITE) + rect(-18, -10, 36, 20, WHITE, 10) + circle(18, -6, 8, WHITE) +
      ellipse(22, -2, 4, 2.5, PAL.pink) + circle(16, -8, 1.3, INK) + path('M12 -13 l-4 -5 l6 1 z', WHITE) +
      first([[-9, -3], [3, 2], [-2, -8]], it.count).map(([x, y]) => ellipse(x, y, 5, 4, INK)).join(''),
    pig: (it) => {
      const c = col(it, PAL.pink);
      return rect(-12, 6, 5, 8, c) + rect(5, 6, 5, 8, c) + ellipse(-2, 0, 18, 11, c) + circle(13, -2, 7, c) +
        ellipse(17, 0, 3.5, 2.5, PAL.red) + circle(12, -5, 1.3, INK) + path('M9 -8 l-3 -6 l6 1 z', c) + line('M-20 -2 q-4 4 0 6');
    },
    sheep: (it) => {
      const shut = it.state === 'shut';
      return rect(-12, 8, 4, 8, INK) + rect(6, 8, 4, 8, INK) + ellipse(-2, 0, 16, 10, WHITE) + circle(-12, -4, 6, WHITE) + circle(2, -8, 6, WHITE) +
        circle(14, -3, 6, INK) + (shut ? line('M10.5 -4 h3.5 M15.5 -4 h3.5', WHITE) : circle(12, -4, 1.8, WHITE) + circle(17, -4, 1.8, WHITE));
    },
    chick: (it) => {
      const c = col(it, PAL.yellow);
      return circle(0, 0, 7, c) + path('M7 0 l4 1.5 l-4 1.5 z', PAL.orange) + circle(3, -2, 1.1, INK) + line('M-3 7 v2 M1 7 v2', PAL.orange);
    },
    hen: (it) => {
      const c = col(it, BROWN);
      return path('M-11 2 l-4 -8 l4 2 l1 -5 l3 5 z', c) + ellipse(0, 4, 12, 9, c) + circle(9, -6, 6, c) + circle(8, -12, 2, PAL.red) + circle(11, -11, 2, PAL.red) +
        path('M14 -6 l5 1.5 l-5 1.5 z', PAL.orange) + circle(10, -7, 1.2, INK) + line('M-4 13 v2 M3 13 v2', PAL.orange);
    },
    pumpkin: (it) => {
      const c = col(it, PAL.orange);
      return rect(-2, -12, 4, 5, BROWN, 1) + ellipse(0, 1, 15, 10, c) + line('M-7 -8 q-3 9 0 18 M7 -8 q3 9 0 18');
    },
    scarecrow: (it) => line('M0 40 V-8') + line('M-16 -4 h32') + rect(-8, -8, 16, 26, PAL.blue, 3) + circle(0, -18, 8, PAL.yellow) +
      circle(-3, -19, 1.2, INK) + circle(3, -19, 1.2, INK) + line('M-3 -15 q3 2 6 0') +
      (it.state === 'hat' ? path('M-11 -24 h22 l-4 -8 h-14 z', BROWN) : ''),
    tractor: (it) => {
      const c = col(it, PAL.red);
      return rect(-26, -2, 38, 12, c, 2) + rect(-2, -18, 16, 16, c, 2) + rect(1, -15, 10, 8, WHITE, 1) + rect(-22, -10, 3, 8, GREY) +
        circle(-16, 11, 9, INK) + circle(-16, 11, 3.5, GREY) + circle(16, 13, 6, INK) + circle(16, 13, 2.5, GREY);
    },
  };

  function group(it, side, ctx) {
    const sx = it.flip ? -it.s : it.s;
    return `<g class="item" id="${side}-${it.id}" data-id="${it.id}" role="button" aria-label="${Scenes.label(it.kind)}" tabindex="-1"` +
      ` transform="translate(${f(it.x)} ${f(it.y)}) rotate(${f(it.rot)}) scale(${f(sx)} ${f(it.s)})"` +
      ` fill="none" stroke="${INK}" stroke-width="${f(2.5 / it.s)}" stroke-linejoin="round" stroke-linecap="round">${DRAWERS[it.kind](it, ctx)}</g>`;
  }
  // back to front: sky, back, air, water, ground; within a lane by base
  function picture(items, opts) {
    const ctx = { critters: opts.critters || '' };
    const lane = (it) => Scenes.LANE_ORDER.indexOf(Scenes.KINDS[it.kind].lane);
    const order = items.slice().sort((p, q) => lane(p) - lane(q) || Scenes.base(p) - Scenes.base(q) || (p.id < q.id ? -1 : 1));
    return backdrop(opts.theme) + order.map((it) => group(it, opts.side || 'a', ctx)).join('');
  }

  const api = { COLOURS, backdrop, DRAWERS, group, picture };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.Spot = root.Spot || {};
    root.Spot.Draw = api;
  }
})(this);
