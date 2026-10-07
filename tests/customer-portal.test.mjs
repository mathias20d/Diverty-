import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortalPhone, parsePortalQuery, searchCustomerPortal, portalIndex, portalSummary } from '../assets/js/diverty-portal.mjs';
const event={id:'reservation',cliente:'María Peña',telefono:'+507 6070-2108',fecha:'2026-11-10',hora:'10:00',estado:'Cancelada',servicio:'Animación',total:100,abono:25};

test('phone normalization accepts +507 and separators without truncating local numbers beginning 507',()=>{
  for(const phone of ['60702108','+507 6070-2108','00507 6070 2108'])assert.equal(normalizePortalPhone(phone),'60702108');
  assert.equal(normalizePortalPhone('50701234'),'50701234');
  assert.equal(parsePortalQuery(' maria   peña ').value,'maria pena');
  for(const input of ['','123','!!!'])assert.throws(()=>parsePortalQuery(input));
});

test('same-browser searches accept name or phone and keep cancelled reservations visible',async()=>{
  for(const input of ['60702108','  MARIA   PENA ']){
    const rows=await searchCustomerPortal(input,{getOwned:async()=>[event],lookup:async()=>assert.fail('matching owner receipt needs no remote search')});
    assert.equal(rows[0].estado,'Cancelada');assert.equal(rows[0].cliente,'María Peña');
  }
});

test('a different browser can find a reservation through the server without owning its anonymous session',async()=>{
  let calls=0;
  const rows=await searchCustomerPortal('+507 6070 2108',{getOwned:async()=>[],lookup:async search=>{calls++;assert.equal(search.value,'60702108');return {reservations:[portalSummary(event,event.id)]};}});
  assert.equal(calls,1);assert.equal(rows[0].abono,'25');
});

test('permission failures, offline state and missing backend never masquerade as an empty search',async()=>{
  for(const getOwned of [async()=>[],async()=>{throw new Error('permission-denied');}])await assert.rejects(searchCustomerPortal('60702108',{getOwned,lookup:async()=>{throw new Error('functions/not-found');}}),error=>error.reason==='UNAVAILABLE');
  const rows=await searchCustomerPortal('60702108',{getOwned:async()=>{throw new Error('permission-denied');},lookup:async()=>({reservations:[portalSummary(event,event.id)]})});
  assert.equal(rows.length,1);
  assert.deepEqual(await searchCustomerPortal('60702108',{getOwned:async()=>[],lookup:async()=>({reservations:[]})}),[]);
});

test('duplicate names request a phone; lookup projections keep private location, email and notes out of responses',async()=>{
  await assert.rejects(searchCustomerPortal('María Peña',{getOwned:async()=>[event,{...event,telefono:'60000000'}],lookup:async()=>assert.fail()}),error=>error.reason==='AMBIGUOUS_NAME');
  assert.deepEqual(portalIndex(event),{nombreKey:'maria pena',telefonoKey:'60702108'});
  const summary=portalSummary({...event,direccion:'private',email:'private',comentarios:'private',total:'invalid'},'id');
  assert.equal(summary.total,'0');for(const key of ['telefono','ownerUid','direccion','email','comentarios'])assert.equal(key in summary,false);
});
