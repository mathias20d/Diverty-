import {getFirebaseBackend} from '../lib/firebase-backend.mjs';
import {navidadHandler} from '../lib/navidad-handler.mjs';
export default navidadHandler(getFirebaseBackend);
export const config={path:'/api/navidad',rateLimit:{windowLimit:40,windowSize:60,aggregateBy:['ip','domain']}};
