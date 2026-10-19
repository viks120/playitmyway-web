/* The spot-the-difference scene kit and its two pages.
 *     node --test docs/tests/*.test.js
 * Loads the shipped games/shared/spot/scenes.js and draw.js in Node and
 * checks every fairness promise in the spec over 1,000 seeds. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'games', 'shared', 'spot', 'scenes.js'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const SEEDS = 1000;
const overlap = (p, q, pad) => p.x0 - pad < q.x1 && q.x0 - pad < p.x1 && p.y0 - pad < q.y1 && q.y0 - pad < p.y1;
const far = (c1, c2) => { const d = Math.abs(S.WHEEL.indexOf(c1) - S.WHEEL.indexOf(c2)); return Math.min(d, 8 - d) >= 3; };
const near = (c1, c2) => { const d = Math.abs(S.WHEEL.indexOf(c1) - S.WHEEL.indexOf(c2)); return Math.min(d, 8 - d) === 1; };

test('the tables, as the spec says', () => {
  assert.deepEqual(S.LITTLE.map((r) => [r.diffs, r.items, r.kinds.length, r.minR, r.sizeFactor, r.minHalf]), [
    [2, 6, 2, 36, 1.8, 16], [2, 7, 3, 36, 1.8, 16], [3, 7, 3, 36, 1.8, 16], [3, 8, 4, 36, 1.8, 16],
    [3, 9, 4, 36, 1.8, 16], [4, 9, 4, 36, 1.8, 16], [4, 10, 4, 36, 1.8, 16], [4, 10, 4, 36, 1.8, 12],
  ]);
  assert.deepEqual(S.LITTLE[0].kinds, ['missing', 'colour']);
  assert.deepEqual(S.LITTLE[3].kinds, ['missing', 'colour', 'swap', 'size']);
  assert.deepEqual(S.BIG.map((r) => [r.diffs, r.items, r.kinds.length, r.minR, r.sizeFactor, r.minHalf]), [
    [5, 12, 5, 24, 1.3, 10], [6, 14, 7, 24, 1.3, 10], [7, 16, 9, 24, 1.3, 10], [8, 18, 10, 24, 1.3, 8],
  ]);
  assert.deepEqual(S.BIG[3].kinds, ['missing', 'colour', 'swap', 'size', 'flip', 'count', 'state', 'shade', 'shift', 'tilt']);
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 40].map(S.tier), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual(S.LANES, { sky: [30, 90], back: [150, 175], air: [100, 190], water: [170, 255], ground: [200, 295] });
  assert.deepEqual(S.WHEEL, ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']);
  assert.equal(S.PALETTE.ink, '#33302e');
  assert.equal(Object.keys(S.PALETTE).length, 12);
});

test('every kind is complete, and each theme has at least ten', () => {
  for (const [k, d] of Object.entries(S.KINDS)) {
    assert.ok(/^(the [a-z ]+|Clover|Pip|Plum|Mango)$/.test(d.name), `${k}: name ${d.name}`);
    assert.ok(S.LANES[d.lane], `${k}: lane ${d.lane}`);
    assert.ok(d.w > 0 && d.h > 0 && d.w <= 44 && d.h <= 44, `${k}: size`);
    assert.ok(typeof d.family === 'string' && typeof d.asym === 'boolean' && d.max >= 1, `${k}: family/asym/max`);
    if (d.colours) for (const c of d.colours) assert.ok(S.WHEEL.includes(c) || ['brown', 'grey', 'white'].includes(c), `${k}: colour ${c}`);
    if (d.states) assert.equal(d.states.length, 2, `${k}: two states`);
    if (d.counts) assert.ok(d.counts[0] < d.counts[1], `${k}: counts`);
    assert.ok(d.themes.every((t) => S.THEMES.includes(t)), `${k}: themes`);
  }
  for (const t of S.THEMES) assert.ok(Object.values(S.KINDS).filter((d) => d.themes.includes(t)).length >= 10, `${t} has too few kinds`);
  assert.equal(S.label('frog'), 'a frog');
  assert.equal(S.label('clover'), 'Clover');
});

function checkScene(scene, row, theme, where) {
  const { a, b, diffs } = scene;
  assert.equal(diffs.length, row.diffs, `${where}: ${diffs.length} differences`);
  for (const [name, side] of [['a', a], ['b', b]]) {
    const gone = diffs.filter((d) => d.kind === 'missing' && d.side === name).length;
    assert.equal(side.length, row.items - gone, `${where}: side ${name} has ${side.length} items`);
    for (const it of side) {
      const d = S.KINDS[it.kind];
      assert.ok(d && d.themes.includes(theme), `${where}: ${it.kind} is not in ${theme}`);
      const bx = S.box(it);
      assert.ok(bx.x0 >= 0 && bx.y0 >= 0 && bx.x1 <= S.W && bx.y1 <= S.H, `${where}: ${it.id} leaves the picture`);
      const [lo, hi] = S.LANES[d.lane];
      if (it.rot === 0) assert.ok(it.y + d.h * it.s >= lo - 0.01 && it.y + d.h * it.s <= hi + 0.01, `${where}: ${it.id} base off its lane`);
      if (d.colours) assert.ok(d.colours.includes(it.colour), `${where}: ${it.id} colour`); else assert.equal(it.colour, null);
      if (d.states) assert.ok(d.states.includes(it.state), `${where}: ${it.id} state`); else assert.equal(it.state, null);
      if (d.counts) assert.ok(it.count >= d.counts[0] && it.count <= d.counts[1], `${where}: ${it.id} count`); else assert.equal(it.count, null);
      if (!d.asym) assert.equal(it.flip, false, `${where}: ${it.id} flipped but symmetric`);
    }
    for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) {
      assert.ok(!overlap(S.box(side[i]), S.box(side[j]), 4), `${where}: ${side[i].id} and ${side[j].id} overlap`);
    }
    const perKind = {};
    for (const it of side) perKind[it.kind] = (perKind[it.kind] || 0) + 1;
    for (const [k, n] of Object.entries(perKind)) assert.ok(n <= S.KINDS[k].max, `${where}: ${n} × ${k}`);
  }
  const ids = new Set(diffs.map((d) => d.item));
  assert.equal(ids.size, diffs.length, `${where}: two differences on one item`);
  for (const d of diffs) {
    assert.ok(row.kinds.includes(d.kind), `${where}: ${d.kind} not allowed`);
    assert.ok(d.side === 'a' || d.side === 'b', `${where}: side`);
    const same = (d.side === 'a' ? b : a).find((it) => it.id === d.item);
    const changed = (d.side === 'a' ? a : b).find((it) => it.id === d.item);
    assert.ok(same, `${where}: ${d.item} missing on the unchanged side`);
    assert.ok(S.half(same) >= row.minHalf - 0.01, `${where}: ${d.item} too small (${S.half(same)})`);
    const { x, y, r } = d.region;
    assert.ok(r >= row.minR && x - r >= 0 && y - r >= 0 && x + r <= S.W && y + r <= S.H, `${where}: region ${JSON.stringify(d.region)}`);
    assert.ok(Math.hypot(same.x - x, same.y - y) <= r, `${where}: ${d.item} centre outside its region`);
    if (changed) assert.ok(Math.hypot(changed.x - x, changed.y - y) <= r, `${where}: changed ${d.item} centre outside its region`);
    const k = S.KINDS[same.kind];
    switch (d.kind) {
      case 'missing': assert.equal(changed, undefined); assert.equal(d.after, null); break;
      case 'colour': assert.ok(far(same.colour, changed.colour), `${where}: ${same.colour}→${changed.colour} not far`); break;
      case 'shade': assert.ok(near(same.colour, changed.colour) && S.half(same) >= 14, `${where}: shade`); break;
      case 'swap': assert.ok(changed.kind !== same.kind && S.KINDS[changed.kind].lane === k.lane && S.KINDS[changed.kind].family !== k.family, `${where}: swap`); break;
      case 'size': assert.ok(Math.abs(changed.s / same.s - row.sizeFactor) < 0.01 || Math.abs(same.s / changed.s - row.sizeFactor) < 0.01, `${where}: size ${same.s}→${changed.s}`); break;
      case 'flip': assert.ok(k.asym && changed.flip !== same.flip, `${where}: flip`); break;
      case 'count': assert.equal(Math.abs(changed.count - same.count), 1, `${where}: count`); break;
      case 'state': assert.ok(changed.state !== same.state, `${where}: state`); break;
      case 'shift': { const m = Math.hypot(changed.x - same.x, changed.y - same.y); assert.ok(m >= 13.99 && m <= 20.01, `${where}: shift ${m}`); break; }
      case 'tilt': assert.ok(Math.abs(changed.rot) === 20 && same.rot === 0 && S.half(same) >= 14, `${where}: tilt`); break;
      default: assert.fail(`${where}: unknown kind ${d.kind}`);
    }
  }
  for (let i = 0; i < diffs.length; i++) for (let j = i + 1; j < diffs.length; j++) {
    const p = diffs[i].region, q = diffs[j].region;
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= p.r + q.r + 6 - 0.01, `${where}: regions ${i} and ${j} too close`);
  }
  const untouched = a.filter((it) => !ids.has(it.id));
  assert.deepEqual(untouched, b.filter((it) => !ids.has(it.id)), `${where}: an unchanged item differs`);
}

test('3+: every level and theme keeps every promise over 1,000 seeds', () => {
  S.LITTLE.forEach((row, level) => {
    for (const theme of S.THEMES) for (let seed = 1; seed <= SEEDS; seed++) {
      checkScene(S.make(seed, row, theme), row, theme, `little level ${level} ${theme} seed ${seed}`);
    }
  });
});

test('7+: every tier and theme keeps every promise over 1,000 seeds', () => {
  S.BIG.forEach((row, tier) => {
    for (const theme of S.THEMES) for (let seed = 1; seed <= SEEDS; seed++) {
      checkScene(S.make(seed, row, theme), row, theme, `big tier ${tier} ${theme} seed ${seed}`);
    }
  });
});

test('the same seed gives the same scene; different seeds differ', () => {
  assert.deepEqual(S.make(42, S.BIG[2], 'farm'), S.make(42, S.BIG[2], 'farm'));
  assert.notDeepEqual(S.make(42, S.BIG[2], 'farm'), S.make(43, S.BIG[2], 'farm'));
});

test('every kind of difference actually occurs', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) for (const theme of S.THEMES) {
    for (const d of S.make(seed, S.BIG[3], theme).diffs) seen.add(d.kind);
    for (const d of S.make(seed, S.LITTLE[7], theme).diffs) seen.add(d.kind + '@little');
  }
  for (const k of S.BIG[3].kinds) assert.ok(seen.has(k), `${k} never happens at tier 3`);
  for (const k of S.LITTLE[7].kinds) assert.ok(seen.has(k + '@little'), `${k} never happens at level 7`);
});

test('hit: the first unfound region holding the point', () => {
  const diffs = [{ id: 'd0', region: { x: 100, y: 100, r: 30 } }, { id: 'd1', region: { x: 300, y: 200, r: 24 } }];
  assert.equal(S.hit(diffs, new Set(), 110, 120).id, 'd0');
  assert.equal(S.hit(diffs, new Set(['d0']), 110, 120), null);
  assert.equal(S.hit(diffs, new Set(), 300, 224).id, 'd1');
  assert.equal(S.hit(diffs, new Set(), 300, 225), null);
});

test('themes: 3+ cycles; 7+ never repeats and is deterministic', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => S.theme('little', n, 99)), ['pond', 'meadow', 'farm', 'pond']);
  for (const seed of [1, 2, 3, 1000]) {
    let prev = null;
    for (let n = 1; n <= 30; n++) {
      const t = S.theme('big', n, seed);
      assert.ok(S.THEMES.includes(t) && t !== prev, `seed ${seed} round ${n}`);
      assert.equal(t, S.theme('big', n, seed));
      prev = t;
    }
  }
  assert.equal(S.theme('big', 1, 0), 'pond');
  assert.equal(S.theme('big', 1, 2), 'farm');
});

test('levels adapt and stars count', () => {
  assert.equal(S.nextLevel(0, 0), 1);
  assert.equal(S.nextLevel(7, 0), 7);
  assert.equal(S.nextLevel(3, 1), 3);
  assert.equal(S.nextLevel(3, 2), 2);
  assert.equal(S.nextLevel(0, 5), 0);
  assert.deepEqual([S.stars(0, false), S.stars(1, false), S.stars(2, false), S.stars(9, false), S.stars(0, true)], [3, 2, 1, 1, 0]);
});
