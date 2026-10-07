import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteBooking,checkAvailability,controlDates,projections,ADMIN_UID} from '../policy.mjs';
import {coverage} from '../coverage.mjs';
import {productOptionsForSave} from '../../../assets/js/diverty-catalog-product.mjs';
export const sample={id:'web-00000000-0000-0000-0000-000000000001',cliente:'Prueba',email:'test@example.test',telefono:'60000000',telefonoBusqueda:'60000000',tipoEvento:'Cumpleaños',ninos:'10',fecha:'2026-11-10',hora:'10:00',direccion:'PH que no aparece',referenciaLugar:'',comentarios:'',serviciosSeleccionados:[{id:'plan',origenCatalogo:'catalogo_web',cantidad:1,precioOriginal:100}],esNavidad:false,total:'100',transporte:'0',descuento:'0'};
export const product={nombre:'Plan recreativo',precio:100,descripcion:'1 animador. 2 horas',activo:true};
const now=new Date('2026-10-06T12:00:00Z');
const quote=(event=sample,raw=product)=>quoteBooking(event,'customer',[raw],null,null,now);
test('manual and outside destinations stay pending; foreign GPS cannot be overridden by Panama text',()=>{
  const e=quote();assert.equal(e.totalPendienteTransporte,true);assert.equal(e.resourceRequirements.animadores,1);assert.equal(e.total,'100.00');
  assert.equal(coverage({lat:4.7,lng:-74.1},false,'Bella Vista, Panamá').status,'review');
  assert.equal(coverage({lat:9.04,lng:-79.51},false).status,'included');
});
test('prices, discounts, quantities and Santa type come from catalog, not client flags',()=>{
  assert.throws(()=>quote({...sample,total:'1'}),e=>e.reason==='PRICE_CHANGED' && e.details.quote.total==='100.00');
  assert.throws(()=>quote({...sample,esNavidad:true}),e=>e.reason==='INVALID_REQUEST');
  assert.throws(()=>quote({...sample,serviciosSeleccionados:[{...sample.serviciosSeleccionados[0],cantidad:2}]}),e=>e.reason==='INVALID_QUANTITY');
  assert.throws(()=>quote(sample,{...product,activo:false}),e=>e.reason==='SERVICE_UNAVAILABLE');
});
test('coupon changes require explicit new quote; hourly quantity reserves full duration',()=>{
  const raw={...product,tipoCobro:'hora',precio:50};
  const e=quote({...sample,total:'150',serviciosSeleccionados:[{...sample.serviciosSeleccionados[0],cantidad:3,precioOriginal:50}]},raw);
  assert.equal(e.resourceRequirements.durationMinutes,180);
  assert.throws(()=>quoteBooking(sample,'customer',[product],{activo:true,type:'percent',discount:10},null,now),e=>e.reason==='PRICE_CHANGED'&&e.details.quote.total==='90.00');
});
test('admin quantity settings enforce bounds and quote 200 products at their catalog unit price',()=>{
  const raw={nombre:'Hot dogs',precio:2,...productOptionsForSave({tipoServicio:'producto',tipoCobro:'unidad',cantidadMinima:50,cantidadMaxima:500,incrementoCantidad:25,unidadEtiqueta:'hot dog'})};
  const event={...sample,total:'400',serviciosSeleccionados:[{...sample.serviciosSeleccionados[0],cantidad:200,precioOriginal:2}]};
  const saved=quote(event,raw);
  assert.equal(saved.total,'400.00');assert.equal(saved.serviciosSeleccionados[0].cantidad,200);assert.equal(saved.serviciosSeleccionados[0].precio,400);assert.equal(saved.serviciosSeleccionados[0].precioOriginal,2);
  for(const cantidad of [49,501,200.5])assert.throws(()=>quote({...event,serviciosSeleccionados:[{...event.serviciosSeleccionados[0],cantidad}]},raw),e=>e.reason==='INVALID_QUANTITY');
});
test('character bookings retain the chosen catalog name and fixed price and reject extra units',()=>{
  const raw={nombre:'Personaje B',precio:95,...productOptionsForSave({tipoServicio:'personaje',tematica:'Superhéroes'})};
  const event={...sample,total:'95',serviciosSeleccionados:[{...sample.serviciosSeleccionados[0],id:'personaje-b',nombre:'Nombre modificado',precioOriginal:95}]};
  const saved=quote(event,raw);
  assert.equal(saved.serviciosSeleccionados[0].nombre,'Personaje B');assert.equal(saved.serviciosSeleccionados[0].id,'personaje-b');assert.equal(saved.total,'95.00');
  assert.throws(()=>quote({...event,serviciosSeleccionados:[{...event.serviciosSeleccionados[0],cantidad:2}]},raw),e=>e.reason==='INVALID_QUANTITY');
});
test('different start times compete for staff and capacity; adjacent boundaries do not overlap',()=>{
  const e=quote(),config={capacidadSimultanea:3,recursosDisponibles:{animadores:1,payasos:1}};
  assert.throws(()=>checkAvailability(e,[{...e,id:'other',hora:'11:00'}],config),e=>e.reason==='SLOT_FULL');
  checkAvailability(e,[{...e,id:'other',hora:'12:00'}],config);
  checkAvailability(e,[{...e,id:'other',hora:'08:00'}],config);
  assert.throws(()=>checkAvailability(e,[],{...config,recursosDisponibles:{animadores:0,payasos:0}}),e=>e.reason==='SLOT_FULL');
});
test('peak capacity handles sequential existing events without summing unrelated intervals',()=>{
  const e=quote();const rows=[{...e,id:'one',hora:'09:00',duracionMinutos:120},{...e,id:'two',hora:'11:00',duracionMinutos:120}];
  checkAvailability(e,rows,{capacidadSimultanea:2,recursosDisponibles:{animadores:2,payasos:0}});
});
test('cross midnight reservations share day coordinators and conflict',()=>{
  const e={...quote(),hora:'23:30'};
  assert.deepEqual(controlDates(e),['2026-11-09','2026-11-10','2026-11-11']);
  assert.throws(()=>checkAvailability({...e,id:'new',fecha:'2026-11-11',hora:'00:30'},[e],{recursosDisponibles:{animadores:1,payasos:0}}),e=>e.reason==='SLOT_FULL');
});
test('cancellations free capacity and projections contain no public customer information',()=>{
  const e=quote();checkAvailability(e,[{...e,id:'other',estado:'Rechazada'}],{recursosDisponibles:{animadores:1,payasos:0}});
  const {availability,receipt}=projections(e);
  for(const k of ['cliente','email','telefono','direccion','ownerUid','total'])assert.equal(k in availability,false);
  assert.equal(receipt.totalPendienteTransporte,true);assert.equal(receipt.ownerUid,'customer');
});
test('Santa route uses travel margins and validates assigned Santa on approval',()=>{
  const e={id:'new',esNavidad:true,fecha:'2026-12-24',hora:'17:00',lat:9.04,lng:-79.51};
  const rows=[{...e,id:'old',hora:'16:30',santaAsignado:'Santa 1'}];
  assert.throws(()=>checkAvailability(e,rows,{capacidadSanta:1}),e=>e.reason==='ROUTE_FULL');
  checkAvailability(e,rows,{capacidadSanta:2},'Santa 2');
  assert.throws(()=>checkAvailability(e,rows,{capacidadSanta:2},'Santa 1'),e=>e.reason==='ROUTE_FULL');
});
test('invalid and past dates are rejected predictably',()=>{
  for(const fecha of ['2026-99-10','2026-02-30','2020-01-01'])assert.throws(()=>quote({...sample,fecha}),e=>['INVALID_REQUEST','PAST_DATE'].includes(e.reason));
});


test('Santa travel margin also applies across midnight on December 24 and 25',()=>{
  const row={id:'old',esNavidad:true,fecha:'2026-12-24',hora:'23:30',lat:9.04,lng:-79.51,santaAsignado:'Santa 1'};
  const event={...row,id:'new',fecha:'2026-12-25',hora:'00:00'};
  assert.throws(()=>checkAvailability(event,[row],{capacidadSanta:1},'Santa 1'),e=>e.reason==='ROUTE_FULL');
  checkAvailability({...event,hora:'00:30'},[row],{capacidadSanta:1},'Santa 1');
});

test('central booking requires a written venue reference even with a GPS map link',()=>{
  const input={...sample,direccion:'https://www.google.com/maps?q=9.04,-79.51',referenciaLugar:''};
  assert.throws(()=>quote(input),e=>e.reason==='PLACE_REFERENCE_REQUIRED');
  const e=quote({...input,referenciaLugar:'PH Las Palmeras, salón social'});assert.equal(e.referenciaLugar,'PH Las Palmeras, salón social');
});
