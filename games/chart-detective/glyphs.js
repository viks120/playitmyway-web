/* Chart Detective: the thirty category glyphs, as SVG <symbol>s in the
 * house style (ink outlines, flat fills, no text), one per category of
 * every theme in charts.js. Pure string building, so the tests check every
 * glyph in Node; in the page it is a classic script that sets
 * window.ChartDetectiveGlyphs, and the page puts the symbols in one hidden
 * <svg> and draws each glyph with <use href="#g-<id>">. Each symbol has a
 * 32 by 32 box and reads at 24px: one big shape, few details. */
(function (root) {
  'use strict';

  const P = {
    ink: '#33302e', white: '#ffffff', red: '#ef4444', orange: '#fb923c', yellow: '#fbbf24', green: '#4ade80',
    teal: '#2dd4bf', blue: '#60a5fa', purple: '#a78bfa', pink: '#ff8fab', brown: '#8b5e3c', grey: '#94a3b8',
  };
  // every shape sits in a <g> that gives the ink outline; a shape that wants no outline says stroke="none"
  const OUT = `<g fill="none" stroke="${P.ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`;
  const END = '</g>';
  const c = (cx, cy, r, fill, extra) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra || ''}/>`;
  const e = (cx, cy, rx, ry, fill, extra) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra || ''}/>`;
  const p = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/>`;
  const l = (d, extra) => `<path d="${d}"${extra || ''}/>`;
  const dot = (cx, cy, r) => c(cx, cy, r || 1.6, P.ink, ' stroke="none"');
  const star = (cx, cy, R, r) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
    }
    return d + 'Z';
  };
  const cloud = (fill) => p('M8 22h16a5 5 0 0 0 0-10 7 7 0 0 0-13-2 5 5 0 0 0-3 12z', fill);

  const GLYPHS = {
    // --- minibeast hunt ---
    ladybird: e(16, 18, 10, 8, P.red) + c(16, 9, 4.5, P.ink) + l('M16 12v14') + dot(11, 16, 1.8) + dot(21, 16, 1.8) + dot(12, 22, 1.5) + dot(20, 22, 1.5),
    ant: l('M8 12l-3-4M24 12l3-4M6 20l-3 3M26 20l3 3M10 23l-2 5M22 23l2 5') + c(8, 16, 4, P.brown) + c(16, 16, 3.5, P.brown) + c(24, 17, 4.5, P.brown) + dot(7, 15, 1.2),
    snail: p('M4 25c0-4 6-6 10-6h10c3 0 5 2 5 4H4z', P.green) + c(19, 14, 8, P.brown) + l('M25 14a6 6 0 1 0-6 6a3 3 0 1 0 3-3') + l('M7 19l-2-6M11 19l1-6') + dot(5, 12, 1.5) + dot(12.5, 12.5, 1.5),
    bee: e(10, 10, 5, 3.5, P.white) + e(22, 10, 5, 3.5, P.white) + e(16, 19, 10, 7, P.yellow) + l('M11 13v12M16 12v14M21 13v12') + c(16, 19, 0, P.yellow) + l('M26 19l3 1'),
    butterfly: p('M16 16C12 6 3 6 4 13c1 5 7 6 12 6zM16 16c4-10 13-10 12-3-1 5-7 6-12 6z', P.purple) + p('M16 18c-6 0-11 2-10 6 1 3 6 2 10-3zM16 18c6 0 11 2 10 6-1 3-6 2-10-3z', P.pink) + l('M16 10v15M16 10l-3-4M16 10l3-4'),
    // --- picnic fruit ---
    apple: c(16, 18, 10, P.red) + l('M16 8V4') + e(20, 6, 4, 2, P.green),
    banana: p('M5 8C3 22 14 30 27 26C17 25 8 18 5 8z', P.yellow) + l('M5 8L4 4M27 26l3 1'),
    grapes: l('M16 8V4') + c(16, 11, 4, P.purple) + c(11, 16, 4, P.purple) + c(21, 16, 4, P.purple) + c(16, 20, 4, P.purple) + c(12, 24, 3.5, P.purple) + c(20, 24, 3.5, P.purple) + c(16, 27, 3, P.purple),
    orange: c(16, 18, 10, P.orange) + e(20, 6, 4, 2, P.green) + dot(12, 15, 1.2) + dot(18, 21, 1.2),
    strawberry: p('M16 28C8 22 6 16 7 11h18c1 5-1 11-9 17z', P.red) + p('M8 11l4-4 4 3 4-3 4 4z', P.green) + dot(13, 16, 1.2) + dot(19, 16, 1.2) + dot(16, 21, 1.2),
    // --- pets ---
    dog: e(8, 14, 3.5, 7, P.brown) + e(24, 14, 3.5, 7, P.brown) + c(16, 16, 9, P.brown) + e(16, 21, 4.5, 3, P.white) + dot(12.5, 14) + dot(19.5, 14) + dot(16, 20, 1.8),
    cat: p('M8 12l2-8 6 5zM24 12l-2-8-6 5z', P.orange) + c(16, 17, 9, P.orange) + dot(12.5, 15) + dot(19.5, 15) + l('M4 18h6M4 22h6M22 18h6M22 22h6') + dot(16, 19, 1.4),
    fish: p('M23 16l6-6v12z', P.blue) + e(14, 16, 10, 7, P.blue) + dot(9, 14) + l('M14 10c3 3 3 9 0 12'),
    rabbit: e(11, 8, 3.5, 7, P.white) + e(21, 8, 3.5, 7, P.white) + c(16, 20, 9, P.white) + dot(12.5, 18) + dot(19.5, 18) + dot(16, 22, 1.4),
    bird: p('M24 15l6 1-6 3z', P.yellow) + c(15, 16, 9, P.blue) + p('M9 20c3 1 8 0 10-4-6-1-9 1-10 4z', P.teal) + p('M4 14l4 2-4 4z', P.blue) + dot(18, 12),
    // --- weather diary ---
    sunny: l('M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3') + c(16, 16, 7, P.yellow),
    cloudy: cloud(P.grey),
    rainy: cloud(P.grey) + l('M10 25v4M16 25v4M22 25v4', ` stroke="${P.blue}"`),
    windy: l('M3 11h16a3 3 0 1 0-3-3M3 17h22a3 3 0 1 1-3 3M3 23h12a3 3 0 1 1-3 3', ` stroke="${P.blue}"`) + p('M22 24c0-4 3-7 7-7 0 4-3 7-7 7z', P.green),
    snowy: l('M16 4v24M6 10l20 12M6 22l20-12M16 4l-3 3M16 4l3 3M16 28l-3-3M16 28l3-3', ` stroke="${P.blue}"`) + c(16, 16, 3, P.white),
    // --- beach finds ---
    shell: p('M16 27L4 15c0-6 5-10 12-10s12 4 12 10z', P.pink) + l('M16 27L8 12M16 27V8M16 27l8-15'),
    starfish: p(star(16, 17, 14, 7), P.orange) + dot(16, 11, 1.2) + dot(11, 18, 1.2) + dot(21, 18, 1.2),
    pebble: p('M6 20c-2-8 6-14 14-12s10 10 6 15-18 5-20-3z', P.grey) + l('M12 13c2-2 6-3 8-2', ` stroke="${P.white}"`),
    feather: p('M26 5c-10 1-18 9-20 22 11-1 19-9 20-22z', P.white) + l('M6 27L26 5M12 20l6-1M9 24l3-5M16 15l6-1M13 18l2-5'),
    crab: c(6, 11, 4, P.red) + c(26, 11, 4, P.red) + l('M9 13l4 4M23 13l-4 4M6 22l-3 3M8 25l-2 4M26 22l3 3M24 25l2 4') + e(16, 21, 10, 7, P.red) + l('M12 14v-3M20 14v-3') + dot(12, 10) + dot(20, 10),
    // --- shape spotting ---
    circle: c(16, 16, 11, P.blue),
    square: p('M6 6h20v20H6z', P.green),
    triangle: p('M16 5L28 27H4z', P.yellow),
    star: p(star(16, 17, 13, 6), P.orange),
    heart: p('M16 27C8 21 4 17 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-4 9-12 15z', P.pink),
  };

  const symbol = (id) => `<symbol id="g-${id}" viewBox="0 0 32 32">${OUT}${GLYPHS[id]}${END}</symbol>`;
  const ids = () => Object.keys(GLYPHS);
  const sprite = () => ids().map(symbol).join('');

  const api = { PALETTE: P, GLYPHS, ids, symbol, sprite };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChartDetectiveGlyphs = api;
})(typeof window !== 'undefined' ? window : globalThis);
