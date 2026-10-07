import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {bookingService} from '../service.mjs';
import {ADMIN_UID} from '../policy.mjs';
// Separate demo project; never issue writes without the known local emulator.
const local=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8089';
const base='artifacts/diverty-oficial/public/data';
const event={id:'web-00000000-0000-0000-0000-000000000001',cliente:'Prueba',email:'test@example.test',telefono:'60000000',telefonoBusqueda:'60000000',tipoEvento:'Cumpleaños',ninos:'10',fecha:'2026-11-10',hora:'10:00',direccion:'PH de prueba',referenciaLugar:'',comentarios:'',serviciosSeleccionados:[{id:'plan',origenCatalogo:'catalogo_web',cantidad:1,precioOriginal:100}],esNavidad:false,total:'100',transporte:'0',descuento:'0'};
test('real Firestore transactions serialize overlapping starts, recover retries and synchronize approval',{skip:!local},async()=>{
  const app=initializeApp({projectId:'demo-diverty-booking'},'booking-tests');const db=getFirestore(app);
  const ref=(section,id)=>db.doc(`${base}/${section}/${id}`);
  const service=bookingService(db,()=>new Date('2026-10-06T12:00:00Z'));
  try{
    await db.recursiveDelete(db.collection('artifacts'));
    await ref('config_web','global').set({centralBookingValidation:true,capacidadSimultanea:3,capacidadSanta:1,recursosDisponibles:{animadores:1,payasos:0}});
    await ref('catalogo_web','plan').set({nombre:'Plan recreativo',precio:100,descripcion:'1 animador. 2 horas',activo:true});
    const second={...event,id:'web-00000000-0000-0000-0000-000000000002',hora:'11:00'};
    const result=await Promise.allSettled([service.create('customer',{event}),service.create('customer-2',{event:second})]);
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(result.find(r=>r.status==='rejected').reason.reason,'SLOT_FULL');
    const created=result.find(r=>r.status==='fulfilled').value.event;
    const payload=created.id===event.id?event:second;const owner=created.ownerUid;
    const retry=await service.create(owner,{event:payload});assert.equal(retry.recovered,true);
    assert.equal((await db.collection(`${base}/eventos`).get()).size,1);
    const lock=await ref('disponibilidad_web',`slot_${created.fecha}_${created.hora.replace(':','-')}`).get();assert.equal(lock.data().count,1);
    await assert.rejects(service.create('intruder',{event:payload}),e=>e.reason==='FORBIDDEN');
    await assert.rejects(service.confirm('intruder',{id:created.id}),e=>e.reason==='FORBIDDEN');
    await assert.rejects(service.confirm(ADMIN_UID,{id:created.id}),e=>e.reason==='TRANSPORT_REVIEW_REQUIRED');
    await ref('eventos',created.id).update({transporteRevisadoEnApp:true,transporte:'15',total:'115'});
    const confirmed=await service.confirm(ADMIN_UID,{id:created.id});assert.equal(confirmed.event.estado,'Confirmado');
    const receipt=(await ref('reservas_cliente',created.id).get()).data();assert.equal(receipt.estado,'Confirmado');assert.equal(receipt.total,'115');assert.equal(receipt.totalPendienteTransporte,false);
    const publicData=(await ref('disponibilidad_web',created.id).get()).data();assert.equal(publicData.resourceRequirements.animadores,1);assert.equal('direccion'in publicData,false);
    await assert.rejects(service.confirm(ADMIN_UID,{id:created.id}),e=>e.reason==='ALREADY_PROCESSED');
    // Rejecting an existing request immediately releases its resources.
    await ref('eventos',created.id).update({estado:'Rechazada'});
    const other=created.id===event.id?second:event;
    const released=await service.create('new-owner',{event:other});assert.equal(released.event.estado,'Pendiente');
    await ref('config_web','global').update({centralBookingValidation:false});
    await assert.rejects(service.create('customer',{event:{...event,id:'web-00000000-0000-0000-0000-000000000003'}}),e=>e.reason==='NOT_ENABLED');
  }finally{await db.recursiveDelete(db.collection('artifacts'));await deleteApp(app);}
});

test('central service refuses a closed day, permits reopening and recovers existing requests',{skip:!local},async()=>{
  const app=initializeApp({projectId:'demo-diverty-closed-dates'},'closure-tests');const db=getFirestore(app);
  const ref=(section,id)=>db.doc(`${base}/${section}/${id}`);
  const service=bookingService(db,()=>new Date('2026-10-07T12:00:00Z'));
  try {
    await db.recursiveDelete(db.collection('artifacts'));
    await ref('config_web','global').set({centralBookingValidation:true,capacidadSimultanea:3,recursosDisponibles:{animadores:3,payasos:1}});
    await ref('catalogo_web','plan').set({nombre:'Plan recreativo',precio:100,descripcion:'1 animador. 2 horas',activo:true});
    await ref('config_web','fechas_cerradas').set({fechas:{[event.fecha]:true}});
    await assert.rejects(service.create('owner',{event}),e=>e.reason==='DATE_CLOSED');
    assert.equal((await db.collection(`${base}/eventos`).get()).size,0);
    await ref('config_web','fechas_cerradas').set({fechas:{}});
    const created=await service.create('owner',{event});assert.equal(created.recovered,false);
    await ref('config_web','fechas_cerradas').set({fechas:{[event.fecha]:true}});
    const recovered=await service.create('owner',{event});assert.equal(recovered.recovered,true);
    assert.equal((await db.collection(`${base}/eventos`).get()).size,1);
    await assert.rejects(service.create('other',{event:{...event,id:'web-00000000-0000-0000-0000-000000000099'}}),e=>e.reason==='DATE_CLOSED');
  }finally{await db.recursiveDelete(db.collection('artifacts'));await deleteApp(app);}
});
