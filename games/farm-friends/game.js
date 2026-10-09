/* Farm Friends: the game itself.
 *
 * One big Play button, then round after round: two to four animals pop up
 * in the farmyard, a voice (on-device only), a picture and the animal's own
 * call ask for one of them, and the child taps it. A wrong animal says who
 * it is, so every tap teaches, and the levels adapt by themselves. Needs
 * THREE, Toon, Critters, Sfx, Voice, Farm, Animals and World, loaded before
 * it. Nothing is stored.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const hopCurve = Critters.hopCurve;
  const say = Farm.say;
  const EMOJI = { cow: '🐮', duck: '🐤', pig: '🐷', sheep: '🐑', dog: '🐶', cat: '🐱', horse: '🐴', chicken: '🐔' };
  const CALL = { cow: 'moo', duck: 'quack', pig: 'oink', sheep: 'baa', dog: 'woof', cat: 'meow', horse: 'neigh', chicken: 'cluck' };
  const SIZE = 1.0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const backOut = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);

  const stage = $('stage');
  const canvas = $('view');
  const field = $('field');
  const hud = $('hud');
  const cue = $('cue');
  const cueFace = $('cueFace');
  const again = $('again');
  const progress = $('progress');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const startScreen = $('startScreen');

  function noGl() {
    ['startScreen', 'hud', 'field'].forEach((id) => { $(id).hidden = true; });
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
    phase: 'start',          // start, arrive, ask, found, party, leave
    round: -1,
    level: 0,
    plan: null,
    last: null,              // the previous round's animal
    taps: 0,
    row: [],                 // animals found since the last party
    on: [],                  // the animals in the yard this round, in order
    cursor: 0,
    keys: false,
    pointer: null,
    talk: 0,
    timers: [],
  };

  // all eight animals, made once and brought out when needed
  const rigs = {};
  Animals.ids.forEach((id) => {
    const rig = Animals.create(id);
    rig.root.visible = false;
    world.actors.add(rig.root);
    rigs[id] = Object.assign(rig, { id, spot: new THREE.Vector3(), hopAt: -9, spinAt: -9, partyAt: -9, inAt: -9, outAt: -9, hint: false });
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
  // shown at once for grown-ups and screen readers; spoken a moment later, after the animal's call
  function speak(text, delay) {
    tellEl.textContent = text;
    const mine = ++S.talk;
    if (delay) later(delay, () => { if (mine === S.talk) Voice.say(text); });
    else Voice.say(text);
  }
  // the yard waits for a tap only while an animal is being asked for
  function setPhase(phase) {
    S.phase = phase;
    field.setAttribute('aria-busy', String(phase !== 'ask'));
  }

  function drawProgress() {
    progress.textContent = '';
    for (let k = 0; k < 5; k++) {
      const slot = document.createElement('span');
      slot.className = 'slot' + (S.row[k] ? ' full' : '');
      slot.textContent = S.row[k] ? EMOJI[S.row[k]] : '';
      progress.appendChild(slot);
    }
    progress.setAttribute('aria-label', say.progress(S.row.length));
  }

  /* ------------------------------------------------------------ rounds */
  function startGame() {
    startScreen.hidden = true;
    hud.hidden = false;
    field.hidden = false;
    drawProgress();
    Sfx.play('voice', 1.2);
    field.focus({ preventScroll: true });
    leave(nextRound);
  }
  $('playBtn').addEventListener('click', startGame);

  // these animals pop up at the yard's spots, one after another
  function bringOut(ids) {
    const spots = world.arrange(ids.length);
    const t = time();
    S.on = ids.map((id, i) => {
      const r = rigs[id];
      r.spot.copy(spots[i]);
      r.root.position.copy(spots[i]);
      r.root.visible = true;
      r.inAt = t + i * 0.15;
      r.outAt = -9;
      r.hint = false;
      r.turn.rotation.y = 0;
      later(i * 0.15, () => world.burst(spots[i].clone().setY(0.6), 'puff'));
      return r;
    });
  }

  function leave(then) {
    setPhase('leave');
    const t = time();
    S.on.forEach((r, i) => {
      r.outAt = t + i * 0.08;
      later(i * 0.08 + 0.2, () => world.burst(r.spot.clone().setY(0.6), 'puff'));
    });
    later(S.on.length ? 0.6 : 0, () => {
      S.on.forEach((r) => { r.root.visible = false; });
      S.on = [];
      then();
    });
  }

  function nextRound() {
    S.round++;
    S.plan = Farm.round(S.seed, S.round, S.level, S.last);
    S.taps = 0;
    S.keys = false;
    bringOut(S.plan.animals);
    cue.hidden = true;
    setPhase('arrive');
    later(0.9, ask);
  }

  function ask() {
    const id = S.plan.target;
    cueFace.textContent = EMOJI[id];
    cue.hidden = false;
    S.cursor = 0;
    speak(say.ask(id));
    later(1.4, () => { if (S.phase === 'ask' && S.plan.target === id) Sfx.play(CALL[id]); });
    setPhase('ask');
  }
  // the button says it again, then plays the animal's call
  again.addEventListener('click', () => {
    if (S.phase === 'ask') {
      const id = S.plan.target;
      Voice.say(say.ask(id));
      later(1.2, () => { if (S.phase === 'ask' && S.plan.target === id) Sfx.play(CALL[id]); });
    }
    field.focus({ preventScroll: true });
  });

  function choose(i) {
    if (S.phase !== 'ask' || !S.on[i]) return;
    const r = S.on[i];
    const t = time();
    S.taps++;
    Sfx.play(CALL[r.id]);
    r.hopAt = t;
    if (r.id !== S.plan.target) {
      speak(say.no(r.id, S.plan.target), 0.8);
      if (S.taps >= 2) rigs[S.plan.target].hint = true;
      return;
    }
    r.hint = false;
    r.spinAt = t;
    world.burst(r.spot.clone().setY(1.7), 'hearts');
    S.on.forEach((o, k) => { if (o !== r) o.hopAt = t + 0.15 + k * 0.08; });
    speak(say.yes(r.id), 0.8);
    S.level = Farm.nextLevel(S.level, S.taps);
    S.last = r.id;
    S.row.push(r.id);
    drawProgress();
    setPhase('found');
    later(2.3, () => (S.row.length >= 5 ? party() : leave(nextRound)));
  }

  function party() {
    setPhase('party');
    cue.hidden = true;
    speak(say.party());
    Sfx.play('win');
    const t = time();
    S.on.forEach((r, k) => { r.partyAt = t + k * 0.12; });
    if (!calm()) world.burst(new THREE.Vector3(0, 4, 0), 'confetti');
    later(2.8, () => {
      S.row = [];
      drawProgress();
      leave(nextRound);
    });
  }

  /* ------------------------------------------------------- every frame */
  function look(r, dt) {
    let yaw = 0;
    let pitch = -0.12;
    if (S.pointer) {
      const p = world.toScreen(r.root.position.clone().setY(1.2));
      yaw = clamp((S.pointer.x - p.x) / 240, -0.7, 0.7);
      pitch = clamp((S.pointer.y - p.y) / 420, -0.3, 0.3) - 0.12;
    }
    const k = 1 - Math.exp(-6 * dt);
    r.look.yaw += (yaw - r.look.yaw) * k;
    r.look.pitch += (pitch - r.look.pitch) * k;
  }
  stage.addEventListener('pointermove', (e) => { S.pointer = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { S.pointer = null; });

  function tick(t, dt) {
    runTimers();
    S.on.forEach((r) => {
      let s = 1;
      if (t < r.inAt) s = 0.001;
      else if (t - r.inAt < 0.4) s = Math.max(0.001, backOut((t - r.inAt) / 0.4));
      if (r.outAt > 0 && t >= r.outAt) s = Math.max(0.001, 1 - (t - r.outAt) / 0.3);
      r.root.scale.setScalar(SIZE * s);
      let y = 0;
      let sy = null;
      let spin = 0;
      const h = hopCurve(t - r.hopAt, 0.7);
      if (h) {
        y = h.y;
        sy = h.sy;
        if (t - r.spinAt < 1 && h.phase === 'air' && !calm()) spin = h.p * TAU;
      } else if (r.hint && S.phase === 'ask') {
        const b = hopCurve((t % 0.9), 0.3);          // the one to find bounces, to help
        if (b) {
          y = b.y;
          sy = b.sy;
        }
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
      r.root.position.set(r.spot.x, y, r.spot.z);
      r.sy = sy;
      look(r, dt);
      r.turn.rotation.y = spin;
      r.update(t, dt);
    });
    world.ring(S.keys && S.phase === 'ask' && S.on[S.cursor] ? S.on[S.cursor].spot : null);
    world.frame(dt, false);
  }

  /* -------------------------------------------------------------- input */
  field.addEventListener('keydown', (e) => {
    const arrow = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (!arrow && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (S.phase !== 'ask') return;
    const n = S.on.length;
    if (arrow) {
      if (!S.keys) S.keys = true;                 // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, n - 1);
    } else if (S.keys) {
      choose(S.cursor);
      return;
    } else {
      S.keys = true;
    }
    srFocus.textContent = say.focus(S.cursor, n, S.on[S.cursor].id);
  });

  field.addEventListener('pointerdown', (e) => {
    S.keys = false;
    const i = world.pick(e.clientX, e.clientY, S.on.map((r) => r.root));
    if (i != null) choose(i);
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
  bringOut(['cow', 'duck', 'pig']);           // a few friends behind the Play button
  world.frame(0, true);
  start();
})();
