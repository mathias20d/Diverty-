import {getFirebaseBackend} from '../lib/firebase-backend.mjs';
import {bookingWhatsappHandler} from '../lib/booking-whatsapp-handler.mjs';
import {whatsappBookings} from '../../firebase/functions/whatsapp-booking.mjs';
export default bookingWhatsappHandler(()=>{
  const backend=getFirebaseBackend();return {...backend,queue:whatsappBookings(backend.database).queue};
},()=>process.env.DIVERTY_WHATSAPP_QUEUE_ENABLED==='true');
export const config={path:'/api/booking-whatsapp',rateLimit:{windowLimit:15,windowSize:60,aggregateBy:['ip','domain']}};
