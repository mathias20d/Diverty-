import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsItems, createAnalyticsTracker, initializeBrowserAnalytics, MEASUREMENT_ID, safeLandingUrl, safeReferrer } from '../assets/js/diverty-analytics.mjs';
import { store, client } from './support/booking-fixture.mjs';
const item = { id: 'magia', name: 'Magia Diverty', categoria: 'fiestas', price: 100, quantity: 2 };
const events = calls => calls.filter(call => call[0] === 'event');
const fixture = options => {
  const calls = [];
  const tracker = createAnalyticsTracker({ send: (...args) => calls.push(args), ...options });
  return { tracker, calls };
};

test('resolved routes count actual views, including Back, without counting rerenders', () => {
  const { tracker, calls } = fixture();
  tracker.view('home'); tracker.view('home'); tracker.view('catalog');
  tracker.view('detail', '', item); tracker.view('detail', '', { ...item, price: 110 });
  tracker.view('catalog'); tracker.view('cat_fiestas', 'Fiestas infantiles'); tracker.view('portal');
  assert.deepEqual(events(calls).filter(call => call[1] === 'page_view').map(call => call[2].page_title), [
    'Inicio | Diverty Panamá', 'Catálogo | Diverty Panamá', 'Magia Diverty | Diverty Panamá',
    'Catálogo | Diverty Panamá', 'Fiestas infantiles | Diverty Panamá', 'Mi reserva | Diverty Panamá',
  ]);
  assert.equal(events(calls).filter(call => call[1] === 'view_item').length, 1);
  assert.equal(events(calls).at(-1)[2].page_referrer, 'https://divertypanama.netlify.app/?categoria=fiestas');
});

test('campaign attribution survives the first virtual view but unknown query data does not', () => {
  const landing = 'https://divertypanama.netlify.app/?plan=secret&cliente=Cliente&telefono=60000000&utm_source=facebook&utm_medium=paid_social&utm_campaign=navidad_2026&utm_content=video_a#private';
  const safe = safeLandingUrl(landing);
  assert.equal(safe, 'https://divertypanama.netlify.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=navidad_2026&utm_content=video_a');
  const { tracker, calls } = fixture({ landing, referrer: 'https://facebook.com/private?email=test@example.invalid' });
  tracker.view('detail', '', item); tracker.view('booking');
  assert.match(events(calls)[0][2].page_location, /plan=magia&utm_source=facebook/);
  assert.equal(events(calls)[0][2].page_referrer, 'https://facebook.com/');
  assert.equal(events(calls).at(-1)[2].page_location, 'https://divertypanama.netlify.app/?vista=booking');
  assert.doesNotMatch(JSON.stringify(calls), /secret|Cliente|60000000|test@example|#private/);
  assert.equal(new URL(safeLandingUrl('https://example.com/?utm_campaign=test@example.invalid&utm_content=telefono60000000')).search, '');
  assert.equal(safeReferrer('invalid'), '');
});

test('ecommerce data is an allowlist of public service fields, not customer/booking fields', () => {
  const suspicious = { ...item, cliente: 'Nombre privado', email: 'private@example.invalid', telefono: '60000000', lat: 8.9, lng: -79.5, direccion: 'Casa privada', token: 'secret', _raw: { ownerUid: 'private-user' } };
  assert.deepEqual(analyticsItems([suspicious]), [{ item_id: 'magia', item_name: 'Magia Diverty', item_category: 'fiestas', price: 100, quantity: 2 }]);
  const { tracker, calls } = fixture();
  tracker.add([suspicious]); tracker.remove([suspicious]); tracker.checkout([suspicious]); tracker.lead('private-receipt', [suspicious]);
  assert.doesNotMatch(JSON.stringify(calls), /Nombre privado|private|60000000|Casa|ownerUid|direccion|token/);
  assert.equal(events(calls)[0][2].value, 200);
  assert.equal(analyticsItems([{ id: 'test', name: 'Persona private@example.invalid', price: NaN, quantity: -4 }])[0].item_name, 'Servicio');
});

test('checkout and consecutive step rerenders are deduplicated but a new attempt and Back are measurable', () => {
  const { tracker, calls } = fixture();
  tracker.checkout([]); tracker.checkout([item]); tracker.checkout([item]);
  tracker.step(1); tracker.step(1); tracker.step(2); tracker.step(1); tracker.step(0);
  tracker.resetCheckout(); tracker.checkout([item], true); tracker.step(1, true); tracker.step(2, true); tracker.step(3, true);
  assert.equal(events(calls).filter(call => call[1] === 'begin_checkout').length, 2);
  assert.deepEqual(events(calls).filter(call => call[1] === 'booking_step').map(call => call[2].booking_step_name), ['Contacto', 'Evento', 'Contacto', 'Lugar', 'Horario', 'Contacto']);
});

test('saved requests count once across retry/reload without transmitting the receipt identifier', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = fixture({ storage });
  first.tracker.lead('private-receipt-id', [item]); first.tracker.lead('private-receipt-id', [item]);
  const reloaded = fixture({ storage });
  reloaded.tracker.lead('private-receipt-id', [item]); reloaded.tracker.lead('another-private-id', [item]);
  assert.equal(events(first.calls).length, 1); assert.equal(events(reloaded.calls).length, 1);
  assert.equal(events(first.calls)[0][1], 'generate_lead');
  assert.doesNotMatch(JSON.stringify(first.calls), /private-receipt/);
});

test('blocked storage, blocked SDK and disabled measurement cannot break booking', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const { tracker, calls } = fixture({ storage });
  tracker.lead('one', [item]); tracker.lead('one', [item]); assert.equal(events(calls).length, 1);
  const failed = createAnalyticsTracker({ send() { throw Error('blocked SDK'); } });
  assert.doesNotThrow(() => { failed.view('home'); failed.add([item]); failed.checkout([item]); failed.step(1); failed.lead('one', [item]); });
  const disabled = fixture({ enabled: false });
  disabled.tracker.view('home'); disabled.tracker.checkout([item]); disabled.tracker.lead('one', [item]); assert.equal(disabled.calls.length, 0);
});

test('WhatsApp measurement accepts a fixed button position and never a message or destination', () => {
  const { tracker, calls } = fixture();
  tracker.whatsapp('flotante'); tracker.whatsapp('cliente=Private&phone=60000000');
  assert.deepEqual(events(calls).map(call => call[2].contact_location), ['flotante', 'contenido']);
  assert.doesNotMatch(JSON.stringify(calls), /Private|60000000/);
});

function browserFixture({ hostname = 'divertypanama.netlify.app', preview = false, testMode = false, idle = true } = {}) {
  const scripts = [], callbacks = [], listeners = {};
  const win = { location: { hostname, origin: 'https://' + hostname, href: 'https://' + hostname + '/?email=private@example.invalid&utm_source=facebook' },
    document: { referrer: 'https://google.com/search?q=private', createElement: () => ({}), head: { appendChild: script => scripts.push(script) }, addEventListener: (name, fn) => listeners[name] = fn },
    __DIVERTY_THEME_PREVIEW__: preview, __DIVERTY_ANALYTICS_TEST__: testMode, setTimeout: fn => callbacks.push(fn) };
  if (idle) win.requestIdleCallback = fn => callbacks.push(fn);
  return { win, scripts, callbacks, listeners };
}

test('browser bootstrap configures one stream and one deferred script; initial views are manual', () => {
  for (const idle of [true, false]) {
    const f = browserFixture({ idle });
    const tracker = initializeBrowserAnalytics(f.win);
    assert.equal(initializeBrowserAnalytics(f.win), tracker);
    const calls = f.win.dataLayer.map(args => [...args]);
    assert.equal(calls.filter(call => call[0] === 'config').length, 1);
    const config = calls.find(call => call[0] === 'config');
    assert.equal(config[1], MEASUREMENT_ID); assert.equal(config[2].send_page_view, false);
    assert.doesNotMatch(JSON.stringify(calls), /private/);
    assert.equal(f.scripts.length, 0); f.callbacks[0](); f.callbacks[0](); assert.equal(f.scripts.length, 1);
    assert.equal(f.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID);
    tracker.view('home'); assert.equal(f.win.dataLayer.filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  }
});

test('theme previews and ordinary localhost sessions never initialize or load Google Analytics', () => {
  for (const options of [{ preview: true }, { hostname: 'localhost' }, { hostname: '127.0.0.1' }]) {
    const f = browserFixture(options); initializeBrowserAnalytics(f.win).view('home');
    assert.equal(f.win.dataLayer, undefined); assert.equal(f.callbacks.length, 0); assert.equal(f.scripts.length, 0);
  }
});

test('delegated WhatsApp clicks recognize only exact official hosts and send no URL', () => {
  const f = browserFixture(); initializeBrowserAnalytics(f.win);
  const click = href => f.listeners.click({ target: { closest: () => ({ href, closest: selector => selector === '.whatsapp-btn' }) } });
  click('https://wa.me.evil.invalid/?text=private');
  click('https://wa.me/50766677965?text=Cliente%20private@example.invalid');
  const calls = f.win.dataLayer.filter(args => args[0] === 'event' && args[1] === 'whatsapp_click');
  assert.equal(calls.length, 1); assert.equal(calls[0][1], 'whatsapp_click');
  assert.doesNotMatch(JSON.stringify(calls), /wa.me|66677965|private/);
});

test('the actual booking handler never counts validation or write failures as saved requests', async () => {
  const db = store(), c = client(db), measured = fixture();
  c.ctx.analytics = measured.tracker;
  const transaction = c.ctx.runTransaction;
  c.ctx.runTransaction = async () => { throw Error('network failure'); };
  await c.submit();
  assert.equal(events(measured.calls).length, 0); assert.equal(db.rows.size, 0);
  c.ctx.runTransaction = transaction;
  await c.submit();
  assert.equal(events(measured.calls).filter(call => call[1] === 'generate_lead').length, 1);
  assert.ok(db.rows.has('artifacts/diverty-oficial/public/data/eventos/web-Cliente de prueba'));
  assert.doesNotMatch(JSON.stringify(measured.calls), /Cliente de prueba|customer-test|test@example|60000000/);
});

test('a saved request recovered after lost acknowledgements produces one lead and no second reservation', async () => {
  const db = store(), c = client(db), measured = fixture();
  c.ctx.analytics = measured.tracker;
  const transaction = c.ctx.runTransaction, read = c.ctx.getDoc;
  c.ctx.runTransaction = async (...args) => { await transaction(...args); throw Error('acknowledgement lost'); };
  c.ctx.getDoc = async ref => { if (ref.includes('/reservas_cliente/')) throw Error('temporarily unavailable'); return read(ref); };
  await c.submit(); assert.equal(events(measured.calls).length, 0);
  c.ctx.getDoc = read;
  await c.submit();
  assert.equal(events(measured.calls).filter(call => call[1] === 'generate_lead').length, 1);
  assert.equal([...db.rows.keys()].filter(key => key.includes('/eventos/')).length, 1);
});
