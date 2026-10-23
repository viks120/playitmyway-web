/* The site's one SVG style checker, shared by icons.test.js (whole files
 * under icons/) and pictures.test.js (the <symbol>s in
 * games/shared/art/pictures.js). The rules are the Candy, illustrated ones:
 * ink outlines of width 2.5 on every filled shape, round joins and caps,
 * flat fills from the palette, no text, gradients, filters or styles.
 * Not an XML parser: the files are our own and simple. */
'use strict';

const INK = '#33302e';

/* Just enough SVG structure to know, for every shape, the fill, stroke,
 * width, join and cap it ends up with after inheriting from its <g>
 * ancestors. */
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap'];

function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/\s([a-zA-Z:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function walk(body) {
  const shapes = [];
  const stack = [];
  let stray = 0;
  for (const m of body.matchAll(/<\/?([a-zA-Z]+)\b[^>]*>/g)) {
    const tag = m[0];
    const name = m[1];
    if (tag.startsWith('</')) {
      if (name === 'g') {
        if (stack.length) stack.pop();
        else stray++;
      }
      continue;
    }
    const own = attrsOf(tag);
    const eff = Object.assign({}, ...stack);
    for (const k of INHERITED) if (own[k] !== undefined) eff[k] = own[k];
    if (name === 'g') {
      if (!tag.endsWith('/>')) stack.push(Object.fromEntries(INHERITED.filter((k) => own[k] !== undefined).map((k) => [k, own[k]])));
      continue;
    }
    if (SHAPES.has(name)) shapes.push({ tag, eff });
  }
  return { shapes, unclosed: stack.length, stray };
}

const FORBIDDEN = ['<text', 'gradient', '<filter', '<script', '<image', '<style', '<title', '<desc', '<metadata', '<foreignobject', 'href=', 'url(', 'style=', '@font-face', 'opacity='];

/* The rules for the markup inside an <svg> or a <symbol>: `body` holds no
 * comments. `f` names the palette (a Set of lower-case hex colours) and
 * whether at least one ink-outlined filled shape is required. Returns the
 * messages without a name prefix. */
function bodyViolations(body, f) {
  const v = [];
  const lower = body.toLowerCase();
  for (const bad of FORBIDDEN) if (lower.includes(bad)) v.push(`must not contain ${bad}`);
  if (/\son[a-z]+=/i.test(body)) v.push('must not contain event handler attributes');
  if (/=(?!")|\s=/.test(body)) v.push('attribute values must be double-quoted, with no space around =');
  for (const m of body.matchAll(/\b(fill|stroke)="([^"]+)"/g)) {
    const c = m[2].toLowerCase();
    if (c !== 'none' && !f.palette.has(c)) v.push(`${m[1]} ${m[2]} is not in the palette`);
  }
  const { shapes, unclosed, stray } = walk(body);
  if (unclosed) v.push(`${unclosed} unclosed <g>`);
  if (stray) v.push(`${stray} stray </g>`);
  let inkOutline = false;
  for (const s of shapes) {
    const { fill, stroke } = s.eff;
    if (fill === undefined) v.push(`${s.tag} names no fill, on itself or a <g> around it, so it would render black`);
    if (stroke === undefined || stroke === 'none') continue;
    if (s.eff['stroke-linejoin'] !== 'round' || s.eff['stroke-linecap'] !== 'round') v.push(`${s.tag} is stroked without round joins and caps`);
    const raw = s.eff['stroke-width'] === undefined ? '1' : s.eff['stroke-width'];
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      v.push(`${s.tag} has a stroke-width that is not a plain number`);
      continue;
    }
    const w = Number(raw);
    const outlined = fill !== undefined && fill !== 'none';
    if (outlined) {
      if (stroke.toLowerCase() !== INK) v.push(`${s.tag} is a filled shape outlined in ${stroke}, not ink ${INK}`);
      else {
        inkOutline = true;
        if (w !== 2.5) v.push(`${s.tag} is an ink outline of width ${w}, not 2.5`);
      }
    } else if (w < 1.5 || w > 7) {
      v.push(`${s.tag} is a line of width ${w}, outside 1.5 to 7`);
    }
  }
  if (f.needsInk && !inkOutline) v.push('needs at least one filled shape with an ink outline');
  return v;
}

/* Every rule a whole file under icons/ breaks, so one run reports
 * everything. `f` adds the required viewBox; `game` is the catalogue entry
 * for a game icon, or null. */
function violations(name, svg, f, game) {
  const v = [];
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.box}">`;
  if (!svg.startsWith(root)) {
    const first = (svg.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0');
    v.push(`must start with ${root} but starts with ${JSON.stringify(svg.slice(0, root.length + 1))} (first code point U+${first})`);
  }
  if (!svg.trimEnd().endsWith('</svg>')) v.push('must end with </svg>');
  const comments = svg.match(/<!--[\s\S]*?-->/g) || [];
  if (comments.length !== 1) v.push(`needs exactly one comment, has ${comments.length}`);
  else if (!/^<!-- [^:\n]+: [^\n]+ -->$/.test(comments[0])) v.push(`comment must read <!-- Name: what it shows -->, not ${comments[0]}`);
  else if (comments[0].slice(4, -3).includes('--')) v.push('comment text must not contain --');
  else if (game && !comments[0].startsWith(`<!-- ${game.name}: `)) v.push(`comment must start with the catalogue name ${JSON.stringify(game.name)}`);
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  v.push(...bodyViolations(body, f));
  return v.map((msg) => `${name}: ${msg}`);
}

module.exports = { INK, SHAPES, INHERITED, FORBIDDEN, attrsOf, walk, bodyViolations, violations };
