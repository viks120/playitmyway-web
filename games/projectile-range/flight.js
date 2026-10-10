/* Projectile Range: the physics, the levels, the hints and every message.
 *
 * The ball leaves the launcher's pivot, at ground level, at speed v and
 * angle θ above the horizontal. With no air resistance it follows
 *     x = v cos θ · t,    y = v sin θ · t − ½ g t²
 * until it meets the ground, a wall or a platform. On flat ground that gives
 *     T = 2 v sin θ / g,    H = v² sin² θ / 2g,    R = v² sin 2θ / g,
 * and landing at a height h on the way down takes
 *     T = (v sin θ + √(v² sin² θ − 2gh)) / g.
 *
 * Pure logic with no 3D and no DOM, so the tests load this exact file in
 * Node: they check the formulas against known values and prove that every
 * level has at least one setting, on the controls' own steps, that hits its
 * target. In the page it is a classic script that sets window.Flight; in
 * Node it is a CommonJS module.
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const sq = (x) => x * x;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Gravity in m/s², and each world's range for the speed slider. */
  const PLANETS = {
    earth: { id: 'earth', name: 'Earth', short: 'Earth', emoji: '🌍', g: 9.8, speed: [5, 30] },
    moon: { id: 'moon', name: 'the Moon', short: 'Moon', emoji: '🌙', g: 1.6, speed: [2, 14] },
    mars: { id: 'mars', name: 'Mars', short: 'Mars', emoji: '🔴', g: 3.7, speed: [3, 20] },
    heavy: { id: 'heavy', name: 'a heavy planet', short: 'Heavy planet', emoji: '🪐', g: 24.8, speed: [5, 40] },
  };

  /* The controls' steps, which are also the grid the tests search.
   * Angle 0.5°, about what a school protractor can read: near 30° one step
   * moves the landing spot by about 1% of the range (3% at 15° or 75°).
   * Speed 0.1 m/s: the range goes as v², so one step moves it by 2 × 0.1 / v
   * of the range, 1% at 20 m/s and under 3% even at the Moon's 7 m/s.
   * The arrow keys move by the coarse step; Shift and the − + buttons by
   * the fine one. Every target is at least as wide as a fine step's move. */
  const ANGLE = { min: 10, max: 80, step: 0.5, coarse: 1 };
  const SPEED = { step: 0.1, coarse: 1 };

  const wall = (x0, h) => ({ kind: 'wall', x0, x1: x0 + 1, h });
  const platform = (x0, x1, h) => ({ kind: 'platform', x0, x1, h });

  /* Each level: the world, which control is fixed (fix: 'speed' or 'angle';
   * none means both are free), the starting angle and speed, the target's
   * centre x and half-width w (on: the index of the platform it sits on),
   * walls and platforms, an optional shot limit, and whether it must be hit
   * with two angles. Distances in metres, speeds in m/s, angles in degrees. */
  const LEVELS = [
    // Find the angle
    { fix: 'speed', speed: 15, angle: 20, target: { x: 20, w: 2 },
      tip: 'Raising the angle towards 45° carried the ball further.' },
    { fix: 'speed', speed: 18, angle: 45, target: { x: 26, w: 1.5 },
      tip: 'On flat ground 45° goes furthest, so to land shorter you aim away from 45°.' },
    { fix: 'speed', speed: 20, angle: 75, target: { x: 34, w: 1.5 },
      tip: 'Steep shots work too: they climb higher and stay in the air longer.' },
    { fix: 'speed', speed: 20, angle: 25, target: { x: 40, w: 1.5 },
      tip: 'At 45° the range is v² / g = 20² / 9.8 = 40.8 m: the furthest this speed can go.' },
    // Find the speed
    { fix: 'angle', angle: 45, speed: 12, target: { x: 30, w: 1.5 },
      tip: 'At 45°, sin 2θ = 1, so R = v² / g and v = √(R g) = √(30 × 9.8) = 17.1 m/s.' },
    { fix: 'angle', angle: 30, speed: 20, target: { x: 22, w: 1.5 },
      tip: 'The range grows with v²: a little less speed took a lot off the range.' },
    { fix: 'angle', angle: 60, speed: 15, target: { x: 35, w: 1.5 },
      tip: '60° needs the same speed as 30° for the same range, because sin 120° = sin 60°.' },
    { fix: 'angle', angle: 20, speed: 22, target: { x: 48, w: 1.5 },
      tip: 'Low, flat shots need plenty of speed to go far.' },
    // Two angles, one target
    { fix: 'speed', speed: 16, angle: 45, two: true, target: { x: 20, w: 1.5 },
      tip: 'The two angles add up to 90°, because sin 2θ = sin (180° − 2θ).' },
    { fix: 'speed', speed: 20, angle: 45, two: true, target: { x: 30, w: 1.5 },
      tip: 'The high shot takes much longer to land: T = 2v sin θ / g grows with the angle.' },
    { fix: 'speed', speed: 24, angle: 45, two: true, target: { x: 52, w: 1.25 },
      tip: 'Close to the longest range, the two angles close in on 45° from either side.' },
    // Over the wall
    { fix: 'speed', speed: 20, angle: 30, blocks: [wall(12, 7)], target: { x: 30, w: 1.5 },
      tip: 'Both angles reach 30 m, but only the high one gets over the wall.' },
    { fix: 'angle', angle: 55, speed: 14, blocks: [wall(20, 9)], target: { x: 34, w: 1.5 },
      tip: 'At a fixed angle, more speed lifts the whole path: y = x tan θ − g x² / (2v² cos² θ).' },
    { angle: 45, speed: 15, blocks: [wall(8, 10)], target: { x: 22, w: 1.5 },
      tip: 'A tall wall close by needs a steep shot, with the speed to match.' },
    // Up on the platform
    { fix: 'speed', speed: 18, angle: 25, blocks: [platform(22, 30, 4)], target: { x: 26, w: 1.5, on: 0 },
      tip: 'Landing 4 m up, the ball meets the platform on its way down, before it would reach the ground.' },
    { fix: 'angle', angle: 50, speed: 15, blocks: [platform(28, 36, 6)], target: { x: 32, w: 1.5, on: 0 },
      tip: 'A raised target needs more speed than the same distance on flat ground.' },
    { angle: 45, speed: 15, blocks: [platform(18, 24, 10)], target: { x: 21, w: 1.25, on: 0 },
      tip: 'For a high target a steep angle helps: the ball comes down onto it from above.' },
    // Other worlds
    { planet: 'moon', fix: 'angle', angle: 45, speed: 4, target: { x: 30, w: 2 },
      tip: 'On the Moon about 7 m/s was enough. The same shot on Earth needs 17.1 m/s.' },
    { planet: 'mars', fix: 'speed', speed: 11, angle: 15, target: { x: 28, w: 1.5 },
      tip: 'Mars pulls with 3.7 m/s², so a gentle 11 m/s throw still goes a long way.' },
    { planet: 'heavy', fix: 'speed', speed: 25, angle: 70, target: { x: 20, w: 1.25 },
      tip: 'With 2.5 times Earth’s gravity the ball falls back fast: the whole flight takes about a second.' },
    { planet: 'mars', angle: 45, speed: 8, blocks: [wall(10, 8)], target: { x: 26, w: 1.5 },
      tip: 'Lower gravity gives a slower, wider arc, but the wall still needs a steep shot.' },
    // Sharpshooter
    { angle: 45, speed: 15, shots: 3, target: { x: 42, w: 0.75 },
      tip: 'At 45°, v = √(R g) = √(42 × 9.8) = 20.3 m/s.' },
    { planet: 'moon', fix: 'angle', angle: 60, speed: 6, shots: 3, blocks: [platform(30, 36, 6)], target: { x: 33, w: 0.75, on: 0 },
      tip: 'Solving y = h at x = 33 m gives v² = g x² / (2 cos² θ (x tan θ − h)).' },
    { planet: 'heavy', angle: 45, speed: 20, shots: 3, blocks: [wall(8, 6), platform(20, 26, 4)], target: { x: 23, w: 0.75, on: 1 },
      tip: 'You cleared a wall and landed on a platform under 2.5 g. Sharp shooting!' },
  ].map((lv, i) => Object.assign({ n: i + 1, planet: 'earth', fix: null, blocks: [], shots: null, two: false }, lv,
    { target: Object.assign({ on: -1 }, lv.target) }));

  const GROUPS = [
    { title: 'Find the angle', blurb: 'The speed is fixed: choose the angle.', from: 0, to: 4 },
    { title: 'Find the speed', blurb: 'The angle is fixed: choose the speed.', from: 4, to: 8 },
    { title: 'Two angles, one target', blurb: 'Hit it with a low angle and a high one.', from: 8, to: 11 },
    { title: 'Over the wall', blurb: 'Clear the wall to reach the target.', from: 11, to: 14 },
    { title: 'Up on the platform', blurb: 'Land on a raised target.', from: 14, to: 17 },
    { title: 'Other worlds', blurb: 'The Moon, Mars and a heavy planet.', from: 17, to: 21 },
    { title: 'Sharpshooter', blurb: 'Three shots, narrow targets: work it out first.', from: 21, to: 24 },
  ];

  /* ------------------------------------------------------------ physics */
  const gravity = (level) => PLANETS[level.planet].g;

  function launch(angle, speed, g) {
    const th = angle * DEG;
    return { angle, speed, g, th, vx: speed * Math.cos(th), vy: speed * Math.sin(th) };
  }

  // the flat-ground formulas, exactly as written on screen
  function flat(angle, speed, g) {
    const th = angle * DEG;
    return {
      T: (2 * speed * Math.sin(th)) / g,
      H: (sq(speed) * sq(Math.sin(th))) / (2 * g),
      R: (sq(speed) * Math.sin(2 * th)) / g,
    };
  }

  // where the ball is t seconds after launch, and how fast it is going
  const at = (s, t) => ({ x: s.vx * t, y: s.vy * t - 0.5 * s.g * t * t });
  const velocity = (s, t) => ({ x: s.vx, y: s.vy - s.g * t });

  // the path's height at distance x: y = x tan θ − g x² / (2 v² cos² θ)
  const heightAt = (s, x) => x * Math.tan(s.th) - (s.g * x * x) / (2 * sq(s.speed) * sq(Math.cos(s.th)));

  // when the ball comes down through height h, or null if it never gets that high
  function downThrough(s, h) {
    const disc = sq(s.vy) - 2 * s.g * h;
    return disc < 0 ? null : (s.vy + Math.sqrt(disc)) / s.g;
  }

  /* One shot, start to finish: the first thing the ball meets (the ground,
   * the near side of a wall or platform, or the top of one), what it would
   * have done on flat ground, what was measured, and whether it hit. */
  function fly(level, angle, speed) {
    const g = gravity(level);
    const s = launch(angle, speed, g);
    const f = flat(angle, speed, g);
    let hit = { t: f.T, x: f.R, y: 0, kind: 'ground', block: -1 };
    const passes = [];
    level.blocks.forEach((b, i) => {
      const yNear = heightAt(s, b.x0);
      const tNear = b.x0 / s.vx;
      passes.push({ block: i, x: b.x0, y: yNear, clear: yNear - b.h });
      if (yNear >= 0 && yNear < b.h && tNear < hit.t) hit = { t: tNear, x: b.x0, y: yNear, kind: 'side', block: i };
      const tTop = downThrough(s, b.h);
      if (tTop != null) {
        const x = s.vx * tTop;
        if (x >= b.x0 && x <= b.x1 && tTop < hit.t) hit = { t: tTop, x, y: b.h, kind: 'top', block: i };
      }
    });
    const apex = { t: s.vy / g, x: (s.vx * s.vy) / g, y: f.H };
    const tgt = level.target;
    const surface = tgt.on < 0 ? hit.kind === 'ground' : hit.kind === 'top' && hit.block === tgt.on;
    const miss = hit.x - tgt.x;
    return {
      angle,
      speed,
      g,
      s,
      flat: f,
      apex,
      hit,
      passes: passes.filter((p) => p.x <= hit.x + 1e-9),          // the near faces it got as far as
      measured: { t: hit.t, h: hit.t >= apex.t ? f.H : hit.y, x: hit.x },
      miss,
      onTarget: surface && Math.abs(miss) <= tgt.w,
    };
  }

  /* ------------------------------------------------------- the controls */
  const snapAngle = (a) => clamp(Math.round(a / ANGLE.step) * ANGLE.step, ANGLE.min, ANGLE.max);
  function speedRange(level) {
    return PLANETS[level.planet].speed;
  }
  function snapSpeed(level, v) {
    const [lo, hi] = speedRange(level);
    return clamp(Math.round(v * 10) / 10, lo, hi);
  }

  // every setting the controls allow on this level (the fixed one has just its value)
  function angleValues(level) {
    if (level.fix === 'angle') return [level.angle];
    const out = [];
    for (let k = ANGLE.min / ANGLE.step; k <= ANGLE.max / ANGLE.step; k++) out.push(k * ANGLE.step);
    return out;
  }
  function speedValues(level) {
    if (level.fix === 'speed') return [level.speed];
    const [lo, hi] = speedRange(level);
    const out = [];
    for (let k = Math.round(lo * 10); k <= Math.round(hi * 10); k++) out.push(k / 10);
    return out;
  }

  // every allowed setting that lands on the target
  function solutions(level) {
    const out = [];
    for (const angle of angleValues(level)) {
      for (const speed of speedValues(level)) {
        const r = fly(level, angle, speed);
        if (r.onTarget) out.push({ angle, speed, miss: r.miss });
      }
    }
    return out;
  }

  // consecutive grid values grouped into runs: [{ lo, hi, mid }]
  function runs(values, step) {
    const out = [];
    values.slice().sort((a, b) => a - b).forEach((v) => {
      const last = out[out.length - 1];
      if (last && Math.abs(v - last.hi - step) < step / 4) last.hi = v;
      else out.push({ lo: v, hi: v });
    });
    out.forEach((r) => { r.mid = (r.lo + r.hi) / 2; });
    return out;
  }

  /* For hints when both controls are free: a round angle (a multiple of 5°)
   * and the speeds that hit with it. It prefers the round angle nearest 45°
   * that leaves at least 3 speeds to choose from, else the widest choice. */
  function niceAim(level, sols) {
    const all = sols || solutions(level);
    const options = [];
    for (let a = 15; a <= 75; a += 5) {
      const speeds = all.filter((p) => p.angle === a).map((p) => p.speed);
      if (!speeds.length) continue;
      const run = runs(speeds, SPEED.step).sort((x, y) => y.hi - y.lo - (x.hi - x.lo))[0];
      options.push({ angle: a, run, n: Math.round((run.hi - run.lo) / SPEED.step) + 1 });
    }
    if (!options.length) return null;
    const roomy = options.filter((o) => o.n >= 3).sort((x, y) => Math.abs(x.angle - 45) - Math.abs(y.angle - 45) || x.angle - y.angle);
    return roomy[0] || options.sort((x, y) => y.n - x.n)[0];
  }

  /* --------------------------------------------------------- formatting */
  function fix(x, d) {
    const s = x.toFixed(d);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
  }
  const f1 = (x) => fix(x, 1);
  const f2 = (x) => fix(x, 2);
  const num = (x) => String(Math.round(x * 100) / 100);           // 20, 1.5, 1.25
  const deg = (a) => `${f1(a)}°`;
  const mps = (v) => `${f1(v)} m/s`;
  // a miss distance, to 2 decimals when it is close to the target's edge, so 1.5 never reads as both hit and miss
  const gap = (d, w) => (Math.abs(d - w) < 0.1 ? f2(d) : f1(d));

  /* ------------------------------------------------------------ hints */
  const angleWindow = (mid) => {
    const lo = Math.floor(mid / 5) * 5;
    return { lo, hi: lo + 5, text: `${lo}–${lo + 5}°` };
  };
  const speedWindow = (mid) => {
    const lo = Math.floor(mid);
    return { lo, hi: lo + 1, text: `${lo}–${lo + 1} m/s` };
  };

  /* The hints, gentlest first: the idea, what the world's gravity does (away
   * from Earth), the formula to use, then roughly where to aim. Each fits
   * the message strip. `hits` is the two-angle progress ({ low, high }). */
  function hints(level, hits) {
    const t = level.target;
    const p = PLANETS[level.planet];
    const g = num(p.g);
    const wallB = level.blocks.find((b) => b.kind === 'wall');
    const plat = t.on >= 0 ? level.blocks[t.on] : null;
    const sols = solutions(level);
    const out = [];

    // the idea
    if (level.two) out.push('Two angles land in the same place on flat ground, one either side of 45°: they add up to 90°.');
    else if (plat) out.push(`The target is ${num(plat.h)} m up: the ball must come down onto it, still ${num(plat.h)} m high at ${num(t.x)} m.`);
    else if (wallB) out.push(`The ball must be higher than the wall (${num(wallB.h)} m) when it gets there. Steeper shots climb higher.`);
    else if (level.fix === 'speed') out.push('Only the angle matters here. On flat ground 45° goes furthest; further from 45° lands shorter.');
    else if (level.fix === 'angle') out.push('Only the speed matters here. Range grows with v²: twice the speed goes four times as far.');
    else out.push('Choose an angle first (45° goes furthest on flat ground), then work out the speed for it.');

    // the world
    if (p.id !== 'earth') {
      const k = 9.8 / p.g;
      out.push(k > 1
        ? `Here g = ${g} m/s², so the same shot goes ${f1(k)} times as far as on Earth.`
        : `Here g = ${g} m/s², ${f1(1 / k)} times Earth’s: the same shot goes only ${f1(k)} times as far.`);
    }

    // the formula to use
    const R = `${num(t.x)} m`;
    if (plat) {
      out.push(level.fix === 'speed'
        ? `Solve x tan θ − g x² (1 + tan² θ) / 2v² = h for tan θ, with x = ${R}, h = ${num(plat.h)} m, v = ${mps(level.speed)}.`
        : `${level.fix ? 'From y = h' : 'Pick θ, then from y = h'}: v² = g x² / (2 cos² θ (x tan θ − h)), with x = ${R} and h = ${num(plat.h)} m.`);
    } else if (wallB) {
      const check = `y = x tan θ − g x² / (2v² cos² θ) at x = ${num(wallB.x0)} m`;
      if (level.fix === 'speed') out.push(`sin 2θ = R g / v² gives two angles. Check each with ${check}.`);
      else if (level.fix === 'angle') out.push(`Find v from R = v² sin 2θ / g, then check it clears ${num(wallB.h)} m: ${check}.`);
      else out.push(`Pick a steep θ, find v from R = v² sin 2θ / g, then check ${check}.`);
    } else if (level.fix === 'speed') {
      out.push(`R = v² sin 2θ / g, so sin 2θ = R g / v². Put in R = ${R}, g = ${g} m/s², v = ${mps(level.speed)}.`);
    } else if (level.fix === 'angle') {
      out.push(`R = v² sin 2θ / g, so v = √(R g / sin 2θ). Put in R = ${R}, g = ${g} m/s², θ = ${deg(level.angle)}.`);
    } else {
      out.push(`Pick θ, then v = √(R g / sin 2θ) with R = ${R} and g = ${g} m/s².`);
    }

    // roughly where to aim
    if (level.fix === 'speed') {
      const rs = runs(sols.map((q) => q.angle), ANGLE.step);
      if (level.two && hits && (hits.low != null) !== (hits.high != null)) {
        const done = hits.low != null ? hits.low : hits.high;
        out.push(`You hit at ${deg(done)}. Now try 90° − ${deg(done)} = ${deg(90 - done)}.`);
      } else {
        const ws = rs.map((r) => angleWindow(r.mid).text);
        const uniq = ws.filter((w, i) => ws.indexOf(w) === i);
        out.push(level.two || uniq.length === 1 ? `Try about ${uniq.join(' and ')}.` : `Try about ${uniq[0]} (or ${uniq.slice(1).join(' or ')}).`);
      }
    } else if (level.fix === 'angle') {
      const rs = runs(sols.map((q) => q.speed), SPEED.step);
      out.push(`Try about ${speedWindow(rs[0].mid).text}.`);
    } else {
      const aim = niceAim(level, sols);
      out.push(`At ${aim.angle}°, try about ${speedWindow(aim.run.mid).text}.`);
    }
    return out;
  }

  /* --------------------------------------------------------- messages */
  function goal(level) {
    const p = PLANETS[level.planet];
    const head = `Level ${level.n}${p.id === 'earth' ? '' : `, on ${p.name}`}.${level.shots ? ` ${level.shots} shots only.` : ''}`;
    const away = `the target ${num(level.target.x)} m away`;
    let task;
    if (level.two) task = `Speed fixed at ${mps(level.speed)}: hit ${away} with a low angle and a high one.`;
    else if (level.fix === 'speed') task = `Speed fixed at ${mps(level.speed)}: find the angle to hit ${away}.`;
    else if (level.fix === 'angle') task = `Angle fixed at ${deg(level.angle)}: find the speed to hit ${away}.`;
    else task = `Choose the angle and speed to hit ${away}.`;
    return `${head} ${task}`;
  }

  // a nudge after a miss that is always true for this level's controls
  function advice(level, r, kind) {
    const fixSpeed = level.fix === 'speed';
    const fixAngle = level.fix === 'angle';
    if (kind === 'wall') return fixAngle ? 'More speed will lift it over.' : fixSpeed ? 'A steeper angle will arc over it.' : 'Aim steeper or faster to clear it.';
    if (kind === 'side') return fixAngle ? 'More speed will get it up there.' : 'It needs to be higher when it gets there.';
    const short = r.miss < 0;
    const flatGround = !level.blocks.length;
    if (fixAngle) return short ? 'More speed will carry it further.' : 'Less speed will bring it down sooner.';
    if (fixSpeed && flatGround) {
      if (short) return r.angle < 45 ? 'Try a steeper angle, closer to 45°.' : r.angle > 45 ? 'Try a lower angle, closer to 45°.' : 'No angle goes further than 45° on flat ground.';
      return r.angle < 45 ? 'Try a lower angle.' : r.angle > 45 ? 'Try a steeper angle.' : 'Move away from 45°, lower or higher.';
    }
    if (fixSpeed) return short ? 'Change the angle to carry it further.' : 'Change the angle to bring it down sooner.';
    return short ? 'More speed will carry it further.' : 'Less speed will bring it down sooner.';
  }

  /* What happened, in a sentence or two. `hits` is the two-angle progress
   * before this shot, for the messages that guide you to the second angle. */
  function result(level, r, hits) {
    const t = level.target;
    const d = Math.abs(r.miss);
    const b = r.hit.block >= 0 ? level.blocks[r.hit.block] : null;
    if (r.onTarget) {
      const centre = d < 0.05 ? 'right in the centre' : `${gap(d, t.w)} m from the centre`;
      const base = `Hit! It landed at ${f1(r.hit.x)} m, ${centre}.`;
      if (!level.two) return base;
      const low = r.angle < 45;
      const h = hits || {};
      const other = low ? h.high : h.low;
      const same = low ? h.low : h.high;
      if (other != null) return `${base} Both angles hit: ${deg(Math.min(r.angle, other))} and ${deg(Math.max(r.angle, other))}.`;
      if (same != null) return `${base} That’s the ${low ? 'low' : 'high'} angle again: now try ${low ? 'above' : 'below'} 45°.`;
      return `${base} That’s the ${low ? 'low' : 'high'} angle. Now find the ${low ? 'high' : 'low'} one.`;
    }
    if (b && r.hit.kind === 'side' && b.kind === 'wall') {
      return `Blocked! It hit the wall ${f1(b.h - r.hit.y)} m below the top. ${advice(level, r, 'wall')}`;
    }
    if (b && r.hit.kind === 'top' && b.kind === 'wall') {
      return `It landed on top of the wall, ${f1(d)} m short of the target. ${advice(level, r, 'wall')}`;
    }
    if (b && r.hit.kind === 'side') {
      return `It hit the side of the platform, ${f1(b.h - r.hit.y)} m below the top. ${advice(level, r, 'side')}`;
    }
    const word = r.miss < 0 ? 'short' : 'long';
    return `${gap(d, t.w)} m ${word}: it landed at ${f1(r.hit.x)} m. ${advice(level, r)}`;
  }

  /* The level's progress after a shot: shots used, the closest miss
   * (signed, negative short), the hit angles either side of 45° for the
   * two-angle levels, whether it is done, and whether the shots ran out. */
  function progress(level, prev, r) {
    const p = Object.assign({ shots: 0, low: null, high: null, best: null, done: false, out: false }, prev);
    p.shots++;
    if (p.best == null || Math.abs(r.miss) < Math.abs(p.best)) p.best = r.miss;
    if (r.onTarget) {
      if (r.angle < 45) p.low = r.angle;
      else if (r.angle > 45) p.high = r.angle;
      p.done = level.two ? p.low != null && p.high != null : true;
    }
    p.out = !p.done && level.shots != null && p.shots >= level.shots;
    return p;
  }

  // a prediction counts if it is within 5% of where the ball came down
  const PREDICT = 0.05;
  function predicted(guess, actual) {
    const off = Math.abs(guess - actual) / Math.max(actual, 1e-9);
    return { ok: off <= PREDICT + 1e-12, pct: Math.round(off * 100) };
  }

  const say = {
    start: goal,
    result,
    hint: (text, k, n) => `Hint ${k}/${n}: ${text}`,
    predict: (guess, actual) => {
      const p = predicted(guess, actual);
      return p.ok
        ? `You predicted ${f1(guess)} m: within 5%. Bonus tick!`
        : `You predicted ${f1(guess)} m: ${p.pct}% out.`;
    },
    done: (level, shots) => `Level ${level.n} done in ${shots} ${shots === 1 ? 'shot' : 'shots'}!`,
    closest: (best) => `${best != null ? `Your closest was ${f1(Math.abs(best))} m ${best < 0 ? 'short' : 'long'}. ` : ''}Try again: your settings are kept.`,
    outOfShots: (level, best) => `Out of shots. ${say.closest(best)}`,
    fixed: (what) => `The ${what} is fixed in this level.`,
    shots: (n, limit) => (limit ? `${limit - n} of ${limit} shots left` : `${n} ${n === 1 ? 'shot' : 'shots'}`),
    view: () => 'View reset.',
  };

  /* The working for a shot, line by line, with the numbers put in. */
  function working(level, r) {
    const p = PLANETS[level.planet];
    const s = r.s;
    const th = deg(r.angle);
    const v = f1(r.speed);
    const g = num(p.g);
    const lines = [];
    lines.push({ k: 'Launch', v: `θ = ${th}, v = ${v} m/s, g = ${g} m/s² (${p.short})` });
    lines.push({ k: 'Across', v: `v cos θ = ${v} × cos ${th} = ${f2(s.vx)} m/s, the same all the way` });
    lines.push({ k: 'Up', v: `v sin θ = ${v} × sin ${th} = ${f2(s.vy)} m/s at launch, losing ${g} m/s every second` });
    lines.push({ k: 'Highest point', v: `H = v² sin² θ / 2g = ${f2(s.vy)}² / (2 × ${g}) = ${f2(r.flat.H)} m, after v sin θ / g = ${f2(r.apex.t)} s` });
    lines.push({ k: 'Flat-ground time', v: `T = 2v sin θ / g = 2 × ${f2(s.vy)} / ${g} = ${f2(r.flat.T)} s` });
    lines.push({ k: 'Flat-ground range', v: `R = v² sin 2θ / g = ${v}² × sin ${deg(2 * r.angle)} / ${g} = ${f2(r.flat.R)} m` });
    r.passes.forEach((pass) => {
      const b = level.blocks[pass.block];
      const name = b.kind === 'wall' ? 'the wall' : 'the platform’s edge';
      const verdict = pass.clear >= 0 ? `above its top (${num(b.h)} m) by ${f2(pass.clear)} m` : `below its top (${num(b.h)} m), so it hits the side`;
      lines.push({ k: `At ${name}`, v: `y = x tan θ − g x² / (2v² cos² θ) at x = ${num(pass.x)} m gives ${f2(pass.y)} m: ${verdict}` });
    });
    if (r.hit.kind === 'top') {
      const b = level.blocks[r.hit.block];
      const h = num(b.h);
      lines.push({ k: 'Landing time', v: `Coming down to h = ${h} m: T = (v sin θ + √(v² sin² θ − 2gh)) / g = (${f2(s.vy)} + √(${f2(s.vy)}² − 2 × ${g} × ${h})) / ${g} = ${fix(r.hit.t, 3)} s` });
      lines.push({ k: 'Landing spot', v: `x = v cos θ × T = ${f2(s.vx)} × ${fix(r.hit.t, 3)} = ${f2(r.hit.x)} m, on top of ${b.kind === 'wall' ? 'the wall' : 'the platform'}` });
    } else if (r.hit.kind === 'side') {
      lines.push({ k: 'Stopped', v: `It reached x = ${num(r.hit.x)} m after x / (v cos θ) = ${f2(r.hit.t)} s, ${f2(r.hit.y)} m up` });
    } else {
      lines.push({ k: 'Landing spot', v: `On the ground after ${f2(r.hit.t)} s, at ${f2(r.hit.x)} m` });
    }
    const t = level.target;
    const d = Math.abs(r.miss);
    lines.push({
      k: 'Target',
      v: `Centre at ${num(t.x)} m, ±${num(t.w)} m: ${r.onTarget ? `a hit, ${f2(d)} m from the centre` : `missed by ${f2(d)} m (${r.miss < 0 ? 'short' : 'long'})`}`,
    });
    return lines;
  }

  const api = {
    PLANETS,
    ANGLE,
    SPEED,
    LEVELS,
    GROUPS,
    PREDICT,
    gravity,
    launch,
    flat,
    at,
    velocity,
    heightAt,
    downThrough,
    fly,
    snapAngle,
    snapSpeed,
    speedRange,
    angleValues,
    speedValues,
    solutions,
    runs,
    niceAim,
    hints,
    progress,
    predicted,
    working,
    say,
    fmt: { f1, f2, num, deg, mps, gap },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Flight = api;
})(this);
