/* Logic Gates: the game itself.
 *
 * Pick a level, then choose a gate for every slot on the circuit board until
 * each row of the truth table matches its target. Flip the switches (or let
 * Test step through every row) to watch the current flow. Undo, Clear, a
 * Hint from the solver and a gate guide are always there. Needs THREE, Toon,
 * Sfx, Gates, GateArt and World, loaded before it. Nothing is stored: ticks
 * for solved levels last only this visit.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const say = Gates.say;
  const ORDER = Gates.ORDER;
  const time = () => performance.now() / 1000;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(motion && motion.matches);
  const same = (a, b) => !!a && !!b && a.kind === b.kind && a.i === b.i;

  const stage = $('stage');
  const canvas = $('view');
  const boardWrap = $('boardWrap');
  const boardEl = $('board');
  const menu = $('menu');
  const done = $('done');
  const guide = $('guide');
  const tellEl = $('tell');
  const srFocus = $('srFocus');
  const palette = $('palette');
  const tools = $('tools');
  const side = $('side');
  const tt = $('tt');
  const ttWrap = $('ttWrap');
  const scoreEl = $('score');

  function noGl() {
    ['menu', 'play', 'done', 'guide', 'tell'].forEach((id) => { $(id).hidden = true; });
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
  world.setCalm(calm());
  if (motion && motion.addEventListener) motion.addEventListener('change', () => world.setCalm(calm()));

  /* ------------------------------------------------------------ state */
  const S = {
    screen: 'menu',          // menu, play, done
    index: 0,
    level: null,
    sols: [],
    gates: [],               // the gate in each slot, or null
    bits: [],                // the switches, in the level's input order
    history: [],
    cursor: null,            // the switch or slot the keyboard is on
    slot: 0,                 // the slot the gate buttons fill
    score: null,
    solved: new Set(),       // this visit only
    solvedNow: false,
    hintKey: '',
    hintStep: 0,
    testing: null,
    timers: [],
    tabDir: 0,
    back: null,              // where focus goes when the gate guide closes
  };

  function later(delay, fn) {
    const t = { at: time() + delay, fn };
    S.timers.push(t);
    return t;
  }
  function cancel(t) {
    S.timers = S.timers.filter((x) => x !== t);
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
  const inputName = (i) => S.level.inputs[i].name;
  const sortedPalette = () => ORDER.filter((id) => S.level.palette.includes(id));

  /* --------------------------------------------------------------- menu */
  const levelButtons = [];
  Gates.GROUPS.forEach((g, gi) => {
    const sec = document.createElement('section');
    sec.className = 'level-group';
    const h = document.createElement('h3');
    h.textContent = `${gi + 1} · ${g.title}`;
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
      b.setAttribute('aria-label', `Level ${i + 1}: ${Gates.LEVELS[i].title}${ok ? ', solved this visit' : ''}`);
      b.classList.toggle('ok', ok);
    });
  }

  function showMenu() {
    stopTest(true);
    S.screen = 'menu';
    S.timers = [];
    drawLevelButtons();
    menu.hidden = false;
    done.hidden = true;
    [boardEl, tools, palette, side].forEach((el) => { el.hidden = true; });
    tell('');
    fit();
    const next = levelButtons.find((b, i) => !S.solved.has(i)) || levelButtons[0];
    next.focus({ preventScroll: true });
  }

  /* -------------------------------------------------------------- fonts */
  let fontsReady = null;
  function fonts() {
    if (!fontsReady) {
      fontsReady = document.fonts && document.fonts.load
        ? Promise.race([document.fonts.load('700 100px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
        : Promise.resolve();
    }
    return fontsReady;
  }

  /* ------------------------------------------------------------- levels */
  const layouts = [];
  const layoutOf = (i) => layouts[i] || (layouts[i] = Gates.layout(Gates.LEVELS[i]));

  // the gate names are painted in Fredoka, so wait for it (briefly)
  function startLevel(i) {
    fonts().then(() => begin(i));
  }

  function begin(i) {
    stopTest(true);
    S.index = i;
    S.level = Gates.LEVELS[i];
    S.sols = Gates.solutions(S.level);
    S.gates = S.level.slots.map(() => null);
    S.bits = S.level.inputs.map(() => 0);
    S.history = [];
    S.timers = [];
    S.solvedNow = false;
    S.hintKey = '';
    S.hintStep = 0;
    world.build(S.level, layoutOf(i));
    S.screen = 'play';
    menu.hidden = true;
    done.hidden = true;
    [boardEl, tools, palette, side].forEach((el) => { el.hidden = false; });
    $('levelTitle').innerHTML = `<span class="lvl">Level ${i + 1}</span> · ${S.level.title}`;
    $('goal').textContent = S.level.goal;
    buildPalette();
    buildTable();
    refresh();
    moveCursor(items().find((it) => it.kind === 'slot'), false);
    fit();
    tell(say.start(i + 1, S.level));
    boardEl.focus({ preventScroll: true });
  }

  // the switches top to bottom, then the slots column by column: the order Tab follows
  function items() {
    const lay = layoutOf(S.index);
    const sw = lay.inputs.map((n) => ({ kind: 'in', i: n.i, y: n.y, col: 0 })).sort((a, b) => a.y - b.y);
    const sl = lay.slots.map((n) => ({ kind: 'slot', i: n.i, y: n.y, col: n.col })).sort((a, b) => a.col - b.col || a.y - b.y);
    return sw.concat(sl).map((it) => ({ kind: it.kind, i: it.i }));
  }

  /* ------------------------------------------------------ gate buttons */
  function drawGate(cv, id, w, h) {
    const r = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(w * r);
    cv.height = Math.round(h * r);
    const x = cv.getContext('2d');
    x.setTransform(r, 0, 0, r, 0, 0);
    GateArt.draw(x, id, 0, 0, w, h, { fill: GateArt.COLORS[id].side });
  }
  function buildPalette() {
    palette.textContent = '';
    sortedPalette().forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gate-btn';
      b.dataset.gate = id;
      const cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      drawGate(cv, id, 46, 24);
      const name = document.createElement('span');
      name.className = 'gname';
      name.setAttribute('aria-hidden', 'true');
      name.textContent = id;
      const key = document.createElement('kbd');
      key.className = 'gkey';
      key.setAttribute('aria-hidden', 'true');
      key.textContent = String(ORDER.indexOf(id) + 1);
      b.append(cv, name, key);
      b.addEventListener('click', () => placeGate(S.slot, id));
      palette.appendChild(b);
    });
  }
  function drawPalette() {
    const slot = S.level.slots[S.slot];
    palette.querySelectorAll('.gate-btn').forEach((b) => {
      const id = b.dataset.gate;
      const fits = Gates.fits(slot, id);
      b.setAttribute('aria-pressed', String(S.gates[S.slot] === id));
      b.setAttribute('aria-disabled', String(!fits));
      b.setAttribute('aria-label', fits ? `Put ${id} in slot ${S.slot + 1}` : `${id}: does not fit slot ${S.slot + 1}`);
    });
    palette.setAttribute('aria-label', `Gates for slot ${S.slot + 1}`);
  }

  /* ------------------------------------------------------- truth table */
  let rowEls = [];
  function buildTable() {
    const lv = S.level;
    const outs = lv.outputs;
    const head = lv.inputs.map((p) => `<th scope="col" class="in">${p.name}</th>`).join('')
      + outs.map((o, k) => `<th scope="col"${k === 0 ? ' class="first-out"' : ''}>${o.name}<br><small>target</small></th>`).join('')
      + outs.map((o, k) => `<th scope="col"${k === 0 ? ' class="first-out"' : ''}>${o.name}<br><small>yours</small></th>`).join('')
      + '<th scope="col" class="mark"><span aria-hidden="true">✓</span><span class="visually-hidden">Row matches?</span></th>'
      + (lv.note ? `<th scope="col">${lv.note.head}</th>` : '');
    let body = '';
    for (let r = 0; r < Gates.rowCount(lv); r++) {
      const bits = Gates.bitsOf(lv, r);
      const want = Gates.wantOf(lv, bits);
      body += `<tr data-row="${r}">`
        + bits.map((b) => `<td class="in v${b}">${b}</td>`).join('')
        + want.map((v, k) => `<td class="want v${v}${k === 0 ? ' first-out' : ''}">${v}</td>`).join('')
        + outs.map((o, k) => `<td class="got${k === 0 ? ' first-out' : ''}"></td>`).join('')
        + '<td class="mark"><span aria-hidden="true"></span><span class="visually-hidden"></span></td>'
        + (lv.note ? `<td class="note">${lv.note.row(bits)}</td>` : '')
        + '</tr>';
    }
    tt.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    rowEls = Array.from(tt.querySelectorAll('tbody tr'));
    rowEls.forEach((tr, r) => tr.addEventListener('click', () => setRow(r)));
    ttWrap.scrollTop = 0;
  }

  /* ------------------------------------------------------------ refresh */
  // show the circuit's signals on the board and its answers in the table
  function refresh() {
    const lv = S.level;
    const now = Gates.run(lv, S.gates, S.bits);
    world.setSignals(now);
    const want = Gates.wantOf(lv, S.bits);
    world.setMarks(now.outputs.map((v, k) => (v == null ? 'none' : v === want[k] ? 'ok' : 'bad')));
    const s = Gates.score(lv, S.gates);
    S.score = s;
    const cur = Gates.rowOf(S.bits);
    s.rows.forEach((row, r) => {
      const tr = rowEls[r];
      tr.classList.toggle('ok', row.ok === true);
      tr.classList.toggle('bad', row.ok === false);
      tr.classList.toggle('cur', r === cur);
      tr.dataset.ok = row.ok === true ? 'yes' : row.ok === false ? 'no' : 'unknown';
      const gots = tr.querySelectorAll('td.got');
      row.got.forEach((v, k) => {
        const td = gots[k];
        td.textContent = v == null ? '–' : String(v);
        td.className = `got${k === 0 ? ' first-out' : ''} ${v == null ? 'none' : v === row.want[k] ? 'good v' + v : 'bad'}`;
      });
      const mark = tr.querySelector('td.mark');
      mark.firstChild.textContent = row.ok === true ? '✓' : row.ok === false ? '✗' : '?';
      mark.lastChild.textContent = row.ok === true ? 'matches' : row.ok === false ? 'wrong' : 'no signal yet';
    });
    scoreEl.textContent = `${s.match}/${s.total} ✓`;
    scoreEl.setAttribute('aria-label', say.rows(s));
    scoreEl.classList.toggle('all', s.solved);
    // keep the row on the switches in view in a scrolling table
    const tr = rowEls[cur];
    if (tr && ttWrap.scrollHeight > ttWrap.clientHeight) {
      const head = tt.tHead ? tt.tHead.offsetHeight : 0;
      if (tr.offsetTop - head < ttWrap.scrollTop) ttWrap.scrollTop = tr.offsetTop - head;
      else if (tr.offsetTop + tr.offsetHeight > ttWrap.scrollTop + ttWrap.clientHeight) ttWrap.scrollTop = tr.offsetTop + tr.offsetHeight - ttWrap.clientHeight;
    }
    boardEl.dataset.gates = S.gates.map((g) => g || '').join(',');
    boardEl.dataset.switches = S.bits.join('');
    drawPalette();
    return s;
  }

  function lampLines() {
    const now = Gates.run(S.level, S.gates, S.bits);
    const want = Gates.wantOf(S.level, S.bits);
    return S.level.outputs.map((o, k) => say.lamp(o.name, now.outputs[k], want[k])).join(' ');
  }

  /* ------------------------------------------------------------- cursor */
  function describe(item) {
    return item.kind === 'in' ? say.switchFocus(inputName(item.i), S.bits[item.i]) : say.slotFocus(S.level, item.i, S.gates[item.i]);
  }
  function moveCursor(item, announce) {
    if (!item) return;
    S.cursor = item;
    if (item.kind === 'slot') S.slot = item.i;
    world.select(item);
    boardEl.dataset.cursor = `${item.kind}:${item.i}`;
    drawPalette();
    if (announce) srFocus.textContent = describe(item);
  }
  // the nearest switch or slot on screen in an arrow's direction
  function step(dir) {
    const here = world.toScreen(S.cursor);
    let best = null;
    let bestScore = Infinity;
    for (const it of items()) {
      if (same(it, S.cursor)) continue;
      const p = world.toScreen(it);
      const dx = p.x - here.x;
      const dy = p.y - here.y;
      const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const across = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) moveCursor(best, true);
  }

  /* -------------------------------------------------------------- moves */
  function canEdit() {
    return S.screen === 'play';
  }

  function placeGate(i, id) {
    if (!canEdit()) return;
    const lv = S.level;
    if (!lv.palette.includes(id)) {
      tell(say.notInBox(id, sortedPalette()));
      Sfx.play('uhoh');
      return;
    }
    if (!Gates.fits(lv.slots[i], id)) {
      moveCursor({ kind: 'slot', i }, false);
      tell(say.noFit());
      Sfx.play('uhoh');
      return;
    }
    stopTest(true);
    moveCursor({ kind: 'slot', i }, false);
    if (S.gates[i] === id) {
      tell(say.placed(i + 1, id, Gates.joined(lv.slots[i], id), S.score));
      return;
    }
    const before = S.score.match;
    S.history.push(S.gates.slice());
    S.gates[i] = id;
    world.setGate(i, id, true);
    const s = refresh();
    tell(say.placed(i + 1, id, Gates.joined(lv.slots[i], id), s));
    if (s.match > before) Sfx.play('good', Math.min(8, s.match));
    else Sfx.play('pop');
    checkSolved(s);
  }

  function cycleSlot(i) {
    placeGate(i, Gates.cycle(S.level, i, S.gates[i]));
  }

  function emptySlot(i) {
    if (!canEdit()) return;
    moveCursor({ kind: 'slot', i }, false);
    if (!S.gates[i]) {
      tell(say.alreadyEmpty(i + 1));
      return;
    }
    stopTest(true);
    S.history.push(S.gates.slice());
    S.gates[i] = null;
    world.setGate(i, null);
    tell(say.emptied(i + 1, refresh()));
    Sfx.play('poof');
  }

  function flip(i) {
    if (!canEdit()) return;
    stopTest(true);
    S.bits[i] ^= 1;
    moveCursor({ kind: 'in', i }, false);
    refresh();
    tell(`${say.flip(inputName(i), S.bits[i])} ${lampLines()}`);
    Sfx.play('hop');
  }

  // a click on a row of the table sets the switches to match it
  function setRow(r) {
    if (!canEdit()) return;
    stopTest(true);
    S.bits = Gates.bitsOf(S.level, r);
    refresh();
    tell(`${say.setTo(S.level, S.bits)} ${lampLines()}`);
    Sfx.play('hop');
  }

  function activate() {
    if (!S.cursor) return;
    if (S.cursor.kind === 'in') flip(S.cursor.i);
    else cycleSlot(S.cursor.i);
  }

  function undo() {
    if (!canEdit()) return;
    if (!S.history.length) {
      tell(say.nothingToUndo());
      return;
    }
    stopTest(true);
    const prev = S.history.pop();
    prev.forEach((id, i) => {
      if (id !== S.gates[i]) {
        world.setGate(i, id, false);
        moveCursor({ kind: 'slot', i }, false);
      }
    });
    S.gates = prev;
    refresh();
    tell(say.undo());
    Sfx.play('poof');
  }

  function clearAll() {
    if (!canEdit()) return;
    if (S.gates.every((g) => !g)) {
      tell(say.alreadyClear());
      return;
    }
    stopTest(true);
    S.history.push(S.gates.slice());
    S.gates = S.gates.map(() => null);
    S.gates.forEach((_, i) => world.setGate(i, null));
    refresh();
    tell(say.cleared());
    Sfx.play('poof');
  }

  /* First press: which slot needs attention. Pressed again with nothing
   * changed: which gate to try there. */
  function hint() {
    if (!canEdit()) return;
    const h = Gates.hint(S.level, S.gates, S.sols);
    if (h.kind === 'solved' || h.kind === 'none') {
      tell(say.hintSolved());
      return;
    }
    const key = S.gates.join(',') + '|' + h.slot;
    moveCursor({ kind: 'slot', i: h.slot }, false);
    if (S.hintKey === key && S.hintStep === 1) {
      S.hintStep = 2;
      tell(say.hintTry(h.slot + 1, h.gate));
    } else {
      S.hintKey = key;
      S.hintStep = 1;
      tell(h.kind === 'wrong' ? say.hintWrong(h.slot + 1) : say.hintEmpty(h.slot + 1));
    }
    Sfx.play('pop');
  }

  /* ---------------------------------------------------------- testing */
  function toggleTest() {
    if (!canEdit()) return;
    if (S.testing) stopTest(false);
    else startTest();
  }
  function startTest() {
    S.testing = { row: 0, timer: null };
    $('testBtn').setAttribute('aria-pressed', 'true');
    tell(say.testing());
    S.testing.timer = later(0.5, stepTest);
  }
  function stepTest() {
    const T = S.testing;
    if (!T) return;
    if (T.row >= Gates.rowCount(S.level)) {
      S.testing = null;
      $('testBtn').setAttribute('aria-pressed', 'false');
      tell(say.tested(S.score, S.level));
      Sfx.play(S.score.solved ? 'win' : 'pop');
      return;
    }
    S.bits = Gates.bitsOf(S.level, T.row);
    const s = refresh();
    const row = s.rows[T.row];
    tell(say.testRow(S.level, row.bits, row.got, row.ok));
    Sfx.play(row.ok === true ? 'good' : row.ok === false ? 'uhoh' : 'pop', T.row);
    T.row++;
    T.timer = later(0.95, stepTest);
  }
  function stopTest(silent) {
    if (!S.testing) return;
    cancel(S.testing.timer);
    S.testing = null;
    $('testBtn').setAttribute('aria-pressed', 'false');
    if (!silent) tell(say.testStopped());
  }

  /* -------------------------------------------------------------- done */
  function checkSolved(s) {
    if (!s.solved) return;
    if (S.solvedNow) {
      tell(say.solvedAgain());
      return;
    }
    S.solvedNow = true;
    finish();
  }
  function finish() {
    S.screen = 'done';
    S.solved.add(S.index);
    stopTest(true);
    world.cheer();
    Sfx.play('win');
    tell(say.solved(S.index + 1));
    later(1.2, () => {
      $('doneTitle').textContent = `Level ${S.index + 1} solved!`;
      $('doneSub').textContent = S.level.outro;
      $('nextLevel').hidden = S.index >= Gates.LEVELS.length - 1;
      done.hidden = false;
      ($('nextLevel').hidden ? $('stay') : $('nextLevel')).focus({ preventScroll: true });
    });
  }
  function stay() {
    done.hidden = true;
    S.screen = 'play';
    boardEl.focus({ preventScroll: true });
  }
  $('nextLevel').addEventListener('click', () => startLevel(S.index + 1));
  $('stay').addEventListener('click', stay);
  $('allLevels').addEventListener('click', showMenu);

  /* ------------------------------------------------------- gate guide */
  (function buildGuide() {
    const list = $('guideList');
    ORDER.forEach((id) => {
      const g = Gates.GATES[id];
      const card = document.createElement('article');
      card.className = 'gate-card';
      const top = document.createElement('div');
      top.className = 'gate-card-top';
      const cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      drawGate(cv, id, 84, 42);
      const names = document.createElement('div');
      names.innerHTML = `<h3>${id}</h3><p class="expr">Q = ${g.expr}</p>`;
      top.append(cv, names);
      const rule = document.createElement('p');
      rule.className = 'rule';
      rule.textContent = g.rule;
      const rows = g.n === 1 ? [[0], [1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
      const table = document.createElement('table');
      table.className = 'mini';
      table.innerHTML = `<caption class="visually-hidden">${id} truth table</caption><thead><tr>${g.n === 1 ? '<th scope="col">A</th>' : '<th scope="col">A</th><th scope="col">B</th>'}<th scope="col">Q</th></tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}<td class="${Gates.apply(id, r) ? 'y' : ''}">${Gates.apply(id, r)}</td></tr>`).join('')}</tbody>`;
      card.append(top, rule, table);
      list.appendChild(card);
    });
  })();
  function openGuide() {
    S.back = document.activeElement;
    guide.hidden = false;
    $('guideClose').focus({ preventScroll: true });
  }
  function closeGuide() {
    guide.hidden = true;
    const to = S.back && document.contains(S.back) && !S.back.closest('[hidden]') ? S.back : S.screen === 'play' ? boardEl : null;
    if (to) to.focus({ preventScroll: true });
  }
  $('guideBtn').addEventListener('click', openGuide);
  $('menuGuide').addEventListener('click', openGuide);
  $('guideClose').addEventListener('click', closeGuide);
  guide.addEventListener('click', (e) => { if (e.target === guide) closeGuide(); });

  /* ------------------------------------------------------------ tools */
  $('menuBtn').addEventListener('click', showMenu);
  $('undoBtn').addEventListener('click', undo);
  $('clearBtn').addEventListener('click', clearAll);
  $('hintBtn').addEventListener('click', hint);
  $('testBtn').addEventListener('click', toggleTest);
  $('tableToggle').addEventListener('click', () => {
    const closed = side.classList.toggle('closed');
    $('tableToggle').setAttribute('aria-expanded', String(!closed));
    $('tableToggle').setAttribute('aria-label', closed ? 'Show the truth table' : 'Hide the truth table');
    $('tableToggle').firstChild.textContent = closed ? '▴' : '▾';
    fit();
  });

  /* -------------------------------------------------------------- input */
  const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  // a single letter flips the switch with that name (A, B, C, S), or the one whose name starts with it, if only one does
  function switchForKey(k) {
    if (!S.level || 'hirtz'.includes(k)) return -1;
    const hits = S.level.inputs.map((p, i) => (p.name[0].toLowerCase() === k ? i : -1)).filter((i) => i >= 0);
    return hits.length === 1 ? hits[0] : -1;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      S.tabDir = e.shiftKey ? -1 : 1;
      setTimeout(() => { S.tabDir = 0; }, 0);
    }
    // the gate guide: Escape closes it, Tab stays inside it
    if (!guide.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeGuide();
      } else if (e.key === 'Tab') {
        const stops = [$('guideClose'), guide.querySelector('.guide-body')];
        const k = stops.indexOf(document.activeElement);
        e.preventDefault();
        stops[(k + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
      }
      return;
    }
    if (S.screen === 'done') {
      if (!done.hidden && e.key === 'Escape') {
        e.preventDefault();
        stay();
      } else if (!done.hidden && e.key === 'Tab') {
        const stops = Array.from(done.querySelectorAll('button')).filter((b) => !b.hidden);
        const k = stops.indexOf(document.activeElement);
        e.preventDefault();
        stops[(k + (e.shiftKey ? stops.length - 1 : 1) + stops.length) % stops.length].focus();
      }
      return;
    }
    if (S.screen !== 'play') return;
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onBoard = e.target === boardEl;
    const onButton = !!(e.target && e.target.closest && e.target.closest('button'));
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Enter' || k === ' ') {
      if (onBoard) {
        e.preventDefault();
        activate();
      }
      return;
    }
    if (ARROWS[k]) {
      if (onBoard) {
        e.preventDefault();
        step(ARROWS[k]);
      }
      return;
    }
    if (/^[1-6]$/.test(k)) {
      e.preventDefault();
      placeGate(S.slot, ORDER[+k - 1]);
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      emptySlot(S.slot);
    } else if (k === 'z') {
      e.preventDefault();
      undo();
    } else if (k === 'r') {
      e.preventDefault();
      clearAll();
    } else if (k === 'h') {
      e.preventDefault();
      hint();
    } else if (k === 't') {
      e.preventDefault();
      toggleTest();
    } else if (k === 'i' || k === '?') {
      e.preventDefault();
      openGuide();
    } else if (k === 'Escape') {
      if (S.testing) stopTest(false);
    } else if (k.length === 1 && !onButton) {
      const i = switchForKey(k);
      if (i >= 0) {
        e.preventDefault();
        flip(i);
      }
    }
  });

  // Tab moves through the switches and slots, then on out of the board
  boardEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || S.screen !== 'play' || !S.cursor) return;
    const list = items();
    const k = list.findIndex((it) => same(it, S.cursor));
    const next = k + (e.shiftKey ? -1 : 1);
    if (next < 0 || next >= list.length) return;
    e.preventDefault();
    moveCursor(list[next], true);
  });
  boardEl.addEventListener('focus', () => {
    if (S.screen !== 'play') return;
    const list = items();
    if (S.tabDir === 1) moveCursor(list[0], true);
    else if (S.tabDir === -1) moveCursor(list[list.length - 1], true);
    else if (S.cursor) srFocus.textContent = describe(S.cursor);
  });

  // a tap on a switch flips it; a tap on a slot selects it, and a second tap changes its gate
  let down = null;
  boardEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  boardEl.addEventListener('pointerup', (e) => {
    if (!down || S.screen !== 'play') return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 24) return;
    const it = world.pick(e.clientX, e.clientY);
    if (!it) return;
    if (it.kind === 'in') {
      flip(it.i);
    } else if (same(it, S.cursor)) {
      cycleSlot(it.i);
    } else {
      moveCursor(it, false);
      tell(say.slotPick(it.i + 1, S.gates[it.i]));
    }
  });
  boardEl.addEventListener('pointercancel', () => { down = null; });

  /* ------------------------------------------------------- every frame */
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

  // wide screens put the table beside the board; narrow ones under it
  function fit() {
    const wide = stage.clientWidth >= 760;
    stage.classList.toggle('wide', wide);
    side.style.maxHeight = wide ? '' : Math.max(150, Math.round(stage.clientHeight * 0.42)) + 'px';
    world.resize();
    const top = tools.hidden ? 12 : tools.offsetTop + tools.offsetHeight + 10;
    const bottom = palette.hidden ? 12 : palette.offsetHeight + 18;
    world.setInsets(top, bottom, wide ? 14 : 4);
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    ro.observe(boardWrap);
  } else {
    window.addEventListener('resize', fit);
  }

  // behind the menu: a full adder, built and adding 1 + 1
  (function demo() {
    const i = Gates.LEVELS.findIndex((lv) => lv.title === 'Full adder');
    const lv = Gates.LEVELS[i];
    const sol = Gates.solutions(lv)[0];
    world.build(lv, layoutOf(i));
    sol.forEach((id, k) => world.setGate(k, id, false));
    world.setSignals(Gates.run(lv, sol, [1, 1, 0]));
    world.setMarks(lv.outputs.map(() => 'ok'));
  })();
  fit();
  fonts().then(() => world.repaint());
  drawLevelButtons();
  start();
})();
