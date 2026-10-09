/* Number Line Hop: the game itself.
 *
 * Screens (pick a critter, pick a pond, play), the three stages, the flat
 * number line, input by tap and keyboard, and the hop choreography. Needs
 * THREE, Toon, Critters, Sfx, Lines and World, loaded before it. Nothing is
 * stored: stars live in this page's memory only.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Lines.say;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const fullName = (k) => `${KINDS[k].name} the ${KINDS[k].kind}`;
  const dirOf = (p) => (p.op === '+' ? 1 : -1);
  const CRITTER_SIZE = 0.72;
  const STAGE_TITLE = { count: 'Hop and count', guess: 'Where will you land?', gap: 'How far to your friend?' };

  function turnToward(from, to, k) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return from + d * k;
  }

  const stage = $('stage');
  const canvas = $('view');
  const lineInput = $('lineInput');
  const hud = $('hud');
  const chip = $('chip');
  const sumEl = $('sum');
  const tellEl = $('tell');
  const strip = $('strip');
  const actions = $('actions');
  const floatEl = $('float');
  const srFocus = $('srFocus');
  const whoBtn = $('whoBtn');
  const whoPop = $('whoPop');
  const won = $('won');
  const pickGrid = $('pickGrid');
  const pickGo = $('pickGo');
  const menuGroups = $('menuGroups');
  const screens = { pick: $('screenPick'), menu: $('screenMenu') };

  function noGl() {
    ['screenPick', 'screenMenu', 'hud', 'lineInput', 'won'].forEach((id) => { $(id).hidden = true; });
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
    screen: 'pick',
    kind: null,
    pondIndex: 0,
    pond: null,
    qi: 0,
    p: null,
    pos: 0,
    mode: 'wait',          // 'wait' for the child, or 'hop' while the critter moves
    dir: 1,
    queue: 0,
    from: 0,
    to: 0,
    hopAt: -1,
    onDone: null,
    arcsOn: true,          // off while hopping home after a miss
    count: 0,              // counted hops in this attempt
    jumps: [],             // [from, to] of each counted hop, for the flat line
    tries: 0,
    tried: 0,
    misses: 0,
    guess: null,
    cursor: 0,
    keys: false,
    finished: false,
    landAt: -9,
    popAt: -9,
    cheerAt: -9,
    floatAt: -9,
    floatN: 0,
    stars: Object.create(null),     // best stars per pond, this visit only
    pointer: null,
    pendingSwap: null,
    timers: [],
  };
  let player = null;
  let friends = [];
  let pickRigs = [];

  function later(delay, fn) {
    S.timers.push({ at: time() + delay, fn });
  }
  function runTimers() {
    const t = time();
    const due = S.timers.filter((x) => t >= x.at);
    S.timers = S.timers.filter((x) => t < x.at);
    due.forEach((x) => x.fn());
  }
  function tell(text, mood) {
    tellEl.textContent = text;
    tellEl.className = 'tell' + (mood ? ' ' + mood : '');
  }
  const me = () => KINDS[S.kind].name;
  const friendOnPad = () => friends.find((f) => f.onPad != null) || null;
  const friendName = () => {
    const f = friendOnPad();
    return f ? KINDS[f.kind].name : '';
  };

  function showScreen(name) {
    S.screen = name;
    screens.pick.hidden = name !== 'pick';
    screens.menu.hidden = name !== 'menu';
    hud.hidden = name !== 'play';
    lineInput.hidden = name !== 'play';
    floatEl.hidden = true;
    won.hidden = true;
    closePop();
    world.show(name === 'play' ? 'line' : 'picker');
    if (name === 'menu') stop();
    else start();
  }

  /* ------------------------------------------------- pick a critter */
  const pickButtons = ORDER.map((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick-btn';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', fullName(k));
    b.innerHTML = `<span class="pick-name" aria-hidden="true">${KINDS[k].name}</span>` +
      `<span class="pick-kind" aria-hidden="true">the ${KINDS[k].kind}</span>`;
    b.addEventListener('click', () => choose(k));
    pickGrid.appendChild(b);
    return b;
  });

  function choose(k) {
    S.kind = k;
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    const rig = pickRigs[ORDER.indexOf(k)];
    rig.hopAt = time();
    rig.happy = true;
    Sfx.play('voice', KINDS[k].voice);
    world.burst(above(rig.root.position, 1.3 * rig.root.scale.y), 'sparkle');
    pickGo.disabled = false;
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
    updateWho();
  }
  pickGo.addEventListener('click', () => { if (S.kind) showMenu(); });

  function showPick() {
    if (!pickRigs.length) {
      pickRigs = ORDER.map((k) => Object.assign(Critters.create(k), { hopAt: -9, happy: false, baseY: 0 }));
      world.showPicker(pickRigs);
    }
    showScreen('pick');
  }

  function lookAtPointer(rig, dt, chin) {
    let yaw = 0;
    let pitch = chin;
    if (S.pointer) {
      const p = world.toScreen(above(rig.root.position, rig.root.scale.y));
      yaw = clamp((S.pointer.x - p.x) / 220, -0.8, 0.8);
      pitch = clamp((S.pointer.y - p.y) / 400, -0.3, 0.35) + chin;
    }
    const k = 1 - Math.exp(-6 * dt);
    rig.look.yaw += (yaw - rig.look.yaw) * k;
    rig.look.pitch += (pitch - rig.look.pitch) * k;
  }
  stage.addEventListener('pointermove', (e) => { S.pointer = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerleave', () => { S.pointer = null; });

  function tickPick(t, dt) {
    world.framePicker();
    world.alignPicker(pickButtons);
    pickRigs.forEach((rig) => {
      let y = 0;
      let spin = 0;
      rig.sy = null;
      if (rig.hopAt >= 0) {
        const h = hopCurve(t - rig.hopAt, 0.7);
        if (!h) {
          rig.hopAt = -9;
          rig.happy = false;
        } else {
          y = h.y;
          rig.sy = h.sy;
          if (rig.happy && h.phase === 'air' && !calm()) spin = h.p * TAU;
        }
      } else if (Math.random() < dt * 0.25) {
        rig.hopAt = t;                              // a hop now and then, just for joy
      }
      rig.root.position.y = rig.baseY + y * rig.root.scale.y;
      lookAtPointer(rig, dt, -0.12);
      rig.turn.rotation.y = rig.look.yaw * 0.6 + spin;
      rig.update(t, dt);
    });
  }

  /* ---------------------------------------------------- pick a pond */
  function showMenu() {
    menuGroups.textContent = '';
    for (const group of Lines.GROUPS) {
      const sec = document.createElement('section');
      sec.className = 'pond-family';
      const h = document.createElement('h3');
      h.textContent = group.title;
      const grid = document.createElement('div');
      grid.className = 'pond-grid';
      for (const id of group.ids) {
        const i = Lines.LIST.findIndex((p) => p.id === id);
        const p = Lines.LIST[i];
        const stars = S.stars[p.id] || 0;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pond-btn';
        b.innerHTML = `<span class="pond-title">${p.title}</span>` +
          `<span class="pond-stars" aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` +
          (p.start ? '<span class="pond-badge" aria-hidden="true">Start here</span>' : '');
        b.setAttribute('aria-label', p.title + (p.start ? ', start here' : '') +
          (stars ? `, ${stars} star${stars > 1 ? 's' : ''} this visit` : ''));
        b.addEventListener('click', () => play(i));
        grid.appendChild(b);
      }
      sec.append(h, grid);
      menuGroups.appendChild(sec);
    }
    $('changeCritter').innerHTML = `<span aria-hidden="true">${KINDS[S.kind].emoji}</span> Change critter`;
    showScreen('menu');
    menuGroups.querySelector('.pond-btn').focus({ preventScroll: true });
  }
  $('changeCritter').addEventListener('click', showPick);

  /* --------------------------------------------------------- a pond */
  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  // the pad numbers are painted in Fredoka, so wait for it (briefly)
  function play(index) {
    fonts().then(() => begin(index));
  }

  function begin(index) {
    S.pondIndex = index;
    S.pond = Lines.generate(Lines.LIST[index].id, Math.floor(Math.random() * 2147483647));
    S.qi = 0;
    S.misses = 0;
    S.finished = false;
    S.timers = [];
    S.pendingSwap = null;
    S.mode = 'wait';
    S.hopAt = -1;
    world.buildLine(S.pond.max);
    S.pos = S.pond.problems[0].start;
    placePlayer(world.padTop(S.pos), 0);
    makeFriends();
    showScreen('play');
    startProblem(true);
  }

  function placePlayer(pos, yaw) {
    if (player) {
      world.actors.remove(player.root);
      player.dispose();
    }
    player = Critters.create(S.kind);
    player.root.scale.setScalar(CRITTER_SIZE);
    player.root.position.copy(pos);
    player.turn.rotation.y = yaw;
    world.actors.add(player.root);
  }

  // the other three watch from the bank, and hop along it to keep up
  function makeFriends() {
    friends.forEach((f) => {
      world.actors.remove(f.rig.root);
      f.rig.dispose();
    });
    friends = ORDER.filter((k) => k !== S.kind).map((kind, i) => {
      const rig = Critters.create(kind);
      rig.root.scale.setScalar(CRITTER_SIZE);
      world.actors.add(rig.root);
      return { kind, rig, x: world.camX() + (i - 1) * 2.2, onPad: null, hopAt: -9, walkAt: -1, walkFrom: 0, walkTo: 0 };
    });
  }

  function startProblem(first) {
    const p = (S.p = S.pond.problems[S.qi]);
    world.clearArcs();
    world.showRing(null);
    Object.assign(S, { jumps: [], count: 0, tries: 0, tried: 0, guess: null, cursor: p.start, keys: false, mode: 'wait', arcsOn: true });
    if (!first) world.burst(above(world.padTop(S.pos), 0.6), 'poof');
    S.pos = p.start;
    S.popAt = time();
    friends.forEach((f) => { f.onPad = null; });
    if (p.stage === 'gap') {
      const f = friends[S.qi % friends.length];
      f.onPad = p.end;
      world.burst(above(world.padTop(p.end), 0.8), 'poof');
      Sfx.play('poof');
    }
    chip.textContent = `${STAGE_TITLE[p.stage]} · ${(S.qi % 3) + 1} of 3`;
    sumEl.textContent = say.equation(p, p.stage === 'gap' ? 'jump' : 'end');
    srFocus.textContent = sumEl.textContent;
    tell(say.prompt(p, me(), friendName()));
    strip.classList.toggle('pickable', p.stage === 'guess');
    drawStrip();
    // the critter pops to its new start, so the camera jumps with it rather than gliding the whole way
    world.frameLine(focusX(), spanX(), 0, true);
    if (p.stage === 'count') setActions('hop');
    else if (p.stage === 'guess') {
      setActions(null);
      lineInput.focus({ preventScroll: true });
    } else setActions('gap');
  }

  function button(cls, label, onClick, aria) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', onClick);
    return b;
  }

  function setActions(kind) {
    actions.textContent = '';
    if (kind === 'hop') {
      const b = button('hop-btn', 'Hop!', () => {
        // hops already counted, queued, or in the air: never more than the problem asks for
        const pending = S.count + S.queue + (S.hopAt >= 0 ? 1 : 0);
        if (pending >= S.p.jump) return;
        if (S.mode === 'wait') hop(dirOf(S.p), 1, afterCountHop);
        else if (S.onDone === afterCountHop) S.queue++;     // a quick tap mid-hop is queued, not lost
      });
      actions.append(b);
      b.focus({ preventScroll: true });
    } else if (kind === 'gap') {
      for (const n of Lines.choices(S.pond.id, S.p)) {
        actions.append(button('num-btn', String(n), () => chooseHops(n), n === 1 ? '1 hop' : `${n} hops`));
      }
      actions.firstElementChild.focus({ preventScroll: true });
    } else if (kind === 'next') {
      const last = S.qi === S.pond.problems.length - 1;
      const b = button('next-btn', last ? 'Finish ✓' : 'Next →', nextProblem);
      actions.append(b);
      b.focus({ preventScroll: true });
    }
  }

  /* ---------------------------------------------------------- hopping */
  function hop(dir, times, done) {
    S.mode = 'hop';
    S.dir = dir;
    S.queue = times;
    S.onDone = done;
    nextHop();
  }

  function nextHop() {
    // never off the end of the line
    if (S.queue <= 0 || S.pos + S.dir < 0 || S.pos + S.dir > S.pond.max) {
      S.queue = 0;
      S.mode = 'wait';
      const done = S.onDone;
      S.onDone = null;
      if (done) done();
      return;
    }
    S.queue--;
    S.from = S.pos;
    S.to = S.pos + S.dir;
    S.hopAt = time();
    Sfx.play('hop');
  }

  function landed() {
    S.pos = S.to;
    S.landAt = time();
    world.ripple(world.padX(S.pos), 0, 0.62);
    if (S.arcsOn) {
      S.count++;
      S.jumps.push([S.from, S.to]);
      world.addArc(S.from, S.to, S.dir > 0 ? '+' : '-');
      // a note per hop: climbing when adding, falling when taking away
      Sfx.play('good', S.dir > 0 ? Math.min(S.count - 1, 8) : Math.max(8 - S.count, 0));
      S.floatN = S.pos;
      S.floatAt = time();
      tell(say.counting(S.p, S.count));
    }
    drawStrip();
    later(0.16, nextHop);
  }

  function cheer() {
    Sfx.play('good', 8);
    world.burst(above(player.root.position, 1.2), 'sparkle');
    friends.forEach((f, i) => { f.hopAt = time() + 0.05 + i * 0.09; });
    S.cheerAt = time();
  }

  function resultRight(text) {
    sumEl.textContent = say.equation(S.p);
    tell(text, 'good');
    cheer();
    setActions('next');
  }

  /* ---------------------------------------------- stage 1: hop and count */
  function afterCountHop() {
    if (S.count < S.p.jump) return;          // more presses to come
    resultRight(say.counted(S.p));
  }

  /* ---------------------------------------- stage 2: where will you land? */
  function makeGuess(n) {
    if (!S.p || S.p.stage !== 'guess' || S.mode !== 'wait' || S.guess != null) return;
    S.guess = n;
    world.showRing(n);
    tell(say.guessing(n));
    drawStrip();
    S.mode = 'hop';                           // locked while the critter gets ready
    later(0.6, () => hop(dirOf(S.p), S.p.jump, afterGuess));
  }

  function afterGuess() {
    if (S.guess === S.p.end) {
      resultRight(say.guessRight(S.p));
      return;
    }
    S.misses++;
    sumEl.textContent = say.equation(S.p);
    tell(say.guessWrong(S.p, S.guess, me()), 'oops');
    Sfx.play('uhoh');
    setActions('next');
  }

  /* ------------------------------------ stage 3: how far to your friend? */
  function chooseHops(n) {
    if (!S.p || S.p.stage !== 'gap' || S.mode !== 'wait') return;
    actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    S.tried = n;
    hop(dirOf(S.p), n, afterGap);
  }

  function afterGap() {
    const p = S.p;
    if (S.pos === p.end) {
      resultRight(say.gapRight(p));
      return;
    }
    S.tries++;
    if (S.tries === 1) S.misses++;            // not right first time
    const short = p.op === '+' ? S.pos < p.end : S.pos > p.end;
    tell(short ? say.gapShort(p, S.tried, me(), friendName()) : say.gapFar(p, S.tried, friendName()), 'oops');
    Sfx.play('uhoh');
    later(1.5, () => goHome(() => {
      if (S.tries >= 2) showTheWay();
      else setActions('gap');
    }));
  }

  // back to the start pad without counting, ready to try again
  function goHome(then) {
    const back = S.p.start - S.pos;
    S.arcsOn = false;
    hop(Math.sign(back), Math.abs(back), () => {
      S.arcsOn = true;
      S.count = 0;
      S.jumps = [];
      world.clearArcs();
      drawStrip();
      then();
    });
  }

  function showTheWay() {
    hop(dirOf(S.p), S.p.jump, () => {
      sumEl.textContent = say.equation(S.p);
      tell(say.gapShow(S.p), 'good');
      setActions('next');
    });
  }

  function nextProblem() {
    if (S.mode !== 'wait' || S.finished) return;
    S.qi++;
    if (S.qi >= S.pond.problems.length) finish();
    else startProblem(false);
  }

  function finish() {
    S.finished = true;
    const stars = Lines.stars(S.misses);
    S.stars[S.pond.id] = Math.max(S.stars[S.pond.id] || 0, stars);
    friends.forEach((f, i) => {
      f.onPad = null;
      f.hopAt = time() + i * 0.12;
    });
    Sfx.play('win');
    if (!calm()) world.burst(above(player.root.position, 1.5), 'confetti');
    S.cheerAt = time();
    setActions(null);
    tell(`${S.pond.title}: done!`, 'good');
    drawStrip();
    $('wonStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('wonStars').setAttribute('aria-label', `${stars} star${stars > 1 ? 's' : ''}`);
    $('wonSub').textContent = say.doneSub(S.misses);
    later(0.6, () => {
      won.hidden = false;
      $('wonNext').focus({ preventScroll: true });
    });
  }
  $('wonNext').addEventListener('click', () => {
    if (S.pondIndex < Lines.LIST.length - 1) play(S.pondIndex + 1);
    else showMenu();
  });
  $('wonAgain').addEventListener('click', () => play(S.pondIndex));
  $('wonAll').addEventListener('click', showMenu);

  /* --------------------------------------------- the flat number line */
  function drawStrip() {
    const max = S.pond.max;
    const x = (n) => 14 + n * (312 / max);
    const small = max > 10;
    const ink = '#2b2a5e';
    let s = `<line x1="8" y1="30" x2="332" y2="30" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
    for (let n = 0; n <= max; n++) {
      const five = n % 5 === 0;
      s += `<line x1="${x(n)}" y1="25" x2="${x(n)}" y2="35" stroke="${ink}" stroke-width="${five ? 2.2 : 1.4}"/>`;
      s += `<text x="${x(n)}" y="47" font-size="${small ? 8.5 : 10}" text-anchor="middle" font-weight="${five || !small ? 700 : 500}" ` +
        `fill="${S.p && n === S.p.start ? '#b45309' : ink}">${n}</text>`;
    }
    for (const [a, b] of S.jumps) {
      const mid = (x(a) + x(b)) / 2;
      const up = b > a;
      s += `<path d="M ${x(a)} 28 Q ${mid} 8 ${x(b)} 28" fill="none" stroke="${up ? '#8b5cf6' : '#f97362'}" stroke-width="2.2"/>`;
      if (!small) s += `<text x="${mid}" y="14" font-size="9" text-anchor="middle" font-weight="700" fill="${up ? '#7c3aed' : '#d9462d'}">${up ? '+1' : '−1'}</text>`;
    }
    if (S.guess != null) s += `<circle cx="${x(S.guess)}" cy="30" r="8" fill="none" stroke="#ffb020" stroke-width="3"/>`;
    const f = friendOnPad();
    if (f) s += `<text x="${x(f.onPad)}" y="21" font-size="13" text-anchor="middle">${KINDS[f.kind].emoji}</text>`;
    s += `<circle cx="${x(S.pos)}" cy="30" r="6" fill="#b45309" stroke="#fff" stroke-width="2"/>`;
    strip.innerHTML = s;
    strip.setAttribute('aria-label', say.line(max, me(), S.pos, f ? KINDS[f.kind].name : null, f ? f.onPad : null));
  }

  // in stage 2 the flat line is a second way to pick a pad
  strip.addEventListener('click', (e) => {
    if (!S.p || S.p.stage !== 'guess') return;
    const r = strip.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * 340;
    makeGuess(clamp(Math.round(((sx - 14) / 312) * S.pond.max), 0, S.pond.max));
  });

  /* ----------------------------------------------------- every frame */
  // keep whatever matters in view: a friend waiting, or a guess in progress
  function focusX() {
    const x = player ? player.root.position.x : 0;
    if (!S.p) return x;
    if (S.p.stage === 'gap' && friendOnPad()) return (x + world.padX(S.p.end)) / 2;
    const mark = S.guess != null ? S.guess : S.keys ? S.cursor : null;
    if (S.p.stage === 'guess' && mark != null) return (x + world.padX(mark)) / 2;
    if (S.p.stage === 'guess') return world.padX(clamp(S.p.start + dirOf(S.p) * 3, 0, S.pond.max));
    return x;
  }
  function spanX() {
    const x = player ? player.root.position.x : 0;
    if (!S.p) return 0;
    if (S.p.stage === 'gap' && friendOnPad()) return Math.abs(x - world.padX(S.p.end)) / 2 + 1.9;
    const mark = S.guess != null ? S.guess : S.keys ? S.cursor : null;
    if (S.p.stage === 'guess' && mark != null) return Math.abs(x - world.padX(mark)) / 2 + 1.9;
    if (S.p.stage === 'guess') return 3 * 1.35 + 1.9;
    return 0;
  }

  function tickPlay(t, dt) {
    runTimers();
    const P = player.root.position;
    player.sy = null;
    player.earX = 0;
    let lift = 0;
    let yaw = 0;
    if (S.hopAt >= 0) {
      const h = hopCurve(t - S.hopAt, player.hop * 0.85);
      if (!h || h.phase === 'land') {
        S.hopAt = -1;
        P.copy(world.padTop(S.to));
        landed();
      } else {
        P.lerpVectors(world.padTop(S.from), world.padTop(S.to), h.phase === 'air' ? h.p : 0);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        player.earX = h.phase === 'air' ? -0.5 * (1 - h.p) + 0.15 * h.p : 0;
      }
      yaw = S.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      P.copy(world.padTop(S.pos));
      if (S.mode === 'hop') yaw = S.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      else {
        lookAtPointer(player, dt, -0.2);
        yaw = player.look.yaw * 0.8;
      }
      const pop = hopCurve(t - S.popAt, 0.35);
      if (pop) {
        P.y += pop.y;
        lift = pop.y;
        player.sy = pop.sy;
      }
      const joy = hopCurve(t - S.cheerAt, 0.6);
      if (joy) {
        P.y += joy.y;
        lift = Math.max(lift, joy.y);
        player.sy = joy.sy;
        if (joy.phase === 'air' && !calm()) yaw = joy.p * TAU;
      }
      if (S.pendingSwap && S.mode === 'wait') {
        const k = S.pendingSwap;
        S.pendingSwap = null;
        swap(k);
      }
    }
    // the landing jelly wobble carries on after the hop hands over
    if (player.sy == null && t - S.landAt < 0.5) {
      const p = (t - S.landAt) / 0.5;
      player.sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);
    }
    player.turn.rotation.y = turnToward(player.turn.rotation.y, yaw, 1 - Math.exp(-14 * dt));
    player.update(t, dt);
    world.shadow(P.x, P.y - lift, P.z, lift, true);

    friends.forEach((f, i) => {
      let base;
      let walkY = 0;
      let face = 0;
      if (f.onPad != null) {
        // waiting on the answer pad; steps back to make room when the critter arrives
        const top = world.padTop(f.onPad);
        const room = S.pos === f.onPad && S.hopAt < 0;
        base = new THREE.Vector3(top.x + (room ? 0.55 : 0), top.y, room ? -0.7 : -0.1);
      } else {
        const target = world.camX() + (i - 1) * 2.2;
        if (f.walkAt < 0 && Math.abs(target - f.x) > 1.6) {
          f.walkFrom = f.x;
          f.walkTo = f.x + Math.sign(target - f.x) * Math.min(1.6, Math.abs(target - f.x));
          f.walkAt = t;
        }
        if (f.walkAt >= 0) {
          const w = hopCurve(t - f.walkAt, 0.3);
          if (!w) {
            f.x = f.walkTo;
            f.walkAt = -1;
          } else {
            f.x = f.walkFrom + (f.walkTo - f.walkFrom) * (w.phase === 'air' ? w.p : w.phase === 'crouch' ? 0 : 1);
            walkY = w.y;
            face = f.walkTo > f.walkFrom ? Math.PI / 2 : -Math.PI / 2;
          }
        }
        base = world.bankSpot(f.x);
      }
      const h = hopCurve(t - f.hopAt, 0.45);
      f.rig.root.position.set(base.x, base.y + walkY + (h ? h.y : 0), base.z);
      f.rig.sy = h ? h.sy : null;
      f.rig.look.pitch = -0.2;
      f.rig.turn.rotation.y = turnToward(f.rig.turn.rotation.y, face, 1 - Math.exp(-10 * dt));
      f.rig.update(t, dt);
    });

    // the counting number pops up over the critter as it lands
    const age = t - S.floatAt;
    if (age < 0.9) {
      const r = stage.getBoundingClientRect();
      const v = world.toScreen(new THREE.Vector3(world.padX(S.floatN), 2.1 - (0.9 - age) * 0.4, 0));
      floatEl.hidden = false;
      floatEl.textContent = String(S.floatN);
      floatEl.style.left = (v.x - r.left) + 'px';
      floatEl.style.top = (v.y - r.top) + 'px';
      floatEl.style.opacity = String(1 - Math.max(0, age - 0.5) / 0.4);
    } else {
      floatEl.hidden = true;
    }
    world.frameLine(focusX(), spanX(), dt, false);
  }

  /* ----------------------------------------------- switch critters */
  ORDER.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'who-opt';
    b.setAttribute('aria-label', fullName(k));
    b.innerHTML = `<span aria-hidden="true">${KINDS[k].emoji}</span><span class="who-name" aria-hidden="true">${KINDS[k].name}</span>`;
    b.addEventListener('click', () => {
      closePop();
      whoBtn.focus({ preventScroll: true });
      requestSwap(k);
    });
    whoPop.appendChild(b);
  });

  function updateWho() {
    whoBtn.innerHTML = `<span aria-hidden="true">${KINDS[S.kind].emoji}</span>`;
    whoBtn.setAttribute('aria-label', `Switch critter. Now playing: ${fullName(S.kind)}`);
    [...whoPop.children].forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === S.kind)));
  }
  function openPop() {
    whoPop.hidden = false;
    whoBtn.setAttribute('aria-expanded', 'true');
    (whoPop.querySelector('[aria-pressed="true"]') || whoPop.firstElementChild).focus({ preventScroll: true });
  }
  function closePop() {
    if (whoPop.hidden) return;
    whoPop.hidden = true;
    whoBtn.setAttribute('aria-expanded', 'false');
  }
  whoBtn.addEventListener('click', () => (whoPop.hidden ? openPop() : closePop()));

  function requestSwap(k) {
    if (k === S.kind) return;
    if (S.mode === 'wait') swap(k);
    else S.pendingSwap = k;            // mid-hop: swap as soon as it lands
  }

  function swap(k) {
    S.kind = k;
    updateWho();
    const pos = player.root.position.clone();
    placePlayer(pos, player.turn.rotation.y);
    makeFriends();
    if (S.p && S.p.stage === 'gap' && !S.finished) friends[S.qi % friends.length].onPad = S.p.end;
    world.burst(above(pos, 0.8), 'poof');
    Sfx.play('poof');
    later(0.15, () => Sfx.play('voice', KINDS[k].voice));
    S.popAt = time();
    tell(`Hi, I'm ${KINDS[k].name}! Let's keep hopping.`);
    drawStrip();
    // keep the picking screen in step with the new choice
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
  }

  $('menuBtn').addEventListener('click', showMenu);

  /* ------------------------------------------------------- keyboard */
  lineInput.addEventListener('keydown', (e) => {
    if (S.screen !== 'play' || !S.p || S.p.stage !== 'guess' || S.guess != null || S.mode !== 'wait') return;
    const arrow = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (arrow || e.key === 'Enter' || e.key === ' ') e.preventDefault();
    if (arrow) {
      if (!S.keys) S.keys = true;               // the first press shows where the ring is
      else S.cursor = clamp(S.cursor + arrow, 0, S.pond.max);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (S.keys) {
        makeGuess(S.cursor);
        return;
      }
      S.keys = true;
    } else {
      return;
    }
    world.showRing(S.cursor);
    srFocus.textContent = `Pad ${S.cursor}`;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!whoPop.hidden) {
        e.preventDefault();
        closePop();
        whoBtn.focus({ preventScroll: true });
      } else if (!won.hidden) {
        e.preventDefault();
        showMenu();
      }
      return;
    }
    if (e.key === 'Tab' && !won.hidden) {          // keep focus inside the dialog
      const btns = [...won.querySelectorAll('button')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? btns.length - 1 : 1) + btns.length) % btns.length].focus();
      return;
    }
    // number keys answer "how far to your friend?"
    if (/^[1-9]$/.test(e.key) && S.screen === 'play' && S.p && S.p.stage === 'gap' && S.mode === 'wait' && won.hidden && whoPop.hidden) {
      const b = [...actions.querySelectorAll('.num-btn')].find((x) => x.textContent === e.key && !x.disabled);
      if (b) {
        e.preventDefault();
        b.click();
      }
    }
  });

  /* -------------------------------------------------------- pointer */
  lineInput.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play' || !S.p) return;
    closePop();
    if (S.keys && S.guess == null) {
      S.keys = false;
      world.showRing(null);
    }
    if (S.mode === 'wait' && world.hits(e.clientX, e.clientY, player.root)) {
      S.popAt = time();
      Sfx.play('voice', KINDS[S.kind].voice);
      return;
    }
    if (S.p.stage === 'guess') {
      const n = world.nearestPad(e.clientX, e.clientY);
      if (n != null) makeGuess(n);
    }
  });

  /* ----------------------------------------------------------- loop */
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
    if (S.screen === 'pick') tickPick(t, dt);
    else if (S.screen === 'play') tickPlay(t, dt);
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
    stage.classList.toggle('tall', stage.clientWidth < stage.clientHeight * 0.8);
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);
  fit();
  fonts();
  showPick();
})();
