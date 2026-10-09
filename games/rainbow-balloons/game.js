/* Rainbow Balloons: the game itself.
 *
 * One big Play button, then round after round: balloons rise into the sky,
 * a voice (on-device only) and a big colour splat ask for one colour, and
 * the child pops it. A wrong balloon just wiggles and says its own colour,
 * and the levels adapt by themselves. Needs THREE, Toon, Critters, Sfx,
 * Voice, Balloons and World, loaded before it. Nothing is stored.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const ORDER = Object.keys(Critters.KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Balloons.say;
  const HEX = {};
  Balloons.COLOURS.forEach((c) => { HEX[c.id] = c.hex; });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);

  const stage = $('stage');
  const canvas = $('view');
  const sky = $('sky');
  const hud = $('hud');
  const cue = $('cue');
  const cueBlob = $('cueBlob');
  const again = $('again');
  const progress = $('progress');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const startScreen = $('startScreen');

  function noGl() {
    ['startScreen', 'hud', 'sky'].forEach((id) => { $(id).hidden = true; });
    $('noGl').hidden = false;
  }

  const world = World.create(canvas);
  if (!world) {
    noGl();
    return;
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    noGl();
  });

  /* ------------------------------------------------------------ state */
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);     // repeatable play, for testing
  const S = {
    seed: seedMatch ? +seedMatch[1] : Math.floor(Math.random() * 2147483647),
    phase: 'start',          // start, rise, ask, popped, party
    round: -1,
    level: 0,
    plan: null,
    last: null,              // the previous round's colour
    taps: 0,
    row: [],                 // colours popped since the last party
    cursor: 0,
    keys: false,
    timers: [],
  };

  // the four critters watch from the meadow below the balloons, and cheer
  const rigs = ORDER.map((kind, k) => {
    const rig = Critters.create(kind);
    rig.root.scale.setScalar(0.9);
    rig.root.position.set((k - 1.5) * 2.4, 0, -4);
    world.actors.add(rig.root);
    return Object.assign(rig, { hopAt: -9, partyAt: -9 });
  });

  function later(delay, fn) {
    S.timers.push({ at: time() + delay, fn });
  }
  function runTimers() {
    const t = time();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  // shown for grown-ups and screen readers, and spoken for the child
  function speak(text) {
    tellEl.textContent = text;
    Voice.say(text);
  }
  // the sky waits for a tap only while a colour is being asked for
  function setPhase(phase) {
    S.phase = phase;
    sky.setAttribute('aria-busy', String(phase !== 'ask'));
  }

  function drawProgress() {
    progress.textContent = '';
    for (let k = 0; k < 5; k++) {
      const dot = document.createElement('span');
      dot.className = 'dot' + (S.row[k] ? ' full' : '');
      if (S.row[k]) dot.style.background = HEX[S.row[k]];
      progress.appendChild(dot);
    }
    progress.setAttribute('aria-label', say.progress(S.row.length));
  }

  /* ------------------------------------------------------------ rounds */
  function startGame() {
    startScreen.hidden = true;
    hud.hidden = false;
    sky.hidden = false;
    drawProgress();
    Sfx.play('voice', 1.2);
    sky.focus({ preventScroll: true });
    nextRound();
  }
  $('playBtn').addEventListener('click', startGame);

  function nextRound() {
    S.round++;
    S.plan = Balloons.round(S.seed, S.round, S.level, S.last);
    S.taps = 0;
    S.keys = false;
    world.setBalloons(S.plan.balloons, time());
    cue.hidden = true;
    setPhase('rise');
    later(1.1, ask);
  }

  function ask() {
    cueBlob.style.background = HEX[S.plan.target];
    cue.hidden = false;
    again.hidden = !Voice.ready();
    S.cursor = 0;
    speak(say.ask(S.plan.target));
    setPhase('ask');
  }
  again.addEventListener('click', () => {
    if (S.phase === 'ask') Voice.say(say.ask(S.plan.target));
    sky.focus({ preventScroll: true });
  });

  function tap(i) {
    if (S.phase !== 'ask' || !world.isUp(i)) return;
    const t = time();
    const colour = world.colourOf(i);
    S.taps++;
    if (colour !== S.plan.target) {
      world.wiggle(i, t);
      Sfx.play('hop');
      speak(say.no(colour, S.plan.target));
      if (S.taps >= 2) world.hint(S.plan.balloons.indexOf(S.plan.target), true);
      return;
    }
    world.pop(i, t);
    Sfx.play('pop');
    later(0.1, () => Sfx.play('poof'));
    speak(say.yes(colour));
    rigs.forEach((r, k) => { r.hopAt = t + 0.1 + k * 0.08; });
    S.level = Balloons.nextLevel(S.level, S.taps);
    S.last = S.plan.target;
    S.row.push(colour);
    drawProgress();
    setPhase('popped');
    later(1.1, () => {
      for (let k = 0; k < world.count(); k++) world.flyAway(k, time());
    });
    later(2.0, () => (S.row.length >= 5 ? party() : nextRound()));
  }

  function party() {
    setPhase('party');
    cue.hidden = true;
    speak(say.party());
    Sfx.play('win');
    rigs.forEach((r, k) => { r.partyAt = time() + k * 0.12; });
    if (!calm()) world.burst(new THREE.Vector3(0, 6, -1), 'party');
    later(2.8, () => {
      S.row = [];
      drawProgress();
      nextRound();
    });
  }

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    rigs.forEach((r) => {
      let y = 0;
      let sy = null;
      let spin = 0;
      const cheer = hopCurve(t - r.hopAt, 0.6);
      if (cheer) {
        y = cheer.y;
        sy = cheer.sy;
      }
      if (t >= r.partyAt && t - r.partyAt < 2.4) {
        const p = hopCurve((t - r.partyAt) % 0.8, 0.7);
        if (p) {
          y = p.y;
          sy = p.sy;
          if (p.phase === 'air' && !calm()) spin = p.p * TAU;
        }
      }
      if (S.phase === 'start' && t - r.hopAt > 1.6 && Math.random() < dt * 0.3) r.hopAt = t;
      r.root.position.y = y;
      r.sy = sy;
      r.look.pitch = -0.35;                       // looking up at the balloons
      r.turn.rotation.y = spin;
      r.update(t, dt);
    });
    world.ring(S.keys && S.phase === 'ask' ? S.cursor : null);
    world.frame(dt, false);
  }

  /* -------------------------------------------------------------- input */
  sky.addEventListener('keydown', (e) => {
    const arrow = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!arrow && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (S.phase !== 'ask') return;
    const n = world.count();
    if (arrow) {
      if (!S.keys) S.keys = true;                 // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, n - 1);
    } else if (S.keys) {
      tap(S.cursor);
      return;
    } else {
      S.keys = true;
    }
    srFocus.textContent = say.focus(S.cursor, n, world.colourOf(S.cursor));
  });

  sky.addEventListener('pointerdown', (e) => {
    S.keys = false;
    const i = world.balloonAt(e.clientX, e.clientY);
    if (i != null) tap(i);
  });

  /* --------------------------------------------------------------- loop */
  let raf = 0;
  let running = false;
  let last = 0;
  function loop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    const t = time();
    const dt = Math.min(Math.max(t - last, 0), 0.05);
    last = t;
    world.update(t, dt);
    tick(t, dt);
    world.render();
    if (running) loop();
  }
  function start() {
    running = true;
    if (!document.hidden) {
      last = time();
      loop();
    }
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      Voice.stop();
    } else if (running) {
      last = time();
      loop();
    }
  });

  function fit() {
    world.resize();
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();
  world.setBalloons(['red', 'blue', 'yellow'], time());        // a few balloons behind the Play button
  world.frame(0, true);
  start();
})();
