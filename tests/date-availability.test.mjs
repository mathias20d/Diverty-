import test from 'node:test';
import assert from 'node:assert/strict';
import { client, store } from './support/booking-fixture.mjs';
import { bookingCalendarDays } from '../assets/js/diverty-date-picker.mjs';
const base='artifacts/diverty-oficial/public/data/';

test('booking date picker disables manually closed dates without hiding their numbers', () => {
  const days=bookingCalendarDays(2026,10,'2026-10-07',{'2026-11-10':true});
  assert.equal(days.find(day=>day?.value==='2026-11-10').available,false);
  assert.equal(days.find(day=>day?.value==='2026-11-10').day,10);
  assert.equal(days.find(day=>day?.value==='2026-11-11').available,true);
});

test('an already open form cannot create a booking after the day closes; reopening restores submission', async () => {
  const database=store(), c=client(database);
  database.rows.set(base+'config_web/fechas_cerradas',{fechas:{'2026-11-10':true}});
  await c.submit();
  assert.equal([...database.rows.keys()].some(key=>/\/(eventos|reservas_cliente|disponibilidad_web)\//.test(key)),false);
  assert.ok(c.messages.some(message=>message.text?.includes('sin disponibilidad')));
  database.rows.set(base+'config_web/fechas_cerradas',{fechas:{}});
  await c.submit();
  assert.equal([...database.rows.keys()].filter(key=>key.includes('/eventos/')).length,1);
  assert.ok(c.messages.some(message=>message.kind==='success'));
});

test('a committed reservation still recovers its receipt after the day closes', async () => {
  const database=store(), c=client(database);
  await c.submit();
  const event=[...database.rows.entries()].find(([key])=>key.includes('/eventos/'))[1];
  c.ctx.app.cart=[{id:'paquete',name:'Paquete de prueba',price:100,quantity:1}];
  c.ctx.pendingBooking={id:event.id,data:event,promise:null};
  database.rows.set(base+'config_web/fechas_cerradas',{fechas:{[event.fecha]:true}});
  await c.submit();
  assert.equal([...database.rows.keys()].filter(key=>key.includes('/eventos/')).length,1);
  assert.equal(c.messages.filter(message=>message.kind==='success').length,2);
});
