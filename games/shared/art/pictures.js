/* The site's in-game picture library: every picture a player plays with in
 * the older 2D games, drawn in the house style (ink outlines of 2.5, flat
 * palette fills, round joins, no text) as SVG <symbol>s in a 48 by 48 box
 * (flags: 72 by 48). Pure string building, so docs/tests/pictures.test.js
 * checks every picture in Node; in a page it is a classic script that sets
 * window.Pictures, the page drops one hidden sprite in, and each picture is
 * an <svg class="pic"><use href="#p-<id>"> the size the game asks for.
 *
 * Conventions, enforced by the test:
 *   - one entry per id, built with pic(label, markup) or flag(country, markup)
 *   - markup goes inside the standard ink wrapper, so a shape that wants no
 *     outline says stroke="none"; every shape names a fill
 *   - colours only from P below (the icon palette, the critters' colours and
 *     the scene colours), never a literal hex in a picture
 *   - a picture must read at 32px: one big shape, few details
 *   - the label is what a screen reader says when the picture carries
 *     meaning ("a cat"); decorative uses pass no label */
(function (root) {
  'use strict';

  const P = {
    ink: '#33302e', white: '#ffffff',
    red: '#ef4444', orange: '#fb923c', yellow: '#fbbf24', green: '#4ade80', teal: '#2dd4bf',
    blue: '#60a5fa', purple: '#a78bfa', pink: '#ff8fab', brown: '#8b5e3c', grey: '#94a3b8',
    cream: '#fff8ef', navy: '#2b2a5e', leaf: '#2e9e5b',
    sky: '#dff4ff', water: '#8ed0ff', sand: '#f1dcb0', hill: '#a7e3a1', field: '#9be28f', earth: '#5a3b22', wood: '#d9a066',
    // the four critters, as in icons/critters/*.svg
    cloverFur: '#fff1e4', cloverEar: '#ffadc2', cloverNose: '#ff94b0',
    pipGreen: '#97df86', pipDark: '#7cc86f',
    plumLilac: '#c2b2fb', plumSpike: '#ffb48f', plumTummy: '#fff0d4', plumDot: '#8f7ad8',
    mangoFur: '#ffcf9c', mangoStripe: '#f4a35c', mangoEar: '#ffb3c6',
  };

  const OUT = `<g fill="none" stroke="${P.ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`;
  const END = '</g>';
  const n = (x) => String(Math.round(x * 10) / 10);
  const c = (cx, cy, r, fill, extra) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra || ''}/>`;
  const e = (cx, cy, rx, ry, fill, extra) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra || ''}/>`;
  const r = (x, y, w, h, fill, rx, extra) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(rx)}"` : ''} fill="${fill}"${extra || ''}/>`;
  const p = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/>`;
  const l = (d, extra) => `<path d="${d}"${extra || ''}/>`;
  const dot = (cx, cy, rad) => c(cx, cy, rad || 2, P.ink, ' stroke="none"');
  const eyes = (lx, rx, y, rad) => dot(lx, y, rad || 2.2) + dot(rx, y, rad || 2.2) + c(lx + 0.8, y - 0.8, 0.8, P.white, ' stroke="none"') + c(rx + 0.8, y - 0.8, 0.8, P.white, ' stroke="none"');
  const star = (cx, cy, R, rad) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? rad : R;
      d += (i ? 'L' : 'M') + n(cx + rr * Math.cos(a)) + ' ' + n(cy + rr * Math.sin(a));
    }
    return d + 'Z';
  };

  const BOX = '0 0 48 48';
  const FLAG_BOX = '0 0 72 48';
  const pic = (label, markup) => ({ label, markup, box: BOX });
  const flag = (country, markup) => ({ label: 'the flag of ' + country, markup, box: FLAG_BOX });

  /* The pictures, grouped the way the games use them. Each line is one id. */
  const PICTURES = {
// --- group: food ---
    apple: pic('an apple', p('M24 16C21 12 14 11 10 15 5 20 6 32 12 39c3 3 7 4 10 2 1-1 3-1 4 0 3 2 7 1 10-2 6-7 7-19 2-24-4-4-11-5-14 1z', P.red) + l('M24 16c0-4 1-7 3-9', ` stroke="${P.brown}" stroke-width="3"`) + p('M26 11c3-5 9-6 12-3-3 5-9 6-12 3z', P.green) + e(16, 25, 2.5, 4, P.white, ' stroke="none"')),
    banana: pic('a banana', p('M9 13C6 32 24 46 42 31c2-1 2-4-1-4C28 32 16 24 13 12c-1-2-4-2-4 1z', P.yellow) + l('M10 12l-2-5', ` stroke="${P.brown}" stroke-width="3"`) + c(41, 29, 2, P.brown, ' stroke="none"')),
    grapes: pic('a bunch of grapes', l('M24 13V6', ` stroke="${P.brown}" stroke-width="3"`) + p('M24 8c3-6 9-7 13-3-4 5-10 5-13 3z', P.green) + c(14, 19, 6, P.purple) + c(34, 19, 6, P.purple) + c(24, 19, 6, P.purple) + c(19, 29, 6, P.purple) + c(29, 29, 6, P.purple) + c(24, 38, 6, P.purple)),
    orange: pic('an orange', c(24, 27, 17, P.orange) + l('M24 10V6', ` stroke="${P.brown}" stroke-width="3"`) + p('M25 8c3-5 9-6 12-2-4 5-9 5-12 2z', P.green) + c(17, 25, 1.6, P.mangoStripe, ' stroke="none"') + c(23, 35, 1.6, P.mangoStripe, ' stroke="none"') + c(31, 23, 1.6, P.mangoStripe, ' stroke="none"') + c(29, 32, 1.6, P.mangoStripe, ' stroke="none"') + c(19, 32, 1.6, P.mangoStripe, ' stroke="none"')),
    strawberry: pic('a strawberry', l('M24 14V7') + p('M24 44C13 39 6 29 8 20c2-6 10-7 16-4 6-3 14-2 16 4 2 9-5 19-16 24z', P.red) + p('M13 17c3-7 8-8 11-4 3-4 8-3 11 4-4 3-8 3-11 1-3 2-7 2-11-1z', P.green) + c(15, 25, 1.5, P.cream, ' stroke="none"') + c(24, 24, 1.5, P.cream, ' stroke="none"') + c(33, 25, 1.5, P.cream, ' stroke="none"') + c(19, 33, 1.5, P.cream, ' stroke="none"') + c(29, 33, 1.5, P.cream, ' stroke="none"') + c(24, 39, 1.5, P.cream, ' stroke="none"')),
    cherries: pic('two cherries', l('M16 25C16 15 20 9 27 6M31 27c-2-9-3-15-4-21') + p('M27 6c5-4 10-2 12 2-5 3-10 2-12-2z', P.green) + c(16, 32, 8, P.red) + c(31, 34, 8, P.red) + c(13, 29, 2, P.white, ' stroke="none"') + c(28, 31, 2, P.white, ' stroke="none"')),
    kiwi: pic('a kiwi', c(24, 24, 18, P.brown) + c(24, 24, 14, P.pipGreen, ' stroke="none"') + e(24, 24, 4.5, 6, P.cream, ' stroke="none"') + dot(33, 24, 1.3) + dot(30.4, 30.4, 1.3) + dot(24, 33, 1.3) + dot(17.6, 30.4, 1.3) + dot(15, 24, 1.3) + dot(17.6, 17.6, 1.3) + dot(24, 15, 1.3) + dot(30.4, 17.6, 1.3)),
    pineapple: pic('a pineapple', p('M24 22c-9-2-13-9-13-17 5 2 9 6 11 10 0-5 1-9 2-12 1 3 2 7 2 12 2-4 6-8 11-10 0 8-4 15-13 17z', P.green) + e(24, 33, 11, 13, P.yellow) + l('M16 25L32 41M24 21L34 31M14 35L24 45M32 25L16 41M24 21L14 31M34 35L24 45', ' stroke-width="1.5"')),
    mango: pic('a mango', p('M11 20C11 10 24 8 32 14C40 20 44 30 40 38C36 44 26 44 18 36C12 30 11 26 11 20z', P.yellow) + p('M20 13C27 10 34 14 38 20C41 25 41 31 39 36C34 30 28 22 20 13z', P.orange, ' stroke="none"') + l('M18 10c0-2-1-4-2-6', ` stroke="${P.brown}" stroke-width="3"`) + p('M16 5c3-3 8-4 11-1-3 4-8 4-11 1z', P.green)),
    peach: pic('a peach', p('M24 15c-4-5-14-5-16 5-2 10 6 22 16 22s18-12 16-22c-2-10-12-10-16-5z', P.plumSpike) + l('M24 15c-3 8-3 18-1 25', ' stroke-width="2"') + l('M24 15V9', ` stroke="${P.brown}" stroke-width="3"`) + p('M24 11c4-6 10-6 13-2-4 4-9 5-13 2z', P.green)),
    lemon: pic('a lemon', p('M4 26c0-2 2-3 4-4 4-6 10-8 16-8s12 2 16 8c2 1 4 2 4 4s-2 3-4 4c-4 6-10 8-16 8S12 36 8 30c-2-1-4-2-4-4z', P.yellow) + p('M28 14c4-6 10-6 13-2-4 4-9 5-13 2z', P.green)),
    cupcake: pic('a cupcake', p('M11 26h26l-3 15c0 1-1 2-2 2H16c-1 0-2-1-2-2z', P.blue) + l('M18 28l1 13M24 28v13M30 28l-1 13', ' stroke-width="1.5"') + p('M9 27c-2-9 5-14 15-14s17 5 15 14z', P.pink) + c(24, 12, 3.5, P.red)),
    'ice-cream': pic('an ice cream', c(24, 17, 11, P.pink) + c(20, 13, 2.2, P.white, ' stroke="none"') + p('M13 25h22L24 44z', P.wood) + l('M15 27l9 11M33 27l-9 11M20 27l6 8M28 27l-6 8', ' stroke-width="1.5"')),
    jam: pic('a jar of jam', r(12, 14, 24, 28, P.red, 5) + r(10, 6, 28, 9, P.blue, 3) + r(17, 23, 14, 11, P.white, 2) + c(24, 28.5, 2.5, P.red, ' stroke="none"')),
    ham: pic('a ham', p('M32 20c2-4 5-8 8-10 3-2 6 1 4 4 3 0 4 4 1 5-3 1-7 4-9 7z', P.white) + p('M4 30c0-12 10-18 20-16l10 4c4 2 4 8 0 10L22 40c-8 6-18 2-18-10z', P.pink) + e(14, 30, 5, 6, P.cloverEar, ' stroke="none"')),
    yam: pic('a sweet potato', p('M4 25c3-8 11-13 20-13h16c3 0 3 26 0 26H24c-9 0-17-5-20-13z', P.brown) + e(40, 25, 4, 13, P.orange) + e(40, 25, 1.5, 9, P.yellow, ' stroke="none"') + l('M14 20l2 3M22 30l2 3M26 19l2 3', ` stroke="${P.earth}" stroke-width="2"`)),
    nut: pic('a nut', p('M12 21c0 12 6 20 12 23 6-3 12-11 12-23z', P.wood) + p('M8 22c0-9 7-15 16-15s16 6 16 15c-5 2-11 3-16 3s-11-1-16-3z', P.brown) + l('M24 7c0-3 1-5 3-6', ' stroke-width="3"') + e(19, 32, 2, 4, P.cream, ' stroke="none"')),
    cup: pic('a cup with a straw', p('M26 22L31 3h5L31 22z', P.red) + p('M9 17h30l-3 24c0 2-1 3-3 3H15c-2 0-3-1-3-3z', P.blue) + e(14, 30, 2, 7, P.white, ' stroke="none"')),
    mug: pic('a steaming mug', p('M33 19h3c6 0 10 4 10 9s-4 9-10 9h-3v-5h3c3 0 5-2 5-4s-2-4-5-4h-3z', P.purple) + r(8, 16, 26, 26, P.purple, 4) + e(14, 29, 2, 7, P.white, ' stroke="none"') + l('M16 12c-3-3 3-5 0-9M25 12c-3-3 3-5 0-9', ' stroke-width="2"')),
    pot: pic('a teapot', l('M16 28c-6-1-11-6-10-14', ' stroke-width="7"') + l('M16 28c-6-1-11-6-10-14', ` stroke="${P.teal}" stroke-width="3"`) + l('M30 23c9-3 14 6 10 12-2 3-5 3-10 3', ' stroke-width="7"') + l('M30 23c9-3 14 6 10 12-2 3-5 3-10 3', ` stroke="${P.teal}" stroke-width="3"`) + e(23, 30, 14, 11, P.teal) + p('M13 21c0-4 4-7 10-7s10 3 10 7z', P.teal) + c(23, 12, 2.5, P.yellow)),
    pan: pic('a frying pan', p('M32 24l13-4c1 0 2 1 2 2s0 2-1 2l-14 5z', P.brown) + p('M2 22h31v8c0 4-3 7-7 7H9c-4 0-7-3-7-7z', P.grey)),
    can: pic('a tin can', r(11, 10, 26, 32, P.grey, 3) + r(11, 19, 26, 14, P.yellow) + c(24, 26, 4, P.green, ' stroke="none"') + e(24, 10, 13, 4, P.grey)),
    pod: pic('a pea pod', p('M4 27C10 13 38 13 44 27 38 41 10 41 4 27z', P.leaf) + c(14, 27, 5, P.pipGreen) + c(24, 27, 5, P.pipGreen) + c(34, 27, 5, P.pipGreen) + l('M4 27c-2-3-1-6 1-8', ' stroke-width="2.5"')),
    egg: pic('an egg', p('M22 11c9-2 17 3 19 11 2 7-1 13-7 16-5 3-13 4-19 1-7-4-10-12-7-19 2-5 8-8 14-9z', P.white) + c(23, 26, 8, P.yellow) + c(20, 23, 2, P.white, ' stroke="none"')),
    basket: pic('a basket', l('M14 21C14 5 34 5 34 21', ' stroke-width="6"') + l('M14 21C14 5 34 5 34 21', ` stroke="${P.brown}" stroke-width="3"`) + p('M6 23h36l-3 17c0 2-1 3-3 3H12c-2 0-3-1-3-3z', P.wood) + l('M8 30h32M9 36h30M16 26l1 16M24 26v16M32 26l-1 16', ' stroke-width="1.5"') + r(5, 19, 38, 7, P.brown, 3.5)),
    bomb: pic('a bomb', l('M24 14c0-5 4-6 6-3s5 1 6-3') + p(star(39, 8, 6.5, 3), P.yellow) + c(24, 32, 13, P.ink) + r(20, 14, 8, 6, P.grey, 1.5) + e(19, 27, 2.5, 3.5, P.grey, ' stroke="none"')),
// --- group: flags ---
    'flag-united-states': flag('the United States',r(0, 0, 72, 48, P.red) + r(0, 6.9, 72, 6.9, P.white, 0, ' stroke="none"') + r(0, 20.6, 72, 6.9, P.white, 0, ' stroke="none"') + r(0, 34.3, 72, 6.9, P.white, 0, ' stroke="none"') + r(0, 0, 28.8, 27.4, P.navy, 0, ' stroke="none"') + c(6, 6.5, 1.8, P.white, ' stroke="none"') + c(14.4, 6.5, 1.8, P.white, ' stroke="none"') + c(22.8, 6.5, 1.8, P.white, ' stroke="none"') + c(10.2, 13.7, 1.8, P.white, ' stroke="none"') + c(18.6, 13.7, 1.8, P.white, ' stroke="none"') + c(6, 20.9, 1.8, P.white, ' stroke="none"') + c(14.4, 20.9, 1.8, P.white, ' stroke="none"') + c(22.8, 20.9, 1.8, P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-canada': flag('Canada', r(0, 0, 72, 48, P.white) + r(0, 0, 18, 48, P.red, 0, ' stroke="none"') + r(54, 0, 18, 48, P.red, 0, ' stroke="none"') + l('M36 32v8', ` stroke="${P.red}" stroke-width="3"`) + p('M36 7L39.5 15.5L50 12L46 21.5L52 29L39 27L36 33L33 27L20 29L26 21.5L22 12L32.5 15.5Z', P.red) + r(0, 0, 72, 48, 'none')),
    'flag-mexico': flag('Mexico', r(0, 0, 72, 48, P.green) + r(24, 0, 24, 48, P.white, 0, ' stroke="none"') + r(48, 0, 24, 48, P.red, 0, ' stroke="none"') + p('M30 35c0-6 3-9 6-9s6 3 6 9z', P.green) + p('M32.5 23q-6-3-5-10q5 2 7 8z', P.brown) + e(36.5, 24, 4.5, 6, P.brown) + c(39, 16.5, 2.8, P.brown) + p('M41.5 16l3.5 1.2-3.5 1.6z', P.yellow, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-cuba': flag('Cuba', r(0, 0, 72, 48, P.blue) + r(0, 9.6, 72, 9.6, P.white, 0, ' stroke="none"') + r(0, 28.8, 72, 9.6, P.white, 0, ' stroke="none"') + p('M0 0L41.5 24L0 48Z', P.red) + p(star(14, 24, 6.5, 2.8), P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-jamaica': flag('Jamaica', r(0, 0, 72, 48, P.ink) + p('M0 0H72L36 24Z', P.green, ' stroke="none"') + p('M0 48H72L36 24Z', P.green, ' stroke="none"') + l('M0 0L72 48M72 0L0 48', ` stroke="${P.yellow}" stroke-width="7"`) + r(0, 0, 72, 48, 'none')),
    'flag-brazil': flag('Brazil', r(0, 0, 72, 48, P.green) + p('M36 6L66 24L36 42L6 24Z', P.yellow) + c(36, 24, 11, P.navy, ' stroke="none"') + l('M26.1 27.6Q33.5 18.1 45.5 19.6', ` stroke="${P.white}" stroke-width="3"`) + c(36, 24, 11, 'none')),
    'flag-argentina': flag('Argentina', r(0, 0, 72, 48, P.water) + r(0, 16, 72, 16, P.white, 0, ' stroke="none"') + l('M36 14.5v3.5M36 30v3.5M26.5 24h3.5M42 24h3.5M29.3 17.3l2.5 2.5M40.2 28.2l2.5 2.5M29.3 30.7l2.5-2.5M40.2 19.8l2.5-2.5', ` stroke="${P.orange}" stroke-width="2.2"`) + c(36, 24, 4.5, P.yellow) + r(0, 0, 72, 48, 'none')),
    'flag-peru': flag('Peru', r(0, 0, 72, 48, P.red) + r(24, 0, 24, 48, P.white, 0, ' stroke="none"') + p('M30.5 16h11v9q0 6.5-5.5 7.5q-5.5-1-5.5-7.5z', P.white) + r(31.5, 17, 4.5, 6, P.blue, 0, ' stroke="none"') + c(38.5, 20, 2, P.green, ' stroke="none"') + p('M31.5 24h9v1.5q0 5-4.5 6q-4.5-1-4.5-6z', P.red, ' stroke="none"') + c(36, 27.5, 1.5, P.yellow, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-chile': flag('Chile', r(0, 0, 72, 48, P.white) + r(0, 24, 72, 24, P.red, 0, ' stroke="none"') + r(0, 0, 24, 24, P.blue, 0, ' stroke="none"') + p(star(12, 12, 7, 3), P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-colombia': flag('Colombia', r(0, 0, 72, 48, P.yellow) + r(0, 24, 72, 12, P.blue, 0, ' stroke="none"') + r(0, 36, 72, 12, P.red, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-united-kingdom': flag('the United Kingdom',r(0, 0, 72, 48, P.navy) + l('M0 0L72 48M72 0L0 48', ` stroke="${P.white}" stroke-width="7"`) + l('M0 0L72 48M72 0L0 48', ` stroke="${P.red}" stroke-width="3"`) + r(28, 0, 16, 48, P.white, 0, ' stroke="none"') + r(0, 16, 72, 16, P.white, 0, ' stroke="none"') + r(31.2, 0, 9.6, 48, P.red, 0, ' stroke="none"') + r(0, 19.2, 72, 9.6, P.red, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-france': flag('France', r(0, 0, 72, 48, P.blue) + r(24, 0, 24, 48, P.white, 0, ' stroke="none"') + r(48, 0, 24, 48, P.red, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-germany': flag('Germany', r(0, 0, 72, 48, P.ink) + r(0, 16, 72, 16, P.red, 0, ' stroke="none"') + r(0, 32, 72, 16, P.yellow, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-italy': flag('Italy', r(0, 0, 72, 48, P.green) + r(24, 0, 24, 48, P.white, 0, ' stroke="none"') + r(48, 0, 24, 48, P.red, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-spain': flag('Spain', r(0, 0, 72, 48, P.red) + r(0, 12, 72, 24, P.yellow, 0, ' stroke="none"') + p('M19.5 16v-4l2.5 2 2-3 2 3 2.5-2v4z', P.red, ' stroke="none"') + p('M18.5 16h11v9q0 6.5-5.5 7.5q-5.5-1-5.5-7.5z', P.yellow) + r(19.5, 17, 4.5, 5.5, P.red, 0, ' stroke="none"') + r(25, 17, 4.5, 5.5, P.white, 0, ' stroke="none"') + r(25, 23.5, 4.5, 5, P.red, 0, ' stroke="none"') + l('M20 24.5h3.5M20 26.5h3.5', ` stroke="${P.red}" stroke-width="1.5"`) + r(0, 0, 72, 48, 'none')),
    'flag-china': flag('China', r(0, 0, 72, 48, P.red) + p(star(16, 15, 8.5, 3.6), P.yellow) + p(star(28, 6.5, 2.6, 1.1), P.yellow, ' stroke="none"') + p(star(33, 11.5, 2.6, 1.1), P.yellow, ' stroke="none"') + p(star(33, 18, 2.6, 1.1), P.yellow, ' stroke="none"') + p(star(28, 23, 2.6, 1.1), P.yellow, ' stroke="none"')),
    'flag-japan': flag('Japan', r(0, 0, 72, 48, P.white) + c(36, 24, 14, P.red)),
    'flag-india': flag('India', r(0, 0, 72, 48, P.orange) + r(0, 16, 72, 16, P.white, 0, ' stroke="none"') + r(0, 32, 72, 16, P.green, 0, ' stroke="none"') + c(36, 24, 6, 'none', ` stroke="${P.navy}" stroke-width="2.5"`) + l('M36 18.5v11M30.5 24h11M32.1 20.1l7.8 7.8M32.1 27.9l7.8-7.8', ` stroke="${P.navy}" stroke-width="1.5"`) + r(0, 0, 72, 48, 'none')),
    'flag-south-korea': flag('South Korea', r(0, 0, 72, 48, P.white) + c(36, 24, 11, P.blue, ' stroke="none"') + p('M25 24a11 11 0 0 1 22 0a5.5 5.5 0 0 0-11 0a5.5 5.5 0 0 1-11 0z', P.red, ' stroke="none" transform="rotate(-33.7 36 24)"') + c(36, 24, 11, 'none') + l('M8.1 11.5L11.7 5.5M10.7 13L14.3 7M13.3 14.5L16.9 8.5', ' stroke-width="1.8"') + l('M63.9 36.5L63 38M61.2 41L60.3 42.5M61.3 35L60.4 36.5M58.6 39.5L57.7 41M58.7 33.5L57.8 35M56 38L55.1 39.5', ' stroke-width="1.8"') + l('M60.3 5.5L61.2 7M63 10L63.9 11.5M57.7 7L61.3 13M55.1 8.5L56 10M57.8 13L58.7 14.5', ' stroke-width="1.8"') + l('M11.7 42.5L8.1 36.5M14.3 41L13.4 39.5M11.6 36.5L10.7 35M16.9 39.5L13.3 33.5', ' stroke-width="1.8"')),
    'flag-thailand': flag('Thailand', r(0, 0, 72, 48, P.red) + r(0, 8, 72, 32, P.white, 0, ' stroke="none"') + r(0, 16, 72, 16, P.navy, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-australia': flag('Australia', r(0, 0, 72, 48, P.navy) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.white}" stroke-width="3.5"`) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.red}" stroke-width="1.5"`) + r(14, 0, 8, 24, P.white, 0, ' stroke="none"') + r(0, 8, 36, 8, P.white, 0, ' stroke="none"') + r(15.6, 0, 4.8, 24, P.red, 0, ' stroke="none"') + r(0, 9.6, 36, 4.8, P.red, 0, ' stroke="none"') + p(star(18, 36, 6, 2.6), P.white, ' stroke="none"') + p(star(54, 9, 3.5, 1.5), P.white, ' stroke="none"') + p(star(54, 40, 3.5, 1.5), P.white, ' stroke="none"') + p(star(45, 22, 3.5, 1.5), P.white, ' stroke="none"') + p(star(63, 17, 3.5, 1.5), P.white, ' stroke="none"') + p(star(58, 27, 2.2, 0.95), P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-new-zealand': flag('New Zealand', r(0, 0, 72, 48, P.navy) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.white}" stroke-width="3.5"`) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.red}" stroke-width="1.5"`) + r(14, 0, 8, 24, P.white, 0, ' stroke="none"') + r(0, 8, 36, 8, P.white, 0, ' stroke="none"') + r(15.6, 0, 4.8, 24, P.red, 0, ' stroke="none"') + r(0, 9.6, 36, 4.8, P.red, 0, ' stroke="none"') + p(star(54, 9, 4.5, 2), P.white, ' stroke="none"') + p(star(54, 9, 3.2, 1.4), P.red, ' stroke="none"') + p(star(45, 21, 4.5, 2), P.white, ' stroke="none"') + p(star(45, 21, 3.2, 1.4), P.red, ' stroke="none"') + p(star(63, 17, 4.5, 2), P.white, ' stroke="none"') + p(star(63, 17, 3.2, 1.4), P.red, ' stroke="none"') + p(star(54, 39, 5, 2.2), P.white, ' stroke="none"') + p(star(54, 39, 3.6, 1.6), P.red, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-fiji': flag('Fiji', r(0, 0, 72, 48, P.blue) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.white}" stroke-width="3.5"`) + l('M0 0L34.5 23M34.5 1L1.5 23', ` stroke="${P.red}" stroke-width="1.5"`) + r(14, 0, 8, 24, P.white, 0, ' stroke="none"') + r(0, 8, 36, 8, P.white, 0, ' stroke="none"') + r(15.6, 0, 4.8, 24, P.red, 0, ' stroke="none"') + r(0, 9.6, 36, 4.8, P.red, 0, ' stroke="none"') + p('M47 13h16v15q0 8-8 10q-8-2-8-10z', P.white) + r(48.5, 14.5, 13, 6, P.red, 0, ' stroke="none"') + r(53.5, 20.5, 3, 15, P.red, 0, ' stroke="none"') + r(48.5, 26, 13, 3, P.red, 0, ' stroke="none"') + e(55, 17.5, 4.5, 2, P.yellow, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-papua-new-guinea': flag('Papua New Guinea', r(0, 0, 72, 48, P.ink) + p('M0 0H72V48Z', P.red, ' stroke="none"') + l('M47 22q-5 3-9 11M50 23q-2 5-3 11', ` stroke="${P.yellow}" stroke-width="2.5"`) + p('M46 20c0-6 5-10 11-9 4 1 5 5 3 8-2 2-4 1-5 4-3 0-7-1-9-3z', P.yellow) + l('M60 11l3.5-1.5', ' stroke-width="1.5"') + p(star(18, 20, 3, 1.3), P.white, ' stroke="none"') + p(star(10, 30, 3, 1.3), P.white, ' stroke="none"') + p(star(26, 32, 3, 1.3), P.white, ' stroke="none"') + p(star(18, 42, 3, 1.3), P.white, ' stroke="none"') + p(star(22, 35, 2, 0.9), P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-samoa': flag('Samoa', r(0, 0, 72, 48, P.red) + r(0, 0, 36, 24, P.navy, 0, ' stroke="none"') + p(star(20, 4.5, 2.6, 1.1), P.white, ' stroke="none"') + p(star(20, 20.5, 2.6, 1.1), P.white, ' stroke="none"') + p(star(13, 12.5, 2.6, 1.1), P.white, ' stroke="none"') + p(star(27, 11, 2.6, 1.1), P.white, ' stroke="none"') + p(star(23, 15, 1.8, 0.8), P.white, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-south-africa': flag('South Africa', r(0, 0, 72, 48, P.red) + r(0, 24, 72, 24, P.blue, 0, ' stroke="none"') + p('M0 0L36 16H72V32H36L0 48Z', P.white, ' stroke="none"') + p('M0 3.5L35.3 19.2H72V28.8H35.3L0 44.5Z', P.green, ' stroke="none"') + p('M0 14L22.5 24L0 34Z', P.yellow, ' stroke="none"') + p('M0 17.5L14.6 24L0 30.5Z', P.ink, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-egypt': flag('Egypt', r(0, 0, 72, 48, P.red) + r(0, 16, 72, 16, P.white, 0, ' stroke="none"') + r(0, 32, 72, 16, P.ink, 0, ' stroke="none"') + p('M36 15.5c2 0 3 2 2 4 5-2 10 1 9 5-3 1-5 3-6 5.5l-3-1v2.5h-4v-2.5l-3 1c-1-2.5-3-4.5-6-5.5-1-4 4-7 9-5-1-2 0-4 2-4z', P.yellow) + r(0, 0, 72, 48, 'none')),
    'flag-kenya': flag('Kenya', r(0, 0, 72, 48, P.ink) + r(0, 14.4, 72, 19.2, P.white, 0, ' stroke="none"') + r(0, 16.8, 72, 14.4, P.red, 0, ' stroke="none"') + r(0, 33.6, 72, 14.4, P.green, 0, ' stroke="none"') + l('M29 8L43 40M43 8L29 40', ` stroke="${P.white}" stroke-width="2.5"`) + e(36, 24, 7.5, 13, P.red) + p('M30.5 17.5q5.5-3 11 0l-1 3.5q-4.5-2-9 0z', P.ink, ' stroke="none"') + p('M30.5 30.5q5.5 3 11 0l-1-3.5q-4.5 2-9 0z', P.ink, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-nigeria': flag('Nigeria', r(0, 0, 72, 48, P.green) + r(24, 0, 24, 48, P.white, 0, ' stroke="none"') + r(0, 0, 72, 48, 'none')),
    'flag-morocco': flag('Morocco', r(0, 0, 72, 48, P.red) + l('M36 12.5L43.1 34.2L24.6 20.8H47.4L28.9 34.2Z', ` stroke="${P.green}" stroke-width="3"`)),
    'flag-blank': flag('a flag', r(0, 0, 72, 48, P.white)),
// --- group: nature-shapes ---
    sun: pic('the sun', c(24, 24, 12, P.yellow) + l('M24 3v6M24 39v6M3 24h6M39 24h6M34.6 13.4l4.2-4.2M34.6 34.6l4.2 4.2M13.4 34.6l-4.2 4.2M13.4 13.4l-4.2-4.2', ' stroke-width="3.5"')),
    moon: pic('the moon', p('M37 6A18 18 0 1 0 37 42A22 22 0 0 1 37 6Z', P.yellow)),
    cloud: pic('a cloud', p('M9 37C3 37 3 28 10 28C9 19 20 13 25 19C30 11 43 15 40 27C46 27 46 37 39 37Z', P.white)),
    tree: pic('a tree', r(21, 28, 6, 15, P.brown, 2) + p('M12 30C5 30 4 20 11 19C9 11 17 5 24 7C31 3 40 10 37 19C44 20 43 30 36 30C30 33 18 33 12 30Z', P.green)),
    flower: pic('a flower', l('M24 44V30', ` stroke="${P.leaf}" stroke-width="3"`) + p('M24 39C17 39 14 35 14 31C20 31 23 34 24 39Z', P.green) + e(24, 7.5, 4.4, 6.5, P.pink) + e(24, 7.5, 4.4, 6.5, P.pink, ' transform="rotate(72 24 17)"') + e(24, 7.5, 4.4, 6.5, P.pink, ' transform="rotate(144 24 17)"') + e(24, 7.5, 4.4, 6.5, P.pink, ' transform="rotate(216 24 17)"') + e(24, 7.5, 4.4, 6.5, P.pink, ' transform="rotate(288 24 17)"') + c(24, 17, 6.5, P.yellow)),
    sunflower: pic('a sunflower', l('M24 44V34', ` stroke="${P.leaf}" stroke-width="3"`) + p('M24 42C30 42 33 39 34 34C28 34 25 37 24 42Z', P.green) + e(24, 8.5, 3.6, 6, P.yellow) + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(45 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(90 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(135 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(180 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(225 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(270 24 20)"') + e(24, 8.5, 3.6, 6, P.yellow, ' transform="rotate(315 24 20)"') + c(24, 20, 7.5, P.brown)),
    mushroom: pic('a mushroom', r(17, 27, 14, 17, P.sand, 5) + p('M6 28C6 15 14 7 24 7S42 15 42 28C36 30 30 31 24 31S12 30 6 28Z', P.red) + c(15, 19, 3.2, P.white, ' stroke="none"') + c(27, 13, 3.4, P.white, ' stroke="none"') + c(34, 24, 2.6, P.white, ' stroke="none"')),
    grass: pic('a tuft of grass', e(24, 43.5, 19, 3, P.field) + p('M5 44C3 36 3 28 5 18C9 24 11 30 11 34C12 26 13 18 15 11C17 18 19 26 19 32C20 22 21 12 24 5C27 12 28 22 29 32C29 26 31 18 33 11C35 18 36 26 37 34C37 30 39 24 43 18C45 28 45 36 43 44Z', P.green)),
    leaf: pic('a leaf', l('M7 41l-3 3') + p('M7 41C7 22 22 8 42 7C43 26 28 42 7 41Z', P.green) + l('M9 39L38 11', ' stroke-width="2"')),
    seedling: pic('a seedling', p('M4 44C4 36 12 32 24 32S44 36 44 44Z', P.brown) + l('M24 33V23', ` stroke="${P.leaf}" stroke-width="3"`) + p('M24 22C16 22 11 17 10 11C17 11 23 15 24 22Z', P.green) + p('M24 22C32 22 37 17 38 11C31 11 25 15 24 22Z', P.green)),
    cactus: pic('a cactus', e(24, 43, 17, 3.5, P.sand) + p('M18 42V30H11A5 5 0 0 1 6 25V12A3 3 0 0 1 12 12V24H18V14A6 6 0 0 1 30 14V20H36V10A3 3 0 0 1 42 10V21A5 5 0 0 1 37 26H30V42Z', P.leaf) + c(24, 8, 3.5, P.pink)),
    rock: pic('a rock', p('M12 40L9 28L17 16L30 10L43 17L45 30L39 40Z', P.grey) + e(8, 41, 6, 4, P.grey)),
    'ice-cube': pic('an ice cube', p('M8 18L18 8H40L30 18Z', P.sky) + p('M30 18L40 8V32L30 42Z', P.blue) + p('M8 18H30V42H8Z', P.water) + r(12, 22, 4, 10, P.white, 2, ' stroke="none"')),
    lightning: pic('a lightning bolt', p('M28 3L10 27H22L19 45L38 19H26Z', P.yellow)),
    fog: pic('fog', p('M6 8C12 -2.5 16 18.5 24 8C30 -2.5 34 18.5 42 8V13C34 23.5 30 2.5 24 13C16 23.5 12 2.5 6 13Z', P.grey) + p('M3 21C9 10.5 13 31.5 21 21C27 10.5 31 31.5 39 21V26C31 36.5 27 15.5 21 26C13 36.5 9 15.5 3 26Z', P.grey) + p('M9 34C15 23.5 19 44.5 27 34C33 23.5 37 44.5 45 34V39C37 49.5 33 28.5 27 39C19 49.5 15 28.5 9 39Z', P.grey)),
    'water-drops': pic('water drops', p('M7 24C7 24 2 31 2 35A5 5 0 0 0 12 35C12 31 7 24 7 24Z', P.blue) + p('M41 24C41 24 36 31 36 35A5 5 0 0 0 46 35C46 31 41 24 41 24Z', P.blue) + p('M24 5C24 5 13 19 13 27A11 11 0 0 0 35 27C35 19 24 5 24 5Z', P.blue) + e(19.5, 26, 2, 3.5, P.white, ' stroke="none"')),
    rainbow: pic('a rainbow', p('M2 37A22 22 0 0 1 46 37H31A7 7 0 0 0 17 37Z', P.red) + l('M6.5 37A17.5 17.5 0 0 1 41.5 37', ` stroke="${P.orange}" stroke-width="3"`) + l('M9.5 37A14.5 14.5 0 0 1 38.5 37', ` stroke="${P.yellow}" stroke-width="3"`) + l('M12.5 37A11.5 11.5 0 0 1 35.5 37', ` stroke="${P.green}" stroke-width="3"`) + l('M15.5 37A8.5 8.5 0 0 1 32.5 37', ` stroke="${P.blue}" stroke-width="3"`) + l('M2 37A22 22 0 0 1 46 37H31A7 7 0 0 0 17 37Z')),
    star: pic('a star', p(star(24, 25, 21, 9), P.yellow)),
    heart: pic('a heart', p('M24 42C12 33 4 26 4 17C4 10 9 6 15 6C19 6 22 8 24 12C26 8 29 6 33 6C39 6 44 10 44 17C44 26 36 33 24 42Z', P.red) + e(14, 15, 2.2, 3.5, P.white, ' stroke="none"')),
    'heart-empty': pic('an empty heart', p('M24 42C12 33 4 26 4 17C4 10 9 6 15 6C19 6 22 8 24 12C26 8 29 6 33 6C39 6 44 10 44 17C44 26 36 33 24 42Z', P.white)),
    'mark-x': pic('an X', p('M19 5H29V19H43V29H29V43H19V29H5V19H19Z', P.red, ' transform="rotate(45 24 24)"') + e(24, 10, 1.8, 3.5, P.white, ' stroke="none" transform="rotate(45 24 24)"')),
    'mark-o': pic('an O', p('M24 7A17 17 0 1 1 24 41A17 17 0 1 1 24 7ZM24 15A9 9 0 1 0 24 33A9 9 0 1 0 24 15Z', P.teal) + e(15, 15, 1.8, 3.2, P.white, ' stroke="none" transform="rotate(45 15 15)"')),
    'pop-burst': pic('a pop', p('M24 3L28.6 12.9L38.9 9.2L35.1 19.4L45 24L35.1 28.6L38.9 38.9L28.6 35.1L24 45L19.4 35.1L9.2 38.9L12.9 28.6L3 24L12.9 19.4L9.2 9.2L19.4 12.9Z', P.orange) + p('M24 12.5L26.5 17.9L32.1 15.9L30.1 21.5L35.5 24L30.1 26.5L32.1 32.1L26.5 30.1L24 35.5L21.5 30.1L15.9 32.1L17.9 26.5L12.5 24L17.9 21.5L15.9 15.9L21.5 17.9Z', P.yellow, ' stroke="none"')),
    dot: pic('a red dot', c(24, 24, 16, P.red)),
    'red-swatch': pic('a red square', r(6, 6, 36, 36, P.red, 8)),
// --- group: objects-a ---
    bag: pic('a handbag', l('M16 20C16 7 32 7 32 20', ' stroke-width="3"') + p('M6 20h36l2 17c0 3-2 5-5 5H9c-3 0-5-2-5-5z', P.pink) + p('M6 20h36l-1 8H7z', P.purple) + c(24, 29, 2.5, P.yellow)),
    ball: pic('a football', c(24, 24, 18, P.white) + l('M24 18V9M29.7 22.2l9.5-3.1M27.5 28.9l5.9 8M20.5 28.9l-5.9 8M18.3 22.2l-9.5-3.1', ' stroke-width="2"') + p('M24 18l5.7 4.2-2.2 6.7h-7l-2.2-6.7z', P.ink)),
    balloon: pic('a balloon', e(24, 19, 12, 14, P.red) + p('M21 32h6l-3 4z', P.red) + l('M24 36c-4 3 4 6 0 10', ' stroke-width="2"') + e(19, 13, 2.5, 4, P.white, ' stroke="none"')),
    bed: pic('a bed', r(5, 8, 8, 34, P.brown, 3) + r(12, 32, 31, 4, P.wood, 1) + r(38, 36, 5, 6, P.wood, 1) + r(12, 25, 31, 7, P.cream, 2) + p('M22 32v-7c0-3 2-5 5-5h12c3 0 4 2 4 5v7z', P.blue) + r(14, 18, 9, 7, P.white, 3)),
    bicycle: pic('a bicycle', c(12, 32, 9, P.white) + c(36, 32, 9, P.white) + l('M12 32L19 18L25 32L31 18L36 32M19 18h12', ' stroke-width="5"') + l('M12 32L19 18L25 32L31 18L36 32M19 18h12', ` stroke="${P.red}" stroke-width="2.5"`) + l('M15 17h8M30 16l6-3', ' stroke-width="4"') + dot(12, 32, 2.5) + dot(36, 32, 2.5) + dot(25, 32, 2.5)),
    bin: pic('a rubbish bin', p('M10 16h28l-2 24c0 2-2 4-4 4H16c-2 0-4-2-4-4z', P.grey) + l('M18 21l1 18M24 21v18M30 21l-1 18', ' stroke-width="1.5"') + r(7, 11, 34, 6, P.grey, 3) + r(19, 5, 10, 6, P.grey, 3)),
    bolt: pic('a nut and bolt', r(13, 4, 22, 9, P.grey, 2) + r(19, 13, 10, 31, P.grey, 2) + l('M19 36h10M19 40h10', ' stroke-width="1.5"') + p('M14 19h20l5 6-5 6H14l-5-6z', P.yellow)),
    book: pic('a book', r(13, 9, 27, 34, P.white, 2) + r(8, 5, 28, 36, P.blue, 2) + r(8, 5, 6, 36, P.navy, 2) + r(19, 12, 11, 6, P.white, 1)),
    box: pic('a cardboard box', r(7, 18, 34, 24, P.wood, 2) + l('M24 20v21', ` stroke="${P.sand}" stroke-width="3"`) + r(4, 11, 40, 8, P.sand, 2) + l('M24 11v8')),
    brick: pic('a brick', p('M6 20l8-8h30l-8 8z', P.orange) + p('M36 20l8-8v16l-8 8z', P.brown) + r(6, 20, 30, 16, P.red, 1)),
    bus: pic('a bus', r(4, 10, 40, 25, P.blue, 4) + r(8, 14, 8, 8, P.sky, 1) + r(20, 14, 8, 8, P.sky, 1) + r(32, 14, 8, 8, P.sky, 1) + c(13, 36, 5, P.ink) + c(35, 36, 5, P.ink) + c(13, 36, 2, P.grey, ' stroke="none"') + c(35, 36, 2, P.grey, ' stroke="none"')),
    cab: pic('a taxi', l('M24 14v3') + r(17, 8, 14, 6, P.white, 2) + p('M4 36v-6c0-3 2-5 5-5h4l5-8h12l5 8h4c3 0 5 2 5 5v6z', P.yellow) + p('M15 25l4-6h10l4 6z', P.sky) + c(13, 37, 5, P.ink) + c(35, 37, 5, P.ink) + c(13, 37, 2, P.grey, ' stroke="none"') + c(35, 37, 2, P.grey, ' stroke="none"')),
    canoe: pic('a canoe', e(37, 8, 3.5, 7, P.wood) + l('M36 15L25 30', ' stroke-width="5"') + l('M36 15L25 30', ` stroke="${P.wood}" stroke-width="2.5"`) + p('M2 17Q24 34 46 17Q24 52 2 17z', P.green) + l('M4 39c3-3 7-3 10 0s7 3 10 0 7-3 10 0 7 3 10 0', ` stroke="${P.water}" stroke-width="2.5"`)),
    cap: pic('a baseball cap', p('M18 28h20c5 0 8 2 8 5-10 2-20 2-28 0z', P.navy) + p('M9 28C9 17 16 10 24 10s15 7 15 18z', P.blue) + l('M24 11v17', ' stroke-width="1.5"') + c(24, 10, 2.2, P.blue)),
    car: pic('a car', p('M4 37v-6c0-8 8-16 20-16s20 8 20 16v6z', P.red) + p('M13 25c3-5 6-7 11-7s8 2 11 7z', P.sky) + l('M24 18v7', ' stroke-width="2"') + c(13, 37, 5, P.ink) + c(35, 37, 5, P.ink) + c(13, 37, 2, P.grey, ' stroke="none"') + c(35, 37, 2, P.grey, ' stroke="none"')),
    chair: pic('a chair', r(12, 5, 24, 17, P.wood, 3) + l('M20 9v9M28 9v9', ' stroke-width="1.5"') + r(11, 29, 4, 14, P.wood, 1) + r(33, 29, 4, 14, P.wood, 1) + r(9, 22, 30, 7, P.red, 2)),
    coin: pic('a coin', c(24, 24, 18, P.yellow) + c(24, 24, 13, P.yellow) + p(star(24, 24, 7, 3.2), P.orange)),
    crown: pic('a crown', p('M7 40V13l9 9 8-13 8 13 9-9v27z', P.yellow) + l('M7 34h34', ' stroke-width="1.5"') + c(24, 29, 3, P.red) + c(14, 30, 2.2, P.blue, ' stroke="none"') + c(34, 30, 2.2, P.blue, ' stroke="none"')),
    drum: pic('a drum', l('M12 4L24 14M36 4L24 14', ' stroke-width="6"') + l('M12 4L24 14M36 4L24 14', ` stroke="${P.wood}" stroke-width="3"`) + c(12, 4, 2.5, P.cream) + c(36, 4, 2.5, P.cream) + p('M7 16v18c0 3.5 7.6 6 17 6s17-2.5 17-6V16z', P.red) + l('M10 21l4.7 9 4.6-9 4.7 9 4.7-9 4.6 9 4.7-9', ' stroke-width="1.5"') + e(24, 16, 17, 6, P.cream)),
    fan: pic('a hand fan', p('M24 42L6 18A30 30 0 0 1 14.5 13.5z', P.pink) + p('M24 42L14.5 13.5A30 30 0 0 1 24 12z', P.purple) + p('M24 42V12A30 30 0 0 1 33.5 13.5z', P.pink) + p('M24 42L33.5 13.5A30 30 0 0 1 42 18z', P.purple) + c(24, 42, 3, P.yellow)),
    feather: pic('a feather', p('M14 38C10 27 19 10 37 5c3 12-6 28-23 33z', P.blue) + l('M9 45l5-7C19 30 27 18 37 5', ' stroke-width="2"') + l('M18.3 31.3l-5-4M23.6 23.4l-5-4M29.9 14.5l-5-4M18.3 31.3l5-1M23.6 23.4l5-1M29.9 14.5l5-1', ' stroke-width="1.5"')),
    flag: pic('a red flag', l('M10 45V5', ' stroke-width="6"') + l('M10 45V5', ` stroke="${P.wood}" stroke-width="3"`) + p('M13 7c9 3 18-3 26 0-2 6-2 12 0 18-8-3-17 3-26 0z', P.red) + c(10, 5, 2.5, P.yellow)),
    fork: pic('a fork', l('M16 4v11M24 4v11M32 4v11', ' stroke-width="6"') + l('M16 4v11M24 4v11M32 4v11', ` stroke="${P.grey}" stroke-width="3"`) + p('M13 14h22v4c0 5-4 9-11 9s-11-4-11-9z', P.grey) + l('M24 27v17', ' stroke-width="7"') + l('M24 27v17', ` stroke="${P.grey}" stroke-width="4"`)),
    'gas-pump': pic('a petrol pump', r(5, 39, 30, 5, P.grey, 2) + r(8, 7, 24, 32, P.red, 3) + r(12, 12, 16, 10, P.sky, 1) + l('M32 18h6c3 0 4 1 4 4v8', ' stroke-width="3"') + r(38, 29, 7, 7, P.grey, 1.5)),
    gem: pic('a gemstone', p('M8 18l8-10h16l8 10-16 23z', P.teal) + l('M8 18h32M16 8l8 10 8-10', ' stroke-width="2"')),
    hat: pic('a top hat', e(24, 33, 20, 5, P.navy) + r(13, 5, 22, 27, P.navy, 3) + r(13, 25, 22, 6, P.red, 1)),
    house: pic('a house', r(9, 22, 30, 20, P.cream, 1) + p('M5 24L24 7l19 17z', P.red) + r(27, 30, 8, 12, P.brown, 2) + r(13, 27, 7, 7, P.sky, 1)),
    hut: pic('a straw hut', r(10, 28, 28, 14, P.sand, 1) + p('M19 42v-7c0-3 2-5 5-5s5 2 5 5v7z', P.earth) + p('M3 28C12 24 18 14 24 6c6 8 12 18 21 22z', P.wood) + l('M24 12v12M15 19l-3 7M33 19l3 7', ` stroke="${P.brown}" stroke-width="1.5"`)),
    igloo: pic('an igloo', p('M4 36a20 20 0 0 1 40 0z', P.white) + l('M7 29h34M13 22h22M16 29v7M32 29v7M24 22v7', ' stroke-width="1.5"') + p('M17 36v-5a7 7 0 0 1 14 0v5z', P.navy)),
    jet: pic('a plane', p('M24 3c2 0 4 3 4 7v9l15 9v5l-15-4v7l5 3v3l-9-2-9 2v-3l5-3v-7L5 33v-5l15-9v-9c0-4 2-7 4-7z', P.white) + p('M20 36h8l5 3v3l-9-2-9 2v-3z', P.blue) + c(24, 10, 2, P.sky, ' stroke="none"')),
    key: pic('a key', p('M21 21h23v6h-4v5h-4v-5h-4v5h-4v-5h-7z', P.yellow) + c(12, 24, 9, P.yellow) + c(12, 24, 3, P.white)),
    // --- end of pictures ---
  };

  const ids = () => Object.keys(PICTURES);
  const has = (id) => Object.prototype.hasOwnProperty.call(PICTURES, id);
  const entry = (id) => {
    if (!has(id)) throw new Error('Pictures: no picture called ' + id);
    return PICTURES[id];
  };
  const symbol = (id) => `<symbol id="p-${id}" viewBox="${entry(id).box}">${OUT}${entry(id).markup}${END}</symbol>`;
  const sprite = (only) => (only || ids()).map(symbol).join('');
  /* The markup a page puts where a picture goes. `o.size` is the CSS pixel
   * size (flags take their width from it); `o.label` makes it an image a
   * screen reader names, otherwise it is decorative; `o.cls` adds classes. */
  const use = (id, o) => {
    const opt = o || {};
    const box = entry(id).box;
    const size = opt.size || 48;
    const wide = box === FLAG_BOX;
    const w = size, h = wide ? Math.round((size * 48) / 72) : size;
    const a11y = opt.label ? ` role="img" aria-label="${opt.label === true ? entry(id).label : opt.label}"` : ' aria-hidden="true"';
    return `<svg class="pic${opt.cls ? ' ' + opt.cls : ''}" width="${w}" height="${h}" viewBox="${box}"${a11y} focusable="false"><use href="#p-${id}"/></svg>`;
  };
  /* Browser only: put the sprite in the page once, so <use> finds the symbols. */
  const install = (only) => {
    if (typeof document === 'undefined' || document.getElementById('pictures-sprite')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg class="sprite" id="pictures-sprite" aria-hidden="true" focusable="false">${sprite(only)}</svg>`;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
  };

  const api = { PALETTE: P, PICTURES, BOX, FLAG_BOX, ids, has, symbol, sprite, use, install };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Pictures = api;
})(typeof window !== 'undefined' ? window : globalThis);
