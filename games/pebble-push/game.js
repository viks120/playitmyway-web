/* Pebble Push: the game itself.
 *
 * Pick a critter and a level, then hop round the lily pads pushing pebbles
 * onto the flowers. Pebbles can only be pushed, never pulled, so it pays to
 * think ahead; Undo, Restart and a Hint (from a real solver) are always
 * there. Needs THREE, Toon, Critters, Sfx, Pebbles and World, loaded before
 * it. Nothing is stored: ticks for solved levels last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Pebbles.say;
  const YAW = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const tellEl = $('tell');
  const srFocus = $('srFocus');

  function noGl() {
    ['menu', 'hud', 'done', 'board'].forEach((id) => { $(id).hidden = true; });
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
  const S = {
    screen: 'menu',          // menu, play, done
    kind: 'bunny',
    index: 0,
    state: null,
    history: [],
    moves: 0,
    best: 0,
    solved: new Set(),       // this visit only
    busyUntil: 0,
    queue: [],
    from: null,
    to: null,
    hopAt: -9,
    cheerAt: -9,
    idleAt: 0,
    facing: 0,
    timers: [],
  };
  let rig = null;

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

  /* --------------------------------------------------------------- menu */
  const racerButtons = ORDER.map((kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'racer';
    b.dataset.kind = kind;
    b.setAttribute('aria-label', `${KINDS[kind].name} the ${KINDS[kind].kind}`);
    b.innerHTML = `<span class="racer-emoji" aria-hidden="true">${KINDS[kind].emoji}</span><span class="racer-name" aria-hidden="true">${KINDS[kind].name}</span>`;
    b.addEventListener('click', () => pickCritter(kind));
    $('pickRow').appendChild(b);
    return b;
  });
  const levelButtons = [];
  Pebbles.GROUPS.forEach((g) => {
    const sec = document.createElement('section');
    sec.className = 'level-group';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const row = document.createElement('div');
    row.className = 'level-row';
    for (let i = g.from; i < g.to; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-btn';
      b.dataset.level = String(i + 1);
      b.addEventListener('click', () => startLevel(i));
      row.appendChild(b);
      levelButtons[i] = b;
    }
    sec.append(h, row);
    $('levelGroups').appendChild(sec);
  });
  function drawLevelButtons() {
    levelButtons.forEach((b, i) => {
      const ok = S.solved.has(i);
      b.innerHTML = `<span aria-hidden="true">${i + 1}</span>${ok ? '<span class="tick" aria-hidden="true">✓</span>' : ''}`;
      b.setAttribute('aria-label', `Level ${i + 1}${ok ? ', done this visit' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function pickCritter(kind) {
    S.kind = kind;
    racerButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    if (rig) {
      world.actors.remove(rig.root);
      rig.dispose();
    }
    rig = Critters.create(kind);
    rig.root.scale.setScalar(0.55);
    world.actors.add(rig.root);
    if (S.state) rig.root.position.copy(world.cellPos(S.state.player));
    S.cheerAt = time();
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    S.queue = [];
    drawLevelButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- levels */
  function startLevel(i) {
    S.index = i;
    S.state = Pebbles.parse(Pebbles.LEVELS[i]);
    S.best = (Pebbles.solve(S.state) || { moves: 0 }).moves;
    S.history = [];
    S.moves = 0;
    S.queue = [];
    S.timers = [];
    S.busyUntil = 0;
    S.from = null;
    world.build(S.state);
    rig.root.position.copy(world.cellPos(S.state.player));
    S.facing = 0;
    showBlooms(false);
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${i + 1}`;
    drawMoves();
    tell(say.start(i + 1, S.state.pebbles.length));
    world.frame(0, true);
    boardEl.focus({ preventScroll: true });
  }

  function drawMoves() {
    $('moves').textContent = String(S.moves);
    $('movesWord').textContent = S.moves === 1 ? 'move' : 'moves';
  }

  // flowers bloom round any pebble sitting on them
  function showBlooms(announce) {
    const s = S.state;
    let newly = false;
    s.goals.forEach((g, k) => {
      const on = s.pebbles.includes(g);
      world.bloom(k, on);
      if (on && announce && announce.includes(g)) newly = true;
    });
    return newly;
  }

  /* -------------------------------------------------------------- moves */
  function tryMove(dir) {
    if (S.screen !== 'play') return;
    const t = time();
    if (t < S.busyUntil) {
      if (S.queue.length < 2) S.queue.push(dir);
      return;
    }
    const r = Pebbles.step(S.state, dir);
    S.facing = YAW[dir];
    S.idleAt = t + 0.9;
    if (!r) {
      rig.react('shake');
      Sfx.play('pop');
      return;
    }
    world.arrow(null);
    S.history.push(S.state);
    const before = S.state;
    S.state = r.state;
    S.moves++;
    drawMoves();
    S.from = world.cellPos(before.player);
    S.to = world.cellPos(r.state.player);
    S.hopAt = t;
    S.busyUntil = t + 0.24;
    Sfx.play('hop');
    if (r.pushed >= 0) {
      world.placePebbles(r.state.pebbles, false, t);
      const landed = r.state.pebbles[r.pushed];
      later(0.2, () => {
        const newly = showBlooms([landed]);
        if (Pebbles.solved(S.state)) return;
        if (newly) {
          Sfx.play('good', 4 + Pebbles.onFlowers(S.state));
          world.burst(above(world.cellPos(landed), 0.6), 'sparkle');
          tell(say.onFlower(Pebbles.onFlowers(S.state), S.state.goals.length));
        } else if (Pebbles.stuck(S.state, r.pushed)) {
          Sfx.play('uhoh');
          tell(say.stuck());
        } else {
          showBlooms(false);
        }
      });
      if (Pebbles.solved(r.state)) later(0.32, finish);
    }
    later(0.25, () => {
      const next = S.queue.shift();
      if (next) tryMove(next);
    });
  }

  function undo() {
    if (S.screen !== 'play' || !S.history.length) return;
    S.queue = [];
    S.state = S.history.pop();
    S.moves = Math.max(0, S.moves - 1);
    jumpTo();
    tell(say.undo());
  }
  function restart() {
    if (S.screen !== 'play') return;
    S.queue = [];
    S.history = [];
    S.state = Pebbles.parse(Pebbles.LEVELS[S.index]);
    S.moves = 0;
    jumpTo();
    tell(say.restart());
  }
  // everything straight back to where the state says, with a puff
  function jumpTo() {
    S.hopAt = -9;
    S.busyUntil = 0;
    world.arrow(null);
    world.placePebbles(S.state.pebbles, true);
    rig.root.position.copy(world.cellPos(S.state.player));
    world.burst(above(world.cellPos(S.state.player), 0.4), 'puff');
    Sfx.play('poof');
    showBlooms(false);
    drawMoves();
  }
  function hint() {
    if (S.screen !== 'play') return;
    const sol = Pebbles.solve(S.state);
    if (!sol) {
      tell(say.cannot());
      return;
    }
    const dir = sol.path[0];
    world.arrow(S.state.player, dir);
    tell(say.hint(dir));
  }

  function finish() {
    S.screen = 'done';
    S.solved.add(S.index);
    S.queue = [];
    S.cheerAt = time();
    Sfx.play('win');
    world.burst(above(rig.root.position, 1.2), 'sparkle');
    if (!calm()) world.burst(new THREE.Vector3(0, 3, 0), 'confetti');
    const line = say.done(S.index + 1, S.moves, S.best);
    tell(line);
    later(1.1, () => {
      $('doneTitle').textContent = `Level ${S.index + 1} done!`;
      $('doneSub').textContent = line;
      $('nextLevel').hidden = S.index >= Pebbles.LEVELS.length - 1;
      done.hidden = false;
      ($('nextLevel').hidden ? $('again') : $('nextLevel')).focus({ preventScroll: true });
    });
  }
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => startLevel(S.index));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  $('undoBtn').addEventListener('click', () => { undo(); boardEl.focus({ preventScroll: true }); });
  $('restartBtn').addEventListener('click', () => { restart(); boardEl.focus({ preventScroll: true }); });
  $('hintBtn').addEventListener('click', () => { hint(); boardEl.focus({ preventScroll: true }); });
  document.querySelectorAll('.pad-btn').forEach((b) => b.addEventListener('click', () => tryMove(b.dataset.dir)));

  /* -------------------------------------------------------------- input */
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play') return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYS[k]) {
      e.preventDefault();
      tryMove(KEYS[k]);
    } else if (k === 'z' || k === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (k === 'r') {
      e.preventDefault();
      restart();
    } else if (k === 'h') {
      e.preventDefault();
      hint();
    }
  });

  // swipe to move, or tap a square to step towards it
  let down = null;
  boardEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  boardEl.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.hypot(dx, dy) > 30) {
      tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      return;
    }
    const c = world.cellAt(e.clientX, e.clientY);
    if (c == null || !S.state) return;
    const w = S.state.w;
    const px = S.state.player % w;
    const py = Math.floor(S.state.player / w);
    const cx = c % w;
    const cy = Math.floor(c / w);
    if (cx === px && cy === py) return;
    if (Math.abs(cx - px) >= Math.abs(cy - py)) tryMove(cx > px ? 'right' : 'left');
    else tryMove(cy > py ? 'down' : 'up');
  });

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    if (!rig) return;
    let y = 0;
    let sy = null;
    let spin = 0;
    const h = S.from ? hopCurve(t - S.hopAt, 0.32, 0.18) : null;
    if (h) {
      rig.root.position.lerpVectors(S.from, S.to, h.phase === 'air' ? h.p : h.phase === 'land' ? 1 : 0);
      y = h.y;
      sy = h.sy;
    } else if (S.state && S.screen !== 'menu') {
      rig.root.position.copy(world.cellPos(S.state.player));
    }
    const cheer = hopCurve(t - S.cheerAt, 0.6);
    if (cheer) {
      y = cheer.y;
      sy = cheer.sy;
      if (cheer.phase === 'air' && !calm() && S.screen === 'done') spin = cheer.p * TAU;
    }
    rig.root.position.y = (S.state ? world.cellPos(S.state.player).y : 0) + y;
    rig.sy = sy;
    const face = t > S.idleAt ? 0 : S.facing;
    let d = (face + spin - rig.turn.rotation.y) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    rig.turn.rotation.y += spin ? d : d * (1 - Math.exp(-12 * dt));
    rig.look.pitch = -0.15;
    rig.update(t, dt);
    world.frame(dt, false);
  }

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
  pickCritter('bunny');
  S.cheerAt = -9;
  // a level in the background behind the menu
  S.state = Pebbles.parse(Pebbles.LEVELS[0]);
  world.build(S.state);
  rig.root.position.copy(world.cellPos(S.state.player));
  world.frame(0, true);
  drawLevelButtons();
  start();
})();
