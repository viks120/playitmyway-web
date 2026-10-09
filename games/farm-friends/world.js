/* Farm Friends: the 3D world.
 *
 * Owns the renderer, the farmyard (meadow, red barn, fence, hay bales, pond,
 * trees and drifting clouds), where the animals stand, the keyboard ring,
 * the camera, picking an animal from a tap, and the effects (hearts, puffs
 * and confetti). It draws; game.js decides and moves the animals. Needs
 * THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const SKY = '#cdeeff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 28 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function heartGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.6, -0.05, -0.55, 0.45, -0.25, 0.45);
    s.bezierCurveTo(-0.08, 0.45, 0, 0.32, 0, 0.22);
    s.bezierCurveTo(0, 0.32, 0.08, 0.45, 0.25, 0.45);
    s.bezierCurveTo(0.55, 0.45, 0.6, -0.05, 0, -0.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 12 });
    geo.translate(0, 0, -0.06);
    return geo;
  }

  function instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(items.length, 1));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    items.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0));
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
    scene.fog = new THREE.Fog(SKY, 30, 80);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const M = {
      grass: Toon.toon('#a4dd84'),
      path: Toon.toon('#ead2a4'),
      water: Toon.flat('#86d3ee'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      trunk: Toon.toon('#b9825a'),
      leaf: Toon.toon('#7ccf72', '#55a650'),
      barn: Toon.toon('#e5584f', '#b53d36'),
      roof: Toon.toon('#8d4a3f', '#6a342c'),
      trim: Toon.toon('#ffffff', '#d4cfe2'),
      wood: Toon.toon('#cf9a62', '#a7713f'),
      hay: Toon.toon('#f4d06a', '#d1a93f'),
      cloud: Toon.flat('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.9, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      hearts: [Toon.flat('#ff6f9c'), Toon.flat('#ff9ec0'), Toon.flat('#ff5a5a')],
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
      bloom: [Toon.toon('#ff9ec0'), Toon.toon('#ffd85c'), Toon.toon('#ffffff')],
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      box: new THREE.BoxGeometry(1, 1, 1),
      heart: heartGeometry(),
      ring: new THREE.RingGeometry(1.0, 1.16, 48),
      trunk: new THREE.CylinderGeometry(0.3, 0.42, 2.2, 8),
      bale: new THREE.CylinderGeometry(0.7, 0.7, 1.0, 20),
      lily: padGeometry(1),
    };

    /* ---------------------------------------------------------- farmyard */
    const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 48), M.grass);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // the red barn, with a white-trimmed door
    const barn = new THREE.Group();
    barn.position.set(-8, 0, -13);
    barn.rotation.y = 0.25;
    const walls = new THREE.Mesh(G.box, M.barn);
    walls.scale.set(5, 3.4, 4);
    walls.position.y = 1.7;
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-2.9, 0);
    roofShape.lineTo(2.9, 0);
    roofShape.lineTo(0, 2.2);
    roofShape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 4.4, bevelEnabled: false }), M.roof);
    roof.position.set(0, 3.4, -2.2);
    const door = new THREE.Mesh(G.box, M.barn);
    door.scale.set(2, 2.3, 0.1);
    door.position.set(0, 1.15, 2.02);
    barn.add(walls, roof, door);
    for (const [x, y, w, h, rz] of [[0, 2.3, 2.2, 0.16, 0], [0, 0.05, 2.2, 0.16, 0], [-1.05, 1.17, 0.16, 2.4, 0], [1.05, 1.17, 0.16, 2.4, 0], [0, 1.17, 0.16, 2.9, 0.72], [0, 1.17, 0.16, 2.9, -0.72]]) {
      const bar = new THREE.Mesh(G.box, M.trim);
      bar.scale.set(w, h, 0.08);
      bar.position.set(x, y, 2.09);
      bar.rotation.z = rz;
      barn.add(bar);
    }
    Toon.addOutlines(barn);
    scene.add(barn);

    // a wooden fence across the back, with a gap by the barn
    const posts = [];
    const rails = [];
    for (let x = -3; x <= 16; x += 1.8) posts.push({ x, y: 0.6, z: -7, sx: 0.18, sy: 1.2, sz: 0.18 });
    for (const y of [0.45, 0.9]) rails.push({ x: 6.5, y, z: -7, sx: 19.6, sy: 0.14, sz: 0.1 });
    const postMesh = instanced(G.box, M.wood, posts);
    const railMesh = instanced(G.box, M.wood, rails);
    Toon.addOutlines(postMesh);
    Toon.addOutlines(railMesh);
    scene.add(postMesh, railMesh);
    const bales = instanced(G.bale, M.hay, [
      { x: 4, y: 0.7, z: -9, sx: 1, sy: 1, sz: 1, rx: Math.PI / 2, ry: 0.3 },
      { x: 5.6, y: 0.7, z: -9.6, sx: 1, sy: 1, sz: 1, rx: Math.PI / 2, ry: -0.2 },
      { x: 4.8, y: 1.9, z: -9.3, sx: 1, sy: 1, sz: 1, rx: Math.PI / 2, ry: 0.1 },
    ]);
    Toon.addOutlines(bales);
    scene.add(bales);

    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.water);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(8, 3.5, 1);
    pond.position.set(12, 0.01, -12);
    scene.add(pond);
    const lilyMesh = instanced(G.lily, M.lily, [0, 1, 2, 3, 4].map(() => ({ x: 12 + rand(-6, 6), y: 0.03, z: -12 + rand(-2, 2), sx: 0.7, sy: 1, sz: 0.7, ry: rand(0, TAU) })));
    Toon.addOutlines(lilyMesh);
    scene.add(lilyMesh);

    const trunks = [];
    const leaves = [];
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rand(14, 30);
      const z = rand(-30, -8);
      const s = rand(0.9, 1.5);
      trunks.push({ x, y: 1.1 * s, z, sx: s, sy: s, sz: s });
      leaves.push({ x, y: 3.3 * s, z, sx: 2.1 * s, sy: 2.4 * s, sz: 2.1 * s });
    }
    for (let i = 0; i < 8; i++) {
      const x = rand(-12, 12);
      trunks.push({ x, y: 1.1, z: rand(-32, -24), sx: 1.2, sy: 1.2, sz: 1.2 });
      leaves.push({ x, y: 3.8, z: trunks[trunks.length - 1].z, sx: 2.6, sy: 2.9, sz: 2.6 });
    }
    const leafMesh = instanced(G.ball, M.leaf, leaves);
    Toon.addOutlines(leafMesh);
    scene.add(instanced(G.trunk, M.trunk, trunks), leafMesh);
    const flowers = [[], [], []];
    for (let i = 0; i < 36; i++) flowers[i % 3].push({ x: rand(-12, 12), y: 0.2, z: rand(-6, 4), sx: 0.18, sy: 0.18, sz: 0.18 });
    flowers.forEach((f, k) => scene.add(instanced(G.bit, M.bloom[k], f)));

    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      for (const [x, y, r] of [[0, 0, 1.6], [1.5, -0.2, 1.2], [-1.5, -0.3, 1.1], [0.6, 0.6, 1.1]]) {
        const puff = new THREE.Mesh(G.ball, M.cloud);
        puff.position.set(x, y, 0);
        puff.scale.set(r, r * 0.8, r);
        g.add(puff);
      }
      g.position.set(rand(-30, 30), rand(10, 15), rand(-40, -30));
      g.userData.speed = rand(0.3, 0.7);
      scene.add(g);
      clouds.push(g);
    }

    const actors = new THREE.Group();
    scene.add(actors);
    const ringMesh = new THREE.Mesh(G.ring, M.ring);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.visible = false;
    scene.add(ringMesh);

    const bits = [];
    let spots = [];
    let camL = 10;
    let camY = 1.6;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

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

    /* Where n animals stand: one row on wide screens; on tall ones, rows of
     * two, the second a little in front, so each stays big enough to tap. */
    W.arrange = (n) => {
      const tall = camera.aspect < 0.85;
      spots = [];
      if (!tall || n <= 2) {
        const gap = tall ? 2.3 : 2.7;
        for (let i = 0; i < n; i++) spots.push({ x: (i - (n - 1) / 2) * gap, z: 0 });
      } else {
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / 2);
          const inRow = Math.min(2, n - row * 2);
          spots.push({ x: ((i % 2) - (inRow - 1) / 2) * 2.4, z: row * 2.6 - 1.3 });
        }
      }
      return spots.map((s) => new THREE.Vector3(s.x, 0, s.z));
    };

    W.ring = (spot) => {
      ringMesh.visible = !!spot;
      if (spot) ringMesh.position.set(spot.x, 0.03, spot.z);
    };

    /* Camera: in front and a little above, backing off until every animal
     * fits across and top to bottom. */
    W.frame = (dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.42 / a) * 180) / Math.PI, 40, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const t = Math.tan((vfov * Math.PI) / 360);
      const list = spots.length ? spots : [{ x: -1.35, z: 0 }, { x: 1.35, z: 0 }];
      const tall = clamp((1 - a) / 0.4, 0, 1);             // 1 on a phone held upright
      const front = Math.max(...list.map((s) => s.z));
      const back = Math.min(...list.map((s) => s.z));
      const depth = front - back;
      const halfW = Math.max(...list.map((s) => Math.abs(s.x))) + 1.5 - 0.5 * tall;
      const halfH = 1.9 + depth * 0.45;
      const want = clamp(Math.max(halfW / (t * a), halfH / t) + 2.5 - 1.8 * tall, 6.5, 30);
      const k = snap ? 1 : 1 - Math.exp(-3 * dt);
      camL += (want - camL) * k;
      camY += (1.6 + depth * 1.3 - camY) * k;               // two rows: look down more, so they stand apart
      camera.position.set(0, 1.3 + camY, camL + front);
      camera.lookAt(0, 1.1, (front + back) / 2 - 0.2);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------- pointer helpers */
    function aim(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    // which of these roots a tap is on: the one it touches, or the nearest within reach of a small finger
    W.pick = (clientX, clientY, roots) => {
      aim(clientX, clientY);
      const live = roots.filter((r) => r && r.visible);
      const hit = ray.intersectObjects(live, true)[0];
      if (hit) {
        for (let o = hit.object; o; o = o.parent) {
          const i = roots.indexOf(o);
          if (i >= 0) return i;
        }
      }
      let best = null;
      let bestD = Infinity;
      roots.forEach((root, i) => {
        if (!root || !root.visible) return;
        const mid = root.position.clone().setY(0.9);
        const c = W.toScreen(mid);
        const edge = W.toScreen(mid.clone().setX(mid.x + 1.1));
        const d = Math.hypot(clientX - c.x, clientY - c.y);
        if (d < Math.abs(edge.x - c.x) && d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      hearts: { n: 8, geo: () => G.heart, mat: (i) => M.hearts[i % 3], speed: 1.6, up: 2.2, size: 0.22, life: 1.2, fall: -1.2 },
      puff: { n: 12, geo: () => G.bit, mat: () => M.white, speed: 2.6, up: 1.2, size: 0.16, life: 0.45, fall: 6 },
      sparkle: { n: 12, geo: () => G.bit, mat: () => M.gold, speed: 2.4, up: 2.6, size: 0.06, life: 0.7, fall: 9 },
      confetti: { n: 60, geo: () => G.bit, mat: (i) => M.confetti[i % M.confetti.length], speed: 7, up: 5, size: 0.09, life: 1.8, fall: 7 },
    };
    W.burst = (pos, kind) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(b.geo(), b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        scene.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed),
          life: b.life,
          max: b.life,
          size: b.size,
          fall: b.fall,
          spin: kind === 'hearts' ? rand(-2, 2) : 0,
        });
      }
    };

    W.update = (t, dt) => {
      clouds.forEach((c) => {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 40) c.position.x = -40;
      });
      if (ringMesh.visible) ringMesh.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.y -= b.fall * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.y += b.spin * dt;
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    return W;
  }

  window.World = { create };
})();
