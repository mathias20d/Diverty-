import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {customerPortalService} from '../portal-service.mjs';
const local=process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8089';
const base='artifacts/diverty-oficial/public/data';
const reservation={cliente:'María Peña',telefono:'+507 6070-2108',fecha:'2026-11-10',hora:'10:00',estado:'Pendiente',servicio:'Animación',total:'100',abono:'25',direccion:'private',email:'private@example.test',comentarios:'private',ownerUid:'original-browser'};

test('portal finds old/manual reservations from another browser and updates dates, balances, cancellation and deletion',{skip:!local},async()=>{
  const app=initializeApp({projectId:'demo-diverty-portal'},'portal-tests'),db=getFirestore(app);
  const ref=(section,id)=>db.doc(`${base}/${section}/${id}`);
  let now=new Date('2026-10-07T12:00:00Z');const portal=customerPortalService(db,()=>now);
  try{
    await db.recursiveDelete(db.collection('artifacts'));
    await ref('eventos','web').set(reservation);
    await assert.rejects(portal.sync('web','different-browser'),error=>error.reason==='FORBIDDEN');
    assert.equal((await ref('portal_busqueda','web').get()).exists,false);
    await portal.sync('web','original-browser');
    assert.equal((await ref('portal_busqueda','web').get()).data().telefonoKey,'60702108');
    const phone=await portal.lookup('different-browser',{search:'60702108'},'test-ip');
    assert.equal(phone.reservations[0].cliente,'María Peña');assert.equal(phone.reservations[0].abono,'25');
    for(const key of ['ownerUid','telefono','direccion','email','comentarios'])assert.equal(key in phone.reservations[0],false);
    // Migration/index removes the browser-owner requirement and preserves all statuses.
    await portal.sync('web');
    await ref('eventos','manual').set({...reservation,ownerUid:'',fecha:'2026-11-12'});await portal.sync('manual');
    const name=await portal.lookup('third-browser',{search:'  MARIA   PENA '},'test-ip');assert.equal(name.reservations.length,2);assert.equal(name.reservations[0].fecha,'2026-11-12');
    await ref('eventos','web').update({estado:'Cancelada',abono:'100',fecha:'2026-11-15'});
    // Current source wins even before the event trigger catches up.
    const changed=await portal.lookup('third-browser',{search:'+507 6070-2108'},'test-ip');
    assert.equal(changed.reservations[0].estado,'Cancelada');assert.equal(changed.reservations[0].abono,'100');
    await ref('eventos','web').update({telefono:'60000000'});
    const reassigned=await portal.lookup('third-browser',{search:'60702108'},'test-ip');assert.equal(reassigned.reservations.length,1);assert.equal(reassigned.reservations[0].id,'manual');
    await portal.sync('web');
    await assert.rejects(portal.lookup('third-browser',{search:'María Peña'},'test-ip'),error=>error.reason==='AMBIGUOUS_NAME');
    await ref('eventos','web').delete();await portal.sync('web');assert.equal((await ref('portal_busqueda','web').get()).exists,false);
    await assert.rejects(portal.lookup('',{search:'60702108'}),error=>error.reason==='AUTH_REQUIRED');
    await assert.rejects(portal.lookup('browser',{search:'!!!'}),error=>error.reason==='INVALID_NAME');
    await assert.rejects(portal.lookup('browser',{search:'69999999'}),error=>error.reason==='INDEX_NOT_READY');
    await ref('configuracion','migracion_portal_v1').set({done:true});
    assert.deepEqual((await portal.lookup('browser',{search:'69999999'})).reservations,[]);
    for(let i=0;i<15;i++)await portal.lookup('rate-limited',{search:'60702108'});
    await assert.rejects(portal.lookup('rate-limited',{search:'60702108'}),error=>error.reason==='RATE_LIMITED');
    now=new Date(now.getTime()+61000);assert.equal((await portal.lookup('rate-limited',{search:'60702108'})).reservations.length,1);
  }finally{await db.recursiveDelete(db.collection('artifacts'));await deleteApp(app);}
});
