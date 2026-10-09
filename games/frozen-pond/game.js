/* Frozen Pond: the game itself.
 *
 * Pick a critter and a level, then slide across the ice to the fish. On ice
 * you keep going until a rock stops you; snow stops you on the spot. Find
 * the way in as few slides as you can, with Undo, Restart and a Hint (from
 * a real solver) always there. Needs THREE, Toon, Critters, Sfx, Frozen and
 * World, loaded before it. Nothing is stored: ticks last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Frozen.say;
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
    lv: null,
    pos: -1,
    history: [],
    moves: 0,
    best: 0,
    solved: new Set(),       // this visit only
    busyUntil: 0,
    queue: [],
    slide: null,             // { from, to, at, dur, dir }
    cheerAt: -9,
    bumpAt: -9,
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
  Frozen.GROUPS.forEach((g) => {
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
    rig.root.scale.setScalar(0.52);
    world.actors.add(rig.root);
    if (S.lv) rig.root.position.copy(world.cellPos(S.pos));
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
    S.lv = Frozen.parse(Frozen.LEVELS[i]);
    S.pos = S.lv.start;
    S.best = (Frozen.solve(S.lv) || { moves: 0 }).moves;
    S.history = [];
    S.moves = 0;
    S.queue = [];
    S.timers = [];
    S.busyUntil = 0;
    S.slide = null;
    world.build(S.lv);
    world.snow(!calm());
    rig.root.position.copy(world.cellPos(S.pos));
    S.facing = 0;
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${i + 1}`;
    drawMoves();
    tell(say.start(i + 1, S.best));
    world.frame(0, true);
    boardEl.focus({ preventScroll: true });
  }

  function drawMoves() {
    $('moves').textContent = String(S.moves);
    $('movesWord').textContent = S.moves === 1 ? 'slide' : 'slides';
  }

  /* ------------------------------------------------------------- slides */
  function tryMove(dir) {
    if (S.screen !== 'play') return;
    const t = time();
    if (t < S.busyUntil) {
      if (S.queue.length < 1) S.queue.push(dir);
      return;
    }
    S.facing = YAW[dir];
    S.idleAt = t + 1.2;
    const r = Frozen.slide(S.lv, S.pos, dir);
    if (!r.path.length) {
      rig.react('shake');
      Sfx.play('pop');
      tell(say.bump());
      return;
    }
    world.arrow(null);
    S.history.push(S.pos);
    const from = S.pos;
    S.pos = r.to;
    S.moves++;
    drawMoves();
    const dur = 0.12 * r.path.length + 0.12;
    S.slide = { from: world.cellPos(from), to: world.cellPos(r.to), at: t, dur, dir };
    S.busyUntil = t + dur + 0.05;
    Sfx.play('hop');
    later(dur, () => arrive(r.to));
  }

  function arrive(cell) {
    S.slide = null;
    S.bumpAt = time();
    world.burst(above(world.cellPos(cell), 0.1), 'powder');
    if (cell === S.lv.goal) {
      finish();
      return;
    }
    Sfx.play(S.lv.snow[cell] ? 'poof' : 'pop');
    const next = S.queue.shift();
    if (next) later(0.06, () => tryMove(next));
  }

  function undo() {
    if (S.screen !== 'play' || !S.history.length) return;
    S.queue = [];
    S.slide = null;
    S.pos = S.history.pop();
    S.moves = Math.max(0, S.moves - 1);
    jumpTo();
    tell(say.undo());
  }
  function restart() {
    if (S.screen !== 'play') return;
    S.queue = [];
    S.slide = null;
    S.history = [];
    S.pos = S.lv.start;
    S.moves = 0;
    jumpTo();
    tell(say.restart());
  }
  function jumpTo() {
    S.busyUntil = 0;
    S.timers = [];
    world.arrow(null);
    rig.root.position.copy(world.cellPos(S.pos));
    world.burst(above(world.cellPos(S.pos), 0.3), 'powder');
    Sfx.play('poof');
    drawMoves();
  }
  function hint() {
    if (S.screen !== 'play' || S.slide) return;
    const sol = Frozen.solve(S.lv, S.pos);
    if (!sol) {
      tell(say.cannot());
      return;
    }
    world.arrow(S.pos, sol.path[0]);
    tell(say.hint(sol.path[0]));
  }

  function finish() {
    S.screen = 'done';
    S.solved.add(S.index);
    S.queue = [];
    const t = time();
    S.cheerAt = t;
    world.fishJump(t);
    Sfx.play('splash');
    later(0.3, () => Sfx.play('win'));
    world.burst(above(rig.root.position, 1.2), 'sparkle');
    if (!calm()) world.burst(new THREE.Vector3(0, 3, 0), 'confetti');
    const line = say.done(S.index + 1, S.moves, S.best);
    tell(line);
    later(1.2, () => {
      $('doneTitle').textContent = `Level ${S.index + 1} done!`;
      $('doneSub').textContent = line;
      $('nextLevel').hidden = S.index >= Frozen.LEVELS.length - 1;
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

  // swipe to slide, or tap a square to slide towards it
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
    if (c == null || !S.lv) return;
    const w = S.lv.w;
    const px = S.pos % w;
    const py = Math.floor(S.pos / w);
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
    let lean = 0;
    if (S.slide) {
      const k = Math.min(1, (t - S.slide.at) / S.slide.dur);
      const e = 1 - (1 - k) * (1 - k);
      rig.root.position.lerpVectors(S.slide.from, S.slide.to, e);
      lean = 0.25 * (1 - k);
      sy = 0.92;
    } else if (S.lv && S.screen !== 'menu') {
      rig.root.position.copy(world.cellPos(S.pos));
    }
    const wob = t - S.bumpAt;
    if (wob < 0.5) sy = 1 - 0.18 * Math.exp(-5 * (wob / 0.5)) * Math.cos(12 * (wob / 0.5));
    const cheer = hopCurve(t - S.cheerAt, 0.7);
    if (cheer) {
      y = cheer.y;
      sy = cheer.sy;
      if (cheer.phase === 'air' && !calm() && S.screen === 'done') spin = cheer.p * TAU;
    }
    rig.root.position.y = (S.lv ? world.cellPos(S.pos).y : 0) + y;
    rig.sy = sy;
    rig.turn.rotation.x = lean;                    // leaning into the slide
    const face = t > S.idleAt && !S.slide ? 0 : S.facing;
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
  S.lv = Frozen.parse(Frozen.LEVELS[5]);
  S.pos = S.lv.start;
  world.build(S.lv);
  world.snow(!calm());
  rig.root.position.copy(world.cellPos(S.pos));
  world.frame(0, true);
  drawLevelButtons();
  start();
})();
