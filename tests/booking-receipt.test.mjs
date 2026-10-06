import test from 'node:test';
import assert from 'node:assert/strict';
import { readBookingReceipt } from '../assets/js/diverty-booking-state.mjs';

const receipt = { ownerUid: 'owner', fecha: '2026-11-10', hora: '10:00', estado: 'Pendiente' };
const read = (data, pending = false) => async () => ({ exists: () => data !== null, data: () => data, metadata: { hasPendingWrites: pending } });

test('the owner can recover a persisted pending or already accepted request', async () => {
  assert.deepEqual(await readBookingReceipt(read(receipt), {}, 'owner'), receipt);
  assert.equal((await readBookingReceipt(read({ ...receipt, estado: 'Confirmado' }), {}, 'owner')).estado, 'Confirmado');
});
test('missing, malformed or another owner receipts cannot acknowledge a booking', async () => {
  for (const data of [null, {}, { ...receipt, ownerUid: 'other' }]) {
    assert.equal(await readBookingReceipt(read(data), {}, 'owner'), null);
  }
});
test('uncommitted local writes cannot acknowledge a server reservation', async () => {
  assert.equal(await readBookingReceipt(read(receipt, true), {}, 'owner'), null);
});
test('read failures propagate so the caller can preserve the request for retry', async () => {
  await assert.rejects(readBookingReceipt(async () => { throw new Error('unavailable'); }, {}, 'owner'), /unavailable/);
});
