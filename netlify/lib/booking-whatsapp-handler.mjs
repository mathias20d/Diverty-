const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Vary':'Origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
export function bookingWhatsappHandler(getBackend,isEnabled=()=>false){
  return async request=>{
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'POST'}});
    if(!isEnabled())return reply(503,{error:{reason:'NOT_ENABLED'}});
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return reply(403,{error:{reason:'FORBIDDEN'}});
    const authorization=request.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer ')||authorization.length<=7||authorization.length>8192)return reply(401,{error:{reason:'AUTH_REQUIRED'}});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,{error:{reason:'INVALID_REQUEST'}});
    try{
      const text=await request.text();if(text.length>2048)return reply(400,{error:{reason:'INVALID_REQUEST'}});
      let payload;try{payload=JSON.parse(text);}catch{return reply(400,{error:{reason:'INVALID_REQUEST'}});}
      if(payload?.consent!==true||!/^web-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(payload?.reservationId||'')||Object.keys(payload).some(key=>!['consent','reservationId'].includes(key)))return reply(400,{error:{reason:'INVALID_REQUEST'}});
      const backend=await getBackend();let identity;
      try{identity=await backend.verifyToken(authorization.slice(7));}catch{return reply(401,{error:{reason:'AUTH_REQUIRED'}});}
      if(!identity?.uid)return reply(401,{error:{reason:'AUTH_REQUIRED'}});
      return reply(200,await backend.queue(identity.uid,payload.reservationId));
    }catch(error){
      const reason=['FORBIDDEN','INVALID_PHONE','INELIGIBLE','INVALID_REQUEST'].includes(error.reason)?error.reason:'UNAVAILABLE';
      return reply(reason==='FORBIDDEN'?403:reason==='UNAVAILABLE'?503:400,{error:{reason}});
    }
  };
}
