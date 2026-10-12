const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const output = path.resolve(__dirname, '../../dist');
const encode = value => typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : value && typeof value === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } } : { stringValue: String(value ?? '') };
const documentFor = (collection, row) => ({ name: `projects/diverty-eventos/databases/(default)/documents/artifacts/diverty-oficial/public/data/${collection}/${row.id}`, fields: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => [key, encode(value)])) });
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(output, '.' + decodeURIComponent(url.pathname));
  if (file !== output && !file.startsWith(output + path.sep)) { response.writeHead(403); return response.end(); }
  const target = file === output ? path.join(output, 'index.html') : file;
  fs.readFile(target, (error, content) => { response.writeHead(error ? 404 : 200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2' })[path.extname(target)] || 'application/octet-stream' }); response.end(error ? 'Not found' : content); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const theme of ['normal', 'christmas']) for (const width of [392, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.addInitScript(() => {
        const interval = window.setInterval.bind(window);
        window.setInterval = (callback, milliseconds, ...args) => { if (milliseconds === 45000) window.__syncTick = callback; return interval(callback, milliseconds, ...args); };
      });
      const api = {
        config_web: [{ id: 'global', bannerActive: false, whatsappBookingEnabled: true }, { id: 'web_sync', version: 'test', versions: { catalogo_web: 1 } }],
        temas_web: [{ id: theme, nombre: theme, tipo: theme, isDefault: true }],
        categorias_web: [{ id: 'fiestas', nombre: 'Animación infantil', activo: true, visible: true }, { id: 'comida', nombre: 'Comida', activo: true, visible: true }, { id: 'oculta', nombre: 'Oculta', activo: false, visible: false }],
        catalogo_web: [
          { id: 'magia', nombre: 'Magia Diverty', categoria: 'fiestas', precio: 100, descripcion: 'Juegos y globoflexia', imagen: '/assets/logo-256.webp', serviciosLista: 'Animación\nGloboflexia', orden: 1 },
          { id: 'hero', nombre: 'Héroe azul', categoria: 'fiestas', precio: 80, precioOriginal: 95, tipoServicio: 'personaje', tematica: 'Superhéroes', oferta: true, imagen: '/assets/logo-256.webp', orden: 2 },
          { id: 'dogs', nombre: 'Hot dogs', categoria: 'comida', precio: 2, tipoCobro: 'unidad', cantidadMinima: 50, cantidadMaxima: 500, incrementoCantidad: 25, unidadEtiqueta: 'hot dog', imagen: '/assets/logo-256.webp', orden: 3 },
          { id: 'secret', nombre: 'Servicio oculto', categoria: 'oculta', precio: 1, imagen: '/assets/logo-256.webp' },
        ],
      };
      const requests = [], errors = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        if (url.hostname === 'firestore.googleapis.com') {
          const [collection, id] = url.pathname.split('/public/data/')[1]?.split('/') || [];
          requests.push(collection);
          const rows = api[collection] || [];
          if (id) { const row = rows.find(item => item.id === id); return route.fulfill({ status: row ? 200 : 404, json: row ? documentFor(collection, row) : { error: { status: 'NOT_FOUND' } } }); }
          return route.fulfill({ json: { documents: rows.map(row => documentFor(collection, row)) } });
        }
        return route.abort();
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/?vista=catalog');
      await page.locator('.catalog-category-card').first().waitFor();
      await page.getByRole('searchbox',{name:'Buscar servicio o personaje',exact:true}).fill('magia');
      await page.getByRole('button',{name:'Ver Magia Diverty',exact:true}).click();
      await page.locator('[data-action=book-now][data-item-id=magia]').click();
      const consent=page.locator('input[name=whatsappConsent]');await consent.waitFor();
      assert.equal(await consent.isChecked(),false);
      await consent.check();assert.equal(await consent.inputValue(),'on');
      await page.locator('input[name=name]').fill('Cliente ficticio');await page.locator('input[name=email]').fill('test@example.invalid');await page.locator('input[name=phone]').fill('60000000');
      await page.locator('#btn-next').click();await page.locator('#btn-prev').click();
      assert.equal(await consent.isChecked(),true);await consent.uncheck();
      await page.locator('#btn-next').click();await page.locator('#btn-prev').click();assert.equal(await consent.isChecked(),false);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      console.log(`PASS ${theme} ${width}px: optional WhatsApp consent begins unchecked, keeps customer choice through wizard, and fits the viewport.`);
      await context.close();
    }
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
