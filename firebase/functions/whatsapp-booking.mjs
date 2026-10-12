import {createHash} from 'node:crypto';
const base='artifacts/diverty-oficial/public/data';
export const WHATSAPP_JOBS='diverty_whatsapp_bookings';
export const WHATSAPP_CONSENT_VERSION='diverty-booking-receipt-v1';
const clean=(value,max=512)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const fail=reason=>{throw Object.assign(new Error(reason),{reason});};
export function whatsappPhone(value){
  let number=String(value??'').trim();
  if(!/^[+\d\s().-]+$/.test(number))fail('INVALID_PHONE');
  number=number.replace(/\D/g,'').replace(/^00/,'');
  if(number.length===8)number='507'+number;
  if(!/^[1-9]\d{7,14}$/.test(number))fail('INVALID_PHONE');
  return number;
}
const phoneHash=value=>createHash('sha256').update(whatsappPhone(value)).digest('hex');
const eligible=event=>event?.origen==='Web Directa'&&event.ownerUid&&event.deletedLocally!==true&&!/cancelad|rechaz|cot/i.test(event.estado||'');

export function whatsappBookings(db,clock=()=>new Date()){
  const eventRef=id=>db.doc(`${base}/eventos/${id}`),configRef=db.doc(`${base}/config_web/global`);
  return {
    async queue(uid,id){
      if(!uid)fail('AUTH_REQUIRED');
      if(!/^web-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id||''))fail('INVALID_REQUEST');
      const jobRef=db.doc(`${WHATSAPP_JOBS}/${id}`);
      return db.runTransaction(async tx=>{
        const [event,config,job]=await Promise.all([tx.get(eventRef(id)),tx.get(configRef),tx.get(jobRef)]);
        if(!event.exists||event.data().ownerUid!==uid)fail('FORBIDDEN');
        if(!eligible(event.data()))fail('INELIGIBLE');
        if(config.data()?.whatsappBookingEnabled!==true)return {status:'disabled'};
        if(job.exists)return {status:job.data().status};
        tx.set(jobRef,{reservationId:id,ownerUid:uid,phoneHash:phoneHash(event.data().telefono),consentVersion:WHATSAPP_CONSENT_VERSION,consentAt:clock().toISOString(),status:'queued',attempts:0});
        return {status:'queued'};
      });
    },
    async deliver(id,sender){
      if(!/^web-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id||''))return {status:'skipped'};
      const jobRef=db.doc(`${WHATSAPP_JOBS}/${id}`);
      const event=await db.runTransaction(async tx=>{
        const [job,snapshot,config]=await Promise.all([tx.get(jobRef),tx.get(eventRef(id)),tx.get(configRef)]);
        if(!job.exists||job.data().status!=='queued')return null;
        const data=snapshot.exists?snapshot.data():null,record=job.data();
        const age=clock()-new Date(record.consentAt);
        if(!eligible(data)||data.ownerUid!==record.ownerUid||record.reservationId!==id||config.data()?.whatsappBookingEnabled!==true||record.consentVersion!==WHATSAPP_CONSENT_VERSION||!Number.isFinite(age)||age<0||age>86400000){
          tx.set(jobRef,{status:'skipped',reason:'INELIGIBLE',updatedAt:clock().toISOString()},{merge:true});return null;
        }
        let samePhone=false;try{samePhone=record.phoneHash===phoneHash(data.telefono);}catch{}
        if(!samePhone){tx.set(jobRef,{status:'skipped',reason:'PHONE_CHANGED',updatedAt:clock().toISOString()},{merge:true});return null;}
        // Claim before the external request. Concurrent deliveries cannot send twice.
        tx.set(jobRef,{status:'dispatching',attempts:(record.attempts||0)+1,updatedAt:clock().toISOString()},{merge:true});
        return {...data,id};
      });
      if(!event)return {status:'skipped'};
      try{
        const messageId=await sender(event);
        await jobRef.set({status:'accepted',messageId,updatedAt:clock().toISOString()},{merge:true});
        return {status:'accepted'};
      }catch(error){
        // A network timeout may happen after Meta accepts the message. Never
        // retry that ambiguous send automatically and risk duplicate receipts.
        const status=error.reason==='META_REJECTED'||error.reason==='NOT_CONFIGURED'?'failed':'unknown';
        await jobRef.set({status,reason:error.reason||'UNKNOWN_DELIVERY',updatedAt:clock().toISOString()},{merge:true});
        return {status};
      }
    }
  };
}

export function whatsappTemplate(event,config){
  if(!/^\d+$/.test(config.phoneNumberId||'')||!/^v\d+\.\d+$/.test(config.apiVersion||'')||!config.token||!/^[a-z0-9_]+$/.test(config.template||'')||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.language||''))fail('NOT_CONFIGURED');
  const date=/^\d{4}-\d{2}-\d{2}$/.test(event.fecha||'')?event.fecha.split('-').reverse().join('/'):'Por definir';
  const status=event.estado==='Pendiente'?'Pendiente de revisión por Diverty':clean(event.estado,100);
  return {url:`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,body:{messaging_product:'whatsapp',to:whatsappPhone(event.telefono),type:'template',template:{name:config.template,language:{code:config.language},components:[{type:'body',parameters:[event.cliente,event.servicio,date,event.hora,event.id,status].map(value=>({type:'text',text:clean(value)||'Por definir'}))}]}}};
}
export async function sendWhatsappTemplate(event,config,fetchImpl=fetch){
  const {url,body}=whatsappTemplate(event,config);
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!response.ok)fail('META_REJECTED');
  const result=await response.json();
  if(typeof result.messages?.[0]?.id!=='string'||!result.messages[0].id)fail('UNKNOWN_DELIVERY');
  return result.messages[0].id;
}
