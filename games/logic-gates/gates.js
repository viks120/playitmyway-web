/* Logic Gates: the circuits. The six gates, the levels, working out what a
 * circuit does for every row of its truth table, a brute-force solver (for
 * hints, and to prove every level can be solved), the wire router that lays
 * out each board, and every message.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node. In the page it is a classic script that sets window.Gates; in Node
 * it is a CommonJS module.
 *
 * A level has input switches, gate slots and output lamps. Each slot lists
 * where its wires come from: an input's name ('A') or an earlier slot's index
 * (0). A slot with one wire takes NOT, or any two-input gate with both of its
 * inputs joined to that wire. A slot with two wires takes any two-input gate.
 * Signals are 1, 0 or null (no signal yet: an empty slot sends nothing on).
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------- gates */
  const GATES = {
    AND: {
      id: 'AND', n: 2, fn: (a, b) => a & b, expr: 'A ∧ B',
      rule: 'The output is 1 only when both inputs are 1.',
      joined: 'Its inputs are joined, and A AND A = A: it passes the signal on.',
    },
    OR: {
      id: 'OR', n: 2, fn: (a, b) => a | b, expr: 'A ∨ B',
      rule: 'The output is 1 when at least one input is 1.',
      joined: 'Its inputs are joined, and A OR A = A: it passes the signal on.',
    },
    NOT: {
      id: 'NOT', n: 1, fn: (a) => 1 - a, expr: '¬A',
      rule: 'The output is the opposite of the input. It has just one input.',
      joined: '',
    },
    XOR: {
      id: 'XOR', n: 2, fn: (a, b) => a ^ b, expr: 'A ⊕ B',
      rule: 'The output is 1 when the two inputs are different.',
      joined: 'Its inputs are joined, so they never differ: XOR always gives 0.',
    },
    NAND: {
      id: 'NAND', n: 2, fn: (a, b) => 1 - (a & b), expr: '¬(A ∧ B)',
      rule: 'NOT AND: the output is 0 only when both inputs are 1.',
      joined: 'Its inputs are joined, so NAND flips the signal, just like NOT.',
    },
    NOR: {
      id: 'NOR', n: 2, fn: (a, b) => 1 - (a | b), expr: '¬(A ∨ B)',
      rule: 'NOT OR: the output is 1 only when both inputs are 0.',
      joined: 'Its inputs are joined, so NOR flips the signal, just like NOT.',
    },
  };
  const ORDER = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'];      // keys 1 to 6

  /* ------------------------------------------------------------ levels */
  // at: [column, row]. Switches sit in column 0 and lamps in the last column.
  const sw = (name, row) => ({ name, at: [0, row] });
  const LEVELS = [
    // ------------------------------------------------- meet the gates
    {
      title: 'First light',
      goal: 'The lamp should light only when A and B are both on. Which gate does that?',
      outro: 'That is AND: 1 only when both inputs are 1. Like two switches in a row, current gets through only when both are closed.',
      palette: ['AND', 'OR'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0.5], want: (A, B) => A & B }],
    },
    {
      title: 'Any will do',
      goal: 'Now the lamp should light when A is on, or B is on, or both are.',
      outro: 'That is OR: 1 when at least one input is 1. Only 0 and 0 gives 0.',
      palette: ['AND', 'OR'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0.5], want: (A, B) => A | B }],
    },
    {
      title: 'Upside down',
      goal: 'One switch and one wire. Make the lamp do the opposite of A.',
      outro: 'That is NOT: it flips its input, so 1 becomes 0 and 0 becomes 1. It has one input, so it fits a slot with one wire.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0)],
      slots: [{ in: ['A'], at: [1, 0] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0], want: (A) => 1 - A }],
    },
    {
      title: 'One or the other',
      goal: 'Light the lamp when exactly one switch is on, but not when both are.',
      outro: 'That is XOR, exclusive OR: 1 when the inputs are different. It is OR without the "both" row.',
      palette: ['AND', 'OR', 'XOR'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0.5], want: (A, B) => A ^ B }],
    },
    {
      title: 'Anything but both',
      goal: 'The lamp should stay on unless both switches are on.',
      outro: 'That is NAND, NOT AND: the AND answer flipped. The little circle on its tip means "then NOT".',
      palette: ['AND', 'OR', 'XOR', 'NAND'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0.5], want: (A, B) => 1 - (A & B) }],
    },
    {
      title: 'Lights out',
      goal: 'Light the lamp only when both switches are off.',
      outro: 'That is NOR, NOT OR: 1 only when both inputs are 0. NOT could not go here: it has one input, and this slot has two wires.',
      palette: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0.5], want: (A, B) => 1 - (A | B) }],
    },
    // ------------------------------------------------ gates together
    {
      title: 'Two-step NAND',
      goal: 'There is no NAND in the box this time. Make one from two gates.',
      outro: 'AND and then NOT is exactly NAND. That is what the little circle on the NAND symbol stands for.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }, { in: [0], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 1, at: [3, 0.5], want: (A, B) => 1 - (A & B) }],
    },
    {
      title: 'A but not B',
      goal: 'Light the lamp when A is on and B is off.',
      outro: 'A AND (NOT B). A NOT in front of an input makes the next gate react to that switch being off.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['B'], at: [1, 1] }, { in: ['A', 0], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 1, at: [3, 0.5], want: (A, B) => A & (1 - B) }],
    },
    {
      title: 'Burglar alarm',
      goal: 'A is the door, B is the window and C sets the alarm. Ring it if the door or the window opens while the alarm is set.',
      outro: '(A OR B) AND C. The OR spots anything open, then the AND checks the alarm is set. Three switches give 2 × 2 × 2 = 8 rows.',
      palette: ['AND', 'OR', 'XOR'],
      inputs: [sw('A', 0), sw('B', 1), sw('C', 2)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }, { in: [0, 'C'], at: [2, 1.25] }],
      outputs: [{ name: 'Q', from: 1, at: [3, 1.25], want: (A, B, C) => (A | B) & C }],
    },
    {
      title: 'If A, then B',
      goal: 'The rule is "if A is on, B must be on too". Light the lamp whenever the rule is kept.',
      outro: 'This is implication: (NOT A) OR B. The only way to break the rule is A on and B off. With A off, the rule cannot be broken.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A'], at: [1, 0] }, { in: [0, 'B'], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 1, at: [3, 0.5], want: (A, B) => (1 - A) | B }],
    },
    {
      title: 'Neither one',
      goal: 'No NOR in the box. Light the lamp only when neither switch is on.',
      outro: '(NOT A) AND (NOT B) has the same table as NOR. That is De Morgan’s law: NOT (A OR B) = (NOT A) AND (NOT B).',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A'], at: [1, 0] }, { in: ['B'], at: [1, 1] }, { in: [0, 1], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 2, at: [3, 0.5], want: (A, B) => (1 - A) & (1 - B) }],
    },
    {
      title: 'Not both',
      goal: 'No NAND in the box. Light the lamp unless both switches are on.',
      outro: '(NOT A) OR (NOT B) matches NAND. De Morgan’s other law: NOT (A AND B) = (NOT A) OR (NOT B).',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A'], at: [1, 0] }, { in: ['B'], at: [1, 1] }, { in: [0, 1], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 2, at: [3, 0.5], want: (A, B) => (1 - A) | (1 - B) }],
    },
    // ------------------------------------------------ NAND, then XOR
    {
      title: 'No NOT allowed',
      goal: 'Make the lamp the opposite of A, with no NOT gate in the box.',
      outro: 'Join both inputs of a NAND and it acts as NOT: 1 NAND 1 = 0 and 0 NAND 0 = 1.',
      palette: ['AND', 'OR', 'NAND'],
      inputs: [sw('A', 0)],
      slots: [{ in: ['A'], at: [1, 0] }],
      outputs: [{ name: 'Q', from: 0, at: [2, 0], want: (A) => 1 - A }],
    },
    {
      title: 'AND the long way',
      goal: 'There is no AND in the box. Make the lamp light only when A and B are both on.',
      outro: 'NAND, then a NAND with joined inputs (a NOT), flips the answer back: two NANDs make an AND.',
      palette: ['OR', 'NAND'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }, { in: [0], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 1, at: [3, 0.5], want: (A, B) => A & B }],
    },
    {
      title: 'OR from NAND',
      goal: 'There is no OR in the box. Light the lamp when A or B is on.',
      outro: 'Flip both inputs, then NAND them: three NANDs make an OR. NAND is a universal gate, because any circuit can be built from NANDs alone.',
      palette: ['AND', 'NAND'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A'], at: [1, 0] }, { in: ['B'], at: [1, 1] }, { in: [0, 1], at: [2, 0.5] }],
      outputs: [{ name: 'Q', from: 2, at: [3, 0.5], want: (A, B) => A | B }],
    },
    {
      title: 'XOR, built up',
      goal: 'Build XOR, exactly one switch on, from AND, OR and NOT.',
      outro: '(A OR B) AND NOT (A AND B): "at least one" and "not both" together make "exactly one".',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [
        { in: ['A', 'B'], at: [1, 0] },
        { in: ['A', 'B'], at: [1, 1] },
        { in: [1], at: [2, 1] },
        { in: [0, 2], at: [3, 0.5] },
      ],
      outputs: [{ name: 'Q', from: 3, at: [4, 0.5], want: (A, B) => A ^ B }],
    },
    {
      title: 'XOR, another way',
      goal: 'XOR again, wired differently. Light the lamp when exactly one switch is on.',
      outro: '(A AND NOT B) OR (NOT A AND B): one AND for each row that should light, joined by an OR. Building row by row like this works for any truth table.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [sw('A', 0), sw('B', 2)],
      slots: [
        { in: ['A'], at: [1, 1.5] },
        { in: ['B'], at: [1, 0.5] },
        { in: ['A', 1], at: [2, 0.25] },
        { in: [0, 'B'], at: [2, 1.75] },
        { in: [2, 3], at: [3, 1] },
      ],
      outputs: [{ name: 'Q', from: 4, at: [4, 1], want: (A, B) => A ^ B }],
    },
    {
      title: 'Four of a kind',
      goal: 'XOR one last time, from just two kinds of gate.',
      outro: 'Four NANDs make XOR. Chip makers love NAND: one kind of gate, repeated millions of times, can build a whole computer.',
      palette: ['AND', 'NAND'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [
        { in: ['A', 'B'], at: [1, 0.5] },
        { in: ['A', 0], at: [2, 0] },
        { in: [0, 'B'], at: [2, 1] },
        { in: [1, 2], at: [3, 0.5] },
      ],
      outputs: [{ name: 'Q', from: 3, at: [4, 0.5], want: (A, B) => A ^ B }],
    },
    // ------------------------------------------------- real circuits
    {
      title: 'Half adder',
      goal: 'Add two bits, A + B. C is the carry and S the sum, so 1 + 1 should give C = 1, S = 0: binary 10, which is 2.',
      outro: 'AND makes the carry and XOR makes the sum. This half adder is where the maths in every computer chip begins.',
      palette: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
      inputs: [sw('A', 0), sw('B', 1)],
      slots: [{ in: ['A', 'B'], at: [1, 0] }, { in: ['A', 'B'], at: [1, 1] }],
      outputs: [
        { name: 'C', from: 0, at: [2, 0], want: (A, B) => A & B },
        { name: 'S', from: 1, at: [2, 1], want: (A, B) => A ^ B },
      ],
      note: { head: 'A+B', row: (b) => `${b[0]}+${b[1]} = ${b[0] + b[1]}` },
    },
    {
      title: 'Parity check',
      goal: 'Light the lamp when an odd number of switches are on: one or three.',
      outro: 'Chained XORs keep track of odd and even. Computers add a parity bit like this to spot a bit that changed by mistake.',
      palette: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
      inputs: [sw('A', 0), sw('B', 1), sw('C', 2)],
      slots: [{ in: ['A', 'B'], at: [1, 0.5] }, { in: [0, 'C'], at: [2, 1.25] }],
      outputs: [{ name: 'P', from: 1, at: [3, 1.25], want: (A, B, C) => A ^ B ^ C }],
      note: { head: 'ones', row: (b) => String(b[0] + b[1] + b[2]) },
    },
    {
      title: 'Data selector',
      goal: 'S chooses. When S is 0 the lamp copies A, and when S is 1 it copies B.',
      outro: 'This is a multiplexer: S picks which input gets through. Computers use them everywhere to route data.',
      palette: ['AND', 'OR', 'NOT'],
      inputs: [{ name: 'S', at: [0, 1] }, sw('A', 0), { name: 'B', at: [0, 2] }],
      slots: [
        { in: ['S'], at: [1, 0.5] },
        { in: ['A', 0], at: [2, 0.25] },
        { in: ['S', 'B'], at: [2, 1.75] },
        { in: [1, 2], at: [3, 1] },
      ],
      outputs: [{ name: 'Q', from: 3, at: [4, 1], want: (S, A, B) => (S ? B : A) }],
    },
    {
      title: 'Majority vote',
      goal: 'Three judges vote yes (1) or no (0). Light the lamp when at least two say yes.',
      outro: '(A AND B) OR (C AND (A OR B)): either A and B agree, or C sides with one of them. Swap every AND for OR and every OR for AND and it still works!',
      palette: ['AND', 'OR'],
      inputs: [sw('A', 0), sw('B', 1), sw('C', 2)],
      slots: [
        { in: ['A', 'B'], at: [1, 0.5] },
        { in: ['A', 'B'], at: [1, 1.5] },
        { in: [1, 'C'], at: [2, 1.75] },
        { in: [0, 2], at: [3, 1.125] },
      ],
      outputs: [{ name: 'Q', from: 3, at: [4, 1.125], want: (A, B, C) => (A + B + C >= 2 ? 1 : 0) }],
      max: 2,
      note: { head: 'yes', row: (b) => String(b[0] + b[1] + b[2]) },
    },
    {
      title: 'Full adder',
      goal: 'Add three bits, A + B + Cin. Cout and S together give the answer in binary: 1 + 1 + 1 = 11, which is 3.',
      outro: 'Two half adders and an OR make a full adder; chain them and you can add numbers of any size. The last gate can be OR or XOR, because the two carries are never both 1.',
      palette: ['AND', 'OR', 'XOR'],
      inputs: [sw('A', 0), sw('B', 1), sw('Cin', 2)],
      slots: [
        { in: ['A', 'B'], at: [1, -0.5] },
        { in: ['A', 'B'], at: [1, 0.5] },
        { in: [1, 'Cin'], at: [2, 0.75] },
        { in: [1, 'Cin'], at: [2, 1.75] },
        { in: [0, 2], at: [3, 0] },
      ],
      outputs: [
        { name: 'Cout', from: 4, at: [4, 0], want: (A, B, C) => (A + B + C >= 2 ? 1 : 0) },
        { name: 'S', from: 3, at: [4, 1.75], want: (A, B, C) => (A + B + C) & 1 },
      ],
      max: 2,
      note: { head: 'sum', row: (b) => `${b[0]}+${b[1]}+${b[2]} = ${b[0] + b[1] + b[2]}` },
    },
    {
      title: 'Equal numbers',
      goal: 'A1 A0 and B1 B0 are two 2-bit numbers. Light the lamp only when they are equal.',
      outro: 'Each XOR spots a difference in one pair of bits, and the NOR lights only when there are no differences at all.',
      palette: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
      inputs: [{ name: 'A1', at: [0, 0] }, { name: 'A0', at: [0, 2] }, { name: 'B1', at: [0, 1] }, { name: 'B0', at: [0, 3] }],
      slots: [{ in: ['A1', 'B1'], at: [1, 0.5] }, { in: ['A0', 'B0'], at: [1, 2.5] }, { in: [0, 1], at: [2, 1.5] }],
      outputs: [{ name: 'Eq', from: 2, at: [3, 1.5], want: (A1, A0, B1, B0) => (A1 === B1 && A0 === B0 ? 1 : 0) }],
      note: { head: 'A, B', row: (b) => `${2 * b[0] + b[1]}, ${2 * b[2] + b[3]}` },
    },
  ];
  const GROUPS = [
    { title: 'Meet the gates', from: 0, to: 6 },
    { title: 'Gates together', from: 6, to: 12 },
    { title: 'NAND does it all, then XOR', from: 12, to: 18 },
    { title: 'Real circuits', from: 18, to: 24 },
  ];

  /* --------------------------------------------------------- circuits */
  const isSlot = (src) => typeof src === 'number';
  const fits = (slot, id) => GATES[id].n === 1 ? slot.in.length === 1 : true;
  const joined = (slot, id) => slot.in.length === 1 && GATES[id].n === 2;

  // the gates a slot can take in this level, in key order
  function choices(level, i) {
    return ORDER.filter((id) => level.palette.includes(id) && fits(level.slots[i], id));
  }

  function apply(id, ins) {
    const g = GATES[id];
    if (g.n === 1) return g.fn(ins[0]);
    return ins.length === 1 ? g.fn(ins[0], ins[0]) : g.fn(ins[0], ins[1]);
  }

  // the input bits for row r, first input the most significant: 00, 01, 10, 11
  function bitsOf(level, r) {
    const n = level.inputs.length;
    return level.inputs.map((_, i) => (r >> (n - 1 - i)) & 1);
  }
  const rowOf = (bits) => bits.reduce((r, b) => r * 2 + b, 0);
  const rowCount = (level) => 1 << level.inputs.length;

  /* Every signal in the circuit for one set of switch positions: the value
   * leaving each slot and arriving at each lamp (1, 0 or null). */
  function run(level, gates, bits) {
    const env = {};
    level.inputs.forEach((inp, i) => { env[inp.name] = bits[i]; });
    const slots = [];
    const value = (src) => (isSlot(src) ? slots[src] : env[src]);
    level.slots.forEach((slot, i) => {
      const id = gates[i];
      const ins = slot.in.map(value);
      slots.push(!id || ins.some((v) => v == null) ? null : apply(id, ins));
    });
    return { inputs: bits.slice(), slots, outputs: level.outputs.map((o) => value(o.from)) };
  }

  const wantOf = (level, bits) => level.outputs.map((o) => (o.want(...bits) ? 1 : 0));

  /* The truth table: for each row, the inputs, the target outputs, the
   * circuit's outputs, and ok: true (matches), false (a lamp is wrong) or
   * null (no wrong lamp yet, but one has no signal). */
  function table(level, gates) {
    const rows = [];
    for (let r = 0; r < rowCount(level); r++) {
      const bits = bitsOf(level, r);
      const want = wantOf(level, bits);
      const got = run(level, gates, bits).outputs;
      let ok = true;
      got.forEach((v, k) => {
        if (v == null) { if (ok === true) ok = null; } else if (v !== want[k]) ok = false;
      });
      rows.push({ bits, want, got, ok });
    }
    return rows;
  }

  function score(level, gates) {
    const rows = table(level, gates);
    const match = rows.filter((r) => r.ok === true).length;
    const wrong = rows.filter((r) => r.ok === false).length;
    return { match, wrong, total: rows.length, solved: match === rows.length, rows };
  }

  /* Every way to fill the slots that matches the whole table: try every
   * gate the level allows in every slot. */
  function solutions(level) {
    const opts = level.slots.map((_, i) => choices(level, i));
    const out = [];
    const pick = new Array(opts.length).fill(null);
    (function fill(i) {
      if (i === opts.length) {
        if (score(level, pick).solved) out.push(pick.slice());
        return;
      }
      for (const id of opts[i]) {
        pick[i] = id;
        fill(i + 1);
      }
      pick[i] = null;
    })(0);
    return out;
  }

  /* A hint from the solution nearest to what is on the board: a slot holding
   * the wrong gate first (it misleads), else an empty slot. */
  function hint(level, gates, sols) {
    if (score(level, gates).solved) return { kind: 'solved' };
    const all = sols || solutions(level);
    if (!all.length) return { kind: 'none' };
    let best = all[0];
    let bestOff = Infinity;
    for (const s of all) {
      const off = s.reduce((n, id, i) => n + (gates[i] === id ? 0 : 1), 0);
      if (off < bestOff) {
        bestOff = off;
        best = s;
      }
    }
    const wrong = best.findIndex((id, i) => gates[i] && gates[i] !== id);
    if (wrong >= 0) return { kind: 'wrong', slot: wrong, gate: best[wrong], has: gates[wrong] };
    const empty = best.findIndex((id, i) => !gates[i]);
    return { kind: 'empty', slot: empty, gate: best[empty] };
  }

  // the next gate when a slot is tapped: through the allowed gates, round again
  function cycle(level, i, current) {
    const opts = choices(level, i);
    if (!opts.length) return null;
    const k = opts.indexOf(current);
    return opts[(k + 1) % opts.length];
  }

  /* ------------------------------------------------------------ layout */
  /* Board geometry in board units: x runs left to right with the signal,
   * y runs down the board (row 0 at the top). */
  const GEO = {
    sw: { hw: 0.42, hh: 0.34 },     // half the width and depth of a switch
    gate: { hw: 0.62, hh: 0.38 },   // ... of a gate slot
    lamp: { hw: 0.34, hh: 0.34 },   // ... of a lamp
    pin: 0.25,                      // a two-wire slot's inputs, above and below its middle
    track: 0.26,                    // between neighbouring wires in a channel
    pad: 0.26,                      // from a channel's outer wire to the parts beside it
    minChannel: 0.62,
    clear: 0.06,                    // a wire passing a part keeps this far off it
    margin: 0.48,                   // round the edge of the board
  };
  const EPS = 1e-6;

  function permutations(a) {
    if (a.length <= 1) return [a.slice()];
    const out = [];
    a.forEach((x, i) => {
      for (const p of permutations(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x].concat(p));
    });
    return out;
  }

  /* Lay out a level: where each part sits, and the path of every wire.
   * Each wire runs from its source to the pin it feeds: straight along, or
   * along, down (or up) one channel between columns, and along again. Wires
   * from the same source share their path until they part, where a junction
   * dot shows the join. Wires from different sources never run on top of each
   * other; where one has to cross another it hops over it (a crossing). */
  function layout(level) {
    const last = Math.max(...level.outputs.map((o) => o.at[0]));
    const half = (c) => (c === 0 ? GEO.sw : c === last ? GEO.lamp : GEO.gate);
    const nodes = [];
    const add = (kind, i, at) => {
      const n = { kind, i, col: at[0], y: at[1], hw: half(at[0]).hw, hh: half(at[0]).hh };
      nodes.push(n);
      return n;
    };
    const inNodes = level.inputs.map((inp, i) => add('in', i, inp.at));
    const slotNodes = level.slots.map((s, i) => add('slot', i, s.at));
    const outNodes = level.outputs.map((o, i) => add('out', i, o.at));
    inNodes.forEach((n) => { if (n.col !== 0) throw new Error('switches go in column 0'); });
    slotNodes.forEach((n) => { if (n.col < 1 || n.col >= last) throw new Error('slots go between the switches and the lamps'); });

    const srcNode = (src) => (isSlot(src) ? slotNodes[src] : inNodes[level.inputs.findIndex((p) => p.name === src)]);
    const netOf = (src) => (isSlot(src) ? 's' + src : 'in:' + src);

    // every wire: from a source to a slot's pin or a lamp
    const wires = [];
    level.slots.forEach((slot, i) => {
      slot.in.forEach((src, k) => {
        const to = slotNodes[i];
        if (isSlot(src) && src >= i) throw new Error('a slot can only take wires from earlier slots');
        const dy = slot.in.length === 2 ? (k === 0 ? -GEO.pin : GEO.pin) : 0;
        wires.push({ net: netOf(src), from: srcNode(src), to, pin: k, sy: srcNode(src).y, py: to.y + dy, dest: { kind: 'slot', i, pin: k } });
      });
    });
    level.outputs.forEach((o, j) => {
      wires.push({ net: netOf(o.from), from: srcNode(o.from), to: outNodes[j], pin: 0, sy: srcNode(o.from).y, py: outNodes[j].y, dest: { kind: 'out', i: j } });
    });

    // is a horizontal wire at y clear of every part in columns a to b?
    const clearRow = (y, a, b) => nodes.every((n) => n.col < a || n.col > b || Math.abs(y - n.y) > n.hh + GEO.clear);

    // which channel each wire turns in: the latest one that keeps it clear of every part
    wires.forEach((w) => {
      const cs = w.from.col;
      const ct = w.to.col;
      if (Math.abs(w.sy - w.py) < EPS) {
        if (!clearRow(w.sy, cs + 1, ct - 1)) throw new Error(`a straight wire from ${w.net} runs through a part`);
        w.bend = null;
        return;
      }
      for (let ch = ct; ch > cs; ch--) {
        if (clearRow(w.sy, cs + 1, ch - 1) && clearRow(w.py, ch, ct - 1)) {
          w.bend = ch;
          return;
        }
      }
      throw new Error(`no clear route for a wire from ${w.net}`);
    });

    // in each channel, give every source turning there its own track, in the order that crosses least
    const channels = [];
    for (let ch = 1; ch <= last; ch++) {
      const turning = wires.filter((w) => w.bend === ch);
      const nets = [];
      turning.forEach((w) => {
        let net = nets.find((n) => n.net === w.net);
        if (!net) {
          net = { net: w.net, sy: w.sy, pys: [], lo: w.sy, hi: w.sy };
          nets.push(net);
        }
        net.pys.push(w.py);
        net.lo = Math.min(net.lo, w.py);
        net.hi = Math.max(net.hi, w.py);
      });
      // wires running straight across this channel
      const across = wires.filter((w) => {
        if (w.bend === ch) return false;
        if (w.bend == null) return w.from.col < ch && w.to.col >= ch;
        return (w.from.col < ch && w.bend > ch) || (w.bend < ch && w.to.col >= ch);
      }).map((w) => (w.bend == null || w.bend > ch ? w.sy : w.py));
      const inside = (y, n) => y > n.lo + EPS && y < n.hi - EPS;
      const crossings = (order) => {
        let c = 0;
        order.forEach((n, t) => {
          across.forEach((y) => { if (inside(y, n)) c++; });
          order.forEach((m, u) => {
            if (m === n) return;
            if (t < u && inside(m.sy, n)) c++;                       // m comes in from the left, past n
            if (t > u) m.pys.forEach((py) => { if (inside(py, n)) c++; });   // m leaves to the right, past n
          });
        });
        return c;
      };
      nets.sort((a, b) => a.sy - b.sy);
      let best = nets;
      let bestC = Infinity;
      for (const order of permutations(nets)) {
        const c = crossings(order);
        if (c < bestC) {
          bestC = c;
          best = order;
        }
      }
      const width = Math.max(GEO.minChannel, 2 * GEO.pad + Math.max(0, best.length - 1) * GEO.track);
      channels[ch] = { order: best, width, crossings: bestC };
    }

    // columns, left to right
    const colX = [0];
    for (let c = 1; c <= last; c++) colX[c] = colX[c - 1] + half(c - 1).hw + channels[c].width + half(c).hw;
    nodes.forEach((n) => { n.x = colX[n.col]; });

    // the wires' paths
    wires.forEach((w) => {
      const sx = w.from.x + w.from.hw;
      const px = w.to.x - w.to.hw;
      if (w.bend == null) {
        w.path = [[sx, w.sy], [px, w.py]];
        return;
      }
      const ch = channels[w.bend];
      const left = colX[w.bend - 1] + half(w.bend - 1).hw;
      const used = 2 * GEO.pad + Math.max(0, ch.order.length - 1) * GEO.track;
      const t = ch.order.findIndex((n) => n.net === w.net);
      const tx = left + (ch.width - used) / 2 + GEO.pad + t * GEO.track;
      w.path = [[sx, w.sy], [tx, w.sy], [tx, w.py], [px, w.py]];
    });

    // where wires of different sources cross: the upright one hops over
    const segs = (w) => w.path.slice(1).map((p, k) => [w.path[k], p]);
    const upright = (s) => Math.abs(s[0][0] - s[1][0]) < EPS;
    const within = (v, a, b) => v > Math.min(a, b) + EPS && v < Math.max(a, b) - EPS;
    const cross = [];
    wires.forEach((w, wi) => {
      segs(w).forEach((s, si) => {
        if (!upright(s)) return;
        const x = s[0][0];
        wires.forEach((v) => {
          if (v.net === w.net) return;
          segs(v).forEach((h) => {
            if (upright(h)) return;
            const y = h[0][1];
            if (within(x, h[0][0], h[1][0]) && within(y, s[0][1], s[1][1])) cross.push({ x, y, wire: wi, seg: si });
          });
        });
      });
    });

    // where wires from one source part company
    const junctions = [];
    const key = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3);
    const seen = new Set();
    function parting(a, b) {
      let i = 0;
      let j = 0;
      let cur = a[0].slice();
      for (;;) {
        if (i + 1 >= a.length || j + 1 >= b.length) return cur;
        const da = [Math.sign(a[i + 1][0] - cur[0]), Math.sign(a[i + 1][1] - cur[1])];
        const db = [Math.sign(b[j + 1][0] - cur[0]), Math.sign(b[j + 1][1] - cur[1])];
        if (da[0] !== db[0] || da[1] !== db[1]) return cur;
        const la = Math.abs(a[i + 1][0] - cur[0]) + Math.abs(a[i + 1][1] - cur[1]);
        const lb = Math.abs(b[j + 1][0] - cur[0]) + Math.abs(b[j + 1][1] - cur[1]);
        const step = Math.min(la, lb);
        cur = [cur[0] + da[0] * step, cur[1] + da[1] * step];
        if (la - step < EPS) i++;
        if (lb - step < EPS) j++;
      }
    }
    const srcOf = (w) => ({ kind: w.from.kind === 'in' ? 'in' : 'slot', i: w.from.i });
    wires.forEach((w, a) => {
      wires.forEach((v, b) => {
        if (b <= a || v.net !== w.net) return;
        const p = parting(w.path, v.path);
        const start = w.path[0];
        if (Math.abs(p[0] - start[0]) < EPS && Math.abs(p[1] - start[1]) < EPS) return;
        if (!seen.has(key(p))) {
          seen.add(key(p));
          junctions.push({ x: p[0], y: p[1], net: w.net, src: srcOf(w) });
        }
      });
    });

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x - n.hw);
      maxX = Math.max(maxX, n.x + n.hw);
      minY = Math.min(minY, n.y - n.hh);
      maxY = Math.max(maxY, n.y + n.hh);
    });
    wires.forEach((w) => w.path.forEach(([x, y]) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }));
    const m = GEO.margin;
    return {
      nodes,
      inputs: inNodes,
      slots: slotNodes,
      outputs: outNodes,
      wires: wires.map((w) => ({ net: w.net, src: srcOf(w), dest: w.dest, path: w.path })),
      crossings: cross,
      junctions,
      bounds: { minX: minX - m, maxX: maxX + m, minY: minY - m, maxY: maxY + m },
    };
  }

  /* ---------------------------------------------------------- messages */
  const listOf = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const bitsText = (level, bits) => level.inputs.map((p, i) => `${p.name}=${bits[i]}`).join(' ');
  const say = {
    start: (n, level) => `Level ${n}: ${level.title}. Fill ${level.slots.length === 1 ? 'the slot' : `the ${level.slots.length} slots`} so every row of the table ticks.`,
    placed: (slot, id, isJoined, s) => `${id} in slot ${slot}.${isJoined ? ' ' + GATES[id].joined : ''} ${s.match} of ${s.total} rows match.`,
    emptied: (slot, s) => `Slot ${slot} is empty again. ${s.match} of ${s.total} rows match.`,
    alreadyEmpty: (slot) => `Slot ${slot} is already empty.`,
    noFit: () => 'NOT has only one input, so it only fits a slot with one wire going in.',
    notInBox: (id, palette) => `There is no ${id} in this level. You can use ${listOf(palette)}.`,
    lamp: (name, got, want) => (got == null ? `${name} has no signal yet.` : `${name} is ${got}${got === want ? ', as it should be.' : `, but should be ${want}.`}`),
    flip: (name, v) => `${name} is ${v ? 'on (1)' : 'off (0)'}.`,
    setTo: (level, bits) => `Switches set to ${bitsText(level, bits)}.`,
    slotPick: (slot, id) => `Slot ${slot} selected${id ? `, holding ${id}` : ''}. Pick a gate below, or tap the slot again to change it.`,
    testing: () => 'Testing every row of the truth table…',
    testRow: (level, bits, got, ok) => `${bitsText(level, bits)}: ${level.outputs.map((o, k) => `${o.name}=${got[k] == null ? '?' : got[k]}`).join(' ')} ${ok === true ? '✓' : ok === false ? '✗' : '?'}`,
    tested: (s, level) => {
      if (s.solved) return `All ${s.total} rows match!`;
      const bad = s.rows.find((r) => r.ok === false);
      if (bad) return `${s.match} of ${s.total} rows match. The first wrong row is ${bitsText(level, bad.bits)}.`;
      return `${s.match} of ${s.total} rows match. Some lamps have no signal yet: fill every slot.`;
    },
    testStopped: () => 'Testing stopped.',
    hintWrong: (slot) => `Slot ${slot} holds the wrong gate. Press H again for a suggestion.`,
    hintEmpty: (slot) => `Slot ${slot} still needs a gate. Press H again for a suggestion.`,
    hintTry: (slot, id) => `Try ${id} in slot ${slot}.`,
    hintSolved: () => 'Every row already matches!',
    solved: (n) => `Level ${n} solved! Every row of the truth table matches.`,
    solvedAgain: () => 'Every row matches again.',
    undo: () => 'Took back the last change.',
    nothingToUndo: () => 'Nothing to undo yet.',
    cleared: () => 'All the gates are out. Start again!',
    alreadyClear: () => 'The board is already empty.',
    slotFocus: (level, i, id) => {
      const slot = level.slots[i];
      const from = listOf(slot.in.map((src) => (isSlot(src) ? `slot ${src + 1}` : src)));
      const what = slot.in.length === 1 ? `one wire in, from ${from}` : `two wires in, from ${from}`;
      return `Slot ${i + 1}: ${what}. ${id ? `Holds ${id}.` : 'Empty.'}`;
    },
    switchFocus: (name, v) => `Switch ${name}, ${v ? 'on (1)' : 'off (0)'}. Enter flips it.`,
    rows: (s) => `${s.match} of ${s.total} rows match`,
  };

  const api = {
    GATES,
    ORDER: ORDER.slice(),
    LEVELS,
    GROUPS: GROUPS.map((g) => Object.assign({}, g)),
    GEO,
    fits,
    joined,
    choices,
    apply,
    bitsOf,
    rowOf,
    rowCount,
    run,
    wantOf,
    table,
    score,
    solutions,
    hint,
    cycle,
    layout,
    say,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Gates = api;
})(this);
