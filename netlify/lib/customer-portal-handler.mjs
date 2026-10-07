import {PortalError,parsePortalQuery} from '../../firebase/functions/portal-policy.mjs';

const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Vary':'Origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
export function customerPortalHandler(getBackend) {
  return async (request,context={})=>{
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin)return reply(403,{error:{reason:'FORBIDDEN'}});
    const authorization=request.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer ') || authorization.length<=7 || authorization.length>8192)return reply(401,{error:{reason:'AUTH_REQUIRED'}});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:{reason:'INVALID_REQUEST'}});
    try {
      if(Number(request.headers.get('content-length'))>2048)throw new PortalError('INVALID_REQUEST');
      const text=await request.text();
      if(text.length>2048)throw new PortalError('INVALID_REQUEST');
      let payload;try{payload=JSON.parse(text);}catch{throw new PortalError('INVALID_REQUEST');}
      if(!payload || typeof payload!=='object' || Array.isArray(payload))throw new PortalError('INVALID_REQUEST');
      const action=payload.action||'lookup';
      if(action==='lookup'){
        if(typeof payload.search!=='string'||payload.search.length>254)throw new PortalError('INVALID_REQUEST');
        parsePortalQuery(payload.search);
      }else if(action!=='sync'||typeof payload.reservationId!=='string'||!/^web-[A-Za-z0-9_-]{1,190}$/.test(payload.reservationId))throw new PortalError('INVALID_REQUEST');
      const backend=await getBackend();
      let identity;try{identity=await backend.verifyToken(authorization.slice(7));}catch{throw new PortalError('AUTH_REQUIRED');}
      if(!identity?.uid)throw new PortalError('AUTH_REQUIRED');
      if(action==='sync'){
        // The caller cannot index or inspect a booking owned by another session.
        await backend.portal.sync(payload.reservationId,identity.uid);
        return reply(200,{synced:true});
      }
      const data=await backend.portal.lookup(identity.uid,{search:payload.search},context.ip||'');
      return reply(200,data);
    }catch(error){
      const reason=error instanceof PortalError?error.reason:'UNAVAILABLE';
      const status=reason==='AUTH_REQUIRED'?401:reason==='FORBIDDEN'?403:reason==='RATE_LIMITED'?429:reason.startsWith('INVALID')?400:['AMBIGUOUS_NAME','TOO_MANY_RESULTS'].includes(reason)?409:503;
      // Never expose credential errors, client data or internal exception text.
      return reply(status,{error:{reason}});
    }
  };
}
