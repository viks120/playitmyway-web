/* Stepping Stones: the four critters. Clover the Bunny, Pip the Frog, Plum
 * the Baby Dino and Mango the Kitten.
 *
 * Each is built from spheres, capsules, cones and a tube with the shared toon
 * look; nothing is downloaded. Needs THREE and Toon; sets window.Critters.
 *
 * A rig is three nested groups: root (the game moves it), turn (which way it
 * faces) and squash (squash and stretch, pivoting at the feet). Each frame the
 * game may set rig.sy (squash, or null to breathe), rig.earX (ear swing) and
 * rig.look.yaw / rig.look.pitch (head), then call rig.update(t, dt).
 */
(function () {
  'use strict';

  const INK = '#2b2a5e';
  const SPHERE = new THREE.SphereGeometry(1, 40, 28);
  const WHITE = Toon.flat('#ffffff');
  const INK_MAT = Toon.toon(INK);
  const BLUSH = Toon.flat('#ff8fb0', 0.55);
  const BLUSH_SOLID = Toon.flat('#ffa3bd');        // half-strength pink turns muddy over green
  const BUBBLE = Toon.flat('#e9f9ff', 0.5);
  const SHARED = new Set([SPHERE, WHITE, INK_MAT, BLUSH, BLUSH_SOLID, BUBBLE]);
  const FORWARD = new THREE.Vector3(0, 0, 1);

  function ball(mat, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.set(x, y, z);
    m.scale.set(r * sx, r * sy, r * sz);
    return m;
  }

  /* Put obj on the surface of an ellipsoid (radii a, b, c around its parent's
   * origin) at a yaw and pitch from straight ahead, facing outward. */
  function stick(obj, a, b, c, yaw, pitch, lift = 0) {
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const p = new THREE.Vector3(d.x * a, d.y * b, d.z * c);
    const n = new THREE.Vector3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    obj.position.copy(p).addScaledVector(n, lift);
    obj.quaternion.setFromUnitVectors(FORWARD, n);
    return obj;
  }

  // big glossy eyes: a dark oval with two white catch-lights
  function eye(s) {
    const g = new THREE.Group();
    g.add(ball(INK_MAT, s, 0, 0, 0, 0.8, 1.1, 0.42));
    g.add(ball(WHITE, s * 0.3, -s * 0.24, s * 0.36, s * 0.34, 1, 1, 0.4));
    g.add(ball(WHITE, s * 0.14, s * 0.26, -s * 0.34, s * 0.34, 1, 1, 0.4));
    return g;
  }

  function smile(r, thick = 0.26, arc = Math.PI) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * thick, 8, 24, arc), INK_MAT);
    m.rotation.z = 1.5 * Math.PI - arc / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  // a little "w" mouth: two tiny smiles side by side
  function wMouth(r) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.3, 8, 20, Math.PI), INK_MAT);
      m.rotation.z = Math.PI;
      m.position.x = sx * r;
      g.add(m);
    }
    return g;
  }

  const blush = (r, mat = BLUSH) => ball(mat, r, 0, 0, 0, 1.35, 0.8, 0.3);

  function addEye(head, s, A, B, C, yaw, pitch) {
    const e = stick(eye(s), A, B, C, yaw, pitch, -0.01);
    head.add(e);
    return e;
  }

  function buildBunny(g) {
    const fur = Toon.toon('#fff1e4', '#e3c2aa');
    const pink = Toon.toon('#ffadc2');
    const pinkDeep = Toon.toon('#ff94b0');
    g.add(ball(fur, 0.5, 0, 0.5, 0, 1, 0.94, 0.95));
    for (const sx of [-1, 1]) {
      g.add(ball(fur, 0.17, sx * 0.22, 0.09, 0.26, 1, 0.62, 1.35));
      g.add(ball(fur, 0.12, sx * 0.36, 0.52, 0.3));
    }
    g.add(ball(fur, 0.17, 0, 0.36, -0.47));
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.02);
    g.add(head);
    const A = 0.64, B = 0.57, C = 0.6;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.15, A, B, C, sx * 0.42, -0.1));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085), A, B, C, sx * 0.72, -0.3));
    const nose = stick(ball(pinkDeep, 0.045, 0, 0, 0, 1.3, 0.85, 0.8), A, B, C, 0, -0.2);
    head.add(nose);
    head.add(stick(wMouth(0.035), A, B, C, 0, -0.33, -0.005));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.24, 0.42, -0.04);
      pivot.rotation.z = -sx * 0.16;
      const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.62, 8, 24), fur);
      outer.scale.set(1, 1, 0.55);
      outer.position.y = 0.42;
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 8, 16), pink);
      inner.scale.set(1, 1, 0.4);
      inner.position.set(0, 0.44, 0.064);
      pivot.add(outer, inner);
      head.add(pivot);
      return pivot;
    });
    ears[1].rotation.z = -0.5;          // one floppy ear
    ears[1].rotation.x = 0.25;
    return { head, eyes, ears, nose, noseY: nose.scale.y, hop: 0.6 };
  }

  function buildFrog(g) {
    const skin = Toon.toon('#97df86', '#5fae5a');
    const spot = Toon.toon('#7cc86f');
    const belly = Toon.toon('#f6f8d8');
    for (const sx of [-1, 1]) {
      g.add(ball(skin, 0.36, sx * 0.56, 0.26, -0.06, 0.75, 0.62, 1.15));
      g.add(ball(skin, 0.15, sx * 0.3, 0.07, 0.6, 1.35, 0.5, 1));
    }
    const head = new THREE.Group();
    head.position.set(0, 0.62, 0);
    g.add(head);
    const A = 0.85, B = 0.6, C = 0.72;
    head.add(ball(skin, 1, 0, 0, 0, A, B, C));
    head.add(stick(ball(belly, 0.42, 0, 0, 0, 1.15, 0.62, 0.45), A, B, C, 0, -0.66, -0.1));
    for (const [yw, pt, r] of [[-0.9, 0.55, 0.09], [0.75, 0.62, 0.07], [3.0, 0.6, 0.1], [2.4, 0.3, 0.07], [-2.5, 0.35, 0.08]]) {
      head.add(stick(ball(spot, r, 0, 0, 0, 1, 1, 0.35), A, B, C, yw, pt));
    }
    const eyes = [-1, 1].map((sx) => {
      const bump = new THREE.Group();
      bump.position.set(sx * 0.38, 0.47, 0.2);
      head.add(bump);
      bump.add(ball(skin, 0.28));
      const e = stick(eye(0.17), 0.28, 0.28, 0.28, sx * 0.12, 0.05, -0.01);
      bump.add(e);
      return e;
    });
    head.add(stick(smile(0.2, 0.09, Math.PI * 0.72), A, B, C, 0, 0.06, -0.005));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085, BLUSH_SOLID), A, B, C, sx * 0.6, 0.1, -0.012));
    return { head, eyes, hop: 0.85, headTurn: 0.5 };
  }

  function buildDino(g) {
    const skin = Toon.toon('#c2b2fb', '#8f7ad8');
    const belly = Toon.toon('#fff0d4', '#e3cfa8');
    const plate = Toon.toon('#ffb48f', '#e88d6c');
    g.add(ball(skin, 0.55, 0, 0.56, 0, 1, 1.02, 1));
    g.add(ball(belly, 0.42, 0, 0.52, 0.28, 0.95, 1.0, 0.55));
    for (const sx of [-1, 1]) {
      g.add(ball(skin, 0.18, sx * 0.24, 0.09, 0.2, 1, 0.6, 1.35));
      g.add(ball(skin, 0.1, sx * 0.42, 0.72, 0.36, 1, 1.25, 1));
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.36, -0.42);
    g.add(tail);
    for (const [y, z, r] of [[0, 0, 0.25], [0.02, -0.3, 0.18], [0.08, -0.52, 0.12], [0.17, -0.68, 0.08]]) tail.add(ball(skin, r, 0, y, z));
    for (const [y, z, r] of [[0.22, -0.12, 0.08], [0.17, -0.38, 0.065], [0.22, -0.58, 0.05]]) tail.add(ball(plate, r, 0, y, z, 0.5, 1, 0.9));
    for (const [y, z, r] of [[1.02, -0.36, 0.1], [0.8, -0.5, 0.1]]) g.add(ball(plate, r, 0, y, z, 0.5, 1, 0.95));
    const head = new THREE.Group();
    head.position.set(0, 1.14, 0.06);
    g.add(head);
    const A = 0.6, B = 0.53, C = 0.58;
    head.add(ball(skin, 1, 0, 0, 0, A, B, C));
    const snout = new THREE.Group();
    snout.position.set(0, -0.17, 0.4);
    head.add(snout);
    snout.add(ball(skin, 1, 0, 0, 0, 0.36, 0.25, 0.3));
    for (const sx of [-1, 1]) snout.add(stick(ball(INK_MAT, 0.022), 0.36, 0.25, 0.3, sx * 0.3, 0.32, -0.005));
    snout.add(stick(smile(0.1, 0.2, Math.PI * 0.8), 0.36, 0.25, 0.3, 0, -0.28, -0.01));
    const bubble = ball(BUBBLE, 1, 0, -0.02, 0.42);
    bubble.add(ball(WHITE, 0.22, -0.35, 0.35, 0.8));
    bubble.visible = false;
    snout.add(bubble);
    const eyes = [-1, 1].map((sx) => addEye(head, 0.14, A, B, C, sx * 0.4, 0.06));
    for (const sx of [-1, 1]) head.add(stick(blush(0.08), A, B, C, sx * 0.78, -0.18));
    for (const [y, z, r] of [[0.5, 0.14, 0.1], [0.55, -0.08, 0.13], [0.43, -0.3, 0.12], [0.2, -0.5, 0.1]]) head.add(ball(plate, r, 0, y, z, 0.62, 1, 0.9));
    return { head, eyes, tail, wag: { axis: 'y', amp: 0.28, speed: 3.2 }, bubble, hop: 0.6 };
  }

  function buildKitten(g) {
    const fur = Toon.toon('#ffcf9c', '#dc9a5c');
    const stripe = Toon.toon('#f4a35c');
    const cream = Toon.toon('#fff6ec', '#e6cdb4');
    const pink = Toon.toon('#ffb3c6');
    const noseMat = Toon.toon('#ff8fab');
    g.add(ball(fur, 0.48, 0, 0.48, 0, 1, 0.95, 0.95));
    g.add(ball(cream, 0.33, 0, 0.5, 0.25, 1, 1.05, 0.6));
    for (const sx of [-1, 1]) {
      g.add(ball(cream, 0.13, sx * 0.18, 0.09, 0.33, 1, 0.65, 1.25));
      g.add(ball(fur, 0.15, sx * 0.34, 0.1, 0.02, 1, 0.6, 1.3));
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, -0.38);
    g.add(tail);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.12, -0.3),
      new THREE.Vector3(0.18, 0.5, -0.42), new THREE.Vector3(0.3, 0.85, -0.3)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.085, 16, false), fur));
    tail.add(ball(stripe, 0.088, 0.3, 0.85, -0.3));
    const head = new THREE.Group();
    head.position.set(0, 1.06, 0.02);
    g.add(head);
    const A = 0.68, B = 0.55, C = 0.6;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.36, 0.38, -0.04);
      pivot.rotation.z = -sx * 0.38;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.36, 32), fur);
      outer.position.y = 0.12;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 24), pink);
      inner.scale.z = 0.45;
      inner.position.set(0, 0.1, 0.09);
      pivot.add(outer, inner);
      head.add(pivot);
      return pivot;
    });
    for (const sx of [-1, 1]) head.add(stick(ball(cream, 0.11, 0, 0, 0, 1.1, 0.85, 0.7), A, B, C, sx * 0.13, -0.36, -0.03));
    head.add(stick(ball(noseMat, 0.05, 0, 0, 0, 1.3, 0.9, 0.7), A, B, C, 0, -0.24, 0.02));
    head.add(stick(wMouth(0.03), A, B, C, 0, -0.43, 0.012));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.15, A, B, C, sx * 0.4, -0.06));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085), A, B, C, sx * 0.66, -0.28));
    for (const yw of [-0.17, 0, 0.17]) head.add(stick(ball(stripe, 0.07, 0, 0, 0, 0.5, 1.5, 0.35), A, B, C, yw, 0.62));
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.18, speed: 1.6 }, hop: 0.55 };
  }

  const KINDS = {
    bunny: { name: 'Clover', kind: 'Bunny', emoji: '🐰', voice: 1.25, build: buildBunny },
    frog: { name: 'Pip', kind: 'Frog', emoji: '🐸', voice: 0.8, build: buildFrog },
    dino: { name: 'Plum', kind: 'Baby Dino', emoji: '🦖', voice: 0.95, build: buildDino },
    kitten: { name: 'Mango', kind: 'Kitten', emoji: '🐱', voice: 1.45, build: buildKitten },
  };

  // how long each reaction lasts, in seconds
  const LENGTH = { earshake: 0.9, puff: 0.9, shake: 0.6, bubble: 0.85 };

  function create(kind) {
    const spec = KINDS[kind];
    if (!spec) throw new Error('Unknown critter: ' + kind);
    return rig(kind, spec.build);
  }

  /* A rig around any build(group) function that returns { head, eyes } and
   * optionally ears, nose, tail with wag { axis, amp, speed }, bubble and hop:
   * the critters use it, and other games build their own animals with it. */
  function rig(kind, build) {
    const root = new THREE.Group();
    const turn = new THREE.Group();
    const squash = new THREE.Group();
    root.add(turn);
    turn.add(squash);
    const parts = build(squash);
    Toon.addOutlines(squash);
    const rest = (parts.ears || []).map((e) => ({ x: e.rotation.x, z: e.rotation.z }));
    const seed = Math.random() * 10;
    const started = {};
    let clock = 0;
    let blinkAt = -1;
    let nextBlink = 1 + Math.random() * 2;

    const rig = {
      kind,
      root,
      turn,
      parts,
      hop: parts.hop,
      sy: null,
      earX: 0,
      look: { yaw: 0, pitch: 0 },
      react(name) {
        started[name] = clock;
        return LENGTH[name] || 0;
      },
      dispose() {
        Toon.dispose(root, SHARED);
      },
      update(t) {
        clock = t;
        const progress = (name) => {
          if (started[name] == null) return -1;
          const p = (t - started[name]) / LENGTH[name];
          if (p >= 1 || p < 0) {
            delete started[name];
            return -1;
          }
          return p;
        };

        // squash and stretch, or gentle breathing; Mango can puff up as well
        let sy = rig.sy == null ? 1 + 0.025 * Math.sin(t * 2.6 + seed) : rig.sy;
        let sxz = 1 / Math.sqrt(sy);
        const puff = progress('puff');
        if (puff >= 0) {
          const k = Math.sin(Math.PI * puff);
          sxz *= 1 + 0.24 * k;
          sy *= 1 + 0.16 * k;
        }
        squash.scale.set(sxz, sy, sxz);
        const shake = progress('shake');
        turn.rotation.z = shake >= 0 ? 0.28 * Math.sin(shake * LENGTH.shake * 34) * (1 - shake) : 0;

        parts.head.rotation.y = rig.look.yaw * (parts.headTurn || 0.6);
        parts.head.rotation.x = rig.look.pitch;
        parts.head.rotation.z = 0.05 * Math.sin(t * 1.3 + seed);

        const flap = progress('earshake');
        (parts.ears || []).forEach((e, i) => {
          const dry = flap >= 0 ? (i ? -1 : 1) * 0.5 * Math.sin(flap * LENGTH.earshake * 40) * (1 - flap) : 0;
          e.rotation.x = rest[i].x + rig.earX + 0.04 * Math.sin(t * 2.1 + i);
          e.rotation.z = rest[i].z + 0.03 * Math.sin(t * 1.7 + i * 2) + dry;
        });
        if (parts.tail && parts.wag) parts.tail.rotation[parts.wag.axis] = parts.wag.amp * Math.sin(t * parts.wag.speed);
        if (parts.nose) {
          const twitch = (t + seed) % 2.2 < 0.35 ? Math.abs(Math.sin(t * 28)) : 0;
          parts.nose.scale.y = parts.noseY * (1 - 0.25 * twitch);
        }
        if (parts.bubble) {
          const b = progress('bubble');
          parts.bubble.visible = b >= 0;
          if (b >= 0) parts.bubble.scale.setScalar(0.04 + 0.28 * b + 0.015 * Math.sin(t * 20));
        }

        // a blink every few seconds
        if (blinkAt < 0 && t > nextBlink) blinkAt = t;
        let open = 1;
        if (blinkAt >= 0) {
          const p = (t - blinkAt) / 0.16;
          if (p >= 1) {
            blinkAt = -1;
            nextBlink = t + 1.8 + Math.random() * 3;
          } else {
            open = 1 - 0.92 * Math.sin(p * Math.PI);
          }
        }
        parts.eyes.forEach((e) => { e.scale.y = open; });
      },
    };
    return rig;
  }

  /* One hop: a crouch, a flight of height H lasting F seconds, then a landing
   * with a jelly wobble. Returns null before it starts and once it is over. */
  function hopCurve(t, H, F = 0.42) {
    const A = 0.1;
    const L = 0.5;
    if (t < 0) return null;
    if (t < A) return { y: 0, sy: 1 - 0.16 * Math.sin((t / A) * Math.PI / 2), phase: 'crouch', p: 0 };
    t -= A;
    if (t < F) {
      const p = t / F;
      return { y: 4 * H * p * (1 - p), sy: 1.12 - 0.15 * p, phase: 'air', p };
    }
    t -= F;
    if (t < L) {
      const p = t / L;
      return { y: 0, sy: 1 - 0.2 * Math.exp(-5 * p) * Math.cos(12 * p), phase: 'land', p: 1 };
    }
    return null;
  }

  const KINDS_PUBLIC = {};
  for (const [id, k] of Object.entries(KINDS)) KINDS_PUBLIC[id] = { name: k.name, kind: k.kind, emoji: k.emoji, voice: k.voice };

  // the building blocks, for games that make their own animals in the same style
  const parts = { SPHERE, WHITE, INK_MAT, BLUSH, BLUSH_SOLID, ball, stick, eye, smile, wMouth, blush, addEye };

  window.Critters = { KINDS: KINDS_PUBLIC, create, rig, parts, hopCurve };
})();
