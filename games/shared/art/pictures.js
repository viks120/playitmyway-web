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
