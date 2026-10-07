import {PortalError} from './diverty-portal.mjs?v=54148b70bb91';

export async function requestCustomerPortal(payload,token,{fetchImpl=fetch,timeoutMs=10000}={}) {
  if(typeof token!=='string'||!token)throw new PortalError('UNAVAILABLE');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl('/api/customer-portal',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:controller.signal});
    // Netlify may return its own non-JSON response when limiting requests.
    if(response.status===429)throw new PortalError('RATE_LIMITED');
    const data=await response.json();
    if(!response.ok)throw new PortalError(['AMBIGUOUS_NAME','RATE_LIMITED'].includes(data?.error?.reason)?data.error.reason:'UNAVAILABLE');
    if(payload.action==='sync'){
      if(data?.synced!==true)throw new PortalError('UNAVAILABLE');
    }else if(!Array.isArray(data?.reservations))throw new PortalError('UNAVAILABLE');
    return data;
  }catch(error){
    if(error instanceof PortalError)throw error;
    throw new PortalError('UNAVAILABLE');
  }finally{clearTimeout(timer);}
}
