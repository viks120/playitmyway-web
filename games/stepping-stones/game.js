/* Stepping Stones: the game itself.
 *
 * Screens (pick a critter, pick a pond, play), the rules of movement, input
 * by tap and by keyboard, the HUD, and the hop, splash and celebrate
 * choreography. Needs THREE, Toon, Ponds, Critters, Sfx and World, loaded
 * before it. Nothing is stored: stars live in this page's memory only.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const ROWS = Ponds.ROWS;
  const COLS = Ponds.COLS;
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);
  const fullName = (k) => `${KINDS[k].name} the ${KINDS[k].kind}`;
  // in the pond: small enough that a critter does not hide the numbers on the row ahead
  const CRITTER_SIZE = 0.72;
  const same = (a, b) => !!a && !!b && a.type === b.type && a.r === b.r && a.c === b.c;

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
  const say = $('say');
  const srFocus = $('srFocus');
  const ruleText = $('ruleText');
  const hintText = $('hintText');
  const hintBtn = $('hintBtn');
  const whoBtn = $('whoBtn');
  const whoPop = $('whoPop');
  const won = $('won');
  const pickGrid = $('pickGrid');
  const pickGo = $('pickGo');
  const menuGroups = $('menuGroups');
  const screens = { pick: $('screenPick'), menu: $('screenMenu') };

  function noGl() {
    ['screenPick', 'screenMenu', 'hud', 'pondInput', 'won'].forEach((id) => { $(id).hidden = true; });
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
  const START = { type: 'start' };
  const S = {
    screen: 'pick',
    kind: null,
    pondIndex: 0,
    pond: null,
    sunk: null,
    at: START,
    prev: START,
    endCol: 0,
    mode: 'idle',
    modeAt: 0,
    hop: null,
    bad: null,
    from: null,
    splashes: 0,
    lastStars: 0,
    stars: Object.create(null),       // best stars per pond, this visit only
    focus: null,
    keys: false,
    pointer: null,
    faceAt: 0,
    yawTarget: 0,
    landAt: -9,
    popAt: -9,
    nudgeAt: -9,
    rippleAt: 0,
    splashed: false,
    wonShown: false,
    pendingSwap: null,
    timers: [],
  };
  let player = null;
  let friends = [];
  let pickRigs = [];

  function setMode(m) {
    S.mode = m;
    S.modeAt = time();
  }
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
    say.textContent = text;
    say.className = 'say' + (mood ? ' ' + mood : '');
  }

  function showScreen(name) {
    S.screen = name;
    screens.pick.hidden = name !== 'pick';
    screens.menu.hidden = name !== 'menu';
    hud.hidden = name !== 'play';
    pondInput.hidden = name !== 'play';
    won.hidden = true;
    closePop();
    world.show(name === 'play' ? 'pond' : 'picker');
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
    for (const fam of Ponds.FAMILIES) {
      const sec = document.createElement('section');
      sec.className = 'pond-family';
      const h = document.createElement('h3');
      h.textContent = fam.title;
      const grid = document.createElement('div');
      grid.className = 'pond-grid';
      Ponds.LIST.forEach((p, i) => {
        if (p.family !== fam.id) return;
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
      });
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

  // the stone labels are painted in Fredoka, so wait for it (briefly)
  function play(index) {
    fonts().then(() => begin(index));
  }

  function begin(index) {
    S.pondIndex = index;
    S.pond = Ponds.generate(Ponds.LIST[index].id, Math.floor(Math.random() * 2147483647));
    S.sunk = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    S.at = S.prev = START;
    S.splashes = 0;
    S.focus = null;
    S.wonShown = false;
    S.pendingSwap = null;
    S.timers = [];
    setMode('idle');
    world.buildPond(S.pond);
    placePlayer(world.startTop(), 0);
    makeFriends();
    ruleText.innerHTML = S.pond.rule;
    hintText.textContent = S.pond.hint;
    hintText.hidden = true;
    hintBtn.setAttribute('aria-pressed', 'false');
    showScreen('play');
    world.framePond(player.root.position.z, 0, true);
    tell(`${S.pond.ruleText}! Tap a glowing stone next to ${KINDS[S.kind].name}.`);
    S.faceAt = time();
    afterMove();
    pondInput.focus({ preventScroll: true });
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

  // the other three wait on the far bank
  function makeFriends() {
    friends.forEach((f) => {
      world.actors.remove(f.root);
      f.dispose();
    });
    friends = ORDER.filter((k) => k !== S.kind).map((k, i) => {
      const f = Object.assign(Critters.create(k), { hopAt: -9, spot: world.friendSpot(i) });
      f.root.scale.setScalar(CRITTER_SIZE);
      f.root.position.copy(f.spot);
      world.actors.add(f.root);
      return f;
    });
  }

  /* Where can the critter hop from node n? Any touching stone that has not
   * sunk, diagonals and backwards included; from the near bank, any stone in
   * the first row; from the first row, back onto the near bank (a right
   * stone there can be a dead end, and without the bank it would strand the
   * critter); from the last row, the far bank too. */
  function options(n) {
    const out = [];
    if (n.type === 'start') {
      for (let c = 0; c < COLS; c++) if (!S.sunk[0][c]) out.push({ type: 'stone', r: 0, c });
      return out;
    }
    if (n.type !== 'stone') return out;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = n.r + dr;
        const c = n.c + dc;
        if ((dr || dc) && r >= 0 && r < ROWS && c >= 0 && c < COLS && !S.sunk[r][c]) out.push({ type: 'stone', r, c });
      }
    }
    if (n.r === 0) out.push(START);
    if (n.r === ROWS - 1) out.push({ type: 'end', c: n.c });
    return out;
  }

  function afterMove() {
    const opts = options(S.at);
    world.showRings(opts);
    S.focus = defaultFocus(opts);
    world.showFocus(S.keys ? S.focus : null);
  }

  function go(n) {
    if (S.mode !== 'idle') return;
    S.hop = { from: player.root.position.clone(), to: n };
    const d = world.nodeTop(n).sub(player.root.position);
    S.yawTarget = Math.atan2(d.x, d.z);
    setMode('hop');
    Sfx.play('hop');
    world.showRings([]);
    world.showFocus(null);
  }

  function arrive(n) {
    S.landAt = time();
    if (n.type === 'end') {
      win(n);
      return;
    }
    if (n.type === 'start') {
      S.at = S.prev = START;
      setMode('idle');
      S.faceAt = time() + 0.35;
      tell('Back on the bank. Pick another stone in the first row!');
      afterMove();
      return;
    }
    const item = S.pond.rows[n.r][n.c];
    const w = world.waterAt(n.r, n.c);
    world.dipStone(n.r, n.c);
    world.ripple(w.x, w.z, 0.62);
    if (item.ok) {
      S.at = S.prev = n;
      setMode('idle');
      S.faceAt = time() + 0.35;
      Sfx.play('good', n.r);
      world.burst(above(world.nodeTop(n), 0.25), 'sparkle');
      friends.forEach((f, i) => { f.hopAt = time() + 0.05 + i * 0.09; });
      tell(n.r === ROWS - 1
        ? `✓ ${item.why}. Now hop onto the bank: your friends are waiting!`
        : `✓ ${item.why}. Nice hop!`, 'good');
      afterMove();
    } else {
      S.bad = n;
      S.splashed = false;
      setMode('wobble');
      Sfx.play('uhoh');
    }
  }

  function splash() {
    S.splashed = true;
    S.splashes++;
    const w = world.waterAt(S.bad.r, S.bad.c);
    Sfx.play('splash');
    world.burst(above(w, 0.05), 'splash');
    world.ripple(w.x, w.z, 0.4);
    later(0.18, () => world.ripple(w.x, w.z, 0.3));
    tell(`Splash! ${S.pond.rows[S.bad.r][S.bad.c].why}`, 'oops');
  }

  // one personality touch each after a splash; Pip's is the swim itself
  const AFTER_SPLASH = { bunny: ['earshake'], frog: [], dino: ['bubble'], kitten: ['puff', 'shake'] };

  function climbedOut() {
    S.at = S.prev;
    setMode('idle');
    S.faceAt = time() + 0.1;
    world.burst(above(player.root.position, 0.7), 'drops');
    for (const name of AFTER_SPLASH[player.kind]) {
      if (name === 'shake' && calm()) continue;
      const length = player.react(name);
      if (name === 'bubble') later(length, () => Sfx.play('pop'));
    }
    afterMove();
  }

  function win(n) {
    S.at = n;
    S.endCol = n.c;
    setMode('won');
    const stars = S.splashes === 0 ? 3 : S.splashes === 1 ? 2 : 1;
    S.lastStars = stars;
    S.stars[S.pond.id] = Math.max(S.stars[S.pond.id] || 0, stars);
    Sfx.play('win');
    world.showRings([]);
    world.showFocus(null);
    if (!calm()) later(0.4, () => world.burst(above(player.root.position, 1.5), 'confetti'));
    tell(`You made it across! ${S.pond.title} cleared.`, 'good');
  }

  function showWon() {
    S.wonShown = true;
    const n = S.lastStars;
    $('wonStars').textContent = '★'.repeat(n) + '☆'.repeat(3 - n);
    $('wonStars').setAttribute('aria-label', `${n} star${n > 1 ? 's' : ''}`);
    $('wonSub').textContent = S.splashes === 0
      ? 'Not a single splash!'
      : `${S.splashes} splash${S.splashes > 1 ? 'es' : ''} on the way.`;
    won.hidden = false;
    $('wonNext').focus({ preventScroll: true });
  }
  $('wonNext').addEventListener('click', () => {
    if (S.pondIndex < Ponds.LIST.length - 1) play(S.pondIndex + 1);
    else showMenu();
  });
  $('wonAgain').addEventListener('click', () => play(S.pondIndex));
  $('wonAll').addEventListener('click', showMenu);

  /* --------------------------------------------------- every frame */
  function tickPlay(t, dt) {
    runTimers();
    const P = player.root.position;
    let lift = 0;
    player.sy = null;
    player.earX = 0;
    switch (S.mode) {
      case 'idle': {
        P.copy(world.nodeTop(S.at));
        if (t > S.faceAt) {
          lookAtPointer(player, dt, -0.24);          // chin up: the camera looks down on them
          S.yawTarget = player.look.yaw * 0.8;
        }
        if (t - S.nudgeAt < 0.5) player.look.yaw = 0.5 * Math.sin((t - S.nudgeAt) * 30);
        const h = hopCurve(t - S.popAt, 0.35);
        if (h) {
          P.y += h.y;
          lift = h.y;
          player.sy = h.sy;
        }
        if (S.pendingSwap) {
          const k = S.pendingSwap;
          S.pendingSwap = null;
          swap(k);
        }
        break;
      }
      case 'hop': {
        const to = world.nodeTop(S.hop.to);
        const h = hopCurve(t - S.modeAt, player.hop);
        if (!h || h.phase === 'land') {
          P.copy(to);
          arrive(S.hop.to);
          break;
        }
        P.lerpVectors(S.hop.from, to, h.phase === 'air' ? h.p : 0);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        player.earX = h.phase === 'air' ? -0.5 * (1 - h.p) + 0.15 * h.p : 0;
        player.look.yaw *= 0.8;
        player.look.pitch *= 0.8;
        break;
      }
      case 'wobble': {
        const k = t - S.modeAt;
        world.wobbleStone(S.bad.r, S.bad.c, 0.16 * Math.sin(k * 26) * Math.min(1, k * 4));
        P.copy(world.nodeTop(S.bad));
        player.look.yaw = 0.35 * Math.sin(k * 18);
        if (k > 0.5) setMode('sink');
        break;
      }
      case 'sink': {
        const k = t - S.modeAt;
        world.wobbleStone(S.bad.r, S.bad.c, 0);
        world.sinkStone(S.bad.r, S.bad.c, Math.min(1, k / 0.5));
        P.copy(world.nodeTop(S.bad));
        P.y -= Math.min(1, k / 0.45) * 0.4;
        player.sy = 1 + 0.1 * Math.sin(k * 30);
        if (!S.splashed && P.y < 0.15) splash();
        if (k > 0.62) {
          S.sunk[S.bad.r][S.bad.c] = true;
          player.root.visible = false;
          setMode('under');
        }
        break;
      }
      case 'under': {
        if (t - S.modeAt > 0.35) {
          const w = world.waterAt(S.bad.r, S.bad.c);
          player.root.visible = true;
          if (player.kind === 'frog') {           // Pip likes the water: a happy swim first
            S.from = w;
            setMode('swim');
          } else {
            S.from = w.setY(-0.5);
            setMode('climb');
          }
        }
        break;
      }
      case 'swim': {
        const k = (t - S.modeAt) / 1.4;
        const a = Math.min(k, 1) * TAU;
        P.set(S.from.x + Math.sin(a) * 0.55, -0.32 + 0.04 * Math.sin(t * 9), S.from.z + 0.55 - Math.cos(a) * 0.55);
        S.yawTarget = a + Math.PI / 2;
        if (t - S.rippleAt > 0.3) {
          S.rippleAt = t;
          world.ripple(P.x, P.z, 0.3);
        }
        if (k >= 1) {
          S.from = P.clone();
          setMode('climb');
        }
        break;
      }
      case 'climb': {
        const to = world.nodeTop(S.prev);
        const h = hopCurve(t - S.modeAt, 1.0, 0.5);
        if (!h) {
          P.copy(to);
          S.landAt = t;
          climbedOut();
          break;
        }
        P.lerpVectors(S.from, to, h.phase === 'air' ? h.p : h.phase === 'crouch' ? 0 : 1);
        P.y += h.y;
        lift = h.y;
        player.sy = h.sy;
        const d = to.clone().sub(S.from);
        S.yawTarget = Math.atan2(d.x, d.z);
        break;
      }
      case 'won': {
        const k = t - S.modeAt;
        P.copy(world.endTop(S.endCol));
        const h = hopCurve(k % 0.9, 0.7);
        if (h) {
          P.y += h.y;
          lift = h.y;
          player.sy = h.sy;
        }
        S.yawTarget = !calm() && k > 0.3 ? ((k % 0.9) / 0.9) * TAU : 0;
        friends.forEach((f, i) => { if (t - f.hopAt > 0.9) f.hopAt = t + i * 0.12; });
        if (k > 0.6 && !S.wonShown) showWon();
        break;
      }
    }
    // the landing jelly wobble carries on after the hop hands over
    if (player.sy == null && t - S.landAt < 0.5) {
      const p = (t - S.landAt) / 0.5;
      player.sy = 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p);
    }
    player.turn.rotation.y = turnToward(player.turn.rotation.y, S.yawTarget, 1 - Math.exp(-14 * dt));
    player.update(t, dt);
    const ground = P.y - lift;
    const dry = player.root.visible && S.mode !== 'swim' && !(S.mode === 'sink' && S.splashed) && ground > 0;
    world.shadow(P.x, ground, P.z, lift, dry);

    friends.forEach((f) => {
      const h = hopCurve(t - f.hopAt, 0.45);
      f.root.position.y = f.spot.y + (h ? h.y : 0);
      f.sy = h ? h.sy : null;
      f.turn.rotation.y = S.mode === 'won' && h && h.phase === 'air' && !calm() ? h.p * TAU : 0;
      f.update(t, dt);
    });
    world.framePond(P.z, dt, false);
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
    if (S.mode === 'idle' || S.mode === 'won') swap(k);
    else S.pendingSwap = k;            // mid-hop: swap as soon as it lands
  }

  function swap(k) {
    S.kind = k;
    updateWho();
    const pos = player.root.position.clone();
    placePlayer(pos, player.turn.rotation.y);
    makeFriends();
    world.burst(above(pos, 0.8), 'poof');
    Sfx.play('poof');
    later(0.15, () => Sfx.play('voice', KINDS[k].voice));
    S.popAt = time();
    tell(`Hi, I'm ${KINDS[k].name}! Let's keep hopping.`);
    // keep the picking screen in step with the new choice
    pickButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ORDER[i] === k)));
    pickGo.textContent = `Let's go, ${KINDS[k].name}! →`;
  }

  /* ------------------------------------------------- hint and menu */
  hintBtn.addEventListener('click', () => {
    const show = hintText.hidden;
    hintText.hidden = !show;
    hintBtn.setAttribute('aria-pressed', String(show));
    if (show) srFocus.textContent = 'Hint: ' + S.pond.hint;
  });
  $('menuBtn').addEventListener('click', showMenu);

  /* ------------------------------------------------------- keyboard */
  const WHERE = {
    '1,-1': 'ahead on the left', '1,0': 'straight ahead', '1,1': 'ahead on the right',
    '0,-1': 'on the left', '0,1': 'on the right',
    '-1,-1': 'behind on the left', '-1,0': 'behind', '-1,1': 'behind on the right',
  };
  function describe(n) {
    if (n.type === 'end') return 'The far bank, where your friends are waiting';
    if (n.type === 'start') return 'The near bank, where you started';
    const spoken = S.pond.rows[n.r][n.c].label.replace('+', ' plus ');
    if (S.at.type === 'start') return `${spoken}, stone ${n.c + 1} of ${COLS} in the first row`;
    return `${spoken}, ${WHERE[(n.r - S.at.r) + ',' + (n.c - S.at.c)]}`;
  }
  function announceFocus() {
    if (S.focus) srFocus.textContent = describe(S.focus);
  }

  // straight ahead if there is a stone there; from the bank, the middle
  function defaultFocus(opts) {
    if (!opts.length) return null;
    if (S.at.type === 'start') return opts.reduce((best, o) => (Math.abs(o.c - 1.5) < Math.abs(best.c - 1.5) ? o : best));
    const ahead = opts.find((o) => o.type === 'stone' && o.r === S.at.r + 1 && o.c === S.at.c);
    return ahead || opts.find((o) => o.type === 'end') || opts.reduce((best, o) => (o.r > best.r ? o : best));
  }

  /* Move the highlight one step in a direction, skipping the critter's own
   * stone and any gaps; each bank counts as a row of its own. */
  function moveFocus(dr, dc) {
    const opts = options(S.at);
    if (!opts.length) return;
    if (!S.focus || !opts.some((o) => same(o, S.focus))) S.focus = defaultFocus(opts);
    const at = (n) => (n.type === 'end' ? [ROWS, S.at.c] : n.type === 'start' ? [-1, S.at.c] : [n.r, n.c]);
    let [r, c] = at(S.focus);
    for (let step = 0; step < 3; step++) {
      r += dr;
      c += dc;
      const hit = opts.find((o) => {
        const [orow, ocol] = at(o);
        return orow === r && (o.type !== 'stone' || ocol === c);
      });
      if (hit) {
        S.focus = hit;
        break;
      }
    }
    world.showFocus(S.focus);
    announceFocus();
  }

  const KEYS = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  pondInput.addEventListener('keydown', (e) => {
    if (S.screen !== 'play') return;
    const dir = KEYS[e.key];
    if (dir) {
      e.preventDefault();
      if (S.mode !== 'idle') return;
      if (!S.keys) {                    // the first press shows where the highlight is
        S.keys = true;
        if (!S.focus) S.focus = defaultFocus(options(S.at));
        world.showFocus(S.focus);
        announceFocus();
        return;
      }
      moveFocus(dir[0], dir[1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      S.keys = true;
      if (S.mode === 'idle' && S.focus) go(S.focus);
    }
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
    }
  });

  /* -------------------------------------------------------- pointer */
  function giggle() {
    S.popAt = time();
    Sfx.play('voice', KINDS[S.kind].voice);
  }

  pondInput.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'play') return;
    closePop();
    if (S.keys) {
      S.keys = false;
      world.showFocus(null);
    }
    if (S.mode !== 'idle') return;
    if (world.hits(e.clientX, e.clientY, player.root)) {
      giggle();
      return;
    }
    const hit = world.pick(e.clientX, e.clientY, 0.34);
    if (!hit) return;
    const opts = options(S.at);
    const end = opts.find((o) => o.type === 'end');
    if (end && hit.z < world.rowZ(ROWS - 1) - 0.9) {
      go(end);
      return;
    }
    const back = opts.find((o) => o.type === 'start');
    if (back && hit.z > world.rowZ(0) + 0.9) {
      go(back);
      return;
    }
    // the nearest stone to the tap counts: small fingers are forgiven
    let best = null;
    let bestD = 0.95;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = world.stoneTop(r, c);
        const d = Math.hypot(p.x - hit.x, p.z - hit.z);
        if (d < bestD) {
          bestD = d;
          best = { type: 'stone', r, c };
        }
      }
    }
    if (!best || same(best, S.at)) return;
    if (S.sunk[best.r][best.c]) {
      tell('That stone has sunk. Pick another one!', 'oops');
      return;
    }
    if (opts.some((o) => same(o, best))) {
      go(best);
      return;
    }
    tell(`Too far! ${KINDS[S.kind].name} can only hop to a stone touching this one.`, 'oops');
    S.nudgeAt = time();
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
