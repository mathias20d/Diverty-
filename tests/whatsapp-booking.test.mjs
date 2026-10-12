import test from 'node:test';
import assert from 'node:assert/strict';
import {whatsappBookings,whatsappTemplate,whatsappPhone,sendWhatsappTemplate,WHATSAPP_JOBS} from '../firebase/functions/whatsapp-booking.mjs';
import {bookingWhatsappHandler} from '../netlify/lib/booking-whatsapp-handler.mjs';
import {queueWhatsappConfirmation} from '../assets/js/diverty-whatsapp-confirmation.mjs';
const base='artifacts/diverty-oficial/public/data',id='web-00000000-0000-0000-0000-000000000001';
const event={id,ownerUid:'owner',origen:'Web Directa',cliente:'Cliente ficticio',telefono:'60000000',fecha:'2030-11-10',hora:'14:00',estado:'Pendiente',servicio:'Plan Recreativo',total:150};
function memory(enabled=true){
  const rows=new Map([[`${base}/eventos/${id}`,structuredClone(event)],[`${base}/config_web/global`,{whatsappBookingEnabled:enabled}]]);let tail=Promise.resolve();
  const ref=path=>({path,set:async(data,options)=>rows.set(path,options?.merge?{...rows.get(path),...structuredClone(data)}:structuredClone(data))});
  const db={doc:ref,runTransaction:callback=>{const next=tail.then(async()=>{const writes=[];const result=await callback({get:async r=>({exists:rows.has(r.path),data:()=>structuredClone(rows.get(r.path))}),set:(r,data,options)=>writes.push(()=>r.set(data,options))});for(const write of writes)await write();return result;});tail=next.catch(()=>{});return next;}};
  return {db,rows,service:whatsappBookings(db,()=>new Date('2030-11-01T12:00:00Z'))};
}
const jobPath=`${WHATSAPP_JOBS}/${id}`;
test('verified owner consent queues once without altering the booking or writing phone/name into the job',async()=>{
  const {rows,service}=memory();await assert.rejects(service.queue('other',id),e=>e.reason==='FORBIDDEN');
  const result=await Promise.all([service.queue('owner',id),service.queue('owner',id)]);
  assert.deepEqual(result,[{status:'queued'},{status:'queued'}]);assert.equal(rows.size,3);
  assert.deepEqual(rows.get(`${base}/eventos/${id}`),event);
  assert.doesNotMatch(JSON.stringify(rows.get(jobPath)),/60000000|Cliente ficticio/);
  const disabled=memory(false);assert.deepEqual(await disabled.service.queue('owner',id),{status:'disabled'});assert.equal(disabled.rows.size,2);
});
test('concurrent trigger delivery sends once, and accepted is distinct from delivered',async()=>{
  const {rows,service}=memory();await service.queue('owner',id);let calls=0;
  const sender=async saved=>{assert.equal(saved.telefono,event.telefono);calls++;return 'wamid-fake';};
  await Promise.all([service.deliver(id,sender),service.deliver(id,sender)]);
  assert.equal(calls,1);assert.equal(rows.get(jobPath).status,'accepted');
  await service.deliver(id,sender);assert.equal(calls,1);
});
test('phone changes, cancellation, no consent and disabling the feature prevent any send',async()=>{
  for(const change of [{telefono:'61111111'},{estado:'Cancelada'},{ownerUid:'other'}]){
    const {rows,service}=memory();await service.queue('owner',id);Object.assign(rows.get(`${base}/eventos/${id}`),change);
    await service.deliver(id,()=>{throw new Error('must not send');});assert.equal(rows.get(jobPath).status,'skipped');
  }
  const noConsent=memory();assert.deepEqual(await noConsent.service.deliver(id,()=>{throw new Error('must not send');}),{status:'skipped'});
  const disabled=memory();await disabled.service.queue('owner',id);disabled.rows.set(`${base}/config_web/global`,{whatsappBookingEnabled:false});
  await disabled.service.deliver(id,()=>{throw new Error('must not send');});assert.equal(disabled.rows.get(jobPath).status,'skipped');
});
test('a timeout does not automatically resend a potentially accepted message',async()=>{
  const {rows,service}=memory();await service.queue('owner',id);let calls=0;
  const sender=()=>{calls++;throw new Error('timeout');};
  await service.deliver(id,sender);await service.deliver(id,sender);
  assert.equal(calls,1);assert.equal(rows.get(jobPath).status,'unknown');
});
test('official template payload uses authoritative phone, receipt wording and no secret in its body',async()=>{
  const config={token:'FAKE-TOKEN',phoneNumberId:'123',apiVersion:'v99.0',template:'diverty_solicitud_recibida',language:'es'};
  const message=whatsappTemplate(event,config);
  assert.equal(message.body.to,'50760000000');assert.equal(message.body.type,'template');
  assert.equal(message.body.template.components[0].parameters[5].text,'Pendiente de revisión por Diverty');
  assert.doesNotMatch(JSON.stringify(message.body),/FAKE-TOKEN|150/);
  assert.equal(whatsappPhone('+507 6000-0000'),'50760000000');assert.equal(whatsappPhone('+1 (212) 555-1234'),'12125551234');
  assert.throws(()=>whatsappPhone('60000000;spam'),/INVALID_PHONE/);
  assert.throws(()=>whatsappTemplate(event,{...config,apiVersion:''}),/NOT_CONFIGURED/);
  const sent=await sendWhatsappTemplate(event,config,async(url,options)=>{assert.equal(url,message.url);assert.equal(options.headers.Authorization,'Bearer FAKE-TOKEN');return {ok:true,json:async()=>({messages:[{id:'fake-wamid'}]})};});
  assert.equal(sent,'fake-wamid');
  await assert.rejects(sendWhatsappTemplate(event,config,async()=>({ok:false})),/META_REJECTED/);
});
const request=payload=>new Request('https://example.test/api/booking-whatsapp',{method:'POST',headers:{Origin:'https://example.test',Authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify(payload)});
test('HTTP gate rejects absent consent, forged recipients and another owner, and is disabled by default',async()=>{
  const backend={verifyToken:async()=>({uid:'owner'}),queue:memory().service.queue};
  const handler=bookingWhatsappHandler(()=>backend,()=>true);
  assert.equal((await bookingWhatsappHandler(()=>{throw new Error('must not connect');})(request({consent:true,reservationId:id}))).status,503);
  for(const body of [{reservationId:id},{consent:false,reservationId:id},{consent:true,reservationId:id,phone:'69999999'}])assert.equal((await handler(request(body))).status,400);
  assert.equal((await handler(request({consent:true,reservationId:id}))).status,200);
  const intruder=bookingWhatsappHandler(()=>({...backend,verifyToken:async()=>({uid:'other'})}),()=>true);
  assert.equal((await intruder(request({consent:true,reservationId:id}))).status,403);
});
test('browser queue request contains only consent/ID; queueing never claims delivery',async()=>{
  const result=await queueWhatsappConfirmation(id,{getIdToken:async()=> 'fake'},async(url,options)=>{assert.equal(url,'/api/booking-whatsapp');assert.deepEqual(JSON.parse(options.body),{consent:true,reservationId:id});return {ok:true,json:async()=>({status:'queued'})};});
  assert.equal(result,'queued');
  await assert.rejects(queueWhatsappConfirmation(id,{getIdToken:async()=> 'fake'},async()=>({ok:false})),/WHATSAPP_UNAVAILABLE/);
});
