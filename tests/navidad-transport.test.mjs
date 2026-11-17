import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coverage } from '../firebase/functions/coverage.mjs';
import { evaluateTransport, normalizeTransportConfig, transportForStorage, DEFAULT_TRANSPORT } from '../firebase/functions/navidad-transport.mjs';

const costa = { lat: 9.0135, lng: -79.4682 }, ciudad = { lat: 9.0, lng: -79.5 }, fuera = { lat: 8.5, lng: -80.2 };

test('default configuration reproduces the previous Diverty prices on a GPS grid', () => {
  let checked = 0;
  for (let lat = 8.9013; lat <= 9.2213; lat += 0.0071) for (let lng = -79.6487; lng <= -79.2387; lng += 0.0067) {
    const before = coverage({ lat, lng }, true, ''), after = evaluateTransport(null, { lat, lng }, '');
    assert.equal(after.status, before.status, `${lat},${lng}`);
    assert.equal(after.charge, before.charge, `${lat},${lng}`);
    checked++;
  }
  assert.ok(checked > 2000);
});

test('red zones calculate the zone transport plus surcharge and stay for confirmation', () => {
  assert.deepEqual([evaluateTransport(null, ciudad, 'Calle 3, Barraza').status, evaluateTransport(null, ciudad, 'Barraza').charge], ['review', 0]);
  const red = evaluateTransport(null, costa, 'PH en Barraza');
  assert.equal(red.status, 'review'); assert.equal(red.charge, 5); assert.equal(red.reason, 'security');
  assert.equal(/zona roja/i.test(red.label), false, 'el cliente nunca ve "zona roja"');
  const custom = { ...DEFAULT_TRANSPORT, zonasRojas: { activo: true, terminos: ['barraza'], recargo: 3 } };
  assert.equal(evaluateTransport(custom, costa, 'Barraza').charge, 8);
  assert.equal(evaluateTransport(custom, null, 'Barraza').charge, 3);
});

test('one switch turns red zones off, and manual mode keeps transport for review', () => {
  const off = { ...DEFAULT_TRANSPORT, zonasRojas: { ...DEFAULT_TRANSPORT.zonasRojas, activo: false } };
  assert.deepEqual(evaluateTransport(off, costa, 'Barraza'), evaluateTransport(off, costa, ''));
  assert.equal(evaluateTransport(off, costa, 'Barraza').status, 'surcharge');
  const manual = { ...DEFAULT_TRANSPORT, automatico: false };
  assert.deepEqual([evaluateTransport(manual, costa, '').status, evaluateTransport(manual, costa, '').charge], ['review', 0]);
});

test('each account sets its own price per zone and can add its own zones', () => {
  const own = transportForStorage({ ...DEFAULT_TRANSPORT, zonas: [
    ...DEFAULT_TRANSPORT.zonas.map(z => z.id === 'ciudad' ? { ...z, precio: 2.5 } : z),
    { nombre: 'Arraiján', tipo: 'circulo', lat: 8.9467, lng: -79.6563, radioKm: 4, precio: 15 }
  ] });
  assert.deepEqual([evaluateTransport(own, ciudad).status, evaluateTransport(own, ciudad).charge], ['surcharge', 2.5]);
  const arraijan = evaluateTransport(own, { lat: 8.95, lng: -79.66 });
  assert.equal(arraijan.charge, 15); assert.equal(arraijan.zoneId, 'arraijan');
  assert.equal(evaluateTransport(own, fuera).status, 'review');
});

test('invalid or hostile values are discarded; missing configuration means Diverty defaults', () => {
  assert.equal(normalizeTransportConfig(undefined), DEFAULT_TRANSPORT);
  assert.equal(normalizeTransportConfig({ schemaVersion: 99 }), DEFAULT_TRANSPORT);
  const clean = normalizeTransportConfig({ schemaVersion: 1, zonas: [
    { nombre: '<script>', tipo: 'circulo', lat: 9, lng: -79.5, radioKm: 1, precio: 5 },
    { nombre: 'Precio malo', tipo: 'circulo', lat: 9, lng: -79.5, radioKm: 1, precio: -1 },
    { nombre: 'Radio malo', tipo: 'circulo', lat: 9, lng: -79.5, radioKm: 500, precio: 1 },
    { nombre: 'Área invertida', tipo: 'area', sur: 9.2, norte: 9.0, oeste: -79.6, este: -79.4, precio: 1 }
  ], zonasRojas: { terminos: ['ab', ' Río  Abajo ', 'rio abajo'], recargo: 'x' } });
  assert.deepEqual(clean.zonas.map(z => z.nombre), ['script']);
  assert.deepEqual(clean.zonasRojas, { activo: true, terminos: ['rio abajo'], recargo: 0 });
});

test('web, server and owner app use the identical transport engine', () => {
  const server = readFileSync(new URL('../firebase/functions/navidad-transport.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const web = readFileSync(new URL('../assets/js/diverty-navidad-transport.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(web, server);
});
