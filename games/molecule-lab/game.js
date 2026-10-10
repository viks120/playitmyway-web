/* Molecule Lab: the game itself.
 *
 * Pick a molecule and build it. A new atom from the palette bonds to the
 * selected atom; pick two atoms and press Bond to make, raise or remove the
 * bond between them; fill every atom's bonding slots. When the build is the
 * target molecule it relaxes into its real 3D shape and shows its bond
 * angle and a "did you know". Undo, Clear and a Hint (from the real
 * checker) are always there, and the free build names the molecules it
 * knows. Needs THREE, Toon, Sfx, Chem and World, loaded before it. Nothing
 * is stored: ticks for finished tasks last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const say = Chem.say;
  const TASKS = Chem.TASKS;
  const sub = Chem.sub;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const html = (f) => f.replace(/(\d+)/g, '<sub>$1</sub>');

  const stage = $('stage');
  const canvas = $('view');
  const boardEl = $('board');
  const menu = $('menu');
  const hud = $('hud');
  const done = $('done');
  const doneCard = $('doneCard');
  const tellEl = $('tell');
  const palette = $('palette');
  const topbar = $('topbar');

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
  world.calm(calm());
  if (motion && motion.addEventListener) motion.addEventListener('change', () => world.calm(calm()));

  /* ------------------------------------------------------------ state */
  const S = {
    screen: 'menu',          // menu, play, done
    mode: 'show',            // show (behind the menu), task, free
    index: 0,
    task: null,
    mol: Chem.empty(),
    history: [],
    sel: null,               // the selected atom
    prev: null,              // the atom picked before it: Bond's other end
    pos: new Map(),          // atom id → [x, y, z]; kept for removed atoms so undo puts them back
    vel: new Map(),
    phase: 'build',          // build (springy layout), relax (moving into shape), shape
    relax: null,
    pending: null,           // the arc and lone pairs to show once relaxed
    full: new Set(),         // atoms already full, to notice newly full ones
    solved: new Set(),       // this visit only
    released: false,         // Esc pressed: the next Tab leaves the builder
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

  /* Text on the 3D letters is painted in Fredoka, so wait for it (briefly). */
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
  const taskButtons = [];
  Chem.GROUPS.forEach((g) => {
    const sec = document.createElement('section');
    sec.className = 'task-group';
    const h = document.createElement('h3');
    h.textContent = g.title;
    const row = document.createElement('div');
    row.className = 'task-row';
    for (let i = g.from; i < g.to; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'task-btn';
      b.addEventListener('click', () => play('task', i));
      row.appendChild(b);
      taskButtons[i] = b;
    }
    sec.append(h, row);
    $('taskGroups').appendChild(sec);
  });
  function drawTaskButtons() {
    taskButtons.forEach((b, i) => {
      const t = TASKS[i];
      const ok = S.solved.has(i);
      b.innerHTML = `<span class="task-f" aria-hidden="true">${html(t.formula)}</span><span class="task-n" aria-hidden="true">${t.name}</span>` +
        (ok ? '<span class="tick" aria-hidden="true">✓</span>' : '');
      b.setAttribute('aria-label', `${i + 1}: ${t.name}, ${sub(t.formula)}${ok ? ', done this visit' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }
  const groupOf = (i) => Chem.GROUPS.find((g) => i >= g.from && i < g.to).title;

  function showMenu() {
    S.screen = 'menu';
    S.timers = [];
    drawTaskButtons();
    menu.hidden = false;
    hud.hidden = true;
    done.hidden = true;
    boardEl.hidden = true;
    hud.classList.remove('is-done');
    world.select(null, null);
    world.dragLine(null);
    world.spin(!calm());
    layoutChanged();
    const next = taskButtons.find((b, i) => !S.solved.has(i)) || taskButtons[0];
    next.focus({ preventScroll: true });
  }

  /* -------------------------------------------------------------- play */
  function play(mode, i) {
    fonts().then(() => begin(mode, i));
  }

  function resetBuild() {
    S.mol = Chem.empty();
    S.history = [];
    S.sel = null;
    S.prev = null;
    S.pos = new Map();
    S.vel = new Map();
    S.phase = 'build';
    S.relax = null;
    S.pending = null;
    S.full = new Set();
    S.released = false;
    S.timers = [];
    world.clear();
    world.setPos(S.pos);
    world.sync(S.mol, time());
    world.select(null, null);
  }

  function begin(mode, i) {
    S.mode = mode;
    S.index = i || 0;
    S.task = mode === 'task' ? TASKS[S.index] : null;
    resetBuild();
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    hud.hidden = false;
    boardEl.hidden = false;
    hud.classList.remove('is-done');
    world.resetView();
    world.spin(false);
    if (mode === 'task') {
      $('taskStep').textContent = `Task ${S.index + 1} of ${TASKS.length} · ${groupOf(S.index)}`;
      $('taskGoal').innerHTML = `Build ${S.task.name}, ${html(S.task.formula)}`;
      tell(say.start(S.index + 1, TASKS.length, S.task));
    } else {
      $('taskStep').textContent = 'Free build';
      $('taskGoal').textContent = 'Build anything you like';
      tell(say.free());
    }
    drawStatus();
    layoutChanged();
    world.frame(0, true);
    boardEl.focus({ preventScroll: true });
  }

  // "C 1/2 · H 3/6 · O 0/1 · 4 open slots": what you have against what you need
  function drawStatus() {
    const m = S.mol;
    const open = Chem.openSlots(m);
    const bits = [];
    if (S.mode === 'task') {
      const need = Chem.countFormula(S.task.formula);
      const have = Chem.counts(m);
      const els = Object.keys(need).concat(Chem.ORDER.filter((el) => have[el] && !need[el]));
      for (const el of els) {
        const h = have[el] || 0;
        const n = need[el] || 0;
        bits.push(`<span class="tally${h > n ? ' over' : h === n ? ' ok' : ''}">${el} ${h}/${n}</span>`);
      }
    } else {
      bits.push(m.atoms.length ? html(Chem.formula(m)) : 'Nothing yet');
    }
    if (m.atoms.length) bits.push(open ? `${open} open slot${open === 1 ? '' : 's'}` : 'no open slots');
    $('built').innerHTML = bits.join(' · ');
  }

  const canEdit = () => S.screen === 'play';

  function snapshot() {
    S.history.push({ mol: S.mol, sel: S.sel, prev: S.prev });
    if (S.history.length > 300) S.history.shift();
  }

  /* After every change: redraw, notice atoms that just filled up, and
   * check the build against the task. */
  function commit(m, msg) {
    S.mol = m;
    if (S.phase !== 'build') leaveShape();
    world.sync(S.mol, time());
    if (calm()) for (let k = 0; k < 240; k++) Chem.layout(S.mol, S.pos, S.vel, 1 / 60);
    noticeFull();
    world.select(S.sel, S.prev);
    drawStatus();
    if (msg) tell(msg);
    evaluate();
  }

  function leaveShape() {
    S.phase = 'build';
    S.relax = null;
    S.pending = null;
    world.clearShape();
    world.spin(false);
  }

  function noticeFull() {
    const now = new Set(S.mol.atoms.filter((a) => Chem.free(S.mol, a.id) === 0).map((a) => a.id));
    let fresh = 0;
    const t = time();
    for (const id of now) {
      if (!S.full.has(id)) {
        world.settle(id, t);
        fresh++;
      }
    }
    S.full = now;
    if (fresh) later(0.09, () => Sfx.play('good', Math.min(8, now.size)));
  }

  function evaluate() {
    const m = S.mol;
    if (S.mode === 'task') {
      const r = Chem.check(m, S.task.mol);
      if (r.done) {
        success(r);
        return;
      }
      if (m.atoms.length > 1 && r.open === 0) {
        if (r.pieces > 1) tell(say.pieces(r.pieces));
        else {
          const rec = Chem.recognise(m);
          tell(Chem.formula(m) === Chem.formula(S.task.mol) ? say.isomer(S.task, rec) : say.other(S.task, rec, r.formula));
        }
        later(0.2, () => Sfx.play('uhoh'));
      }
    } else if (S.mode === 'free') {
      const r = Chem.check(m, null);
      if (!r.full) return;
      const rec = Chem.recognise(m);
      if (!rec) {
        tell(say.unknown(r.formula));
        return;
      }
      const geo = Chem.geometry(m);
      later(0.15, () => Sfx.play('win'));
      if (!geo) {
        tell(say.namedRing(rec));
        return;
      }
      const head = Chem.headline(m, geo, null, null);
      tell(say.named(rec, Chem.shapeText(geo.centres), head));
      relaxInto(geo, head);
    }
  }

  /* ----------------------------------------------------------- building */
  function centre() {
    const ids = S.mol.atoms.map((a) => a.id).filter((id) => S.pos.has(id));
    const c = [0, 0, 0];
    for (const id of ids) for (let k = 0; k < 3; k++) c[k] += S.pos.get(id)[k] / ids.length;
    let r = 0;
    for (const id of ids) r = Math.max(r, Chem.V.dist(c, S.pos.get(id)));
    return { c, r };
  }
  // an atom on its own appears just past the molecule's right-hand side
  function freeSpot() {
    if (!S.mol.atoms.length) return [0, 0, 0];
    const { right } = world.viewDirs();
    const { c, r } = centre();
    return Chem.V.add(c, Chem.V.mul(right, r + 1.7));
  }

  function addAtom(el) {
    if (!canEdit()) return;
    const parent = S.sel != null && Chem.has(S.mol, S.sel) ? S.sel : null;
    const r = Chem.addAtom(S.mol, el, parent);
    if (r.error === 'full') {
      Sfx.play('uhoh');
      world.flash(parent, time());
      tell(say.full(Chem.atom(S.mol, parent).el));
      return;
    }
    if (r.error) {
      Sfx.play('uhoh');
      tell(say.max());
      return;
    }
    snapshot();
    const { view, right } = world.viewDirs();
    S.pos.set(r.id, parent != null ? Chem.spot(r.mol, S.pos, parent, el, view, right) : freeSpot());
    S.vel.set(r.id, [0, 0, 0]);
    let msg;
    if (parent != null) {
      // the selection moves on to the new atom while it has room for more
      if (Chem.free(r.mol, r.id) > 0) {
        S.prev = parent;
        S.sel = r.id;
      } else {
        S.prev = r.id;
      }
      msg = say.addedTo(r.mol, r.id, parent);
    } else {
      msg = S.mol.atoms.length ? say.addedAlone(el) : say.added(el);
      S.sel = r.id;
    }
    Sfx.play('pop');
    commit(r.mol, msg);
  }

  // Bond's other end: the atom picked before, or else the next one along
  function partner() {
    if (S.prev != null && S.prev !== S.sel && Chem.has(S.mol, S.prev)) return S.prev;
    const ids = S.mol.atoms.map((a) => a.id);
    if (S.sel == null || ids.length < 2) return null;
    return ids[(ids.indexOf(S.sel) + 1) % ids.length];
  }

  function bondPress() {
    if (!canEdit()) return;
    const other = S.sel != null && Chem.has(S.mol, S.sel) ? partner() : null;
    if (other == null) {
      Sfx.play('uhoh');
      tell(say.pickTwo());
      return;
    }
    bondBetween(other, S.sel);
  }

  function bondBetween(a, b) {
    if (!canEdit()) return;
    const r = Chem.cycleBond(S.mol, a, b);
    if (r.error === 'same') {
      tell(say.same());
      return;
    }
    if (r.error === 'full') {
      Sfx.play('uhoh');
      world.flash(r.id, time());
      tell(say.full(Chem.atom(S.mol, r.id).el));
      return;
    }
    if (r.error) return;
    snapshot();
    const ea = Chem.atom(S.mol, a).el;
    const eb = Chem.atom(S.mol, b).el;
    let msg;
    if (r.order === 0) {
      msg = say.bondGone(ea, eb, r.was, r.stop != null ? Chem.atom(S.mol, r.stop).el : null);
      Sfx.play('poof');
    } else if (r.order === 1) {
      msg = say.bondMade(ea, eb);
      Sfx.play('pop');
    } else {
      msg = say.bondUp(ea, eb, r.order);
      Sfx.play('pop');
    }
    commit(r.mol, msg);
  }

  function deleteSel() {
    if (!canEdit()) return;
    if (S.sel == null || !Chem.has(S.mol, S.sel)) {
      Sfx.play('uhoh');
      tell(say.nothingSelected());
      return;
    }
    snapshot();
    const id = S.sel;
    const el = Chem.atom(S.mol, id).el;
    const near = Chem.neighbours(S.mol, id).map((x) => x.id);
    const r = Chem.deleteAtom(S.mol, id);
    const keep = near.find((x) => !r.gone.includes(x));
    S.sel = keep != null ? keep : r.mol.atoms.length ? r.mol.atoms[r.mol.atoms.length - 1].id : null;
    S.prev = null;
    Sfx.play('poof');
    commit(r.mol, say.removed(el, r.gone.length - 1));
  }

  function undo() {
    if (!canEdit()) return;
    const h = S.history.pop();
    if (!h) {
      tell(say.nothingToUndo());
      return;
    }
    S.sel = h.sel;
    S.prev = h.prev;
    Sfx.play('poof');
    commit(h.mol, say.undo());
  }

  function clearAll() {
    if (!canEdit()) return;
    if (!S.mol.atoms.length) {
      tell(say.alreadyEmpty());
      return;
    }
    snapshot();
    S.sel = null;
    S.prev = null;
    Sfx.play('poof');
    commit({ atoms: [], bonds: [], next: S.mol.next }, say.cleared());
  }

  function hint() {
    if (!canEdit()) return;
    const h = Chem.hint(S.mol, S.task);
    if (h.focus != null) {
      if (h.partner != null) S.prev = h.partner;
      else if (S.prev === h.focus) S.prev = null;
      S.sel = h.focus;
      world.select(S.sel, S.prev);
      world.flash(h.focus, time());
    }
    Sfx.play('voice', 1.15);
    tell(h.text);
  }

  /* ---------------------------------------------------------- selecting */
  function select(id, announce) {
    if (id != null && !Chem.has(S.mol, id)) return;
    if (id !== S.sel) {
      if (S.sel != null && Chem.has(S.mol, S.sel)) S.prev = S.sel;
      S.sel = id;
    }
    world.select(S.sel, S.prev);
    if (announce && id != null) tell(say.selected(S.mol, id));
  }

  function cycleSel(step) {
    const ids = S.mol.atoms.map((a) => a.id);
    if (!ids.length) return;
    const i = ids.indexOf(S.sel);
    select(ids[i < 0 ? (step > 0 ? 0 : ids.length - 1) : (i + step + ids.length) % ids.length], true);
  }

  // Space: the next atom that still has an open slot
  function nextOpen() {
    const ids = S.mol.atoms.map((a) => a.id);
    if (!ids.length) return;
    const i = Math.max(0, ids.indexOf(S.sel));
    for (let k = 1; k <= ids.length; k++) {
      const id = ids[(i + k) % ids.length];
      if (Chem.free(S.mol, id) > 0) {
        select(id, true);
        return;
      }
    }
    tell('Every atom is full.');
  }

  // arrows: the nearest atom on screen in that direction
  function moveSel(dir) {
    if (!S.mol.atoms.length) return;
    if (S.sel == null) {
      cycleSel(1);
      return;
    }
    const from = world.toScreen(S.pos.get(S.sel));
    let best = null;
    let bestScore = Infinity;
    for (const a of S.mol.atoms) {
      if (a.id === S.sel) continue;
      const p = world.toScreen(S.pos.get(a.id));
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along < 3) continue;
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = a.id;
      }
    }
    if (best != null) select(best, true);
    else Sfx.play('pop');
  }

  function deselect() {
    S.sel = null;
    S.prev = null;
    S.released = true;
    world.select(null, null);
    tell(say.deselected());
  }

  /* ------------------------------------------------------------ finished */
  function relaxInto(geo, head) {
    const ids = S.mol.atoms.map((a) => a.id);
    const from = ids.map((id) => S.pos.get(id).slice());
    const fitted = Chem.fit(ids.map((id) => geo.pos.get(id)), from);
    S.relax = { ids, from, to: fitted.points, at: time(), dur: calm() ? 0 : 1.3 };
    S.phase = 'relax';
    S.pending = {
      arc: head ? { c: head.centre, a: head.ends[0], b: head.ends[1], angle: head.angle, text: Chem.deg(head.angle) } : null,
      lone: geo.centres.filter((c) => geo.lone.get(c.id).length).map((c) => ({ id: c.id, dirs: geo.lone.get(c.id).map(fitted.dir) })),
    };
  }

  function endRelax() {
    S.phase = 'shape';
    S.relax = null;
    if (S.pending) world.showShape(S.pending);
    if (S.screen === 'done') {
      world.burst();
      world.spin(!calm());
    }
  }

  function success(r) {
    S.screen = 'done';
    S.solved.add(S.index);
    S.sel = null;
    S.prev = null;
    world.select(null, null);
    world.flash(null);
    const geo = Chem.geometry(S.mol);
    const head = Chem.headline(S.mol, geo, S.task, r.map);
    const shape = Chem.shapeText(geo ? geo.centres : []);
    if (geo) relaxInto(geo, head);
    later(0.12, () => Sfx.play('win'));
    tell(say.done(S.task, shape, head));
    later(calm() ? 0.5 : 1.6, () => showDone(shape, head));
  }

  function showDone(shape, head) {
    if (S.screen !== 'done') return;
    $('doneTitle').innerHTML = `${cap(S.task.name)}, ${html(S.task.formula)} <span aria-hidden="true">✓</span>`;
    $('doneShape').textContent = shape;
    $('doneAngleRow').hidden = !head;
    if (head) $('doneAngle').textContent = `${head.label}, about ${Chem.deg(head.angle)}`;
    $('doneFact').textContent = S.task.fact;
    $('nextBtn').hidden = S.index >= TASKS.length - 1;
    done.hidden = false;
    hud.classList.add('is-done');
    tell(say.doneShort(S.task, S.solved.size, TASKS.length));
    layoutChanged();
    ($('nextBtn').hidden ? $('againBtn') : $('nextBtn')).focus({ preventScroll: true });
  }

  $('nextBtn').addEventListener('click', () => play('task', S.index + 1));
  $('againBtn').addEventListener('click', () => play('task', S.index));
  $('allBtn').addEventListener('click', showMenu);
  $('freeBtn').addEventListener('click', () => play('free'));
  const toBoard = (fn) => () => {
    fn();
    boardEl.focus({ preventScroll: true });
  };
  $('menuBtn').addEventListener('click', showMenu);
  $('undoBtn').addEventListener('click', toBoard(undo));
  $('clearBtn').addEventListener('click', toBoard(clearAll));
  $('hintBtn').addEventListener('click', toBoard(hint));
  $('bondBtn').addEventListener('click', toBoard(bondPress));
  $('delBtn').addEventListener('click', toBoard(deleteSel));
  palette.querySelectorAll('.atom-btn').forEach((b) => b.addEventListener('click', toBoard(() => addAtom(b.dataset.el))));

  /* -------------------------------------------------------------- keys */
  const ADD = {};
  for (const el of Chem.ORDER) {
    ADD[Chem.ELEMENTS[el].key] = el;
    ADD[Chem.ELEMENTS[el].num] = el;
  }
  document.addEventListener('keydown', (e) => {
    if (S.screen === 'done' && (e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      showMenu();
      return;
    }
    if (S.screen !== 'play') return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'Tab') {
      // Tab moves round the atoms; after Esc it moves on out of the builder
      if (e.target !== boardEl || S.released || !S.mol.atoms.length) {
        S.released = false;
        return;
      }
      e.preventDefault();
      cycleSel(e.shiftKey ? -1 : 1);
      return;
    }
    S.released = false;
    if (k === 'Escape') {
      e.preventDefault();
      deselect();
    } else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const dir = k.slice(5).toLowerCase();
      if (e.shiftKey) world.orbit(dir === 'left' ? -0.3 : dir === 'right' ? 0.3 : 0, dir === 'up' ? 0.22 : dir === 'down' ? -0.22 : 0);
      else moveSel(dir);
    } else if (k === '?' || (lower === 'h' && e.shiftKey)) {
      e.preventDefault();
      hint();
    } else if (ADD[lower]) {
      e.preventDefault();
      addAtom(ADD[lower]);
    } else if (lower === 'b') {
      e.preventDefault();
      bondPress();
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      deleteSel();
    } else if (lower === 'z') {
      e.preventDefault();
      undo();
    } else if (lower === 'x') {
      e.preventDefault();
      clearAll();
    } else if (lower === 'm') {
      e.preventDefault();
      showMenu();
    } else if (k === ' ') {
      e.preventDefault();
      nextOpen();
    } else if (k === '+' || k === '=') {
      e.preventDefault();
      world.zoomBy(0.87);
    } else if (k === '-' || k === '_') {
      e.preventDefault();
      world.zoomBy(1.15);
    }
  });

  /* ----------------------------------------------------------- pointer */
  // tap an atom to pick it, tap a bond to change it, drag from atom to
  // atom to bond them, drag empty space to turn the view, pinch or scroll to zoom
  const touches = new Map();
  let drag = null;
  let pinch = 0;
  const spread = () => {
    const p = [...touches.values()];
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  };
  boardEl.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      boardEl.setPointerCapture(e.pointerId);
    } catch (err) {
      // capture is a nicety
    }
    if (touches.size === 2) {
      pinch = spread();
      drag = null;
      world.dragLine(null);
      return;
    }
    if (touches.size > 2) return;
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, hit: world.pick(e.clientX, e.clientY), mode: 'tap' };
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const now = spread();
      if (pinch && now) world.zoomBy(pinch / now);
      pinch = now;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.mode === 'tap' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) {
      drag.mode = drag.hit && drag.hit.atom != null && canEdit() ? 'bond' : 'orbit';
    }
    if (drag.mode === 'orbit') world.orbit(dx * 0.009, dy * 0.009);
    else if (drag.mode === 'bond') world.dragLine(drag.hit.atom, e.clientX, e.clientY);
  });
  function release(e) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = 0;
    const d = drag;
    drag = null;
    if (!d || e.type === 'pointercancel') {
      world.dragLine(null);
      return;
    }
    if (d.mode === 'bond') {
      world.dragLine(null);
      const end = world.pick(e.clientX, e.clientY);
      if (end && end.atom != null && end.atom !== d.hit.atom) {
        S.sel = d.hit.atom;
        S.prev = null;
        select(end.atom, false);
        bondBetween(d.hit.atom, end.atom);
      } else {
        tell('To bond two atoms, drag from one atom and let go on the other.');
      }
      return;
    }
    if (d.mode !== 'tap' || S.screen !== 'play') return;
    if (d.hit && d.hit.atom != null) {
      select(d.hit.atom, true);
      S.released = false;
    } else if (d.hit && d.hit.bond) {
      const [a, b] = d.hit.bond;
      S.sel = a;
      S.prev = null;
      select(b, false);
      bondBetween(a, b);
    } else if (S.sel != null) {
      deselect();
    }
  }
  boardEl.addEventListener('pointerup', release);
  boardEl.addEventListener('pointercancel', release);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
  boardEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    world.zoomBy(e.deltaY > 0 ? 1.08 : 1 / 1.08);
  }, { passive: false });

  /* ------------------------------------------------------- every frame */
  function tick(t, dt) {
    runTimers();
    if (S.phase === 'build') {
      Chem.layout(S.mol, S.pos, S.vel, dt);
    } else if (S.phase === 'relax' && S.relax) {
      const R = S.relax;
      const k = R.dur ? Math.min(1, (t - R.at) / R.dur) : 1;
      const e = k * k * (3 - 2 * k);
      R.ids.forEach((id, i) => {
        const p = S.pos.get(id);
        if (p) for (let c = 0; c < 3; c++) p[c] = R.from[i][c] + (R.to[i][c] - R.from[i][c]) * e;
      });
      if (k >= 1) endRelax();
    }
    world.setPos(S.pos);
    world.update(t, dt);
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

  /* The camera frames the molecule in the part of the stage the panels
   * leave free: below the task card, above the palette (or beside the
   * finished card on a wide screen). */
  function layoutChanged() {
    stage.style.setProperty('--tell-h', `${tellEl.offsetHeight ? tellEl.offsetHeight + 8 : 0}px`);
    const s = stage.getBoundingClientRect();
    if (!s.width) return;
    const box = { left: 8, top: 8, right: s.width - 8, bottom: s.height - 8 };
    if (S.screen !== 'menu') {
      box.top = topbar.getBoundingClientRect().bottom - s.top + 6;
      if (!done.hidden) {
        const c = doneCard.getBoundingClientRect();
        if (c.top < s.top + s.height / 3) box.right = c.left - s.left - 8;
        else box.bottom = c.top - s.top - 8;
        box.bottom = Math.min(box.bottom, tellEl.getBoundingClientRect().top - s.top - 8);
      } else {
        box.bottom = palette.getBoundingClientRect().top - s.top - 8;
      }
    }
    world.focus(box);
  }
  function fit() {
    world.resize();
    layoutChanged();
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fit);
    [stage, tellEl, topbar, palette, doneCard].forEach((el) => ro.observe(el));
  } else {
    window.addEventListener('resize', fit);
  }

  /* Behind the menu: a finished molecule turning slowly. */
  function showcase() {
    S.mode = 'show';
    S.mol = Chem.copy(TASKS[14].mol);
    const geo = Chem.geometry(S.mol);
    S.pos = new Map([...geo.pos].map(([id, p]) => [id, p.slice()]));
    S.phase = 'shape';
    world.setPos(S.pos);
    world.sync(S.mol, -9);
    world.spin(!calm());
  }

  fonts().then(() => world.repaint());
  showcase();
  drawTaskButtons();
  fit();
  world.frame(0, true);
  start();
})();
