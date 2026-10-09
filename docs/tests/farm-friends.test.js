/* Farm Friends tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/farm-friends/farm.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const fs = require('fs');
const vm = require('vm');

const F = require(path.join(__dirname, '..', '..', 'games', 'farm-friends', 'farm.js'));
const GAMES = path.join(__dirname, '..', '..', 'games');

test('all eight animals build with the shared kit, breathe, blink and react', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['shared/3d/three.min.js', 'shared/3d/toon.js', 'shared/3d/critters.js', 'farm-friends/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(GAMES, f), 'utf8'), ctx, { filename: f });
  }
  assert.deepEqual([...ctx.Animals.ids].sort(), F.ANIMALS.map((a) => a.id).sort());
  for (const id of ctx.Animals.ids) {
    const rig = ctx.Animals.create(id);
    assert.equal(rig.kind, id);
    assert.ok(rig.parts.head && rig.parts.eyes.length === 2, `${id} needs a head and two eyes`);
    for (let t = 0; t < 3; t += 0.1) rig.update(t, 0.1);
    assert.ok(rig.react('shake') > 0);
    let meshes = 0;
    rig.root.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes > 10, `${id} has only ${meshes} meshes`);
  }
});

test('eight animals with their sounds, the cow and the duck first; five levels from 2 animals to 4', () => {
  assert.deepEqual(F.ANIMALS.map((a) => a.id), ['cow', 'duck', 'pig', 'sheep', 'dog', 'cat', 'horse', 'chicken']);
  assert.ok(F.ANIMALS.every((a) => /^[A-Z][a-z]+!$/.test(a.sound)));
  assert.deepEqual(F.LEVELS.map((l) => [l.animals, l.inPlay]), [[2, 2], [2, 4], [3, 6], [3, 8], [4, 8]]);
});

test('every round, 1,000 seeds × 30 rounds × each level: different animals, the one to find among them, no repeats', () => {
  F.LEVELS.forEach((L, level) => {
    const inPlay = F.ANIMALS.slice(0, L.inPlay).map((a) => a.id);
    for (let seed = 1; seed <= 1000; seed++) {
      let prev = null;
      for (let n = 0; n < 30; n++) {
        const r = F.round(seed, n, level, prev);
        const where = `level ${level} seed ${seed} round ${n}`;
        assert.equal(r.animals.length, L.animals, where);
        assert.equal(new Set(r.animals).size, L.animals, `${where}: an animal repeats`);
        assert.ok(r.animals.includes(r.target), where);
        assert.ok(r.animals.every((a) => inPlay.includes(a)), `${where}: an animal not yet in play`);
        assert.notEqual(r.target, prev, `${where}: the same animal twice in a row`);
        prev = r.target;
      }
    }
  });
});

test('every animal gets asked for, in every spot, and the same seed gives the same round', () => {
  const asked = new Set();
  const slots = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const r = F.round(seed, 0, 4, null);
    asked.add(r.target);
    slots.add(r.animals.indexOf(r.target));
  }
  assert.equal(asked.size, 8);
  assert.deepEqual([...slots].sort(), [0, 1, 2, 3]);
  assert.deepEqual(F.round(9, 4, 2, 'cow'), F.round(9, 4, 2, 'cow'));
});

test('the level adapts: up on a first-tap find, steady on the second, down after that', () => {
  assert.equal(F.nextLevel(0, 1), 1);
  assert.equal(F.nextLevel(4, 1), 4);
  assert.equal(F.nextLevel(2, 2), 2);
  assert.equal(F.nextLevel(2, 3), 1);
});

test('every message, word for word', () => {
  assert.equal(F.say.ask('cow'), "Where's the cow?");
  assert.equal(F.say.yes('cow'), "Yes! That's the cow! Moo!");
  assert.equal(F.say.no('pig', 'cow'), "That's the pig. Oink! Where's the cow?");
  assert.equal(F.say.party(), 'Five animals found! Hooray!');
  assert.equal(F.say.focus(0, 3, 'duck'), 'Animal 1 of 3: duck');
  assert.equal(F.say.progress(3), '3 of 5 animals found');
});
