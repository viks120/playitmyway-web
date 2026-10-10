/* Laser Mirrors: the game itself.
 *
 * Pick a level, then turn the mirrors and splitters on yellow turntables so
 * the lasers' beams light every crystal at once. Beams are worked out again
 * the moment a piece turns, and every turn gets a short message. Undo, Reset
 * and a Hint (from a solver that has tried every setting) are always there.
 * Needs THREE, Toon, Sfx, Optics and World, loaded before it. Nothing is
 * stored: ticks for solved levels last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const say = Optics.say;
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
    index: 0,
    lv: null,
    sol: null,               // every solving setting, from Optics.solve
    mask: 0,                 // how the turnable pieces sit: bit i set means piece i is \
    tr: null,                // where the light goes for mask
    history: [],
    turns: 0,
    best: 0,
    solved: new Set(),       // this visit only
    cursor: 0,
    keyboard: false,         // show the cursor once the keyboard is used
    hover: -1,
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

  /* --------------------------------------------------------------- menu */
  const levelButtons = [];
  Optics.GROUPS.forEach((g) => {
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
      b.setAttribute('aria-label', `Level ${i + 1}${ok ? ', solved this visit' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    S.hover = -1;
    drawLevelButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    world.cursor(-1, false);
    world.hint(-1);
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- levels */
  // the bench labels are painted in Fredoka, so wait for it (briefly)
  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }
  function startLevel(i) {
    fonts().then(() => begin(i));
  }

  function load(i) {
    S.index = i;
    S.lv = Optics.parse(Optics.LEVELS[i]);
    S.sol = Optics.solve(S.lv);
    S.mask = S.lv.start;
    S.tr = Optics.trace(S.lv, S.mask);
    S.best = Optics.turnsLeft(S.sol, S.mask);
    S.history = [];
    S.turns = 0;
    S.cursor = 0;
    S.hover = -1;
    S.timers = [];
    world.build(S.lv);
    world.resetView();
    redraw(true);
    world.frame(0, true);
  }

  function begin(i) {
    load(i);
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${i + 1}`;
    drawCounts();
    tell(say.start(i + 1, S.lv));
    srFocus.textContent = '';
    boardEl.focus({ preventScroll: true });
    showCursor();
  }

  function redraw(now) {
    world.show(S.lv, S.mask, S.tr, Optics.segments(S.lv, S.tr), Optics.glints(S.lv, S.tr), now);
  }

  function drawCounts() {
    $('litCount').textContent = `${S.tr.lit}/${S.lv.crystals.length}`;
    $('moves').textContent = String(S.turns);
    $('movesWord').textContent = S.turns === 1 ? 'turn' : 'turns';
  }

  function showCursor() {
    const i = S.hover >= 0 ? S.hover : S.cursor;
    const show = S.screen === 'play' && (S.hover >= 0 || (S.keyboard && document.activeElement === boardEl));
    world.cursor(i, show);
  }

  /* -------------------------------------------------------------- turns */
  function turn(i) {
    if (S.screen !== 'play' || i < 0 || i >= S.lv.turn.length) return;
    const before = S.tr;
    S.history.push(S.mask);
    S.mask = Optics.flip(S.mask, i);
    S.tr = Optics.trace(S.lv, S.mask);
    S.turns++;
    S.cursor = i;
    world.hint(-1);
    redraw(false);
    drawCounts();
    showCursor();
    if (S.tr.solved) {
      finish();
      return;
    }
    const newlyLit = S.tr.state.some((s, k) => s === 'lit' && before.state[k] !== 'lit');
    const newlyWrong = S.tr.state.some((s, k) => s === 'wrong' && before.state[k] !== 'wrong');
    if (newlyLit) Sfx.play('good', 2 + S.tr.lit);
    else if (newlyWrong) Sfx.play('uhoh');
    else Sfx.play('pop');
    tell(`${say.turned(S.lv, i)} ${say.status(S.lv, S.tr)}`);
  }

  function undo() {
    if (S.screen !== 'play') return;
    if (!S.history.length) {
      tell(say.noUndo());
      return;
    }
    S.mask = S.history.pop();
    S.turns = Math.max(0, S.turns - 1);
    jumped(say.undo());
  }
  function reset() {
    if (S.screen !== 'play') return;
    S.history = [];
    S.mask = S.lv.start;
    S.turns = 0;
    jumped(say.reset());
  }
  function jumped(line) {
    S.tr = Optics.trace(S.lv, S.mask);
    world.hint(-1);
    redraw(false);
    drawCounts();
    Sfx.play('poof');
    tell(`${line} ${say.status(S.lv, S.tr)}`);
  }
  function hint() {
    if (S.screen !== 'play') return;
    const i = Optics.hint(S.lv, S.sol, S.mask);
    if (i < 0) return;
    S.cursor = i;
    world.hint(i);
    showCursor();
    Sfx.play('voice', 1.2);
    tell(say.hint(S.lv, i));
  }

  function finish() {
    S.screen = 'done';
    S.solved.add(S.index);
    S.hover = -1;
    world.cursor(-1, false);
    Sfx.play('win');
    world.celebrate();
    const line = say.done(S.index + 1, S.turns, S.best);
    tell(line);
    later(1.3, () => {
      $('doneTitle').textContent = `Level ${S.index + 1} solved!`;
      $('doneSub').textContent = line;
      $('nextLevel').hidden = S.index >= Optics.LEVELS.length - 1;
      done.hidden = false;
      ($('nextLevel').hidden ? $('allLevels') : $('nextLevel')).focus({ preventScroll: true });
    });
  }
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => startLevel(S.index));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  $('undoBtn').addEventListener('click', () => { undo(); boardEl.focus({ preventScroll: true }); });
  $('resetBtn').addEventListener('click', () => { reset(); boardEl.focus({ preventScroll: true }); });
  $('hintBtn').addEventListener('click', () => { hint(); boardEl.focus({ preventScroll: true }); });

  /* ----------------------------------------------------------- keyboard */
  // Left and right step through the turnable pieces in reading order (so
  // every one can be reached); up and down jump to the nearest piece in
  // another row.
  function moveCursor(dir) {
    const lv = S.lv;
    const n = lv.turn.length;
    if (!n) return;
    const at = lv.cells[lv.turn[S.cursor]];
    let next = S.cursor;
    if (dir === 'right') next = (S.cursor + 1) % n;
    else if (dir === 'left') next = (S.cursor + n - 1) % n;
    else {
      const sign = dir === 'down' ? 1 : -1;
      let best = Infinity;
      lv.turn.forEach((c, i) => {
        const p = lv.cells[c];
        const dy = (p.y - at.y) * sign;
        if (dy <= 0) return;
        const score = dy * 10 + Math.abs(p.x - at.x) * 3;
        if (score < best) {
          best = score;
          next = i;
        }
      });
    }
    S.cursor = next;
    showCursor();
    srFocus.textContent = say.piece(lv, next, S.mask, S.tr);
  }

  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (ARROWS[k]) {
      e.preventDefault();
      S.keyboard = true;
      S.hover = -1;
      if (document.activeElement !== boardEl) boardEl.focus({ preventScroll: true });
      moveCursor(ARROWS[k]);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      S.keyboard = true;
      turn(S.cursor);
    } else if (k === 'z' || k === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (k === 'r') {
      e.preventDefault();
      reset();
    } else if (k === 'h') {
      e.preventDefault();
      S.keyboard = true;
      hint();
    }
  });
  boardEl.addEventListener('focus', showCursor);
  boardEl.addEventListener('blur', showCursor);

  /* ------------------------------------------------------------ pointer */
  // a tap turns the piece under it (or says what a fixed piece is); a drag
  // swings the camera round a little
  let down = null;
  boardEl.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false, id: e.pointerId };
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* not every browser */ }
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (down && down.id === e.pointerId) {
      if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.drag = true;
      if (down.drag) {
        world.orbit(-(e.clientX - down.lx) * 0.005, (e.clientY - down.ly) * 0.003);
        down.lx = e.clientX;
        down.ly = e.clientY;
      }
      return;
    }
    if (e.pointerType !== 'mouse' || S.screen !== 'play') return;
    const p = world.pick(e.clientX, e.clientY);
    const h = p && p.turn != null ? p.turn : -1;
    if (h !== S.hover) {
      S.hover = h;
      boardEl.style.cursor = h >= 0 ? 'pointer' : 'grab';
      showCursor();
    }
  });
  boardEl.addEventListener('pointerleave', () => {
    if (S.hover >= 0) {
      S.hover = -1;
      showCursor();
    }
  });
  function release(e) {
    if (!down || down.id !== e.pointerId) return;
    const wasDrag = down.drag;
    down = null;
    if (wasDrag || S.screen !== 'play' || e.type === 'pointercancel') return;
    const p = world.pick(e.clientX, e.clientY);
    if (!p) return;
    if (p.turn != null) {
      if (e.pointerType !== 'mouse') S.keyboard = false;
      turn(p.turn);
    } else {
      const line = say.look(S.lv, p.cell, S.tr);
      if (line) tell(line);
    }
  }
  boardEl.addEventListener('pointerup', release);
  boardEl.addEventListener('pointercancel', release);

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    world.setCalm(calm());
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

  // keep the bench clear of the buttons in the corners and the message strip
  function fit() {
    world.resize();
    const narrow = stage.clientWidth < 560;
    world.setMargins({ top: 12, bottom: narrow ? 96 : 72, side: narrow ? 6 : 16, hudW: 290, hudH: 108 });
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();
  world.setCalm(calm());
  drawLevelButtons();
  // a level in the background behind the menu
  fonts().then(() => {
    if (S.screen === 'menu' && !S.lv) {
      load(Math.min(20, Optics.LEVELS.length - 1));
      S.mask = S.sol.solutions[0];
      S.tr = Optics.trace(S.lv, S.mask);
      redraw(true);
    }
  });
  start();
})();
