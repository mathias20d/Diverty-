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
    for (const theme of ['normal', 'christmas']) for (const width of [320, 392, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.addInitScript(() => {
        const interval = window.setInterval.bind(window);
        window.setInterval = (callback, milliseconds, ...args) => { if (milliseconds === 45000) window.__syncTick = callback; return interval(callback, milliseconds, ...args); };
      });
      const api = {
        config_web: [{ id: 'global', bannerActive: false }, { id: 'web_sync', version: 'test', versions: { catalogo_web: 1 } }],
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
      const search = page.getByRole('searchbox', { name: 'Buscar servicio o personaje', exact: true });
      const count = page.locator('[data-catalog-count]');
      assert.equal(await page.locator('.catalog-category-card').count(), 2);
      assert.equal(await count.innerText(), '3 de 3 opciones');
      const before = requests.filter(name => name === 'catalogo_web').length;
      await search.fill('hero animacion');
      await page.getByRole('heading', { name: 'Héroe azul', exact: true }).waitFor();
      assert.equal(await count.innerText(), '1 de 3 opciones');
      assert.equal(await search.evaluate(element => document.activeElement === element), true);
      await page.getByRole('button', { name: 'Ver Héroe azul', exact: true }).click();
      await page.getByRole('button', { name: 'Volver a resultados', exact: true }).click();
      assert.equal(await search.inputValue(), 'hero animacion');
      assert.equal(await page.locator('.catalog-character-card').count(), 1);
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      await page.getByRole('combobox', { name: 'Ordenar', exact: true }).selectOption('price-asc');
      assert.deepEqual(await page.locator('#catalogBrowserResults h3').allTextContents(), ['Hot dogs', 'Héroe azul', 'Magia Diverty']);
      await page.getByRole('combobox', { name: 'Mostrar', exact: true }).selectOption('offers');
      assert.equal(await count.innerText(), '1 de 3 opciones');
      await search.fill('no existe');
      await page.getByRole('heading', { name: 'No encontramos opciones con esos filtros', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      assert.equal(await page.locator('.catalog-category-card').count(), 2);
      assert.equal(requests.filter(name => name === 'catalogo_web').length, before, 'local filters must not reread Firestore');
      await search.fill('magia');
      await search.evaluate(element => element.setSelectionRange(2, 4));
      api.catalogo_web[0].nombre = 'Magia Diverty actualizada';
      api.config_web.find(row => row.id === 'web_sync').versions.catalogo_web = 2;
      await page.evaluate(() => window.__syncTick());
      await page.getByRole('heading', { name: 'Magia Diverty actualizada', exact: true }).waitFor();
      assert.equal(await search.inputValue(), 'magia');
      assert.deepEqual(await search.evaluate(element => [document.activeElement === element, element.selectionStart, element.selectionEnd]), [true, 2, 4]);
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      await page.getByRole('button', { name: 'Ver Comida', exact: true }).click();
      await search.fill('dogs');
      await page.getByRole('button', { name: 'Ver Hot dogs', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Cantidad de Hot dogs', exact: true }).fill('75');
      await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
      await page.locator('#viewCart').click();
      await page.locator('#cartModal').waitFor({ state: 'visible' });
      assert.match(await page.locator('#cartItems').innerText(), /Hot dogs/);
      assert.match(await page.locator('#cartItems').innerText(), /150\.00/);
      await page.locator('#viewCart').click();
      await page.getByRole('button', { name: 'Volver a Comida', exact: true }).click();
      assert.equal(await search.inputValue(), 'dogs');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.BROWSER_ARTIFACT_DIR) {
        fs.mkdirSync(process.env.BROWSER_ARTIFACT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.BROWSER_ARTIFACT_DIR, `catalog-${theme}-${width}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: public catalog search/filter/sort, hidden categories, return with filters, sync focus, unit prices/cart, seasons and mobile/PC sizing; all Firebase traffic simulated.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
