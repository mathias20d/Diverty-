import {gpsPointFromText} from './diverty-gps-point.mjs?v=1fb92a5943a5';

export function shortMapsUrl(value){
  let url;try{url=new URL(String(value||'').trim());}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
  return (url.hostname==='maps.app.goo.gl'&&/^\/[A-Za-z0-9_-]{5,100}\/?$/.test(url.pathname))||
    (url.hostname==='goo.gl'&&/^\/maps\/[A-Za-z0-9_-]{5,100}\/?$/.test(url.pathname))?url.toString():null;
}
export function mapsLocationFromUrl(value){
  let url;try{url=new URL(value);}catch{return null;}
  if(url.protocol!=='https:'||!['www.google.com','google.com','maps.google.com'].includes(url.hostname)||url.username||url.password||url.port)return null;
  const name=url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
  let displayName='';try{displayName=name?decodeURIComponent(name.replace(/\+/g,' ')):'';}catch{return null;}
  const point=gpsPointFromText(url.toString());
  return point||displayName?{displayName,point}:null;
}
export async function readMapsLocation(value,{fetcher=fetch}={}){
  const direct=mapsLocationFromUrl(value);if(direct)return direct;
  if(!shortMapsUrl(value))return null;
  try{
    const response=await fetcher('/api/map-location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:String(value).trim()}),signal:AbortSignal.timeout(6000)});
    if(!response.ok)return null;
    const data=await response.json();
    const point=data.point&&gpsPointFromText(`${data.point.lat},${data.point.lng}`);
    return {displayName:String(data.displayName||'').slice(0,500),point};
  }catch{return null;}
}
