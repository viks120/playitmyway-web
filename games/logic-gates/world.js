/* Logic Gates: the 3D world.
 *
 * Owns the renderer, the desk and the circuit board, the input switches, the
 * gate slots and the gate blocks (each one shaped like its standard symbol,
 * with its name on top), the output lamps, the wires (with junction dots
 * where they branch and little bridges where they cross), the current that
 * glows and flows along every wire carrying a 1, the camera, picking a part
 * from a tap, and the effects. It draws; game.js decides. Needs THREE, Toon
 * and GateArt; sets window.World.
 *
 * Board units come from Gates.layout: x runs with the signal and y runs down
 * the board. In the scene, x stays x and y becomes z (towards the camera).
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  const SKY = '#e3f1e7';
  const INK = '#2b2a5e';
  const PITCH = 1.1;                    // how steeply the camera looks down
  const FOV = 28;
  const WIRE_W = 0.075;
  const WIRE_H = 0.04;
  const BODY_H = 0.22;                  // gate blocks stand this tall
  const SPEED = 1.5;                    // current pulses, board units a second
  const GAP = 0.55;                     // ... and the space between them
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const darker = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t);
    x.arcTo(l + w, t, l + w, t + h, r);
    x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r);
    x.arcTo(l, t, l + w, t, r);
    x.closePath();
  }

  // the biggest font size up to size that fits text in maxW
  function fitFont(x, text, maxW, size) {
    let s = size;
    x.font = `700 ${s}px ${FONT}`;
    while (s > 10 && x.measureText(text).width > maxW) {
      s -= 2;
      x.font = `700 ${s}px ${FONT}`;
    }
    return s;
  }

  function roundedShape(x0, y0, x1, y1, r) {
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0);
    s.lineTo(x1 - r, y0);
    s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r);
    s.quadraticCurveTo(x1, y1, x1 - r, y1);
    s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
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
    const maxAniso = renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfe6d6', 1.6));
    const sun = new THREE.DirectionalLight('#fff6e6', 1.8);
    sun.position.set(-4, 10, 7);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);

    /* ------------------------------------------------- canvas textures */
    const painters = new Set();         // everything with text, to redraw once the font arrives
    function canvasTexture(w, h, draw) {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const x = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, maxAniso);
      const paint = () => {
        x.clearRect(0, 0, w, h);
        draw(x, w, h);
        tex.needsUpdate = true;
      };
      paint();
      const entry = { tex, paint };
      painters.add(entry);
      entry.dispose = () => {
        painters.delete(entry);
        tex.dispose();
      };
      return entry;
    }

    const M = {
      desk: Toon.toon('#d3e9d9'),
      shadow: Toon.flat('#0d3b22', 0.16),
      board: Toon.toon('#22764b', '#11482c'),
      silk: Toon.flat('#bfe6cf'),
      hole: Toon.flat('#0f3a24'),
      gold: Toon.toon('#e3b04f'),
      wire: [Toon.toon('#c98a42'), Toon.flat('#ffe14a')],   // carrying 0, carrying 1
      dead: Toon.toon('#5f7268'),                           // no signal
      pulse: Toon.flat('#fffbe2'),
      body: Toon.toon('#334155', '#1c2533'),
      lampBase: Toon.toon('#3d4b5c', '#253141'),
      neck: Toon.toon('#d9a441'),
      bulbOff: Toon.toon('#dde5ea', '#8f9ca8'),
      bulbDead: Toon.toon('#a2acb6', '#76818d'),
      bulbOn: Toon.flat('#fff3a0'),
      halo: Toon.flat('#ffe14a', 0.42),
      haloWide: Toon.flat('#ffe14a', 0.17),
      select: Toon.flat('#2563eb', 0.95),
      white: Toon.flat('#ffffff'),
      gold2: Toon.flat('#ffcf4a'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    const G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      disc: new THREE.CircleGeometry(1, 40),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
      ball: new THREE.SphereGeometry(1, 28, 18),
      bit: new THREE.SphereGeometry(1, 8, 6),
      arch: new THREE.TorusGeometry(0.13, WIRE_W / 2, 8, 18, Math.PI),
      ring: new THREE.TorusGeometry(0.09, 0.022, 8, 24),
    };
    const KEEP = new Set(Object.values(G).concat(Object.values(M).flat()));

    const desk = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.desk);
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -0.34;
    scene.add(desk);
    const boardG = new THREE.Group();
    scene.add(boardG);

    /* ------------------------------------------------------ gate blocks */
    const gateKit = {};                  // per gate type: geometry, materials and the cap layout
    function capUV(geo) {
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const lid = geo.groups.find((g) => g.materialIndex === 0);
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let v = lid.start; v < lid.start + lid.count; v++) {
        x0 = Math.min(x0, pos.getX(v));
        x1 = Math.max(x1, pos.getX(v));
        y0 = Math.min(y0, pos.getY(v));
        y1 = Math.max(y1, pos.getY(v));
      }
      for (let v = lid.start; v < lid.start + lid.count; v++) {
        uv.setXY(v, (pos.getX(v) - x0) / (x1 - x0), (pos.getY(v) - y0) / (y1 - y0));
      }
      uv.needsUpdate = true;
      return { x0, x1, y0, y1 };
    }
    function extrude(cmds) {
      const shape = new THREE.Shape();
      GateArt.trace(shape, cmds);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: BODY_H - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 1, curveSegments: 22 });
      const box = capUV(geo);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.01, 0);
      return { geo, box };
    }
    function kit(id) {
      if (gateKit[id]) return gateKit[id];
      const c = GateArt.COLORS[id];
      const o = GateArt.outline(id);
      const body = extrude(o.body);
      const k = {
        o,
        body,
        side: Toon.toon(c.side, darker(c.side, 0.62)),
        extra: o.extra ? extrude(o.extra) : null,
        extraMat: Toon.toon(c.ink),
        caps: {},
      };
      KEEP.add(body.geo).add(k.side).add(k.extraMat);
      if (k.extra) KEEP.add(k.extra.geo);
      gateKit[id] = k;
      return k;
    }
    // the top of a gate: its name, and the slot's number in a corner
    function capMaterial(id, n) {
      const k = kit(id);
      const key = String(n);
      if (k.caps[key]) return k.caps[key];
      const { x0, x1, y0, y1 } = k.body.box;
      const PX = 320;
      const W = Math.ceil((x1 - x0) * PX);
      const H = Math.ceil((y1 - y0) * PX);
      const c = GateArt.COLORS[id];
      const at = (x, y) => [(x - x0) * PX, (y1 - y) * PX];
      const art = canvasTexture(W, H, (x) => {
        x.fillStyle = c.cap;
        x.fillRect(0, 0, W, H);
        const l = k.o.label;
        x.fillStyle = c.ink;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.font = `700 ${Math.round(l.size * PX)}px ${FONT}`;
        const [tx, ty] = at(l.x, l.y);
        x.fillText(id, tx, ty + l.size * PX * 0.06);
        const left = id === 'XOR' ? GateArt.G.L + GateArt.G.gap : GateArt.G.L;
        const [nx, ny] = at(left + 0.12, id === 'NOT' ? 0.17 : GateArt.G.H - 0.11);
        x.fillStyle = INK;
        x.beginPath();
        x.arc(nx, ny, 0.075 * PX, 0, TAU);
        x.fill();
        x.fillStyle = '#ffffff';
        x.font = `700 ${Math.round(0.11 * PX)}px ${FONT}`;
        x.fillText(String(n), nx, ny + 2);
      });
      const mat = new THREE.MeshBasicMaterial({ map: art.tex });
      KEEP.add(mat);
      k.caps[key] = mat;
      return mat;
    }
    // an outline hull for a mesh whose material is a list (Toon only outlines single materials)
    function hullFor(geo, toonMat) {
      const tmp = new THREE.Mesh(geo, toonMat);
      Toon.addOutlines(tmp);
      const hull = tmp.children.find((ch) => ch.userData.outline);
      tmp.remove(hull);
      return hull;
    }
    function makeGate(id, n) {
      const k = kit(id);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(k.body.geo, [capMaterial(id, n), k.side]));
      g.add(hullFor(k.body.geo, k.side));
      if (k.extra) {
        const arc = new THREE.Mesh(k.extra.geo, k.extraMat);
        g.add(arc);
      }
      if (k.o.bubble) {
        const b = new THREE.Mesh(G.cyl, [k.side, M.white, k.side]);
        b.scale.set(k.o.bubble.r, BODY_H, k.o.bubble.r);
        b.position.set(k.o.bubble.x, BODY_H / 2, 0);
        g.add(b);
        Toon.addOutlines(b);
      }
      return g;
    }

    /* ------------------------------------------------------- the level */
    let L = null;                       // everything about the board on show
    let calm = false;
    const insets = { top: 60, bottom: 70, side: 14 };
    const sig = { inputs: [], slots: [], outputs: [] };
    const valueOf = (src) => (src.kind === 'in' ? sig.inputs[src.i] : sig.slots[src.i]);
    const wireMat = (v) => (v == null ? M.dead : M.wire[v]);

    function clearBoard() {
      if (!L) return;
      L.textures.forEach((t) => t.dispose());
      boardG.traverse((o) => {
        if (o.isMesh && o.geometry && !KEEP.has(o.geometry)) o.geometry.dispose();
      });
      L.materials.forEach((m) => m.dispose());
      boardG.clear();
    }

    // a straight run of wire between two board points, at height y
    function run(parent, a, b, mat, y) {
      const m = new THREE.Mesh(G.box, mat);
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (Math.abs(dz) < 1e-6) m.scale.set(len + WIRE_W, WIRE_H, WIRE_W);
      else m.scale.set(WIRE_W, WIRE_H, len + WIRE_W);
      m.position.set((a[0] + b[0]) / 2, (y || 0) + WIRE_H / 2, (a[1] + b[1]) / 2);
      parent.add(m);
      return m;
    }

    const W = { renderer, scene, camera };

    W.build = (level, lay) => {
      clearBoard();
      const b = lay.bounds;
      const maxX = b.maxX + 0.45;                         // room for the lamp labels
      const cx = (b.minX + maxX) / 2;
      const cz = (b.minY + b.maxY) / 2;
      const P = (x, y) => [x - cx, y - cz];               // board point to scene x, z
      L = {
        level, lay, cx, cz,
        box: { x0: b.minX - cx, x1: maxX - cx, z0: b.minY - cz, z1: b.maxY - cz },
        textures: [],
        materials: [],
        switches: [],
        slots: [],
        lamps: [],
        wires: [],
        joints: [],
        selected: null,
        lit: [],
      };
      const tex = (w, h, draw) => {
        const t = canvasTexture(w, h, draw);
        L.textures.push(t);
        return t;
      };
      const basic = (map, extra) => {
        const m = new THREE.MeshBasicMaterial(Object.assign({ map }, extra || {}));
        L.materials.push(m);
        return m;
      };

      // the board itself: a rounded green slab with a printed border and four mounting holes
      const { x0, x1, z0, z1 } = L.box;
      const slab = new THREE.ExtrudeGeometry(roundedShape(x0, -z1, x1, -z0, 0.32), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10 });
      slab.rotateX(-Math.PI / 2);
      slab.translate(0, -0.24, 0);
      const board = new THREE.Mesh(slab, M.board);
      boardG.add(board);
      Toon.addOutlines(board);
      const inset = 0.12;
      for (const [ax, az, bx, bz] of [[x0 + inset, z0 + inset, x1 - inset, z0 + inset], [x0 + inset, z1 - inset, x1 - inset, z1 - inset], [x0 + inset, z0 + inset, x0 + inset, z1 - inset], [x1 - inset, z0 + inset, x1 - inset, z1 - inset]]) {
        const line = new THREE.Mesh(G.box, M.silk);
        line.scale.set(Math.max(Math.abs(bx - ax), 0.025) + 0.025, 0.004, Math.max(Math.abs(bz - az), 0.025) + 0.025);
        line.position.set((ax + bx) / 2, 0.002, (az + bz) / 2);
        boardG.add(line);
      }
      for (const [hx, hz] of [[x0 + 0.25, z0 + 0.25], [x1 - 0.25, z0 + 0.25], [x0 + 0.25, z1 - 0.25], [x1 - 0.25, z1 - 0.25]]) {
        const ring = new THREE.Mesh(G.ring, M.gold);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(hx, 0.01, hz);
        const hole = new THREE.Mesh(G.disc, M.hole);
        hole.rotation.x = -Math.PI / 2;
        hole.scale.setScalar(0.075);
        hole.position.set(hx, 0.004, hz);
        boardG.add(ring, hole);
      }
      // a soft shadow on the desk
      const shade = tex(128, 128, (x, w, h) => {
        x.fillStyle = 'rgba(255,255,255,0)';
        x.fillRect(0, 0, w, h);
        x.shadowColor = 'rgba(0,0,0,1)';
        x.shadowBlur = 18;
        x.fillStyle = 'rgba(0,0,0,1)';
        roundRect(x, 22, 22, w - 44, h - 44, 10);
        x.fill();
      });
      const shadow = new THREE.Mesh(G.plane, basic(shade.tex, { transparent: true, opacity: 0.22, depthWrite: false, color: '#0b3a20' }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set((x1 - x0) * 1.3 + 0.8, (z1 - z0) * 1.3 + 0.8, 1);
      shadow.position.set(0.25, -0.33, 0.35);
      boardG.add(shadow);

      // the switches
      lay.inputs.forEach((n, i) => {
        const name = level.inputs[i].name;
        const g = new THREE.Group();
        const [sx, sz] = P(n.x, n.y);
        g.position.set(sx, 0, sz);
        const body = new THREE.Mesh(G.box, M.body);
        body.scale.set(2 * n.hw - 0.04, 0.16, 2 * n.hh - 0.04);
        body.position.y = 0.08;
        g.add(body);
        Toon.addOutlines(body);
        const caps = [0, 1].map((v) => tex(256, 208, (x, w, h) => {
          x.fillStyle = '#1e293b';
          roundRect(x, 0, 0, w, h, 26);
          x.fill();
          x.fillStyle = '#ffffff';
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          const size = fitFont(x, name, 118, name.length > 1 ? 84 : 120);
          x.fillText(name, 70, h / 2 + size * 0.06);
          // a toggle: up and yellow for 1, down and dark for 0
          const tl = 158;
          const tw = 74;
          x.fillStyle = v ? '#ffd84a' : '#0b1220';
          roundRect(x, tl, 18, tw, h - 36, tw / 2);
          x.fill();
          const ky = v ? 18 + tw / 2 : h - 18 - tw / 2;
          x.fillStyle = v ? '#ffffff' : '#475569';
          x.beginPath();
          x.arc(tl + tw / 2, ky, tw / 2 - 6, 0, TAU);
          x.fill();
          x.fillStyle = v ? '#7a5200' : '#e2e8f0';
          x.font = `700 46px ${FONT}`;
          x.fillText(String(v), tl + tw / 2, ky + 3);
        }));
        const cap = new THREE.Mesh(G.plane, basic(caps[0].tex));
        cap.rotation.x = -Math.PI / 2;
        cap.scale.set(2 * n.hw - 0.12, 2 * n.hh - 0.12, 1);
        cap.position.y = 0.161;
        g.add(cap);
        const capMats = [cap.material, basic(caps[1].tex)];
        boardG.add(g);
        L.switches.push({ g, cap, capMats, x: n.x, y: n.y, hw: n.hw, hh: n.hh, v: 0 });
      });

      // the slots: a printed socket, the leads in and out, and the gate when there is one
      lay.slots.forEach((n, i) => {
        const g = new THREE.Group();
        const [sx, sz] = P(n.x, n.y);
        g.position.set(sx, 0, sz);
        const socketArt = tex(400, 304, (x, w, h) => {
          x.fillStyle = 'rgba(8, 45, 26, 0.35)';
          roundRect(x, 8, 8, w - 16, h - 16, 30);
          x.fill();
          x.setLineDash([22, 14]);
          x.lineWidth = 7;
          x.strokeStyle = '#a9e7c4';
          x.stroke();
          x.setLineDash([]);
          x.fillStyle = '#d9f7e6';
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          x.font = `700 120px ${FONT}`;
          x.fillText('?', w / 2 + 14, h / 2 + 8);
          x.fillStyle = '#ffffff';
          x.beginPath();
          x.arc(58, 60, 30, 0, TAU);
          x.fill();
          x.fillStyle = INK;
          x.font = `700 40px ${FONT}`;
          x.fillText(String(i + 1), 58, 63);
        });
        const socket = new THREE.Mesh(G.plane, basic(socketArt.tex, { transparent: true }));
        socket.rotation.x = -Math.PI / 2;
        socket.scale.set(2 * n.hw - 0.24, 2 * n.hh, 1);
        socket.position.set(0.04, 0.004, 0);
        g.add(socket);
        const leads = new THREE.Group();
        g.add(leads);
        boardG.add(g);
        L.slots.push({ g, socket, leads, gate: null, id: null, ins: level.slots[i].in.length, n: i + 1, x: n.x, y: n.y, hw: n.hw, hh: n.hh, dropAt: -9, leadMeshes: [] });
        buildLeads(i);
      });

      // the lamps, each with its name and a tick or cross for the row on the switches
      lay.outputs.forEach((n, i) => {
        const name = level.outputs[i].name;
        const g = new THREE.Group();
        const [sx, sz] = P(n.x, n.y);
        g.position.set(sx, 0, sz);
        const base = new THREE.Mesh(G.cyl, M.lampBase);
        base.scale.set(0.3, 0.09, 0.3);
        base.position.y = 0.045;
        const neck = new THREE.Mesh(G.cyl, M.neck);
        neck.scale.set(0.13, 0.1, 0.13);
        neck.position.y = 0.13;
        const bulb = new THREE.Mesh(G.ball, M.bulbDead);
        bulb.scale.setScalar(0.25);
        bulb.position.y = 0.36;
        g.add(base, neck, bulb);
        Toon.addOutlines(g);
        const halo = new THREE.Mesh(G.disc, M.halo);
        halo.rotation.x = -Math.PI / 2;
        halo.scale.setScalar(0.52);
        halo.position.y = 0.006;
        const haloWide = new THREE.Mesh(G.disc, M.haloWide);
        haloWide.rotation.x = -Math.PI / 2;
        haloWide.scale.setScalar(0.85);
        haloWide.position.y = 0.005;
        halo.visible = false;
        haloWide.visible = false;
        g.add(halo, haloWide);
        const marks = {};
        for (const mark of ['ok', 'bad', 'none']) {
          marks[mark] = basic(tex(256, 150, (x, w, h) => {
            x.fillStyle = '#ffffff';
            roundRect(x, 4, 4, w - 8, h - 8, 34);
            x.fill();
            x.fillStyle = INK;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            fitFont(x, name, 120, 76);
            x.fillText(name, 84, h / 2 + 4);
            x.fillStyle = mark === 'ok' ? '#15803d' : mark === 'bad' ? '#dc2626' : '#94a3b8';
            x.beginPath();
            x.arc(w - 62, h / 2, 46, 0, TAU);
            x.fill();
            x.fillStyle = '#ffffff';
            x.font = `700 62px ${FONT}`;
            x.fillText(mark === 'ok' ? '✓' : mark === 'bad' ? '✗' : '?', w - 62, h / 2 + 4);
          }).tex, { transparent: true });
        }
        const label = new THREE.Mesh(G.plane, marks.none);
        label.rotation.x = -Math.PI / 2;
        label.scale.set(0.62, 0.36, 1);
        label.position.set(n.hw + 0.42, 0.006, 0);
        g.add(label);
        boardG.add(g);
        L.lamps.push({ g, bulb, halo, haloWide, label, marks, x: n.x, y: n.y, hw: n.hw, hh: n.hh, v: null, popAt: -9 });
      });

      // the wires, with a bridge wherever one has to hop over another
      const hops = {};
      lay.crossings.forEach((c) => {
        const k = c.wire + ':' + c.seg;
        (hops[k] = hops[k] || []).push(c);
      });
      lay.wires.forEach((w, wi) => {
        const meshes = [];
        const pts = [];
        const path = w.path.map(([x, y]) => P(x, y));
        const push = (x, y, z) => {
          const last = pts[pts.length - 1];
          if (!last || last.distanceTo(new THREE.Vector3(x, y, z)) > 1e-6) pts.push(new THREE.Vector3(x, y, z));
        };
        const top = WIRE_H + 0.012;
        path.forEach((p, k) => {
          if (k === 0) {
            push(p[0], top, p[1]);
            return;
          }
          const a = path[k - 1];
          const cuts = (hops[wi + ':' + (k - 1)] || []).map((c) => P(c.x, c.y))
            .sort((u, v) => Math.hypot(u[0] - a[0], u[1] - a[1]) - Math.hypot(v[0] - a[0], v[1] - a[1]));
          let from = a;
          const dir = [Math.sign(p[0] - a[0]), Math.sign(p[1] - a[1])];
          const R = 0.13;
          cuts.forEach((c) => {
            const s0 = [c[0] - dir[0] * R, c[1] - dir[1] * R];
            const s1 = [c[0] + dir[0] * R, c[1] + dir[1] * R];
            meshes.push(run(boardG, from, s0, M.dead));
            const arch = new THREE.Mesh(G.arch, M.dead);
            arch.position.set(c[0], WIRE_H / 2, c[1]);
            if (dir[1] !== 0) arch.rotation.y = Math.PI / 2;
            boardG.add(arch);
            meshes.push(arch);
            // the current climbs over the bridge too
            push(s0[0], top, s0[1]);
            for (let q = 1; q < 8; q++) {
              const ang = Math.PI - (q / 8) * Math.PI;
              const along = Math.cos(ang) * R;
              push(c[0] + dir[0] * along, top + Math.sin(ang) * R, c[1] + dir[1] * along);
            }
            push(s1[0], top, s1[1]);
            from = s1;
          });
          meshes.push(run(boardG, from, p, M.dead));
          push(p[0], top, p[1]);
        });
        const lens = [0];
        for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + pts[k].distanceTo(pts[k - 1]));
        L.wires.push({ src: w.src, meshes, pts, lens, total: lens[lens.length - 1] });
      });
      lay.junctions.forEach((j) => {
        const dot = new THREE.Mesh(G.cyl, M.dead);
        const [jx, jz] = P(j.x, j.y);
        dot.scale.set(0.075, WIRE_H + 0.02, 0.075);
        dot.position.set(jx, (WIRE_H + 0.02) / 2, jz);
        boardG.add(dot);
        L.joints.push({ mesh: dot, src: j.src });
      });

      // the selection frame
      const frame = new THREE.Group();
      L.frameSides = [0, 1, 2, 3].map(() => {
        const m = new THREE.Mesh(G.box, M.select);
        frame.add(m);
        return m;
      });
      frame.visible = false;
      boardG.add(frame);
      L.frame = frame;

      sig.inputs = level.inputs.map(() => 0);
      sig.slots = level.slots.map(() => null);
      sig.outputs = level.outputs.map(() => null);
      W.setSignals(sig);
      W.frame();
    };

    /* The leads of a slot: short wires from its edge to the gate's inputs
     * and from the gate's output to its edge. A one-wire slot holding a
     * two-input gate forks, feeding both inputs from the one wire. */
    function buildLeads(i) {
      const s = L.slots[i];
      s.leads.children.slice().forEach((m) => s.leads.remove(m));
      s.leadMeshes = [];
      const hw = s.hw;
      const o = s.id ? GateArt.outline(s.id) : null;
      const back = (y) => (o ? o.back(y) : GateArt.G.L);
      const add = (a, b, pin) => s.leadMeshes.push({ mesh: run(s.leads, a, b, M.dead), pin });
      const pin = 0.25;
      if (s.ins === 2) {
        add([-hw, -pin], [back(pin), -pin], 0);
        add([-hw, pin], [back(-pin), pin], 1);
      } else if (o && s.id !== 'NOT') {
        const fx = -hw + 0.08;
        add([-hw, 0], [fx, 0], 0);
        add([fx, -pin], [fx, pin], 0);
        add([fx, -pin], [back(pin), -pin], 0);
        add([fx, pin], [back(-pin), pin], 0);
        const dot = new THREE.Mesh(G.cyl, M.dead);
        dot.scale.set(0.07, WIRE_H + 0.02, 0.07);
        dot.position.set(fx, (WIRE_H + 0.02) / 2, 0);
        s.leads.add(dot);
        s.leadMeshes.push({ mesh: dot, pin: 0 });
      } else {
        add([-hw, 0], [back(0), 0], 0);
      }
      s.leadMeshes.push({ mesh: run(s.leads, [o ? o.tip : GateArt.G.R, 0], [hw, 0], M.dead), pin: -1 });
    }

    // put a gate in a slot, or take it out (id null); it drops in unless calm
    W.setGate = (i, id, drop) => {
      const s = L.slots[i];
      if (s.gate) {
        s.g.remove(s.gate);
        s.gate = null;
      }
      s.id = id;
      s.socket.visible = !id;
      if (id) {
        s.gate = makeGate(id, s.n);
        s.g.add(s.gate);
        s.dropAt = drop && !calm ? performance.now() / 1000 : -9;
      }
      buildLeads(i);
      W.setSignals(sig);
    };

    /* Show the signals: inputs (switch positions), the value leaving each
     * slot, and the value reaching each lamp; 1, 0 or null for none. */
    W.setSignals = (next) => {
      if (!L) return;
      sig.inputs = next.inputs.slice();
      sig.slots = next.slots.slice();
      sig.outputs = next.outputs.slice();
      L.switches.forEach((s, i) => {
        s.v = sig.inputs[i];
        s.cap.material = s.capMats[s.v ? 1 : 0];
      });
      L.wires.forEach((w) => {
        const mat = wireMat(valueOf(w.src));
        w.meshes.forEach((m) => { m.material = mat; });
      });
      L.joints.forEach((j) => { j.mesh.material = wireMat(valueOf(j.src)); });
      L.slots.forEach((s, i) => {
        const srcs = L.level.slots[i].in;
        s.leadMeshes.forEach((lm) => {
          const v = lm.pin < 0 ? (s.id ? sig.slots[i] : null) : (typeof srcs[lm.pin] === 'number' ? sig.slots[srcs[lm.pin]] : sig.inputs[L.level.inputs.findIndex((p) => p.name === srcs[lm.pin])]);
          lm.mesh.material = wireMat(v);
        });
      });
      L.lamps.forEach((l, i) => {
        const v = sig.outputs[i];
        if (v === 1 && l.v !== 1) l.popAt = performance.now() / 1000;
        l.v = v;
        l.bulb.material = v === 1 ? M.bulbOn : v === 0 ? M.bulbOff : M.bulbDead;
        l.halo.visible = v === 1;
        l.haloWide.visible = v === 1;
      });
    };

    // each lamp's tick or cross for the row the switches are showing
    W.setMarks = (marks) => {
      if (!L) return;
      L.lamps.forEach((l, i) => { l.label.material = l.marks[marks[i]] || l.marks.none; });
    };

    // the frame round the switch or slot the keyboard (or a tap) is on
    W.select = (item) => {
      if (!L) return;
      L.selected = item;
      const part = item ? (item.kind === 'in' ? L.switches[item.i] : L.slots[item.i]) : null;
      L.frame.visible = !!part;
      if (!part) return;
      const m = 0.1;
      const t = 0.05;
      const w = 2 * (part.hw + m);
      const d = 2 * (part.hh + m);
      const [px, pz] = [part.x - L.cx, part.y - L.cz];
      const sides = L.frameSides;
      sides[0].scale.set(w + t, 0.02, t);
      sides[0].position.set(px, 0.012, pz - d / 2);
      sides[1].scale.set(w + t, 0.02, t);
      sides[1].position.set(px, 0.012, pz + d / 2);
      sides[2].scale.set(t, 0.02, d + t);
      sides[2].position.set(px - w / 2, 0.012, pz);
      sides[3].scale.set(t, 0.02, d + t);
      sides[3].position.set(px + w / 2, 0.012, pz);
    };

    W.setCalm = (on) => { calm = !!on; };

    /* ------------------------------------------------------------ camera */
    W.setInsets = (top, bottom, side) => {
      insets.top = top;
      insets.bottom = bottom;
      if (side != null) insets.side = side;
      W.frame();
    };
    // fit the whole board between the tool buttons at the top and the gate buttons at the bottom
    W.frame = () => {
      if (!L) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const { x0, x1, z0, z1 } = L.box;
      const corners = [];
      for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [-0.28, 0.6]) corners.push(new THREE.Vector3(x, y, z));
      const v = new THREE.Vector3();
      const sl = insets.side;
      const sr = w - insets.side;
      const st = insets.top;
      const sb = h - insets.bottom;
      const tanHalf = Math.tan((FOV * Math.PI) / 360);
      const dMin = h / (2 * tanHalf * 120);              // never closer than 120 pixels a board unit
      let d = 16;
      let tx = 0;
      let tz = 0;
      const place = () => {
        camera.position.set(tx, d * Math.sin(PITCH), tz + d * Math.cos(PITCH));
        camera.lookAt(tx, 0, tz);
        camera.updateMatrixWorld();
      };
      for (let k = 0; k < 14; k++) {
        place();
        let l = Infinity;
        let r = -Infinity;
        let t = Infinity;
        let bt = -Infinity;
        for (const c of corners) {
          v.copy(c).project(camera);
          const px = ((v.x + 1) / 2) * w;
          const py = ((1 - v.y) / 2) * h;
          l = Math.min(l, px);
          r = Math.max(r, px);
          t = Math.min(t, py);
          bt = Math.max(bt, py);
        }
        const wpp = (2 * d * tanHalf) / h;
        tx += ((l + r) / 2 - (sl + sr) / 2) * wpp;
        tz += ((t + bt) / 2 - (st + sb) / 2) * (wpp / Math.sin(PITCH));
        const s = Math.max((r - l) / Math.max(sr - sl, 40), (bt - t) / Math.max(sb - st, 40));
        d = Math.max(d * s, dMin);
      }
      place();
    };

    W.resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = FOV;
      camera.updateProjectionMatrix();
      W.frame();
    };
    W.render = () => renderer.render(scene, camera);
    W.repaint = () => painters.forEach((p) => p.paint());

    /* ---------------------------------------------------- pointer helpers */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const deck = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.12);
    // the switch or slot under a tap, or null
    W.pick = (clientX, clientY) => {
      if (!L) return null;
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(deck, hit)) return null;
      const x = hit.x + L.cx;
      const y = hit.z + L.cz;
      const pad = 0.16;
      let best = null;
      let bestD = Infinity;
      const test = (kind, list) => list.forEach((p, i) => {
        const dx = Math.abs(x - p.x);
        const dy = Math.abs(y - p.y);
        if (dx <= p.hw + pad && dy <= p.hh + pad) {
          const dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = { kind, i };
          }
        }
      });
      test('in', L.switches);
      test('slot', L.slots);
      return best;
    };
    // where a switch, slot or lamp is on the screen, in client pixels
    W.toScreen = (item) => {
      if (!L) return null;
      const part = item.kind === 'in' ? L.switches[item.i] : item.kind === 'slot' ? L.slots[item.i] : L.lamps[item.i];
      const r = canvas.getBoundingClientRect();
      const p = new THREE.Vector3(part.x - L.cx, 0.15, part.y - L.cz).project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };

    /* ------------------------------------------------------------ effects */
    const bits = [];
    const BURSTS = {
      sparkle: { n: 16, mat: () => M.gold2, speed: 2.2, up: 2.4, size: 0.05, life: 0.75 },
      confetti: { n: 70, mat: (i) => M.confetti[i % M.confetti.length], speed: 6, up: 5, size: 0.07, life: 1.8 },
    };
    function burst(pos, kind) {
      const b = BURSTS[kind];
      for (let i = 0; i < b.n; i++) {
        const m = new THREE.Mesh(G.bit, b.mat(i));
        m.position.copy(pos);
        m.scale.setScalar(b.size);
        scene.add(m);
        bits.push({ m, v: new THREE.Vector3(rand(-0.5, 0.5) * b.speed, b.up * rand(0.6, 1.3), rand(-0.5, 0.5) * b.speed), life: b.life, max: b.life, size: b.size });
      }
    }
    // a celebration: sparkles over every lamp, and confetti unless calm
    W.cheer = () => {
      if (!L) return;
      L.lamps.forEach((l) => burst(new THREE.Vector3(l.x - L.cx, 0.6, l.y - L.cz), 'sparkle'));
      if (!calm) burst(new THREE.Vector3(0, 2.6, 0), 'confetti');
    };

    const PULSES = 600;
    const pulses = new THREE.InstancedMesh(G.bit, M.pulse, PULSES);
    pulses.count = 0;
    pulses.frustumCulled = false;
    scene.add(pulses);
    const m4 = new THREE.Matrix4();
    const pv = new THREE.Vector3();
    function pointAt(w, s, out) {
      let k = 1;
      while (k < w.lens.length - 1 && w.lens[k] < s) k++;
      const a = w.pts[k - 1];
      const b = w.pts[k];
      const span = w.lens[k] - w.lens[k - 1] || 1;
      return out.copy(a).lerp(b, clamp((s - w.lens[k - 1]) / span, 0, 1));
    }

    W.update = (t, dt) => {
      if (L) {
        // current flowing along every wire that carries a 1
        let n = 0;
        if (!calm) {
          const phase = (t * SPEED) % GAP;
          for (const w of L.wires) {
            if (valueOf(w.src) !== 1) continue;
            for (let s = phase; s < w.total && n < PULSES; s += GAP) {
              pointAt(w, s, pv);
              m4.makeScale(0.042, 0.042, 0.042).setPosition(pv.x, pv.y + 0.012, pv.z);
              pulses.setMatrixAt(n++, m4);
            }
          }
        }
        pulses.count = n;
        pulses.instanceMatrix.needsUpdate = true;
        L.slots.forEach((s) => {
          if (!s.gate) return;
          const k = clamp((t - s.dropAt) / 0.24, 0, 1);
          s.gate.position.y = 0.5 * Math.pow(1 - k, 3);
        });
        L.lamps.forEach((l) => {
          const k = clamp((t - l.popAt) / 0.25, 0, 1);
          l.bulb.scale.setScalar(0.25 * (calm ? 1 : 1 + 0.25 * Math.sin(Math.PI * k)));
        });
        if (L.frame.visible) M.select.opacity = calm ? 0.95 : 0.7 + 0.28 * Math.sin(t * 5);
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
