/* The site's original artwork under icons/: every game has a picture, every
 * picture obeys one style, and every page that should show one does.
 *     node --test docs/tests/*.test.js
 * Reads the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'docs', 'catalogue.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(ROOT, ...p));
const allFiles = (dir) => (exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).sort() : []);
/* Does a string hold an emoji or other pictograph, or one of the invisible
 * joiners and keycaps that ride on them (U+FE0F, U+20E3, U+200D)? Built from
 * code points so this file holds no invisible characters itself. */
const JOINERS = String.fromCodePoint(0xfe0f, 0x20e3, 0x200d);
const hasPicto = (s) => /\p{Extended_Pictographic}/u.test(s) || [...JOINERS].some((c) => s.includes(c));

const INK = '#33302e';
const EXTRA = ['#ef4444', '#fbbf24', '#4ade80', '#60a5fa', '#ff8fab', '#8b5e3c', '#94a3b8', '#ffffff'];
const hexes = (s) => Array.from(new Set((s.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase())));
const PALETTE = new Set(hexes(read('tokens.css')).concat(EXTRA, INK));
const CRITTER_PALETTE = new Set([...PALETTE, ...hexes(read('games', 'shared', '3d', 'critters.js'))]);

const FOLDERS = [
  { dir: 'icons/games', box: '0 0 48 48', palette: PALETTE, needsInk: true },
  { dir: 'icons/critters', box: '0 0 64 60', palette: CRITTER_PALETTE, needsInk: true },
  { dir: 'icons', box: '0 0 64 64', palette: PALETTE, needsInk: false, only: ['mark.svg'] },
];

/* Just enough SVG structure to know, for every shape, the fill, stroke,
 * width, join and cap it ends up with after inheriting from its <g>
 * ancestors. The files are our own and simple; this is not an XML parser. */
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

/* Every rule a file breaks, so one run reports everything. `game` is the
 * catalogue entry for a game icon, or null. */
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
  const lower = body.toLowerCase();
  for (const bad of ['<text', 'gradient', '<filter', '<script', '<image', '<style', '<title', '<desc', '<metadata', '<foreignobject', 'href=', 'url(', 'style=', '@font-face']) {
    if (lower.includes(bad)) v.push(`must not contain ${bad}`);
  }
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
  return v.map((msg) => `${name}: ${msg}`);
}

/* The checker is code too. These pin what it must catch and what it must
 * let through, so a loosened rule fails here before any icon is judged. */
test('the style checker catches what it must', () => {
  const f = FOLDERS[0];
  /* `inner` goes inside the standard wrapper; `after` goes after it */
  const wrap = (inner, comment, after) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${comment || '<!-- Probe: a test icon -->'}\n` +
    `<g fill="none" stroke="#33302e" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${inner}</g>${after || ''}\n</svg>\n`;
  const box = '<rect x="4" y="4" width="40" height="40" fill="#ffffff"/>';
  assert.deepEqual(violations('ok.svg', wrap(box + '<g><g/><path d="M4 4h40" stroke="#ef4444" stroke-width="3"/></g>', null, '<circle cx="24" cy="24" r="4" fill="#ff6b57"/>'), f, null), []);
  const cases = [
    ['', 'names no fill', '<rect x="4" y="4" width="40" height="40"/>'],
    [box.replace('/>', ' stroke-width="2"/>'), 'ink outline of width 2'],
    [box.replace('/>', ' stroke="#ef4444"/>'), 'outlined in #ef4444'],
    [box.replace('/>', ' stroke="#33302E" stroke-width="4"/>'), 'ink outline of width 4'],
    [box + '<path d="M4 4h40" stroke-width="8"/>', 'line of width 8'],
    [box + '<path d="M4 4h40" stroke-width="2px"/>', 'not a plain number'],
    [box + '<path d="M4 4h40" stroke-width="0x2"/>', 'not a plain number'],
    [box.replace('/>', ' stroke-linecap="butt"/>'), 'round joins and caps'],
    [box.replace('#ffffff', '#123456'), 'not in the palette'],
    [box.replace('/>', ' style="fill:#000"/>'), 'style='],
    [box.replace('x="4"', "x='4'"), 'double-quoted'],
    [box.replace('x="4"', 'x = "4"'), 'double-quoted'],
    [box.replace('/>', ' onclick="x()"/>'), 'event handler'],
    [box + '<text x="1" y="1">a</text>', '<text'],
    [box + '<g>', 'unclosed <g>'],
    [box + '</g>', 'stray </g>'],
    ['<path d="M4 4h40"/>', 'ink outline'],
  ];
  for (const [inner, fragment, after] of cases) {
    const found = violations('probe.svg', wrap(inner, null, after), f, null);
    assert.ok(found.some((m) => m.includes(fragment)), `expected a violation mentioning ${JSON.stringify(fragment)}, got ${JSON.stringify(found)}`);
  }
  const two = violations('c.svg', wrap(box, '<!-- a: b --><!-- c: d -->'), f, null);
  assert.ok(two.some((m) => m.includes('exactly one comment')), JSON.stringify(two));
  const named = violations('n.svg', wrap(box), f, { name: 'Other Game' });
  assert.ok(named.some((m) => m.includes('catalogue name')), JSON.stringify(named));
  const bom = violations('b.svg', String.fromCodePoint(0xfeff) + wrap(box), f, null);
  assert.ok(bom.some((m) => m.includes('U+FEFF')), JSON.stringify(bom));
});

for (const f of FOLDERS) {
  test(`${f.dir}: every file obeys the style rules`, () => {
    const files = (f.only || allFiles(f.dir)).filter((n) => exists(f.dir, n));
    assert.ok(files.length > 0, `${f.dir} has no files yet`);
    const found = [];
    for (const n of files) {
      const game = f.dir === 'icons/games' ? C.games.find((g) => g.slug + '.svg' === n) || null : null;
      found.push(...violations(`${f.dir}/${n}`, read(f.dir, n), f, game));
    }
    assert.deepEqual(found, []);
  });
}

test('no two files draw the same picture', () => {
  const essence = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  const same = [];
  for (const f of FOLDERS) {
    for (const n of (f.only || allFiles(f.dir)).filter((x) => exists(f.dir, x))) {
      const h = crypto.createHash('sha1').update(essence(read(f.dir, n))).digest('hex');
      if (seen.has(h)) same.push(`${f.dir}/${n} draws the same picture as ${seen.get(h)}`);
      else seen.set(h, `${f.dir}/${n}`);
    }
  }
  assert.deepEqual(same, []);
});

test('every game in the catalogue has an icon, and no icon is an orphan', () => {
  const slugs = C.games.map((g) => g.slug);
  const files = allFiles('icons/games');
  const missing = slugs.filter((s) => !files.includes(s + '.svg'));
  const orphans = files.filter((n) => !n.endsWith('.svg') || !slugs.includes(n.slice(0, -4)));
  assert.deepEqual({ missing, orphans }, { missing: [], orphans: [] });
});

test('the four critters and the mark exist', () => {
  assert.deepEqual(allFiles('icons/critters'), ['clover.svg', 'mango.svg', 'pip.svg', 'plum.svg']);
  assert.ok(exists('icons', 'mark.svg'));
});
