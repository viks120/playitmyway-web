/* Log Jam: the 3D world.
 *
 * Owns the renderer, the winter scene (a snowy bank cut round the frozen
 * board and the open river beyond the gap, pines, rocks, falling snow), the
 * ice with its faint squares, the logs (chunky toon logs with growth rings
 * on their ends, some with snow or a stubby branch), the little boat with a
 * seat for the skipper, the selection glow, the hint arrow, the camera,
 * picking a log or a square under the pointer, and the effects. It draws;
 * game.js decides. Needs THREE and Toon; sets window.World.
 *
 * Board squares are 1 unit. Column x and row y (row 0 is the far bank) have
 * their middle at (x - 2.5, 0, y - 2.5). The gap is in the right-hand bank
 * on row 2, where the river starts.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const N = 6;
  const HALF = N / 2;
  const R = 0.36;                        // a log's radius
  const BANK_Y = 0.3;                    // the snowy bank's top
  const WATER_Y = -0.15;
  const EXIT_Z = 2.5 - HALF;             // the middle of the exit row
  const SKY = '#e6f0fa';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeOut = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
  const rand = (a, b) => a + Math.random() * (b - a);

  // a seeded random, so a level's logs always look the same
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
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
      q.setFromEuler(e.set(it.rx || 0, it.ry || 0, 0));
      s.set(it.sx, it.sy, it.sz);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* The river: from where the boat waits at the gap, out to the right, round
   * behind the board and away into the mist. The first point is the boat's
   * middle when its bow touches the gap. */
  const RIVER = [[2, EXIT_Z], [3, EXIT_Z], [4.05, -0.62], [4.8, -1.9], [4.85, -3.9], [3.7, -5.4], [1.0, -6.2], [-3, -7.0], [-8, -8.6], [-16, -11.6], [-30, -17], [-46, -24]];
  const riverWidth = (s) => clamp(0.5 + (s - 1) * 0.09, 0.5, 1.5);      // half its width, s units from the boat's start

  /* ------------------------------------------------------------ framing */
  const PITCH = 0.98;                    // how steeply the camera looks down
  const BOARD_PTS = [];
  for (const x of [-HALF - 0.3, HALF + 0.3]) {
    for (const z of [-HALF - 0.3, HALF + 0.35]) BOARD_PTS.push([x, 0, z], [x * 0.98, 0.75, z]);
  }
  // on wide screens there is room for the gap, the river's bend and the river behind
  const WIDE_PTS = BOARD_PTS.concat([[5.3, 0, -0.5], [5.6, 0, -3.0], [1.5, 0, -6.4], [-2.5, 0, -6.6]]);

  function aimAt(camera, x, z, d) {
    camera.position.set(x, d * Math.sin(PITCH), z + d * Math.cos(PITCH));
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
  }
  function bounds(camera, pts) {
    const b = { x0: 9, x1: -9, y0: 9, y1: -9 };
    const v = new THREE.Vector3();
    for (const p of pts) {
      v.set(p[0], p[1], p[2]).project(camera);
      b.x0 = Math.min(b.x0, v.x);
      b.x1 = Math.max(b.x1, v.x);
      b.y0 = Math.min(b.y0, v.y);
      b.y1 = Math.max(b.y1, v.y);
    }
    return b;
  }
  /* Point the camera so the board, with its banks, fills the part of a w by
   * h canvas the controls leave free (insets in pixels). Wide screens also
   * fit the river beyond the gap; on tall ones the board spans the width and
   * sits low, with the river showing above it. */
  function frameView(camera, w, h, insets) {
    camera.aspect = w / h;
    camera.fov = clamp((2 * Math.atan(0.46 / camera.aspect) * 180) / Math.PI, 40, 62);
    camera.updateProjectionMatrix();
    const fx0 = -1 + (2 * insets.left) / w;
    const fx1 = 1 - (2 * insets.right) / w;
    const fy0 = -1 + (2 * insets.bottom) / h;
    const fy1 = 1 - (2 * insets.top) / h;
    const wide = camera.aspect > 1.05;
    const pts = wide ? WIDE_PTS : BOARD_PTS;
    let x = 0;
    let z = 0.3;
    let d = 12;
    for (let round = 0; round < 8; round++) {
      let lo = 3;
      let hi = 80;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        aimAt(camera, x, z, mid);
        const b = bounds(camera, pts);
        if (b.x1 - b.x0 <= fx1 - fx0 && b.y1 - b.y0 <= fy1 - fy0) hi = mid;
        else lo = mid;
      }
      d = hi;
      aimAt(camera, x, z, d);
      const b = bounds(camera, pts);
      const k = d * Math.tan((camera.fov * Math.PI) / 360);
      if (wide) {
        x += (((b.x0 + b.x1) / 2 - (fx0 + fx1) / 2) * k * camera.aspect) / 1;
        z -= ((b.y0 + b.y1) / 2 - (fy0 + fy1) / 2) * k * 1.15;
      } else {
        z -= (b.y0 - (fy0 + 0.02)) * k * 1.15;          // board resting on the bottom of the free space
      }
    }
    aimAt(camera, x, z, d);
    return { x, z, d };
  }

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                        // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 17, 46);
    scene.add(new THREE.HemisphereLight('#ffffff', '#c9dbef', 1.55));
    const sun = new THREE.DirectionalLight('#fff4e6', 1.9);
    sun.position.set(-3, 9, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);

    const barkTex = canvasTexture(128, 64, (x, w, h) => {
      const r = seeded(11);
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, w, h);
      // grooves running along the log, a little wavy
      for (let i = 0; i < 16; i++) {
        const u = ((i + r() * 0.7) / 16) * w;
        x.strokeStyle = `rgba(120, 82, 54, ${0.28 + r() * 0.25})`;
        x.lineWidth = 1.5 + r() * 2.6;
        x.beginPath();
        x.moveTo(u, 0);
        for (let y = 4; y <= h; y += 4) x.lineTo(u + Math.sin(y * 0.18 + i * 1.7) * 1.8, y);
        x.stroke();
      }
      // a few knots
      for (let i = 0; i < 4; i++) {
        x.fillStyle = 'rgba(105, 70, 45, 0.45)';
        x.beginPath();
        x.ellipse(r() * w, 8 + r() * (h - 16), 3 + r() * 2, 5 + r() * 3, 0, 0, TAU);
        x.fill();
      }
    });
    // the ice: faint squares, frosty scratches and a paler rim
    const iceTex = canvasTexture(768, 768, (x, w) => {
      const r = seeded(5);
      const sq = w / (N + 0.1);
      const at = (v) => (v + 0.05) * sq;
      x.fillStyle = '#cbe9f8';
      x.fillRect(0, 0, w, w);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          x.fillStyle = (i + j) % 2 ? 'rgba(255, 255, 255, 0.10)' : 'rgba(150, 200, 230, 0.10)';
          x.fillRect(at(i), at(j), sq, sq);
        }
      }
      x.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      x.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const cx = r() * w;
        const cy = r() * w;
        const a = r() * TAU;
        const len = 14 + r() * 50;
        x.lineWidth = 1 + r() * 2;
        x.beginPath();
        x.moveTo(cx, cy);
        x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        x.stroke();
      }
      x.strokeStyle = 'rgba(70, 135, 180, 0.42)';
      x.lineWidth = 3;
      for (let i = 1; i < N; i++) {
        x.beginPath();
        x.moveTo(at(i), at(0) + 4);
        x.lineTo(at(i), at(N) - 4);
        x.moveTo(at(0) + 4, at(i));
        x.lineTo(at(N) - 4, at(i));
        x.stroke();
      }
      const rim = x.createRadialGradient(w / 2, w / 2, w * 0.32, w / 2, w / 2, w * 0.75);
      rim.addColorStop(0, 'rgba(255, 255, 255, 0)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
      x.fillStyle = rim;
      x.fillRect(0, 0, w, w);
    });

    const M = {
      snow: Toon.toon('#f3f8fd', '#c2d3e6'),
      mound: Toon.toon('#ffffff', '#cfdced'),
      ice: new THREE.MeshBasicMaterial({ map: iceTex }),
      iceSide: Toon.toon('#a9d8f0'),
      water: Toon.flat('#4f9fd1'),
      ripple: Toon.flat('#e8f6ff', 0.7),
      floe: Toon.toon('#f4fbff', '#b9d3e8'),
      rock: Toon.toon('#8f95b0', '#646a87'),
      pine: Toon.toon('#3f8f6b', '#2c6b4f'),
      trunk: Toon.toon('#8a5d3c'),
      post: Toon.toon('#9b6a43', '#6b4528'),
      endwood: Toon.toon('#f3cf98'),
      ringline: Toon.toon('#c88f57'),
      heart: Toon.toon('#a8703f'),
      snowcap: Toon.toon('#ffffff', '#c3d3e6'),
      shadow: Toon.flat('#5f86ad', 0.22),
      hull: Toon.toon('#ef5a3c', '#a83420'),
      trim: Toon.toon('#ffffff', '#c9d2e3'),
      deck: Toon.toon('#e9c38b', '#b58a55'),
      rope: Toon.toon('#d9a35f', '#a8763c'),
      flag: Toon.toon('#22c55e', '#15803d'),
      pole: Toon.toon('#8a5d3c'),
      glow: Toon.toon('#ffd23f', '#c99400'),
      arrow: Toon.toon('#14b8a6', '#0f766e'),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      spray: Toon.flat('#bfe6ff'),
      flake: Toon.flat('#ffffff'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      log: new THREE.CylinderGeometry(1, 1, 1, 26, 1),
      disc: new THREE.CircleGeometry(1, 30),
      ringA: new THREE.RingGeometry(0.3, 0.37, 30),
      ringB: new THREE.RingGeometry(0.6, 0.67, 30),
      stub: new THREE.CylinderGeometry(0.075, 0.09, 0.26, 12),
      cone: new THREE.ConeGeometry(1, 1.6, 10),
      trunk: new THREE.CylinderGeometry(0.14, 0.18, 0.7, 8),
      post: new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10),
      chevron: (() => {
        const d = new THREE.Shape();
        d.moveTo(0.15, 0);
        d.lineTo(-0.08, 0.15);
        d.lineTo(-0.02, 0);
        d.lineTo(-0.08, -0.15);
        d.closePath();
        const geo = new THREE.ExtrudeGeometry(d, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        return geo;
      })(),
      arrowHead: new THREE.ConeGeometry(0.22, 0.34, 18),
      arrowTail: new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12),
      ripple: new THREE.RingGeometry(0.75, 1, 36),
    };
    const KEEP = new Set(Object.values(G).concat(Object.values(M).flat(), [barkTex, iceTex]));
    for (const mat of Object.values(M).flat()) {
      const probe = new THREE.Mesh(G.bit, mat);
      Toon.addOutlines(probe);
      probe.children.forEach((c) => KEEP.add(c.material));
    }
    const C = {
      sel: new THREE.Color('#ffd23f'),
      hint: new THREE.Color('#2dd4bf'),
      log: new THREE.Color('#5a361d'),
      boat: new THREE.Color('#a83420'),
      selGlow: new THREE.Color('#3a2a06'),
      hintGlow: new THREE.Color('#0b3b36'),
      none: new THREE.Color('#000000'),
    };

    /* -------------------------------------------------------------- river */
    const riverCurve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const riverLen = riverCurve.getLength();
    const riverAt = (s) => {
      const u = clamp(s / riverLen, 0, 1);
      return { p: riverCurve.getPointAt(u), t: riverCurve.getTangentAt(u) };
    };

    /* ------------------------------------------------------- bank and ice */
    // a snowy slab with the board and the river cut out of it
    {
      const outer = new THREE.Shape();
      const box = [[-70, 26], [70, 26], [70, -80], [-70, -80]];
      outer.moveTo(box[0][0], -box[0][1]);
      box.slice(1).forEach(([x, z]) => outer.lineTo(x, -z));
      outer.closePath();
      const hole = new THREE.Shape();
      const E = HALF + 0.05;
      const pts = [[-E, -E], [E, -E], [E, -1]];
      const left = [];
      const right = [];
      for (let s = 1; s <= riverLen + 0.01; s += 0.25) {
        const { p, t } = riverAt(s);
        const hw = riverWidth(s);
        const lx = t.z;
        const lz = -t.x;                  // the left-hand side, looking downstream
        left.push([p.x + lx * hw, p.z + lz * hw]);
        right.push([p.x - lx * hw, p.z - lz * hw]);
      }
      left[0] = [E, -1];
      right[0] = [E, 0];
      pts.push(...left.slice(1), ...right.reverse().slice(0, -1), [E, 0], [E, E], [-E, E]);
      hole.moveTo(pts[0][0], -pts[0][1]);
      pts.slice(1).forEach(([x, z]) => hole.lineTo(x, -z));
      hole.closePath();
      outer.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 });
      geo.rotateX(-Math.PI / 2);
      const bank = new THREE.Mesh(geo, M.snow);
      bank.position.y = BANK_Y - 0.66;
      scene.add(bank);
    }
    const ice = new THREE.Mesh(new THREE.BoxGeometry(N + 0.1, 0.4, N + 0.1), [M.iceSide, M.iceSide, M.ice, M.iceSide, M.iceSide, M.iceSide]);
    ice.position.y = -0.2;
    scene.add(ice);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    scene.add(water);

    // snow mounds along the board's edge (not across the gap), rocks and posts
    {
      const r = seeded(3);
      const mounds = [];
      const rocks = [];
      const edge = (x, z, nx, nz) => {
        if (r() < 0.3) return;
        const s = 0.13 + r() * 0.1;
        mounds.push({ x: x + nx * (0.32 + r() * 0.1), y: BANK_Y - 0.03, z: z + nz * (0.32 + r() * 0.1), sx: s * 1.5, sy: s * 0.55, sz: s * 1.3 });
      };
      for (let v = -HALF + 0.3; v <= HALF - 0.2; v += 0.55) {
        edge(v, -HALF - 0.05, 0, -1);                       // far bank
        edge(-HALF - 0.05, v, -1, 0);                       // left bank
        if (v < -1.15 || v > 0.15) edge(HALF + 0.05, v, 1, 0);   // right bank, leaving the gap open
      }
      for (let v = -HALF + 0.25; v <= HALF - 0.2; v += 0.62) {
        // the near bank stays low, so it never hides the bottom row
        const s = 0.12 + r() * 0.05;
        mounds.push({ x: v, y: BANK_Y - 0.04, z: HALF + 0.42, sx: s * 1.6, sy: s * 0.5, sz: s * 1.2 });
      }
      // along the river's banks
      for (let s = 2.2; s < 24; s += 0.9) {
        const { p, t } = riverAt(s);
        const hw = riverWidth(s) + 0.2;
        for (const side of [-1, 1]) {
          if (r() < 0.35) continue;
          const k = 0.12 + r() * 0.12;
          mounds.push({ x: p.x + side * t.z * hw, y: BANK_Y - 0.03, z: p.z - side * t.x * hw, sx: k * 1.5, sy: k * 0.55, sz: k * 1.5 });
        }
      }
      // little clusters of boulders, half sunk in the snow
      for (const [x, z, s] of [[-4.3, -1.3, 0.34], [-4.6, 1.9, 0.26], [4.2, 2.5, 0.3], [-4.0, -4.0, 0.24], [5.9, 0.9, 0.28], [2.2, -4.3, 0.22], [-1.5, -4.4, 0.24], [6.7, -4.9, 0.3]]) {
        rocks.push({ x, y: BANK_Y + s * 0.15, z, sx: s, sy: s * 0.62, sz: s * 0.85, ry: r() * TAU });
        rocks.push({ x: x + s * 0.85, y: BANK_Y + s * 0.05, z: z + s * 0.35, sx: s * 0.6, sy: s * 0.42, sz: s * 0.55, ry: r() * TAU });
      }
      const moundMesh = instanced(G.ball, M.mound, mounds);
      Toon.addOutlines(moundMesh);
      const rockMesh = instanced(G.ball, M.rock, rocks);
      Toon.addOutlines(rockMesh);
      scene.add(moundMesh, rockMesh);
      // two snowy posts mark the gap
      for (const z of [-1.12, 0.12]) {
        const post = new THREE.Mesh(G.post, M.post);
        post.position.set(HALF + 0.14, BANK_Y + 0.3, z);
        const top = new THREE.Mesh(G.ball, M.mound);
        top.scale.set(0.13, 0.07, 0.13);
        top.position.set(HALF + 0.14, BANK_Y + 0.76, z);
        scene.add(post, top);
        Toon.addOutlines(post);
        Toon.addOutlines(top);
      }
    }

    // snowy pines beyond the river and off to the sides, never in front of the board
    {
      const r = seeded(9);
      const cones = [];
      const tips = [];
      const trunks = [];
      const nearRiver = (x, z) => {
        for (let s = 0; s < riverLen; s += 0.8) {
          const { p } = riverAt(s);
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < (riverWidth(s) + 1.3) ** 2) return true;
        }
        return false;
      };
      for (let i = 0; i < 260 && trunks.length < 70; i++) {
        const x = (r() - 0.5) * 50;
        const z = -6 - r() * 26;
        const side = Math.abs(x) > 6.5 && z < 1.5 && z > -6;
        if (!(z < -7.8 || side) || nearRiver(x, z)) continue;
        const s = 0.8 + r() * 0.8;
        trunks.push({ x, y: BANK_Y + 0.35 * s, z, sx: s, sy: s, sz: s });
        cones.push({ x, y: BANK_Y + 1.4 * s, z, sx: 0.9 * s, sy: s, sz: 0.9 * s });
        cones.push({ x, y: BANK_Y + 2.3 * s, z, sx: 0.65 * s, sy: 0.8 * s, sz: 0.65 * s });
        tips.push({ x, y: BANK_Y + 2.85 * s, z, sx: 0.32 * s, sy: 0.2 * s, sz: 0.32 * s });
      }
      for (const [x, z, s] of [[-6.4, -2.5, 1.1], [-7.2, 0.6, 0.9], [-6.1, 2.8, 0.8], [7.4, 1.6, 1.0], [8.3, -2.2, 1.2], [7.0, 4.2, 0.85]]) {
        trunks.push({ x, y: BANK_Y + 0.35 * s, z, sx: s, sy: s, sz: s });
        cones.push({ x, y: BANK_Y + 1.4 * s, z, sx: 0.9 * s, sy: s, sz: 0.9 * s });
        cones.push({ x, y: BANK_Y + 2.3 * s, z, sx: 0.65 * s, sy: 0.8 * s, sz: 0.65 * s });
        tips.push({ x, y: BANK_Y + 2.85 * s, z, sx: 0.32 * s, sy: 0.2 * s, sz: 0.32 * s });
      }
      const coneMesh = instanced(G.cone, M.pine, cones);
      Toon.addOutlines(coneMesh);
      scene.add(instanced(G.trunk, M.trunk, trunks), coneMesh, instanced(G.ball, M.snowcap, tips));
    }

    // ripples drifting down the river, and a few small ice floes
    const RIPPLES = 26;
    const rippleMesh = new THREE.InstancedMesh(G.disc, M.ripple, RIPPLES);
    rippleMesh.frustumCulled = false;
    scene.add(rippleMesh);
    const ripples = Array.from({ length: RIPPLES }, (_, i) => ({ s: 1.4 + (i / RIPPLES) * 30, side: rand(-0.7, 0.7), ph: rand(0, TAU), len: rand(0.14, 0.3) }));
    const floes = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(G.ball, M.floe);
      m.scale.set(rand(0.22, 0.34), 0.05, rand(0.18, 0.28));
      Toon.addOutlines(m);
      scene.add(m);
      return { m, s: 6 + i * 7, side: rand(-0.5, 0.5), spin: rand(-0.3, 0.3) };
    });

    // gently falling snow
    const FLAKES = 150;
    const flakeMesh = new THREE.InstancedMesh(G.bit, M.flake, FLAKES);
    flakeMesh.frustumCulled = false;
    scene.add(flakeMesh);
    const flakes = Array.from({ length: FLAKES }, () => ({ x: rand(-12, 12), y: rand(0, 10), z: rand(-12, 7), sp: rand(0.35, 0.8), ph: rand(0, TAU), s: rand(0.025, 0.06) }));
    let snowing = true;
    let calm = false;

    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const q0 = new THREE.Quaternion();
    const qTmp = new THREE.Quaternion();
    const eTmp = new THREE.Euler();

    /* -------------------------------------------------------- the pieces */
    const board = new THREE.Group();
    scene.add(board);
    const BARKS = ['#91603a', '#a06a3e', '#86593a', '#a87244', '#7d5234', '#9a6a45'];

    function makeLog(len, rnd) {
      const L = len - 0.12;
      const r = R * (0.93 + rnd() * 0.08);
      const group = new THREE.Group();
      const lie = new THREE.Group();
      group.add(lie);
      const bark = Toon.toon(BARKS[Math.floor(rnd() * BARKS.length)], '#5a361d');
      bark.map = barkTex;
      const body = new THREE.Mesh(G.log, bark);
      body.rotation.z = Math.PI / 2;           // lying along x inside `lie`
      body.rotation.x = rnd() * TAU;
      body.scale.set(r, L, r);
      body.position.y = r;
      lie.add(body);
      for (const side of [-1, 1]) {
        const end = new THREE.Group();
        end.position.set(side * (L / 2 + 0.004), r, 0);
        end.rotation.y = side * Math.PI / 2;
        const face = new THREE.Mesh(G.disc, M.endwood);
        face.scale.setScalar(r * 0.86);
        const ra = new THREE.Mesh(G.ringA, M.ringline);
        ra.scale.setScalar(r * 0.86);
        ra.position.z = 0.004;
        const rb = new THREE.Mesh(G.ringB, M.ringline);
        rb.scale.setScalar(r * 0.86);
        rb.position.z = 0.004;
        const heart = new THREE.Mesh(G.disc, M.heart);
        heart.scale.setScalar(r * 0.12);
        heart.position.set((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04, 0.006);
        end.add(face, ra, rb, heart);
        lie.add(end);
      }
      // a stubby branch on some
      if (rnd() < 0.45) {
        const stub = new THREE.Group();
        const side = rnd() < 0.5 ? -1 : 1;
        stub.position.set((rnd() - 0.5) * (L - 0.6), r * 1.25, side * r * 0.62);
        stub.rotation.x = side * 0.75;
        const stick = new THREE.Mesh(G.stub, bark);
        stick.position.y = 0.1;
        const tip = new THREE.Mesh(G.disc, M.endwood);
        tip.scale.setScalar(0.06);
        tip.rotation.x = -Math.PI / 2;
        tip.position.y = 0.232;
        stub.add(stick, tip);
        lie.add(stub);
      }
      const shadow = new THREE.Mesh(G.disc, M.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(L / 2 + 0.1, r * 1.05, 1);
      shadow.position.y = 0.006;
      lie.add(shadow);
      Toon.addOutlines(group);
      const hull = body.children.find((c) => c.userData.outline);
      return { group, lie, pick: [body], glowMat: hull.material, tint: bark, height: r * 2 };
    }

    // the boat's outline seen from above: bow pointing to +x
    function hullShape(inset) {
      const s = new THREE.Shape();
      const L = 0.93 - inset;
      const W = 0.37 - inset;
      s.moveTo(-L + 0.26, -W);
      s.lineTo(L * 0.3, -W);
      s.quadraticCurveTo(L * 0.86, -W * 0.92, L, 0);
      s.quadraticCurveTo(L * 0.86, W * 0.92, L * 0.3, W);
      s.lineTo(-L + 0.26, W);
      s.quadraticCurveTo(-L, W, -L, 0);
      s.quadraticCurveTo(-L, -W, -L + 0.26, -W);
      return s;
    }
    const boatGeo = (() => {
      const outer = hullShape(0);
      outer.holes.push(hullShape(0.075));
      const hull = new THREE.ExtrudeGeometry(outer, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
      hull.rotateX(-Math.PI / 2);
      hull.translate(0, 0.03, 0);
      const trimShape = hullShape(-0.012);
      trimShape.holes.push(hullShape(0.06));
      const trim = new THREE.ExtrudeGeometry(trimShape, { depth: 0.06, bevelEnabled: false, curveSegments: 10 });
      trim.rotateX(-Math.PI / 2);
      trim.translate(0, 0.27, 0);
      const deck = new THREE.ExtrudeGeometry(hullShape(0.07), { depth: 0.03, bevelEnabled: false, curveSegments: 10 });
      deck.rotateX(-Math.PI / 2);
      deck.translate(0, 0.08, 0);
      return { hull, trim, deck };
    })();
    [boatGeo.hull, boatGeo.trim, boatGeo.deck].forEach((g) => KEEP.add(g));

    function makeBoat() {
      const group = new THREE.Group();
      const lie = new THREE.Group();
      group.add(lie);
      const hullMat = Toon.toon('#ef5a3c', '#a83420');
      const hull = new THREE.Mesh(boatGeo.hull, hullMat);
      const trim = new THREE.Mesh(boatGeo.trim, M.trim);
      const deck = new THREE.Mesh(boatGeo.deck, M.deck);
      const bench = new THREE.Mesh(G.ball, M.deck);
      bench.scale.set(0.09, 0.035, 0.31);
      bench.position.set(-0.38, 0.2, 0);
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 18), M.rope);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(0.55, 0.13, 0);
      lie.add(hull, trim, deck, bench, rope);
      // a little green pennant on a pole at the stern
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 8), M.pole);
      pole.position.set(-0.74, 0.5, 0);
      const flag = new THREE.Group();
      flag.position.set(-0.74, 0.74, 0);
      const cloth = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 3), M.flag);
      cloth.rotation.z = Math.PI / 2;
      cloth.scale.set(1, 1, 0.3);
      cloth.position.x = -0.13;
      flag.add(cloth);
      lie.add(pole, flag);
      const seat = new THREE.Group();
      seat.position.set(0.02, 0.1, 0);
      lie.add(seat);
      const shadow = new THREE.Mesh(G.disc, M.shadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(1.0, 0.42, 1);
      shadow.position.y = 0.006;
      lie.add(shadow);
      Toon.addOutlines(group);
      const hullLine = hull.children.find((c) => c.userData.outline);
      return { group, lie, pick: [hull, deck], glowMat: hullLine.material, tint: hullMat, height: 0.6, seat, flag, shadow };
    }

    let pieces = [];
    let boat = null;
    let sail = null;                       // the boat's trip down the river
    const bits = [];
    const rings = [];

    const centre = (pc, v) => {
      const c = v + pc.len / 2;
      return pc.across ? new THREE.Vector3(c - HALF, 0, pc.line + 0.5 - HALF) : new THREE.Vector3(pc.line + 0.5 - HALF, 0, c - HALF);
    };

    const W = { renderer, scene, camera };

    /* A new board for state s. The seed keeps each level's logs looking the
     * same every time. */
    W.build = (s, seed) => {
      pieces.forEach((pc) => {
        board.remove(pc.group);
        Toon.dispose(pc.group, KEEP);
      });
      const rnd = seeded(seed);
      pieces = s.pieces.map((p, i) => {
        const look = i === 0 ? makeBoat() : makeLog(p.len, rnd);
        if (!p.across) look.lie.rotation.y = Math.PI / 2;
        look.group.traverse((o) => { o.userData.piece = i; });
        board.add(look.group);
        return Object.assign(look, { len: p.len, across: p.across, line: p.line, shown: s.pos[i], from: s.pos[i], to: s.pos[i], at: 0, dur: 0, dragging: false, bumpAt: -9, bumpSign: 0 });
      });
      boat = pieces[0];
      sail = null;
      selected = -1;
      hinted = null;
      pieces.forEach((pc) => { pc.group.position.copy(centre(pc, pc.shown)); });
      chevrons.forEach((c) => { c.visible = false; });
      arrow.visible = false;
    };
    W.seat = () => boat.seat;

    /* Move the pieces to `pos`: at once, or sliding there from wherever they
     * are drawn now. Returns how long the longest slide takes. */
    W.place = (pos, now, t) => {
      let longest = 0;
      pieces.forEach((pc, i) => {
        const target = pos[i];
        if (now) {
          Object.assign(pc, { shown: target, from: target, to: target, dur: 0, dragging: false });
          return;
        }
        if (!pc.dragging && pc.to === target) return;
        const d = Math.abs(target - pc.shown);
        pc.from = pc.shown;
        pc.to = target;
        pc.at = t;
        pc.dur = d < 0.01 ? 0 : Math.min(0.36, 0.06 + 0.075 * d);
        pc.dragging = false;
        longest = Math.max(longest, pc.dur);
      });
      return longest;
    };
    // follow the pointer while a log is dragged (v: its left or top end, in squares)
    W.drag = (i, v) => {
      const pc = pieces[i];
      Object.assign(pc, { dragging: true, shown: v, from: v, to: v });
    };
    W.shownAt = (i) => pieces[i].shown;
    W.bump = (i, sign, t) => {
      pieces[i].bumpAt = t;
      pieces[i].bumpSign = sign;
    };
    // the middle of piece i's leading end, for a little spray of ice when it knocks into something
    W.endPoint = (i, sign) => {
      const pc = pieces[i];
      const c = centre(pc, pc.to);
      const off = (pc.len / 2) * sign;
      if (pc.across) c.x += off;
      else c.z += off;
      c.y = 0.25;
      return c;
    };
    W.piecePos = (i) => {
      const p = pieces[i].group.position.clone();
      p.y += pieces[i].height;
      return p;
    };

    /* ---------------------------------------------- selection and hints */
    let selected = -1;
    let hinted = null;
    const chevrons = [0, 1].map(() => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(G.chevron, M.glow));     // a dart pointing along +x
      Toon.addOutlines(g);
      g.visible = false;
      scene.add(g);
      return g;
    });
    const arrow = new THREE.Group();
    {
      const head = new THREE.Mesh(G.arrowHead, M.arrow);
      head.position.y = 0.17;
      const tail = new THREE.Mesh(G.arrowTail, M.arrow);
      tail.position.y = -0.12;
      const tilt = new THREE.Group();
      tilt.rotation.x = Math.PI / 2;
      tilt.add(head, tail);
      arrow.add(tilt);
      Toon.addOutlines(arrow);
      arrow.visible = false;
      scene.add(arrow);
    }
    // which way a piece may slide right now: [back, fwd] booleans
    W.select = (i, ways) => {
      selected = i;
      W.ways = ways || [false, false];
    };
    W.ways = [false, false];
    W.hint = (h) => {
      hinted = h;
      arrow.visible = !!h;
    };

    /* ------------------------------------------------------- the camera */
    let insets = { top: 0, bottom: 0, left: 0, right: 0 };
    W.resize = (free) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (free) insets = free;
      renderer.setSize(w, h, false);
      frameView(camera, w, h, insets);
    };
    W.render = () => renderer.render(scene, camera);
    W.calm = (on) => {
      calm = on;
      snowing = !on;
      flakeMesh.visible = !on;
    };

    /* ---------------------------------------------------- pointer helpers */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
    function cast(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    }
    // the piece under the pointer, or -1
    W.pieceAt = (clientX, clientY) => {
      cast(clientX, clientY);
      const meshes = [];
      pieces.forEach((pc) => meshes.push(...pc.pick));
      const hit = ray.intersectObjects(meshes, false)[0];
      return hit ? hit.object.userData.piece : -1;
    };
    // the point at log height under the pointer (for dragging), or null
    W.dragPoint = (clientX, clientY) => {
      cast(clientX, clientY);
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(dragPlane, hit) ? hit : null;
    };
    // the square under the pointer, as { x, y }, or null off the board
    W.cellAt = (clientX, clientY) => {
      const p = W.dragPoint(clientX, clientY);
      if (!p) return null;
      const x = Math.floor(p.x + HALF);
      const y = Math.floor(p.z + HALF);
      return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
    };
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    // where a square's middle is on screen (for tests and taps)
    W.cellScreen = (x, y) => W.toScreen(new THREE.Vector3(x + 0.5 - HALF, R, y + 0.5 - HALF));

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 16, mat: () => M.gold, speed: 2.6, up: 2.8, size: 0.05, life: 0.8 },
      chips: { n: 7, mat: () => M.white, speed: 1.6, up: 1.3, size: 0.045, life: 0.35 },
      splash: { n: 26, mat: (i) => (i % 3 ? M.spray : M.white), speed: 2.6, up: 3.4, size: 0.07, life: 0.75 },
      confetti: { n: 70, mat: (i) => M.confetti[i % M.confetti.length], speed: 6.5, up: 5.5, size: 0.07, life: 1.9 },
    };
    W.burst = (pos, kind) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        scene.add(m);
        bits.push({ m, v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed), life: b.life, max: b.life, size: b.size });
      }
    };
    W.ripple = (pos) => {
      const m = new THREE.Mesh(G.ripple, Toon.flat('#ffffff', 0.85));
      m.rotation.x = -Math.PI / 2;
      m.position.set(pos.x, WATER_Y + 0.01, pos.z);
      scene.add(m);
      rings.push({ m, life: 1.1, max: 1.1 });
    };

    /* The boat sails out of the gap and away down the river. Returns the
     * time until it splashes into open water. */
    W.sail = (t) => {
      sail = { at: t, splashed: false };
      selected = -1;
      hinted = null;
      arrow.visible = false;
      return 0.5;
    };
    W.splashed = () => !!(sail && sail.splashed);

    let splashCb = null;
    W.onSplash = (fn) => { splashCb = fn; };

    function updateSail(t) {
      const k = t - sail.at;
      // gentle start, then away at a steady pace
      const s = calm ? 2.4 * k : 2.0 * k + 0.35 * k * k;
      const { p, t: tan } = riverAt(s);
      const pc = boat;
      pc.group.position.set(p.x, 0, p.z);
      pc.lie.rotation.y = Math.atan2(-tan.z, tan.x);
      const drop = smooth(clamp((s - 1.05) / 0.35, 0, 1));
      let y = WATER_Y * drop - 0.04 * drop;
      if (!calm && drop > 0) {
        y += 0.035 * Math.sin(t * 5.5) * drop;
        pc.lie.rotation.x = 0.07 * Math.sin(t * 3.7) * drop;
      }
      pc.group.position.y = y;
      pc.shadow.visible = drop < 0.5;
      if (!sail.splashed && s > 1.2) {
        sail.splashed = true;
        const at = new THREE.Vector3(p.x, WATER_Y + 0.05, p.z);
        W.burst(at, 'splash');
        W.ripple(at);
        if (splashCb) splashCb(at);
      }
      // little wake ripples behind it
      if (!calm && sail.splashed && Math.floor(k * 4) !== sail.wake && s < 26) {
        sail.wake = Math.floor(k * 4);
        W.ripple(new THREE.Vector3(p.x - tan.x * 0.9, 0, p.z - tan.z * 0.9));
      }
      pc.group.visible = s < riverLen - 1;
    }

    W.update = (t, dt) => {
      // pieces slide, bump and wobble into place
      pieces.forEach((pc, i) => {
        if (i === 0 && sail) return;
        if (!pc.dragging && pc.dur > 0) {
          const k = clamp((t - pc.at) / pc.dur, 0, 1);
          pc.shown = pc.from + (pc.to - pc.from) * easeOut(k);
          if (k >= 1) {
            pc.shown = pc.to;
            pc.dur = 0;
          }
        }
        const pos = centre(pc, pc.shown);
        const b = t - pc.bumpAt;
        if (b < 0.22) {
          const off = 0.11 * Math.sin((Math.PI * b) / 0.22) * pc.bumpSign;
          if (pc.across) pos.x += off;
          else pos.z += off;
        }
        pc.group.position.copy(pos);
      });
      if (sail) updateSail(t);
      if (boat && !calm) boat.flag.rotation.y = 0.25 * Math.sin(t * 4.2);

      // the selected piece glows; the hinted one glows aqua and pulses
      const pulse = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 6);
      pieces.forEach((pc, i) => {
        const u = pc.glowMat.uniforms;
        const isHint = hinted && hinted.piece === i;
        if (isHint) {
          u.color.value.copy(C.hint);
          u.thickness.value = 0.04 + 0.025 * pulse;
          pc.tint.emissive.copy(C.hintGlow);
        } else if (i === selected) {
          u.color.value.copy(C.sel);
          u.thickness.value = 0.05;
          pc.tint.emissive.copy(C.selGlow);
        } else {
          u.color.value.copy(i === 0 ? C.boat : C.log);
          u.thickness.value = 0.024;
          pc.tint.emissive.copy(C.none);
        }
      });
      // chevrons at the selected piece's ends show which ways it can go
      chevrons.forEach((c, k) => {
        const pc = pieces[selected];
        const on = !!pc && !sail && W.ways[k];
        c.visible = on;
        if (!on) return;
        const sign = k ? 1 : -1;
        const p = centre(pc, pc.shown);
        const reach = pc.len / 2 + 0.2 + (calm ? 0 : 0.05 * Math.sin(t * 6));
        if (pc.across) p.x += sign * reach;
        else p.z += sign * reach;
        c.position.set(p.x, 0.03, p.z);
        c.rotation.y = pc.across ? (sign > 0 ? 0 : Math.PI) : (sign > 0 ? -Math.PI / 2 : Math.PI / 2);
        c.scale.setScalar(0.9);
      });
      if (hinted && pieces[hinted.piece]) {
        const pc = pieces[hinted.piece];
        const sign = hinted.dir === 'left' || hinted.dir === 'up' ? -1 : 1;
        const p = centre(pc, pc.shown);
        const reach = pc.len / 2 + 0.45 + (calm ? 0 : 0.1 * Math.sin(t * 6));
        if (pc.across) p.x += sign * reach;
        else p.z += sign * reach;
        arrow.position.set(p.x, 0.62, p.z);
        const d = pc.across ? [sign, 0] : [0, sign];
        arrow.rotation.y = Math.atan2(d[0], d[1]);
      }

      // the river flows
      ripples.forEach((rp, i) => {
        if (!calm) rp.s += dt * 0.9;
        if (rp.s > 34) rp.s -= 32.6;
        const { p, t: tan } = riverAt(rp.s);
        const hw = riverWidth(rp.s);
        const life = Math.sin(((rp.s - 1.4) / 2.2 + rp.ph) % Math.PI);
        v3.set(p.x + tan.z * rp.side * hw, WATER_Y + 0.006, p.z - tan.x * rp.side * hw);
        eTmp.set(-Math.PI / 2, 0, Math.atan2(-tan.z, tan.x));
        qTmp.setFromEuler(eTmp);
        const k = Math.max(0.05, Math.abs(life));
        s3.set(rp.len * k * (0.6 + 0.4 * hw), 0.035 * k, 1);
        rippleMesh.setMatrixAt(i, m4.compose(v3, qTmp, s3));
      });
      rippleMesh.instanceMatrix.needsUpdate = true;
      floes.forEach((f) => {
        if (!calm) f.s += dt * 0.5;
        if (f.s > 30) f.s = 4;
        const { p, t: tan } = riverAt(f.s);
        f.m.position.set(p.x + tan.z * f.side, WATER_Y + 0.01, p.z - tan.x * f.side);
        f.m.rotation.y += calm ? 0 : f.spin * dt;
      });

      if (snowing) {
        flakes.forEach((f, i) => {
          f.y -= f.sp * dt;
          if (f.y < 0) f.y += 10;
          v3.set(f.x + 0.4 * Math.sin(t * 0.7 + f.ph), f.y, f.z);
          s3.setScalar(f.s);
          flakeMesh.setMatrixAt(i, m4.compose(v3, q0, s3));
        });
        flakeMesh.instanceMatrix.needsUpdate = true;
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
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.life -= dt;
        if (r.life <= 0) {
          scene.remove(r.m);
          r.m.material.dispose();
          rings.splice(i, 1);
          continue;
        }
        const k = 1 - r.life / r.max;
        r.m.scale.setScalar(0.25 + k * 0.9);
        r.m.material.opacity = 0.85 * (1 - k);
      }
    };

    return W;
  }

  window.World = { create, R, frameView, BOARD_PTS };
})();
