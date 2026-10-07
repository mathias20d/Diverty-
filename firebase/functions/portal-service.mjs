import { createHash } from 'node:crypto';
import { PortalError, parsePortalQuery, portalIndex, portalSummary, matchesPortalQuery, assertUnambiguousName } from './portal-policy.mjs';
const base = 'artifacts/diverty-oficial/public/data';
const maxResults = 200;

export function customerPortalService(db, clock = () => new Date()) {
  const ref = (section,id) => db.doc(`${base}/${section}/${id}`);
  const throttle = async (uid, ip) => {
    const now = clock().getTime();
    const keys = [[`uid:${uid}`,15], ...(ip ? [[`ip:${ip}`,60]] : [])].map(([key,limit]) => ({ ref:ref('portal_limits',createHash('sha256').update(key).digest('hex')),limit }));
    await db.runTransaction(async tx => {
      const snapshots = await Promise.all(keys.map(key=>tx.get(key.ref)));
      const counters = snapshots.map(snapshot => {
        const previous = snapshot.data();
        return previous && now >= previous.start && now - previous.start < 60000 ? { start:previous.start, count:Number(previous.count || 0)+1 } : { start:now,count:1 };
      });
      if (counters.some((counter,i)=>counter.count > keys[i].limit)) throw new PortalError('RATE_LIMITED');
      keys.forEach((key,i)=>tx.set(key.ref,{...counters[i],expiresAt:new Date(now+86400000)}));
    });
  };
  const phoneVariants = search => {
    const number = search.value;
    const values = [search.raw,number,Number(number)];
    if (number.length===8) {
      const dashed=`${number.slice(0,4)}-${number.slice(4)}`,spaced=`${number.slice(0,4)} ${number.slice(4)}`;
      values.push(dashed,spaced,`507${number}`,`+507${number}`,`00507${number}`,`507 ${number}`,`+507 ${number}`,`507 ${dashed}`,`+507 ${dashed}`,`507-${dashed}`,`+507-${dashed}`);
    }
    return [...new Set(values)];
  };
  return {
    // Read the current event inside the transaction: delayed/out-of-order trigger
    // deliveries and a concurrent administrator edit cannot restore old data.
    async sync(id, ownerUid) {
      if (typeof id!=='string' || !id || id.includes('/')) throw new PortalError('INVALID_ID');
      return db.runTransaction(async tx => {
        const event=await tx.get(ref('eventos',id));
        if(ownerUid && (!event.exists || event.data().ownerUid!==ownerUid))throw new PortalError('FORBIDDEN');
        const index=event.exists ? portalIndex(event.data()) : null;
        if(index)tx.set(ref('portal_busqueda',id),index);
        else tx.delete(ref('portal_busqueda',id));
      });
    },
    async lookup(uid,payload,ip='') {
      if(!uid)throw new PortalError('AUTH_REQUIRED');
      if(typeof payload?.search!=='string'||payload.search.length>254)throw new PortalError('INVALID_NAME');
      const search=parsePortalQuery(payload.search);
      await throttle(uid,ip);
      const index=await db.collection(`${base}/portal_busqueda`).where(search.kind==='phone'?'telefonoKey':'nombreKey','==',search.value).limit(maxResults+1).get();
      if(index.size>maxResults)throw new PortalError(search.kind==='name'?'AMBIGUOUS_NAME':'TOO_MANY_RESULTS');
      const snapshots=await Promise.all(index.docs.map(index=>ref('eventos',index.id).get()));
      const rows=new Map(snapshots.filter(snapshot=>snapshot.exists&&matchesPortalQuery(snapshot.data(),search)).map(snapshot=>[snapshot.id,snapshot.data()]));
      // Compatible with older CRM reservations and requests whose trigger hasn't
      // run yet. No complete collection scan or public client listing is used.
      const events=db.collection(`${base}/eventos`);
      const legacyQueries=search.kind==='phone' ? [events.where('telefonoBusqueda','==',search.value),events.where('telefono','in',phoneVariants(search))] : [events.where('cliente','==',search.raw)];
      const legacy=await Promise.all(legacyQueries.map(query=>query.limit(maxResults+1).get()));
      if(legacy.some(snapshot=>snapshot.size>maxResults))throw new PortalError(search.kind==='name'?'AMBIGUOUS_NAME':'TOO_MANY_RESULTS');
      legacy.forEach(snapshot=>snapshot.docs.forEach(event=>{if(matchesPortalQuery(event.data(),search))rows.set(event.id,event.data());}));
      assertUnambiguousName([...rows.values()],search);
      if(!rows.size) {
        const migration=await ref('configuracion','migracion_portal_v1').get();
        if(migration.data()?.done!==true)throw new PortalError('INDEX_NOT_READY');
      }
      const reservations=[...rows].map(([id,event])=>portalSummary(event,id)).sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.hora.localeCompare(a.hora));
      return {reservations};
    }
  };
}
