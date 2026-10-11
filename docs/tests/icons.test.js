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
const svgFiles = (dir) =>
  exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.svg')).sort() : [];
/* an emoji or other pictograph, with the joiners and keycaps that ride on them */
const PICTO = /[\p{Extended_Pictographic}\uFE0F\u20E3\u200D]/u;

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

function checkSvg(name, svg, f) {
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.box}">`;
  assert.ok(svg.startsWith(root), `${name}: must start with ${root}`);
  assert.match(svg, /<!-- [^\n]+ -->/, `${name}: needs a one-line comment naming the game`);
  for (const bad of ['<text', 'gradient', '<filter', '<script', '<image', 'href=', 'url(', '<style', '@font-face']) {
    assert.ok(!svg.toLowerCase().includes(bad), `${name}: must not contain ${bad}`);
  }
  for (const m of svg.matchAll(/\b(fill|stroke)="([^"]+)"/g)) {
    const v = m[2].toLowerCase();
    assert.ok(v === 'none' || f.palette.has(v), `${name}: ${m[1]} ${m[2]} is not in the palette`);
  }
  if (f.needsInk) assert.ok(svg.includes(`stroke="${INK}"`), `${name}: needs an ink outline`);
  for (const m of svg.matchAll(/stroke-width="([^"]+)"/g)) {
    assert.ok(Number(m[1]) > 0 && Number(m[1]) <= 8, `${name}: stroke-width ${m[1]} out of range`);
  }
}

for (const f of FOLDERS) {
  test(`${f.dir}: every file obeys the style rules`, () => {
    const files = (f.only || svgFiles(f.dir)).filter((n) => exists(f.dir, n));
    assert.ok(files.length > 0, `${f.dir} has no SVG files yet`);
    for (const n of files) checkSvg(`${f.dir}/${n}`, read(f.dir, n), f);
  });
}

test('no two pictures are the same file', () => {
  const seen = new Map();
  for (const f of FOLDERS) {
    for (const n of (f.only || svgFiles(f.dir)).filter((x) => exists(f.dir, x))) {
      const h = crypto.createHash('sha1').update(read(f.dir, n)).digest('hex');
      assert.ok(!seen.has(h), `${f.dir}/${n} is identical to ${seen.get(h)}`);
      seen.set(h, `${f.dir}/${n}`);
    }
  }
});

test('every game in the catalogue has an icon, and no icon is an orphan', () => {
  const slugs = C.games.map((g) => g.slug).sort();
  assert.deepEqual(svgFiles('icons/games').map((n) => n.replace(/\.svg$/, '')), slugs);
});

test('the four critters and the mark exist', () => {
  assert.deepEqual(svgFiles('icons/critters'), ['clover.svg', 'mango.svg', 'pip.svg', 'plum.svg']);
  assert.ok(exists('icons', 'mark.svg'));
});
