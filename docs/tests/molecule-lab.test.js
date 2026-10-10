/* Molecule Lab tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/molecule-lab/chem.js and prove the chemistry:
 * every task's target is a real structure with every valency filled, the
 * formulas are right, isomers are told apart, the checker accepts any
 * correct build however it was put together, following the hints always
 * finishes a task, and the 3D shapes have the angles the game states. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'games', 'molecule-lab', 'chem.js');
const C = require(FILE);

// a small seeded random number generator, so every run is the same
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Build the target the way a player might: atoms in a random order, each
 * either bonded to an atom already there or dropped in on its own, then
 * the missing bonds made and the multiple bonds raised one Bond press at a
 * time, in a random order. Uses only the game's own moves. */
function playerBuild(T, rnd) {
  let m = C.empty();
  const map = new Map();                 // target id → build id
  const left = new Set(T.atoms.map((a) => a.id));
  while (left.size) {
    const list = [...left];
    const tid = list[Math.floor(rnd() * list.length)];
    const el = C.atom(T, tid).el;
    const placed = C.neighbours(T, tid).filter((nb) => map.has(nb.id));
    let r;
    if (placed.length && rnd() < 0.75) r = C.addAtom(m, el, map.get(placed[Math.floor(rnd() * placed.length)].id));
    else r = C.addAtom(m, el, null);
    assert.ok(r.mol, `could not add ${el}: ${r.error}`);
    m = r.mol;
    map.set(tid, r.id);
    left.delete(tid);
  }
  for (const b of shuffle(T.bonds, rnd)) {
    if (!C.order(m, map.get(b.a), map.get(b.b))) {
      const r = rnd() < 0.5 ? C.cycleBond(m, map.get(b.a), map.get(b.b)) : C.cycleBond(m, map.get(b.b), map.get(b.a));
      assert.equal(r.order, 1);
      m = r.mol;
    }
  }
  const ups = [];
  for (const b of T.bonds) for (let k = 1; k < b.order; k++) ups.push(b);
  for (const b of shuffle(ups, rnd)) {
    const r = C.cycleBond(m, map.get(b.a), map.get(b.b));
    assert.ok(r.order > 1, 'a Bond press should have raised the bond');
    m = r.mol;
  }
  return m;
}

// the same molecule with its atoms renumbered and listed in a new order
function relabel(m, rnd) {
  const ids = shuffle(m.atoms.map((a) => a.id), rnd);
  const to = new Map(ids.map((id, i) => [id, 100 + i * 7]));
  return {
    atoms: shuffle(m.atoms, rnd).map((a) => ({ id: to.get(a.id), el: a.el })),
    bonds: shuffle(m.bonds, rnd).map((b) => (rnd() < 0.5 ? { a: to.get(b.a), b: to.get(b.b), order: b.order } : { a: to.get(b.b), b: to.get(b.a), order: b.order })),
    next: 1000,
  };
}

test('elements: the valencies and colours of the usual teaching set', () => {
  assert.deepEqual(C.ORDER, ['H', 'C', 'N', 'O', 'Cl']);
  const v = Object.fromEntries(C.ORDER.map((el) => [el, C.ELEMENTS[el].valency]));
  assert.deepEqual(v, { H: 1, C: 4, N: 3, O: 2, Cl: 1 });
  // lone pairs come from outer electrons left after bonding: N one, O two, Cl three
  for (const el of C.ORDER) {
    const e = C.ELEMENTS[el];
    assert.equal((e.outer - e.valency) % 2, 0, el);
  }
  assert.deepEqual(C.ORDER.map((el) => C.ELEMENTS[el].key), ['h', 'c', 'n', 'o', 'l']);
});

test('20 tasks in five groups, every target a real, finished molecule', () => {
  assert.equal(C.TASKS.length, 20);
  assert.deepEqual(C.GROUPS.map((g) => [g.from, g.to]), [[0, 5], [5, 9], [9, 13], [13, 17], [17, 20]]);
  const names = C.TASKS.map((t) => t.name);
  assert.deepEqual(names, ['hydrogen', 'hydrogen chloride', 'water', 'ammonia', 'methane', 'oxygen', 'nitrogen',
    'carbon dioxide', 'hydrogen cyanide', 'ethane', 'ethene', 'ethyne', 'chloromethane', 'methanol', 'ethanol',
    'ethanal', 'methanoic acid', 'methoxymethane', 'propane', 'propene']);
  for (const t of C.TASKS) {
    const m = t.mol;
    for (const a of m.atoms) assert.equal(C.free(m, a.id), 0, `${t.name}: ${a.el} ${a.id} has an open slot`);
    assert.equal(C.pieces(m), 1, `${t.name} is in pieces`);
    assert.deepEqual(C.counts(m), C.countFormula(t.formula), `${t.name}: ${t.formula} does not match the structure`);
    assert.ok(m.atoms.length <= 12, `${t.name} is too big`);
    for (const k of ['tip', 'how', 'fact']) assert.ok(t[k] && t[k].length > 10, `${t.name} has no ${k}`);
  }
});

test('formulas, as written and with subscripts', () => {
  const written = C.TASKS.map((t) => C.sub(t.formula));
  assert.deepEqual(written, ['H₂', 'HCl', 'H₂O', 'NH₃', 'CH₄', 'O₂', 'N₂', 'CO₂', 'HCN', 'C₂H₆', 'C₂H₄', 'C₂H₂', 'CH₃Cl',
    'CH₃OH', 'C₂H₅OH', 'CH₃CHO', 'HCOOH', 'CH₃OCH₃', 'C₃H₈', 'C₃H₆']);
  // molecular formulas, carbon compounds in Hill order
  const hill = C.TASKS.map((t) => C.formula(t.mol));
  assert.deepEqual(hill, ['H2', 'HCl', 'H2O', 'NH3', 'CH4', 'O2', 'N2', 'CO2', 'CHN', 'C2H6', 'C2H4', 'C2H2', 'CH3Cl',
    'CH4O', 'C2H6O', 'C2H4O', 'CH2O2', 'C2H6O', 'C3H8', 'C3H6']);
  assert.deepEqual(C.countFormula('C2H5OH'), { C: 2, H: 6, O: 1 });
  assert.deepEqual(C.countFormula('CH3CHO'), { C: 2, H: 4, O: 1 });
  assert.deepEqual(C.countFormula('CH3CH(OH)CH3'), { C: 3, H: 8, O: 1 });
  assert.deepEqual(C.countFormula('C2H4(OH)2'), { C: 2, H: 6, O: 2 });
  assert.throws(() => C.countFormula('C2X'));
  assert.throws(() => C.countFormula('C2(H'));
});

test('the bonds in each target, bond by bond', () => {
  const multiple = (t) => t.mol.bonds.filter((b) => b.order > 1).map((b) => `${C.atom(t.mol, b.a).el}${C.BOND_MARK[b.order]}${C.atom(t.mol, b.b).el}`).sort();
  const byName = Object.fromEntries(C.TASKS.map((t) => [t.name, multiple(t)]));
  assert.deepEqual(byName, {
    hydrogen: [], 'hydrogen chloride': [], water: [], ammonia: [], methane: [],
    oxygen: ['O=O'], nitrogen: ['N≡N'], 'carbon dioxide': ['C=O', 'O=C'], 'hydrogen cyanide': ['C≡N'],
    ethane: [], ethene: ['C=C'], ethyne: ['C≡C'], chloromethane: [],
    methanol: [], ethanol: [], ethanal: ['C=O'], 'methanoic acid': ['C=O'],
    methoxymethane: [], propane: [], propene: ['C=C'],
  });
  // where the oxygen sits tells ethanol and methoxymethane apart
  const oxygenNeighbours = (t) => {
    const o = t.mol.atoms.find((a) => a.el === 'O');
    return C.neighbours(t.mol, o.id).map((nb) => C.atom(t.mol, nb.id).el).sort().join('');
  };
  assert.equal(oxygenNeighbours(C.TASKS[14]), 'CH');
  assert.equal(oxygenNeighbours(C.TASKS[17]), 'CC');
});

test('isomers are told apart; every molecule the lab knows is different from every other', () => {
  const find = (name) => C.LIBRARY.find((e) => e.name === name).mol;
  assert.equal(C.match(find('ethanol'), find('methoxymethane')), null);
  assert.equal(C.match(find('propene'), find('cyclopropane')), null);
  assert.equal(C.match(find('ethanal'), find('epoxyethane')), null);
  assert.equal(C.match(find('ethanal'), find('ethenol')), null);
  assert.equal(C.match(find('butane'), find('methylpropane')), null);
  assert.equal(C.match(find('but-1-ene'), find('but-2-ene')), null);
  assert.equal(C.match(find('propan-1-ol'), find('propan-2-ol')), null);
  assert.equal(C.match(find('ethanoic acid'), find('methyl methanoate')), null);
  // pairs with the same formula really are there to tell apart
  const byFormula = {};
  for (const e of C.LIBRARY) {
    const f = C.formula(e.mol);
    byFormula[f] = (byFormula[f] || 0) + 1;
  }
  for (const f of ['C2H6O', 'C3H6', 'C4H10', 'C4H8', 'C2H4O', 'C2H4O2', 'C3H8O']) assert.ok(byFormula[f] >= 2, f);
  assert.ok(C.LIBRARY.length > 50, 'the page promises more than 50 named molecules');
  const names = new Set();
  C.LIBRARY.forEach((a, i) => {
    assert.ok(!names.has(a.name), `${a.name} twice`);
    names.add(a.name);
    for (const at of a.mol.atoms) assert.equal(C.free(a.mol, at.id), 0, `${a.name} has an open slot`);
    assert.deepEqual(C.counts(a.mol), C.countFormula(a.formula), `${a.name} formula`);
    C.LIBRARY.forEach((b, j) => {
      if (i !== j) assert.equal(C.match(a.mol, b.mol), null, `${a.name} matched ${b.name}`);
    });
  });
});

test('the checker accepts any correct build, whatever order it was made in', () => {
  const rnd = rng(20261009);
  for (const t of C.TASKS) {
    for (let k = 0; k < 40; k++) {
      const m = playerBuild(t.mol, rnd);
      const r = C.check(m, t.mol);
      assert.ok(r.done, `${t.name} build ${k} not accepted`);
      // the map pairs every target atom with a build atom of the same element
      assert.equal(r.map.size, t.mol.atoms.length);
      for (const [tid, bid] of r.map) assert.equal(C.atom(t.mol, tid).el, C.atom(m, bid).el);
      assert.ok(C.check(relabel(m, rnd), t.mol).done, `${t.name} relabelled not accepted`);
    }
  }
  // the library too, rings included
  for (const e of C.LIBRARY) {
    for (let k = 0; k < 6; k++) assert.ok(C.check(playerBuild(e.mol, rnd), e.mol).done, e.name);
  }
});

test('the checker rejects: missing or extra atoms, open slots, two pieces, a wrong bond, an isomer', () => {
  const rnd = rng(7);
  for (const t of C.TASKS) {
    const m = playerBuild(t.mol, rnd);
    const leaf = m.atoms.find((a) => C.neighbours(m, a.id).length === 1);
    assert.equal(C.check(C.removeAtom(m, leaf.id), t.mol).done, false, `${t.name} with an atom missing`);
    assert.equal(C.check(C.addAtom(m, 'H', null).mol, t.mol).done, false, `${t.name} with an extra atom`);
    for (const b of m.bonds) {
      const lower = C.setOrder(m, b.a, b.b, b.order - 1);
      const r = C.check(lower, t.mol);
      assert.equal(r.done, false, `${t.name} with a weaker bond`);
      assert.ok(r.open >= 2 || r.pieces > 1);
    }
  }
  const water = C.parse('O');
  const twoPieces = C.addAtom(C.addAtom(C.addAtom(C.empty(), 'H', null).mol, 'H', 1).mol, 'O', null).mol;   // H–H and a lone O
  const r = C.check(twoPieces, water);
  assert.equal(r.done, false);
  assert.equal(r.pieces, 2);
  const ethanol = C.TASKS[14];
  const isomer = C.check(C.TASKS[17].mol, ethanol.mol);
  assert.equal(isomer.done, false);
  assert.equal(isomer.full, true, 'methoxymethane is a finished molecule, just not ethanol');
  assert.equal(C.recognise(C.TASKS[17].mol).name, 'methoxymethane');
  assert.equal(C.check(C.parse('C1CC1'), C.TASKS[19].mol).done, false, 'cyclopropane is not propene');
});

test('building moves: adding, full atoms, the Bond cycle and deleting', () => {
  let r = C.addAtom(C.empty(), 'O', null);
  let m = r.mol;
  const o = r.id;
  r = C.addAtom(m, 'H', o);
  m = r.mol;
  const h1 = r.id;
  m = C.addAtom(m, 'H', o).mol;
  assert.equal(C.free(m, o), 0);
  assert.deepEqual(C.addAtom(m, 'H', o), { error: 'full', id: o });
  // hydrogen cannot double bond: one press takes the bond away, and says why
  const gone = C.cycleBond(m, o, h1);
  assert.equal(gone.order, 0);
  assert.equal(gone.stop, h1);
  assert.equal(C.say.bondGone('O', 'H', gone.was, 'H'), 'Hydrogen has no room for another bond, so the O–H bond can’t be double: bond removed.');
  // N–N goes single, double, triple, then none
  let n = C.addAtom(C.addAtom(C.empty(), 'N', null).mol, 'N', 1).mol;
  const seen = [];
  for (let k = 0; k < 4; k++) {
    const x = C.cycleBond(n, 1, 2);
    seen.push(x.order);
    n = x.mol;
  }
  assert.deepEqual(seen, [2, 3, 0, 1]);
  assert.equal(C.say.bondGone('N', 'N', 3, null), 'N–N bond removed: a triple bond is the most two atoms can share.');
  // O–O: single, double, then none (oxygen has room for only two)
  let oo = C.addAtom(C.addAtom(C.empty(), 'O', null).mol, 'O', 1).mol;
  assert.equal(C.cycleBond(oo, 1, 2).order, 2);
  oo = C.cycleBond(oo, 1, 2).mol;
  assert.equal(C.cycleBond(oo, 1, 2).order, 0);
  assert.equal(C.cycleBond(oo, 1, 1).error, 'same');
  // ids are never reused, so the game can keep every atom's place
  const del = C.deleteAtom(m, o);
  assert.deepEqual(del.mol.atoms, []);
  assert.equal(del.gone.length, 3, 'deleting the oxygen takes its two hydrogens with it');
  assert.equal(C.addAtom(del.mol, 'C', null).id, 4);
  assert.equal(C.say.removed('O', 2), 'Removed an oxygen and its 2 hydrogens.');
  // the lab's limit
  let big = C.empty();
  for (let k = 0; k < C.MAX_ATOMS; k++) big = C.addAtom(big, 'C', null).mol;
  assert.equal(C.addAtom(big, 'H', null).error, 'max');
});

test('hints: the next step, worded for the player', () => {
  const water = C.TASKS[2];
  assert.equal(C.hint(C.empty(), water).text, 'Start with an oxygen (O).');
  let m = C.addAtom(C.empty(), 'O', null).mol;
  m = C.addAtom(m, 'H', 1).mol;
  const h = C.hint(m, water);
  assert.equal(h.text, 'Oxygen needs 2 bonds: it has 1. Add a hydrogen to it (it is selected).');
  assert.equal(h.focus, 1);
  assert.deepEqual(h.action, { type: 'add', el: 'H', to: 1 });

  const ammonia = C.TASKS[3];
  let nh4 = C.parse('N');
  nh4 = C.addAtom(nh4, 'H', null).mol;
  assert.equal(C.hint(nh4, ammonia).text, 'Ammonia, NH₃, has 3 hydrogens: you have 4. One is selected: delete it.');
  assert.equal(C.hint(nh4, ammonia).focus, 5, 'the hydrogen on its own is the one to go');

  const oxygen = C.TASKS[5];
  const single = C.addAtom(C.addAtom(C.empty(), 'O', null).mol, 'O', 1).mol;
  assert.equal(C.hint(single, oxygen).text, 'Oxygen needs 2 bonds: it has 1. Make the O–O bond double: both atoms are selected, so press Bond (B).');

  const hcn = C.TASKS[8];
  let hc = C.addAtom(C.addAtom(C.empty(), 'H', null).mol, 'C', 1).mol;
  hc = C.addAtom(hc, 'N', 2).mol;
  assert.equal(C.hint(hc, hcn).text, 'Carbon needs 4 bonds: it has 2. Make the C–N bond triple: both atoms are selected, so press Bond (B) twice.');

  const loose = C.addAtom(C.addAtom(C.empty(), 'O', null).mol, 'H', null).mol;
  assert.equal(C.hint(loose, water).text, 'Hydrogen needs 1 bond: it has 0. Join it to the oxygen: both are selected, so press Bond (B).');

  // ethyne built for ethene: the triple bond is the problem
  assert.equal(C.hint(C.parse('C#C'), C.TASKS[10]).text, 'Ethene has no C≡C triple bond. Both atoms are selected: press Bond (B) to change it.');
  // methoxymethane built for ethanol: the hint says how ethanol is put together
  assert.match(C.hint(C.TASKS[17].mol, C.TASKS[14]).text, /^In ethanol, the chain goes C–C–O, and the oxygen is bonded to one carbon and one hydrogen\./);
  assert.match(C.hint(C.empty(), null).text, /^Try building /);
});

test('following the hints alone finishes every task, even from a wrong start', () => {
  function follow(m, task) {
    for (let step = 0; step < 80; step++) {
      if (C.check(m, task.mol).done) return { m, step };
      const h = C.hint(m, task);
      assert.ok(h.action, `${task.name}: no action at "${h.text}"`);
      const a = h.action;
      if (a.type === 'add') m = C.addAtom(m, a.el, a.to).mol;
      else if (a.type === 'delete') m = C.deleteAtom(m, a.id).mol;
      else m = C.cycleBond(m, a.a, a.b).mol;
      assert.ok(m, `${task.name}: the hint's step failed`);
    }
    assert.fail(`${task.name}: the hints never finished it`);
  }
  for (const t of C.TASKS) {
    const { step } = follow(C.empty(), t);
    assert.ok(step <= t.mol.atoms.length + t.mol.bonds.length * 3, `${t.name} took ${step} steps`);
  }
  follow(C.parse('C#C'), C.TASKS[10]);                 // ethyne, when ethene was wanted
  follow(C.parse('CCC'), C.TASKS[9]);                  // one carbon too many for ethane
  follow(C.parse('C=O'), C.TASKS[15]);                 // methanal: a start on ethanal
  follow(C.addAtom(C.parse('O'), 'Cl', null).mol, C.TASKS[2]);   // a stray chlorine
});

test('shapes: the name and bond angle the game shows for each task', () => {
  const want = {
    hydrogen: ['Linear: two atoms always sit in a straight line', null],
    'hydrogen chloride': ['Linear: two atoms always sit in a straight line', null],
    water: ['Bent', 'H–O–H 104.5'],
    ammonia: ['Trigonal pyramidal', 'H–N–H 107'],
    methane: ['Tetrahedral', 'H–C–H 109.5'],
    oxygen: ['Linear: two atoms always sit in a straight line', null],
    nitrogen: ['Linear: two atoms always sit in a straight line', null],
    'carbon dioxide': ['Linear: the whole molecule is a straight line', 'O=C=O 180'],
    'hydrogen cyanide': ['Linear: the whole molecule is a straight line', 'H–C≡N 180'],
    ethane: ['Tetrahedral around both carbons', 'H–C–H 109.5'],
    ethene: ['Trigonal planar around both carbons', 'H–C=C 120'],
    ethyne: ['Linear: the whole molecule is a straight line', 'H–C≡C 180'],
    chloromethane: ['Tetrahedral', 'H–C–Cl 109.5'],
    methanol: ['Tetrahedral around the carbon, bent around the oxygen', 'H–C–H 109.5'],
    ethanol: ['Tetrahedral around both carbons, bent around the oxygen', 'C–C–O 109.5'],
    ethanal: ['Tetrahedral around one carbon, trigonal planar around the other', 'H–C=O 120'],
    'methanoic acid': ['Trigonal planar around the carbon, bent around the oxygen', /^O(–C=|=C–)O 120$/],
    methoxymethane: ['Tetrahedral around both carbons, bent around the oxygen', 'C–O–C 104.5'],
    propane: ['Tetrahedral around each carbon', 'C–C–C 109.5'],
    propene: ['Trigonal planar around two carbons, tetrahedral around the third', 'H–C=C 120'],
  };
  const rnd = rng(3);
  for (const t of C.TASKS) {
    // checked on a player's build, so the angle is found through the match
    const m = playerBuild(t.mol, rnd);
    const r = C.check(m, t.mol);
    const geo = C.geometry(m);
    const head = C.headline(m, geo, t, r.map);
    const [shape, angle] = want[t.name];
    assert.equal(C.shapeText(geo.centres), shape, t.name);
    if (angle === null) assert.equal(head, null, t.name);
    else if (angle instanceof RegExp) assert.match(`${head.label} ${head.angle}`, angle, t.name);
    else assert.equal(`${head.label} ${head.angle}`, angle, t.name);
    if (head) assert.ok(Math.abs(C.angleAt(geo.pos, head.centre, head.ends[0], head.ends[1]) - head.angle) < 0.1, `${t.name}: the model's angle`);
  }
  assert.equal(C.say.done(C.TASKS[2], 'Bent', { label: 'H–O–H', angle: 104.5 }), 'Correct! Water, H₂O. Bent, H–O–H about 104.5°.');
});

test('3D shapes: every centre has its ideal angles, flat round double bonds, no atoms crowding', () => {
  const ideal = { linear: [180], 'trigonal planar': [120], tetrahedral: [109.47], 'trigonal pyramidal': [107], bent: [104.5] };
  for (const e of C.LIBRARY) {
    const geo = C.geometry(e.mol);
    const ring = e.mol.bonds.length !== e.mol.atoms.length - 1;
    if (ring) {
      assert.equal(geo, null, `${e.name} is a ring: no tree shape`);
      continue;
    }
    assert.ok(geo, e.name);
    const m = e.mol;
    for (const b of m.bonds) {
      const d = C.V.dist(geo.pos.get(b.a), geo.pos.get(b.b));
      assert.ok(Math.abs(d - C.bondLength(C.atom(m, b.a).el, C.atom(m, b.b).el, b.order)) < 1e-6, `${e.name} bond length`);
    }
    for (const c of geo.centres) {
      const nb = C.neighbours(m, c.id);
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          const a = C.angleAt(geo.pos, c.id, nb[i].id, nb[j].id);
          assert.ok(ideal[c.shape].some((x) => Math.abs(a - x) < 0.1), `${e.name}: ${c.el} ${c.shape} has a ${a.toFixed(1)}° angle`);
        }
      }
    }
    // atoms that are not bonded keep a sensible distance apart
    const ids = m.atoms.map((a) => a.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!C.order(m, ids[i], ids[j])) assert.ok(C.V.dist(geo.pos.get(ids[i]), geo.pos.get(ids[j])) > 1.1, `${e.name}: atoms too close`);
      }
    }
  }
  // ethene and propene: the atoms round the C=C lie in one plane
  for (const name of ['ethene', 'propene', 'chloroethene']) {
    const m = C.LIBRARY.find((e) => e.name === name).mol;
    const geo = C.geometry(m);
    const dbl = m.bonds.find((b) => b.order === 2);
    const group = new Set([dbl.a, dbl.b]);
    for (const id of [dbl.a, dbl.b]) for (const nb of C.neighbours(m, id)) group.add(nb.id);
    const pts = [...group].map((id) => geo.pos.get(id));
    const n = C.V.norm(C.V.cross(C.V.sub(pts[1], pts[0]), C.V.sub(pts[2], pts[0])));
    for (const p of pts) assert.ok(Math.abs(C.V.dot(C.V.sub(p, pts[0]), n)) < 1e-6, `${name} is not flat round its C=C`);
  }
  // ethane's ends are staggered: each H–C–C–H twist is 60° or 180°
  const eth = C.TASKS[9].mol;
  const geo = C.geometry(eth);
  const [c1, c2] = eth.atoms.filter((a) => a.el === 'C').map((a) => a.id);
  const axis = C.V.norm(C.V.sub(geo.pos.get(c2), geo.pos.get(c1)));
  const flat = (id, c) => {
    const v = C.V.sub(geo.pos.get(id), geo.pos.get(c));
    return C.V.norm(C.V.sub(v, C.V.mul(axis, C.V.dot(v, axis))));
  };
  const h1 = C.neighbours(eth, c1).find((x) => C.atom(eth, x.id).el === 'H').id;
  for (const x of C.neighbours(eth, c2)) {
    if (C.atom(eth, x.id).el !== 'H') continue;
    const twist = C.V.angle(flat(h1, c1), flat(x.id, c2));
    assert.ok([60, 180].some((a) => Math.abs(twist - a) < 3), `ethane twist ${twist.toFixed(1)}°`);
  }
  // lone pairs: water's oxygen has two, ammonia's nitrogen one, methane's carbon none
  const lp = (t) => {
    const g = C.geometry(t.mol);
    return g.centres.map((c) => g.lone.get(c.id).length);
  };
  assert.deepEqual(lp(C.TASKS[2]), [2]);
  assert.deepEqual(lp(C.TASKS[3]), [1]);
  assert.deepEqual(lp(C.TASKS[4]), [0]);
  // unfinished molecules have no shape yet
  assert.equal(C.geometry(C.addAtom(C.empty(), 'C', null).mol), null);
});

test('fit: a turned, moved and mirrored copy fits back exactly', () => {
  const rnd = rng(11);
  const pts = Array.from({ length: 9 }, () => [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2]);
  const axis = C.V.norm([0.3, -0.8, 0.5]);
  const turned = pts.map((p) => {
    const c = Math.cos(1.1);
    const s = Math.sin(1.1);
    const kv = C.V.cross(axis, p);
    const kd = C.V.dot(axis, p) * (1 - c);
    return C.V.add([p[0] * c + kv[0] * s + axis[0] * kd, p[1] * c + kv[1] * s + axis[1] * kd, p[2] * c + kv[2] * s + axis[2] * kd], [5, -2, 1]);
  });
  const r = C.fit(pts, turned);
  assert.ok(r.err < 1e-12, `error ${r.err}`);
  r.points.forEach((p, i) => assert.ok(C.V.dist(p, turned[i]) < 1e-6));
  const mirror = turned.map((p) => [-p[0], p[1], p[2]]);
  assert.ok(C.fit(pts, mirror).err < 1e-12, 'a mirror image fits too');
});

test('building layout: springs settle every bond near its length; new atoms land in open space', () => {
  const m = C.TASKS[14].mol;
  const rnd = rng(5);
  const pos = new Map(m.atoms.map((a) => [a.id, [rnd() * 3, rnd() * 3, rnd() * 3]]));
  const vel = new Map();
  for (let k = 0; k < 900; k++) C.layout(m, pos, vel, 1 / 60);
  for (const b of m.bonds) {
    const d = C.V.dist(pos.get(b.a), pos.get(b.b));
    const L = C.bondLength(C.atom(m, b.a).el, C.atom(m, b.b).el, b.order);
    assert.ok(Math.abs(d - L) / L < 0.12, `bond ${d.toFixed(2)} vs ${L.toFixed(2)}`);
  }
  for (const p of pos.values()) assert.ok(p.every(Number.isFinite));
  // a new atom: a bond length from its parent, well away from the parent's other bonds
  const c = m.atoms.find((a) => a.el === 'C').id;
  const half = C.removeAtom(m, C.neighbours(m, c).find((x) => C.atom(m, x.id).el === 'H').id);
  const p = C.spot(half, pos, c, 'H', [0, 0, -1], [1, 0, 0]);
  assert.ok(Math.abs(C.V.dist(p, pos.get(c)) - C.bondLength('C', 'H', 1)) < 1e-9);
  for (const nb of C.neighbours(half, c)) {
    assert.ok(C.V.angle(C.V.sub(p, pos.get(c)), C.V.sub(pos.get(nb.id), pos.get(c))) > 60, 'the new atom sits on top of a neighbour');
  }
});

test('the free build names what it knows, and only that', () => {
  const rnd = rng(9);
  for (const e of C.LIBRARY) assert.equal(C.recognise(relabel(playerBuild(e.mol, rnd), rnd)).name, e.name);
  assert.equal(C.recognise(C.parse('CCCCO')), null, 'butan-1-ol is not in the list');
  assert.equal(C.recognise(C.empty()), null);
  const geo = C.geometry(C.parse('OO'));
  assert.equal(C.shapeText(geo.centres), 'Bent around both oxygens');
});

test('every message, word for word', () => {
  const t = C.TASKS[3];
  assert.equal(C.say.start(4, 20, t), 'Task 4 of 20: build ammonia, NH₃. Nitrogen makes 3 bonds.');
  let m = C.addAtom(C.empty(), 'C', null).mol;
  m = C.addAtom(m, 'O', 1).mol;
  m = C.addAtom(m, 'H', 1).mol;
  m = C.addAtom(m, 'H', 1).mol;
  assert.equal(C.say.selected(m, 1), 'Carbon selected: 3 of 4 bonds, bonded to 2 hydrogens and an oxygen.');
  assert.equal(C.say.selected(m, 2), 'Oxygen selected: 1 of 2 bonds, bonded to a carbon.');
  assert.equal(C.say.addedTo(m, 4, 1), 'Hydrogen bonded to the carbon. Carbon: 3 of 4 bonds.');
  m = C.cycleBond(m, 1, 2).mol;
  assert.equal(C.say.selected(m, 1), 'Carbon selected: full, 4 bonds, bonded to 2 hydrogens and an oxygen (a double bond to an oxygen).');
  assert.equal(C.say.added('N'), 'Added a nitrogen. It needs 3 bonds.');
  assert.equal(C.say.full('O'), 'That oxygen is full: it already has 2 bonds. Pick an atom with an open slot.');
  assert.equal(C.say.bondMade('C', 'O'), 'C–O: a single bond, one shared pair.');
  assert.equal(C.say.bondUp('C', 'O', 2), 'C=O: now a double bond, two shared pairs.');
  assert.equal(C.say.bondUp('N', 'N', 3), 'N≡N: now a triple bond, three shared pairs.');
  assert.equal(C.say.isomer(C.TASKS[17], C.recognise(C.TASKS[14].mol)),
    'This is ethanol, an isomer: the same atoms, joined differently. In methoxymethane, the oxygen sits between the two carbons, and each carbon has three hydrogens.');
  assert.equal(C.say.other(C.TASKS[14], C.recognise(C.TASKS[13].mol), 'CH4O'), 'That’s methanol, CH₃OH. The task is ethanol, C₂H₅OH.');
  assert.equal(C.say.unknown('C4H10O'), 'Every atom is full: C₄H₁₀O. It is not one of the molecules I can name.');
});

test('the chemistry file is pure: no page, no 3D, nothing stored', () => {
  const code = fs.readFileSync(FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bTHREE\b|\bdocument\b|\bwindow\b|localStorage|sessionStorage|indexedDB|cookie|fetch\(/);
});
