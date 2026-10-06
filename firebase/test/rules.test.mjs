import { before, beforeEach, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, query, where, setDoc, deleteDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { client, store } from '../../tests/support/booking-fixture.mjs';

// Running this file directly is deliberately refused: the CLI sets this value
// only after it starts the local demo emulator, never a production project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Run npm test from firebase/: a local demo Firestore emulator on 127.0.0.1:8089 is required.');
const base = 'artifacts/diverty-oficial/public/data/';
const adminUid = 'OblqzhP2L3XulJ920O82jwd1Qrk1';
const normalSlot = 'slot_2026-11-10_10-00';
let environment;
const ref = (db, section, id) => doc(db, base + section + '/' + id);
const dbFor = uid => environment.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
async function sample(owner = 'owner', santa = false) {
  const database = store(), c = client(database);
  const id = 'web-' + randomUUID();
  c.ctx.crypto = { randomUUID: () => id.slice(4) };
  c.ctx.auth.currentUser.uid = owner;
  if (santa) santaClient(c);
  await c.submit();
  assert.ok(c.messages.some(m => m.kind === 'success'));
  return { id, event: database.rows.get(base + 'eventos/' + id) };
}
function receipt(event) {
  return Object.fromEntries(['ownerUid','cliente','telefono','fecha','hora','estado','servicio','total','abono'].map(key => [key, String(event[key] ?? '')]));
}
function availability(event) {
  return { fecha: event.fecha, hora: event.hora, esNavidad: event.esNavidad, recursoNavidad: event.recursoNavidad,
    ...(event.esNavidad && 'lat' in event ? {lat:event.lat,lng:event.lng} : {}) };
}
function lockKey(event) { return (event.esNavidad ? 'slot_santa_' : 'slot_') + event.fecha + '_' + event.hora.replace(':','-'); }
function bookingBatch(db, event, { ids = [event.id], capacity = event.esNavidad ? 1 : 2, includeLock = true, includeReceipt = true, publicOverride = {} } = {}) {
  const batch = writeBatch(db);
  batch.set(ref(db, 'eventos', event.id), event);
  batch.set(ref(db, 'disponibilidad_web', event.id), { ...availability(event), ...publicOverride });
  if (includeReceipt) batch.set(ref(db, 'reservas_cliente', event.id), receipt(event));
  if (includeLock) batch.set(ref(db, 'disponibilidad_web', lockKey(event)), {
    fecha:event.fecha, hora:event.hora, count:ids.length, capacity, reservationIds:ids, updatedAt:new Date().toISOString()
  });
  return batch.commit();
}
function santaClient(c) {
  Object.assign(c.values, { date:'2026-12-24', time:'16:00', guests:'1', christmasReference:'PH ficticio', location:'Panamá Centro' });
  Object.assign(c.ctx, {
    isChristmasEveBooking: () => true, normalizeChristmasDateForSubmit: value => value,
    renderChristmasCoverageStatus() {}, christmasLocationState: {status:'included'}, bookingFormState: { christmasLat:9, christmasLng:-79 },
    loadRouteEventsForMonth: async () => {}, getChristmasCapacity: async () => 1,
    computeChristmasSmartRoute: () => ({feasible:true,bestSanta:'Santa 1'}), routeEvents:[], bookedEvents:[],
    isChristmasAvailabilityRow: value => value.esNavidad === true
  });
}
function browserClient(db, uid, { santa = false } = {}) {
  const c = client(store());
  c.ctx.auth.currentUser.uid = uid;
  c.ctx.crypto = { randomUUID };
  Object.assign(c.ctx, { db, doc, collection, getDoc, getDocs, query, where,
    runTransaction: (database, callback) => runTransaction(database, tx => callback({
      get: ref => tx.get(ref),
      set: (ref, data, options) => options ? tx.set(ref, structuredClone(data), options) : tx.set(ref, structuredClone(data))
    }))
  });
  if (santa) santaClient(c);
  return c;
}

for (const [label, filename, hardened] of [
  ['received rules', './received.rules', false],
  ['proposed rules', '../firestore.proposed.rules', true]
]) describe(label, { concurrency: false }, () => {
  before(async () => {
    environment = await initializeTestEnvironment({ projectId:'demo-diverty', firestore: {
      host:'127.0.0.1', port:8089, rules:readFileSync(new URL(filename, import.meta.url),'utf8')
    }});
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async ctx => {
      await setDoc(ref(ctx.firestore(),'config_web','global'),{capacidadSimultanea:2,capacidadSanta:1});
    });
  });
  after(async () => { await environment?.cleanup(); });

  test('actual website handler creates a normal request and only its owner can read its status', async () => {
    const db = dbFor('owner'), c = browserClient(db,'owner');
    await c.submit();
    assert.ok(c.messages.some(m => m.kind === 'success'), JSON.stringify(c.messages));
    const list = await assertSucceeds(getDocs(query(collection(db,base+'reservas_cliente'),where('ownerUid','==','owner'))));
    assert.equal(list.size,1);
    const id = list.docs[0].id;
    await assertFails(getDoc(ref(db,'eventos',id)));
    await assertFails(getDoc(ref(dbFor('other'),'reservas_cliente',id)));
    await assertFails(getDocs(collection(db,base+'reservas_cliente')));
    await assertSucceeds(getDoc(ref(environment.unauthenticatedContext().firestore(),'disponibilidad_web',id)));
  });
  test('actual Santa handler creates GPS availability without exposing contact details', async () => {
    const db=dbFor('owner'), c=browserClient(db,'owner',{santa:true});
    await c.submit();
    assert.ok(c.messages.some(m=>m.kind==='success'),JSON.stringify(c.messages));
    const list=await getDocs(collection(db,base+'disponibilidad_web'));
    const row=list.docs.find(d=>!d.id.startsWith('slot_')).data();
    assert.equal(row.lat,9);assert.equal(row.lng,-79);assert.equal('telefono' in row,false);
  });
  test('the administrator can update tracking, reschedule and delete operational data', async () => {
    const {event}=await sample();await bookingBatch(dbFor('owner'),event);
    const admin=dbFor(adminUid);
    await assertSucceeds(setDoc(ref(admin,'eventos',event.id),{estado:'Confirmado',hora:'15:00'},{merge:true}));
    await assertSucceeds(setDoc(ref(admin,'reservas_cliente',event.id),{estado:'Confirmado',hora:'15:00'},{merge:true}));
    await assertSucceeds(setDoc(ref(admin,'disponibilidad_web',event.id),{hora:'15:00'},{merge:true}));
    await assertSucceeds(deleteDoc(ref(admin,'disponibilidad_web',normalSlot)));
    await assertSucceeds(deleteDoc(ref(admin,'eventos',event.id)));
  });
  test('the receipt acknowledges a committed website transaction despite a lost response', async () => {
    const c=browserClient(dbFor('owner'),'owner'), transaction=c.ctx.runTransaction;
    c.ctx.runTransaction=async(...args)=>{await transaction(...args);throw Error('lost acknowledgement');};
    await c.submit();assert.ok(c.messages.some(m=>m.kind==='success'),JSON.stringify(c.messages));
    assert.equal(c.messages.some(m=>m.kind==='error'),false);
  });
  test('another customer cannot change or delete a private event or tracking record', async () => {
    const {event}=await sample();await bookingBatch(dbFor('owner'),event);
    const stranger=dbFor('other');
    await assertFails(setDoc(ref(stranger,'eventos',event.id),{total:'0'},{merge:true}));
    await assertFails(deleteDoc(ref(stranger,'eventos',event.id)));
    await assertFails(setDoc(ref(stranger,'reservas_cliente',event.id),{ownerUid:'other'},{merge:true}));
    await assertFails(deleteDoc(ref(stranger,'reservas_cliente',event.id)));
  });
  test('a customer cannot promote a request, write config, or register notification tokens', async () => {
    const {event}=await sample();const db=dbFor('owner');await bookingBatch(db,event);
    await assertFails(setDoc(ref(db,'eventos',event.id),{estado:'Confirmado'},{merge:true}));
    await assertFails(setDoc(ref(db,'config_web','global'),{capacidadSimultanea:100}));
    await assertFails(setDoc(doc(db,'tokens','fictitious'),{token:'fictitious'}));
  });
  test(hardened?'rejects an unrelated standalone lock':'reproduces an unrelated standalone lock being accepted', async () => {
    const action=setDoc(ref(dbFor('other'),'disponibilidad_web',normalSlot),{fecha:'2026-11-10',hora:'10:00',count:1,capacity:2,reservationIds:['invented'],updatedAt:new Date().toISOString()});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'rejects a request that omits capacity':'reproduces a valid-looking request bypassing capacity', async () => {
    const {event}=await sample();const action=bookingBatch(dbFor('owner'),event,{includeLock:false});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'requires customer tracking in the atomic request':'reproduces a request without customer tracking', async () => {
    const {event}=await sample();const action=bookingBatch(dbFor('owner'),event,{includeReceipt:false});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'rejects a client-invented capacity':'reproduces the client increasing configured capacity', async () => {
    const {event}=await sample();const action=bookingBatch(dbFor('owner'),event,{capacity:100});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'preserves existing reservation IDs':'reproduces replacing another reservation ID', async () => {
    const first=await sample('owner'),second=await sample('other');
    await bookingBatch(dbFor('owner'),first.event);
    const action=bookingBatch(dbFor('other'),second.event,{ids:['invented',second.id]});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'ties public Santa metadata to its private request':'reproduces publishing incorrect Santa metadata', async () => {
    const {event}=await sample('owner',true);
    const action=bookingBatch(dbFor('owner'),event,{publicOverride:{esNavidad:false,recursoNavidad:''}});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'rejects duplicate IDs consuming two slots':'reproduces one ID consuming two slots', async () => {
    const {event}=await sample();
    const action=bookingBatch(dbFor('owner'),event,{ids:[event.id,event.id]});
    await (hardened?assertFails(action):assertSucceeds(action));
  });
  test(hardened?'permits an unchanged booking retry without another capacity increment':'reproduces an unchanged booking retry being denied', async () => {
    const {event}=await sample();const db=dbFor('owner');await bookingBatch(db,event);
    const action=bookingBatch(db,event);
    await (hardened?assertSucceeds(action):assertFails(action));
    const lock=(await getDoc(ref(db,'disponibilidad_web',normalSlot))).data();
    assert.equal(lock.count,1);
  });
  if(hardened) {
    test('the actual handler accepts a remote Christmas address as pending, without invented GPS',async()=>{
      const db=dbFor('owner'),c=browserClient(db,'owner',{santa:true});
      c.values.address='PH no encontrado, calle principal';c.values.christmasReference='';
      c.ctx.bookingFormState={};c.ctx.christmasLocationState={status:'review'};
      c.ctx.computeChristmasSmartRoute=(_date,_time,_capacity,gps)=>{assert.equal(gps,null);return null;};
      await c.submit();assert.ok(c.messages.some(m=>m.kind==='success'),JSON.stringify(c.messages));
      const list=await getDocs(collection(db,base+'disponibilidad_web'));
      const publicRow=list.docs.find(d=>!d.id.startsWith('slot_'));
      assert.equal('lat' in publicRow.data(),false);assert.equal('direccion' in publicRow.data(),false);
      const event=(await getDoc(ref(dbFor(adminUid),'eventos',publicRow.id))).data();
      assert.equal(event.estado,'Pendiente');assert.equal(event.ubicacion,'Ubicación por confirmar');
      assert.equal(event.direccion,c.values.address);assert.equal('lat' in event,false);
      assert.equal((await getDoc(ref(db,'disponibilidad_web',lockKey(event)))).data().count,1);
    });
    test('missing GPS requires explicit manual review, a real address and zero provisional transport',async()=>{
      const {event}=await sample('owner',true);delete event.lat;delete event.lng;
      await assertFails(bookingBatch(dbFor('owner'),event));
      event.ubicacion='Ubicación por confirmar';event.direccion='';
      await assertFails(bookingBatch(dbFor('owner'),event));
      event.direccion='PH manual válido';event.transporte='5';
      await assertFails(bookingBatch(dbFor('owner'),event));
      event.transporte='0';event.estado='Confirmado';
      await assertFails(bookingBatch(dbFor('owner'),event));
      event.estado='Pendiente';
      await assertFails(bookingBatch(dbFor('owner'),event,{publicOverride:{lat:9,lng:-79}}));
      await assertSucceeds(bookingBatch(dbFor('owner'),event));
    });

    test('the real transactional website handler admits exactly two of three simultaneous requests', async () => {
      const clients=['one','two','three'].map(uid=>browserClient(dbFor(uid),uid));
      await Promise.all(clients.map(c=>c.submit()));
      assert.equal(clients.filter(c=>c.messages.some(m=>m.kind==='success')).length,2);
      const lock=(await getDoc(ref(dbFor(adminUid),'disponibilidad_web',normalSlot))).data();
      assert.equal(lock.count,2);assert.equal(new Set(lock.reservationIds).size,2);
    });
    test('a single verified orphan may be repaired without evicting a real reservation', async () => {
      const {event}=await sample(), orphan='web-'+randomUUID();
      await environment.withSecurityRulesDisabled(ctx=>setDoc(ref(ctx.firestore(),'disponibilidad_web',normalSlot),{fecha:event.fecha,hora:event.hora,count:1,capacity:2,reservationIds:[orphan],updatedAt:new Date().toISOString()}));
      await assertSucceeds(bookingBatch(dbFor('owner'),event));
    });
    test('a GPS mismatch is denied and a slot cannot point to a different date or namespace', async () => {
      const {event}=await sample('owner',true);
      await assertFails(bookingBatch(dbFor('owner'),event,{publicOverride:{lat:8}}));
      const {event:normal}=await sample();const db=dbFor('owner');
      const batch=writeBatch(db);batch.set(ref(db,'eventos',normal.id),normal);batch.set(ref(db,'disponibilidad_web',normal.id),availability(normal));batch.set(ref(db,'reservas_cliente',normal.id),receipt(normal));
      batch.set(ref(db,'disponibilidad_web','slot_2026-11-10_11-00'),{fecha:normal.fecha,hora:normal.hora,count:1,capacity:2,reservationIds:[normal.id],updatedAt:new Date().toISOString()});
      await assertFails(batch.commit());
    });
    test('no session can create a request and a receipt cannot forge ownership or payment', async () => {
      const {event}=await sample();await assertFails(bookingBatch(environment.unauthenticatedContext().firestore(),event));
      await assertFails(bookingBatch(dbFor('other'),event));
      await assertFails(bookingBatch(dbFor('owner'),{...event,abono:'100'}));
    });
  }
});
