import {needsPlaceReference} from './location-reference.mjs';
import { coverage, gps, addressGps, distanceKm } from './coverage.mjs';
export const ADMIN_UID='OblqzhP2L3XulJ920O82jwd1Qrk1';
export class BookingError extends Error {
  constructor(reason, message, details={}) {super(message);this.reason=reason;this.details={reason,...details};}
}
export const fail=(reason,message,details)=>{throw new BookingError(reason,message,details);};
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const cents=v=>Math.round(Number(v)*100);
const amount=v=>(v/100).toFixed(2);
export const active=e=>e && !e.deletedLocally && !/cancelad|rechaz|cot/i.test(e.estado||'');
export const isSanta=e=>e?.esNavidad===true || /entregas de nochebuena/i.test(e?.servicio||'');
export function resources(event) {
  const r=event.resourceRequirements||{};
  const text=norm([event.servicio,event.descripcionEvento,...(event.serviciosSeleccionados||[]).flatMap(x=>[x.nombre,x.descripcion,...(x.incluye||[])])].join(' '));
  const count=word=>{const m=text.match(new RegExp(`(\\d+)\\s*${word}\\b`));return m?Number(m[1]):new RegExp(`\\b${word}\\b`).test(text)?1:0;};
  const duration=Math.max(0,...(event.serviciosSeleccionados||[]).map(i=>Number(i.duracionHoras)||0))*60;
  return {animadores:Math.max(0,Number(r.animadores??count('animador(?:es)?'))),payasos:Math.max(0,Number(r.payasos??count('payasos?'))),durationMinutes:Math.max(30,Number(r.durationMinutes||event.duracionMinutos||duration||120))};
}
export function interval(event) {
  const start=Date.parse(`${event.fecha}T${event.hora}:00-05:00`)/60000;
  return {start,end:start+(isSanta(event)?30:resources(event).durationMinutes)};
}
export function controlDates(event) {
  const {start,end}=interval(event);const dates=[];
  if(!Number.isFinite(start)||!Number.isFinite(end))return [];
  // Serialize all adjacent days too, so older long running events cannot race an edit.
  for(let day=Math.floor((start-300)/1440)-1;day<=Math.floor((end-300-0.001)/1440);day++) dates.push(new Date(day*86400000).toISOString().slice(0,10));
  return dates;
}
export function validateInput(event,uid,now) {
  if(!uid)fail('AUTH_REQUIRED','Inicia la reserva nuevamente.');
  if(!/^web-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(event?.id||''))fail('INVALID_REQUEST','Identificador inválido.');
  const lengths={cliente:150,email:254,telefono:30,tipoEvento:100,ninos:10,direccion:1500,referenciaLugar:500,comentarios:3000};
  for(const [key,max]of Object.entries(lengths))if(typeof event[key]!=='string'||event[key].length>max)fail('INVALID_REQUEST',`Revisa el campo ${key}.`);
  if(!event.cliente.trim()||event.direccion.trim().length<3||!/^\S+@\S+\.\S+$/.test(event.email)||!/^\d{6,15}$/.test(String(event.telefonoBusqueda||'')))fail('INVALID_REQUEST','Revisa tus datos y la dirección del evento.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.fecha||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.hora||'')||!Number.isFinite(Date.parse(`${event.fecha}T12:00:00Z`))||new Date(`${event.fecha}T12:00:00Z`).toISOString().slice(0,10)!==event.fecha)fail('INVALID_REQUEST','Fecha u hora inválida.');
  if(Date.parse(`${event.fecha}T${event.hora}:00-05:00`)<=now.getTime())fail('PAST_DATE','Elige una fecha y hora futura.');
  if(needsPlaceReference(event))fail('PLACE_REFERENCE_REQUIRED','Escribe la barriada, PH o salón del evento. El GPS solo marca el punto.');
  if(!Array.isArray(event.serviciosSeleccionados)||event.serviciosSeleccionados.length<1||event.serviciosSeleccionados.length>50)fail('INVALID_REQUEST','Selecciona los servicios.');
}
export function quoteBooking(input,uid,products,coupon,point,now=new Date()) {
  validateInput(input,uid,now);
  const seen=new Set();let subtotal=0,animadores=0,payasos=0,durationMinutes=30;
  const items=input.serviciosSeleccionados.map((item,index)=>{
    const raw=products[index];
    if(!raw||raw.activo===false)fail('SERVICE_UNAVAILABLE','Uno de los servicios ya no está disponible.');
    const key=`${item.origenCatalogo}/${item.id}`;if(seen.has(key))fail('INVALID_REQUEST','Servicio duplicado.');seen.add(key);
    if(raw.fechaInicio && new Date(now.getTime()-300*60000).toISOString().slice(0,10)<raw.fechaInicio || raw.fechaFin && new Date(now.getTime()-300*60000).toISOString().slice(0,10)>raw.fechaFin)fail('SERVICE_UNAVAILABLE','El servicio no está disponible para esa fecha.');
    const campaign=item.origenCatalogo==='campana_web';
    const name=String(campaign?raw.titulo:raw.nombre||'');
    const price=Number(campaign?(raw.precio||raw.precioOriginal||0):raw.precio);
    if(!name||!Number.isFinite(price)||price<0)fail('SERVICE_UNAVAILABLE','Este servicio requiere revisión.');
    const mode=norm(raw.tipoCobro||'paquete');
    const variable=['hora','horas','nino','ninos','unidad','unidades','cantidad','por unidad'].includes(mode);
    const min=Math.max(1,Math.floor(Number(raw.cantidadMinima??raw.minCantidad)||1));
    const max=Number(raw.cantidadMaxima??raw.maxCantidad)||1000;
    const q=Number(item.cantidad);
    if(!Number.isInteger(q)||q<(variable?min:1)||q>(variable?max:1))fail('INVALID_QUANTITY','Revisa la cantidad del servicio.');
    const includes=Array.isArray(raw.incluye)?raw.incluye.map(String):String(raw.serviciosLista||'').split('\n').filter(Boolean);
    const description=String(raw.descripcion||raw.subtitulo||'');
    const text=norm([name,description,...includes].join(' '));
    const find=word=>{const m=text.match(new RegExp(`(\\d+)\\s*${word}\\b`));return m?Number(m[1]):new RegExp(`\\b${word}\\b`).test(text)?1:0;};
    const multiplier=['unidad','unidades','cantidad','por unidad'].includes(mode)?q:1;
    animadores+=find('animador(?:es)?')*multiplier;payasos+=find('payasos?')*multiplier;
    const m=text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)\b/);
    const hours=['hora','horas'].includes(mode)?q:Number(raw.duracionHoras)||(m?Number(m[1].replace(',','.')):text.includes('plan diverty')?3:2);
    durationMinutes=Math.max(durationMinutes,Math.round(hours*60));subtotal+=cents(price)*q;
    return {id:item.id,nombre:name,precioOriginal:price,precio:cents(price)*q/100,cantidad:q,descripcion:description,incluye:includes,tipoCobro:mode,isHourly:['hora','horas'].includes(mode),duracionHoras:hours,origenCatalogo:item.origenCatalogo};
  });
  if(durationMinutes>1440||animadores>100||payasos>100)fail('INVALID_QUANTITY','Esta duración o cantidad necesita una cotización personalizada.');
  const santa=products.some(p=>p.esNavidad===true||norm(p.recursoNavidad)==='santa'||/noche\s*buena|entregas?\s+(?:de\s+)?(?:regalos?|santa)|entrega\s+con\s+santa|(?:santa.*(?:visita|regalo|entrega)|(?:visita|regalo|entrega).*santa)/i.test([p.nombre,p.titulo,p.descripcion,p.subtitulo,p.serviciosLista,...(p.incluye||[])].join(' ')));
  if(Boolean(input.esNavidad)!==santa)fail('INVALID_REQUEST','Revisa el tipo de reserva.');
  if(santa){const minutes=Number(input.hora.slice(0,2))*60+Number(input.hora.slice(3));if(!['2026-12-24','2026-12-25'].includes(input.fecha)||minutes%30!==0||(input.fecha==='2026-12-24'&&minutes<960)||(input.fecha==='2026-12-25'&&minutes>840)||![1,2].includes(Number(input.ninos)))fail('INVALID_REQUEST','Revisa la fecha, hora y niños de la visita de Santa.');}
  else if(['2026-12-24','2026-12-25'].includes(input.fecha))fail('INVALID_REQUEST','Esa fecha está reservada para entregas de Santa.');
  let discount=0;
  if(coupon){if(coupon.activo!==true||!['percent','fixed'].includes(coupon.type)||!Number.isFinite(Number(coupon.discount))||Number(coupon.discount)<0)fail('COUPON_UNAVAILABLE','El cupón ya no está disponible.');discount=Math.min(subtotal,coupon.type==='percent'?Math.round(subtotal*Number(coupon.discount)/100):cents(coupon.discount));}
  const destination=gps(point)||addressGps(input.direccion)||gps(input);
  const zone=coverage(destination,santa,`${input.direccion} ${input.referenciaLugar}`);
  if(zone.status==='blocked')fail('LOCATION_BLOCKED','Esta ubicación necesita atención directa de Diverty.');
  const pending=zone.status==='review'; const transport=cents(zone.charge);
  const quote={items,descuento:amount(discount),transporte:amount(transport),total:amount(subtotal-discount+transport),precioServicios:amount(subtotal-discount),coverage:zone,totalPendienteTransporte:pending};
  if(cents(input.descuento)!==discount||cents(input.transporte)!==transport||cents(input.total)!==subtotal-discount+transport||items.some((i,n)=>cents(input.serviciosSeleccionados[n].precioOriginal)!==cents(i.precioOriginal)))fail('PRICE_CHANGED','El precio o transporte cambió. Revisa el resumen antes de enviar nuevamente.',{quote});
  const fields=['cliente','email','telefono','telefonoBusqueda','tipoEvento','ninos','fecha','hora','direccion','referenciaLugar','comentarios'];
  return {...Object.fromEntries(fields.map(k=>[k,input[k]])),id:input.id,ownerUid:uid,ubicacion:pending?(santa?'Ubicación por confirmar':'Ubicación por revisar'):zone.label,servicio:items.map(i=>i.nombre+(i.cantidad>1?` (x${i.cantidad})`:'')).join(' + '),serviciosSeleccionados:items,descripcionEvento:items.map(i=>[i.nombre,i.descripcion,...i.incluye].join('\n')).join('\n\n'),transporte:quote.transporte,descuento:quote.descuento,total:quote.total,precioServicios:quote.precioServicios,abono:'0',gastos:'0',detalleGastos:'',estado:'Pendiente',origen:'Web Directa',deletedLocally:false,colisionAprobada:false,esNavidad:santa,recursoNavidad:santa?'Santa':'',createdAt:now.toISOString(),centralBookingVersion:1,requiereRevisionUbicacion:pending,totalPendienteTransporte:pending,coverageReason:zone.reason||'',...(santa&&destination?destination:{}),...(!santa?{resourceRequirements:{animadores,payasos,durationMinutes},duracionMinutos:durationMinutes}:{})};
}
export function checkAvailability(candidate,rows,config={},santaName='') {
  const list=rows.filter(e=>active(e)&&e.id!==candidate.id&&isSanta(e)===isSanta(candidate));
  if(isSanta(candidate)){
    const cap=Number(config.capacidadSanta??1);if(!Number.isInteger(cap)||cap<1||cap>100)fail('CONFIG_REQUIRED','Revisa la capacidad de Santa en la app.');
    const same=list;
    if(same.filter(e=>e.fecha===candidate.fecha&&e.hora===candidate.hora).length>=cap)fail('SLOT_FULL','Ese horario ya se ocupó. Elige otra hora.');
    const names=Array.from({length:cap},(_,i)=>`Santa ${i+1}`);
    if(santaName&&!names.includes(santaName))fail('CONFIG_REQUIRED','Revisa el Santa asignado.');
    const routes=new Map(names.map(n=>[n,[]]));
    const minute=e=>interval(e).start;
    const travel=(a,b)=>{const p=gps(a)||addressGps(a.direccion),q=gps(b)||addressGps(b.direccion);if(!p||!q)return 15;const d=distanceKm(p,q);return d<=2?10:d<=5?15:d<=8?22:d<=12?30:d<=18?40:Math.min(70,40+Math.ceil((d-18)*2));};
    const fits=(e,stops)=>stops.every(x=>minute(x)<minute(e)?minute(x)+30+travel(x,e)<=minute(e):minute(e)+30+travel(e,x)<=minute(x));
    for(const e of same.filter(e=>names.includes(e.santaAsignado)))routes.get(e.santaAsignado).push(e);
    for(const e of same.filter(e=>!names.includes(e.santaAsignado)).sort((a,b)=>minute(a)-minute(b))){const name=names.find(n=>fits(e,routes.get(n)));if(!name)fail('SLOT_FULL','Las rutas de Santa necesitan revisión.');routes.get(name).push(e);}
    if((gps(candidate)||addressGps(candidate.direccion))&&! (santaName?[santaName]:names).some(n=>fits(candidate,routes.get(n))))fail('ROUTE_FULL','Ese horario no permite completar la ruta de Santa.');
    return;
  }
  const r=resources(candidate),{start,end}=interval(candidate),points=new Set([start]);
  const windows=list.map(e=>({...interval(e),r:resources(e)})).filter(w=>w.start<end&&w.end>start);
  windows.forEach(w=>{if(w.start>start)points.add(w.start);});
  const cap=config.recursosDisponibles||{};
  const limits={animadores:Number(cap.animadores??3),payasos:Number(cap.payasos??1),events:Number(config.capacidadSimultanea??3)};
  if(Object.values(limits).some(n=>!Number.isInteger(n)||n<0)||limits.events<1)fail('CONFIG_REQUIRED','Revisa la capacidad operativa en la app.');
  for(const t of points){const activeWindows=windows.filter(w=>w.start<=t&&w.end>t);if(activeWindows.length+1>limits.events||['animadores','payasos'].some(k=>activeWindows.reduce((sum,w)=>sum+w.r[k],0)+r[k]>limits[k]))fail('SLOT_FULL','Ese horario no tiene personal o capacidad disponible. Elige otra hora.');}
}
export function projections(event) {
  const receipt=Object.fromEntries(['ownerUid','cliente','telefono','fecha','hora','estado','servicio','total','abono'].map(k=>[k,String(event[k]??'')]));
  const availability={fecha:event.fecha,hora:event.hora,esNavidad:isSanta(event),recursoNavidad:isSanta(event)?'Santa':'',...(isSanta(event)?{...(gps(event)||{}),...(event.santaAsignado?{santaAsignado:event.santaAsignado}:{})}:{resourceRequirements:resources(event),duracionMinutos:resources(event).durationMinutes,tipoReserva:'normal'})};
  return {receipt:{...receipt,totalPendienteTransporte:event.totalPendienteTransporte===true,precioServicios:event.precioServicios||event.total},availability};
}
