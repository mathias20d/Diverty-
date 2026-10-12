import {getFirebaseBackend} from '../lib/firebase-backend.mjs';
import {customerPortalHandler} from '../lib/customer-portal-handler.mjs';
export default customerPortalHandler(getFirebaseBackend);
export const config={path:'/api/customer-portal',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
