/* Number Line Hop tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/number-line-hop/lines.js and check every pond
 * against the spec's rules, restated here without looking at lines.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const Lines = require(path.join(__dirname, '..', '..', 'games', 'number-line-hop', 'lines.js'));
const SEEDS = 2000;

const SPEC = {
  'add-10': { max: 10, ops: ['+'], jumps: [1, 5] },
  'sub-10': { max: 10, ops: ['-'], jumps: [1, 5] },
  'add-20': { max: 20, ops: ['+'], jumps: [2, 9], crossing: 5 },
  'sub-20': { max: 20, ops: ['-'], jumps: [2, 9], crossing: 5 },
  'mix-20': { max: 20, ops: ['+', '-'], jumps: [1, 9], eachOp: 3 },
};
const STAGES = ['count', 'count', 'count', 'guess', 'guess', 'guess', 'gap', 'gap', 'gap'];
const crossesTen = (p) => (p.op === '+' ? p.start < 10 && p.end > 10 : p.start > 10 && p.end < 10);

test('five ponds in menu order, in two groups, with Add to 10 as the start', () => {
  assert.deepEqual(Lines.LIST.map((p) => p.id), Object.keys(SPEC));
  assert.deepEqual(Lines.LIST.map((p) => p.title), ['Add to 10', 'Take away from 10', 'Add to 20', 'Take away from 20', 'Mix it up']);
  assert.deepEqual(Lines.LIST.filter((p) => p.start).map((p) => p.id), ['add-10']);
  assert.deepEqual(Lines.GROUPS.map((g) => g.ids).flat(), Object.keys(SPEC));
});

for (const [id, s] of Object.entries(SPEC)) {
  test(`${id}: ${SEEDS} ponds keep every promise`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const pond = Lines.generate(id, seed);
      const where = `${id} seed ${seed}`;
      assert.equal(pond.id, id, where);
      assert.equal(pond.max, s.max, where);
      assert.deepEqual(pond.problems.map((p) => p.stage), STAGES, where);
      const seen = new Set();
      let crossing = 0;
      const ops = { '+': 0, '-': 0 };
      for (const p of pond.problems) {
        const what = `${where}: ${p.start} ${p.op} ${p.jump}`;
        assert.ok(s.ops.includes(p.op), what);
        assert.equal(p.end, p.op === '+' ? p.start + p.jump : p.start - p.jump, what);
        assert.ok(p.start >= 0 && p.start <= s.max && p.end >= 0 && p.end <= s.max, `${what} leaves the line`);
        assert.ok(p.jump >= s.jumps[0] && p.jump <= s.jumps[1], `${what} jump out of range`);
        if (p.op === '+') assert.ok(p.start >= 1, `${what} adds from 0`);
        if (p.stage === 'gap') assert.ok(p.jump >= 2, `${what} is a one-hop gap`);
        assert.equal(p.crosses, crossesTen(p), what);
        const key = p.op + p.start + ':' + p.jump;
        assert.ok(!seen.has(key), `${what} repeats`);
        seen.add(key);
        if (crossesTen(p)) crossing++;
        ops[p.op]++;
        const choices = Lines.choices(id, p);
        assert.deepEqual(choices, choices.map((_, i) => i + 1), `${what} choices not 1..k`);
        assert.ok(choices.includes(p.jump), `${what} choices miss the answer`);
        for (const c of choices) {
          const at = p.op === '+' ? p.start + c : p.start - c;
          assert.ok(at >= 0 && at <= s.max, `${what} choice ${c} hops off the line`);
        }
        assert.ok(choices.length <= s.jumps[1], what);
      }
      if (s.crossing) assert.ok(crossing >= s.crossing, `${where}: only ${crossing} cross ten`);
      if (s.eachOp) for (const op of s.ops) assert.ok(ops[op] >= s.eachOp, `${where}: only ${ops[op]} of ${op}`);
    }
  });
}

test('the same seed always builds the same pond, and different seeds vary', () => {
  assert.deepEqual(Lines.generate('add-20', 42), Lines.generate('add-20', 42));
  const firsts = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const p = Lines.generate('add-20', seed).problems[0];
    firsts.add(p.start + '+' + p.jump);
  }
  assert.ok(firsts.size > 40, `only ${firsts.size} different first problems in 100 ponds`);
});

test('every message uses the exact wording from the spec', () => {
  const add = { op: '+', start: 4, jump: 3, end: 7, stage: 'count' };
  const sub = { op: '-', start: 9, jump: 4, end: 5, stage: 'count' };
  const S = Lines.say;
  assert.equal(S.prompt(add, 'Plum', 'Mango'), 'Plum is on 4. Hop 3 more!');
  assert.equal(S.prompt(sub, 'Plum', 'Mango'), 'Plum is on 9. Hop 4 back!');
  assert.equal(S.counted(add), 'You counted on: 5, 6, 7!');
  assert.equal(S.counted(sub), 'You counted back: 8, 7, 6, 5!');
  assert.equal(S.counting(add, 1), '5…');
  assert.equal(S.counting(add, 3), '5… 6… 7!');
  assert.equal(S.prompt({ ...add, stage: 'guess' }, 'Plum', 'Mango'), 'Where will Plum land? Tap that pad.');
  assert.equal(S.guessing(8), "You think 8. Let's hop and see!");
  assert.equal(S.guessRight(add), 'Yes! You guessed 7.');
  assert.equal(S.guessWrong(add, 8, 'Plum'), 'Plum landed on 7, not 8. Count the hops: 5, 6, 7.');
  assert.equal(S.guessWrong(sub, 6, 'Plum'), 'Plum landed on 5, not 6. Count the hops: 8, 7, 6, 5.');
  assert.equal(S.prompt({ ...add, stage: 'gap' }, 'Plum', 'Mango'), 'Mango is on 7. How many hops?');
  assert.equal(S.prompt({ ...sub, stage: 'gap' }, 'Plum', 'Mango'), 'Mango is on 5. How many hops back?');
  assert.equal(S.gapRight(add), '3 hops! 4 + 3 = 7');
  assert.equal(S.gapRight(sub), '4 hops! 9 − 4 = 5');
  assert.equal(S.gapShort(add, 2, 'Plum', 'Mango'), 'Plum landed on 6. Mango is 1 more hop away! Try again.');
  assert.equal(S.gapShort(sub, 2, 'Plum', 'Mango'), 'Plum landed on 7. Mango is 2 more hops away! Try again.');
  assert.equal(S.gapFar(add, 4, 'Mango'), 'Too far! 4 + 4 = 8, past Mango. Try again.');
  assert.equal(S.gapFar(sub, 6, 'Mango'), 'Too far! 9 − 6 = 3, past Mango. Try again.');
  assert.equal(S.gapShow(add), "Let's count together: 5, 6, 7. That's 3 hops! 4 + 3 = 7");
  assert.equal(S.gapShow(sub), "Let's count together: 8, 7, 6, 5. That's 4 hops! 9 − 4 = 5");
  assert.equal(S.equation(add, 'end'), '4 + 3 = ?');
  assert.equal(S.equation(add, 'jump'), '4 + ? = 7');
  assert.equal(S.equation(sub), '9 − 4 = 5');
  assert.equal(S.line(10, 'Plum', 7, 'Mango', 9), 'Number line from 0 to 10. Plum is on 7. Mango is on 9.');
  assert.equal(S.line(20, 'Pip', 3), 'Number line from 0 to 20. Pip is on 3.');
  assert.equal(S.doneSub(0), 'Every answer right first time!');
  assert.equal(S.doneSub(2), '4 of 6 right first time.');
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(Lines.stars), [3, 3, 2, 2, 1, 1]);
});
