/* Chart Detective: the page. Picks a case, draws the chart (tally,
 * pictogram, block diagram, bar chart or table), runs the collecting phase,
 * asks the questions with the two-step hint ladder, and closes the case.
 * All the numbers and words come from charts.js; this file only renders.
 * Nothing is stored: a case lives only while the page is open. */
(function () {
  'use strict';
  const CD = window.ChartDetective;
  const G = window.ChartDetectiveGlyphs;
  const Voice = window.Voice;
  const $ = (id) => document.getElementById(id);
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const COLOURS = ['c-blue', 'c-green', 'c-yellow', 'c-purple', 'c-pink'];

  // ---- a tiny synth; silent while the site's sound toggle is off ----------
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audio = null;
  function tone(freq, when, dur, gain) {
    const osc = audio.createOscillator(), g = audio.createGain();
    osc.connect(g); g.connect(audio.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audio.currentTime + when);
    g.gain.setValueAtTime(gain, audio.currentTime + when);
    g.gain.linearRampToValueAtTime(0.001, audio.currentTime + when + dur);
    osc.start(audio.currentTime + when);
    osc.stop(audio.currentTime + when + dur);
  }
  function sound(kind) {
    if (window.pimwMuted || !AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'place') tone(520, 0, 0.06, 0.05);
      else if (kind === 'right') { tone(660, 0, 0.14, 0.1); tone(880, 0.12, 0.2, 0.1); }
      else if (kind === 'oops') { tone(294, 0, 0.14, 0.06); tone(247, 0.13, 0.22, 0.05); }
      else if (kind === 'done') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.28, 0.1));
    } catch (e) { /* sound is optional */ }
  }
  const say = (text) => { try { if (Voice) Voice.say(text); } catch (e) { /* a voice must never break the game */ } };

  // ---- state ---------------------------------------------------------------
  const el = {
    pick: $('pickView'), play: $('playView'), stages: $('stages'), tell: $('tell'), sayBtn: $('sayBtn'),
    spot: $('spot'), spotUse: $('spotUse'), spotName: $('spotName'), spotCount: $('spotCount'),
    chartTitle: $('chartTitle'), chart: $('chart'), chartKey: $('chartKey'), srCaption: $('srCaption'), srBody: $('srBody'),
    chips: $('chips'), done: $('done'), doneHead: $('doneHead'), findings: $('findings'),
    nextStage: $('nextStageBtn'), nextCase: $('nextCaseBtn'), cases: $('casesBtn'),
  };
  const params = new URLSearchParams(location.search);
  const fixedSeed = /^\d+$/.test(params.get('seed') || '') ? Number(params.get('seed')) : null;   // for the end-to-end player
  let seedNext = fixedSeed === null ? null : fixedSeed;
  const casesPlayed = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };   // this visit only: picks the key or the axis step
  const S = { stage: 0, round: null, placed: [], arrival: 0, qi: 0, attempts: 0, phase: 'pick', findings: [], timer: 0, lastSaid: '' };

  function nextSeed() {
    if (seedNext !== null) return seedNext++;
    return Math.floor(Math.random() * 2147483647);
  }
  function setPhase(phase) {
    S.phase = phase;
    el.play.setAttribute('data-phase', phase);
    el.play.setAttribute('data-qi', String(S.qi));
    el.play.setAttribute('data-attempts', String(S.attempts));
  }
  function tell(text, mood, speak) {
    el.tell.textContent = text;
    el.tell.className = 'tell' + (mood ? ' is-' + mood : '');
    S.lastSaid = speak === undefined ? text : speak;
    if (S.lastSaid) say(S.lastSaid);
  }
  const later = (fn, ms) => { clearTimeout(S.timer); S.timer = setTimeout(fn, calm() ? Math.min(ms, 300) : ms); };

  // ---- the start screen ------------------------------------------------------
  function buildStages() {
    el.stages.innerHTML = '';
    for (const st of CD.STAGES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'stage-btn'; b.dataset.stage = String(st.id);
      b.innerHTML = '<span class="num" aria-hidden="true">' + st.id + '</span><span class="name"></span><span class="blurb"></span>';
      b.querySelector('.name').textContent = st.name;
      b.querySelector('.blurb').textContent = st.blurb + ' · ' + st.ages;
      b.setAttribute('aria-label', 'Stage ' + st.id + ', ' + st.name + ': ' + st.blurb + ', ' + st.ages);
      b.addEventListener('click', () => startCase(st.id));
      el.stages.appendChild(b);
    }
  }
  function showPick() {
    clearTimeout(S.timer);
    setPhase('pick');
    el.play.hidden = true;
    el.pick.hidden = false;
    const first = el.stages.querySelector('.stage-btn');
    if (first) first.focus();
  }

  // ---- drawing the chart ------------------------------------------------------
  const glyph = (id, cls) => '<svg class="glyph' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#g-' + id + '"/></svg>';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function tallyMarks(n, fresh) {
    const groups = CD.tallyGroups(n);
    return groups.map((g, gi) => {
      let d = '';
      for (let i = 0; i < Math.min(g, 4); i++) d += 'M' + (5 + i * 7) + ' 4v20';
      if (g === 5) d += 'M2 22L30 6';
      const isNew = fresh && gi === groups.length - 1;
      return '<svg viewBox="0 0 34 28" aria-hidden="true" focusable="false" class="' + (isNew ? 'new' : '') + '"><path d="' + d + '"/></svg>';
    }).join('');
  }

  // a column button: the label it carries is the category's name while
  // collecting, and name plus count once the chart is complete
  function colButton(i, inner) {
    const r = S.round, c = r.categories[i];
    const collecting = S.phase === 'collect';
    const label = collecting ? c.name : c.plural + ': ' + S.placed[i];
    return '<button type="button" class="col' + (collecting ? ' pickable' : '') + '" data-i="' + i + '" data-cat="' + c.id + '" aria-label="' + label + '">' + inner + '</button>';
  }

  function drawChart(fresh) {
    const r = S.round;
    const chart = el.chart;
    el.chartTitle.textContent = r.chart === 'table' ? cap(r.tableUnit) + ' ' + r.themeData.verb + ' this week' : r.title;
    el.chartKey.hidden = true;
    let html = '';
    if (r.chart === 'tally') {
      chart.className = 'chart tally';
      html = r.categories.map((c, i) => colButton(i, glyph(c.id) + '<span class="label">' + c.name + '</span><span class="tally-marks">' + tallyMarks(S.placed[i], fresh === i) + '</span>')).join('');
    } else if (r.chart === 'pictogram' || r.chart === 'block') {
      chart.className = 'chart cols';
      html = r.categories.map((c, i) => {
        let stack = '';
        if (r.chart === 'block') {
          for (let k = 0; k < S.placed[i]; k++) stack += '<span class="block ' + COLOURS[i % COLOURS.length] + '"></span>';
        } else {
          const s = CD.symbolsFor(S.placed[i], r.key);
          for (let k = 0; k < s.whole; k++) stack += glyph(c.id);
          if (s.half) stack += glyph(c.id, 'half');
        }
        return colButton(i, '<span class="stack">' + stack + '</span>' + glyph(c.id) + '<span class="label">' + c.name + '</span>');
      }).join('');
      if (r.chart === 'pictogram') {
        el.chartKey.hidden = false;
        el.chartKey.innerHTML = '<span>Key:</span>' + glyph(r.categories[0].id) + '<span>= ' + r.key + '</span>';
      }
    } else if (r.chart === 'bar') {
      chart.className = 'chart bars';
      let axis = '', grid = '';
      for (let v = 0; v <= r.max; v += r.step) {
        const pct = (100 * (1 - v / r.max)).toFixed(2);
        axis += '<span style="top:' + pct + '%">' + v + '</span>';
        if (v > 0) grid += '<div class="grid" style="top:' + pct + '%"></div>';
      }
      const bars = r.categories.map((c, i) => colButton(i, '<span class="bar ' + COLOURS[i % COLOURS.length] + '" style="height:' + (100 * S.placed[i] / r.max).toFixed(2) + '%"></span>')).join('');
      const labels = r.categories.map((c) => '<span class="lab">' + glyph(c.id) + c.name + '</span>').join('');
      html = '<div class="axis" aria-hidden="true">' + axis + '</div><div class="plot">' + grid + bars + '</div><div class="bar-labels" aria-hidden="true">' + labels + '</div>';
    } else {
      chart.className = 'chart';
      const t = r.table;
      html = '<table class="data"><thead><tr><th class="name" scope="col"><span class="sr-only">Who</span></th>' + r.days.map((d) => '<th scope="col"><span class="long">' + d + '</span><abbr class="short" title="' + d + '">' + d.slice(0, 3) + '</abbr></th>').join('') + '<th scope="col" class="total">Total</th></tr></thead><tbody>';
      r.rows.forEach((name, i) => {
        const total = t.cells[i].reduce((a, b) => a + b, 0);
        html += '<tr><th class="name" scope="row">' + name + '</th>' + t.cells[i].map((v, j) => (i === t.r0 && j === t.c0 ? '<td class="hidden-cell" data-r="' + i + '" data-c="' + j + '" aria-label="hidden">?</td>' : '<td data-r="' + i + '" data-c="' + j + '">' + v + '</td>')).join('') +
          (i === t.r0 ? '<td class="total" data-r="' + i + '" data-c="-1">' + total + '</td>' : '<td class="total" aria-label="not shown"></td>') + '</tr>';
      });
      html += '</tbody></table>';
    }
    chart.innerHTML = html;
    drawSrTable();
  }

  // the same numbers as a real table, for screen readers
  function drawSrTable() {
    const r = S.round;
    if (r.chart === 'table') { el.srCaption.textContent = ''; el.srBody.innerHTML = ''; return; }
    const kind = r.chart === 'tally' ? 'Tally chart' : r.chart === 'block' ? 'Block diagram' : r.chart === 'bar' ? 'Bar chart' : 'Pictogram';
    el.srCaption.textContent = kind + ': ' + r.title + (r.chart === 'pictogram' ? '. Each picture stands for ' + r.key : r.chart === 'bar' ? '. The axis goes up in steps of ' + r.step : '') + '.';
    el.srBody.innerHTML = r.categories.map((c, i) => '<tr><th scope="row"></th><td></td></tr>').join('');
    const rows = el.srBody.querySelectorAll('tr');
    r.categories.forEach((c, i) => { rows[i].firstChild.textContent = cap(c.plural); rows[i].lastChild.textContent = String(S.placed[i]); });
  }

  const cols = () => Array.from(el.chart.querySelectorAll('button.col'));
  const colOf = (i) => el.chart.querySelector('button.col[data-i="' + i + '"]');
  function clearMarks() {
    for (const b of cols()) b.classList.remove('lit', 'is-right', 'is-wrong', 'pickable', 'nudge');
    for (const x of el.chart.querySelectorAll('.extra')) x.classList.remove('extra');
    for (const td of el.chart.querySelectorAll('td.lit')) td.classList.remove('lit');
  }

  // ---- a case ------------------------------------------------------------------
  function startCase(stageId) {
    clearTimeout(S.timer);
    S.stage = stageId;
    S.round = CD.generateRound(stageId, nextSeed(), casesPlayed[stageId]);
    S.findings = [];
    S.qi = 0; S.attempts = 0;
    el.pick.hidden = true;
    el.play.hidden = false;
    el.done.hidden = true;
    el.chips.innerHTML = '';
    el.chart.setAttribute('data-stage', String(stageId));
    el.chart.setAttribute('data-seed', String(S.round.seed));
    el.chart.setAttribute('data-case', String(S.round.caseIndex));
    if (S.round.collect) {
      S.placed = S.round.counts.map(() => 0);
      S.arrival = 0;
      setPhase('collect');
      drawChart();
      el.spot.hidden = true;                      // shown by the first arrival
      tell('Tap where each one goes!', '', '');
      later(showArrival, 600);
    } else {
      S.placed = S.round.counts.slice();
      setPhase('ask');
      drawChart();
      el.spot.hidden = true;
      askQuestion(0);
    }
    // The title stays on screen, so the site's fixed full-screen button never
    // covers the speak button. An instant jump, never smooth: a tap that lands
    // while the page is still gliding hits whatever slid under the finger.
    document.querySelector('header.game-head').scrollIntoView({ block: 'start' });
  }

  function showArrival() {
    const r = S.round;
    const c = r.categories[r.arrivals[S.arrival]];
    el.spot.hidden = false;
    el.spotUse.setAttribute('href', '#g-' + c.id);
    el.spotName.textContent = cap(c.name);
    el.spotCount.textContent = (S.arrival + 1) + ' of ' + r.arrivals.length;
    el.spot.classList.remove('pop');
    void el.spot.offsetWidth;
    el.spot.classList.add('pop');
    el.spot.setAttribute('aria-label', 'Now arriving: ' + c.name);
    tell(cap(c.name) + '!', '', c.name);
  }

  function place(i) {
    const r = S.round;
    const want = r.arrivals[S.arrival];
    const b = colOf(i);
    if (i !== want) {
      b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
      sound('oops');
      const slot = r.chart === 'tally' ? 'row' : 'column';
      tell("That's the " + r.categories[i].name + ' ' + slot + '. Find the ' + r.categories[want].name + ' ' + slot + '.', 'wrong');
      return;
    }
    S.placed[i]++;
    S.arrival++;
    sound('place');
    drawChart(i);
    if (S.arrival < r.arrivals.length) { showArrival(); return; }
    el.spot.hidden = true;
    setPhase('counted');
    drawChart();
    tell('All counted! Now the questions.', 'right');
    later(() => askQuestion(0), 1400);
  }

  // ---- the questions ------------------------------------------------------------
  function askQuestion(qi) {
    const r = S.round;
    const q = r.questions[qi];
    S.qi = qi; S.attempts = 0;
    setPhase('ask');
    clearMarks();
    el.chips.innerHTML = '';
    if (q.kind === 'category') {
      for (const b of cols()) b.classList.add('pickable');
      const note = document.createElement('p');
      note.className = 'note'; note.textContent = 'Tap a ' + (r.chart === 'tally' ? 'row' : 'column') + ' on the chart.';
      el.chips.appendChild(note);
    } else {
      for (const o of q.options) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.dataset.choice = String(o);
        b.textContent = o === 'true' ? 'True' : o === 'false' ? 'False' : String(o);
        b.addEventListener('click', () => answer(String(o), b));
        el.chips.appendChild(b);
      }
    }
    tell(q.text, '', q.say);
  }

  function answer(choice, btn) {
    if (S.phase !== 'ask') return;
    const r = S.round;
    const q = r.questions[S.qi];
    const res = CD.check(r, S.qi, choice);
    if (res.right) {
      if (btn) btn.classList.add('is-right');
      if (q.kind === 'category') colOf(q.targets[0]).classList.add('is-right');
      for (const b of el.chips.querySelectorAll('.chip')) b.disabled = true;
      for (const b of cols()) b.classList.remove('pickable');
      S.findings.push({ text: q.finding, firstTry: S.attempts === 0 });
      sound('right');
      setPhase('right');
      tell('Yes! ' + q.finding, 'right');
      later(nextQuestion, 1500);
      return;
    }
    S.attempts++;
    setPhase('ask');
    sound('oops');
    if (btn) { btn.classList.add('is-wrong'); btn.disabled = true; }
    if (q.kind === 'category') { const b = colOf(r.categories.findIndex((c) => c.id === choice)); if (b) { b.classList.add('is-wrong'); b.classList.remove('pickable'); } }
    if (S.attempts === 1) { tell(res.hint, 'wrong'); return; }
    // the second wrong answer: the worked answer, then the case moves on
    for (const b of el.chips.querySelectorAll('.chip')) { b.disabled = true; if (String(q.answer) === b.dataset.choice) b.classList.add('is-right'); }
    for (const b of cols()) b.classList.remove('pickable');
    S.findings.push({ text: q.finding, firstTry: false });
    showWorked(q);
    setPhase('worked');
    tell(res.explanation, 'wrong');
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'go-btn'; next.id = 'nextQBtn'; next.textContent = 'Next →';
    next.addEventListener('click', nextQuestion);
    el.chips.appendChild(next);
    next.focus({ preventScroll: true });
  }

  // light the columns the explanation talks about, and ring the extra blocks
  function showWorked(q) {
    const r = S.round;
    if (r.chart === 'table') {
      const [row, col] = q.targets;
      for (const td of el.chart.querySelectorAll('td[data-r]')) {
        const tr = Number(td.dataset.r), tc = Number(td.dataset.c);
        if ((row === -1 || tr === row) && (col === -1 || tc === col || col === -1 && tc === -1)) td.classList.add('lit');
        if (q.type === 'missingCell' && tr === row && tc === -1) td.classList.add('lit');
      }
      return;
    }
    const targets = q.kind === 'category' ? r.categories.map((_, i) => i) : q.targets;
    for (const i of targets) { const b = colOf(i); if (b) b.classList.add('lit'); }
    if (q.kind === 'category') { const b = colOf(q.targets[0]); if (b) b.classList.add('is-right'); }
    if ((q.type === 'more' || q.type === 'fewer') && r.chart !== 'bar') {
      const [a, b] = q.targets;
      const small = Math.min(r.counts[a], r.counts[b]);
      const items = colOf(a).querySelectorAll('.stack > *, .tally-marks svg');
      const per = r.chart === 'tally' ? 5 : r.chart === 'pictogram' ? r.key : 1;
      items.forEach((it, k) => { if ((k + 1) * per > small) it.classList.add('extra'); });
    }
  }

  function nextQuestion() {
    clearTimeout(S.timer);
    const r = S.round;
    if (S.qi + 1 < r.questions.length) { askQuestion(S.qi + 1); return; }
    closeCase();
  }

  // ---- case closed --------------------------------------------------------------
  function closeCase() {
    casesPlayed[S.stage]++;
    clearMarks();
    el.chips.innerHTML = '';
    setPhase('done');
    el.findings.innerHTML = '';
    for (const f of S.findings) {
      const li = document.createElement('li');
      li.textContent = f.text;
      if (!f.firstTry) li.classList.add('helped');
      el.findings.appendChild(li);
    }
    const perfect = S.findings.every((f) => f.firstTry);
    el.nextStage.hidden = !(perfect && S.stage < 5);
    el.done.hidden = false;
    sound('done');
    tell(perfect ? 'Case closed! Every answer right first time.' : 'Case closed!', 'right');
    el.doneHead.focus({ preventScroll: true });
    el.chart.scrollIntoView({ block: 'start' });   // instant, for the same reason as in startCase
  }

  // ---- wiring -------------------------------------------------------------------
  el.chart.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.col');
    if (!b) return;
    const i = Number(b.dataset.i);
    if (S.phase === 'collect') place(i);
    else if (S.phase === 'ask' && S.round.questions[S.qi].kind === 'category' && b.classList.contains('pickable')) answer(b.dataset.cat, null);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (el.play.hidden) return;
    const n = Number(ev.key);
    if (!(n >= 1 && n <= 5)) return;
    const b = colOf(n - 1);
    if (!b) return;
    if (S.phase === 'collect' || (S.phase === 'ask' && b.classList.contains('pickable'))) { ev.preventDefault(); b.click(); }
  });
  el.sayBtn.addEventListener('click', () => { if (S.lastSaid) say(S.lastSaid); });
  el.nextCase.addEventListener('click', () => startCase(S.stage));
  el.nextStage.addEventListener('click', () => startCase(Math.min(5, S.stage + 1)));
  el.cases.addEventListener('click', showPick);

  $('sprite').innerHTML = G.sprite();
  buildStages();
  const startStage = Number(params.get('stage'));
  if (startStage >= 1 && startStage <= 5) startCase(startStage);
  else showPick();

  // for the end-to-end player: the current case and where it is
  window.cdTest = {
    round: () => JSON.parse(JSON.stringify(S.round)),
    state: () => ({ phase: S.phase, qi: S.qi, attempts: S.attempts, arrival: S.arrival, placed: S.placed.slice(), stage: S.stage }),
  };
})();
