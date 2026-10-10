/* Projectile Range: the 3D world.
 *
 * Owns the renderer, the four worlds (a meadow on Earth, the Moon, Mars and
 * a heavy planet), the range (a lane with a measuring tape whose distance
 * labels stay readable at any zoom), the launcher with its angle arc and
 * launch-speed arrow, the walls, platforms and target, the ball and its
 * trail of dots, the labels after a shot, the cameras and the effects. It
 * draws; game.js decides. Needs THREE and Toon; sets window.World.
 *
 * World units are metres. The ball flies in the plane z = 0 from the
 * launcher's pivot at the origin, at ground level; +x runs down the range
 * and the camera looks from the +z side, a little behind the launcher.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);

  const LANE = 3;               // half the range's width
  const TAPE_Z = 3.9;           // the measuring tape runs along the front edge
  const TAPE_END = 140;
  const DOME = 1.6;             // the launcher's dome: wide enough that a 10° barrel clears the ground
  const DOME_H = 1.05;
  const BARREL = 2.6;           // pivot to muzzle
  const BORE = 0.27;
  const BALL = 0.25;            // the ball's real radius
  const ARC = 3.4;              // radius of the angle arc
  const ARROW_PER = 0.12;       // launch arrow length per m/s
  const MAX_DOTS = 64;

  const THEMES = {
    earth: { sky: '#cfeaff', ground: '#a6dc86', lane: '#c5eca6', edge: '#f4fbec', low: '#b9e3cf', ghost: '#2b2a5e', ghostA: 0.3 },
    moon: { sky: '#1e2348', ground: '#a3a7b8', lane: '#bec1cf', edge: '#e6e8f0', low: '#8f93a8', ghost: '#ffffff', ghostA: 0.45 },
    mars: { sky: '#f1cba8', ground: '#cf8657', lane: '#dfa077', edge: '#f7dcc6', low: '#e2a77f', ghost: '#2b2a5e', ghostA: 0.3 },
    heavy: { sky: '#e4dbf6', ground: '#9e8fd1', lane: '#b7abe3', edge: '#ece8fb', low: '#c7bdf0', ghost: '#2b2a5e', ghostA: 0.3 },
  };

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
    scene.background = new THREE.Color(THEMES.earth.sky);
    scene.fog = new THREE.Fog(THEMES.earth.sky, 200, 700);
    const hemi = new THREE.HemisphereLight('#ffffff', THEMES.earth.low, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(-30, 60, 45);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);

    const M = {
      ground: Toon.toon(THEMES.earth.ground),
      lane: Toon.toon(THEMES.earth.lane),
      edge: Toon.flat(THEMES.earth.edge),
      tape: Toon.flat('#ffffff'),
      tick: Toon.flat('#2b2a5e'),
      dome: Toon.toon('#86dcc5', '#4fae99'),
      band: Toon.toon('#ffffff', '#c9d6d2'),
      rivet: Toon.toon('#ffe08a', '#d9b44a'),
      barrel: Toon.toon('#ff9a7a', '#d9664a'),
      stripe: Toon.toon('#ffffff', '#e3cfc6'),
      bore: Toon.flat('#5a2a1c'),
      arcGuide: Toon.flat('#ffffff', 0.55),
      arc: Toon.flat('#15803d'),
      arrow: Toon.toon('#f59e0b', '#c2770a'),
      ball: Toon.toon('#ffd23f', '#d9a400'),
      ballStripe: Toon.toon('#ff6b57'),
      dot: Toon.flat('#ff5a45'),
      ghost: Toon.flat(THEMES.earth.ghost, THEMES.earth.ghostA),
      wall: Toon.toon('#e8d3b6', '#b89f80'),
      wallCap: Toon.toon('#c9ad89', '#a68c6c'),
      plat: Toon.toon('#a9dcf2', '#6fa9c7'),
      platTop: Toon.toon('#7cc4e4', '#5a9fc0'),
      ringA: Toon.flat('#ef4444'),
      ringB: Toon.flat('#ffffff'),
      ringC: Toon.flat('#ffd23f'),
      pole: Toon.toon('#ffffff', '#c9c4dd'),
      flag: Toon.toon('#ef4444', '#b91c1c'),
      gap: Toon.flat('#f59e0b'),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      dust: Toon.flat('#efe3cf'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      ball: new THREE.SphereGeometry(1, 24, 16),
      dot: new THREE.SphereGeometry(1, 10, 8),
      bit: new THREE.SphereGeometry(1, 8, 6),
      box: new THREE.BoxGeometry(1, 1, 1),
      cone: new THREE.ConeGeometry(1, 1, 16),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
      label: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),      // anchored at its bottom middle
      labelMid: new THREE.PlaneGeometry(1, 1),
    };

    /* ------------------------------------------------------------ ground */
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 72), M.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    scene.add(ground);
    const laneLen = TAPE_END + 26;
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(laneLen, LANE * 2), M.lane);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(laneLen / 2 - 10, -0.01, 0);
    scene.add(lane);
    for (const z of [-LANE, LANE]) {
      const edge = new THREE.Mesh(G.box, M.edge);
      edge.scale.set(laneLen, 0.02, 0.12);
      edge.position.set(laneLen / 2 - 10, 0, z);
      scene.add(edge);
    }
    // the measuring tape: a white strip, a tick every metre, a longer one every 5 m
    const tape = new THREE.Mesh(G.box, M.tape);
    tape.scale.set(TAPE_END + 0.4, 0.02, 0.22);
    tape.position.set(TAPE_END / 2, 0.005, TAPE_Z);
    scene.add(tape);
    const minor = [];
    const major = [];
    for (let x = 0; x <= TAPE_END; x++) {
      if (x % 5) minor.push({ x, y: 0.02, z: TAPE_Z - 0.1, sx: 0.05, sy: 0.02, sz: 0.36 });
      else major.push({ x, y: 0.025, z: TAPE_Z - 0.05, sx: 0.12, sy: 0.03, sz: 0.66 });
    }
    const minorTicks = instanced(G.box, M.tick, minor);
    scene.add(minorTicks, instanced(G.box, M.tick, major));

    /* ----------------------------------------------------------- labels */
    // text painted in Fredoka on a canvas, always facing the camera and kept at a set size on screen
    const labels = [];
    let labelPx = 14;
    function makeLabel(w, opts) {
      const o = Object.assign({ h: 64, scale: 1, anchor: 'bottom', bg: '#ffffff', fg: '#2b2a5e' }, opts);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = o.h;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(o.anchor === 'middle' ? G.labelMid : G.label, mat);
      mesh.renderOrder = 30;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const L = { mesh, ctx: cv.getContext('2d'), tex, w, o, text: '', bg: o.bg, fg: o.fg, pill: 1 };
      L.set = (text, bg, fg) => {
        L.text = text;
        L.bg = bg || o.bg;
        L.fg = fg || o.fg;
        paint(L);
        mesh.visible = !!text;
      };
      labels.push(L);
      return L;
    }
    function paint(L) {
      const x = L.ctx;
      const h = L.o.h;
      x.clearRect(0, 0, L.w, h);
      L.tex.needsUpdate = true;
      if (!L.text) return;
      const size = Math.round(h * 0.56);
      x.font = `700 ${size}px ${FONT}`;
      const tw = Math.min(x.measureText(L.text).width, L.w - h * 0.62);
      const pw = tw + h * 0.6;
      x.fillStyle = L.bg;
      roundRect(x, (L.w - pw) / 2, 4, pw, h - 8, (h - 8) / 2);
      x.fill();
      x.fillStyle = L.fg;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(L.text, L.w / 2, h / 2 + size * 0.05, L.w - h * 0.62);
      L.pill = pw / h;
    }

    const tapeLabels = [];
    for (let x = 0; x <= TAPE_END; x += 5) {
      const L = makeLabel(192, { anchor: 'middle' });
      L.mesh.position.set(x, 0.05, TAPE_Z + 0.9);
      L.metres = x;
      L.set(`${x} m`);
      tapeLabels.push(L);
    }
    let tapeStride = 1;

    /* --------------------------------------------------------- launcher */
    const launcher = new THREE.Group();
    scene.add(launcher);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 18, 0, TAU, 0, Math.PI / 2), M.dome);
    dome.scale.set(DOME, DOME_H, DOME);
    launcher.add(dome);
    const band = new THREE.Mesh(new THREE.TorusGeometry(DOME, 0.09, 10, 48), M.band);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.04;
    launcher.add(band);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3;
      const rivet = new THREE.Mesh(G.ball, M.rivet);
      rivet.scale.setScalar(0.07);
      rivet.position.set(Math.cos(a) * DOME * 0.86, DOME_H * 0.5, Math.sin(a) * DOME * 0.86);
      launcher.add(rivet);
    }
    const barrel = new THREE.Group();                 // turns about z: +x tips up by the angle
    launcher.add(barrel);
    const kick = new THREE.Group();                   // slides back along the barrel for the recoil
    barrel.add(kick);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(BORE + 0.05, BORE + 0.11, BARREL, 28), M.barrel);
    tube.rotation.z = -Math.PI / 2;
    tube.position.x = BARREL / 2;
    kick.add(tube);
    for (const x of [BARREL * 0.62, BARREL * 0.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(BORE + 0.08, 0.045, 8, 28), M.stripe);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      kick.add(ring);
    }
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(BORE + 0.06, 0.08, 10, 28), M.stripe);
    muzzle.rotation.y = Math.PI / 2;
    muzzle.position.x = BARREL;
    kick.add(muzzle);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(BORE, 24), M.bore);
    bore.rotation.y = Math.PI / 2;
    bore.position.x = BARREL + 0.005;
    kick.add(bore);
    Toon.addOutlines(launcher);

    // the angle: a faint quarter circle, the arc from the ground up to the barrel, and a label
    const guide = new THREE.Mesh(new THREE.TorusGeometry(ARC, 0.03, 6, 48, Math.PI / 2), M.arcGuide);
    scene.add(guide);
    const baseLine = new THREE.Mesh(G.box, M.arcGuide);
    baseLine.scale.set(ARC + 0.6, 0.05, 0.05);
    baseLine.position.set((ARC + 0.6) / 2, 0.03, 0);
    scene.add(baseLine);
    let arcMesh = null;
    let arcFor = null;
    const angleLabel = makeLabel(256, { anchor: 'middle', bg: '#15803d', fg: '#ffffff' });
    // the launch velocity: an arrow from the muzzle, longer for more speed
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(G.cyl, M.arrow);
    shaft.rotation.z = -Math.PI / 2;
    const head = new THREE.Mesh(G.cone, M.arrow);
    head.rotation.z = -Math.PI / 2;
    head.scale.set(0.24, 0.5, 0.24);
    arrow.add(shaft, head);
    scene.add(arrow);
    const speedLabel = makeLabel(320, { anchor: 'middle', bg: '#f59e0b', fg: '#2b2a5e' });
    let aimShown = true;

    /* ------------------------------------------------- the ball and trail */
    const ball = new THREE.Group();
    const ballBody = new THREE.Mesh(G.ball, M.ball);
    const ballStripe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 8, 32), M.ballStripe);
    ballStripe.scale.set(1.01, 1.01, 1.01);
    ball.add(ballBody, ballStripe);
    Toon.addOutlines(ball);
    ball.visible = false;
    scene.add(ball);
    let ballR = BALL;
    let spin = 0;
    const settle = { on: false };

    const trail = new THREE.InstancedMesh(G.dot, M.dot, MAX_DOTS);
    trail.count = 0;
    trail.frustumCulled = false;
    const ghost = new THREE.InstancedMesh(G.dot, M.ghost, MAX_DOTS);
    ghost.count = 0;
    ghost.frustumCulled = false;
    scene.add(trail, ghost);
    let dots = [];
    let ghostDots = [];
    let dotR = 0.1;

    /* ------------------------------------------- the level: target, blocks */
    const course = new THREE.Group();
    scene.add(course);
    const targetLabel = makeLabel(256, { bg: '#ef4444', fg: '#ffffff' });
    const blockLabels = [makeLabel(256), makeLabel(256)];
    let target = null;
    let level = null;

    /* -------------------------------------------------------- shot labels */
    const landLabel = makeLabel(512, { scale: 1.1 });
    const apexLabel = makeLabel(320, { scale: 1.05, bg: '#2b2a5e', fg: '#ffffff' });
    const gapStrip = new THREE.Mesh(G.box, M.gap);
    gapStrip.visible = false;
    scene.add(gapStrip);

    /* ------------------------------------------------------------ worlds */
    const sceneries = {};
    function buildScenery(id) {
      const g = new THREE.Group();
      const sky = (c, o) => {
        const m = Toon.flat(c, o);
        m.fog = false;
        return m;
      };
      const behind = () => {
        // somewhere well behind the range or off to the sides, never between the camera and the range
        for (;;) {
          const x = rand(-160, 280);
          const z = rand(-180, -24);
          if (x < -40 || z < -34 || x > TAPE_END + 40) return { x, z };
        }
      };
      if (id === 'earth') {
        const trunks = [];
        const leaves = [[], []];
        for (let i = 0; i < 55; i++) {
          const { x, z } = behind();
          const s = rand(1.3, 2.4);
          trunks.push({ x, y: 1.1 * s, z, sx: 0.32 * s, sy: 2.2 * s, sz: 0.32 * s });
          leaves[i % 2].push({ x, y: 3.4 * s, z, sx: 2 * s, sy: 2.3 * s, sz: 2 * s });
        }
        const trunkM = Toon.toon('#b9825a');
        const leafM = [Toon.toon('#6cc070', '#4f9a52'), Toon.toon('#8fd47a', '#5fae5a')];
        const leafMeshes = leaves.map((l, k) => instanced(G.ball, leafM[k], l));
        leafMeshes.forEach((m) => Toon.addOutlines(m));
        g.add(instanced(G.cyl, trunkM, trunks), ...leafMeshes);
        const hills = [];
        for (let i = 0; i < 9; i++) hills.push({ x: rand(-300, 450), y: -30, z: rand(-620, -420), sx: rand(160, 260), sy: rand(70, 120), sz: rand(80, 140) });
        g.add(instanced(G.ball, Toon.toon('#93d07e'), hills));
        const puffs = [];
        for (let i = 0; i < 12; i++) {
          const cx = rand(-250, 400);
          const cy = rand(45, 95);
          const cz = rand(-760, -620);
          for (let k = 0; k < 4; k++) puffs.push({ x: cx + k * 14 - 21, y: cy + (k % 2) * 5, z: cz, sx: 15 - Math.abs(k - 1.5) * 3, sy: 10, sz: 10 });
        }
        g.add(instanced(G.ball, sky('#ffffff', 0.92), puffs));
      } else if (id === 'moon') {
        const rims = [];
        const pits = [];
        for (let i = 0; i < 40; i++) {
          const { x, z } = behind();
          const r = rand(2, 7);
          rims.push({ x, y: 0.05, z, sx: r, sy: r, sz: 0.5, rx: Math.PI / 2 });
          pits.push({ x, y: 0.02, z, sx: r, sy: 0.02, sz: r });
        }
        g.add(instanced(new THREE.TorusGeometry(1, 0.18, 6, 24), Toon.toon('#b8bccb', '#8f93a8'), rims));
        g.add(instanced(G.cyl, Toon.toon('#8e92a4'), pits));
        const rocks = [];
        for (let i = 0; i < 40; i++) {
          const { x, z } = behind();
          const s = rand(0.6, 2.2);
          rocks.push({ x, y: 0.2 * s, z, sx: s, sy: 0.6 * s, sz: s * 0.9 });
        }
        const rockMesh = instanced(G.ball, Toon.toon('#9599ab', '#73778b'), rocks);
        Toon.addOutlines(rockMesh);
        g.add(rockMesh);
        // the camera looks a little downwards, so the sky it sees is a band just above the horizon
        const stars = [];
        for (let i = 0; i < 260; i++) {
          const a = rand(-1.25, 1.25);
          const e = rand(0.01, 0.4);
          const r = 1500;
          stars.push({ x: 60 + Math.sin(a) * Math.cos(e) * r, y: Math.sin(e) * r, z: -Math.cos(a) * Math.cos(e) * r, sx: 2.6, sy: 2.6, sz: 2.6 });
        }
        g.add(instanced(G.bit, sky('#ffffff'), stars));
        const earth = new THREE.Mesh(G.ball, sky('#5aa8f0'));
        earth.scale.setScalar(55);
        earth.position.set(-260, 130, -1300);
        const land = new THREE.Mesh(G.ball, sky('#7fd47a'));
        land.scale.set(0.5, 0.35, 0.3);
        land.position.set(-0.3, 0.2, 0.75);
        earth.add(land);
        g.add(earth);
      } else if (id === 'mars') {
        const rocks = [];
        for (let i = 0; i < 70; i++) {
          const { x, z } = behind();
          const s = rand(0.6, 2.6);
          rocks.push({ x, y: 0.25 * s, z, sx: s, sy: 0.7 * s, sz: s * 0.8, ry: rand(0, TAU) });
        }
        const rockMesh = instanced(G.ball, Toon.toon('#b5653c', '#8e4a2a'), rocks);
        Toon.addOutlines(rockMesh);
        g.add(rockMesh);
        const mesas = [];
        for (let i = 0; i < 10; i++) mesas.push({ x: rand(-300, 450), y: rand(15, 30), z: rand(-650, -450), sx: rand(40, 90), sy: rand(30, 60), sz: rand(30, 60) });
        g.add(instanced(G.cyl, Toon.toon('#c2774c'), mesas));
        for (const [x, y, r] of [[-200, 95, 9], [260, 140, 6]]) {
          const moon = new THREE.Mesh(G.ball, sky('#efe2d0'));
          moon.scale.setScalar(r);
          moon.position.set(x, y, -1100);
          g.add(moon);
        }
      } else {
        const crystals = [[], []];
        for (let i = 0; i < 46; i++) {
          const { x, z } = behind();
          for (let k = 0; k < 3; k++) {
            const s = rand(0.8, 2.4);
            crystals[(i + k) % 2].push({ x: x + rand(-1.5, 1.5), y: s, z: z + rand(-1.5, 1.5), sx: 0.45 * s, sy: 2 * s, sz: 0.45 * s, rz: rand(-0.35, 0.35), rx: rand(-0.3, 0.3) });
          }
        }
        crystals.forEach((c, k) => {
          const m = instanced(G.cone, k ? Toon.toon('#f0abfc', '#c26fd0') : Toon.toon('#7dd3fc', '#4aa3cf'), c);
          Toon.addOutlines(m);
          g.add(m);
        });
        const giant = new THREE.Mesh(G.ball, sky('#f6c58f'));
        giant.scale.setScalar(150);
        giant.position.set(300, 70, -1400);
        const stripe = new THREE.Mesh(G.ball, sky('#e9a46a'));
        stripe.scale.set(1.004, 0.18, 1.004);
        stripe.position.y = 0.2;
        giant.add(stripe);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.16, 6, 64), sky('#fbe3c2', 0.9));
        ring.scale.set(1, 1, 0.12);
        ring.rotation.set(1.2, 0.25, 0.3);
        giant.add(ring);
        g.add(giant);
      }
      g.visible = false;
      scene.add(g);
      return g;
    }
    let worldId = null;

    const W = { renderer, scene, camera, actors: new THREE.Group() };
    scene.add(W.actors);

    W.setWorld = (id) => {
      if (id === worldId) return;
      worldId = id;
      const th = THEMES[id];
      scene.background.set(th.sky);
      scene.fog.color.set(th.sky);
      hemi.groundColor.set(th.low);
      M.ground.color.set(th.ground);
      M.lane.color.set(th.lane);
      M.edge.color.set(th.edge);
      M.ghost.color.set(th.ghost);
      M.ghost.opacity = th.ghostA;
      if (!sceneries[id]) sceneries[id] = buildScenery(id);
      Object.keys(sceneries).forEach((k) => { sceneries[k].visible = k === id; });
    };

    /* A level: its walls and platforms, and the target with its flag. */
    W.build = (lv) => {
      level = lv;
      // free this level's own shapes (rings, flag); the shared ones and every material stay
      const shared = new Set(Object.values(G));
      course.traverse((o) => {
        if (o.isMesh && !o.userData.outline && !shared.has(o.geometry)) o.geometry.dispose();
      });
      course.clear();
      bits.splice(0).forEach((p) => scene.remove(p.m));            // no confetti left over from the last level
      blockLabels.forEach((L) => L.set(''));
      lv.blocks.forEach((b, i) => {
        const wide = b.x1 - b.x0;
        const body = new THREE.Mesh(G.box, b.kind === 'wall' ? M.wall : M.plat);
        body.scale.set(wide, b.h, LANE * 2 - 0.4);
        body.position.set(b.x0 + wide / 2, b.h / 2, 0);
        const cap = new THREE.Mesh(G.box, b.kind === 'wall' ? M.wallCap : M.platTop);
        cap.scale.set(wide + 0.12, 0.22, LANE * 2 - 0.25);
        cap.position.set(b.x0 + wide / 2, b.h - 0.1, 0);
        course.add(body, cap);
        if (b.kind === 'wall') {
          // a few bricks drawn on the front
          for (let row = 0; row * 0.9 < b.h - 0.4; row++) {
            const line = new THREE.Mesh(G.box, M.wallCap);
            line.scale.set(wide + 0.02, 0.06, 0.04);
            line.position.set(b.x0 + wide / 2, 0.9 * (row + 1) - 0.2, LANE - 0.19);
            if (0.9 * (row + 1) - 0.2 < b.h - 0.3) course.add(line);
          }
        }
        // a wall's label sits on top of it; a platform's on its front, clear of the target
        const L = blockLabels[i];
        if (b.kind === 'wall') L.mesh.position.set(b.x0 + wide / 2, b.h + 0.25, LANE - 0.5);
        else L.mesh.position.set(b.x0 + wide / 2, b.h * 0.35, LANE);
        L.set(b.kind === 'wall' ? `wall ${b.h} m tall` : `platform ${b.h} m up`);
      });
      // the target: rings flat on its surface, and a flag behind it
      const t = lv.target;
      const y = t.on >= 0 ? lv.blocks[t.on].h : 0;
      target = new THREE.Group();
      target.position.set(t.x, y, 0);
      const rings = [[0.75, 1, M.ringA], [0.5, 0.75, M.ringB], [0.25, 0.5, M.ringA]];
      rings.forEach(([a, b, m], k) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(a * t.w, b * t.w, 48), m);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03 + k * 0.004;
        target.add(ring);
      });
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.25 * t.w, 32), M.ringC);
      eye.rotation.x = -Math.PI / 2;
      eye.position.y = 0.045;
      target.add(eye);
      const pole = new THREE.Mesh(G.cyl, M.pole);
      pole.scale.set(0.06, 3.2, 0.06);
      pole.position.set(0, 1.6, -t.w - 0.6);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 3), M.flag);
      flag.rotation.z = -Math.PI / 2;
      flag.scale.z = 0.15;
      flag.position.set(0.65, 2.75, -t.w - 0.6);
      target.add(pole, flag);
      Toon.addOutlines(target);
      course.add(target);
      targetLabel.mesh.position.set(t.x, y + 3.4, -t.w - 0.6);
      targetLabel.set(`target ${t.x} m`);
      W.clearShot();
      W.newTrail(true);
      cam.user = { x: 0, y: 0, zoom: 1 };
    };

    /* ------------------------------------------------------------ aiming */
    W.aim = (angle, speed) => {
      barrel.rotation.z = angle * DEG;
      if (arcFor !== angle) {
        if (arcMesh) {
          scene.remove(arcMesh);
          arcMesh.geometry.dispose();
        }
        arcMesh = new THREE.Mesh(new THREE.TorusGeometry(ARC, 0.07, 6, 40, angle * DEG), M.arc);
        scene.add(arcMesh);
        arcFor = angle;
      }
      const half = (angle / 2) * DEG;
      angleLabel.mesh.position.set(Math.cos(half) * (ARC + 0.9), Math.sin(half) * (ARC + 0.9), 0);
      angleLabel.set(`${angle.toFixed(1)}°`);
      const len = Math.max(0.5, speed * ARROW_PER);
      const dir = new THREE.Vector3(Math.cos(angle * DEG), Math.sin(angle * DEG), 0);
      arrow.position.copy(dir).multiplyScalar(BARREL + 0.25);
      arrow.rotation.z = angle * DEG;
      shaft.scale.set(0.09, len, 0.09);
      shaft.position.x = len / 2;
      head.position.x = len + 0.22;
      speedLabel.mesh.position.copy(dir).multiplyScalar(BARREL + len + 1.4);
      speedLabel.set(`${speed.toFixed(1)} m/s`);
      W.showAim(aimShown);
    };
    W.showAim = (on) => {
      aimShown = on;
      arrow.visible = on;
      speedLabel.mesh.visible = on && !!speedLabel.text;
      angleLabel.mesh.visible = !!angleLabel.text;
      if (arcMesh) arcMesh.visible = true;
    };
    // launch: a puff at the muzzle and, unless calm, a little recoil
    let recoilAt = -9;
    W.fire = (t, angle, calm) => {
      if (!calm) recoilAt = t;
      const tip = new THREE.Vector3(Math.cos(angle * DEG), Math.sin(angle * DEG), 0).multiplyScalar(BARREL + 0.2);
      W.burst(tip, 'puff');
    };

    /* ------------------------------------------------- the ball and trail */
    W.ball = (x, y, on) => {
      ball.visible = on;
      settle.on = false;
      ball.position.set(x, y, 0);
    };
    W.spin = (s) => { spin = s; };
    /* After the first touch: roll to rest on the surface it landed on, or
     * drop down the face of the wall or platform it hit. Only for looks: the
     * shot's numbers were settled at the moment of impact. */
    W.settle = (t, hit, g) => {
      Object.assign(settle, { on: true, t0: t, x: hit.x, y: hit.y, kind: hit.kind, g });
    };
    W.newTrail = (wipe) => {
      ghostDots = wipe ? [] : dots;
      dots = [];
      setDots(ghost, ghostDots);
      setDots(trail, dots);
    };
    W.dot = (x, y) => {
      if (dots.length >= MAX_DOTS) return;
      dots.push(new THREE.Vector3(x, y, 0));
      setDots(trail, dots);
    };
    const m4 = new THREE.Matrix4();
    const q0 = new THREE.Quaternion();
    const s3 = new THREE.Vector3();
    function setDots(mesh, list) {
      s3.setScalar(dotR);
      list.forEach((p, i) => mesh.setMatrixAt(i, m4.compose(p, q0, s3)));
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }

    /* ------------------------------------------------- after a shot */
    const f1 = (x) => x.toFixed(1);
    const f2 = (x) => x.toFixed(2);
    W.showShot = (r, lv, gapText) => {
      const h = r.hit;
      const t = lv.target;
      if (h.kind === 'side') {
        landLabel.mesh.position.set(h.x - 0.4, h.y + 0.6, 0);
        landLabel.set(`hit at ${f1(h.y)} m up`, '#fff1d6', '#7c2d12');
      } else {
        landLabel.mesh.position.set(h.x, h.y + 0.9, 0);
        if (r.onTarget) landLabel.set(`${f2(h.x)} m · hit!`, '#15803d', '#ffffff');
        else landLabel.set(`${f2(h.x)} m · ${gapText}`, '#fff1d6', '#7c2d12');
      }
      apexLabel.set('');
      // the gap to the target's centre, drawn on the surface both share
      const sameSurface = t.on < 0 ? h.kind === 'ground' : h.kind === 'top' && h.block === t.on;
      if (!r.onTarget && sameSurface && Math.abs(r.miss) > 0.05) {
        const y = t.on < 0 ? 0 : lv.blocks[t.on].h;
        gapStrip.scale.set(Math.abs(r.miss), 0.04, 0.3);
        gapStrip.position.set((h.x + t.x) / 2, y + 0.06, 0);
        gapStrip.visible = true;
      } else {
        gapStrip.visible = false;
      }
    };
    // the top of the arc, labelled once the whole shot is in view (if the ball got that far)
    W.showApex = (r) => {
      if (r.hit.t >= r.apex.t - 1e-9) {
        apexLabel.mesh.position.set(r.apex.x, r.apex.y + 0.6, 0);
        apexLabel.set(`H = ${f2(r.flat.H)} m`);
      } else {
        apexLabel.set('');
      }
    };
    W.clearShot = () => {
      landLabel.set('');
      apexLabel.set('');
      gapStrip.visible = false;
    };
    W.targetPulse = (t) => { pulseAt = t; };
    let pulseAt = -9;

    /* ------------------------------------------------------------ camera */
    const cam = {
      pos: new THREE.Vector3(10, 12, 60),
      look: new THREE.Vector3(10, 5, 0),
      want: { pos: new THREE.Vector3(10, 12, 60), look: new THREE.Vector3(10, 5, 0), dist: 50 },
      mode: 'overview',
      box: null,
      rate: 3,
      user: { x: 0, y: 0, zoom: 1 },
      follow: null,
    };
    let insets = { top: 0, right: 0, bottom: 0, left: 0 };
    const fitCam = new THREE.PerspectiveCamera(34, 1, 0.1, 3000);
    const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    const tmp = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    /* From the look point towards the camera: in front of the range, a
     * little behind the launcher and a little above. On a tall screen it
     * swings round behind the launcher, so the range runs up the screen
     * into the distance instead of across a narrow one. */
    function viewDir() {
      const r = safeRect();
      const a = (camera.aspect * (r.r - r.l)) / (r.t - r.b);       // the shape of the free area
      const tall = clamp((1.5 - a) / 0.8, 0, 1);
      const yaw = lerp(-0.3, -1.1, tall);
      const pitch = lerp(0.14, 0.42, tall);
      return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    }
    function safeRect() {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const l = -1 + (2 * insets.left) / w;
      const r = 1 - (2 * insets.right) / w;
      const b = -1 + (2 * insets.bottom) / h;
      const t = 1 - (2 * insets.top) / h;
      // never let the free area collapse, even on a very short stage
      return { l, r: Math.max(r, l + 0.3), b, t: Math.max(t, b + 0.3) };
    }
    /* Where the camera must be, looking along viewDir, for the box to fill
     * the part of the screen the HUD leaves free. A few rounds of: project
     * the box's corners, then slide and dolly to fit them. With low set,
     * spare height goes above the box (sky for the ball), not below it. */
    function frameBox(b, out, low) {
      fitCam.fov = camera.fov;
      fitCam.aspect = camera.aspect;
      fitCam.updateProjectionMatrix();
      const dir = viewDir();
      const look = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      const safe = safeRect();
      const tanV = Math.tan((fitCam.fov * DEG) / 2);
      const span = Math.max(b.x1 - b.x0, (b.y1 - b.y0) * fitCam.aspect, 1);
      let dist = (span / (2 * tanV * fitCam.aspect)) * 1.6 + 6;
      let k = 0;
      for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) corners[k++].set(x, y, z);
      for (let i = 0; i < 16; i++) {
        fitCam.position.copy(look).addScaledVector(dir, dist);
        fitCam.lookAt(look);
        fitCam.updateMatrixWorld();
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const c of corners) {
          tmp.copy(c).project(fitCam);
          x0 = Math.min(x0, tmp.x);
          x1 = Math.max(x1, tmp.x);
          y0 = Math.min(y0, tmp.y);
          y1 = Math.max(y1, tmp.y);
        }
        // how much too big the box looks; dolly by that (a step at a time)
        const s = clamp(Math.max((x1 - x0) / (safe.r - safe.l), (y1 - y0) / (safe.t - safe.b)), 0.6, 1.6);
        right.setFromMatrixColumn(fitCam.matrixWorld, 0);
        up.setFromMatrixColumn(fitCam.matrixWorld, 1);
        // sliding the view by d (screen units) and then dollying by s takes a point at y to (y − d) / s
        const cx = (x0 + x1) / 2 - (s * (safe.l + safe.r)) / 2;
        const spare = (safe.t - safe.b) - (y1 - y0) / s;
        const cy = low && spare > 0 ? y0 - s * (safe.b + spare * 0.1) : (y0 + y1) / 2 - (s * (safe.b + safe.t)) / 2;
        look.addScaledVector(right, cx * dist * tanV * fitCam.aspect).addScaledVector(up, cy * dist * tanV);
        dist = clamp(dist * s, 4, 2500);
      }
      out.pos.copy(look).addScaledVector(dir, dist);
      out.look.copy(look);
      out.dist = dist;
      return out;
    }
    const withUser = (b) => {
      const u = cam.user;
      const cx = (b.x0 + b.x1) / 2 + u.x;
      const cy = (b.y0 + b.y1) / 2 + u.y;
      const hx = ((b.x1 - b.x0) / 2) * u.zoom;
      const hy = ((b.y1 - b.y0) / 2) * u.zoom;
      return { x0: cx - hx, x1: cx + hx, y0: cy - hy, y1: cy + hy, z0: b.z0, z1: b.z1 };
    };
    // the launcher, the target, the walls and platforms, and room above for a shot
    function overviewBox() {
      const t = level.target;
      let x1 = t.x + t.w + 2;
      let y1 = 7;
      level.blocks.forEach((b) => {
        x1 = Math.max(x1, b.x1 + 2);
        y1 = Math.max(y1, b.h + 3);
      });
      x1 += 2;
      const x0 = -3.2;
      y1 = Math.max(y1, 0.24 * (x1 - x0));
      return { x0, x1, y0: 0, y1, z0: -1, z1: TAPE_Z + 1 };
    }
    const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) });

    W.setInsets = (i, snap) => {
      insets = i;
      W.reframe(snap);
    };
    /* The views. overview: the whole level. follow: keeps the ball and the
     * ground under it in view (calm: the overview, widened only if the ball
     * leaves it). landing: close on where it came down and the target.
     * review: the whole shot, from the launcher to the landing spot. */
    W.view = (mode, arg, snap) => {
      cam.mode = mode;
      if (mode !== 'follow') cam.user = { x: 0, y: 0, zoom: 1 };
      if (mode === 'follow') cam.follow = arg;
      else if (mode === 'landing') {
        const r = arg;
        const t = level.target;
        const ty = t.on >= 0 ? level.blocks[t.on].h : 0;
        cam.box = {
          x0: Math.min(r.hit.x, t.x - t.w) - 5,
          x1: Math.max(r.hit.x, t.x + t.w) + 5,
          y0: 0,
          y1: Math.max(6, ty + 4, r.hit.y + 3),
          z0: -1,
          z1: TAPE_Z + 1,
        };
      } else if (mode === 'review') {
        const r = arg;
        cam.box = union(overviewBox(), { x0: -3, x1: r.hit.x + 3, y0: 0, y1: r.measured.h + 2.5, z0: -1, z1: TAPE_Z + 1 });
      } else {
        cam.box = overviewBox();
      }
      W.reframe(snap);
    };
    W.reframe = (snap) => {
      if (!level) return;
      if (cam.mode === 'follow') return;                 // follow frames itself every frame
      frameBox(withUser(cam.box || overviewBox()), cam.want, true);
      if (snap) {
        cam.pos.copy(cam.want.pos);
        cam.look.copy(cam.want.look);
        placeCamera();
      }
    };
    W.rate = (r) => { cam.rate = r; };
    function followBox(p, calm) {
      if (calm) return union(overviewBox(), { x0: p.x - 4, x1: p.x + 4, y0: 0, y1: p.y + 3, z0: -1, z1: TAPE_Z + 1 });
      const s = Math.max(10, 0.55 * (p.y + 4));
      return { x0: p.x - s, x1: p.x + s * 1.15, y0: 0, y1: Math.max(p.y + 4, 7), z0: -1, z1: TAPE_Z + 1 };
    }
    function placeCamera() {
      camera.position.copy(cam.pos);
      camera.lookAt(cam.look);
      camera.updateMatrixWorld();
    }
    // metres per screen pixel at the look point
    function mpp() {
      const h = canvas.clientHeight || 1;
      return (2 * cam.pos.distanceTo(cam.look) * Math.tan((camera.fov * DEG) / 2)) / h;
    }
    /* Looking around by hand: drag to slide the view, pinch or Ctrl+wheel to zoom. */
    W.pan = (dx, dy) => {
      if (cam.mode === 'follow') return;
      const k = mpp();
      cam.user.x -= dx * k;
      cam.user.y += dy * k;
      cam.user.y = clamp(cam.user.y, -10, 400);
      W.reframe(true);
    };
    W.zoom = (f) => {
      if (cam.mode === 'follow') return;
      cam.user.zoom = clamp(cam.user.zoom * f, 0.15, 4);
      W.reframe(true);
    };
    W.userMoved = () => cam.user.x !== 0 || cam.user.y !== 0 || cam.user.zoom !== 1;

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      labelPx = clamp(0.036 * Math.min(w, h), 12.5, 15.5);
      W.reframe(true);
    };
    W.render = () => renderer.render(scene, camera);
    W.repaint = () => labels.forEach(paint);

    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };

    /* ------------------------------------------------------------ effects */
    const bits = [];
    const BURSTS = {
      puff: { n: 12, mat: () => M.white, speed: 2.6, up: 1.6, size: 0.18, life: 0.5, g: 2 },
      dust: { n: 12, mat: () => M.dust, speed: 3, up: 2.2, size: 0.16, life: 0.55, g: 9 },
      sparkle: { n: 18, mat: () => M.gold, speed: 3.2, up: 3.4, size: 0.1, life: 0.8, g: 9 },
      confetti: { n: 70, mat: (i) => M.confetti[i % M.confetti.length], speed: 9, up: 8, size: 0.14, life: 1.8, g: 9 },
    };
    W.burst = (pos, kind, scale) => {
      const b = BURSTS[kind];
      const k = scale || 1;
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size * k);
        scene.add(m);
        bits.push({
          m,
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed * k, b.up * k * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed * k),
          life: b.life,
          max: b.life,
          size: b.size * k,
          g: b.g * k,
        });
      }
    };

    /* --------------------------------------------------------- each frame */
    const fwd = new THREE.Vector3();
    W.update = (t, dt, calm) => {
      // the camera eases towards where it wants to be
      if (cam.mode === 'follow' && cam.follow) frameBox(followBox(cam.follow(), calm), cam.want, calm);
      const k = 1 - Math.exp(-cam.rate * dt);
      cam.pos.lerp(cam.want.pos, k);
      cam.look.lerp(cam.want.look, k);
      placeCamera();
      // haze in the distance, so the trees and hills sit back behind the ball
      scene.fog.near = cam.want.dist * 0.9 + 30;
      scene.fog.far = cam.want.dist * 3.2 + 280;

      // the ball and dots keep a size you can see, however far away the camera is
      const perPx = mpp();
      ballR = Math.max(BALL, 4.5 * perPx);
      ball.scale.setScalar(ballR);
      const want = Math.max(0.07, 2.4 * perPx);
      if (Math.abs(want - dotR) > dotR * 0.03) {
        dotR = want;
        setDots(trail, dots);
        setDots(ghost, ghostDots);
      }
      if (ball.visible) ballBody.parent.rotation.z -= spin * dt;
      if (settle.on) {
        const e = t - settle.t0;
        if (settle.kind === 'side') {
          // slide down the face it hit, falling as the world's gravity says
          const y = Math.max(ballR, settle.y - 0.5 * settle.g * e * e);
          ball.position.set(settle.x - ballR, y, 0);
        } else {
          const hop = Math.max(0, Math.sin(Math.min(e / 0.35, 1) * Math.PI)) * ballR * 0.8;
          ball.position.set(settle.x, settle.y + ballR + hop, 0);
        }
      }
      // the recoil: back 0.35 m and home again
      const rk = t - recoilAt;
      kick.position.x = rk >= 0 && rk < 0.4 ? -0.35 * Math.sin(Math.min(rk / 0.08, 1) * Math.PI / 2) * (1 - Math.max(0, rk - 0.08) / 0.32) : 0;
      // the target bounces when it is hit
      if (target) {
        const pk = t - pulseAt;
        const s = pk >= 0 && pk < 0.6 ? 1 + 0.18 * Math.sin((pk / 0.6) * Math.PI) : 1;
        target.scale.set(s, 1, s);
      }

      // labels face the camera at a steady size on screen
      camera.getWorldDirection(fwd);
      const hPx = canvas.clientHeight || 1;
      const unit = (2 * Math.tan((camera.fov * DEG) / 2)) / hPx;
      for (const L of labels) {
        if (!L.mesh.visible) continue;
        const depth = Math.max(0.5, tmp.copy(L.mesh.position).sub(camera.position).dot(fwd));
        const hW = ((labelPx * L.o.scale) / 0.56) * unit * depth;
        L.mesh.scale.set((hW * L.w) / L.o.h, hW, 1);
        L.mesh.quaternion.copy(camera.quaternion);
      }
      // tape labels: every 5 m, or every 10, 20, 50 or 100 m when they would crowd each other on screen
      const cw = canvas.clientWidth || 1;
      const scr = tapeLabels.map((L) => {
        tmp.copy(L.mesh.position).project(camera);
        return { x: (tmp.x * cw) / 2, y: (tmp.y * hPx) / 2, on: tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15 };
      });
      const need = (labelPx / 0.56) * tapeLabels[tapeLabels.length - 1].pill + 8;
      tapeStride = [1, 2, 4, 10, 20].find((s) => {
        let prev = null;
        for (let i = 0; i < scr.length; i += s) {
          if (!scr[i].on) continue;
          if (prev && Math.hypot(scr[i].x - prev.x, scr[i].y - prev.y) < need) return false;
          prev = scr[i];
        }
        return true;
      }) || 20;
      for (const L of tapeLabels) L.mesh.visible = (L.metres / 5) % tapeStride === 0;
      const metre = (unit * Math.max(1, cam.pos.distanceTo(cam.look))) || 1;
      minorTicks.visible = 1 / metre > 5;

      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i];
        p.life -= dt;
        if (p.life <= 0) {
          scene.remove(p.m);
          bits.splice(i, 1);
          continue;
        }
        p.v.y -= p.g * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(p.size * Math.sqrt(p.life / p.max));
      }
    };
    W.ballRadius = () => ballR;
    W.mpp = mpp;
    W.LOADER = new THREE.Vector3(-2.6, 0, 2.2);
    return W;
  }

  window.World = { create, BALL, BARREL };
})();
