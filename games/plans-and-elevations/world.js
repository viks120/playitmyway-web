/* Plans & Elevations: the 3D world.
 *
 * Owns the renderer, the desk, the baseplate (squared like exam paper, with
 * FRONT and SIDE marked on its edges and the squares named A1, B1...), the
 * cubes, the keyboard cursor, the ghost cube that shows where a click will
 * build, the eraser preview, hint glows, the orbiting camera (framed into
 * the space the HUD leaves free), picking a square or a cube face from a
 * click, and the effects. It draws; game.js decides. Needs THREE and Toon;
 * sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const SKY = '#e8f2ec';
  const PU = 128;                          // canvas pixels per square on the baseplate
  const MARGIN = { left: 0.4, back: 0.4, right: 1.05, front: 1.05 };
  const PLATE_T = 0.16;                    // baseplate thickness
  const LAYERS = ['#7cc4f2', '#8fdca7', '#ffd27a', '#f6a5b9'];
  const EDGES = ['#3f78a6', '#3f8f5c', '#b7801c', '#b65a74'];
  const PITCH_MIN = 0.12;
  const PITCH_MAX = 1.45;
  const TILTS = [0.26, 0.62, 1.38];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const FONT = 'Fredoka, "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif';

  // a white face with a soft grey border: tinted by each layer's colour it draws the cube edges
  function faceTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#a9b5bf';
    x.lineWidth = 9;
    x.strokeRect(4.5, 4.5, 119, 119);
    x.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    x.lineWidth = 3;
    x.strokeRect(12, 12, 104, 104);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                         // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.add(new THREE.HemisphereLight('#ffffff', '#c3d9cb', 1.55));
    const sun = new THREE.DirectionalLight('#fff6e6', 2.1);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

    const faces = faceTexture();
    const M = {
      layers: LAYERS.map((c, i) => {
        const m = Toon.toon(c);
        m.map = faces;
        return m;
      }),
      hulls: EDGES.map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide })),
      plateSide: Toon.toon('#d9e7de'),
      desk: Toon.flat('#d5e6db'),
      ghost: LAYERS.map((c) => Toon.flat(c, 0.5)),
      ghostEdge: Toon.flat('#15803d'),
      doom: Toon.flat('#ef4444', 0.42),
      cursor: Toon.flat('#2563eb'),
      glow: Toon.flat('#f59e0b', 0.5),
      glowStack: Toon.flat('#fbbf24', 0.32),
      white: Toon.flat('#ffffff'),
      spark: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      cube: new THREE.BoxGeometry(1, 1, 1),
      tile: new THREE.PlaneGeometry(0.9, 0.9),
      frame: new THREE.RingGeometry(0.6, 0.707, 4, 1, Math.PI / 4),
      bit: new THREE.SphereGeometry(1, 8, 6),
    };
    G.tile.rotateX(-Math.PI / 2);
    G.frame.rotateX(-Math.PI / 2);

    const desk = new THREE.Mesh(new THREE.CircleGeometry(60, 64), M.desk);
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -PLATE_T - 0.01;
    scene.add(desk);

    const board = new THREE.Group();       // the baseplate
    scene.add(board);
    const blocks = new THREE.Group();      // the cubes
    scene.add(blocks);
    const marks = new THREE.Group();       // cursor, ghost, eraser preview, hint glows
    scene.add(marks);

    let lv = null;                         // { w, d, top }
    let plateMat = null;
    let plateCanvas = null;
    const cubes = [];                      // per square: list of { mesh, y, born, dying }
    const pickable = [];
    const dying = [];
    const bits = [];
    let frameRect = null;

    // the cursor: a blue square frame on the plate
    const cursor = new THREE.Mesh(G.frame, M.cursor);
    cursor.visible = false;
    marks.add(cursor);
    // the ghost cube: where a click would build, a see-through cube with solid green edges
    const ghost = new THREE.Group();
    const ghostFill = new THREE.Mesh(G.cube, M.ghost[0]);
    ghostFill.scale.setScalar(0.97);
    ghost.add(ghostFill);
    for (let a = 0; a < 3; a++) {
      for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
          const bar = new THREE.Mesh(G.cube, M.ghostEdge);
          const p = [0, 0, 0];
          const sc = [0.06, 0.06, 0.06];
          sc[a] = 1.06;
          p[(a + 1) % 3] = s1 * 0.5;
          p[(a + 2) % 3] = s2 * 0.5;
          bar.scale.set(sc[0], sc[1], sc[2]);
          bar.position.set(p[0], p[1], p[2]);
          ghost.add(bar);
        }
      }
    }
    ghost.visible = false;
    marks.add(ghost);
    // the eraser preview: a red glass box over the cube that would go
    const doom = new THREE.Mesh(G.cube, M.doom);
    doom.scale.setScalar(1.07);
    doom.visible = false;
    marks.add(doom);
    // hint glows
    const glows = new THREE.Group();
    marks.add(glows);
    let glowAt = 0;

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();

    const W = { renderer, scene, camera };
    const cam = { yaw: 0.55, pitch: 0.62, tyaw: 0.55, tpitch: 0.62, dist: 12, cx: 0, cy: 0, snap: true };
    W.DEFAULT_VIEW = { yaw: 0.55, pitch: 0.62 };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    /* ------------------------------------------------------- positions */
    W.squarePos = (x, z, y) => new THREE.Vector3(x - (lv.w - 1) / 2, y == null ? 0 : y, z - (lv.d - 1) / 2);

    /* ------------------------------------------------------- baseplate */
    function paintPlate() {
      const pw = lv.w + MARGIN.left + MARGIN.right;
      const pd = lv.d + MARGIN.back + MARGIN.front;
      const cw = Math.round(pw * PU);
      const ch = Math.round(pd * PU);
      plateCanvas.width = cw;
      plateCanvas.height = ch;
      const x = plateCanvas.getContext('2d');
      // margins, then the squares, seen from above with the front at the bottom
      x.fillStyle = '#f2f8f4';
      x.fillRect(0, 0, cw, ch);
      const gx = MARGIN.left * PU;
      const gy = MARGIN.back * PU;
      x.fillStyle = '#ffffff';
      x.fillRect(gx, gy, lv.w * PU, lv.d * PU);
      x.strokeStyle = '#bcd3c4';
      x.lineWidth = 4;
      for (let i = 1; i < lv.w; i++) {
        x.beginPath();
        x.moveTo(gx + i * PU, gy);
        x.lineTo(gx + i * PU, gy + lv.d * PU);
        x.stroke();
      }
      for (let j = 1; j < lv.d; j++) {
        x.beginPath();
        x.moveTo(gx, gy + j * PU);
        x.lineTo(gx + lv.w * PU, gy + j * PU);
        x.stroke();
      }
      x.strokeStyle = '#6f9a80';
      x.lineWidth = 7;
      x.strokeRect(gx, gy, lv.w * PU, lv.d * PU);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      // column letters along the front, readable from the front
      x.fillStyle = '#4f5d55';
      x.font = `600 ${Math.round(PU * 0.34)}px ${FONT}`;
      for (let i = 0; i < lv.w; i++) x.fillText('ABCDEFGH'[i], gx + (i + 0.5) * PU, gy + lv.d * PU + PU * 0.27);
      // row numbers along the right, readable from the right-hand side
      for (let j = 0; j < lv.d; j++) {
        x.save();
        x.translate(gx + lv.w * PU + PU * 0.27, gy + (j + 0.5) * PU);
        x.rotate(-Math.PI / 2);
        x.fillText(String(lv.d - j), 0, 0);
        x.restore();
      }
      // FRONT and SIDE, with arrows looking in
      x.fillStyle = '#15803d';
      x.font = `700 ${Math.round(PU * 0.36)}px ${FONT}`;
      const fy = gy + lv.d * PU + PU * 0.72;
      const fx = gx + (lv.w * PU) / 2;
      x.fillText('FRONT', fx, fy);
      const tw = x.measureText('FRONT').width;
      arrow(x, fx - tw / 2 - PU * 0.3, fy, -Math.PI / 2);
      arrow(x, fx + tw / 2 + PU * 0.3, fy, -Math.PI / 2);
      x.save();
      x.translate(gx + lv.w * PU + PU * 0.72, gy + (lv.d * PU) / 2);
      x.rotate(-Math.PI / 2);
      x.fillText('SIDE', 0, 0);
      const sw = x.measureText('SIDE').width;
      arrow(x, -sw / 2 - PU * 0.3, 0, Math.PI / 2);
      arrow(x, sw / 2 + PU * 0.3, 0, Math.PI / 2);
      x.restore();
      if (plateMat.map) plateMat.map.needsUpdate = true;
    }
    // a small solid triangle at (px, py) pointing along angle a (canvas radians, 0 = right)
    function arrow(x, px, py, a) {
      const r = PU * 0.13;
      x.beginPath();
      for (let k = 0; k < 3; k++) {
        const b = a + (k * TAU) / 3;
        const rr = k === 0 ? r * 1.25 : r;
        x[k ? 'lineTo' : 'moveTo'](px + Math.cos(b) * rr, py + Math.sin(b) * rr);
      }
      x.closePath();
      x.fill();
    }
    W.repaint = () => { if (lv) paintPlate(); };

    /* A new baseplate: w by d squares, columns up to top cubes high. */
    W.build = (spec) => {
      lv = { w: spec.w, d: spec.d, top: spec.top };
      board.clear();
      blocks.clear();
      cubes.length = 0;
      pickable.length = 0;
      dying.length = 0;
      for (let i = 0; i < lv.w * lv.d; i++) cubes.push([]);
      if (!plateCanvas) {
        plateCanvas = document.createElement('canvas');
        const tex = new THREE.CanvasTexture(plateCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        plateMat = Toon.toon('#ffffff');
        plateMat.map = tex;
      } else {
        plateMat.map.dispose();
        const tex = new THREE.CanvasTexture(plateCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        plateMat.map = tex;
        plateMat.needsUpdate = true;
      }
      paintPlate();
      const pw = lv.w + MARGIN.left + MARGIN.right;
      const pd = lv.d + MARGIN.back + MARGIN.front;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, PLATE_T, pd),
        [M.plateSide, M.plateSide, plateMat, M.plateSide, M.plateSide, M.plateSide]);
      plate.position.set((MARGIN.right - MARGIN.left) / 2, -PLATE_T / 2, (MARGIN.front - MARGIN.back) / 2);
      board.add(plate);
      W.cursor(null);
      W.preview(null);
      W.glow(null);
      cam.snap = true;
    };

    function makeCube(x, z, y) {
      const mesh = new THREE.Mesh(G.cube, M.layers[y % M.layers.length]);
      const hull = new THREE.Mesh(G.cube, M.hulls[y % M.hulls.length]);
      hull.scale.setScalar(1.05);
      hull.raycast = () => {};
      mesh.add(hull);
      mesh.position.copy(W.squarePos(x, z, y + 0.5));
      mesh.userData = { x, z, y };
      blocks.add(mesh);
      pickable.push(mesh);
      return mesh;
    }

    /* Show the build h (heights per square). With animate, new cubes drop
     * in and removed ones shrink away; otherwise everything jumps. */
    W.setHeights = (h, animate, t) => {
      for (let i = 0; i < h.length; i++) {
        const col = cubes[i];
        const x = i % lv.w;
        const z = Math.floor(i / lv.w);
        while (col.length > h[i]) {
          const c = col.pop();
          pickable.splice(pickable.indexOf(c.mesh), 1);
          if (animate) {
            c.dieAt = t;
            dying.push(c);
            W.burst(c.mesh.position.clone(), 'puff');
          } else {
            blocks.remove(c.mesh);
          }
        }
        while (col.length < h[i]) {
          const y = col.length;
          const mesh = makeCube(x, z, y);
          const c = { mesh, y, born: animate ? t : -9 };
          col.push(c);
          if (animate) mesh.position.y += 0.9;
        }
      }
    };

    /* ----------------------------------------------- cursor and previews */
    // the keyboard cursor on square {x, z}, or null to hide it
    W.cursor = (sq) => {
      cursor.visible = !!sq;
      if (sq) cursor.position.copy(W.squarePos(sq.x, sq.z, 0.012));
    };
    /* What a click would do: { x, z, y, erase } puts the ghost cube at
     * height y of square x, z (or the red box over the cube that would go). */
    W.preview = (p) => {
      ghost.visible = !!p && !p.erase;
      doom.visible = !!p && !!p.erase;
      if (!p) return;
      if (p.erase) {
        doom.position.copy(W.squarePos(p.x, p.z, p.y + 0.5));
      } else {
        ghostFill.material = M.ghost[p.y % M.ghost.length];
        ghost.position.copy(W.squarePos(p.x, p.z, p.y + 0.5));
      }
    };
    /* Hint glows: amber squares, and for a square with a target height a
     * glass column that tall. */
    W.glow = (squares, t) => {
      glows.clear();
      glowAt = t || 0;
      if (!squares) return;
      squares.forEach((s) => {
        const tile = new THREE.Mesh(G.tile, M.glow);
        tile.position.copy(W.squarePos(s.x, s.z, 0.01));
        glows.add(tile);
        if (s.to) {
          const col = new THREE.Mesh(G.cube, M.glowStack);
          col.scale.set(1.08, s.to, 1.08);
          col.position.copy(W.squarePos(s.x, s.z, s.to / 2));
          glows.add(col);
        }
      });
    };

    /* ----------------------------------------------------------- camera */
    W.view = () => ({ yaw: cam.tyaw, pitch: cam.tpitch });
    // which of 8 directions the camera looks from: 0 front, 2 right side, 4 back, 6 left side
    W.facing = () => ((Math.round(cam.tyaw / (Math.PI / 4)) % 8) + 8) % 8;
    W.turn = (dir, now) => {
      const step = Math.PI / 4;
      const k = cam.tyaw / step;
      cam.tyaw = (dir > 0 ? Math.floor(k + 1e-4) + 1 : Math.ceil(k - 1e-4) - 1) * step;
      if (now) cam.yaw = cam.tyaw;
    };
    W.tilt = (now) => {
      const next = TILTS.find((p) => p > cam.tpitch + 0.05);
      cam.tpitch = next == null ? TILTS[0] : next;
      if (now) cam.pitch = cam.tpitch;
    };
    W.drag = (dx, dy) => {
      cam.tyaw -= dx * 0.0085;
      cam.tpitch = clamp(cam.tpitch + dy * 0.0065, PITCH_MIN, PITCH_MAX);
      cam.yaw = cam.tyaw;
      cam.pitch = cam.tpitch;
    };
    W.setView = (yaw, pitch, now) => {
      // the shorter way round
      let y = yaw;
      while (y - cam.tyaw > Math.PI) y -= TAU;
      while (y - cam.tyaw < -Math.PI) y += TAU;
      cam.tyaw = y;
      cam.tpitch = pitch;
      if (now) {
        cam.yaw = y;
        cam.pitch = pitch;
      }
    };
    // the part of the canvas the HUD leaves free, in CSS pixels: { x, y, w, h }
    W.setFrame = (r) => {
      frameRect = r;
    };
    // the tallest column the view must make room for
    let extent = 3;
    W.setExtent = (n) => {
      extent = clamp(n, 1, 6);
    };

    /* Framing. For the current angle: how far away the camera must be for
     * the baseplate and the columns (up to `extent` high) to fit the part of
     * the screen the HUD leaves free, and where their outline then sits, so
     * it can be centred there. Arithmetic on the corners, cached. */
    const fitCache = new Map();
    function fit(yaw, pitch, target) {
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const fr = frameRect || { x: 0, y: 0, w: cw, h: ch };
      const key = [lv.w, lv.d, extent, cw, ch, fr.x, fr.y, fr.w, fr.h, yaw.toFixed(2), pitch.toFixed(2)].join(',');
      const known = fitCache.get(key);
      if (known) return known;
      if (fitCache.size > 500) fitCache.clear();
      const tanV = Math.tan((camera.fov * Math.PI) / 360);
      const tanH = tanV * (cw / ch);
      const corners = [];
      [-lv.w / 2 - MARGIN.left, lv.w / 2 + MARGIN.right].forEach((x) => {
        [-lv.d / 2 - MARGIN.back, lv.d / 2 + MARGIN.front].forEach((z) => corners.push([x, -PLATE_T, z], [x, 0, z]));
      });
      [-lv.w / 2, lv.w / 2].forEach((x) => [-lv.d / 2, lv.d / 2].forEach((z) => corners.push([x, extent, z])));
      // the camera's own axes: forward f, right r, up u
      const dir = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
      const f = [-dir[0], -dir[1], -dir[2]];
      const rl = Math.hypot(f[2], f[0]) || 1;
      const r = [-f[2] / rl, 0, f[0] / rl];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      // the corners' outline on screen (in the full view's -1..1 units) from distance dist
      const outline = (dist) => {
        const p = [target.x + dir[0] * dist, target.y + dir[1] * dist, target.z + dir[2] * dist];
        const o = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        for (const c of corners) {
          const v = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
          const depth = Math.max(0.05, v[0] * f[0] + v[1] * f[1] + v[2] * f[2]);
          const sx = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / depth / tanH;
          const sy = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / depth / tanV;
          o.x0 = Math.min(o.x0, sx);
          o.x1 = Math.max(o.x1, sx);
          o.y0 = Math.min(o.y0, sy);
          o.y1 = Math.max(o.y1, sy);
        }
        return o;
      };
      const roomW = ((2 * fr.w) / cw) * 0.9;
      const roomH = ((2 * fr.h) / ch) * 0.9;
      let lo = 2;
      let hi = 150;
      for (let it = 0; it < 28; it++) {
        const mid = (lo + hi) / 2;
        const o = outline(mid);
        if (o.x1 - o.x0 <= roomW && o.y1 - o.y0 <= roomH) hi = mid;
        else lo = mid;
      }
      const o = outline(hi);
      const out = { dist: hi, cx: (o.x0 + o.x1) / 2, cy: (o.y0 + o.y1) / 2 };
      fitCache.set(key, out);
      return out;
    }

    W.frame = (dt, snap) => {
      if (!lv) return;
      const now = snap || cam.snap;
      const k = now ? 1 : 1 - Math.exp(-9 * dt);
      cam.yaw += (cam.tyaw - cam.yaw) * k;
      cam.pitch += (cam.tpitch - cam.pitch) * k;
      const target = new THREE.Vector3(0, extent * 0.4, 0);
      const want = fit(cam.yaw, cam.pitch, target);
      const k2 = now ? 1 : 1 - Math.exp(-7 * dt);
      cam.dist += (want.dist - cam.dist) * k2;
      cam.cx += (want.cx - cam.cx) * k2;
      cam.cy += (want.cy - cam.cy) * k2;
      cam.snap = false;
      const cp = Math.cos(cam.pitch);
      camera.position.set(
        target.x + Math.sin(cam.yaw) * cp * cam.dist,
        target.y + Math.sin(cam.pitch) * cam.dist,
        target.z + Math.cos(cam.yaw) * cp * cam.dist,
      );
      camera.lookAt(target);
      // the light follows the camera round, so the faces you see are always lit
      sun.position.set(
        target.x + Math.sin(cam.yaw + 0.7) * 10,
        14,
        target.z + Math.cos(cam.yaw + 0.7) * 10,
      );
      // put the middle of the outline in the middle of the free rect
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const fr = frameRect || { x: 0, y: 0, w: cw, h: ch };
      camera.setViewOffset(cw, ch, ((cam.cx + 1) / 2) * cw - (fr.x + fr.w / 2), ((1 - cam.cy) / 2) * ch - (fr.y + fr.h / 2), cw, ch);
      camera.updateMatrixWorld();
    };

    /* ---------------------------------------------------------- picking */
    W.toScreen = (v) => {
      const r = canvas.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    /* What is under a click: a cube face { kind: 'cube', x, z, y, nx, ny, nz },
     * a bare square { kind: 'plate', x, z }, or null. */
    W.pick = (clientX, clientY) => {
      if (!lv) return null;
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickable, false);
      if (hits.length) {
        const o = hits[0].object.userData;
        const n = hits[0].face.normal;
        return { kind: 'cube', x: o.x, z: o.z, y: o.y, nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z) };
      }
      if (!ray.ray.intersectPlane(ground, hitPoint)) return null;
      const x = Math.floor(hitPoint.x + lv.w / 2);
      const z = Math.floor(hitPoint.z + lv.d / 2);
      if (x < 0 || z < 0 || x >= lv.w || z >= lv.d) return null;
      return { kind: 'plate', x, z };
    };

    /* ---------------------------------------------------------- effects */
    const BURSTS = {
      puff: { n: 9, mat: () => M.white, speed: 2, up: 1.4, size: 0.07, life: 0.35 },
      sparkle: { n: 16, mat: () => M.spark, speed: 2.6, up: 3, size: 0.06, life: 0.8 },
      confetti: { n: 70, mat: (i) => M.confetti[i % M.confetti.length], speed: 7, up: 6, size: 0.08, life: 1.8 },
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
          v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.5, 1.2), rand(-0.5, 0.5) * b.speed),
          life: b.life,
          max: b.life,
          size: b.size,
        });
      }
    };
    W.top = () => (lv ? lv.top : 3);

    W.update = (t, dt) => {
      // new cubes drop into place with a little bounce
      for (const col of cubes) {
        for (const c of col) {
          if (c.born < 0) continue;
          const k = clamp((t - c.born) / 0.22, 0, 1);
          const e = 1 - Math.pow(1 - k, 3);
          const rest = W.squarePos(c.mesh.userData.x, c.mesh.userData.z, c.y + 0.5);
          c.mesh.position.y = rest.y + 0.9 * (1 - e);
          const squash = k >= 1 ? 1 : 1 - 0.12 * Math.sin(Math.PI * k);
          c.mesh.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
          if (k >= 1) {
            c.born = -9;
            c.mesh.scale.setScalar(1);
            c.mesh.position.copy(rest);
          }
        }
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const c = dying[i];
        const k = clamp((t - c.dieAt) / 0.16, 0, 1);
        c.mesh.scale.setScalar(Math.max(0.001, 1 - k));
        if (k >= 1) {
          blocks.remove(c.mesh);
          dying.splice(i, 1);
        }
      }
      // hint glows breathe
      if (glows.children.length) {
        const a = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin((t - glowAt) * 5));
        M.glow.opacity = a + 0.15;
        M.glowStack.opacity = a * 0.7;
      }
      if (cursor.visible) cursor.scale.setScalar(1 + 0.03 * Math.sin(t * 6));
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

  window.World = { create, LAYERS, TILTS };
})();
