/* Peekaboo Pond: the 3D world.
 *
 * Owns the renderer, the sky and water, the bank where the critters wait,
 * the lotus flowers (six petals hinged at the base, so one number takes a
 * flower from a shut bud to full bloom), the swap lanes, the two surprises,
 * the keyboard ring, the camera and the effects. It draws; game.js decides.
 * Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const GAP = 2.4;               // between flowers: room for two blooms side by side
  const PAD_TOP = 0.06;
  const BANK_TOP = 0.31;
  const BANK_Z = -3.9;           // where the critters wait their turn
  const PETALS = 6;
  const CLOSED = -0.5;           // petal tilt in a shut bud
  const OPEN = 0.74;             // and in bloom
  const AIM_Y = 0.5;             // the camera looks at this height
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => x * x * (3 - 2 * x);
  const backOut = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function shadowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(20, 50, 70, 0.42)');
    g.addColorStop(1, 'rgba(20, 50, 70, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
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
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                    // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 20, 44);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 90);

    const M = {
      water: Toon.flat('#93d6ec'),
      pad: Toon.toon('#86d27a', '#5aa74f'),
      petal: Toon.toon('#ffb3c9', '#e88aa5'),
      heart: Toon.toon('#ffe08a'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      blossom: Toon.toon('#ffb3c9'),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      spark: Toon.flat('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: '#0f766e', transparent: true, opacity: 0.9, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      fish: Toon.toon('#ff9f43', '#d9772a'),
      fin: Toon.toon('#ffc46b', '#d9772a'),
      bug: Toon.toon('#ff5a5a', '#c43b3b'),
      wing: Toon.flat('#ffffff', 0.6),
      ink: Toon.toon('#2b2a5e'),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      pad: padGeometry(0.95),
      lily: padGeometry(1),
      ball: new THREE.SphereGeometry(1, 28, 18),
      tail: new THREE.ConeGeometry(0.2, 0.32, 16),
      ring: new THREE.RingGeometry(1.04, 1.2, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      bit: new THREE.SphereGeometry(1, 10, 8),
      shadow: new THREE.PlaneGeometry(1.2, 1.2),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      bankGrass: new THREE.BoxGeometry(60, 0.14, 6.1),
      bankDirt: new THREE.BoxGeometry(60, 0.5, 6),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(70, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const flowersRoot = new THREE.Group();
    const actors = new THREE.Group();
    scene.add(flowersRoot, actors);

    // the bank where the critters wait: grass over a dirt edge, reeds behind them
    const bankZ = BANK_Z + 0.8 - 3;
    const dirt = new THREE.Mesh(G.bankDirt, M.dirt);
    dirt.position.set(0, -0.06, bankZ);
    const grass = new THREE.Mesh(G.bankGrass, M.grass);
    grass.position.set(0, 0.25, bankZ);
    scene.add(dirt, grass);
    const reeds = [];
    const tails = [];
    const lilies = [];
    const blossoms = [];
    for (let i = 0; i < 34; i++) {
      const x = rand(-26, 26);
      const z = rand(BANK_Z - 4.4, BANK_Z - 1.1);
      const h = rand(0.7, 1.6);
      reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
      if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
    }
    for (let i = 0; i < 18; i++) {
      const x = (Math.random() < 0.5 ? -1 : 1) * rand(6.2, 15);
      const z = rand(-2.6, 3.4);
      const s = rand(0.3, 0.65);
      lilies.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
      if (Math.random() < 0.35) blossoms.push({ x, y: 0.09, z, sx: 0.12, sy: 0.09, sz: 0.12 });
    }
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    scene.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails), lilyMesh);
    if (blossoms.length) scene.add(instanced(G.ball, M.blossom, blossoms));

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 40;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-16, 16), z: rand(-2.5, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const ringMesh = new THREE.Mesh(G.ring, M.ring);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.visible = false;
    scene.add(ringMesh);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    scene.add(shadow);

    /* A lotus: a lily pad and six petals, each hinged at its base, so one
     * number, o, takes it from a shut bud (0) to full bloom (1). */
    const flowers = [];
    function makeFlower() {
      const group = new THREE.Group();
      group.userData.flower = flowers.length;
      const pad = new THREE.Mesh(G.pad, M.pad);
      pad.rotation.y = rand(0, TAU);
      group.add(pad);
      const petals = [];
      for (let k = 0; k < PETALS; k++) {
        const a = (k / PETALS) * TAU;
        const hinge = new THREE.Group();
        hinge.position.set(Math.sin(a) * 0.26, PAD_TOP, Math.cos(a) * 0.26);
        hinge.rotation.order = 'YXZ';          // turn to face outward, then lean
        hinge.rotation.y = a;
        const petal = new THREE.Mesh(G.ball, M.petal);
        petal.scale.set(0.3, 0.68, 0.12);
        petal.position.y = 0.62;
        hinge.add(petal);
        group.add(hinge);
        petals.push(hinge);
      }
      const heart = new THREE.Mesh(G.ball, M.heart);
      heart.scale.set(0.16, 0.07, 0.16);
      heart.position.y = PAD_TOP + 0.04;
      group.add(heart);
      Toon.addOutlines(group);
      group.visible = false;
      flowersRoot.add(group);
      return { group, petals, o: 1, target: 1, wiggle: 0, grow: 1, ph: rand(0, TAU) };
    }

    function makeGoldfish() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.ball, M.fish);
      body.scale.set(0.34, 0.24, 0.2);
      const tail = new THREE.Mesh(G.tail, M.fin);
      tail.rotation.z = -Math.PI / 2;
      tail.position.x = -0.42;
      tail.scale.set(1, 1, 0.45);
      const fin = new THREE.Mesh(G.ball, M.fin);
      fin.scale.set(0.12, 0.08, 0.03);
      fin.position.set(0.02, 0.22, 0);
      g.add(body, tail, fin);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(G.ball, M.white);
        eye.scale.setScalar(0.07);
        eye.position.set(0.2, 0.06, side * 0.15);
        const pupil = new THREE.Mesh(G.ball, M.ink);
        pupil.scale.setScalar(0.04);
        pupil.position.set(0.23, 0.06, side * 0.19);
        g.add(eye, pupil);
      }
      Toon.addOutlines(g);
      g.visible = false;
      scene.add(g);
      return g;
    }

    function makeLadybug() {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(G.ball, M.bug);
      shell.scale.set(0.3, 0.2, 0.34);
      const head = new THREE.Mesh(G.ball, M.ink);
      head.scale.setScalar(0.13);
      head.position.set(0, 0.02, 0.33);
      g.add(shell, head);
      for (const [x, y, z] of [[0.12, 0.15, 0.1], [-0.12, 0.15, 0.1], [0.14, 0.12, -0.12], [-0.14, 0.12, -0.12], [0, 0.19, -0.02]]) {
        const dot = new THREE.Mesh(G.ball, M.ink);
        dot.scale.set(0.055, 0.03, 0.055);
        dot.position.set(x, y, z);
        g.add(dot);
      }
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(G.ball, M.white);
        eye.scale.setScalar(0.035);
        eye.position.set(side * 0.05, 0.07, 0.43);
        g.add(eye);
      }
      // little see-through wings, for fluttering up out of the flower
      g.userData.wings = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.1, 0.17, -0.06);
        const wing = new THREE.Mesh(G.ball, M.wing);
        wing.scale.set(0.26, 0.015, 0.14);
        wing.position.x = side * 0.24;
        pivot.add(wing);
        g.add(pivot);
        return pivot;
      });
      Toon.addOutlines(g);
      g.visible = false;
      scene.add(g);
      return g;
    }

    const surprises = { goldfish: makeGoldfish(), ladybug: makeLadybug() };
    const bits = [];
    const ripples = [];
    let ringX = null;
    let camL = 10;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const water0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_TOP);

    const W = { renderer, scene, camera, actors, surprises };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    /* ------------------------------------------------------------ flowers */
    W.setFlowers = (n) => {
      while (flowers.length < n) flowers.push(makeFlower());
      flowers.forEach((f, i) => { f.group.visible = i < n; });
    };
    W.flower = (i) => flowers[i];
    W.slotX = (slot, n) => (slot - (n - 1) / 2) * GAP;
    W.placeFlower = (i, x, z) => {
      flowers[i].group.position.x = x;
      flowers[i].group.position.z = z;
    };
    W.flowerTop = (i) => {
      const p = flowers[i].group.position;
      return new THREE.Vector3(p.x, p.y + PAD_TOP, p.z);
    };

    /* Flower a slides from slot i to slot j while flower b goes the other
     * way, k (0..1) of the way through. One swings out in front and the
     * other behind, then they slide across in lanes wide enough to clear
     * any flower they pass, then swing back in. */
    W.slide = (a, b, i, j, n, k) => {
      const out = Math.abs(i - j) === 1 ? 1.05 : 2.05;
      const z = out * smooth(clamp(Math.min(k, 1 - k) / 0.3, 0, 1));
      const e = smooth(clamp((k - 0.15) / 0.7, 0, 1));
      const xi = W.slotX(i, n);
      const xj = W.slotX(j, n);
      W.placeFlower(a, xi + (xj - xi) * e, z);
      W.placeFlower(b, xj + (xi - xj) * e, -z);
    };

    W.home = (k) => new THREE.Vector3((k - 1.5) * 1.9, BANK_TOP, BANK_Z);
    W.ring = (x) => {
      ringX = x;
      ringMesh.visible = x != null;
    };
    W.shadow = (x, y, z, lift, visible) => {
      shadow.visible = visible;
      if (!visible) return;
      const s = 1 - 0.45 * clamp(lift / 1.0, 0, 1);
      shadow.position.set(x, y + 0.006, z);
      shadow.scale.setScalar(s);
      M.shadow.opacity = 0.5 + 0.5 * s;
    };

    /* Camera: in front and a little above. It backs off until every flower
     * fits across, and everything from the critters' ears on the bank to
     * the front swap lane fits top to bottom, clear of the message strip.
     * Tall screens get a wider view and look down a little more. */
    W.frame = (n, dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.4 / a) * 180) / Math.PI, 38, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const half = (vfov * Math.PI) / 360;
      const k = clamp((1.3 - a) / 0.6, 0, 1);           // 0 on wide screens, 1 on tall ones
      const pitch = 0.58 + 0.12 * k;
      const aimZ = -0.4 - 0.3 * k;
      const want = ((n - 1) * GAP) / 2 + 1.8 - 0.3 * k;
      const front = n > 3 ? 3.0 : 2.0;                    // near edge of the front swap lane
      // where a point on the middle line lands on screen, from 0 (top) to 1 (bottom)
      const screenY = (L, y, z) => {
        const cy = AIM_Y + L * Math.sin(pitch);
        const cz = L * Math.cos(pitch);
        const tilt = Math.atan2(cy - y, cz - z) - Math.atan2(cy - AIM_Y, cz - aimZ);
        return 0.5 + Math.tan(tilt) / (2 * Math.tan(half));
      };
      let L = clamp(want / (Math.tan(half) * a), 7.5, 22);
      while (L < 22 && (screenY(L, 2.2, BANK_Z) < 0.12 || screenY(L, 0, front) > 0.9)) L += 0.1;
      camL = snap ? L : camL + (L - camL) * (1 - Math.exp(-3 * dt));
      camera.position.set(0, AIM_Y + camL * Math.sin(pitch), camL * Math.cos(pitch));
      camera.lookAt(0, AIM_Y, aimZ);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------- pointer helpers */
    function aim(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }

    /* The flower under a tap: the one the tap touches, or else the nearest
     * within 1.1 of where the tap meets the water, which suits small
     * fingers. */
    W.flowerAt = (clientX, clientY) => {
      aim(clientX, clientY);
      const shown = flowers.filter((f) => f.group.visible);
      const hit = ray.intersectObjects(shown.map((f) => f.group), true)[0];
      if (hit) {
        for (let o = hit.object; o; o = o.parent) if (o.userData.flower != null) return o.userData.flower;
      }
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(water0, p)) return null;
      let best = null;
      let bestD = 1.1;
      shown.forEach((f) => {
        const d = Math.hypot(p.x - f.group.position.x, p.z - f.group.position.z);
        if (d < bestD) {
          bestD = d;
          best = f.group.userData.flower;
        }
      });
      return best;
    };
    W.hits = (clientX, clientY, object) => {
      aim(clientX, clientY);
      return ray.intersectObject(object, true).length > 0;
    };
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 12, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.055, life: 0.7 },
      drops: { n: 14, mat: () => M.white, speed: 2.6, up: 1.8, size: 0.05, life: 0.55 },
      confetti: { n: 50, mat: (i) => M.confetti[i % M.confetti.length], speed: 6, up: 4.5, size: 0.065, life: 1.6 },
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
    W.ripple = (x, z, from) => {
      const m = new THREE.Mesh(G.ripple, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.015, z);
      m.scale.setScalar(from);
      scene.add(m);
      ripples.push({ m, t: 0, from });
    };

    /* --------------------------------------------------------- every frame */
    W.update = (t, dt) => {
      sparks.forEach((s, i) => {
        const k = Math.max(0, Math.sin(t * s.sp + s.ph)) ** 8;
        v3.set(s.x, 0.012, s.z);
        s3.set(k, k, k);
        sparkMesh.setMatrixAt(i, m4.compose(v3, flatDown, s3));
      });
      sparkMesh.instanceMatrix.needsUpdate = true;

      for (const f of flowers) {
        if (!f.group.visible) continue;
        const step = dt / 0.35;
        f.o += clamp(f.target - f.o, -step, step);
        const tilt = CLOSED + (OPEN - CLOSED) * smooth(f.o);
        f.petals.forEach((h, k) => { h.rotation.x = tilt + 0.04 * Math.sin(t * 2 + k + f.ph); });
        f.group.rotation.z = f.wiggle * 0.14 * Math.sin(t * 16 + f.ph);
        f.group.position.y = 0.02 * Math.sin(t * 1.3 + f.ph);
        if (f.grow < 1) f.grow = Math.min(1, f.grow + dt / 0.45);
        f.group.scale.setScalar(Math.max(0.001, backOut(f.grow)));
      }
      const lady = surprises.ladybug;
      if (lady.visible) lady.userData.wings.forEach((w, s) => { w.rotation.z = (s ? 1 : -1) * (0.55 + 0.3 * Math.sin(t * 40)); });
      if (ringX != null) {
        ringMesh.position.set(ringX, 0.04, 0);
        ringMesh.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.t += dt;
        const k = r.t / 1.1;
        if (k >= 1) {
          scene.remove(r.m);
          r.m.material.dispose();
          ripples.splice(i, 1);
          continue;
        }
        r.m.scale.setScalar(r.from + k * 1.4);
        r.m.material.opacity = 0.8 * (1 - k);
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

  window.World = { create };
})();
