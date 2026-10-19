/* The shared play loop for What's Different? (3+) and Spot the Difference
 * (7+): two pictures, taps and keys, rings, dots, hints, sounds and the
 * round-to-round rules from the spec. Classic script; sets window.Spot.Play.
 * Nothing is stored: every number here lasts only this visit. */
(function (root) {
  'use strict';
  const Scenes = root.Spot.Scenes, Draw = root.Spot.Draw;
  const NS = 'http://www.w3.org/2000/svg';
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---- a tiny WebAudio synth; silent while the site's sound toggle is off ----
  const AudioCtx = root.AudioContext || root.webkitAudioContext;
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
    if (root.pimwMuted) return;
    if (!AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'ping') { tone(660, 0, 0.12, 0.1); tone(990, 0.1, 0.18, 0.1); }
      else if (kind === 'boop') tone(260, 0, 0.16, 0.05);
      else if (kind === 'chime') { tone(784, 0, 0.1, 0.07); tone(1046, 0.09, 0.14, 0.07); }
      else if (kind === 'tada') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 0.1));
    } catch (e) { /* sound is optional */ }
  }
  function confetti() {
    const colours = ['#f59e0b', '#fbbf24', '#ff6b57', '#15803d', '#7c3aed', '#2563eb'];
    for (let i = 0; i < 60; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colours[i % colours.length];
      bit.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
      bit.style.animationDelay = Math.random() * 0.6 + 's';
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 5000);
    }
  }

  function start(config) {
    const band = config.band, mount = config.mount || document, T = config.strings, voice = config.voice || null;
    const critters = config.critters || '../../icons/critters/';
    const $ = (id) => mount.querySelector('#' + id);
    const svg = { a: $('picA'), b: $('picB') };
    const S = { seed: config.seed === undefined ? Math.floor(Math.random() * 1e9) : config.seed, round: 0, level: 0,
      hints: 0, autoHints: 0, stars: 0, found: new Set(), scene: null, row: null, theme: null, over: false, gaveUp: false, lastFind: -1e9, timer: 0 };
    const say = (text) => { if (voice && voice.say) voice.say(text); };
    const tell = (text) => { $('tell').textContent = text; };
    const el = (name, attrs) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const marks = (side) => svg[side].querySelector('.marks');

    // ---- pictures ----
    function render(side) {
      const s = svg[side];
      s.innerHTML = Draw.picture(S.scene[side], { theme: S.theme, critters, side }) + '<g class="marks"></g>';
      const first = s.querySelector('.item');
      if (first) first.setAttribute('tabindex', '0');
    }
    function ring(side, region, cls) {
      const g = el('g', { class: cls });
      g.appendChild(el('circle', { class: 'halo', cx: region.x, cy: region.y, r: region.r }));
      g.appendChild(el('circle', { class: 'ring', cx: region.x, cy: region.y, r: region.r }));
      marks(side).appendChild(g);
      return g;
    }
    function ripple(side, x, y) {
      const c = el('circle', { class: 'ripple', cx: x, cy: y, r: 22 });
      marks(side).appendChild(c);
      setTimeout(() => c.remove(), 500);
    }
    function dots() {
      const d = $('dots');
      d.innerHTML = '';
      S.scene.diffs.forEach((diff) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (S.found.has(diff.id) ? ' on' : '');
        d.appendChild(dot);
      });
    }
    function toPicture(side, cx, cy) {
      const s = svg[side], pt = s.createSVGPoint();
      pt.x = cx; pt.y = cy;
      const p = pt.matrixTransform(s.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    }
    const itemOf = (side, id) => S.scene[side].find((it) => it.id === id);

    // ---- a tap or a keypress at a point ----
    function check(side, x, y) {
      if (S.over) return;
      const now = performance.now();
      if (now - S.lastFind < 250) return;
      const d = Scenes.hit(S.scene.diffs, S.found, x, y);
      if (!d) { ripple(side, x, y); sound('boop'); tell(T.miss); return; }
      S.found.add(d.id);
      S.lastFind = now;
      ring('a', d.region, 'found'); ring('b', d.region, 'found');
      dots();
      sound('ping');
      const base = itemOf(d.side === 'a' ? 'b' : 'a', d.item);   // the unchanged side holds the kind before any swap
      const name = Scenes.KINDS[base.kind].name;
      tell(T.found(name, S.found.size, S.scene.diffs.length));
      if (band === 'little') { say(T.spoken(name)); schedule(15000); }
      if (S.found.size === S.scene.diffs.length) finish(false);
    }

    // ---- hints ----
    let hintRings = [];
    function hint(auto) {
      if (S.over) return;
      const left = S.scene.diffs.filter((d) => !S.found.has(d.id));
      if (!left.length) return;
      const d = left[Math.floor(Math.random() * left.length)];
      hintRings.forEach((g) => g.remove());
      hintRings = [ring('a', d.region, 'hint'), ring('b', d.region, 'hint')];
      setTimeout(() => { hintRings.forEach((g) => g.remove()); hintRings = []; if ($('hintBtn') && !S.over) $('hintBtn').disabled = false; }, 2000);
      if (auto) S.autoHints++; else S.hints++;
      if ($('hintBtn')) $('hintBtn').disabled = true;
      sound('chime');
      tell(T.hint);
      if (band === 'little') say(T.hint);
    }
    function schedule(ms) {
      clearTimeout(S.timer);
      if (band !== 'little' || S.over) return;
      S.timer = setTimeout(() => { hint(true); schedule(12000); }, ms);
    }
    function showRest() {
      if (S.over) return;
      S.scene.diffs.filter((d) => !S.found.has(d.id)).forEach((d) => { ring('a', d.region, 'shown'); ring('b', d.region, 'shown'); });
      finish(true);
    }

    // ---- the end of a round, and the next ----
    function finish(gaveUp) {
      S.over = true;
      S.gaveUp = gaveUp;
      clearTimeout(S.timer);
      if (!gaveUp) { sound('tada'); if (!calm()) confetti(); }
      if (band === 'little') {
        tell(T.done);
        say(T.done);
      } else {
        const st = Scenes.stars(S.hints, gaveUp);
        S.stars += st;
        $('starsLabel').textContent = T.stars(S.stars);
        $('doneTitle').textContent = T.doneTitle(S.round);
        $('doneSub').textContent = T.doneSub(st, S.hints, gaveUp);
        $('done').hidden = false;
        tell(T.doneTitle(S.round) + ' ' + T.doneSub(st, S.hints, gaveUp));
        if ($('hintBtn')) $('hintBtn').disabled = true;
        if ($('showBtn')) $('showBtn').disabled = true;
      }
      $('nextBtn').hidden = false;
      $('nextBtn').focus();
    }
    function newRound() {
      if (S.round > 0 && band === 'little') S.level = Scenes.nextLevel(S.level, S.autoHints);
      S.round++;
      S.found = new Set(); S.hints = 0; S.autoHints = 0; S.over = false; S.gaveUp = false; S.lastFind = -1e9;
      hintRings = [];
      S.theme = Scenes.theme(band, S.round, S.seed);
      S.row = band === 'little' ? Scenes.LITTLE[S.level] : Scenes.BIG[Scenes.tier(S.round)];
      S.scene = Scenes.make(S.seed + S.round, S.row, S.theme);
      render('a'); render('b');
      dots();
      $('intro').textContent = T.intro(S.row.diffs);
      // the Next button sat below the pictures, so a phone is now scrolled past them
      if (S.round > 1 && $('intro').scrollIntoView) $('intro').scrollIntoView({ block: 'nearest' });
      $('nextBtn').hidden = true;
      if ($('done')) $('done').hidden = true;
      if ($('roundLabel')) $('roundLabel').textContent = T.round(S.round);
      if ($('starsLabel')) $('starsLabel').textContent = T.stars(S.stars);
      if ($('hintBtn')) $('hintBtn').disabled = false;
      if ($('showBtn')) $('showBtn').disabled = false;
      tell('');
      if (band === 'little') { say(T.start); schedule(15000); }
    }

    // ---- keyboard: roving focus among a picture's items ----
    function focusRing(side, item) {
      marks(side).querySelectorAll('.focus, .focus-halo').forEach((e) => e.remove());
      if (!item) return;
      const r = Scenes.half(item) + 6;
      marks(side).appendChild(el('circle', { class: 'focus-halo', cx: item.x, cy: item.y, r }));
      marks(side).appendChild(el('circle', { class: 'focus', cx: item.x, cy: item.y, r }));
    }
    function move(side, fromEl, key) {
      const from = itemOf(side, fromEl.dataset.id);
      const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
      let best = null, bestD = Infinity;
      for (const it of S.scene[side]) {
        if (it.id === from.id) continue;
        const dx = it.x - from.x, dy = it.y - from.y;
        const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]);
        if (along <= 0 || across > along) continue;                // a 90° cone ahead
        const dist = Math.hypot(dx, dy);
        if (dist < bestD) { bestD = dist; best = it; }
      }
      if (!best) return;
      fromEl.setAttribute('tabindex', '-1');
      const to = svg[side].querySelector('#' + side + '-' + best.id);
      to.setAttribute('tabindex', '0');
      to.focus();
    }
    for (const side of ['a', 'b']) {
      svg[side].addEventListener('click', (e) => {
        const p = toPicture(side, e.clientX, e.clientY);
        check(side, p.x, p.y);
      });
      svg[side].addEventListener('keydown', (e) => {
        const g = e.target.closest ? e.target.closest('.item') : null;
        if (!g) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const it = itemOf(side, g.dataset.id);
          check(side, it.x, it.y);
        } else if (e.key.indexOf('Arrow') === 0) {
          e.preventDefault();
          move(side, g, e.key);
        }
      });
      svg[side].addEventListener('focusin', (e) => {
        const g = e.target.closest ? e.target.closest('.item') : null;
        focusRing(side, g ? itemOf(side, g.dataset.id) : null);
      });
      svg[side].addEventListener('focusout', () => focusRing(side, null));
    }
    $('nextBtn').addEventListener('click', newRound);
    if ($('hintBtn')) $('hintBtn').addEventListener('click', () => hint(false));
    if ($('showBtn')) $('showBtn').addEventListener('click', showRest);

    newRound();
    return {
      get round() { return S.round; }, get level() { return band === 'little' ? S.level : null; },
      get tier() { return band === 'big' ? Scenes.tier(S.round) : null; }, get seed() { return S.seed; },
      get theme() { return S.theme; }, get diffs() { return S.scene.diffs; }, get found() { return Array.from(S.found); },
      get hints() { return band === 'little' ? S.autoHints : S.hints; }, get stars() { return S.stars; }, get over() { return S.over; },
    };
  }

  root.Spot = root.Spot || {};
  root.Spot.Play = { start };
})(this);
