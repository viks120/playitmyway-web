/* Stepping Stones: the shared toon look.
 *
 * A 3-step light ramp for soft cel shading, flat (unlit) fills, and coloured
 * outlines one shade darker than each fill: never black, which reads harsher
 * to small children. Outlines are inverted hulls pushed out along view-space
 * normals, so a mesh's own scale cannot thin them, and they take the scene's
 * fog like everything else. Needs THREE; sets window.Toon.
 */
(function () {
  'use strict';

  const ramp = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  const VERTEX = [
    '#include <fog_pars_vertex>',
    'uniform float thickness;',
    'void main() {',
    '  vec4 p = vec4(position, 1.0);',
    '  vec3 n = normal;',
    '  #ifdef USE_INSTANCING',
    '    p = instanceMatrix * p;',
    '    n = mat3(instanceMatrix) * n;',
    '  #endif',
    '  vec4 mvPosition = modelViewMatrix * p;',
    '  mvPosition.xyz += normalize(normalMatrix * n) * thickness;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n');

  const FRAGMENT = [
    '#include <fog_pars_fragment>',
    'uniform vec3 color;',
    'void main() {',
    '  gl_FragColor = vec4(color, 1.0);',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n');

  const OUTLINES = new WeakMap();      // fill material -> its outline material

  function outlineMaterial(color) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        color: { value: new THREE.Color(color) },
        thickness: { value: 0.024 },
      }]),
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      fog: true,
    });
  }

  function toon(color, outlineColor) {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    if (outlineColor) OUTLINES.set(m, outlineMaterial(outlineColor));
    return m;
  }

  function flat(color, opacity) {
    const o = opacity == null ? 1 : opacity;
    return new THREE.MeshBasicMaterial({ color, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
  }

  /* Give every mesh under root whose material has an outline colour its
   * hull. Instanced meshes get an instanced hull sharing their matrices. */
  function addOutlines(root) {
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh && !o.userData.outline && OUTLINES.has(o.material)) meshes.push(o);
    });
    for (const m of meshes) {
      const mat = OUTLINES.get(m.material);
      let hull;
      if (m.isInstancedMesh) {
        hull = new THREE.InstancedMesh(m.geometry, mat, m.count);
        hull.instanceMatrix = m.instanceMatrix;
        hull.frustumCulled = false;
      } else {
        hull = new THREE.Mesh(m.geometry, mat);
      }
      hull.userData.outline = true;
      hull.raycast = () => {};         // a tap should find the critter, not its outline
      m.add(hull);
    }
  }

  /* Free the GPU copies of everything under root, except shared resources. */
  function dispose(root, keep) {
    const done = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const res of [o.geometry, o.material, o.material && o.material.map]) {
        if (res && !done.has(res) && !(keep && keep.has(res))) {
          done.add(res);
          res.dispose();
        }
      }
      if (o.isInstancedMesh) o.dispose();
    });
  }

  window.Toon = { toon, flat, addOutlines, dispose };
})();
