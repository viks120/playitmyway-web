/* Molecule Lab: the 3D world.
 *
 * Owns the renderer, the lab backdrop, a ball for every atom (its colour,
 * a letter that always faces you, yellow studs for its open bonding slots),
 * the bonds (one, two or three sticks, each half in its atom's colour), the
 * rings that show the selected atoms, the line drawn while dragging a bond,
 * the bond-angle arc and the lone pairs once a molecule is finished, the
 * orbiting camera that keeps the molecule framed in the space the panels
 * leave free, picking an atom or bond from a tap, and the effects. It
 * draws; game.js decides. Needs THREE, Toon and Chem; sets window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  // the usual teaching colours: hydrogen white, carbon dark grey, nitrogen
  // blue, oxygen red, chlorine green
  const LOOK = {
    H: { fill: '#f5f7fa', line: '#93a0b2', ink: '#33302e', r: 0.27 },
    C: { fill: '#424956', line: '#262a33', ink: '#ffffff', r: 0.42 },
    N: { fill: '#3d72e3', line: '#2549a6', ink: '#ffffff', r: 0.4 },
    O: { fill: '#e2483d', line: '#a52a20', ink: '#ffffff', r: 0.4 },
    Cl: { fill: '#37b65d', line: '#20793c', ink: '#ffffff', r: 0.5 },
  };
  const ARC = '#9333ea';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const keyOf = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const V3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);

  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d');
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const paint = () => {
      x.clearRect(0, 0, w, h);
      draw(x, w, h);
      t.needsUpdate = true;
    };
    paint();
    return { tex: t, paint };
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

  function create(canvas) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch (e) {
      return null;                      // no WebGL here: the game shows its fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    // a soft lab-green backdrop, lighter at the top
    const sky = canvasTexture(4, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#f6fbf8');
      g.addColorStop(1, '#d3eadc');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    });
    scene.background = sky.tex;
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfe6d8', 1.5));
    // the light rides with the camera, so the side you look at is always lit
    const sun = new THREE.DirectionalLight('#ffffff', 2.0);
    sun.position.set(-3, 4, 3);
    const aim = new THREE.Group();
    aim.position.set(0, 0, -10);
    camera.add(sun, aim);
    sun.target = aim;

    const M = {
      atom: {},
      stud: Toon.toon('#fcd34d', '#b7791f'),
      sel: Toon.flat('#f59e0b'),
      partner: Toon.flat('#f59e0b', 0.55),
      flash: Toon.flat('#2563eb'),
      drag: Toon.flat('#f59e0b', 0.8),
      arc: Toon.flat(ARC),
      lone: Toon.flat('#c084fc', 0.42),
      pick: Toon.flat('#000000'),
      shadow: null,
      bits: ['#fcd34d', '#86efac', '#93c5fd', '#f9a8d4', '#ffffff'].map((c) => Toon.flat(c)),
    };
    M.pick.visible = false;             // invisible, but still found by taps
    for (const el of Object.keys(LOOK)) M.atom[el] = Toon.toon(LOOK[el].fill, LOOK[el].line);
    const G = {
      ball: new THREE.SphereGeometry(1, 32, 22),
      bit: new THREE.SphereGeometry(1, 8, 6),
      stick: new THREE.CylinderGeometry(1, 1, 1, 14),
      plane: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.TorusGeometry(1, 0.055, 8, 48),
      studStick: new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8),
      studTip: new THREE.SphereGeometry(0.075, 12, 8),
      pick: new THREE.CylinderGeometry(0.22, 0.22, 1, 8),
    };

    // a soft round shadow under the molecule, to sit it in space
    const shade = canvasTexture(128, 128, (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(30, 80, 55, 0.13)');
      g.addColorStop(0.6, 'rgba(30, 80, 55, 0.06)');
      g.addColorStop(1, 'rgba(30, 80, 55, 0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    });
    M.shadow = new THREE.MeshBasicMaterial({ map: shade.tex, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    // letters for the atoms, one texture per element, in the site's Fredoka
    const letters = {};
    for (const el of Object.keys(LOOK)) {
      letters[el] = canvasTexture(128, 128, (x, w, h) => {
        x.font = `700 ${el.length > 1 ? 70 : 84}px ${FONT}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.lineJoin = 'round';
        if (LOOK[el].ink === '#ffffff') {
          x.lineWidth = 10;
          x.strokeStyle = 'rgba(0, 0, 0, 0.28)';
          x.strokeText(el, w / 2, h / 2 + 5);
        }
        x.fillStyle = LOOK[el].ink;
        x.fillText(el, w / 2, h / 2 + 5);
      });
      M['letter' + el] = new THREE.MeshBasicMaterial({ map: letters[el].tex, transparent: true, depthWrite: false });
    }

    const root = new THREE.Group();
    scene.add(root);
    const fx = new THREE.Group();
    scene.add(fx);

    const atoms = new Map();            // id → view
    const bonds = new Map();            // "a:b" → view
    let mol = { atoms: [], bonds: [] };
    let calm = false;

    function makeRing(mat) {
      const r = new THREE.Mesh(G.ring, mat);
      r.visible = false;
      r.renderOrder = 2;
      scene.add(r);
      return r;
    }
    const selRing = makeRing(M.sel);
    const partnerRing = makeRing(M.partner);
    const flashRing = makeRing(M.flash);
    let selId = null;
    let partnerId = null;
    let flash = null;                   // { id, until }

    const dragStick = new THREE.Mesh(G.stick, M.drag);
    const dragTip = new THREE.Mesh(G.bit, M.drag);
    dragStick.visible = false;
    dragTip.visible = false;
    scene.add(dragStick, dragTip);
    let dragFrom = null;
    const dragTo = new THREE.Vector3();

    const shapeFx = new THREE.Group();
    scene.add(shapeFx);
    let shape = null;                   // { arc, label, lone } meshes once finished

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const UP = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();

    const W = { renderer, scene, camera };

    /* ------------------------------------------------------------ atoms */
    function makeAtom(a, t) {
      const look = LOOK[a.el];
      const g = new THREE.Group();
      const ball = new THREE.Mesh(G.ball, M.atom[a.el]);
      ball.scale.setScalar(look.r);
      ball.userData.atom = a.id;
      const label = new THREE.Mesh(G.plane, M['letter' + a.el]);
      label.scale.setScalar(look.r * 1.45);
      label.renderOrder = 1;
      label.userData.atom = a.id;
      const studs = new THREE.Group();
      g.add(ball, label, studs);
      Toon.addOutlines(ball);
      root.add(g);
      return { id: a.id, el: a.el, r: look.r, group: g, ball, label, studs, slots: [], born: t, settle: -9 };
    }

    function makeStud(view) {
      const s = new THREE.Group();
      const stick = new THREE.Mesh(G.studStick, M.stud);
      stick.position.y = view.r + 0.06;
      const tip = new THREE.Mesh(G.studTip, M.stud);
      tip.position.y = view.r + 0.17;
      tip.userData.atom = view.id;
      stick.userData.atom = view.id;
      s.add(stick, tip);
      Toon.addOutlines(s);
      view.studs.add(s);
      return s;
    }

    /* ------------------------------------------------------------ bonds */
    function makeBond(b) {
      const g = new THREE.Group();
      const sticks = [];
      for (let i = 0; i < b.order; i++) {
        const half = [b.a, b.b].map((id) => {
          const m = new THREE.Mesh(G.stick, M.atom[atomEl(id)]);
          m.userData.bond = [b.a, b.b];
          g.add(m);
          return m;
        });
        sticks.push(half);
      }
      const pick = new THREE.Mesh(G.pick, M.pick);
      pick.userData.bond = [b.a, b.b];
      g.add(pick);
      Toon.addOutlines(g);
      root.add(g);
      return { a: b.a, b: b.b, order: b.order, group: g, sticks, pick };
    }
    const atomEl = (id) => (atoms.get(id) || { el: 'C' }).el;

    function dropView(v) {
      root.remove(v.group);
    }

    /* Match the drawn molecule to the molecule: add, remove and restyle. */
    W.sync = (m, t) => {
      mol = m;
      const ids = new Set(m.atoms.map((a) => a.id));
      for (const [id, v] of atoms) {
        if (!ids.has(id)) {
          dropView(v);
          atoms.delete(id);
        }
      }
      for (const a of m.atoms) if (!atoms.has(a.id)) atoms.set(a.id, makeAtom(a, calm ? -9 : t));
      const keys = new Set();
      for (const b of m.bonds) {
        const k = keyOf(b.a, b.b);
        keys.add(k);
        const v = bonds.get(k);
        if (v && v.order === b.order) continue;
        if (v) dropView(v);
        bonds.set(k, makeBond(b));
      }
      for (const [k, v] of bonds) {
        if (!keys.has(k)) {
          dropView(v);
          bonds.delete(k);
        }
      }
      // one stud for every open bonding slot
      for (const a of m.atoms) {
        const v = atoms.get(a.id);
        let used = 0;
        for (const b of m.bonds) if (b.a === a.id || b.b === a.id) used += b.order;
        const open = Math.max(0, Chem.ELEMENTS[a.el].valency - used);
        while (v.slots.length > open) {
          const s = v.slots.pop();
          v.studs.remove(s.mesh);
        }
        while (v.slots.length < open) v.slots.push({ mesh: makeStud(v), dir: null });
      }
    };

    W.settle = (id, t) => {
      const v = atoms.get(id);
      if (v) v.settle = t;
    };
    W.select = (sel, partner) => {
      selId = sel;
      partnerId = partner;
    };
    W.flash = (id, t) => {
      flash = id == null ? null : { id, until: t + 2.6 };
    };
    W.calm = (on) => { calm = on; };

    /* -------------------------------------------------------- positions */
    let pos = new Map();
    W.setPos = (p) => { pos = p; };
    const posOf = (id) => {
      const p = pos.get(id);
      return p ? tmp.set(p[0], p[1], p[2]) : tmp.set(0, 0, 0);
    };

    // the open-slot studs spread out like electron pairs: away from the
    // bonds and from each other, and a little towards the viewer so they
    // are not hidden behind their atom
    function spreadStuds(v, p, toCam) {
      if (!v.slots.length) return;
      const bondDirs = [];
      for (const b of mol.bonds) {
        if (b.a !== v.id && b.b !== v.id) continue;
        const q = pos.get(b.a === v.id ? b.b : b.a);
        if (!q) continue;
        const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1;
        bondDirs.push([d[0] / l, d[1] / l, d[2] / l]);
      }
      for (const s of v.slots) {
        if (!s.dir) {
          // start opposite the bonds, nudged a little so studs separate
          let d = bondDirs.reduce((acc, b) => [acc[0] - b[0], acc[1] - b[1], acc[2] - b[2]], [rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5)]);
          if (!bondDirs.length) d = [rand(-1, 1), rand(-1, 1), rand(-1, 1)];
          const l = Math.hypot(d[0], d[1], d[2]) || 1;
          s.dir = [d[0] / l, d[1] / l, d[2] / l];
        }
      }
      for (let it = 0; it < 3; it++) {
        for (const s of v.slots) {
          const f = [0, 0, 0];
          const push = (o, k) => {
            const d = [s.dir[0] - o[0], s.dir[1] - o[1], s.dir[2] - o[2]];
            const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + 0.02;
            const w = k / (l2 * Math.sqrt(l2));
            f[0] += d[0] * w;
            f[1] += d[1] * w;
            f[2] += d[2] * w;
          };
          for (const b of bondDirs) push(b, 1.3);
          for (const o of v.slots) if (o !== s) push(o.dir, 1);
          f[0] += toCam.x * 0.45;
          f[1] += toCam.y * 0.45;
          f[2] += toCam.z * 0.45;
          const n = [s.dir[0] + f[0] * 0.04, s.dir[1] + f[1] * 0.04, s.dir[2] + f[2] * 0.04];
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          s.dir = [n[0] / l, n[1] / l, n[2] / l];
        }
      }
      for (const s of v.slots) s.mesh.quaternion.setFromUnitVectors(UP, tmp2.set(s.dir[0], s.dir[1], s.dir[2]));
    }

    /* --------------------------------------------------------- the view */
    const view = { yaw: 0.55, pitch: 0.32, zoom: 1, spin: false };
    const focus = { left: 0, top: 0, right: 1, bottom: 1 };   // the free part of the canvas, css px
    const target = new THREE.Vector3();
    let radius = 1.6;
    let dist = 10;
    let fullW = 1;
    let fullH = 1;
    let focal = 800;                    // the camera's focal length in css px

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      W.frame(0, true);
    };
    W.render = () => renderer.render(scene, camera);
    W.focus = (r) => {
      Object.assign(focus, r);
    };
    W.orbit = (dYaw, dPitch) => {
      view.yaw += dYaw;
      view.pitch = clamp(view.pitch + dPitch, -1.25, 1.35);
    };
    W.zoomBy = (f) => { view.zoom = clamp(view.zoom * f, 0.45, 2.4); };
    W.resetView = () => {
      view.yaw = 0.55;
      view.pitch = 0.32;
      view.zoom = 1;
    };
    W.spin = (on) => { view.spin = on; };

    // the middle of the molecule and how far it reaches
    function measure() {
      if (!pos.size || !atoms.size) return { c: new THREE.Vector3(), r: 1.4 };
      const c = new THREE.Vector3();
      let n = 0;
      for (const id of atoms.keys()) {
        const p = pos.get(id);
        if (!p) continue;
        c.x += p[0];
        c.y += p[1];
        c.z += p[2];
        n++;
      }
      if (!n) return { c, r: 1.4 };
      c.multiplyScalar(1 / n);
      let r = 0;
      for (const [id, v] of atoms) {
        const p = pos.get(id);
        if (p) r = Math.max(r, Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) + v.r);
      }
      return { c, r: Math.max(r + 0.35, 1.4) };
    }

    /* Camera: orbit round the molecule's middle, at the distance that fits
     * it in the free part of the screen, with that part's middle as the
     * centre of the picture (a view offset). */
    W.frame = (dt, snap) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const k = snap ? 1 : 1 - Math.exp(-4 * dt);
      const { c, r } = measure();
      target.lerp(c, k);
      radius += (r - radius) * k;
      const left = clamp(focus.left, 0, w - 60);
      const right = clamp(focus.right, left + 60, w);
      const top = clamp(focus.top, 0, h - 60);
      const bottom = clamp(focus.bottom, top + 60, h);
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      // a picture big enough that (cx, cy) is its centre, of which the canvas is a window
      fullW = 2 * Math.max(cx, w - cx);
      fullH = 2 * Math.max(cy, h - cy);
      const offX = cx < w / 2 ? fullW - w : 0;
      const offY = cy < h / 2 ? fullH - h : 0;
      const f = (h / 2) / Math.tan((36 * Math.PI) / 360);           // focal length in px
      focal = f;
      camera.fov = (2 * Math.atan(fullH / 2 / f) * 180) / Math.PI;
      camera.aspect = fullW / fullH;
      camera.setViewOffset(fullW, fullH, offX, offY, w, h);
      const half = Math.min((bottom - top) / 2 - 8, (right - left) / 2 - 8);
      const want = (radius / Math.sin(Math.atan(Math.max(half, 30) / f))) * view.zoom;
      dist = snap ? want : dist + (want - dist) * k;
      if (view.spin) view.yaw += dt * 0.35;
      const cp = Math.cos(view.pitch);
      camera.position.set(
        target.x + dist * cp * Math.sin(view.yaw),
        target.y + dist * Math.sin(view.pitch),
        target.z + dist * cp * Math.cos(view.yaw),
      );
      camera.lookAt(target);
      camera.updateMatrixWorld();
      shadow.position.set(target.x, target.y - radius - 0.25, target.z);
      shadow.scale.setScalar(radius * 1.15);
      M.shadow.opacity = clamp((view.pitch + 0.1) * 3, 0, 1);
    };

    // which way the camera looks, and its right hand, as plain arrays
    W.viewDirs = () => {
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      const r = new THREE.Vector3().crossVectors(d, UP).normalize();
      return { view: [d.x, d.y, d.z], right: [r.x, r.y, r.z] };
    };

    W.toScreen = (p) => {
      const rect = canvas.getBoundingClientRect();
      const v = V3(p).project(camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, z: v.z };
    };

    /* What is under a tap: { atom: id }, { bond: [a, b] } or null. A tap a
     * little off a small atom still finds it. */
    W.pick = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(root.children, true);
      for (const h of hits) {
        if (h.object.userData.atom != null) return { atom: h.object.userData.atom };
        if (h.object.userData.bond) return { bond: h.object.userData.bond };
      }
      let best = null;
      let bestD = Infinity;
      for (const [id, v] of atoms) {
        const p = pos.get(id);
        if (!p) continue;
        const s = W.toScreen(p);
        const edge = W.toScreen([p[0] + v.r, p[1], p[2]]);
        const reach = Math.max(Math.hypot(edge.x - s.x, edge.y - s.y), 8) + 18;
        const d = Math.hypot(s.x - clientX, s.y - clientY);
        if (d < reach && d < bestD) {
          bestD = d;
          best = id;
        }
      }
      return best == null ? null : { atom: best };
    };

    // while dragging a bond: a line from the atom to the finger
    W.dragLine = (fromId, clientX, clientY) => {
      dragFrom = fromId;
      if (fromId == null) return;
      const p = pos.get(fromId);
      if (!p) return;
      const rect = canvas.getBoundingClientRect();
      const depth = V3(p).project(camera).z;
      dragTo.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, depth).unproject(camera);
    };

    /* ----------------------------------------------- the finished shape */
    const labels = new Map();
    function angleLabel(text) {
      if (!labels.has(text)) {
        const t = canvasTexture(256, 96, (x, w, h) => {
          roundRect(x, 6, 6, w - 12, h - 12, (h - 12) / 2);
          x.fillStyle = 'rgba(255, 255, 255, 0.95)';
          x.fill();
          x.lineWidth = 5;
          x.strokeStyle = ARC;
          x.stroke();
          x.font = `700 54px ${FONT}`;
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          x.fillStyle = '#581c87';
          x.fillText(text, w / 2, h / 2 + 3);
        });
        labels.set(text, { t, mat: new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthTest: false, depthWrite: false }) });
      }
      return labels.get(text);
    }

    W.clearShape = () => {
      shapeFx.clear();
      shape = null;
    };

    /* info: { arc: { c, a, b, angle, text } | null, lone: [{ id, dirs }] }
     * with atom ids, and lone pair directions as arrays. */
    W.showShape = (info) => {
      W.clearShape();
      shape = { label: null, labelAt: null };
      if (info.arc) {
        const c = V3(pos.get(info.arc.c));
        const a = V3(pos.get(info.arc.a)).sub(c).normalize();
        const b = V3(pos.get(info.arc.b)).sub(c).normalize();
        const r = LOOK[atomEl(info.arc.c)].r + 0.32;
        const ang = (info.arc.angle * Math.PI) / 180;
        // the arc lies in the plane of the two bonds; a straight angle has no
        // plane, so it faces the camera
        let y = b.clone().sub(a.clone().multiplyScalar(a.dot(b)));
        if (y.lengthSq() < 1e-6) {
          camera.getWorldDirection(y);
          y.cross(a);
          if (y.lengthSq() < 1e-6) y.set(0, 1, 0).cross(a);
        }
        y.normalize();
        const z = a.clone().cross(y);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 40, ang), M.arc);
        arc.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, y, z));
        arc.position.copy(c);
        arc.renderOrder = 3;
        shapeFx.add(arc);
        const mid = a.clone().multiplyScalar(Math.cos(ang / 2)).add(y.clone().multiplyScalar(Math.sin(ang / 2))).normalize();
        const lab = angleLabel(info.arc.text);
        const label = new THREE.Mesh(G.plane, lab.mat);
        label.renderOrder = 4;
        shapeFx.add(label);
        shape.label = label;
        shape.labelAt = c.clone().add(mid.multiplyScalar(r + 0.55));
      }
      for (const lp of info.lone || []) {
        const c = V3(pos.get(lp.id));
        const r = LOOK[atomEl(lp.id)].r;
        for (const d of lp.dirs) {
          const dir = V3(d).normalize();
          const lobe = new THREE.Mesh(G.ball, M.lone);
          lobe.scale.set(0.17, 0.3, 0.17);
          lobe.quaternion.setFromUnitVectors(UP, dir);
          lobe.position.copy(c).add(dir.multiplyScalar(r + 0.22));
          shapeFx.add(lobe);
        }
      }
    };

    /* ----------------------------------------------------------- effects */
    const bits = [];
    W.burst = () => {
      if (calm) return;
      const { c, r } = measure();
      for (let i = 0; i < 46; i++) {
        const m = new THREE.Mesh(G.bit, M.bits[i % M.bits.length]);
        const d = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
        m.position.copy(c).add(d.clone().multiplyScalar(r * 0.6));
        const size = rand(0.04, 0.08);
        m.scale.setScalar(size);
        fx.add(m);
        bits.push({ m, v: d.multiplyScalar(rand(1.5, 3.2)), life: 1.2, max: 1.2, size });
      }
    };

    /* ------------------------------------------------------ every frame */
    const q = new THREE.Quaternion();
    W.update = (t, dt) => {
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const toCam = camDir.clone().negate();
      for (const [id, v] of atoms) {
        const p = pos.get(id);
        if (!p) continue;
        v.group.position.set(p[0], p[1], p[2]);
        let s = 1;
        const age = t - v.born;
        if (age < 0.3) {
          const k = clamp(age / 0.3, 0, 1);
          s = 0.3 + 0.7 * (1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2);
        }
        const st = t - v.settle;
        if (!calm && st < 0.45) s *= 1 + 0.16 * Math.sin((st / 0.45) * Math.PI) * (1 - st / 0.45);
        v.group.scale.setScalar(s);
        // the letter faces the camera, just in front of the ball
        v.label.quaternion.copy(camera.quaternion);
        v.label.position.copy(camDir).multiplyScalar(-v.r * 1.02);
        spreadStuds(v, p, toCam);
      }
      // bonds: sticks from atom to atom, side by side across the view for double and triple
      for (const b of bonds.values()) {
        const pa = pos.get(b.a);
        const pb = pos.get(b.b);
        if (!pa || !pb) continue;
        const A = V3(pa);
        const B = V3(pb);
        const d = B.clone().sub(A);
        const len = d.length() || 1e-6;
        d.divideScalar(len);
        q.setFromUnitVectors(UP, d);
        const side = d.clone().cross(camDir);
        if (side.lengthSq() < 1e-6) side.copy(d).cross(UP);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const n = b.sticks.length;
        const radiusStick = n === 1 ? 0.085 : 0.062;
        const gap = n === 2 ? 0.13 : 0.15;
        b.sticks.forEach((pair, i) => {
          const off = side.clone().multiplyScalar((i - (n - 1) / 2) * gap);
          pair.forEach((m, h) => {
            m.quaternion.copy(q);
            m.scale.set(radiusStick, len / 2, radiusStick);
            m.position.copy(A).add(off).addScaledVector(d, len * (h === 0 ? 0.25 : 0.75));
          });
        });
        b.pick.quaternion.copy(q);
        b.pick.scale.set(1, Math.max(len - 0.5, 0.2), 1);
        b.pick.position.copy(A).addScaledVector(d, len / 2);
      }
      // rings round the selected atoms
      const ring = (mesh, id, extra) => {
        const v = id == null ? null : atoms.get(id);
        mesh.visible = !!v;
        if (!v) return;
        mesh.position.copy(v.group.position);
        mesh.quaternion.copy(camera.quaternion);
        mesh.scale.setScalar((v.r + extra) * v.group.scale.x);
      };
      ring(selRing, selId, 0.16 + (calm ? 0 : 0.025 * Math.sin(t * 5)));
      ring(partnerRing, partnerId != null && partnerId !== selId ? partnerId : null, 0.13);
      if (flash && t > flash.until) flash = null;
      ring(flashRing, flash ? flash.id : null, 0.3 + (calm ? 0 : 0.08 * Math.sin(t * 7)));
      // the line while dragging a bond
      dragStick.visible = dragTip.visible = dragFrom != null && atoms.has(dragFrom);
      if (dragStick.visible) {
        const A = V3(pos.get(dragFrom));
        const d = dragTo.clone().sub(A);
        const len = Math.max(d.length(), 1e-3);
        dragStick.quaternion.setFromUnitVectors(UP, d.clone().divideScalar(len));
        dragStick.scale.set(0.05, len, 0.05);
        dragStick.position.copy(A).addScaledVector(d, 0.5);
        dragTip.position.copy(dragTo);
        dragTip.scale.setScalar(0.12);
      }
      if (shape && shape.label) {
        // about 30 px tall on screen, whatever the zoom
        const s = (30 * shape.labelAt.distanceTo(camera.position)) / focal;
        shape.label.scale.set(s * (256 / 96), s, 1);
        shape.label.quaternion.copy(camera.quaternion);
        shape.label.position.copy(shape.labelAt);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          fx.remove(b.m);
          bits.splice(i, 1);
          continue;
        }
        b.v.multiplyScalar(Math.exp(-1.5 * dt));
        b.m.position.addScaledVector(b.v, dt);
        b.m.scale.setScalar(b.size * Math.sqrt(b.life / b.max));
      }
    };

    // repaint the letters once the font has arrived
    W.repaint = () => {
      for (const el of Object.keys(letters)) letters[el].paint();
      for (const l of labels.values()) l.t.paint();
    };

    W.clear = () => {
      for (const v of atoms.values()) dropView(v);
      for (const v of bonds.values()) dropView(v);
      atoms.clear();
      bonds.clear();
      W.clearShape();
      selId = null;
      partnerId = null;
      flash = null;
      dragFrom = null;
      mol = { atoms: [], bonds: [] };
    };

    return W;
  }

  window.World = { create, LOOK };
})();
