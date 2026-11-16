import {getFirebaseBackend} from '../lib/firebase-backend.mjs';
import {customerPortalHandler} from '../lib/customer-portal-handler.mjs';
import {customerPortalService} from '../../firebase/functions/portal-service.mjs';
import {scopeForCompany} from '../lib/navidad-handler.mjs';
export default customerPortalHandler(async request=>{const backend=getFirebaseBackend(),empresa=new URL(request.url).searchParams.get('empresa');if(!empresa)return {...backend,portal:customerPortalService(backend.database,()=>new Date(),{christmasOnly:true})};const scope=scopeForCompany(empresa);return{...backend,portal:customerPortalService(backend.database,()=>new Date(),{base:scope.base,ownerReceiptsOnly:true,christmasOnly:true})};});
export const config={path:'/api/customer-portal',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
