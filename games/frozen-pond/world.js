/* Frozen Pond: the 3D world.
 *
 * Owns the renderer, the winter scene (snowy ground, pine trees, falling
 * snow), the board (ice tiles, snow patches, snow-capped boulders, a
 * snowbank round the edge, and the fishing hole where a fish pops up), the
 * hint arrow, the camera, picking a square from a tap, and the effects. It
 * draws; game.js decides. Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const S = 1.1;                        // one square of the board
  const ICE_TOP = 0.08;
  const SKY = '#e4eef8';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(items.length, 1));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    items.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      q.setFromEuler(e.set(0, it.ry || 0, 0));
      s.set(it.sx, it.sy, it.sz);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
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
    scene.fog = new THREE.Fog(SKY, 28, 70);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfe0f0', 1.6));
    const sun = new THREE.DirectionalLight('#fff6ea', 1.8);
    sun.position.set(3, 8, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const M = {
      ground: Toon.toon('#f7fbff'),
      ice: Toon.toon('#bfe6f7', '#93c8e0'),
      shine: Toon.flat('#ffffff', 0.55),
      snow: Toon.toon('#ffffff', '#d3dfec'),
      bank: Toon.toon('#f4f8fc', '#cddbea'),
      rock: Toon.toon('#9d9ab4', '#77748f'),
      hole: Toon.flat('#2d5f86'),
      fish: Toon.toon('#ff9f43', '#d9772a'),
      fin: Toon.toon('#ffc46b', '#d9772a'),
      ink: Toon.toon('#2b2a5e'),
      white: Toon.flat('#ffffff'),
      pine: Toon.toon('#3f9b6e', '#2c7552'),
      trunk: Toon.toon('#9b6b47'),
      arrow: Toon.toon('#0f766e', '#0b5b55'),
      flake: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      tile: new THREE.BoxGeometry(S * 0.96, 0.1, S * 0.96),
      hole: new THREE.CircleGeometry(0.4, 32),
      cone: new THREE.ConeGeometry(1, 1.6, 10),
      trunk: new THREE.CylinderGeometry(0.15, 0.2, 0.7, 8),
      tail: new THREE.ConeGeometry(0.16, 0.26, 12),
      arrowHead: new THREE.ConeGeometry(0.22, 0.34, 18),
      arrowTail: new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12),
    };

    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), M.ground);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // snowy pines all round
    const cones = [];
    const tips = [];
    const trunks = [];
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU);
      const r = rand(11, 26);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.8 - 4;
      if (z > 2 || (z > -8 && Math.abs(x) < 12)) continue;      // behind the board or well off to the sides, never in front of the camera
      const s = rand(0.9, 1.6);
      trunks.push({ x, y: 0.35 * s, z, sx: s, sy: s, sz: s });
      cones.push({ x, y: 1.4 * s, z, sx: 0.9 * s, sy: s, sz: 0.9 * s });
      cones.push({ x, y: 2.3 * s, z, sx: 0.65 * s, sy: 0.8 * s, sz: 0.65 * s });
      tips.push({ x, y: 2.85 * s, z, sx: 0.32 * s, sy: 0.2 * s, sz: 0.32 * s });
    }
    const coneMesh = instanced(G.cone, M.pine, cones);
    Toon.addOutlines(coneMesh);
    scene.add(instanced(G.trunk, M.trunk, trunks), coneMesh, instanced(G.ball, M.snow, tips));

    // gently falling snow: one instanced mesh, each flake drifting down and round again
    const FLAKES = 140;
    const flakeMesh = new THREE.InstancedMesh(G.bit, M.flake, FLAKES);
    flakeMesh.frustumCulled = false;
    scene.add(flakeMesh);
    const flakes = Array.from({ length: FLAKES }, () => ({ x: rand(-14, 14), y: rand(0, 12), z: rand(-12, 8), sp: rand(0.4, 0.9), ph: rand(0, TAU), s: rand(0.03, 0.07) }));
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    let snowing = true;

    const board = new THREE.Group();
    scene.add(board);
    const actors = new THREE.Group();
    scene.add(actors);

    // the fish in the hole: pops up now and then to say hello
    const fish = new THREE.Group();
    const fishBody = new THREE.Group();
    const body = new THREE.Mesh(G.ball, M.fish);
    body.scale.set(0.2, 0.28, 0.16);
    const tail = new THREE.Mesh(G.tail, M.fin);
    tail.position.y = -0.33;
    tail.rotation.x = Math.PI;
    fishBody.add(body, tail);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(G.ball, M.white);
      eye.scale.setScalar(0.06);
      eye.position.set(sx * 0.08, 0.1, 0.13);
      const pupil = new THREE.Mesh(G.ball, M.ink);
      pupil.scale.setScalar(0.035);
      pupil.position.set(sx * 0.08, 0.1, 0.17);
      fishBody.add(eye, pupil);
    }
    fish.add(fishBody);
    Toon.addOutlines(fish);
    scene.add(fish);
    let fishCell = null;
    let fishJumpAt = -9;

    const arrow = new THREE.Group();
    const head = new THREE.Mesh(G.arrowHead, M.arrow);
    head.position.y = 0.17;
    const shaft = new THREE.Mesh(G.arrowTail, M.arrow);
    shaft.position.y = -0.12;
    const arrowTilt = new THREE.Group();
    arrowTilt.rotation.x = Math.PI / 2;
    arrowTilt.add(head, shaft);
    arrow.add(arrowTilt);
    Toon.addOutlines(arrow);
    arrow.visible = false;
    scene.add(arrow);
    let arrowAt = null;

    let level = null;
    const bits = [];
    let camL = 10;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ICE_TOP);

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
    W.snow = (on) => {
      snowing = on;
      flakeMesh.visible = on;
    };

    W.cellPos = (c) => {
      const x = c % level.w;
      const y = Math.floor(c / level.w);
      return new THREE.Vector3((x - (level.w - 1) / 2) * S, ICE_TOP, (y - (level.h - 1) / 2) * S);
    };

    /* A new board: ice, snow, boulders inside, a snowbank round the edge,
     * and the fishing hole. */
    W.build = (lv) => {
      board.clear();
      level = { w: lv.w, h: lv.h };
      const ice = [];
      const shines = [];
      const mounds = [];
      const bank = [];
      for (let c = 0; c < lv.rock.length; c++) {
        const p = W.cellPos(c);
        const x = c % lv.w;
        const y = Math.floor(c / lv.w);
        const edge = x === 0 || y === 0 || x === lv.w - 1 || y === lv.h - 1;
        if (lv.rock[c] && edge) {
          bank.push({ x: p.x, y: 0.2, z: p.z, sx: S * 0.62, sy: 0.32, sz: S * 0.62 });
        } else if (lv.rock[c]) {
          ice.push({ x: p.x, y: 0.03, z: p.z, sx: 1, sy: 1, sz: 1 });
          const boulder = new THREE.Group();
          const stone = new THREE.Mesh(G.ball, M.rock);
          stone.scale.set(0.46, 0.4, 0.44);
          stone.position.y = 0.32;
          const cap = new THREE.Mesh(G.ball, M.snow);
          cap.scale.set(0.38, 0.14, 0.36);
          cap.position.y = 0.66;
          boulder.add(stone, cap);
          boulder.position.set(p.x, 0, p.z);
          boulder.rotation.y = rand(0, TAU);
          Toon.addOutlines(boulder);
          board.add(boulder);
        } else {
          ice.push({ x: p.x, y: 0.03, z: p.z, sx: 1, sy: 1, sz: 1 });
          if (lv.snow[c]) mounds.push({ x: p.x, y: 0.1, z: p.z, sx: S * 0.42, sy: 0.12, sz: S * 0.42 });
          else if (Math.random() < 0.5) shines.push({ x: p.x + rand(-0.25, 0.25), y: 0.085, z: p.z + rand(-0.25, 0.25), sx: 0.2, sy: 0.01, sz: 0.06, ry: rand(0, TAU) });
        }
      }
      const iceMesh = instanced(G.tile, M.ice, ice);
      Toon.addOutlines(iceMesh);
      const bankMesh = instanced(G.ball, M.bank, bank);
      Toon.addOutlines(bankMesh);
      const moundMesh = instanced(G.ball, M.snow, mounds);
      Toon.addOutlines(moundMesh);
      board.add(iceMesh, bankMesh, moundMesh, instanced(G.ball, M.shine, shines));
      const hole = new THREE.Mesh(G.hole, M.hole);
      hole.rotation.x = -Math.PI / 2;
      hole.position.copy(W.cellPos(lv.goal)).setY(0.087);
      board.add(hole);
      fishCell = lv.goal;
      fishJumpAt = -9;
      arrow.visible = false;
    };

    W.fishJump = (t) => { fishJumpAt = t; };
    W.arrow = (cell, dir) => {
      arrowAt = cell == null ? null : { cell, dir };
      arrow.visible = cell != null;
    };

    /* Camera: from the front and well above, framing the whole board; on a
     * tall screen it fills the width and leaves room under the board for
     * the row of slide buttons. */
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
      const pitch = 0.88;
      const tall = clamp((1 - a) / 0.4, 0, 1);
      const wide = Math.max(halfW / (t * a), (halfD * Math.sin(pitch) + 0.55) / t) + 0.4;
      const narrow = Math.max(halfW / (t * a) + 0.2, (halfD * Math.sin(pitch) + 0.4) / (t * 0.74));
      const want = clamp(wide + (narrow - wide) * tall, 5, 30);
      camL = snap ? want : camL + (want - camL) * (1 - Math.exp(-3 * dt));
      const lift = (tall * 0.09 * 2 * camL * t) / Math.sin(pitch);
      camera.position.set(0, camL * Math.sin(pitch), camL * Math.cos(pitch) + 0.4 + lift);
      camera.lookAt(0, 0, 0.35 + lift);
      camera.updateMatrixWorld();
    };

    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
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

    const BURSTS = {
      sparkle: { n: 14, mat: () => M.gold, speed: 2.4, up: 2.6, size: 0.05, life: 0.7 },
      powder: { n: 10, mat: () => M.white, speed: 2.4, up: 1.4, size: 0.09, life: 0.45 },
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
      if (snowing) {
        flakes.forEach((f, i) => {
          f.y -= f.sp * dt;
          if (f.y < 0) f.y += 12;
          v3.set(f.x + 0.4 * Math.sin(t * 0.7 + f.ph), f.y, f.z);
          s3.setScalar(f.s);
          flakeMesh.setMatrixAt(i, m4.compose(v3, q0, s3));
        });
        flakeMesh.instanceMatrix.needsUpdate = true;
      }
      if (fishCell != null) {
        // a peek every few seconds, and a big jump to celebrate
        const p = W.cellPos(fishCell);
        const peek = Math.max(0, Math.sin(t * 1.6)) ** 6;
        const jump = t - fishJumpAt < 1.2 ? Math.sin((Math.PI * (t - fishJumpAt)) / 1.2) * 1.3 : 0;
        fish.position.set(p.x, -0.15 + 0.38 * peek + jump, p.z);
        fishBody.rotation.z = 0.15 * Math.sin(t * 5);
        fish.visible = peek > 0.02 || jump > 0;
      }
      if (arrowAt) {
        const p = W.cellPos(arrowAt.cell);
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[arrowAt.dir];
        const bob = 0.12 * Math.sin(t * 6);
        arrow.position.set(p.x + d[0] * (0.8 + bob), 0.95, p.z + d[1] * (0.8 + bob));
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
