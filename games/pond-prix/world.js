/* Pond Prix: the 3D world.
 *
 * Owns the renderer, the meadow and the pond, the circuit (a smooth loop
 * from Race.TRACK, three lanes wide, with candy curbs and lane dashes), the
 * start line and its banner, the answer gates and their number signs, the
 * boost pads and mud, the karts, the cameras and the effects. It draws;
 * game.js decides. Needs THREE, Toon and Race; sets window.World.
 *
 * Distances: s runs along the centreline from the start line, and x is the
 * sideways offset, positive to the driver's right.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const SAMPLES = 720;                  // points along the centreline
  const LANE_W = Race.LANE_W;
  const HALF = LANE_W * 1.5;            // half the road's width
  const SKY = '#cdeeff';
  const POND = { x: -2, z: 3, rx: 42, rz: 22 };
  const FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const laneX = (lane) => (lane - 1) * LANE_W;

  function padGeometry(r) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, r, 0.35, TAU - 0.35, false);
    s.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 32 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  function canvasTexture(w, h, draw, crisp) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d');
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    if (crisp) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
    }
    const paint = () => {
      draw(x, w, h);
      t.needsUpdate = true;
    };
    paint();
    return { tex: t, ctx: x, paint };
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
    scene.fog = new THREE.Fog(SKY, 90, 260);
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9e3cf', 1.5));
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(30, 60, 40);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);

    const M = {
      grass: Toon.toon('#a4dd84'),
      road: Toon.toon('#a9aecb'),
      water: Toon.flat('#86d3ee'),
      lily: Toon.toon('#7ccf72', '#55a650'),
      curbA: Toon.toon('#ff8fb0'),
      curbB: Toon.toon('#ffffff'),
      dash: Toon.flat('#ffffff'),
      trunk: Toon.toon('#b9825a'),
      leafA: Toon.toon('#6cc070', '#4f9a52'),
      leafB: Toon.toon('#8fd47a', '#5fae5a'),
      hill: [Toon.toon('#9bd88a'), Toon.toon('#86cc7c'), Toon.toon('#b0e39a')],
      bloom: [Toon.toon('#ff9ec0'), Toon.toon('#ffd85c'), Toon.toon('#ffffff')],
      post: Toon.toon('#ffffff', '#c9c4dd'),
      beam: Toon.toon('#f59e0b', '#c2770a'),
      mud: Toon.toon('#9b6a3e', '#76502d'),
      mudDark: Toon.toon('#7d532f'),
      tyre: Toon.toon('#3a3970'),
      hub: Toon.toon('#ffffff'),
      lamp: Toon.flat('#fff3a6'),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      muddy: Toon.flat('#8a5a32'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      box: new THREE.BoxGeometry(1, 1, 1),
      lily: padGeometry(1),
      trunk: new THREE.CylinderGeometry(0.3, 0.42, 2.2, 8),
      post: new THREE.CylinderGeometry(0.14, 0.16, 3.6, 10),
      tyre: new THREE.CylinderGeometry(0.3, 0.3, 0.24, 18),
      hub: new THREE.CylinderGeometry(0.13, 0.13, 0.27, 12),
      tub: new THREE.CapsuleGeometry(0.5, 1.0, 8, 20),
      bumper: new THREE.CapsuleGeometry(0.11, 0.9, 6, 12),
      wheel: new THREE.TorusGeometry(0.17, 0.035, 8, 20),
      pole: new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6),
      flag: new THREE.ConeGeometry(0.16, 0.42, 3),
      sign: new THREE.PlaneGeometry(2.1, 1.38),
      pad: new THREE.PlaneGeometry(2.3, 3.4),
      checker: new THREE.PlaneGeometry(HALF * 2, 1.4),
      banner: new THREE.PlaneGeometry(HALF * 2 + 2.2, 1.6),
    };

    /* ------------------------------------------------------------ circuit */
    const curve = new THREE.CatmullRomCurve3(Race.TRACK.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    const length = curve.getLength();
    const P = curve.getSpacedPoints(SAMPLES);            // SAMPLES + 1 points; the last is the first
    const T = [];
    for (let i = 0; i < SAMPLES; i++) T.push(P[(i + 1) % SAMPLES].clone().sub(P[(i - 1 + SAMPLES) % SAMPLES]).setY(0).normalize());
    T.push(T[0]);
    const yawOf = (t) => Math.atan2(t.x, t.z);

    function frame(s) {
      const u = ((((s % length) + length) % length) / length) * SAMPLES;
      const i = Math.min(Math.floor(u), SAMPLES - 1);
      const f = u - i;
      return { p: P[i].clone().lerp(P[i + 1], f), t: T[i].clone().lerp(T[i + 1], f).normalize() };
    }
    // a point on the circuit and the way it faces; x > 0 is the driver's right
    function pose(s, x) {
      const { p, t } = frame(s);
      p.x -= t.z * x;
      p.z += t.x * x;
      return { pos: p, yaw: yawOf(t) };
    }
    // a group laid in the track's frame at s: local +z forward, local +x to the left
    function trackGroup(s) {
      const g = new THREE.Group();
      const { pos, yaw } = pose(s, 0);
      g.position.copy(pos);
      g.rotation.y = yaw;
      scene.add(g);
      return g;
    }

    const ground = new THREE.Mesh(new THREE.CircleGeometry(320, 64), M.grass);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // the road: a plane bent into a ribbon along the centreline. Its first
    // column becomes the right-hand edge, which keeps every face pointing up.
    const roadGeo = new THREE.PlaneGeometry(1, 1, 1, SAMPLES);
    const rp = roadGeo.attributes.position;
    const rn = roadGeo.attributes.normal;
    for (let i = 0; i <= SAMPLES; i++) {
      const p = P[i];
      const t = T[i];
      rp.setXYZ(i * 2, p.x - t.z * HALF, 0.02, p.z + t.x * HALF);
      rp.setXYZ(i * 2 + 1, p.x + t.z * HALF, 0.02, p.z - t.x * HALF);
      rn.setXYZ(i * 2, 0, 1, 0);
      rn.setXYZ(i * 2 + 1, 0, 1, 0);
    }
    rp.needsUpdate = true;
    rn.needsUpdate = true;
    roadGeo.computeBoundingSphere();
    scene.add(new THREE.Mesh(roadGeo, M.road));

    // candy curbs along both edges, and dashes between the lanes
    const curbs = [[], []];
    const dashes = [];
    for (let i = 0, n = 0; i < SAMPLES; i += 2, n++) {
      const p = P[i];
      const t = T[i];
      for (const side of [-1, 1]) {
        const off = side * (HALF + 0.3);
        curbs[n % 2].push({ x: p.x - t.z * off, y: 0.07, z: p.z + t.x * off, sx: 0.6, sy: 0.14, sz: 1.3, ry: yawOf(t) });
      }
      if (i % 8 === 0) {
        for (const off of [-LANE_W / 2, LANE_W / 2]) {
          dashes.push({ x: p.x - t.z * off, y: 0.035, z: p.z + t.x * off, sx: 0.16, sy: 0.02, sz: 1.9, ry: yawOf(t) });
        }
      }
    }
    scene.add(instanced(G.box, M.curbA, curbs[0]), instanced(G.box, M.curbB, curbs[1]), instanced(G.box, M.dash, dashes));

    // the start line: a chequered strip and a banner over the road
    const startG = trackGroup(0);
    const checker = canvasTexture(18, 2, (x, w, h) => {
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
          x.fillStyle = (i + j) % 2 ? '#2b2a5e' : '#ffffff';
          x.fillRect(i, j, 1, 1);
        }
      }
    }, true);
    const strip = new THREE.Mesh(G.checker, new THREE.MeshBasicMaterial({ map: checker.tex }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.04;
    startG.add(strip);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(G.post, M.post);
      post.scale.y = 1.4;
      post.position.set(side * (HALF + 0.9), 2.5, 0);
      startG.add(post);
    }
    const bannerArt = canvasTexture(512, 74, (x, w, h) => {
      x.fillStyle = '#0f766e';
      roundRect(x, 2, 2, w - 4, h - 4, 18);
      x.fill();
      for (const left of [22, w - 70]) {                 // a little chequered flag at each end
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            x.fillStyle = (i + j) % 2 ? '#2b2a5e' : '#ffffff';
            x.fillRect(left + i * 12, 19 + j * 12, 12, 12);
          }
        }
      }
      x.fillStyle = '#ffffff';
      x.font = `700 46px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('POND PRIX', w / 2, h / 2 + 3);
    });
    for (const turn of [0, Math.PI]) {
      const banner = new THREE.Mesh(G.banner, new THREE.MeshBasicMaterial({ map: bannerArt.tex, transparent: true }));
      banner.position.set(0, 4.7, turn ? -0.02 : 0.02);
      banner.rotation.y = turn;
      startG.add(banner);
    }
    Toon.addOutlines(startG);

    /* ------------------------------------------------------------ scenery */
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), M.water);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(POND.rx, POND.rz, 1);
    water.position.set(POND.x, 0.01, POND.z);
    scene.add(water);
    const inPond = (x, z, grow) => ((x - POND.x) / (POND.rx * grow)) ** 2 + ((z - POND.z) / (POND.rz * grow)) ** 2 < 1;
    const nearRoad = (x, z, gap) => {
      for (let i = 0; i < SAMPLES; i += 3) {
        const dx = P[i].x - x;
        const dz = P[i].z - z;
        if (dx * dx + dz * dz < gap * gap) return true;
      }
      return false;
    };
    const lilies = [];
    const blossoms = [];
    for (let i = 0; i < 40 && lilies.length < 22; i++) {
      const a = rand(0, TAU);
      const r = Math.sqrt(Math.random()) * 0.85;
      const x = POND.x + Math.cos(a) * POND.rx * r;
      const z = POND.z + Math.sin(a) * POND.rz * r;
      const s = rand(0.8, 1.6);
      lilies.push({ x, y: 0.03, z, sx: s, sy: 1, sz: s, ry: rand(0, TAU) });
      if (Math.random() < 0.4) blossoms.push({ x, y: 0.15, z, sx: 0.3, sy: 0.22, sz: 0.3 });
    }
    const lilyMesh = instanced(G.lily, M.lily, lilies);
    Toon.addOutlines(lilyMesh);
    scene.add(lilyMesh, instanced(G.ball, M.bloom[0], blossoms));

    const trunks = [];
    const leaves = [[], []];
    for (let tries = 0; tries < 1500 && trunks.length < 95; tries++) {
      const a = rand(0, TAU);
      const r = rand(10, 150);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.8;
      if (nearRoad(x, z, HALF + 5) || inPond(x, z, 1.12)) continue;
      const s = rand(0.8, 1.45);
      trunks.push({ x, y: 1.1 * s, z, sx: s, sy: s, sz: s });
      leaves[trunks.length % 2].push({ x, y: 3.3 * s, z, sx: 2.1 * s, sy: 2.4 * s, sz: 2.1 * s });
    }
    const leafMeshes = [instanced(G.ball, M.leafA, leaves[0]), instanced(G.ball, M.leafB, leaves[1])];
    leafMeshes.forEach((m) => Toon.addOutlines(m));
    scene.add(instanced(G.trunk, M.trunk, trunks), ...leafMeshes);

    const bushes = [];
    const flowers = [[], [], []];
    for (let i = 0; i < SAMPLES; i += 9) {
      const t = T[i];
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = side * (HALF + rand(2.2, 6));
      const x = P[i].x - t.z * off;
      const z = P[i].z + t.x * off;
      if (nearRoad(x, z, HALF + 1.6) || inPond(x, z, 1.05)) continue;
      if (Math.random() < 0.45) {
        const s = rand(0.8, 1.4);
        bushes.push({ x, y: 0.5 * s, z, sx: 1.2 * s, sy: 0.9 * s, sz: 1.2 * s });
      } else {
        for (let k = 0; k < 4; k++) {
          flowers[k % 3].push({ x: x + rand(-1.2, 1.2), y: 0.25, z: z + rand(-1.2, 1.2), sx: 0.24, sy: 0.24, sz: 0.24 });
        }
      }
    }
    const bushMesh = instanced(G.ball, M.leafB, bushes);
    Toon.addOutlines(bushMesh);
    scene.add(bushMesh, ...flowers.map((f, k) => instanced(G.ball, M.bloom[k], f)));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand(-0.2, 0.2);
      const hill = new THREE.Mesh(G.ball, M.hill[i % 3]);
      hill.position.set(Math.cos(a) * rand(185, 215), -6, Math.sin(a) * rand(165, 195));
      hill.scale.set(rand(38, 60), rand(20, 32), rand(38, 60));
      scene.add(hill);
    }

    /* -------------------------------------------------------------- gates */
    // three arches across the road at each gate, one per lane, each with a sign
    const gates = Race.TRACK.gates.map((at) => {
      const g = trackGroup(at * length);
      const signs = [0, 1, 2].map((lane) => {
        const arch = new THREE.Group();
        arch.position.x = -laneX(lane);                 // local +x is the driver's left
        // tall enough that the chase camera passes well under the beam
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(G.post, M.post);
          post.scale.y = 1.25;
          post.position.set(side * 1.25, 2.25, 0);
          arch.add(post);
        }
        const beam = new THREE.Mesh(G.box, M.beam);
        beam.scale.set(2.8, 0.34, 0.34);
        beam.position.y = 4.5;
        arch.add(beam);
        g.add(arch);
        const art = canvasTexture(256, 168, () => {});
        const board = new THREE.Mesh(G.sign, new THREE.MeshBasicMaterial({ map: art.tex, transparent: true }));
        board.position.y = 5.4;
        board.rotation.y = Math.PI;                    // faces the oncoming karts
        arch.add(board);
        return { art, text: '', mood: '' };
      });
      Toon.addOutlines(g);
      return { group: g, signs };
    });

    function drawSign(sign) {
      const x = sign.art.ctx;
      x.clearRect(0, 0, 256, 168);
      if (!sign.text) {
        sign.art.tex.needsUpdate = true;
        return;
      }
      x.fillStyle = sign.mood === 'good' ? '#22c55e' : sign.mood === 'bad' ? '#a3753b' : '#ffffff';
      roundRect(x, 8, 8, 240, 152, 34);
      x.fill();
      x.lineWidth = 10;
      x.strokeStyle = '#2b2a5e';
      x.stroke();
      x.fillStyle = sign.mood ? '#ffffff' : '#2b2a5e';
      x.font = `700 ${sign.text.length > 2 ? 86 : 108}px ${FONT}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(sign.text, 128, 92);
      sign.art.tex.needsUpdate = true;
    }

    /* --------------------------------------------------------------- pads */
    const chevrons = canvasTexture(128, 192, (x, w, h) => {
      x.fillStyle = '#ffb020';
      roundRect(x, 4, 4, w - 8, h - 8, 22);
      x.fill();
      x.strokeStyle = '#fff6d6';
      x.lineWidth = 18;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const y of [44, 96, 148]) {                  // pointing down the canvas = forward on the road
        x.beginPath();
        x.moveTo(26, y - 22);
        x.lineTo(64, y + 10);
        x.lineTo(102, y - 22);
        x.stroke();
      }
    });
    const boostMat = new THREE.MeshBasicMaterial({ map: chevrons.tex, transparent: true });
    for (const pad of Race.TRACK.pads) {
      const g = trackGroup(pad.at * length);
      if (pad.kind === 'boost') {
        const m = new THREE.Mesh(G.pad, boostMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(-laneX(pad.lane), 0.045, 0);
        g.add(m);
      } else {
        const m = new THREE.Mesh(G.ball, M.mud);
        m.scale.set(1.25, 0.06, 1.7);
        m.position.set(-laneX(pad.lane), 0.03, 0);
        g.add(m);
        for (const [dx, dz, r] of [[0.4, 0.5, 0.32], [-0.45, -0.35, 0.26], [0.1, -0.8, 0.2]]) {
          const spot = new THREE.Mesh(G.ball, M.mudDark);
          spot.scale.set(r, 0.07, r);
          spot.position.set(-laneX(pad.lane) + dx, 0.04, dz);
          g.add(spot);
        }
        Toon.addOutlines(g);
      }
    }

    /* -------------------------------------------------------------- karts */
    function makeKart(color) {
      const base = new THREE.Color(color);
      const paint = Toon.toon(color, '#' + base.clone().multiplyScalar(0.72).getHexString());
      const trim = Toon.toon('#' + base.clone().lerp(new THREE.Color('#ffffff'), 0.55).getHexString());
      const root = new THREE.Group();
      const body = new THREE.Group();
      root.add(body);
      const tub = new THREE.Mesh(G.tub, paint);
      tub.rotation.x = Math.PI / 2;
      tub.scale.set(1.15, 0.9, 0.55);
      tub.position.y = 0.44;
      const back = new THREE.Mesh(G.ball, paint);
      back.scale.set(0.42, 0.36, 0.13);
      back.position.set(0, 0.84, -0.58);
      const bumper = new THREE.Mesh(G.bumper, M.hub);
      bumper.rotation.z = Math.PI / 2;
      bumper.position.set(0, 0.3, 0.98);
      const stripe = new THREE.Mesh(G.ball, trim);
      stripe.scale.set(0.2, 0.06, 0.55);
      stripe.position.set(0, 0.71, 0.55);
      const steer = new THREE.Mesh(G.wheel, M.tyre);   // low and nearly flat, below the driver's chin
      steer.rotation.x = -1.25;
      steer.scale.setScalar(0.85);
      steer.position.set(0, 0.74, 0.36);
      body.add(tub, back, bumper, stripe, steer);
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(G.ball, M.lamp);
        lamp.scale.setScalar(0.1);
        lamp.position.set(sx * 0.32, 0.56, 0.93);
        body.add(lamp);
      }
      const pole = new THREE.Mesh(G.pole, M.tyre);
      pole.position.set(-0.42, 1.12, -0.62);
      const flag = new THREE.Mesh(G.flag, trim);
      flag.rotation.z = -Math.PI / 2;
      flag.scale.set(1, 1, 0.25);
      flag.position.set(-0.24, 1.46, -0.62);
      body.add(pole, flag);
      const wheels = [];
      for (const [x, z] of [[-0.62, 0.62], [0.62, 0.62], [-0.62, -0.62], [0.62, -0.62]]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.3, z);
        const tyre = new THREE.Mesh(G.tyre, M.tyre);
        tyre.rotation.z = Math.PI / 2;
        const hub = new THREE.Mesh(G.hub, M.hub);
        hub.rotation.z = Math.PI / 2;
        const spoke = new THREE.Mesh(G.box, M.hub);       // shows the wheel turning
        spoke.scale.set(0.28, 0.44, 0.07);
        pivot.add(tyre, hub, spoke);
        root.add(pivot);
        wheels.push(pivot);
      }
      const seat = new THREE.Group();
      seat.position.set(0, 0.42, -0.18);
      body.add(seat);
      Toon.addOutlines(root);
      scene.add(root);
      return { root, body, wheels, seat, flag };
    }

    /* -------------------------------------------------------------- state */
    const bits = [];
    const camPos = new THREE.Vector3(0, 10, 10);
    const camLook = new THREE.Vector3();
    let baseFov = 58;
    let kick = 0;

    const W = { renderer, scene, camera, length, laneX, pose };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      baseFov = clamp((2 * Math.atan(0.55 / camera.aspect) * 180) / Math.PI, 56, 80);
      camera.fov = baseFov;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);
    W.addKart = makeKart;

    // put a kart at (s, x); lean tips it into a lane change, steer turns its nose
    W.placeKart = (kart, s, x, lean, steer, roll) => {
      const { pos, yaw } = pose(s, x);
      kart.root.position.copy(pos);
      kart.root.rotation.y = yaw + steer;
      kart.body.rotation.z = lean;
      kart.wheels.forEach((w) => { w.rotation.x = roll; });
      kart.flag.rotation.x = 0.25 * Math.sin(roll * 0.7);
    };

    // a gate's three signs: numbers, or blank; mood 'good' or 'bad' paints one up
    W.setSigns = (gate, choices) => {
      gates[gate].signs.forEach((sign, lane) => {
        sign.text = choices ? String(choices[lane]) : '';
        sign.mood = '';
        drawSign(sign);
      });
    };
    W.markSign = (gate, lane, mood) => {
      const sign = gates[gate].signs[lane];
      sign.mood = mood;
      drawSign(sign);
    };
    W.showGates = (on) => gates.forEach((g) => { g.group.visible = on; });
    W.repaint = () => {
      bannerArt.paint();
      gates.forEach((g) => g.signs.forEach(drawSign));
    };

    /* ------------------------------------------------------------ cameras */
    // behind the kart and a little above; boost widens the view a touch
    W.chase = (pos, yaw, dt, snap, boost) => {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const want = new THREE.Vector3(pos.x - fx * 8, pos.y + 3.5, pos.z - fz * 8);
      const look = new THREE.Vector3(pos.x + fx * 7, pos.y + 1.1, pos.z + fz * 7);
      const k = snap ? 1 : 1 - Math.exp(-5 * dt);
      camPos.lerp(want, k);
      camLook.lerp(look, snap ? 1 : 1 - Math.exp(-8 * dt));
      kick += ((boost || 0) - kick) * (snap ? 1 : 1 - Math.exp(-4 * dt));
      const fov = baseFov + 7 * kick;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    };
    // 0 on wide screens, 1 on tall ones, where the cards cover more of the picture
    const tallness = () => clamp((1.2 - camera.aspect) / 0.6, 0, 1);
    // in front of the starting grid, looking back at the four karts; on a
    // tall screen from higher up and level, so the karts sit under the menu
    W.gridView = () => {
      const k = tallness();
      const from = pose(8.5, 0).pos;
      const at = pose(-5.5, 0).pos;
      camPos.set(from.x, 2.5 + 3.2 * k, from.z);
      camLook.set(at.x, 0.8 + 4.9 * k, at.z);
      if (Math.abs(camera.fov - baseFov) > 0.05) {
        camera.fov = baseFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    };
    // circling a kart for the finish, starting from behind it; the kart sits
    // low in the picture, under the results card
    W.orbit = (pos, yaw, since, calm) => {
      const a = yaw + Math.PI + (calm ? 0.5 : 0.5 + since * 0.3);
      camPos.set(pos.x + Math.sin(a) * 9, pos.y + 4.4, pos.z + Math.cos(a) * 9);
      camLook.set(pos.x, pos.y + 3.2 + 1.6 * tallness(), pos.z);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
    };

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 14, mat: () => M.gold, speed: 3, up: 3, size: 0.07, life: 0.7 },
      mud: { n: 16, mat: () => M.muddy, speed: 3.4, up: 2.6, size: 0.1, life: 0.6 },
      puff: { n: 3, mat: () => M.white, speed: 0.8, up: 0.8, size: 0.12, life: 0.4 },
      confetti: { n: 60, mat: (i) => M.confetti[i % M.confetti.length], speed: 7, up: 5, size: 0.08, life: 1.8 },
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
