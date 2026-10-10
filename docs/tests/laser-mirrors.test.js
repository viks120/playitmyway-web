/* Laser Mirrors tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/laser-mirrors/optics.js and prove every level
 * can be solved, by trying every setting of its turnable pieces, that each
 * has one answer, and that the groups get harder. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const O = require(path.join(__dirname, '..', '..', 'games', 'laser-mirrors', 'optics.js'));

const LEVELS = O.LEVELS.map((l) => O.parse(l));
const SOLS = LEVELS.map((lv) => O.solve(lv));
const kinds = (lv, list) => list.map((c) => lv.cells[c].kind);
const needs = (lv) => lv.crystals.map((c) => lv.cells[c].need);
const colours = (lv) => lv.sources.map((c) => lv.cells[c].col);
const group = (i) => Math.floor(i / 6);

test('24 levels in four groups of six, each a sensible size with lasers, crystals and turnable pieces', () => {
  assert.equal(O.LEVELS.length, 24);
  assert.deepEqual(O.GROUPS.map((g) => [g.from, g.to]), [[0, 6], [6, 12], [12, 18], [18, 24]]);
  LEVELS.forEach((lv, i) => {
    const name = `level ${i + 1}`;
    // small enough for squares big enough to tap on a phone
    assert.ok(lv.w >= 3 && lv.w <= 7 && lv.h >= 3 && lv.h <= 8, `${name} is ${lv.w}x${lv.h}`);
    assert.ok(lv.sources.length >= 1 && lv.crystals.length >= 1, `${name} needs a laser and a crystal`);
    // brute force tries 2^n settings, so keep n small
    assert.ok(lv.turn.length >= 1 && lv.turn.length <= 12, `${name} has ${lv.turn.length} turnable pieces`);
  });
});

test('each group brings in its own pieces', () => {
  LEVELS.forEach((lv, i) => {
    const name = `level ${i + 1}`;
    const pieces = kinds(lv, lv.turn.concat(lv.fixed));
    const g = group(i);
    if (g < 3) {
      assert.ok(colours(lv).every((c) => c === O.WHITE), `${name}: white lasers only before the colour group`);
    } else {
      assert.ok(colours(lv).includes(O.RED) && colours(lv).includes(O.BLUE), `${name}: needs a red and a blue laser`);
      assert.ok(!colours(lv).includes(O.WHITE), `${name}: no white light mixed with colours`);
      assert.ok(needs(lv).every((n) => ['red', 'blue', 'purple'].includes(n)), `${name}: coloured crystals only`);
    }
    if (g < 2) {
      assert.ok(!pieces.includes('splitter'), `${name}: no splitters yet`);
      assert.ok(needs(lv).every((n) => n === 'any'), `${name}: plain crystals only`);
    }
    if (g === 0) {
      assert.ok(lv.turn.length <= 3 && O.bits(SOLS[i].forced) <= 2, `${name}: one or two mirrors to set`);
    }
    if (g === 1) {
      assert.ok(lv.blocks.length + lv.fixed.length >= 1, `${name}: blocks or bolted mirrors`);
      assert.ok(O.bits(SOLS[i].forced) >= 3, `${name}: several mirrors to set`);
    }
    if (g === 2) {
      assert.ok(pieces.includes('splitter'), `${name}: a splitter`);
      assert.ok(needs(lv).every((n) => n === 'any' || n === 'two'), `${name}: plain and double crystals`);
    }
  });
  const doubles = LEVELS.slice(12, 18).filter((lv) => needs(lv).includes('two')).length;
  assert.ok(doubles >= 4, `only ${doubles} splitter levels have a double crystal`);
  const purples = LEVELS.slice(18).filter((lv) => needs(lv).includes('purple')).length;
  assert.ok(purples >= 4, `only ${purples} colour levels have a purple crystal`);
});

test('every level can be solved, with one answer, from a start that is not solved', () => {
  LEVELS.forEach((lv, i) => {
    const name = `level ${i + 1}`;
    const sol = SOLS[i];
    assert.ok(sol.solutions.length > 0, `${name} cannot be solved`);
    // one answer: the pieces that matter must be set one way, and the rest
    // (decoys the light never needs) can sit either way
    assert.ok(sol.unique, `${name} has more than one answer`);
    assert.ok(O.bits(sol.forced) >= 1, `${name} has nothing to set`);
    for (const s of sol.solutions) assert.ok(O.trace(lv, s).solved);
    // every turnable piece can be reached by light in some setting: none is pointless
    assert.equal(sol.reached, (1 << lv.turn.length) - 1, `${name} has a piece no light can reach`);
    const start = O.trace(lv, lv.start);
    assert.ok(!start.solved, `${name} starts solved`);
    assert.ok(start.lit < lv.crystals.length, name);
    assert.ok(O.turnsLeft(sol, lv.start) >= 1, name);
  });
});

test('following the hints from the start solves every level in the fewest turns', () => {
  LEVELS.forEach((lv, i) => {
    const sol = SOLS[i];
    const plan = O.plan(lv, sol, lv.start);
    assert.equal(plan.length, O.turnsLeft(sol, lv.start), `level ${i + 1}`);
    let m = lv.start;
    for (const k of plan) {
      assert.ok(!O.trace(lv, m).solved, `level ${i + 1}: solved before the hints ran out`);
      m = O.flip(m, k);
    }
    assert.ok(O.trace(lv, m).solved, `level ${i + 1}: the hints do not solve it`);
    // and after a wrong turn the hint still finds the way
    const wrong = O.flip(lv.start, plan.length ? (plan[0] + 1) % lv.turn.length : 0);
    let w = wrong;
    for (const k of O.plan(lv, sol, wrong)) w = O.flip(w, k);
    assert.ok(O.trace(lv, w).solved, `level ${i + 1}: hints after a wrong turn`);
  });
});

test('the groups get harder: more ways for the light to go, and more pieces to set', () => {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const paths = [0, 1, 2, 3].map((g) => mean(SOLS.slice(g * 6, g * 6 + 6).map((s) => s.paths)));
  const forced = [0, 1, 2, 3].map((g) => mean(SOLS.slice(g * 6, g * 6 + 6).map((s) => O.bits(s.forced))));
  for (let g = 1; g < 4; g++) {
    assert.ok(paths[g] > paths[g - 1], `group ${g + 1} has fewer light paths than group ${g}: ${paths}`);
  }
  assert.ok(forced[1] > forced[0] && forced[3] > forced[0], `forced pieces per group: ${forced}`);
  // the first level of all is a single turn
  assert.equal(O.turnsLeft(SOLS[0], LEVELS[0].start), 1);
});

test('mirrors turn light a right angle: / swaps up and right, \\ swaps up and left', () => {
  const [UP, RIGHT, DOWN, LEFT] = [0, 1, 2, 3];
  assert.deepEqual([UP, RIGHT, DOWN, LEFT].map((d) => O.reflect(d, 0)), [RIGHT, UP, LEFT, DOWN]);
  assert.deepEqual([UP, RIGHT, DOWN, LEFT].map((d) => O.reflect(d, 1)), [LEFT, DOWN, RIGHT, UP]);
  // a beam heading right meets a / and goes up to the crystal; a \ sends it down
  const lv = O.parse(['.. .. Cw', '>w .. M/', '.. .. ..']);
  assert.equal(O.trace(lv, 0).lit, 1);
  assert.equal(O.trace(lv, 1).lit, 0);
});

test('blocks, lasers and crystals stop light; beams cross without touching', () => {
  // a block between laser and crystal
  assert.equal(O.trace(O.parse(['>w ## Cw']), 0).lit, 0);
  // the first crystal soaks up the beam, so the one behind it stays dark
  const two = O.trace(O.parse(['>w Cw Cw']), 0);
  assert.deepEqual(two.state, ['lit', 'dark']);
  // a laser's back stops a beam
  assert.equal(O.trace(O.parse(['>w <w Cw']), 0).lit, 0);
  // two beams cross in the middle and both reach their crystals
  const cross = O.trace(O.parse(['.. vw ..', '>w .. Cw', '.. Cw ..']), 0);
  assert.equal(cross.lit, 2);
  // light leaving the bench just goes
  assert.equal(O.trace(O.parse(['>w .. ..', '.. .. Cw']), 0).lit, 0);
});

test('splitters send light both on and turned; light going round a loop stops', () => {
  const lv = O.parse(['.. .. Cw ..', '>w .. s/ Cw']);
  const tr = O.trace(lv, 0);
  assert.equal(tr.lit, 2, 'straight through and turned up');
  // a splitter feeds a ring of four mirrors: without a stop the light would
  // go round for ever, but the trace ends once the light repeats itself
  const loop = O.parse(['m/ .. m\\', '.. .. ..', 'm\\ s/ m/', '.. ^w ..']);
  const t = O.trace(loop, 0);
  for (const c of [0, 2, 6, 7, 8]) assert.ok(t.glint[c], `light reaches square ${c}`);
  // a double crystal needs beams from two sides
  const dbl = O.parse(['.. vw ..', '>w C2 ..']);
  assert.equal(O.trace(dbl, 0).state[0], 'lit');
  const one = O.parse(['.. .. ..', '>w C2 ..']);
  assert.equal(O.trace(one, 0).state[0], 'part');
});

test('crystal colours: red needs red only, blue needs blue only, purple needs both', () => {
  const s = O.crystalState;
  const { RED, BLUE, PURPLE, WHITE } = O;
  assert.equal(s('any', 0, 0), 'dark');
  assert.equal(s('any', WHITE, 1), 'lit');
  assert.equal(s('two', WHITE, 1), 'part');
  assert.equal(s('two', WHITE, 5), 'lit');
  assert.equal(s('red', RED, 1), 'lit');
  assert.equal(s('red', BLUE, 1), 'wrong');
  assert.equal(s('red', PURPLE, 3), 'wrong');
  assert.equal(s('blue', BLUE, 1), 'lit');
  assert.equal(s('purple', RED, 1), 'part');
  assert.equal(s('purple', BLUE, 1), 'part');
  assert.equal(s('purple', PURPLE, 3), 'lit');
  // in a level: red and blue beams meet at a purple crystal
  const lv = O.parse(['.. vb ..', '>r Cp ..']);
  assert.equal(O.trace(lv, 0).state[0], 'lit');
});

test('beams are drawn as joined straight runs, purple where red and blue share a stretch', () => {
  // red and blue lasers face each other: each beam stops at the other laser's back
  const lv = O.parse(['>r .. .. <b']);
  const segs = O.segments(lv, O.trace(lv, 0));
  const purple = segs.filter((s) => s.col === O.PURPLE);
  assert.equal(purple.length, 1);
  assert.deepEqual([purple[0].x1, purple[0].x2], [1, 2]);
  assert.ok(segs.some((s) => s.col === O.RED && s.x1 === 0 && s.x2 === 1));
  assert.ok(segs.some((s) => s.col === O.BLUE && s.x1 === 2 && s.x2 === 3));
  // one beam in one straight line is one run
  const line = O.parse(['>w .. .. .. Cw']);
  assert.deepEqual(O.segments(line, O.trace(line, 0)), [{ x1: 0, y1: 0, x2: 4, y2: 0, col: O.WHITE }]);
  // a beam off the edge reaches past the bench
  const off = O.parse(['>w .. ..']);
  assert.equal(O.segments(off, O.trace(off, 0))[0].x2, 2 + O.REACH.edge);
});

test('every message, word for word', () => {
  const lv1 = LEVELS[0];
  const say = O.say;
  assert.equal(O.cellName(0, 0), 'A1');
  assert.equal(O.cellName(2, 4), 'C5');
  assert.equal(say.start(1, lv1), 'Level 1. Light the crystal. Tap the mirror on the yellow turntable (or press Enter) to turn it.');
  assert.equal(say.status(lv1, O.trace(lv1, lv1.start)), 'The crystal is still dark.');
  assert.equal(say.status(lv1, O.trace(lv1, 0)), 'The crystal is lit.');
  assert.equal(say.turned(lv1, 0), 'Turned the mirror at C2.');
  assert.equal(say.hint(lv1, 0), 'Hint: turn the mirror at C2.');
  assert.equal(say.piece(lv1, 0, 1, O.trace(lv1, 1)), 'Mirror C2, set \\, in a beam.');
  assert.equal(say.done(3, 2, 2), 'Level 3 solved in 2 turns! The fewest possible!');
  assert.equal(say.done(3, 1, 1), 'Level 3 solved in 1 turn! The fewest possible!');
  assert.equal(say.done(3, 5, 2), 'Level 3 solved in 5 turns! It can be done in 2.');
  assert.equal(say.turns(1), '1 turn');
  assert.equal(say.turns(3), '3 turns');
  assert.equal(say.undo(), 'Took that turn back.');
  assert.equal(say.noUndo(), 'Nothing to undo yet.');
  assert.equal(say.reset(), 'Back to the start.');
  const many = O.parse(['>w .. Cw', '>w .. Cw', '.. .. Cw']);
  assert.equal(say.status(many, O.trace(many, 0)), '2 of 3 crystals lit.');
  assert.equal(say.start(7, many), 'Level 7. Light all 3 crystals at once.');
  const dbl = O.parse(['.. .. ..', '>w C2 ..']);
  assert.equal(say.status(dbl, O.trace(dbl, 0)), 'The crystal is still dark. The double crystal at B2 needs a second beam from another side.');
  const red = O.parse(['>b Cr ..']);
  assert.equal(say.status(red, O.trace(red, 0)), 'The crystal is still dark. The red crystal at B1 needs red light, not blue.');
  const mixed = O.parse(['.. vb ..', '>r Cr ..']);
  assert.equal(say.status(mixed, O.trace(mixed, 0)), 'The crystal is still dark. The red crystal at B2 is getting blue light too, so it glows purple.');
  const half = O.parse(['>r Cp ..']);
  assert.equal(say.status(half, O.trace(half, 0)), 'The crystal is still dark. The purple crystal at B1 has red light and needs blue too.');
  const look = O.parse(['>w ## m/ Cw']);
  const tr = O.trace(look, 0);
  assert.equal(say.look(look, 0, tr), 'A laser at A1, firing right. Lasers never turn.');
  assert.equal(say.look(look, 1, tr), 'A block at B1. It stops any beam.');
  assert.equal(say.look(look, 2, tr), 'The mirror at C1 is bolted down. Only pieces on yellow turntables turn.');
  assert.equal(say.look(look, 3, tr), 'A crystal at D1. It needs any light. Dark.');
});
