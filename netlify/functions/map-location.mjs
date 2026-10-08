import {shortMapsUrl,mapsLocationFromUrl} from '../../assets/js/diverty-maps-link.mjs';
const cache=new Map();
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default async function handler(request){
  if(request.method!=='POST')return reply({error:'METHOD'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'ORIGIN'},403);
  if(Number(request.headers.get('content-length'))>2048)return reply({error:'INPUT'},400);
  let input;try{const body=await request.text();if(body.length>2048)return reply({error:'INPUT'},400);input=JSON.parse(body);}catch{return reply({error:'INPUT'},400);}
  const url=shortMapsUrl(input?.url);if(!url)return reply({error:'INPUT'},400);
  const cached=cache.get(url);if(cached&&cached.until>Date.now())return reply(cached.data);
  try{
    // Fetch only Google's short-link redirect, never an arbitrary user URL or
    // the destination page. A name can establish a known zone without inventing GPS.
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(4500)});
    const location=response.headers.get('location');
    if(response.status<300||response.status>=400||!location)return reply({error:'UNRESOLVED'},422);
    const data=mapsLocationFromUrl(new URL(location,url).toString());
    if(!data)return reply({error:'UNRESOLVED'},422);
    if(cache.size>=256)cache.delete(cache.keys().next().value);
    cache.set(url,{data,until:Date.now()+3600000});
    return reply(data);
  }catch{return reply({error:'UNAVAILABLE'},503);}
}
export const config={path:'/api/map-location',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
