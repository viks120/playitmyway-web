/* Net Folding: the 3D world.
 *
 * Owns the renderer, the studio backdrop and the camera, and builds nets:
 * each face is a slab of card with its printed design on top, hung in a
 * chain of hinge groups (a flap's group pivots on the edge it shares with
 * its parent), so turning one hinge carries every flap beyond it. Shows the
 * shape to make (a solid, or a ghost outline), folds a chosen net hinge by
 * hinge with the angles worked out in nets.js, turns the result to line up
 * with the target, marks overlaps and gaps, and frames it all for any screen
 * shape. It draws; game.js decides. Needs THREE, Toon and Nets; sets
 * window.World.
 */
(function () {
  'use strict';

  const INK = '#2b2a5e';
  const CARD = '#fbf4e4';
  const DICE = '#fffdf8';
  const BAD = '#e5484d';
  const ODD = '#f08c00';
  const GOLD = '#f2b705';
  const THICK = 0.045;                        // the card's thickness
  const ELEV = 0.46;                          // the camera looks down this much (radians)
  const FOV = 34;
  const POSES = {
    flat: { yaw: 0, pitch: 0.95 },            // a flat net, tipped up to face the camera
    solid: { yaw: -0.62, pitch: 0.14 },       // a solid, turned to show three faces
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => x * x * (3 - 2 * x);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* --------------------------------------------------------- face art */
  // the printed side of a face, drawn on a canvas the shape of its bounding box
  function bounds2(pts) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.27, 0.5], [0.27, 0.75], [0.73, 0.25], [0.73, 0.5], [0.73, 0.75]],
  };
  // a colour's symbol, centred in the unit square (so colour is never the only clue)
  function symbol(x, mark, ink) {
    x.fillStyle = ink;
    x.strokeStyle = ink;
    x.beginPath();
    if (mark === 'circle') x.arc(0.5, 0.5, 0.15, 0, Math.PI * 2);
    else if (mark === 'square') x.rect(0.36, 0.36, 0.28, 0.28);
    else if (mark === 'diamond') {
      x.moveTo(0.5, 0.31);
      x.lineTo(0.69, 0.5);
      x.lineTo(0.5, 0.69);
      x.lineTo(0.31, 0.5);
    } else if (mark === 'plus' || mark === 'cross') {
      x.translate(0.5, 0.5);
      if (mark === 'cross') x.rotate(Math.PI / 4);
      x.rect(-0.18, -0.055, 0.36, 0.11);
      x.rect(-0.055, -0.18, 0.11, 0.36);
    }
    if (mark === 'ring') {
      x.lineWidth = 0.065;
      x.arc(0.5, 0.5, 0.13, 0, Math.PI * 2);
      x.stroke();
    } else {
      x.fill();
    }
  }
  function faceTexture(face, fill) {
    const bb = bounds2(face.pts);
    const m = Math.max(bb.w, bb.h);
    const cv = document.createElement('canvas');
    cv.width = Math.max(48, Math.round((256 * bb.w) / m));
    cv.height = Math.max(48, Math.round((256 * bb.h) / m));
    const x = cv.getContext('2d');
    const sx = cv.width / bb.w;
    const sy = cv.height / bb.h;
    const colour = face.colour != null ? Nets.COLOURS[face.colour].hex : face.pips != null ? DICE : fill;
    x.fillStyle = colour;
    x.fillRect(0, 0, cv.width, cv.height);
    // a printed rule just inside the edge
    const c = face.pts.reduce((s, p) => [s[0] + p[0] / face.pts.length, s[1] + p[1] / face.pts.length], [0, 0]);
    x.strokeStyle = 'rgba(43, 42, 94, 0.22)';
    x.lineWidth = 0.035 * sx;
    x.beginPath();
    face.pts.forEach((p, k) => {
      const q = [((c[0] + (p[0] - c[0]) * 0.88) - bb.x) * sx, ((c[1] + (p[1] - c[1]) * 0.88) - bb.y) * sy];
      if (k) x.lineTo(q[0], q[1]);
      else x.moveTo(q[0], q[1]);
    });
    x.closePath();
    x.stroke();
    // marks live on unit squares: draw them in the square's own units
    x.save();
    x.scale(cv.width, cv.height);
    if (face.colour != null) {
      const col = Nets.COLOURS[face.colour];
      symbol(x, col.mark, col.name === 'Yellow' ? INK : '#ffffff');
    }
    x.restore();
    x.save();
    x.scale(cv.width, cv.height);
    if (face.arrow != null) {
      x.translate(0.5, 0.5);
      x.rotate((face.arrow * Math.PI) / 2);
      x.beginPath();
      x.moveTo(0, -0.43);
      x.lineTo(0.15, -0.25);
      x.lineTo(-0.15, -0.25);
      x.closePath();
      x.fillStyle = '#ffffff';
      x.fill();
      x.lineWidth = 0.025;
      x.strokeStyle = INK;
      x.stroke();
    }
    x.restore();
    if (face.pips != null) {
      x.fillStyle = INK;
      for (const [px, py] of PIPS[face.pips]) {
        x.beginPath();
        x.arc(px * cv.width, py * cv.height, 0.085 * cv.width, 0, Math.PI * 2);
        x.fill();
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // texture coordinates for a face's caps: its bounding box, the canvas's way up
  function uvFor(bb) {
    const uv = (v, i) => new THREE.Vector2((v[i * 3] - bb.x) / bb.w, 1 - (v[i * 3 + 1] - bb.y) / bb.h);
    return {
      generateTopUV: (g, v, a, b, c) => [uv(v, a), uv(v, b), uv(v, c)],
      generateSideWallUV: () => [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)],
    };
  }
  function polyShape(pts) {
    const s = new THREE.Shape();
    pts.forEach((p, k) => (k ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    s.closePath();
    return s;
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
    {
      // a soft studio backdrop, lighter at the top
      const cv = document.createElement('canvas');
      cv.width = 4;
      cv.height = 256;
      const x = cv.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#f6fcf8');
      g.addColorStop(1, '#d4ecdd');
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      scene.background = t;
    }
    scene.add(new THREE.HemisphereLight('#ffffff', '#cde3d5', 1.7));
    const sun = new THREE.DirectionalLight('#fff6e8', 1.9);
    sun.position.set(3, 7, 5);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);

    const M = {
      ghost: new THREE.MeshBasicMaterial({ color: '#15803d', transparent: true, opacity: 0.45, depthWrite: false }),
      gap: new THREE.MeshBasicMaterial({ color: BAD, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.BackSide }),
      gapFront: new THREE.MeshBasicMaterial({ color: BAD, transparent: true, opacity: 0.35, depthWrite: false }),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
    };
    const G = {
      rod: new THREE.CylinderGeometry(0.016, 0.016, 1, 8),
      bit: new THREE.SphereGeometry(1, 8, 6),
    };
    const KEEP = new Set([M.ghost, M.gap, M.gapFront, G.rod]);
    const UP = new THREE.Vector3(0, 1, 0);
    const X = new THREE.Vector3(1, 0, 0);
    const IDQ = new THREE.Quaternion();
    const v3 = new THREE.Vector3();
    const mat4 = (R) => new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);

    const W = { renderer, scene, camera };
    const view = { yaw: POSES.solid.yaw, pitch: POSES.solid.pitch, yawT: POSES.solid.yaw, pitchT: POSES.solid.pitch, spin: false };
    let target = null;                  // the shape to make, already folded
    let folder = null;                  // the net being folded (or lying flat)
    let goal = null;                    // a ghost outline, before any net is chosen
    let calm = false;
    const cam = { c: new THREE.Vector3(), d: 8, ready: false };
    const bits = [];

    /* A wire outline of a solid: thin rods along its edges. */
    function wire(solid, parent) {
      const g = new THREE.Group();
      const seen = new Set();
      solid.faces.forEach((poly) => poly.forEach((p, k) => {
        const q = poly[(k + 1) % poly.length];
        const key = [p, q].map((v) => v.map((x) => x.toFixed(3)).join(',')).sort().join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const a = new THREE.Vector3(p[0], p[1], p[2]);
        const b = new THREE.Vector3(q[0], q[1], q[2]);
        const rod = new THREE.Mesh(G.rod, M.ghost);
        rod.scale.set(1, a.distanceTo(b), 1);
        rod.position.copy(a).add(b).multiplyScalar(0.5);
        rod.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
        g.add(rod);
      }));
      parent.add(g);
      return g;
    }
    // a flat 3D polygon (a gap in a solid), drawn both sides
    function polyMesh(pts3, normal, parent) {
      const o = new THREE.Vector3(pts3[0][0], pts3[0][1], pts3[0][2]);
      const ex = new THREE.Vector3(pts3[1][0], pts3[1][1], pts3[1][2]).sub(o).normalize();
      const n = new THREE.Vector3(normal[0], normal[1], normal[2]);
      const ey = n.clone().cross(ex);
      const flat = pts3.map((p) => {
        v3.set(p[0], p[1], p[2]).sub(o);
        return [v3.dot(ex), v3.dot(ey)];
      });
      const geo = new THREE.ExtrudeGeometry(polyShape(flat), { depth: 0.004, bevelEnabled: false });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, M.gap), new THREE.Mesh(geo, M.gapFront));
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, n));
      g.position.copy(o);
      parent.add(g);
      return g;
    }

    /* A net as nested groups: root (slides left and right) > view (the
     * player's turn) > settle (lines the folded solid up) > body (net
     * coordinates, moved so the net stays centred) > a group per face, each
     * hung from its parent's group on a hinge group at their shared edge. */
    function build(net, opts) {
      const r = Nets.fold(net);
      const ob = { net, r, root: new THREE.Group(), view: new THREE.Group(), settle: new THREE.Group(), body: new THREE.Group() };
      ob.root.add(ob.view);
      ob.view.add(ob.settle);
      ob.settle.add(ob.body);
      ob.groups = [];
      ob.faces = [];
      ob.hinges = r.hinges.map((h) => Object.assign({}, h, { p: -1 }));
      net.faces.forEach((f, i) => {
        const g = new THREE.Group();
        if (f.parent < 0) ob.body.add(g);
        else {
          const A = f.hinge[0];
          const hg = new THREE.Group();
          hg.position.set(A[0], 0, A[1]);
          ob.groups[f.parent].add(hg);
          g.position.set(-A[0], 0, -A[1]);
          hg.add(g);
          const h = ob.hinges.find((x) => x.face === i);
          h.group = hg;
          h.axis3 = new THREE.Vector3(h.axis[0], h.axis[1], h.axis[2]);
        }
        ob.groups[i] = g;
        const bb = bounds2(f.pts);
        const shape = polyShape(f.pts);
        const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, UVGenerator: uvFor(bb) });
        slabGeo.rotateX(Math.PI / 2);                 // (u, v) on the page -> (u, 0, v); the card's thickness hangs below
        // coloured faces are coloured card right through, so their colour shows from inside too
        const body = f.colour != null ? Nets.COLOURS[f.colour].hex : f.pips != null ? DICE : opts.card || CARD;
        const slabMat = Toon.toon(body, INK);
        const slab = new THREE.Mesh(slabGeo, slabMat);
        Toon.addOutlines(slab);
        const decalGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false, UVGenerator: uvFor(bb) });
        decalGeo.rotateX(Math.PI / 2);
        const decalMat = Toon.toon('#ffffff');
        decalMat.map = faceTexture(f, opts.card || CARD);
        decalMat.needsUpdate = true;
        const decal = new THREE.Mesh(decalGeo, decalMat);
        decal.position.y = 0.0045;
        g.add(slab, decal);
        if ((f.colour != null || f.pips != null) && f.arrow == null) {
          // printed on the back as well, so a far face reads through the see-through ones (its marks look the same either way round)
          const back = new THREE.Mesh(decalGeo, decalMat);
          back.position.y = -THICK - 0.0025;
          g.add(back);
        }
        ob.faces.push({ slab, decal, slabMat, decalMat, hull: slab.children.find((c) => c.userData.outline) });
      });
      const flat = [].concat(...net.faces.map((f) => f.pts));
      const fx = flat.map((p) => p[0]);
      const fz = flat.map((p) => p[1]);
      ob.flatC = [(Math.min(...fx) + Math.max(...fx)) / 2, 0, (Math.min(...fz) + Math.max(...fz)) / 2];
      ob.solidC = r.solid.centre;
      ob.ghost = opts.ghost ? wire(r.solid, ob.body) : null;
      ob.gaps = r.gaps.map((s) => {
        const m = polyMesh(r.solid.faces[s], r.solid.normals[s], ob.body);
        m.visible = false;
        return m;
      });
      setFold(ob, opts.folded ? 1 : 0);
      if (opts.turn) ob.settle.quaternion.setFromRotationMatrix(mat4(opts.turn));
      scene.add(ob.root);
      return ob;
    }
    // every hinge to the same fraction folded, and the body moved to keep it centred
    function setFold(ob, p) {
      ob.hinges.forEach((h) => setHinge(h, p));
      centreBody(ob, p);
    }
    function setHinge(h, p) {
      if (h.p === p) return;
      h.p = p;
      h.group.quaternion.setFromAxisAngle(h.axis3, h.angle * p);
    }
    function centreBody(ob, p) {
      const c = ob.flatC.map((x, k) => x + (ob.solidC[k] - x) * p);
      ob.body.position.set(-c[0], -c[1], -c[2]);
    }
    function drop(ob) {
      if (!ob) return;
      scene.remove(ob.root);
      Toon.dispose(ob.root, KEEP);
    }
    // a ghost outline on its own, before a net is chosen
    function goalFor(kind) {
      const net = kind === 'cube' ? Nets.netFromCells([{ x: 0, y: 0 }]) : null;
      if (!net) return null;
      const r = Nets.fold(net);
      const ob = { root: new THREE.Group(), view: new THREE.Group(), settle: new THREE.Group(), body: new THREE.Group(), faces: [], groups: [], r, ghostOnly: true };
      ob.root.add(ob.view);
      ob.view.add(ob.settle);
      ob.settle.add(ob.body);
      ob.ghost = wire(r.solid, ob.body);
      ob.body.position.set(-r.solid.centre[0], -r.solid.centre[1], -r.solid.centre[2]);
      scene.add(ob.root);
      return ob;
    }

    /* ------------------------------------------------------------ marks */
    function outline(face, color, thick) {
      if (!face.hull) return;
      face.hull.material.uniforms.color.value.set(color);
      face.hull.material.uniforms.thickness.value = thick;
    }
    function fade(face, on) {
      for (const m of [face.slabMat, face.decalMat]) {
        m.transparent = on;
        m.opacity = on ? 0.16 : 1;
        m.depthWrite = !on;
        m.needsUpdate = true;
      }
      if (face.hull) face.hull.visible = !on;
    }
    function clearMarks(ob) {
      ob.faces.forEach((f) => {
        outline(f, INK, 0.024);
        f.decalMat.color.set('#ffffff');
        fade(f, false);
      });
      ob.gaps.forEach((g) => { g.visible = false; });
    }
    function applyMarks(ob, marks) {
      (marks.fade || []).forEach((i) => fade(ob.faces[i], true));
      (marks.glow || []).forEach((i) => outline(ob.faces[i], GOLD, 0.05));
      (marks.miss || []).forEach((i) => outline(ob.faces[i], BAD, 0.075));
      (marks.overlap || []).forEach((i) => {
        outline(ob.faces[i], BAD, 0.05);
        ob.faces[i].decalMat.color.set('#ffc9c9');
      });
      (marks.stray || []).forEach((i) => {
        outline(ob.faces[i], ODD, 0.05);
        ob.faces[i].decalMat.color.set('#ffdcb0');
      });
      if (marks.gaps) ob.gaps.forEach((g) => { g.visible = true; });
    }

    /* ------------------------------------------------------- the scene */
    W.show = (spec) => {
      drop(target);
      drop(folder);
      drop(goal);
      target = spec.target ? build(spec.target.net, { card: '#d6efdf', folded: true, turn: spec.target.turn }) : null;
      folder = spec.flat ? build(spec.flat, {}) : null;
      goal = !folder && spec.goal ? goalFor(spec.goal) : null;
      view.spin = !!spec.spin;
      W.pose(spec.flat ? 'flat' : 'solid', true);
      layout(0, true);
      frame(0, true);
    };

    /* Fold a net, hinge by hinge, nearest the first face first. Then turn
     * it to `settle` (a 3×3 turn, or none) and show the marks. Returns how
     * long it all takes, in seconds. */
    W.fold = (net, opts) => {
      if (!folder || folder.net !== net) {
        drop(folder);
        folder = build(net, { ghost: !!opts.ghost });
        folder.fresh = true;
      }
      drop(goal);
      goal = null;
      calm = !!opts.calm;
      const step = calm ? 0.32 : 0.42;
      const dur = calm ? 0 : 0.55;
      const steps = folder.hinges.map((h, k) => ({ start: 0.35 + k * step, dur }));
      const end = steps.length ? steps[steps.length - 1].start + dur : 0.35;
      const settleQ = new THREE.Quaternion();
      if (opts.settle) settleQ.setFromRotationMatrix(mat4(opts.settle));
      else if (opts.show) {
        // turn the face with outward normal `show` to look at the camera, seen from the usual pose
        const p = POSES.solid;
        const vq = new THREE.Quaternion().setFromAxisAngle(X, p.pitch).multiply(new THREE.Quaternion().setFromAxisAngle(UP, p.yaw));
        const toCam = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV)).applyQuaternion(vq.invert());
        settleQ.setFromUnitVectors(new THREE.Vector3(opts.show[0], opts.show[1], opts.show[2]).normalize(), toCam);
      }
      folder.anim = {
        t0: W.now,
        steps,
        mid: 0.35 + (end - 0.35) * 0.4,
        settleAt: end + 0.2,
        settleDur: calm ? 0 : 0.8,
        settleQ,
        marks: opts.marks || {},
        onHinge: opts.onHinge,
        onSettle: opts.onSettle,
        posed: false,
        marked: false,
      };
      folder.hinges.forEach((h) => { h.clicked = false; });
      setFold(folder, 0);
      folder.settle.quaternion.copy(IDQ);
      clearMarks(folder);
      W.pose('flat');
      return end + 0.2 + (calm ? 0 : 0.8);
    };
    // the same fold again, from flat, ending the same way
    W.replay = () => {
      if (!folder || !folder.anim) return 0;
      const a = folder.anim;
      const total = W.fold(folder.net, { calm, marks: a.marks, onHinge: a.onHinge, onSettle: a.onSettle });
      folder.anim.settleQ = a.settleQ;
      return total;
    };
    W.busy = () => !!(folder && folder.anim && W.now < folder.anim.t0 + folder.anim.settleAt + folder.anim.settleDur);
    W.hasFold = () => !!(folder && folder.anim);

    function animate(ob, t) {
      const a = ob.anim;
      const s = t - a.t0;
      let total = 0;
      ob.hinges.forEach((h, k) => {
        const st = a.steps[k];
        const p = st.dur ? smooth(clamp((s - st.start) / st.dur, 0, 1)) : s >= st.start ? 1 : 0;
        setHinge(h, p);
        if (!h.clicked && p >= 1) {
          h.clicked = true;
          if (a.onHinge) a.onHinge(k);
        }
        total += p;
      });
      centreBody(ob, ob.hinges.length ? total / ob.hinges.length : 1);
      if (!a.posed && s >= a.mid) {
        a.posed = true;
        W.pose('solid');
      }
      const u = a.settleDur ? smooth(clamp((s - a.settleAt) / a.settleDur, 0, 1)) : s >= a.settleAt ? 1 : 0;
      ob.settle.quaternion.copy(IDQ).slerp(a.settleQ, u);
      if (!a.marked && s >= a.settleAt) {
        a.marked = true;
        applyMarks(ob, a.marks);
      }
      if (!a.settled && s >= a.settleAt + a.settleDur) {
        a.settled = true;
        if (a.onSettle) a.onSettle();
      }
    }

    /* ------------------------------------------------ the player's view */
    W.pose = (name, snap) => {
      const p = POSES[name];
      view.yawT = p.yaw;
      view.pitchT = p.pitch;
      if (snap) {
        view.yaw = p.yaw;
        view.pitch = p.pitch;
      }
    };
    W.turn = (dyaw, dpitch) => {
      view.yawT += dyaw;
      view.pitchT = clamp(view.pitchT + dpitch, -1.3, 1.3);
    };
    W.angles = () => ({ yaw: view.yawT, pitch: view.pitchT });

    /* --------------------------------------------- layout and the camera */
    const objects = () => [target, folder || goal].filter(Boolean);
    // where an object reaches, in the world: its faces (and outline, if any)
    function extent(ob) {
      ob.root.updateMatrixWorld(true);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      const take = (m, p) => {
        v3.set(p[0], p[1], p[2]).applyMatrix4(m);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], v3.getComponent(k));
          hi[k] = Math.max(hi[k], v3.getComponent(k));
        }
      };
      if (ob.net) ob.net.faces.forEach((f, i) => f.pts.forEach((p) => take(ob.groups[i].matrixWorld, [p[0], 0, p[1]])));
      if (ob.ghost || ob.ghostOnly) ob.r.solid.faces.forEach((poly) => poly.forEach((p) => take(ob.body.matrixWorld, p)));
      return { lo, hi };
    }
    function layout(dt, snap) {
      const obs = objects();
      const ext = obs.map(extent);
      const gap = camera.aspect < 1.3 ? 0.5 : 0.8;          // closer together on narrow screens
      const widths = ext.map((e) => e.hi[0] - e.lo[0]);
      let x = -(widths.reduce((s, w) => s + w, 0) + gap * (obs.length - 1)) / 2;
      obs.forEach((ob, k) => {
        const want = x - (ext[k].lo[0] - ob.root.position.x);
        const P = ob.root.position;
        // a net just built appears in its place; the rest slide over to make room
        P.x = snap || ob.fresh ? want : P.x + (want - P.x) * (1 - Math.exp(-5 * dt));
        ob.fresh = false;
        x += widths[k] + gap;
      });
    }
    /* The camera looks down from the front at ELEV and backs off until every
     * corner of everything fits, with room for the corner buttons. */
    function frame(dt, snap) {
      const obs = objects();
      if (!obs.length) return;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      obs.forEach((ob) => {
        const e = extent(ob);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], e.lo[k]);
          hi[k] = Math.max(hi[k], e.hi[k]);
        }
      });
      const c = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      const dir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
      const up = new THREE.Vector3(0, Math.cos(ELEV), -Math.sin(ELEV));
      const tv = Math.tan((FOV * Math.PI) / 360);
      const th = tv * camera.aspect;
      let D = 2.5;
      for (let i = 0; i < 8; i++) {
        v3.set(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]).sub(c);
        const x = Math.abs(v3.x);
        const y = v3.dot(up);
        const z = v3.dot(dir);
        D = Math.max(D, z + x / (th * 0.86), z + (y > 0 ? y / (tv * 0.74) : -y / (tv * 0.88)));
      }
      D += 0.2;
      if (snap || !cam.ready) {
        cam.c.copy(c);
        cam.d = D;
        cam.ready = true;
      } else {
        const k = 1 - Math.exp(-4 * dt);
        cam.c.lerp(c, k);
        cam.d += (D - cam.d) * k;
      }
      camera.position.copy(cam.c).addScaledVector(dir, cam.d);
      camera.lookAt(cam.c);
      camera.updateMatrixWorld();
    }

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      frame(0, true);
    };
    W.render = () => renderer.render(scene, camera);

    /* ------------------------------------------------------------ effects */
    W.burst = () => {
      const ob = folder || target;
      if (!ob) return;
      const e = extent(ob);
      const pos = new THREE.Vector3((e.lo[0] + e.hi[0]) / 2, e.hi[1] + 0.2, (e.lo[2] + e.hi[2]) / 2);
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(G.bit, i % 3 ? M.gold : M.white);
        m.position.copy(pos);
        m.scale.setScalar(0.05);
        scene.add(m);
        bits.push({ m, v: new THREE.Vector3(rand(-1.4, 1.4), rand(1.6, 3.2), rand(-1.4, 1.4)), life: 0.8, max: 0.8 });
      }
    };

    W.now = 0;
    W.update = (t, dt) => {
      W.now = t;
      if (view.spin && !calm) view.yawT += dt * 0.35;
      const k = calm ? 1 : 1 - Math.exp(-9 * dt);
      view.yaw += (view.yawT - view.yaw) * k;
      view.pitch += (view.pitchT - view.pitch) * k;
      const q = new THREE.Quaternion().setFromAxisAngle(X, view.pitch).multiply(new THREE.Quaternion().setFromAxisAngle(UP, view.yaw));
      objects().forEach((ob) => ob.view.quaternion.copy(q));
      if (folder && folder.anim) animate(folder, t);
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
        b.m.scale.setScalar(0.05 * Math.sqrt(b.life / b.max));
      }
      layout(dt, false);
      frame(dt, false);
    };
    W.setCalm = (on) => { calm = on; };

    return W;
  }

  window.World = { create };
})();
