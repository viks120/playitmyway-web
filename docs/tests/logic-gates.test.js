/* Logic Gates tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/logic-gates/gates.js and prove the gates are
 * right, every level can be solved with the slots and gates it gives (by
 * trying every gate in every slot), the adders really add, hints lead to a
 * solution, and every board's wires are laid out cleanly. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const G = require(path.join(__dirname, '..', '..', 'games', 'logic-gates', 'gates.js'));
const L = G.LEVELS;
const find = (title) => L.find((lv) => lv.title === title);
const allRows = (lv) => Array.from({ length: G.rowCount(lv) }, (_, r) => G.bitsOf(lv, r));

test('the six gates, in key order, with their truth tables', () => {
  assert.deepEqual(G.ORDER, ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR']);
  const pairs = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const table = (id) => pairs.map((p) => G.apply(id, p));
  assert.deepEqual(table('AND'), [0, 0, 0, 1]);
  assert.deepEqual(table('OR'), [0, 1, 1, 1]);
  assert.deepEqual(table('XOR'), [0, 1, 1, 0]);
  assert.deepEqual(table('NAND'), [1, 1, 1, 0]);
  assert.deepEqual(table('NOR'), [1, 0, 0, 0]);
  assert.deepEqual([G.apply('NOT', [0]), G.apply('NOT', [1])], [1, 0]);
  assert.equal(G.GATES.NOT.n, 1);
  for (const id of ['AND', 'OR', 'XOR', 'NAND', 'NOR']) assert.equal(G.GATES[id].n, 2);
});

test('a two-input gate on one wire gets it on both inputs; NOT only fits one wire', () => {
  const joined = (id) => [G.apply(id, [0]), G.apply(id, [1])];
  assert.deepEqual(joined('AND'), [0, 1], 'AND passes the signal on');
  assert.deepEqual(joined('OR'), [0, 1], 'OR passes the signal on');
  assert.deepEqual(joined('NAND'), [1, 0], 'NAND flips it, like NOT');
  assert.deepEqual(joined('NOR'), [1, 0], 'NOR flips it, like NOT');
  assert.deepEqual(joined('XOR'), [0, 0], 'XOR always gives 0');
  const one = { in: ['A'] };
  const two = { in: ['A', 'B'] };
  assert.equal(G.fits(one, 'NOT'), true);
  assert.equal(G.fits(two, 'NOT'), false);
  for (const id of ['AND', 'OR', 'XOR', 'NAND', 'NOR']) {
    assert.equal(G.fits(one, id), true);
    assert.equal(G.fits(two, id), true);
  }
  assert.equal(G.joined(one, 'NAND'), true);
  assert.equal(G.joined(one, 'NOT'), false);
  assert.equal(G.joined(two, 'NAND'), false);
});

test('24 well-formed levels in four groups of six', () => {
  assert.equal(L.length, 24);
  assert.deepEqual(G.GROUPS.map((g) => [g.from, g.to]), [[0, 6], [6, 12], [12, 18], [18, 24]]);
  L.forEach((lv, n) => {
    const where = `level ${n + 1} (${lv.title})`;
    const names = lv.inputs.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${where}: input names repeat`);
    assert.ok(names.length >= 1 && names.length <= 4, `${where}: 1 to 4 switches`);
    assert.ok(lv.palette.length >= 2 && lv.palette.every((id) => G.ORDER.includes(id)), `${where}: palette`);
    lv.slots.forEach((s, i) => {
      assert.ok(s.in.length === 1 || s.in.length === 2, `${where}: slot ${i + 1} wires`);
      s.in.forEach((src) => assert.ok(typeof src === 'number' ? src < i : names.includes(src), `${where}: slot ${i + 1} source ${src}`));
      assert.ok(G.choices(lv, i).length >= 2, `${where}: slot ${i + 1} needs a real choice`);
    });
    lv.outputs.forEach((o) => {
      assert.ok(typeof o.from === 'number' ? o.from < lv.slots.length : names.includes(o.from), `${where}: lamp ${o.name}`);
      assert.equal(o.want.length, names.length, `${where}: target for ${o.name} takes every input`);
    });
    // every slot matters: each one feeds a lamp, directly or through other slots
    const used = new Set(lv.outputs.map((o) => o.from));
    for (let i = lv.slots.length - 1; i >= 0; i--) if (used.has(i)) lv.slots[i].in.forEach((s) => used.add(s));
    lv.slots.forEach((_, i) => assert.ok(used.has(i), `${where}: slot ${i + 1} feeds nothing`));
    assert.equal(G.score(lv, lv.slots.map(() => null)).solved, false, `${where}: starts solved`);
    assert.ok(lv.title && lv.goal && lv.outro, `${where}: words`);
  });
});

test('rows count in binary, first switch most significant', () => {
  const lv = find('Burglar alarm');
  assert.equal(G.rowCount(lv), 8);
  assert.deepEqual(allRows(lv), [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]]);
  allRows(lv).forEach((bits, r) => assert.equal(G.rowOf(bits), r));
});

test('a circuit is worked out slot by slot; an empty slot sends no signal on', () => {
  const lv = find('XOR, built up');                 // OR and AND, NOT, then AND
  const gates = ['OR', 'AND', 'NOT', 'AND'];
  for (const bits of allRows(lv)) {
    const r = G.run(lv, gates, bits);
    const [A, B] = bits;
    assert.deepEqual(r.slots, [A | B, A & B, 1 - (A & B), (A | B) & (1 - (A & B))]);
    assert.deepEqual(r.outputs, [A ^ B]);
  }
  const half = G.run(lv, ['OR', 'AND', null, 'AND'], [1, 0]);
  assert.deepEqual(half.slots, [1, 0, null, null]);
  assert.deepEqual(half.outputs, [null]);
  const rows = G.table(lv, ['OR', 'AND', null, 'AND']);
  assert.ok(rows.every((row) => row.ok === null && row.got[0] === null));
  const s = G.score(lv, ['OR', 'OR', 'NOT', 'AND']);    // (A OR B) AND NOT (A OR B) is always 0
  assert.equal(s.match, 2);
  assert.equal(s.wrong, 2);
  assert.deepEqual(s.rows.map((row) => row.ok), [true, false, false, true]);
  assert.equal(G.score(lv, gates).solved, true);
});

test('every level can be solved with its slots and gates: the solver tries every gate in every slot', () => {
  L.forEach((lv, n) => {
    const where = `level ${n + 1} (${lv.title})`;
    const combos = lv.slots.map((_, i) => G.choices(lv, i).length).reduce((a, b) => a * b, 1);
    let tried = 0;
    // count every assignment independently, to show the search is complete
    (function walk(i, pick) {
      if (i === lv.slots.length) {
        tried++;
        return;
      }
      for (const id of G.choices(lv, i)) walk(i + 1, pick.concat(id));
    })(0, []);
    assert.equal(tried, combos);
    const sols = G.solutions(lv);
    assert.ok(sols.length >= 1, `${where} cannot be solved`);
    assert.ok(sols.length <= (lv.max || 1), `${where} has ${sols.length} answers`);
    for (const s of sols) {
      assert.equal(G.score(lv, s).solved, true);
      s.forEach((id, i) => assert.ok(lv.palette.includes(id) && G.fits(lv.slots[i], id), `${where}: slot ${i + 1} gets ${id}`));
    }
  });
});

test('the answers teach what they say: single gates, De Morgan and NAND only', () => {
  const only = (title) => G.solutions(find(title));
  assert.deepEqual(only('First light'), [['AND']]);
  assert.deepEqual(only('Any will do'), [['OR']]);
  assert.deepEqual(only('Upside down'), [['NOT']]);
  assert.deepEqual(only('One or the other'), [['XOR']]);
  assert.deepEqual(only('Anything but both'), [['NAND']]);
  assert.deepEqual(only('Lights out'), [['NOR']]);
  assert.deepEqual(only('Two-step NAND'), [['AND', 'NOT']]);
  assert.deepEqual(only('If A, then B'), [['NOT', 'OR']]);
  assert.deepEqual(only('Neither one'), [['NOT', 'NOT', 'AND']]);
  assert.deepEqual(only('Not both'), [['NOT', 'NOT', 'OR']]);
  for (const title of ['No NOT allowed', 'AND the long way', 'OR from NAND', 'Four of a kind']) {
    const sols = only(title);
    assert.equal(sols.length, 1, title);
    assert.ok(sols[0].every((id) => id === 'NAND'), `${title} is all NAND`);
  }
  // De Morgan: the two-gate circuits have exactly the NOR and NAND tables
  const nor = find('Neither one');
  const nand = find('Not both');
  for (const [A, B] of allRows(nor)) {
    assert.equal(G.run(nor, ['NOT', 'NOT', 'AND'], [A, B]).outputs[0], G.apply('NOR', [A, B]));
    assert.equal(G.run(nand, ['NOT', 'NOT', 'OR'], [A, B]).outputs[0], G.apply('NAND', [A, B]));
  }
});

test('the adders really add', () => {
  const half = find('Half adder');
  assert.deepEqual(half.outputs.map((o) => o.name), ['C', 'S']);
  for (const sol of G.solutions(half)) {
    for (const [A, B] of allRows(half)) {
      const [C, S] = G.run(half, sol, [A, B]).outputs;
      assert.equal(2 * C + S, A + B, `half adder ${A}+${B}`);
    }
  }
  const full = find('Full adder');
  assert.deepEqual(full.outputs.map((o) => o.name), ['Cout', 'S']);
  const sols = G.solutions(full);
  assert.equal(sols.length, 2, 'the carry gate can be OR or XOR');
  for (const sol of sols) {
    for (const [A, B, Cin] of allRows(full)) {
      const [Cout, S] = G.run(full, sol, [A, B, Cin]).outputs;
      assert.equal(2 * Cout + S, A + B + Cin, `full adder ${A}+${B}+${Cin}`);
    }
  }
  // two full adders chained add 2-bit numbers: every pair from 0 + 0 to 3 + 3
  const sol = sols[0];
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      const lo = G.run(full, sol, [x & 1, y & 1, 0]).outputs;
      const hi = G.run(full, sol, [x >> 1, y >> 1, lo[0]]).outputs;
      assert.equal(4 * hi[0] + 2 * hi[1] + lo[1], x + y, `${x} + ${y}`);
    }
  }
});

test('the other real circuits do their jobs', () => {
  const mux = find('Data selector');
  assert.deepEqual(mux.inputs.map((p) => p.name), ['S', 'A', 'B']);
  const muxSol = G.solutions(mux)[0];
  for (const [S, A, B] of allRows(mux)) assert.equal(G.run(mux, muxSol, [S, A, B]).outputs[0], S ? B : A);
  const vote = find('Majority vote');
  for (const sol of G.solutions(vote)) {
    for (const bits of allRows(vote)) assert.equal(G.run(vote, sol, bits).outputs[0], bits.filter(Boolean).length >= 2 ? 1 : 0);
  }
  const parity = find('Parity check');
  const pSol = G.solutions(parity)[0];
  for (const bits of allRows(parity)) assert.equal(G.run(parity, pSol, bits).outputs[0], bits.filter(Boolean).length % 2);
  const eq = find('Equal numbers');
  assert.equal(G.rowCount(eq), 16);
  const eSol = G.solutions(eq)[0];
  assert.deepEqual(eSol, ['XOR', 'XOR', 'NOR']);
  for (const [A1, A0, B1, B0] of allRows(eq)) assert.equal(G.run(eq, eSol, [A1, A0, B1, B0]).outputs[0], 2 * A1 + A0 === 2 * B1 + B0 ? 1 : 0);
});

test('hints name a wrong slot first, then an empty one, and following them solves every level', () => {
  const lv = find('Two-step NAND');
  assert.deepEqual(G.hint(lv, [null, null]), { kind: 'empty', slot: 0, gate: 'AND' });
  assert.deepEqual(G.hint(lv, ['OR', null]), { kind: 'wrong', slot: 0, gate: 'AND', has: 'OR' });
  assert.deepEqual(G.hint(lv, ['AND', 'AND']), { kind: 'wrong', slot: 1, gate: 'NOT', has: 'AND' });
  assert.deepEqual(G.hint(lv, ['AND', 'NOT']), { kind: 'solved' });
  // the hint aims at the nearest answer: an XOR carry gate in the full adder is kept
  const full = find('Full adder');
  const h = G.hint(full, ['AND', 'XOR', 'AND', null, 'XOR']);
  assert.deepEqual(h, { kind: 'empty', slot: 3, gate: 'XOR' });
  L.forEach((level, n) => {
    // start from a wrong gate in every slot where one exists
    let gates = level.slots.map((_, i) => G.choices(level, i).find((id) => !G.solutions(level).some((s) => s[i] === id)) || null);
    for (let steps = 0; steps <= 2 * level.slots.length && !G.score(level, gates).solved; steps++) {
      const next = G.hint(level, gates);
      assert.ok(next.kind === 'wrong' || next.kind === 'empty', `level ${n + 1}: ${next.kind}`);
      gates = gates.slice();
      gates[next.slot] = next.gate;
    }
    assert.equal(G.score(level, gates).solved, true, `level ${n + 1}: hints did not reach an answer`);
  });
});

test('tapping a slot steps through the gates it can take, round and round', () => {
  const lv = find('Lights out');                        // all six in the box, two wires in
  const seen = [];
  let id = null;
  for (let k = 0; k < 6; k++) {
    id = G.cycle(lv, 0, id);
    seen.push(id);
  }
  assert.deepEqual(seen, ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'AND']);
  const one = find('Upside down');                      // one wire: NOT fits
  assert.deepEqual([G.cycle(one, 0, null), G.cycle(one, 0, 'AND'), G.cycle(one, 0, 'OR'), G.cycle(one, 0, 'NOT')], ['AND', 'OR', 'NOT', 'AND']);
});

test('every board lays out cleanly: no wire through a part, no wires on top of each other', () => {
  const EPS = 1e-6;
  L.forEach((lv, n) => {
    const where = `level ${n + 1} (${lv.title})`;
    const lay = G.layout(lv);
    const node = (src) => (src.kind === 'in' ? lay.inputs[src.i] : lay.slots[src.i]);
    const segs = [];
    lay.wires.forEach((w, wi) => {
      const from = node(w.src);
      const to = w.dest.kind === 'slot' ? lay.slots[w.dest.i] : lay.outputs[w.dest.i];
      const [sx, sy] = w.path[0];
      const [px, py] = w.path[w.path.length - 1];
      assert.ok(Math.abs(sx - (from.x + from.hw)) < EPS && Math.abs(sy - from.y) < EPS, `${where}: a wire starts away from its source`);
      assert.ok(Math.abs(px - (to.x - to.hw)) < EPS, `${where}: a wire ends away from its pin`);
      const pinY = w.dest.kind === 'slot' && lv.slots[w.dest.i].in.length === 2 ? to.y + (w.dest.pin ? G.GEO.pin : -G.GEO.pin) : to.y;
      assert.ok(Math.abs(py - pinY) < EPS, `${where}: a wire misses its pin`);
      w.path.slice(1).forEach((p, k) => {
        const a = w.path[k];
        const flat = Math.abs(a[1] - p[1]) < EPS;
        const upright = Math.abs(a[0] - p[0]) < EPS;
        assert.ok(flat !== upright, `${where}: wires run straight across or straight down`);
        segs.push({ wi, net: w.net, k, a, b: p, flat, last: k === w.path.length - 2, first: k === 0, from, to });
      });
    });
    // no wire passes through any part (it may only touch its own ends)
    for (const s of segs) {
      for (const nd of lay.nodes) {
        const x0 = Math.min(s.a[0], s.b[0]);
        const x1 = Math.max(s.a[0], s.b[0]);
        const y0 = Math.min(s.a[1], s.b[1]);
        const y1 = Math.max(s.a[1], s.b[1]);
        const ox = Math.min(x1, nd.x + nd.hw) - Math.max(x0, nd.x - nd.hw);
        const oy = Math.min(y1, nd.y + nd.hh) - Math.max(y0, nd.y - nd.hh);
        const inside = s.flat ? s.a[1] > nd.y - nd.hh - G.GEO.clear + EPS && s.a[1] < nd.y + nd.hh + G.GEO.clear - EPS && ox > EPS
          : s.a[0] > nd.x - nd.hw + EPS && s.a[0] < nd.x + nd.hw - EPS && oy > EPS;
        assert.ok(!inside, `${where}: a wire from ${s.net} runs through a ${nd.kind} part`);
      }
    }
    // wires from different sources never run along each other
    for (const s of segs) {
      for (const t of segs) {
        if (s.net === t.net || s.flat !== t.flat) continue;
        const gap = s.flat ? Math.abs(s.a[1] - t.a[1]) : Math.abs(s.a[0] - t.a[0]);
        const lo = (u) => (s.flat ? Math.min(u.a[0], u.b[0]) : Math.min(u.a[1], u.b[1]));
        const hi = (u) => (s.flat ? Math.max(u.a[0], u.b[0]) : Math.max(u.a[1], u.b[1]));
        const overlap = Math.min(hi(s), hi(t)) - Math.max(lo(s), lo(t));
        assert.ok(!(gap < 0.2 && overlap > EPS), `${where}: wires from ${s.net} and ${t.net} run along each other`);
      }
    }
    // a few crossings at most, each with room for its bridge
    assert.ok(lay.crossings.length <= 2, `${where}: ${lay.crossings.length} crossings`);
    for (const c of lay.crossings) {
      const w = lay.wires[c.wire];
      const a = w.path[c.seg];
      const b = w.path[c.seg + 1];
      const d = Math.min(Math.hypot(c.x - a[0], c.y - a[1]), Math.hypot(c.x - b[0], c.y - b[1]));
      assert.ok(d >= 0.2, `${where}: a crossing too near a corner`);
    }
    // junction dots sit on a wire of their own source
    for (const j of lay.junctions) {
      const on = segs.some((s) => s.net === j.net && j.x >= Math.min(s.a[0], s.b[0]) - EPS && j.x <= Math.max(s.a[0], s.b[0]) + EPS && j.y >= Math.min(s.a[1], s.b[1]) - EPS && j.y <= Math.max(s.a[1], s.b[1]) + EPS);
      assert.ok(on, `${where}: a junction dot off its wire`);
    }
    // the board contains everything
    const b = lay.bounds;
    for (const nd of lay.nodes) assert.ok(nd.x - nd.hw > b.minX && nd.x + nd.hw < b.maxX && nd.y - nd.hh > b.minY && nd.y + nd.hh < b.maxY, `${where}: a part off the board`);
  });
});

test('every message, word for word', () => {
  const lv = find('Two-step NAND');
  const s = G.score(lv, ['AND', null]);
  assert.equal(G.say.start(7, lv), 'Level 7: Two-step NAND. Fill the 2 slots so every row of the table ticks.');
  assert.equal(G.say.start(1, find('First light')), 'Level 1: First light. Fill the slot so every row of the table ticks.');
  assert.equal(G.say.placed(1, 'AND', false, s), 'AND in slot 1. 0 of 4 rows match.');
  assert.equal(G.say.placed(2, 'NAND', true, { match: 4, total: 4 }), 'NAND in slot 2. Its inputs are joined, so NAND flips the signal, just like NOT. 4 of 4 rows match.');
  assert.equal(G.say.noFit(), 'NOT has only one input, so it only fits a slot with one wire going in.');
  assert.equal(G.say.notInBox('XOR', ['AND', 'OR', 'NOT']), 'There is no XOR in this level. You can use AND, OR and NOT.');
  assert.equal(G.say.lamp('Q', 1, 1), 'Q is 1, as it should be.');
  assert.equal(G.say.lamp('Q', 0, 1), 'Q is 0, but should be 1.');
  assert.equal(G.say.lamp('Q', null, 1), 'Q has no signal yet.');
  assert.equal(G.say.flip('A', 1), 'A is on (1).');
  assert.equal(G.say.testRow(lv, [1, 0], [1], true), 'A=1 B=0: Q=1 ✓');
  assert.equal(G.say.testRow(lv, [1, 1], [null], null), 'A=1 B=1: Q=? ?');
  assert.equal(G.say.tested(G.score(lv, ['OR', 'NOT']), lv), '2 of 4 rows match. The first wrong row is A=0 B=1.');
  assert.equal(G.say.tested(G.score(lv, ['AND', 'NOT']), lv), 'All 4 rows match!');
  assert.equal(G.say.hintWrong(2), 'Slot 2 holds the wrong gate. Press H again for a suggestion.');
  assert.equal(G.say.hintTry(1, 'XOR'), 'Try XOR in slot 1.');
  assert.equal(G.say.solved(3), 'Level 3 solved! Every row of the truth table matches.');
  assert.equal(G.say.slotFocus(lv, 1, null), 'Slot 2: one wire in, from slot 1. Empty.');
  assert.equal(G.say.slotFocus(lv, 0, 'AND'), 'Slot 1: two wires in, from A and B. Holds AND.');
  assert.equal(G.say.switchFocus('B', 0), 'Switch B, off (0). Enter flips it.');
  assert.equal(G.say.rows({ match: 3, total: 8 }), '3 of 8 rows match');
});
