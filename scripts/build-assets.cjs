const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
// Los iconos se sirven desde la web con una versión fija, también sin CDN.
fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
const lucideRoot = path.dirname(require.resolve('lucide/package.json'));
fs.copyFileSync(path.join(lucideRoot, 'dist/umd/lucide.min.js'), path.join(root, 'assets/vendor/lucide.min.js'));
fs.copyFileSync(path.join(lucideRoot, 'LICENSE'), path.join(root, 'assets/vendor/lucide.LICENSE'));
const result = spawnSync(process.execPath, [
  require.resolve('tailwindcss/lib/cli'), '-c', 'tailwind.config.cjs',
  '-i', 'assets/css/tailwind.input.css', '-o', 'assets/css/diverty-tailwind-local.css', '--minify'
], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const version = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 12);
const main = 'assets/js/diverty-app-78bb30f118.js';
let js = fs.readFileSync(path.join(root, main), 'utf8');
for (const module of ['diverty-gps-point.mjs', 'diverty-gps-capture.mjs', 'diverty-theme-options.mjs']) {
  const escaped = module.replaceAll('.', '\\.');
  js = js.replace(new RegExp(escaped + '(?:\\?v=[a-f0-9]+)?', 'g'), `${module}?v=${version('assets/js/' + module)}`);
}
js = js.replace(/diverty-location-reference\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-location-reference.mjs?v=${version('assets/js/diverty-location-reference.mjs')}`);
js = js.replace(/diverty-booking-state\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-booking-state.mjs?v=${version('assets/js/diverty-booking-state.mjs')}`);
js = js.replace(/diverty-date-picker\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-date-picker.mjs?v=${version('assets/js/diverty-date-picker.mjs')}`);
js = js.replace(/diverty-resource-usage\.mjs(?:\?v=[a-f0-9]+)?/g,
  `diverty-resource-usage.mjs?v=${version('assets/js/diverty-resource-usage.mjs')}`);
js = js.replace(/diverty-booking-firebase\.js(?:\?v=[a-f0-9]+)?/g,
  `diverty-booking-firebase.js?v=${version('assets/js/diverty-booking-firebase.js')}`);
fs.writeFileSync(path.join(root, main), js);
for (const file of ['index.html', 'admin.html']) {
  let html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const asset of ['assets/css/diverty-tailwind-local.css', 'assets/css/diverty-eb0b36bf04.css', 'assets/js/diverty-runtime-587c019781.js', 'assets/vendor/lucide.min.js', main]) {
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
  if (entry.isFile() && (/\.(html|json|txt|xml|png|jpe?g|ico|mp4)$/i.test(entry.name) &&
      !['package.json', 'package-lock.json', 'vercel.json'].includes(entry.name) || entry.name === 'Video')) {
    fs.copyFileSync(path.join(root, entry.name), path.join(output, entry.name));
  }
}

// Keep editable sources; publish minified files and version their actual bytes.
const assetVersion = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex').slice(0, 12);
for (const file of fs.readdirSync(path.join(output, 'assets/css'))) {
  if (!file.endsWith('.css') || file.endsWith('.input.css')) continue;
  const target = path.join(output, 'assets/css', file);
  fs.writeFileSync(target, esbuild.transformSync(fs.readFileSync(target, 'utf8'), { loader: 'css', minify: true, target: 'es2020', legalComments: 'eof' }).code);
}
const fontStyles = path.join(output, 'assets/css/diverty-fonts.css');
fs.writeFileSync(fontStyles, fs.readFileSync(fontStyles, 'utf8').replace(/\/assets\/fonts\/[\w.-]+\.woff2/g, match => `${match}?v=${assetVersion(match.slice(1))}`));
for (const file of fs.readdirSync(path.join(output, 'assets/js'))) {
  if (!/\.(js|mjs)$/.test(file)) continue;
  const target = path.join(output, 'assets/js', file);
  fs.writeFileSync(target, esbuild.transformSync(fs.readFileSync(target, 'utf8'), { minify: true, target: 'es2020', legalComments: 'eof' }).code);
}

// The initial screen needs only the icons used in our templates. Custom icons
// configured by the admin still load the complete library when first needed.
const fullIcons = 'assets/vendor/lucide-full.min.js';
fs.copyFileSync(path.join(output, 'assets/vendor/lucide.min.js'), path.join(output, fullIcons));
const templates = ['index.html', 'admin.html', main, 'assets/js/diverty-runtime-587c019781.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const catalogIcons = templates.slice(templates.indexOf('function getCatalogIcon('), templates.indexOf('function getLocalDateISO('));
const names = [...new Set([
  ...[...templates.matchAll(/data-lucide=["']([a-z0-9-]+)["']/g)].map(match => match[1]),
  ...[...catalogIcons.matchAll(/return '([a-z0-9-]+)'/g)].map(match => match[1])
])];
const exportsByName = Object.fromEntries(names.map(name => [name, name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join('')]));
const iconExports = [...new Set(Object.values(exportsByName))];
const iconEntry = `import {createIcons, ${iconExports.join(',')}} from 'lucide';
const icons = {${iconExports.join(',')}};
const known = new Set(${JSON.stringify(names)});
let loading = false;
function render(options = {}) {
 const root = options.root || document;
 const unknown = [...root.querySelectorAll('[data-lucide]')].some(node => !known.has(node.getAttribute('data-lucide')));
 createIcons({...options, icons});
 if (unknown && !loading) {
  loading = true;
  const script = document.createElement('script');
  script.src = '/${fullIcons}?v=${assetVersion(fullIcons)}';
  script.onload = () => window.lucide.createIcons();
  script.onerror = () => { loading = false; script.remove(); };
  document.head.appendChild(script);
 }
}
window.lucide = {createIcons: render, icons};`;
esbuild.buildSync({ stdin: { contents: iconEntry, resolveDir: root }, bundle: true, format: 'iife', minify: true, target: 'es2020', legalComments: 'eof', outfile: path.join(output, 'assets/vendor/lucide.min.js') });

// Modules depend on other versioned modules, so version children first.
const modules = fs.readdirSync(path.join(output, 'assets/js')).filter(file => /\.(js|mjs)$/.test(file) && 'assets/js/' + file !== main);
const versionReferences = text => text.replace(/([\w.-]+\.(?:mjs|js))\?v=[a-f0-9]+/g, (match, file) => {
  const asset = 'assets/js/' + file;
  return fs.existsSync(path.join(output, asset)) ? `${file}?v=${assetVersion(asset)}` : match;
});
for (const file of modules.concat(path.basename(main))) {
  const target = path.join(output, 'assets/js', file);
  fs.writeFileSync(target, versionReferences(fs.readFileSync(target, 'utf8')));
}
for (const file of ['index.html', 'admin.html']) {
  const target = path.join(output, file);
  let html = fs.readFileSync(target, 'utf8');
  html = html.replace(/\/assets\/[\w./-]+\.(?:js|mjs|css|webp|woff2)(?:\?v=[a-f0-9]+)?/g, match => {
    const asset = match.slice(1).split('?')[0];
    return fs.existsSync(path.join(output, asset)) ? `/${asset}?v=${assetVersion(asset)}` : match;
  });
  fs.writeFileSync(target, html);
}

// Preview uses the actual published templates and CSS, with bookings and analytics disabled.
let preview = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
preview = preview.replace(/<!-- Google Analytics:[\s\S]*?<script>[\s\S]*?<\/script>/, '');
preview = preview.replace('<head>', '<head><script>window.__DIVERTY_THEME_PREVIEW__=true;</script><meta name="robots" content="noindex,nofollow">');
preview = preview.replace(/try \{snapshot=JSON.parse/, 'try {if(!window.__DIVERTY_THEME_PREVIEW__)snapshot=JSON.parse');
preview = preview.replace("window.__divertyShowSplash=!(snapshot && seen)", "window.__divertyShowSplash=!window.__DIVERTY_THEME_PREVIEW__&&!(snapshot && seen)");
preview = preview.replace("sessionStorage.setItem('diverty_splash_seen','1')", "window.__DIVERTY_THEME_PREVIEW__||sessionStorage.setItem('diverty_splash_seen','1')");
fs.writeFileSync(path.join(output, 'theme-preview.html'), preview);
