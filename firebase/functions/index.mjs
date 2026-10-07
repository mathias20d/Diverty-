import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onDocumentWritten} from 'firebase-functions/v2/firestore';
import {customerPortalService} from './portal-service.mjs';
import {PortalError} from './portal-policy.mjs';
import {bookingService} from './service.mjs';
import {BookingError} from './policy.mjs';
initializeApp();
const service=bookingService(getFirestore());
const options={region:'us-central1',minInstances:0,maxInstances:3,memory:'256MiB',timeoutSeconds:30};
const handler=method=>async request=>{
  try{return await service[method](request.auth?.uid,request.data);}
  catch(error){
    if(error instanceof BookingError){const code=error.reason==='AUTH_REQUIRED'?'unauthenticated':error.reason==='FORBIDDEN'?'permission-denied':'failed-precondition';throw new HttpsError(code,error.message,error.details);}
    // Keep private reservation data out of logs and error responses.
    console.error('Booking transaction failed',{code:error?.code||'unknown'});
    throw new HttpsError('unavailable','No pudimos completar la solicitud. Reintenta con el mismo formulario.');
  }
};
export const createWebBooking=onCall(options,handler('create'));
export const confirmWebBooking=onCall(options,handler('confirm'));

const portal=customerPortalService(getFirestore());
export const lookupCustomerReservations=onCall(options,async request=>{
  try{return await portal.lookup(request.auth?.uid,request.data,request.rawRequest.ip||'');}
  catch(error){
    if(error instanceof PortalError){
      const code=error.reason==='AUTH_REQUIRED'?'unauthenticated':error.reason==='RATE_LIMITED'?'resource-exhausted':error.reason.startsWith('INVALID')?'invalid-argument':'failed-precondition';
      throw new HttpsError(code,'No pudimos consultar las reservas.',{reason:error.reason});
    }
    console.error('Portal lookup failed',{code:error?.code||'unknown'});
    throw new HttpsError('unavailable','No pudimos consultar las reservas. Inténtalo nuevamente.');
  }
});
export const syncCustomerPortal=onDocumentWritten({...options,retry:true,document:'artifacts/diverty-oficial/public/data/eventos/{reservationId}'},async event=>{
  await portal.sync(event.params.reservationId);
});
