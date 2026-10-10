/* Molecule Lab: the chemistry.
 *
 * Elements and their valencies; molecules as small graphs (atoms joined by
 * single, double or triple bonds) and every way of building them; telling
 * two molecules apart, isomers included; the 20 tasks and the library of
 * molecules the free build can name; hints; the shapes molecules take
 * (electron-pair repulsion, VSEPR) with real 3D positions; the springy
 * layout used while building; and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Chem; in Node it
 * is a CommonJS module.
 *
 * A molecule is { atoms: [{ id, el }], bonds: [{ a, b, order }], next }.
 * Atom ids are never reused, so the game can keep each atom's place on
 * screen by id. Every change returns a new molecule: undo is just a list.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------- elements */
  // valency: bonds the atom makes; outer: electrons in its outer shell
  // (they set the lone pairs); covalent: radius in ångströms, for bond lengths
  const ELEMENTS = {
    H: { symbol: 'H', name: 'hydrogen', valency: 1, outer: 1, key: 'h', num: '1', covalent: 0.31 },
    C: { symbol: 'C', name: 'carbon', valency: 4, outer: 4, key: 'c', num: '2', covalent: 0.76 },
    N: { symbol: 'N', name: 'nitrogen', valency: 3, outer: 5, key: 'n', num: '3', covalent: 0.71 },
    O: { symbol: 'O', name: 'oxygen', valency: 2, outer: 6, key: 'o', num: '4', covalent: 0.66 },
    Cl: { symbol: 'Cl', name: 'chlorine', valency: 1, outer: 7, key: 'l', num: '5', covalent: 1.02 },
  };
  const ORDER = ['H', 'C', 'N', 'O', 'Cl'];
  const MAX_ATOMS = 16;
  const BOND_WORD = ['no', 'single', 'double', 'triple'];
  const BOND_MARK = ['', '–', '=', '≡'];

  const elName = (el) => ELEMENTS[el].name;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const an = (el) => (/^[aeiou]/.test(elName(el)) ? 'an ' : 'a ') + elName(el);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const many = (n, el) => (n === 1 ? an(el) : `${n} ${elName(el)}s`);
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (f) => String(f).replace(/\d/g, (d) => SUBS[d]);
  const deg = (a) => `${Math.round(a * 10) / 10}°`;

  /* --------------------------------------------------------- molecules */
  const empty = () => ({ atoms: [], bonds: [], next: 1 });
  const copy = (m) => ({ atoms: m.atoms.map((a) => ({ id: a.id, el: a.el })), bonds: m.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order })), next: m.next });
  const atom = (m, id) => m.atoms.find((a) => a.id === id) || null;
  const has = (m, id) => m.atoms.some((a) => a.id === id);
  const bondOf = (m, a, b) => m.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) || null;
  function order(m, a, b) {
    const x = bondOf(m, a, b);
    return x ? x.order : 0;
  }
  function used(m, id) {
    let s = 0;
    for (const x of m.bonds) if (x.a === id || x.b === id) s += x.order;
    return s;
  }
  const valency = (m, id) => ELEMENTS[atom(m, id).el].valency;
  const free = (m, id) => valency(m, id) - used(m, id);
  function neighbours(m, id) {
    const out = [];
    for (const x of m.bonds) {
      if (x.a === id) out.push({ id: x.b, order: x.order });
      else if (x.b === id) out.push({ id: x.a, order: x.order });
    }
    return out;
  }
  function counts(m) {
    const c = {};
    for (const a of m.atoms) c[a.el] = (c[a.el] || 0) + 1;
    return c;
  }
  const openSlots = (m) => m.atoms.reduce((s, a) => s + free(m, a.id), 0);

  // how many separate pieces the atoms make
  function pieces(m) {
    const seen = new Set();
    let n = 0;
    for (const a of m.atoms) {
      if (seen.has(a.id)) continue;
      n++;
      const stack = [a.id];
      seen.add(a.id);
      while (stack.length) {
        const id = stack.pop();
        for (const nb of neighbours(m, id)) {
          if (!seen.has(nb.id)) {
            seen.add(nb.id);
            stack.push(nb.id);
          }
        }
      }
    }
    return n;
  }

  function setOrder(m, a, b, o) {
    const n = copy(m);
    n.bonds = n.bonds.filter((x) => !((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (o > 0) n.bonds.push({ a, b, order: o });
    return n;
  }

  /* Add an atom, bonded to atom `to` when one is given. Returns
   * { mol, id } or { error: 'full' | 'max' | 'gone' }. */
  function addAtom(m, el, to) {
    if (!ELEMENTS[el]) throw new Error('No such element: ' + el);
    if (m.atoms.length >= MAX_ATOMS) return { error: 'max' };
    if (to != null) {
      if (!has(m, to)) return { error: 'gone' };
      if (free(m, to) < 1) return { error: 'full', id: to };
    }
    const n = copy(m);
    const id = n.next++;
    n.atoms.push({ id, el });
    if (to != null) n.bonds.push({ a: to, b: id, order: 1 });
    return { mol: n, id };
  }

  function removeAtom(m, id) {
    const n = copy(m);
    n.atoms = n.atoms.filter((a) => a.id !== id);
    n.bonds = n.bonds.filter((x) => x.a !== id && x.b !== id);
    return n;
  }

  /* Delete as the player means it: the atom, and the hydrogens bonded to
   * it, which would otherwise be left floating on their own. Returns
   * { mol, gone: [ids] }. */
  function deleteAtom(m, id) {
    const gone = [id];
    if (atom(m, id).el !== 'H') {
      for (const nb of neighbours(m, id)) if (atom(m, nb.id).el === 'H') gone.push(nb.id);
    }
    let n = m;
    for (const g of gone) n = removeAtom(n, g);
    return { mol: n, gone };
  }

  /* One press of Bond between atoms a and b: none → single → double →
   * triple → none. A bond that cannot grow (an atom has no slot left)
   * goes back to none. Returns { mol, order, was, stop } where stop is the
   * atom that had no room, or { error: 'same' | 'gone' | 'full', id }. */
  function cycleBond(m, a, b) {
    if (a === b) return { error: 'same' };
    if (!has(m, a) || !has(m, b)) return { error: 'gone' };
    const cur = order(m, a, b);
    const fa = free(m, a);
    const fb = free(m, b);
    if (cur === 0) {
      if (fa < 1 || fb < 1) return { error: 'full', id: fa < 1 ? a : b };
      return { mol: setOrder(m, a, b, 1), order: 1, was: 0, stop: null };
    }
    if (cur < 3 && fa >= 1 && fb >= 1) return { mol: setOrder(m, a, b, cur + 1), order: cur + 1, was: cur, stop: null };
    let stop = null;
    if (cur < 3) {
      if (fa < 1 && fb < 1) stop = valency(m, a) <= valency(m, b) ? a : b;
      else stop = fa < 1 ? a : b;
    }
    return { mol: setOrder(m, a, b, 0), order: 0, was: cur, stop };
  }

  /* --------------------------------------------------------- formulas */
  // Carbon compounds in Hill order (C, H, then the rest A to Z);
  // nitrogen-hydrogen compounds as NH₃ and N₂H₄; the rest hydrogen first.
  function formulaOf(c) {
    let seq;
    if (c.C) seq = ['C', 'H', 'Cl', 'N', 'O'];
    else if (c.N) seq = ['N', 'H', 'Cl', 'O'];
    else seq = ['H', 'Cl', 'N', 'O'];
    return seq.filter((el) => c[el]).map((el) => el + (c[el] > 1 ? c[el] : '')).join('');
  }
  const formula = (m) => formulaOf(counts(m));

  // atom counts read from a formula as written, condensed ones and
  // brackets too: C2H5OH, CH3CH(OH)CH3, C2H4(OH)2
  function countFormula(f) {
    let i = 0;
    const num = () => {
      const d = /^\d+/.exec(f.slice(i));
      if (!d) return 1;
      i += d[0].length;
      return Number(d[0]);
    };
    function group() {
      const c = {};
      const addIn = (from, k) => { for (const el of Object.keys(from)) c[el] = (c[el] || 0) + from[el] * k; };
      while (i < f.length && f[i] !== ')') {
        if (f[i] === '(') {
          i++;
          const inner = group();
          if (f[i] !== ')') throw new Error('Cannot read formula ' + f);
          i++;
          addIn(inner, num());
          continue;
        }
        const el = f.startsWith('Cl', i) ? 'Cl' : 'HCNO'.includes(f[i]) ? f[i] : null;
        if (!el) throw new Error('Cannot read formula ' + f);
        i += el.length;
        addIn({ [el]: 1 }, num());
      }
      return c;
    }
    const c = group();
    if (i !== f.length) throw new Error('Cannot read formula ' + f);
    return c;
  }

  /* A tiny SMILES-style reader for the molecules this lab knows. Heavy
   * atoms C N O Cl, [H] for a hydrogen that has to be written (H2 is
   * "[H][H]"), bonds - = #, branches ( ) and ring closures 1-9. Every heavy
   * atom is then filled up with hydrogens to its valency. */
  function parse(smiles) {
    let m = empty();
    let prev = null;
    let bond = 1;
    const stack = [];
    const rings = {};
    let i = 0;
    while (i < smiles.length) {
      const ch = smiles[i];
      if (ch === '(') { stack.push(prev); i++; continue; }
      if (ch === ')') { prev = stack.pop(); i++; continue; }
      if (ch === '-' || ch === '=' || ch === '#') { bond = '-=#'.indexOf(ch) + 1; i++; continue; }
      if (/[1-9]/.test(ch)) {
        if (rings[ch]) {
          m = setOrder(m, rings[ch].id, prev, Math.max(rings[ch].bond, bond));
          delete rings[ch];
        } else {
          rings[ch] = { id: prev, bond };
        }
        bond = 1;
        i++;
        continue;
      }
      let el;
      if (smiles.startsWith('Cl', i)) { el = 'Cl'; i += 2; }
      else if (smiles.startsWith('[H]', i)) { el = 'H'; i += 3; }
      else if ('CNO'.includes(ch)) { el = ch; i++; }
      else throw new Error('Cannot read ' + smiles);
      const id = m.next;
      m = copy(m);
      m.next++;
      m.atoms.push({ id, el });
      if (prev != null) m.bonds.push({ a: prev, b: id, order: bond });
      bond = 1;
      prev = id;
    }
    if (Object.keys(rings).length) throw new Error('Open ring in ' + smiles);
    for (const a of m.atoms.slice()) {
      if (a.el === 'H') continue;
      for (let k = free(m, a.id); k > 0; k--) m = addAtom(m, 'H', a.id).mol;
    }
    return m;
  }

  /* ----------------------------------------------- telling molecules apart */
  function graph(m) {
    const n = m.atoms.length;
    const idx = new Map(m.atoms.map((a, i) => [a.id, i]));
    const adj = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const x of m.bonds) {
      const i = idx.get(x.a);
      const j = idx.get(x.b);
      adj[i][j] = x.order;
      adj[j][i] = x.order;
    }
    const els = m.atoms.map((a) => a.el);
    const deg = adj.map((r) => r.filter((o) => o > 0).length);
    const nb = adj.map((r) => {
      const c = {};
      r.forEach((o, j) => { if (o) c[els[j]] = (c[els[j]] || 0) + 1; });
      return c;
    });
    return { n, ids: m.atoms.map((a) => a.id), els, adj, deg, nb };
  }

  /* Colour refinement on several graphs at once, so colours can be
   * compared between them: start from the element, then repeatedly add
   * the sorted (bond order, colour) list of the neighbours. */
  function refine(gs) {
    let cols = gs.map((g) => g.els.slice());
    let classes = new Set(cols.flat()).size;
    const most = Math.max(...gs.map((g) => g.n)) + 1;
    for (let r = 0; r < most; r++) {
      const sigs = gs.map((g, k) => g.els.map((_, i) => {
        const nb = [];
        for (let j = 0; j < g.n; j++) if (g.adj[i][j]) nb.push(g.adj[i][j] + ':' + cols[k][j]);
        return cols[k][i] + '|' + nb.sort().join(',');
      }));
      const names = new Map([...new Set(sigs.flat())].sort().map((s, i) => [s, 'k' + i]));
      cols = sigs.map((arr) => arr.map((s) => names.get(s)));
      if (names.size === classes) break;
      classes = names.size;
    }
    return cols;
  }

  // visit atoms piece by piece, breadth first, heavy atoms before hydrogens
  function searchOrder(g, rank) {
    const out = [];
    const seen = new Array(g.n).fill(false);
    const starts = [...Array(g.n).keys()].sort((a, b) => rank(a) - rank(b));
    for (const s of starts) {
      if (seen[s]) continue;
      seen[s] = true;
      const q = [s];
      while (q.length) {
        const i = q.shift();
        out.push(i);
        const next = [];
        for (let j = 0; j < g.n; j++) if (g.adj[i][j] && !seen[j]) next.push(j);
        next.sort((a, b) => rank(a) - rank(b));
        for (const j of next) {
          seen[j] = true;
          q.push(j);
        }
      }
    }
    return out;
  }

  /* Are a and b the same molecule (atoms, bonds and bond orders, however
   * the atoms are numbered)? Returns a Map from a's atom ids to b's, or
   * null. Colour refinement prunes; a backtracking search decides. */
  function match(a, b) {
    if (a.atoms.length !== b.atoms.length || a.bonds.length !== b.bonds.length) return null;
    const A = graph(a);
    const B = graph(b);
    const [ca, cb] = refine([A, B]);
    if (ca.slice().sort().join() !== cb.slice().sort().join()) return null;
    const freq = {};
    ca.forEach((c) => { freq[c] = (freq[c] || 0) + 1; });
    const order = searchOrder(A, (i) => freq[ca[i]] * 100 + (A.els[i] === 'H' ? 50 : 0) - A.deg[i]);
    const map = new Array(A.n).fill(-1);
    const taken = new Array(B.n).fill(false);
    function go(k) {
      if (k === A.n) return true;
      const i = order[k];
      for (let j = 0; j < B.n; j++) {
        if (taken[j] || ca[i] !== cb[j]) continue;
        let ok = true;
        for (let t = 0; t < k && ok; t++) {
          const p = order[t];
          if (A.adj[i][p] !== B.adj[j][map[p]]) ok = false;
        }
        if (!ok) continue;
        map[i] = j;
        taken[j] = true;
        if (go(k + 1)) return true;
        map[i] = -1;
        taken[j] = false;
      }
      return false;
    }
    if (!go(0)) return null;
    return new Map(A.ids.map((id, i) => [id, B.ids[map[i]]]));
  }

  /* Can the (unfinished) build still grow into the target? That is: is
   * there a one-to-one map from the build's atoms to the target's, same
   * elements, where every bond in the build is a bond in the target at
   * least as strong? Returns a Map build id → target id, or null. */
  function embed(m, t) {
    const A = graph(m);
    const B = graph(t);
    if (A.n > B.n) return null;
    const ca = counts(m);
    const cb = counts(t);
    for (const el of Object.keys(ca)) if (ca[el] > (cb[el] || 0)) return null;
    const order = searchOrder(A, (i) => (A.els[i] === 'H' ? 1000 : 0) + (A.deg[i] ? 0 : 2000) - A.deg[i] * 10 - ELEMENTS[A.els[i]].valency);
    const map = new Array(A.n).fill(-1);
    const taken = new Array(B.n).fill(false);
    function fits(i, j) {
      if (A.els[i] !== B.els[j] || A.deg[i] > B.deg[j]) return false;
      for (const el of Object.keys(A.nb[i])) if (A.nb[i][el] > (B.nb[j][el] || 0)) return false;
      for (let k = 0; k < A.n; k++) {
        const o = A.adj[i][k];
        if (o && map[k] >= 0 && B.adj[j][map[k]] < o) return false;
      }
      return true;
    }
    function go(k) {
      if (k === A.n) return true;
      const i = order[k];
      const tried = new Set();
      for (let j = 0; j < B.n; j++) {
        if (taken[j] || !fits(i, j)) continue;
        // a free atom fits any unused atom of its element equally well
        if (!A.deg[i]) {
          if (tried.has(B.els[j])) continue;
          tried.add(B.els[j]);
        }
        map[i] = j;
        taken[j] = true;
        if (go(k + 1)) return true;
        map[i] = -1;
        taken[j] = false;
      }
      return false;
    }
    if (!go(0)) return null;
    return new Map(A.ids.map((id, i) => [id, B.ids[map[i]]]));
  }

  /* ------------------------------------------------------------- tasks */
  // tip: shown when the task starts; how: the structure in words, for
  // hints; angle: [heavy atom index in the SMILES, end element, end element]
  // for the bond angle shown when it is built; fact: the "did you know".
  const TASKS = [
    { name: 'hydrogen', formula: 'H2', smiles: '[H][H]',
      tip: 'Add a hydrogen, then another: a new atom bonds to the selected one.',
      how: 'two hydrogen atoms share one pair of electrons: a single bond',
      fact: 'Hydrogen is the most common element in the universe. Stars like the Sun shine by fusing hydrogen into helium.' },
    { name: 'hydrogen chloride', formula: 'HCl', smiles: 'Cl',
      tip: 'Chlorine makes 1 bond, just like hydrogen. Its key is L.',
      how: 'the hydrogen and the chlorine share a single bond',
      fact: 'Dissolved in water, hydrogen chloride makes hydrochloric acid: the acid your stomach uses to help digest food.' },
    { name: 'water', formula: 'H2O', smiles: 'O', angle: [0, 'H', 'H'],
      tip: 'Start with the oxygen, then add hydrogens to it. Yellow studs are open bonding slots.',
      how: 'the oxygen is bonded to two hydrogens',
      fact: 'Oxygen’s two lone pairs push its two bonds closer together than in a perfect tetrahedron, so water is bent. The bend makes water polar, which is why so many things dissolve in it.' },
    { name: 'ammonia', formula: 'NH3', smiles: 'N', angle: [0, 'H', 'H'],
      tip: 'Nitrogen makes 3 bonds.',
      how: 'the nitrogen is bonded to three hydrogens',
      fact: 'Nitrogen’s one lone pair pushes the three N–H bonds down into a pyramid. Most ammonia is made by the Haber process and turned into fertiliser.' },
    { name: 'methane', formula: 'CH4', smiles: 'C', angle: [0, 'H', 'H'],
      tip: 'Carbon makes 4 bonds.',
      how: 'the carbon is bonded to four hydrogens',
      fact: 'Four bonding pairs and no lone pairs spread as far apart as they can: a perfect tetrahedron. Methane is the main gas in natural gas, and a powerful greenhouse gas.' },

    { name: 'oxygen', formula: 'O2', smiles: 'O=O',
      tip: 'Each oxygen needs 2 bonds. Join them, then press Bond (B) to make the bond double.',
      how: 'the two oxygens share a double bond: two shared pairs',
      fact: 'Each oxygen atom shares two of its electrons, so the atoms are held by two shared pairs: a double bond. About 21% of the air is oxygen.' },
    { name: 'nitrogen', formula: 'N2', smiles: 'N#N',
      tip: 'Nitrogen needs 3 bonds: press Bond (B) again to go from double to triple.',
      how: 'the two nitrogens share a triple bond: three shared pairs',
      fact: 'The triple bond in nitrogen is one of the strongest bonds there is. That is why the nitrogen that makes up 78% of the air is so unreactive.' },
    { name: 'carbon dioxide', formula: 'CO2', smiles: 'O=C=O', angle: [1, 'O', 'O'],
      tip: 'The carbon needs a double bond to each oxygen. Tab, or a tap, picks an atom.',
      how: 'the carbon is in the middle, with a double bond to each oxygen',
      fact: 'With no lone pairs on the carbon, its two double bonds point in opposite directions: a straight line. Plants take in carbon dioxide and turn it into sugar by photosynthesis.' },
    { name: 'hydrogen cyanide', formula: 'HCN', smiles: 'C#N', angle: [0, 'H', 'N'],
      tip: 'A single bond on one side of the carbon, a triple bond on the other.',
      how: 'the carbon is in the middle: a single bond to the hydrogen and a triple bond to the nitrogen',
      fact: 'Hydrogen cyanide is deadly poisonous, yet it has been found in comets and in the air of Saturn’s moon Titan.' },

    { name: 'ethane', formula: 'C2H6', smiles: 'CC', angle: [0, 'H', 'H'],
      tip: 'Add a carbon to a carbon to start a chain.',
      how: 'the two carbons are bonded to each other, and each has three hydrogens',
      fact: 'Ethane is an alkane: it has only single bonds, so it is saturated. The two ends can spin round the C–C bond.' },
    { name: 'ethene', formula: 'C2H4', smiles: 'C=C', angle: [0, 'H', 'C'],
      tip: 'The two carbons share a double bond.',
      how: 'the two carbons share a double bond, and each has two hydrogens',
      fact: 'Ethene is an alkene. Its C=C double bond keeps the molecule flat and stops it twisting. It is the building block of poly(ethene), and ripening fruit gives it off.' },
    { name: 'ethyne', formula: 'C2H2', smiles: 'C#C', angle: [0, 'H', 'C'],
      tip: 'The two carbons share a triple bond.',
      how: 'the two carbons share a triple bond, and each has one hydrogen',
      fact: 'Ethyne (also called acetylene) burns in oxygen with a flame of over 3000 °C, hot enough to cut and weld steel.' },
    { name: 'chloromethane', formula: 'CH3Cl', smiles: 'CCl', angle: [0, 'H', 'Cl'],
      tip: 'Chlorine takes the place of one of methane’s hydrogens.',
      how: 'the carbon is bonded to three hydrogens and the chlorine',
      fact: 'Chlorine makes 1 bond, like hydrogen, so it can take a hydrogen’s place. Chloromethane is made naturally by the oceans and by some plants and fungi.' },

    { name: 'methanol', formula: 'CH3OH', smiles: 'CO', angle: [0, 'H', 'H'],
      tip: 'An –OH group: the oxygen bonds to the carbon and to a hydrogen.',
      how: 'the carbon has three hydrogens and the oxygen, and the oxygen has the last hydrogen',
      fact: 'Methanol is the simplest alcohol: every alcohol has an –OH group. It is poisonous to drink, but it is used as a fuel and to make plastics.' },
    { name: 'ethanol', formula: 'C2H5OH', smiles: 'CCO', angle: [1, 'C', 'O'],
      tip: 'A chain of two carbons with an –OH group on the end.',
      how: 'the chain goes C–C–O, and the oxygen is bonded to one carbon and one hydrogen',
      fact: 'Yeast makes ethanol by fermenting sugar. It is used as a fuel, as a solvent and in hand sanitiser.' },
    { name: 'ethanal', formula: 'CH3CHO', smiles: 'CC=O', angle: [1, 'H', 'O'],
      tip: 'The end carbon has a C=O double bond and one hydrogen.',
      how: 'the chain goes C–C=O: the end carbon has the double bond to the oxygen and one hydrogen',
      fact: 'Ethanal is an aldehyde: a C=O at the end of a carbon chain, with flat bonds round that carbon. Your liver makes ethanal when it breaks down ethanol.' },
    { name: 'methanoic acid', formula: 'HCOOH', smiles: 'OC=O', angle: [1, 'O', 'O'],
      tip: 'One carbon, with a C=O and an –OH.',
      how: 'the carbon has a hydrogen, a double bond to one oxygen and a single bond to the other, which holds the last hydrogen',
      fact: 'Methanoic acid is the simplest carboxylic acid (–COOH). Its old name, formic acid, comes from the Latin for ant: some ants spray it to defend themselves.' },

    { name: 'methoxymethane', formula: 'CH3OCH3', smiles: 'COC', angle: [1, 'C', 'C'],
      tip: 'The same atoms as ethanol, C₂H₆O, but the oxygen sits between the two carbons.',
      how: 'the oxygen sits between the two carbons, and each carbon has three hydrogens',
      fact: 'Methoxymethane and ethanol are isomers: both C₂H₆O. With no O–H group its molecules cannot hydrogen bond to each other, so it boils at −24 °C, while ethanol boils at 78 °C. The real C–O–C angle is about 112°: the bulky CH₃ groups push it open.' },
    { name: 'propane', formula: 'C3H8', smiles: 'CCC', angle: [1, 'C', 'C'],
      tip: 'A chain of three carbons.',
      how: 'three carbons make a chain, C–C–C, and every other bond goes to a hydrogen',
      fact: 'Propane is the fuel in many camping stoves and gas barbecues. There is only one way to arrange C₃H₈: alkanes have no isomers until butane, C₄H₁₀.' },
    { name: 'propene', formula: 'C3H6', smiles: 'C=CC', angle: [0, 'H', 'C'],
      tip: 'Three carbons in a chain, with one C=C double bond.',
      how: 'three carbons make a chain with one double bond, C=C–C',
      fact: 'Propene is the building block of poly(propene), used for food tubs, ropes and carpets. C₃H₆ has an isomer too: cyclopropane, a triangle of three carbons.' },
  ].map((t) => Object.assign({}, t, { mol: parse(t.smiles) }));

  const GROUPS = [
    { title: 'Single bonds', short: 'Single bonds', from: 0, to: 5 },
    { title: 'Double and triple bonds', short: 'Double and triple bonds', from: 5, to: 9 },
    { title: 'Carbon chains', short: 'Carbon chains', from: 9, to: 13 },
    { title: 'Oxygen joins in', short: 'Oxygen joins in', from: 13, to: 17 },
    { title: 'Isomers: same atoms, new shape', short: 'Isomers', from: 17, to: 20 },
  ];

  /* Molecules the lab can name: every task, and more for the free build. */
  const EXTRA = [
    ['cyclopropane', 'C3H6', 'C1CC1', 'A ring of three carbons, an isomer of propene. Its C–C–C angles are squeezed to 60°, so the ring is strained.'],
    ['cyclobutane', 'C4H8', 'C1CCC1', 'A ring of four carbons, an isomer of the butenes.'],
    ['epoxyethane', 'C2H4O', 'C1CO1', 'A three-atom ring with an oxygen in it: an isomer of ethanal.'],
    ['ethenol', 'CH2CHOH', 'C=CO', 'An isomer of ethanal that quickly rearranges itself into ethanal.'],
    ['hydrogen peroxide', 'H2O2', 'OO', 'Used as a bleach and a disinfectant. It slowly breaks down into water and oxygen.'],
    ['hydrazine', 'N2H4', 'NN', 'Used as a rocket fuel.'],
    ['chlorine', 'Cl2', 'ClCl', 'A green-yellow gas used to keep drinking water and swimming pools free of germs.'],
    ['hypochlorous acid', 'HOCl', 'OCl', 'Forms when chlorine dissolves in water. It is what kills germs in a swimming pool.'],
    ['chloramine', 'NH2Cl', 'NCl', 'Used to disinfect drinking water.'],
    ['methanal', 'HCHO', 'C=O', 'Also called formaldehyde. It is used to make resins and to preserve specimens.'],
    ['methylamine', 'CH3NH2', 'CN', 'An amine: like ammonia with a carbon in place of one hydrogen. It smells fishy.'],
    ['ethylamine', 'C2H5NH2', 'CCN', 'An amine with a two-carbon chain.'],
    ['hydroxylamine', 'NH2OH', 'NO', 'Like ammonia with an –OH in place of one hydrogen.'],
    ['dichloromethane', 'CH2Cl2', 'ClCCl', 'A common solvent in chemistry labs.'],
    ['trichloromethane', 'CHCl3', 'ClC(Cl)Cl', 'Also called chloroform. It was once used to put patients to sleep for operations.'],
    ['tetrachloromethane', 'CCl4', 'ClC(Cl)(Cl)Cl', 'Once used in fire extinguishers. It is now banned for most uses because it harms the ozone layer.'],
    ['chloroethane', 'C2H5Cl', 'CCCl', 'Sprayed on the skin, it cools it so fast it numbs small injuries.'],
    ['chloroethene', 'C2H3Cl', 'C=CCl', 'The building block of PVC, poly(chloroethene).'],
    ['ethanoic acid', 'CH3COOH', 'CC(=O)O', 'The acid in vinegar.'],
    ['methyl methanoate', 'HCOOCH3', 'COC=O', 'An ester, and an isomer of ethanoic acid: both C₂H₄O₂.'],
    ['carbonic acid', 'H2CO3', 'OC(=O)O', 'Forms when carbon dioxide dissolves in water, making fizzy drinks a little acidic.'],
    ['ethane-1,2-diol', 'C2H4(OH)2', 'OCCO', 'Used as antifreeze in car engines.'],
    ['propan-1-ol', 'C3H7OH', 'CCCO', 'An alcohol with the –OH on an end carbon. Propan-2-ol is its isomer.'],
    ['propan-2-ol', 'CH3CH(OH)CH3', 'CC(O)C', 'The alcohol in many antiseptic wipes. Propan-1-ol is its isomer.'],
    ['propanone', 'CH3COCH3', 'CC(=O)C', 'Better known as acetone: a solvent used in nail varnish remover.'],
    ['propyne', 'C3H4', 'C#CC', 'Like ethyne with a CH₃ group in place of one hydrogen.'],
    ['butane', 'C4H10', 'CCCC', 'A fuel in lighters and camping gas. Methylpropane is its isomer.'],
    ['methylpropane', 'C4H10', 'CC(C)C', 'A branched isomer of butane: the same atoms, arranged differently.'],
    ['but-1-ene', 'C4H8', 'C=CCC', 'Its double bond is at the end of the chain. But-2-ene is its isomer.'],
    ['but-2-ene', 'C4H8', 'CC=CC', 'Its double bond is in the middle of the chain. But-1-ene is its isomer.'],
    ['glycine', 'NH2CH2COOH', 'NCC(=O)O', 'The simplest amino acid, one of the building blocks of proteins.'],
    ['cyanogen', 'C2N2', 'N#CC#N', 'Two C≡N groups joined in a straight line.'],
  ];
  const LIBRARY = TASKS.map((t) => ({ name: t.name, formula: t.formula, fact: t.fact, mol: t.mol, task: true }))
    .concat(EXTRA.map(([name, f, smiles, fact]) => ({ name, formula: f, fact, mol: parse(smiles), task: false })));

  function recognise(m) {
    if (!m.atoms.length) return null;
    for (const entry of LIBRARY) {
      if (entry.mol.atoms.length === m.atoms.length && match(m, entry.mol)) return entry;
    }
    return null;
  }

  /* -------------------------------------------------------------- check */
  // Where a build stands against a target (or none, in the free build).
  function check(m, target) {
    const open = openSlots(m);
    const n = m.atoms.length;
    const parts = pieces(m);
    const out = { atoms: n, open, pieces: parts, formula: formula(m), full: n > 1 && open === 0 && parts === 1, done: false, map: null };
    if (target && n === target.atoms.length && open === 0 && parts === 1) {
      const map = match(target, m);
      if (map) {
        out.done = true;
        out.map = map;          // target atom id → build atom id
      }
    }
    return out;
  }

  /* -------------------------------------------------------------- hints */
  // Where to begin: the target atom with the most bonds (not a hydrogen
  // unless the target is all hydrogen).
  function startAtom(t) {
    let best = t.atoms[0];
    for (const a of t.atoms) {
      const va = ELEMENTS[a.el].valency;
      const vb = ELEMENTS[best.el].valency;
      if ((best.el === 'H' && a.el !== 'H') || va > vb) best = a;
    }
    return best.el;
  }

  // an extra atom of this element to remove: a free one, else one on the edge
  function spare(m, el) {
    const list = m.atoms.filter((a) => a.el === el);
    return (list.find((a) => !neighbours(m, a.id).length) ||
      list.find((a) => neighbours(m, a.id).length === 1) || list[list.length - 1]).id;
  }

  const sym = (m, id) => atom(m, id).el;
  const needLine = (m, id) => {
    const el = atom(m, id).el;
    return `${cap(elName(el))} needs ${plural(ELEMENTS[el].valency, 'bond')}: it has ${used(m, id)}.`;
  };

  /* The most useful next step, as { text, focus, partner, action }: focus
   * and partner are atoms for the game to select (partner: the second atom
   * for Bond), and action is the step itself, { type: 'add', el, to } |
   * { type: 'bond', a, b } | { type: 'delete', id }, for the tests' bot. */
  function hint(m, task) {
    if (!task) {
      const pick = LIBRARY[Math.floor(Math.random() * LIBRARY.length)];
      return { text: say.hintFree(pick) };
    }
    const t = task.mol;
    if (!m.atoms.length) {
      const el = startAtom(t);
      return { text: say.hintStart(el), action: { type: 'add', el, to: null } };
    }
    const have = counts(m);
    const need = counts(t);
    for (const el of ORDER) {
      if ((have[el] || 0) > (need[el] || 0)) {
        const id = spare(m, el);
        return { text: say.hintExtra(task, el, have[el], need[el] || 0), focus: id, action: { type: 'delete', id } };
      }
    }
    const f = embed(m, t);
    if (!f) return offTrack(m, task);
    const back = new Map([...f].map(([b, tt]) => [tt, b]));
    const bond = (text, p, q) => ({ text, focus: p, partner: q, action: { type: 'bond', a: p, b: q } });
    // join two atoms that are both there but not yet bonded
    for (const x of t.bonds) {
      const u = back.get(x.a);
      const v = back.get(x.b);
      if (u != null && v != null && !order(m, u, v)) {
        const [p, q] = free(m, u) <= free(m, v) ? [u, v] : [v, u];
        return bond(`${needLine(m, p)} ${say.hintJoin(sym(m, p), sym(m, q))}`, p, q);
      }
    }
    // add a missing atom to one that has room, heavy atoms first
    const byWeight = m.atoms.slice().sort((a, b) => ELEMENTS[b.el].valency - ELEMENTS[a.el].valency);
    for (const a of byWeight) {
      for (const nb of neighbours(t, f.get(a.id))) {
        if (!back.has(nb.id)) {
          const el = atom(t, nb.id).el;
          return { text: `${needLine(m, a.id)} ${say.hintAdd(el)}`, focus: a.id, action: { type: 'add', el, to: a.id } };
        }
      }
    }
    // make a bond stronger
    for (const x of m.bonds) {
      const want = order(t, f.get(x.a), f.get(x.b));
      if (want > x.order) {
        const [p, q] = ELEMENTS[sym(m, x.a)].valency >= ELEMENTS[sym(m, x.b)].valency ? [x.a, x.b] : [x.b, x.a];
        return bond(`${needLine(m, p)} ${say.hintUpgrade(sym(m, p), sym(m, q), x.order, want)}`, p, q);
      }
    }
    return { text: say.hintClose(task) };
  }

  // the build cannot grow into the target: find the one change that fixes it
  function offTrack(m, task) {
    const t = task.mol;
    const bond = (text, x) => ({ text, focus: x.a, partner: x.b, action: { type: 'bond', a: x.a, b: x.b } });
    for (const x of m.bonds) {
      if (x.order > 1 && embed(setOrder(m, x.a, x.b, x.order - 1), t)) return bond(say.hintLower(task, sym(m, x.a), sym(m, x.b), x.order), x);
    }
    const heavy = (id) => sym(m, id) !== 'H';
    for (const x of m.bonds) {
      if (heavy(x.a) && heavy(x.b) && embed(setOrder(m, x.a, x.b, 0), t)) return bond(say.hintUnbond(task, sym(m, x.a), sym(m, x.b)), x);
    }
    const atoms = m.atoms.slice().sort((a, b) => ELEMENTS[a.el].valency - ELEMENTS[b.el].valency);
    for (const a of atoms) {
      if (embed(deleteAtom(m, a.id).mol, t)) return { text: say.hintRemove(task, a.el), focus: a.id, action: { type: 'delete', id: a.id } };
    }
    for (const x of m.bonds) {
      if (embed(setOrder(m, x.a, x.b, 0), t)) return bond(say.hintUnbond(task, sym(m, x.a), sym(m, x.b)), x);
    }
    return { text: say.hintRethink(task) };
  }

  /* --------------------------------------------------------- 3D maths */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
  };
  V.norm = (a) => {
    const l = V.len(a);
    return l > 1e-12 ? V.mul(a, 1 / l) : [1, 0, 0];
  };
  V.dist = (a, b) => V.len(V.sub(a, b));
  V.angle = (a, b) => (Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) * 180) / Math.PI;
  const RAD = Math.PI / 180;
  const X = [1, 0, 0];

  // rotate v about the unit axis k by t radians
  function rot(v, k, t) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const kv = V.cross(k, v);
    const kd = V.dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }
  function perp(a) {
    return V.norm(V.cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  }
  // apply the smallest rotation that takes unit a onto unit b to v
  function turn(v, a, b) {
    const axis = V.cross(a, b);
    const s = V.len(axis);
    const c = V.dot(a, b);
    if (s < 1e-9) return c > 0 ? v.slice() : rot(v, perp(a), Math.PI);
    return rot(v, V.mul(axis, 1 / s), Math.atan2(s, c));
  }

  // bond lengths for the model, from covalent radii (ångströms × 1.25)
  const ORDER_SCALE = [0, 1, 0.87, 0.78];
  function bondLength(ea, eb, o) {
    return 1.25 * (ELEMENTS[ea].covalent + ELEMENTS[eb].covalent) * ORDER_SCALE[o || 1];
  }

  /* ------------------------------------------------------------ shapes */
  // by [bonded atoms, lone pairs] round a centre: the shape and its angle
  const SHAPES = {
    '2,0': { name: 'linear', angle: 180 },
    '3,0': { name: 'trigonal planar', angle: 120 },
    '4,0': { name: 'tetrahedral', angle: 109.5 },
    '3,1': { name: 'trigonal pyramidal', angle: 107 },
    '2,2': { name: 'bent', angle: 104.5 },
    '2,1': { name: 'bent', angle: 117 },
  };
  const SHAPE_ORDER = ['tetrahedral', 'trigonal planar', 'linear', 'trigonal pyramidal', 'bent'];
  const lonePairs = (m, id) => (ELEMENTS[atom(m, id).el].outer - used(m, id)) / 2;

  // Electron-pair directions round an atom: bonds first (the first along
  // +x), then lone pairs.
  const S3 = Math.sqrt(3) / 2;
  const TETRA = [[1, 0, 0], [-1 / 3, Math.sqrt(8) / 3, 0], [-1 / 3, -Math.sqrt(2) / 3, Math.sqrt(2 / 3)], [-1 / 3, -Math.sqrt(2) / 3, -Math.sqrt(2 / 3)]];
  function ideal(bonds, lps) {
    const total = bonds + lps;
    if (total <= 1) return [X];
    if (total === 2) return [X, [-1, 0, 0]];
    if (total === 3) {
      if (bonds === 2 && lps === 1) {
        const a = SHAPES['2,1'].angle * RAD;
        const b1 = [Math.cos(a), Math.sin(a), 0];
        return [X, b1, V.norm(V.mul(V.add(X, b1), -1))];
      }
      return [X, [-0.5, S3, 0], [-0.5, -S3, 0]];
    }
    if (bonds === 3 && lps === 1) {
      // three bonds round the lone pair's axis, 107° apart
      const c = Math.cos(SHAPES['3,1'].angle * RAD);
      const down = Math.sqrt((c + 0.5) / 1.5);
      const side = Math.sqrt(1 - down * down);
      const set = [0, 1, 2].map((k) => [side * Math.cos((k * 2 * Math.PI) / 3), side * Math.sin((k * 2 * Math.PI) / 3), -down]);
      set.push([0, 0, 1]);
      return set.map((v) => turn(v, set[0], X));
    }
    if (bonds === 2 && lps === 2) {
      const a = SHAPES['2,2'].angle * RAD;
      const b1 = [Math.cos(a), Math.sin(a), 0];
      const mid = V.norm(V.add(X, b1));
      const tilt = 57 * RAD;
      const lp = (s) => V.norm(V.add(V.mul(mid, -Math.cos(tilt)), [0, 0, s * Math.sin(tilt)]));
      return [X, b1, lp(1), lp(-1)];
    }
    return TETRA.map((v) => v.slice());
  }

  function permutations(list) {
    if (list.length <= 1) return [list.slice()];
    const out = [];
    list.forEach((x, i) => {
      for (const rest of permutations(list.slice(0, i).concat(list.slice(i + 1)))) out.push([x].concat(rest));
    });
    return out;
  }

  /* The molecule's real shape, for a finished molecule without rings:
   * every centre gets its ideal electron-pair directions, chains twist to
   * keep atoms apart, and atoms either side of a double bond (or an O–H
   * next to a C=O) lie flat. Returns { pos: Map id → [x,y,z], lone: Map
   * id → [directions], centres: [{ id, el, shape, angle }] } or null. */
  function geometry(m) {
    const n = m.atoms.length;
    if (!n || pieces(m) !== 1 || m.bonds.length !== n - 1) return null;
    if (m.atoms.some((a) => free(m, a.id) !== 0)) return null;
    const nbs = new Map(m.atoms.map((a) => [a.id, neighbours(m, a.id)]));
    const lp = new Map(m.atoms.map((a) => [a.id, lonePairs(m, a.id)]));
    const el = (id) => atom(m, id).el;
    const sp2 = (id) => nbs.get(id).length + lp.get(id) === 3;
    const weight = (id) => (el(id) === 'H' ? 1 : 2.5);

    // root: the most bonds, then the most central
    const ecc = (s) => {
      const d = new Map([[s, 0]]);
      const q = [s];
      while (q.length) {
        const i = q.shift();
        for (const x of nbs.get(i)) if (!d.has(x.id)) { d.set(x.id, d.get(i) + 1); q.push(x.id); }
      }
      return Math.max(...d.values());
    };
    let rootId = m.atoms[0].id;
    let best = null;
    for (const a of m.atoms) {
      const key = [nbs.get(a.id).length, -ecc(a.id), ELEMENTS[a.el].valency];
      if (!best || key[0] > best[0] || (key[0] === best[0] && (key[1] > best[1] || (key[1] === best[1] && key[2] > best[2])))) {
        best = key;
        rootId = a.id;
      }
    }

    const pos = new Map([[rootId, [0, 0, 0]]]);
    const bondDir = new Map();     // id → Map(neighbour id → direction)
    const lone = new Map();
    const normal = (id) => {
      const d = [...bondDir.get(id).values()];
      return d.length >= 2 ? V.norm(V.cross(d[0], d[1])) : null;
    };
    const queue = [[rootId, null]];
    while (queue.length) {
      const [id, parent] = queue.shift();
      const list = nbs.get(id);
      const kids = list.filter((x) => x.id !== parent);
      const base = ideal(list.length, lp.get(id));
      const p = pos.get(id);
      const toParent = parent == null ? null : V.norm(V.sub(pos.get(parent), p));
      // keep it flat across a double bond between two flat centres, and
      // prefer flat for an O or N next to a flat centre
      let flat = 0;
      if (parent != null && sp2(parent) && kids.length) {
        if (order(m, id, parent) === 2 && sp2(id)) flat = 1000;
        else if (lp.get(id) > 0) flat = 5;
      }
      const nParent = flat ? normal(parent) : null;
      let pick = null;
      const twists = parent == null ? [0] : Array.from({ length: 72 }, (_, k) => k * 5 * RAD);
      for (const tw of twists) {
        const set = parent == null ? base : base.map((v) => rot(turn(v, X, toParent), toParent, tw));
        const slots = parent == null ? set.slice(0, list.length) : set.slice(1, list.length);
        for (const perm of permutations(kids)) {
          let score = 0;
          perm.forEach((c, k) => {
            const q = V.add(p, V.mul(slots[k], bondLength(el(id), el(c.id), c.order)));
            for (const [oid, op] of pos) {
              if (oid === id) continue;
              const d = V.sub(q, op);
              score += (weight(c.id) * weight(oid)) / (V.dot(d, d) + 0.01);
            }
            if (nParent) score += flat * V.dot(slots[k], nParent) ** 2;
          });
          if (!pick || score < pick.score - 1e-9) pick = { score, set, slots, perm };
        }
      }
      const dirs = new Map();
      if (parent != null) dirs.set(parent, toParent);
      pick.perm.forEach((c, k) => {
        dirs.set(c.id, pick.slots[k]);
        pos.set(c.id, V.add(p, V.mul(pick.slots[k], bondLength(el(id), el(c.id), c.order))));
        queue.push([c.id, id]);
      });
      bondDir.set(id, dirs);
      lone.set(id, pick.set.slice(list.length));
    }
    // centre the molecule on its middle
    const mid = [0, 0, 0];
    for (const v of pos.values()) for (let k = 0; k < 3; k++) mid[k] += v[k] / n;
    for (const [id, v] of pos) pos.set(id, V.sub(v, mid));
    const centres = [];
    for (const a of m.atoms) {
      const k = nbs.get(a.id).length;
      if (k < 2) continue;
      const sh = SHAPES[k + ',' + lp.get(a.id)];
      centres.push({ id: a.id, el: a.el, shape: sh.name, angle: sh.angle });
    }
    return { pos, lone, centres };
  }

  // the bond angle (in the model) between atoms a-c-b
  function angleAt(pos, c, a, b) {
    return V.angle(V.sub(pos.get(a), pos.get(c)), V.sub(pos.get(b), pos.get(c)));
  }

  /* The shape in words. One centre: "Bent". Several: "Tetrahedral around
   * each carbon, bent around the oxygen". */
  function shapeText(centres) {
    if (!centres.length) return 'Linear: two atoms always sit in a straight line';
    if (centres.every((c) => c.shape === 'linear')) return 'Linear: the whole molecule is a straight line';
    if (centres.length === 1) return cap(centres[0].shape);
    const byEl = new Map();
    const firstC = ['C', 'N', 'O', 'Cl', 'H'];
    for (const c of centres.slice().sort((a, b) => firstC.indexOf(a.el) - firstC.indexOf(b.el))) {
      if (!byEl.has(c.el)) byEl.set(c.el, []);
      byEl.get(c.el).push(c.shape);
    }
    const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
    const parts = [];
    for (const [el, shapes] of byEl) {
      const name = elName(el);
      const kinds = [...new Set(shapes)].map((k) => [k, shapes.filter((s) => s === k).length])
        .sort((a, b) => b[1] - a[1] || SHAPE_ORDER.indexOf(a[0]) - SHAPE_ORDER.indexOf(b[0]));
      if (kinds.length === 1) {
        const where = shapes.length === 1 ? `the ${name}` : shapes.length === 2 ? `both ${name}s` : `each ${name}`;
        parts.push(`${kinds[0][0]} around ${where}`);
        continue;
      }
      kinds.forEach(([k, c], i) => {
        let where;
        if (i < kinds.length - 1) where = `${NUM[c] || c} ${name}${c === 1 ? '' : 's'}`;
        else if (c > 1) where = `the other ${NUM[c] || c}`;
        else where = shapes.length === 2 ? 'the other' : shapes.length === 3 ? 'the third' : `one more ${name}`;
        parts.push(`${k} around ${where}`);
      });
    }
    return cap(parts.join(', '));
  }

  /* Pick the headline bond angle: centre and two ends (atom ids) and the
   * angle. For a task it is the one the task names; otherwise the first
   * centre, preferring one with lone pairs. */
  function headline(m, geo, task, map) {
    if (!geo || !geo.centres.length) return null;
    let centre = null;
    let ends = null;
    if (task && task.angle && map) {
      const [idx, e1, e2] = task.angle;
      centre = map.get(task.mol.atoms[idx].id);
      const nb = neighbours(m, centre);
      const first = nb.find((x) => atom(m, x.id).el === e1);
      const second = nb.find((x) => x !== first && atom(m, x.id).el === e2);
      if (first && second) ends = [first.id, second.id];
    }
    if (!ends) {
      const c = geo.centres.slice().sort((a, b) => lonePairs(m, b.id) - lonePairs(m, a.id))[0];
      centre = c.id;
      const nb = neighbours(m, centre);
      // read it hydrogen first: H–O–O rather than O–O–H
      ends = [nb[0].id, nb[1].id].sort((x, y) => (atom(m, y).el === 'H') - (atom(m, x).el === 'H'));
    }
    const c = geo.centres.find((x) => x.id === centre);
    const mark = (e) => BOND_MARK[order(m, centre, e)];
    const label = `${atom(m, ends[0]).el}${mark(ends[0])}${atom(m, centre).el}${mark(ends[1])}${atom(m, ends[1]).el}`;
    return { centre, ends, angle: c.angle, label, shape: c.shape };
  }

  /* Rigid fit (Horn's method): rotate and move the points `from` to sit as
   * closely as possible on `to`, a mirror image allowed. Returns { points,
   * dir(v) } where dir turns a direction the same way. */
  function jacobi(M) {
    const n = M.length;
    const a = M.map((r) => r.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-20) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-15) continue;
          const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          for (let k = 0; k < n; k++) {
            const kp = a[k][p];
            const kq = a[k][q];
            a[k][p] = c * kp - s * kq;
            a[k][q] = s * kp + c * kq;
          }
          for (let k = 0; k < n; k++) {
            const pk = a[p][k];
            const qk = a[q][k];
            a[p][k] = c * pk - s * qk;
            a[q][k] = s * pk + c * qk;
          }
          for (let k = 0; k < n; k++) {
            const kp = v[k][p];
            const kq = v[k][q];
            v[k][p] = c * kp - s * kq;
            v[k][q] = s * kp + c * kq;
          }
        }
      }
    }
    return { values: a.map((r, i) => r[i]), vectors: v };
  }
  function qrot(q, p) {
    const [w, x, y, z] = q;
    const u = [x, y, z];
    const t = V.mul(V.cross(u, p), 2);
    return V.add(V.add(p, V.mul(t, w)), V.cross(u, t));
  }
  const centroid = (pts) => pts.reduce((s, p) => V.add(s, V.mul(p, 1 / pts.length)), [0, 0, 0]);
  function fitOnce(from, to) {
    const cf = centroid(from);
    const ct = centroid(to);
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    from.forEach((p, i) => {
      const a = V.sub(p, cf);
      const b = V.sub(to[i], ct);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c];
    });
    const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
    const N = [
      [xx + yy + zz, yz - zy, zx - xz, xy - yx],
      [yz - zy, xx - yy - zz, xy + yx, zx + xz],
      [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
      [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ];
    const { values, vectors } = jacobi(N);
    let k = 0;
    for (let i = 1; i < 4; i++) if (values[i] > values[k]) k = i;
    const q = [vectors[0][k], vectors[1][k], vectors[2][k], vectors[3][k]];
    const qn = Math.hypot(...q);
    const qq = q.map((x) => x / qn);
    const points = from.map((p) => V.add(qrot(qq, V.sub(p, cf)), ct));
    const err = points.reduce((s, p, i) => s + V.dot(V.sub(p, to[i]), V.sub(p, to[i])), 0);
    return { points, err, dir: (d) => qrot(qq, d) };
  }
  function fit(from, to) {
    const plain = fitOnce(from, to);
    const flip = (p) => [-p[0], p[1], p[2]];
    const mirrored = fitOnce(from.map(flip), to);
    if (mirrored.err < plain.err - 1e-9) return { points: mirrored.points, err: mirrored.err, dir: (d) => mirrored.dir(flip(d)) };
    return plain;
  }

  /* ------------------------------------------------- building layout */
  // 64 directions spread evenly over a sphere
  const SPHERE = Array.from({ length: 64 }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / 64;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

  /* Where a new atom bonded to `parent` should appear: away from the
   * parent's other bonds, and across the screen rather than towards or
   * away from the viewer. view: the camera's looking direction. */
  function spot(m, pos, parent, el, view, right) {
    const p = pos.get(parent);
    const others = neighbours(m, parent).filter((x) => pos.has(x.id)).map((x) => V.norm(V.sub(pos.get(x.id), p)));
    let best = null;
    let bestScore = -Infinity;
    for (const d of SPHERE) {
      let near = Math.PI;
      for (const o of others) near = Math.min(near, Math.acos(Math.max(-1, Math.min(1, V.dot(d, o)))));
      const s = (others.length ? near : 0) - 0.9 * Math.abs(V.dot(d, view)) + (others.length ? 0 : 0.3 * V.dot(d, right));
      if (s > bestScore) {
        bestScore = s;
        best = d;
      }
    }
    return V.add(p, V.mul(best, bondLength(atom(m, parent).el, el, 1)));
  }

  /* One step of the springy layout used while building: bonds pull to
   * their length, every pair of atoms pushes apart, a little more for two
   * atoms sharing a neighbour. pos and vel are Maps id → [x,y,z]. */
  function layout(m, pos, vel, dt) {
    const ids = m.atoms.map((a) => a.id).filter((id) => pos.has(id));
    const F = new Map(ids.map((id) => [id, [0, 0, 0]]));
    const push = (id, f) => {
      const v = F.get(id);
      if (v) for (let k = 0; k < 3; k++) v[k] += f[k];
    };
    for (const x of m.bonds) {
      if (!pos.has(x.a) || !pos.has(x.b)) continue;
      const d = V.sub(pos.get(x.b), pos.get(x.a));
      const r = V.len(d) || 1e-6;
      const L = bondLength(atom(m, x.a).el, atom(m, x.b).el, x.order);
      const f = V.mul(d, (24 * (r - L)) / r);
      push(x.a, f);
      push(x.b, V.mul(f, -1));
    }
    const near = new Set();
    for (const a of m.atoms) {
      const nb = neighbours(m, a.id);
      for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) near.add(Math.min(nb[i].id, nb[j].id) + ':' + Math.max(nb[i].id, nb[j].id));
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const d = V.sub(pos.get(ids[j]), pos.get(ids[i]));
        const r2 = V.dot(d, d) + 0.04;
        if (r2 > 30) continue;
        const k = near.has(Math.min(ids[i], ids[j]) + ':' + Math.max(ids[i], ids[j])) ? 2.4 : 0.9;
        const f = V.mul(d, k / (r2 * Math.sqrt(r2)));
        push(ids[i], V.mul(f, -1));
        push(ids[j], f);
      }
    }
    let moved = 0;
    const damp = Math.exp(-6 * dt);
    for (const id of ids) {
      const v = vel.get(id) || [0, 0, 0];
      const f = F.get(id);
      for (let k = 0; k < 3; k++) v[k] = (v[k] + f[k] * dt) * damp;
      vel.set(id, v);
      const p = pos.get(id);
      for (let k = 0; k < 3; k++) p[k] += v[k] * dt;
      moved = Math.max(moved, V.len(v));
    }
    return moved;
  }

  /* ----------------------------------------------------------- messages */
  const the = (el) => `the ${elName(el)}`;
  const bondName = (a, b, o) => `${a}${BOND_MARK[o]}${b}`;
  // "bonded to an oxygen and 2 hydrogens"
  function bondedTo(m, id) {
    const nb = neighbours(m, id);
    if (!nb.length) return 'not bonded yet';
    const c = {};
    for (const x of nb) {
      const el = atom(m, x.id).el;
      c[el] = (c[el] || 0) + 1;
    }
    const parts = ORDER.filter((el) => c[el]).map((el) => many(c[el], el));
    const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    const multi = nb.filter((x) => x.order > 1).map((x) => `a ${BOND_WORD[x.order]} bond to ${an(atom(m, x.id).el)}`);
    return `bonded to ${list}${multi.length ? ` (${multi.join(', ')})` : ''}`;
  }
  const slotsLine = (m, id) => {
    const el = atom(m, id).el;
    const u = used(m, id);
    const v = ELEMENTS[el].valency;
    return u === v ? `full, ${plural(v, 'bond')}` : `${u} of ${plural(v, 'bond')}`;
  };

  const say = {
    start: (n, total, task) => `Task ${n} of ${total}: build ${task.name}, ${sub(task.formula)}. ${task.tip}`,
    free: () => 'Free build: make anything you like. When every atom is full, I will name the molecule if I know it.',
    selected: (m, id) => `${cap(elName(atom(m, id).el))} selected: ${slotsLine(m, id)}, ${bondedTo(m, id)}.`,
    deselected: () => 'Nothing selected: a new atom will start on its own. Arrow keys or Space pick an atom; Tab moves on to the buttons.',
    added: (el) => `Added ${an(el)}. It needs ${plural(ELEMENTS[el].valency, 'bond')}.`,
    addedAlone: (el) => `Added ${an(el)} on its own. To bond it, pick it and another atom, then press Bond.`,
    addedTo: (m, id, to) => {
      const el = atom(m, id).el;
      const toEl = atom(m, to).el;
      const u = used(m, to);
      const v = ELEMENTS[toEl].valency;
      return `${cap(elName(el))} bonded to ${the(toEl)}. ${cap(elName(toEl))}: ${u === v ? `full, ${plural(v, 'bond')}` : `${u} of ${plural(v, 'bond')}`}.`;
    },
    full: (el) => `That ${elName(el)} is full: it already has ${plural(ELEMENTS[el].valency, 'bond')}. Pick an atom with an open slot.`,
    max: () => `That is the lab’s limit: ${MAX_ATOMS} atoms.`,
    pickTwo: () => 'Pick two atoms first: one, then the other (Tab or a tap), then press Bond.',
    same: () => 'Pick a different second atom to bond to.',
    bondMade: (a, b) => `${bondName(a, b, 1)}: a single bond, one shared pair.`,
    bondUp: (a, b, o) => `${bondName(a, b, o)}: now a ${BOND_WORD[o]} bond, ${o === 2 ? 'two' : 'three'} shared pairs.`,
    bondGone: (a, b, was, stopEl) => {
      if (was === 3) return `${a}–${b} bond removed: a triple bond is the most two atoms can share.`;
      if (stopEl) return `${cap(elName(stopEl))} has no room for another bond, so the ${a}–${b} bond can’t be ${BOND_WORD[was + 1]}: bond removed.`;
      return `${a}–${b} bond removed.`;
    },
    removed: (el, hs) => `Removed ${an(el)}${hs ? ` and its ${hs === 1 ? 'hydrogen' : `${hs} hydrogens`}` : ''}.`,
    nothingSelected: () => 'Pick an atom first (Tab or a tap).',
    undo: () => 'Undone.',
    nothingToUndo: () => 'Nothing to undo.',
    cleared: () => 'Cleared. Press Z (Undo) to bring it back.',
    alreadyEmpty: () => 'Nothing to clear.',
    done: (task, shape, head) => `Correct! ${cap(task.name)}, ${sub(task.formula)}. ${shape}${head ? `, ${head.label} about ${deg(head.angle)}` : ''}.`,
    doneShort: (task, solved, total) => `${cap(task.name)} built! ${solved} of ${total} molecules done this visit.`,
    named: (entry, shape, head) => `That’s ${entry.name}, ${sub(entry.formula)}! ${shape}${head ? `, ${head.label} about ${deg(head.angle)}` : ''}. ${entry.fact}`,
    namedRing: (entry) => `That’s ${entry.name}, ${sub(entry.formula)}! ${entry.fact}`,
    unknown: (f) => `Every atom is full: ${sub(f)}. It is not one of the molecules I can name.`,
    isomer: (task, rec) => `This is ${rec ? rec.name : 'a different molecule'}, an isomer: the same atoms, joined differently. In ${task.name}, ${task.how}.`,
    other: (task, rec, f) => (rec
      ? `That’s ${rec.name}, ${sub(rec.formula)}. The task is ${task.name}, ${sub(task.formula)}.`
      : `Every atom is full, but you have ${sub(f)}. The task is ${task.name}, ${sub(task.formula)}.`),
    pieces: (n) => `Every atom is full, but they make ${n} separate molecules. The task needs one.`,
    // hints
    hintFree: (entry) => `Try building ${entry.name}, ${sub(entry.formula)}.`,
    hintStart: (el) => `Start with ${an(el)} (${el}).`,
    hintExtra: (task, el, have, need) => (need
      ? `${cap(task.name)}, ${sub(task.formula)}, has ${many(need, el)}: you have ${have}. One is selected: delete it.`
      : `${cap(task.name)}, ${sub(task.formula)}, has no ${elName(el)}. One is selected: delete it.`),
    hintJoin: (a, b) => `Join it to the ${elName(b)}: both are selected, so press Bond (B).`,
    hintAdd: (el) => `Add ${an(el)} to it (it is selected).`,
    hintUpgrade: (a, b, o, want) => `Make the ${bondName(a, b, o)} bond ${BOND_WORD[want]}: both atoms are selected, so press Bond (B)${want - o > 1 ? ' twice' : ''}.`,
    hintClose: (task) => `Nearly there: in ${task.name}, ${task.how}.`,
    hintLower: (task, a, b, o) => `${cap(task.name)} has no ${bondName(a, b, o)} ${BOND_WORD[o]} bond. Both atoms are selected: press Bond (B) to change it.`,
    hintUnbond: (task, a, b) => `In ${task.name}, ${task.how}. That ${a}–${b} bond does not belong: both atoms are selected, so press Bond (B) until it goes.`,
    hintRemove: (task, el) => `In ${task.name}, ${task.how}. That ${elName(el)} does not fit: it is selected, so delete it.`,
    hintRethink: (task) => `In ${task.name}, ${task.how}. Compare it with yours, or press X to clear and start again.`,
  };

  const api = {
    ELEMENTS,
    ORDER,
    MAX_ATOMS,
    BOND_WORD,
    BOND_MARK,
    TASKS,
    GROUPS,
    LIBRARY,
    SHAPES,
    empty,
    copy,
    atom,
    has,
    order,
    used,
    free,
    neighbours,
    counts,
    openSlots,
    pieces,
    setOrder,
    addAtom,
    removeAtom,
    deleteAtom,
    cycleBond,
    formula,
    formulaOf,
    countFormula,
    sub,
    parse,
    match,
    embed,
    recognise,
    check,
    hint,
    bondLength,
    lonePairs,
    geometry,
    angleAt,
    shapeText,
    headline,
    fit,
    spot,
    layout,
    elName,
    deg,
    V,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Chem = api;
})(this);
