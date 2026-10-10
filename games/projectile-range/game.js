/* Projectile Range: the game itself.
 *
 * Pick a level, set the launch angle and speed, and launch. The ball flies
 * on the exact path for the level's gravity: its position is worked out
 * from the time since launch on the game clock, never by adding up small
 * steps, so it cannot drift from the formula. It drops a dot at equal time
 * steps. After it lands come the measured time, height and distance, how
 * far it was from the target, and the full working on request. Needs
 * THREE, Toon, Critters, Sfx, Flight and World, loaded before it. Nothing
 * is stored: ticks for finished levels last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const LEVELS = Flight.LEVELS;
  const say = Flight.say;
  const { f1, f2, num, deg, mps, gap } = Flight.fmt;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);

  const stage = $('stage');
  const canvas = $('view');
  const field = $('field');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const working = $('working');
  const tellEl = $('tell');
  const consoleEl = $('console');
  const srFocus = $('srFocus');
  const angleIn = $('angle');
  const speedIn = $('speed');
  const fireBtn = $('fireBtn');
  const guessIn = $('guess');

  function noGl() {
    ['menu', 'hud', 'done', 'working', 'field'].forEach((id) => { $(id).hidden = true; });
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
    screen: 'menu',          // menu, aim, flight, done
    card: 'done',            // what the card shows: done, or out (of shots)
    kind: 'frog',
    index: 0,
    level: null,
    angle: 45,
    speed: 15,
    prog: null,              // Flight.progress: shots, closest miss, two-angle hits
    shot: null,              // the last Flight.fly result
    shotAt: 0,
    dots: 0,
    dotEvery: 0.1,
    guess: null,
    predict: false,
    hint: 0,
    solved: new Set(),       // this visit only
    bonus: new Set(),
    clock: 0,
    timers: [],
    hopAt: -9,
    cheer: false,
  };
  const ballPos = new THREE.Vector3();
  let rig = null;

  function later(delay, fn) {
    S.timers.push({ at: S.clock + delay, fn });
  }
  function runTimers() {
    const due = S.timers.filter((x) => S.clock >= x.at);
    S.timers = S.timers.filter((x) => S.clock < x.at);
    due.forEach((x) => x.fn());
  }
  function tell(text) {
    tellEl.textContent = text;
  }

  // the distance labels are painted in Fredoka, so wait for it (briefly)
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
  const pickButtons = ORDER.map((kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'racer';
    b.dataset.kind = kind;
    b.setAttribute('aria-label', `${KINDS[kind].name} the ${KINDS[kind].kind} loads the launcher`);
    b.innerHTML = `<span class="racer-emoji" aria-hidden="true">${KINDS[kind].emoji}</span><span class="racer-name" aria-hidden="true">${KINDS[kind].name}</span>`;
    b.addEventListener('click', () => pickCritter(kind));
    $('pickRow').appendChild(b);
    return b;
  });
  const levelButtons = [];
  Flight.GROUPS.forEach((g) => {
    const sec = document.createElement('section');
    sec.className = 'level-group';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const p = document.createElement('p');
    p.textContent = g.blurb;
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
    sec.append(h, p, row);
    $('levelGroups').appendChild(sec);
  });
  function drawLevelButtons() {
    levelButtons.forEach((b, i) => {
      const lv = LEVELS[i];
      const ok = S.solved.has(i);
      const bonus = S.bonus.has(i);
      const p = Flight.PLANETS[lv.planet];
      const away = lv.planet === 'earth' ? '' : `<span class="world">${p.emoji}</span>`;
      b.innerHTML = `<span aria-hidden="true">${i + 1}${away}</span>` +
        (ok ? '<span class="tick" aria-hidden="true">✓</span>' : '') +
        (bonus ? '<span class="bonus" aria-hidden="true">🔮</span>' : '');
      b.setAttribute('aria-label', `Level ${i + 1}${lv.planet === 'earth' ? '' : `, on ${p.name}`}${ok ? ', done this visit' : ''}${bonus ? ', with a prediction bonus' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function pickCritter(kind) {
    S.kind = kind;
    pickButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    if (rig) {
      world.actors.remove(rig.root);
      rig.dispose();
    }
    rig = Critters.create(kind);
    rig.root.scale.setScalar(0.8);
    rig.root.position.copy(world.LOADER);
    rig.turn.rotation.y = 0.55;
    world.actors.add(rig.root);
    S.hopAt = S.clock;
    if (S.screen === 'menu') Sfx.play('voice', KINDS[kind].voice);
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    drawLevelButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    working.hidden = true;
    field.hidden = true;
    world.setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- levels */
  function startLevel(i, keep) {
    fonts().then(() => begin(i, keep));
  }

  function begin(i, keep) {
    const lv = LEVELS[i];
    S.index = i;
    S.level = lv;
    if (!keep) {
      S.angle = lv.angle;
      S.speed = lv.speed;
    }
    S.prog = null;
    S.shot = null;
    S.hint = 0;
    S.guess = null;
    S.timers = [];
    S.cheer = false;
    world.setWorld(lv.planet);
    world.build(lv);
    world.ball(0, 0, false);
    S.screen = 'aim';
    menu.hidden = true;
    done.hidden = true;
    working.hidden = true;
    hud.hidden = false;
    field.hidden = false;
    $('last').hidden = true;
    $('timerChip').hidden = true;
    fireBtn.disabled = false;
    fireBtn.textContent = '🎯 Launch';
    fireBtn.removeAttribute('aria-label');
    setControls(true);
    drawControls();
    world.aim(S.angle, S.speed);
    world.showAim(true);
    drawInfo();
    tell(say.start(lv));
    placeConsole();
    measure(true);
    world.rate(calm() ? 9 : 3);
    world.view('overview', null, true);
    field.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------- the controls */
  function setControls(on) {
    const lv = S.level;
    const a = on && lv.fix !== 'angle';
    const v = on && lv.fix !== 'speed';
    angleIn.disabled = !a;
    $('angleDown').disabled = !a;
    $('angleUp').disabled = !a;
    speedIn.disabled = !v;
    $('speedDown').disabled = !v;
    $('speedUp').disabled = !v;
    guessIn.disabled = !on;
    $('angleCtl').classList.toggle('fixed', lv.fix === 'angle');
    $('speedCtl').classList.toggle('fixed', lv.fix === 'speed');
    const [lo, hi] = Flight.speedRange(lv);
    speedIn.min = String(lo);
    speedIn.max = String(hi);
    angleIn.min = String(Flight.ANGLE.min);
    angleIn.max = String(Flight.ANGLE.max);
  }
  function drawControls() {
    const lv = S.level;
    angleIn.value = String(S.angle);
    speedIn.value = String(S.speed);
    $('angleVal').textContent = deg(S.angle);
    $('speedVal').textContent = mps(S.speed);
    angleIn.setAttribute('aria-valuetext', `${f1(S.angle)} degrees${lv.fix === 'angle' ? ', fixed' : ''}`);
    speedIn.setAttribute('aria-valuetext', `${f1(S.speed)} metres per second${lv.fix === 'speed' ? ', fixed' : ''}`);
  }
  function setAngle(a, from) {
    if (S.screen !== 'aim') return;
    if (S.level.fix === 'angle') {
      if (from === 'key') tell(say.fixed('angle'));
      return;
    }
    const v = Flight.snapAngle(a);
    if (v !== S.angle) {
      S.angle = v;
      world.aim(S.angle, S.speed);
    }
    drawControls();
    if (from === 'key') srFocus.textContent = `Angle ${f1(v)} degrees`;
  }
  function setSpeed(s, from) {
    if (S.screen !== 'aim') return;
    if (S.level.fix === 'speed') {
      if (from === 'key') tell(say.fixed('speed'));
      return;
    }
    const v = Flight.snapSpeed(S.level, s);
    if (v !== S.speed) {
      S.speed = v;
      world.aim(S.angle, S.speed);
    }
    drawControls();
    if (from === 'key') srFocus.textContent = `Speed ${f1(v)} metres per second`;
  }
  angleIn.addEventListener('input', () => setAngle(+angleIn.value, 'slider'));
  speedIn.addEventListener('input', () => setSpeed(+speedIn.value, 'slider'));

  /* − and + step by the fine amount, and keep stepping, faster, while held.
   * The repeat runs on the game clock, from the frame loop, so a slow frame
   * can never squeeze in extra steps before the finger's lift is seen. */
  const held = { fn: null, since: 0, next: 0 };
  function stepper(btn, fn) {
    let byPointer = false;
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled || e.button > 0) return;
      e.preventDefault();
      byPointer = true;
      fn();
      Object.assign(held, { fn, since: S.clock, next: S.clock + 0.45 });
    });
    const release = () => {
      if (held.fn === fn) held.fn = null;
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, release));
    btn.addEventListener('click', () => {
      if (byPointer) byPointer = false;                    // the press already stepped
      else fn();                                           // Enter or Space on the focused button
    });
  }
  function holdTick() {
    if (!held.fn) return;
    if (S.screen !== 'aim') held.fn = null;
    else if (S.clock >= held.next) {
      held.fn();
      held.next = S.clock + Math.max(0.035, 0.11 - (S.clock - held.since) * 0.03);
    }
  }
  stepper($('angleDown'), () => setAngle(S.angle - Flight.ANGLE.step));
  stepper($('angleUp'), () => setAngle(S.angle + Flight.ANGLE.step));
  stepper($('speedDown'), () => setSpeed(S.speed - Flight.SPEED.step));
  stepper($('speedUp'), () => setSpeed(S.speed + Flight.SPEED.step));

  /* --------------------------------------------------------- the HUD */
  function drawInfo() {
    const lv = S.level;
    const p = Flight.PLANETS[lv.planet];
    const used = S.prog ? S.prog.shots : 0;
    $('levelChip').textContent = `Level ${lv.n}${S.bonus.has(S.index) ? ' · 🔮✓' : ''} · ${say.shots(used, lv.shots)}`;
    $('worldChip').textContent = `${p.emoji} g = ${num(p.g)} m/s² · 🎯 ${num(lv.target.x)} m ± ${num(lv.target.w)} m`;
    const pair = $('pairChip');
    pair.hidden = !lv.two;
    if (lv.two) {
      const pr = S.prog || {};
      pair.innerHTML = `Low ${pr.low != null ? `<span class="got">✓ ${deg(pr.low)}</span>` : '–'}<span class="sep">·</span>High ${pr.high != null ? `<span class="got">✓ ${deg(pr.high)}</span>` : '–'}`;
    }
  }
  function drawLast(r) {
    const m = r.measured;
    const where = r.hit.kind === 'side' ? 'stopped' : 'landed';
    $('lastText').innerHTML = `<span class="wide">Shot ${S.prog.shots}: </span>time <b>${f2(m.t)} s</b> · top <b>${f2(m.h)} m</b> · ${where} <b>${f2(m.x)} m</b><span class="wide"> · a dot every ${S.dotEvery} s</span>`;
    $('last').hidden = false;
  }

  // the console sits just above the message strip, however many lines the message takes
  function placeConsole() {
    consoleEl.style.bottom = `${tellEl.offsetHeight + 18}px`;
  }
  // tell the camera which part of the stage the HUD leaves free
  function measure(snap) {
    if (hud.hidden) return;
    const r = stage.getBoundingClientRect();
    let top = 0;
    hud.querySelectorAll('.tools, .chip').forEach((el) => {
      if (el.offsetParent) top = Math.max(top, el.getBoundingClientRect().bottom - r.top);
    });
    const bottom = r.bottom - consoleEl.getBoundingClientRect().top;
    // the tape's labels are centred on the ground, so leave room for their lower half too
    world.setInsets({ top: top + 8, right: 10, bottom: bottom + 22, left: 10 }, snap);
  }

  /* ---------------------------------------------------------- shooting */
  // dots at equal time steps: 0.05 s for a quick shot up to 0.25 s for a slow one, at most 40 of them
  const dotStep = (T) => [0.05, 0.1, 0.2, 0.25, 0.5].find((s) => T / s <= 40) || 0.5;

  function launch() {
    if (S.screen !== 'aim' || !S.level) return;
    if (S.prog && (S.prog.done || S.prog.out)) return;
    const lv = S.level;
    S.guess = null;
    if (S.predict) {
      const g = parseFloat(String(guessIn.value).replace(',', '.'));
      if (Number.isFinite(g) && g >= 0) S.guess = g;
    }
    S.shot = Flight.fly(lv, S.angle, S.speed);
    S.shotAt = S.clock;
    S.dots = 0;
    S.dotEvery = dotStep(S.shot.hit.t);
    S.screen = 'flight';
    setControls(false);
    fireBtn.textContent = '⏩ Skip';
    fireBtn.setAttribute('aria-label', 'Skip to the landing');
    working.hidden = true;
    ballPos.set(0, 0, 0);
    world.newTrail(false);
    world.clearShot();
    world.showAim(false);
    world.ball(0, 0, true);
    world.spin(5 + S.speed * 0.25);
    world.fire(S.clock, S.angle, calm());
    world.rate(calm() ? 10 : 4);
    world.view('follow', () => ballPos);
    $('timerChip').hidden = false;
    $('timerChip').textContent = '⏱ t = 0.00 s';
    Sfx.play('poof');
    S.hopAt = S.clock;
    tell(`Launched at ${deg(S.angle)} and ${mps(S.speed)}${S.guess != null ? `. You predicted ${f1(S.guess)} m` : ''}.`);
  }

  // jump to the landing: the rest of the path appears at once
  function skip() {
    if (S.screen !== 'flight') return;
    S.shotAt = S.clock - S.shot.hit.t;
  }

  function flightTick() {
    const r = S.shot;
    const t = Math.min(S.clock - S.shotAt, r.hit.t);
    const p = Flight.at(r.s, t);
    ballPos.set(p.x, p.y, 0);
    world.ball(p.x, p.y, true);
    while ((S.dots + 1) * S.dotEvery < r.hit.t - 1e-9 && (S.dots + 1) * S.dotEvery <= t) {
      S.dots++;
      const q = Flight.at(r.s, S.dots * S.dotEvery);
      world.dot(q.x, q.y);
    }
    $('timerChip').textContent = `⏱ t = ${f2(t)} s`;
    if (S.clock - S.shotAt >= r.hit.t) land();
  }

  function land() {
    const r = S.shot;
    const lv = S.level;
    const h = r.hit;
    S.screen = 'aim';
    ballPos.set(h.x, h.y, 0);
    world.dot(h.x, h.y);
    world.ball(h.x, h.y, true);
    world.settle(S.clock, h, r.g);
    world.spin(0);
    $('timerChip').textContent = `⏱ t = ${f2(h.t)} s`;
    const before = S.prog || {};
    S.prog = Flight.progress(lv, S.prog, r);
    let msg = say.result(lv, r, before);
    if (S.guess != null) {
      msg += ` ${say.predict(S.guess, h.x)}`;
      if (Flight.predicted(S.guess, h.x).ok) S.bonus.add(S.index);
    }
    tell(msg);
    world.showShot(r, lv, `${gap(Math.abs(r.miss), lv.target.w)} m ${r.miss < 0 ? 'short' : 'long'}`);
    drawLast(r);
    drawInfo();
    const spot = new THREE.Vector3(h.x, h.y + 0.4, 0);
    if (r.onTarget) {
      Sfx.play('good', 6);
      world.burst(spot, 'sparkle');
      world.targetPulse(S.clock);
      S.hopAt = S.clock;
    } else if (h.kind === 'side') {
      Sfx.play('pop');
      later(0.15, () => Sfx.play('uhoh'));
      world.burst(spot, 'dust');
      if (rig) rig.react('earshake');
    } else {
      Sfx.play('pop');
      world.burst(spot, 'dust');
      if (rig) rig.react('shake');
    }
    // close in on the landing, then show the whole shot
    world.rate(calm() ? 9 : 2.5);
    world.view('landing', r);
    later(calm() ? 0.6 : 1.5, () => {
      if (S.shot === r && S.screen !== 'flight' && S.screen !== 'menu') {
        world.rate(calm() ? 9 : 2);
        world.view('review', r);
        world.showApex(r);
      }
    });
    fireBtn.textContent = '🎯 Launch';
    fireBtn.removeAttribute('aria-label');
    if (S.prog.done) {
      fireBtn.disabled = true;
      later(1.6, finish);
    } else if (S.prog.out) {
      fireBtn.disabled = true;
      later(1.6, outOfShots);
    } else {
      setControls(true);
    }
  }

  function finish() {
    const lv = S.level;
    S.screen = 'done';
    S.card = 'done';
    S.solved.add(S.index);
    S.hopAt = S.clock;
    S.cheer = true;
    Sfx.play('win');
    const t = lv.target;
    const y = t.on >= 0 ? lv.blocks[t.on].h : 0;
    if (!calm()) world.burst(new THREE.Vector3(t.x, y + 2, 0), 'confetti');
    $('doneTitle').textContent = `Level ${lv.n} done!`;
    let sub = say.done(lv, S.prog.shots);
    if (lv.two) sub += ` ${deg(S.prog.low)} + ${deg(S.prog.high)} = ${deg(S.prog.low + S.prog.high)}.`;
    $('doneSub').textContent = sub;
    tell(sub);
    $('doneTip').textContent = lv.tip;
    $('nextLevel').hidden = S.index >= LEVELS.length - 1;
    $('again').textContent = 'Play it again';
    done.hidden = false;
    ($('nextLevel').hidden ? $('again') : $('nextLevel')).focus({ preventScroll: true });
  }
  function outOfShots() {
    const lv = S.level;
    S.screen = 'done';
    S.card = 'out';
    $('doneTitle').textContent = 'Out of shots';
    $('doneSub').textContent = say.closest(S.prog.best);
    tell(say.outOfShots(lv, S.prog.best));
    const hs = Flight.hints(lv, S.prog);
    $('doneTip').textContent = `Hint: ${hs[hs.length - 2]}`;
    $('nextLevel').hidden = true;
    $('again').textContent = 'Try again';
    done.hidden = false;
    $('again').focus({ preventScroll: true });
  }
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('again').addEventListener('click', () => startLevel(S.index, S.card === 'out'));
  $('allLevels').addEventListener('click', showMenu);
  $('menuBtn').addEventListener('click', showMenu);

  /* -------------------------------------------------- help and views */
  function hint() {
    if (S.screen !== 'aim' || !S.level) return;
    const list = Flight.hints(S.level, S.prog || {});
    const k = S.hint % list.length;
    S.hint++;
    tell(say.hint(list[k], k + 1, list.length));
  }
  function resetView() {
    if (S.screen === 'menu' || S.screen === 'flight') return;
    world.rate(calm() ? 9 : 3);
    if (S.shot) {
      world.view('review', S.shot);
      world.showApex(S.shot);
    } else {
      world.view('overview');
    }
    srFocus.textContent = say.view();
  }
  function togglePredict() {
    if (!S.level || S.screen === 'menu') return;
    S.predict = !S.predict;
    $('predictBtn').setAttribute('aria-pressed', String(S.predict));
    $('guessBox').hidden = !S.predict;
    tell(S.predict ? 'Predictions on: type where you think the ball will land, then launch.' : 'Predictions off.');
    if (S.predict && !guessIn.disabled) guessIn.focus({ preventScroll: true });
  }
  function openWorking() {
    if (!S.shot || S.screen !== 'aim') return;
    const list = $('workList');
    list.textContent = '';
    Flight.working(S.level, S.shot).forEach((l) => {
      const dt = document.createElement('dt');
      dt.textContent = l.k;
      const dd = document.createElement('dd');
      dd.textContent = l.v;
      list.append(dt, dd);
    });
    $('workTitle').textContent = `Shot ${S.prog.shots}: the working`;
    working.hidden = false;
    $('workClose').focus({ preventScroll: true });
  }
  function closeWorking() {
    working.hidden = true;
    field.focus({ preventScroll: true });
  }
  $('hintBtn').addEventListener('click', hint);
  $('viewBtn').addEventListener('click', resetView);
  $('predictBtn').addEventListener('click', togglePredict);
  $('workBtn').addEventListener('click', openWorking);
  $('workClose').addEventListener('click', closeWorking);
  fireBtn.addEventListener('click', () => {
    if (S.screen === 'flight') skip();
    else launch();
  });

  /* -------------------------------------------------------------- input */
  document.addEventListener('keydown', (e) => {
    if (S.screen === 'menu') return;
    if (!working.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWorking();
      } else if (e.key === 'Tab') {
        e.preventDefault();                                  // keep focus in the dialog
        $('workClose').focus();
      }
      return;
    }
    if (!done.hidden || S.screen === 'done') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    const tag = el && el.tagName;
    const typing = tag === 'INPUT' && el.type !== 'range';
    const slider = tag === 'INPUT' && el.type === 'range';
    const button = !!(el && el.closest && el.closest('button, a'));
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (button) return;                                    // the button does its own thing
      if (typing && k !== 'Enter') return;
      e.preventDefault();
      if (S.screen === 'flight') skip();
      else launch();
      return;
    }
    if (typing || slider) return;                            // sliders keep their own arrow keys
    const fine = e.shiftKey;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const step = fine ? Flight.ANGLE.step : Flight.ANGLE.coarse;
      setAngle(S.angle + (k === 'ArrowRight' ? step : -step), 'key');
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const step = fine ? Flight.SPEED.step : Flight.SPEED.coarse;
      setSpeed(S.speed + (k === 'ArrowUp' ? step : -step), 'key');
    } else {
      const c = k.length === 1 ? k.toLowerCase() : k;
      if (c === 'h') {
        e.preventDefault();
        hint();
      } else if (c === 'r') {
        e.preventDefault();
        resetView();
      } else if (c === 'w') {
        e.preventDefault();
        openWorking();
      } else if (c === 'p') {
        e.preventDefault();
        togglePredict();
      }
    }
  });

  // drag to look around; pinch, or Ctrl and the wheel, to zoom
  const pointers = new Map();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  field.addEventListener('pointerdown', (e) => {
    if (field.setPointerCapture) field.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = pointers.size === 2 ? spread() : 0;
  });
  field.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 1) world.pan(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const s = spread();
      if (pinch > 0 && s > 0) world.zoom(pinch / s);
      pinch = s;
    }
  });
  const lift = (e) => {
    pointers.delete(e.pointerId);
    pinch = pointers.size === 2 ? spread() : 0;
  };
  field.addEventListener('pointerup', lift);
  field.addEventListener('pointercancel', lift);
  field.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;                                  // a plain wheel still scrolls the page
    e.preventDefault();
    world.zoom(Math.exp(clamp(e.deltaY, -100, 100) * 0.003));
  }, { passive: false });

  /* ------------------------------------------------------- every frame */
  const look = new THREE.Vector3();
  function tick(t, dt) {
    runTimers();
    holdTick();
    if (S.screen === 'flight') flightTick();
    if (!rig) return;
    const hop = hopCurve(t - S.hopAt, S.cheer ? 0.7 : 0.45);
    rig.root.position.copy(world.LOADER);
    rig.root.position.y = hop ? hop.y : 0;
    rig.sy = hop ? hop.sy : null;
    let face = 0.55;
    if (hop && S.cheer && hop.phase === 'air' && !calm()) face += hop.p * TAU;
    if (!hop) S.cheer = false;
    rig.turn.rotation.y = face;
    // watch the ball in flight, otherwise the target
    if (S.level && (S.screen === 'flight' || S.shot)) look.copy(ballPos);
    else if (S.level) look.set(S.level.target.x, 0, 0);
    else look.set(20, 0, 0);
    const p = rig.root.position;
    const dx = look.x - p.x;
    const dz = look.z - p.z;
    const yaw = clamp(Math.atan2(dx, dz) - face, -1.3, 1.3);
    const pitch = clamp(-Math.atan2(look.y - 1, Math.hypot(dx, dz)), -0.7, 0.3);
    const k = 1 - Math.exp(-6 * dt);
    rig.look.yaw += (yaw - rig.look.yaw) * k;
    rig.look.pitch += (pitch - rig.look.pitch) * k;
    rig.update(t, dt);
  }

  /* --------------------------------------------------------------- loop */
  let raf = 0;
  let running = false;
  let last = 0;
  const now = () => performance.now() / 1000;
  function loop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    const n = now();
    const dt = Math.min(Math.max(n - last, 0), 0.05);
    last = n;
    S.clock += dt;
    tick(S.clock, dt);
    world.update(S.clock, dt, calm());
    world.render();
    if (running) loop();
  }
  function start() {
    running = true;
    if (!document.hidden) {
      last = now();
      loop();
    }
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  // a hidden tab stops the clock, so a flight picks up where it left off
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (running) {
      last = now();
      loop();
    }
  });

  function fit() {
    world.resize();
    placeConsole();
    measure(false);
  }
  if (window.ResizeObserver) {
    new ResizeObserver(fit).observe(stage);
    new ResizeObserver(() => {
      placeConsole();
      measure(false);
    }).observe(tellEl);
    new ResizeObserver(() => measure(false)).observe(consoleEl);
  } else {
    window.addEventListener('resize', fit);
  }
  fit();
  fonts().then(() => world.repaint());
  pickCritter('frog');
  S.hopAt = -9;
  // the first level, behind the menu
  world.setWorld('earth');
  world.build(LEVELS[0]);
  world.aim(LEVELS[0].angle, LEVELS[0].speed);
  showMenu();
  world.view('overview', null, true);
  start();
})();
