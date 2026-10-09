/* Rainbow Balloons: the 3D world.
 *
 * Owns the renderer, the meadow with the pond behind it, drifting clouds,
 * the spots where the critters stand, the balloons (rising in, bobbing,
 * wiggling, popping into confetti or floating away), the keyboard ring, the
 * camera and the effects. It draws; game.js decides. Needs THREE, Toon and
 * Balloons; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const R = 0.95;                       // balloon radius
  const STRING = 1.6;
  const SKY = '#cdeeff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const backOut = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
  const HEX = {};
  Balloons.COLOURS.forEach((c) => { HEX[c.id] = c.hex; });

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 28 });
    geo.rotateX(-Math.PI / 2);
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
    scene.fog = new THREE.Fog(SKY, 30, 80);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

    const M = {
      grass: Toon.toon('#a4dd84'),
      water: Toon.flat('#86d3ee'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      trunk: Toon.toon('#b9825a'),
      leaf: Toon.toon('#7ccf72', '#55a650'),
      bush: Toon.toon('#8fd47a', '#5fae5a'),
      cloud: Toon.flat('#ffffff'),
      string: Toon.flat('#f4f1ff'),
      shine: Toon.flat('#ffffff', 0.7),
      ring: new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.9, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      bloom: [Toon.toon('#ff9ec0'), Toon.toon('#ffd85c'), Toon.toon('#ffffff')],
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 32, 24),
      bit: new THREE.SphereGeometry(1, 8, 6),
      knot: new THREE.ConeGeometry(0.13, 0.22, 12),
      string: new THREE.CylinderGeometry(0.014, 0.014, STRING, 6),
      ring: new THREE.RingGeometry(1.32, 1.5, 48),
      trunk: new THREE.CylinderGeometry(0.3, 0.42, 2.2, 8),
      lily: padGeometry(1),
    };
    // each colour's paint, outlined one shade darker
    const paint = {};
    Balloons.COLOURS.forEach((c) => {
      const dark = new THREE.Color(c.hex).multiplyScalar(0.72);
      paint[c.id] = Toon.toon(c.hex, '#' + dark.getHexString());
      paint[c.id].bits = Toon.flat(c.hex);
    });

    /* ------------------------------------------------------------ meadow */
    const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 48), M.grass);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.water);
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(15, 5, 1);
    pond.position.set(2, 0.01, -14);
    scene.add(pond);
    const lilies = [];
    for (let i = 0; i < 9; i++) lilies.push({ x: 2 + rand(-11, 11), y: 0.03, z: -14 + rand(-3, 3), sx: 0.8, sy: 1, sz: 0.8, ry: rand(0, TAU) });
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    scene.add(lilyMesh);
    const trunks = [];
    const leaves = [];
    const bushes = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rand(9, 26);
      const z = rand(-30, -6);
      const s = rand(0.9, 1.5);
      trunks.push({ x, y: 1.1 * s, z, sx: s, sy: s, sz: s });
      leaves.push({ x, y: 3.3 * s, z, sx: 2.1 * s, sy: 2.4 * s, sz: 2.1 * s });
    }
    for (let i = 0; i < 12; i++) bushes.push({ x: rand(-16, 16), y: 0.45, z: rand(-24, -18), sx: 1.4, sy: 1, sz: 1.2 });
    const leafMesh = instanced(G.ball, M.leaf, leaves);
    const bushMesh = instanced(G.ball, M.bush, bushes);
    Toon.addOutlines(leafMesh);
    Toon.addOutlines(bushMesh);
    scene.add(instanced(G.trunk, M.trunk, trunks), leafMesh, bushMesh);
    const flowers = [[], [], []];
    for (let i = 0; i < 36; i++) flowers[i % 3].push({ x: rand(-12, 12), y: 0.2, z: rand(-8, 2), sx: 0.2, sy: 0.2, sz: 0.2 });
    flowers.forEach((f, k) => scene.add(instanced(G.bit, M.bloom[k], f)));

    // fluffy clouds drifting slowly across the sky
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

    /* ----------------------------------------------------------- balloons */
    function makeBalloon() {
      const group = new THREE.Group();
      const sway = new THREE.Group();          // swings from the knot like a real balloon
      group.add(sway);
      const body = new THREE.Mesh(G.ball, paint.red);
      body.scale.set(R, R * 1.15, R);
      const shine = new THREE.Mesh(G.ball, M.shine);
      shine.scale.set(0.17, 0.27, 0.06);
      shine.position.set(-0.36, 0.45, 0.82);
      shine.rotation.z = 0.5;
      const knot = new THREE.Mesh(G.knot, paint.red);
      knot.rotation.x = Math.PI;
      knot.position.y = -R * 1.15 - 0.07;
      const string = new THREE.Mesh(G.string, M.string);
      string.position.y = -R * 1.15 - 0.18 - STRING / 2;
      sway.add(body, shine, knot, string);
      const ring = new THREE.Mesh(G.ring, M.ring);
      ring.visible = false;
      group.add(ring);
      group.visible = false;
      scene.add(group);
      return { group, sway, body, knot, ring, colour: 'red', painted: false, state: 'gone', at: 0, x: 0, y: 0, ph: rand(0, TAU), wiggleAt: -9, hint: false };
    }
    const balloons = [0, 1, 2, 3].map(makeBalloon);

    const bits = [];
    let ringOn = null;
    let layout = [];
    let camL = 12;
    let camY = 3.4;
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

    /* Where n balloons float: one row on wide screens; on tall ones, rows of
     * two, so every balloon stays big enough for a small finger. */
    function arrange(n) {
      const tall = camera.aspect < 0.85;
      const spots = [];
      if (!tall || n <= 2) {
        const gap = tall ? 2.3 : 2.6;
        for (let i = 0; i < n; i++) spots.push({ x: (i - (n - 1) / 2) * gap, y: 3.5 + (i % 2 ? -0.25 : 0.25) });
      } else {
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / 2);
          const inRow = Math.min(2, n - row * 2);
          spots.push({ x: ((i % 2) - (inRow - 1) / 2) * 2.3, y: 4.7 - row * 2.5 });
        }
      }
      return spots;
    }

    // a new set of balloons rises in from below
    W.setBalloons = (colours, t) => {
      layout = arrange(colours.length);
      balloons.forEach((b, i) => {
        if (i >= colours.length) {
          b.group.visible = false;
          b.state = 'gone';
          return;
        }
        if (b.colour !== colours[i] || !b.painted) {
          // new paint needs a new outline: the old one was made for the old colour
          b.colour = colours[i];
          for (const m of [b.body, b.knot]) {
            m.children.filter((c) => c.userData.outline).forEach((c) => m.remove(c));
            m.material = paint[b.colour];
            Toon.addOutlines(m);
          }
          b.painted = true;
        }
        b.x = layout[i].x;
        b.y = layout[i].y;
        b.state = 'rise';
        b.at = t + i * 0.12;
        b.hint = false;
        b.wiggleAt = -9;
        b.group.scale.setScalar(1);
        b.group.visible = true;
        b.group.position.set(b.x, b.y - 9, 0.5);
      });
    };
    W.count = () => layout.length;
    W.colourOf = (i) => balloons[i].colour;
    W.isUp = (i) => balloons[i] && balloons[i].group.visible && (balloons[i].state === 'idle' || balloons[i].state === 'rise');
    W.pop = (i, t) => {
      const b = balloons[i];
      b.state = 'pop';
      b.at = t;
    };
    W.wiggle = (i, t) => { balloons[i].wiggleAt = t; };
    W.hint = (i, on) => { balloons[i].hint = on; };
    W.flyAway = (i, t) => {
      const b = balloons[i];
      if (b.state === 'gone' || b.state === 'pop') return;
      b.state = 'away';
      b.at = t;
    };
    W.ring = (i) => { ringOn = i; };
    W.balloonPos = (i) => balloons[i].group.position.clone();

    /* Camera: straight on and a little above, backing off until every
     * balloon and the critters below them fit. */
    W.frame = (dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.42 / a) * 180) / Math.PI, 40, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const t = Math.tan((vfov * Math.PI) / 360);
      const spots = layout.length ? layout : arrange(2);
      const halfW = Math.max(...spots.map((s) => Math.abs(s.x))) + R + 0.8;
      const top = Math.max(...spots.map((s) => s.y)) + R * 1.15 + 0.9;
      const midY = (top + 0.2) / 2;
      const halfH = (top - 0.2) / 2 + 1.0;
      const want = clamp(Math.max(halfW / (t * a), halfH / t) + 1.5, 9, 30);
      const k = snap ? 1 : 1 - Math.exp(-3 * dt);
      camL += (want - camL) * k;
      camY += (midY - camY) * k;
      camera.position.set(0, camY + 0.6, camL);
      camera.lookAt(0, camY, 0);
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
    // the balloon under a tap: the one it touches, or the nearest within reach of a small finger
    W.balloonAt = (clientX, clientY) => {
      aim(clientX, clientY);
      const live = balloons.map((b, i) => i).filter((i) => W.isUp(i));
      const hit = ray.intersectObjects(live.map((i) => balloons[i].body), false)[0];
      if (hit) return live.find((i) => balloons[i].body === hit.object);
      let best = null;
      let bestD = Infinity;
      for (const i of live) {
        const c = W.toScreen(balloons[i].group.position);
        const edge = W.toScreen(balloons[i].group.position.clone().setX(balloons[i].group.position.x + R));
        const reach = Math.abs(edge.x - c.x) * 1.5;
        const d = Math.hypot(clientX - c.x, clientY - c.y);
        if (d < reach && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    /* ------------------------------------------------------------ effects */
    W.burst = (pos, kind, colour) => {
      const conf = {
        pop: { n: 26, mat: () => paint[colour].bits, speed: 5, up: 3, size: 0.09, life: 0.9 },
        sparkle: { n: 14, mat: () => M.white, speed: 3, up: 3, size: 0.06, life: 0.6 },
        party: { n: 70, mat: (i) => paint[Balloons.COLOURS[i % 6].id].bits, speed: 8, up: 6, size: 0.1, life: 1.8 },
      }[kind];
      for (let i = 0; i < conf.n; i++) {
        const m = new THREE.Mesh(G.bit, conf.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(conf.size);
        scene.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * conf.speed, conf.up * rand(0.4, 1.2), rand(-0.5, 0.5) * conf.speed),
          life: conf.life,
          max: conf.life,
          size: conf.size,
        });
      }
    };

    /* --------------------------------------------------------- every frame */
    W.update = (t, dt) => {
      clouds.forEach((c) => {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 40) c.position.x = -40;
      });
      balloons.forEach((b, i) => {
        if (!b.group.visible) return;
        const P = b.group.position;
        const bob = 0.14 * Math.sin(t * 1.4 + b.ph) + (b.hint ? 0.32 * Math.abs(Math.sin(t * 6)) : 0);
        if (b.state === 'rise') {
          const k = clamp((t - b.at) / 0.9, 0, 1);
          P.y = b.y - 9 + 9 * backOut(k);
          if (k >= 1) b.state = 'idle';
        } else if (b.state === 'idle') {
          P.y = b.y + bob;
        } else if (b.state === 'pop') {
          const k = (t - b.at) / 0.12;
          b.group.scale.setScalar(1 + 0.35 * Math.min(k, 1));
          if (k >= 1) {
            b.group.visible = false;
            b.state = 'gone';
            W.burst(P.clone(), 'pop', b.colour);
          }
        } else if (b.state === 'away') {
          const k = t - b.at;
          P.y = b.y + bob + 1.2 * k * k * 4;
          if (k > 1.6) {
            b.group.visible = false;
            b.state = 'gone';
          }
        }
        P.x = b.x + 0.08 * Math.sin(t * 0.9 + b.ph);
        const w = t - b.wiggleAt;
        b.sway.rotation.z = 0.07 * Math.sin(t * 1.1 + b.ph) + (w < 0.7 ? 0.35 * Math.sin(w * 28) * (1 - w / 0.7) : 0);
        b.ring.visible = ringOn === i && (b.state === 'idle' || b.state === 'rise');
        if (b.ring.visible) b.ring.scale.setScalar(1 + 0.04 * Math.sin(t * 7));
      });
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          scene.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.y -= 7 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    return W;
  }

  window.World = { create };
})();
