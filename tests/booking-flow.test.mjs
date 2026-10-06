import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { prepareBookingAttempt } from '../assets/js/diverty-booking-state.mjs';

const source = readFileSync(new URL('../assets/js/diverty-app-78bb30f118.js', import.meta.url), 'utf8');
const start = source.indexOf('async function handleBookingSubmit(e)');
const end = source.indexOf('async function initFirebaseAndData()', start);
const handler = source.slice(start, end);
const base = 'artifacts/diverty-oficial/public/data/';
const snapshot = (id, data) => ({ id, exists: () => data != null, data: () => data });

function store() {
  const rows = new Map();
  let queue = Promise.resolve();
  return {
    rows,
    runTransaction: (_db, callback) => {
      const work = queue.then(async () => {
        const writes = new Map();
        await callback({
          get: async ref => {
            assert.equal(writes.size, 0, 'Firestore reads must precede all writes');
            return snapshot(ref.split('/').pop(), rows.get(ref));
          },
          set: (ref, value) => writes.set(ref, structuredClone(value))
        });
        for (const [ref, data] of writes) rows.set(ref, data);
      });
      queue = work.catch(() => {});
      return work;
    }
  };
}

function client(database, name = 'Cliente de prueba') {
  const messages = [];
  const values = {
    name, email: 'test@example.test', phone: '60000000', date: '2026-11-10', time: '10:00',
    eventType: 'Cumpleaños', normalReference: 'PH de prueba', address: 'Dirección de prueba', location: 'Panamá Centro'
  };
  const button = { innerHTML: 'Enviar', disabled: false };
  const form = { dataset: {}, querySelector: () => button };
  const ctx = {
    app: { cart: [{ id: 'paquete', name: 'Paquete de prueba', price: 100, quantity: 1 }], location: 'panama-centro' },
    appliedCoupon: null, bookingFormState: {}, pendingBooking: null,
    normalLocationState: { status: 'included', source: 'gps', label: 'Panamá Centro' },
    christmasLocationState: {}, isChristmasEveBooking: () => false,
    cleanStr: v => String(v ?? '').trim(), normalizeChristmasPlace: v => String(v).toLowerCase(),
    NORMAL_RESTRICTED_TERMS: [], checkNormalResourceAvailability: async () => ({ feasible: true }),
    renderNormalCoverageStatus() {}, effectiveTransportCost: () => 0, ensureFirebaseRuntime: async () => {},
    auth: { currentUser: { uid: 'customer-test' } }, locations: [], db: {}, CRM_APP_ID: 'diverty-oficial',
    crypto: { randomUUID: () => name },
    FormData: class { get(key) { return values[key] || ''; } },
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    where: (...parts) => parts, query: (ref, ...conditions) => ({ ref, conditions }),
    getDoc: async ref => snapshot(ref.split('/').pop(), database.rows.get(ref)),
    getDocs: async q => ({ docs: [...database.rows.entries()]
      .filter(([ref, row]) => ref.startsWith(q.ref + '/') && row.fecha === values.date)
      .map(([ref, row]) => snapshot(ref.split('/').pop(), row)) }),
    runTransaction: database.runTransaction, prepareBookingAttempt,
    fetchWithTimeout: async p => p, fetch: async () => ({ ok: true }),
    isBlockingEvent: v => !/cancelad|rechaz|cot/i.test(v.estado || ''),
    bookedEventsMonthCache: new Map(), routeEventsMonthCache: new Map(),
    loadBookedEventsForMonth: async () => {}, currentCalDate: new Date('2026-11-10T12:00:00'),
    document: { getElementById: () => null }, localStorage: { setItem() {} }, navigator: { onLine: true },
    showToast: (text, kind) => messages.push({ text, kind }), showModal: () => messages.push({ kind: 'success' }),
    updateCartUI() {}, renderBooking() {}, console: { error() {}, warn() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(handler + '\nthis.submit = handleBookingSubmit;', ctx);
  return { ctx, values, button, messages, submit: () => ctx.submit({ preventDefault() {}, target: form }) };
}

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
