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

/* The style rules live in svg-style.js so the in-game pictures are held to
 * the same checker; its self-test stays here. */
const { violations } = require("./svg-style.js");

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
    [box.replace('/>', ' opacity=".5"/>'), 'opacity='],
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

/* Pages that show game cards: no card may still hold an emoji, and every
 * picture must point at a file that exists. `up` is the page's path back to
 * the site root. */
function checkCards(page, up) {
  const html = read(...page.split('/'));
  const cards = Array.from(html.matchAll(/<span class="game-icon" aria-hidden="true">([\s\S]*?)<\/span>/g));
  assert.ok(cards.length > 0, `${page}: no game cards found`);
  for (const [, inner] of cards) {
    /* the prefix group is '' at the root and '../' one folder down */
    const m = inner.trim().match(/^<img src="((?:\.\.\/)*)icons\/games\/([a-z0-9-]+)\.svg" alt="" width="44" height="44">$/);
    assert.ok(m, `${page}: a card still holds ${JSON.stringify(inner.trim())}`);
    assert.equal(m[1], up, `${page}: icon path prefix should be ${JSON.stringify(up)}`);
    assert.ok(exists('icons', 'games', m[2] + '.svg'), `${page}: ${m[2]}.svg does not exist`);
  }
  return cards.length;
}

function checkHero(page, up) {
  const html = read(...page.split('/'));
  assert.ok(html.includes('<header class="hero has-critters">'), `${page}: hero needs has-critters`);
  assert.ok(html.includes(`<img class="hero-mark" src="${up}icons/mark.svg" alt="" width="44" height="44">`), `${page}: hero mark missing`);
  const list = html.match(/<ul class="hero-critters" aria-hidden="true">([\s\S]*?)<\/ul>/);
  assert.ok(list, `${page}: hero-critters list missing`);
  const expected = ['clover', 'pip', 'plum', 'mango']
    .map((c) => `<li><img src="${up}icons/critters/${c}.svg" alt="" width="72" height="68"></li>`).join('');
  assert.equal(list[1].replace(/\s+/g, ''), expected.replace(/\s+/g, ''), `${page}: the critters must be clover, pip, plum, mango in that order and nothing else`);
  const h1 = html.match(/<h1>([\s\S]*?)<\/h1>/);
  assert.ok(h1, `${page}: no <h1>`);
  assert.ok(!hasPicto(h1[1]), `${page}: the title still holds an emoji`);
}

test('homepage: every card shows its icon, the hero has the mark and the critters', () => {
  assert.equal(checkCards('index.html', ''), C.games.length);
  checkHero('index.html', '');
  assert.ok(read('index.html').includes('<meta name="theme-color" content="#2b2a5e" />'));
});

test('catalogue and 404: every card shows its icon; the catalogue hero has the critters', () => {
  assert.equal(checkCards('games/index.html', '../'), C.games.length);
  checkHero('games/index.html', '../');
  assert.equal(checkCards('404.html', ''), 6);
});

test('for grown-ups: every table row shows its icon', () => {
  const html = read('for-teachers.html');
  for (const g of C.games) {
    assert.ok(html.includes(`<a href="games/${g.slug}/"><img class="row-icon" src="icons/games/${g.slug}.svg" alt="" width="22" height="22"> `), `${g.slug} row has no icon`);
  }
});

test('the catalogue carries no game emoji any more', () => {
  for (const g of C.games) assert.equal(g.emoji, undefined, `${g.slug} still has an emoji field`);
});

test('the service worker precaches every icon', () => {
  const sw = read('sw.js');
  for (const g of C.games) assert.ok(sw.includes(`"/icons/games/${g.slug}.svg"`), `${g.slug}.svg not precached`);
  for (const c of ['clover', 'pip', 'plum', 'mango']) assert.ok(sw.includes(`"/icons/critters/${c}.svg"`));
  assert.ok(sw.includes('"/icons/mark.svg"'));
});

test('every game page shows its icon in the title instead of an emoji', () => {
  for (const g of C.games) {
    const html = read('games', g.slug, 'index.html');
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(m, `${g.slug}: no <h1>`);
    assert.ok(m[1].startsWith(`<img class="title-icon" src="../../icons/games/${g.slug}.svg" alt="" width="40" height="40"> `), `${g.slug}: title does not start with its icon`);
    assert.ok(!hasPicto(m[1]), `${g.slug}: title still holds an emoji`);
    assert.ok(!m[1].includes('<span aria-hidden="true">'), `${g.slug}: title still has an emoji span`);
  }
});

/* The August restyle left fifteen gradients behind. The old-palette ones
 * (coral-to-teal and friends) are gone; the ones that ARE the game (a sky,
 * the ground, a colour channel) stay and say so in a comment on the line above. */
test('legacy gradients: only game-content ones remain, each with a kept comment', () => {
  for (const slug of ['memory-game', 'word-scramble', 'geography-explorer', 'tic-tac-toe']) {
    assert.ok(!read('games', slug, 'index.html').includes('linear-gradient'), `${slug} still has a gradient`);
  }
  for (const slug of ['balloon-pop', 'catch-falling-object', 'whack-a-mole', 'color-matcher']) {
    const lines = read('games', slug, 'index.html').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('linear-gradient')) {
        assert.ok(/\/\* kept: /.test(lines[i - 1]), `${slug} line ${i + 1}: gradient without a "kept:" comment above it`);
      }
    });
  }
});
