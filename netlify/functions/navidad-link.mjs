import {getFirebaseBackend} from '../lib/firebase-backend.mjs';
import {linkRedirectHandler} from '../lib/navidad-links.mjs';
export default linkRedirectHandler(async () => getFirebaseBackend());
export const config={path:'/s/*',rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
