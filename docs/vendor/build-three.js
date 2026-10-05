/* Rebuilds games/stepping-stones/three.min.js from docs/vendor/three-entry.js.
 *
 *     node docs/vendor/build-three.js
 *
 * Nothing is installed into the repo: the pinned three and esbuild packages
 * go into a scratch folder in the system temp directory, reused on the next
 * run. Needs Node 18+ and npm, and the network on the first run only. */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const THREE_VERSION = '0.186.1';
const ESBUILD_VERSION = '0.28.2';
const OUT = path.join(__dirname, '..', '..', 'games', 'stepping-stones', 'three.min.js');
const WORK = path.join(os.tmpdir(), `pimw-three-${THREE_VERSION}-esbuild-${ESBUILD_VERSION}`);

const installed = (pkg, version) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(WORK, 'node_modules', pkg, 'package.json'), 'utf8')).version === version;
  } catch (e) {
    return false;
  }
};

fs.mkdirSync(WORK, { recursive: true });
if (!installed('three', THREE_VERSION) || !installed('esbuild', ESBUILD_VERSION)) {
  fs.writeFileSync(path.join(WORK, 'package.json'), '{ "private": true }\n');
  execSync(`npm install --no-audit --no-fund three@${THREE_VERSION} esbuild@${ESBUILD_VERSION}`, { cwd: WORK, stdio: 'inherit' });
}
fs.copyFileSync(path.join(__dirname, 'three-entry.js'), path.join(WORK, 'entry.js'));

const licence = fs.readFileSync(path.join(WORK, 'node_modules', 'three', 'LICENSE'), 'utf8').trim();
const banner = [
  '/*!',
  ` * three.js r${THREE_VERSION.split('.')[1]} (https://threejs.org), trimmed to the parts Stepping`,
  ' * Stones uses; the list is docs/vendor/three-entry.js in this site\'s repository.',
  ' *',
  ...licence.split(/\r?\n/).map((line) => (' * ' + line).trimEnd()),
  ' */',
].join('\n');

require(path.join(WORK, 'node_modules', 'esbuild')).buildSync({
  entryPoints: [path.join(WORK, 'entry.js')],
  absWorkingDir: WORK,
  bundle: true,
  format: 'iife',
  globalName: 'THREE',
  minify: true,
  legalComments: 'none',      // three's own short licence comments; the full text is in the banner
  banner: { js: banner },
  outfile: OUT,
  logLevel: 'warning',
});

const built = fs.readFileSync(OUT);
const kb = (n) => Math.round(n / 1024) + ' KB';
console.log(`three.min.js: ${kb(built.length)} on disk, ${kb(zlib.brotliCompressSync(built).length)} with brotli`);
