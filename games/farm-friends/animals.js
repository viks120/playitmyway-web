/* Farm Friends: the eight animals, built from simple shapes in the same
 * cute style as the critters, and rigged by the shared kit (breathing,
 * blinking, looking round, hopping). Each has one or two things a two-year-old
 * knows it by: the cow's spots and pink muzzle, the pig's snout and curly
 * tail, the sheep's wool, the duckling's bill, the puppy's floppy ears, the
 * cat's whiskers, the pony's mane and the hen's red comb.
 * Needs THREE, Toon and Critters; sets window.Animals.
 */
(function () {
  'use strict';

  const { ball, stick, smile, blush, addEye, INK_MAT, BLUSH_SOLID } = Critters.parts;
  const TAU = Math.PI * 2;

  function legs(g, mat, hoofMat, x, z, len, r) {
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      g.add(ball(mat, r, sx * x, len / 2 + 0.04, sz * z, 1, len / (2 * r), 1));
      if (hoofMat) g.add(ball(hoofMat, r * 1.05, sx * x, 0.06, sz * z, 1, 0.55, 1));
    }
  }
  // a body ellipsoid in a group of its own, so spots can be stuck on its surface
  function torso(g, mat, r, y, z, sx, sy, sz) {
    const body = new THREE.Group();
    body.position.set(0, y, z);
    body.add(ball(mat, r, 0, 0, 0, sx, sy, sz));
    g.add(body);
    return { body, A: r * sx, B: r * sy, C: r * sz };
  }

  function buildCow(g) {
    const hide = Toon.toon('#ffffff', '#c9c4dd');
    const patch = Toon.toon('#3d3c5c');
    const pink = Toon.toon('#ffb3c6', '#e08aa2');
    const horn = Toon.toon('#fff0c4', '#d4bf86');
    const hoof = Toon.toon('#6b5b73');
    legs(g, hide, hoof, 0.27, 0.3, 0.36, 0.13);
    const t = torso(g, hide, 0.55, 0.68, -0.05, 1.05, 0.82, 1.18);
    for (const [yw, pt, r] of [[0.9, 0.3, 0.2], [-1.2, 0.1, 0.24], [2.6, 0.5, 0.18], [-2.5, -0.1, 0.16], [1.9, -0.3, 0.14]]) {
      t.body.add(stick(ball(patch, r, 0, 0, 0, 1, 0.8, 0.3), t.A, t.B, t.C, yw, pt));
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.85, -0.68);
    tail.add(ball(hide, 0.05, 0, -0.18, -0.02, 1, 4, 1));
    tail.add(ball(patch, 0.08, 0, -0.42, -0.02, 1, 1.4, 1));
    g.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 1.18, 0.4);
    g.add(head);
    const A = 0.52, B = 0.46, C = 0.46;
    head.add(ball(hide, 1, 0, 0, 0, A, B, C));
    head.add(stick(ball(patch, 0.16, 0, 0, 0, 1, 0.9, 0.3), A, B, C, 0.62, 0.32));
    const muzzle = ball(pink, 0.3, 0, -0.2, 0.32, 1.3, 0.78, 0.82);
    head.add(muzzle);
    for (const sx of [-1, 1]) head.add(ball(INK_MAT, 0.045, sx * 0.13, -0.15, 0.56, 1, 1.3, 0.5));
    const grin = smile(0.09, 0.22, Math.PI * 0.75);
    grin.position.set(0, -0.3, 0.56);
    head.add(grin);
    const eyes = [-1, 1].map((sx) => addEye(head, 0.14, A, B, C, sx * 0.4, 0.14));
    for (const sx of [-1, 1]) head.add(stick(blush(0.08), A, B, C, sx * 0.72, -0.1));
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), horn);
      h.position.set(sx * 0.24, 0.44, -0.04);
      h.rotation.z = -sx * 0.35;
      head.add(h);
    }
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.48, 0.16, -0.04);
      pivot.rotation.z = -sx * 1.1;
      pivot.add(ball(hide, 0.1, 0, 0.16, 0, 1, 1.7, 0.5));
      pivot.add(ball(pink, 0.06, 0, 0.16, 0.035, 1, 1.6, 0.4));
      head.add(pivot);
      return pivot;
    });
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.3, speed: 2.4 }, hop: 0.5 };
  }

  function buildDuck(g) {
    const down = Toon.toon('#ffe066', '#e0b52f');
    const wingMat = Toon.toon('#ffd23f', '#e0b52f');
    const bill = Toon.toon('#ff9a2e', '#d9772a');
    g.add(ball(down, 0.46, 0, 0.5, 0, 1, 0.92, 1.12));
    g.add(ball(down, 0.15, 0, 0.66, -0.5, 1, 0.75, 1.3));
    for (const sx of [-1, 1]) {
      const wing = ball(wingMat, 0.3, sx * 0.44, 0.55, -0.04, 0.36, 0.72, 1);
      wing.rotation.z = sx * 0.3;
      g.add(wing);
      g.add(ball(bill, 0.15, sx * 0.17, 0.04, 0.2, 1, 0.33, 1.35));
    }
    const head = new THREE.Group();
    head.position.set(0, 1.08, 0.12);
    g.add(head);
    const A = 0.43, B = 0.42, C = 0.42;
    head.add(ball(down, 1, 0, 0, 0, A, B, C));
    head.add(ball(bill, 0.22, 0, -0.08, 0.4, 1.3, 0.38, 0.95));
    head.add(ball(INK_MAT, 0.02, 0.06, -0.02, 0.6));
    head.add(ball(INK_MAT, 0.02, -0.06, -0.02, 0.6));
    for (const [x, z] of [[0, 0], [0.07, -0.08]]) head.add(ball(down, 0.08, x, 0.45, z, 0.8, 1.4, 0.8));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.13, A, B, C, sx * 0.44, 0.16));
    for (const sx of [-1, 1]) head.add(stick(blush(0.07, BLUSH_SOLID), A, B, C, sx * 0.8, -0.12));
    return { head, eyes, hop: 0.7 };
  }

  function buildPig(g) {
    const skin = Toon.toon('#ffb8cc', '#e58aa6');
    const snout = Toon.toon('#ff9ab6', '#e0789a');
    const hoof = Toon.toon('#c46f8c');
    legs(g, skin, hoof, 0.26, 0.28, 0.32, 0.13);
    g.add(ball(skin, 0.55, 0, 0.62, -0.02, 1.08, 0.88, 1.12));
    const tail = new THREE.Group();
    tail.position.set(0, 0.74, -0.62);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 8, 20, Math.PI * 1.6), skin);
    curl.rotation.y = Math.PI / 2;
    tail.add(curl);
    g.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.32);
    g.add(head);
    const A = 0.5, B = 0.44, C = 0.46;
    head.add(ball(skin, 1, 0, 0, 0, A, B, C));
    head.add(ball(snout, 0.19, 0, -0.1, 0.44, 1.2, 0.9, 0.55));
    for (const sx of [-1, 1]) head.add(ball(INK_MAT, 0.04, sx * 0.075, -0.1, 0.54, 0.8, 1.2, 0.4));
    const grin = smile(0.08, 0.22, Math.PI * 0.8);
    grin.position.set(0, -0.3, 0.43);
    head.add(grin);
    const eyes = [-1, 1].map((sx) => addEye(head, 0.13, A, B, C, sx * 0.4, 0.18));
    for (const sx of [-1, 1]) head.add(stick(blush(0.085, BLUSH_SOLID), A, B, C, sx * 0.72, -0.12));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.3, 0.36, 0.02);
      pivot.rotation.set(0.6, 0, -sx * 0.45);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 3), skin);
      ear.position.y = 0.1;
      ear.scale.z = 0.4;
      pivot.add(ear);
      head.add(pivot);
      return pivot;
    });
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.45, speed: 5 }, hop: 0.5 };
  }

  function buildSheep(g) {
    const wool = Toon.toon('#ffffff', '#cfcbe0');
    const face = Toon.toon('#f6ead9', '#d6c1a6');
    const dark = Toon.toon('#5d5872');
    legs(g, dark, null, 0.24, 0.26, 0.36, 0.08);
    for (const [x, y, z, r] of [[0, 0.72, 0, 0.42], [0.3, 0.66, 0.22, 0.28], [-0.3, 0.66, 0.22, 0.28], [0.32, 0.68, -0.22, 0.28],
      [-0.32, 0.68, -0.22, 0.28], [0, 0.98, 0.05, 0.3], [0, 0.66, -0.4, 0.28], [0.18, 0.95, -0.25, 0.24], [-0.18, 0.95, -0.25, 0.24]]) {
      g.add(ball(wool, r, x, y, z));
    }
    const head = new THREE.Group();
    head.position.set(0, 1.08, 0.44);
    g.add(head);
    const A = 0.4, B = 0.42, C = 0.38;
    head.add(ball(face, 1, 0, 0, 0, A, B, C));
    for (const [x, y, z, r] of [[0, 0.38, -0.02, 0.16], [0.14, 0.32, -0.06, 0.13], [-0.14, 0.32, -0.06, 0.13]]) head.add(ball(wool, r, x, y, z));
    const grin = smile(0.07, 0.22, Math.PI * 0.8);
    grin.position.set(0, -0.2, 0.37);
    head.add(grin);
    head.add(ball(dark, 0.05, 0, -0.08, 0.38, 1.3, 0.8, 0.5));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.12, A, B, C, sx * 0.42, 0.1));
    for (const sx of [-1, 1]) head.add(stick(blush(0.07), A, B, C, sx * 0.7, -0.2));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.36, 0.12, -0.04);
      pivot.rotation.z = -sx * 1.3;
      pivot.add(ball(dark, 0.08, 0, 0.14, 0, 1, 1.9, 0.5));
      head.add(pivot);
      return pivot;
    });
    return { head, eyes, ears, hop: 0.55 };
  }

  function buildDog(g) {
    const fur = Toon.toon('#e6b27a', '#b98349');
    const cream = Toon.toon('#fff1de', '#e2c8a6');
    const brown = Toon.toon('#a8693b', '#7c4a26');
    const tongue = Toon.toon('#ff8fa3');
    legs(g, fur, cream, 0.22, 0.24, 0.3, 0.12);
    g.add(ball(fur, 0.44, 0, 0.56, -0.05, 1, 0.92, 1.12));
    g.add(ball(cream, 0.28, 0, 0.55, 0.3, 0.95, 1, 0.55));
    const tail = new THREE.Group();
    tail.position.set(0, 0.72, -0.48);
    tail.rotation.x = -0.6;
    tail.add(ball(fur, 0.07, 0, 0.18, 0, 1, 3, 1));
    tail.add(ball(cream, 0.07, 0, 0.38, 0, 1, 1.2, 1));
    g.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.22);
    g.add(head);
    const A = 0.52, B = 0.46, C = 0.48;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    head.add(stick(ball(brown, 0.17, 0, 0, 0, 1, 0.9, 0.3), A, B, C, 0.4, 0.12, -0.02));
    head.add(ball(cream, 0.24, 0, -0.15, 0.36, 1.25, 0.82, 0.9));
    head.add(ball(INK_MAT, 0.075, 0, -0.06, 0.6, 1.3, 0.9, 0.8));
    head.add(ball(tongue, 0.07, 0.03, -0.32, 0.52, 1, 1.3, 0.5));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.14, A, B, C, sx * 0.4, 0.12));
    for (const sx of [-1, 1]) head.add(stick(blush(0.08), A, B, C, sx * 0.74, -0.16));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.44, 0.26, -0.02);
      pivot.rotation.z = sx * 0.3;
      pivot.add(ball(brown, 0.13, 0, -0.22, 0, 0.75, 1.9, 0.5));
      head.add(pivot);
      return pivot;
    });
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.6, speed: 9 }, hop: 0.65 };
  }

  function buildCat(g) {
    const fur = Toon.toon('#b9bccd', '#8a8ca3');
    const stripe = Toon.toon('#8d90a6');
    const cream = Toon.toon('#ffffff', '#d5d3e3');
    const pink = Toon.toon('#ffb3c6');
    const nose = Toon.toon('#ff8fab');
    g.add(ball(fur, 0.42, 0, 0.44, 0, 1, 0.95, 1));
    g.add(ball(cream, 0.28, 0, 0.44, 0.24, 1, 1.05, 0.6));
    for (const sx of [-1, 1]) {
      g.add(ball(cream, 0.12, sx * 0.17, 0.08, 0.3, 1, 0.65, 1.25));
      g.add(ball(fur, 0.14, sx * 0.31, 0.09, 0.02, 1, 0.6, 1.3));
    }
    const tail = new THREE.Group();
    tail.position.set(-0.05, 0.28, -0.36);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.05, 0.12, -0.3),
      new THREE.Vector3(-0.2, 0.5, -0.4), new THREE.Vector3(-0.3, 0.82, -0.26)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.08, 12, false), fur));
    tail.add(ball(stripe, 0.083, -0.3, 0.82, -0.26));
    g.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 1.0, 0.02);
    g.add(head);
    const A = 0.64, B = 0.52, C = 0.56;
    head.add(ball(fur, 1, 0, 0, 0, A, B, C));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.34, 0.36, -0.04);
      pivot.rotation.z = -sx * 0.35;
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 24), fur);
      outer.position.y = 0.11;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 16), pink);
      inner.scale.z = 0.45;
      inner.position.set(0, 0.1, 0.085);
      pivot.add(outer, inner);
      head.add(pivot);
      return pivot;
    });
    for (const sx of [-1, 1]) head.add(stick(ball(cream, 0.11, 0, 0, 0, 1.1, 0.85, 0.7), A, B, C, sx * 0.13, -0.36, -0.03));
    head.add(stick(ball(nose, 0.048, 0, 0, 0, 1.3, 0.9, 0.7), A, B, C, 0, -0.25, 0.02));
    for (const yw of [-0.2, 0, 0.2]) head.add(stick(ball(stripe, 0.065, 0, 0, 0, 0.5, 1.6, 0.35), A, B, C, yw, 0.6));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.15, A, B, C, sx * 0.4, -0.04));
    for (const sx of [-1, 1]) head.add(stick(blush(0.08), A, B, C, sx * 0.66, -0.28));
    const whisker = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6);
    for (const sx of [-1, 1]) {
      for (const i of [-1, 0, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.3, -0.2 + i * 0.045, 0.46);
        pivot.rotation.set(0, -sx * 0.3, i * 0.18 * sx);
        const w = new THREE.Mesh(whisker, INK_MAT);
        w.rotation.z = Math.PI / 2;
        w.position.x = sx * 0.15;
        pivot.add(w);
        head.add(pivot);
      }
    }
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.2, speed: 1.8 }, hop: 0.55 };
  }

  function buildHorse(g) {
    const coat = Toon.toon('#cf9160', '#a0673b');
    const mane = Toon.toon('#6b4430', '#4a2d1f');
    const nose = Toon.toon('#f0cfae', '#cfa883');
    const hoof = Toon.toon('#5b4a55');
    legs(g, coat, hoof, 0.25, 0.32, 0.52, 0.12);
    g.add(ball(coat, 0.5, 0, 0.84, -0.06, 1, 0.82, 1.25));
    const tail = new THREE.Group();
    tail.position.set(0, 0.98, -0.66);
    tail.rotation.x = 0.35;
    tail.add(ball(mane, 0.1, 0, -0.28, 0, 1, 3, 1));
    g.add(tail);
    const head = new THREE.Group();
    head.position.set(0, 1.48, 0.36);
    g.add(head);
    const A = 0.42, B = 0.44, C = 0.46;
    head.add(ball(coat, 1, 0, 0, 0, A, B, C));
    head.add(ball(nose, 0.26, 0, -0.2, 0.34, 1, 0.78, 1.1));
    for (const sx of [-1, 1]) head.add(ball(INK_MAT, 0.04, sx * 0.1, -0.16, 0.6, 1, 1.3, 0.5));
    const grin = smile(0.07, 0.22, Math.PI * 0.8);
    grin.position.set(0, -0.32, 0.58);
    head.add(grin);
    const eyes = [-1, 1].map((sx) => addEye(head, 0.13, A, B, C, sx * 0.46, 0.16));
    for (const sx of [-1, 1]) head.add(stick(blush(0.07), A, B, C, sx * 0.76, -0.1));
    for (const [y, z, r] of [[0.42, 0.08, 0.1], [0.4, -0.12, 0.11], [0.3, -0.3, 0.11], [0.12, -0.42, 0.11], [-0.08, -0.48, 0.1]]) {
      head.add(ball(mane, r, 0, y, z, 0.8, 1, 1));
    }
    head.add(ball(mane, 0.11, 0.04, 0.33, 0.24, 1.1, 0.8, 0.7));          // a forelock over the brow
    head.add(ball(mane, 0.09, -0.07, 0.36, 0.17, 1, 0.8, 0.7));
    const ears = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.2, 0.4, -0.02);
      pivot.rotation.z = -sx * 0.25;
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 12), coat);
      ear.position.y = 0.08;
      ear.scale.z = 0.6;
      pivot.add(ear);
      head.add(pivot);
      return pivot;
    });
    return { head, eyes, ears, tail, wag: { axis: 'z', amp: 0.25, speed: 2 }, hop: 0.6, headTurn: 0.5 };
  }

  function buildChicken(g) {
    const feathers = Toon.toon('#ffffff', '#d6d1e6');
    const red = Toon.toon('#ff5a5a', '#c93e3e');
    const yellow = Toon.toon('#ffc93c', '#d9a21f');
    for (const sx of [-1, 1]) {
      g.add(ball(yellow, 0.035, sx * 0.14, 0.14, 0.04, 1, 3.6, 1));
      g.add(ball(yellow, 0.1, sx * 0.14, 0.03, 0.12, 1, 0.3, 1.4));
    }
    g.add(ball(feathers, 0.42, 0, 0.62, -0.02, 1, 0.98, 1.08));
    for (const [y, z, r] of [[0.95, -0.42, 0.13], [0.82, -0.48, 0.12], [1.05, -0.32, 0.11]]) g.add(ball(feathers, r, 0, y, z, 0.6, 1.3, 1));
    for (const sx of [-1, 1]) {
      const wing = ball(feathers, 0.28, sx * 0.4, 0.66, -0.04, 0.35, 0.7, 1);
      wing.rotation.z = sx * 0.3;
      g.add(wing);
    }
    const head = new THREE.Group();
    head.position.set(0, 1.12, 0.18);
    g.add(head);
    const A = 0.35, B = 0.36, C = 0.35;
    head.add(ball(feathers, 1, 0, 0, 0, A, B, C));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 12), yellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.04, 0.4);
    head.add(beak);
    head.add(ball(red, 0.06, 0, -0.17, 0.33, 1, 1.4, 0.8));
    for (const [z, r] of [[0.08, 0.075], [-0.04, 0.085], [-0.15, 0.07]]) head.add(ball(red, r, 0, 0.36 + r * 0.4, z));
    const eyes = [-1, 1].map((sx) => addEye(head, 0.11, A, B, C, sx * 0.48, 0.18));
    for (const sx of [-1, 1]) head.add(stick(blush(0.06), A, B, C, sx * 0.82, -0.1));
    return { head, eyes, hop: 0.65 };
  }

  const BUILD = { cow: buildCow, duck: buildDuck, pig: buildPig, sheep: buildSheep, dog: buildDog, cat: buildCat, horse: buildHorse, chicken: buildChicken };

  window.Animals = {
    create: (id) => {
      if (!BUILD[id]) throw new Error('Unknown animal: ' + id);
      return Critters.rig(id, BUILD[id]);
    },
    ids: Object.keys(BUILD),
    TAU,
  };
})();
