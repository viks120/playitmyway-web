/* The parts of Three.js that Stepping Stones uses.
 *
 * docs/vendor/build-three.js bundles this list into
 * games/stepping-stones/three.min.js: one minified classic script that
 * defines a global THREE. It is a classic script rather than an ES module
 * because Chrome refuses module scripts over file://, and the site must open
 * straight off a memory stick. Three.js is MIT licensed; the bundle starts
 * with the full licence text, which is the licence's one condition.
 *
 * Using a new Three.js feature in the game? Add its export here, then run:
 *     node docs/vendor/build-three.js
 * docs/tests/stepping-stones.test.js fails if a game script uses a THREE
 * name that is missing from the bundle.
 */
export {
  BackSide, BoxGeometry, CanvasTexture, CapsuleGeometry, CatmullRomCurve3, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, DataTexture, DirectionalLight, Euler, ExtrudeGeometry, Fog, Group,
  HemisphereLight, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshToonMaterial,
  NearestFilter, PerspectiveCamera, Plane, PlaneGeometry, Quaternion, Raycaster, RedFormat,
  RingGeometry, Scene, ShaderMaterial, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry,
  TubeGeometry, UniformsLib, UniformsUtils, Vector2, Vector3, WebGLRenderer,
} from 'three';
