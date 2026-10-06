const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [
  require.resolve('tailwindcss/lib/cli'), '-c', 'tailwind.config.cjs',
  '-i', 'assets/css/tailwind.input.css', '-o', 'assets/css/diverty-tailwind-local.css', '--minify'
], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const version = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 12);
const main = 'assets/js/diverty-app-78bb30f118.js';
let js = fs.readFileSync(path.join(root, main), 'utf8');
js = js.replace(/diverty-booking-state\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-booking-state.mjs?v=${version('assets/js/diverty-booking-state.mjs')}`);
js = js.replace(/diverty-date-picker\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-date-picker.mjs?v=${version('assets/js/diverty-date-picker.mjs')}`);
js = js.replace(/diverty-booking-firebase\.js(?:\?v=[a-f0-9]+)?/g,
  `diverty-booking-firebase.js?v=${version('assets/js/diverty-booking-firebase.js')}`);
fs.writeFileSync(path.join(root, main), js);
for (const file of ['index.html', 'admin.html']) {
  let html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const asset of ['assets/css/diverty-tailwind-local.css', main]) {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`/${escaped}(?:\\?v=[a-f0-9]+)?`, 'g'), `/${asset}?v=${version(asset)}`);
  }
  fs.writeFileSync(path.join(root, file), html);
}

// Publish only the website, keeping build tooling and tests out of
// the deployed directory. Edge functions are still discovered from the base.
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && (/\.(html|json|png|jpe?g|ico|mp4)$/i.test(entry.name) &&
      !['package.json', 'package-lock.json', 'vercel.json'].includes(entry.name) || entry.name === 'Video')) {
    fs.copyFileSync(path.join(root, entry.name), path.join(output, entry.name));
  }
}
