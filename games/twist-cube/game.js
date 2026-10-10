/* Twist Cube: the game itself.
 *
 * Pick a challenge, watch the cube get scrambled by a few twists, then undo
 * them with the face letters (U D L R F B, and ′ for anticlockwise), ideally
 * in as many twists as the scramble took: that is par. After that comes
 * free play on a full scramble of each size. Undo, Reset, a Hint (the
 * scramble is known, so it can point back along it), the scramble itself on
 * request, and turning the whole cube by dragging or with the arrow keys.
 * Needs THREE, Toon, Sfx, CubeLogic and World, loaded before it. Nothing is
 * stored: ticks for solved levels last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const C = CubeLogic;
  const say = C.say;
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const tellEl = $('tell');
  const padEl = $('pad');
  const infoEl = $('info');
  const scrambleEl = $('scramble');

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
    screen: 'menu',          // menu, watch (the scramble plays), play, solving, done
    index: 0,
    level: null,
    moves: [],               // the scramble, in the cube's own frame
    guide: null,
    start: null,
    state: null,
    history: [],             // { state, move } before each of the player's twists
    count: 0,
    view: 0,                 // how the player holds the cube: one of CubeLogic's 24
    hints: 0,
    peeked: false,
    hintMove: null,          // the twist the hint arrow shows, in the cube's own frame
    hintLeft: 0,
    showScramble: false,
    solved: new Set(),       // this visit only
    shapes: false,
    timers: [],
  };

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
  const focusBoard = () => boardEl.focus({ preventScroll: true });

  /* --------------------------------------------------------------- menu */
  const levelButtons = [];
  C.GROUPS.forEach((g) => {
    const sec = document.createElement('section');
    sec.className = 'level-group';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const row = document.createElement('div');
    row.className = 'level-row' + (g.to - g.from < 4 ? ' wide' : '');
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
      const lv = C.LEVELS[i];
      const ok = S.solved.has(i);
      const big = lv.free ? say.size(lv.n) : String(lv.par);
      const small = lv.free ? 'full scramble' : lv.par === 1 ? 'twist' : 'twists';
      b.innerHTML = `<span class="lv-big" aria-hidden="true">${big}</span><span class="lv-small" aria-hidden="true">${small}</span>${ok ? '<span class="tick" aria-hidden="true">✓</span>' : ''}`;
      const name = lv.free ? `${say.size(lv.n)} full scramble` : `${say.size(lv.n)}, undo ${say.moves(lv.par)}`;
      b.setAttribute('aria-label', `${name}${ok ? ', solved this visit' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    world.settle();
    world.hint(null);
    world.idle(!calm());
    drawLevelButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    refit();
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  const shapesBtn = $('shapesBtn');
  shapesBtn.addEventListener('click', () => {
    S.shapes = !S.shapes;
    shapesBtn.setAttribute('aria-pressed', String(S.shapes));
    shapesBtn.textContent = `Shapes on stickers: ${S.shapes ? 'on' : 'off'}`;
    world.symbols(S.shapes);
  });

  /* ------------------------------------------------------------- levels */
  function startLevel(i) {
    const lv = C.LEVELS[i];
    S.index = i;
    S.level = lv;
    S.moves = lv.free ? C.scramble(lv.n, lv.length) : lv.moves.slice();
    S.guide = C.guide(lv.n, S.moves);
    S.start = S.guide.start;
    S.state = C.solved(lv.n);
    S.history = [];
    S.count = 0;
    S.view = 0;
    S.hints = 0;
    S.peeked = false;
    S.showScramble = false;            // the scramble is shown on request, fresh each level
    S.hintMove = null;
    S.timers = [];
    world.idle(false);
    world.restIdle();
    world.build(lv.n, S.state);
    world.symbols(S.shapes);
    world.setView(0, true);
    S.screen = 'watch';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = say.size(lv.n);
    $('parText').hidden = lv.free;
    $('par').textContent = lv.free ? '' : String(lv.par);
    drawInfo();
    drawDots();
    drawScramble();
    tell(lv.free ? say.mixing(S.moves.length) : say.watch(S.moves.length));
    refit();
    world.snapCamera();
    focusBoard();
    // a moment to see it solved, then the scramble plays out a twist at a time.
    // With reduced motion each twist is quick but held, so it can still be
    // followed, and free play skips the flurry and just shows the scramble.
    const k = S.moves.length;
    const still = calm();
    const dur = still ? 0.16 : lv.free ? 0.075 : k <= 3 ? 0.5 : k <= 6 ? 0.38 : 0.3;
    const hold = lv.free ? 0 : still ? 0.3 : 0.2;
    later(still ? 0.4 : 0.7, () => {
      if (still && lv.free) {
        world.settle(S.start);
        return;
      }
      let s = S.state;
      for (const m of S.moves) {
        s = C.twist(s, m);
        world.twist(m, s, dur, hold);
      }
    });
  }

  // the scramble has played (or the player skipped it): over to them
  function beginPlay() {
    S.timers = [];
    world.settle(S.start);
    S.state = S.start;
    S.screen = 'play';
    tell(say.go(S.level));
    drawScramble();
  }
  const ready = () => {
    if (S.screen === 'watch') beginPlay();
    return S.screen === 'play';
  };

  function drawInfo() {
    $('moves').textContent = String(S.count);
    $('movesWord').textContent = S.count === 1 ? 'twist' : 'twists';
  }

  // on a 3×3×3 the middle stickers never move, so each button can show the colour of the face it turns
  function drawDots() {
    const show = S.level && S.level.n === 3;
    padEl.querySelectorAll('.tw').forEach((b) => {
      const dot = b.querySelector('.dot');
      dot.hidden = !show;
      if (show) dot.style.background = World.COLOURS[C.FACES.indexOf(C.toCube(S.view, b.dataset.move)[0])];
    });
  }

  function drawScramble() {
    const open = S.showScramble && S.screen !== 'menu';
    scrambleEl.hidden = !open;
    $('scrambleBtn').setAttribute('aria-pressed', String(open));
    if (!open || !S.guide) return;
    if (S.screen === 'play') S.peeked = true;
    const seen = S.moves.map((m) => C.toView(S.view, m));
    const k = seen.length;
    const w = C.where(S.guide, S.state, S.history.map((h) => h.state));
    const undone = S.screen === 'watch' ? 0 : w.on ? k - w.left : 0;
    const chips = (moves, ticks) => moves.map((m, i) => `<span class="mv${i < ticks ? ' did' : ''}">${C.label(m)}</span>`).join(' ');
    $('scrambleMoves').innerHTML = chips(seen, 0);
    $('undoMoves').innerHTML = chips(C.invert(seen), undone);
    $('pathStatus').textContent = S.screen === 'watch' ? '' : say.status(w, k);
    refit();
  }
  function toggleScramble() {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    S.showScramble = !S.showScramble;
    drawScramble();
    refit();
  }

  /* ------------------------------------------------------------- twists */
  // quicker when twists pile up, so fast fingers never wait
  const twistTime = () => (calm() ? 0.12 : 0.26) / (1 + 0.7 * world.queued());

  // `v` is a twist as the player names it: the letters go with their view
  function twist(v) {
    if (!ready()) return;
    const m = C.toCube(S.view, v);
    S.history.push({ state: S.state, move: m });
    S.state = C.twist(S.state, m);
    S.count++;
    clearHint();
    world.twist(m, S.state, twistTime(), 0);
    Sfx.play('pop');
    tell(say.twist(v));
    drawInfo();
    drawScramble();
    if (C.isSolved(S.state)) S.screen = 'solving';   // finish once the last twist lands
  }

  function undo() {
    if (!ready()) return;
    const h = S.history.pop();
    if (!h) {
      tell(say.noUndo());
      return;
    }
    S.state = h.state;
    S.count--;
    clearHint();
    world.twist(C.inverse(h.move), S.state, twistTime(), 0);
    Sfx.play('hop');
    tell(say.undo(C.toView(S.view, h.move)));
    drawInfo();
    drawScramble();
  }

  function reset() {
    if (!ready()) return;
    S.history = [];
    S.count = 0;
    S.state = S.start;
    world.settle(S.start);
    clearHint();
    world.burst('puff', 0);
    Sfx.play('poof');
    tell(say.reset());
    drawInfo();
    drawScramble();
  }

  function hint() {
    if (!ready()) return;
    const w = C.where(S.guide, S.state, S.history.map((h) => h.state));
    if (w.solved) return;
    S.hints++;
    if (w.on) {
      S.hintMove = w.next;
      S.hintLeft = w.left;
      world.hint(w.next);
      tell(say.hint(C.toView(S.view, w.next), w.left));
      Sfx.play('good', 4);
    } else {
      clearHint();
      tell(w.back ? say.stray(w.back) : say.lost());
      Sfx.play('uhoh');
    }
  }
  function clearHint() {
    S.hintMove = null;
    world.hint(null);
  }
  // hovering or focusing a twist button shows which way it would go
  function preview(v) {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    world.hint(v ? C.toCube(S.view, v) : S.hintMove);
  }

  /* --------------------------------------------- turning the whole cube */
  const ARROWS = { ArrowLeft: 'y', ArrowRight: "y'", ArrowUp: 'x', ArrowDown: "x'" };
  function turn(t) {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    S.view = C.turnView(S.view, t);
    world.setView(S.view);
    Sfx.play('hop');
    turned();
  }
  function home() {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    S.view = 0;
    world.setView(0);
    if (S.screen === 'play') tell(say.home());
    drawDots();
    drawScramble();
  }
  function turned() {
    if (S.screen === 'play') {
      // the hint keeps pointing at the same layer, so name it for the new view
      tell(S.hintMove ? say.hint(C.toView(S.view, S.hintMove), S.hintLeft) : say.turn());
    }
    drawDots();
    drawScramble();
  }

  /* ----------------------------------------------------------- finishing */
  function finish() {
    S.screen = 'done';
    S.solved.add(S.index);
    S.timers = [];
    const lv = S.level;
    world.burst('sparkle');
    if (!calm()) {
      world.celebrate();
      world.burst('confetti');
    }
    Sfx.play('win');
    const line = say.solved(lv, S.count);
    tell(line);
    // the scramble, shown afterwards in the letters of the player's own view, as they typed them
    const seen = S.moves.map((m) => C.toView(S.view, m));
    later(1.3, () => {
      $('doneTitle').textContent = !lv.free && S.count <= lv.par ? 'Solved at par!' : 'Solved!';
      $('doneSub').textContent = line;
      $('doneHelp').textContent = say.help(S.hints, S.peeked);
      $('doneScramble').textContent = say.scramble(seen);
      $('doneWay').textContent = say.way(seen);
      $('nextLevel').hidden = S.index >= C.LEVELS.length - 1;
      $('again').textContent = lv.free ? 'New scramble' : 'Play it again';
      done.hidden = false;
      ($('nextLevel').hidden ? $('again') : $('nextLevel')).focus({ preventScroll: true });
    });
  }
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => startLevel(S.index));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  const tool = (id, fn) => $(id).addEventListener('click', () => { fn(); focusBoard(); });
  tool('undoBtn', undo);
  tool('resetBtn', reset);
  tool('hintBtn', hint);
  tool('homeBtn', home);
  $('scrambleBtn').addEventListener('click', toggleScramble);

  padEl.querySelectorAll('.tw').forEach((b) => {
    b.addEventListener('click', () => twist(b.dataset.move));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') preview(b.dataset.move); });
    b.addEventListener('pointerleave', () => preview(null));
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) preview(b.dataset.move); });
    b.addEventListener('blur', () => preview(null));
  });

  /* -------------------------------------------------------------- input */
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if ('udlrfb'.includes(k) && k.length === 1) {
      e.preventDefault();
      twist(k.toUpperCase() + (e.shiftKey ? "'" : ''));
    } else if (ARROWS[k]) {
      e.preventDefault();
      turn(ARROWS[k]);
    } else if (k === 'z' || k === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (k === '0') {
      e.preventDefault();
      reset();
    } else if (k === 'h') {
      e.preventDefault();
      hint();
    } else if (k === 's') {
      e.preventDefault();
      toggleScramble();
    } else if (k === 'v' || k === 'Home') {
      e.preventDefault();
      home();
    }
  });

  // drag to turn the whole cube; let go and it settles square to the nearest way of holding it
  let drag = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play' && S.screen !== 'watch') return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4) world.drag(dx, dy);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    const v = moved > 4 ? world.nearestView() : S.view;
    world.setView(v);
    if (v !== S.view) {
      S.view = v;
      Sfx.play('hop');
      turned();
    }
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  /* ------------------------------------------------ fitting the cube in */
  // the cube fills the part of the stage that the buttons and messages leave clear
  function refit() {
    const st = stage.getBoundingClientRect();
    if (!st.width || !st.height) return;
    const rel = (el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top - st.top, bottom: b.bottom - st.top, left: b.left - st.left, right: b.right - st.left, w: b.width, h: b.height };
    };
    let top = 8;
    let bottom = st.height - 8;
    let left = 8;
    let right = st.width - 8;
    if (!hud.hidden) {
      top = rel(infoEl).bottom + 6;
      if (!scrambleEl.hidden) top = Math.max(top, rel(scrambleEl).bottom + 6);
      const p = rel(padEl);
      // room kept for a two-line message strip, so the cube doesn't jump as messages change
      const strip = parseFloat(getComputedStyle(tellEl).bottom) || 10;
      if (p.w > p.h) bottom = Math.min(p.top, st.height - strip) - 62;
      else {
        right = p.left - 8;
        bottom = st.height - strip - 62;
      }
    }
    world.frame({ x: left, y: top, w: Math.max(80, right - left), h: Math.max(80, bottom - top) });
  }

  /* ------------------------------------------------------- every frame */
  function tick() {
    runTimers();
    if (S.screen === 'watch' && !world.busy() && !S.timers.length) beginPlay();
    if (S.screen === 'solving' && !world.busy()) finish();
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
    tick();
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

  // the face badges are painted in Fredoka, so wait for it (briefly)
  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  function fit() {
    world.resize();
    refit();
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  world.quick(calm());
  if (motion && motion.addEventListener) motion.addEventListener('change', () => world.quick(calm()));
  // a solved cube turning slowly behind the menu
  world.build(3, C.solved(3));
  world.setView(0, true);
  fit();
  world.snapCamera();
  fonts().then(() => world.labels());
  drawLevelButtons();
  world.idle(!calm());
  start();
})();
