/* Log Jam: the game itself.
 *
 * Pick a level, then slide the logs, each along its own line only, to clear
 * a way for the boat to the gap in the right-hand bank. Drag a log with a
 * finger or the mouse, or pick one with Tab or the arrow keys and slide it
 * with the arrow keys along its line. A move is one log sliding any distance
 * one way, and each level knows its fewest moves. Undo, Restart and a Hint
 * (from a real solver) are always there. Needs THREE, Toon, Critters, Sfx,
 * LogJam and World, loaded before it. Nothing is stored: ticks last only
 * this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = ['frog', 'bunny', 'kitten', 'dino'].filter((k) => KINDS[k]);
  const hopCurve = Critters.hopCurve;
  const say = LogJam.say;
  const SIGN = { left: -1, right: 1, up: -1, down: 1 };
  const SIZE = LogJam.SIZE;
  const time = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const SEAT_YAW = 0.62;                 // the skipper sits facing between the bow and you

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const hudTop = $('hudTop');
  const done = $('done');
  const tellEl = $('tell');
  const srEl = $('srFocus');

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
    screen: 'menu',          // menu, play, sail, done
    kind: 'frog',
    index: 0,
    state: null,
    history: [],             // { state, piece }: where things were before each move, and what moved
    best: 0,
    sel: 0,                  // the piece picked for the keyboard
    hint: null,
    drag: null,
    tap: null,
    busyUntil: 0,
    queue: [],
    clear: false,            // the boat's way out was clear after the last move
    results: new Map(),      // level -> fewest moves this visit
    cheerAt: -9,
    timers: [],
  };
  let rig = null;
  const moves = () => S.history.length;

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
  function srSay(text) {
    srEl.textContent = text;
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
  LogJam.GROUPS.forEach((g) => {
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
      const ok = got != null;
      const star = ok && got <= LogJam.LEVELS[i].best;
      b.innerHTML = `<span aria-hidden="true">${i + 1}</span>${ok ? `<span class="tick${star ? ' star' : ''}" aria-hidden="true">${star ? '★' : '✓'}</span>` : ''}`;
      b.setAttribute('aria-label', `Level ${i + 1}, fewest ${LogJam.LEVELS[i].best} moves${ok ? (star ? ', done this visit in the fewest moves' : ', done this visit') : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function seatCritter() {
    if (!rig) return;
    const seat = world.seat();
    seat.add(rig.root);
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
    rig.root.scale.setScalar(0.3);
    rig.turn.rotation.y = SEAT_YAW;
    seatCritter();
    S.cheerAt = time();
    if (!quiet) Sfx.play('voice', KINDS[kind].voice);
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    S.queue = [];
    S.drag = null;
    drawLevelButtons();
    // the level just played (or level 1) waits behind the menu
    background(S.state ? S.index : 0);
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    const next = levelButtons.find((b, i) => !S.results.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  function background(i) {
    // the skipper steps off before the old boat is cleared away
    if (rig && rig.root.parent) rig.root.parent.remove(rig.root);
    S.index = i;
    S.state = LogJam.parse(LogJam.LEVELS[i].rows);
    S.history = [];
    S.hint = null;
    world.build(S.state, 1000 + i * 37);
    seatCritter();
    world.select(-1);
    world.hint(null);
  }

  /* ------------------------------------------------------------- levels */
  function startLevel(i) {
    background(i);
    S.best = LogJam.LEVELS[i].best;
    S.queue = [];
    S.timers = [];
    S.busyUntil = 0;
    S.drag = null;
    S.clear = LogJam.clearWay(S.state);
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${i + 1}`;
    $('best').textContent = String(S.best);
    drawMoves();
    fit();
    select(0, false);
    tell(say.start(i + 1, S.best));
    srSay('');
    boardEl.focus({ preventScroll: true });
  }

  function drawMoves() {
    $('moves').textContent = String(moves());
  }

  // which ways piece i can slide just now: [back, forward]
  function ways(i) {
    const r = LogJam.room(S.state, i);
    return [r.back > 0, r.fwd > 0];
  }
  function select(i, announce) {
    S.sel = i;
    world.select(i, ways(i));
    if (announce) srSay(say.picked(S.state, i));
  }

  /* -------------------------------------------------------------- moves */
  /* Make a move. Sliding the same log again straight after counts as the
   * same move (it is still one log, one slide from where it started), and
   * sliding it back where it began takes the move away again. */
  function commit(piece, next) {
    const top = S.history[S.history.length - 1];
    if (top && top.piece === piece) {
      if (top.state.pos[piece] === next.pos[piece]) S.history.pop();
    } else {
      S.history.push({ state: S.state, piece });
    }
    S.state = next;
    S.hint = null;
    world.hint(null);
    drawMoves();
    world.select(S.sel, ways(S.sel));
  }

  // after a slide: a knock of ice chips if it stopped against something, then the win or the clear way
  function afterMove(i, dir, dur) {
    const r = LogJam.room(S.state, i);
    const stopped = SIGN[dir] < 0 ? r.back === 0 : r.fwd === 0;
    const freed = LogJam.solved(S.state);
    if (freed) S.screen = 'sail';
    later(dur, () => {
      if (freed) {
        escape();
        return;
      }
      if (stopped) {
        world.burst(world.endPoint(i, SIGN[dir]), 'chips');
        Sfx.play('pop');
      }
      const clear = LogJam.clearWay(S.state);
      if (clear && !S.clear) {
        tell(say.clear());
        Sfx.play('good', 5);
      }
      S.clear = clear;
      const q = S.queue.shift();
      if (q) step(q.dir, q.repeat);
    });
  }

  function slideBy(i, dir, dist, how) {
    const t = time();
    const next = LogJam.slide(S.state, i, dir, dist);
    if (!next) return false;
    commit(i, next);
    const dur = world.place(S.state.pos, false, t);
    S.busyUntil = t + dur;
    if (how !== 'step' || !S.repeating) Sfx.play('hop');
    srSay(say.moved(S.state, i));
    afterMove(i, dir, dur);
    return true;
  }

  function blocked(i, dir) {
    world.bump(i, SIGN[dir], time());
    Sfx.play('pop');
    if (i === 0 && rig) rig.react('shake');
    tell(say.blocked(S.state, i, dir));
  }

  // the nearest piece in a direction from piece i's middle, or -1
  function centreOf(j) {
    const p = S.state.pieces[j];
    const mid = S.state.pos[j] + p.len / 2;
    return p.across ? { x: mid, y: p.line + 0.5 } : { x: p.line + 0.5, y: mid };
  }
  function neighbour(i, dir) {
    const c = centreOf(i);
    let best = -1;
    let score = Infinity;
    for (let j = 0; j < S.state.pieces.length; j++) {
      if (j === i) continue;
      const o = centreOf(j);
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const ahead = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const aside = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (ahead < 0.25) continue;
      const k = ahead + aside * 2.2;
      if (k < score) {
        score = k;
        best = j;
      }
    }
    return best;
  }

  /* An arrow key: along the picked piece's line it slides it one square;
   * across its line it picks the nearest piece that way. */
  function step(dir, repeat) {
    if (S.screen !== 'play' || S.drag) return;
    const p = S.state.pieces[S.sel];
    const alongLine = (dir === 'left' || dir === 'right') === p.across;
    if (!alongLine) {
      if (repeat) return;
      const j = neighbour(S.sel, dir);
      if (j < 0) srSay(say.none(dir));
      else select(j, true);
      return;
    }
    if (time() < S.busyUntil) {
      if (S.queue.length < 1) S.queue.push({ dir, repeat });
      return;
    }
    S.repeating = repeat;
    if (!slideBy(S.sel, dir, 1, 'step') && !repeat) blocked(S.sel, dir);
  }

  function undo() {
    if (S.screen !== 'play' || S.drag) return;
    if (!S.history.length) {
      tell(say.nothing());
      return;
    }
    const top = S.history.pop();
    S.state = top.state;
    settle();
    select(top.piece, false);
    Sfx.play('poof');
    tell(say.undo());
  }
  function restart() {
    if (S.screen !== 'play' || S.drag) return;
    S.history = [];
    S.state = LogJam.parse(LogJam.LEVELS[S.index].rows);
    settle();
    select(0, false);
    Sfx.play('poof');
    tell(say.restart());
  }
  // everything slides back to where the state says
  function settle() {
    S.queue = [];
    S.timers = [];
    S.busyUntil = 0;
    S.hint = null;
    world.hint(null);
    world.place(S.state.pos, false, time());
    S.clear = LogJam.clearWay(S.state);
    drawMoves();
  }
  function hint() {
    if (S.screen !== 'play' || S.drag) return;
    const sol = LogJam.solve(S.state);
    if (!sol || !sol.path.length) return;
    const m = sol.path[0];
    S.hint = m;
    select(m.piece, false);
    world.hint(m);
    Sfx.play('good', 2);
    tell(say.hint(S.state, m));
  }

  /* -------------------------------------------------- the boat is free */
  function escape() {
    const t = time();
    S.screen = 'sail';
    S.queue = [];
    const prev = S.results.get(S.index);
    S.results.set(S.index, prev == null ? moves() : Math.min(prev, moves()));
    world.sail(t);
    world.select(-1);
    Sfx.play('hop');
    const line = say.done(S.index + 1, moves(), S.best);
    tell(line);
    S.cheerAt = t + 0.75;
    later(2.0, () => {
      S.screen = 'done';
      const perfect = moves() <= S.best;
      $('doneTitle').textContent = perfect ? 'Perfect run! ★' : 'The boat is free!';
      $('doneSub').textContent = line;
      $('nextLevel').hidden = S.index >= LogJam.LEVELS.length - 1;
      done.hidden = false;
      ($('nextLevel').hidden ? $('again') : $('nextLevel')).focus({ preventScroll: true });
    });
  }
  world.onSplash((at) => {
    Sfx.play('splash');
    later(0.3, () => Sfx.play('win'));
    later(0.5, () => Sfx.play('voice', KINDS[S.kind].voice));
    world.burst(new THREE.Vector3(at.x, 0.9, at.z), 'sparkle');
    if (!calm()) world.burst(new THREE.Vector3(0, 3.2, -0.5), 'confetti');
  });

  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => startLevel(S.index));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);
  $('undoBtn').addEventListener('click', () => { undo(); boardEl.focus({ preventScroll: true }); });
  $('restartBtn').addEventListener('click', () => { restart(); boardEl.focus({ preventScroll: true }); });
  $('hintBtn').addEventListener('click', () => { hint(); boardEl.focus({ preventScroll: true }); });

  /* -------------------------------------------------------------- input */
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play') return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYS[k]) {
      e.preventDefault();
      step(KEYS[k], e.repeat);
    } else if (k === 'Tab' && e.target === boardEl) {
      // Tab and Shift+Tab pick the next or previous piece; past the last one, focus moves on as usual
      const j = S.sel + (e.shiftKey ? -1 : 1);
      if (j < 0 || j >= S.state.pieces.length || S.drag) return;
      e.preventDefault();
      select(j, true);
    } else if ((k === 'Enter' || k === ' ') && e.target === boardEl) {
      e.preventDefault();
      srSay(say.picked(S.state, S.sel));
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

  // drag a log along its line; a tap picks a log, or slides the picked one to an open square in its line
  boardEl.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play' || S.drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const i = world.pieceAt(e.clientX, e.clientY);
    const grab = world.dragPoint(e.clientX, e.clientY);
    if (i < 0 || !grab) {
      S.tap = { x: e.clientX, y: e.clientY };
      return;
    }
    e.preventDefault();
    const r = LogJam.room(S.state, i);
    const at = S.state.pos[i];
    S.drag = { i, id: e.pointerId, x: e.clientX, y: e.clientY, grab, at, min: at - r.back, max: at + r.fwd, v: at, moved: false };
    S.queue = [];
    if (S.sel !== i) select(i, true);
    try {
      boardEl.setPointerCapture(e.pointerId);
    } catch (err) {
      // the drag still works without capture while the pointer stays on the board
    }
  });
  boardEl.addEventListener('pointermove', (e) => {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    const p = world.dragPoint(e.clientX, e.clientY);
    if (!p) return;
    const piece = S.state.pieces[d.i];
    d.v = clamp(d.at + (piece.across ? p.x - d.grab.x : p.z - d.grab.z), d.min, d.max);
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) d.moved = true;
    world.drag(d.i, d.v);
  });
  function endDrag(e) {
    const d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    S.drag = null;
    const target = Math.round(d.v);
    if (target !== d.at) {
      const p = S.state.pieces[d.i];
      const dir = target < d.at ? (p.across ? 'left' : 'up') : (p.across ? 'right' : 'down');
      S.repeating = false;
      if (slideBy(d.i, dir, Math.abs(target - d.at), 'drag')) return;
    }
    world.place(S.state.pos, false, time());           // back into its square
  }
  function tapAt(e) {
    const tap = S.tap;
    S.tap = null;
    if (!tap || S.screen !== 'play' || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 14) return;
    const c = world.cellAt(e.clientX, e.clientY);
    if (!c) return;
    const there = LogJam.grid(S.state)[c.y * SIZE + c.x];
    if (there >= 0) {
      select(there, true);
      return;
    }
    const i = S.sel;
    const p = S.state.pieces[i];
    const at = S.state.pos[i];
    const v = p.across ? c.x : c.y;
    if ((p.across ? c.y : c.x) !== p.line) {
      tell(say.tapLine());
      return;
    }
    const back = v < at;
    const dir = back ? (p.across ? 'left' : 'up') : (p.across ? 'right' : 'down');
    const r = LogJam.room(S.state, i);
    const go = Math.min(back ? at - v : v - (at + p.len - 1), back ? r.back : r.fwd);
    if (go <= 0) {
      blocked(i, dir);
      return;
    }
    S.repeating = false;
    slideBy(i, dir, go, 'tap');
  }
  boardEl.addEventListener('pointerup', (e) => {
    if (S.drag) endDrag(e);
    else tapAt(e);
  });
  boardEl.addEventListener('pointercancel', (e) => {
    S.tap = null;
    endDrag(e);
  });
  boardEl.addEventListener('lostpointercapture', (e) => endDrag(e));

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    if (!rig) return;
    // the skipper keeps an eye on whichever log is picked
    let yaw = 0;
    if (S.screen === 'play' && S.sel > 0) {
      const a = world.piecePos(S.sel);
      const b = world.piecePos(0);
      let d = Math.atan2(a.x - b.x, a.z - b.z) - SEAT_YAW;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      yaw = clamp(d, -1.3, 1.3);
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
      if (cheer.phase === 'air' && !calm() && S.screen !== 'play') spin = cheer.p * TAU;
    }
    rig.root.position.y = y;
    rig.sy = sy;
    rig.turn.rotation.y = SEAT_YAW + spin;
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

  // keep the board clear of the buttons along the top and the message strip along the bottom
  function fit() {
    const sr = stage.getBoundingClientRect();
    let top = sr.width < 560 ? 104 : 66;
    if (!hud.hidden) {
      const hr = hudTop.getBoundingClientRect();
      if (hr.height) top = hr.bottom - sr.top + 8;
    }
    world.resize({ top, bottom: sr.width < 560 ? 76 : 62, left: 6, right: 6 });
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  if (motion && motion.addEventListener) motion.addEventListener('change', () => world.calm(calm()));
  world.calm(calm());

  background(0);
  pickCritter('frog', true);
  S.cheerAt = -9;
  fit();
  drawLevelButtons();
  start();
})();
