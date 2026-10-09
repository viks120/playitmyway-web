/* Peekaboo Pond: the game itself.
 *
 * One big Play button, then round after round: a critter hops into a lotus
 * flower, the flowers slide around, and the child taps to find it. The
 * difficulty adapts by itself, and a wrong flower just holds a surprise.
 * Needs THREE, Toon, Critters, Sfx, Rounds and World, loaded before it.
 * Nothing is stored.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Rounds.say;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const smooth = (x) => x * x * (3 - 2 * x);
  const CRITTER_SIZE = 0.72;

  function turnToward(from, to, k) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return from + d * k;
  }

  const stage = $('stage');
  const canvas = $('view');
  const pondInput = $('pondInput');
  const hud = $('hud');
  const bubble = $('bubble');
  const progress = $('progress');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const startScreen = $('startScreen');

  function noGl() {
    ['startScreen', 'hud', 'pondInput'].forEach((id) => { $(id).hidden = true; });
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
    phase: 'start',        // start, intro, shuffle, seek, reveal, found, home, party
    round: -1,
    level: 0,
    plan: null,
    n: 0,                  // flowers on the pond
    budAt: [],             // the flower in each slot
    slotOf: [],            // the slot of each flower
    hiderBud: 0,           // the flower the critter hides in
    onFlower: false,       // the round's critter is on (or in) its flower
    swapIndex: 0,
    swap: null,
    taps: 0,
    tried: {},             // wrong flowers opened this round, and the surprise in each
    misses: 0,             // over the whole visit, so the surprises take turns
    row: [],               // critters found since the last party
    cursor: 0,
    keys: false,
    hop: null,
    surprise: null,
    pointer: null,
    timers: [],
  };

  // all four critters wait on the bank, each in its own spot
  const rigs = ORDER.map((kind, k) => {
    const rig = Critters.create(kind);
    rig.root.scale.setScalar(CRITTER_SIZE);
    rig.root.position.copy(world.home(k));
    world.actors.add(rig.root);
    return Object.assign(rig, { home: k, hopAt: -9, partyAt: -9, landAt: -9 });
  });
  const hider = () => rigs[S.plan.hider];
  const hiderKind = () => KINDS[ORDER[S.plan.hider]];

  function later(delay, fn) {
    S.timers.push({ at: time() + delay, fn });
  }
  function runTimers() {
    const t = time();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  function tell(text) {
    tellEl.textContent = text;
  }
  // the pond waits for a tap only while seeking
  function setPhase(phase) {
    S.phase = phase;
    pondInput.setAttribute('aria-busy', String(phase !== 'seek'));
  }

  function drawProgress() {
    progress.textContent = '';
    for (let k = 0; k < 5; k++) {
      const slot = document.createElement('span');
      const kind = S.row[k];
      slot.className = 'slot' + (kind ? ' full' : '');
      slot.textContent = kind ? KINDS[kind].emoji : '';
      progress.appendChild(slot);
    }
    progress.setAttribute('aria-label', say.progress(S.row.length));
  }

  /* ----------------------------------------------------------- rounds */
  function startGame() {
    startScreen.hidden = true;
    hud.hidden = false;
    pondInput.hidden = false;
    drawProgress();
    Sfx.play('voice', 1.2);
    pondInput.focus({ preventScroll: true });
    nextRound();
  }
  $('playBtn').addEventListener('click', startGame);

  // n flowers in bloom, one in each slot; pop sets them growing in fresh
  function layFlowers(n, pop) {
    world.setFlowers(n);
    S.n = n;
    S.budAt = [];
    S.slotOf = [];
    for (let i = 0; i < n; i++) {
      S.budAt[i] = i;
      S.slotOf[i] = i;
      world.placeFlower(i, world.slotX(i, n), 0);
      const f = world.flower(i);
      f.o = f.target = 1;
      f.wiggle = 0;
      if (pop) {
        f.grow = 0;
        world.ripple(world.slotX(i, n), 0, 0.9);
      }
    }
  }

  function nextRound() {
    S.round++;
    S.plan = Rounds.plan(S.seed, S.round, S.level);
    // a flower more or fewer: they all pop up fresh; otherwise each blooms where it stands
    if (S.plan.buds !== S.n) layFlowers(S.plan.buds, true);
    else for (let i = 0; i < S.n; i++) world.flower(i).target = 1;
    S.taps = 0;
    S.tried = {};
    S.keys = false;
    S.hiderBud = S.budAt[S.plan.start];
    bubble.hidden = true;
    setPhase('intro');
    const k = S.plan.hider;
    later(0.7, () => jump(hider(), world.home(k), world.flowerTop(S.hiderBud), arrived));
  }

  // a big hop between the bank and a flower
  function jump(rig, from, to, done) {
    S.hop = { rig, from, to, at: time(), done };
    Sfx.play('hop');
  }

  function arrived() {
    S.onFlower = true;
    const top = world.flowerTop(S.hiderBud);
    world.ripple(top.x, top.z, 0.9);
    hider().hopAt = time() + 0.3;                 // a happy wave of a hop: here I am!
    later(0.4, () => Sfx.play('voice', hiderKind().voice));
    later(1.3, () => {
      tell(say.hiding(hiderKind().name));
      world.flower(S.hiderBud).target = 0;
      Sfx.play('poof');
    });
    later(2.0, () => {
      for (let i = 0; i < S.n; i++) world.flower(i).target = 0;
      Sfx.play('poof');
    });
    later(2.8, shuffle);
  }

  function shuffle() {
    setPhase('shuffle');
    S.swapIndex = 0;
    if (S.plan.swaps.length) tell(say.moving());
    nextSwap();
  }

  function nextSwap() {
    if (S.swapIndex >= S.plan.swaps.length) {
      later(0.3, seek);
      return;
    }
    const [i, j] = S.plan.swaps[S.swapIndex++];
    S.swap = { i, j, a: S.budAt[i], b: S.budAt[j], at: time() };
    Sfx.play('good', Math.min(S.swapIndex - 1, 8));       // a rising note for each swap
  }

  function swapDone() {
    const { i, j, a, b } = S.swap;
    world.slide(a, b, i, j, S.n, 1);
    S.budAt[i] = b;
    S.budAt[j] = a;
    S.slotOf[a] = j;
    S.slotOf[b] = i;
    S.swap = null;
    later(0.15, nextSwap);
  }

  function seek() {
    S.cursor = Math.floor((S.n - 1) / 2);
    bubble.textContent = hiderKind().emoji + '?';
    bubble.hidden = false;
    tell(say.seek(hiderKind().name));
    setPhase('seek');
  }

  function open(slot) {
    if (S.phase !== 'seek') return;
    const bud = S.budAt[slot];
    S.taps++;
    setPhase('reveal');
    world.flower(bud).target = 1;
    later(0.3, () => (bud === S.hiderBud ? found(bud) : miss(bud)));
  }

  function found(bud) {
    const rig = hider();
    const kind = hiderKind();
    rig.hopAt = time();
    Sfx.play('voice', kind.voice);
    world.burst(above(world.flowerTop(bud), 1.1), 'sparkle');
    rigs.forEach((r, k) => { if (r !== rig) r.hopAt = time() + 0.1 + k * 0.08; });    // the friends cheer
    bubble.textContent = kind.emoji + '!';
    tell(say.found(kind.name, S.taps));
    S.level = Rounds.nextLevel(S.level, S.taps);
    setPhase('found');
    later(1.8, () => {
      S.onFlower = false;
      jump(rig, world.flowerTop(bud), world.home(rig.home), home);
    });
  }

  // back on the bank, the critter fills the next spot in the row
  function home() {
    S.row.push(ORDER[S.plan.hider]);
    drawProgress();
    bubble.hidden = true;
    setPhase('home');
    if (S.row.length >= 5) later(0.3, party);
    else later(0.5, nextRound);
  }

  function party() {
    setPhase('party');
    tell(say.party());
    Sfx.play('win');
    rigs.forEach((r, k) => { r.partyAt = time() + k * 0.12; });
    if (!calm()) world.burst(new THREE.Vector3(0, 2.6, -2.4), 'confetti');
    later(2.8, () => {
      S.row = [];
      drawProgress();
      nextRound();
    });
  }

  // a wrong flower holds a surprise; they take turns, and each flower keeps its own all round
  function miss(bud) {
    const kind = S.tried[bud] || Rounds.SURPRISE_ORDER[S.misses++ % 2];
    S.tried[bud] = kind;
    S.surprise = { kind, bud, at: time(), splashed: false };
    world.surprises[kind].visible = true;
    Sfx.play('pop');
    tell(say.miss(kind, S.taps >= 2));
    later(1.7, () => {
      world.flower(bud).target = 0;
      later(0.4, () => {
        world.surprises[kind].visible = false;
        S.surprise = null;
        setPhase('seek');
      });
    });
  }

  /* ------------------------------------------------------- every frame */
  function lookAt(rig, dt, chin, target) {
    let yaw = 0;
    let pitch = chin;
    if (target) {
      const p = world.toScreen(above(rig.root.position, rig.root.scale.y));
      yaw = clamp((target.x - p.x) / 220, -0.8, 0.8);
      pitch = clamp((target.y - p.y) / 400, -0.3, 0.35) + chin;
    }
    const k = 1 - Math.exp(-6 * dt);
    rig.look.yaw += (yaw - rig.look.yaw) * k;
    rig.look.pitch += (pitch - rig.look.pitch) * k;
  }
  stage.addEventListener('pointermove', (e) => { S.pointer = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { S.pointer = null; });

  function tick(t, dt) {
    runTimers();

    if (S.swap) {
      const k = Math.min(1, (t - S.swap.at) / S.plan.swapTime);
      if (k >= 1) swapDone();
      else world.slide(S.swap.a, S.swap.b, S.swap.i, S.swap.j, S.n, k);
    }

    // while waiting for a tap the flowers wiggle in turn; after two misses the right one wiggles hard
    const waiting = S.phase === 'seek' || S.phase === 'reveal';
    for (let i = 0; i < S.n; i++) {
      const f = world.flower(i);
      if (!waiting) f.wiggle = 0;
      else if (S.taps >= 2 && i === S.hiderBud) f.wiggle = 1;
      else f.wiggle = 0.5 * Math.max(0, 1 - Math.abs(((t * 1.2) % S.n) - S.slotOf[i]) * 2);
    }

    // the big hop between the bank and a flower, with its shadow on the ground below
    if (S.hop) {
      const H = S.hop;
      const h = hopCurve(t - H.at, 1.3, 0.62);
      const P = H.rig.root.position;
      if (!h || h.phase === 'land') {
        P.copy(H.to);
        H.rig.landAt = t;
        S.hop = null;
        world.shadow(0, 0, 0, 0, false);
        H.done();
      } else {
        P.lerpVectors(H.from, H.to, h.phase === 'air' ? h.p : 0);
        world.shadow(P.x, P.y, P.z, h.y, true);
        P.y += h.y;
        H.rig.sy = h.sy;
        H.rig.root.visible = true;
        H.rig.root.scale.setScalar(CRITTER_SIZE);
        H.rig.turn.rotation.y = turnToward(H.rig.turn.rotation.y, Math.atan2(H.to.x - H.from.x, H.to.z - H.from.z), 1 - Math.exp(-14 * dt));
        H.rig.update(t, dt);
      }
    }

    // the watchers follow the moving flowers with their eyes, or else the pointer
    const target = S.swap
      ? world.toScreen(new THREE.Vector3((world.slotX(S.swap.i, S.n) + world.slotX(S.swap.j, S.n)) / 2, 0.6, 0))
      : S.pointer;
    rigs.forEach((r) => {
      if (S.hop && S.hop.rig === r) return;
      const inFlower = S.onFlower && r === hider();
      if (inFlower) {
        // stands tall in its open flower, and ducks down as the petals close over it
        const f = world.flower(S.hiderBud);
        const open = smooth(f.o);
        r.root.position.copy(world.flowerTop(S.hiderBud));
        r.root.position.y += 0.15 * open;
        r.root.scale.setScalar(CRITTER_SIZE * (0.45 + 0.55 * open));
        r.root.visible = f.o > 0.3;
      } else {
        r.root.position.copy(world.home(r.home));
        r.root.scale.setScalar(CRITTER_SIZE);
        r.root.visible = true;
        if (S.phase === 'start' && t - r.hopAt > 1.5 && Math.random() < dt * 0.3) r.hopAt = t;   // a hop now and then, just for joy
      }
      let sy = null;
      let spin = 0;
      const cheer = hopCurve(t - r.hopAt, 0.5);
      if (cheer) {
        r.root.position.y += cheer.y;
        sy = cheer.sy;
      }
      if (t >= r.partyAt && t - r.partyAt < 2.4) {
        const p = hopCurve((t - r.partyAt) % 0.8, 0.6);
        if (p) {
          r.root.position.y += p.y;
          sy = p.sy;
          if (p.phase === 'air' && !calm()) spin = p.p * TAU;
        }
      }
      if (sy == null && t - r.landAt < 0.5) {
        const p = (t - r.landAt) / 0.5;
        sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);       // the landing jelly wobble
      }
      r.sy = sy;
      // the friends watch; the one in the flower looks up at the child
      lookAt(r, dt, inFlower ? -0.3 : -0.18, inFlower ? null : target);
      if (spin) r.turn.rotation.y = r.look.yaw * 0.6 + spin;
      else r.turn.rotation.y = turnToward(r.turn.rotation.y, r.look.yaw * 0.6, 1 - Math.exp(-12 * dt));
      r.update(t, dt);
    });

    // the surprise in a wrong flower
    if (S.surprise) {
      const s = S.surprise;
      const k = t - s.at;
      const top = world.flowerTop(s.bud);
      const g = world.surprises[s.kind];
      if (s.kind === 'goldfish') {
        // a leap out of the flower, sideways towards the middle, and a dive into open water
        const p = Math.min(k / 0.9, 1);
        const dx = top.x > 0.1 ? -1.25 : 1.25;
        const dz = 0.75;
        g.position.set(top.x + dx * p, top.y + 0.3 - 0.35 * p + 1.2 * Math.sin(Math.PI * p) - Math.max(0, k - 0.9) * 3, top.z + dz * p);
        g.rotation.set(0, Math.atan2(-dz, dx), (0.5 - p) * 1.8);
        if (k > 0.9 && !s.splashed) {
          s.splashed = true;
          world.ripple(top.x + dx, top.z + dz, 0.3);
          world.burst(new THREE.Vector3(top.x + dx, 0.1, top.z + dz), 'drops');
          Sfx.play('splash');
        }
        g.visible = g.position.y > -0.4;
      } else {
        // wakes up, flutters out for a look around, and settles back to sleep
        const up = k < 0.35 ? smooth(k / 0.35) : k < 1.3 ? 1 : 1 - smooth(Math.min(1, (k - 1.3) / 0.3));
        g.position.set(top.x, top.y + 0.15 + 0.75 * up + 0.05 * Math.sin(k * 6) * up, top.z + 0.1);
        g.rotation.set(0, 0.4 * Math.sin(k * 7), 0);
      }
    }

    world.ring(S.keys && S.phase === 'seek' ? world.slotX(S.cursor, S.n) : null);
    world.frame(S.n, dt, false);
  }

  /* -------------------------------------------------------------- input */
  pondInput.addEventListener('keydown', (e) => {
    const arrow = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!arrow && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (S.phase !== 'seek') return;
    if (arrow) {
      if (!S.keys) S.keys = true;                 // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, S.n - 1);
    } else if (S.keys) {
      open(S.cursor);
      return;
    } else {
      S.keys = true;
    }
    srFocus.textContent = say.focus(S.cursor, S.n);
  });

  pondInput.addEventListener('pointerdown', (e) => {
    S.keys = false;
    if (S.phase === 'seek') {
      const bud = world.flowerAt(e.clientX, e.clientY);
      if (bud != null) {
        open(S.slotOf[bud]);
        return;
      }
    }
    // a tap on a critter makes it giggle
    const r = rigs.find((rg) => rg.root.visible && world.hits(e.clientX, e.clientY, rg.root));
    if (r && !(S.hop && S.hop.rig === r)) {
      r.hopAt = time();
      Sfx.play('voice', KINDS[r.kind].voice);
    }
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
  layFlowers(3, false);          // three flowers in bloom behind the Play button
  world.frame(3, 0, true);
  start();
})();
