import test from 'node:test';
import assert from 'node:assert/strict';
import { store, client } from './support/booking-fixture.mjs';
const base = 'artifacts/diverty-oficial/public/data/';

test('booking atomically writes the event, customer status, public availability and slot', async () => {
  const db = store();
  const c = client(db);
  await c.submit();
  const event = db.rows.get(base + 'eventos/web-Cliente de prueba');
  assert.equal(event.ownerUid, 'customer-test');
  assert.equal(event.estado, 'Pendiente');
  assert.equal(event.total, '100');
  assert.equal(db.rows.get(base + 'reservas_cliente/' + event.id).estado, 'Pendiente');
  const availability = db.rows.get(base + 'disponibilidad_web/' + event.id);
  assert.equal(availability.hora, '10:00');
  assert.equal('telefono' in availability, false);
  assert.equal('cliente' in availability, false);
  assert.equal(db.rows.get(base + 'disponibilidad_web/slot_2026-11-10_10-00').count, 1);
  assert.equal(c.button.disabled, false);
  assert.ok(c.messages.some(m => m.kind === 'success'));
});

test('concurrent requests cannot both claim the last slot and the rejected client sees the full-slot message', async () => {
  const db = store();
  db.rows.set(base + 'config_web/global', { capacidadSimultanea: 1 });
  const a = client(db, 'A'), b = client(db, 'B');
  await Promise.all([a.submit(), b.submit()]);
  assert.equal([...db.rows.keys()].filter(k => k.startsWith(base + 'eventos/')).length, 1);
  assert.equal(db.rows.get(base + 'disponibilidad_web/slot_2026-11-10_10-00').count, 1);
  const rejected = [a, b].find(c => c.messages.some(m => m.kind === 'error'));
  assert.ok(rejected);
  assert.match(rejected.messages.find(m => m.kind === 'error').text, /máximo de 1 eventos/);
  assert.equal(rejected.button.disabled, false);
});

test('a failed transaction followed by a corrected form saves the new time with the same ID', async () => {
  const db = store(), c = client(db);
  const real = c.ctx.runTransaction;
  c.ctx.runTransaction = async () => { throw new Error('network failure'); };
  await c.submit();
  assert.equal(db.rows.size, 0);
  assert.equal(c.ctx.pendingBooking.promise, null);
  const id = c.ctx.pendingBooking.id;
  c.values.time = '15:00';
  c.ctx.runTransaction = real;
  await c.submit();
  assert.equal(db.rows.get(base + 'eventos/' + id).hora, '15:00');
  assert.equal(db.rows.has(base + 'disponibilidad_web/slot_2026-11-10_10-00'), false);
  assert.equal(db.rows.get(base + 'disponibilidad_web/slot_2026-11-10_15-00').count, 1);
});

test('cancelled public rows and orphan lock IDs do not consume the last slot', async () => {
  const db = store();
  db.rows.set(base + 'config_web/global', { capacidadSimultanea: 1 });
  db.rows.set(base + 'disponibilidad_web/cancelled', { fecha: '2026-11-10', hora: '10:00', estado: 'Cancelado' });
  db.rows.set(base + 'disponibilidad_web/slot_2026-11-10_10-00', {
    count: 2, capacity: 1, reservationIds: ['cancelled', 'deleted']
  });
  const c = client(db);
  await c.submit();
  assert.ok(c.messages.some(m => m.kind === 'success'));
  assert.equal(db.rows.get(base + 'disponibilidad_web/slot_2026-11-10_10-00').count, 1);
});

test('simultaneous submissions preserve each ID while enforcing a three-reservation capacity', async () => {
  const db = store();
  db.rows.set(base + 'config_web/global', { capacidadSimultanea: 3 });
  const clients = Array.from({ length: 8 }, (_, i) => client(db, 'client-' + i));
  await Promise.all(clients.map(c => c.submit()));
  const lock = db.rows.get(base + 'disponibilidad_web/slot_2026-11-10_10-00');
  assert.equal(lock.count, 3);
  assert.equal(new Set(lock.reservationIds).size, 3);
  assert.equal(clients.filter(c => c.messages.some(m => m.kind === 'success')).length, 3);
  assert.equal(clients.filter(c => c.messages.some(m => m.kind === 'error')).length, 5);
  assert.ok(clients.every(c => !c.button.disabled));
});

test('a committed transaction with a lost acknowledgement is verified through the owner receipt', async () => {
  const db = store(), c = client(db);
  const transaction = c.ctx.runTransaction;
  c.ctx.runTransaction = async (...args) => { await transaction(...args); throw new Error('acknowledgement lost'); };
  const read = c.ctx.getDoc;
  c.ctx.getDoc = async ref => {
    assert.equal(ref.includes('/eventos/'), false, 'the public browser must not read private events');
    return read(ref);
  };
  await c.submit();
  assert.ok(c.messages.some(m => m.kind === 'success'));
  assert.equal(c.messages.some(m => m.kind === 'error'), false);
  assert.equal([...db.rows.keys()].filter(k => k.startsWith(base + 'eventos/')).length, 1);
});

test('retrying after both acknowledgements are lost recovers the original booking before new validation', async () => {
  const db = store(), c = client(db);
  const transaction = c.ctx.runTransaction, read = c.ctx.getDoc;
  let writes = 0;
  c.ctx.runTransaction = async (...args) => { writes++; await transaction(...args); throw new Error('acknowledgement lost'); };
  c.ctx.getDoc = async ref => {
    if (ref.includes('/reservas_cliente/')) throw new Error('receipt temporarily unavailable');
    return read(ref);
  };
  await c.submit();
  assert.ok(c.ctx.pendingBooking);
  c.values.time = '15:00';
  c.ctx.getDoc = read;
  c.ctx.checkNormalResourceAvailability = async () => { throw new Error('a saved retry must skip new availability validation'); };
  await c.submit();
  assert.equal(writes, 1);
  assert.equal(db.rows.get(base + 'eventos/web-Cliente de prueba').hora, '10:00');
  assert.equal(db.rows.has(base + 'disponibilidad_web/slot_2026-11-10_15-00'), false);
  assert.ok(c.messages.some(m => m.kind === 'success'));
  assert.equal(c.ctx.pendingBooking, null);
});


test('outside coverage confirmation can cancel without creating a request',async()=>{
  const db=store(),c=client(db);
  c.ctx.transportNeedsReview=()=>true;
  c.ctx.confirmTransportReview=async()=>false;
  await c.submit();
  assert.equal(db.rows.size,0);assert.equal(c.ctx.pendingBooking,null);assert.equal(c.button.disabled,false);
});
test('enabled central validation uses callable only and cannot bypass it on failure',async()=>{
  const db=store(),c=client(db);
  db.rows.set(base+'config_web/global',{centralBookingValidation:true});
  let calls=0;c.ctx.callBookingFunction=async()=>{calls++;throw Object.assign(new Error('No hay personal disponible.'),{details:{reason:'SLOT_FULL'}});};
  c.ctx.runTransaction=async()=>assert.fail('No direct client transaction when central validation is enabled');
  await c.submit();assert.equal(calls,1);assert.equal([...db.rows.keys()].filter(k=>k.includes('/eventos/')).length,0);
  c.ctx.callBookingFunction=async(name,payload)=>{assert.equal(name,'createWebBooking');return {event:payload.event,recovered:false};};
  await c.submit();assert.ok(c.messages.some(m=>m.kind==='success'));
});
test('double tapping while reviewing transport opens only one confirmation',async()=>{
  const db=store(),c=client(db);let release,dialogs=0;
  c.ctx.transportNeedsReview=()=>true;
  c.ctx.confirmTransportReview=()=>{dialogs++;return new Promise(resolve=>release=resolve);};
  const first=c.submit();await new Promise(resolve=>setImmediate(resolve));
  await c.submit();assert.equal(dialogs,1);release(false);await first;
  c.ctx.confirmTransportReview=async()=>true;await c.submit();assert.ok(c.messages.some(m=>m.kind==='success'));
});

test('GPS-only booking requires a venue name and preserves it on the saved request',async()=>{
  const db=store(),c=client(db);
  c.values.address='https://www.google.com/maps?q=9.01,-79.5';c.values.normalReference='';
  await c.submit();assert.equal(db.rows.size,0);assert.ok(c.messages.some(m=>/barriada, PH o salón/.test(m.text||'')));
  c.values.normalReference='PH Las Palmeras, salón social';
  await c.submit();const event=[...db.rows].find(([p])=>p.includes('/eventos/'))[1];
  assert.equal(event.referenciaLugar,c.values.normalReference);assert.equal(event.direccion,c.values.address);
});
