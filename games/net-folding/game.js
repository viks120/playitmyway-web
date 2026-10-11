/* Net Folding: the game itself.
 *
 * Pick a challenge, then answer eight questions a round about nets of 3D
 * shapes. Every choice folds up in 3D, hinge by hinge, so you see why a net
 * works or why it can't: faces that land on top of each other, or a side
 * left open. Needs THREE, Toon, Sfx, Nets and World, loaded before it.
 * Nothing is stored: scores, streaks and ticks last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const say = Nets.say;
  const ROUND = Nets.ROUND;
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const INK = '#2b2a5e';
  const CARD = '#fbf4e4';

  const stage = $('stage');
  const canvas = $('view');
  const board = $('board');
  const menu = $('menu');
  const done = $('done');
  const tellEl = $('tell');
  const choicesEl = $('choices');

  function noGl() {
    ['menu', 'done', 'play'].forEach((id) => { $(id).hidden = true; });
    tellEl.textContent = '';
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
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);       // repeatable play, for testing
  const S = {
    screen: 'menu',          // menu, play, done
    seed: seedMatch ? +seedMatch[1] : Math.floor(Math.random() * 2147483647),
    group: 0,
    next: Nets.GROUPS.map(() => 0),    // each group's next question in its stream
    q: null,
    k: 0,                    // question number in this round, from 0
    answered: false,
    right: 0,                // right first time, this round
    streak: 0,
    best: 0,
    ticks: new Set(),        // rounds finished this visit
    cursor: 0,
  };

  // the site's sound toggle, kept up to date by components.js
  const sfx = (name, arg) => Sfx.play(name, arg);
  function tell(text) {
    tellEl.textContent = text;
    // keep the play area clear of the message, however many lines it takes
    stage.style.setProperty('--tell-h', `${tellEl.offsetHeight + 18}px`);
  }

  /* -------------------------------------------------------------- menu */
  const groupButtons = Nets.GROUPS.map((g, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'group-btn';
    b.innerHTML = `<span class="g-emoji" aria-hidden="true">${g.emoji}</span>` +
      `<span class="g-text"><span class="g-title">${g.title}</span><span class="g-blurb">${g.blurb}</span></span>` +
      '<span class="tick" aria-hidden="true">✓</span>';
    b.addEventListener('click', () => startGroup(i));
    $('groups').appendChild(b);
    return b;
  });
  function drawMenu() {
    groupButtons.forEach((b, i) => {
      const g = Nets.GROUPS[i];
      const ok = S.ticks.has(i);
      b.classList.toggle('ok', ok);
      b.setAttribute('aria-label', `${g.title} ${g.blurb}${ok ? ' Done this visit.' : ''}`);
    });
  }
  // a coloured cube turning slowly behind the menu
  const DEMO = Nets.netFromCells([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]].map(([x, y], i) => ({ x, y, colour: i, arrow: i === 2 ? 0 : null })));
  function showMenu() {
    S.screen = stage.dataset.screen = 'menu';
    drawMenu();
    menu.hidden = false;
    done.hidden = true;
    tell('');
    world.show({ target: { net: DEMO, turn: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, spin: true });
    const first = groupButtons.find((b, i) => !S.ticks.has(i)) || groupButtons[0];
    first.focus({ preventScroll: true });
  }

  /* -------------------------------------------------------- questions */
  function startGroup(i) {
    S.group = i;
    S.k = 0;
    S.right = 0;
    S.screen = stage.dataset.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    showQuestion();
  }

  function showQuestion() {
    const q = Nets.question(S.group, S.seed, S.next[S.group]);
    S.q = q;
    S.answered = false;
    S.cursor = 0;
    $('prompt').textContent = q.prompt;
    $('nextBtn').hidden = true;
    drawInfo();
    drawChoices(q);
    if (q.kind === 'opposite') world.show({ flat: q.net });
    else if (q.kind === 'solid' || q.kind === 'match') world.show({ target: q.target });
    else world.show({ goal: 'cube' });
    board.setAttribute('aria-busy', 'false');
    tell(say.ask(S.k + 1, ROUND, q.prompt));
    choiceButtons()[0].focus({ preventScroll: true });
  }
  function drawInfo() {
    $('info').textContent = `${Nets.GROUPS[S.group].title} · ${S.k + 1} of ${ROUND} · streak ${S.streak}`;
  }

  /* --------------------------------------------- the answers, drawn flat */
  const choiceButtons = () => [...choicesEl.querySelectorAll('.choice')];
  function drawChoices(q) {
    choicesEl.textContent = '';
    choicesEl.dataset.n = String(q.choices.length);
    choicesEl.dataset.kind = q.kind;
    let box = null;
    if (q.kind !== 'opposite') {
      // one scale for every net in the question, so sizes compare fairly
      box = q.choices.map(extentOf).reduce((m, e) => ({ w: Math.max(m.w, e.w), h: Math.max(m.h, e.h) }), { w: 0, h: 0 });
    }
    q.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (q.kind === 'opposite' ? ' chip' : '');
      b.dataset.i = String(i);
      if (q.kind === 'opposite') {
        const col = Nets.COLOURS[c];
        b.innerHTML = `<span class="chip-swatch" aria-hidden="true">${swatchSVG(c)}</span><span class="chip-name">${col.name}</span><span class="verdict" aria-hidden="true"></span>`;
        b.setAttribute('aria-label', col.name);
      } else {
        b.innerHTML = `<span class="choice-letter" aria-hidden="true">${Nets.LETTERS[i]}</span>${netSVG(c, box)}<span class="verdict" aria-hidden="true"></span>`;
        b.setAttribute('aria-label', `Net ${Nets.LETTERS[i]}`);
      }
      b.addEventListener('click', () => choose(i));
      b.addEventListener('focus', () => { S.cursor = i; });
      choicesEl.appendChild(b);
    });
  }
  function extentOf(net) {
    const pts = [].concat(...net.faces.map((f) => f.pts));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  const f3 = (x) => +x.toFixed(4);
  const PIPS = {
    1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.27, 0.5], [0.27, 0.75], [0.73, 0.25], [0.73, 0.5], [0.73, 0.75]],
  };
  // a colour's symbol in a unit square at (x, y): the same marks as on the 3D faces
  function markSVG(mark, x, y, ink) {
    const t = `transform="translate(${f3(x)} ${f3(y)})"`;
    switch (mark) {
      case 'circle': return `<circle cx="${f3(x + 0.5)}" cy="${f3(y + 0.5)}" r="0.15" fill="${ink}"/>`;
      case 'square': return `<rect x="${f3(x + 0.36)}" y="${f3(y + 0.36)}" width="0.28" height="0.28" fill="${ink}"/>`;
      case 'diamond': return `<path ${t} d="M0.5 0.31L0.69 0.5L0.5 0.69L0.31 0.5Z" fill="${ink}"/>`;
      case 'ring': return `<circle cx="${f3(x + 0.5)}" cy="${f3(y + 0.5)}" r="0.13" fill="none" stroke="${ink}" stroke-width="0.065"/>`;
      case 'plus': return `<path ${t} d="M0.32 0.445h0.36v0.11h-0.36zM0.445 0.32h0.11v0.36h-0.11z" fill="${ink}"/>`;
      default: return `<path transform="translate(${f3(x + 0.5)} ${f3(y + 0.5)}) rotate(45)" d="M-0.18 -0.055h0.36v0.11h-0.36zM-0.055 -0.18h0.11v0.36h-0.11z" fill="${ink}"/>`;
    }
  }
  function netSVG(net, box) {
    const e = extentOf(net);
    const pad = 0.14;
    const W = box.w + 2 * pad;
    const H = box.h + 2 * pad;
    const vx = e.x + e.w / 2 - W / 2;
    const vy = e.y + e.h / 2 - H / 2;
    let fills = '';
    let marks = '';
    let lines = '';
    net.faces.forEach((f) => {
      const fill = f.colour != null ? Nets.COLOURS[f.colour].hex : f.pips != null ? '#fffdf8' : CARD;
      fills += `<polygon points="${f.pts.map((p) => `${f3(p[0])},${f3(p[1])}`).join(' ')}" fill="${fill}"/>`;
      const x = f.pts.reduce((m, p) => Math.min(m, p[0]), Infinity);
      const y = f.pts.reduce((m, p) => Math.min(m, p[1]), Infinity);
      if (f.colour != null) {
        const col = Nets.COLOURS[f.colour];
        marks += markSVG(col.mark, x, y, col.name === 'Yellow' ? INK : '#fff');
      }
      if (f.arrow != null) {
        marks += `<path transform="translate(${f3(x + 0.5)} ${f3(y + 0.5)}) rotate(${f.arrow * 90})" d="M0 -0.43L0.15 -0.25L-0.15 -0.25Z" fill="#fff" stroke="${INK}" stroke-width="0.025" stroke-linejoin="round"/>`;
      }
      if (f.pips != null) PIPS[f.pips].forEach(([px, py]) => { marks += `<circle cx="${f3(x + px)}" cy="${f3(y + py)}" r="0.085" fill="${INK}"/>`; });
    });
    // fold lines (shared edges) dashed, cut edges solid
    const shared = (f, k) => net.faces.some((g) => g !== f && g.pts.some((p, j) => {
      const q = g.pts[(j + 1) % g.pts.length];
      const a = f.pts[k];
      const b = f.pts[(k + 1) % f.pts.length];
      const same = (u, v) => Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6;
      return (same(p, a) && same(q, b)) || (same(p, b) && same(q, a));
    }));
    net.faces.forEach((f) => f.pts.forEach((a, k) => {
      const b = f.pts[(k + 1) % f.pts.length];
      const fold = shared(f, k);
      lines += `<line x1="${f3(a[0])}" y1="${f3(a[1])}" x2="${f3(b[0])}" y2="${f3(b[1])}" class="${fold ? 'fold' : 'cut'}"/>`;
    }));
    return `<svg viewBox="${f3(vx)} ${f3(vy)} ${f3(W)} ${f3(H)}" aria-hidden="true" focusable="false">${fills}${marks}${lines}</svg>`;
  }
  function swatchSVG(c) {
    const col = Nets.COLOURS[c];
    return `<svg viewBox="0 0 1 1" aria-hidden="true" focusable="false"><rect width="1" height="1" rx="0.16" fill="${col.hex}"/>${markSVG(col.mark, 0, 0, col.name === 'Yellow' ? INK : '#fff')}</svg>`;
  }

  /* ----------------------------------------------------------- choosing */
  function choose(i) {
    if (S.screen !== 'play' || !S.q) return;
    const q = S.q;
    const btns = choiceButtons();
    if (!S.answered) {
      S.answered = true;
      const res = Nets.check(q, i);
      if (res.correct) {
        S.right++;
        S.streak++;
        S.best = Math.max(S.best, S.streak);
      } else {
        S.streak = 0;
      }
      btns.forEach((b, k) => {
        const name = q.kind === 'opposite' ? Nets.COLOURS[q.choices[k]].name : `Net ${Nets.LETTERS[k]}`;
        if (k === q.answer) {
          b.classList.add('right');
          b.querySelector('.verdict').textContent = '✓';
          b.setAttribute('aria-label', `${name}, the right answer`);
        } else if (k === i) {
          b.classList.add('wrong');
          b.querySelector('.verdict').textContent = '✗';
          b.setAttribute('aria-label', `${name}, not this one`);
        }
      });
      tell(res.text);
      $('nextBtn').hidden = false;
      drawInfo();
    } else {
      tell(Nets.why(q, i).text);
    }
    btns.forEach((b, k) => b.classList.toggle('shown', k === i));
    foldChoice(q, i);
  }

  const N3 = (f) => f.normal.map((x) => Math.round(x) + 0);
  /* How a chosen net should end up once folded: a turn to line it up, the
   * marks that explain it, and whether it is what was asked for. */
  function ending(q, i) {
    const net = q.kind === 'opposite' ? q.net : q.choices[i];
    const r = Nets.fold(net);
    const all = net.faces.map((f, k) => k);
    const bad = { overlap: [].concat(...r.overlaps), stray: r.stray, gaps: true };
    if (q.kind === 'opposite') {
      const opp = Nets.opposites(net)[q.red];
      const pick = net.faces.findIndex((f) => f.colour === q.choices[i]);
      const settle = pick === opp ? Nets.turnFor(N3(r.faces[q.red]), [0, 1, 0]) : Nets.turnFor(N3(r.faces[q.red]), [0, 1, 0], N3(r.faces[pick]), [0, 0, 1]);
      return { net, settle, good: pick === opp, marks: { fade: all.filter((k) => k !== q.red && k !== opp && k !== pick), glow: [opp], miss: pick === opp ? [] : [pick] } };
    }
    if (q.kind === 'dice') {
      const d = Nets.dieCheck(net);
      const at = (p) => net.faces.findIndex((f) => f.pips === p);
      if (d.ok) return { net, good: true, settle: Nets.turnFor(N3(r.faces[at(1)]), [0, 1, 0], N3(r.faces[at(2)]), [0, 0, 1]), marks: {} };
      const [a, b] = d.bad.map(at);
      return { net, good: false, settle: Nets.turnFor(N3(r.faces[a]), [0, 1, 0]), marks: { fade: all.filter((k) => k !== a && k !== b), miss: [a, b] } };
    }
    if (q.kind === 'match') {
      const mine = Nets.cubeOf(net);
      const goal = Nets.cubeOf(q.target.net);
      const best = Nets.bestTurn(mine, goal);
      const miss = Nets.misfits(mine, goal, best.R);
      return { net, good: !miss.length, settle: Nets.mul(q.target.turn, best.R), marks: { miss } };
    }
    if (q.kind === 'solid') {
      if (r.valid && net.solid === q.solid) return { net, good: true, settle: q.target.turn, marks: {} };
      if (r.valid) return { net, good: false, settle: Nets.present(net), marks: {} };
      // turn the open side towards the player
      return { net, good: false, settle: null, show: r.solid.normals[r.gaps[0]], marks: bad, ghost: true };
    }
    if (r.valid) return { net, good: true, settle: null, marks: {}, ghost: true };
    return { net, good: false, settle: Nets.cubeView(r), marks: bad, ghost: true };
  }

  function foldChoice(q, i) {
    const end = ending(q, i);
    board.setAttribute('aria-busy', 'true');
    world.fold(end.net, {
      calm: calm(),
      settle: end.settle,
      show: end.show,
      marks: end.marks,
      ghost: end.ghost,
      onHinge: (k) => sfx('good', Math.min(k, 8)),
      onSettle: () => {
        board.setAttribute('aria-busy', 'false');
        if (end.good) {
          sfx('win');
          if (!calm()) world.burst();
        } else {
          sfx('uhoh');
        }
      },
    });
  }
  function replay() {
    if (S.screen !== 'play' || !world.hasFold()) return;
    board.setAttribute('aria-busy', 'true');
    world.replay();
  }

  function next() {
    if (S.screen !== 'play' || !S.answered) return;
    S.next[S.group]++;
    S.k++;
    if (S.k >= ROUND) finishRound();
    else showQuestion();
  }
  function finishRound() {
    S.screen = stage.dataset.screen = 'done';
    S.ticks.add(S.group);
    const line = say.done(S.right, ROUND, S.best);
    tell(line);
    $('doneTitle').textContent = S.right === ROUND ? 'A perfect round!' : 'Round complete!';
    $('doneSub').textContent = line.replace(/^Round complete: /, '');
    done.hidden = false;
    sfx('win');
    $('againBtn').focus({ preventScroll: true });
  }
  $('nextBtn').addEventListener('click', next);
  $('menuBtn').addEventListener('click', showMenu);
  $('againBtn').addEventListener('click', () => startGroup(S.group));
  $('allBtn').addEventListener('click', showMenu);
  $('replayBtn').addEventListener('click', () => { replay(); board.focus({ preventScroll: true }); });
  // turn the shapes; the view's angles are left on the board for anyone checking
  function turn(dyaw, dpitch) {
    world.turn(dyaw, dpitch);
    const a = world.angles();
    board.dataset.view = `${a.yaw.toFixed(2)} ${a.pitch.toFixed(2)}`;
  }
  $('leftBtn').addEventListener('click', () => turn(-Math.PI / 4, 0));
  $('rightBtn').addEventListener('click', () => turn(Math.PI / 4, 0));

  /* -------------------------------------------------------------- input */
  const columns = () => getComputedStyle(choicesEl).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const btns = choiceButtons();
    const onChoice = e.target && e.target.closest ? e.target.closest('.choice') : null;
    const onButton = e.target && e.target.closest ? e.target.closest('button') : null;
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns(), ArrowDown: columns() };
    if (moves[k]) {
      e.preventDefault();
      const from = onChoice ? btns.indexOf(onChoice) : -1;
      const to = from < 0 ? S.cursor : Math.max(0, Math.min(btns.length - 1, from + moves[k]));
      btns[to].focus({ preventScroll: true });
    } else if (k === 'Enter' && !onButton) {
      e.preventDefault();
      choose(S.cursor);
    } else if (k >= '1' && k <= String(btns.length)) {
      e.preventDefault();
      btns[+k - 1].focus({ preventScroll: true });
      choose(+k - 1);
    } else if (k === ' ' && (onChoice || !onButton)) {
      e.preventDefault();
      replay();
    } else if (k === 'q' || k === 'e') {
      e.preventDefault();
      turn(k === 'q' ? -Math.PI / 4 : Math.PI / 4, 0);
    } else if (k === 'r' || k === 'f') {
      e.preventDefault();
      turn(0, k === 'r' ? 0.35 : -0.35);
    } else if (k === 'n') {
      e.preventDefault();
      next();
    }
  });
  // Space on a focused answer replays the fold rather than clicking it
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && e.target && e.target.closest && e.target.closest('.choice')) e.preventDefault();
  });

  // drag to turn the shapes
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    turn((e.clientX - drag.x) * 0.012, (e.clientY - drag.y) * 0.012);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => board.addEventListener(ev, () => { drag = null; }));

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
    world.setCalm(calm());
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

  function fit() {
    world.resize();
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe($('viewBox'));
  else window.addEventListener('resize', fit);
  fit();
  world.update(time(), 0);
  showMenu();
  start();
  // work out every net once, while the player reads the menu
  setTimeout(() => Nets.catalogue(), 400);
})();
