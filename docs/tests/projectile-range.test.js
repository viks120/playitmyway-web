/* Projectile Range tests. Zero dependencies:   node --test docs/tests/*.test.js
 * They load the shipped games/projectile-range/flight.js, check the physics
 * against worked examples, and prove that every level can be hit using the
 * controls' own steps (0.5° and 0.1 m/s) within their ranges. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const F = require(path.join(__dirname, '..', '..', 'games', 'projectile-range', 'flight.js'));

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what || ''} ${a} is not within ${tol} of ${b}`);
// a level with no target worries, for testing landings
const range = (extra) => Object.assign({ n: 0, planet: 'earth', fix: null, blocks: [], shots: null, two: false, target: { x: 1000, w: 1, on: -1 } }, extra);

test('the flat-ground formulas match worked examples', () => {
  // v = 20 m/s at 45° on Earth: R = v²/g, H = v²/4g, T = √2 v/g
  let f = F.flat(45, 20, 9.8);
  near(f.R, 40.816, 1e-3, 'R');
  near(f.H, 10.204, 1e-3, 'H');
  near(f.T, 2.886, 1e-3, 'T');
  // 15 m/s at 60°: the textbook example
  f = F.flat(60, 15, 9.8);
  near(f.T, 2.651, 1e-3, 'T');
  near(f.H, 8.610, 1e-3, 'H');
  near(f.R, 19.883, 1e-3, 'R');
  // 10 m/s at 30°
  f = F.flat(30, 10, 9.8);
  near(f.T, 1.0204, 1e-4, 'T');
  near(f.H, 1.2755, 1e-4, 'H');
  near(f.R, 8.8370, 1e-4, 'R');
  // the same throw on the Moon goes 9.8 / 1.6 = 6.125 times as far
  near(F.flat(45, 8, 1.6).R, 40, 1e-9, 'Moon R');
  near(F.flat(30, 12, 1.6).R / F.flat(30, 12, 9.8).R, 6.125, 1e-9, 'Moon / Earth');
  assert.deepEqual(Object.values(F.PLANETS).map((p) => p.g), [9.8, 1.6, 3.7, 24.8]);
});

test('the path is x = v cos θ t, y = v sin θ t − ½gt²: highest at T/2, back down at T, landing at R', () => {
  for (const [a, v, g] of [[30, 12, 9.8], [45, 20, 9.8], [62.5, 17.3, 3.7], [15, 30, 24.8], [80, 9, 1.6]]) {
    const s = F.launch(a, v, g);
    const f = F.flat(a, v, g);
    near(F.at(s, f.T).y, 0, 1e-9, 'y(T)');
    near(F.at(s, f.T).x, f.R, 1e-9, 'x(T)');
    near(F.at(s, f.T / 2).y, f.H, 1e-9, 'y(T/2)');
    near(F.velocity(s, f.T / 2).y, 0, 1e-9, 'vy at the top');
    near(F.velocity(s, f.T).y, -s.vy, 1e-9, 'it comes down as fast as it went up');
    for (const t of [0.1, f.T / 3, f.T * 0.8]) {
      const p = F.at(s, t);
      near(F.heightAt(s, p.x), p.y, 1e-9, 'the trajectory equation');
    }
    const r = F.fly(range({ planet: g === 9.8 ? 'earth' : g === 1.6 ? 'moon' : g === 3.7 ? 'mars' : 'heavy' }), a, v);
    assert.equal(r.hit.kind, 'ground');
    near(r.hit.x, f.R, 1e-9);
    near(r.measured.h, f.H, 1e-9);
  }
});

test('complementary angles land together, and 45° goes furthest', () => {
  for (const a of [10, 22.5, 30, 37, 44.5]) near(F.flat(a, 18, 9.8).R, F.flat(90 - a, 18, 9.8).R, 1e-9, `${a}° and ${90 - a}°`);
  const best = F.angleValues(range({})).reduce((b, a) => (F.flat(a, 18, 9.8).R > F.flat(b, 18, 9.8).R ? a : b));
  assert.equal(best, 45);
  // the high shot of a pair stays up longer and climbs higher
  assert.ok(F.flat(65, 16, 9.8).T > F.flat(25, 16, 9.8).T);
  assert.ok(F.flat(65, 16, 9.8).H > F.flat(25, 16, 9.8).H);
});

test('landing on a platform uses T = (v sin θ + √(v² sin² θ − 2gh)) / g', () => {
  const s = F.launch(45, 20, 9.8);
  const t = F.downThrough(s, 5);
  near(t, (20 * Math.SQRT1_2 + Math.sqrt(200 - 98)) / 9.8, 1e-12);
  near(t, 2.4736, 1e-4, 'T');
  near(s.vx * t, 34.9825, 1e-3, 'x');
  assert.equal(F.downThrough(s, 10.3), null, 'it never gets 10.3 m up');
  const lv = range({ blocks: [{ kind: 'platform', x0: 30, x1: 40, h: 5 }], target: { x: 35, w: 1, on: 0 } });
  const r = F.fly(lv, 45, 20);
  assert.equal(r.hit.kind, 'top');
  near(r.hit.x, 34.9825, 1e-3);
  assert.equal(r.hit.y, 5);
  assert.equal(r.onTarget, true);
  assert.ok(r.passes[0].clear > 0, 'it clears the platform edge');
  // the same shot is not a hit on the ground target at the same place: it never gets there
  assert.equal(F.fly(range({ blocks: lv.blocks, target: { x: 35, w: 1, on: -1 } }), 45, 20).onTarget, false);
});

test('a wall blocks a low shot, lets a high one over, and can be landed on', () => {
  const lv = range({ blocks: [{ kind: 'wall', x0: 12, x1: 13, h: 7 }], target: { x: 30, w: 1.5, on: -1 } });
  const low = F.fly(lv, 23.5, 20);
  assert.equal(low.hit.kind, 'side');
  assert.equal(low.hit.x, 12);
  near(low.hit.y, 12 * Math.tan(23.5 * Math.PI / 180) - (9.8 * 144) / (2 * 400 * Math.cos(23.5 * Math.PI / 180) ** 2), 1e-9);
  assert.ok(low.hit.y < 7);
  assert.equal(low.onTarget, false);
  const high = F.fly(lv, 66.5, 20);
  assert.equal(high.hit.kind, 'ground');
  assert.equal(high.onTarget, true);
  assert.ok(high.passes[0].clear > 0);
  // flat-ground maths says both angles reach 30 m: only the wall tells them apart
  near(F.flat(23.5, 20, 9.8).R, F.flat(66.5, 20, 9.8).R, 1e-9);
  // a thick wall can be landed on top of
  const thick = range({ blocks: [{ kind: 'wall', x0: 20, x1: 26, h: 2 }] });
  const r = F.fly(thick, 45, 15);          // flat range 22.96 m, so it comes down onto the wall
  assert.equal(r.hit.kind, 'top');
  assert.ok(r.hit.x >= 20 && r.hit.x <= 26);
});

test('platforms: too low hits the side, too short lands before, too far flies over', () => {
  const lv = range({ blocks: [{ kind: 'platform', x0: 22, x1: 30, h: 4 }], target: { x: 26, w: 1.5, on: 0 } });
  const side = F.fly(lv, 25, 18);
  assert.equal(side.hit.kind, 'side');
  assert.ok(side.hit.y >= 0 && side.hit.y < 4);
  near(side.miss, 22 - 26, 1e-9, 'the miss is measured to where it stopped');
  const before = F.fly(lv, 20, 12);
  assert.equal(before.hit.kind, 'ground');
  assert.ok(before.hit.x < 22);
  const over = F.fly(lv, 45, 25);
  assert.equal(over.hit.kind, 'ground');
  assert.ok(over.hit.x > 30);
  assert.ok(over.miss > 0);
  // the highest point measured is the highest it really got: a shot stopped on the way up never reaches H
  const steep = F.fly(range({ blocks: [{ kind: 'wall', x0: 3, x1: 4, h: 20 }] }), 60, 25);
  assert.equal(steep.hit.kind, 'side');
  assert.ok(steep.hit.t < steep.apex.t);
  near(steep.measured.h, steep.hit.y, 1e-12);
  assert.ok(steep.measured.h < steep.flat.H);
});

test('the controls: 0.5° and 0.1 m/s steps, clamped to each world’s range, with no drift', () => {
  assert.deepEqual([F.ANGLE.min, F.ANGLE.max, F.ANGLE.step, F.SPEED.step], [10, 80, 0.5, 0.1]);
  assert.equal(F.snapAngle(32.26), 32.5);
  assert.equal(F.snapAngle(32.24), 32);
  assert.equal(F.snapAngle(3), 10);
  assert.equal(F.snapAngle(95), 80);
  const earth = range({});
  assert.equal(F.snapSpeed(earth, 17.149), 17.1);
  assert.equal(F.snapSpeed(earth, 99), 30);
  assert.equal(F.snapSpeed(range({ planet: 'moon' }), 1), 2);
  let v = 5;
  for (let i = 0; i < 123; i++) v = F.snapSpeed(earth, v + F.SPEED.step);
  assert.equal(v, 17.3, 'a hundred and twenty-three steps of 0.1 from 5 is exactly 17.3');
  assert.equal(String(v), '17.3');
  assert.equal(F.angleValues(earth).length, 141);
  assert.equal(F.speedValues(earth).length, 251);
  assert.equal(F.speedValues(range({ planet: 'moon' })).length, 121);
  for (const lv of F.LEVELS) {
    for (const a of F.angleValues(lv)) assert.equal(F.snapAngle(a), a);
    for (const s of F.speedValues(lv)) assert.equal(F.snapSpeed(lv, s), s);
  }
});

test('24 levels in seven groups, gentle first, with every kind of challenge', () => {
  assert.equal(F.LEVELS.length, 24);
  assert.deepEqual(F.GROUPS.map((g) => [g.from, g.to]), [[0, 4], [4, 8], [8, 11], [11, 14], [14, 17], [17, 21], [21, 24]]);
  F.LEVELS.forEach((lv, i) => {
    assert.equal(lv.n, i + 1);
    assert.ok(F.PLANETS[lv.planet], `level ${lv.n} world`);
    assert.ok([null, 'speed', 'angle'].includes(lv.fix));
    assert.ok(lv.tip && lv.tip.length < 120, `level ${lv.n} tip`);
    if (lv.target.on >= 0) {
      const b = lv.blocks[lv.target.on];
      assert.equal(b.kind, 'platform', `level ${lv.n} target sits on a platform`);
      assert.ok(lv.target.x - lv.target.w >= b.x0 && lv.target.x + lv.target.w <= b.x1, `level ${lv.n} target fits on its platform`);
    }
    lv.blocks.forEach((b) => assert.ok(b.x0 > 3 && b.x1 > b.x0 && b.h > 0, `level ${lv.n} block`));
  });
  const group = (i) => F.LEVELS.slice(F.GROUPS[i].from, F.GROUPS[i].to);
  assert.ok(group(0).every((lv) => lv.fix === 'speed' && !lv.blocks.length && lv.planet === 'earth'));
  assert.ok(group(1).every((lv) => lv.fix === 'angle' && !lv.blocks.length && lv.planet === 'earth'));
  assert.ok(group(2).every((lv) => lv.two && lv.fix === 'speed'));
  assert.ok(group(3).every((lv) => lv.blocks.some((b) => b.kind === 'wall')));
  assert.ok(group(4).every((lv) => lv.target.on >= 0));
  assert.deepEqual(group(5).map((lv) => lv.planet), ['moon', 'mars', 'heavy', 'mars']);
  assert.ok(group(6).every((lv) => lv.shots === 3 && lv.target.w <= 0.75));
  assert.ok(F.LEVELS.slice(0, 21).every((lv) => lv.shots == null && lv.target.w >= 1.25), 'generous targets before the last group');
});

test('every level can be hit using the controls’ own steps, and its starting settings miss', () => {
  for (const lv of F.LEVELS) {
    const [lo, hi] = F.speedRange(lv);
    assert.ok(lv.speed >= lo && lv.speed <= hi && lv.angle >= F.ANGLE.min && lv.angle <= F.ANGLE.max, `level ${lv.n} starts in range`);
    assert.equal(F.snapAngle(lv.angle), lv.angle);
    assert.equal(F.snapSpeed(lv, lv.speed), lv.speed);
    const sols = F.solutions(lv);
    assert.ok(sols.length >= 2, `level ${lv.n} has only ${sols.length} winning settings`);
    // each winning setting really hits when flown, on the right surface
    for (const s of sols) {
      const r = F.fly(lv, s.angle, s.speed);
      assert.ok(r.onTarget && Math.abs(r.miss) <= lv.target.w);
      assert.equal(r.hit.kind, lv.target.on >= 0 ? 'top' : 'ground');
      if (lv.fix === 'speed') assert.equal(s.speed, lv.speed);
      if (lv.fix === 'angle') assert.equal(s.angle, lv.angle);
    }
    // at least one wins with room to spare, so rounding can never decide it
    assert.ok(sols.some((s) => Math.abs(s.miss) <= lv.target.w - 0.25), `level ${lv.n} has no comfortable hit`);
    assert.equal(F.fly(lv, lv.angle, lv.speed).onTarget, false, `level ${lv.n} starts on target`);
    // and no flight is too slow to watch
    for (const s of sols) assert.ok(F.fly(lv, s.angle, s.speed).hit.t < 10, `level ${lv.n} flight time`);
  }
});

test('two-angle levels have hits either side of 45°, and the pairs add up to about 90°', () => {
  for (const lv of F.LEVELS.filter((l) => l.two)) {
    const angles = F.solutions(lv).map((s) => s.angle);
    const low = angles.filter((a) => a < 45);
    const high = angles.filter((a) => a > 45);
    assert.ok(low.length && high.length, `level ${lv.n}`);
    assert.ok(!angles.includes(45), `level ${lv.n}: 45° must not hit`);
    for (const a of low) assert.ok(F.fly(lv, 90 - a, lv.speed).onTarget, `level ${lv.n}: ${a}° hits but ${90 - a}° does not`);
    let p = F.progress(lv, null, F.fly(lv, low[0], lv.speed));
    assert.deepEqual([p.done, p.low, p.high], [false, low[0], null]);
    p = F.progress(lv, p, F.fly(lv, low[1], lv.speed));
    assert.equal(p.done, false, 'two low hits are not enough');
    p = F.progress(lv, p, F.fly(lv, high[0], lv.speed));
    assert.equal(p.done, true);
  }
});

test('walls and platforms matter: flat-ground maths alone is not enough there', () => {
  // level 12: both flat-ground angles reach 30 m, but the low one is blocked by the wall
  const l12 = F.LEVELS[11];
  const sols = F.solutions(l12);
  assert.ok(sols.every((s) => s.angle > 45), 'only the high angle clears the wall');
  assert.ok(F.angleValues(l12).some((a) => a < 45 && Math.abs(F.flat(a, l12.speed, 9.8).R - l12.target.x) < 1), 'the low angle would reach on flat ground');
  // the wall levels with a free angle need a steep shot
  for (const n of [14, 21]) assert.ok(F.solutions(F.LEVELS[n - 1]).every((s) => s.angle > 45), `level ${n}`);
  // landing on a platform needs more than the flat-ground speed for the same distance
  const l16 = F.LEVELS[15];
  const flatV = Math.sqrt((l16.target.x * 9.8) / Math.sin(2 * l16.angle * Math.PI / 180));
  assert.ok(F.solutions(l16).every((s) => s.speed > flatV));
});

test('shot limits and progress', () => {
  const lv = F.LEVELS[21];
  const miss = F.fly(lv, 45, 15);
  let p = F.progress(lv, null, miss);
  assert.deepEqual([p.shots, p.done, p.out], [1, false, false]);
  near(p.best, miss.miss, 1e-12);
  p = F.progress(lv, p, F.fly(lv, 45, 18));
  p = F.progress(lv, p, F.fly(lv, 45, 16));
  assert.deepEqual([p.shots, p.done, p.out], [3, false, true]);
  near(p.best, F.fly(lv, 45, 18).miss, 1e-12, 'the closest of the three');
  const win = F.solutions(lv)[0];
  p = F.progress(lv, { shots: 2 }, F.fly(lv, win.angle, win.speed));
  assert.deepEqual([p.done, p.out], [true, false], 'a hit with the last shot wins');
  // no limit on the other levels
  p = null;
  for (let i = 0; i < 30; i++) p = F.progress(F.LEVELS[0], p, F.fly(F.LEVELS[0], 20, 15));
  assert.equal(p.out, false);
});

test('every hint’s suggestion really contains a winning setting', () => {
  for (const lv of F.LEVELS) {
    const sols = F.solutions(lv);
    const hs = F.hints(lv, {});
    assert.equal(hs.length, lv.planet === 'earth' ? 3 : 4, `level ${lv.n} hint count`);
    const last = hs[hs.length - 1];
    let m;
    if ((m = /^At (\d+)°, try about (\d+)–(\d+) m\/s\.$/.exec(last))) {
      const [a, lo, hi] = m.slice(1).map(Number);
      assert.ok(sols.some((s) => s.angle === a && s.speed >= lo && s.speed <= hi), `level ${lv.n}: ${last}`);
    } else if ((m = /^Try about (\d+)–(\d+) m\/s\.$/.exec(last))) {
      const [lo, hi] = m.slice(1).map(Number);
      assert.ok(sols.some((s) => s.speed >= lo && s.speed <= hi), `level ${lv.n}: ${last}`);
    } else {
      const windows = [...last.matchAll(/(\d+)–(\d+)°/g)].map((x) => [+x[1], +x[2]]);
      assert.ok(/^Try about /.test(last) && windows.length, `level ${lv.n}: ${last}`);
      for (const [lo, hi] of windows) assert.ok(sols.some((s) => s.angle >= lo && s.angle <= hi), `level ${lv.n}: ${last}`);
    }
  }
  // after one hit on a two-angle level, the hint names the other angle, and it hits
  const lv = F.LEVELS[8];
  const first = F.solutions(lv).find((s) => s.angle < 45);
  const h = F.hints(lv, { low: first.angle, high: null });
  assert.equal(h[h.length - 1], `You hit at ${first.angle.toFixed(1)}°. Now try 90° − ${first.angle.toFixed(1)}° = ${(90 - first.angle).toFixed(1)}°.`);
  assert.equal(F.fly(lv, 90 - first.angle, lv.speed).onTarget, true);
});

test('every message fits the message strip', () => {
  const msgs = [];
  for (const lv of F.LEVELS) {
    const hs = F.hints(lv, {});
    msgs.push(F.say.start(lv), ...hs.map((h, i) => F.say.hint(h, i + 1, hs.length)));
    for (const a of [10, 25, 45, 60, 80]) {
      for (const v of F.speedValues(lv).filter((x, i, all) => i % 40 === 0 || i === all.length - 1)) {
        const r = F.fly(lv, lv.fix === 'angle' ? lv.angle : a, lv.fix === 'speed' ? lv.speed : v);
        msgs.push(F.say.result(lv, r, {}), F.say.result(lv, r, { low: 20, high: null }));
      }
    }
  }
  msgs.push(F.say.outOfShots(F.LEVELS[23], -12.345), F.say.predict(123.4, 120.1), F.say.predict(12, 30));
  const longest = msgs.reduce((a, b) => (b.length > a.length ? b : a));
  assert.ok(longest.length <= 115, `too long for a phone (${longest.length}): ${longest}`);
});

test('every message, word for word', () => {
  const [l1, l5, l9, l12, l15] = [F.LEVELS[0], F.LEVELS[4], F.LEVELS[8], F.LEVELS[11], F.LEVELS[14]];
  assert.equal(F.say.start(l1), 'Level 1. Speed fixed at 15.0 m/s: find the angle to hit the target 20 m away.');
  assert.equal(F.say.start(l5), 'Level 5. Angle fixed at 45.0°: find the speed to hit the target 30 m away.');
  assert.equal(F.say.start(l9), 'Level 9. Speed fixed at 16.0 m/s: hit the target 20 m away with a low angle and a high one.');
  assert.equal(F.say.start(F.LEVELS[17]), 'Level 18, on the Moon. Angle fixed at 45.0°: find the speed to hit the target 30 m away.');
  assert.equal(F.say.start(F.LEVELS[21]), 'Level 22. 3 shots only. Choose the angle and speed to hit the target 42 m away.');
  assert.equal(F.say.result(l1, F.fly(l1, 20, 15)), '5.2 m short: it landed at 14.8 m. Try a steeper angle, closer to 45°.');
  assert.equal(F.say.result(l1, F.fly(l1, 45, 15)), '3.0 m long: it landed at 23.0 m. Move away from 45°, lower or higher.');
  assert.equal(F.say.result(l1, F.fly(l1, 30, 15)), 'Hit! It landed at 19.9 m, 0.1 m from the centre.');
  assert.equal(F.say.result(l5, F.fly(l5, 45, 12)), '15.3 m short: it landed at 14.7 m. More speed will carry it further.');
  assert.equal(F.say.result(l5, F.fly(l5, 45, 20)), '10.8 m long: it landed at 40.8 m. Less speed will bring it down sooner.');
  assert.equal(F.say.result(l12, F.fly(l12, 30, 20)), 'Blocked! It hit the wall 2.4 m below the top. A steeper angle will arc over it.');
  assert.equal(F.say.result(l15, F.fly(l15, 25, 18)), 'It hit the side of the platform, 2.7 m below the top. It needs to be higher when it gets there.');
  assert.equal(F.say.result(l9, F.fly(l9, 25, 16), {}), 'Hit! It landed at 20.0 m, right in the centre. That’s the low angle. Now find the high one.');
  assert.equal(F.say.result(l9, F.fly(l9, 65, 16), { low: 25, high: null }), 'Hit! It landed at 20.0 m, right in the centre. Both angles hit: 25.0° and 65.0°.');
  // 24° at 16 m/s: R = 16² × sin 48° / 9.8 = 19.41 m
  assert.equal(F.say.result(l9, F.fly(l9, 24, 16), { low: 25, high: null }), 'Hit! It landed at 19.4 m, 0.6 m from the centre. That’s the low angle again: now try above 45°.');
  // within 0.1 m of the target's edge a miss gets two decimals, so a hit and a miss never both read "1.5 m"
  assert.equal(F.fmt.gap(1.49, 1.5), '1.49');
  assert.equal(F.fmt.gap(1.51, 1.5), '1.51');
  assert.equal(F.fmt.gap(3.04, 1.5), '3.0');
  assert.equal(F.say.done(l1, 1), 'Level 1 done in 1 shot!');
  assert.equal(F.say.done(l1, 4), 'Level 1 done in 4 shots!');
  assert.equal(F.say.outOfShots(F.LEVELS[21], -2.345), 'Out of shots. Your closest was 2.3 m short. Try again: your settings are kept.');
  assert.equal(F.say.shots(2, null), '2 shots');
  assert.equal(F.say.shots(1, null), '1 shot');
  assert.equal(F.say.shots(0, 3), '3 of 3 shots left');
  assert.equal(F.say.shots(2, 3), '1 of 3 shots left');
  assert.equal(F.say.hint('Try about 30–35°.', 3, 3), 'Hint 3/3: Try about 30–35°.');
  assert.equal(F.hints(l1, {})[2], 'Try about 30–35° (or 55–60°).');
  assert.equal(F.hints(F.LEVELS[17], {})[1], 'Here g = 1.6 m/s², so the same shot goes 6.1 times as far as on Earth.');
});

test('a prediction within 5% of the landing distance earns the bonus', () => {
  assert.equal(F.predicted(30, 30).ok, true);
  assert.equal(F.predicted(31.5, 30).ok, true);
  assert.equal(F.predicted(28.5, 30).ok, true);
  assert.equal(F.predicted(31.6, 30).ok, false);
  assert.equal(F.predicted(20, 30).pct, 33);
  assert.equal(F.say.predict(30, 29.6), 'You predicted 30.0 m: within 5%. Bonus tick!');
  assert.equal(F.say.predict(20, 30), 'You predicted 20.0 m: 33% out.');
});

test('the working puts the numbers into the formulas', () => {
  const lv = F.LEVELS[14];
  const lines = F.working(lv, F.fly(lv, 38.5, 18));
  const text = lines.map((l) => `${l.k}: ${l.v}`);
  assert.deepEqual(lines.map((l) => l.k), ['Launch', 'Across', 'Up', 'Highest point', 'Flat-ground time', 'Flat-ground range', 'At the platform’s edge', 'Landing time', 'Landing spot', 'Target']);
  assert.equal(text[0], 'Launch: θ = 38.5°, v = 18.0 m/s, g = 9.8 m/s² (Earth)');
  assert.equal(text[5], 'Flat-ground range: R = v² sin 2θ / g = 18.0² × sin 77.0° / 9.8 = 32.21 m');
  assert.equal(text[7], 'Landing time: Coming down to h = 4 m: T = (v sin θ + √(v² sin² θ − 2gh)) / g = (11.21 + √(11.21² − 2 × 9.8 × 4)) / 9.8 = 1.844 s');
  assert.equal(text[8], 'Landing spot: x = v cos θ × T = 14.09 × 1.844 = 25.98 m, on top of the platform');
  assert.equal(text[9], 'Target: Centre at 26 m, ±1.5 m: a hit, 0.02 m from the centre');
  const blocked = F.working(F.LEVELS[11], F.fly(F.LEVELS[11], 30, 20)).map((l) => `${l.k}: ${l.v}`);
  assert.ok(blocked.includes('At the wall: y = x tan θ − g x² / (2v² cos² θ) at x = 12 m gives 4.58 m: below its top (7 m), so it hits the side'));
  assert.ok(blocked.includes('Stopped: It reached x = 12 m after x / (v cos θ) = 0.69 s, 4.58 m up'));
});
