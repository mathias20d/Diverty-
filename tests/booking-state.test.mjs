import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBookingAttempt, isNormalDayFullyBooked } from '../assets/js/diverty-booking-state.mjs';

test('retry after a failed write updates form data while keeping the same reservation ID', () => {
  const old = { id: 'web-1', data: { hora: '10:00' }, promise: null };
  const next = prepareBookingAttempt(old, { id: 'web-2', hora: '15:00', total: '125' });
  assert.equal(next.id, 'web-1');
  assert.equal(next.data.id, 'web-1');
  assert.equal(next.data.hora, '15:00');
  assert.equal(next.data.total, '125');
  assert.equal(old.data.hora, '10:00');
});

test('a timeout cannot change the data of a transaction that may still commit', async () => {
  let finish;
  const promise = new Promise(resolve => { finish = resolve; });
  const old = { id: 'web-1', data: { hora: '10:00' }, promise };
  assert.equal(prepareBookingAttempt(old, { id: 'web-2', hora: '15:00' }), old);
  assert.equal(old.data.hora, '10:00');
  finish();
  await promise;
  assert.equal(prepareBookingAttempt(old, { hora: '18:00' }), old);
});

const date = '2026-11-10';
test('three bookings at different hours do not block the entire day', () => {
  const rows = ['08:00', '12:00', '18:00'].map((hora, i) => ({ id: `r-${i}`, fecha: date, hora }));
  assert.equal(isNormalDayFullyBooked(rows, date, 3), false);
});

test('a full day requires the configured capacity at every offered half-hour', () => {
  const rows = [];
  for (let m = 480; m <= 1410; m += 30) {
    const hora = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    for (let i = 0; i < 2; i++) rows.push({ id: `r-${m}-${i}`, fecha: date, hora });
  }
  assert.equal(isNormalDayFullyBooked(rows, date, 2), true);
  assert.equal(isNormalDayFullyBooked(rows, date, 3), false);
  const missing = rows.pop();
  assert.equal(isNormalDayFullyBooked(rows, date, 2), false);
  rows.push({ ...missing, id: 'slot_2026-11-10_23-30' });
  assert.equal(isNormalDayFullyBooked(rows, date, 2), false);
  rows[rows.length - 1] = { ...missing, esNavidad: true };
  assert.equal(isNormalDayFullyBooked(rows, date, 2), false);
  rows[rows.length - 1] = { ...missing, estado: 'Cancelada' };
  assert.equal(isNormalDayFullyBooked(rows, date, 2), false);
});

test('unknown capacity keeps the date selectable until availability can be checked', () => {
  assert.equal(isNormalDayFullyBooked([], date, null), false);
});
