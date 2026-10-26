/* The Geography Explorer world map. It is inline SVG in the page, not a
 * library symbol, because its six continents are six separate controls that
 * recolour as the game goes. It still follows the house SVG style, holds no
 * text (the continent names are HTML labels laid over it), keeps one
 * keyboard-reachable control per continent, and shows no pin until an
 * answer is revealed, since a pin would give the continent away.
 *     node --test docs/tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { bodyViolations } = require('./svg-style.js');

const ROOT = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(ROOT, 'games', 'geography-explorer', 'index.html'), 'utf8');
const Pictures = require(path.join(ROOT, 'games', 'shared', 'art', 'pictures.js'));
const PALETTE = new Set(Object.values(Pictures.PALETTE).map((h) => h.toLowerCase()));
const CONTINENTS = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania'];

const open = page.indexOf('<svg class="map-svg"');
const close = page.indexOf('</svg>', open);
const map = open < 0 || close < 0 ? '' : page.slice(open, close + '</svg>'.length);
const body = map.slice(map.indexOf('>') + 1, map.length - '</svg>'.length);

test('the map is inline in the page, there at load', () => {
  assert.ok(map.length > 1000, 'the <svg class="map-svg"> block is in the page');
  assert.ok(page.indexOf('id="worldMap"') > -1 && page.indexOf('id="worldMap"') < open, 'it sits inside the #worldMap area');
});

test('the map follows the house SVG style and holds no text', () => {
  assert.deepEqual(bodyViolations(body, { palette: PALETTE, needsInk: true }), []);
  assert.ok(!/<text\b/i.test(map), 'continent names are HTML labels, not SVG text');
});

test('each continent is one keyboard-reachable control, named for the screen reader', () => {
  for (const name of CONTINENTS) {
    const tags = map.match(new RegExp('<g[^>]*\\sdata-continent="' + name + '"[^>]*>', 'g')) || [];
    assert.equal(tags.length, 1, `${name} has exactly one group`);
    assert.match(tags[0], /\srole="button"/, `${name} is a button`);
    assert.match(tags[0], /\stabindex="0"/, `${name} is in the tab order`);
    assert.match(tags[0], new RegExp('\\saria-label="' + name + '"'), `${name} is named`);
  }
});

test('no pin shows before an answer', () => {
  assert.match(map, /<g id="pins"[^>]*>\s*<\/g>/, 'the pins group starts empty');
});
