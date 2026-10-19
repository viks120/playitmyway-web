/* Missing Tile: the game itself.
 *
 * A 3×3 grid of tiles with the bottom-right one missing, and a tray of
 * answer tiles in front. Pick a tile (a tap, a drag, or the arrow keys),
 * then place it in the gap (tap it again, tap the gap, drop it there, or
 * Enter). The right tile settles in and the helper critter cheers; a wrong
 * one greys out and says which rule it breaks. H gives a hint one step at a
 * time, G reads the puzzle out. Needs THREE, Toon, Critters, Sfx, Voice,
 * Matrix and World, loaded before it. Nothing is stored: ticks and stars
 * last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = ['frog', 'bunny', 'kitten', 'dino'].filter((k) => KINDS[k]);
  const hopCurve = Critters.hopCurve;
  const say = Matrix.say;
  const LEVELS = Matrix.LEVELS;
  const time = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const TAP = 12;                        // px a pointer may wander and still count as a tap
  const m = /[?&]level=(\d+)/.exec(location.search);

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const hudTop = $('hudTop');
  const done = $('done');
  const tellEl = $('tell');
  const srEl = $('srFocus');
  const triesEl = $('tries');
  const hintBtn = $('hintBtn');

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
    screen: 'menu',          // menu, play
    kind: 'frog',
    level: 0,                // 0-based
    puzzle: null,
    sel: -1,                 // the picked option, -1 none
    outs: new Set(),         // options placed wrongly this level
    tries: 0,                // wrong picks this level
    hintStep: 0,             // hint steps revealed this level
    state: 'pick',           // pick, busy, done (mirrored on #board's data-state)
    drag: null,              // { i, id, x0, y0, wasSel, moved }
    tap: null,               // { id, x, y, out } or { id, x, y, gap }
    via: 'pointer',          // how the last tile was placed: 'key' or 'pointer'
    quietUntil: 0,           // taps are ignored until then: a double-tap on Next must not reach the tray
    timers: [],
    results: new Map(),      // level -> 'tick' | 'star'
    cheerAt: -9,
    now: time(),             // this frame's clock in seconds; every World call gets it
  };
  let rig = null;
  const now = () => S.now;
  // a duration the world returned, in seconds; a non-number would leave the board busy for ever
  const dur = (d) => (Number.isFinite(d) ? Math.max(0, d) : 0.5);

  function later(delay, fn) {
    S.timers.push({ at: now() + delay, fn });
  }
  function runTimers() {
    const t = now();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  // the message strip; its height is an inset, so the board is re-framed when it changes
  function tell(text) {
    if (tellEl.textContent === text) {
      // the same words again: cleared first, so they are announced and noticed a second time
      tellEl.textContent = '';
      later(0, () => { tellEl.textContent = text; });
      return;
    }
    tellEl.textContent = text;
    fit();
  }
  function srSay(text) {
    srEl.textContent = text;
  }
  function speak(text) {
    if (Voice.ready()) Voice.say(text);
  }
  function readAloudText() {
    return say.start(S.level + 1) + ' ' + Matrix.readGrid(S.puzzle) + ' ' + Matrix.readOptions(S.puzzle);
  }

  // #board's data-* attributes change in the same call as the state they mirror
  function setState(s) {
    S.state = s;
    boardEl.dataset.state = s;
  }
  function setSel(i) {
    S.sel = i;
    boardEl.dataset.sel = String(i);
  }
  function drawOuts() {
    boardEl.dataset.out = Array.from(S.outs).sort((a, b) => a - b).join(',');
  }

  /* --------------------------------------------------------------- menu */
  const pickButtons = ORDER.map((kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.kind = kind;
    b.setAttribute('aria-label', `${KINDS[kind].name} the ${KINDS[kind].kind}`);
    b.innerHTML = `<span class="pick-emoji" aria-hidden="true">${KINDS[kind].emoji}</span><span class="pick-name" aria-hidden="true">${KINDS[kind].name}</span>`;
    b.addEventListener('click', () => pickCritter(kind));
    $('pickRow').appendChild(b);
    return b;
  });
  const levelButtons = [];
  Matrix.GROUPS.forEach((g) => {
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
      const got = S.results.get(i);
      const ok = !!got;
      const star = got === 'star';
      b.innerHTML = `<span aria-hidden="true">${i + 1}</span>${ok ? `<span class="tick${star ? ' star' : ''}" aria-hidden="true">${star ? '★' : '✓'}</span>` : ''}`;
      b.setAttribute('aria-label', `Level ${i + 1}${ok ? (star ? ', done this visit, first try with no hints' : ', done this visit') : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  // the seat already carries the scale and faces the camera
  function seatCritter() {
    if (!rig) return;
    const seat = world.seat();
    if (rig.root.parent !== seat) seat.add(rig.root);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
  }

  function pickCritter(kind, quiet) {
    S.kind = kind;
    pickButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    if (rig) {
      if (rig.root.parent) rig.root.parent.remove(rig.root);
      rig.dispose();
    }
    rig = Critters.create(kind);
    rig.turn.rotation.y = 0;
    seatCritter();
    S.cheerAt = now();
    if (!quiet) Sfx.play('voice', KINDS[kind].voice);
  }

  // works at any moment: a flight in progress is simply rebuilt away
  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    S.drag = null;
    S.tap = null;
    setState('pick');
    world.spot(null);
    Voice.stop();
    drawLevelButtons();
    // the level just played (or level 1) waits behind the menu, reset
    background(S.level);
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    srSay(say.menu());
    const next = levelButtons.find((b, i) => !S.results.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  // a fresh board for level i (0-based), nothing picked, nothing out
  function background(i) {
    S.level = i;
    S.puzzle = Matrix.make(i);
    world.build(S.puzzle);
    seatCritter();
    S.outs.clear();
    S.tries = 0;
    S.hintStep = 0;
    setSel(-1);
    drawOuts();
    boardEl.dataset.hints = '0';
    boardEl.dataset.tries = '0';
    boardEl.dataset.level = String(i + 1);
  }

  /* ------------------------------------------------------------- levels */
  function startLevel(i) {
    const n = i + 1;
    background(i);
    S.timers = [];
    S.drag = null;
    S.tap = null;
    S.quietUntil = now() + 0.35;
    S.screen = 'play';
    setState('pick');
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${n}`;
    triesEl.hidden = true;
    hintBtn.setAttribute('aria-disabled', 'false');
    tell(say.start(n));
    srSay('');
    later(0.6, () => srSay(readAloudText()));
    speak(say.start(n));
    fit();
    boardEl.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- selecting */
  // how: undefined (just the state), 'sr' (the screen reader hears it: the keyboard),
  // 'full' (the strip explains the second tap too: a finger)
  function select(i, how) {
    setSel(i);
    world.select(i);
    if (i < 0 || !how) return;
    const cell = S.puzzle.options[i];
    srSay(say.picked(cell, i, S.puzzle.options.length));
    if (how === 'full') tell(say.chosen(cell));
  }

  // an arrow key: the next (step 1) or previous (step -1) live option; from nothing, the first or the last
  function arrow(step) {
    if (S.screen !== 'play' || S.drag || S.state !== 'pick') return;
    const n = S.puzzle.options.length;
    let j = S.sel < 0 ? (step > 0 ? -1 : n) : S.sel;
    do {
      j += step;
    } while (j >= 0 && j < n && S.outs.has(j));
    if (j < 0 || j >= n) {
      srSay(say.none(step > 0 ? 'right' : 'left'));
      return;
    }
    select(j, 'sr');
  }

  // the smallest live option above i, else the largest below, else none
  function nearestLive(i) {
    const n = S.puzzle.options.length;
    for (let j = i + 1; j < n; j++) if (!S.outs.has(j)) return j;
    for (let j = i - 1; j >= 0; j--) if (!S.outs.has(j)) return j;
    return -1;
  }

  /* ------------------------------------------------------------ placing */
  // via: 'key' or 'pointer'; it decides what is picked once a wrong tile has come back
  function place(i, via) {
    if (S.screen !== 'play' || boardEl.dataset.state !== 'pick') return;
    S.via = via || 'pointer';
    if (S.outs.has(i)) {
      tell(say.out());
      return;
    }
    setState('busy');
    world.spot(null);
    const d = dur(world.fly(i, now()));
    later(d, () => land(i));
  }

  function land(i) {
    const t = now();
    const p = S.puzzle;
    if (i === p.answer) {
      world.accept(i, t);
      setSel(-1);                                    // accept clears the world's selection too
      Sfx.play('good');
      later(0.3, () => Sfx.play('win'));
      later(0.8, () => Sfx.play('voice', KINDS[S.kind].voice));
      if (rig) rig.react('puff');
      S.cheerAt = t;
      const line = say.right(S.tries === 0);
      tell(line);
      speak(line);
      const outcome = S.tries === 0 && S.hintStep === 0 && !S.results.has(S.level) ? 'star' : 'tick';
      if (S.results.get(S.level) !== 'star') S.results.set(S.level, outcome);
      setState('done');
      later(calm() ? 1.2 : 2.2, () => showDone(outcome));
      return;
    }
    S.tries += 1;
    boardEl.dataset.tries = String(S.tries);
    triesEl.textContent = say.tries(S.tries);
    triesEl.hidden = false;
    fit();                                           // the pill may wrap the HUD row
    S.outs.add(i);
    drawOuts();
    world.out(i);
    const d = dur(world.reject(i, t));
    Sfx.play('uhoh');
    if (rig) rig.react('shake');
    const line = say.wrong(Matrix.whyWrong(p, i));
    tell(line);
    speak(line);
    later(d, () => {
      setState('pick');
      // a keyboard player hears where they are next; a finger starts afresh, so the
      // next tap on the gap can never place a tile the child did not choose
      if (S.via === 'key') select(nearestLive(i), 'sr');   // the wrong message stays on the strip
      else select(-1);
    });
  }

  function enter() {
    if (S.screen !== 'play' || S.drag || S.state !== 'pick') return;
    if (S.sel < 0) tell(say.pickFirst());
    else place(S.sel, 'key');
  }

  /* -------------------------------------------------------- hints and G */
  function hint() {
    if (S.screen !== 'play' || S.drag || S.state !== 'pick') return;
    const p = S.puzzle;
    const steps = Matrix.hintSteps(p);
    if (S.hintStep >= steps) return;
    const h = Matrix.hint(p, S.hintStep);
    const line = say.hint(h.text);
    tell(line);
    world.spot(h.spot);
    Sfx.play('good', 2);
    speak(line);
    S.hintStep += 1;
    boardEl.dataset.hints = String(S.hintStep);
    if (S.hintStep >= steps) hintBtn.setAttribute('aria-disabled', 'true');
  }

  // G: the whole puzzle for the screen reader, cleared first so it is read again
  function readAll() {
    if (S.screen !== 'play') return;
    srSay('');
    later(0, () => srSay(readAloudText()));
  }

  /* ----------------------------------------------------------- the win */
  function showDone(outcome) {
    const n = S.level + 1;
    $('doneTitle').textContent = outcome === 'star' ? 'First try! ★' : "That's it!";
    $('doneSub').textContent = say.done(n, S.tries === 0, S.hintStep);
    $('doneWhy').textContent = Matrix.ruled(S.puzzle).map((r) => Matrix.ruleText(r)).join(' ');
    $('nextLevel').hidden = S.level >= LEVELS.length - 1;
    done.hidden = false;
    ($('nextLevel').hidden ? $('again') : $('nextLevel')).focus({ preventScroll: true });
  }

  $('nextLevel').addEventListener('click', () => startLevel(S.level + 1));
  $('again').addEventListener('click', () => startLevel(S.level));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  hintBtn.addEventListener('click', () => { hint(); boardEl.focus({ preventScroll: true }); });

  /* -------------------------------------------------------------- input */
  const KEYS = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play') return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.drag) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'g') {
      e.preventDefault();
      readAll();                                     // reads even while busy or done
      return;
    }
    if (S.state !== 'pick') return;
    if (e.repeat && !KEYS[k]) return;                // a held H or Enter would run through the hints or the tray
    if (KEYS[k]) {
      e.preventDefault();
      arrow(KEYS[k]);
    } else if ((k === 'Enter' || k === ' ') && e.target === boardEl) {
      e.preventDefault();
      enter();
    } else if (k === 'h') {
      e.preventDefault();
      hint();
    }
  });

  /* A finger or the mouse: pressing a live tile picks it and starts a drag;
   * letting go without moving is a tap (a second tap places it), and a drag
   * ends in the gap (placed) or short of it (floats back). Pressing an outed
   * tile or the gap is remembered as a tap and judged when the finger lifts. */
  boardEl.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play' || S.state !== 'pick' || S.drag || now() < S.quietUntil) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    boardEl.focus({ preventScroll: true });          // so the keys work straight after
    const i = world.optionAt(e.clientX, e.clientY);
    if (i >= 0 && S.outs.has(i)) {
      S.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, out: true };
      return;
    }
    if (i < 0) {
      S.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, gap: world.overGap(e.clientX, e.clientY) };
      return;
    }
    e.preventDefault();
    S.tap = null;
    const wasSel = S.sel === i;
    if (!wasSel) select(i, 'full');
    S.drag = { i, id: e.pointerId, x0: e.clientX, y0: e.clientY, wasSel, moved: false };
    try {
      boardEl.setPointerCapture(e.pointerId);
    } catch (err) {
      // the drag still works without capture while the pointer stays on the board
    }
  });
  boardEl.addEventListener('pointermove', (e) => {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > TAP) d.moved = true;
    if (d.moved) world.drag(d.i, e.clientX, e.clientY);
  });
  // lifted: a tap or a drop; cancelled: always a drop, never a pick
  function endDrag(e, lifted) {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    S.drag = null;
    if (!d.moved) {
      if (lifted && d.wasSel) place(d.i, 'pointer');  // tapped twice: into the gap
      return;                                        // tapped once: it stays picked
    }
    if (lifted && world.overGap(e.clientX, e.clientY)) place(d.i, 'pointer');
    else world.drop(d.i, now());
  }
  boardEl.addEventListener('pointerup', (e) => {
    if (S.drag) {
      endDrag(e, true);
      return;
    }
    const tap = S.tap;
    if (!tap || e.pointerId !== tap.id) return;      // another finger lifting leaves the first one's tap alone
    S.tap = null;
    if (S.screen !== 'play' || S.state !== 'pick') return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP) return;
    if (tap.out) tell(say.out());
    else if (tap.gap) {
      if (S.sel >= 0) place(S.sel, 'pointer');
      else tell(say.pickFirst());
    }
  });
  boardEl.addEventListener('pointercancel', (e) => {
    S.tap = null;
    endDrag(e, false);
  });
  boardEl.addEventListener('lostpointercapture', (e) => endDrag(e, false));
  // let go off the board when capture was refused: the drag ends as a drop rather than sticking
  window.addEventListener('pointerup', (e) => endDrag(e, false));
  window.addEventListener('pointercancel', (e) => endDrag(e, false));

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    if (!rig) return;
    // the helper watches the picked tile, or the gap while nothing is picked
    let yaw = 0;
    if (S.screen === 'play') {
      const v = world.lookYaw(S.sel);
      if (Number.isFinite(v)) yaw = clamp(v, -1.3, 1.3);
    }
    rig.look.yaw += (yaw - rig.look.yaw) * (1 - Math.exp(-8 * dt));
    rig.look.pitch = -0.1;
    let y = 0;
    let sy = null;
    let spin = 0;
    const cheer = hopCurve(t - S.cheerAt, calm() ? 0.25 : 0.7);
    if (cheer) {
      y = cheer.y;
      sy = cheer.sy;
      if (cheer.phase === 'air' && !calm() && (S.screen !== 'play' || S.state === 'done')) spin = cheer.p * TAU;
    }
    rig.root.position.y = y;
    rig.sy = sy;
    rig.turn.rotation.y = spin;
    rig.update(t, dt);
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
    S.now = t;                                       // the one clock this frame
    tick(t, dt);
    world.update(t, dt);
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

  // keep the board clear of the buttons along the top and the message strip along the bottom
  function fit() {
    const sr = stage.getBoundingClientRect();
    let top = 64;
    let bottom = 76;
    if (!hud.hidden) {
      const hr = hudTop.getBoundingClientRect();
      if (hr.height) top = Math.max(64, hr.bottom - sr.top + 8);
      const tr = tellEl.getBoundingClientRect();
      if (tr.height) bottom = Math.max(76, tr.height + 16);
    }
    world.resize({ top, bottom, left: 6, right: 6 });
    // on a wide stage the tray stands to the right, so the done card goes there and the whole board stays in view
    done.classList.toggle('wide', World.layout(sr.width / Math.max(sr.height, 1)) === 'wide');
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(hudTop);                              // the tries pill can wrap the row
  } else {
    window.addEventListener('resize', fit);
  }
  if (motion && motion.addEventListener) motion.addEventListener('change', () => world.calm(calm()));
  world.calm(calm());

  /* --------------------------------------------------------------- boot */
  pickCritter('frog', true);
  S.cheerAt = -9;
  background(0);
  fit();
  drawLevelButtons();
  const want = m ? +m[1] : 0;
  if (want >= 1 && want <= LEVELS.length) {
    startLevel(want - 1);
    // for the automated player only (with ?level=): where things are on screen, and the puzzle
    window.mtTest = {
      optionScreen: (i) => world.optionScreen(i),
      gapScreen: () => world.gapScreen(),
      tileScreen: (i) => world.tileScreen(i),
      puzzle: () => S.puzzle,
    };
  } else {
    showMenu();
  }
  start();
})();
