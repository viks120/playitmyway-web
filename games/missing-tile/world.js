/* Missing Tile: the 3D world.
 *
 * Owns the renderer, the wooden table and frame, the nine-cell board with its
 * gap, the tray of answer tiles, the shapes on every tile, the camera, picking
 * a tile under the pointer, the selection ring, the gap glow, the hint spot,
 * the greyed-out tiles, the flights of a tile into the gap and back, and the
 * effects. It draws; game.js decides. Needs THREE and Toon; sets window.World.
 *
 * Board centre at the origin; cell (row r, column c) has its centre at
 * (c - 1, 0, r - 1), row 0 far from the camera. Tiles are 0.92 square and
 * 0.08 thick with their tops at y = 0.08. The camera is orthographic, pitched
 * 62 degrees down, so a small shape is the same size wherever it sits.
 *
 * Time is in seconds and always comes from the caller: the world stores start
 * times and compares them with the t it is given, never reading a clock.
 *
 * Nothing above create() touches the document, so a Node vm test can load
 * three.min.js, toon.js and this file and call World.layout and
 * World.frameView.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const PITCH = (62 * Math.PI) / 180;    // how steeply the camera looks down
  const SIN = Math.sin(PITCH);
  const COS = Math.cos(PITCH);
  const TILE = 0.92;
  const THICK = 0.08;
  const TOP = THICK;                     // a tile's top, resting on the table
  const FRAME = 1.68;                    // half the frame's outer width
  const GAP = 8;
  const GAP_X = 1;
  const GAP_Z = 1;
  const SIZES = ['small', 'medium', 'big'];
  const RADIUS = { small: 0.09, medium: 0.13, big: 0.19 };
  const LINE = { small: 0.012, medium: 0.017, big: 0.024 };
  const PALETTE = { red: '#ef4444', yellow: '#f5b921', green: '#34c76f', blue: '#3b82f6', purple: '#a78bfa', pink: '#ff8fab' };
  // how far above the tile top each shape's origin sits, per unit of radius
  const REST = { ball: 1, cube: 0.75, pyramid: 0.7, star: 0, heart: 0, cross: 0.25 };
  const BG = '#f7e8d3';
  const PARCH = '#f3eadb';
  const LIT = '#ffffff';
  const DIM = '#e4dccd';
  const SEATS = { tall: { x: -1.1, z: -1.95, s: 0.35 }, wide: { x: -2.4, z: 0.6, s: 0.5 } };
  // The tallest critter's top on screen, in rig units, seen from the camera's
  // pitch: a head seen from above shows its depth as height, and the bunny's
  // upright ear reaches highest. A hop (Log Jam's cheer lifts the rig 0.7)
  // adds to that; both scale with the seat.
  const HEAD_UP = 1.3;
  const HOP = 0.7;
  const LIFT = 0.08;                     // a selected tile
  const SINK = 0.05;                     // a tile that is out
  const RISE = 0.05;                     // a spotlit tile
  const HOVER = 0.16;                    // a tile waiting in the gap
  const ARC = 0.45;                      // how high a flight arcs
  const DRAG_Y = 0.15;
  const DRAG_BACK = 0.5;                 // a dragged tile floats this far up-screen of the finger
  const DUR = { fly: [0.45, 0.2], accept: [0.6, 0.3], shake: [0.35, 0.15], back: [0.45, 0.2], drop: [0.3, 0.12] };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => x * x * (3 - 2 * x);
  const easeOut = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
  const rand = (a, b) => a + Math.random() * (b - a);

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

  /* ------------------------------------------------------------- layout */
  function layout(aspect) {
    return aspect > 1.05 ? 'wide' : 'tall';
  }

  /* The tray slots for n options, in reading order: rows of three below the
   * board on the tall layout, two columns to its right on the wide one. A
   * short row is centred. */
  function slots(lay, n) {
    const out = [];
    if (lay === 'wide') {
      const rows = n <= 4 ? [[2, -0.5], [2, 0.5]] : n === 5 ? [[2, -1], [2, 0], [1, 1]] : [[2, -1], [2, 0], [2, 1]];
      for (const [k, z] of rows) for (let i = 0; i < k; i++) out.push({ x: 3.1 + i - (k - 1) / 2, z });
    } else {
      const rows = n <= 4 ? [2, 2] : n === 5 ? [3, 2] : [3, 3];
      rows.forEach((k, r) => {
        for (let i = 0; i < k; i++) out.push({ x: i - (k - 1) / 2, z: 2.3 + r });
      });
    }
    return out.slice(0, n);
  }

  // everything the camera must keep in view: the frame, every tray slot, the critter
  function framePoints(lay) {
    const pts = [];
    for (const x of [-FRAME, FRAME]) for (const z of [-FRAME, FRAME]) pts.push([x, 0, z], [x, 0.11, z]);
    for (const s of slots(lay, 6)) {
      for (const dx of [-0.68, 0.68]) for (const dz of [-0.68, 0.68]) pts.push([s.x + dx, 0, s.z + dz]);
      pts.push([s.x, 0.6, s.z]);
    }
    const st = SEATS[lay];
    pts.push([st.x, st.s * (HEAD_UP / COS + HOP), st.z], [st.x - st.s, st.s * 0.5, st.z], [st.x + st.s, st.s * 0.5, st.z]);
    pts.push([st.x, 0, st.z - 0.8 * st.s], [st.x, 0, st.z + 0.8 * st.s]);
    return pts;
  }

  /* Fit the scene into the part of a w by h canvas the controls leave free
   * (insets in CSS px). The camera's frustum is in CSS px, so zoom is simply
   * pixels per world unit. Pure: it only touches the camera it is given. */
  function frameView(camera, w, h, insets, lay) {
    lay = lay || layout(w / h);
    const ins = insets || { top: 0, bottom: 0, left: 0, right: 0 };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [px, py, pz] of framePoints(lay)) {
      const sy = py * COS - pz * SIN;           // up the screen, in world units
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, sy);
      y1 = Math.max(y1, sy);
    }
    const freeW = Math.max(1, w - ins.left - ins.right);
    const freeH = Math.max(1, h - ins.top - ins.bottom);
    const zoom = Math.min(freeW / (x1 - x0), freeH / (y1 - y0));
    const ox = (ins.left + (w - ins.right)) / 2 - w / 2;      // the free rectangle's centre, from the canvas centre
    const oy = h / 2 - (ins.top + (h - ins.bottom)) / 2;
    const x = (x0 + x1) / 2 - ox / zoom;
    const z = -((y0 + y1) / 2 - oy / zoom) / SIN;
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.near = 1;
    camera.far = 60;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    const D = 20;
    camera.position.set(x, D * SIN, z + D * COS);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    return { x, z, zoom };
  }

  /* ------------------------------------------------------------- shapes */
  function starShape() {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.45 : 1;
      if (i) s.lineTo(r * Math.cos(a), r * Math.sin(a));
      else s.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    s.closePath();
    return s;
  }

  // two round lobes and a point, 2 wide; the point ends up towards the viewer
  function heartShape() {
    const s = new THREE.Shape();
    s.moveTo(-1, 0.4);
    s.absarc(-0.5, 0.4, 0.5, Math.PI, 0, true);
    s.absarc(0.5, 0.4, 0.5, Math.PI, 0, true);
    s.bezierCurveTo(1, -0.05, 0.5, -0.45, 0, -0.9);
    s.bezierCurveTo(-0.5, -0.45, -1, -0.05, -1, 0.4);
    return s;
  }

  function square(half, cx, cy) {
    const x = cx || 0;
    const y = cy || 0;
    const s = new THREE.Shape();
    s.moveTo(x - half, y - half);
    s.lineTo(x + half, y - half);
    s.lineTo(x + half, y + half);
    s.lineTo(x - half, y + half);
    s.closePath();
    return s;
  }

  // an outline extruded upwards, lying flat on y = 0
  function flatExtrude(shape, depth, curveSegments) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: curveSegments || 6 });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  /* Average the normals of a flat extrusion's walls where they share a
   * vertex, so a curved wall is smooth and its outline hull is one continuous
   * band rather than a comb of pushed-out facets. The caps keep their flat
   * normals; a cusp (where the average vanishes) keeps its own. */
  /* Average the normals of vertices that share a position: on the walls only
   * (an extruded shape keeps its flat top), or on every vertex (`all`, for an
   * outline hull of a box or cone, whose flat per-face normals would push an
   * edge-on wall sideways and leave the shape without a flank outline). */
  function smoothWalls(geo, all) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const wall = (i) => all || Math.abs(nor.getY(i)) < 0.01;
    const key = (i) => pos.getX(i).toFixed(4) + ',' + pos.getY(i).toFixed(4) + ',' + pos.getZ(i).toFixed(4);
    const acc = new Map();
    for (let i = 0; i < pos.count; i++) {
      if (!wall(i)) continue;
      const k = key(i);
      const a = acc.get(k) || [0, 0, 0];
      a[0] += nor.getX(i);
      a[1] += nor.getY(i);
      a[2] += nor.getZ(i);
      acc.set(k, a);
    }
    for (let i = 0; i < pos.count; i++) {
      if (!wall(i)) continue;
      const a = acc.get(key(i));
      const len = Math.hypot(a[0], a[1], a[2]);
      if (len > 0.3) nor.setXYZ(i, a[0] / len, a[1] / len, a[2] / len);
    }
    nor.needsUpdate = true;
    return geo;
  }

  // the table top: a wide plank surface with the gap cut out of it, the grain texture spread once across it
  function tableTop(size, hole) {
    const s = square(size / 2);
    s.holes.push(square(hole / 2, GAP_X, -GAP_Z));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 1 });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / size + 0.5, uv.getY(i) / size + 0.5);
    uv.needsUpdate = true;
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.02, 0);
    return geo;
  }

  // where the shapes of a cell sit on the tile, by count alone
  function spots(count, r) {
    const d = r + 0.02;
    if (count >= 3) return [[-d, 0.5 * r], [d, 0.5 * r], [0, -1.25 * r]];
    if (count === 2) return [[-d, 0], [d, 0]];
    return [[0, 0]];
  }

  function darker(hex) {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h, Math.min(1, hsl.s * 1.05), hsl.l * 0.62);
  }

  /* ------------------------------------------------------------- create */
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
    scene.add(new THREE.HemisphereLight('#ffffff', '#d9b48c', 1.55));
    const sun = new THREE.DirectionalLight('#fff4e6', 1.9);
    sun.position.set(-3, 9, 6);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60);

    // the table: warm planks with a soft grain
    const woodTex = canvasTexture(1024, 1024, (x, w, h) => {
      const r = seeded(21);
      x.fillStyle = '#d8a46c';
      x.fillRect(0, 0, w, h);
      const plank = 96;
      for (let y0 = 0; y0 < h; y0 += plank) {
        x.fillStyle = `hsl(31, 56%, ${61 + (r() - 0.5) * 5}%)`;
        x.fillRect(0, y0, w, plank);
        x.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
          const yy = y0 + 8 + r() * (plank - 16);
          x.strokeStyle = `rgba(128, 78, 38, ${0.07 + r() * 0.13})`;
          x.lineWidth = 1 + r() * 2;
          x.beginPath();
          x.moveTo(0, yy);
          const f = 0.004 + r() * 0.008;
          const ph = r() * TAU;
          for (let xx = 16; xx <= w; xx += 16) x.lineTo(xx, yy + Math.sin(xx * f + ph) * (2 + r() * 3));
          x.stroke();
        }
        x.strokeStyle = 'rgba(110, 66, 30, 0.38)';
        x.lineWidth = 2.5;
        x.beginPath();
        x.moveTo(0, y0 + 0.5);
        x.lineTo(w, y0 + 0.5);
        x.stroke();
        x.strokeStyle = 'rgba(255, 236, 200, 0.28)';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(0, y0 + 3);
        x.lineTo(w, y0 + 3);
        x.stroke();
      }
    });

    const G = {
      ball: new THREE.SphereGeometry(1, 18, 12),
      cube: new THREE.BoxGeometry(1.5, 1.5, 1.5),
      pyramid: (() => {
        const g = new THREE.ConeGeometry(1, 1.4, 3);
        g.rotateY(Math.PI);                 // a flat edge faces the viewer, a point faces away
        return g;
      })(),
      star: flatExtrude(starShape(), 0.4, 6),
      heart: smoothWalls(flatExtrude(heartShape(), 0.4, 10)),
      bar: new THREE.BoxGeometry(2, 0.5, 0.6),
      tile: new THREE.BoxGeometry(TILE, THICK, TILE),
      plate: (() => {
        const g = new THREE.PlaneGeometry(1, 1);
        g.rotateX(-Math.PI / 2);
        return g;
      })(),
      ring: (() => {
        const g = new THREE.RingGeometry(0.5, 0.6, 40);      // inside the frame's lip, even on the tray's far row
        g.rotateX(-Math.PI / 2);
        return g;
      })(),
      bit: new THREE.SphereGeometry(1, 8, 6),
      glass: new THREE.BoxGeometry(0.98, 0.52, 0.98),
      pit: new THREE.BoxGeometry(0.9, 0.2, 0.9),
      slab: (() => {
        const s = square(FRAME);
        s.holes.push(square(0.47, GAP_X, -GAP_Z));
        return flatExtrude(s, 0.06, 1);
      })(),
      lip: (() => {
        const s = square(FRAME + 0.01);               // a hair wider than the slab: no two faces share a plane
        s.holes.push(square(FRAME - 0.12));
        return flatExtrude(s, 0.11, 1);
      })(),
      table: tableTop(12, 0.94),
    };
    // outline hulls for the flat-shaded shapes: smooth normals, so the hull grows out all round
    const HULL = {
      cube: smoothWalls(G.cube.clone(), true),
      bar: smoothWalls(G.bar.clone(), true),
      pyramid: smoothWalls(G.pyramid.clone(), true),
    };
    const HULL_OF = new Map([[G.cube, HULL.cube], [G.bar, HULL.bar], [G.pyramid, HULL.pyramid]]);
    const HULL_GROW = 1.07;                           // the hull also scales up: a diagonal push alone is a thin band
    const M = {
      table: new THREE.MeshBasicMaterial({ map: woodTex }),
      slab: Toon.toon('#b9824f', '#7d5230'),
      lip: Toon.toon('#a9713f', '#6e4524'),
      recess: Toon.flat('#8b5e34'),
      pit: new THREE.MeshBasicMaterial({ color: '#5e3a1c', side: THREE.BackSide }),   // the inside walls of the gap
      glow: Toon.flat('#fff3c4', 0.8),
      rim: Toon.toon('#e2d6c4', '#c4b398'),
      ring: Toon.flat('#ffffff'),
      shadow: Toon.flat('#5a3a1e', 0.18),
      glass: Toon.flat('#7a7470', 0.5),
      gold: Toon.flat('#ffcf4a'),
      white: Toon.flat('#ffffff'),
      confetti: ['#ff8fb0', '#ffcf4a', '#86e0a8', '#9ec9ff', '#c4b5fd'].map((c) => Toon.flat(c)),
    };
    // eighteen fills: a colour at a size, so each size can have its own outline weight
    const fills = {};
    for (const [name, hex] of Object.entries(PALETTE)) {
      fills[name] = {};
      for (const size of SIZES) fills[name][size] = Toon.toon(hex, darker(hex));
    }
    const KEEP = new Set(Object.values(G).concat(Object.values(HULL), Object.values(M).flat(), [woodTex]));
    const hullOf = (mat) => {
      const probe = new THREE.Mesh(G.bit, mat);
      Toon.addOutlines(probe);
      return probe.children[0] ? probe.children[0].material : null;
    };
    for (const mat of Object.values(M).flat()) {
      const hm = hullOf(mat);
      if (hm) KEEP.add(hm);
    }
    hullOf(M.rim).uniforms.thickness.value = 0.014;
    for (const name of Object.keys(fills)) {
      for (const size of SIZES) {
        const mat = fills[name][size];
        const hm = hullOf(mat);
        hm.uniforms.thickness.value = LINE[size];
        KEEP.add(mat);
        KEEP.add(hm);
      }
    }
    const C = {
      parch: new THREE.Color(PARCH),
      lit: new THREE.Color(LIT),
      dim: new THREE.Color(DIM),
      glow: new THREE.Color('#ffe9a3'),
    };

    /* ----------------------------------------------------- the fixtures */
    const plate = (mat, size, x, y, z) => {
      const m = new THREE.Mesh(G.plate, mat);
      m.scale.set(size, 1, size);
      m.position.set(x, y, z);
      return m;
    };
    const statics = new THREE.Group();
    statics.add(new THREE.Mesh(G.table, M.table), new THREE.Mesh(G.slab, M.slab), new THREE.Mesh(G.lip, M.lip));
    Toon.addOutlines(statics);
    scene.add(statics);
    // the gap: a pit sunk into the frame, its far wall and dark floor in view, with a cream glow on the floor
    const pit = new THREE.Mesh(G.pit, M.pit);
    pit.position.set(GAP_X, -0.04, GAP_Z);          // open at the top: y from -0.14 up to the slab's top
    const recess = plate(M.recess, 0.9, GAP_X, -0.12, GAP_Z);
    const glow = plate(M.glow, 0.78, GAP_X, -0.112, GAP_Z);
    scene.add(pit, recess, glow);

    // a ring and a faint shadow for each of the six possible tray slots
    const marks = Array.from({ length: 6 }, () => {
      const ring = new THREE.Mesh(G.ring, M.ring);
      ring.position.y = 0.012;
      ring.visible = false;
      const shadow = plate(M.shadow, 1.0, 0, 0.005, 0);
      shadow.visible = false;
      scene.add(ring, shadow);
      return { ring, shadow };
    });

    const seat = new THREE.Group();
    scene.add(seat);

    let lay = layout((canvas.clientWidth || 1) / (canvas.clientHeight || 1));
    let insets = { top: 0, bottom: 0, left: 0, right: 0 };
    let calm = false;
    let board = null;
    let tray = null;
    let tiles = [];                      // the eight board tiles
    let opts = [];                       // the answer tiles
    let n = 0;
    let selected = -1;
    let spotKind = null;
    let glowAt = -1;
    let glowDur = 0;
    const bits = [];
    const dur = (name) => DUR[name][calm ? 1 : 0];
    const GAP_HOVER = new THREE.Vector3(GAP_X, HOVER, GAP_Z);
    const v3 = new THREE.Vector3();

    function placeSeat() {
      const s = SEATS[lay];
      seat.position.set(s.x, 0, s.z);
      seat.scale.setScalar(s.s);
      seat.rotation.y = 0;               // forward is +z: towards the viewer
    }
    function placeSlots() {
      const home = slots(lay, n);
      opts.forEach((o, i) => { o.home = home[i]; });
      marks.forEach((m, i) => {
        const h = home[i];
        m.shadow.visible = !!h;
        if (!h) {
          m.ring.visible = false;
          return;
        }
        m.ring.position.x = h.x;
        m.ring.position.z = h.z;
        m.shadow.position.x = h.x;
        m.shadow.position.z = h.z;
      });
    }
    placeSeat();

    /* ------------------------------------------------------------ tiles */
    function addShape(group, shape, mat, r, px, pz) {
      const y = TOP + (REST[shape] || 0) * r;
      const kinds = shape === 'cross' ? [0, Math.PI / 2] : [null];
      for (const ry of kinds) {
        const m = new THREE.Mesh(ry == null ? G[shape] || G.ball : G.bar, mat);
        m.scale.setScalar(r);
        m.position.set(px, y, pz);
        if (ry) m.rotation.y = ry;
        group.add(m);
      }
    }

    // a parchment tile carrying a cell's shapes; its top has its own material
    function makeTile(cell, index, option) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(G.tile, M.rim);
      body.position.y = THICK / 2;
      const topMat = Toon.flat(PARCH);
      const top = plate(topMat, TILE, 0, THICK + 0.002, 0);
      group.add(body, top);
      const r = RADIUS[cell.size] || RADIUS.medium;
      const byColour = fills[cell.colour] || fills.red;
      const mat = byColour[cell.size] || byColour.medium;
      for (const [px, pz] of spots(cell.count, r)) addShape(group, cell.shape, mat, r, px, pz);
      Toon.addOutlines(group);
      group.traverse((o) => {
        const h = o.userData.outline && o.parent && HULL_OF.get(o.parent.geometry);
        if (h) {
          o.geometry = h;
          o.scale.setScalar(HULL_GROW);
        }
      });
      let glass = null;
      if (option) {
        glass = new THREE.Mesh(G.glass, M.glass);
        glass.position.y = 0.26;
        glass.visible = false;
        glass.raycast = () => {};                     // a pick must find the tile, never its (even invisible) veil
        group.add(glass);
        group.traverse((o) => { o.userData.option = index; });
      }
      return { group, top: topMat, glass, y: 0 };
    }

    function clearEffects() {
      bits.forEach((b) => scene.remove(b.m));
      bits.length = 0;
      glowAt = -1;
    }

    const W = { renderer, scene, camera };

    /* A fresh board and tray for a puzzle. Never reads puzzle.answer. */
    W.build = (puzzle) => {
      clearEffects();
      if (board) {
        scene.remove(board);
        Toon.dispose(board, KEEP);
      }
      if (tray) {
        scene.remove(tray);
        Toon.dispose(tray, KEEP);
      }
      board = new THREE.Group();
      tray = new THREE.Group();
      scene.add(board, tray);
      tiles = puzzle.grid.slice(0, GAP).map((cell, i) => {
        const t = makeTile(cell, i, false);
        t.group.position.set((i % 3) - 1, 0, Math.floor(i / 3) - 1);
        board.add(t.group);
        return t;
      });
      n = puzzle.options.length;
      opts = puzzle.options.map((cell, i) => {
        const t = makeTile(cell, i, true);
        tray.add(t.group);
        return Object.assign(t, { state: 'home', out: false, home: { x: 0, z: 0 }, pos: new THREE.Vector3(), from: new THREE.Vector3(), dragPos: new THREE.Vector3(), t0: 0, dur: 0, shake: 0, back: 0, settle: 0 });
      });
      selected = -1;
      spotKind = null;
      placeSlots();
      opts.forEach((o) => {
        o.pos.set(o.home.x, 0, o.home.z);
        o.group.position.copy(o.pos);
      });
    };

    W.select = (i) => { selected = i; };
    W.out = (i) => {
      const o = opts[i];
      if (!o) return;
      o.out = true;
      o.glass.visible = true;
    };
    W.spot = (kind) => { spotKind = kind || null; };
    W.calm = (on) => { calm = !!on; };
    W.seat = () => seat;

    // which board cells a spot lights
    function isLit(i) {
      if (spotKind === 'same') return true;
      if (spotKind === 'col') return i % 3 === 2;
      if (spotKind === 'row' || spotKind === 'grow' || spotKind === 'each') return i >= 6;
      return false;
    }

    /* ---------------------------------------------------------- motion */
    W.drag = (i, cx, cy) => {
      const o = opts[i];
      const p = tablePoint(cx, cy);
      if (!o || !p) return;
      o.state = 'drag';
      o.dragPos.set(p.x, DRAG_Y, p.z - DRAG_BACK);
      o.pos.copy(o.dragPos);
      o.group.position.copy(o.pos);
    };
    W.drop = (i, t) => {
      const o = opts[i];
      const d = dur('drop');
      if (!o) return d;
      o.from.copy(o.pos);
      o.t0 = t;
      o.dur = d;
      o.state = 'drop';
      return d;
    };
    W.fly = (i, t) => {
      const o = opts[i];
      const d = dur('fly');
      if (!o) return d;
      o.from.copy(o.pos);
      o.t0 = t;
      o.dur = d;
      o.state = 'fly';
      return d;
    };
    W.accept = (i, t) => {
      const o = opts[i];
      const d = dur('accept');
      if (!o) return d;
      o.t0 = t;
      o.settle = calm ? 0.14 : 0.3;
      o.state = 'accept';
      glowAt = t;
      glowDur = d;
      burst(v3.set(GAP_X, 0.3, GAP_Z), 'sparkle');
      if (!calm) burst(v3.set(0.5, 0.7, 0.5), 'confetti');
      selected = -1;
      return d;
    };
    W.reject = (i, t) => {
      const o = opts[i];
      const s = dur('shake');
      const b = dur('back');
      if (!o) return s + b;
      o.t0 = t;
      o.shake = s;
      o.back = b;
      o.state = 'reject';
      return s + b;
    };

    const homeOf = (o, i) => v3.set(o.home.x, (i === selected ? LIFT : 0) - (o.out ? SINK : 0), o.home.z);

    function stepOption(o, i, t, k) {
      switch (o.state) {
        case 'drag':
          o.pos.copy(o.dragPos);
          break;
        case 'drop': {
          const p = clamp((t - o.t0) / o.dur, 0, 1);
          o.pos.lerpVectors(o.from, homeOf(o, i), easeOut(p));
          if (p >= 1) o.state = 'home';
          break;
        }
        case 'fly': {
          const p = clamp((t - o.t0) / o.dur, 0, 1);
          o.pos.lerpVectors(o.from, GAP_HOVER, smooth(p));
          o.pos.y += ARC * Math.sin(Math.PI * p);
          if (p >= 1) o.state = 'gap';
          break;
        }
        case 'gap':
          o.pos.set(GAP_X, HOVER + (calm ? 0 : 0.012 * Math.sin(t * 4)), GAP_Z);
          break;
        case 'accept': {
          const p = clamp((t - o.t0) / o.settle, 0, 1);
          o.pos.set(GAP_X, HOVER * (1 - easeOut(p)), GAP_Z);
          if (p >= 1) o.state = 'placed';
          break;
        }
        case 'placed':
          o.pos.set(GAP_X, 0, GAP_Z);
          break;
        case 'reject': {
          const e = t - o.t0;
          if (e < o.shake) {
            const p = e / o.shake;
            o.pos.set(GAP_X + 0.07 * Math.sin(p * o.shake * 44) * (1 - p), HOVER, GAP_Z);
          } else {
            const p = clamp((e - o.shake) / o.back, 0, 1);
            o.pos.lerpVectors(GAP_HOVER, homeOf(o, i), smooth(p));
            o.pos.y += ARC * Math.sin(Math.PI * p);
            if (p >= 1) o.state = 'home';
          }
          break;
        }
        default: {                        // home: ease the lift and the sink
          const h = homeOf(o, i);
          o.pos.x = h.x;
          o.pos.z = h.z;
          o.pos.y += (h.y - o.pos.y) * k;
        }
      }
      o.group.position.copy(o.pos);
    }

    W.update = (t, dt) => {
      const k = calm ? 1 : Math.min(1, dt * 14);
      const glowK = glowAt >= 0 ? clamp((t - glowAt) / glowDur, 0, 1) : 1;
      const glowMix = glowK < 1 ? 0.85 * Math.sin(Math.PI * glowK) : 0;
      tiles.forEach((tl, i) => {
        const lit = isLit(i);
        tl.y += ((lit ? RISE : 0) - tl.y) * k;
        tl.group.position.y = tl.y;
        tl.top.color.copy(lit ? C.lit : spotKind ? C.dim : C.parch);
        if (glowMix > 0) tl.top.color.lerp(C.glow, glowMix);
      });
      let inGap = false;
      opts.forEach((o, i) => {
        stepOption(o, i, t, k);
        if (o.state === 'fly' || o.state === 'gap' || o.state === 'accept' || o.state === 'placed') inGap = true;
        if (o.state === 'placed') {
          o.top.color.copy(C.parch);
          if (glowMix > 0) o.top.color.lerp(C.glow, glowMix);
        }
      });
      marks.forEach((m, i) => { m.ring.visible = i === selected && i < n; });
      // the gap's glow pulses while nothing is chosen, holds steady otherwise
      glow.visible = !inGap;
      if (spotKind && isLit(GAP)) glow.material.opacity = 0.95;
      else if (selected >= 0) glow.material.opacity = 0.45;
      else if (calm) glow.material.opacity = 0.65;
      else glow.material.opacity = 0.42 + 0.48 * (0.5 + 0.5 * Math.sin(t * 3.4));

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

    /* ----------------------------------------------------------- effects */
    const BURSTS = {
      sparkle: { n: 18, mat: () => M.gold, speed: 2.2, up: 2.6, size: 0.045, life: 0.8 },
      confetti: { n: 60, mat: (i) => M.confetti[i % M.confetti.length], speed: 5, up: 4.5, size: 0.06, life: 1.8 },
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

    /* ------------------------------------------------------- the camera */
    W.resize = (free) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (free) insets = free;
      renderer.setSize(w, h, false);
      const l = layout(w / h);
      if (l !== lay) {
        lay = l;
        placeSeat();
        placeSlots();
      }
      frameView(camera, w, h, insets, lay);
    };
    W.render = () => renderer.render(scene, camera);

    /* ---------------------------------------------------- pointer helpers */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitV = new THREE.Vector3();
    function cast(cx, cy) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;        // a hidden canvas: no ray, rather than a NaN one that hits everything
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return true;
    }
    function tablePoint(cx, cy) {
      if (!cast(cx, cy)) return null;
      return ray.ray.intersectPlane(tablePlane, hitV) ? hitV : null;
    }
    W.optionAt = (cx, cy) => {
      if (!opts.length || !cast(cx, cy)) return -1;
      const hit = ray.intersectObjects(opts.map((o) => o.group), true)[0];
      return hit && hit.object.userData.option != null ? hit.object.userData.option : -1;
    };
    W.overGap = (cx, cy) => {
      const p = tablePoint(cx, cy);
      return !!p && (p.x - GAP_X) * (p.x - GAP_X) + (p.z - GAP_Z) * (p.z - GAP_Z) <= 0.75 * 0.75;
    };
    function toScreen(x, y, z) {
      const r = canvas.getBoundingClientRect();
      const p = v3.set(x, y, z).project(camera);
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    }
    W.optionScreen = (i) => {
      const o = opts[i];
      return o ? toScreen(o.pos.x, o.pos.y + TOP, o.pos.z) : toScreen(GAP_X, TOP, GAP_Z);
    };
    W.gapScreen = () => toScreen(GAP_X, TOP, GAP_Z);
    W.tileScreen = (i) => toScreen((i % 3) - 1, TOP, Math.floor(i / 3) - 1);

    // the yaw, in the seat's frame, from the critter to option i (-1: the gap)
    const lookV = new THREE.Vector3();
    W.lookYaw = (i) => {
      const o = i >= 0 ? opts[i] : null;
      if (o) lookV.set(o.pos.x, o.pos.y + TOP, o.pos.z);
      else lookV.set(GAP_X, TOP, GAP_Z);
      // the seat's world matrix from the last render is fresh enough: it only moves on a layout change
      const local = seat.worldToLocal(lookV);
      return Math.atan2(local.x, local.z);
    };

    return W;
  }

  window.World = { create, layout, frameView, slots };
})();
