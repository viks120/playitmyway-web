/* Logic Gates: the gate symbols. The standard shapes (a D for AND, a shield
 * for OR, a triangle for NOT, a little circle for "then NOT", a second curve
 * for XOR) as path commands in board units, so the 3D blocks and the flat
 * drawings in the page come from one description. Each gate type has its own
 * colours too. Needs nothing; sets window.GateArt.
 *
 * Coordinates: x runs with the signal (left to right), y points up, and the
 * origin is the middle of a gate slot.
 */
(function () {
  'use strict';

  const COLORS = {
    AND: { side: '#4f8ff7', cap: '#e3edff', ink: '#1e3a8a' },
    OR: { side: '#f59e0b', cap: '#fff2d9', ink: '#8a3b06' },
    NOT: { side: '#a78bfa', cap: '#efeaff', ink: '#4c1d95' },
    XOR: { side: '#14b8a6', cap: '#d9fbf3', ink: '#115e59' },
    NAND: { side: '#ec4899', cap: '#fde8f3', ink: '#831843' },
    NOR: { side: '#ef5350', cap: '#ffe5e5', ink: '#7f1d1d' },
  };

  // the body spans x from L to R and y from -H to H; leads fill the rest of the slot
  const G = { hw: 0.62, L: -0.44, R: 0.48, H: 0.33, bub: 0.075, back: 0.16, gap: 0.1, arc: 0.05 };

  const orBody = (L, T, H) => [
    ['M', L, -H],
    ['Q', L + 0.58 * (T - L), -H, T, 0],
    ['Q', L + 0.58 * (T - L), H, L, H],
    ['Q', L + G.back, 0, L, -H],
  ];

  /* One gate's outline: the body path, the bubble (if any), XOR's extra
   * curve, where its output starts, where the label goes, and how far in
   * the back edge sits at a given height (where an input lead must reach). */
  function outline(id) {
    const { L, R, H, bub } = G;
    const bubbled = id === 'NOT' || id === 'NAND' || id === 'NOR';
    const tip = bubbled ? R - 2 * bub : R;
    const curved = (left) => (y) => left + 2 * ((1 - y / H) / 2) * (1 - (1 - y / H) / 2) * G.back;
    let body;
    let extra = null;
    let back = () => L;
    let label;
    if (id === 'AND' || id === 'NAND') {
      body = [['M', L, -H], ['L', tip - H, -H], ['A', tip - H, 0, H, -Math.PI / 2, Math.PI / 2], ['L', L, H], ['Z']];
      label = { x: (L + tip) / 2 - 0.05, y: 0, size: id === 'AND' ? 0.25 : 0.2 };
    } else if (id === 'OR' || id === 'NOR') {
      body = orBody(L, tip, H).concat([['Z']]);
      back = curved(L);
      label = { x: (L + 0.05 + tip) / 2 - 0.03, y: 0, size: id === 'OR' ? 0.25 : 0.22 };
    } else if (id === 'XOR') {
      const L2 = L + G.gap;
      body = orBody(L2, tip, H).concat([['Z']]);
      // the second curve: a thin crescent just behind the body
      extra = [['M', L, H], ['Q', L + G.back, 0, L, -H], ['L', L - G.arc, -H], ['Q', L - G.arc + G.back, 0, L - G.arc, H], ['Z']];
      back = curved(L - G.arc);
      label = { x: (L2 + 0.05 + tip) / 2 - 0.045, y: 0, size: 0.22 };
    } else {
      body = [['M', L, -H], ['L', tip, 0], ['L', L, H], ['Z']];
      label = { x: L + 0.21, y: 0, size: 0.16 };
    }
    return { id, body, extra, bubble: bubbled ? { x: R - bub, r: bub } : null, tip: R, back, label };
  }

  /* Follow path commands with a 2D canvas context or a THREE.Shape. For the
   * canvas, map(x, y) gives canvas coordinates (y flips) at scale s. */
  function trace(target, cmds, map, s) {
    const canvas = !!map;
    const P = canvas ? map : (x, y) => [x, y];
    for (const c of cmds) {
      if (c[0] === 'M') target.moveTo(...P(c[1], c[2]));
      else if (c[0] === 'L') target.lineTo(...P(c[1], c[2]));
      else if (c[0] === 'Q') target.quadraticCurveTo(...P(c[1], c[2]), ...P(c[3], c[4]));
      else if (c[0] === 'A') {
        if (canvas) {
          const [cx, cy] = P(c[1], c[2]);
          target.arc(cx, cy, c[3] * s, -c[4], -c[5], true);
        } else {
          target.absarc(c[1], c[2], c[3], c[4], c[5], false);
        }
      } else if (c[0] === 'Z' && canvas) target.closePath();
    }
  }

  /* A flat drawing of a gate in a canvas box (left, top, width, height), with
   * its input and output lines, for the palette and the gate guide. */
  function draw(x, id, left, top, w, h, opts) {
    const o = outline(id);
    const ink = (opts && opts.ink) || '#2b2a5e';
    const fill = (opts && opts.fill) || COLORS[id].cap;
    const s = Math.min(w / (2 * G.hw), h / (2 * 0.42));
    const cx = left + w / 2;
    const cy = top + h / 2;
    const map = (px, py) => [cx + px * s, cy - py * s];
    x.save();
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.lineWidth = Math.max(1.5, s * 0.045);
    x.strokeStyle = ink;
    // the wires in and out
    x.beginPath();
    const ins = id === 'NOT' ? [0] : [0.2, -0.2];
    for (const py of ins) {
      x.moveTo(...map(-G.hw, py));
      x.lineTo(...map(o.back(py), py));
    }
    x.moveTo(...map(o.tip, 0));
    x.lineTo(...map(G.hw, 0));
    x.stroke();
    x.beginPath();
    trace(x, o.body, map, s);
    x.fillStyle = fill;
    x.fill();
    x.stroke();
    if (o.extra) {
      x.beginPath();
      trace(x, o.extra, map, s);
      x.fillStyle = ink;
      x.fill();
    }
    if (o.bubble) {
      x.beginPath();
      x.arc(...map(o.bubble.x, 0), o.bubble.r * s, 0, Math.PI * 2);
      x.fillStyle = '#ffffff';
      x.fill();
      x.stroke();
    }
    x.restore();
  }

  window.GateArt = { COLORS, G, outline, trace, draw };
})();
