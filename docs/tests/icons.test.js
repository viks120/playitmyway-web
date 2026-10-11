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
/* an emoji or other pictograph, with the joiners and keycaps that ride on them */
const PICTO = /[\p{Extended_Pictographic}️⃣‍]/u;

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

function shapesOf(body) {
  const shapes = [];
  const stack = [];
  for (const m of body.matchAll(/<\/?([a-zA-Z]+)\b[^>]*>/g)) {
    const tag = m[0];
    const name = m[1];
    if (tag.startsWith('</')) {
      if (name === 'g') stack.pop();
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
  return shapes;
}

/* Every rule a file breaks, so one run reports everything. `game` is the
 * catalogue entry for a game icon, or null. */
function violations(name, svg, f, game) {
  const v = [];
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.box}">`;
  if (!svg.startsWith(root)) v.push(`must start with ${root} but starts with ${JSON.stringify(svg.slice(0, 60))}`);
  const comments = svg.match(/<!--[\s\S]*?-->/g) || [];
  if (comments.length !== 1) v.push(`needs exactly one comment, has ${comments.length}`);
  else if (!/^<!-- [^:\n]+: [^\n]+ -->$/.test(comments[0])) v.push(`comment must read <!-- Name: what it shows -->, not ${comments[0]}`);
  else if (game && !comments[0].startsWith(`<!-- ${game.name}: `)) v.push(`comment must start with the catalogue name ${JSON.stringify(game.name)}`);
  const body = svg.replace(/<!--[\s\S]*?-->/g, '');
  const lower = body.toLowerCase();
  for (const bad of ['<text', 'gradient', '<filter', '<script', '<image', '<style', '<title', '<desc', '<metadata', '<foreignobject', 'href=', 'url(', 'style=', '@font-face', "='"]) {
    if (lower.includes(bad)) v.push(`must not contain ${bad}`);
  }
  if (/\son[a-z]+=/i.test(body)) v.push('must not contain event handler attributes');
  if (/=(?!")|\s=/.test(body)) v.push('attribute values must be double-quoted, with no space around =');
  for (const m of body.matchAll(/\b(fill|stroke)="([^"]+)"/g)) {
    const c = m[2].toLowerCase();
    if (c !== 'none' && !f.palette.has(c)) v.push(`${m[1]} ${m[2]} is not in the palette`);
  }
  let inkOutline = false;
  for (const s of shapesOf(body)) {
    const { fill, stroke } = s.eff;
    if (fill === undefined) v.push(`${s.tag} names no fill, on itself or a <g> around it, so it would render black`);
    if (stroke === undefined || stroke === 'none') continue;
    if (s.eff['stroke-linejoin'] !== 'round' || s.eff['stroke-linecap'] !== 'round') v.push(`${s.tag} is stroked without round joins and caps`);
    const w = Number(s.eff['stroke-width'] === undefined ? 1 : s.eff['stroke-width']);
    if (!Number.isFinite(w)) {
      v.push(`${s.tag} has a stroke-width that is not a plain number`);
      continue;
    }
    const outlined = fill !== undefined && fill !== 'none';
    if (stroke === INK && outlined) {
      inkOutline = true;
      if (w !== 2.5) v.push(`${s.tag} is an ink outline of width ${w}, not 2.5`);
    } else if (w < 1.5 || w > 7) {
      v.push(`${s.tag} is a line of width ${w}, outside 1.5 to 7`);
    }
  }
  if (f.needsInk && !inkOutline) v.push('needs at least one filled shape with an ink outline');
  return v.map((msg) => `${name}: ${msg}`);
}

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
  for (const f of FOLDERS) {
    for (const n of (f.only || allFiles(f.dir)).filter((x) => exists(f.dir, x))) {
      const h = crypto.createHash('sha1').update(essence(read(f.dir, n))).digest('hex');
      assert.ok(!seen.has(h), `${f.dir}/${n} draws the same picture as ${seen.get(h)}`);
      seen.set(h, `${f.dir}/${n}`);
    }
  }
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
