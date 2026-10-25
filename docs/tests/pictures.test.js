/* The in-game picture library, games/shared/art/pictures.js: every picture
 * obeys the site's one SVG style (svg-style.js), the palette is the allowed
 * one, no two pictures are the same, and every page that uses the library
 * is wired to it and no longer plays with emoji.
 *     node --test docs/tests/*.test.js
 * Reads the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { bodyViolations, INK } = require('./svg-style.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const Pictures = require(path.join(ROOT, 'games', 'shared', 'art', 'pictures.js'));

const hexes = (s) => Array.from(new Set((s.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase())));
/* The icon palette (tokens.css plus the fixed extra fills), the critters'
 * own colours, and the scene colours the meadow backdrops introduced. Any
 * other colour is a mistake. */
const EXTRA = ['#ef4444', '#fbbf24', '#4ade80', '#60a5fa', '#ff8fab', '#8b5e3c', '#94a3b8', '#ffffff'];
const SCENE = ['#fb923c', '#2dd4bf', '#a78bfa', '#2e9e5b', '#dff4ff', '#8ed0ff', '#f1dcb0', '#a7e3a1', '#9be28f', '#5a3b22', '#d9a066'];
const ALLOWED = new Set([...hexes(read('tokens.css')), ...EXTRA, INK, ...hexes(read('games', 'shared', '3d', 'critters.js')), ...SCENE]);
const PALETTE = new Set(Object.values(Pictures.PALETTE).map((h) => h.toLowerCase()));
const JOINERS = String.fromCodePoint(0xfe0f, 0x20e3, 0x200d);
const hasPicto = (s) => /\p{Extended_Pictographic}/u.test(s) || [...JOINERS].some((c) => s.includes(c));

test('the palette is the allowed one, and ink is ink', () => {
  assert.equal(Pictures.PALETTE.ink, INK);
  const off = [...PALETTE].filter((h) => !ALLOWED.has(h));
  assert.deepEqual(off, [], 'colours outside tokens.css, the extra fills, the critters and the scene set');
});

test('every picture obeys the style rules and the library conventions', () => {
  const found = [];
  const ids = Pictures.ids();
  assert.ok(ids.length > 0);
  for (const id of ids) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) found.push(`${id}: ids are lower-case kebab-case`);
    const entry = Pictures.PICTURES[id];
    if (typeof entry.label !== 'string' || entry.label.length < 3) found.push(`${id}: needs a label a screen reader can say`);
    if (entry.box !== Pictures.BOX && entry.box !== Pictures.FLAG_BOX) found.push(`${id}: box must be ${Pictures.BOX} or ${Pictures.FLAG_BOX}`);
    const s = Pictures.symbol(id);
    const head = `<symbol id="p-${id}" viewBox="${entry.box}"><g fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`;
    if (!s.startsWith(head)) found.push(`${id}: symbol must start with the standard ink wrapper`);
    if (!s.endsWith('</g></symbol>')) found.push(`${id}: symbol must end by closing the wrapper`);
    const body = s.slice(s.indexOf('<g '), s.length - '</symbol>'.length);
    for (const m of bodyViolations(body, { palette: PALETTE, needsInk: true })) found.push(`${id}: ${m}`);
    if (hasPicto(s)) found.push(`${id}: contains an emoji`);
  }
  assert.deepEqual(found, []);
});

test('no two pictures are the same drawing', () => {
  const seen = new Map();
  const same = [];
  for (const id of Pictures.ids()) {
    const h = crypto.createHash('sha1').update(Pictures.PICTURES[id].markup.replace(/\s+/g, ' ').trim()).digest('hex');
    if (seen.has(h)) same.push(`${id} draws the same picture as ${seen.get(h)}`);
    else seen.set(h, id);
  }
  assert.deepEqual(same, []);
});

test('the sprite and the use() markup are what pages expect', () => {
  const ids = Pictures.ids();
  assert.equal((Pictures.sprite().match(/<symbol /g) || []).length, ids.length);
  assert.equal((Pictures.sprite([ids[0]]).match(/<symbol /g) || []).length, 1);
  const decorative = Pictures.use(ids[0], { size: 40 });
  assert.ok(decorative.startsWith('<svg class="pic" width="40" height="40" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#p-'), decorative);
  const named = Pictures.use(ids[0], { size: 32, label: true, cls: 'card-pic' });
  assert.ok(named.includes('class="pic card-pic"') && named.includes(`role="img" aria-label="${Pictures.PICTURES[ids[0]].label}"`), named);
  assert.throws(() => Pictures.use('no-such-picture'), /no picture called/);
});

/* Pages that use the library: each must load the script before its own
 * game script, hold no emoji in the gameplay data it draws from, and only
 * reference pictures that exist. The list grows as games are converted. */
const USERS = [
  { slug: 'memory-game', ownScript: '// Screen-reader status line', ids: ['dog', 'cat', 'mouse', 'hamster', 'bear', 'panda', 'fox', 'koala', 'tiger', 'lion', 'cow', 'pig'], dataRange: ['const PICS = [', 'const difficultyConfig = {'] },
  { slug: 'counting-game', ownScript: '// the fruit pictures: one hidden sprite of symbols', ids: ['apple', 'banana', 'grapes', 'orange', 'strawberry', 'cherries', 'kiwi', 'pineapple', 'mango', 'peach'], dataRange: ['const objects = [', 'const numbers = ['] },
  { slug: 'tic-tac-toe', ownScript: 'Pictures.install([\'mark-x\', \'mark-o\'])', ids: ['mark-x', 'mark-o'], dataRange: ['function markPic(', 'const move = cellLabel(index, player)'] },
  { slug: 'balloon-pop', ownScript: 'Pictures.install([\'pop-burst\'])', ids: ['pop-burst'], dataRange: ['const balloonColors = [', 'function showScorePopup('] },
  { slug: 'catch-falling-object', ownScript: '// the pictures: one hidden sprite of symbols, put in the page before', ids: ['apple', 'orange', 'lemon', 'grapes', 'strawberry', 'banana', 'peach', 'kiwi', 'star', 'bomb', 'basket', 'heart', 'heart-empty'], dataRange: ['const fruits = [', 'let score = 0'] },
  { slug: 'whack-a-mole', ownScript: '// Screen-reader status line', ids: ['hamster', 'dog', 'bear', 'panda'], dataRange: ['const PIECES = [', 'const messages = ['] },
  { slug: 'sound-it-out', ownScript: '/* ==WORD_DATA_START==', ids: ['cat', 'rat', 'bat', 'ram', 'man', 'dad', 'cab', 'van', 'bag', 'map', 'can', 'pan', 'fan', 'cap', 'hat', 'tag', 'sax', 'tap', 'ham', 'yam', 'gas-pump', 'face-sleepy', 'face-sad', 'face-angry', 'lightning', 'chicken', 'pen', 'dot', 'bed', 'leg', 'net', 'web', 'gem', 'jet', 'red-swatch', 'water-drops', 'pig', 'kid', 'lips', 'bin', 'pin', 'trophy', 'dog', 'fox', 'cop', 'mom', 'box', 'pot', 'rod', 'log', 'fog', 'face-hot', 'pod', 'bug', 'bus', 'mug', 'cup', 'tub', 'hut', 'nut', 'sun', 'runner', 'hug', 'scissors', 'face-yum'], dataRange: ['/* ==WORD_DATA_START==', '/* ==WORD_DATA_END== */'] },
];
for (const u of USERS) {
  test(`${u.slug}: wired to the picture library and free of gameplay emoji`, () => {
    const page = read('games', u.slug, 'index.html');
    assert.ok(page.includes('<script src="../shared/art/pictures.js"></script>'), 'loads the library');
    assert.ok(page.indexOf('../shared/art/pictures.js') < page.indexOf(u.ownScript || 'Pictures.install'), 'the library comes before the code that uses it');
    assert.ok(page.includes('.sprite') || read('components.css').includes('.sprite'), 'the sprite is hidden by CSS');
    for (const id of u.ids) assert.ok(Pictures.has(id), `${u.slug} uses ${id}, which the library lacks`);
    const data = u.dataRange ? page.slice(page.indexOf(u.dataRange[0]), page.indexOf(u.dataRange[1])) : '';
    assert.ok(data.length > 0, 'the gameplay data range was found');
    assert.ok(!hasPicto(data), `${u.slug} still holds an emoji in its gameplay data`);
  });
}
