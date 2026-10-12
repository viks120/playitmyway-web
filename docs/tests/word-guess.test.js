/* Word Guess: the word lists in words.js and the page that uses them.
 *     node --test docs/tests/*.test.js
 * Reads the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..', '..', 'games', 'word-guess');
const page = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

function loadLists() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'words.js'), 'utf8'), ctx, { filename: 'words.js' });
  return ctx.window.WORD_GUESS_DATA;
}
const unpack = (s, n) => { const out = []; for (let i = 0; i + n <= s.length; i += n) out.push(s.substr(i, n)); return out; };

test('three lengths, each with answers and a guess list of the right width', () => {
  const D = loadLists();
  for (const n of [5, 6, 7]) {
    const answers = D['a' + n];
    const pack = D['g' + n];
    assert.ok(Array.isArray(answers) && answers.length >= 300, `a${n} has ${answers && answers.length} answers`);
    assert.equal(pack.length % n, 0, `g${n} is not a multiple of ${n}`);
    const guesses = new Set(unpack(pack, n));
    assert.ok(guesses.size >= 8000, `g${n} has only ${guesses.size} words`);
    const shape = new RegExp(`^[a-z]{${n}}$`);
    for (const w of guesses) assert.match(w, shape, `g${n} holds ${JSON.stringify(w)}`);
    assert.equal(new Set(answers).size, answers.length, `a${n} has duplicates`);
    for (const w of answers) {
      assert.match(w, shape, `a${n} holds ${JSON.stringify(w)}`);
      assert.ok(guesses.has(w), `answer ${w} is not a valid guess`);
    }
  }
  assert.equal(D.a5.length, 528, 'the original five-letter answers are kept as they were');
  assert.deepEqual([D.g6.length / 6, D.g7.length / 7], [15232, 23109], 'the ENABLE six- and seven-letter lists, complete');
});

test('the page loads the lists from words.js and no longer embeds them', () => {
  const words = page.indexOf('<script src="words.js"></script>');
  const own = page.indexOf('var DATA = window.WORD_GUESS_DATA;');
  assert.ok(words > 0 && own > words, 'words.js must load before the page script uses it');
  assert.ok(!page.includes('var DATA = {'), 'the old inline DATA literal is still there');
  assert.ok(page.includes('var LENGTHS = [5, 6, 7];'), 'the page must draw from three lengths');
  assert.ok(page.includes('repeat(var(--cols, 5), 1fr)'), 'the row grid must follow --cols');
  const copy = page.replace(/<meta name="keywords"[^>]*>/, '');
  assert.ok(!/five-letter|\b5[- ]letter\b/i.test(copy), 'the copy still promises five letters');
});
