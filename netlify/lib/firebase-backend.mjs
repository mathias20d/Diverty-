import {getMessaging} from 'firebase-admin/messaging';
import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {initializeFirestore} from 'firebase-admin/firestore';
import {customerPortalService} from '../../firebase/functions/portal-service.mjs';
let backend;
export function getFirebaseBackend(){
  if(backend)return backend;
  const account=JSON.parse(process.env.DIVERTY_PORTAL_FIREBASE_ACCOUNT||'null');
  if(account?.project_id!=='diverty-eventos'||!account.private_key||!account.client_email)throw new Error('Portal configuration unavailable');
  const name='DivertyNetlifyPortal';
  const app=getApps().find(app=>app.name===name)||initializeApp({projectId:'diverty-eventos',credential:cert(account)},name);
  const database=initializeFirestore(app,{preferRest:true});
  backend={database,verifyToken:token=>getAuth(app).verifyIdToken(token),portal:customerPortalService(database),notifyChristmas:async(base,id)=>{const snapshot=await database.collection(base.includes('/diverty-oficial/')?'tokens':base+'/tokens').get();const tokens=snapshot.docs.map(d=>d.data()).filter(d=>d.enabled===true&&typeof d.token==='string').map(d=>d.token).slice(0,500);if(tokens.length)await getMessaging(app).sendEachForMulticast({tokens,notification:{title:'Nueva solicitud de Navidad',body:'Hay una entrega pendiente de revisar en tu agenda.'},data:{reservationId:id,url:'/?reserva='+encodeURIComponent(id)}});}};
  return backend;
}
