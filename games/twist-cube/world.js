/* Twist Cube: the 3D world.
 *
 * Owns the renderer, the backdrop, the cube (a rounded block for every piece
 * you can see, with a rounded sticker on each outside face), the twist and
 * whole-cube turn animations, the hint arrow, the face-letter badges, the
 * camera and the effects. It draws; game.js decides. The stickers are
 * repainted from the logic's state after every twist, so the picture can
 * never drift from the puzzle. Needs THREE, Toon and CubeLogic; sets
 * window.World.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BG = '#e3f2e9';
  // sticker colours and the darker ink of their optional shapes, in CubeLogic.FACES order: U D L R F B
  const COLOURS = ['#f7f9fc', '#ffd43b', '#ff8a1c', '#e23a3f', '#1faf5a', '#2f6fe0'];
  const INKS = ['#8d99ae', '#b38600', '#b25300', '#8c1420', '#0b6531', '#163c8a'];
  const BODY = '#232838';
  const BODY_LINE = '#0f121b';
  const BLOCK = 0.94;            // a block's size; the rest of each unit is the gap
  const STICKER = 0.8;
  const FOV = 30;
  const AZ = 0.62;               // the camera looks from the front, a little to the right
  const EL = 0.5;                // and from a little above, so U, F and R all show
  const DIR = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
  const UP = new THREE.Vector3().crossVectors(RIGHT, DIR).negate().normalize();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => x * x * (3 - 2 * x);
  // a twist eases in, then settles with the faintest overshoot, like a real layer clicking home
  const settle = (x) => {
    const c = 1.4;
    const y = x - 1;
    return x < 0.5 ? 4 * x * x * x : 1 + (c + 1) * y * y * y + c * y * y;
  };

  // a square of half-size h with rounded corners of radius r
  function roundedSquare(h, r) {
    const s = new THREE.Shape();
    s.moveTo(-h + r, -h);
    s.lineTo(h - r, -h);
    s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
    s.lineTo(h, h - r);
    s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
    s.lineTo(-h + r, h);
    s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-h, -h + r);
    s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  function blockGeometry() {
    const b = 0.07;
    const geo = new THREE.ExtrudeGeometry(roundedSquare(BLOCK / 2 - b, 0.04), {
      depth: BLOCK - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 3,
    });
    geo.translate(0, 0, -(BLOCK - 2 * b) / 2);
    return geo;
  }
  function stickerGeometry() {
    return new THREE.ExtrudeGeometry(roundedSquare(STICKER / 2 - 0.012, 0.12), {
      depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 5,
    });
  }
  function flatShape(shape) {
    return new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 12 });
  }
  function star(points, outer, inner) {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / points;
      const r = i % 2 ? inner : outer;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return s;
  }
  function plus(arm, half) {
    const s = new THREE.Shape();
    const pts = [[-half, arm], [half, arm], [half, half], [arm, half], [arm, -half], [half, -half], [half, -arm],
      [-half, -arm], [-half, -half], [-arm, -half], [-arm, half], [-half, half]];
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    return s;
  }
  // one shape per colour, for players who find some colours hard to tell apart
  function symbolGeometries() {
    const dot = new THREE.CircleGeometry(0.12, 28);
    const tri = new THREE.CircleGeometry(0.19, 3);
    tri.rotateZ(Math.PI / 2);
    tri.translate(0, -0.03, 0);
    const ring = new THREE.RingGeometry(0.1, 0.17, 28);
    const cross = flatShape(plus(0.17, 0.055));
    const square = new THREE.CircleGeometry(0.19, 4);
    square.rotateZ(Math.PI / 4);
    const five = flatShape(star(5, 0.2, 0.085));
    return [dot, tri, ring, cross, square, five];
  }

  /* A curved arrow lying flat: a band round most of a circle of radius 1,
   * from angle a1 clockwise down to a0, where its head points on clockwise. */
  function arrowGeometry() {
    const r = 1;
    const w = 0.26;
    const hw = 0.2;
    const tip = 0.55;
    const a0 = -Math.PI * 0.15;
    const a1 = a0 + Math.PI * 1.3;
    const ro = r + w / 2;
    const ri = r - w / 2;
    const at = (a, rad) => [Math.cos(a) * rad, Math.sin(a) * rad];
    const s = new THREE.Shape();
    s.moveTo(...at(a1, ro));
    s.absarc(0, 0, ro, a1, a0, true);
    s.lineTo(...at(a0, ro + hw));
    s.lineTo(...at(a0 - tip, r));
    s.lineTo(...at(a0, ri - hw));
    s.lineTo(...at(a0, ri));
    s.absarc(0, 0, ri, a0, a1, false);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40,
    });
  }

  function badgeTexture(letter, word) {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(255, 255, 255, 0.94)';
    x.beginPath();
    x.arc(64, 64, 60, 0, TAU);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = '#15803d';
    x.stroke();
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#14532d';
    x.font = '700 62px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
    x.fillText(letter, 64, 54);
    x.font = '600 22px Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
    x.fillText(word, 64, 96);
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
    g.addColorStop(0, 'rgba(20, 60, 40, 0.34)');
    g.addColorStop(1, 'rgba(20, 60, 40, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
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
    scene.background = new THREE.Color(BG);
    scene.add(new THREE.HemisphereLight('#ffffff', '#bfe3cc', 1.55));
    const sun = new THREE.DirectionalLight('#fffaf0', 1.9);
    sun.position.set(-2.5, 7, 4.5);       // top brightest, front next, right face in a little shade
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

    const M = {
      body: Toon.toon(BODY, BODY_LINE),
      core: Toon.flat('#11141d'),
      sticker: COLOURS.map((c) => Toon.toon(c)),
      ink: INKS.map((c) => Toon.toon(c)),
      arrow: Toon.toon('#ffffff', '#1b2131'),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      confetti: COLOURS.slice(1).map((c) => Toon.flat(c)),
    };
    const G = {
      block: blockGeometry(),
      sticker: stickerGeometry(),
      symbols: symbolGeometries(),
      core: new THREE.SphereGeometry(1, 24, 16),
      bit: new THREE.SphereGeometry(1, 8, 6),
      badge: new THREE.PlaneGeometry(1, 1),
    };

    // world <- spinner (celebrations and the menu's idle turn) <- holder (how the player holds it) <- cube
    const spinner = new THREE.Group();
    scene.add(spinner);
    const holder = new THREE.Group();
    spinner.add(holder);
    const cube = new THREE.Group();
    holder.add(cube);
    const pivot = new THREE.Group();     // a turning layer rides on this
    cube.add(pivot);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    // the hint arrow: a curved arrow lying just above a face, showing which way it turns
    const arrow = new THREE.Group();
    const arrowSpin = new THREE.Group();
    arrow.add(arrowSpin);
    arrowSpin.add(new THREE.Mesh(arrowGeometry(), M.arrow));
    Toon.addOutlines(arrow);
    arrow.visible = false;
    cube.add(arrow);
    let arrowFor = null;

    const ROT_Q = CubeLogic.ROTATIONS.map((R) => {
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...R[0]), new THREE.Vector3(...R[1]), new THREE.Vector3(...R[2]));
      return new THREE.Quaternion().setFromRotationMatrix(m);
    });

    let size = 3;
    let blocks = [];                     // { group, coord }
    let stickers = [];                   // per sticker spot: { mesh, sym }
    let core = null;
    let symbolsOn = false;
    const badges = [];
    const bits = [];
    const queue = [];
    let anim = null;
    const target = new THREE.Quaternion();
    let dragging = false;
    let frameRect = null;
    let dist = 12;
    let offX = 0;
    let offY = 0;
    let celebrateAt = -9;
    let idle = false;
    let quick = false;
    let lastT = 0;

    const W = { renderer, scene, camera };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    W.render = () => renderer.render(scene, camera);

    /* ------------------------------------------------------------ the cube */
    W.build = (n, state) => {
      W.settle();
      for (const b of blocks) cube.remove(b.group);
      if (core) cube.remove(core);
      size = n;
      blocks = [];
      stickers = [];
      const slots = CubeLogic.slots(n);
      const byBlock = new Map();
      slots.forEach((sl, i) => {
        const c = sl.p.map((v, k) => v - sl.normal[k]);
        const k = c.join(',');
        if (!byBlock.has(k)) byBlock.set(k, { coord: c, spots: [] });
        byBlock.get(k).spots.push(i);
      });
      const out = new THREE.Vector3();
      const z = new THREE.Vector3(0, 0, 1);
      for (const { coord, spots } of byBlock.values()) {
        const group = new THREE.Group();
        group.position.set(coord[0] / 2, coord[1] / 2, coord[2] / 2);
        group.add(new THREE.Mesh(G.block, M.body));
        for (const i of spots) {
          const nrm = slots[i].normal;
          out.set(nrm[0], nrm[1], nrm[2]);
          const mesh = new THREE.Mesh(G.sticker, M.sticker[0]);
          mesh.quaternion.setFromUnitVectors(z, out);
          mesh.position.copy(out).multiplyScalar(BLOCK / 2 - 0.008);
          const sym = new THREE.Mesh(G.symbols[0], M.ink[0]);
          sym.position.z = 0.036;
          sym.visible = symbolsOn;
          mesh.add(sym);
          group.add(mesh);
          stickers[i] = { mesh, sym };
        }
        Toon.addOutlines(group);
        cube.add(group);
        blocks.push({ group, coord });
      }
      // a dark core fills the gaps between the blocks, as on a real one
      core = new THREE.Mesh(G.core, M.core);
      core.scale.setScalar(n === 2 ? 0.84 : 1.25);
      cube.add(core);
      shadow.scale.setScalar(n * 0.78);
      shadow.position.y = -n * 0.5 - 0.75;
      placeBadges();
      W.paint(state);
      W.hint(null);
    };

    W.paint = (state) => {
      state.forEach((c, i) => {
        const st = stickers[i];
        st.mesh.material = M.sticker[c];
        st.sym.geometry = G.symbols[c];
        st.sym.material = M.ink[c];
      });
    };
    W.symbols = (on) => {
      symbolsOn = on;
      stickers.forEach((st) => { st.sym.visible = on; });
    };

    /* ------------------------------------------------ twisting, in a queue */
    // the game twists the logic at once and queues the picture: each twist
    // turns its layer, then the stickers are repainted to `after`
    W.twist = (move, after, dur, hold) => {
      queue.push({ move, after, dur: Math.max(dur, 0.01), hold: hold || 0 });
    };
    W.busy = () => !!anim || queue.length > 0;
    W.queued = () => queue.length + (anim ? 1 : 0);
    // finish every queued twist at once
    W.settle = (state) => {
      let last = null;
      if (anim) {
        last = anim.after;
        endTwist();
      }
      if (queue.length) last = queue[queue.length - 1].after;
      queue.length = 0;
      if (state) W.paint(state);
      else if (last) W.paint(last);
    };
    function startTwist(t) {
      const a = queue.shift();
      const ax = CubeLogic.axis(a.move[0]);
      for (const b of blocks) {
        if (b.coord[0] * ax[0] + b.coord[1] * ax[1] + b.coord[2] * ax[2] > size - 1.5) pivot.add(b.group);
      }
      anim = {
        axis: new THREE.Vector3(ax[0], ax[1], ax[2]),
        angle: (a.move.length > 1 ? 1 : -1) * (Math.PI / 2),
        at: t,
        dur: a.dur,
        hold: a.hold,
        after: a.after,
      };
    }
    function endTwist() {
      pivot.quaternion.identity();
      pivot.children.slice().forEach((g) => cube.add(g));
      W.paint(anim.after);
      anim = null;
    }

    /* ------------------------------------------ holding and turning the cube */
    W.setView = (index, now) => {
      target.copy(ROT_Q[index]);
      dragging = false;
      if (now) holder.quaternion.copy(target);
    };
    // drag: a sideways drag spins it about the upright, an up-down drag tips it towards you or away
    const qa = new THREE.Quaternion();
    const ax = new THREE.Vector3();
    W.drag = (dx, dy) => {
      dragging = true;
      const k = 0.0105;
      qa.setFromAxisAngle(ax.set(0, 1, 0), dx * k);
      holder.quaternion.premultiply(qa);
      qa.setFromAxisAngle(RIGHT, dy * k);
      holder.quaternion.premultiply(qa);
    };
    // the nearest of the 24 ways to hold it
    W.nearestView = () => {
      let best = 0;
      let bestDot = -1;
      ROT_Q.forEach((q, i) => {
        const d = Math.abs(q.dot(holder.quaternion));
        if (d > bestDot) {
          bestDot = d;
          best = i;
        }
      });
      return best;
    };
    W.turning = () => holder.quaternion.angleTo(target) > 0.02;

    /* ------------------------------------------------------- hint and preview */
    // a cube-frame twist to point at, or null
    W.hint = (move) => {
      arrowFor = move;
      arrow.visible = !!move;
      if (!move) return;
      const a = CubeLogic.axis(move[0]);
      const nrm = new THREE.Vector3(a[0], a[1], a[2]);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      arrow.position.copy(nrm).multiplyScalar(size / 2 + 0.05);
      arrow.scale.set(move.length > 1 ? -1 : 1, 1, 1).multiplyScalar(size * 0.29);
    };
    W.hinting = () => arrowFor;
    // which way the hinted face points now, as the player holds the cube: its badge glows
    const toward = new THREE.Vector3();
    function hintedBadge() {
      if (!arrowFor) return null;
      const a = CubeLogic.axis(arrowFor[0]);
      toward.set(a[0], a[1], a[2]).applyQuaternion(target);
      const near = badges.find(({ b }) => {
        const v = CubeLogic.axis(b.f);
        return toward.x * v[0] + toward.y * v[1] + toward.z * v[2] > 0.9;
      });
      return near ? near.b.f : null;
    }

    /* -------------------------------------------------------- face badges */
    // U, F and R show; L, D and B wait round the back, so theirs are faint.
    // Each badge sits just outside the cube's outline, by an edge of its face.
    const BADGE = [
      { f: 'U', word: 'up', at: [-0.814, 1.156], out: [-0.557, 0.83], on: true },
      { f: 'B', word: 'back', at: [0.581, 1.268], out: [0.323, 0.946], on: false },
      { f: 'R', word: 'right', at: [1.395, 0.112], out: [1, 0], on: true },
      { f: 'D', word: 'down', at: [0.814, -1.156], out: [0.557, -0.83], on: false },
      { f: 'F', word: 'front', at: [-0.581, -1.268], out: [-0.323, -0.946], on: true },
      { f: 'L', word: 'left', at: [-1.395, -0.112], out: [-1, 0], on: false },
    ];
    W.labels = () => {
      if (badges.length) return;
      for (const b of BADGE) {
        const mat = new THREE.MeshBasicMaterial({ map: badgeTexture(b.f, b.word), transparent: true, opacity: b.on ? 1 : 0.5, depthWrite: false });
        const mesh = new THREE.Mesh(G.badge, mat);
        mesh.renderOrder = 2;
        scene.add(mesh);
        badges.push({ mesh, b });
      }
      placeBadges();
    };
    function placeBadges() {
      const h = size / 2;
      const s = 0.5 + 0.06 * size;
      for (const badge of badges) {
        const { mesh, b } = badge;
        const gap = 0.12 + s / 2;
        const sx = b.at[0] * h + b.out[0] * gap;
        const sy = b.at[1] * h + b.out[1] * gap;
        mesh.position.copy(RIGHT).multiplyScalar(sx).addScaledVector(UP, sy);
        mesh.scale.setScalar(s);
        badge.base = s;
      }
    }
    function lightBadges(t) {
      const lit = hintedBadge();
      for (const { mesh, b, base } of badges) {
        const on = b.f === lit;
        mesh.scale.setScalar(base * (on ? (quick ? 1.18 : 1.16 + 0.08 * Math.sin(t * 6)) : 1));
        mesh.material.opacity = on || b.on ? 1 : 0.5;
      }
    }
    W.badgesShown = (on) => badges.forEach(({ mesh }) => { mesh.visible = on; });

    /* ------------------------------------------------------------- camera */
    // `rect` is the part of the canvas the cube should fill (clear of the buttons), in CSS pixels
    W.frame = (rect) => { frameRect = rect; };
    function placeCamera(dt, snap) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const r = frameRect || { x: 0, y: 0, w, h };
      const half = Math.max(60, Math.min(r.w, r.h) / 2);
      const t = Math.tan((FOV * Math.PI) / 360);
      const fit = size * 0.5 * 1.55 + 0.42 + 0.06 * size + 0.15;   // the cube's outline and its badges
      const want = clamp((fit * h) / (2 * half * t), 4, 60);
      const wantX = w / 2 - (r.x + r.w / 2);
      const wantY = h / 2 - (r.y + r.h / 2);
      const k = snap ? 1 : 1 - Math.exp(-7 * dt);
      dist += (want - dist) * k;
      offX += (wantX - offX) * k;
      offY += (wantY - offY) * k;
      camera.setViewOffset(w, h, offX, offY, w, h);
      camera.position.copy(DIR).multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const { mesh } of badges) mesh.quaternion.copy(camera.quaternion);
    }
    W.snapCamera = () => placeCamera(0, true);

    /* ------------------------------------------------------------ effects */
    const BURSTS = {
      sparkle: { n: 16, mat: () => M.gold, speed: 3, up: 3, size: 0.06, life: 0.8 },
      puff: { n: 12, mat: () => M.white, speed: 3, up: 1.4, size: 0.12, life: 0.45 },
      confetti: { n: 70, mat: (i) => M.confetti[i % M.confetti.length], speed: 7, up: 6, size: 0.08, life: 1.8 },
    };
    W.burst = (kind, y) => {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.set(rand(-0.3, 0.3), y == null ? size * 0.6 : y, rand(-0.3, 0.3));
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
    // a happy hop and spin when it's solved (the game skips it with reduced motion)
    W.celebrate = () => { celebrateAt = lastT; };
    // the slow turn behind the menu
    W.idle = (on) => { idle = on; };
    // quicker turns of the whole cube with reduced motion
    W.quick = (on) => { quick = on; };

    W.update = (t, dt) => {
      lastT = t;
      if (!anim && queue.length) startTwist(t);
      if (anim) {
        const k = clamp((t - anim.at) / anim.dur, 0, 1);
        pivot.quaternion.setFromAxisAngle(anim.axis, anim.angle * (quick ? smooth(k) : settle(k)));
        if (t >= anim.at + anim.dur + anim.hold) endTwist();
      }
      if (!dragging) holder.quaternion.slerp(target, 1 - Math.exp(-(quick ? 30 : 12) * dt));

      // celebration hop and spin, the menu's idle turn, or back to rest
      const c = t - celebrateAt;
      if (c < 1.1) {
        const p = c / 1.1;
        spinner.position.y = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 0.5;
        spinner.rotation.y = smooth(p) * TAU;
      } else {
        spinner.position.y = 0;
        if (idle) spinner.rotation.y = (spinner.rotation.y + dt * 0.35) % TAU;
        else if (spinner.rotation.y) {
          // ease back round to face the front, the short way
          let d = -spinner.rotation.y % TAU;
          if (d < -Math.PI) d += TAU;
          if (d > Math.PI) d -= TAU;
          spinner.rotation.y = Math.abs(d) < 0.002 ? 0 : spinner.rotation.y + d * (1 - Math.exp(-8 * dt));
        }
      }
      shadow.scale.setScalar(size * 0.78 * (1 - 0.25 * Math.max(0, spinner.position.y)));

      if (arrowFor) {
        const p = quick ? 0 : Math.sin(t * 4);
        arrowSpin.rotation.z = (arrow.scale.x < 0 ? 1 : -1) * 0.12 * p;
      }
      lightBadges(t);
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
      placeCamera(dt, false);
    };
    W.restIdle = () => { spinner.rotation.y = 0; };

    return W;
  }

  window.World = { create, COLOURS };
})();
