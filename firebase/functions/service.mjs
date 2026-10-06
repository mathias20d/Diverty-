import {ADMIN_UID, fail, quoteBooking, checkAvailability, controlDates, projections, active, isSanta, resources} from './policy.mjs';
import {gps,addressGps} from './coverage.mjs';
const base='artifacts/diverty-oficial/public/data';
const configPath=`${base}/config_web/global`;
export function bookingService(db,clock=()=>new Date()) {
  const ref=(section,id)=>db.doc(`${base}/${section}/${id}`);
  const loadSchedule=async(tx,event)=>{
    const dates=controlDates(event);
    if(!dates.length)fail('INVALID_REQUEST','Fecha u hora inválida.');
    const controls=await Promise.all(dates.map(d=>tx.get(ref('booking_control',d))));
    const snap=await tx.get(db.collection(`${base}/eventos`).where('fecha','>=',dates[0]).where('fecha','<=',dates.at(-1)));
    return {rows:snap.docs.map(d=>({...d.data(),id:d.id})),controls,dates};
  };
  const commit=(tx,event,schedule,config)=>{
    const projection=projections(event);
    tx.set(ref('eventos',event.id),event);
    tx.set(ref('reservas_cliente',event.id),projection.receipt);
    tx.set(ref('disponibilidad_web',event.id),projection.availability);
    const ids=schedule.rows.filter(e=>active(e)&&isSanta(e)===isSanta(event)&&e.fecha===event.fecha&&e.hora===event.hora&&e.id!==event.id).map(e=>e.id);
    ids.push(event.id);
    const slot=`${isSanta(event)?'slot_santa_':'slot_'}${event.fecha}_${event.hora.replace(':','-')}`;
    tx.set(ref('disponibilidad_web',slot),{fecha:event.fecha,hora:event.hora,count:ids.length,capacity:Number(isSanta(event)?config.capacidadSanta??1:config.capacidadSimultanea??3),reservationIds:ids,updatedAt:clock().toISOString()});
    schedule.dates.forEach((date,i)=>tx.set(ref('booking_control',date),{revision:Number(schedule.controls[i].data()?.revision||0)+1,updatedAt:clock().toISOString()}));
  };
  return {
    async create(uid,payload) {
      if(!uid)fail('AUTH_REQUIRED','Inicia la reserva nuevamente.');
      const input=payload?.event;
      if(!/^web-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input?.id||''))fail('INVALID_REQUEST','Identificador inválido.');
      return db.runTransaction(async tx=>{
        const existing=await tx.get(ref('eventos',input.id));
        if(existing.exists){if(existing.data().ownerUid!==uid)fail('FORBIDDEN','Esta solicitud pertenece a otra sesión.');return {event:existing.data(),recovered:true};}
        const configSnap=await tx.get(db.doc(configPath));const config=configSnap.data()||{};
        if(config.centralBookingValidation!==true)fail('NOT_ENABLED','La validación central todavía no está habilitada.');
        if(!Array.isArray(input.serviciosSeleccionados)||input.serviciosSeleccionados.length<1||input.serviciosSeleccionados.length>50)fail('INVALID_REQUEST','Selecciona los servicios.');
        const productRefs=input.serviciosSeleccionados.map(item=>{
          if(!['catalogo_web','campana_web'].includes(item.origenCatalogo)||typeof item.id!=='string'||!item.id||item.id.includes('/')||item.id.length>1500)fail('INVALID_REQUEST','Servicio inválido.');
          return ref(item.origenCatalogo==='campana_web'?'campanas_web':'catalogo_web',item.id);
        });
        const products=await Promise.all(productRefs.map(r=>tx.get(r)));
        const code=String(payload.couponCode||'').trim().toUpperCase();
        if(code.length>100||code.includes('/'))fail('INVALID_REQUEST','Cupón inválido.');
        const couponSnap=code?await tx.get(ref('cupones_web',code)):null;
        if(code&&!couponSnap.exists)fail('COUPON_UNAVAILABLE','El cupón ya no está disponible.');
        const event=quoteBooking(input,uid,products.map(s=>s.data()),couponSnap?.data(),payload.location,clock());
        if(code)event.couponCode=code;
        const schedule=await loadSchedule(tx,event);
        checkAvailability(event,schedule.rows,config);
        commit(tx,event,schedule,config);
        return {event,recovered:false};
      });
    },
    async confirm(uid,payload) {
      if(uid!==ADMIN_UID)fail('FORBIDDEN','Solo la administración puede aprobar reservas.');
      if(typeof payload?.id!=='string'||payload.id.includes('/')||!payload.id)fail('INVALID_REQUEST','Identificador inválido.');
      return db.runTransaction(async tx=>{
        const snap=await tx.get(ref('eventos',payload.id));if(!snap.exists)fail('EVENT_NOT_FOUND','La solicitud ya no existe.');
        const event=snap.data();
        if(event.estado!=='Pendiente'||event.origen!=='Web Directa')fail('ALREADY_PROCESSED','Esta solicitud ya fue procesada.');
        if(event.centralBookingVersion!==1)fail('LEGACY_REQUEST','Esta solicitud debe revisarse con el flujo existente.');
        const configSnap=await tx.get(db.doc(configPath));const config=configSnap.data()||{};
        if(config.centralBookingValidation!==true)fail('NOT_ENABLED','La validación central no está habilitada.');
        if((event.requiereRevisionUbicacion||event.totalPendienteTransporte)&&event.transporteRevisadoEnApp!==true)fail('TRANSPORT_REVIEW_REQUIRED','Confirma el costo de transporte antes de aceptar.');
        const destination=gps(event)||addressGps(event.direccion);
        if(isSanta(event)&&!destination)fail('LOCATION_REVIEW_REQUIRED','Confirma el punto exacto de entrega de Santa.');
        // Prices are the trusted server snapshot shown to the customer. Admin may
        // negotiate transport/resources; don't replace the agreed service price.
        if(!Number.isFinite(Number(event.total))||Number(event.total)<0||!Number.isFinite(Number(event.transporte))||Number(event.transporte)<0)fail('INVALID_REQUEST','Revisa los importes.');
        const confirmed={...event,estado:'Confirmado',totalPendienteTransporte:false,...(isSanta(event)?{...destination,santaAsignado:String(payload.santaAsignado||event.santaAsignado||'Santa 1')}:{resourceRequirements:resources(event),duracionMinutos:resources(event).durationMinutes}),_rev:Number(event._rev||0)+1,updatedAt:clock().toISOString()};
        const schedule=await loadSchedule(tx,confirmed);
        checkAvailability(confirmed,schedule.rows,config,confirmed.santaAsignado);
        commit(tx,confirmed,schedule,config);
        return {event:confirmed};
      });
    }
  };
}
