export async function queueWhatsappConfirmation(reservationId,user,fetchImpl=fetch){
  if(!user?.getIdToken)throw new Error('WHATSAPP_UNAVAILABLE');
  const token=await user.getIdToken();
  const response=await fetchImpl('/api/booking-whatsapp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({reservationId,consent:true}),signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw new Error('WHATSAPP_UNAVAILABLE');
  const result=await response.json();
  if(!['queued','dispatching','accepted'].includes(result?.status))throw new Error('WHATSAPP_UNAVAILABLE');
  return result.status;
}
