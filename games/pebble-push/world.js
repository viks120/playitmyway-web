/* Pebble Push: the 3D world.
 *
 * Owns the renderer, the pond, the board (a lily pad on every square you can
 * stand on; open water is the edge), the flowers that bloom when a pebble
 * sits on them, the pebbles with their little faces, the hint arrow, the
 * camera, picking a square from a tap, and the effects. It draws; game.js
 * decides. Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const S = 1.2;                        // one square of the board
  const PAD_TOP = 0.06;
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => x * x * (3 - 2 * x);

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 28 });
    geo.rotateX(-Math.PI / 2);
    return geo;
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
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 30, 70);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const M = {
      water: Toon.flat('#93d6ec'),
      pad: Toon.toon('#86d27a', '#5aa74f'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      petal: Toon.toon('#ffb3c9', '#e88aa5'),
      heart: Toon.toon('#ffe08a'),
      stone: Toon.toon('#c6d0e0', '#8e9bb3'),
      rock: Toon.toon('#b7b3c8', '#8c88a3'),
      reed: Toon.toon('#7fbf6a'),
      ink: Toon.toon('#2b2a5e'),
      blush: Toon.flat('#ff8fb0', 0.55),
      arrow: Toon.toon('#0f766e', '#0b5b55'),
      spark: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      pad: padGeometry(0.56),
      lily: padGeometry(1),
      ball: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      smile: new THREE.TorusGeometry(0.07, 0.018, 6, 16, Math.PI * 0.8),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      arrowHead: new THREE.ConeGeometry(0.22, 0.34, 18),
      arrowTail: new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(80, 48), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    // the far bank of reeds, and a few lily pads drifting about
    for (let i = 0; i < 40; i++) {
      const reed = new THREE.Mesh(G.reed, M.reed);
      const hgt = rand(0.8, 1.8);
      reed.scale.y = hgt;
      reed.position.set(rand(-16, 16), hgt / 2, rand(-16, -12));
      scene.add(reed);
    }
    const board = new THREE.Group();
    scene.add(board);
    const actors = new THREE.Group();
    scene.add(actors);

    let level = null;
    let pads = [];
    let flowers = [];
    let stones = [];
    const bits = [];
    let camL = 10;
    const arrow = new THREE.Group();
    const head = new THREE.Mesh(G.arrowHead, M.arrow);
    head.position.y = 0.17;
    const tail = new THREE.Mesh(G.arrowTail, M.arrow);
    tail.position.y = -0.12;
    const arrowTilt = new THREE.Group();
    arrowTilt.rotation.x = Math.PI / 2;           // lying down, pointing along the board
    arrowTilt.add(head, tail);
    arrow.add(arrowTilt);
    Toon.addOutlines(arrow);
    arrow.visible = false;
    scene.add(arrow);
    let arrowAt = null;

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_TOP);

    const W = { renderer, scene, camera, actors };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    // the middle of square c, at the top of its lily pad
    W.cellPos = (c) => {
      const x = c % level.w;
      const y = Math.floor(c / level.w);
      return new THREE.Vector3((x - (level.w - 1) / 2) * S, PAD_TOP, (y - (level.h - 1) / 2) * S);
    };

    function makeFlower(c) {
      const g = new THREE.Group();
      g.position.copy(W.cellPos(c));
      const petals = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU;
        const hinge = new THREE.Group();
        hinge.position.set(Math.sin(a) * 0.22, 0.03, Math.cos(a) * 0.22);
        hinge.rotation.order = 'YXZ';
        hinge.rotation.y = a;
        const petal = new THREE.Mesh(G.ball, M.petal);
        petal.scale.set(0.15, 0.3, 0.06);
        petal.position.y = 0.27;
        hinge.add(petal);
        g.add(hinge);
        petals.push(hinge);
      }
      const heart = new THREE.Mesh(G.ball, M.heart);
      heart.scale.set(0.13, 0.05, 0.13);
      heart.position.y = 0.04;
      g.add(heart);
      Toon.addOutlines(g);
      board.add(g);
      return { group: g, petals, o: 0, target: 0, ph: rand(0, TAU) };
    }

    function makeStone() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.ball, M.stone);
      body.scale.set(0.42, 0.33, 0.4);
      body.position.y = 0.3;
      g.add(body);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(G.ball, M.ink);
        eye.scale.set(0.045, 0.06, 0.03);
        eye.position.set(sx * 0.12, 0.38, 0.37);
        g.add(eye);
        const cheek = new THREE.Mesh(G.ball, M.blush);
        cheek.scale.set(0.06, 0.035, 0.02);
        cheek.position.set(sx * 0.21, 0.31, 0.35);
        g.add(cheek);
      }
      const smile = new THREE.Mesh(G.smile, M.ink);
      smile.rotation.z = Math.PI * 1.1;
      smile.position.set(0, 0.29, 0.39);
      g.add(smile);
      Toon.addOutlines(g);
      board.add(g);
      return { group: g, from: null, to: null, at: 0, dur: 0.2, cell: -1 };
    }

    /* A new board: pads where you can stand, flowers on the targets,
     * pebbles where they start, rocks dotted along the water's edge. */
    W.build = (s) => {
      board.clear();
      level = { w: s.w, h: s.h };
      pads = [];
      flowers = s.goals.map(makeFlower);
      stones = s.pebbles.map(() => makeStone());
      const near = (c) => [-1, 1, -s.w, s.w].some((d) => {
        const n = c + d;
        return n >= 0 && n < s.water.length && !s.water[n] && Math.abs((n % s.w) - (c % s.w)) <= 1;
      });
      for (let c = 0; c < s.water.length; c++) {
        if (!s.water[c]) {
          const pad = new THREE.Mesh(G.pad, M.pad);
          pad.position.copy(W.cellPos(c)).setY(0);
          pad.rotation.y = rand(0, TAU);
          Toon.addOutlines(pad);
          board.add(pad);
          pads.push({ mesh: pad, ph: rand(0, TAU) });
        } else if (near(c) && Math.random() < 0.35) {
          const rock = new THREE.Mesh(G.ball, M.rock);
          rock.scale.set(rand(0.25, 0.4), rand(0.15, 0.28), rand(0.25, 0.4));
          rock.position.copy(W.cellPos(c)).setY(0.04);
          rock.position.x += rand(-0.2, 0.2);
          rock.position.z += rand(-0.2, 0.2);
          Toon.addOutlines(rock);
          board.add(rock);
        }
      }
      W.placePebbles(s.pebbles, true);
      arrow.visible = false;
    };

    // put each pebble on its square: at once, or sliding there
    W.placePebbles = (cells, now, t) => {
      cells.forEach((c, i) => {
        const st = stones[i];
        if (st.cell === c && !now) return;
        st.from = now || st.cell < 0 ? W.cellPos(c) : W.cellPos(st.cell);
        st.to = W.cellPos(c);
        st.at = t || 0;
        st.cell = c;
        if (now) st.group.position.copy(st.to);
      });
    };
    W.pebblePos = (i) => stones[i].group.position.clone();
    W.bloom = (goalIndex, on) => { flowers[goalIndex].target = on ? 1 : 0; };
    W.arrow = (cell, dir) => {
      arrowAt = cell == null ? null : { cell, dir };
      arrow.visible = cell != null;
    };

    /* Camera: from the front and well above, framing the whole board. */
    W.frame = (dt, snap) => {
      if (!level) return;
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.42 / a) * 180) / Math.PI, 40, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const t = Math.tan((vfov * Math.PI) / 360);
      const halfW = (level.w * S) / 2;
      const halfD = (level.h * S) / 2;
      const pitch = 0.85;
      // tall screens: fill the width, keep the board in the top three quarters, and nudge it up
      // a little, leaving the bottom for the row of hop buttons
      const tall = clamp((1 - a) / 0.4, 0, 1);
      const wide = Math.max(halfW / (t * a), (halfD * Math.sin(pitch) + 0.55) / t) + 0.6;
      const narrow = Math.max(halfW / (t * a) + 0.3, (halfD * Math.sin(pitch) + 0.4) / (t * 0.74));
      const want = clamp(wide + (narrow - wide) * tall, 5, 30);
      camL = snap ? want : camL + (want - camL) * (1 - Math.exp(-3 * dt));
      const lift = (tall * 0.09 * 2 * camL * t) / Math.sin(pitch);
      camera.position.set(0, camL * Math.sin(pitch), camL * Math.cos(pitch) + 0.4 + lift);
      camera.lookAt(0, 0, 0.35 + lift);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------- pointer helpers */
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    // the square under a tap, or null off the board
    W.cellAt = (clientX, clientY) => {
      if (!level) return null;
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const x = Math.round(hit.x / S + (level.w - 1) / 2);
      const y = Math.round(hit.z / S + (level.h - 1) / 2);
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
      return y * level.w + x;
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 14, mat: () => M.gold, speed: 2.4, up: 2.6, size: 0.05, life: 0.7 },
      puff: { n: 10, mat: () => M.white, speed: 2.2, up: 1.2, size: 0.1, life: 0.4 },
      confetti: { n: 60, mat: (i) => M.confetti[i % M.confetti.length], speed: 6, up: 5, size: 0.07, life: 1.7 },
    };
    W.burst = (pos, kind) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        scene.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed),
          life: b.life,
          max: b.life,
          size: b.size,
        });
      }
    };

    W.update = (t, dt) => {
      pads.forEach((p) => { p.mesh.position.y = 0.015 * Math.sin(t * 1.3 + p.ph); });
      flowers.forEach((f) => {
        f.o += clamp(f.target - f.o, -dt / 0.35, dt / 0.35);
        const tilt = 1.3 - 0.75 * smooth(f.o);          // flat on the pad, then cupped round a pebble
        f.petals.forEach((h, k) => { h.rotation.x = tilt + 0.05 * Math.sin(t * 2 + k + f.ph); });
      });
      stones.forEach((st) => {
        if (!st.to) return;
        const k = clamp((t - st.at) / st.dur, 0, 1);
        const e = smooth(k);
        st.group.position.lerpVectors(st.from, st.to, e);
        st.group.position.y = PAD_TOP + Math.sin(Math.PI * k) * 0.12;
        st.group.rotation.z = Math.sin(Math.PI * k) * 0.15 * (st.to.x >= st.from.x ? -1 : 1);
      });
      if (arrowAt) {
        const p = W.cellPos(arrowAt.cell);
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[arrowAt.dir];
        const bob = 0.12 * Math.sin(t * 6);
        arrow.position.set(p.x + d[0] * (0.55 + bob), 1.25, p.z + d[1] * (0.55 + bob));
        arrow.rotation.y = Math.atan2(d[0], d[1]);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.y -= 9 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    return W;
  }

  window.World = { create, S };
})();
