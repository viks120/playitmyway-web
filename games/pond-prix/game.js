/* Pond Prix: the game itself.
 *
 * Pick a racer and a race, then three laps round the pond against the other
 * three critters. The karts follow the road by themselves; the child only
 * changes lane. Three times a lap a question comes up and the road passes
 * three answer arches: the right one gives a boost, a wrong one a splash of
 * mud. Needs THREE, Toon, Critters, Sfx, Race and World, loaded before it.
 * Nothing is stored.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const KINDS = Critters.KINDS;
  const ORDER = Object.keys(KINDS);
  const hopCurve = Critters.hopCurve;
  const say = Race.say;
  const LAPS = Race.LAPS;
  const PADS = Race.TRACK.pads;
  const COLORS = { bunny: '#ff8fb0', frog: '#ffd23f', dino: '#5fd3b4', kitten: '#6aa8ff' };
  const SMART = [0.62, 0.7, 0.78];        // how often each rival picks the right arch
  const V_MAX = 19;
  const CRUISE = 6;                       // speed once over the finish line
  // the starting grid: the player starts in the middle of the pack
  const GRID = { player: { s: -6.5, lane: 1 }, rivals: [{ s: -2.5, lane: 0 }, { s: -2.5, lane: 2 }, { s: -10.5, lane: 1 }] };
  const MEDALS = ['🥇', '🥈', '🥉', '4th'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const above = (v, h) => v.clone().setY(v.y + h);

  const stage = $('stage');
  const canvas = $('view');
  const track = $('track');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const qCard = $('question');
  const qBoard = $('qBoard');
  const qSay = $('qSay');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const countEl = $('count');
  const chips = [...document.querySelectorAll('.chip')];

  function noGl() {
    ['menu', 'hud', 'done', 'track', 'count'].forEach((id) => { $(id).hidden = true; });
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

  const L = world.length;
  const laneX = world.laneX;
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);     // repeatable races, for testing
  const S = {
    screen: 'menu',          // menu, countdown, race, done
    kind: 'bunny',
    cup: 'add10',
    seed: seedMatch ? +seedMatch[1] : Math.floor(Math.random() * 2147483647),
    races: 0,
    plan: { questions: [] },
    asked: -1,               // the question on the board
    right: 0,
    lap: 1,
    place: 1,
    puffAt: 0,
    timers: [],
  };

  // all four karts, each with its critter in the seat
  const cars = ORDER.map((kind) => {
    const kart = world.addKart(COLORS[kind]);
    const rig = Critters.create(kind);
    rig.root.scale.setScalar(0.5);
    kart.seat.add(rig.root);
    return { kind, kart, rig, s: 0, prevS: 0, x: 0, lane: 1, v: 0, roll: 0, lean: 0, steer: 0, hopAt: -9 };
  });
  const me = () => cars.find((c) => c.kind === S.kind);
  const rivals = () => cars.filter((c) => c.kind !== S.kind);

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
  const racerButtons = ORDER.map((kind) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'racer';
    b.dataset.kind = kind;
    b.setAttribute('aria-label', `${KINDS[kind].name} the ${KINDS[kind].kind}`);
    b.innerHTML = `<span class="racer-emoji" aria-hidden="true">${KINDS[kind].emoji}</span><span class="racer-name" aria-hidden="true">${KINDS[kind].name}</span>`;
    b.addEventListener('click', () => pickRacer(kind));
    $('pickRow').appendChild(b);
    return b;
  });
  Race.CUPS.forEach((cup) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cup';
    b.dataset.cup = cup.id;
    b.setAttribute('aria-label', `${cup.title}: ${cup.blurb}`);
    b.innerHTML = `<span class="cup-emoji" aria-hidden="true">${cup.emoji}</span><span class="cup-title" aria-hidden="true">${cup.title}</span><span class="cup-blurb" aria-hidden="true">${cup.blurb}</span>`;
    b.addEventListener('click', () => startRace(cup.id));
    $('cupRow').appendChild(b);
  });

  function pickRacer(kind) {
    S.kind = kind;
    racerButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    toGrid();
    me().hopAt = time();
    Sfx.play('voice', KINDS[kind].voice);
  }

  function toGrid() {
    let r = 0;
    cars.forEach((car) => {
      const isMe = car.kind === S.kind;
      const spot = isMe ? GRID.player : GRID.rivals[r];
      Object.assign(car, {
        s: spot.s, prevS: spot.s, lane: spot.lane, x: laneX(spot.lane), v: 0, lean: 0, steer: 0,
        boostUntil: -9, mudUntil: -9, padUntil: -9, padK: 1, nextGate: 0, nextPad: 0, choice: null,
        thinkAt: 0, done: false, skill: isMe ? 1 : 0.94 + Math.random() * 0.04, smart: isMe ? 1 : SMART[r],
      });
      if (!isMe) r++;
    });
  }

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    track.hidden = true;
    countEl.hidden = true;
    toGrid();
    (racerButtons.find((b) => b.dataset.kind === S.kind) || racerButtons[0]).focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- the race */
  function startRace(cup) {
    fonts().then(() => {
      S.cup = cup;
      S.plan = Race.plan(S.races === 0 ? S.seed : (S.seed + S.races * 7919) >>> 0, cup);
      S.races++;
      S.asked = -1;
      S.right = 0;
      S.lap = 1;
      S.timers = [];
      toGrid();
      const qs = S.plan.questions;
      world.showGates(qs.length > 0);
      for (let g = 0; g < 3; g++) world.setSigns(g, qs.length ? qs[g].choices : null);
      menu.hidden = true;
      done.hidden = true;
      hud.hidden = false;
      track.hidden = false;
      qCard.hidden = true;
      tell('');
      setChips(null);
      updateStatus();
      track.focus({ preventScroll: true });
      countdown();
    });
  }

  function countdown() {
    S.screen = 'countdown';
    [3, 2, 1].forEach((n, i) => later(0.3 + i * 0.8, () => {
      countEl.hidden = false;
      countEl.textContent = String(n);
      tell(String(n));
      Sfx.play('good', 0);
    }));
    later(2.7, () => {
      countEl.textContent = 'Go!';
      tell('Go!');
      Sfx.play('good', 8);
      S.screen = 'race';
      if (S.plan.questions.length) ask(0);
      later(0.8, () => { countEl.hidden = true; });
    });
  }

  // put question k on the board and the answers on the lane chips
  function ask(k) {
    const q = S.plan.questions[k];
    if (!q) {
      qCard.hidden = true;
      setChips(null);
      return;
    }
    S.asked = k;
    qBoard.textContent = say.board(q);
    qBoard.classList.toggle('fish', !q.sum);
    qSay.textContent = say.question(q);
    qCard.dataset.gate = String(k);
    qCard.hidden = false;
    setChips(q.choices);
  }

  function setChips(choices) {
    chips.forEach((c, lane) => {
      c.textContent = choices ? String(choices[lane]) : ['◀', '●', '▶'][lane];
      c.setAttribute('aria-label', choices ? `${say.lane(lane)}: ${choices[lane]}` : say.lane(lane));
    });
    markChips();
  }
  function markChips() {
    const lane = me().lane;
    chips.forEach((c, i) => c.classList.toggle('here', i === lane));
  }

  function updateStatus() {
    $('place').textContent = Race.ordinal(S.place);
    $('lap').textContent = `Lap ${Math.min(S.lap, LAPS)}/${LAPS}`;
    $('score').textContent = S.plan.questions.length ? `✓ ${S.right}` : '';
  }

  function setLane(lane) {
    if (S.screen !== 'race') return;
    const car = me();
    lane = clamp(lane, 0, 2);
    if (lane === car.lane) return;
    car.lane = lane;
    Sfx.play('hop');
    srFocus.textContent = say.lane(lane);
    markChips();
  }

  function honk() {
    me().hopAt = time();
    Sfx.play('voice', KINDS[S.kind].voice);
  }

  /* ------------------------------------------------------------ driving */
  const gateAt = (k) => Race.gateAt(k, L);
  const padAt = (n) => Math.floor(n / PADS.length) * L + PADS[n % PADS.length].at * L;
  const laneOf = (car) => clamp(Math.round(car.x / Race.LANE_W) + 1, 0, 2);
  const inLane = (car, lane) => Math.abs(car.x - laneX(lane)) < 1.6;

  function drive(car, t, dt, player) {
    const want = laneX(car.lane);
    const before = car.x;
    car.x += clamp(want - car.x, -9 * dt, 9 * dt);
    const slide = (car.x - before) / Math.max(dt, 1e-4);
    const ease = 1 - Math.exp(-10 * dt);
    car.lean += (slide * 0.02 - car.lean) * ease;
    car.steer += (-slide * 0.025 - car.steer) * ease;

    let top = V_MAX * car.skill;
    if (t < car.boostUntil) top *= 1.45;
    if (t < car.mudUntil) top *= 0.5;
    if (t < car.padUntil) top *= car.padK;
    if (car !== player && !car.done) {
      // rubber bands: nobody gets left far behind, nobody runs away with it
      const gap = car.s - player.s;
      if (gap > 25) top *= 0.84;
      else if (gap > 12) top *= 0.94;
      else if (gap < -25) top *= 1.14;
      else if (gap < -12) top *= 1.05;
    }
    if (car.done) top = CRUISE;
    car.v += (top - car.v) * (1 - Math.exp(-(top > car.v ? 1.3 : 3.5) * dt));
    car.prevS = car.s;
    car.s += car.v * dt;
    car.roll += (car.v * dt) / 0.3;

    while (padAt(car.nextPad) <= car.s) {
      const pad = PADS[car.nextPad % PADS.length];
      if (padAt(car.nextPad) > car.prevS && inLane(car, pad.lane)) hitPad(car, pad, t, player);
      car.nextPad++;
    }
    const qs = S.plan.questions;
    while (car.nextGate < qs.length && gateAt(car.nextGate) <= car.s) {
      passGate(car, car.nextGate, t, player);
      car.nextGate++;
    }
    if (!car.done && car.s >= LAPS * L) {
      car.done = true;
      if (car === player) finish(t);
    } else if (car === player && !car.done) {
      const lap = Math.floor(car.s / L) + 1;
      if (lap > S.lap) {
        S.lap = lap;
        tell(say.lap(lap));
        Sfx.play('good', 6);
        updateStatus();
      }
    }
  }

  function hitPad(car, pad, t, player) {
    const pos = world.pose(car.s, car.x).pos;
    if (pad.kind === 'boost') {
      car.padUntil = t + 1;
      car.padK = 1.3;
      if (car === player) Sfx.play('poof');
    } else {
      car.padUntil = t + 0.9;
      car.padK = 0.6;
      world.burst(above(pos, 0.3), 'mud');
      if (car === player) Sfx.play('splash');
    }
  }

  function passGate(car, k, t, player) {
    const q = S.plan.questions[k];
    const lane = laneOf(car);
    const good = lane === q.correct;
    const pos = world.pose(car.s, car.x).pos;
    car.choice = null;
    if (good) {
      car.boostUntil = t + 2;
      car.hopAt = t;
      world.burst(above(pos, 1.3), 'sparkle');
    } else {
      car.mudUntil = t + 1.2;
      car.rig.react('shake');
      world.burst(above(pos, 0.4), 'mud');
    }
    if (car !== player) return;
    if (good) {
      S.right++;
      Sfx.play('good', Math.min(3 + S.right, 8));
      tell(say.right(q));
    } else {
      Sfx.play('splash');
      tell(say.wrong(q, q.choices[lane]));
      world.markSign(k % 3, lane, 'bad');
    }
    world.markSign(k % 3, q.correct, 'good');
    updateStatus();
    qCard.hidden = true;
    setChips(null);
    later(1.4, () => {
      if (S.screen !== 'race') return;
      ask(k + 1);
      const next = S.plan.questions[k + 3];          // this gate's question next lap
      world.setSigns(k % 3, next ? next.choices : null);
    });
  }

  /* The rivals: they take each gate's arch (usually the right one), steer
   * round mud, now and then go for a boost pad, and pull out to pass. */
  function think(car, t) {
    if (car.done) return;
    const qs = S.plan.questions;
    if (car.nextGate < qs.length && gateAt(car.nextGate) - car.s < 60) {
      if (car.choice == null) {
        const q = qs[car.nextGate];
        const wrong = [0, 1, 2].filter((l) => l !== q.correct);
        car.choice = Math.random() < car.smart ? q.correct : wrong[Math.floor(Math.random() * 2)];
      }
      car.lane = car.choice;
      return;
    }
    if (t < car.thinkAt) return;
    car.thinkAt = t + 0.4 + Math.random() * 0.6;
    const free = (lane) => !cars.some((o) => o !== car && inLane(o, lane) && Math.abs(o.s - car.s) < 6);
    const others = (lanes) => lanes.filter(free).sort((a, b) => Math.abs(a - car.lane) - Math.abs(b - car.lane));
    let n = car.nextPad;
    while (padAt(n) - car.s < 0) n++;
    const pad = padAt(n) - car.s < 35 ? PADS[n % PADS.length] : null;
    const blocked = cars.some((o) => o !== car && inLane(o, car.lane) && o.s > car.s && o.s - car.s < 8 && o.v < car.v + 1);
    let want = car.lane;
    if (pad && pad.kind === 'mud' && pad.lane === car.lane && Math.random() < 0.75) want = others([0, 1, 2].filter((l) => l !== pad.lane))[0];
    else if (pad && pad.kind === 'boost' && pad.lane !== car.lane && Math.random() < 0.45 && free(pad.lane)) want = pad.lane;
    else if (blocked) want = others([0, 1, 2].filter((l) => l !== car.lane))[0];
    if (want != null) car.lane = want;
  }

  // karts cannot drive through each other: a kart that catches up waits behind
  function unclump() {
    for (const a of cars) {
      for (const b of cars) {
        if (a === b) continue;
        const gap = b.s - a.s;
        if (gap > 0 && gap < 2.4 && Math.abs(a.x - b.x) < 1.5) {
          a.s = b.s - 2.4;
          a.v = Math.min(a.v, b.v);
        }
      }
    }
  }

  function finish(t) {
    const player = me();
    S.screen = 'done';
    S.endAt = t;
    S.place = Race.place(player.s, rivals().map((c) => c.s));
    const order = cars.slice().sort((a, b) => b.s - a.s);
    qCard.hidden = true;
    setChips(null);
    updateStatus();
    tell(say.finish(S.place));
    Sfx.play('win');
    player.hopAt = t;
    if (!calm()) world.burst(above(world.pose(player.s, player.x).pos, 2.2), 'confetti');
    later(1.6, () => {
      $('doneTitle').textContent = say.finish(S.place);
      $('doneScore').textContent = S.plan.questions.length ? say.score(S.right, S.plan.questions.length) : say.warmDone();
      const list = $('doneOrder');
      list.textContent = '';
      order.forEach((car, i) => {
        const li = document.createElement('li');
        const who = `${KINDS[car.kind].emoji} ${KINDS[car.kind].name}`;
        li.textContent = `${MEDALS[i]} ${who}${car === player ? ' (you)' : ''}`;
        if (car === player) li.className = 'me';
        list.appendChild(li);
      });
      hud.hidden = true;
      track.hidden = true;
      done.hidden = false;
      $('again').focus({ preventScroll: true });
    });
  }
  $('again').addEventListener('click', () => startRace(S.cup));
  $('nextRace').addEventListener('click', () => {
    const i = Race.CUPS.findIndex((c) => c.id === S.cup);
    startRace(Race.CUPS[(i + 1) % Race.CUPS.length].id);
  });
  $('toMenu').addEventListener('click', showMenu);

  /* -------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    const player = me();
    if (S.screen === 'race' || S.screen === 'done') {
      cars.forEach((car) => {
        if (car !== player) think(car, t);
        drive(car, t, dt, player);
      });
      unclump();
      if (S.screen === 'race') {
        const p = Race.place(player.s, rivals().map((c) => c.s));
        if (p !== S.place) {
          S.place = p;
          updateStatus();
        }
      }
    }
    cars.forEach((car) => {
      world.placeKart(car.kart, car.s, car.x, car.lean, car.steer, car.roll);
      const rig = car.rig;
      const h = hopCurve(t - car.hopAt, 0.35);
      rig.root.position.y = h ? h.y : 0;
      rig.sy = h ? h.sy : null;
      rig.earX = -0.55 * Math.min(1, car.v / V_MAX);          // ears blown back
      rig.look.yaw += (car.steer * 3 - rig.look.yaw) * (1 - Math.exp(-6 * dt));
      rig.look.pitch = -0.1;
      rig.update(t, dt);
    });
    if (S.screen === 'menu') {
      if (t - player.hopAt > 2.2) player.hopAt = t;          // the chosen racer bounces with excitement
      world.gridView();
    } else if (S.screen === 'done') {
      const { pos, yaw } = world.pose(player.s, player.x);
      world.orbit(pos, yaw, t - S.endAt, calm());
    } else {
      const { pos, yaw } = world.pose(player.s, player.x);
      const boosting = t < player.boostUntil || (t < player.padUntil && player.padK > 1);
      world.chase(pos, yaw, dt, S.screen === 'countdown', boosting && !calm() ? 1 : 0);
      if (boosting && !calm() && t > S.puffAt) {
        S.puffAt = t + 0.09;
        world.burst(above(world.pose(player.s - 1.2, player.x).pos, 0.35), 'puff');
      }
    }
  }

  /* -------------------------------------------------------------- input */
  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'race' && S.screen !== 'countdown') return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      e.preventDefault();
      setLane(me().lane - 1);
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault();
      setLane(me().lane + 1);
    } else if (k === ' ') {
      e.preventDefault();
      honk();
    }
  });
  // a tap on the left or right half of the race moves one lane that way
  track.addEventListener('pointerdown', (e) => {
    const r = stage.getBoundingClientRect();
    setLane(me().lane + (e.clientX < r.left + r.width / 2 ? -1 : 1));
  });
  chips.forEach((c) => c.addEventListener('click', () => setLane(+c.dataset.lane)));

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
    const dt = Math.min(Math.max(t - last, 0), 0.1);
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
  fonts().then(() => world.repaint());
  world.showGates(false);
  toGrid();
  racerButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === S.kind)));
  start();
})();
