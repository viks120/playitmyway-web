/* Plans & Elevations: the game itself.
 *
 * Pick a level, read its three drawings (plan, front elevation, side
 * elevation) and build a shape from cubes that matches all three. Every
 * view gets a live tick or cross; Compare marks the differences, Hint names
 * one, Undo and Clear are always there. Some levels give stars for the
 * fewest or the most cubes, and the last group must use the fewest. The
 * quick quiz shows a model and asks which drawing is which view. Needs
 * THREE, Toon, Sfx, Views, Drawings and World, loaded before it. Nothing is
 * stored: ticks and stars last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const say = Views.say;
  const KINDS = ['plan', 'front', 'side'];
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const tall = window.matchMedia ? window.matchMedia('(max-aspect-ratio: 1/1)') : null;
  const cubesWord = (n) => `${n} ${n === 1 ? 'cube' : 'cubes'}`;
  const LONG_PRESS = 0.45;
  const DRAG_START = 9;                  // pixels a press may wander before it turns the view instead

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const cardsEl = $('cards');
  const choicesEl = $('choices');
  const toolsEl = hud.querySelector('.tools');
  const ctrlsEl = $('ctrls');

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

  // ?seed=N makes the quiz repeatable (the end-to-end test uses it)
  const seedParam = Number(new URLSearchParams(location.search).get('seed'));
  let quizSeed = seedParam > 0 ? seedParam : 1 + Math.floor(Math.random() * 1e6);

  /* ------------------------------------------------------------ state */
  const S = {
    screen: 'menu',          // menu, play, done, quiz
    mode: 'build',           // build or quiz
    index: 0,
    lv: null,
    h: [],
    history: [],
    tool: 'add',
    compare: false,
    cursor: { x: 0, z: 0 },
    cursorOn: false,
    quietCursor: false,      // a square hint is showing: no ghost cube at the cursor for now
    hintStep: 0,
    hintFor: '',
    won: false,              // this attempt at the level has been solved
    fewestNoted: false,
    solved: new Set(),       // this visit only
    stars: new Map(),        // level index -> { fewest, most }, this visit only
    timers: [],
    quiz: null,
  };

  function later(delay, fn) {
    const job = { at: time() + delay, fn };
    S.timers.push(job);
    return job;
  }
  function cancel(job) {
    S.timers = S.timers.filter((x) => x !== job);
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
  function note(text) {
    srFocus.textContent = text;
  }

  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  /* --------------------------------------------------------------- menu */
  const levelButtons = [];
  Views.GROUPS.forEach((g) => {
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
      const st = S.stars.get(i) || {};
      const n = (st.fewest ? 1 : 0) + (st.most ? 1 : 0);
      b.innerHTML = `<span aria-hidden="true">${i + 1}</span>${ok ? '<span class="tick" aria-hidden="true">✓</span>' : ''}${n ? `<span class="stars" aria-hidden="true">${'★'.repeat(n)}</span>` : ''}`;
      b.setAttribute('aria-label', `Level ${i + 1}${ok ? ', done this visit' : ''}${n ? `, ${n} ${n === 1 ? 'star' : 'stars'}` : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  // a shape on the baseplate behind the menu, just for show
  const DECOR = Views.shape(['0120', '1231', '0110']);
  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    drawLevelButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    world.build({ w: DECOR.w, d: DECOR.d, top: 3 });
    world.setHeights(DECOR.h, false);
    world.setExtent(3);
    fitFrame();
    world.frame(0, true);
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------- the HUD look */
  function setMode(mode) {
    S.mode = mode;
    const quiz = mode === 'quiz';
    ['undoBtn', 'clearBtn', 'hintBtn', 'toolSeg', 'compareBtn', 'cards'].forEach((id) => { $(id).hidden = quiz; });
    choicesEl.hidden = !quiz;
    $('nextQ').hidden = true;
    boardEl.setAttribute('aria-label', quiz
      ? 'The model. Q and E turn it, T tilts it, and 1, 2 or 3 picks a drawing.'
      : 'The baseplate. Arrow keys move the cursor, plus or Enter adds a cube, minus or Delete removes one, Q and E turn the view, T tilts it, C compares, Z undoes, H gives a hint.');
  }

  /* The part of the stage the HUD leaves free for the 3D view: beside the
   * column of drawings on wide screens, between the row of drawings and the
   * controls on tall ones. */
  function fitFrame() {
    const sr = stage.getBoundingClientRect();
    if (!sr.width || !sr.height) return;
    if (hud.hidden) {
      world.setFrame({ x: 0, y: 0, w: sr.width, h: sr.height });
      return;
    }
    const cr = (S.mode === 'quiz' ? choicesEl : cardsEl).getBoundingClientRect();
    const tr = toolsEl.getBoundingClientRect();
    const kr = ctrlsEl.getBoundingClientRect();
    let x0 = 0;
    let x1 = sr.width;
    let y0;
    let y1;
    if (tall && tall.matches) {
      y0 = cr.bottom - sr.top + 2;
      y1 = kr.top - sr.top - 50;           // room for the message above the controls
    } else {
      x1 = cr.left - sr.left - 6;
      y0 = tr.bottom - sr.top + 2;
      y1 = kr.top - sr.top - 2;
    }
    world.setFrame({ x: x0, y: y0, w: Math.max(80, x1 - x0), h: Math.max(80, y1 - y0) });
  }

  /* ------------------------------------------------------------- levels */
  function startLevel(i) {
    setMode('build');
    S.index = i;
    S.lv = Views.level(i);
    const lv = S.lv;
    S.h = Views.blank(lv.w, lv.d);
    S.history = [];
    S.timers = [];
    S.hintStep = 0;
    S.hintFor = '';
    S.won = false;
    S.fewestNoted = false;
    S.cursor = { x: 0, z: lv.d - 1 };      // A1, the front-left square
    S.cursorOn = false;
    world.build(lv);
    world.setHeights(S.h, false);
    world.setView(world.DEFAULT_VIEW.yaw, world.DEFAULT_VIEW.pitch, true);
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    $('levelName').textContent = `Level ${i + 1}`;
    drawCards();
    drawCount();
    fitExtent();
    showCursor();
    tell(say.start(i + 1, lv.tip, lv.goal));
    note('');
    fitFrame();
    world.frame(0, true);
    boardEl.focus({ preventScroll: true });
  }

  function drawCount() {
    $('cubeCount').textContent = cubesWord(Views.count(S.h));
  }
  // the camera makes room for the tallest column in the drawings or the build
  function fitExtent() {
    world.setExtent(Math.max(1, ...S.lv.target.front, ...S.h));
  }

  // the three target drawings, each with a live tick or cross
  function drawCards() {
    const lv = S.lv;
    const mine = Views.views(lv.w, lv.d, S.h);
    const m = Views.compare(lv.target, mine);
    KINDS.forEach((k) => {
      const card = $('card-' + k);
      const target = Views.picture(k, lv.target, lv.top);
      const have = S.compare ? Views.picture(k, mine, lv.top) : null;
      card.querySelector('.card-pic').innerHTML = Drawings.svg(target, have);
      card.classList.toggle('ok', m[k]);
      card.querySelector('.badge').textContent = m[k] ? '✓' : '✗';
      card.setAttribute('aria-label', `${Views.describe(k, lv.target)} ${m[k] ? 'Your build matches this view.' : 'Your build does not match this view yet.'}`);
    });
    return m;
  }

  /* ---------------------------------------------------------- building */
  // put square (x, z) at height `to`, after checking it is allowed
  function edit(x, z, to) {
    if (S.screen !== 'play' || S.mode !== 'build') return;
    const lv = S.lv;
    const i = z * lv.w + x;
    const sq = Views.square(x, z, lv.d);
    if (to > lv.top) {
      Sfx.play('pop');
      tell(say.tooTall(sq, lv.top));
      return;
    }
    if (to < 0) {
      Sfx.play('pop');
      tell(say.nothing(sq));
      return;
    }
    const from = S.h[i];
    S.history.push(S.h);
    S.h = S.h.slice();
    S.h[i] = to;
    world.setHeights(S.h, !calm(), time());
    Sfx.play(to > from ? 'hop' : 'poof');
    settle(sq, to);
  }

  // after any change: redraw, then work out what the build means now
  function settle(sq, high, undone) {
    const lv = S.lv;
    const m = drawCards();
    drawCount();
    fitExtent();
    world.glow(null);
    S.quietCursor = false;
    showCursor();
    const n = Views.count(S.h);
    if (!m.all) {
      tell(undone ? say.undo() : say.edit(sq, high, m.n));
      return;
    }
    if (lv.goal === 'fewest' && n > lv.min) {
      tell(say.notFewest(n, lv.min));
      if (!S.fewestNoted) Sfx.play('good', 2);
      S.fewestNoted = true;
      return;
    }
    const fresh = earnStars(n);
    if (!S.won) {
      S.won = true;
      S.solved.add(S.index);
      finish(n, fresh);
      return;
    }
    if (fresh.length) {
      Sfx.play('win');
      world.burst(world.squarePos((lv.w - 1) / 2, (lv.d - 1) / 2, lv.top + 0.5), 'sparkle');
      tell(say.star(fresh[0], fresh[0] === 'fewest' ? lv.min : lv.max));
      later(1.1, () => showDone(say.star(fresh[0], fresh[0] === 'fewest' ? lv.min : lv.max)));
      S.screen = 'done';
      return;
    }
    tell(say.stillMatch(n));
  }

  // stars for the fewest or the most cubes, on the levels that have them
  function earnStars(n) {
    const lv = S.lv;
    if (!lv.bonus) return [];
    const st = S.stars.get(S.index) || { fewest: false, most: false };
    const fresh = [];
    if (n === lv.min && !st.fewest) {
      st.fewest = true;
      fresh.push('fewest');
    }
    if (n === lv.max && !st.most) {
      st.most = true;
      fresh.push('most');
    }
    S.stars.set(S.index, st);
    return fresh;
  }

  function finish(n, fresh) {
    const lv = S.lv;
    S.screen = 'done';
    Sfx.play('win');
    world.burst(world.squarePos((lv.w - 1) / 2, (lv.d - 1) / 2, lv.top + 0.5), 'sparkle');
    if (!calm()) world.burst(world.squarePos((lv.w - 1) / 2, (lv.d - 1) / 2, lv.top + 1.5), 'confetti');
    let line = lv.goal === 'fewest' ? say.solvedFewest(S.index + 1, n) : say.solved(S.index + 1, n);
    if (fresh.length) line += ` ${say.star(fresh[0], fresh[0] === 'fewest' ? lv.min : lv.max)}`;
    tell(line);
    later(1.1, () => showDone(line));
  }

  function showDone(line) {
    const lv = S.lv;
    S.screen = 'done';
    $('doneTitle').textContent = `Level ${S.index + 1} solved!`;
    $('doneSub').textContent = line;
    const st = S.stars.get(S.index) || {};
    const rows = [];
    if (lv.bonus) {
      rows.push(starRow(!!st.fewest, `Fewest cubes (${lv.min})`));
      rows.push(starRow(!!st.most, `Most cubes (${lv.max})`));
    }
    $('doneStars').innerHTML = rows.join('');
    $('doneStars').hidden = !rows.length;
    $('doneFact').textContent = lv.goal === 'fewest' ? say.fewestShapes(lv.min, lv.fewestShapes) : say.shapes(lv.shapes);
    const last = S.index >= Views.LEVELS.length - 1;
    $('nextLevel').hidden = last;
    $('keepBuilding').hidden = !(lv.bonus && !(st.fewest && st.most));
    $('again').hidden = false;
    $('again').textContent = 'Play it again';
    done.hidden = false;
    ($('nextLevel').hidden ? $('allLevels') : $('nextLevel')).focus({ preventScroll: true });
  }
  function starRow(got, text) {
    return `<div class="star-row${got ? ' got' : ''}"><span class="st" aria-hidden="true">★</span><span>${text}: ${got ? 'star earned' : 'not yet'}</span></div>`;
  }

  function keepBuilding() {
    const lv = S.lv;
    done.hidden = true;
    S.screen = 'play';
    tell(say.keep(lv.min, lv.max, S.stars.get(S.index) || {}));
    boardEl.focus({ preventScroll: true });
  }

  function undo() {
    if (S.screen !== 'play' || S.mode !== 'build') return;
    if (!S.history.length) {
      tell(say.noUndo());
      return;
    }
    S.h = S.history.pop();
    world.setHeights(S.h, false);
    Sfx.play('poof');
    settle('', 0, true);
  }
  function clearAll() {
    if (S.screen !== 'play' || S.mode !== 'build') return;
    if (!Views.count(S.h)) {
      tell(say.alreadyEmpty());
      return;
    }
    S.history.push(S.h);
    S.h = Views.blank(S.lv.w, S.lv.d);
    world.setHeights(S.h, !calm(), time());
    Sfx.play('poof');
    settle('', 0);
    tell(say.clear());
  }
  function hint() {
    if (S.screen !== 'play' || S.mode !== 'build') return;
    const key = S.h.join(',');
    if (S.hintFor !== key) {
      S.hintFor = key;
      S.hintStep = 0;
    }
    const r = Views.hint(S.lv, S.h, S.hintStep, hintAim());
    if (r.kind === 'view' && !S.compare) setCompare(true, true);
    world.glow(r.squares.length ? r.squares : null, time());
    if (r.kind === 'square') {
      // the cursor jumps to the square; its ghost cube waits, so it cannot contradict the glow
      S.cursor = { x: r.squares[0].x, z: r.squares[0].z };
      S.quietCursor = true;
      showCursor();
    }
    tell(r.text);
    S.hintStep = 1;
  }
  // once a star level is solved, hints work towards a star still to win
  function hintAim() {
    if (!S.lv.bonus || !S.won) return null;
    const st = S.stars.get(S.index) || {};
    return !st.fewest ? 'fewest' : !st.most ? 'most' : null;
  }
  function setTool(tool) {
    S.tool = tool;
    S.quietCursor = false;
    $('addBtn').setAttribute('aria-pressed', String(tool === 'add'));
    $('eraseBtn').setAttribute('aria-pressed', String(tool === 'erase'));
    tell(say.tool(tool === 'erase'));
    showCursor();
  }
  function setCompare(on, quiet) {
    S.compare = on;
    $('compareBtn').setAttribute('aria-pressed', String(on));
    if (S.lv && S.mode === 'build') drawCards();
    if (!quiet) tell(say.compare(on));
  }
  function turn(dir) {
    if (S.screen === 'menu') return;
    world.turn(dir, calm());
    note(say.turn(world.facing()));
  }
  function tilt() {
    if (S.screen === 'menu') return;
    world.tilt(calm());
  }

  /* --------------------------------------------- the keyboard cursor */
  function showCursor() {
    if (S.mode !== 'build' || !S.lv) {
      world.cursor(null);
      return;
    }
    world.cursor(S.cursorOn ? S.cursor : null);
    if (S.cursorOn && !hovering && !S.quietCursor) world.preview(previewAt(S.cursor.x, S.cursor.z, S.tool === 'erase'));
    else if (!hovering) world.preview(null);
  }
  // the ghost cube (or eraser box) for square x, z, if that action is possible
  function previewAt(x, z, erase) {
    const lv = S.lv;
    const k = S.h[z * lv.w + x];
    if (erase) return k > 0 ? { x, z, y: k - 1, erase: true } : null;
    return k < lv.top ? { x, z, y: k } : null;
  }
  function describeCursor() {
    const lv = S.lv;
    const { x, z } = S.cursor;
    note(say.cursor(Views.square(x, z, lv.d), S.h[z * lv.w + x], lv.target.plan[z * lv.w + x],
      Views.LETTERS[x], lv.target.front[x], String(lv.d - z), lv.target.side[z]));
  }
  // arrows move the cursor as the screen shows it: up is away from you, whichever way you look
  function moveCursor(dir) {
    const lv = S.lv;
    S.quietCursor = false;
    if (!S.cursorOn) {
      S.cursorOn = true;
      showCursor();
      describeCursor();
      return;
    }
    const q = ((Math.round(world.view().yaw / (Math.PI / 2)) % 4) + 4) % 4;
    const away = [[0, -1], [-1, 0], [0, 1], [1, 0]][q];
    const right = [[1, 0], [0, -1], [-1, 0], [0, 1]][q];
    const d = { up: away, down: [-away[0], -away[1]], right, left: [-right[0], -right[1]] }[dir];
    const x = Math.max(0, Math.min(lv.w - 1, S.cursor.x + d[0]));
    const z = Math.max(0, Math.min(lv.d - 1, S.cursor.z + d[1]));
    S.cursor = { x, z };
    showCursor();
    describeCursor();
  }
  function cursorEdit(delta) {
    const lv = S.lv;
    if (!S.cursorOn) {
      S.cursorOn = true;
      showCursor();
    }
    const { x, z } = S.cursor;
    edit(x, z, S.h[z * lv.w + x] + delta);
  }

  /* ------------------------------------------------------- tap to build */
  /* What a click on p (from world.pick) would do: { x, z, to }, or a
   * { msg } explaining why nothing can happen. */
  function actionFor(p, erase) {
    const lv = S.lv;
    if (!p) return null;
    if (erase) {
      const k = S.h[p.z * lv.w + p.x];
      if (!k) return { msg: say.nothing(Views.square(p.x, p.z, lv.d)) };
      return { x: p.x, z: p.z, to: k - 1 };
    }
    let x = p.x;
    let z = p.z;
    if (p.kind === 'cube' && p.ny <= 0) {
      x += p.nx;
      z += p.nz;
      if (x < 0 || z < 0 || x >= lv.w || z >= lv.d) return { msg: say.edge() };
    }
    return { x, z, to: S.h[z * lv.w + x] + 1 };
  }
  function act(clientX, clientY, erase, mouse) {
    if (S.screen !== 'play' || S.mode !== 'build') return;
    const a = actionFor(world.pick(clientX, clientY), erase);
    if (!a) return;
    if (a.msg) {
      Sfx.play('pop');
      tell(a.msg);
      return;
    }
    S.cursor = { x: a.x, z: a.z };
    S.cursorOn = false;
    edit(a.x, a.z, a.to);
    if (mouse) hover(clientX, clientY, erase);
  }
  let hovering = false;
  function hover(clientX, clientY, erase) {
    if (S.screen !== 'play' || S.mode !== 'build') {
      world.preview(null);
      hovering = false;
      return;
    }
    const a = actionFor(world.pick(clientX, clientY), erase);
    hovering = !!(a && !a.msg);
    if (!hovering) {
      world.preview(null);
      return;
    }
    world.preview(previewAt(a.x, a.z, erase));
  }

  let press = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (press) {
      press.moved = true;                  // a second finger: just turn the view
      return;
    }
    try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey, mouse: e.pointerType === 'mouse', moved: false, long: false, job: null };
    if (e.pointerType !== 'mouse' && S.mode === 'build') {
      const p = press;
      p.job = later(LONG_PRESS, () => {
        if (press !== p || p.moved) return;
        p.long = true;
        act(p.x0, p.y0, true);
      });
    }
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!press) {
      if (e.pointerType === 'mouse') hover(e.clientX, e.clientY, S.tool === 'erase' || e.shiftKey);
      return;
    }
    if (e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    press.x = e.clientX;
    press.y = e.clientY;
    if (!press.moved && Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > DRAG_START) {
      press.moved = true;
      if (press.job) cancel(press.job);
      boardEl.classList.add('grab');
      world.preview(null);
      hovering = false;
      world.drag(e.clientX - press.x0, e.clientY - press.y0);
      return;
    }
    if (press.moved) world.drag(dx, dy);
  });
  function release(e, cancelled) {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (p.job) cancel(p.job);
    boardEl.classList.remove('grab');
    if (p.moved) {
      note(say.turn(world.facing()));
      return;
    }
    if (cancelled || p.long) return;
    if (S.mode === 'build') act(p.x0, p.y0, p.button === 2 || p.shift || e.shiftKey || S.tool === 'erase', p.mouse);
  }
  boardEl.addEventListener('pointerup', (e) => release(e, false));
  boardEl.addEventListener('pointercancel', (e) => release(e, true));
  boardEl.addEventListener('pointerleave', () => {
    if (!press) {
      hovering = false;
      showCursor();
    }
  });
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------------------------------------------------------- quiz */
  let choiceButtons = [];
  function startQuiz() {
    setMode('quiz');
    S.quiz = { list: Views.quiz(quizSeed), at: 0, right: 0, answered: false };
    quizSeed++;
    S.timers = [];
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    world.cursor(null);
    world.preview(null);
    world.glow(null);
    showQuestion(0);
  }
  function showQuestion(k) {
    const Q = S.quiz;
    const q = Q.list[k];
    Q.at = k;
    Q.answered = false;
    S.screen = 'quiz';
    world.build({ w: q.w, d: q.d, top: q.top });
    world.setHeights(q.h, false);
    world.setExtent(Math.max(...q.h));
    world.setView(world.DEFAULT_VIEW.yaw, world.DEFAULT_VIEW.pitch, true);
    choicesEl.innerHTML = '';
    choiceButtons = q.options.map((o, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card choice';
      b.setAttribute('aria-label', `Drawing ${j + 1}: ${Views.describePicture(o.pic)}`);
      b.innerHTML = `<span class="card-head" aria-hidden="true"><span>Drawing ${j + 1}</span><span class="badge">${j + 1}</span></span><span class="card-pic">${Drawings.svg(o.pic, null, true)}</span>`;
      b.addEventListener('click', () => choose(j));
      choicesEl.appendChild(b);
      return b;
    });
    $('levelName').textContent = `Question ${k + 1} of ${Q.list.length}`;
    $('cubeCount').textContent = `${Q.right} right`;
    $('nextQ').hidden = true;
    tell(say.quizAsk(k + 1, Q.list.length, q.ask));
    note('');
    fitFrame();
    world.frame(0, true);
    boardEl.focus({ preventScroll: true });
  }
  function choose(j) {
    const Q = S.quiz;
    if (S.screen !== 'quiz' || !Q || Q.answered) return;
    const q = Q.list[Q.at];
    Q.answered = true;
    const right = j === q.answer;
    choiceButtons[q.answer].classList.add('right');
    choiceButtons[q.answer].querySelector('.badge').textContent = '✓';
    if (!right) {
      choiceButtons[j].classList.add('wrong');
      choiceButtons[j].querySelector('.badge').textContent = '✗';
    }
    if (right) {
      Q.right++;
      Sfx.play('good', Math.min(8, Q.right));
      tell(say.quizRight(q.ask));
    } else {
      Sfx.play('uhoh');
      tell(say.quizWhy(q.options[j], q.ask));
    }
    $('cubeCount').textContent = `${Q.right} right`;
    const last = Q.at >= Q.list.length - 1;
    $('nextQ').textContent = last ? 'Score →' : 'Next →';
    $('nextQ').hidden = false;
    fitFrame();
    $('nextQ').focus({ preventScroll: true });
  }
  function nextQuestion() {
    const Q = S.quiz;
    if (S.screen !== 'quiz' || !Q || !Q.answered) return;
    if (Q.at + 1 < Q.list.length) showQuestion(Q.at + 1);
    else endQuiz();
  }
  function endQuiz() {
    const Q = S.quiz;
    S.screen = 'done';
    Sfx.play('win');
    if (!calm() && Q.right >= Q.list.length - 1) world.burst(world.squarePos(1, 1, 4), 'confetti');
    const line = say.quizDone(Q.right, Q.list.length);
    tell(line);
    $('doneTitle').textContent = 'Quiz done!';
    $('doneSub').textContent = line;
    $('doneStars').innerHTML = '';
    $('doneStars').hidden = true;
    $('doneFact').textContent = say.quizVerdict(Q.right, Q.list.length);
    $('nextLevel').hidden = true;
    $('keepBuilding').hidden = true;
    $('again').hidden = false;
    $('again').textContent = 'New quiz';
    done.hidden = false;
    $('again').focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------ buttons */
  const backToBoard = (fn) => () => {
    fn();
    if (!boardEl.hidden) boardEl.focus({ preventScroll: true });
  };
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => (S.mode === 'quiz' ? startQuiz() : startLevel(S.index)));
  $('allLevels').addEventListener('click', showMenu);
  $('keepBuilding').addEventListener('click', keepBuilding);
  $('menuBtn').addEventListener('click', showMenu);
  $('quizBtn').addEventListener('click', startQuiz);
  $('undoBtn').addEventListener('click', backToBoard(undo));
  $('clearBtn').addEventListener('click', backToBoard(clearAll));
  $('hintBtn').addEventListener('click', backToBoard(hint));
  $('addBtn').addEventListener('click', backToBoard(() => setTool('add')));
  $('eraseBtn').addEventListener('click', backToBoard(() => setTool('erase')));
  $('compareBtn').addEventListener('click', backToBoard(() => setCompare(!S.compare)));
  $('turnLeft').addEventListener('click', backToBoard(() => turn(-1)));
  $('turnRight').addEventListener('click', backToBoard(() => turn(1)));
  $('nextQ').addEventListener('click', nextQuestion);
  // the done card is a modal dialog: Tab goes round its own buttons
  done.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...done.querySelectorAll('button')].filter((b) => !b.hidden);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    items[e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length].focus();
  });

  /* -------------------------------------------------------------- keys */
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' && S.screen !== 'quiz') return;
    if (e.altKey || e.metaKey) return;
    if (e.ctrlKey && e.key.toLowerCase() !== 'z') return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const used = () => e.preventDefault();
    if (k === 'q' || k === '[') { used(); turn(-1); return; }
    if (k === 'e' || k === ']') { used(); turn(1); return; }
    if (k === 't') { used(); tilt(); return; }
    if (S.screen === 'quiz') {
      if (k === '1' || k === '2' || k === '3') { used(); choose(Number(k) - 1); }
      else if ((k === 'Enter' || k === ' ' || k === 'n') && S.quiz && S.quiz.answered) { used(); nextQuestion(); }
      return;
    }
    const arrows = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (arrows[k]) { used(); moveCursor(arrows[k]); }
    else if (k === '+' || k === '=' || k === 'Enter') { used(); cursorEdit(1); }
    else if (k === ' ') { used(); cursorEdit(S.tool === 'erase' ? -1 : 1); }
    else if (k === '-' || k === '_' || k === 'Delete' || k === 'Backspace') { used(); cursorEdit(-1); }
    else if (k === 'z') { used(); undo(); }
    else if (k === 'h') { used(); hint(); }
    else if (k === 'c') { used(); setCompare(!S.compare); }
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
    runTimers();
    world.update(t, dt);
    world.frame(dt, false);
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

  // a resize clears the canvas, so draw again at once rather than show a blank frame
  function fit() {
    world.resize();
    fitFrame();
    world.frame(0, false);
    world.render();
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  if (tall && tall.addEventListener) tall.addEventListener('change', fit);
  fit();
  // the baseplate's letters are painted in Fredoka, so paint them again once it is here
  fonts().then(() => world.repaint());
  // for the automated tests only (with ?seed=): where a point on the baseplate is on screen
  if (seedParam > 0) window.peTest = { at: (x, z, y) => world.toScreen(world.squarePos(x, z, y)) };
  showMenu();
  start();
})();
