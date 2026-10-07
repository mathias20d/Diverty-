import { needsPlaceReference } from '../../assets/js/diverty-location-reference.mjs';
import { isClosedBookingDate } from '../../assets/js/diverty-date-availability.mjs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { prepareBookingAttempt, readBookingReceipt } from '../../assets/js/diverty-booking-state.mjs';

const source = readFileSync(new URL('../../assets/js/diverty-app-78bb30f118.js', import.meta.url), 'utf8');
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
          set: (ref, value) => writes.set(ref, structuredClone(value)),
          delete: ref => writes.set(ref, null)
        });
        for (const [ref, data] of writes) {
          if (data === null) rows.delete(ref);
          else rows.set(ref, data);
        }
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
    needsPlaceReference, isClosedBookingDate, dateClosures: {}, updateBookingDateClosures() {}, appliedCoupon: null, bookingFormState: {}, pendingBooking: null,
    transportNeedsReview: data => /por confirmar|por revisar|fuera.*cobertura/i.test(String(data?.ubicacion||'')),
    confirmTransportReview: async()=>true,
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
    runTransaction: database.runTransaction, prepareBookingAttempt, readBookingReceipt,
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


export { store, client };
