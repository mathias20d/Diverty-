import {cert,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {initializeFirestore} from 'firebase-admin/firestore';
import {customerPortalService} from '../../firebase/functions/portal-service.mjs';
import {customerPortalHandler} from '../lib/customer-portal-handler.mjs';

let backend;
function getBackend() {
  if(backend)return backend;
  const account=JSON.parse(process.env.DIVERTY_PORTAL_FIREBASE_ACCOUNT||'null');
  if(account?.project_id!=='diverty-eventos'||!account.private_key||!account.client_email)throw new Error('Portal configuration unavailable');
  const name='DivertyNetlifyPortal';
  const app=getApps().find(app=>app.name===name)||initializeApp({projectId:'diverty-eventos',credential:cert(account)},name);
  backend={verifyToken:token=>getAuth(app).verifyIdToken(token),portal:customerPortalService(initializeFirestore(app,{preferRest:true}))};
  return backend;
}
export default customerPortalHandler(getBackend);
export const config={path:'/api/customer-portal',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
