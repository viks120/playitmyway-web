/* Stepping Stones: the 3D world.
 *
 * Owns the renderer, the sky and water, the lily pads on the critter-picking
 * screen, and the pond itself: stones with their painted labels, banks and
 * reeds, ripples and particles, and both camera framings. It draws; game.js
 * decides what happens. Needs THREE and Toon; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const ROWS = 8;
  const COLS = 4;
  const DX = 1.38;              // column spacing: four columns must fit a phone held upright
  const DZ = 1.7;               // row spacing
  const STONE_TOP = 0.34;
  const BANK_TOP = 0.31;
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const colX = (c) => (c - (COLS - 1) / 2) * DX;
  const rowZ = (r) => -r * DZ;

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.3, TAU - 0.3, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  /* A stone's painted number, in the site's own Fredoka, with a white halo so
   * it reads on any stone colour. The canvas top faces away from the camera. */
  function labelTexture(text) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    let size = text.length <= 2 ? 150 : text.length === 3 ? 118 : text.length === 4 ? 92 : 78;
    const font = () => `700 ${size}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    x.font = font();
    while (x.measureText(text).width > 214 && size > 40) {
      size -= 4;
      x.font = font();
    }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = Math.max(10, size * 0.11);
    x.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    x.strokeText(text, 128, 138);
    x.fillStyle = '#2b2a5e';
    x.fillText(text, 128, 138);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
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
    scene.fog = new THREE.Fog(SKY, 17, 38);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);

    const M = {
      water: Toon.flat('#93d6ec'),
      stones: ['#efe4d3', '#e8dac7', '#f3e9db'].map((c) => Toon.toon(c, '#b8a68c')),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      pad: Toon.toon('#7ccf72', '#55a650'),
      petal: Toon.toon('#ffb3c9'),
      spark: Toon.flat('#ffffff'),
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
      focus: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.95, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      stone: new THREE.LatheGeometry([[0, -0.14], [0.44, -0.1], [0.54, 0.04], [0.56, 0.18], [0.5, 0.3], [0.4, STONE_TOP], [0, STONE_TOP]]
        .map(([x, y]) => new THREE.Vector2(x, y)), 40),
      decal: new THREE.CircleGeometry(0.43, 40),
      ring: new THREE.RingGeometry(0.62, 0.71, 48),
      focus: new THREE.RingGeometry(0.66, 0.84, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      pad: padGeometry(1),
      bit: new THREE.SphereGeometry(1, 10, 8),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      flower: new THREE.SphereGeometry(1, 12, 8),
      nearDirt: new THREE.BoxGeometry(20, 0.5, 4.2),
      nearGrass: new THREE.BoxGeometry(20.1, 0.14, 4.3),
      farDirt: new THREE.BoxGeometry(20, 0.5, 6),
      farGrass: new THREE.BoxGeometry(20.1, 0.14, 6.1),
      shadow: new THREE.PlaneGeometry(1.3, 1.3),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(80, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const picker = new THREE.Group();
    const pond = new THREE.Group();
    const level = new THREE.Group();          // rebuilt for every pond
    const actors = new THREE.Group();         // the player and the friends
    pond.add(level, actors);
    scene.add(picker, pond);

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 36;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-8, 8), z: rand(-20, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const rings = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(G.ring, M.ring);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      pond.add(m);
      return m;
    });
    const focusRing = new THREE.Mesh(G.focus, M.focus);
    focusRing.rotation.x = -Math.PI / 2;
    focusRing.visible = false;
    pond.add(focusRing);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    pond.add(shadow);

    let stones = [];
    let ringNodes = [];
    let focusNode = null;
    let camZ = 0;
    const bits = [];
    const ripples = [];
    const pickerPads = [];
    let pickerRigs = [];
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const W = { renderer, scene, camera, actors, rowZ };

    W.show = (which) => {
      picker.visible = which === 'picker';
      pond.visible = which === 'pond';
    };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    W.render = () => renderer.render(scene, camera);

    /* ---------------------------------------------------- pointer helpers */
    function aim(clientX, clientY, rect) {
      const r = rect || canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    W.pick = (clientX, clientY, planeY, rect) => {
      aim(clientX, clientY, rect);
      plane.constant = -planeY;
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, hit) ? hit : null;
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

    /* ------------------------------------------------- the picking screen */
    W.showPicker = (rigs) => {
      pickerRigs.forEach((rg) => picker.remove(rg.root));
      pickerRigs = rigs;
      rigs.forEach((rg, i) => {
        if (!pickerPads[i]) {
          const pad = new THREE.Mesh(G.pad, M.pad);
          Toon.addOutlines(pad);
          picker.add(pad);
          pickerPads[i] = pad;
        }
        picker.add(rg.root);
      });
    };

    /* Stand each critter on a lily pad under its button, whatever the
     * layout: four in a row, or two by two on a tall screen. */
    W.alignPicker = (buttons) => {
      const rect = canvas.getBoundingClientRect();
      buttons.forEach((btn, i) => {
        const rig = pickerRigs[i];
        const pad = pickerPads[i];
        if (!rig || !pad) return;
        const b = btn.getBoundingClientRect();
        const y = b.top + b.height * 0.74;
        const mid = W.pick(b.left + b.width / 2, y, 0, rect);
        const left = W.pick(b.left + b.width * 0.1, y, 0, rect);
        const right = W.pick(b.right - b.width * 0.1, y, 0, rect);
        if (!mid || !left || !right) return;
        const s = clamp(left.distanceTo(right) / 2.4, 0.4, 2.0);
        pad.position.set(mid.x, 0, mid.z);
        pad.scale.setScalar(s * 1.05);
        rig.root.position.x = mid.x;
        rig.root.position.z = mid.z;
        rig.root.scale.setScalar(s * 1.15);
        rig.baseY = 0.05 * s * 1.05;
      });
    };

    W.framePicker = () => {
      if (camera.fov !== 40) {
        camera.fov = 40;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 5.5, 8.5);
      camera.lookAt(0, 0.5, 0);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------- a pond */
    W.buildPond = (data) => {
      level.traverse((o) => {
        if (o.isMesh && o.material && o.material.map && o.material !== M.shadow) {
          o.material.map.dispose();
          o.material.dispose();
        }
        if (o.isInstancedMesh) o.dispose();
      });
      level.clear();
      if (data.rows.length !== ROWS || data.rows[0].length !== COLS) throw new Error('Pond must be ' + ROWS + ' by ' + COLS);

      stones = data.rows.map((row, r) => row.map((item, c) => {
        const g = new THREE.Group();
        g.position.set(colX(c), 0, rowZ(r));
        const body = new THREE.Mesh(G.stone, M.stones[(r * 7 + c * 3) % 3]);
        const decal = new THREE.Mesh(G.decal, new THREE.MeshBasicMaterial({
          map: labelTexture(item.label), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
        }));
        decal.rotation.x = -Math.PI / 2;
        decal.position.y = STONE_TOP + 0.006;
        g.add(body, decal);
        Toon.addOutlines(g);
        level.add(g);
        return { g, base: 0, dip: 0, dipV: 0, ph: rand(0, TAU) };
      }));

      // banks: grass over a dirt edge, the near one behind the start
      const nearZ = rowZ(-1) - 0.85 + 2.1;        // front edge 0.85 in front of the start spot
      const farZ = rowZ(ROWS - 1) - 0.85 - 3;
      const add = (geo, mat, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); level.add(m); };
      add(G.nearDirt, M.dirt, -0.06, nearZ);
      add(G.nearGrass, M.grass, 0.25, nearZ);
      add(G.farDirt, M.dirt, -0.06, farZ);
      add(G.farGrass, M.grass, 0.25, farZ);

      // reeds and cattails on both banks, lily pads and flowers on the water
      const reeds = [];
      const tails = [];
      const pads = [];
      const flowers = [];
      for (const [z0, z1] of [[0.95, 4.6], [rowZ(ROWS - 1) - 4.5, rowZ(ROWS - 1) - 1.0]]) {
        for (let i = 0; i < 14; i++) {
          const x = (Math.random() < 0.5 ? -1 : 1) * rand(3.3, 8);
          const z = rand(z0, z1);
          const h = rand(0.7, 1.5);
          reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
          if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
        }
      }
      for (let i = 0; i < 20; i++) {
        const x = (Math.random() < 0.5 ? -1 : 1) * rand(3.3, 7.5);
        const z = rand(rowZ(ROWS - 1) - 0.4, 0.6);
        const s = rand(0.35, 0.7);
        pads.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
        if (Math.random() < 0.35) flowers.push({ x, y: 0.1, z, sx: 0.12, sy: 0.09, sz: 0.12 });
      }
      level.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails));
      const padMesh = instanced(G.pad, M.pad, pads);
      Toon.addOutlines(padMesh);
      level.add(padMesh);
      if (flowers.length) level.add(instanced(G.flower, M.petal, flowers));

      W.showRings([]);
      W.showFocus(null);
    };

    W.startTop = () => new THREE.Vector3(0, BANK_TOP, rowZ(-1));
    W.endTop = (c) => new THREE.Vector3(colX(c) * 0.6, BANK_TOP, rowZ(ROWS) + 0.2);
    W.friendSpot = (i) => new THREE.Vector3((i - 1) * 1.8, BANK_TOP, rowZ(ROWS) - 0.9);
    W.waterAt = (r, c) => new THREE.Vector3(colX(c), 0, rowZ(r));
    W.stoneTop = (r, c) => {
      const g = stones[r][c].g;
      return new THREE.Vector3(g.position.x, g.position.y + STONE_TOP, g.position.z);
    };
    W.nodeTop = (n) => (n.type === 'start' ? W.startTop() : n.type === 'end' ? W.endTop(n.c) : W.stoneTop(n.r, n.c));
    W.dipStone = (r, c) => { stones[r][c].dipV = -1.6; };
    W.wobbleStone = (r, c, angle) => { stones[r][c].g.rotation.z = angle; };
    W.sinkStone = (r, c, k) => {
      const s = stones[r][c];
      s.base = -(k * k) * 0.9;
      if (k >= 1) s.g.visible = false;
    };

    W.showRings = (nodes) => {
      ringNodes = nodes.slice(0, rings.length);
      rings.forEach((m, i) => { m.visible = i < ringNodes.length; });
    };
    W.showFocus = (node) => {
      focusNode = node;
      focusRing.visible = !!node;
    };

    /* Camera for a pond. On narrow screens the vertical field of view widens
     * so the horizontal one still fits all four columns at the critter's own
     * row; on tall screens it aims further ahead, so the critter sits low with
     * more pond above it. */
    W.framePond = (focusZ, dt, snap) => {
      camZ = snap ? focusZ : camZ + (focusZ - camZ) * (1 - Math.exp(-3 * dt));
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.34 / a) * 180) / Math.PI, 40, 64);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const hHalf = Math.tan((vfov * Math.PI) / 360) * a;
      const ahead = clamp(5.4 - 2.0 * a, 2.0, 4.6);
      const pitch = 0.72;
      const halfWidth = 1.5 * DX + 0.56 + 0.2;
      const L = clamp(halfWidth / hHalf + ahead * Math.cos(pitch), 10, 13);
      const tz = camZ - ahead;
      camera.position.set(0, 0.4 + L * Math.sin(pitch), tz + L * Math.cos(pitch));
      camera.lookAt(0, 0.4, tz);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 10, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.05, life: 0.6 },
      splash: { n: 22, mat: () => M.white, speed: 3.4, up: 4.2, size: 0.07, life: 0.8 },
      drops: { n: 14, mat: () => M.white, speed: 2.6, up: 1.6, size: 0.045, life: 0.5 },
      poof: { n: 16, mat: () => M.white, speed: 3, up: 1.4, size: 0.14, life: 0.45 },
      confetti: { n: 40, mat: (i) => M.confetti[i % M.confetti.length], speed: 5, up: 4.5, size: 0.06, life: 1.4 },
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
    W.shadow = (x, y, z, lift, visible) => {
      shadow.visible = visible;
      if (!visible) return;
      const s = 1 - 0.45 * clamp(lift / 0.8, 0, 1);
      shadow.position.set(x, y + 0.006, z);
      shadow.scale.setScalar(s);
      M.shadow.opacity = 0.5 + 0.5 * s;
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

      for (const row of stones) {
        for (const s of row) {
          s.dipV += (-s.dip * 140 - s.dipV * 9) * dt;
          s.dip += s.dipV * dt;
          s.g.position.y = s.base + 0.025 * Math.sin(t * 1.4 + s.ph) + s.dip * 0.5;
        }
      }

      const pulse = Math.sin(t * 5);
      M.ring.opacity = 0.55 + 0.35 * pulse;
      // the far bank gets a big goal ring; the near bank (a way back) a small one
      const RING_SIZE = { stone: 1, end: 1.3, start: 0.75 };
      ringNodes.forEach((n, i) => {
        const p = W.nodeTop(n);
        const onBank = n.type !== 'stone';
        rings[i].position.set(p.x, onBank ? BANK_TOP + 0.02 : 0.03, p.z);
        rings[i].scale.setScalar(RING_SIZE[n.type] * (1 + 0.06 * pulse));
      });
      if (focusNode) {
        const p = W.nodeTop(focusNode);
        const onBank = focusNode.type !== 'stone';
        focusRing.position.set(p.x, onBank ? BANK_TOP + 0.03 : 0.04, p.z);
        focusRing.scale.setScalar((onBank ? 1.3 : 1) * (1 + 0.05 * Math.sin(t * 7)));
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
