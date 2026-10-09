/* Tests for the shared 3D kit in games/shared/3d. Zero dependencies:
 *     node --test docs/tests/*.test.js
 * They load the shipped files, never a copy. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAMES = path.join(__dirname, '..', '..', 'games');
const KIT = path.join(GAMES, 'shared', '3d');

/* Load the trimmed Three.js bundle the way a browser would: as a classic
 * script whose top-level `var THREE` lands on the global object. */
function loadKit(files) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['three.min.js'].concat(files || [])) {
    vm.runInContext(fs.readFileSync(path.join(KIT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

function scripts(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scripts(p));
    else if (entry.name.endsWith('.js') && entry.name !== 'three.min.js') out.push(p);
  }
  return out;
}

test('three.min.js carries the full MIT licence text', () => {
  const head = fs.readFileSync(path.join(KIT, 'three.min.js'), 'utf8').slice(0, 2000);
  assert.match(head, /The MIT License/);
  assert.match(head, /Copyright © 2010-\d{4} three\.js authors/);
  assert.match(head, /Permission is hereby granted, free of charge/);
  assert.match(head, /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test('every THREE name any game script uses is in the trimmed bundle', () => {
  const exported = new Set(Object.keys(loadKit().THREE));
  const used = new Set();
  for (const file of scripts(GAMES)) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/\bTHREE\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
  }
  assert.ok(used.size > 20, 'expected the 3D games to use THREE');
  const missing = [...used].filter((name) => !exported.has(name)).sort();
  assert.deepEqual(missing, [], 'add these to docs/vendor/three-entry.js, then run node docs/vendor/build-three.js');
});

test('the four critters build, react and animate without a browser', () => {
  const { Critters } = loadKit(['toon.js', 'critters.js']);
  assert.deepEqual(Object.keys(Critters.KINDS), ['bunny', 'frog', 'dino', 'kitten']);
  assert.deepEqual(Object.values(Critters.KINDS).map((k) => `${k.name} the ${k.kind}`),
    ['Clover the Bunny', 'Pip the Frog', 'Plum the Baby Dino', 'Mango the Kitten']);
  for (const kind of Object.keys(Critters.KINDS)) {
    const rig = Critters.create(kind);
    let meshes = 0;
    rig.root.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes > 20, `${kind} has only ${meshes} meshes`);
    for (const name of ['earshake', 'puff', 'shake', 'bubble']) assert.ok(rig.react(name) > 0, name);
    for (let t = 1; t < 3; t += 0.05) rig.update(t, 0.05);
    assert.ok(Number.isFinite(rig.root.children[0].rotation.z));
    rig.dispose();
  }
  const h = Critters.hopCurve(0.3, 0.6);
  assert.equal(h.phase, 'air');
  assert.ok(h.y > 0);
  assert.equal(Critters.hopCurve(5, 0.6), null);
});

test('no page loads the kit from anywhere but games/shared/3d', () => {
  for (const game of ['stepping-stones', 'number-line-hop']) {
    const page = path.join(GAMES, game, 'index.html');
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    for (const f of ['three.min.js', 'toon.js', 'critters.js', 'sound.js']) {
      assert.ok(html.includes(`<script src="../shared/3d/${f}"></script>`), `${game} must load ../shared/3d/${f}`);
    }
  }
});
