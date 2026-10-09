/* Number Line Hop: the 3D world.
 *
 * Owns the renderer, the sky and water, the lily pads on the critter-picking
 * screen, and the number line itself: a row of numbered lily pads, the jump
 * arcs, the gold guessing ring, the bank where friends watch, both camera
 * framings and the effects. It draws; game.js decides. Needs THREE and Toon;
 * sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const GAP = 1.35;              // one number per pad
  const PAD_TOP = 0.06;
  const BANK_TOP = 0.31;
  const BANK_Z = -4.4;           // where the friends stand
  const ARC_Z = -0.4;            // jump arcs float just behind the line
  const SKY = '#dff4ff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // a pad's number on a cream badge, in the site's own Fredoka
  function badgeMaterial(n) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff8ef';
    x.beginPath();
    x.arc(64, 64, 62, 0, TAU);
    x.fill();
    x.font = `700 ${n >= 10 ? 66 : 78}px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#2b2a5e';
    x.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true });
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
    scene.fog = new THREE.Fog(SKY, 16, 40);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    const M = {
      water: Toon.flat('#93d6ec'),
      pad: Toon.toon('#8bd47e', '#5aa74f'),
      pickPad: Toon.toon('#7ccf72', '#55a650'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      petal: Toon.toon('#ffb3c9'),
      grass: Toon.toon('#a8e28c'),
      dirt: Toon.toon('#d8b48a'),
      reed: Toon.toon('#7fbf6a'),
      cattail: Toon.toon('#b9825a'),
      spark: Toon.flat('#ffffff'),
      arcs: {
        '+': new THREE.MeshBasicMaterial({ color: '#8b5cf6' }),
        '-': new THREE.MeshBasicMaterial({ color: '#f97362' }),
      },
      ring: new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.95, depthWrite: false }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      white: Toon.flat('#ffffff'),
      gold: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      pad: padGeometry(0.6),
      pickPad: padGeometry(1),
      lily: padGeometry(1),
      badge: new THREE.CircleGeometry(0.4, 40),
      ring: new THREE.RingGeometry(0.66, 0.82, 48),
      ripple: new THREE.RingGeometry(0.95, 1, 48),
      bit: new THREE.SphereGeometry(1, 10, 8),
      flower: new THREE.SphereGeometry(1, 12, 8),
      shadow: new THREE.PlaneGeometry(1.2, 1.2),
      spark: new THREE.PlaneGeometry(0.18, 0.05),
      reed: new THREE.CylinderGeometry(0.035, 0.045, 1, 6),
      cattail: new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
      bankGrass: new THREE.BoxGeometry(84, 0.14, 6.1),
      bankDirt: new THREE.BoxGeometry(84, 0.5, 6),
    };

    const water = new THREE.Mesh(new THREE.CircleGeometry(90, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const picker = new THREE.Group();
    const lineWorld = new THREE.Group();
    const line = new THREE.Group();           // rebuilt for every pond
    const arcs = new THREE.Group();
    const actors = new THREE.Group();          // the player and the friends
    lineWorld.add(line, arcs, actors);
    scene.add(picker, lineWorld);

    // the bank where the friends watch: grass over a dirt edge, reeds behind them
    const bankZ = BANK_Z + 0.8 - 3;
    const dirt = new THREE.Mesh(G.bankDirt, M.dirt);
    dirt.position.set(0, -0.06, bankZ);
    const grass = new THREE.Mesh(G.bankGrass, M.grass);
    grass.position.set(0, 0.25, bankZ);
    lineWorld.add(dirt, grass);
    const reeds = [];
    const tails = [];
    const lilies = [];
    const flowers = [];
    for (let i = 0; i < 46; i++) {
      const x = rand(-38, 38);
      const z = rand(BANK_Z - 4.5, BANK_Z - 1.2);
      const h = rand(0.7, 1.6);
      reeds.push({ x, y: BANK_TOP + h / 2, z, sx: 1, sy: h, sz: 1 });
      if (Math.random() < 0.6) tails.push({ x, y: BANK_TOP + h + 0.1, z, sx: 1, sy: 1, sz: 1 });
    }
    for (let i = 0; i < 36; i++) {
      const x = rand(-34, 34);
      const z = Math.random() < 0.5 ? rand(1.4, 3.4) : rand(-3.0, -1.4);
      const s = rand(0.3, 0.6);
      lilies.push({ x, y: 0.005, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
      if (Math.random() < 0.3) flowers.push({ x, y: 0.09, z, sx: 0.11, sy: 0.08, sz: 0.11 });
    }
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    lineWorld.add(instanced(G.reed, M.reed, reeds), instanced(G.cattail, M.cattail, tails), lilyMesh);
    if (flowers.length) lineWorld.add(instanced(G.flower, M.petal, flowers));

    // twinkles on the water: one instanced mesh, twinkling by scale
    const SPARKS = 50;
    const sparkMesh = new THREE.InstancedMesh(G.spark, M.spark, SPARKS);
    sparkMesh.frustumCulled = false;
    scene.add(sparkMesh);
    const sparks = Array.from({ length: SPARKS }, () => ({ x: rand(-30, 30), z: rand(-3, 6), ph: rand(0, TAU), sp: rand(0.6, 1.6) }));
    const flatDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();

    const ring = new THREE.Mesh(G.ring, M.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    lineWorld.add(ring);
    const shadow = new THREE.Mesh(G.shadow, M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false;
    lineWorld.add(shadow);

    let max = 10;
    let pads = [];
    let ringN = null;
    let camX = 0;
    const bits = [];
    const ripples = [];
    const pickerPads = [];
    let pickerRigs = [];
    const badges = [];
    const badgeFor = (n) => badges[n] || (badges[n] = badgeMaterial(n));
    const padX = (n) => (n - max / 2) * GAP;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    const W = { renderer, scene, camera, actors, padX };

    W.show = (which) => {
      picker.visible = which === 'picker';
      lineWorld.visible = which === 'line';
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
    W.nearestPad = (clientX, clientY) => {
      const hit = W.pick(clientX, clientY, PAD_TOP);
      if (!hit || Math.abs(hit.z) > 0.9) return null;
      const n = Math.round(hit.x / GAP + max / 2);
      if (n < 0 || n > max || Math.abs(hit.x - padX(n)) > 0.75) return null;
      return n;
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
          const pad = new THREE.Mesh(G.pickPad, M.pickPad);
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

    /* ----------------------------------------------------------- the line */
    W.buildLine = (top) => {
      line.clear();
      max = top;
      pads = [];
      for (let n = 0; n <= max; n++) {
        const g = new THREE.Group();
        g.position.set(padX(n), 0, 0);
        const pad = new THREE.Mesh(G.pad, M.pad);
        pad.rotation.y = Math.PI / 2 + (n % 3) * 0.4;
        const badge = new THREE.Mesh(G.badge, badgeFor(n));
        badge.rotation.x = -Math.PI / 2;
        badge.position.y = PAD_TOP + 0.005;
        g.add(pad, badge);
        Toon.addOutlines(g);
        line.add(g);
        pads.push({ g, ph: rand(0, TAU) });
      }
      W.clearArcs();
      W.showRing(null);
    };

    W.padTop = (n) => {
      const p = pads[n];
      return new THREE.Vector3(padX(n), PAD_TOP + (p ? p.g.position.y : 0), 0);
    };
    W.bankSpot = (x) => new THREE.Vector3(x, BANK_TOP, BANK_Z);
    W.camX = () => camX;

    W.addArc = (a, b, op) => {
      const x0 = padX(a);
      const x1 = padX(b);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x0, 0.3, ARC_Z),
        new THREE.Vector3((x0 + x1) / 2, 1.2, ARC_Z),
        new THREE.Vector3(x1, 0.3, ARC_Z),
      ]);
      arcs.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.028, 8, false), M.arcs[op]));
    };
    W.clearArcs = () => {
      arcs.children.forEach((m) => m.geometry.dispose());
      arcs.clear();
    };
    W.showRing = (n) => {
      ringN = n;
      ring.visible = n != null;
    };

    /* Camera for the line. It follows the critter, showing about five pads
     * on a tall screen and seven on a wide one, or wider when the game asks
     * (to keep a friend or a guess in view), and stops at the line's ends. */
    W.frameLine = (focusX, halfWidth, dt, snap) => {
      const a = camera.aspect;
      const vfov = clamp((2 * Math.atan(0.36 / a) * 180) / Math.PI, 38, 62);
      if (Math.abs(camera.fov - vfov) > 0.01) {
        camera.fov = vfov;
        camera.updateProjectionMatrix();
      }
      const hHalf = Math.tan((vfov * Math.PI) / 360) * a;
      const want = Math.max(halfWidth, a > 1.2 ? 4.6 : 2.7);
      const half = (padX(max) - padX(0)) / 2;
      const inset = Math.min(want - 1.2, half);
      const aimX = clamp(focusX, padX(0) + inset, padX(max) - inset);
      camX = snap ? aimX : camX + (aimX - camX) * (1 - Math.exp(-3 * dt));
      const L = clamp(want / hHalf, 6, 22);
      const pitch = 0.6;
      camera.position.set(camX, 0.35 + L * Math.sin(pitch), L * Math.cos(pitch));
      camera.lookAt(camX, 0.35, -0.6);
      camera.updateMatrixWorld();
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 10, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.05, life: 0.6 },
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

      pads.forEach((p) => { p.g.position.y = 0.02 * Math.sin(t * 1.3 + p.ph); });
      if (ringN != null) {
        ring.position.set(padX(ringN), 0.04, 0);
        ring.scale.setScalar(1 + 0.05 * Math.sin(t * 7));
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
