import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicAvailability } from '../netlify/lib/navidad-handler.mjs';

// «Mejor opción para tu zona»: horas cercanas a otra entrega del mismo sector.
const client = { lat: 9.0135, lng: -79.4682 };
const booking = extra => ({ id: 'x', fecha: '2026-12-24', hora: '18:00', estado: 'Confirmado', esNavidad: true, santaAsignado: 'Santa 1', ...extra });
const nearbyTimes = rows => Object.entries(buildPublicAvailability(rows, { capacidadSanta: 2 }, client).recommendations).filter(([, r]) => r.nearby).map(([k]) => k.split('|')[1]);

test('a nearby GPS booking recommends the neighbouring hours for the customer zone', () => {
  const times = nearbyTimes([booking({ lat: 9.0130, lng: -79.4690 })]);
  for (const t of ['17:00', '19:00']) assert.ok(times.includes(t), t);
  assert.equal(times.includes('23:30'), false);
});

test('far away or GPS-less bookings never produce zone recommendations', () => {
  assert.deepEqual(nearbyTimes([booking({ lat: 9.16, lng: -79.58 })]), []);
  assert.deepEqual(nearbyTimes([booking({})]), []);
});
