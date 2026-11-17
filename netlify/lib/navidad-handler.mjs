import {bookingService} from '../../firebase/functions/service.mjs';
import {active,isSanta,checkAvailability,ADMIN_UID} from '../../firebase/functions/policy.mjs';
import {computeChristmasSmartRoute} from '../../firebase/functions/christmas-recommendations.mjs';
import {claimSlug} from './navidad-links.mjs';
import {saveProfile} from './navidad-profile.mjs';
const PRIVATE='no-store, private';
export function scopeForCompany(uid){if(typeof uid!=='string'||!/^[-_A-Za-z0-9]{1,128}$/.test(uid))throw Object.assign(Error('INVALID_REQUEST'),{reason:'INVALID_REQUEST'});return{uid,legacy:uid===ADMIN_UID,base:'artifacts/'+(uid===ADMIN_UID?'diverty-oficial':'navidad_'+uid)+'/public/data'};}
export function publicBooking(event){const keys=['id','ownerUid','cliente','email','telefono','fecha','hora','estado','servicio','total','abono','precioServicios','transporte','descuento','totalPendienteTransporte','requiereRevisionUbicacion','direccion','referenciaLugar','ubicacion','descripcionEvento'];return Object.fromEntries(keys.filter(k=>event[k]!==undefined).map(k=>[k,event[k]]));}
export function buildPublicAvailability(rows,config,point){
 const safe=rows.filter(e=>active(e)&&isSanta(e)&&['2026-12-24','2026-12-25'].includes(e.fecha));
 const busy=safe.map((e,index)=>({id:'busy_'+index,_availabilityId:'busy_'+index,fecha:e.fecha,hora:e.hora,esNavidad:true,recursoNavidad:'Santa'}));
 const capacity=Number(config.capacidadSanta??1);if(!Number.isInteger(capacity)||capacity<1||capacity>20)throw Object.assign(Error('CONFIG_REQUIRED'),{reason:'CONFIG_REQUIRED'});
 const recommendations={};
 for(const date of ['2026-12-24','2026-12-25'])for(let minute=date.endsWith('24')?960:0;minute<=(date.endsWith('24')?1410:840);minute+=30){const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),hint=point?computeChristmasSmartRoute(date,time,capacity,point,safe):null;let feasible=true;try{checkAvailability({id:'__probe',fecha:date,hora:time,esNavidad:true,...point},safe,config);}catch{feasible=false;}recommendations[date+'|'+time]={feasible:feasible&&hint?.feasible!==false,score:Math.round(hint?.score??9999),nearby:!!(hint?.feasible&&hint.anchors>0&&Number.isFinite(hint.nearestKm)&&hint.nearestKm<=10&&Number.isFinite(hint.nearestTimeGap)&&hint.nearestTimeGap<=120),anchors:hint?.anchors?1:0,nearestKm:null,nearestTimeGap:null,bestSanta:'',addedTravel:0};}
 return{rows:busy,recommendations,capacity};
}
export function navidadHandler(getBackend){return async request=>{
 const origin=request.headers.get('origin')||'',headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':PRIVATE,'X-Content-Type-Options':'nosniff','Vary':'Origin'};
 // CORS never grants access to a private action: owner identity is independently verified below.
 let allowedOrigin=false;try{const u=new URL(origin);allowedOrigin=u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));}catch{}if(allowedOrigin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
 const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method==='GET'){try{await getBackend();return reply(200,{service:'Operación Navidad',ready:true});}catch{return reply(503,{error:{reason:'UNAVAILABLE'}});}}
 if(request.method!=='POST')return reply(405,{error:{reason:'METHOD_NOT_ALLOWED'}});
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error(),{reason:'INVALID_REQUEST'});const text=await request.text();if(text.length>70000)throw Object.assign(Error(),{reason:'INVALID_REQUEST'});const data=JSON.parse(text),scope=scopeForCompany(data.empresa),backend=await getBackend(),database=backend.database;
  const configSnap=await database.doc(scope.base+'/config_web/global').get(),config=configSnap.data()||{};
  let identity=null;const bearer=request.headers.get('authorization')||'';if(bearer){if(!bearer.startsWith('Bearer ')||bearer.length>8192)throw Object.assign(Error(),{reason:'AUTH_REQUIRED'});try{identity=await backend.verifyToken(bearer.slice(7));}catch{throw Object.assign(Error(),{reason:'AUTH_REQUIRED'});}}
  if(!scope.legacy&&config.publicado!==true&&identity?.uid!==scope.uid)throw Object.assign(Error(),{reason:'NOT_FOUND'});
  if(data.action==='availability'){
   if(data.month!=='2026-12')return reply(200,{rows:[],recommendations:{},capacity:Number(config.capacidadSanta||1)});
   let point=null;if(data.location!==null&&data.location!==undefined){const lat=Number(data.location.lat),lng=Number(data.location.lng);if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))throw Object.assign(Error(),{reason:'INVALID_REQUEST'});point={lat,lng};}
   const snapshot=await database.collection(scope.base+'/eventos').where('fecha','>=','2026-12-24').where('fecha','<=','2026-12-25').get();
   return reply(200,buildPublicAvailability(snapshot.docs.map(doc=>({...doc.data(),id:doc.id})),config,point));
  }
  if(!identity?.uid)throw Object.assign(Error(),{reason:'AUTH_REQUIRED'});
  const service=bookingService(database,()=>new Date(),{base:scope.base,ownerUid:scope.uid,trustedEndpoint:true});
  if(data.action==='create'){
   if(data.payload?.event?.esNavidad!==true)throw Object.assign(Error(),{reason:'INVALID_REQUEST'});
   const result=await service.create(identity.uid,data.payload);
   if(!result.recovered)try{await backend.notifyChristmas?.(scope.base,result.event.id);}catch{}
   return reply(200,{event:publicBooking(result.event),recovered:result.recovered===true});
  }
  if(data.action==='link'){
   if(identity.uid!==scope.uid)throw Object.assign(Error(),{reason:'FORBIDDEN'});
   return reply(200,await claimSlug(database,scope.uid,scope.base,data.slug));
  }
  if(data.action==='profile'){
   if(identity.uid!==scope.uid||scope.legacy||identity.firebase?.sign_in_provider==='anonymous')throw Object.assign(Error(),{reason:'FORBIDDEN'});
   return reply(200,await saveProfile(database,scope,data.profile||{}));
  }
  if(data.action==='confirm'){
   if(identity.uid!==scope.uid)throw Object.assign(Error(),{reason:'FORBIDDEN'});
   const result=await service.confirm(identity.uid,{id:data.id,santaAsignado:data.santaAsignado});return reply(200,result);
  }
  throw Object.assign(Error(),{reason:'INVALID_REQUEST'});
 }catch(error){if(error instanceof SyntaxError)error.reason='INVALID_REQUEST';const allowed=['AUTH_REQUIRED','FORBIDDEN','NOT_FOUND','INVALID_REQUEST','ALREADY_PROCESSED','DATE_CLOSED','SLOT_FULL','ROUTE_FULL','CONFIG_REQUIRED','PLACE_REFERENCE_REQUIRED','TRANSPORT_REVIEW_REQUIRED','SERVICE_UNAVAILABLE','COUPON_UNAVAILABLE','LEGACY_REQUEST','INVALID_SLUG','SLUG_TAKEN','NAME_REQUIRED','PHONE_REQUIRED','SERVICE_REQUIRED'],reason=allowed.includes(error.reason)?error.reason:'UNAVAILABLE';return reply(reason==='AUTH_REQUIRED'?401:reason==='FORBIDDEN'?403:reason==='NOT_FOUND'?404:['SLOT_FULL','ROUTE_FULL','ALREADY_PROCESSED','SLUG_TAKEN'].includes(reason)?409:reason==='UNAVAILABLE'?503:400,{error:{reason}});}
};}
