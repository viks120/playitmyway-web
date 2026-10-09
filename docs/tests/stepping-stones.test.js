/* Stepping Stones tests. Zero dependencies:   node --test docs/tests/*.test.js
 *
 * They load the shipped files from games/stepping-stones, never a copy, and
 * check every pond against an independent restatement of its rule written
 * from the label alone. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const GAME = path.join(__dirname, '..', '..', 'games', 'stepping-stones');
const Ponds = require(path.join(GAME, 'ponds.js'));
const SEEDS = 2000;

const ORDER = [
  'even-20', 'odd-20', 'even-100', 'odd-100',
  'times-2', 'times-5', 'times-10', 'times-3', 'times-4', 'times-6', 'times-7', 'times-8', 'times-9',
  'make-10', 'make-20', 'make-100',
];

/* What the spec allows in each pond, restated without looking at ponds.js. */
function spec(id) {
  let m = /^(even|odd)-(20|100)$/.exec(id);
  if (m) {
    const even = m[1] === 'even';
    const lo = m[2] === '20' ? 1 : 10;
    const hi = +m[2];
    return {
      fits: (l) => (+l % 2 === 0) === even,
      allowed: (l) => /^\d+$/.test(l) && +l >= lo && +l <= hi,
    };
  }
  m = /^times-(\d+)$/.exec(id);
  if (m) {
    const n = +m[1];
    return {
      fits: (l) => +l % n === 0 && +l >= n && +l <= 12 * n,
      allowed: (l) => /^\d+$/.test(l) && +l >= 1 && +l <= 12 * n,
    };
  }
  m = /^make-(\d+)$/.exec(id);
  if (m) {
    const t = +m[1];
    const step = t === 100 ? 5 : 1;
    const misses = t === 100 ? [90, 95, 105, 110] : [t - 1, t + 1];
    const sum = (l) => l.split('+').map(Number).reduce((a, b) => a + b, 0);
    return {
      fits: (l) => sum(l) === t,
      allowed: (l) => {
        if (!/^\d+\+\d+$/.test(l)) return false;
        const [a, b] = l.split('+').map(Number);
        return a >= step && b >= step && a % step === 0 && b % step === 0 && (a + b === t || misses.includes(a + b));
      },
    };
  }
  throw new Error('no spec for ' + id);
}

/* An independent route search, so hasRoute is not marking its own homework. */
function reaches(rows) {
  const R = rows.length;
  const C = rows[0].length;
  let frontier = [];
  for (let c = 0; c < C; c++) if (rows[0][c].ok) frontier.push([0, c]);
  const seen = new Set(frontier.map(([r, c]) => r * C + c));
  while (frontier.length) {
    const next = [];
    for (const [r, c] of frontier) {
      if (r === R - 1) return true;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= R || nc < 0 || nc >= C || !rows[nr][nc].ok || seen.has(nr * C + nc)) continue;
          seen.add(nr * C + nc);
          next.push([nr, nc]);
        }
      }
    }
    frontier = next;
  }
  return false;
}

test('sixteen ponds in menu order, three families, Even to 20 marked as the start', () => {
  assert.deepEqual(Ponds.LIST.map((p) => p.id), ORDER);
  assert.deepEqual(Ponds.LIST.filter((p) => p.start).map((p) => p.id), ['even-20']);
  assert.deepEqual(Ponds.FAMILIES.map((f) => f.id), ['parity', 'times', 'bonds']);
  assert.equal(Ponds.ROWS, 8);
  assert.equal(Ponds.COLS, 4);
});

for (const id of ORDER) {
  test(`${id}: ${SEEDS} generated ponds keep every promise`, () => {
    const s = spec(id);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = Ponds.generate(id, seed);
      const where = `${id} seed ${seed}`;
      assert.equal(p.id, id, where);
      assert.equal(p.rows.length, 8, where);
      const count = new Map();
      p.rows.forEach((row, r) => {
        assert.equal(row.length, 4, where);
        assert.equal(new Set(row.map((x) => x.label)).size, 4, `${where}: a label repeats in row ${r}`);
        const rights = row.filter((x) => x.ok).length;
        assert.ok(rights >= 1 && rights <= 2, `${where}: row ${r} has ${rights} right stones`);
        for (const x of row) {
          assert.ok(x.label.length <= 5, `${where}: label ${x.label} is too long`);
          assert.ok(s.allowed(x.label), `${where}: ${x.label} is outside this pond's range`);
          assert.equal(x.ok, s.fits(x.label), `${where}: ${x.label} marked ok=${x.ok}`);
          assert.deepEqual({ ok: x.ok, why: x.why }, Ponds.judge(id, x.label), where);
          count.set(x.label, (count.get(x.label) || 0) + 1);
        }
      });
      for (const [label, n] of count) assert.ok(n <= 2, `${where}: ${label} appears ${n} times`);
      assert.ok(reaches(p.rows), `${where}: no way across`);
      assert.equal(Ponds.hasRoute(p.rows), true, `${where}: hasRoute disagrees`);
      let bends = 0;
      p.route.forEach((c, r) => {
        assert.ok(p.rows[r][c].ok, `${where}: route stone ${r},${c} is not a right stone`);
        if (r > 0) {
          assert.ok(Math.abs(c - p.route[r - 1]) <= 1, `${where}: route jumps at row ${r}`);
          if (c !== p.route[r - 1]) bends++;
        }
      });
      assert.ok(bends >= 2, `${where}: route bends only ${bends} times`);
    }
  });
}

test('the same seed always builds the same pond, and different seeds vary', () => {
  assert.deepEqual(Ponds.generate('times-7', 42), Ponds.generate('times-7', 42));
  const firstRows = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    firstRows.add(Ponds.generate('times-7', seed).rows[0].map((x) => x.label).join());
  }
  assert.ok(firstRows.size > 90, `only ${firstRows.size} different first rows in 100 ponds`);
});

test('explanations use the exact wording from the spec', () => {
  const cases = [
    ['times-3', '21', true, '21 = 3 × 7'],
    ['times-3', '22', false, "22 isn't in the 3 times table: 3 × 7 = 21 and 3 × 8 = 24."],
    ['times-3', '2', false, "2 isn't in the 3 times table: it starts at 3 × 1 = 3."],
    ['even-20', '14', true, '14 is even: it ends in 4.'],
    ['even-20', '13', false, '13 is odd: it ends in 3. Even numbers end in 0, 2, 4, 6 or 8.'],
    ['odd-20', '14', false, '14 is even: it ends in 4. Odd numbers end in 1, 3, 5, 7 or 9.'],
    ['make-10', '7+3', true, '7 + 3 = 10'],
    ['make-10', '6+3', false, '6 + 3 = 9, not 10. 6 + 4 makes 10.'],
  ];
  for (const [id, label, ok, why] of cases) {
    assert.deepEqual(Ponds.judge(id, label), { ok, why }, `${id} ${label}`);
  }
});

test('every wrong times-table stone names the multiples either side of it', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (let v = n + 1; v < 12 * n; v++) {
      if (v % n === 0) continue;
      const k = Math.floor(v / n);
      assert.equal(Ponds.judge('times-' + n, String(v)).why,
        `${v} isn't in the ${n} times table: ${n} × ${k} = ${k * n} and ${n} × ${k + 1} = ${(k + 1) * n}.`);
    }
  }
});

test('hasRoute follows diagonals and stops at gaps', () => {
  const grid = (lines) => lines.map((s) => [...s].map((ch) => ({ ok: ch === 'o' })));
  assert.equal(Ponds.hasRoute(grid(['o...', '.o..', '..o.', '...o', '..o.', '.o..', 'o...', '.o..'])), true);
  assert.equal(Ponds.hasRoute(grid(['o...', '.o..', '....', '...o', '..o.', '.o..', 'o...', '.o..'])), false);
  assert.equal(Ponds.hasRoute(grid(['o..o', 'o..o', 'o..o', '....', 'oooo', 'oooo', 'oooo', 'oooo'])), false);
});
