/* Laser Mirrors: the 3D world.
 *
 * Owns the renderer, the dark lab, the bench (a grid of squares with column
 * letters and row numbers), the pieces (lasers, mirrors and splitters on
 * yellow turntables or bolted plates, blocks, crystals on stands), the
 * glowing beams, the keyboard cursor, the hint marker, the camera (framed to
 * fit any screen, with a little orbit on drag), picking a piece from a tap,
 * and the effects. It draws; game.js decides. Needs THREE and Toon; sets
 * window.World.
 *
 * Square (x, y) of the level sits at world (x - (w - 1) / 2, 0, y - (h - 1) / 2):
 * row 1 is the far side of the bench, column A the left.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BEAM_Y = 0.36;                  // beams run at this height, through the middle of every piece
  const EDGE = { left: 0.8, top: 0.8, right: 0.45, bottom: 0.45 };   // bench beyond the squares
  const BG = '#141834';
  const FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => x * x * (3 - 2 * x);
  const rand = (a, b) => a + Math.random() * (b - a);
  const ADDITIVE = 2;                   // THREE's additive blending, so glows brighten what is behind
  const UP = new THREE.Vector3(0, 1, 0);

  // light: a hot pale core inside a coloured glow (1 white, 2 red, 4 blue, 6 red + blue)
  const LIGHT = {
    1: { core: '#fffaf0', glow: '#ffc94a' },
    2: { core: '#ffe2e2', glow: '#ff4040' },
    4: { core: '#e4eeff', glow: '#4a8cff' },
    6: { core: '#f6e6ff', glow: '#b45cff' },
  };
  const lightOf = (k) => LIGHT[k] || LIGHT[1];
  const GEM = {
    any: { dim: '#aab3e6', glow: '#ffc94a', size: 1.3 },
    two: { dim: '#aab3e6', glow: '#ffc94a', size: 1.42 },
    red: { dim: '#c4566b', glow: '#ff4040', size: 1.3 },
    blue: { dim: '#5b7fcf', glow: '#4a8cff', size: 1.3 },
    purple: { dim: '#8a5cc7', glow: '#b45cff', size: 1.36 },
  };

  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t);
    x.arcTo(l + w, t, l + w, t + h, r);
    x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r);
    x.arcTo(l, t, l + w, t, r);
    x.closePath();
  }

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                      // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 26, 60);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3f72', 1.55));
    const sun = new THREE.DirectionalLight('#ffffff', 1.7);
    sun.position.set(-3, 9, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);

    const M = {
      slab: Toon.toon('#232852', '#12152e'),
      turntable: Toon.toon('#fbbf24', '#a16207'),
      arrow: Toon.flat('#fff6d8'),
      rail: Toon.toon('#f59e0b', '#92400e'),
      plate: Toon.toon('#4a5276', '#272c47'),
      bolt: Toon.toon('#b4bbd6'),
      steel: Toon.toon('#3b4166', '#22264a'),
      glass: Toon.toon('#d3e5ff', '#55638f'),
      sheen: Toon.flat('#ffffff', 0.85),
      mirrorTop: Toon.toon('#eef4ff', '#6f7fae'),
      split: Toon.flat('#5ee0ff', 0.26),
      slat: Toon.toon('#e3f3ff', '#6f8fb0'),
      splitTop: Toon.toon('#5ee0ff', '#0e7490'),
      block: Toon.toon('#5a6386', '#30354f'),
      blockTop: Toon.toon('#6c7598'),
      body: Toon.toon('#e6e8f2', '#7d84a6'),
      barrel: Toon.toon('#3b4166', '#22264a'),
      stand: Toon.toon('#4a5276', '#272c47'),
      ring: Toon.flat('#8e97c9'),
      warn: Toon.flat('#ff8a3d'),
      cursor: Toon.flat('#5cf08e'),
      cursorGlow: Toon.flat('#5cf08e', 0.25),
      hint: Toon.toon('#ffffff', '#2b2a5e'),
      hintRing: Toon.flat('#ffffff', 0.8),
      spark: Toon.flat('#ffffff'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    M.cursorGlow.blending = ADDITIVE;
    const glowMats = {};
    const coreMats = {};
    for (const k of Object.keys(LIGHT)) {
      coreMats[k] = Toon.flat(LIGHT[k].core);
      glowMats[k] = [0.42, 0.16].map((o) => {
        const m = Toon.flat(LIGHT[k].glow, o);
        m.blending = ADDITIVE;
        return m;
      });
    }
    const G = {
      ball: new THREE.SphereGeometry(1, 20, 14),
      unitBox: new THREE.BoxGeometry(1, 1, 1),
      core: new THREE.CylinderGeometry(1, 1, 1, 10, 1, false),
      tube: new THREE.CylinderGeometry(1, 1, 1, 14, 1, true),
      turntable: new THREE.CylinderGeometry(0.41, 0.44, 0.09, 40),
      arc: new THREE.TorusGeometry(0.33, 0.026, 6, 20, 1.75),
      arrowHead: new THREE.ConeGeometry(0.06, 0.13, 10),
      plate: new THREE.BoxGeometry(0.8, 0.08, 0.8),
      bolt: new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10),
      panel: new THREE.BoxGeometry(0.86, 0.48, 0.06),
      glassPane: new THREE.BoxGeometry(0.84, 0.46, 0.04),
      post: new THREE.BoxGeometry(0.06, 0.52, 0.09),
      rail: new THREE.BoxGeometry(0.92, 0.05, 0.1),
      slat: new THREE.BoxGeometry(0.8, 0.07, 0.05),
      dash: new THREE.BoxGeometry(0.16, 0.06, 0.12),
      sheen: new THREE.BoxGeometry(0.05, 0.4, 0.068),
      block: new THREE.BoxGeometry(0.84, 0.6, 0.84),
      blockTop: new THREE.BoxGeometry(0.64, 0.05, 0.64),
      body: new THREE.BoxGeometry(0.62, 0.42, 0.52),
      band: new THREE.BoxGeometry(0.1, 0.44, 0.54),
      barrel: new THREE.CylinderGeometry(0.1, 0.11, 0.3, 20),
      stand: new THREE.CylinderGeometry(0.2, 0.27, 0.14, 6),
      gemTop: new THREE.ConeGeometry(0.21, 0.32, 6),
      gemBottom: new THREE.ConeGeometry(0.21, 0.2, 6),
      ring: new THREE.TorusGeometry(0.44, 0.026, 6, 40),
      cursor: new THREE.RingGeometry(0.6, 0.7, 4, 1, Math.PI / 4),
      cursorGlow: new THREE.RingGeometry(0.52, 0.82, 4, 1, Math.PI / 4),
      hintHead: new THREE.ConeGeometry(0.24, 0.36, 18),
      hintTail: new THREE.CylinderGeometry(0.085, 0.085, 0.34, 12),
      hintRing: new THREE.RingGeometry(0.47, 0.55, 40),
      pad: new THREE.RingGeometry(0.33, 0.43, 6, 1, Math.PI / 6),
    };

    // the floor of the lab: a soft pool of light under the bench
    const floorTex = canvasTexture(256, 256, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#2b3266');
      g.addColorStop(1, BG);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.4;
    scene.add(floor);

    const bench = new THREE.Group();
    const pieces = new THREE.Group();
    const beams = new THREE.Group();
    const fx = new THREE.Group();
    scene.add(bench, pieces, beams, fx);

    let level = null;
    let benchTex = null;
    let turnables = [];                 // { group, spin, angle, goal, cell }
    let crystals = [];                  // { group, gem, mat, halo, beads, warn, need, state, glow, ... }
    let lasers = [];
    let calm = false;
    const bits = [];
    const beamPool = [];
    let beamCount = 0;
    const glintPool = [];
    let glintCount = 0;
    let boxSize = { x0: 0, x1: 1, z0: 0, z1: 1 };

    const W = { renderer, scene, camera };
    W.setCalm = (v) => { calm = !!v; };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    // the middle of square c (or x, y) at height y0
    const posOf = (x, y, y0) => new THREE.Vector3(x - (level.w - 1) / 2, y0 || 0, y - (level.h - 1) / 2);
    W.cellPos = (c, y0) => posOf(c % level.w, Math.floor(c / level.w), y0);

    /* ------------------------------------------------------------ pieces */
    function turntableBase(g) {
      const t = new THREE.Mesh(G.turntable, M.turntable);
      t.position.y = 0.045;
      g.add(t);
      for (const a of [0, Math.PI]) {
        const arc = new THREE.Group();
        arc.rotation.y = a;
        const ring = new THREE.Mesh(G.arc, M.arrow);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = 0.25;
        ring.position.y = 0.095;
        // the head sits at the end of the arc, pointing on round it (clockwise
        // seen from above, the way the pieces turn)
        const head = new THREE.Mesh(G.arrowHead, M.arrow);
        const end = 0.25 + 1.75;
        head.position.set(Math.cos(end) * 0.33, 0.095, Math.sin(end) * 0.33);
        head.quaternion.setFromUnitVectors(UP, new THREE.Vector3(-Math.sin(end), 0, Math.cos(end)));
        arc.add(ring, head);
        g.add(arc);
      }
    }
    function boltedPlate(g) {
      const p = new THREE.Mesh(G.plate, M.plate);
      p.position.y = 0.04;
      g.add(p);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const b = new THREE.Mesh(G.bolt, M.bolt);
        b.position.set(x * 0.3, 0.1, z * 0.3);
        g.add(b);
      }
    }

    // a mirror or splitter standing on its diagonal; the spin group turns
    function makeTurner(p) {
      const g = new THREE.Group();
      const turnable = p.turn >= 0;
      if (turnable) turntableBase(g);
      else boltedPlate(g);
      const spin = new THREE.Group();
      spin.position.y = turnable ? 0.09 : 0.08;
      const frame = turnable ? M.rail : M.steel;
      const mid = BEAM_Y - spin.position.y;
      if (p.kind === 'mirror') {
        const panel = new THREE.Mesh(G.panel, M.glass);
        panel.position.y = mid;
        spin.add(panel);
        // two diagonal glints: a little thicker than the panel, so they show on both faces
        for (const dx of [-0.2, -0.08]) {
          const sh = new THREE.Mesh(G.sheen, M.sheen);
          sh.position.set(dx, mid, 0);
          sh.rotation.z = -0.55;
          spin.add(sh);
        }
        // a solid silver top edge: seen from above, a mirror is an unbroken line
        const top = new THREE.Mesh(G.rail, M.mirrorTop);
        top.position.y = mid + 0.26;
        spin.add(top);
      } else {
        // half-silvered: silver slats with clear glass between, and a dashed
        // cyan top edge, so from any angle it is plainly not a mirror
        const pane = new THREE.Mesh(G.glassPane, M.split);
        pane.position.y = mid;
        spin.add(pane);
        for (const dy of [-0.14, 0, 0.14]) {
          const sl = new THREE.Mesh(G.slat, M.slat);
          sl.position.y = mid + dy;
          spin.add(sl);
        }
        for (const dx of [-0.36, -0.12, 0.12, 0.36]) {
          const d = new THREE.Mesh(G.dash, M.splitTop);
          d.position.set(dx, mid + 0.26, 0);
          spin.add(d);
        }
      }
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(G.post, frame);
        post.position.set(sx * 0.45, mid, 0);
        spin.add(post);
      }
      g.add(spin);
      const angle = p.slant ? -Math.PI / 4 : Math.PI / 4;
      spin.rotation.y = angle;
      g.position.copy(posOf(p.x, p.y));
      Toon.addOutlines(g);
      pieces.add(g);
      return { group: g, spin, angle, goal: angle, turnable, p };
    }

    function makeLaser(p) {
      const g = new THREE.Group();
      boltedPlate(g);
      const aim = new THREE.Group();
      aim.rotation.y = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][p.dir];
      const body = new THREE.Mesh(G.body, M.body);
      body.position.set(-0.08, 0.08 + 0.21, 0);
      const lightCol = lightOf(p.col);
      const band = new THREE.Mesh(G.band, Toon.toon(lightCol.glow, '#272c47'));
      band.position.set(-0.22, 0.08 + 0.21, 0);
      const barrel = new THREE.Mesh(G.barrel, M.barrel);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.32, BEAM_Y, 0);
      const tip = new THREE.Mesh(G.ball, coreMats[p.col]);
      tip.scale.setScalar(0.075);
      tip.position.set(0.48, BEAM_Y, 0);
      const tipGlow = new THREE.Mesh(G.ball, glowMats[p.col][0]);
      tipGlow.scale.setScalar(0.16);
      tipGlow.position.copy(tip.position);
      aim.add(body, band, barrel, tip, tipGlow);
      g.add(aim);
      g.position.copy(posOf(p.x, p.y));
      Toon.addOutlines(g);
      pieces.add(g);
      return { group: g, glow: tipGlow, ph: rand(0, TAU) };
    }

    function makeBlock(p) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(G.block, M.block);
      b.position.y = 0.3;
      const top = new THREE.Mesh(G.blockTop, M.blockTop);
      top.position.y = 0.62;
      g.add(b, top);
      g.position.copy(posOf(p.x, p.y));
      g.rotation.y = rand(-0.04, 0.04);
      Toon.addOutlines(g);
      pieces.add(g);
    }

    function makeCrystal(p) {
      const look = GEM[p.need];
      const g = new THREE.Group();
      const stand = new THREE.Mesh(G.stand, M.stand);
      stand.position.y = 0.07;
      g.add(stand);
      const mat = Toon.toon(look.dim, '#262a50');
      const gem = new THREE.Group();
      gem.position.y = BEAM_Y + 0.02;
      const top = new THREE.Mesh(G.gemTop, mat);
      top.position.y = 0.16;
      const bottom = new THREE.Mesh(G.gemBottom, mat);
      bottom.rotation.x = Math.PI;
      bottom.position.y = -0.1;
      gem.add(top, bottom);
      gem.scale.setScalar(look.size);
      g.add(gem);
      // a ring on the bench in the crystal's colour marks it as a target
      const padMat = Toon.flat(look.glow, 0.3);
      padMat.blending = ADDITIVE;
      const pad = new THREE.Mesh(G.pad, padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.012;
      g.add(pad);
      const haloMat = Toon.flat(look.glow, 0);
      haloMat.blending = ADDITIVE;
      const halo = new THREE.Mesh(G.ball, haloMat);
      halo.scale.setScalar(0.5);
      halo.position.y = BEAM_Y + 0.02;
      g.add(halo);
      // double and purple crystals wear a ring with two beads: what they still need
      const beads = [];
      if (p.need === 'two' || p.need === 'purple') {
        const ring = new THREE.Mesh(G.ring, M.ring);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = BEAM_Y + 0.02;
        g.add(ring);
        const cols = p.need === 'two' ? [LIGHT[1].glow, LIGHT[1].glow] : [LIGHT[2].glow, LIGHT[4].glow];
        cols.forEach((c, i) => {
          const bead = new THREE.Mesh(G.ball, Toon.toon('#555c86'));
          bead.scale.setScalar(0.085);
          bead.position.set(i ? 0.44 : -0.44, BEAM_Y + 0.02, 0);
          g.add(bead);
          beads.push({ mesh: bead, on: new THREE.Color(c), off: new THREE.Color('#2a2f55'), level: 0, want: 0 });
        });
      }
      const warnMat = Toon.flat('#ff8a3d', 0);
      const warn = new THREE.Mesh(G.ring, warnMat);
      warn.rotation.x = Math.PI / 2;
      warn.position.y = BEAM_Y + 0.02;
      warn.scale.setScalar(p.need === 'two' || p.need === 'purple' ? 1.18 : 1);
      g.add(warn);
      g.position.copy(posOf(p.x, p.y));
      Toon.addOutlines(g);
      pieces.add(g);
      return {
        group: g, gem, mat, halo, haloMat, padMat, beads, warnMat, need: p.need, look,
        state: 'dark', glow: 0, wrongCol: new THREE.Color('#000000'), ph: rand(0, TAU), spinV: 0,
      };
    }

    /* A new bench: the slab, its squares and labels, and every piece. */
    W.build = (lv) => {
      bench.clear();
      pieces.clear();
      clearBeams();
      if (benchTex) benchTex.dispose();
      level = { w: lv.w, h: lv.h };
      const bw = lv.w + EDGE.left + EDGE.right;
      const bd = lv.h + EDGE.top + EDGE.bottom;
      const cx = (EDGE.right - EDGE.left) / 2;
      const cz = (EDGE.bottom - EDGE.top) / 2;
      boxSize = { x0: cx - bw / 2, x1: cx + bw / 2, z0: cz - bd / 2, z1: cz + bd / 2 };
      const slab = new THREE.Mesh(G.unitBox, M.slab);
      slab.scale.set(bw, 0.36, bd);
      slab.position.set(cx, -0.18, cz);
      Toon.addOutlines(slab);
      bench.add(slab);
      const P = 96;
      benchTex = canvasTexture(Math.round(bw * P), Math.round(bd * P), (x, w, h) => {
        x.fillStyle = '#272c58';
        x.fillRect(0, 0, w, h);
        const ox = EDGE.left * P;
        const oy = EDGE.top * P;
        x.fillStyle = '#1f2349';
        roundRect(x, ox - 8, oy - 8, lv.w * P + 16, lv.h * P + 16, 18);
        x.fill();
        for (let yy = 0; yy < lv.h; yy++) {
          for (let xx = 0; xx < lv.w; xx++) {
            x.fillStyle = (xx + yy) % 2 ? '#30376c' : '#2d3367';
            roundRect(x, ox + xx * P + 4, oy + yy * P + 4, P - 8, P - 8, 12);
            x.fill();
          }
        }
        x.fillStyle = '#b3baf0';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.font = `700 46px ${FONT}`;
        for (let xx = 0; xx < lv.w; xx++) x.fillText(String.fromCharCode(65 + xx), ox + (xx + 0.5) * P, oy / 2 + 4);
        for (let yy = 0; yy < lv.h; yy++) x.fillText(String(yy + 1), ox / 2 + 2, oy + (yy + 0.5) * P + 2);
      });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), new THREE.MeshBasicMaterial({ map: benchTex }));
      top.rotation.x = -Math.PI / 2;
      top.position.set(cx, 0.002, cz);
      bench.add(top);

      turnables = lv.turn.map((c) => makeTurner(lv.cells[c]));
      lv.fixed.forEach((c) => makeTurner(lv.cells[c]));
      lasers = lv.sources.map((c) => makeLaser(lv.cells[c]));
      lv.blocks.forEach((c) => makeBlock(lv.cells[c]));
      crystals = lv.crystals.map((c) => makeCrystal(lv.cells[c]));
      cursorAt = -1;
      hintAt = -1;
      cursor.visible = false;
      hint.visible = false;
    };

    /* ------------------------------------------------------------- beams */
    function beamMesh(i) {
      if (!beamPool[i]) {
        const core = new THREE.Mesh(G.core, coreMats[1]);
        const glowA = new THREE.Mesh(G.tube, glowMats[1][0]);
        const glowB = new THREE.Mesh(G.tube, glowMats[1][1]);
        const g = new THREE.Group();
        g.add(core, glowA, glowB);
        beams.add(g);
        beamPool[i] = { g, core, glowA, glowB };
      }
      return beamPool[i];
    }
    function glintMesh(i) {
      if (!glintPool[i]) {
        const core = new THREE.Mesh(G.ball, coreMats[1]);
        core.scale.setScalar(0.07);
        const glow = new THREE.Mesh(G.ball, glowMats[1][0]);
        glow.scale.setScalar(0.17);
        const g = new THREE.Group();
        g.add(core, glow);
        beams.add(g);
        glintPool[i] = { g, core, glow };
      }
      return glintPool[i];
    }
    function clearBeams() {
      beamPool.forEach((b) => { b.g.visible = false; });
      glintPool.forEach((b) => { b.g.visible = false; });
      beamCount = 0;
      glintCount = 0;
    }

    /* Show a setting: pieces turn to it (quickly, or at once), beams are
     * redrawn straight away, and each crystal glows as its state says.
     * segs and glints come from Optics.segments and Optics.glints. */
    W.show = (lv, mask, tr, segs, glints, now) => {
      turnables.forEach((t, i) => {
        const want = (mask >> i) & 1 ? -Math.PI / 4 : Math.PI / 4;
        let diff = (want - t.goal) % Math.PI;
        if (diff >= Math.PI / 2 - 1e-6) diff -= Math.PI;
        if (diff < -Math.PI / 2 - 1e-6) diff += Math.PI;
        t.goal += diff;
        if (now || calm) {
          t.angle = t.goal;
          t.spin.rotation.y = t.angle;
        }
      });
      clearBeams();
      for (const s of segs) {
        const b = beamMesh(beamCount++);
        b.g.visible = true;
        const a = posOf(s.x1, s.y1, BEAM_Y);
        const z = posOf(s.x2, s.y2, BEAM_Y);
        const len = a.distanceTo(z);
        b.g.position.copy(a).add(z).multiplyScalar(0.5);
        b.g.rotation.set(0, 0, 0);
        if (s.y1 === s.y2) b.g.rotation.z = Math.PI / 2;
        else b.g.rotation.x = Math.PI / 2;
        b.core.material = coreMats[s.col] || coreMats[1];
        b.glowA.material = (glowMats[s.col] || glowMats[1])[0];
        b.glowB.material = (glowMats[s.col] || glowMats[1])[1];
        b.core.scale.set(0.032, len, 0.032);
        b.glowA.scale.set(0.075, len, 0.075);
        b.glowB.scale.set(0.15, len, 0.15);
      }
      for (const gl of glints) {
        const m = glintMesh(glintCount++);
        m.g.visible = true;
        m.g.position.copy(posOf(gl.x, gl.y, BEAM_Y));
        m.core.material = coreMats[gl.col] || coreMats[1];
        m.glow.material = (glowMats[gl.col] || glowMats[1])[0];
      }
      crystals.forEach((cr, i) => {
        const st = tr.state[i];
        const was = cr.state;
        cr.state = st;
        const k = tr.col[i];
        if (st === 'wrong') cr.wrongCol.set(lightOf(k).glow);
        if (cr.beads.length) {
          if (cr.need === 'two') {
            const n = O_bits(tr.sides[i]);
            cr.beads[0].want = n >= 1 ? 1 : 0;
            cr.beads[1].want = n >= 2 ? 1 : 0;
          } else {
            cr.beads[0].want = k & 2 ? 1 : 0;
            cr.beads[1].want = k & 4 ? 1 : 0;
          }
          if (now) cr.beads.forEach((b) => { b.level = b.want; });
        }
        if (now) cr.glow = st === 'lit' ? 1 : 0;
        if (st === 'lit' && was !== 'lit' && !now) W.burst(posOf(lv.cells[lv.crystals[i]].x, lv.cells[lv.crystals[i]].y, BEAM_Y + 0.2), 'sparkle', cr.look.glow);
      });
    };
    const O_bits = (m) => {
      let n = 0;
      for (let v = m; v; v &= v - 1) n++;
      return n;
    };

    /* ------------------------------------------------- cursor and hint */
    const cursor = new THREE.Group();
    const cursorRing = new THREE.Mesh(G.cursor, M.cursor);
    const cursorGlow = new THREE.Mesh(G.cursorGlow, M.cursorGlow);
    cursorRing.rotation.x = -Math.PI / 2;
    cursorGlow.rotation.x = -Math.PI / 2;
    cursorRing.position.y = 0.012;
    cursorGlow.position.y = 0.01;
    cursor.add(cursorRing, cursorGlow);
    cursor.visible = false;
    scene.add(cursor);
    let cursorAt = -1;
    W.cursor = (i, show) => {
      cursorAt = i;
      cursor.visible = !!show && i >= 0 && !!turnables[i];
      if (cursor.visible) cursor.position.copy(turnables[i].group.position);
    };

    /* The hint: a ring round the piece and a fat arrow on its far side,
     * tilted to point down the screen at it (seen from above, an upright
     * arrow would only show as a dot). */
    const hint = new THREE.Group();
    const hintArrow = new THREE.Group();
    const head = new THREE.Mesh(G.hintHead, M.hint);
    head.rotation.x = Math.PI / 2;          // tip along +z, towards the piece
    const tail = new THREE.Mesh(G.hintTail, M.hint);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.3;
    hintArrow.add(head, tail);
    Toon.addOutlines(hintArrow);
    const HINT_TILT = 0.5;
    hintArrow.rotation.x = HINT_TILT;
    const hintDir = new THREE.Vector3(0, -Math.sin(HINT_TILT), Math.cos(HINT_TILT));
    // the tip (0.18 ahead of the head's middle) rests just above and behind the piece
    const hintBase = new THREE.Vector3(0, 0.85, -0.38).addScaledVector(hintDir, -0.18);
    hintArrow.position.copy(hintBase);
    const hintRing = new THREE.Mesh(G.hintRing, M.hintRing);
    hintRing.rotation.x = -Math.PI / 2;
    hintRing.position.y = 0.11;
    hint.add(hintArrow, hintRing);
    hint.visible = false;
    scene.add(hint);
    let hintAt = -1;
    W.hint = (i) => {
      hintAt = i;
      hint.visible = i >= 0 && !!turnables[i];
      if (hint.visible) hint.position.copy(turnables[i].group.position);
    };

    /* ------------------------------------------------------------ camera */
    const view = { yaw: 0, pitch: 0 };
    let margins = { top: 14, bottom: 70, side: 12, hudW: 270, hudH: 104, fsW: 64, fsH: 64 };
    let camDist = 14;
    const camTarget = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    W.setMargins = (m) => { margins = Object.assign({}, margins, m); };
    W.orbit = (dx, dy) => {
      view.yaw = clamp(view.yaw + dx, -0.5, 0.5);
      view.pitch = clamp(view.pitch + dy, -0.14, 0.12);
    };
    W.resetView = () => { view.yaw = 0; view.pitch = 0; };

    // about 62 degrees down, steeper on tall screens where the bench must fit the width
    const basePitch = () => 1.08 + 0.2 * clamp((1 - camera.aspect) / 0.45, 0, 1) + view.pitch;

    function corners() {
      const out = [];
      for (const x of [boxSize.x0, boxSize.x1]) {
        for (const z of [boxSize.z0, boxSize.z1]) {
          for (const y of [-0.36, 0.75]) out.push(new THREE.Vector3(x, y, z));
        }
      }
      return out;
    }

    // where the camera should be to fit the bench in the free part of the screen
    function wanted() {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.36 / Math.min(a, 1.25)) * 180) / Math.PI, 30, 56);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const pw = canvas.clientWidth || 1;
      const ph = canvas.clientHeight || 1;
      const pitch = basePitch();
      const dir = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(view.yaw) * Math.cos(pitch));
      const pts = corners();
      const tanV = Math.tan((vfov * Math.PI) / 360);
      const tanH = tanV * a;
      const fit = (top) => {
        const safe = {
          x0: -1 + (2 * margins.side) / pw, x1: 1 - (2 * margins.side) / pw,
          y0: -1 + (2 * margins.bottom) / ph, y1: 1 - (2 * top) / ph,
        };
        let dist = 14;
        const target = new THREE.Vector3((boxSize.x0 + boxSize.x1) / 2, 0, (boxSize.z0 + boxSize.z1) / 2);
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        let box = null;
        for (let it = 0; it < 8; it++) {
          camera.position.copy(target).addScaledVector(dir, dist);
          camera.lookAt(target);
          camera.updateMatrixWorld();
          box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
          for (const p of pts) {
            tmp.copy(p).project(camera);
            box.x0 = Math.min(box.x0, tmp.x);
            box.x1 = Math.max(box.x1, tmp.x);
            box.y0 = Math.min(box.y0, tmp.y);
            box.y1 = Math.max(box.y1, tmp.y);
          }
          const k = Math.max((box.x1 - box.x0) / (safe.x1 - safe.x0), (box.y1 - box.y0) / (safe.y1 - safe.y0));
          right.setFromMatrixColumn(camera.matrixWorld, 0);
          up.setFromMatrixColumn(camera.matrixWorld, 1);
          const offX = (box.x0 + box.x1) / 2 - (safe.x0 + safe.x1) / 2;
          const offY = (box.y0 + box.y1) / 2 - (safe.y0 + safe.y1) / 2;
          target.addScaledVector(right, offX * dist * tanH);
          target.addScaledVector(up, offY * dist * tanV);
          dist *= k;
        }
        // the bench's box in pixels, to check it against the buttons in the corners
        const px = { x0: ((box.x0 + 1) / 2) * pw, x1: ((box.x1 + 1) / 2) * pw, y0: ((1 - box.y1) / 2) * ph };
        return { dist, target, px };
      };
      let f = fit(margins.top);
      const clash = f.px.y0 < margins.hudH && (f.px.x0 < margins.hudW || f.px.x1 > pw - margins.fsW);
      if (clash) f = fit(margins.hudH);
      return f;
    }

    W.frame = (dt, snap) => {
      if (!level) return;
      const f = wanted();
      const k = snap ? 1 : 1 - Math.exp(-8 * dt);
      camDist += (f.dist - camDist) * k;
      camTarget.lerp(f.target, k);
      const pitch = basePitch();
      camera.position.set(
        camTarget.x + Math.sin(view.yaw) * Math.cos(pitch) * camDist,
        camTarget.y + Math.sin(pitch) * camDist,
        camTarget.z + Math.cos(view.yaw) * Math.cos(pitch) * camDist,
      );
      camera.lookAt(camTarget);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------- pointer helpers */
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    // where turnable piece i is on screen (its middle, at beam height)
    W.screenOf = (i) => W.toScreen(turnables[i].group.position.clone().setY(BEAM_Y));
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);
    /* What a tap at (clientX, clientY) is on: { turn: i } for a turnable
     * piece (the nearest on screen, within about half a square), else
     * { cell: c } for the square under it, else null off the bench. */
    W.pick = (clientX, clientY) => {
      if (!level) return null;
      let best = -1;
      let bd = Infinity;
      let reach = 0;
      turnables.forEach((t, i) => {
        const s = W.screenOf(i);
        const d = Math.hypot(s.x - clientX, s.y - clientY);
        if (d < bd) {
          bd = d;
          best = i;
          const o = W.toScreen(t.group.position.clone().setY(BEAM_Y).add(new THREE.Vector3(0.5, 0, 0)));
          reach = Math.max(18, Math.hypot(o.x - s.x, o.y - s.y) * 1.15);
        }
      });
      if (best >= 0 && bd <= reach) return { turn: best };
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const x = Math.round(hit.x + (level.w - 1) / 2);
      const y = Math.round(hit.z + (level.h - 1) / 2);
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
      return { cell: y * level.w + x };
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 16, speed: 2.2, up: 2.2, size: 0.05, life: 0.7, grav: 6 },
      confetti: { n: 70, speed: 6, up: 5.5, size: 0.07, life: 1.8, grav: 9 },
    };
    const sparkMats = {};
    W.burst = (pos, kind, colour) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        let mat = M.confetti[i % M.confetti.length];
        if (kind === 'sparkle') {
          const key = colour || '#ffffff';
          if (!sparkMats[key]) sparkMats[key] = Toon.flat(key);
          mat = i % 3 ? sparkMats[key] : M.spark;
        }
        const m = new THREE.Mesh(G.ball, mat);
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        fx.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.5, 1.2), rand(-0.5, 0.5) * b.speed),
          life: b.life,
          max: b.life,
          size: b.size,
          grav: b.grav,
        });
      }
    };
    W.celebrate = () => {
      crystals.forEach((cr) => { cr.flash = 1; });
      if (!calm) W.burst(new THREE.Vector3(0, 3, 0), 'confetti');
    };

    const white = new THREE.Color('#ffffff');
    const tmpCol = new THREE.Color();
    W.update = (t, dt) => {
      turnables.forEach((tt) => {
        if (tt.angle === tt.goal) return;
        const step = (Math.PI / 2 / 0.16) * dt;
        const d = tt.goal - tt.angle;
        tt.angle = Math.abs(d) <= step ? tt.goal : tt.angle + Math.sign(d) * step;
        tt.spin.rotation.y = tt.angle;
      });
      lasers.forEach((l) => {
        l.glow.scale.setScalar(calm ? 0.16 : 0.16 + 0.025 * Math.sin(t * 5 + l.ph));
      });
      crystals.forEach((cr) => {
        const lit = cr.state === 'lit' ? 1 : 0;
        cr.glow += clamp(lit - cr.glow, -dt / 0.25, dt / 0.25);
        cr.flash = Math.max(0, (cr.flash || 0) - dt / 1.2);
        const g = smooth(cr.glow);
        const pulse = calm ? 0 : 0.08 * Math.sin(t * 3 + cr.ph);
        const part = cr.state === 'part' ? 0.18 : 0;
        if (cr.state === 'wrong') {
          const flick = calm ? 0.35 : 0.25 + 0.15 * Math.sin(t * 9 + cr.ph);
          cr.mat.emissive.copy(cr.wrongCol).multiplyScalar(flick);
          cr.warnMat.opacity = calm ? 0.9 : 0.6 + 0.35 * Math.sin(t * 6);
        } else {
          tmpCol.set(cr.look.glow).lerp(white, 0.35 * g);
          cr.mat.emissive.copy(tmpCol).multiplyScalar(0.1 + g * (0.8 + pulse) + part + cr.flash * 0.4);
          cr.warnMat.opacity = 0;
        }
        cr.haloMat.opacity = g * (0.34 + pulse) + part * 0.6 + cr.flash * 0.3;
        cr.padMat.opacity = 0.3 + 0.5 * g;
        cr.halo.scale.setScalar(0.42 + 0.12 * g + cr.flash * 0.25);
        // lit gems turn slowly (not with reduced motion)
        cr.spinV += ((lit && !calm ? 1.1 : 0) - cr.spinV) * Math.min(1, dt * 3);
        cr.gem.rotation.y += cr.spinV * dt;
        cr.beads.forEach((b) => {
          b.level += clamp(b.want - b.level, -dt / 0.2, dt / 0.2);
          b.mesh.material.color.copy(b.off).lerp(b.on, b.level);
          b.mesh.material.emissive.copy(b.on).multiplyScalar(b.level * 0.6);
        });
      });
      if (cursor.visible) {
        const s = calm ? 1 : 1 + 0.04 * Math.sin(t * 5);
        cursor.scale.set(s, 1, s);
      }
      if (hint.visible) {
        hintArrow.position.copy(hintBase).addScaledVector(hintDir, calm ? 0 : -0.08 - 0.08 * Math.sin(t * 5));
        hintRing.material.opacity = calm ? 0.8 : 0.55 + 0.35 * Math.sin(t * 5);
      }
      const shimmer = calm ? 0 : 0.06 * Math.sin(t * 7);
      for (const k of Object.keys(glowMats)) glowMats[k][0].opacity = 0.42 + shimmer;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          fx.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.y -= b.grav * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    window.World.active = W;            // read by the automated play-through
    return W;
  }

  window.World = { create, BEAM_Y };
})();
