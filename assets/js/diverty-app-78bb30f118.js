import {serviceDurationHours} from './diverty-service-duration.mjs';
import {responsiveImage,imageFallbackUrl} from './diverty-images.mjs';
import {readMapsLocation,shortMapsUrl,mapsLocationFromUrl} from './diverty-maps-link.mjs';
import {requestCustomerPortal} from './diverty-portal-api.mjs?v=0d2428d94f21';
import { searchCustomerPortal, parsePortalQuery, PortalError } from './diverty-portal.mjs?v=8b19069e9f53';
import { isClosedBookingDate } from './diverty-date-availability.mjs?v=79d415724694';
import { catalogQuantityLimits, clampCatalogQuantity } from './diverty-catalog-product.mjs?v=997168bfeec5';
import { resolveTheme, themeControlsCss } from './diverty-theme-options.mjs?v=d9e520083145';
const isThemePreview=location.pathname==='/theme-preview.html'&&window.__DIVERTY_THEME_PREVIEW__===true;
let previewTheme=null;
import { gpsPointFromText } from './diverty-gps-point.mjs?v=1fb92a5943a5';
import { capturePreciseGps, gpsAccuracyMessage } from './diverty-gps-capture.mjs?v=832eee9812fc';
import { needsPlaceReference } from './diverty-location-reference.mjs?v=89e3fe00c169';
import { peakResourceUsage } from './diverty-resource-usage.mjs?v=9191a8365a60';
import { prepareBookingAttempt, readBookingReceipt, isNormalDayFullyBooked, readBrowserStorage, writeBrowserStorage } from './diverty-booking-state.mjs?v=de97c2385636';
import { panamaDateKey, installBookingDatePicker } from './diverty-date-picker.mjs?v=547ea6fb13e5';

function captureBookingGps(form, isCurrent, onProgress) {
    const search = capturePreciseGps({ isCurrent, onProgress });
    const observer = new MutationObserver(() => { if (!isCurrent() || !form.isConnected) search.cancel(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return { cancel: search.cancel, promise: search.promise.finally(() => observer.disconnect()) };
}

function showBookingGpsProgress(form, onCancel) {
    const dialog = document.createElement('dialog');
    dialog.id = 'booking-gps-progress';
    dialog.className = 'booking-gps-dialog';
    dialog.setAttribute('aria-labelledby', 'booking-gps-title');
    dialog.setAttribute('aria-describedby', 'booking-gps-status');
    dialog.innerHTML = `<div class="booking-gps-spinner" aria-hidden="true"></div><h2 id="booking-gps-title">Buscando ubicación…</h2><p id="booking-gps-status" role="status">Permite el acceso al GPS y mantén el teléfono quieto unos segundos.</p><p class="booking-gps-hint">Usa el GPS solo si estás en el lugar del evento.</p><button type="button">Escribir dirección</button>`;
    const close = () => { observer.disconnect(); if (dialog.open) dialog.close(); dialog.remove(); };
    const cancel = () => { close(); onCancel(); };
    const observer = new MutationObserver(() => { if (!form.isConnected) cancel(); });
    observer.observe(document.body, { childList: true, subtree: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    dialog.querySelector('button').onclick = cancel;
    document.body.appendChild(dialog);
    dialog.showModal();
    return { close, update: text => { dialog.querySelector('#booking-gps-status').textContent = text; } };
}

function showBookingGpsResult(form, { prefix, accuracy, onContinue, ready = true }) {
    const reference = form.elements[prefix + 'Reference'];
    if (!form.isConnected || !reference) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'booking-gps-result';
    dialog.className = 'booking-gps-dialog booking-gps-result';
    dialog.setAttribute('aria-labelledby', 'booking-gps-result-title');
    dialog.setAttribute('aria-describedby', 'booking-gps-result-help');
    dialog.innerHTML = `<div class="booking-gps-found" aria-hidden="true">✓</div>
        <h2 id="booking-gps-result-title" tabindex="-1" autofocus>Hemos encontrado tu ubicación</h2>
        <p id="booking-gps-result-help">Escribe la referencia del lugar para ayudarnos a llegar.</p>
        <label for="booking-gps-reference">Barriada, PH o sala de eventos</label>
        <textarea id="booking-gps-reference" rows="2" maxlength="500" placeholder="Ej.: PH Las Palmeras, salón social, entrada por la garita" aria-describedby="booking-gps-reference-error"></textarea>
        <p id="booking-gps-reference-error" class="booking-gps-error" role="alert" hidden></p>
        <div class="booking-gps-result-coverage"></div>
        <p class="booking-gps-hint"></p>
        <button type="button" class="season-btn" data-gps-continue>${prefix === 'christmas' ? 'Continuar con la reserva' : 'Enviar reserva'}</button>
        <button type="button" class="booking-gps-back" data-gps-back>Volver</button>`;
    const input = dialog.querySelector('textarea');
    const error = dialog.querySelector('.booking-gps-error');
    input.value = reference.value;
    // Keep the original form as the single source for validation and saving.
    const syncReference = () => {
        reference.value = input.value;
        reference.dispatchEvent(new Event('input', { bubbles: true }));
    };
    input.oninput = () => { syncReference(); error.hidden = true; input.removeAttribute('aria-invalid'); };
    const coverage = form.querySelector(`#${prefix}-coverage-result`);
    const coverageDisplay = dialog.querySelector('.booking-gps-result-coverage');
    coverageDisplay.setAttribute('aria-live', 'polite');
    const action = dialog.querySelector('[data-gps-continue]');
    const actionLabel = action.textContent;
    const complete = () => {
        if (!dialog.isConnected) return;
        if (coverage) coverageDisplay.innerHTML = coverage.innerHTML;
        action.disabled = false;
        action.textContent = actionLabel;
    };
    if (ready && coverage) coverageDisplay.innerHTML = coverage.innerHTML;
    if (!ready) {
        coverageDisplay.textContent = 'Verificando la zona y el transporte… Puedes escribir la referencia mientras tanto.';
        action.disabled = true;
        action.textContent = 'Verificando transporte…';
    }
    dialog.querySelector('.booking-gps-hint').textContent = `Precisión aproximada ±${Math.ceil(accuracy)} m.${accuracy > 50 ? ' Añade una referencia detallada para ayudarnos a llegar.' : ''}`;
    const close = () => { observer.disconnect(); if (dialog.open) dialog.close(); dialog.remove(); };
    const observer = new MutationObserver(() => { if (!form.isConnected) close(); });
    observer.observe(document.body, { childList: true, subtree: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.querySelector('[data-gps-back]').onclick = close;
    action.onclick = () => {
        if (action.disabled) return;
        if (!input.value.trim()) {
            error.textContent = 'Escribe la barriada, PH o sala de eventos.';
            error.hidden = false;
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        syncReference();
        // Close before the existing flow can open transport review or date dialogs.
        close();
        if (form.isConnected) onContinue();
    };
    document.body.appendChild(dialog);
    dialog.showModal();
    return { close, complete };
}

// VELOCIDAD MÓVIL 6A — Firebase pesado bajo demanda.
        // El inicio usa REST ligero para contenido público. Firestore/Auth completos
        // solo se descargan cuando el visitante abre reservas, disponibilidad o portal.
        let doc, collection, getDocs, setDoc, getDoc, query, where, onSnapshot, writeBatch, runTransaction, callBookingFunction;
        let firebaseRuntimePromise = null;

        async function ensureFirebaseRuntime() {
            if(isThemePreview)throw new Error('Theme preview is read-only');
            if (db && auth?.currentUser && getDocs && doc) return { db, auth };
            if (!firebaseRuntimePromise) {
                firebaseRuntimePromise = import('/assets/js/diverty-booking-firebase.js?v=e295fdb06aaf')
                    .then(m => m.getDivertyFirebaseRuntime(firebaseConfig, 'DivertyWeb', typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : ''))
                    .then(rt => {
                        db = rt.db; auth = rt.auth;
                        ({ doc, collection, getDocs, setDoc, getDoc, query, where, onSnapshot, writeBatch, runTransaction, callBookingFunction } = rt);
                        return rt;
                    })
                    .catch(err => { firebaseRuntimePromise = null; throw err; });
            }
            return firebaseRuntimePromise;
        }

        function decodeFirestoreValue(v) {
            if (!v || typeof v !== 'object') return null;
            if ('stringValue' in v) return v.stringValue;
            if ('integerValue' in v) return Number(v.integerValue);
            if ('doubleValue' in v) return Number(v.doubleValue);
            if ('booleanValue' in v) return Boolean(v.booleanValue);
            if ('timestampValue' in v) return v.timestampValue;
            if ('nullValue' in v) return null;
            if ('referenceValue' in v) return v.referenceValue;
            if ('geoPointValue' in v) return v.geoPointValue;
            if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
            if ('mapValue' in v) {
                const out={}; for (const [k,val] of Object.entries(v.mapValue.fields || {})) out[k]=decodeFirestoreValue(val); return out;
            }
            return null;
        }
        function decodeFirestoreDocument(d) {
            const out={}; for (const [k,v] of Object.entries(d?.fields || {})) out[k]=decodeFirestoreValue(v);
            out.id=String(d?.name || '').split('/').pop() || out.id || '';
            return out;
        }
        async function fetchPublicRestDoc(collectionName, id) {
            const path=`artifacts/${CRM_APP_ID}/public/data/${collectionName}/${id}`;
            const url=`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${path}`;
            const r=await fetch(url);
            if(r.status===404) return null;
            if(!r.ok) throw new Error(`Firestore REST ${r.status}`);
            return decodeFirestoreDocument(await r.json());
        }
        async function fetchPublicRestCollection(collectionName) {
            const base=`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/artifacts/${CRM_APP_ID}/public/data/${collectionName}`;
            const rows=[]; let pageToken='';
            for(let page=0; page<5; page++) {
                const url=base+`?pageSize=300${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
                const r=await fetch(url);
                if(r.status===404) return rows;
                if(!r.ok) throw new Error(`Firestore REST ${r.status}`);
                const j=await r.json();
                rows.push(...(j.documents||[]).map(decodeFirestoreDocument));
                pageToken=j.nextPageToken||''; if(!pageToken) break;
            }
            return rows;
        }

        async function fetchPublicRestMonth(start, end) {
            const url=`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/artifacts/${CRM_APP_ID}/public/data:runQuery`;
            const response=await fetch(url, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({structuredQuery:{from:[{collectionId:'disponibilidad_web'}],where:{compositeFilter:{op:'AND',filters:[
                    {fieldFilter:{field:{fieldPath:'fecha'},op:'GREATER_THAN_OR_EQUAL',value:{stringValue:start}}},
                    {fieldFilter:{field:{fieldPath:'fecha'},op:'LESS_THAN_OR_EQUAL',value:{stringValue:end}}}
                ]}}}})
            });
            if(!response.ok) throw new Error(`Firestore availability ${response.status}`);
            const rows=await response.json();
            if(!Array.isArray(rows)||rows.some(row=>row.error)) throw new Error('Incomplete availability response');
            return rows.filter(row=>row.document).map(row=>{
                const event=decodeFirestoreDocument(row.document);
                return {...event,_availabilityId:event.id};
            });
        }

        if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

        const firebaseConfig = { apiKey: "AIzaSyDxE2E1KMuZU523k8oWHabi1jDrFxPOD-0", authDomain: "diverty-eventos.firebaseapp.com", projectId: "diverty-eventos", storageBucket: "diverty-eventos.firebasestorage.app", messagingSenderId: "491130670516", appId: "1:491130670516:web:8c80abd09ccc92c194f6e1" };
        const CRM_APP_ID = "diverty-oficial"; 

        let locations = [{ value: 'panama-centro', label: 'Panamá Centro (Base)', cost: 0 }];
        let gallery = [], activeCoupons = [], allPurchasableItems = [];
        let dynamicCategories = []; 
        let customerReviews = [ 
            { id: 1, name: "María G.", rating: 5, comment: "¡A todos les encantó el show! Los niños no pararon de reír en toda la tarde.", color: "from-pink-500 to-rose-500", initial: "M", location: "Panamá Centro" }, 
            { id: 2, name: "Carlos M.", rating: 5, comment: "Muy puntuales y profesionales. La decoración y animación de primera.", color: "from-blue-500 to-cyan-500", initial: "C", location: "Arraiján" }, 
            { id: 3, name: "Ana R.", rating: 5, comment: "El pintacaritas fue un éxito. Diseños hermosos y mucha amabilidad.", color: "from-purple-500 to-indigo-500", initial: "A", location: "La Chorrera" } 
        ];
        
        let db, auth; 
        let bookedEvents = [];
        // Reservas completas de `eventos`: fuente de verdad EXCLUSIVA para recomendaciones por zona.
        // `bookedEvents` sigue reservado para cupos/slot_santa y no se mezcla con el motor de rutas.
        let routeEvents = [];
        const routeEventsMonthCache = new Map();
        let availabilityReady = false;
        let pendingBooking = null;
        const bookedEventsMonthCache = new Map();
        let bookedEventsRequestSeq = 0;
        // NAVIDAD: capacidad cacheada para mostrar cupos antes de pedir datos al cliente.
        // Se relee como máximo una vez por minuto para ahorrar operaciones de Firestore.
        let christmasCapacityCache = { at: 0, value: 1 };
        async function getChristmasCapacity({ force = false } = {}) {
            if (!db) { try { await ensureFirebaseRuntime(); } catch(_) { return Math.max(1, Number(christmasCapacityCache.value) || 1); } }
            if (!force && Date.now() - christmasCapacityCache.at < 60000) {
                return Math.max(1, Number(christmasCapacityCache.value) || 1);
            }
            try {
                const snap = await getDoc(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','global'));
                const n = Number(snap.exists() ? (snap.data()?.capacidadSanta ?? 1) : 1);
                christmasCapacityCache = { at: Date.now(), value: Number.isInteger(n) && n >= 1 && n <= 100 ? n : 1 };
            } catch (_) {}
            return Math.max(1, Number(christmasCapacityCache.value) || 1);
        }


        // NAVIDAD — motor inteligente compartido por horarios y confirmación.
        // Evalúa cada Santa por su ruta del día: 25 min de visita + 5 min de margen
        // + traslado estimado. También simula reservas antiguas que aún no tengan Santa.
        const CHRISTMAS_SERVICE_BUFFER_MINUTES = 30;
        const christmasRouteTimeMinutes = value => {
            const m=String(value||'').match(/^(\d{1,2}):(\d{2})/);
            return m ? Number(m[1])*60+Number(m[2]) : null;
        };
        const christmasRouteDistanceKm = (a,b) => {
            if (!a || !b) return null;
            const R=6371, rad=Math.PI/180;
            const dLat=(b.lat-a.lat)*rad, dLng=(b.lng-a.lng)*rad;
            const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
            return 2*R*Math.asin(Math.sqrt(x));
        };
        const christmasRouteTravelMinutes = km => {
            const d=Math.max(0,Number(km)||0);
            if(d<=2) return 10;
            if(d<=5) return 15;
            if(d<=8) return 22;
            if(d<=12) return 30;
            if(d<=18) return 40;
            return Math.min(70,40+Math.ceil((d-18)*2));
        };
        const christmasRowGps = row => {
            const lat=Number(row?.lat), lng=Number(row?.lng);
            return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0) ? {lat,lng} : null;
        };
        const christmasRouteLeg = (from,to) => {
            const km=christmasRouteDistanceKm(christmasRowGps(from),christmasRowGps(to));
            return {km,minutes:km===null?15:christmasRouteTravelMinutes(km),estimated:km===null};
        };
        const christmasRouteInsertion = (candidate,stops=[]) => {
            const t=christmasRouteTimeMinutes(candidate?.hora);
            if(t===null) return {feasible:false,score:9999,reason:'time'};
            const sameDate=stops.filter(x=>x&&x.id!==candidate?.id&&String(x.fecha||'')===String(candidate?.fecha||''))
                .filter(x=>christmasRouteTimeMinutes(x.hora)!==null)
                .sort((a,b)=>christmasRouteTimeMinutes(a.hora)-christmasRouteTimeMinutes(b.hora));
            if(sameDate.some(x=>christmasRouteTimeMinutes(x.hora)===t)) return {feasible:false,score:9999,reason:'same-time',anchors:sameDate.length};
            const previous=[...sameDate].filter(x=>christmasRouteTimeMinutes(x.hora)<t).pop()||null;
            const next=sameDate.find(x=>christmasRouteTimeMinutes(x.hora)>t)||null;
            const legPrev=previous?christmasRouteLeg(previous,candidate):null;
            const legNext=next?christmasRouteLeg(candidate,next):null;
            const fitsPrevious=!previous||christmasRouteTimeMinutes(previous.hora)+CHRISTMAS_SERVICE_BUFFER_MINUTES+legPrev.minutes<=t;
            const fitsNext=!next||t+CHRISTMAS_SERVICE_BUFFER_MINUTES+legNext.minutes<=christmasRouteTimeMinutes(next.hora);
            let addedTravel=0;
            if(previous&&next) addedTravel=Math.max(0,legPrev.minutes+legNext.minutes-christmasRouteLeg(previous,next).minutes);
            else if(previous) addedTravel=legPrev.minutes;
            else if(next) addedTravel=legNext.minutes;
            const kms=[legPrev?.km,legNext?.km].filter(v=>Number.isFinite(v));
            const nearestKm=kms.length?Math.min(...kms):null;
            const timeGaps=[previous?Math.abs(t-christmasRouteTimeMinutes(previous.hora)):null,next?Math.abs(christmasRouteTimeMinutes(next.hora)-t):null].filter(v=>Number.isFinite(v));
            const nearestTimeGap=timeGaps.length?Math.min(...timeGaps):null;
            const startRoutePenalty=sameDate.length?0:25;
            const nearbyBonus=nearestKm!==null&&nearestKm<=7?8:0;
            const score=Math.max(0,addedTravel)+sameDate.length*2+startRoutePenalty-nearbyBonus;
            return {feasible:fitsPrevious&&fitsNext,score,addedTravel,nearestKm,nearestTimeGap,anchors:sameDate.length,previous,next,legPrev,legNext};
        };
        function computeChristmasSmartRoute(date,time,capacity,gps,rows=routeEvents){
            const t=christmasRouteTimeMinutes(time);
            const cap=Math.max(1,Number(capacity)||1);
            if(!gps||t===null) return null;
            const santaNames=Array.from({length:cap},(_,i)=>`Santa ${i+1}`);
            const dayRows=(Array.isArray(rows)?rows:[]).filter(ev=>{
                const id=String(ev._eventId||ev.id||'');
                const isSanta=ev.esNavidad===true||String(ev.recursoNavidad||'').toLowerCase()==='santa';
                return id&&isSanta&&String(ev.fecha||'')===String(date)&&christmasRouteTimeMinutes(ev.hora)!==null;
            }).map(ev=>({...ev,id:String(ev._eventId||ev.id||'')}));
            const routes=new Map(santaNames.map(name=>[name,[]]));
            const unassigned=[];
            for(const ev of dayRows){
                const santa=String(ev.santaAsignado||'').trim();
                if(routes.has(santa)) routes.get(santa).push(ev); else unassigned.push(ev);
            }
            // Compatibilidad: si una reserva antigua no tenía Santa, la distribuimos virtualmente
            // para que no desaparezca de la planificación mientras la app la reconcilia.
            for(const ev of unassigned.sort((a,b)=>christmasRouteTimeMinutes(a.hora)-christmasRouteTimeMinutes(b.hora))){
                const choices=santaNames.map(name=>({name,...christmasRouteInsertion(ev,routes.get(name))}))
                    .filter(x=>x.feasible).sort((a,b)=>a.score-b.score||routes.get(a.name).length-routes.get(b.name).length);
                const chosen=choices[0]?.name||santaNames.slice().sort((a,b)=>routes.get(a).length-routes.get(b).length)[0];
                if(chosen) routes.get(chosen).push({...ev,santaAsignado:chosen});
            }
            const candidate={id:'__candidate__',fecha:String(date),hora:String(time),lat:Number(gps.lat),lng:Number(gps.lng)};
            const choices=santaNames.map(name=>({name,load:routes.get(name).length,...christmasRouteInsertion(candidate,routes.get(name))}))
                .filter(x=>x.feasible).sort((a,b)=>a.score-b.score||a.load-b.load||a.name.localeCompare(b.name,undefined,{numeric:true}));
            const best=choices[0]||null;
            return best ? {feasible:true,bestSanta:best.name,score:best.score,nearestKm:best.nearestKm,nearestTimeGap:best.nearestTimeGap,anchors:best.anchors,addedTravel:best.addedTravel} : {feasible:false,bestSanta:'',score:9999,nearestKm:null,nearestTimeGap:null,anchors:dayRows.length};
        }
        let currentCalDate = new Date(); 
        let bookingFormState = {}; 
        let selectedCalendarDate = null; 
        let bookingDatePickerCleanup = null;
        let christmasLocationState = { status:'pending', charge:0, label:'', displayName:'', lat:null, lng:null, source:'' };
        let normalLocationState = { status:'pending', charge:null, label:'', displayName:'', lat:null, lng:null, source:'', zoneValue:'' };
        let normalResourceCapacityCache = { at:0, value:{animadores:3,payasos:1} };
        let normalBookingCapacity = null;

        const CHRISTMAS_WHATSAPP = '50766677965';
        const CHRISTMAS_REVIEW_TERMS = [
            'barraza','chorrillo','calle 24','calle 25','san pedro','ciudad radial','villa del rey',
            'rana de oro','san joaquin','nazareno','villa cecilia','villa lobos','monterico sector 7',
            'monterico 7','cabuya','cabuyita','las mananitas sector 1','las mananitas sector 2','las mananitas sector 5',
            'felipillo','garzas de pacora','las garzas','el martillo','samaria','mano de piedra','torrijos carter',
            'santa marta','cerro batea','lago de los andes','coco solito','fatima','loma del cristo',
            'nuevo veranillo','veranillo','santa cruz','santa rita','caminos de omar','santa librada',
            'alcalde diaz','el trebol','nueva esperanza','jorge illueca','santa eduviges',
            'rio abajo calle 4','rio abajo calle 6','rio abajo calle 11','rio abajo calle 17'
        ];
        const normalizeChristmasPlace = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
        const christmasCoordsFromText = gpsPointFromText;
        async function reverseChristmasLocation(lat,lng){
            try{
                const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=es`;
                const r=await fetch(url,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(5000)}); if(!r.ok) return null;
                const j=await r.json(); return j||null;
            }catch(_){ return null; }
        }
        // NAVIDAD — REGLAS DE COBERTURA PROTEGIDAS.
        // No reutilizar los precios de reservas normales aquí. Santa tiene una política propia:
        //   • Centro/interior de Ciudad de Panamá hasta Bella Vista, hasta Tocumen y hasta Villa Zaita: $0.
        //   • Costa del Este y Punta Pacífica: recargo de $5.
        //   • Después de Bella Vista hasta Albrook/Clayton, después de Tocumen hasta Pacora y
        //     después de Villa Zaita hasta La Cabima: recargo único máximo de $5.
        //   • Después de Albrook/Clayton, Pacora o La Cabima: confirmar por WhatsApp.
        //   • Sectores de seguridad especiales: confirmar por WhatsApp, sin mostrar “zona roja” al cliente.
        function evaluateChristmasCoverage(lat,lng,label=''){
            const text=normalizeChristmasPlace(label);
            const special=CHRISTMAS_REVIEW_TERMS.some(term=>text.includes(term));
            if(special) return {status:'review',charge:0,label:'Ubicación especial · confirmar',reason:'security'};
            if(Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && (Number(lat)<8.94 || Number(lat)>9.185 || Number(lng)<-79.61 || Number(lng)>-79.275)) return {status:'review',charge:0,label:'Fuera de cobertura automática',reason:'outside'};

            const includedGroups = [
                {terms:['tocumen'],label:'Panamá Este · hasta Tocumen'},
                {terms:['villa zaita'],label:'Panamá Norte · hasta Villa Zaita'},
                {terms:['bella vista'],label:'Panamá Centro · hasta Bella Vista'},
                {terms:['chanis','villa lucre','el ingenio','san francisco','parque lefevre','pueblo nuevo','betania','bethania','obarrio','marbella','paitilla','carrasquilla','juan diaz','don bosco','el crisol','concepcion','panama viejo','las acacias'],label:'Ciudad de Panamá · transporte incluido'}
            ];
            const surchargeGroups = [
                {terms:['costa del este'],label:'Costa del Este · transporte adicional'},
                {terms:['punta pacifica'],label:'Punta Pacífica · transporte adicional'},
                {terms:['albrook','clayton','ciudad del saber'],label:'Albrook / Clayton · transporte adicional'},
                {terms:['pacora','24 de diciembre'],label:'Panamá Este · extensión hasta Pacora'},
                {terms:['la cabima'],label:'Panamá Norte · extensión hasta La Cabima'}
            ];
            for(const group of surchargeGroups) if(group.terms.some(x=>text.includes(x))) return {status:'surcharge',charge:5,label:group.label};
            for(const group of includedGroups) if(group.terms.some(x=>text.includes(x))) return {status:'included',charge:0,label:group.label};

            const la=Number(lat), lo=Number(lng);
            if(!Number.isFinite(la)||!Number.isFinite(lo)) return {status:'review',charge:0,label:'Ubicación por confirmar',reason:'no-gps'};

            // Geocercas específicas para recargos dentro de la ciudad. Se evalúan antes
            // del polígono general para que el GPS no convierta Costa del Este o Punta Pacífica en $0
            // cuando el geocodificador devuelve solamente "Juan Díaz" o "San Francisco".
            const here={lat:la,lng:lo};
            const puntaPacificaKm=christmasRouteDistanceKm(here,{lat:8.97644,lng:-79.50794});
            const costaDelEsteKm=christmasRouteDistanceKm(here,{lat:9.01318,lng:-79.46807});
            if(Number.isFinite(puntaPacificaKm) && puntaPacificaKm<=1.35) return {status:'surcharge',charge:5,label:'Punta Pacífica · transporte adicional'};
            if(Number.isFinite(costaDelEsteKm) && costaDelEsteKm<=1.9) return {status:'surcharge',charge:5,label:'Costa del Este · transporte adicional'};

            // Geocercas operativas aproximadas; sirven como respaldo cuando el geocodificador
            // devuelve un nombre poco específico. Los nombres reconocidos arriba tienen prioridad.
            const core = la>=8.94 && la<=9.125 && lo>=-79.545 && lo<=-79.365;   // Bella Vista -> Tocumen / Villa Zaita
            const west = la>=8.94 && la<=9.075 && lo>=-79.605 && lo<-79.545;   // hasta Albrook/Clayton
            const east = la>=8.95 && la<=9.145 && lo>-79.365 && lo<=-79.275;   // Tocumen -> Pacora
            const north = la>9.125 && la<=9.185 && lo>=-79.61 && lo<=-79.47;   // Villa Zaita -> La Cabima
            if(core) return {status:'included',charge:0,label:'Ciudad de Panamá · transporte incluido'};
            if(west) return {status:'surcharge',charge:5,label:'Albrook / Clayton · transporte adicional'};
            if(east) return {status:'surcharge',charge:5,label:'Panamá Este · extensión hasta Pacora'};
            if(north) return {status:'surcharge',charge:5,label:'Panamá Norte · extensión hasta La Cabima'};
            return {status:'review',charge:0,label:'Fuera de cobertura automática',reason:'outside'};
        }
        const NORMAL_RESTRICTED_TERMS = [
            'barraza','chorrillo','calle 24','calle 25','san pedro','ciudad radial','villa del rey',
            'rana de oro','san joaquin','nazareno','villa cecilia','villa lobos','monterico sector 7',
            'monterico 7','cabuya','cabuyita','las mananitas sector 1','las mananitas sector 2','las mananitas sector 5',
            'felipillo','garzas de pacora','las garzas','el martillo','samaria','mano de piedra','torrijos carter',
            'santa marta','cerro batea','lago de los andes','coco solito','fatima','loma del cristo',
            'nuevo veranillo','veranillo','santa cruz','santa rita','caminos de omar','santa librada',
            'alcalde diaz','el trebol','nueva esperanza','jorge illueca','santa eduviges',
            'rio abajo calle 4','rio abajo calle 6','rio abajo calle 11','rio abajo calle 17'
        ];
        const NORMAL_MANUAL_ZONES = [
            {value:'ciudad-panama',label:'Ciudad de Panamá',cost:0},
            {value:'punta-pacifica',label:'Punta Pacífica',cost:5},
            {value:'costa-del-este',label:'Costa del Este',cost:5},
            {value:'albrook-clayton',label:'Albrook / Clayton',cost:5},
            {value:'panama-este',label:'Panamá Este · después de Megamall hasta Pacora',cost:15},
            {value:'panama-norte',label:'Panamá Norte · hasta Villa Grecia',cost:15},
            {value:'arraijan',label:'Arraiján / Panamá Pacífico',cost:15},
            {value:'costa-verde-3km',label:'Costa Verde / hasta 3 km',cost:20},
            {value:'chorrera',label:'La Chorrera · fuera de 3 km de Costa Verde',cost:25},
            {value:'por-confirmar',label:'Otra ubicación / fuera de cobertura',cost:null,review:true}
        ];
        // Si el administrador web tiene una tarifa guardada para una zona canónica,
        // esa tarifa tiene prioridad. Los valores de arriba quedan como respaldo seguro.
        // Esto evita que Administrador, Web y CRM muestren precios distintos.
        const NORMAL_ZONE_ALIASES = {
            'ciudad-panama':['ciudad de panama','panama centro'],
            'punta-pacifica':['punta pacifica'],
            'costa-del-este':['costa del este'],
            'albrook-clayton':['albrook / clayton','albrook','clayton','ciudad del saber'],
            'panama-este':['panama este'],
            'panama-norte':['panama norte'],
            'arraijan':['arraijan / panama pacifico','arraijan','panama pacifico'],
            'costa-verde-3km':['costa verde / hasta 3 km','costa verde'],
            'chorrera':['la chorrera','chorrera']
        };
        function normalConfiguredCost(zoneValue,fallback=0){
            // Las tarifas operativas de reservas normales se administran desde Diverty CRM
            // y este archivo contiene el respaldo vigente. `transporte_web` pertenece al
            // administrador visual histórico y ya no puede sobrescribir silenciosamente
            // los precios GPS, evitando diferencias entre Web y CRM.
            return Math.max(0, Number(fallback) || 0);
        }
        // Puntos operativos usados por el cálculo GPS de reservas normales.
        // Los precios siguen las reglas comerciales definidas por Diverty; estas
        // coordenadas solo sirven para ubicar los cortes geográficos con mayor precisión.
        const NORMAL_MEGAMALL = {lat:9.10123,lng:-79.34058};
        const NORMAL_PACORA = {lat:9.08252,lng:-79.28957};
        const NORMAL_COSTA_VERDE = {lat:8.89486,lng:-79.75260};
        const NORMAL_VILLA_GRECIA = {lat:9.10658,lng:-79.56163};
        const NORMAL_PACORA_EAST_LIMIT_LNG = -79.275;
        const NORMAL_CHORRERA_WEST_LIMIT_LNG = -79.86;
        const normalDistanceKm = (lat,lng,point) => christmasRouteDistanceKm({lat:Number(lat),lng:Number(lng)},point);
        function evaluateNormalCoverage(lat,lng,label=''){
            const text=normalizeChristmasPlace(label);
            if(NORMAL_RESTRICTED_TERMS.some(term=>text.includes(term))) return {status:'blocked',charge:0,label:'Ubicación no disponible',reason:'security',zoneValue:'restringida'};

            const la=Number(lat),lo=Number(lng);
            const hasGps=lat!=null&&lng!=null&&String(lat).trim()!==''&&String(lng).trim()!==''&&Number.isFinite(la)&&Number.isFinite(lo)&&Math.abs(la)<=90&&Math.abs(lo)<=180;
            if(hasGps && (lo<NORMAL_CHORRERA_WEST_LIMIT_LNG || lo>NORMAL_PACORA_EAST_LIMIT_LNG || la<8.84 || la>9.16)) return {status:'review',charge:0,label:'Fuera del área automática',reason:'outside',zoneValue:''};

            // Recargos específicos dentro de Ciudad de Panamá.
            if(text.includes('punta pacifica')) return {status:'included',charge:normalConfiguredCost('punta-pacifica',5),label:'Punta Pacífica',zoneValue:'punta-pacifica'};
            if(text.includes('costa del este')) return {status:'included',charge:normalConfiguredCost('costa-del-este',5),label:'Costa del Este',zoneValue:'costa-del-este'};
            if(['albrook','clayton','ciudad del saber'].some(t=>text.includes(t))) return {status:'included',charge:normalConfiguredCost('albrook-clayton',5),label:'Albrook / Clayton',zoneValue:'albrook-clayton'};

            // Panamá Oeste: Panamá Pacífico y Arraiján siempre usan la tarifa de $15.
            if(['panama pacifico','arraijan'].some(t=>text.includes(t))) return {status:'included',charge:normalConfiguredCost('arraijan',15),label:'Arraiján / Panamá Pacífico',zoneValue:'arraijan'};

            // La Chorrera se calcula desde Costa Verde: hasta 3 km = $20;
            // más de 3 km, mientras siga dentro del área de La Chorrera = $25.
            const namedChorrera=['costa verde','la chorrera','distrito de la chorrera','barrio colon','el coco','puerto caimito'].some(t=>text.includes(t));
            if(hasGps && namedChorrera){
                const km=normalDistanceKm(la,lo,NORMAL_COSTA_VERDE);
                if(Number.isFinite(km) && km<=3) return {status:'included',charge:normalConfiguredCost('costa-verde-3km',20),label:'Costa Verde · hasta 3 km',zoneValue:'costa-verde-3km',distanceKm:km};
                return {status:'included',charge:normalConfiguredCost('chorrera',25),label:'La Chorrera',zoneValue:'chorrera',distanceKm:km};
            }

            if(hasGps){
                // Fuera de los límites automáticos: la solicitud llega al CRM para revisión.
                if(lo < NORMAL_CHORRERA_WEST_LIMIT_LNG || lo > NORMAL_PACORA_EAST_LIMIT_LNG || la < 8.84 || la > 9.16){
                    return {status:'review',charge:0,label:'Fuera del área automática',reason:'outside',zoneValue:''};
                }

                // Fallback geográfico para La Chorrera cuando el geocodificador no devuelve
                // el nombre del distrito. Primero se calcula la distancia real a Costa Verde.
                if(lo <= -79.70 && lo >= NORMAL_CHORRERA_WEST_LIMIT_LNG && la>=8.84 && la<=8.99){
                    const km=normalDistanceKm(la,lo,NORMAL_COSTA_VERDE);
                    if(Number.isFinite(km) && km<=3) return {status:'included',charge:normalConfiguredCost('costa-verde-3km',20),label:'Costa Verde · hasta 3 km',zoneValue:'costa-verde-3km',distanceKm:km};
                    return {status:'included',charge:normalConfiguredCost('chorrera',25),label:'La Chorrera',zoneValue:'chorrera',distanceKm:km};
                }

                // Arraiján: incluye Panamá Pacífico y el corredor previo a La Chorrera.
                if(lo < -79.585 && lo > -79.70 && la>=8.87 && la<=9.02) return {status:'included',charge:normalConfiguredCost('arraijan',15),label:'Arraiján / Panamá Pacífico',zoneValue:'arraijan'};

                // Panamá Norte: $15 hasta Villa Grecia. Más al norte queda por confirmar.
                const northCorridor=lo>=-79.62 && lo<=-79.49;
                if(northCorridor && la > NORMAL_VILLA_GRECIA.lat + 0.0085) return {status:'review',charge:0,label:'Después de Villa Grecia',reason:'outside-north',zoneValue:''};
                if(northCorridor && la > 9.065 && la <= NORMAL_VILLA_GRECIA.lat + 0.0085) return {status:'included',charge:normalConfiguredCost('panama-norte',15),label:'Panamá Norte · hasta Villa Grecia',zoneValue:'panama-norte'};

                // Panamá Este: Ciudad de Panamá es gratis hasta Megamall. El recargo de
                // $15 empieza al pasar Megamall y termina en Pacora; después se revisa.
                if(lo > NORMAL_MEGAMALL.lng && lo <= NORMAL_PACORA_EAST_LIMIT_LNG && la>=8.95 && la<=9.145){
                    return {status:'included',charge:normalConfiguredCost('panama-este',15),label:'Panamá Este · después de Megamall hasta Pacora',zoneValue:'panama-este'};
                }

                // Las Acacias, Don Bosco, Juan Díaz, El Crisol, Concepción, Panamá Viejo,
                // Bella Vista, avenidas Perú/Brasil y demás sectores urbanos no tarifados
                // específicamente permanecen con transporte incluido ($0).
                return {status:'included',charge:normalConfiguredCost('ciudad-panama',0),label:'Ciudad de Panamá',zoneValue:'ciudad-panama'};
            }

            // A known address can establish its zone without requiring GPS.
            if(/\b(chepo|torti|chame|coronado|san carlos|penonome|santiago)\b/.test(text)||(!namedChorrera&&/\bcolon\b/.test(text)))return {status:'review',charge:0,label:'Fuera del área automática',reason:'outside',zoneValue:''};
            const named=[
                {terms:['punta pacifica'],charge:5,label:'Punta Pacífica',zoneValue:'punta-pacifica'},
                {terms:['costa del este'],charge:5,label:'Costa del Este',zoneValue:'costa-del-este'},
                {terms:['albrook','clayton','ciudad del saber'],charge:5,label:'Albrook / Clayton',zoneValue:'albrook-clayton'},
                {terms:['panama pacifico','arraijan'],charge:15,label:'Arraiján / Panamá Pacífico',zoneValue:'arraijan'},
                {terms:['pacora'],charge:15,label:'Panamá Este · después de Megamall hasta Pacora',zoneValue:'panama-este'},
                {terms:['villa grecia','panama norte','las cumbres','villa zaita','ernesto cordoba'],charge:15,label:'Panamá Norte · hasta Villa Grecia',zoneValue:'panama-norte'},
                {terms:['costa verde'],charge:20,label:'Costa Verde · hasta 3 km',zoneValue:'costa-verde-3km'},
                {terms:['la chorrera','chorrera'],charge:25,label:'La Chorrera',zoneValue:'chorrera'},
                {terms:['las acacias','don bosco','juan diaz','el crisol','concepcion','panama viejo','bella vista','avenida peru','avenida brasil','via brasil','tocumen','calle colombia','obarrio','marbella','paitilla','san francisco','chanis','villa lucre','el ingenio','parque lefevre','pueblo nuevo','betania','bethania','carrasquilla'],charge:0,label:'Ciudad de Panamá',zoneValue:'ciudad-panama'}
            ];
            for(const z of named) if(z.terms.some(t=>text.includes(t))) return {status:'included',charge:normalConfiguredCost(z.zoneValue,z.charge),label:z.label,zoneValue:z.zoneValue};
            return {status:'review',charge:0,label:'Ubicación por revisar',reason:'no-gps',zoneValue:''};
        }
        function normalTransportCost(){
            if(isChristmasEveBooking()) return null;
            const status=normalLocationState?.status || bookingFormState.normalCoverageStatus || '';
            const n=Number(normalLocationState?.charge ?? bookingFormState.normalTransportCost);
            if(status==='included' && Number.isFinite(n)) return Math.max(0,n);
            // Fuera del rango automático la solicitud sí puede llegar al CRM, pero el
            // transporte queda pendiente para que Diverty lo ajuste antes de aceptar.
            if(status==='review' || status==='blocked') return 0;
            return null;
        }
        async function getNormalResourceCapacity({force=false,publicRead=false}={}){
            if(!publicRead&&!db){try{await ensureFirebaseRuntime();}catch(_){return normalResourceCapacityCache.value;}}
            if(!force && Date.now()-normalResourceCapacityCache.at<60000) return normalResourceCapacityCache.value;
            try{
                let cfg;
                if(!publicRead){
                    const snap=await getDoc(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','global'));
                    cfg=snap.exists()?(snap.data()||{}):{};
                }else{cfg=await fetchWithTimeout(fetchPublicRestDoc('config_web','global'),8000)||{};}
                const r=cfg.recursosDisponibles&&typeof cfg.recursosDisponibles==='object'?cfg.recursosDisponibles:{};
                const resourceCount = (value, fallback) => value != null && Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback;
                normalResourceCapacityCache={at:Date.now(),value:{animadores:resourceCount(r.animadores,3),payasos:resourceCount(r.payasos,1)}};
                const simultaneous = Number(cfg.capacidadSimultanea ?? 3);
                normalBookingCapacity = Number.isInteger(simultaneous) && simultaneous >= 1 && simultaneous <= 100 ? simultaneous : null;
            }catch(_){ normalResourceCapacityCache.at=Date.now(); }
            return normalResourceCapacityCache.value;
        }
        function getCartResourceRequirements(){
            const text=normalizeBookingName(app.cart.flatMap(i=>[i.name,i.description,...(Array.isArray(i.services)?i.services:[])]).join(' '));
            const countWord=(word)=>{
                const re=new RegExp(`(\\d+)\\s*${word}s?\\b`); const m=text.match(re);
                if(m) return Math.max(0,Number(m[1])||0);
                return new RegExp(`\\b${word}s?\\b`).test(text)?1:0;
            };
            const durationHours=Math.max(0,...app.cart.map(i=>serviceDurationHours(i,i._raw)));
            return {animadores:countWord('animador'),payasos:countWord('payaso'),durationMinutes:Math.max(30,Math.round((durationHours||2)*60))};
        }
        const normalTimeMinutes=v=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;};
        async function checkNormalResourceAvailability(date,time,{force=false}={}){
            const req=getCartResourceRequirements();
            const cap=await getNormalResourceCapacity({force});
            if(!date||!time) return {feasible:true,needed:req,available:cap,capacity:cap,used:{animadores:0,payasos:0}};
            let rows=[];
            try{
                const snap=await getDocs(query(collection(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web'),where('fecha','==',date)));
                rows=snap.docs.map(d=>({...d.data(),_availabilityId:d.id})).filter(r=>!String(r._availabilityId||'').startsWith('slot_')&&r.esNavidad!==true&&isBlockingEvent(r));
            }catch(_){}
            const windows=rows.map(row=>{
                const rr=row.resourceRequirements&&typeof row.resourceRequirements==='object'?row.resourceRequirements:{};
                return {start:normalTimeMinutes(row.hora),duration:Math.max(30,Number(rr.durationMinutes||row.duracionMinutos)||120),animadores:rr.animadores,payasos:rr.payasos};
            });
            const used=peakResourceUsage(normalTimeMinutes(time),req.durationMinutes,windows);
            const available={animadores:Math.max(0,cap.animadores-used.animadores),payasos:Math.max(0,cap.payasos-used.payasos)};
            return {feasible:req.animadores<=available.animadores&&req.payasos<=available.payasos,needed:req,available,capacity:cap,used};
        }
        function renderNormalCoverageStatus(){
            const box=document.getElementById('normal-coverage-result'); if(!box) return;
            const s=normalLocationState||{};
            if(s.status==='included') box.innerHTML=`<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><p class="font-black text-emerald-600">✅ ${cleanStr(s.label)||'Ubicación verificada'}</p><p class="text-xs season-text-muted mt-1">Transporte: <b>$${Number(s.charge||0).toFixed(2)}</b></p></div>`;
            else if(s.status==='blocked') box.innerHTML=`<div class="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4"><p class="font-black text-rose-600">Ubicación no disponible para reserva automática</p><p class="text-xs season-text-muted mt-1">Por seguridad, esta ubicación no se puede solicitar desde la web.</p></div>`;
            else if(s.status==='review'&&s.reason!=='no-gps') box.innerHTML=`<div class="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4"><p class="font-black text-orange-600">📲 Transporte por confirmar</p><p class="text-xs season-text-muted mt-1">Esta dirección está fuera de nuestra cobertura automática. Te contactaremos por WhatsApp para coordinar el transporte antes de confirmar la reserva.</p></div>`;
            else if(s.status==='review'&&cleanStr(s.displayName)) box.innerHTML=`<div class="rounded-2xl border border-[var(--s-primary)]/25 bg-[var(--s-primary)]/10 p-4"><p class="font-bold season-text-title">📍 Ubicación recibida</p><p class="text-xs season-text-muted mt-1">Puedes enviar tu solicitud. Te contactaremos por WhatsApp para coordinar tu evento y el abono.</p></div>`;
            else box.innerHTML='';
            const t=document.getElementById('booking-summary-transport'); if(t){t.closest('p').hidden=s.status==='review'&&s.reason==='no-gps';t.textContent=s.status==='blocked'?'No disponible':(s.status==='review'?'Por confirmar':`${s.charge===0?'Incluido · ':''}$${effectiveTransportCost(app.cart.reduce((a,i)=>a+i.quantity,0)).toFixed(2)}`);}
            const total=document.getElementById('booking-summary-total');
            if(total){const sub=app.cart.reduce((a,i)=>a+(Number(i.price)*i.quantity),0);let dv=0;if(appliedCoupon)dv=appliedCoupon.type==='percent'?sub*(Number(appliedCoupon.discount)/100):Number(appliedCoupon.discount);dv=Math.min(sub,Math.max(0,dv));total.textContent=`$${Math.max(0,sub-dv+effectiveTransportCost(app.cart.reduce((a,i)=>a+i.quantity,0))).toFixed(2)}`;}
            updateCartBadgeAndTotals(); refreshBookingSummary();
        }
        async function applyNormalLocation(lat,lng,{source='gps',displayName='',accuracy=null,isCurrent=()=>true}={}){
            const la=Number(lat),lo=Number(lng); if(!Number.isFinite(la)||!Number.isFinite(lo)) return false;
            const rev=displayName?null:await reverseChristmasLocation(la,lo);
            if(!isCurrent()) return false;
            const resolved=String(displayName||rev?.display_name||'Ubicación GPS');
            const coverage=evaluateNormalCoverage(la,lo,resolved);
            normalLocationState={...coverage,displayName:resolved,lat:la,lng:lo,source,accuracy:Number.isFinite(Number(accuracy))?Number(accuracy):null};
            bookingFormState.normalLat=la;bookingFormState.normalLng=lo;bookingFormState.normalTransportCost=coverage.charge;
            bookingFormState.normalCoverageStatus=coverage.status;bookingFormState.normalCoverageLabel=coverage.label;bookingFormState.normalLocationName=resolved;bookingFormState.normalLocationSource=source;
            app.location=coverage.zoneValue||app.location;
            renderNormalCoverageStatus();
            return coverage.status==='included';
        }
        function applyNormalManualZone(value){
            const z=NORMAL_MANUAL_ZONES.find(x=>x.value===value); if(!z) return;
            const status=z.review?'review':'included';
            const charge=z.review?0:normalConfiguredCost(z.value,z.cost);
            normalLocationState={status,charge,label:z.label,displayName:'',lat:null,lng:null,source:'manual-zone',zoneValue:z.value};
            bookingFormState.normalTransportCost=charge;bookingFormState.normalCoverageStatus=status;bookingFormState.normalCoverageLabel=z.label;bookingFormState.normalLocationSource='manual-zone';
            app.location=z.value;renderNormalCoverageStatus();
        }

        function christmasTransportCost(){
            if(!isChristmasEveBooking()) return null;
            const n=Number(christmasLocationState?.charge ?? bookingFormState.christmasTransportCost ?? 0);
            return Number.isFinite(n)?Math.max(0,Math.min(5,n)):0;
        }
        function effectiveTransportCost(count){
            if(!(Number(count)>0)) return 0;
            const xmas=christmasTransportCost();
            if(xmas!==null) return xmas;
            const normal=normalTransportCost();
            return normal===null ? calculateTransportCost(app.location) : normal;
        }
        function christmasWhatsappUrl(message='Quiero confirmar la ubicación para la entrega de Santa.'){
            return `https://wa.me/${CHRISTMAS_WHATSAPP}?text=${encodeURIComponent(message)}`;
        }
        function renderChristmasCoverageStatus(){
            const box=document.getElementById('christmas-coverage-result'); if(!box) return;
            const s=christmasLocationState||{};
            const safeLabel=cleanStr(s.label||'');
            if(s.status==='included') box.innerHTML=`<div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><p class="font-black text-emerald-600">✅ ${safeLabel||'Ubicación dentro de cobertura'}</p><p class="text-xs season-text-muted mt-1">Transporte adicional: <b>$0.00</b> · El punto GPS se usará también para recomendar la mejor hora y organizar la ruta del Santa.</p></div>`;
            else if(s.status==='surcharge') box.innerHTML=`<div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><p class="font-black text-amber-600">📍 ${safeLabel||'Ubicación disponible'}</p><p class="text-xs season-text-muted mt-1">Transporte adicional: <b>$5.00</b> · Este es el recargo máximo automático de Navidad.</p></div>`;
            else if(s.status==='review') box.innerHTML=`<div class="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4"><p class="font-black text-orange-600">📲 Ubicación por confirmar</p><p class="text-xs season-text-muted mt-1">Confirmaremos contigo la dirección y el transporte antes de aceptar. Puedes continuar.</p></div>`;
            else box.innerHTML='';
            const t=document.getElementById('booking-summary-transport'); if(t) t.textContent=s.status==='review'?'Por confirmar':`$${effectiveTransportCost(app.cart.reduce((a,i)=>a+i.quantity,0)).toFixed(2)}`;
            const total=document.getElementById('booking-summary-total');
            if(total){
                const sub=app.cart.reduce((a,i)=>a+(Number(i.price)*i.quantity),0); let dv=0;
                if(appliedCoupon) dv=appliedCoupon.type==='percent'?sub*(Number(appliedCoupon.discount)/100):Number(appliedCoupon.discount);
                dv=Math.min(sub,Math.max(0,dv)); total.textContent=`$${Math.max(0,sub-dv+effectiveTransportCost(app.cart.reduce((a,i)=>a+i.quantity,0))).toFixed(2)}`;
            }
            updateCartBadgeAndTotals(); refreshBookingSummary();
        }
        async function applyChristmasLocation(lat,lng,{source='gps',displayName='',accuracy=null,isCurrent=()=>true}={}){
            const la=Number(lat), lo=Number(lng); if(!Number.isFinite(la)||!Number.isFinite(lo)) return false;
            const rev=displayName?null:await reverseChristmasLocation(la,lo);
            if(!isCurrent()) return false;
            const resolved=String(displayName||rev?.display_name||'Ubicación GPS');
            const coverage=evaluateChristmasCoverage(la,lo,resolved);
            christmasLocationState={...coverage,displayName:resolved,lat:la,lng:lo,source,accuracy:Number.isFinite(Number(accuracy))?Number(accuracy):null};
            bookingFormState.christmasLat=la; bookingFormState.christmasLng=lo;
            bookingFormState.christmasTransportCost=coverage.charge; bookingFormState.christmasCoverageStatus=coverage.status;
            bookingFormState.christmasCoverageLabel=coverage.label; bookingFormState.christmasLocationName=resolved; bookingFormState.christmasLocationSource=source;
            const form=document.getElementById('bookingForm');
            if(form?.elements?.address) form.elements.address.value=`https://www.google.com/maps?q=${la.toFixed(6)},${lo.toFixed(6)}`;
            if(form?.elements?.location) form.elements.location.value=coverage.label;
            bookingFormState.address=form?.elements?.address?.value||bookingFormState.address||'';
            bookingFormState.location=coverage.label;
            renderChristmasCoverageStatus();
            bookedEventsMonthCache.clear(); routeEventsMonthCache.clear();
            // Al avanzar al horario se recalcula la ruta con este punto.
            // La función de horarios pertenece al formulario, no a este ámbito global.
            return coverage.status!=='review';
        }
        
        let isFirebaseLoaded = false;
        let appliedCoupon = null;
        let catalogLoaded = false;
        
        const app = { activeSection: 'home', cart: [], location: 'panama-centro', wizardStep: 1, catalog: [], theme: null, campaigns: [] };

        const DEFAULT_ICONS = {
            bag: `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
            cart: `<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
            plus: `<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/></svg>`,
            check: `<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            refresh: `<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
        };
        let S_ICONS = { ...DEFAULT_ICONS };

        function updateThemeAssets(themeName) {
            S_ICONS = { ...DEFAULT_ICONS }; 
            if (themeName === 'halloween') {
                S_ICONS.cart = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🎃</span>';
                S_ICONS.plus = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🦇</span>';
                S_ICONS.check = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">👻</span>';
                S_ICONS.bag = '<span class="text-lg leading-none">🕷️</span>';
            } else if (themeName === 'christmas') {
                S_ICONS.cart = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🎁</span>';
                S_ICONS.plus = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🎄</span>';
                S_ICONS.check = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">⭐</span>';
                S_ICONS.bag = '<span class="text-lg leading-none">🎅</span>';
            } else if (themeName === 'summer') {
                S_ICONS.cart = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🌴</span>';
                S_ICONS.plus = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">☀️</span>';
                S_ICONS.check = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🌊</span>';
                S_ICONS.bag = '<span class="text-lg leading-none">🕶️</span>';
            } else if (themeName === 'school') {
                S_ICONS.cart = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🎒</span>';
                S_ICONS.plus = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">✏️</span>';
                S_ICONS.check = '<span class="text-xl leading-none" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🎓</span>';
                S_ICONS.bag = '<span class="text-lg leading-none">📚</span>';
            }
        }

        const fetchWithTimeout = async (promise, ms) => {
            let timer;
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("Timeout de conexión")), ms);
            });
            try { return await Promise.race([promise, timeoutPromise]); } finally { clearTimeout(timer); }
        };

        const cleanStr = (val) => {
            if (val === undefined || val === null || val === 'undefined' || val === 'null' || val === '') return '';
            return String(val).trim();
        };

        // VELOCIDAD WEB FASE 4 — Cloudinary entrega imágenes más ligeras sin cambiar
        // el tamaño visual. Solo transforma URLs de imagen de Cloudinary; cualquier
        // imagen externa o ruta local se conserva exactamente como estaba.
        const optimizeCloudinaryImage = (value, width = 720) => {
            const url = cleanStr(value);
            if (!url || !url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url;
            const safeWidth = Math.max(120, Math.min(1600, Number(width) || 720));
            const marker = '/image/upload/';
            const transform = `f_auto,q_auto:eco,c_limit,w_${safeWidth}/`;
            // Evita duplicar nuestra transformación si la función se llama dos veces.
            if (url.includes('/image/upload/f_auto,q_auto:eco,c_limit,')) return url;
            return url.replace(marker, marker + transform);
        };

        const catalogSizes = '(max-width:380px) calc((100vw - 44px) / 2), (max-width:767px) calc((100vw - 54px) / 2), (max-width:1199px) calc((100vw - 88px) / 3), 262px';
        const categorySizes = '(max-width:380px) calc((100vw - 44px) / 2), (max-width:767px) calc((100vw - 54px) / 2), (max-width:1159px) calc((100vw - 88px) / 3), 357px';
        function imageAttributes(value,sizes,options={}) {
            const image=responsiveImage(value,options);
            const original=cleanStr(value);
            const fallback=imageFallbackUrl(original);
            return `src="${escapeCatalogText(image.src)}"${image.srcset?` srcset="${escapeCatalogText(image.srcset)}" sizes="${sizes}"`:''}${image.src!==original?` data-image-original="${escapeCatalogText(original)}"`:''}${fallback?` data-image-fallback="${fallback}"`:''}`;
        }

        // NAVIDAD FASE 1 — detección aislada.
        // No modifica calendario, disponibilidad, Firebase ni el guardado de reservas.
        const normalizeBookingName = (value) => cleanStr(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        // NAVIDAD DISPONIBILIDAD V5 — identificación persistente del servicio Santa.
        // La reserva especial NO puede depender del título exacto del catálogo. El administrador
        // puede cambiar nombres, campañas o textos, así que conservamos una marca `esNavidad` y
        // además usamos el contenido visible como respaldo. Esto evita que Santa abra el formulario
        // normal y garantiza GPS primero, fechas 24/25 y horarios inteligentes.
        const christmasTextLooksLikeSantaDelivery = (value) => {
            const text = normalizeBookingName(value);
            if (!text) return false;
            if (/entregas?\s+de\s+noche\s*buena|nochebuena/.test(text)) return true;
            if (/entregas?\s+(?:de\s+)?(?:regalos?|santa)|entrega\s+con\s+santa/.test(text)) return true;
            const mentionsSanta = /\bsanta(?:\s+claus)?\b/.test(text);
            const mentionsDelivery = /entrega|regalo|visita/.test(text);
            const mentionsChristmasDates = /24\s*(?:y|[-–])\s*25|24\s+de\s+diciembre|25\s+de\s+diciembre/.test(text);
            return mentionsSanta && (mentionsDelivery || mentionsChristmasDates);
        };

        const isChristmasEveItem = (item) => {
            if (!item || typeof item !== 'object') return false;
            if (item.esNavidad === true || normalizeBookingName(item.recursoNavidad) === 'santa') return true;

            const services = Array.isArray(item.services) ? item.services : [];
            const rawValues = item._raw && typeof item._raw === 'object' ? Object.values(item._raw) : [];
            const searchable = [
                item.id, item.name, item.title, item.titulo, item.short, item.slug,
                item.categoria, item.category, item.categoryName,
                item.description, item.descripcion, item.descripcionEvento, item.tags,
                ...services, ...rawValues
            ].filter(v => v !== undefined && v !== null).map(v =>
                Array.isArray(v) ? v.join(' ') : (typeof v === 'object' ? JSON.stringify(v) : String(v))
            ).join(' | ');

            return christmasTextLooksLikeSantaDelivery(searchable);
        };

        const markChristmasBookingItem = (item, sourceText = '') => {
            if (!item || typeof item !== 'object') return item;
            const christmas = isChristmasEveItem(item) || christmasTextLooksLikeSantaDelivery(sourceText);
            return christmas ? { ...item, esNavidad:true, recursoNavidad:'Santa' } : item;
        };

        const isChristmasEveBooking = () => Array.isArray(app.cart) && app.cart.some(isChristmasEveItem);

        function setContent(html) { 
            const mc = document.getElementById('mainContent'); 
            if(mc){ mc.innerHTML = html; if(typeof lucide!=='undefined') lucide.createIcons({ root: mc }); setupSliders(); } 
        }

        function setupSliders() {
            const sliders = document.querySelectorAll('.overflow-x-auto:not(.slider-ready)');
            sliders.forEach(slider => {
                slider.classList.add('slider-ready');
                let isDown = false, startX, scrollLeft;
                slider.addEventListener('mousedown', (e) => { isDown = true; slider.classList.add('cursor-grab'); startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft; });
                slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('cursor-grab', 'cursor-grabbing'); });
                slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('cursor-grabbing'); });
                slider.addEventListener('mousemove', (e) => {
                    if (!isDown) return; e.preventDefault(); slider.classList.add('cursor-grabbing');
                    const x = e.pageX - slider.offsetLeft; const walk = (x - startX) * 2; slider.scrollLeft = scrollLeft - walk;
                });
            });
        }

        function setCartHeaderState(open) {
            const vc = document.getElementById('viewCart');
            const icon = document.getElementById('headerCartIcon');
            if(!vc || !icon) return;

            vc.setAttribute('aria-label', open ? 'Cerrar carrito' : 'Abrir carrito');
            vc.setAttribute('aria-expanded', open ? 'true' : 'false');
            icon.innerHTML = open
                ? '<i data-lucide="x" class="w-7 h-7 text-gray-800"></i>'
                : '<i data-lucide="shopping-cart" class="w-5 h-5 text-gray-800"></i>';

            if(typeof lucide !== 'undefined') lucide.createIcons({ root: vc });
        }

        let cartHistoryActive = false;
        let suppressNextCartPopstate = false;

        function toggleCartDrawer(forceOpen, fromPopstate = false, navigating = false) {
            const mod = document.getElementById('cartModal');
            const hw = document.getElementById('headerWrapper');
            const heroVideo = document.getElementById('hero-video');
            if(!mod) return;

            const shouldOpen = typeof forceOpen === 'boolean'
                ? forceOpen
                : !mod.classList.contains('show');

            mod.classList.add('cart-animating');
            clearTimeout(window.__divertyCartAnimTimer);

            if(shouldOpen) {
                toggleMobileMenu(false, false, true);

                // Pausa el video mientras el carrito está abierto:
                // libera decodificación/GPU en móviles Android.
                if(heroVideo && !heroVideo.paused) {
                    window.__divertyHeroWasPlaying = true;
                    heroVideo.pause();
                } else {
                    window.__divertyHeroWasPlaying = false;
                }

                document.body.classList.add('cart-open');
                mod.classList.add('show');
                if(hw) hw.classList.add('cart-drawer-open');

                // El carrito es una pantalla temporal dentro de la misma página.
                // Creamos una entrada de historial para que el botón Atrás de Android/Chrome
                // cierre el carrito en vez de abandonar Diverty.
                if (!fromPopstate && !cartHistoryActive) {
                    history.pushState({ ...(history.state || {}), divertyCart: true }, '', window.location.href);
                    cartHistoryActive = true;
                }
            } else {
                mod.classList.remove('show');
                document.body.classList.remove('cart-open');
                if(hw) hw.classList.remove('cart-drawer-open');

                if(heroVideo && window.__divertyHeroWasPlaying && app.activeSection === 'home' && !document.hidden) {
                    const r = heroVideo.getBoundingClientRect();
                    if(r.bottom > 0 && r.top < window.innerHeight) {
                        const p = heroVideo.play();
                        if(p && typeof p.catch === 'function') p.catch(() => {});
                    }
                }
                window.__divertyHeroWasPlaying = false;

                // Si se cerró con la X/botón interno, consumimos también la entrada
                // temporal del carrito. El siguiente popstate se ignora para no navegar.
                if (navigating && cartHistoryActive) {
                    cartHistoryActive = false;
                    const state={...(history.state||{})};delete state.divertyCart;
                    history.replaceState(state,'',window.location.href);
                } else if (!fromPopstate && cartHistoryActive && history.state?.divertyCart) {
                    cartHistoryActive = false;
                    suppressNextCartPopstate = true;
                    history.back();
                } else if (fromPopstate) {
                    cartHistoryActive = false;
                }
            }

            window.__divertyCartAnimTimer = setTimeout(() => {
                mod.classList.remove('cart-animating');
            }, 360);

            setCartHeaderState(shouldOpen);
        }

        function showModal(modalId) { 
            if(modalId === 'cartModal') {
                toggleCartDrawer(true);
                return;
            }
            const mod = document.getElementById(modalId); 
            if(mod) mod.classList.add('show');
        }
        
        function showToast(msg, type='info') { 
            const t = document.getElementById('toast'); if(!t) return; 
            t.className = `show ${type}`; 
            t.innerHTML = `<div class="toast-icon-bg"><i data-lucide="${type==='success'?'check-circle':type==='error'?'alert-circle':'info'}" class="w-5 h-5"></i></div> <span class="pr-2">${msg}</span>`; 
            if(typeof lucide!=='undefined') lucide.createIcons({ root: t }); 
            if(t.timeoutId) clearTimeout(t.timeoutId);
            t.timeoutId = setTimeout(() => t.classList.remove('show'), 3000); 
        }
        
        function calculateTransportCost(locVal) { const l = locations.find(x => x.value === locVal); return l ? l.cost : 0; }
        
        function populateLocationSelects() { 
            const html = locations.map(o => `<option value="${o.value}">${o.label}</option>`).join(''); 
            document.querySelectorAll('#cartLocation, select[name="location"]').forEach(s => { 
                if(s){ const cv = s.value; s.innerHTML = html; if(cv) s.value = cv; } 
            }); 
        }
        
        let menuHistoryActive = false;
        let suppressNextMenuPopstate = false;

        function toggleMobileMenu(show, fromPopstate = false, navigating = false) {
            const m = document.getElementById('mobileMenu');
            const o = document.getElementById('mobileMenuOverlay');
            const mt = document.getElementById('mobileToggle');
            const hw = document.getElementById('headerWrapper');
            if(!m || !o) return;

            const shouldOpen = typeof show === 'boolean' ? show : !m.classList.contains('open');

            if(shouldOpen){
                o.classList.add('menu-overlay-open');
                o.style.opacity = '1';
                o.style.visibility = 'visible';
                o.style.pointerEvents = 'auto';
                m.classList.add('open');
                if(hw) hw.classList.add('menu-open');
                if(mt){
                    mt.setAttribute('aria-label', 'Cerrar menú');
                    mt.setAttribute('aria-expanded', 'true');
                    mt.innerHTML = '<i data-lucide="x" class="w-7 h-7 text-gray-800"></i>';
                }
                if (!fromPopstate && !menuHistoryActive) {
                    history.pushState({ ...(history.state || {}), divertyMenu: true }, '', window.location.href);
                    menuHistoryActive = true;
                }
            } else {
                o.classList.remove('menu-overlay-open');
                o.style.opacity = '0';
                o.style.visibility = 'hidden';
                o.style.pointerEvents = 'none';
                m.classList.remove('open');
                if(hw) hw.classList.remove('menu-open');
                if(mt){
                    mt.setAttribute('aria-label', 'Abrir menú');
                    mt.setAttribute('aria-expanded', 'false');
                    mt.innerHTML = '<i data-lucide="menu" class="w-6 h-6 text-gray-800"></i>';
                }
                if (navigating && menuHistoryActive) {
                    menuHistoryActive = false;
                    const state={...(history.state||{})};delete state.divertyMenu;
                    history.replaceState(state,'',window.location.href);
                } else if (!fromPopstate && menuHistoryActive && history.state?.divertyMenu) {
                    menuHistoryActive = false;
                    suppressNextMenuPopstate = true;
                    history.back();
                } else if (fromPopstate) {
                    menuHistoryActive = false;
                }
            }

            if(typeof lucide !== 'undefined' && mt) lucide.createIcons({root: mt});
            document.body.classList.toggle('menu-drawer-open', shouldOpen);
        }

        function finishThemeBoot() {
            window.__divertyFinishBoot?.();
        }

        function applyThemeColors(themeData) {
            if (!themeData) return;
            const style = document.getElementById('theme-dynamic-styles') || document.createElement('style'); 
            style.id = 'theme-dynamic-styles';
            
            const decorType = cleanStr(themeData.tipo || themeData.nombre || themeData.id).toLowerCase();
            
            const palettes = {
                default: { 
                    p: '#7C3AED', s: '#E11D48', a: '#F59E0B', 
                    bg: '#F8FAFC', overlay: 'rgba(248,250,252,0.85)',
                    glass: 'rgba(255,255,255,0.7)', border: 'rgba(0,0,0,0.1)',
                    tTitle: '#0F172A', tMuted: '#475569',
                    img: 'none', theme: 'default'
                },
                halloween: { 
                    p: '#F97316', s: '#7E22CE', a: '#FACC15', 
                    bg: '#07050B', overlay: 'rgba(7,5,11,0.78)',
                    glass: 'rgba(17,10,27,0.84)', border: 'rgba(249,115,22,0.16)',
                    tTitle: '#FFF7ED', tMuted: '#D6D3D1',
                    img: "url('https://images.unsplash.com/photo-1509557965875-b88c97052f0e?auto=format&fit=crop&q=80&w=1920')", 
                    theme: 'halloween' 
                },
                christmas: { 
                    p: '#2563EB', s: '#94A3B8', a: '#E2E8F0', 
                    bg: '#061426', overlay: 'rgba(4,15,32,0.78)',
                    glass: 'rgba(9,30,58,0.86)', border: 'rgba(226,232,240,0.24)',
                    tTitle: '#F8FAFC', tMuted: '#CBD5E1',
                    img: "url('https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&q=80&w=1920')", 
                    theme: 'christmas' 
                },
                summer: { 
                    p: '#0284c7', s: '#ea580c', a: '#e11d48', 
                    bg: '#f0f9ff', overlay: 'rgba(240,249,255,0.6)',
                    glass: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.5)',
                    tTitle: '#082f49', tMuted: '#475569',
                    img: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1920')", 
                    theme: 'summer' 
                },
                school: { 
                    p: '#2563eb', s: '#ea580c', a: '#eab308', 
                    bg: '#f8fafc', overlay: 'rgba(248,250,252,0.85)',
                    glass: 'rgba(255,255,255,0.8)', border: 'rgba(0,0,0,0.05)',
                    tTitle: '#1e3a8a', tMuted: '#475569',
                    img: "url('https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=1920')", 
                    theme: 'school' 
                }
            };

            let current = palettes.default;
            if (decorType.includes('escolar') || decorType.includes('escuela') || decorType.includes('school')) current = palettes.school;
            else if (decorType.includes('halloween') || decorType.includes('miedo')) current = palettes.halloween;
            else if (decorType.includes('navidad') || decorType.includes('christmas') || decorType.includes('santa')) current = palettes.christmas;
            else if (decorType.includes('verano') || decorType.includes('summer')) current = palettes.summer;

            const resolved=resolveTheme(themeData);
            current.p=resolved.colorPrimary;current.s=resolved.colorSecondary;
            if(resolved.modern) {
                current.bg=resolved.colorBg;current.tTitle=resolved.colorText;current.glass=resolved.colorCard;current.tMuted=resolved.colorText;
            } else if(current.theme!=='christmas') {
                if(themeData.colorBg)current.bg=resolved.colorBg;
                if(themeData.colorText)current.tTitle=resolved.colorText;
                if(themeData.colorCard)current.glass=resolved.colorCard;
            }
            document.body.setAttribute('data-theme',current.theme);
            document.documentElement.setAttribute('data-cached-theme',current.theme);
            if(!isThemePreview)try{localStorage.setItem('diverty_active_theme',current.theme);}catch(_){}
            const customGrad=resolved.modern?resolved.buttonBackground:current.theme==='christmas'?'linear-gradient(135deg, #2563EB, #94A3B8)':resolved.gradient&&themeData.gradient?resolved.gradient:`linear-gradient(135deg, ${current.p}, ${current.s})`;
            let css = `
            :root {
                --s-primary: ${current.p};
                --s-secondary: ${current.s};
                --s-accent: ${current.a};
                --s-bg-color: ${current.bg};
                --s-bg-img: ${current.img};
                --s-overlay: ${current.overlay};
                --s-glass-bg: ${current.glass};
                --s-glass-border: ${current.border};
                --s-text-title: ${current.tTitle};
                --s-text-muted: ${current.tMuted};
                --s-btn-grad: ${customGrad};
                --s-button-text: ${resolved.buttonText};
            }
            `;

            css+=themeControlsCss(resolved);
            style.textContent=css;
            document.head.appendChild(style);
            if(!isThemePreview)try{localStorage.setItem('diverty_theme_snapshot',JSON.stringify({theme:current.theme,css}));}catch(_){}
            const logoStr = cleanStr(themeData.logoUrl || themeData.imagenLogo || themeData.logo);
            if (logoStr) { const headLogo = document.getElementById('mainHeaderLogo'); if(headLogo) headLogo.src = logoStr; const bootLogo = document.getElementById('themeBootLogo'); if(bootLogo) bootLogo.src = logoStr; }

            // Aplicar decoraciones dinámicas e iconos
            updateThemeAssets(current.theme);

            let decorLayer = document.getElementById('decor-layer');
            if (!decorLayer) {
                decorLayer = document.createElement('div');
                decorLayer.id = 'decor-layer';
                decorLayer.className = 'decor-layer';
                document.body.prepend(decorLayer);
            }
            decorLayer.innerHTML = '';

            const symbols={leaves:['🍂','🍁'],snow:['❄️'],bats:['🦇'],bubbles:['🫧'],confetti:['🎉','✨','🎊']};
            const icons=resolved.key==='school'&&resolved.decorations==='auto'?['📚','✏️','🎒','📏','✨']:symbols[resolved.effect]||[];
            if(resolved.effect==='bats'&&resolved.decorations==='auto')decorLayer.innerHTML='<div class="spider-web spider-web-left"></div><div class="spider-web spider-web-right"></div>';
            for(let i=0;i<(icons.length?(resolved.effect==='snow'?25:12):0);i++) {
                const node=document.createElement('div');node.className='falling-decor';
                node.style.cssText=`left:${Math.random()*100}%;animation-duration:${5+Math.random()*10}s;animation-delay:-${Math.random()*5}s;font-size:${.5+Math.random()}rem;color:var(--s-text-title)`;
                node.textContent=icons[i%icons.length];decorLayer.appendChild(node);
            }
            // Forzar recarga de UI para aplicar los nuevos iconos en los botones
            if (window.catalogLoaded) {
                updateNavigationState();
                if (app.cart.length > 0) updateCartUI();
            }
        }

        if(isThemePreview) {
            document.addEventListener('click',e=>{if(e.target.closest('a,button,input,select,textarea')){e.preventDefault();e.stopImmediatePropagation();}},true);
            document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
            window.addEventListener('message',e=>{
                if(e.source!==window.parent||e.data?.type!=='diverty:theme-preview'||!e.data.theme||typeof e.data.theme!=='object')return;
                previewTheme={...e.data.theme,themeVersion:2};applyThemeColors(previewTheme);
            });
            window.parent.postMessage({type:'diverty:theme-preview-ready'},'*');
        }

        const VALID_CATALOG_ICONS = new Set(['party-popper','smile','sparkles','bubbles','mic-2','wand-sparkles','palette','gamepad-2','ghost','cake-slice','music','camera','image','tent','balloon','baby','crown','star','heart','gift','users','calendar-days','sun','school','graduation-cap','drama','folder']);
        function getCatalogIcon(cat) {
            const saved = String(cat?.icono || '').trim();
            if (saved && VALID_CATALOG_ICONS.has(saved)) return saved;
            const n = String(cat?.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (/halloween|terror|bruja|fantasma/.test(n)) return 'ghost';
            if (/burbuja/.test(n)) return 'bubbles';
            if (/payas|clown/.test(n)) return 'smile';
            if (/animador|animacion|microfono/.test(n)) return 'mic-2';
            if (/magia|mago|magic/.test(n)) return 'wand-sparkles';
            if (/pinta|arte|pintura/.test(n)) return 'palette';
            if (/juego|game/.test(n)) return 'gamepad-2';
            if (/foto|fotograf|galeria/.test(n)) return 'camera';
            if (/musica|dj/.test(n)) return 'music';
            if (/escuela|escolar|colegio|graduacion/.test(n)) return 'school';
            if (/cumple|pastel|cake/.test(n)) return 'cake-slice';
            if (/bebe|baby/.test(n)) return 'baby';
            if (/regalo/.test(n)) return 'gift';
            if (/show|servicio|infantil|fiesta|evento/.test(n)) return 'party-popper';
            return 'sparkles';
        }

        function getLocalDateISO() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function isCategoryCurrentlyVisible(cat) {
            if (!cat) return false;
            if (cat.activo === false || cat.visible === false) return false;
            const mode = String(cat.visibilidad || 'activo').toLowerCase();
            if (mode === 'oculto') return false;
            if (mode === 'temporada') {
                const today = getLocalDateISO();
                const start = cleanStr(cat.fechaInicio || cat.inicioTemporada || '');
                const end = cleanStr(cat.fechaFin || cat.finTemporada || '');
                if (!start || !end) return false;
                if (today < start || today > end) return false;
            }
            return true;
        }

        function buildDynamicNav() {
            const dNav = document.getElementById('desktopNav');
            if (dNav) {
                let dHtml = `<button id="navHome" data-target-section="home" class="nav-link nav-action"><i data-lucide="sun" class="w-4 h-4 mr-2 season-text-primary"></i>Inicio</button>`;
                dynamicCategories.forEach(c => {
                    if (isCategoryCurrentlyVisible(c)) dHtml += `<button id="navCat_${c.id}" data-target-section="cat_${c.id}" class="nav-link nav-action"><i data-lucide="${getCatalogIcon(c)}" class="w-4 h-4 mr-2 season-text-primary"></i>${c.nombre}</button>`;
                });
                dHtml += `<button id="navGallery" data-target-section="gallery" class="nav-link nav-action"><i data-lucide="image" class="w-4 h-4 mr-2 text-emerald-500"></i>Galería</button>
                          <button id="navBooking" data-target-section="booking" class="season-btn nav-action text-white shadow-md ml-2 py-2 px-4 rounded-full flex items-center font-bold text-sm"><i data-lucide="calendar-check" class="w-4 h-4 mr-1.5"></i>Reservar</button>`;
                dNav.innerHTML = dHtml;
            }

            const mNav = document.getElementById('mobileNavLinks');
            if (mNav) {
                let mHtml = `
                <button id="mobileHome" data-target-section="home" class="w-full mobile-nav-link nav-action group">
                    <div class="mobile-nav-icon-box mr-3"><i data-lucide="sun" class="w-4 h-4 text-[var(--s-text-muted)] group-hover:text-[var(--s-primary)] transition-colors"></i></div>
                    <span class="flex-1 text-left tracking-wide text-[14px]">Inicio</span>
                    <i data-lucide="chevron-right" class="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-[var(--s-primary)] transition-colors"></i>
                </button>
                <button id="mobilePortal" data-target-section="portal" class="w-full mobile-nav-link nav-action group">
                    <div class="mobile-nav-icon-box mr-3"><i data-lucide="search" class="w-4 h-4 text-[var(--s-text-muted)] group-hover:text-[var(--s-primary)] transition-colors"></i></div>
                    <span class="flex-1 text-left tracking-wide text-[14px]">Mi Reserva</span>
                    <i data-lucide="chevron-right" class="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-[var(--s-primary)] transition-colors"></i>
                </button>`;
                dynamicCategories.forEach(c => {
                    if (isCategoryCurrentlyVisible(c)) {
                        mHtml += `
                        <button id="mobileCat_${c.id}" data-target-section="cat_${c.id}" class="w-full mobile-nav-link nav-action group">
                            <div class="mobile-nav-icon-box mr-3"><i data-lucide="${getCatalogIcon(c)}" class="w-4 h-4 text-[var(--s-text-muted)] group-hover:text-[var(--s-primary)] transition-colors"></i></div>
                            <span class="flex-1 text-left tracking-wide text-[14px]">${c.nombre}</span>
                            <i data-lucide="chevron-right" class="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-[var(--s-primary)] transition-colors"></i>
                        </button>`;
                    }
                });
                mHtml += `
                <button id="mobileGallery" data-target-section="gallery" class="w-full mobile-nav-link nav-action group">
                    <div class="mobile-nav-icon-box mr-3"><i data-lucide="image" class="w-4 h-4 text-[var(--s-text-muted)] group-hover:text-[var(--s-primary)] transition-colors"></i></div>
                    <span class="flex-1 text-left tracking-wide text-[14px]">Galería de Eventos</span>
                    <i data-lucide="chevron-right" class="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-[var(--s-primary)] transition-colors"></i>
                </button>`;
                mNav.innerHTML = mHtml;
            }

            const fNav = document.getElementById('footerNavLinks');
            if (fNav) {
                let fHtml = `<a href="#home" data-target-section="home" class="nav-action transition-colors">Inicio</a>`;
                dynamicCategories.forEach(c => {
                    if (isCategoryCurrentlyVisible(c)) fHtml += `<a href="#cat_${c.id}" data-target-section="cat_${c.id}" class="nav-action transition-colors">${c.nombre}</a>`;
                });
                fHtml += `
                    <a href="#gallery" data-target-section="gallery" class="nav-action transition-colors">Galería</a>
                    <a href="#booking" data-target-section="booking" class="nav-action transition-colors">Reservar</a>
                    <a href="#portal" data-target-section="portal" class="nav-action transition-colors">Mi Reserva</a>
                `;
                fNav.innerHTML = fHtml;
            }
            if(typeof lucide !== 'undefined') lucide.createIcons();
            updateNavigationState();
        }

        // --- ENLACES DIRECTOS PREMIUM: paquetes y categorías ---
        function getDirectRoute() {
            const params = new URLSearchParams(window.location.search);
            return {
                planId: (params.get('plan') || '').trim(),
                categoryId: (params.get('categoria') || '').trim(),
                view: (params.get('vista') || '').trim()
            };
        }

        function setDirectRoute(kind = '', id = '', mode = 'push') {
            try {
                const url = new URL(window.location.href);
                url.searchParams.delete('plan');
                url.searchParams.delete('categoria');
                url.searchParams.delete('vista');
                if (kind === 'plan' && id) url.searchParams.set('plan', id);
                if (kind === 'categoria' && id) url.searchParams.set('categoria', id);
                if (kind === 'section' && id && id !== 'home') url.searchParams.set('vista', id);
                const next = url.pathname + (url.search || '') + (url.hash || '');
                const state = { divertyRoute: true, kind, id: id || 'home' };
                if (mode === 'replace') history.replaceState(state, '', next);
                else history.pushState(state, '', next);
            } catch (e) {}
        }

        function openDirectRouteFromUrl({ invalidFallback = true } = {}) {
            if (!isFirebaseLoaded) return false;
            const { planId, categoryId, view } = getDirectRoute();

            if (planId) {
                const item = app.catalog.find(i => i.id === planId);
                if (item) {
                    app.activeSection = `cat_${item.categoria}`;
                    renderItemDetail(planId, false);
                    window.scrollTo(0, 0);
                    return true;
                }
                if (invalidFallback) {
                    setDirectRoute('', '', 'replace');
                    renderHome();
                    setTimeout(() => showToast('Este plan no está disponible en este momento.', 'info'), 120);
                    return true;
                }
            }

            if (categoryId) {
                const cat = dynamicCategories.find(c => c.id === categoryId && isCategoryCurrentlyVisible(c));
                if (cat) {
                    app.activeSection = `cat_${categoryId}`;
                    renderCategory(categoryId);
                    catalogNavMemory.restore(categoryId);
                    return true;
                }
                if (invalidFallback) {
                    setDirectRoute('section', 'catalog', 'replace');
                    app.activeSection = 'catalog';
                    renderAllCatalog();
                    setTimeout(() => showToast('Este catálogo no está disponible en este momento.', 'info'), 120);
                    return true;
                }
            }

            if (['catalog','gallery','booking','portal'].includes(view)) {
                setActiveSection(view);
                if (view === 'catalog') catalogNavMemory.restore('catalog');
                return true;
            }
            return false;
        }

        function updateNavigationState() {
            const sectionId=app.activeSection;
            document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => link.classList.remove('active'));
            
            const desktopLink = document.querySelector(`[data-target-section="${sectionId}"].nav-link`);
            if (desktopLink) desktopLink.classList.add('active');
            
            const mobileLink = document.querySelector(`[data-target-section="${sectionId}"].mobile-nav-link`);
            if (mobileLink) mobileLink.classList.add('active');
            
        }

        function setActiveSection(sectionId) {
            if (!sectionId) sectionId = 'home';
            if(app.activeSection==='booking' && sectionId!=='booking'){
                const form=document.getElementById('bookingForm');
                if(form) bookingFormState={...bookingFormState,...Object.fromEntries(new FormData(form).entries())};
            }
            bookingDatePickerCleanup?.(); bookingDatePickerCleanup = null;
            if (sectionId === 'booking' && !readBrowserStorage('sessionStorage', 'bookingNoticeShown')) { writeBrowserStorage('sessionStorage', 'bookingNoticeShown', 'true'); }

            app.activeSection = sectionId;
            updateNavigationState();

            if (sectionId === 'home') renderHome();
            else if (sectionId === 'catalog') renderAllCatalog();
            else if (sectionId === 'gallery') renderGallery();
            else if (sectionId === 'booking') {
                renderBooking();
                Promise.resolve(window.__divertyLazyAvailability?.()).catch(()=>{});
            }
            else if (sectionId === 'portal') renderPortal();
            else if (sectionId.startsWith('cat_')) { const catId = sectionId.replace('cat_', ''); renderCategory(catId); }
            window.scrollTo(0, 0);
        }

        function createInput(label, name, type, extra='') { return `<div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase tracking-wider mb-1.5 block">${label} *</label><input type="${type}" name="${name}" required class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm outline-none focus:border-[var(--s-primary)] transition-colors shadow-inner" ${extra}></div>`; }
        function createWizardStep(step, icon, text, opacity) { return `<div class="wizard-step flex flex-col items-center relative z-10 ${opacity}"><div class="w-10 h-10 rounded-full ${opacity ? 'bg-black/5 season-text-muted border border-black/10' : 'season-btn text-white'} flex items-center justify-center font-bold shadow-sm"><i data-lucide="${icon}" class="w-5 h-5"></i></div><span class="text-xs font-bold ${opacity ? 'season-text-muted' : 'season-text-primary'} mt-2">${text}</span></div>`; }
        
        const escapePortalText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        function getPortalMessage(title, description = '', icon = 'calendar-heart', tone = '') {
            return `<div class="portal-message ${tone}"><span class="portal-message-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span><h3>${escapePortalText(title)}</h3>${description ? `<p>${escapePortalText(description)}</p>` : ''}</div>`;
        }
        function getPortalResultCard(input) {
            const ev = {...input};
            for (const key of ['cliente','estado','servicio','fecha','hora']) ev[key] = escapePortalText(ev[key]);
            const money = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
            const total = money(input.total), deposit = money(input.abono), balance = Math.max(0, total - deposit);
            const status = String(input.estado || '').toLowerCase();
            const tone = status === 'confirmado' ? 'confirmed' : status === 'completado' ? 'completed' : /cancelad/.test(status) ? 'cancelled' : 'pending';
            return `<article class="portal-reservation" aria-label="Reserva de ${ev.cliente}">
                <div class="portal-reservation-head"><span class="portal-eyebrow">TU RESERVA</span><span class="portal-status portal-status-${tone}"><span aria-hidden="true"></span>${ev.estado || 'Pendiente'}</span></div>
                <h3 class="portal-customer">${ev.cliente}</h3>
                <div class="portal-event-details">
                    <div><i data-lucide="calendar-days" aria-hidden="true"></i><div><span>Fecha del evento</span><strong>${ev.fecha ? String(ev.fecha).split('-').reverse().join('/') : 'Por definir'}</strong></div></div>
                    <div><i data-lucide="clock-3" aria-hidden="true"></i><div><span>Hora</span><strong>${ev.hora || 'Por definir'}</strong></div></div>
                </div>
                <div class="portal-service"><span class="portal-service-icon" aria-hidden="true"><i data-lucide="gift"></i></span><div><span class="portal-eyebrow">PAQUETE / SERVICIO</span><p>${ev.servicio || 'Servicio no especificado'}</p></div></div>
                <section class="portal-payments" aria-label="Resumen de pago">
                    <h4>Resumen de pago</h4>
                    <dl><div><dt>Costo Total</dt><dd>$${total.toFixed(2)}</dd></div><div class="portal-deposit"><dt>Abono Realizado</dt><dd>$${deposit.toFixed(2)}</dd></div><div class="portal-balance"><dt>Saldo Pendiente</dt><dd>$${balance.toFixed(2)}</dd></div></dl>
                    ${balance === 0 ? '<p class="portal-paid"><i data-lucide="circle-check" aria-hidden="true"></i> Totalmente Pagado</p>' : ''}
                </section>
            </article>`;
        }

        function getCampaignsHTML() {
            if(!app.campaigns || app.campaigns.length === 0) return '';
            
            const destacada = app.campaigns.find(c => c.destacada === true);
            const regulares = app.campaigns.filter(c => c !== destacada);
            
            let html = '<div class="container mx-auto px-4 w-full mb-10 flex flex-col gap-8 animate-slide-up">';
            
            const renderIncluye = (incluyeData) => {
                let arr = [];
                if (Array.isArray(incluyeData)) arr = incluyeData;
                else if (typeof incluyeData === 'string') arr = incluyeData.split('\n');
                arr = arr.filter(i => cleanStr(i) !== '');
                if (arr.length === 0) return '';
                return `<div class="mb-3 relative z-20 w-full flex-grow"><ul class="space-y-1.5 w-full bg-[color-mix(in_srgb,var(--s-text-title)_3%,transparent)] border border-[color-mix(in_srgb,var(--s-text-title)_5%,transparent)] rounded-xl p-3 shadow-inner">` + 
                       arr.map(inc => `<li class="flex items-start text-[11px] sm:text-xs season-text-muted font-bold leading-snug group/item transition-colors hover:text-[var(--s-text-title)]"><div class="mt-0.5 mr-2.5 shrink-0 p-0.5 rounded-full shadow-sm text-[var(--s-bg-color)] border border-white/20" style="background: var(--s-btn-grad);"><i data-lucide="check" class="w-2 h-2 stroke-[3]"></i></div><span class="flex-1 mt-px">${cleanStr(inc)}</span></li>`).join('') + 
                       `</ul></div>`;
            };

            const renderCamp = (camp, isDestacada) => {
                const titulo = cleanStr(camp.titulo);
                const sub = cleanStr(camp.subtitulo);
                const desc = cleanStr(camp.descripcion);
                const img = cleanStr(camp.imagen);
                const campaignImage = imageAttributes(img, isDestacada ? '(max-width:767px) calc(100vw - 64px), (max-width:1279px) 45vw, 520px' : '(max-width:767px) calc(100vw - 64px), 350px', {ratio:0,widths:[320,480,720,1080]});
                const pPromo = cleanStr(camp.precio);
                const pAnt = cleanStr(camp.precioOriginal);
                const tId = cleanStr(camp.id);
                const incluyeHtml = renderIncluye(camp.incluye);
                let btnTxt = cleanStr(camp.botonTexto) || 'AÑADIR AL CARRITO';
                
                let actionBtn = 'add-to-cart';
                let itemDataId = tId;
                let extraAttrs = `data-is-campaign="true" data-cart-state="none"`;
                let targetSec = 'booking';
                
                if (!pPromo && !pAnt && !camp.precio) {
                    actionBtn = 'navigate-from-modal';
                    extraAttrs = 'data-cart-state="none"';
                    const accionStr = cleanStr(camp.accion).toLowerCase();
                    if (accionStr.startsWith('cat_')) targetSec = accionStr;
                }

                const ic = app.cart.find(i=>i.id===itemDataId);

                if (isDestacada) {
                    return `
                    <div class="card-safe-wrapper campaign-featured-card-wrap mt-6 mb-2 w-full">
                        <div class="campaign-featured-badge absolute top-0 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-rose-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest px-6 py-1.5 rounded-full z-[40] shadow-md flex items-center gap-1.5 whitespace-nowrap"><i data-lucide="tag" class="w-3 h-3 fill-white"></i> GRAN PROMOCIÓN</div>
                        
                        <div class="glass-panel card-alive flex flex-col md:flex-row h-full rounded-[1.5rem] w-full">
                            ${img ? `<div class="campaign-featured-image w-full md:w-5/12 h-40 md:h-auto relative shrink-0 pt-5 px-4 md:p-5"><img ${campaignImage} loading="lazy" decoding="async" class="w-full h-full object-cover rounded-[1rem] shadow-sm border" style="border-color: var(--s-glass-border);"></div>` : ''}
                            <div class="campaign-featured-content p-4 sm:p-5 flex flex-col justify-center flex-1 relative z-10 w-full">
                                ${sub ? `<div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest w-max mb-3" style="background: color-mix(in srgb, var(--s-primary) 20%, transparent); color: var(--s-primary);"><i data-lucide="star" class="w-3 h-3"></i> ${sub}</div>` : ''}
                                <h2 class="campaign-main-title text-xl sm:text-2xl lg:text-3xl font-black mb-2 font-nunito leading-tight season-text-title tracking-tight">${titulo}</h2>
                                ${desc ? `<p class="season-text-muted text-[11px] sm:text-xs font-semibold mb-3 leading-snug">${desc}</p>` : ''}
                                ${incluyeHtml}
                                ${(pPromo || pAnt) ? `
                                <div class="flex items-center justify-between mt-auto mb-4 w-full relative z-10 pt-4 border-t border-[var(--s-glass-border)]">
                                    ${pPromo && Number(pAnt) > Number(pPromo) ? `<span class="bg-pink-500/10 text-pink-500 text-[9px] font-black px-2.5 py-1 rounded-lg border border-pink-500/20 shadow-sm flex items-center gap-1"><i data-lucide="percent" class="w-2.5 h-2.5"></i> AHORRO</span>` : '<span class="text-[9px] font-black uppercase tracking-widest season-text-muted mb-1 opacity-70">Inversión</span>'}
                                    <div class="flex items-end gap-2">
                                        ${pAnt && Number(pAnt) > Number(pPromo) ? `<span class="season-text-muted opacity-60 line-through text-xs font-bold leading-none mb-1">$${Number(pAnt).toFixed(2)}</span>` : ''}
                                        ${pPromo ? `<span class="text-2xl sm:text-3xl lg:text-4xl font-black season-gradient-text leading-none tracking-tight drop-shadow-sm">$${Number(pPromo).toFixed(2)}</span>` : ''}
                                    </div>
                                </div>` : '<div class="mb-4 mt-auto pt-4"></div>'}
                                
                                <div class="mt-auto pt-1 pb-1 direct-booking-actions">
                                    <button data-action="${actionBtn}" data-item-id="${itemDataId}" data-target-section="${targetSec}" ${extraAttrs} data-cart-state="${ic?'selected':'none'}" class="w-full sm:flex-1 font-black py-3 px-5 rounded-[1rem] text-[10px] sm:text-[11px] tracking-widest uppercase text-white transition-transform duration-150 active:scale-95 relative overflow-hidden flex items-center justify-center gap-2 z-10 shadow-sm" style="background: ${ic ? '#10B981' : 'var(--s-btn-grad)'};">
                                        ${ic ? S_ICONS.check + ' SELECCIONADO' : (actionBtn==='add-to-cart' ? S_ICONS.bag : S_ICONS.sparkles) + ' ' + btnTxt}
                                    </button>
                                    ${actionBtn==='add-to-cart' ? `<button data-action="book-now" data-item-id="${itemDataId}" data-is-campaign="true" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>`;
                } else {
                    return `
                    <div class="card-safe-wrapper mt-4">
                        <div class="absolute top-0 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-rose-600 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full z-[40] shadow-sm flex items-center gap-1 whitespace-nowrap"><i data-lucide="tag" class="w-2.5 h-2.5 fill-white"></i> Promo</div>
                        <div class="glass-panel card-alive p-3 sm:p-4 flex flex-col h-full group w-full">
                            <div class="relative z-10 flex flex-col h-full pt-3">
                                ${img ? `<div class="w-full h-32 sm:h-40 rounded-xl overflow-hidden mb-3 shrink-0 shadow-sm border border-[var(--s-glass-border)]"><img ${campaignImage} loading="lazy" decoding="async" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"></div>` : ''}
                                ${sub ? `<span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest season-text-primary mb-1 block">${sub}</span>` : ''}
                                <h3 class="text-lg sm:text-xl font-black season-text-title mb-1.5 font-nunito leading-tight">${titulo}</h3>
                                ${desc ? `<p class="season-text-muted text-[11px] sm:text-xs font-semibold mb-3 leading-snug line-clamp-2">${desc}</p>` : ''}
                                ${incluyeHtml}
                                ${(pPromo || pAnt) ? `
                                <div class="flex items-center justify-between mt-auto mb-4 w-full relative z-10 pt-3 border-t border-[var(--s-glass-border)]">
                                    ${pPromo && Number(pAnt) > Number(pPromo) ? `<span class="bg-pink-500/10 text-pink-500 text-[9px] font-black px-2 py-1 rounded-lg border border-pink-500/20 shadow-sm flex items-center gap-1"><i data-lucide="percent" class="w-2.5 h-2.5"></i> AHORRO</span>` : '<span class="text-[9px] font-black uppercase tracking-widest season-text-muted mb-1 opacity-70">Inversión</span>'}
                                    <div class="flex items-end gap-1.5">
                                        ${pAnt && Number(pAnt) > Number(pPromo) ? `<span class="season-text-muted opacity-60 line-through text-xs font-bold leading-none mb-1">$${Number(pAnt).toFixed(2)}</span>` : ''}
                                        ${pPromo ? `<span class="text-2xl sm:text-3xl font-black season-gradient-text leading-none tracking-tight drop-shadow-sm">$${Number(pPromo).toFixed(2)}</span>` : ''}
                                    </div>
                                </div>` : '<div class="mb-4 mt-auto pt-4"></div>'}
                                
                                <div class="mt-auto pt-1 pb-1 direct-booking-actions">
                                    <button data-action="${actionBtn}" data-item-id="${itemDataId}" data-target-section="${targetSec}" ${extraAttrs} data-cart-state="${ic?'selected':'none'}" class="w-full font-black py-3 px-5 rounded-[1rem] text-[10px] sm:text-[11px] tracking-widest uppercase text-white transition-transform duration-150 active:scale-95 relative overflow-hidden flex items-center justify-center gap-2 z-10 shadow-sm" style="background: ${ic ? '#10B981' : 'var(--s-btn-grad)'};">
                                        ${ic ? S_ICONS.check + ' SELECCIONADO' : (actionBtn==='add-to-cart' ? S_ICONS.bag : S_ICONS.sparkles) + ' ' + btnTxt}
                                    </button>
                                    ${actionBtn==='add-to-cart' ? `<button data-action="book-now" data-item-id="${itemDataId}" data-is-campaign="true" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>`;
                }
            };

            if (destacada) html += renderCamp(destacada, true);
            if (regulares.length > 0) {
                if (regulares.length > 1) html += `<div class="flex md:hidden justify-center mb-1 opacity-80 w-full"><span class="text-[10px] season-text-muted font-bold uppercase tracking-widest border border-[var(--s-glass-border)] bg-black/5 px-3 py-1 rounded-full shadow-sm">Desliza 👉</span></div>`;
                html += `<div class="home-swipe-track home-campaign-track">`;
                regulares.forEach(camp => { html += renderCamp(camp, false); });
                html += `</div>`;
            }
            
            html += '</div>';
            return html;
        }

        function getItemQuantityRule(item) {
            const raw = item?._raw || {};
            const mode = cleanStr(item?.tipoCobro || raw.tipoCobro || (item?.isHourly ? 'hora' : 'paquete')).toLowerCase();
            const { min, max, step } = catalogQuantityLimits({...raw,
                cantidadMinima:item?.cantidadMinima ?? raw.cantidadMinima,
                cantidadMaxima:item?.cantidadMaxima ?? raw.cantidadMaxima,
                incrementoCantidad:item?.incrementoCantidad ?? raw.incrementoCantidad,
            });

            if (mode === 'hora' || mode === 'horas') {
                return { enabled:true, mode:'hora', min:Math.max(1,min), max, step, singular:'hora', plural:'horas' };
            }
            if (mode === 'nino' || mode === 'niño' || mode === 'ninos' || mode === 'niños') {
                return { enabled:true, mode:'nino', min:Math.max(1,min), max, step, singular:'niño', plural:'niños' };
            }
            if (['unidad','unidades','cantidad','por unidad'].includes(mode)) {
                const unitLabel = cleanStr(item?.unidadEtiqueta || raw.unidadEtiqueta || raw.unidad || 'unidad');
                return { enabled:true, mode:'unidad', min:Math.max(1,min), max, step, singular:unitLabel, plural:unitLabel.endsWith('s') ? unitLabel : `${unitLabel}s` };
            }
            return { enabled:false, mode:'paquete', min:1, max:1, step:1, singular:'servicio', plural:'servicios' };
        }

        function clampItemQuantity(item, value) {
            const rule = getItemQuantityRule(item);
            if (!rule.enabled) return 1;
            return clampCatalogQuantity(rule, value);
        }

        function escapeCatalogText(value) {
            return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        }
        function readItemQuantity(id, fallback=1) {
            const input = document.getElementById(`qty-${id}`);
            return Number(input && 'value' in input ? input.value : input?.textContent ?? fallback);
        }
        function setItemQuantityDisplay(item, value) {
            const rule = getItemQuantityRule(item), q = clampItemQuantity(item, value);
            document.querySelectorAll(`[id="qty-${item.id}"]`).forEach(el => { if ('value' in el) el.value=q; else el.textContent=q; });
            document.querySelectorAll(`[id="qty-label-${item.id}"]`).forEach(el=>el.textContent=q===1?rule.singular:rule.plural);
            document.querySelectorAll(`[data-quantity-total="${item.id}"]`).forEach(el=>el.textContent=`${q} × $${Number(item.price).toFixed(2)} = $${(q*Number(item.price)).toFixed(2)}`);
            updateProductButtonState(item.id);
            return q;
        }
        function quantityControlHTML(item, q) {
            const rule=getItemQuantityRule(item), name=escapeCatalogText(item.name), id=escapeCatalogText(item.id);
            return `<div class="service-quantity-control"><div class="service-quantity-row"><button type="button" data-action="change-service-qty" data-item-id="${id}" data-change="-1" aria-label="Disminuir ${name}">−</button><label><input type="number" inputmode="numeric" id="qty-${id}" data-service-quantity="${id}" aria-label="Cantidad de ${name}" min="${rule.min}" ${rule.max?`max="${rule.max}"`:''} step="${rule.step}" value="${q}"><small id="qty-label-${id}">${escapeCatalogText(q===1?rule.singular:rule.plural)}</small></label><button type="button" data-action="change-service-qty" data-item-id="${id}" data-change="1" aria-label="Aumentar ${name}">+</button></div><p class="service-quantity-hint">Mínimo ${rule.min}${rule.max?` · Máximo ${rule.max}`:''}</p><strong class="service-quantity-total" data-quantity-total="${id}">${q} × $${Number(item.price).toFixed(2)} = $${(q*Number(item.price)).toFixed(2)}</strong></div>`;
        }
        function createCharacterTileHTML(item,index=0) {
            const selected=app.cart.some(row=>row.id===item.id), name=escapeCatalogText(item.name), id=escapeCatalogText(item.id);
            return `<article class="catalog-character-card"><button type="button" class="catalog-character-photo" data-action="open-item-detail" data-item-id="${id}" aria-label="Ver ${name}"><img ${imageAttributes(item.cardImage||item.image,catalogSizes,{ratio:1})} alt="${name}" width="480" height="480" loading="${index<2?'eager':'lazy'}" fetchpriority="${index<2?'high':'low'}" decoding="async"></button><div class="catalog-character-body">${item.tematica?`<p class="catalog-character-theme">${escapeCatalogText(item.tematica)}</p>`:''}<h3>${name}</h3><strong class="catalog-character-price">$${Number(item.price).toFixed(2)}</strong><div class="catalog-character-actions"><button type="button" class="season-btn" data-action="add-to-cart" data-item-id="${id}" data-cart-state="${selected?'selected':'none'}">${selected?'Seleccionado':'Añadir al carrito'}</button><button type="button" class="direct-booking-btn" data-action="book-now" data-item-id="${id}">Reservar ahora</button></div></div></article>`;
        }

        function quantityLabelForCart(item) {
            const rule = getItemQuantityRule(item);
            if (!rule.enabled) return '1 servicio';
            const q = clampItemQuantity(item, item?.quantity);
            return `${q} ${q === 1 ? rule.singular : rule.plural}`;
        }

        function createDetailedCardHTML(item) {
            const isPkg = !item.isHourly; 
            
            let btn='w-full font-extrabold rounded-[1.25rem] flex justify-center items-center gap-2.5 tracking-wide uppercase relative z-10 transition-transform duration-150 active:scale-95';
            let pc='season-gradient-text drop-shadow-sm';
            
            let b='';
            if(item.id==='clown_magic'){ b=`<div class="absolute top-4 left-4 text-white bg-[var(--s-primary)] text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full z-20 shadow-lg border border-white/20 flex items-center gap-1.5 backdrop-blur-md"><i data-lucide="star" class="w-3 h-3 fill-white"></i> Popular</div>`; }
            else if(item.id==='clown_diverty'){ b=`<div class="absolute top-4 left-4 bg-emerald-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full z-20 shadow-lg border border-emerald-400/50 flex items-center gap-1.5 backdrop-blur-md"><i data-lucide="thumbs-up" class="w-3 h-3 fill-white"></i> Recomendado</div>`; }
            else if(item.discountApplied||item.oferta){ b=`<div class="absolute top-4 left-4 bg-gradient-to-r from-pink-500 to-rose-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full z-20 shadow-lg border border-pink-400/50 flex items-center gap-1.5 backdrop-blur-md"><i data-lucide="tag" class="w-3 h-3 fill-white"></i> Oferta</div>`; }
            
            let imgBlock = `<div class="relative w-full h-40 sm:h-48 shrink-0 rounded-[1.25rem] overflow-hidden shadow-sm mb-4 group-hover:shadow-xl transition-all duration-500 border border-[var(--s-glass-border)]">
                ${b}
                <img src="${optimizeCloudinaryImage(item.image, 720)}" loading="lazy" decoding="async" fetchpriority="low" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-[#0F172A]/40 to-transparent opacity-90"></div>
                <div class="absolute bottom-0 left-0 right-0 p-5 pt-10 text-white">
                    <h3 class="text-2xl sm:text-3xl font-black leading-tight drop-shadow-lg tracking-tight font-poppins text-white">${cleanStr(item.name||item.title)}</h3>
                    ${cleanStr(item.description||'') ? `<p class="text-white/80 text-[11px] sm:text-xs font-extrabold mt-1.5 leading-snug drop-shadow line-clamp-2 uppercase tracking-wider">${cleanStr(item.description||'')}</p>` : ''}
                </div>
            </div>`;
            
            let pd='', px=Number(item.price);
            if(px||px===0){
                if(item.discountApplied||item.oferta) pd=`<div class="flex items-center justify-between mt-auto mb-4 w-full relative z-10 pt-4 border-t border-[var(--s-glass-border)]"><span class="bg-pink-500/10 text-pink-500 text-[10px] font-black px-3 py-1.5 rounded-xl border border-pink-500/20 shadow-sm flex items-center gap-1"><i data-lucide="percent" class="w-3 h-3"></i> AHORRO</span><div class="flex items-end gap-2.5"><span class="season-text-muted opacity-60 line-through text-sm font-bold leading-none mb-1.5">$${Number(item.originalPrice).toFixed(2)}</span><span class="text-3xl font-black ${pc} leading-none tracking-tight drop-shadow-sm">$${px.toFixed(2)}</span></div></div>`;
                else pd=`<div class="flex items-end justify-between mt-auto mb-4 w-full relative z-10 pt-4 border-t border-[var(--s-glass-border)]"><span class="text-[10px] font-black uppercase tracking-widest season-text-muted mb-1 opacity-70">Inversión</span><div class="flex items-end"><span class="text-3xl font-black ${pc} transition-all duration-300 leading-none tracking-tight drop-shadow-sm">$${px.toFixed(2)}</span>${item.isHourly?'<span class="season-text-muted opacity-70 text-[10px] font-bold ml-1 mb-1.5 uppercase tracking-wider">/hr</span>':''}</div></div>`;
            }
            
            let sl='';
            if(item.services&&item.services.length>0){
                const services = item.services.filter(s => cleanStr(s) !== '');
                const benefitItem = (service) => `<li class="flex items-start text-[11px] sm:text-xs season-text-muted font-bold leading-snug"><div class="mt-0.5 mr-2.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm" style="background: var(--s-btn-grad);"><i data-lucide="check" class="w-2.5 h-2.5 stroke-[3]"></i></div><span class="flex-1 pt-0.5">${cleanStr(service)}</span></li>`;

                sl=`<details class="offer-benefits-details featured-offer-benefits mb-3 relative z-20 w-full rounded-[1rem] border border-[var(--s-glass-border)] overflow-hidden">
                    <summary class="list-none cursor-pointer select-none px-3.5 py-3 flex items-center justify-between gap-3 active:opacity-80">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-8 h-8 rounded-xl flex items-center justify-center season-text-primary shrink-0" style="background: color-mix(in srgb, var(--s-primary) 12%, transparent);"><i data-lucide="sparkles" class="w-4 h-4"></i></span>
                            <div class="min-w-0 text-left">
                                <p class="season-text-title text-[12px] sm:text-[13px] font-black leading-tight">Todo lo que incluye</p>
                                <p class="season-text-muted text-[9px] sm:text-[10px] font-bold mt-0.5">${services.length} beneficios para tu celebración</p>
                            </div>
                        </div>
                        <span class="flex items-center gap-1.5 season-text-primary text-[9px] font-black uppercase tracking-wide shrink-0">
                            Ver todo
                            <i data-lucide="chevron-down" class="benefits-chevron w-4 h-4 transition-transform duration-200"></i>
                        </span>
                    </summary>
                    <ul class="featured-offer-benefits-list space-y-2 px-4 pb-4 pt-2 border-t border-[var(--s-glass-border)]">${services.map(benefitItem).join('')}</ul>
                </details>`;
            }

            const ic=app.cart.find(i=>i.id===item.id);
            const quantityRule=getItemQuantityRule(item);
            const iq=ic?clampItemQuantity(item,ic.quantity):quantityRule.min;
            let ab='';
            
            if(quantityRule.enabled){
                const unitLabel = iq === 1 ? quantityRule.singular : quantityRule.plural;
                ab=`<div class="mt-auto w-full relative z-10 pb-2">${quantityControlHTML(item,iq)}<div class="direct-booking-actions"><button data-action="add-hourly-to-cart" data-item-id="${item.id}" data-cart-state="${ic?'refresh':'none'}" class="season-btn ${btn} py-3 text-[11px] sm:text-xs text-white" style="${ic?'background: #F59E0B;':''}">${ic?`${S_ICONS.refresh} Actualizar Cantidad`:`${S_ICONS.cart} Añadir al Carrito`}</button><button data-action="book-now" data-item-id="${item.id}" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button></div></div>`;
            } else {
                ab=`<div class="mt-auto w-full relative z-10 pb-2 direct-booking-actions"><button data-action="add-to-cart" data-item-id="${item.id}" data-cart-state="${ic?'selected':'none'}" class="season-btn ${btn} py-3 text-[11px] sm:text-xs text-white shadow-md" style="${ic?'background: #10B981;':''}">${ic?`${S_ICONS.check} Seleccionado`:`${S_ICONS.cart} Carrito`}</button><button data-action="book-now" data-item-id="${item.id}" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button></div>`;
            }
            
            return `
            <div class="featured-offer-shell w-[92vw] max-w-[620px] md:w-full snap-center flex-shrink-0 h-full snap-container relative pt-4 pb-2 mx-auto">
                <div class="featured-offer-card glass-panel card-alive p-3 sm:p-4 pb-4 flex flex-col h-full group group-hover-playful relative">
                    <div class="relative z-10 flex flex-col h-full">${imgBlock}${sl}${pd}${ab}</div>
                </div>
            </div>`;
        }

        function renderHome() {
            let ex = '';
            if(!isFirebaseLoaded || (app.catalog && app.catalog.length === 0 && !catalogLoaded)){ 
                ex = `<div class="w-full flex flex-col items-center justify-center py-12"><i data-lucide="loader-2" class="w-10 h-10 season-text-primary animate-spin mb-4"></i><p class="text-sm font-bold season-text-muted tracking-widest uppercase">Cargando nuestros paquetes...</p></div>`; 
            } else {
                let eh = '';
                if(app.catalog && app.catalog.length>0){ 
                    const destacados = app.catalog.filter(i => i.destacado === true); 
                    if(destacados.length > 0) {
                        eh += destacados.map(createDetailedCardHTML).join(''); 
                        ex = `${destacados.length > 1 ? `<div class="flex md:hidden justify-center mb-1 opacity-80 animate-slide-up w-full"><span class="text-[10px] season-text-muted font-bold uppercase tracking-widest border border-[var(--s-glass-border)] bg-black/5 px-3 py-1 rounded-full shadow-sm">Desliza 👉</span></div>` : ''}<div class="home-swipe-track home-featured-track pt-10">${eh}</div>`;
                    } else {
                        ex = `<div class="w-full text-center py-10 animate-slide-up"><i data-lucide="sparkles" class="w-10 h-10 mx-auto mb-3 opacity-50 season-text-primary"></i><p class="text-sm font-bold season-text-muted">Nuevos paquetes espectaculares próximamente.</p></div>`;
                    }
                } else {
                    ex = `<div class="w-full text-center py-10 animate-slide-up"><i data-lucide="folder-open" class="w-10 h-10 mx-auto mb-3 opacity-50 season-text-primary"></i><p class="text-sm font-bold season-text-muted">No hay paquetes disponibles en este momento.</p></div>`;
                }
            }
            
            let rc = '';
            if(isFirebaseLoaded && customerReviews && customerReviews.length>0){
                rc = `<div class="container mx-auto px-4 relative z-10 pb-12 mt-12">
                    <h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-10 season-text-title font-nunito">Lo que dicen de nosotros <i data-lucide="heart" class="w-8 h-8 inline text-rose-500 animate-pulse"></i></h2>
                    <div class="flex md:hidden items-center justify-center mb-6 opacity-80"><span class="text-[10px] season-text-muted font-bold uppercase px-3 py-1 rounded-full border border-[var(--s-glass-border)] bg-black/5 shadow-sm">Desliza 👉</span></div>
                    <div class="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 px-2 hide-scrollbar md:grid md:grid-cols-3 pt-6">` + 
                    customerReviews.map(r => `
                    <div class="w-[85vw] max-w-[350px] md:w-full snap-center flex-shrink-0 h-full animate-slide-up relative mt-4">
                        <div class="absolute top-2 right-4 opacity-[0.07] z-0 text-[var(--s-primary)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
                        </div>
                        <div class="glass-panel card-alive flex flex-col h-full rounded-[2rem] p-7 shadow-sm relative overflow-hidden group transition-all hover:-translate-y-2">
                            <div class="flex items-center gap-4 mb-5 relative z-10">
                                <div class="relative">
                                    <div class="w-14 h-14 rounded-full border-[3px] border-white/60 bg-gradient-to-tr ${r.color||'from-purple-500 to-indigo-500'} flex items-center justify-center text-white font-black text-2xl shadow-[0_5px_15px_rgba(0,0,0,0.15)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">${r.initial}</div>
                                    <div class="absolute -bottom-1 -right-1 bg-yellow-400 text-yellow-900 rounded-full p-1 shadow-sm border-2 border-[var(--s-glass-bg)]"><i data-lucide="star" class="w-3 h-3 fill-current"></i></div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="season-text-title font-black text-lg truncate tracking-tight leading-tight">${r.name}</div>
                                    <div class="text-[11px] season-text-primary font-bold uppercase tracking-wider truncate flex items-center gap-1 mt-0.5"><i data-lucide="map-pin" class="w-3 h-3"></i> ${r.location}</div>
                                </div>
                            </div>
                            <div class="season-text-muted mb-6 flex-grow relative z-10">
                                <p class="font-semibold text-[15px] leading-relaxed italic whitespace-normal break-words opacity-90 group-hover:opacity-100 transition-opacity">"${r.comment}"</p>
                            </div>
                            <div class="border-t border-[var(--s-glass-border)] pt-5 flex justify-between items-center relative z-10">
                                <div class="flex gap-0.5 text-yellow-400 drop-shadow-sm group-hover:scale-110 group-hover:translate-x-2 transition-transform duration-300 origin-left">
                                    ${'<i data-lucide="star" class="w-4 h-4 fill-current"></i>'.repeat(r.rating)}
                                </div>
                                <div class="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-500/15 px-3 py-1.5 rounded-full border border-emerald-500/30 flex items-center gap-1.5 shadow-sm"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Verificado</div>
                            </div>
                        </div>
                    </div>`).join('') + `</div></div>`;
            }
            
            const firstCatTarget = dynamicCategories.length > 0 ? `cat_${dynamicCategories[0].id}` : 'home';
            
            const existingHero = document.getElementById('hero-section-identifier');
            const mainCont = document.getElementById('mainContent');

            if (existingHero && app.activeSection === 'home' && mainCont.contains(existingHero)) {
                
                const campWrap = document.getElementById('home-campaigns-wrapper');
                if (campWrap && isFirebaseLoaded) { 
                    campWrap.innerHTML = getCampaignsHTML(); 
                    if(typeof lucide !== 'undefined') lucide.createIcons({root: campWrap}); 
                }

                const featWrap = document.getElementById('home-featured-wrapper');
                if (featWrap) { 
                    featWrap.innerHTML = ex; 
                    if(typeof lucide !== 'undefined') lucide.createIcons({root: featWrap}); 
                    setupSliders(); 
                }

                const revWrap = document.getElementById('home-reviews-wrapper');
                if (revWrap) { 
                    revWrap.innerHTML = rc; 
                    if(typeof lucide !== 'undefined') lucide.createIcons({root: revWrap}); 
                    setupSliders(); 
                }

                if(typeof renderCalendar === 'function') renderCalendar();
                window.__divertyObserveCalendar?.();
                return;
            }

            setContent(`<div id="hero-section-identifier"><div class="relative"><section class="relative min-h-[75vh] flex flex-col justify-end pb-16 pt-40 isolate overflow-hidden"><video id="hero-video" autoplay loop muted playsinline webkit-playsinline disablePictureInPicture preload="none" poster="https://res.cloudinary.com/dv40hkeyz/video/upload/so_0,w_720,q_auto,f_jpg/v1723578146/20250813_151416_0001_p5lwst.jpg" class="absolute inset-0 w-full h-full object-cover z-[1] pointer-events-none"><source data-src-mobile="https://res.cloudinary.com/dv40hkeyz/video/upload/w_720,q_auto:good,f_mp4,vc_h264:baseline,fps_30,ac_none/v1723578146/20250813_151416_0001_p5lwst.mp4" data-src="https://res.cloudinary.com/dv40hkeyz/video/upload/w_720,q_auto,f_mp4,vc_h264:baseline,fps_30/v1723578146/20250813_151416_0001_p5lwst.mp4" type="video/mp4"></video><div class="dv-hero-shade absolute inset-0 bg-black/50 z-[2] pointer-events-none"></div><div class="dv-hero-fade absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--s-bg-color)] to-transparent z-[2] pointer-events-none"></div><div class="hero-content z-[3] relative px-6 w-full max-w-lg mx-auto flex flex-col items-start text-left mt-auto animate-slide-up"><div class="inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-yellow-500/30 text-yellow-400 text-[11px] font-bold mb-5 shadow-lg"><span>✨</span> Diversión garantizada</div><h1 class="text-4xl sm:text-5xl font-black mb-4 font-poppins leading-[1.1] text-white drop-shadow-lg">Fiestas infantiles inolvidables en <span class="season-gradient-text drop-shadow-md">Panamá</span></h1><p class="text-base sm:text-lg mb-6 text-slate-200 font-medium font-quicksand leading-relaxed drop-shadow-md">Animación, magia y shows espectaculares para hacer de cada celebración un momento único.</p><div class="flex justify-between items-center w-full mb-6 border-y border-white/20 py-4 gap-2"><div class="flex flex-col items-start flex-1 border-r border-white/20 pr-2"><div class="flex items-center gap-1 text-cyan-400 mb-1"><i data-lucide="users" class="w-4 h-4"></i> <span class="font-bold text-white text-[13px]">+500</span></div><span class="text-[9px] text-slate-300 leading-tight">eventos<br>realizados</span></div><div class="flex flex-col items-center flex-1 border-r border-white/20 px-2 text-center"><div class="flex items-center gap-1 text-yellow-400 mb-1"><i data-lucide="star" class="w-4 h-4 fill-yellow-400"></i> <span class="font-bold text-white text-[13px]">4.9/5</span></div><span class="text-[9px] text-slate-300 leading-tight">en Google</span></div><div class="flex flex-col items-end flex-1 pl-2 text-right"><div class="flex items-center gap-1 text-pink-400 mb-1"><i data-lucide="smile" class="w-4 h-4"></i> <span class="font-bold text-white text-[13px]">100%</span></div><span class="text-[9px] text-slate-300 leading-tight">diversión<br>asegurada</span></div></div><div class="flex flex-col gap-3 w-full mb-6"><button data-action="navigate-from-modal" data-target-section="booking" class="nav-action w-full season-btn rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-transform active:scale-95 font-bold text-base shadow-lg"><i data-lucide="calendar-check" class="w-5 h-5"></i> Reservar ahora</button><button data-action="scroll-to-catalog" class="w-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 rounded-2xl py-3.5 flex items-center justify-center gap-2 transition-colors font-bold text-base shadow-md active:scale-95"><i data-lucide="eye" class="w-5 h-5"></i> Ver catálogo</button></div></div></section><div id="home-campaigns-wrapper" class="w-full relative z-30 flex flex-col items-center mt-6"></div><div class="container mx-auto px-4 relative z-30 flex flex-col items-center mt-4" id="home-featured-wrapper">${ex}</div></div><div class="container mx-auto px-4 relative z-10 pb-12"><section id="calendar-section" class="mt-4 py-4 animate-slide-up"><div class="max-w-[340px] mx-auto px-2"><div class="glass-panel card-alive p-4 sm:p-5 shadow-sm relative overflow-hidden" id="calendar-card-inner"><div class="flex items-center gap-3 mb-2"><div class="w-9 h-9 rounded-[10px] border-[2px] border-[var(--s-primary)]/20 bg-[var(--s-primary)]/10 flex items-center justify-center season-text-primary shadow-inner"><i data-lucide="calendar-heart" class="w-4 h-4"></i></div><div class="text-left"><h2 class="text-lg font-black season-text-title font-poppins leading-none tracking-tight">Selecciona tu fecha</h2><p class="season-text-muted text-[10px] mt-1 font-medium">Reserva en segundos</p></div></div><div class="calendar-motivation mt-3 mb-1 rounded-[14px] px-3.5 py-3 border border-[var(--s-glass-border)] text-left" style="background: color-mix(in srgb, var(--s-primary) 8%, var(--s-glass-bg));"><p class="season-text-title text-[11px] sm:text-xs font-extrabold leading-snug flex items-start gap-2"><i data-lucide="sparkles" class="w-4 h-4 season-text-primary shrink-0 mt-0.5"></i><span>Tu celebración comienza aquí. Elige una fecha disponible y asegura tu espacio antes de que se agote.</span></p></div><div class="flex justify-between items-center mb-4 mt-3 relative z-10 bg-[var(--s-glass-bg)] backdrop-blur-md p-1.5 rounded-[12px] border border-[var(--s-glass-border)] shadow-sm w-full mx-auto gap-2"><button data-action="prevMonth" id="prevMonth" class="w-7 h-7 hover:bg-[var(--s-primary)]/10 season-text-title hover:text-[var(--s-primary)] rounded-lg flex items-center justify-center transition-colors border border-transparent hover:border-[var(--s-primary)]/20 active:scale-95"><i data-lucide="chevron-left" class="w-4 h-4"></i></button><h3 id="cal-month-year" class="text-sm sm:text-base font-black season-text-title capitalize leading-none font-poppins px-1 tracking-wide">Cargando...</h3><button data-action="nextMonth" id="nextMonth" class="w-7 h-7 hover:bg-[var(--s-primary)]/10 season-text-title hover:text-[var(--s-primary)] rounded-lg flex items-center justify-center transition-colors border border-transparent hover:border-[var(--s-primary)]/20 active:scale-95"><i data-lucide="chevron-right" class="w-4 h-4"></i></button></div><div id="availability-calendar-grid" class="grid grid-cols-7 gap-y-1 gap-x-1 text-center relative z-10 w-full mb-2"></div></div></div></section></div><div id="home-reviews-wrapper">${rc}</div></div>`);
            
            const campWrapper = document.getElementById('home-campaigns-wrapper');
            if (campWrapper && isFirebaseLoaded) {
                campWrapper.innerHTML = getCampaignsHTML();
                if(typeof lucide !== 'undefined') lucide.createIcons({root: campWrapper});
            }

            window.__divertyScheduleHero?.();
            window.__divertyObserveCalendar?.();

            if(typeof renderCalendar === 'function') renderCalendar(); 
        }

        function renderAllCatalog() {
          if(!isFirebaseLoaded || !catalogLoaded){
            setContent(`
              <div class="catalog-grid-page all-catalog-page">
                <section class="catalog-grid-section">
                  <div class="catalog-grid-heading">
                    <div>
                      <p>Estamos preparando todo</p>
                      <h2>Explora por <span class="catalog-heading-gradient">categorías</span></h2>
                    </div>
                  </div>
                  <div class="catalog-loading-light">
                    <i data-lucide="loader-2"></i>
                    <span>Cargando categorías...</span>
                  </div>
                </section>
              </div>
            `);
            if(typeof lucide !== 'undefined') lucide.createIcons();
            return;
          }

          const categories = dynamicCategories
            .filter(c => isCategoryCurrentlyVisible(c))
            .map(c => {
              const items = app.catalog
                .filter(i => i.categoria === c.id)
                .sort((a,b) => (a.orden || 0) - (b.orden || 0));
              return { ...c, items, count: items.length };
            })
            .filter(c => c.count > 0);

          if(categories.length === 0){
            setContent(`
              <div class="catalog-grid-page all-catalog-page">
                <section class="catalog-grid-section">
                  <div class="catalog-grid-heading">
                    <div>
                      <p>Catálogo</p>
                      <h2>Explora por <span class="catalog-heading-gradient">categorías</span></h2>
                    </div>
                  </div>
                  <div class="catalog-empty-light">
                    <i data-lucide="package-open"></i>
                    <h3>Próximamente más opciones</h3>
                  </div>
                </section>
              </div>
            `);
            if(typeof lucide !== 'undefined') lucide.createIcons();
            return;
          }

          const cards = categories.map((cat,index) => {
            const firstItem = cat.items[0];
            const cover = cleanStr(cat.imagen || cat.image || firstItem?.image || '');
            const icon = getCatalogIcon(cat);
            const countLabel = `${cat.count} ${cat.count === 1 ? 'opción' : 'opciones'}`;

            return `
              <button type="button"
                data-target-section="cat_${cat.id}"
                class="nav-action catalog-category-card"
                aria-label="Ver ${cleanStr(cat.nombre)}">
                <div class="catalog-category-media">
                  ${cover
                    ? `<img ${imageAttributes(cover,categorySizes)} alt="${cleanStr(cat.nombre)}" width="480" height="360" loading="${index<2?'eager':'lazy'}" fetchpriority="${index<2?'high':'low'}" decoding="async">`
                    : `<div class="catalog-category-placeholder"><i data-lucide="${icon}"></i></div>`
                  }
                  <div class="catalog-category-shade"></div>
                  <span class="catalog-category-icon"><i data-lucide="${icon}"></i></span>
                </div>

                <div class="catalog-category-info">
                  <h3>${cleanStr(cat.nombre)}</h3>
                  <div class="catalog-category-cta">
                    <span>${countLabel}</span>
                    <i data-lucide="arrow-right"></i>
                  </div>
                </div>
              </button>
            `;
          }).join('');

          setContent(`
            <div class="catalog-grid-page all-catalog-page">
              <section class="catalog-grid-section">
                <div class="catalog-grid-heading">
                  <div>
                    <p>Elige lo que estás buscando</p>
                    <h2>Explora por <span class="catalog-heading-gradient">categorías</span></h2>
                  </div>
                  <span class="catalog-grid-count">
                    ${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'}
                  </span>
                </div>

                <div class="catalog-categories-grid">${cards}</div>
              </section>
            </div>
          `);

          if(typeof lucide !== 'undefined') lucide.createIcons();
        }

        function renderCategory(catId) {
            const cat = dynamicCategories.find(c => c.id === catId);
            if (!cat) return;
            const items = app.catalog.filter(i => i.categoria === catId).sort((a,b) => (a.orden || 0) - (b.orden || 0));
            renderSection(items, cat.nombre, getCatalogIcon(cat));
        }

        function createCatalogTileHTML(item,index=0) {
          const price = Number(item.price || 0);
          const oldPrice = Number(item.originalPrice || 0);
          const hasOffer = (item.discountApplied || item.oferta) && oldPrice > price;
          const rule=getItemQuantityRule(item);
          const unit = rule.enabled ? `<span class="catalog-tile-unit">/${escapeCatalogText(rule.singular)}</span>` : '';
          const itemName = cleanStr(item.name || item.title || '');

          return `
            <button type="button"
              data-action="open-item-detail"
              data-item-id="${item.id}"
              class="catalog-tile animate-slide-up"
              aria-label="Ver ${itemName}">

              <div class="catalog-tile-image-wrap">
                <img
                  ${imageAttributes(item.cardImage || item.image,catalogSizes)}
                  alt="${itemName}"
                  class="catalog-tile-image"
                  width="480" height="360"
                  loading="${index<2?'eager':'lazy'}"
                  fetchpriority="${index<2?'high':'low'}"
                  decoding="async">
                ${hasOffer ? `<span class="catalog-tile-offer">OFERTA</span>` : ''}
              </div>

              <div class="catalog-tile-body">
                <h3 class="catalog-tile-name">${itemName}</h3>

                <div class="catalog-price-row">
                  ${hasOffer
                    ? `<div class="catalog-tile-old-price">$${oldPrice.toFixed(2)}</div>`
                    : ''
                  }
                  <div class="catalog-tile-price">$${price.toFixed(2)} ${unit}</div>
                </div>

                <div class="catalog-tile-action">
                  <span>${item.tipoServicio==='personaje'?'Ver personaje':'Ver servicio'}</span>
                  <i data-lucide="arrow-right"></i>
                </div>
              </div>
            </button>
          `;
        }

        // ===== Navegación inteligente del catálogo =====
        const catalogNavMemory = {
            key(catId){ return `diverty_catalog_scroll_${catId || 'catalog'}`; },
            save(catId){
                try { sessionStorage.setItem(this.key(catId), String(Math.max(0, window.scrollY || 0))); } catch(e) {}
            },
            read(catId){
                try { return Math.max(0, Number(sessionStorage.getItem(this.key(catId)) || 0)); } catch(e) { return 0; }
            },
            restore(catId){
                const y = this.read(catId);
                requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top:y, left:0, behavior:'auto' })));
            }
        };

        function renderItemDetail(itemId, syncUrl = true) {
            const item = app.catalog.find(i => i.id === itemId);
            if (!item) return;
            if (syncUrl) setDirectRoute('plan', itemId);

            const cat = dynamicCategories.find(c => c.id === item.categoria);
            const categoryTitle = cat ? cat.nombre : 'Catálogo';
            const price = Number(item.price || 0);
            const oldPrice = Number(item.originalPrice || 0);
            const hasOffer = (item.discountApplied || item.oferta) && oldPrice > price;
            const inCart = app.cart.find(i => i.id === item.id);
            const services = (item.services && item.services.length)
                ? `<div class="catalog-detail-includes">
                    <h3><i data-lucide="sparkles"></i> Todo lo que incluye</h3>
                    <ul>
                        ${item.services.map(s => `
                            <li>
                                <span class="catalog-detail-check"><i data-lucide="check"></i></span>
                                <span>${cleanStr(s)}</span>
                            </li>`).join('')}
                    </ul>
                   </div>`
                : '';

            const detailQuantityRule = getItemQuantityRule(item);
            const detailQty = inCart ? clampItemQuantity(item, inCart.quantity) : detailQuantityRule.min;
            const actionArea = detailQuantityRule.enabled
                ? `<div class="catalog-detail-actions">
                    ${quantityControlHTML(item,detailQty)}
                    <div class="direct-booking-actions catalog-detail-button-row">
                        <button data-action="add-hourly-to-cart" data-item-id="${item.id}" data-cart-state="${inCart ? 'refresh' : 'none'}" class="season-btn catalog-detail-cart">
                            <i data-lucide="${inCart ? 'refresh-cw' : 'shopping-cart'}"></i>
                            ${inCart ? 'Actualizar cantidad' : 'Añadir al carrito'}
                        </button>
                        <button data-action="book-now" data-item-id="${item.id}" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button>
                    </div>
                   </div>`
                : `<div class="catalog-detail-actions">
                    <div class="direct-booking-actions catalog-detail-button-row">
                        <button data-action="add-to-cart" data-item-id="${item.id}" data-cart-state="${inCart ? 'selected' : 'none'}" class="season-btn catalog-detail-cart" style="${inCart ? 'background:#10B981!important;' : ''}">
                            <i data-lucide="${inCart ? 'check' : 'shopping-cart'}"></i>
                            ${inCart ? 'Seleccionado' : 'Carrito'}
                        </button>
                        <button data-action="book-now" data-item-id="${item.id}" class="direct-booking-btn"><i data-lucide="calendar-check"></i> Reservar ahora</button>
                    </div>
                   </div>`;

            setContent(`
                <div class="catalog-detail-page">
                    <div class="catalog-detail-shell animate-slide-up">
                        <button type="button"
                            data-action="back-to-category"
                            data-category-id="${item.categoria}"
                            class="catalog-detail-back">
                            <i data-lucide="arrow-left"></i>
                            <span>Volver a ${cleanStr(categoryTitle)}</span>
                        </button>

                        <div class="catalog-detail-card">
                            <div class="catalog-detail-image-wrap">
                                <picture>
                                <source media="(min-width:768px)" srcset="${escapeCatalogText(responsiveImage(item.image,{ratio:0,widths:[480,768,1080]}).srcset||item.image)}" sizes="(max-width:1159px) calc((100vw - 40px) / 2), 560px">
                                <img ${imageAttributes(item.image,'calc(100vw - 40px)',{ratio:2,widths:[480,768,1080]})}
                                     alt="${cleanStr(item.name || item.title)}"
                                     width="1080" height="540" loading="eager" decoding="async" fetchpriority="high"
                                     class="catalog-detail-image">
                                </picture>
                                ${hasOffer ? `<span class="catalog-detail-offer">OFERTA</span>` : ''}
                            </div>

                            <div class="catalog-detail-content">
                                <div class="catalog-detail-category">${cleanStr(categoryTitle)}</div>
                                <h1>${cleanStr(item.name || item.title)}</h1>

                                ${cleanStr(item.description || '') ? `<p class="catalog-detail-description">${cleanStr(item.description)}</p>` : ''}

                                <div class="catalog-detail-price-row">
                                    <span class="catalog-detail-price-label">Precio</span>
                                    <div>
                                        ${hasOffer ? `<span class="catalog-detail-old-price">$${oldPrice.toFixed(2)}</span>` : ''}
                                        <span class="catalog-detail-price">$${price.toFixed(2)}${detailQuantityRule.enabled ? `<small>/${escapeCatalogText(detailQuantityRule.singular)}</small>` : ''}</span>
                                    </div>
                                </div>

                                ${services}
                                ${actionArea}
                            </div>
                        </div>
                    </div>
                </div>
            `);

            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.scrollTo(0, 0);
        }

        function renderSection(items, title, icon) {
          if(!isFirebaseLoaded){
            setContent(`
              <div class="container mx-auto px-4 pt-32 pb-12 text-center season-text-muted">
                <i data-lucide="loader-2" class="w-12 h-12 mx-auto mb-4 animate-spin season-text-primary"></i>
                <p class="font-bold text-sm tracking-widest uppercase">Cargando...</p>
              </div>
            `);
            if(typeof lucide !== 'undefined') lucide.createIcons();
            return;
          }

          if(items.length === 0){
            setContent(`
              <div class="catalog-grid-page">
                <section class="catalog-grid-section">
                <button type="button" data-action="back-to-catalog" class="catalog-detail-back" style="margin-bottom:18px"><i data-lucide="arrow-left"></i><span>Volver al explorador</span></button>
                  <div class="catalog-grid-heading">
                    <div>
                      <p>Selecciona una opción</p>
                      <h2>${cleanStr(title)}</h2>
                    </div>
                  </div>
                  <div class="catalog-empty-light">
                    <i data-lucide="folder-open"></i>
                    <h3>Próximamente más opciones</h3>
                  </div>
                </section>
              </div>
            `);
            if(typeof lucide !== 'undefined') lucide.createIcons();
            return;
          }

          setContent(`
            <div class="catalog-grid-page">
              <section class="catalog-grid-section">
                <button type="button" data-action="back-to-catalog" class="catalog-detail-back" style="margin-bottom:18px"><i data-lucide="arrow-left"></i><span>Volver al explorador</span></button>
                <div class="catalog-grid-heading">
                  <div>
                    <p>Selecciona una opción</p>
                    <h2>${cleanStr(title)}</h2>
                  </div>
                  <span class="catalog-grid-count">
                    ${items.length} ${items.length === 1 ? 'opción' : 'opciones'}
                  </span>
                </div>

                <div class="catalog-products-grid">
                  ${items.map((item,index)=>item.tipoServicio==='personaje'?createCharacterTileHTML(item,index):createCatalogTileHTML(item,index)).join('')}
                </div>
              </section>
            </div>
          `);

          if(typeof lucide !== 'undefined') lucide.createIcons();
        }

        function renderGallery() {
            if(!isFirebaseLoaded){ setContent(`<div class="container mx-auto px-4 pt-32 pb-12 text-center season-text-muted"><i data-lucide="loader-2" class="w-12 h-12 mx-auto mb-4 animate-spin season-text-primary"></i><p>Cargando Galería...</p></div>`); return; }
            if(gallery.length===0){ setContent(`<div class="container mx-auto px-4 pt-28 pb-12"><section class="mb-10 animate-slide-up"><h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-4 season-text-title font-nunito">Nuestra Galería</h2><div class="text-center season-text-muted animate-slide-up"><i data-lucide="image" class="w-16 h-16 mx-auto mb-4 opacity-30"></i><p>Galería vacía.</p></div></section></div>`); return; }
            setContent(`<div class="container mx-auto px-4 pt-28 pb-12"><section class="mb-10 animate-slide-up"><h2 class="text-3xl lg:text-4xl font-extrabold text-center mb-4 season-text-title font-nunito">Nuestra Galería</h2><div class="flex overflow-x-auto snap-x snap-mandatory gap-5 pb-8 w-full hide-scrollbar pt-2 items-stretch px-2 md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:mx-auto">${gallery.map(i=>`<a href="${cleanStr(i.image)}" target="_blank" class="gallery-item flex-shrink-0 min-w-[75vw] sm:min-w-[45vw] md:min-w-0 snap-center block group border border-[var(--s-glass-border)] rounded-[2rem] overflow-hidden shadow-sm hover:shadow-lg transition-all duration-500 relative"><img ${imageAttributes(i.image,'(max-width:639px) 75vw, (max-width:767px) 45vw, (max-width:1023px) 33vw, 25vw',{ratio:0,widths:[320,480,720,1080]})} loading="lazy" decoding="async" fetchpriority="low" class="w-full h-72 md:h-64 object-cover group-hover:scale-110 transition-transform duration-500 relative z-10"></a>`).join('')}</div></section></div>`);
        }

        // FIRESTORE OPTIMIZADO: el calendario solo consulta las reservas del mes visible.
        // Antes se descargaba TODA la colección "eventos" en cada visita.
        const getMonthRange = (date) => {
            const y = date.getFullYear();
            const m = date.getMonth();
            const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const last = new Date(y, m + 1, 0).getDate();
            const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
            const key = `${y}-${String(m + 1).padStart(2, '0')}`;
            return { start, end, key };
        };

        const isBlockingEvent = (ev) => {
            if (!ev || ev.deletedLocally === true) return false;
            const estado = cleanStr(ev.estado).toLowerCase();
            return !/cancelad|rechaz|cot/.test(estado);
        };

        // Navidad comparte `disponibilidad_web` con las reservas normales. Para cupos
        // y rutas de Santa solo cuentan documentos marcados como entrega navideña.
        const isChristmasAvailabilityRow = (ev) => {
            if (!ev) return false;
            if (ev.esNavidad === true) return true;
            return cleanStr(ev.recursoNavidad).toLowerCase() === 'santa';
        };

        let dateClosures = {}, dateClosuresLoadedAt = 0, dateClosureRequest = null;
        async function loadClosedDates({ force = false } = {}) {
            if (isThemePreview) return {};
            if (!force && dateClosuresLoadedAt && Date.now() - dateClosuresLoadedAt < 15000) return dateClosures;
            if (!dateClosureRequest) dateClosureRequest = fetchWithTimeout(fetchPublicRestDoc('config_web','fechas_cerradas'),8000)
                .then(data => { dateClosures = data?.fechas || {}; dateClosuresLoadedAt = Date.now(); updateBookingDateClosures(); return dateClosures; })
                .finally(() => { dateClosureRequest = null; });
            return dateClosureRequest;
        }
        async function checkDateOpen(date) {
            if (!date) return false;
            try {
                const fechas = await loadClosedDates({force:true});
                if (fechas[date] === true) { showToast('Esta fecha está sin disponibilidad. Elige otra fecha.', 'error'); return false; }
                return true;
            } catch (_) { showToast('No se pudo comprobar la disponibilidad. Reintenta con conexión.', 'error'); return false; }
        }
        function updateBookingDateClosures() {
            const form = document.getElementById('bookingForm'); if (!form) return;
            const field = form.elements?.date; if (!field) return;
            if (field.tagName === 'SELECT') [...field.options].forEach(option => {
                if (!option.value) return;
                if (!option.dataset.openLabel) option.dataset.openLabel = option.textContent;
                option.disabled = dateClosures[option.value] === true;
                option.textContent = option.dataset.openLabel + (option.disabled ? ' — Sin disponibilidad' : '');
            });
            form.querySelectorAll('[data-christmas-date-choice]').forEach(button => {
                const closed = dateClosures[button.dataset.christmasDateChoice] === true;
                button.disabled = closed;
                button.classList.toggle('opacity-50',closed);
                let status = button.querySelector('[data-date-closed-label]');
                if (!status) { status = document.createElement('span'); status.dataset.dateClosedLabel=''; status.className='block mt-2 text-xs font-bold text-rose-600'; button.appendChild(status); }
                status.textContent = closed ? 'Sin disponibilidad' : '';
            });
            let message = document.getElementById('booking-date-availability-message');
            if (!message) { message = document.createElement('p'); message.id='booking-date-availability-message'; message.setAttribute('role','status'); message.className='mt-2 text-sm font-bold text-rose-600'; const footer = form.querySelector('#btn-next')?.parentElement; if (footer) footer.before(message); else form.appendChild(message); }
            const closed = dateClosures[field.value] === true;
            field.setCustomValidity(closed ? 'Esta fecha está sin disponibilidad. Elige otra fecha.' : '');
            message.textContent = closed ? 'Esta fecha está sin disponibilidad. Elige otra fecha.' : '';
        }

        let availabilityStatusCache = { at: 0, ready: false };
        async function loadBookedEventsForMonth(date, { force = false } = {}) {
            const { start, end, key } = getMonthRange(date);
            const requestSeq = ++bookedEventsRequestSeq;
            const publicRead=!db;
            const closuresReady = loadClosedDates({force}).then(()=>true,()=>false);
            // La proyección de cupos es pública: no requiere descargar Auth ni crear una sesión.
            // Las reservas siguen utilizando Firestore y su validación transaccional.
            // El indicador de disponibilidad cambia muy poco. Evita releerlo al pasar de un
            // mes a otro repetidamente; force=true sigue permitiendo una comprobación inmediata.
            if (force || Date.now() - availabilityStatusCache.at > 60000) {
                const [status] = await Promise.all([
                    (!publicRead ? getDoc(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','disponibilidad')).then(s=>s.data()) : fetchWithTimeout(fetchPublicRestDoc('config_web','disponibilidad'),8000)).catch(() => null),
                    getNormalResourceCapacity({force,publicRead})
                ]);
                availabilityStatusCache = { at: Date.now(), ready: status?.lista === true && normalBookingCapacity !== null };
            }
            if (!await closuresReady || !availabilityStatusCache.ready) { availabilityReady=false; bookedEvents = []; return []; }

            if (!force && bookedEventsMonthCache.has(key) && Date.now()-bookedEventsMonthCache.get(key).at<60000) {
                bookedEvents = bookedEventsMonthCache.get(key).rows;
                availabilityReady=true;
                return bookedEvents;
            }

            availabilityReady=false;
            try {
                let monthEvents;
                if(!publicRead){
                    const eventsRef=collection(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web');
                    const snap=await fetchWithTimeout(getDocs(query(eventsRef,where('fecha','>=',start),where('fecha','<=',end))),8000);
                    monthEvents=snap.docs.map(d=>({...d.data(),_availabilityId:d.id}));
                }else{
                    monthEvents=await fetchWithTimeout(fetchPublicRestMonth(start,end),8000);
                }
                monthEvents=monthEvents.filter(isBlockingEvent);

                // RUTAS NAVIDAD: disponibilidad_web es la fuente pública autorizada.
                // Las reservas nuevas ya guardan lat/lng aquí al confirmar la reserva.
                bookedEventsMonthCache.set(key, {at:Date.now(),rows:monthEvents});

                // Evita que una respuesta antigua reemplace el mes que el usuario ya cambió.
                if (requestSeq === bookedEventsRequestSeq || getMonthRange(currentCalDate).key === key) {
                    bookedEvents = monthEvents;
                    availabilityReady=true;
                }
                return monthEvents;
            } catch (e) {
                if(requestSeq===bookedEventsRequestSeq)availabilityReady=false;
                console.warn('No se pudo cargar disponibilidad del mes:', e);
                return bookedEventsMonthCache.get(key)?.rows || [];
            }
        }


        async function loadRouteEventsForMonth(date, { force = false } = {}) {
            const { start, end, key } = getMonthRange(date);
            if (!force && routeEventsMonthCache.has(key) && Date.now() - routeEventsMonthCache.get(key).at < 60000) {
                routeEvents = routeEventsMonthCache.get(key).rows;
                return routeEvents;
            }

            // IMPORTANTE: la web pública NO puede listar `eventos` (correcto por seguridad).
            // Usamos `disponibilidad_web`, que es la misma fuente autorizada que ya calcula cupos.
            // Primero aseguramos que el mes esté cargado; luego reutilizamos esos documentos.
            const monthRows = await loadBookedEventsForMonth(date, { force });
            const rows = (Array.isArray(monthRows) ? monthRows : [])
                .filter(ev => {
                    const id = String(ev._availabilityId || ev.id || '');
                    const fecha = String(ev.fecha || '').trim();
                    return !!id && !id.startsWith('slot_') && isChristmasAvailabilityRow(ev) && fecha >= start && fecha <= end;
                })
                .map(ev => {
                    const lat=Number(ev.lat), lng=Number(ev.lng);
                    const validGps=Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);
                    return {
                        ...ev,
                        id: String(ev._availabilityId || ev.id || ''),
                        _eventId: String(ev._availabilityId || ev.id || ''),
                        ...(validGps ? {lat,lng} : {})
                    };
                });

            routeEventsMonthCache.set(key, { at: Date.now(), rows });
            routeEvents = rows;
            return rows;
        }

        async function findCustomerReservations(value) {
            await ensureFirebaseRuntime();
            if (!auth?.currentUser) throw new PortalError('UNAVAILABLE');
            return searchCustomerPortal(value, {
                getOwned: async () => {
                    const ref = collection(db,'artifacts',CRM_APP_ID,'public','data','reservas_cliente');
                    const snapshot = await fetchWithTimeout(getDocs(query(ref,where('ownerUid','==',auth.currentUser.uid))),8000);
                    if(snapshot.metadata?.fromCache) throw new PortalError('OFFLINE');
                    return snapshot.docs.map(document=>({...document.data(),id:document.id}));
                },
                lookup: async search => requestCustomerPortal({search:search.raw},await auth.currentUser.getIdToken())
            });
        }

        function renderCalendar() {
            const grid = document.getElementById('availability-calendar-grid'); if(!grid) return;
            if(dateClosures[selectedCalendarDate]===true)selectedCalendarDate=null;
            const year = currentCalDate.getFullYear(), month = currentCalDate.getMonth();
            const firstDay = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
            
            let html = '';
            ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].forEach(d => { 
                html += `<div class="text-[9px] font-black season-text-primary uppercase tracking-widest mb-1.5 opacity-90">${d}</div>`; 
            });
            
            let adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
            for(let i=0; i<adjustedFirstDay; i++) html += `<div></div>`;
            const today = new Date(); today.setHours(0,0,0,0);
            
            for(let d=1; d<=daysInMonth; d++) {
                const currentDate = new Date(year, month, d);
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                // `slot_*` are internal transaction locks, not real reservations.
                // Counting them here made the public calendar show ghost/duplicated occupancy.
                let eventsThisDay = bookedEvents.filter(ev => {
                    const id = String(ev._availabilityId || ev.id || '');
                    return !id.startsWith('slot_') && String(ev.fecha || '').trim().slice(0,10) === dateStr;
                }).length;
                const isSelected = selectedCalendarDate === dateStr;
                
                const christmasEveMode=isChristmasEveBooking();
                const christmasDate=dateStr==='2026-12-24'||dateStr==='2026-12-25';
                let state='available',disabled=false;
                if(dateStr<panamaDateKey()){state='past';disabled=true;}
                else if(dateClosures[dateStr]===true){state='closed';disabled=true;}
                else if(christmasEveMode&&!christmasDate){state='restricted';disabled=true;}
                else if(!christmasEveMode&&christmasDate){state='christmas';disabled=true;}
                else if(!availabilityReady){state='unknown';}
                else if(!christmasEveMode&&isNormalDayFullyBooked(bookedEvents,dateStr,normalBookingCapacity)){state='full';disabled=true;}
                else if(!christmasEveMode&&eventsThisDay>=1){state='limited';}
                const labels={closed:'Sin disponibilidad',available:'Disponible',limited:'Pocos cupos',full:'Lleno',past:'Fecha pasada',unknown:'Disponibilidad por confirmar',restricted:'No disponible para este servicio',christmas:'Reservado para entregas de Santa'};
                html+=`<button type="button" class="calendar-day${isSelected?' is-selected':''}" data-day-state="${state}" ${disabled?'disabled':`data-action="select-date" data-date="${dateStr}"`} title="${labels[state]}" aria-label="${d} de ${new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(currentCalDate)}: ${labels[state]}" aria-pressed="${isSelected}"><span>${d}</span>${state==='christmas'?'<span class="calendar-santa" aria-hidden="true">🎅</span>':''}</button>`;
            }
            grid.innerHTML=html;
            if(!availabilityReady)grid.insertAdjacentHTML('beforeend','<div class="calendar-status" role="status">Disponibilidad por confirmar. Puedes enviar tu solicitud. <button type="button" data-action="retry-calendar">Reintentar</button></div>');
            const mn = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentCalDate);
            const cmy = document.getElementById('cal-month-year'); if(cmy) cmy.textContent = mn.charAt(0).toUpperCase() + mn.slice(1);
            
            let bBox = document.getElementById('calendar-bottom-box');
            if(!bBox){ bBox = document.createElement('div'); bBox.id = 'calendar-bottom-box'; document.getElementById('calendar-card-inner').appendChild(bBox); }
            
            if(selectedCalendarDate){
                const ds = new Date(selectedCalendarDate+'T00:00:00').toLocaleDateString('es-ES', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
                bBox.innerHTML = `<div class="mt-4 border border-emerald-500/30 bg-emerald-500/10 rounded-[1.25rem] p-4 text-left animate-slide-up shadow-sm relative overflow-hidden">
                    <div class="absolute -right-4 -bottom-4 text-emerald-500/10"><i data-lucide="check-circle" class="w-20 h-20"></i></div>
                    <div class="flex items-center gap-3 mb-3 relative z-10">
                        <div class="w-10 h-10 rounded-full border-[2.5px] border-emerald-500 bg-[var(--s-glass-bg)] flex items-center justify-center text-emerald-500 shadow-sm shrink-0"><i data-lucide="calendar-check" class="w-4 h-4"></i></div>
                        <div><p class="text-emerald-700 font-black text-[11px] leading-tight uppercase tracking-wide">✓ Fecha seleccionada</p><p class="season-text-title font-bold text-sm capitalize mt-0.5">${ds}</p><p class="season-text-muted text-[10px] font-semibold mt-1">¡Excelente elección! Continúa para completar tu reserva.</p></div>
                    </div>
                    <button data-action="confirm-date" class="w-full season-btn font-extrabold py-3.5 rounded-xl transition-transform active:scale-95 shadow-lg flex justify-center items-center gap-2 relative z-10 text-xs tracking-wide uppercase"><i data-lucide="arrow-right" class="w-4 h-4"></i> Continuar con mi reserva</button>
                </div>`;
            } else {
                bBox.innerHTML = `<div class="flex justify-center gap-3 sm:gap-6 mt-5 pt-4 border-t border-[var(--s-glass-border)] flex-wrap">
                    <div class="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black season-text-muted uppercase tracking-widest bg-[var(--s-glass-bg)] py-1 px-2.5 rounded-full border border-[var(--s-glass-border)] shadow-sm"><div class="w-2 h-2 rounded-full bg-emerald-500"></div> Disponible</div>
                    <div class="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-500/10 py-1 px-2.5 rounded-full border border-amber-500/20 shadow-sm"><div class="w-2 h-2 rounded-full bg-amber-500"></div> Pocos cupos</div>
                    <div class="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-500/10 py-1 px-2.5 rounded-full border border-rose-500/20 shadow-sm"><div class="w-2 h-2 rounded-full bg-rose-500"></div> Sin disponibilidad</div>
                </div>`;
            }
            if(typeof lucide !== 'undefined') lucide.createIcons({root: document.getElementById('calendar-section')});
        }

        function renderPortal() {
            const helpUrl = christmasWhatsappUrl('Hola, necesito ayuda con mi reserva.');
            setContent(`<section class="portal-page">
                <a href="?vista=home" data-target-section="home" class="portal-back nav-action"><i data-lucide="arrow-left" aria-hidden="true"></i> Volver al inicio</a>
                <header class="portal-header"><div class="portal-brand-mark" aria-hidden="true"><i data-lucide="calendar-heart"></i></div><div><span class="portal-eyebrow">TU EXPERIENCIA DIVERTY</span><h2>Portal del Cliente</h2><p>Los detalles de tu celebración, en un solo lugar.</p></div></header>
                <div class="portal-layout">
                    <aside class="portal-search-panel">
                        <div class="portal-search-heading"><span class="portal-step" aria-hidden="true"><i data-lucide="search"></i></span><div><h3>Encuentra tu reserva</h3><p>Ten los detalles de tu evento a mano.</p></div></div>
                        <form id="portalSearchForm">
                            <label for="searchPhone">Nombre o celular</label>
                            <div class="portal-input-wrap"><i data-lucide="user-round-search" aria-hidden="true"></i><input type="text" id="searchPhone" aria-label="Nombre o celular de la reserva" aria-describedby="portalSearchHint" autocomplete="off" maxlength="150" placeholder="Ej. María Pérez o 60000000" required></div>
                            <p id="portalSearchHint">Usa los datos que registraste. Tu celular puede incluir +507.</p>
                            <button type="submit" class="season-btn"><i data-lucide="search" aria-hidden="true"></i> Buscar Reserva</button>
                        </form>
                        <div class="portal-help"><i data-lucide="message-circle" aria-hidden="true"></i><div><p>¿Necesitas ayuda?</p><a href="${helpUrl}" target="_blank" rel="noopener noreferrer">Conversemos por WhatsApp <i data-lucide="arrow-up-right" aria-hidden="true"></i></a></div></div>
                    </aside>
                    <section class="portal-results-panel" aria-labelledby="portalResultsTitle"><div class="portal-results-heading"><h3 id="portalResultsTitle">Detalles de tu reserva</h3><span>DIVERTY · PANAMÁ</span></div><div id="portalResults" aria-live="polite">${getPortalMessage('Tu reserva, a un paso', 'Aquí verás la fecha, el servicio y los pagos de tu evento.')}</div></section>
                </div>
            </section>`);
            const form = document.getElementById('portalSearchForm');
            if(form)form.onsubmit = async event => {
                event.preventDefault();
                if(form.dataset.searching==='1')return;
                const input=form.querySelector('#searchPhone'), results=document.getElementById('portalResults');
                if(!input || !results)return;
                const renderMessage = (title, description, icon = 'search', tone = '') => {
                    results.innerHTML = getPortalMessage(title, description, icon, tone);
                    if(typeof lucide!=='undefined')lucide.createIcons({root:results});
                };
                try { parsePortalQuery(input.value); }
                catch(error){renderMessage('Revisa tus datos', error.reason==='INVALID_PHONE'?'Escribe el número de celular completo. Puedes incluir +507.':'Escribe el nombre que registraste en la reserva o tu celular completo.', 'circle-alert', 'portal-message-notice');input.focus();return;}
                const button=form.querySelector('button[type="submit"]'), label=button.innerHTML;
                form.dataset.searching='1';button.disabled=true;input.disabled=true;button.textContent='Buscando…';results.setAttribute('aria-busy','true');
                results.innerHTML='<div class="portal-message portal-message-loading"><div class="loading-spinner !w-6 !h-6 !border-2" aria-hidden="true"></div><h3>Consultando tu reserva…</h3><p>Estamos buscando los detalles de tu celebración.</p></div>';
                try {
                    const rows=await findCustomerReservations(input.value);
                    if(!results.isConnected)return;
                    if(rows.length)results.innerHTML=rows.map(getPortalResultCard).join('');
                    else renderMessage('No encontramos una reserva con esos datos.', 'Prueba con tu celular completo o escribe el nombre tal como lo registraste.', 'search', 'portal-message-notice');
                } catch(error) {
                    if(!results.isConnected)return;
                    const description=error.reason==='AMBIGUOUS_NAME'?'Hay varios clientes con ese nombre. Escribe tu número de celular para ver tu reserva.':error.reason==='RATE_LIMITED'?'Has realizado varias consultas seguidas. Espera un minuto e inténtalo de nuevo.':'No pudimos consultar las reservas. Reintenta o contáctanos por WhatsApp; este mensaje no significa que tu reserva no exista.';
                    renderMessage('Vamos a ayudarte', description, 'message-circle', 'portal-message-notice');
                } finally {
                    delete form.dataset.searching;button.disabled=false;input.disabled=false;button.innerHTML=label;results.removeAttribute('aria-busy');
                    if(typeof lucide!=='undefined')lucide.createIcons({root:document.querySelector('.portal-page')});
                }
            };
        }

        function renderBooking() {
            const previousForm = document.getElementById('bookingForm');
            if (previousForm && app.cart.length > 0) bookingFormState = {...bookingFormState, ...Object.fromEntries(new FormData(previousForm).entries())};
            bookingDatePickerCleanup?.(); bookingDatePickerCleanup = null;
            // El 24 y 25 de diciembre de 2026 quedan exclusivos para Entregas de Nochebuena.
            if(!isChristmasEveBooking() && ['2026-12-24','2026-12-25'].includes(String(selectedCalendarDate||'').slice(0,10))){
                selectedCalendarDate=null;
                if(bookingFormState) bookingFormState.date='';
            }
            const subtotal = app.cart.reduce((s, i) => s + (Number(i.price)*i.quantity), 0);
            const count = app.cart.reduce((s, i) => s + i.quantity, 0);
            const tCost = effectiveTransportCost(count);
            let dVal = 0; if(appliedCoupon && count>0){ dVal = appliedCoupon.type==='percent' ? subtotal*(Number(appliedCoupon.discount)/100) : Number(appliedCoupon.discount); }
            dVal=Math.min(subtotal,Math.max(0,dVal)); const fTot = subtotal - dVal + tCost;
            const cs = app.cart.length===0?`<div class="text-center py-10 animate-slide-up"><p class="mb-8 season-text-muted">Carrito Vacío</p></div>`:app.cart.map(i=>`<div class="flex flex-col bg-black/5 p-3.5 rounded-xl shadow-sm mb-2.5 border border-black/5"><div class="flex justify-between items-center"><span class="font-semibold season-text-title text-sm pr-2">${i.name} <span class="season-text-muted text-xs font-normal">x${i.quantity}</span></span><span class="font-extrabold season-text-primary text-sm">$${(Number(i.price)*i.quantity).toFixed(2)}</span></div></div>`).join('');
            const lo = locations.map(o=>`<option value="${o.value}" ${app.location===o.value?'selected':''}>${o.label}</option>`).join('');
            
            let dateText = 'Aún no tienes planes en tu carrito.';
            if (selectedCalendarDate) {
                const dateObj = new Date(selectedCalendarDate + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                dateText = `Has separado tentativamente el <b>${formattedDate}</b>.`;
            }

            let welcomeBanner = '';
            const savedData = readBrowserStorage('localStorage', 'datosClienteDiverty');
            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    if (parsed.nombre) {
                        welcomeBanner = `<div class="bg-[color-mix(in_srgb,var(--s-primary)_15%,transparent)] border border-[var(--s-primary)] p-4 rounded-2xl mb-5 text-sm font-bold flex items-center gap-3 shadow-sm animate-slide-up"><i data-lucide="sparkles" class="w-6 h-6 season-text-primary"></i> <div class="season-text-title">¡Hola de nuevo, ${parsed.nombre.split(' ')[0]}!<br><span class="text-xs font-medium season-text-muted">Autocompletamos tus datos.</span></div></div>`;
                    }
                } catch(e){}
            }

            // NAVIDAD FASE 3 — horarios exclusivos para Entregas de Nochebuena.
            // Reserva normal conserva exactamente su horario actual (08:00 a 23:30).
            const makeTimeOptions = (startMinutes, endMinutes, { christmasDate = '' } = {}) => {
                let html = '<option value="" style="color:black">Selecciona una hora</option>';
                for (let mins = startMinutes; mins <= endMinutes; mins += 30) {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    const value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                    const hour12 = h % 12 || 12;
                    const label = `${hour12}:${String(m).padStart(2,'0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
                    let disabled = false;
                    let suffix = '';
                    if (christmasDate) {
                        const safeSlot = `${christmasDate}_${value.replace(':','-')}`.replace(/[^0-9A-Za-z_-]/g,'');
                        const slotId = `slot_santa_${safeSlot}`;
                        const slot = bookedEvents.find(ev => ev._availabilityId === slotId);
                        // Reconciliación sin lecturas extra: loadBookedEventsForMonth() ya descargó
                        // los documentos individuales del mes. Algunas reservas navideñas antiguas
                        // existen allí pero fueron creadas antes de reservationIds en slot_santa_*.
                        const individualCount = bookedEvents.filter(ev => {
                            const id = String(ev._availabilityId || '');
                            if (!id || id.startsWith('slot_') || !isChristmasAvailabilityRow(ev)) return false;
                            return String(ev.fecha || '') === christmasDate && String(ev.hora || '') === value;
                        }).length;
                        // Para mostrar disponibilidad confiamos solo en reservas individuales reales.
                        // `slot_santa_*` es un candado transaccional y puede quedar obsoleto si una
                        // versión antigua eliminó una prueba sin limpiar el contador auxiliar.
                        if (individualCount > 0) {
                            const count = individualCount;
                            const capacity = Math.max(1, Number(slot?.capacity) || Number(christmasCapacityCache.value) || 1);
                            disabled = count >= capacity;
                            if (disabled) suffix = ' — NO DISPONIBLE · elige otro horario';
                            else if (count > 0) suffix = ` — ${Math.max(0, capacity-count)} cupo${capacity-count === 1 ? '' : 's'}`;
                        }
                    }
                    html += `<option value="${value}" style="color:black" ${disabled ? 'disabled' : ''}>${label}${suffix}</option>`;
                }
                return html;
            };
            const normalizeChristmasDate = (value) => {
                const raw = cleanStr(value);
                if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
                const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
                return m ? `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : raw;
            };
            let bookingTimeOptions = makeTimeOptions(8 * 60, 23 * 60 + 30);
            if (isChristmasEveBooking()) {
                const christmasSelectedDate = normalizeChristmasDate(selectedCalendarDate || bookingFormState.date || '');
                if (christmasSelectedDate === '2026-12-24') bookingTimeOptions = makeTimeOptions(16 * 60, 23 * 60 + 30, { christmasDate: christmasSelectedDate });
                else if (christmasSelectedDate === '2026-12-25') bookingTimeOptions = makeTimeOptions(0, 14 * 60, { christmasDate: christmasSelectedDate });
                else bookingTimeOptions = '<option value="" style="color:black">Primero selecciona 24 o 25 de diciembre</option>';
            }

            const christmasSelectedForDisplay = normalizeChristmasDate(selectedCalendarDate || bookingFormState.date || '');
            const normalDatePickerButton = `<button type="button" id="booking-open-date-picker" aria-haspopup="dialog" aria-expanded="false" aria-controls="booking-date-calendar" class="mt-2 w-full rounded-xl border border-[var(--s-primary)]/30 bg-[var(--s-primary)]/10 py-3 px-4 font-bold season-text-title text-sm">📅 Elegir fecha en el calendario</button>`;
            const dateDisplay = isChristmasEveBooking() ? `
                <div class="form-group col-span-1 md:col-span-2">
                    <label class="form-label font-bold season-text-muted text-xs uppercase mb-2 block">Fecha de la entrega *</label>
                    <input type="hidden" name="date" value="${['2026-12-24','2026-12-25'].includes(christmasSelectedForDisplay)?christmasSelectedForDisplay:''}">
                    <div class="grid grid-cols-2 gap-3">
                        <button type="button" data-christmas-date-choice="2026-12-24" class="rounded-2xl border p-4 text-left transition active:scale-[.98] ${christmasSelectedForDisplay==='2026-12-24'?'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/20':'border-[var(--s-glass-border)] bg-black/5'}"><span class="block text-xs font-black text-emerald-600">NOCHEBUENA</span><span class="block text-lg font-black season-text-title mt-1">24 de diciembre</span></button>
                        <button type="button" data-christmas-date-choice="2026-12-25" class="rounded-2xl border p-4 text-left transition active:scale-[.98] ${christmasSelectedForDisplay==='2026-12-25'?'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/20':'border-[var(--s-glass-border)] bg-black/5'}"><span class="block text-xs font-black text-emerald-600">NAVIDAD</span><span class="block text-lg font-black season-text-title mt-1">25 de diciembre</span></button>
                    </div>
                    <p class="mt-2 text-[11px] season-text-muted font-semibold">Elige una fecha para la entrega: <b>24 de diciembre (Nochebuena)</b> o <b>25 de diciembre (Navidad)</b>. Toca una de las dos opciones para continuar.</p>
                </div>` : (selectedCalendarDate ? 
                `<div class="form-group col-span-1 md:col-span-2 bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl flex items-center gap-3 shadow-sm">
                    <div class="w-10 h-10 bg-[var(--s-glass-bg)] border border-emerald-500/50 text-emerald-500 rounded-full flex items-center justify-center shrink-0 shadow-sm"><i data-lucide="calendar-check" class="w-5 h-5"></i></div>
                    <div class="flex-1">
                        <label class="font-bold text-emerald-600 text-[10px] uppercase tracking-wider block">Fecha Reservada *</label>
                        <input type="date" name="date" required class="bg-transparent border-none text-emerald-600 font-black text-lg p-0 w-full outline-none focus:ring-0" aria-label="Fecha del evento" min="${panamaDateKey()}" value="${selectedCalendarDate}">${normalDatePickerButton}
                    </div>
                </div>` : 
                `<div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Fecha *</label><input type="date" name="date" required class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm" aria-label="Fecha del evento" min="${panamaDateKey()}">${normalDatePickerButton}</div>`);


            let exploreButtons = '';
            if (dynamicCategories.length > 0) {
                const firstCat = dynamicCategories[0];
                exploreButtons += `<button data-action="navigate-from-modal" data-target-section="cat_${firstCat.id}" class="w-full sm:w-auto season-btn font-extrabold py-3.5 px-8 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 nav-action"><i data-lucide="${firstCat.icono || 'star'}" class="w-5 h-5"></i> Ver ${firstCat.nombre}</button>`;
                if (dynamicCategories.length > 1) {
                    const secCat = dynamicCategories[1];
                    exploreButtons += `<button data-action="navigate-from-modal" data-target-section="cat_${secCat.id}" class="w-full sm:w-auto bg-black/5 border border-black/10 season-text-title font-extrabold py-3.5 px-8 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 nav-action"><i data-lucide="${secCat.icono || 'star'}" class="w-5 h-5 text-[var(--s-primary)]"></i> Ver ${secCat.nombre}</button>`;
                }
            } else {
                 exploreButtons += `<button data-action="navigate-from-modal" data-target-section="home" class="w-full sm:w-auto season-btn font-extrabold py-3.5 px-8 rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 nav-action"><i data-lucide="home" class="w-5 h-5"></i> Volver al Inicio</button>`;
            }

            // Ubicación por GPS o dirección escrita, con referencia del lugar.
            const locationAttribute=value=>String(value||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const locationPrefix=isChristmasEveBooking()?'christmas':'normal';
            const referenceName=isChristmasEveBooking()?'christmasReference':'normalReference';
            const bookingLocationFields = `
                <input type="hidden" name="location" value="${locationAttribute(bookingFormState[locationPrefix+'CoverageLabel'])}">
                <input type="hidden" name="address" value="${locationAttribute(bookingFormState.address)}">
                <div class="form-group">
                    <p class="text-sm season-text-muted mb-3">Elige cómo indicar el lugar de ${isChristmasEveBooking()?'la entrega':'tu evento'}.</p>
                    <div class="grid grid-cols-2 gap-2.5">
                        <button type="button" data-${locationPrefix}-location-mode="gps" class="location-mode rounded-2xl border px-3 py-3 text-left season-text-title"><i data-lucide="locate-fixed" class="w-5 h-5 mb-2"></i><span class="block text-sm font-black">Buscar por GPS</span><span class="block text-xs season-text-muted mt-1">Estoy en el lugar del evento</span></button>
                        <button type="button" data-${locationPrefix}-location-mode="manual" class="location-mode rounded-2xl border px-3 py-3 text-left season-text-title"><i data-lucide="pencil-line" class="w-5 h-5 mb-2"></i><span class="block text-sm font-black">Escribir dirección</span><span class="block text-xs season-text-muted mt-1">No necesito estar allí</span></button>
                    </div>
                </div>
                <div id="${locationPrefix}-manual-panel" class="form-group">
                    <label for="${locationPrefix}-manual-address" class="form-label font-bold season-text-title text-sm mb-2 block">¿Dónde será? *</label>
                    <textarea id="${locationPrefix}-manual-address" name="${locationPrefix}ManualAddress" maxlength="1500" rows="2" class="w-full glass-panel season-text-title rounded-2xl py-3 px-4 text-sm" placeholder="Ej.: PH Las Palmeras, Brisas del Golf, casa 18. También puedes pegar un enlace de Maps o Waze."></textarea>
                    <p class="text-xs season-text-muted mt-2">Escribe lo que sabes del lugar. Si falta algún detalle, lo confirmaremos contigo.</p>
                </div>
                <div id="${locationPrefix}-gps-panel" class="form-group hidden">
                    <button type="button" id="${locationPrefix}-use-location" class="hidden" aria-hidden="true" tabindex="-1">Usar mi ubicación actual</button>
                    <div id="${locationPrefix}-location-loader" class="hidden rounded-2xl bg-black/5 p-3 text-center"><div class="text-2xl animate-bounce">${isChristmasEveBooking()?'🎅🛷':'🚐🎈'}</div><p id="${locationPrefix}-location-loader-text" class="text-sm font-bold season-text-title mt-2">Buscando tu ubicación…</p></div>
                    <p id="${locationPrefix}-location-status" class="text-xs season-text-muted">Pulsa Buscar por GPS para obtener tu ubicación. Si no estás en el lugar del evento, elige Escribir dirección.</p>
                </div>
                <div class="form-group">
                    <label for="${referenceName}" class="block text-sm font-bold season-text-title mb-2">Barriada, PH o salón de fiestas</label>
                    <textarea id="${referenceName}" name="${referenceName}" maxlength="500" rows="2" class="w-full glass-panel season-text-title rounded-2xl py-3 px-4 text-sm" placeholder="Ej.: PH Las Palmeras, salón social, entrada por la garita"></textarea>
                    <p class="text-xs season-text-muted mt-2">Obligatorio al usar GPS o un enlace de mapa. Si ya escribiste el nombre en la dirección, no hace falta repetirlo.</p>
                </div>
                <div id="${locationPrefix}-coverage-result" aria-live="polite"></div>
                <button type="button" data-location-continue class="w-full season-btn font-extrabold py-3.5 px-5 rounded-2xl">${isChristmasEveBooking()?'Continuar con esta ubicación':'Enviar solicitud'}</button>
                `;


            setContent(`<div class="container mx-auto px-4 max-w-5xl pt-28 pb-12"><section class="mb-10 animate-slide-up"><h2 class="text-3xl font-extrabold text-center mb-8 season-text-title font-nunito">${isChristmasEveBooking()?'Reserva tu entrega con Santa 🎅':'Reserva tu Evento'}</h2><div class="grid grid-cols-1 lg:grid-cols-12 gap-8"><div class="lg:col-span-5 order-1 lg:order-1"><details id="booking-summary" class="glass-panel card-alive p-6 sm:p-8 shadow-sm sticky top-24" ${window.matchMedia("(min-width: 1024px)").matches?"open":""}><summary class="booking-summary-toggle"><span>Tu reserva</span><span id="booking-summary-compact">$${Math.max(0,fTot).toFixed(2)}</span><small>Ver servicios y detalle del precio</small></summary><div class="booking-summary-details"><p id="booking-summary-appointment" class="text-sm season-text-muted mb-4"></p><div id="booking-cart-summary">${cs}</div>${app.cart.length>0?`<div class="mt-5 pt-5 border-t border-[var(--s-glass-border)] space-y-2 text-right"><p class="text-sm season-text-muted font-semibold">Subtotal: <span class="season-text-title">$${subtotal.toFixed(2)}</span></p>${dVal>0?`<p class="text-sm text-pink-500 font-bold">Descuento: -$${dVal.toFixed(2)}</p>`:''}<p class="text-sm season-text-muted font-semibold">Transporte: <span id="booking-summary-transport" class="season-text-title">$${tCost.toFixed(2)}</span></p><p class="text-2xl font-extrabold text-emerald-500 mt-2"><span id="booking-summary-total-label">Total estimado:</span> <span id="booking-summary-total">$${Math.max(0,fTot).toFixed(2)}</span></p></div>`:''}<p id="booking-summary-note" class="booking-price-note" hidden></p></div></details></div><div class="lg:col-span-7 order-2 lg:order-2">${app.cart.length>0?`<form id="bookingForm" ${isChristmasEveBooking() ? 'novalidate' : ''} class="glass-panel card-alive p-6 sm:p-8 shadow-sm"><div class="flex items-center justify-between mb-8 relative"><div class="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-black/10 z-0 rounded-full"></div><div id="wizard-progress-bar" class="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[var(--s-primary)] z-0 transition-all duration-300 rounded-full" style="width:0%;"></div>${createWizardStep(1,'user','Contacto','')}${createWizardStep(2,'calendar','Evento','opacity-50')}${createWizardStep(3,'map-pin','Lugar','opacity-50')}</div><div class="space-y-5"><div class="wizard-content active" id="step-1"><h3 class="text-xl font-bold season-text-title mb-6 border-b border-[var(--s-glass-border)] pb-4">Tus Datos</h3>${welcomeBanner}<div class="space-y-5">${createInput('Nombre','name','text')}${createInput('Email','email','email')}${createInput('Teléfono','phone','tel')}<div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Comentario opcional</label><textarea name="comments" class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm" rows="2" placeholder="${isChristmasEveBooking()?'Ej: nombre del niño, indicación especial o detalle que debamos saber':'Ej: indicación especial, acceso al lugar o detalle importante del evento'}"></textarea></div></div></div><div class="wizard-content" id="step-2"><h3 class="text-xl font-bold season-text-title mb-6 border-b border-[var(--s-glass-border)] pb-4">Detalles</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-5 relative">${isChristmasEveBooking()?`<input type="hidden" name="eventType" value="Navidad"><div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Niños *</label><select name="guests" required class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm"><option value="1" style="color:black">1 niño</option><option value="2" style="color:black">2 niños</option></select><p class="mt-1.5 text-[10px] season-text-muted font-semibold">Máximo 2 niños por entrega.</p></div>`:`<div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Tipo de Evento *</label><select name="eventType" required class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm"><option value="Cumpleaños" style="color:black">🎉 Cumpleaños</option><option value="Halloween" style="color:black">🎃 Halloween</option><option value="Navidad" style="color:black">🎄 Navidad</option><option value="Día del Niño" style="color:black">🧸 Día del Niño</option><option value="Otro" style="color:black">⭐ Otro</option></select></div><div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Niños</label><input type="number" name="guests" class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm" min="1"></div>`}${dateDisplay}<div class="form-group"><label class="form-label font-bold season-text-muted text-xs uppercase mb-1.5 block">Hora *</label><select name="time" required class="w-full glass-panel season-text-title rounded-2xl py-3.5 px-4 text-sm ${isChristmasEveBooking() ? 'hidden' : ''}">${bookingTimeOptions}</select>${isChristmasEveBooking() ? `<div id="christmas-time-cards" class="grid grid-cols-2 sm:grid-cols-3 gap-2.5"></div><div id="christmas-time-message" class="mt-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] font-bold season-text-title">🎅 Los horarios que indican “NO DISPONIBLE” ya alcanzaron el máximo de Santas. Elige otro horario disponible.</div>` : `<div id="normal-resource-message" class="mt-2 rounded-xl border border-[var(--s-glass-border)] bg-black/5 px-3 py-2 text-[11px] font-bold season-text-muted">Selecciona fecha y hora para comprobar el personal disponible.</div>`}</div></div></div><div class="wizard-content" id="step-3"><h3 class="text-xl font-bold season-text-title mb-6 border-b border-[var(--s-glass-border)] pb-4">Lugar</h3><div class="space-y-5">${bookingLocationFields}</div></div><div class="flex justify-between pt-6 mt-6 border-t border-[var(--s-glass-border)]"><button type="button" id="btn-prev" class="bg-black/5 season-text-title py-3.5 px-6 rounded-full hidden transition-colors font-bold active:scale-95">Atrás</button><button type="button" id="btn-next" class="bg-[var(--s-text-title)] text-[var(--s-bg-color)] font-bold py-3.5 px-6 rounded-full ml-auto transition-colors shadow-md active:scale-95">Siguiente</button><button type="submit" formnovalidate id="btn-submit" class="bg-emerald-500 text-white font-bold py-3.5 px-6 rounded-full hidden ml-auto transition-colors shadow-md active:scale-95">Enviar solicitud</button></div></div></form>` : `<div id="empty-booking-state" class="glass-panel card-alive p-8 sm:p-10 shadow-sm text-center relative overflow-hidden"><div class="relative z-10"><div class="w-20 h-20 bg-black/5 border border-[var(--s-primary)] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm"><i data-lucide="gift" class="w-10 h-10 season-text-primary"></i></div><h3 class="text-2xl sm:text-3xl font-black season-text-title mb-3 font-nunito tracking-tight">¡Excelente elección!</h3><p class="season-text-muted mb-8 text-sm sm:text-base font-medium max-w-md mx-auto">${dateText} Para continuar, explora nuestros paquetes y agrega los que más te gusten.</p><div class="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">${exploreButtons}</div></div></div>`}</div></div></section></div>`);
            
            if(app.cart.length>0){
                // NAVIDAD RUTAS FASE 1 — GPS primero.
                // Orden real: Lugar/GPS -> Evento/horario -> Contacto. La reserva normal no cambia.
                // Conocer el pin antes del horario permite que la siguiente fase recomiende horas
                // cercanas a las rutas ya confirmadas sin hacer perder tiempo al cliente.
                if (isChristmasEveBooking()) {
                    const contactStep = document.getElementById('step-1');
                    const eventStep = document.getElementById('step-2');
                    const locationStep = document.getElementById('step-3');
                    if (contactStep && eventStep && locationStep) {
                        const parent = contactStep.parentNode;
                        contactStep.id = 'step-contact-temp';
                        eventStep.id = 'step-event-temp';
                        locationStep.id = 'step-1';
                        eventStep.id = 'step-2';
                        contactStep.id = 'step-3';
                        if (parent) {
                            parent.insertBefore(locationStep, parent.firstElementChild);
                            parent.insertBefore(eventStep, contactStep);
                        }
                        // No fuerces el wizard a Ubicación en cada render.
                        // Conserva el paso actual (GPS -> Horario -> Contacto).
                        const preservedStep = Math.min(3, Math.max(1, Number(app.wizardStep) || 1));
                        locationStep.classList.toggle('active', preservedStep === 1);
                        eventStep.classList.toggle('active', preservedStep === 2);
                        contactStep.classList.toggle('active', preservedStep === 3);
                    }
                    const wizardSteps = document.querySelectorAll('.wizard-step');
                    const labels = ['Ubicación', 'Horario', 'Contacto'];
                    wizardSteps.forEach((step, i) => {
                        const t = step.querySelector('span');
                        if (t && labels[i]) t.textContent = labels[i];
                    });
                    // Guardia de regresión: Navidad debe conservar SIEMPRE GPS, fechas 24/25,
                    // tarjetas de hora inteligente, referencia y el resultado de cobertura.
                    const requiredChristmasUi = ['christmas-use-location','christmas-time-cards','christmas-coverage-result'];
                    const missingChristmasUi = requiredChristmasUi.filter(id=>!document.getElementById(id));
                    const hasDates = document.querySelector('[data-christmas-date-choice="2026-12-24"]') && document.querySelector('[data-christmas-date-choice="2026-12-25"]');
                    if (missingChristmasUi.length || !hasDates) {
                        console.error('NAVIDAD: interfaz incompleta', {missingChristmasUi,hasDates:!!hasDates});
                        showToast('No pudimos cargar completa la agenda de Navidad. Recarga la página.', 'error');
                    }
                }
                const bForm = document.getElementById('bookingForm');
                if(bForm) {
                    bForm.onsubmit = handleBookingSubmit;
                    bForm.addEventListener('input', refreshBookingSummary);
                    bForm.addEventListener('change', refreshBookingSummary);
                    const submitBtn = bForm.querySelector('#btn-submit');
                    if (submitBtn) {
                        submitBtn.onclick = (ev) => {
                            // Fallback móvil: algunos WebView/Android pueden bloquear silenciosamente
                            // el submit nativo por validaciones de campos ocultos del wizard.
                            ev.preventDefault();
                            handleBookingSubmit({
                                preventDefault(){},
                                target: bForm,
                                currentTarget: bForm
                            });
                        };
                    }
                }
                const locSel = document.querySelector('select[name="location"]');
                if(locSel) locSel.onchange = e => {
                    if(bForm) bookingFormState={...bookingFormState,...Object.fromEntries(new FormData(bForm).entries())};
                    app.location=e.target.value;
                    bookingFormState.location=e.target.value;
                    updateCartUI();
                    // Navidad no necesita reconstruir el formulario por cambiar la zona.
                    // La reserva normal conserva su comportamiento histórico.
                    if (!isChristmasEveBooking()) renderBooking();
                };
                const normalGpsPanel=document.getElementById('normal-gps-panel');
                const normalManualPanel=document.getElementById('normal-manual-panel');
                const normalLocationBtn=document.getElementById('normal-use-location');
                const normalLoader=document.getElementById('normal-location-loader');
                const normalLoaderText=document.getElementById('normal-location-loader-text');
                const normalStatus=document.getElementById('normal-location-status');
                const normalManualZone=document.getElementById('normal-manual-zone');
                const normalManualAddress=document.getElementById('normal-manual-address');
                let locationRevision=0, cancelGpsSearch=()=>{}, pendingMapsLocation=Promise.resolve();
                const setNormalLocationMode=mode=>{
                    locationRevision++; cancelGpsSearch(); bookingFormState.normalLocationMode=mode;
                    if(isChristmasEveBooking()) return;
                    const manual=mode==='manual';
                    normalGpsPanel?.classList.toggle('hidden',manual);
                    normalManualPanel?.classList.toggle('hidden',!manual);
                    document.querySelectorAll('[data-normal-location-mode]').forEach(btn=>{
                        const active=btn.dataset.normalLocationMode===mode;
                        btn.setAttribute('aria-pressed',String(active));
                        btn.classList.toggle('border-[var(--s-primary)]',active);
                        btn.classList.toggle('bg-[color-mix(in_srgb,var(--s-primary)_12%,transparent)]',active);
                        btn.classList.toggle('border-[var(--s-glass-border)]',!active);
                        btn.classList.toggle('bg-black/5',!active);
                    });
                };
                document.querySelectorAll('[data-normal-location-mode]').forEach(btn=>btn.onclick=()=>{
                    const mode=btn.dataset.normalLocationMode||'gps';
                    if(mode==='gps' && normalLocationBtn?.disabled) return;
                    setNormalLocationMode(mode);
                    markNormalManualReview(mode==='manual'?document.getElementById('normal-manual-address').value:'');
                    if(mode==='gps' && normalLocationBtn) normalLocationBtn.click();
                });
                if(normalManualZone&&!isChristmasEveBooking()) normalManualZone.onchange=e=>{applyNormalManualZone(e.target.value); if(bForm?.elements?.location)bForm.elements.location.value=normalLocationState.label||'';};
                if(normalManualAddress&&!isChristmasEveBooking()) normalManualAddress.oninput=e=>{bookingFormState.address=e.target.value;if(bForm?.elements?.address)bForm.elements.address.value=e.target.value;};
                if (normalLocationBtn && !isChristmasEveBooking()) normalLocationBtn.onclick = async () => {
                    if (normalLocationBtn.disabled) return;
                    const revision = ++locationRevision;
                    const isCurrent = () => revision === locationRevision && bForm.isConnected;
                    if (!navigator.geolocation) { setNormalLocationMode('manual'); markNormalManualReview(document.getElementById('normal-manual-address').value); return showToast('Este dispositivo no permite obtener la ubicación. Puedes escribir la dirección.', 'error'); }
                    normalLocationBtn.disabled = true;
                    normalLoader?.classList.remove('hidden');
                    if (normalLoaderText) normalLoaderText.textContent = 'Buscando una ubicación más precisa…';
                    if (normalStatus) normalStatus.textContent = 'Buscando una lectura GPS nueva. Mantén el teléfono quieto unos segundos.';
                    const progress = showBookingGpsProgress(bForm, () => { if(!bForm.isConnected) { cancelGpsSearch(); return; } setNormalLocationMode('manual'); markNormalManualReview(document.getElementById('normal-manual-address').value); });
                    const search = captureBookingGps(bForm, isCurrent, point => {
                        progress.update(`Afinando ubicación · mejor lectura ±${Math.ceil(point.accuracy)} m…`);
                        if (normalStatus) normalStatus.textContent = `Afinando ubicación · mejor lectura ±${Math.ceil(point.accuracy)} m…`;
                        if (normalLoaderText) normalLoaderText.textContent = 'Afinando el punto GPS…';
                    });
                    let result = null;
                    const releaseControls = () => {
                        normalLoader?.classList.add('hidden');
                        normalLocationBtn.disabled = false;
                        if (locationContinue && bForm.dataset.sending !== '1') locationContinue.disabled = false;
                    };
                    if (locationContinue) locationContinue.disabled = true;
                    cancelGpsSearch = () => { search.cancel(); progress.close(); result?.close(); releaseControls(); };
                    try {
                        const point = await search.promise;
                        if (!isCurrent()) return;
                        progress.close();
                        if (normalStatus) normalStatus.textContent = gpsAccuracyMessage(point.accuracy);
                        result = showBookingGpsResult(bForm, { prefix: 'normal', accuracy: point.accuracy, ready: false, onContinue: () => locationContinue?.click() });
                        if (normalLoaderText) normalLoaderText.textContent = 'Verificando la zona…';
                        await applyNormalLocation(point.lat, point.lng, { source: 'gps', accuracy: point.accuracy, isCurrent });
                        if (!isCurrent()) return;
                        const addr=bForm?.elements?.address;
                        if(addr)addr.value=`https://www.google.com/maps?q=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
                        bookingFormState.address=addr?.value||bookingFormState.address||'';
                        if(bForm?.elements?.location)bForm.elements.location.value=normalLocationState.label||'';
                        if (normalStatus) normalStatus.textContent = gpsAccuracyMessage(point.accuracy);
                        normalLocationBtn.innerHTML = '<i data-lucide="map-pin-check" class="w-5 h-5"></i> Volver a medir ubicación';
                        if (window.lucide) lucide.createIcons();
                        result?.complete();
                    } catch (error) {
                        if (error?.code === 'GPS_CANCELLED' || !isCurrent()) return;
                        const message = error?.code === 1 ? 'Permite el acceso a tu ubicación o utiliza la dirección manual.' : 'No pudimos obtener tu ubicación. Inténtalo de nuevo o escribe la dirección.';
                        setNormalLocationMode('manual'); markNormalManualReview(document.getElementById('normal-manual-address').value);
                        if (normalStatus) normalStatus.textContent = message;
                        showToast(message, 'error');
                    } finally {
                        progress.close();
                        if (isCurrent()) releaseControls();
                    }
                };
                const markNormalManualReview=(value,{displayName='',point=null,source='manual-search'}={})=>{
                    const clean=String(value||'').trim();
                    const direct=mapsLocationFromUrl(clean);
                    const gps=point||direct?.point||gpsPointFromText(clean);
                    const name=displayName||direct?.displayName||clean;
                    const coverage=evaluateNormalCoverage(gps?.lat,gps?.lng,`${name} ${bForm?.elements?.normalReference?.value||''}`);
                    normalLocationState={...coverage,displayName:name,resolvedPlaceName:displayName||direct?.displayName||'',lat:gps?.lat??null,lng:gps?.lng??null,source};
                    delete bookingFormState.normalLat; delete bookingFormState.normalLng;
                    if(gps){bookingFormState.normalLat=gps.lat;bookingFormState.normalLng=gps.lng;}
                    bookingFormState.normalTransportCost=coverage.charge;bookingFormState.normalCoverageStatus=coverage.status;bookingFormState.normalCoverageLabel=coverage.label;bookingFormState.normalLocationName=name;bookingFormState.normalLocationSource=source;bookingFormState.address=clean;bookingFormState.location=coverage.label;
                    app.location=coverage.zoneValue||'';
                    if(bForm?.elements?.address)bForm.elements.address.value=clean;
                    if(bForm?.elements?.location)bForm.elements.location.value=coverage.label;
                    renderNormalCoverageStatus();
                };
                if(!isChristmasEveBooking()) renderNormalCoverageStatus();

                const normalResourceMessage=document.getElementById('normal-resource-message');
                const refreshNormalResources=async()=>{
                    if(isChristmasEveBooking()||!bForm)return true;
                    const date=String(bForm.elements?.date?.value||'');const time=String(bForm.elements?.time?.value||'');
                    if(!date||!time){if(normalResourceMessage)normalResourceMessage.textContent='Selecciona fecha y hora para comprobar el personal disponible.';return true;}
                    if(normalResourceMessage){normalResourceMessage.textContent='Comprobando animadores y payasos disponibles…';normalResourceMessage.className='mt-2 rounded-xl border border-[var(--s-glass-border)] bg-black/5 px-3 py-2 text-[11px] font-bold season-text-muted';}
                    const status=await checkNormalResourceAvailability(date,time);
                    bookingFormState.resourceStatus=status;
                    if(normalResourceMessage){
                        const parts=[];if(status.needed.animadores)parts.push(`${status.needed.animadores} animador${status.needed.animadores===1?'':'es'}`);if(status.needed.payasos)parts.push(`${status.needed.payasos} payaso${status.needed.payasos===1?'':'s'}`);
                        if(!parts.length){normalResourceMessage.textContent='✓ Horario disponible para solicitar.';normalResourceMessage.className='mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-600';}
                        else if(status.feasible){normalResourceMessage.textContent='✓ Tenemos disponibilidad operativa para solicitar este horario.';normalResourceMessage.className='mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-600';}
                        else{normalResourceMessage.textContent='⚠️ Este horario ya no tiene disponibilidad operativa. Elige otra hora.';normalResourceMessage.className='mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-600';}
                    }
                    return status.feasible;
                };
                if(!isChristmasEveBooking()&&bForm?.elements?.time)bForm.elements.time.addEventListener('change',refreshNormalResources);
                if(!isChristmasEveBooking()&&bForm?.elements?.date)bForm.elements.date.addEventListener('change',refreshNormalResources);
                const dateSel = bForm ? bForm.elements['date'] : null;
                if (dateSel && !isChristmasEveBooking()) bookingDatePickerCleanup = installBookingDatePicker(dateSel, document.getElementById('booking-open-date-picker'), {loadClosedDates:()=>loadClosedDates({force:true}),onError:message=>showToast(message,'error')});
                void loadClosedDates({force:true}).then(updateBookingDateClosures).catch(()=>{});
                dateSel?.addEventListener('change',updateBookingDateClosures);
                if (dateSel && !isChristmasEveBooking()) dateSel.addEventListener('change',e=>{
                    const value=String(e.target.value||'').slice(0,10);
                    if(value==='2026-12-24'||value==='2026-12-25'){
                        e.target.value=''; selectedCalendarDate=null; bookingFormState.date='';
                        showToast('El 24 y 25 de diciembre están reservados exclusivamente para Entregas de Santa.', 'info');
                        return;
                    }
                    selectedCalendarDate = value || null;
                    bookingFormState.date = value;
                });
                if (dateSel && isChristmasEveBooking()) dateSel.onchange = async e => {
                    // Rendimiento: cambiar la fecha NO reconstruye toda la página.
                    // Conserva GPS, referencia y paso actual; solo recalcula horas/cupos.
                    if (bForm) bookingFormState = {...bookingFormState,...Object.fromEntries(new FormData(bForm).entries())};
                    selectedCalendarDate = normalizeChristmasDate(e.target.value);
                    bookingFormState.date = selectedCalendarDate;
                    const timeSelect = bForm?.elements?.time;
                    if (timeSelect) {
                        const previousTime = String(bookingFormState.time || timeSelect.value || '');
                        if (selectedCalendarDate === '2026-12-24') timeSelect.innerHTML = makeTimeOptions(16 * 60, 23 * 60 + 30, { christmasDate: selectedCalendarDate });
                        else if (selectedCalendarDate === '2026-12-25') timeSelect.innerHTML = makeTimeOptions(0, 14 * 60, { christmasDate: selectedCalendarDate });
                        else timeSelect.innerHTML = '<option value="" style="color:black">Selecciona 24 o 25 de diciembre</option>';
                        if (previousTime && Array.from(timeSelect.options).some(o => o.value === previousTime && !o.disabled)) timeSelect.value = previousTime;
                        else { timeSelect.value = ''; bookingFormState.time = ''; }
                    }
                    await refreshChristmasTimeAvailability();
                };
                const christmasLocationBtn = document.getElementById('christmas-use-location');
                const christmasGpsPanel = document.getElementById('christmas-gps-panel');
                const christmasManualPanel = document.getElementById('christmas-manual-panel');
                const christmasLoader = document.getElementById('christmas-location-loader');
                const christmasLoaderText = document.getElementById('christmas-location-loader-text');
                const christmasStatus = document.getElementById('christmas-location-status');
                const setChristmasLocationMode = mode => {
                    locationRevision++; cancelGpsSearch(); bookingFormState.christmasLocationMode=mode;
                    const manual=mode==='manual';
                    christmasGpsPanel?.classList.toggle('hidden',manual);
                    christmasManualPanel?.classList.toggle('hidden',!manual);
                    document.querySelectorAll('[data-christmas-location-mode]').forEach(btn=>{
                        const active=btn.dataset.christmasLocationMode===mode;
                        btn.setAttribute('aria-pressed',String(active));
                        btn.classList.toggle('border-[var(--s-primary)]',active);
                        btn.classList.toggle('bg-[color-mix(in_srgb,var(--s-primary)_12%,transparent)]',active);
                        btn.classList.toggle('border-[var(--s-glass-border)]',!active);
                        btn.classList.toggle('bg-black/5',!active);
                    });
                };
                document.querySelectorAll('[data-christmas-location-mode]').forEach(btn=>btn.onclick=()=>{
                    const mode=btn.dataset.christmasLocationMode||'gps';
                    if(mode==='gps' && christmasLocationBtn?.disabled) return;
                    setChristmasLocationMode(mode);
                    markChristmasManualReview(mode==='manual'?document.getElementById('christmas-manual-address').value:'');
                    if(mode==='gps') requestAnimationFrame(()=>christmasLocationBtn?.click());
                });
                if (christmasLocationBtn && isChristmasEveBooking()) christmasLocationBtn.onclick = async () => {
                    if (christmasLocationBtn.disabled) return;
                    const revision = ++locationRevision;
                    const isCurrent = () => revision === locationRevision && bForm.isConnected;
                    if (!navigator.geolocation) { setChristmasLocationMode('manual'); markChristmasManualReview(document.getElementById('christmas-manual-address').value); return showToast('Este dispositivo no permite obtener la ubicación. Puedes escribir la dirección.', 'error'); }
                    christmasLocationBtn.disabled = true;
                    christmasLoader?.classList.remove('hidden');
                    if (christmasLoaderText) christmasLoaderText.textContent = 'Buscando una ubicación más precisa…';
                    if (christmasStatus) christmasStatus.textContent = 'Buscando una lectura GPS nueva. Mantén el teléfono quieto unos segundos.';
                    const progress = showBookingGpsProgress(bForm, () => { if(!bForm.isConnected) { cancelGpsSearch(); return; } setChristmasLocationMode('manual'); markChristmasManualReview(document.getElementById('christmas-manual-address').value); });
                    const search = captureBookingGps(bForm, isCurrent, point => {
                        progress.update(`Afinando ubicación · mejor lectura ±${Math.ceil(point.accuracy)} m…`);
                        if (christmasStatus) christmasStatus.textContent = `Afinando ubicación · mejor lectura ±${Math.ceil(point.accuracy)} m…`;
                        if (christmasLoaderText) christmasLoaderText.textContent = 'Afinando el punto GPS…';
                    });
                    let result = null;
                    const releaseControls = () => {
                        christmasLoader?.classList.add('hidden');
                        christmasLocationBtn.disabled = false;
                        if (locationContinue && bForm.dataset.sending !== '1') locationContinue.disabled = false;
                    };
                    if (locationContinue) locationContinue.disabled = true;
                    cancelGpsSearch = () => { search.cancel(); progress.close(); result?.close(); releaseControls(); };
                    try {
                        const point = await search.promise;
                        if (!isCurrent()) return;
                        progress.close();
                        if (christmasStatus) christmasStatus.textContent = gpsAccuracyMessage(point.accuracy);
                        result = showBookingGpsResult(bForm, { prefix: 'christmas', accuracy: point.accuracy, ready: false, onContinue: () => locationContinue?.click() });
                        if (christmasLoaderText) christmasLoaderText.textContent = 'Verificando la zona…';
                        await applyChristmasLocation(point.lat, point.lng, { source: 'gps', accuracy: point.accuracy, isCurrent });
                        if (!isCurrent()) return;
                        if (christmasStatus) christmasStatus.textContent = gpsAccuracyMessage(point.accuracy);
                        christmasLocationBtn.innerHTML = '<i data-lucide="map-pin-check" class="w-5 h-5"></i> Volver a medir ubicación';
                        if (window.lucide) lucide.createIcons();
                        result?.complete();
                    } catch (error) {
                        if (error?.code === 'GPS_CANCELLED' || !isCurrent()) return;
                        const message = error?.code === 1 ? 'Permite el acceso a tu ubicación o utiliza la dirección manual.' : 'No pudimos obtener tu ubicación. Inténtalo de nuevo o escribe la dirección.';
                        setChristmasLocationMode('manual'); markChristmasManualReview(document.getElementById('christmas-manual-address').value);
                        if (christmasStatus) christmasStatus.textContent = message;
                        showToast(message, 'error');
                    } finally {
                        progress.close();
                        if (isCurrent()) releaseControls();
                    }
                };
                const markChristmasManualReview=value=>{
                    const clean=String(value||'').trim();
                    const point=gpsPointFromText(clean);
                    const coverage=point?evaluateChristmasCoverage(point.lat,point.lng,clean):{status:'review',charge:0,label:'Ubicación por confirmar'};
                    christmasLocationState={...coverage,displayName:clean,lat:point?.lat??null,lng:point?.lng??null,source:'manual'};
                    delete bookingFormState.christmasLat; delete bookingFormState.christmasLng;
                    if(point){bookingFormState.christmasLat=point.lat;bookingFormState.christmasLng=point.lng;}
                    bookingFormState.christmasTransportCost=coverage.charge; bookingFormState.christmasCoverageStatus=coverage.status; bookingFormState.christmasCoverageLabel=coverage.label; bookingFormState.christmasLocationName=clean; bookingFormState.christmasLocationSource='manual'; bookingFormState.address=clean; bookingFormState.location=coverage.label;
                    if(bForm?.elements?.address) bForm.elements.address.value=clean;
                    if(bForm?.elements?.location) bForm.elements.location.value=coverage.label;
                    renderChristmasCoverageStatus();
                };
                for(const prefix of ['normal','christmas']){
                    const input=document.getElementById(prefix+'-manual-address');
                    if(input) input.oninput=()=>{
                        locationRevision++;
                        bookingFormState[prefix+'ManualAddress']=input.value;
                        (prefix==='christmas'?markChristmasManualReview:markNormalManualReview)(input.value);
                        if(prefix==='normal'){
                            const value=input.value.trim(),revision=locationRevision;
                            pendingMapsLocation=shortMapsUrl(value)?readMapsLocation(value).then(data=>{
                                if(data&&revision===locationRevision&&bForm.isConnected&&input.value.trim()===value)markNormalManualReview(value,{...data,source:'maps-link'});
                            }):Promise.resolve();
                        }
                    };
                }
                const locationContinue=document.querySelector('[data-location-continue]');
                if(locationContinue) locationContinue.onclick=async()=>{
                    const prefix=isChristmasEveBooking()?'christmas':'normal';
                    const input=document.getElementById(prefix+'-manual-address');
                    const reference=String(bForm.elements[prefix+'Reference']?.value||'').trim();
                    if(bookingFormState[prefix+'LocationMode']==='manual' && !input.value.trim() && reference){
                        input.value=reference; input.dispatchEvent(new Event('input',{bubbles:true}));
                    }
                    if(isChristmasEveBooking()){
                        locationContinue.disabled=true;
                        try {await bn?.onclick?.();} finally {locationContinue.disabled=false;}
                    } else {
                        if(locationContinue.disabled)return;
                        locationContinue.disabled=true;
                        const original=locationContinue.innerHTML;
                        try{
                            let resolving;
                            do{
                                resolving=pendingMapsLocation;
                                if(shortMapsUrl(normalManualAddress?.value))locationContinue.textContent='Verificando ubicación…';
                                await resolving;
                            }while(bForm.isConnected&&resolving!==pendingMapsLocation);
                        }finally{locationContinue.disabled=false;locationContinue.innerHTML=original;}
                        if(bForm.isConnected)bForm.requestSubmit();
                    }
                };
                document.querySelectorAll('[data-christmas-date-choice]').forEach(btn=>btn.onclick=async()=>{
                    const value=btn.dataset.christmasDateChoice||''; const dateInput=bForm?.elements?.date; if(!dateInput) return;
                    if (btn.disabled || !await checkDateOpen(value)) return;
                    selectedCalendarDate=value; bookingFormState.date=value; dateInput.value=value;
                    document.querySelectorAll('[data-christmas-date-choice]').forEach(x=>{
                        const active=x.dataset.christmasDateChoice===value;
                        x.classList.toggle('border-emerald-500',active); x.classList.toggle('bg-emerald-500/15',active); x.classList.toggle('ring-2',active); x.classList.toggle('ring-emerald-500/20',active);
                        x.classList.toggle('border-[var(--s-glass-border)]',!active); x.classList.toggle('bg-black/5',!active);
                    });
                    dateInput.dispatchEvent(new Event('change',{bubbles:true}));
                });
                renderChristmasCoverageStatus();
                if(bForm && Object.keys(bookingFormState).length>0){ for(let k in bookingFormState){ if(bForm.elements[k]) bForm.elements[k].value=bookingFormState[k]; } }
                if(isChristmasEveBooking()) setChristmasLocationMode(bookingFormState.christmasLocationMode||'gps');
                else setNormalLocationMode(bookingFormState.normalLocationMode||'gps');
                const christmasTimeSelect = bForm?.elements?.time;
                const christmasTimeMessage = document.getElementById('christmas-time-message');
                const christmasTimeIsUnavailable = () => {
                    if (!isChristmasEveBooking() || !christmasTimeSelect) return false;
                    const opt = christmasTimeSelect.options[christmasTimeSelect.selectedIndex];
                    return !!opt && (opt.disabled || /NO DISPONIBLE|AGOTADO/i.test(opt.textContent || ''));
                };
                const parseChristmasGps = () => {
                    const stateLat = Number(bookingFormState.christmasLat);
                    const stateLng = Number(bookingFormState.christmasLng);
                    if (Number.isFinite(stateLat) && Number.isFinite(stateLng) &&
                        Math.abs(stateLat) <= 90 && Math.abs(stateLng) <= 180 &&
                        !(stateLat === 0 && stateLng === 0)) {
                        return { lat:stateLat, lng:stateLng };
                    }
                    const raw = String(bForm?.elements?.address?.value || bookingFormState.address || '');
                    const m = raw.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
                    if (!m) return null;
                    const lat = Number(m[1]), lng = Number(m[2]);
                    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
                };
                const timeMinutes = christmasRouteTimeMinutes;
                const routeRecommendation = (date, time, capacity = christmasCapacityCache.value) => {
                    return computeChristmasSmartRoute(date,time,capacity,parseChristmasGps(),routeEvents);
                };
                const renderChristmasTimeCards = (date, capacity) => {
                    const wrap=document.getElementById('christmas-time-cards');
                    if (!wrap || !christmasTimeSelect) return;
                    const selected=String(christmasTimeSelect.value||'');
                    const rankOrder={best:0,good:1,available:2,blocked:3};
                    const rows=Array.from(christmasTimeSelect.options).filter(o=>o.value).map(opt=>{
                        const base=String(opt.textContent||'').split(' — ')[0];
                        const rank=String(opt.dataset.routeRank||'available');
                        const full=!!opt.disabled;
                        const remainingMatch=String(opt.textContent||'').match(/(\d+) cupo/);
                        const remaining=remainingMatch ? Number(remainingMatch[1]) : capacity;
                        const blockReason=/ruta no viable/i.test(opt.textContent||'')?'route':(/máximo de Santas/i.test(opt.textContent||'')?'capacity':'');
                        return {value:opt.value,base,rank,full,remaining,blockReason};
                    });
                    rows.sort((a,b)=>(rankOrder[a.rank]??2)-(rankOrder[b.rank]??2)||timeMinutes(a.value)-timeMinutes(b.value));
                    wrap.innerHTML=rows.map(r=>{
                        const active=selected===r.value;
                        const isBest=r.rank==='best', isGood=r.rank==='good';
                        const cls=r.full
                          ? 'opacity-45 cursor-not-allowed border-white/10 bg-white/5'
                          : active
                            ? 'ring-2 ring-amber-300 border-amber-300/70 bg-amber-400/20'
                            : isBest
                              ? 'border-amber-300/70 bg-amber-400/15 shadow-sm'
                              : isGood
                                ? 'border-emerald-300/45 bg-emerald-400/10 shadow-sm'
                                : 'border-white/15 bg-white/5';
                        const badge=r.full ? (r.blockReason==='route'?'NO DISPONIBLE · RUTA':'NO DISPONIBLE · CUPO') : isBest ? '⭐ MEJOR OPCIÓN' : isGood ? '✓ BUENA OPCIÓN' : (r.remaining<capacity ? `${r.remaining} CUPO${r.remaining===1?'':'S'}` : 'DISPONIBLE');
                        const badgeClass=isBest?'text-amber-300':isGood?'text-emerald-300':'season-text-muted';
                        return `<button type="button" data-christmas-time="${r.value}" ${r.full?'disabled':''} class="christmas-time-card min-h-[74px] rounded-2xl border px-3 py-3 text-left transition active:scale-[.98] ${cls}"><span class="block text-base font-black season-text-title">${r.base}</span><span class="mt-1 block text-[10px] font-extrabold tracking-wide ${badgeClass}">${badge}</span></button>`;
                    }).join('');
                    wrap.querySelectorAll('[data-christmas-time]').forEach(btn=>btn.addEventListener('click',()=>{
                        if (btn.disabled) return;
                        christmasTimeSelect.value=btn.dataset.christmasTime||'';
                        christmasTimeSelect.dispatchEvent(new Event('change',{bubbles:true}));
                        renderChristmasTimeCards(date,capacity);
                        confirmChristmasTime();
                    }));
                };
                const refreshChristmasTimeAvailability = async () => {
                    if (!isChristmasEveBooking() || !christmasTimeSelect) return;
                    const rawDate = bForm?.elements?.date?.value || bookingFormState.date || '';
                    const christmasDate = normalizeChristmasDateForSubmit(rawDate);
                    if (!christmasDate) return;
                    try {
                        // Navidad debe reflejar inmediatamente lo que la app acaba de aceptar,
                        // rechazar o eliminar. Forzamos una lectura fresca para no mantener cupos
                        // fantasma durante los 60 s del caché local del navegador.
                        await loadBookedEventsForMonth(new Date(`${christmasDate}T12:00:00`), {force:true});
                        await loadRouteEventsForMonth(new Date(`${christmasDate}T12:00:00`), {force:true});
                        const configuredCapacity = await getChristmasCapacity();
                        const capacity = Math.max(1, Number(configuredCapacity) || 1);
                        const optionInfos=Array.from(christmasTimeSelect.options).filter(opt=>opt.value).map(opt=>{
                            const safeSlot = `${christmasDate}_${String(opt.value).replace(':','-')}`.replace(/[^0-9A-Za-z_-]/g,'');
                            const slotId = `slot_santa_${safeSlot}`;
                            const slot = bookedEvents.find(ev => ev._availabilityId === slotId);
                            const individualCount = bookedEvents.filter(ev => {
                                const id = String(ev._availabilityId || '');
                                if (!id || id.startsWith('slot_') || !isChristmasAvailabilityRow(ev)) return false;
                                return String(ev.fecha || '') === christmasDate && String(ev.hora || '') === String(opt.value);
                            }).length;
                            // La disponibilidad visible se calcula con reservas reales, no con el
                            // contador auxiliar `slot_santa_*`. El slot sigue protegiendo la transacción
                            // al confirmar, pero un slot huérfano ya no bloquea horarios en pantalla.
                            const count = individualCount;
                            const fullByCapacity = dateClosures[christmasDate] === true || count >= capacity;
                            const hint = !fullByCapacity ? routeRecommendation(christmasDate, opt.value, capacity) : null;
                            return {opt,count,fullByCapacity,hint,base:String(opt.textContent||'').split(' — ')[0]};
                        });

                        const candidates=optionInfos.filter(x=>!x.fullByCapacity&&x.hint?.feasible&&x.hint.anchors>0&&Number.isFinite(x.hint.nearestKm)&&x.hint.nearestKm<=10&&Number.isFinite(x.hint.nearestTimeGap)&&x.hint.nearestTimeGap<=120)
                            .sort((a,b)=>a.hint.score-b.hint.score||timeMinutes(a.opt.value)-timeMinutes(b.opt.value));
                        const bestInfo=candidates[0]||null;
                        const bestScore=bestInfo?.hint?.score ?? null;

                        optionInfos.forEach(info=>{
                            const {opt,count,fullByCapacity,hint,base}=info;
                            const routeBlocked=!fullByCapacity&&hint&&hint.feasible===false;
                            const isBest=!!bestInfo&&opt.value===bestInfo.opt.value;
                            const isGood=!isBest&&!fullByCapacity&&!routeBlocked&&hint?.feasible&&hint.anchors>0&&Number.isFinite(hint.nearestKm)&&hint.nearestKm<=10&&Number.isFinite(hint.nearestTimeGap)&&hint.nearestTimeGap<=120&&bestScore!==null&&hint.score<=bestScore+12;
                            opt.disabled=fullByCapacity||routeBlocked;
                            opt.dataset.routeRank=opt.disabled?'blocked':isBest?'best':isGood?'good':'available';
                            opt.dataset.santa=hint?.bestSanta||'';
                            opt.dataset.routeScore=Number.isFinite(hint?.score)?String(hint.score):'';
                            const remaining=Math.max(0,capacity-count);
                            const cupos=count>0?` · ${remaining} cupo${remaining===1?'':'s'}`:'';
                            if(fullByCapacity) opt.textContent=`${base} — NO DISPONIBLE · máximo de Santas`;
                            else if(routeBlocked) opt.textContent=`${base} — NO DISPONIBLE · ruta no viable`;
                            else if(isBest) opt.textContent=`${base} — ⭐ MEJOR OPCIÓN PARA TU ZONA${cupos}`;
                            else if(isGood) opt.textContent=`${base} — ✓ BUENA OPCIÓN PARA TU ZONA${cupos}`;
                            else opt.textContent=count>0?`${base} — ${remaining} cupo${remaining===1?'':'s'}`:`${base} — Disponible`;
                        });
                        if (christmasTimeSelect.value && christmasTimeIsUnavailable()) christmasTimeSelect.value = '';
                        const selectedOpt=christmasTimeSelect.options[christmasTimeSelect.selectedIndex];
                        bookingFormState.christmasSuggestedSanta=selectedOpt?.dataset?.santa||'';
                        renderChristmasTimeCards(christmasDate, capacity);
                        if (christmasTimeMessage) christmasTimeMessage.textContent = bestInfo
                            ? '⭐ Mejor opción = menor recorrido estimado para el Santa disponible. ✓ Buena opción también mantiene una ruta eficiente.'
                            : '✓ Horarios calculados con la disponibilidad y las rutas actuales de los Santas.';
                        if (christmasTimeMessage) christmasTimeMessage.style.whiteSpace = 'pre-line';
                    } catch (_) {
                        if (christmasTimeMessage) christmasTimeMessage.textContent = 'No pudimos actualizar los cupos ahora. Se volverán a validar al confirmar.';
                    }
                };
                if (christmasTimeSelect && isChristmasEveBooking()) {
                    christmasTimeSelect.addEventListener('change', () => {
                        if (christmasTimeIsUnavailable()) {
                            christmasTimeSelect.value = '';
                            bookingFormState.christmasSuggestedSanta='';
                            showToast('Ese horario no está disponible. Intenta con otro horario.', 'error');
                            if (christmasTimeMessage) christmasTimeMessage.textContent = '⚠️ Ese horario ya no es viable para las rutas actuales. Selecciona otro.';
                        } else if (christmasTimeSelect.value && christmasTimeMessage) {
                            const opt=christmasTimeSelect.options[christmasTimeSelect.selectedIndex];
                            bookingFormState.time=christmasTimeSelect.value;
                            bookingFormState.christmasSuggestedSanta=opt?.dataset?.santa||'';
                            const rank=String(opt?.dataset?.routeRank||'available');
                            christmasTimeMessage.textContent = rank==='best'
                                ? '⭐ Excelente: este es el horario que menos recorrido agrega a las rutas actuales.'
                                : rank==='good'
                                  ? '✓ Buena opción: este horario encaja bien con una ruta existente.'
                                  : '✓ Horario disponible. Si aparece ⭐, esa opción ayuda más a reducir traslados.';
                        }
                    });
                }
                let cs = app.wizardStep;
                const updUI = () => {
                    app.wizardStep=cs;
                    document.querySelectorAll('.wizard-content').forEach((el,i)=>el.classList.toggle('active',i+1===cs));
                    const pb = document.getElementById('wizard-progress-bar'); if(pb) pb.style.width=`${((cs-1)/2)*100}%`;
                    document.querySelectorAll('.wizard-step').forEach((el,i)=>{
                        const ic=el.querySelector('.wizard-icon'), ts=el.querySelector('.wizard-text');
                        if(i+1<=cs){ el.classList.remove('opacity-50'); if(ic)ic.classList.add('season-btn','text-white'); if(ts)ts.classList.add('season-text-title'); }
                        else { el.classList.add('opacity-50'); if(ic)ic.classList.remove('season-btn','text-white'); if(ts)ts.classList.remove('season-text-title'); }
                    });
                    const bp=document.getElementById('btn-prev'), bn=document.getElementById('btn-next'), bs=document.getElementById('btn-submit');
                    if(bp) cs===1?bp.classList.add('hidden'):bp.classList.remove('hidden');
                    if(bn) bn.classList.toggle('hidden',cs===3 || (isChristmasEveBooking() && cs===1));
                    if(bs) bs.classList.toggle('hidden',cs!==3 || !isChristmasEveBooking());
                };
                updUI();
                const bn=document.getElementById('btn-next'), bp=document.getElementById('btn-prev');
                const confirmChristmasTime = () => {
                    if (!isChristmasEveBooking() || cs !== 2 || !christmasTimeSelect?.value || christmasTimeIsUnavailable()) return;
                    const option=christmasTimeSelect.options[christmasTimeSelect.selectedIndex];
                    const selectedTime=christmasTimeSelect.value;
                    const selectedDate=bForm.elements.date.value;
                    const dialog=document.createElement('dialog');
                    dialog.id='christmas-time-confirmation';
                    dialog.className='w-full max-w-sm rounded-3xl border border-[var(--s-glass-border)] bg-[var(--s-bg-color)] p-6 shadow-2xl season-text-title';
                    dialog.setAttribute('aria-labelledby','christmas-time-confirm-title');
                    dialog.setAttribute('aria-describedby','christmas-time-confirm-details');
                    dialog.innerHTML=`<h3 id="christmas-time-confirm-title" class="text-xl font-extrabold">Confirmar horario 🎅</h3>
                        <p id="christmas-time-confirm-details" class="mt-4 text-lg font-bold"></p>
                        <p class="mt-3 text-sm season-text-muted">Pulsa Seguir para continuar con tus datos de contacto.</p>
                        <div class="mt-6 flex flex-col gap-3"><button type="button" data-christmas-time-continue class="season-btn w-full rounded-2xl py-3.5 font-bold" autofocus>Seguir</button>
                        <button type="button" data-christmas-time-change class="w-full rounded-2xl py-3.5 bg-black/10 font-bold">Cambiar hora</button></div>`;
                    const dateLabel=new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-PA',{day:'numeric',month:'long'});
                    dialog.querySelector('#christmas-time-confirm-details').textContent=`${dateLabel} · ${String(option.textContent||'').split(' — ')[0]}`;
                    const follow=dialog.querySelector('[data-christmas-time-continue]');
                    const change=dialog.querySelector('[data-christmas-time-change]');
                    let checking=false;
                    dialog.addEventListener('cancel',event=>{if(checking) event.preventDefault();});
                    dialog.addEventListener('close',()=>{
                        dialog.remove();
                        const focusTarget=cs===2
                            ? document.querySelector(`[data-christmas-time="${christmasTimeSelect.value||selectedTime}"]:not([disabled])`) || bn
                            : document.querySelector('#step-3 h3');
                        if(focusTarget){if(cs===3) focusTarget.tabIndex=-1;focusTarget.focus({preventScroll:true});}
                    },{once:true});
                    change.onclick=()=>dialog.close();
                    follow.onclick=async()=>{
                        if(checking) return;
                        checking=true;follow.disabled=true;change.disabled=true;
                        follow.textContent='Comprobando horario…';
                        try {
                            // Reutiliza las validaciones y la navegación de Siguiente.
                            // Este paso no envía ni guarda la solicitud.
                            if(cs===2 && bForm.isConnected && christmasTimeSelect.value===selectedTime && bForm.elements.date.value===selectedDate) await bn.onclick();
                        } finally {dialog.close();}
                    };
                    bForm.appendChild(dialog);
                    dialog.showModal();
                };
                // NAVIDAD: usa el mismo submit estable de Diverty. El formulario ya lleva
                // novalidate y handleBookingSubmit ejecuta las validaciones especiales explícitas.
                let advancing=false;
                if(bn) bn.onclick=async()=>{
                    if(advancing || cs>=3) return;
                    advancing=true;bn.disabled=true;if(bp) bp.disabled=true;
                    try {
                    if (isChristmasEveBooking() && cs === 1) {
                        let locationValue=String(bForm?.elements?.address?.value || bookingFormState.address || '').trim();
                        const manualInput=document.getElementById('christmas-manual-address');
                        const manualValue=String(manualInput?.value||'').trim();
                        // Si escribió un PH/barriada/sala pero no pulsó Buscar, conservamos el dato
                        // como revisión manual en vez de perder al cliente.
                        if(!locationValue && bookingFormState.christmasLocationMode==='manual' && manualValue.length>=3){ markChristmasManualReview(manualValue); locationValue=manualValue; }
                        if(locationValue.length<3){
                            showToast('Indica dónde será la entrega: usa el GPS o escribe el PH, barriada o sala de eventos.', 'error');
                            return;
                        }
                        if(needsPlaceReference({direccion:locationValue,referenciaLugar:bForm?.elements?.christmasReference?.value})){
                            showToast('Escribe la barriada, PH o salón del evento. El GPS solo marca el punto.','error');
                            bForm?.elements?.christmasReference?.focus();
                            return;
                        }
                        if(christmasLocationState.status==='review'){
                            renderChristmasCoverageStatus();
                            showToast('Puedes continuar. Revisaremos esta ubicación antes de aceptar la reserva.', 'info');
                        }
                    }
                    if (cs === 2 && !await checkDateOpen(bForm?.elements?.date?.value)) return;
                    if (cs === 2 && isChristmasEveBooking()) {
                        await refreshChristmasTimeAvailability();
                        if (christmasTimeIsUnavailable()) {
                            if (christmasTimeSelect) christmasTimeSelect.value = '';
                            showToast('Ese horario no está disponible. Intenta con otro horario.', 'error');
                            if (christmasTimeMessage) christmasTimeMessage.textContent = '⚠️ Ese horario ya no está disponible. Selecciona otro para continuar.';
                            return;
                        }
                    }
                    if (cs === 2 && !isChristmasEveBooking()) {
                        const resourceOk = await refreshNormalResources();
                        if (!resourceOk) {
                            showToast('No hay suficiente personal disponible para ese horario. Elige otra hora.', 'error');
                            return;
                        }
                    }
                    const inp = document.getElementById(`step-${cs}`)?.querySelectorAll('input[required],select[required],textarea[required]')||[];
                    let val=true; for(let i of inp){ if(!i.checkValidity()){ i.reportValidity(); val=false; break; } }
                    if(val && bForm.isConnected && app.activeSection==='booking'){
                        cs++;
                        if(bForm) bookingFormState={...bookingFormState,...Object.fromEntries(new FormData(bForm).entries())};
                        // Al pasar de Ubicación -> Horario en Navidad, recalcula AHORA,
                        // cuando el GPS del cliente ya existe. Este era el punto que faltaba.
                        if (isChristmasEveBooking() && cs === 2) {
                            bookedEventsMonthCache.clear(); routeEventsMonthCache.clear();
                            await refreshChristmasTimeAvailability();
                        }
                        if(!bForm.isConnected || app.activeSection!=='booking') return;
                        try{ history.pushState({ ...(history.state || {}), divertyBookingWizard: true, bookingStep: cs }, '', window.location.href); }catch(_){}
                        updUI();
                        requestAnimationFrame(()=>{ const formTop=document.getElementById('bookingForm'); if(formTop) formTop.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(()=>{ const first=document.getElementById(`step-${cs}`)?.querySelector('input:not([type=hidden]),select,textarea'); if(first && window.innerWidth<=767 && !isChristmasEveBooking()){ try{ first.focus({preventScroll:true}); }catch(e){ first.focus(); } } },220); });
                    }
                    } finally {advancing=false;bn.disabled=false;if(bp) bp.disabled=false;}
                };
                if(bp) bp.onclick=async()=>{
                    if(cs<=1 || advancing) return;
                    if(bForm) bookingFormState={...bookingFormState,...Object.fromEntries(new FormData(bForm).entries())};
                    if(history.state?.divertyBookingWizard && Number(history.state.bookingStep)===cs){history.back();return;}
                    cs--;
                    if(cs===2 && isChristmasEveBooking()) await refreshChristmasTimeAvailability();
                    updUI();
                    history.replaceState({...history.state,bookingStep:cs},'',window.location.href);
                    requestAnimationFrame(()=>bForm.scrollIntoView({behavior:'smooth',block:'start'}));
                };
                // Navidad inicia por GPS. La disponibilidad se actualiza al llegar al paso Horario,
                // después de conocer la ubicación exacta del cliente.
                if (isChristmasEveBooking() && christmasTimeMessage) {
                    christmasTimeMessage.textContent = '📍 Comparte primero tu ubicación. Después te mostraremos los horarios disponibles.';
                    if(cs===2) refreshChristmasTimeAvailability();
                }
                if(bForm){
                    bForm.addEventListener('focusin',()=>{ if(window.innerWidth<=767) document.body.classList.add('booking-keyboard-open'); });
                    bForm.addEventListener('focusout',()=>{ setTimeout(()=>{ if(!bForm.contains(document.activeElement)) document.body.classList.remove('booking-keyboard-open'); },120); });
                }

                const savedData = readBrowserStorage('localStorage', 'datosClienteDiverty');
                if (savedData) {
                    try {
                        const parsed = JSON.parse(savedData);
                        const nameInp = document.querySelector('input[name="name"]');
                        const emailInp = document.querySelector('input[name="email"]');
                        const phoneInp = document.querySelector('input[name="phone"]');
                        if(nameInp && parsed.nombre && !Object.prototype.hasOwnProperty.call(bookingFormState, 'name')) nameInp.value = parsed.nombre;
                        if(emailInp && parsed.email && !Object.prototype.hasOwnProperty.call(bookingFormState, 'email')) emailInp.value = parsed.email;
                        if(phoneInp && parsed.telefono && !Object.prototype.hasOwnProperty.call(bookingFormState, 'phone')) phoneInp.value = parsed.telefono;
                    } catch(e){}
                }
            }
        }

        function updateCartBadgeAndTotals() {
            const count = app.cart.reduce((s, i) => s + i.quantity, 0);
            const sub = app.cart.reduce((s, i) => s + (Number(i.price)*i.quantity), 0);
            
            const tc = effectiveTransportCost(count);
            
            let dv = 0; if(appliedCoupon && count>0) dv = appliedCoupon.type==='percent' ? sub*(Number(appliedCoupon.discount)/100) : Number(appliedCoupon.discount);
            dv=Math.min(sub,Math.max(0,dv)); const ft = sub - dv + tc;

            const ice = document.getElementById('itemCount');
            const tpe = document.getElementById('totalPrice');
            const cse = document.getElementById('cartSummary');
            const hcb = document.getElementById('headerCartBadge');
            const scb = document.getElementById('summaryCartBadge');

            if(ice) ice.textContent = count;
            if(tpe) tpe.textContent = `$${Math.max(0,ft).toFixed(2)}`;

            // La notificación oficial queda sobre el carrito de la barra superior.
            if(hcb){
                hcb.textContent = count > 99 ? '99+' : String(count);
                hcb.setAttribute('aria-label', `${count} ${count === 1 ? 'producto' : 'productos'} en el carrito`);
                hcb.classList.toggle('show', count > 0);
            }
            if(scb){
                scb.textContent = count > 99 ? '99+' : String(count);
                scb.style.display = count > 0 ? 'flex' : 'none';
                scb.setAttribute('aria-label', `${count} ${count === 1 ? 'producto' : 'productos'} en el carrito`);
            }

            // Resumen flotante: aparece solo cuando hay productos.
            if(cse) cse.classList.toggle('hidden', count === 0);
            document.body.classList.toggle('has-cart', count > 0);
            
            const cte = document.getElementById('cartTotal'), tce = document.getElementById('transportCost'), fte = document.getElementById('finalTotal'), dr = document.getElementById('discountRow'), dae = document.getElementById('discountAmount');
            if(cte) cte.textContent = `$${sub.toFixed(2)}`; if(tce) tce.textContent = `$${tc.toFixed(2)}`;
            if(dv>0 && dr){ dr.classList.remove('hidden'); if(dae) dae.textContent = `-$${dv.toFixed(2)}`; } else if(dr) dr.classList.add('hidden');
            if(fte) fte.textContent = `$${Math.max(0,ft).toFixed(2)}`;
            
            const cle = document.getElementById('cartLocation'); if(cle && cle.value !== app.location) cle.value = app.location;
            refreshBookingSummary();
        }

        function renderCartItemsHTML() {
            const cie = document.getElementById('cartItems');
            const footer = document.getElementById('cartTotalsFooter');
            const emptyBtn = document.getElementById('emptyCartBtn');
            
            if(!cie) return;
            
            if(app.cart.length===0) {
                cie.innerHTML=`<div class="cart-empty-state animate-slide-up"><div class="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4"><i data-lucide="shopping-cart" class="w-8 h-8 text-rose-500"></i></div><h3 class="text-lg font-black text-slate-800 mb-2">Tu carrito está vacío</h3><p class="text-slate-500 font-medium text-xs mb-6 max-w-[240px] mx-auto leading-relaxed">Puedes cerrar el carrito y seguir explorando nuestros paquetes.</p><button data-action="close-modal" class="cart-empty-action active:scale-95 transition-transform"><i data-lucide="arrow-left" class="w-4 h-4"></i> Seguir navegando</button></div>`;
                if(footer) footer.classList.add('hidden');
                if(emptyBtn) emptyBtn.classList.add('hidden');
            }
            else {
                cie.innerHTML='<div class="space-y-3 pt-2 pb-4">'+app.cart.map(i=>`
                    <div class="cart-item-card group relative">
                        <div class="contents">
                            <img src="${optimizeCloudinaryImage(i.image, 240)}" class="cart-item-image" loading="lazy" decoding="async" fetchpriority="low">
                            <div class="cart-item-info">
                                <span class="cart-item-name">${cleanStr(i.name)}</span>
                                <span class="cart-item-qty">${quantityLabelForCart(i)}</span>
                                <span class="cart-item-price">$${(Number(i.price)*i.quantity).toFixed(2)}</span>
                            </div>
                        </div>
                        <button data-action="remove-from-cart" data-item-id="${i.id}" class="cart-remove rounded-full flex items-center justify-center active:scale-90 transition-transform" aria-label="Eliminar">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>`).join('')+'</div>';
                if(footer) footer.classList.remove('hidden');
                if(emptyBtn) emptyBtn.classList.remove('hidden');
            }
            if(typeof lucide !== 'undefined') lucide.createIcons({root: cie});
        }

        function updateProductButtonState(itemId) {
            const ic = app.cart.find(i => i.id === itemId);
            document.querySelectorAll(`button[data-item-id="${itemId}"][data-cart-state]`).forEach(b => {
                if(!b.dataset.origHtml) b.dataset.origHtml = b.innerHTML;

                const isCampaign = b.dataset.isCampaign === 'true';
                const isQuantityButton = b.dataset.action === 'add-hourly-to-cart';
                
                if (isCampaign) {
                    if (ic) {
                        b.innerHTML = `${S_ICONS.check} SELECCIONADO`;
                        b.style.background = '#10B981'; 
                        b.dataset.cartState = 'selected';
                    } else {
                        b.innerHTML = b.dataset.origHtml;
                        b.style.background = ''; 
                        b.dataset.cartState = 'none';
                    }
                    return;
                }

                if(ic){
                    const qe = document.querySelector(`#qty-${itemId}`); 
                    const vq = readItemQuantity(itemId,ic.quantity);
                    
                    if(isQuantityButton && vq !== ic.quantity){ 
                        b.innerHTML = `${S_ICONS.refresh} Actualizar Cantidad`; 
                        b.style.background = '#F59E0B'; 
                        b.dataset.cartState = 'refresh';
                    } else { 
                        b.innerHTML = `${S_ICONS.check} Plan Seleccionado`; 
                        b.style.background = '#10B981'; 
                        b.dataset.cartState = 'selected';
                    }
                } else { 
                    b.innerHTML = b.dataset.origHtml; 
                    b.style.background = ''; 
                    b.dataset.cartState = 'none';
                }
            });
        }

        function updateCartUI() {
            updateCartBadgeAndTotals();
            renderCartItemsHTML();
        }

        function addToCart(item, qty=1) {
            const rule = getItemQuantityRule(item);
            const safeQty = rule.enabled ? clampItemQuantity(item, qty) : 1;
            const e = app.cart.find(i=>i.id===item.id);
            if(e) {
                e.quantity = rule.enabled ? clampItemQuantity(item, e.quantity + safeQty) : 1;
                if(item.isCampaign) e.price = item.price;
            } 
            else { app.cart.push({...item,quantity:safeQty}); }
            
            updateCartUI(); 
            updateProductButtonState(item.id);
            showToast(`${cleanStr(item.name) || 'Servicio'} añadido al carrito`, 'success');
        }

        function removeFromCart(id) { 
            app.cart=app.cart.filter(i=>i.id!==id); 
            if(app.cart.length===0) appliedCoupon=null; 
            
            updateCartUI(); 
            updateProductButtonState(id);
            showToast('Plan eliminado', 'info'); 
        }

        async function handleGlobalClick(e) {
            if (e.target.closest('#prevMonth')) {
                currentCalDate.setDate(1); currentCalDate.setMonth(currentCalDate.getMonth() - 1);
                availabilityReady=false; bookedEvents=[]; renderCalendar();
                await loadBookedEventsForMonth(new Date(currentCalDate));
                renderCalendar();
                return;
            }
            if (e.target.closest('#nextMonth')) {
                currentCalDate.setDate(1); currentCalDate.setMonth(currentCalDate.getMonth() + 1);
                availabilityReady=false; bookedEvents=[]; renderCalendar();
                await loadBookedEventsForMonth(new Date(currentCalDate));
                renderCalendar();
                return;
            }

            const navLink = e.target.closest('.nav-action');
            if(navLink) {
                let targetSec = navLink.dataset.targetSection || (navLink.hash ? navLink.hash.substring(1) : null);
                if(targetSec) {
                    e.preventDefault();
                    document.querySelectorAll('.modal-backdrop').forEach(m => { 
                        if(m.id === 'cartModal') toggleCartDrawer(false, false, true);
                        else m.classList.remove('show');
                    });
                    toggleMobileMenu(false, false, true);
                    if (targetSec.startsWith('cat_')) {
                        if (app.activeSection === 'catalog') catalogNavMemory.save('catalog');
                        setDirectRoute('categoria', targetSec.replace('cat_', ''));
                    } else setDirectRoute('section', targetSec);
                    if(app.activeSection !== targetSec) setActiveSection(targetSec);
                    else if(targetSec.startsWith('cat_')) renderCategory(targetSec.replace('cat_', ''));
                    return; 
                }
            }

            const target = e.target.closest('[data-action]');
            if (!target) return;
            const { action, itemId, change, date, targetSection } = target.dataset;

            switch (action) {
                case 'apply-coupon': {
                    e.preventDefault();
                    const ci = document.getElementById('couponCodeInput') ? document.getElementById('couponCodeInput').value.toUpperCase() : '';
                    if(!ci) return showToast("Escribe un cupón", "error");
                    const f = activeCoupons.find(c => c.code === ci);
                    if(f){ appliedCoupon=f; showToast(`¡Cupón ${f.code} aplicado!`, "success"); updateCartUI(); } 
                    else { showToast("Cupón inválido o expirado", "error"); appliedCoupon=null; updateCartUI(); }
                    break;
                }
                case 'retry-calendar':
                    await loadBookedEventsForMonth(new Date(currentCalDate),{force:true});
                    renderCalendar(); break;
                case 'select-date':
                    if (!await checkDateOpen(date)) { renderCalendar(); break; }
                    if (isChristmasEveBooking() && date !== '2026-12-24' && date !== '2026-12-25') {
                        showToast('Este servicio está disponible únicamente el 24 y 25 de diciembre.', 'info');
                        break;
                    }
                    if (!isChristmasEveBooking() && (date === '2026-12-24' || date === '2026-12-25')) {
                        showToast('El 24 y 25 de diciembre están reservados exclusivamente para Entregas de Santa.', 'info');
                        break;
                    }
                    selectedCalendarDate = date; renderCalendar(); break;
                case 'confirm-date':
                    if (!await checkDateOpen(selectedCalendarDate)) { renderCalendar(); break; }
                    setDirectRoute('section', 'booking');
                    setActiveSection('booking');
                    requestAnimationFrame(() => {
                        const focusEl = document.getElementById('bookingForm') || document.getElementById('empty-booking-state'); 
                        if(focusEl) focusEl.scrollIntoView({behavior:'smooth', block:'center'}); 
                        showToast('¡Fecha guardada! Ahora elige un paquete.', 'success');
                    });
                    break;
                case 'open-item-detail': {
                    e.preventDefault();
                    const itemForNav = app.catalog.find(i => i.id === itemId);
                    if (itemForNav?.categoria) catalogNavMemory.save(itemForNav.categoria);
                    renderItemDetail(itemId);
                    break;
                }
                case 'back-to-catalog': {
                    e.preventDefault();
                    if (app.activeSection && app.activeSection.startsWith('cat_')) catalogNavMemory.save(app.activeSection.replace('cat_', ''));
                    setDirectRoute('section', 'catalog');
                    app.activeSection = 'catalog';
                    renderAllCatalog();
                    catalogNavMemory.restore('catalog');
                    break;
                }
                case 'back-to-category': {
                    e.preventDefault();
                    const categoryId = target.dataset.categoryId;
                    if (categoryId) {
                        setDirectRoute('categoria', categoryId);
                        app.activeSection = `cat_${categoryId}`;
                        renderCategory(categoryId);
                        catalogNavMemory.restore(categoryId);
                    }
                    break;
                }
                case 'add-to-cart': { 
                    let it = allPurchasableItems.find(s=>s.id===itemId); 
                    
                    if (!it) {
                        const camp = app.campaigns.find(c => c.id === itemId);
                        if (camp) {
                            let servicesArr = [];
                            if (Array.isArray(camp.incluye)) servicesArr = camp.incluye;
                            else if (typeof camp.incluye === 'string') servicesArr = camp.incluye.split('\n').filter(s => s.trim() !== '');

                            it = {
                                id: camp.id, name: cleanStr(camp.titulo),
                                price: Number(camp.precio || camp.precioOriginal || 0),
                                originalPrice: Number(camp.precioOriginal || camp.precio || 0),
                                image: cleanStr(camp.imagen) || '', description: cleanStr(camp.subtitulo || camp.descripcion),
                                services: servicesArr, isHourly: false, isCampaign: true, campaignId: camp.id,
                                esNavidad: camp.esNavidad === true, recursoNavidad: camp.recursoNavidad || '', _raw: camp
                            };
                        }
                    }

                    if(it){
                        const sourceCardText = target.closest('article,section,.card-safe-wrapper,.glass-panel,[class*=\"card\"]')?.innerText || '';
                        it = markChristmasBookingItem(it, sourceCardText);
                        const existingCartItem = app.cart.find(i=>i.id===it.id);
                        if(!existingCartItem) { 
                            addToCart(it, 1); 
                        }
                        // UX móvil: un solo toque agrega (si hace falta) y abre el carrito.
                        // Si el usuario toca dos veces rápidamente, no duplica el producto.
                        showModal('cartModal');
                    }
                    break; 
                }
                case 'book-now': {
                    let it = allPurchasableItems.find(s=>s.id===itemId);
                    if (!it) {
                        const camp = app.campaigns.find(c => c.id === itemId);
                        if (camp) {
                            const servicesArr = Array.isArray(camp.incluye) ? camp.incluye : (typeof camp.incluye === 'string' ? camp.incluye.split('\n').filter(s=>s.trim()!=='') : []);
                            it = markChristmasBookingItem({ id: camp.id, name: cleanStr(camp.titulo), title:cleanStr(camp.titulo), price: Number(camp.precio || camp.precioOriginal || 0), originalPrice: Number(camp.precioOriginal || camp.precio || 0), image: cleanStr(camp.imagen) || '', description: cleanStr(camp.subtitulo || camp.descripcion), services: servicesArr, isHourly: false, isCampaign: true, campaignId: camp.id, esNavidad:camp.esNavidad===true, recursoNavidad:camp.recursoNavidad||'', _raw:camp });
                        }
                    }
                    if (it) {
                        const sourceCardText = target.closest('article,section,.card-safe-wrapper,.glass-panel,[class*=\"card\"]')?.innerText || '';
                        it = markChristmasBookingItem(it, sourceCardText);
                        const rule = getItemQuantityRule(it);
                        const qtyEl = document.querySelector(`#qty-${it.id}`);
                        const existing = app.cart.find(i=>i.id===it.id);
                        const requestedQty = rule.enabled ? clampItemQuantity(it, readItemQuantity(it.id,existing?.quantity ?? rule.min)) : 1;
                        app.cart = [{...it, quantity: requestedQty}];
                        appliedCoupon = null;
                        updateCartUI();
                        bookingFormState = {};
                        christmasLocationState = { status:'pending', charge:0, label:'', displayName:'', lat:null, lng:null, source:'' };
                        app.wizardStep = 1;
                        setDirectRoute('section','booking');
                        setActiveSection('booking');
                        window.scrollTo(0, 0);
                    } else {
                        console.warn('No se encontró el servicio solicitado para reservar', itemId);
                        showToast('No pudimos abrir este servicio. Actualiza la página e inténtalo nuevamente.', 'error');
                    }
                    break;
                }
                case 'remove-from-cart': removeFromCart(itemId); break;
                case 'empty-cart': {
                    if(app.cart.length > 0) { 
                        app.cart = []; appliedCoupon = null; 
                        updateCartUI(); 
                        document.querySelectorAll('button[data-cart-state]').forEach(b => updateProductButtonState(b.dataset.itemId));
                        showToast('Carrito vaciado', 'info'); 
                    }
                    break;
                }
                case 'add-hourly-to-cart': { 
                    let sh = allPurchasableItems.find(s=>s.id===itemId); 
                    const qe = document.querySelector(`#qty-${itemId}`); 
                    const qh = readItemQuantity(itemId,1);
                    
                    if (!sh && target.dataset.isCampaign === 'true') {
                        const camp = app.campaigns.find(c => c.id === itemId);
                        if (camp) {
                            let servicesArr = Array.isArray(camp.incluye) ? camp.incluye : (typeof camp.incluye === 'string' ? camp.incluye.split('\n').filter(s=>s.trim()!=='') : []);
                            sh = {
                                id: camp.id, name: cleanStr(camp.titulo), price: Number(camp.precio || camp.precioOriginal || 0),
                                originalPrice: Number(camp.precioOriginal || camp.precio || 0), image: cleanStr(camp.imagen) || '', 
                                description: cleanStr(camp.subtitulo || camp.descripcion), services: servicesArr, isHourly: true, isCampaign: true, campaignId: camp.id
                            };
                        }
                    }

                    if(sh && qh>0){ 
                        const safeQty = clampItemQuantity(sh, qh);
                        const ex = app.cart.find(i=>i.id===itemId); 
                        if(ex){ 
                            ex.quantity = safeQty; 
                            updateCartUI(); 
                            updateProductButtonState(itemId);
                            showToast(`Cantidad actualizada`, 'success'); 
                        } 
                        else { addToCart(sh, safeQty); }
                    } 
                    break; 
                }
                case 'change-service-qty': { 
                    const qe = document.querySelector(`#qty-${itemId}`); 
                    if(qe){ 
                        const quantityItem = allPurchasableItems.find(s=>s.id===itemId) || app.catalog.find(s=>s.id===itemId) || app.cart.find(s=>s.id===itemId);
                        const rule = getItemQuantityRule(quantityItem || {});
                        let cq=readItemQuantity(itemId,rule.min);
                        if(!Number.isFinite(cq)) cq=rule.min;
                        const delta=(parseInt(change,10)||0)*rule.step;
                        let nq=clampItemQuantity(quantityItem || {}, cq+delta);
                        setItemQuantityDisplay(quantityItem,nq);
                    } 
                    break; 
                }
                case 'close-modal': { 
                    const m = target.closest('.modal-backdrop'); 
                    if(m) {
                        if(m.id === 'cartModal') toggleCartDrawer(false, false, !!targetSection);
                        else m.classList.remove('show');
                    }
                    toggleMobileMenu(false, false, !!targetSection);
                    if(targetSection && !navLink) { setDirectRoute('section',targetSection); if(app.activeSection !== targetSection) setActiveSection(targetSection); }
                    break; 
                }
                case 'navigate-from-modal': {
                    const m = target.closest('.modal-backdrop'); 
                    if(m) {
                        if(m.id === 'cartModal') toggleCartDrawer(false, false, true);
                        else m.classList.remove('show');
                    }
                    if(targetSection && !navLink) { setDirectRoute('section',targetSection); if(app.activeSection !== targetSection) setActiveSection(targetSection); }
                    break; 
                }
                case 'scroll-to-catalog': {
                    e.preventDefault();
                    if (!catalogLoaded) showToast("Cargando nuestros paquetes...", "info");
                    // El Explorador es una ruta real del historial.
                    setDirectRoute('section', 'catalog');
                    setActiveSection('catalog');
                    break;
                }
            }
        }

        // NAVIDAD — normalizador disponible también para el submit global.
        function normalizeChristmasDateForSubmit(value) {
            const raw = String(value ?? '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
            const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
            return m ? `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : raw;
        }

        function transportNeedsReview(data = null) {
            if (data) return data.totalPendienteTransporte === true || data.requiereRevisionUbicacion === true || /fuera.*(?:area|área|cobertura)|despu[eé]s de/i.test(String(data.ubicacion || '')) || (data.esNavidad===true&&/por confirmar|por revisar/i.test(String(data.ubicacion||'')));
            const state=isChristmasEveBooking()?christmasLocationState:normalLocationState;
            return state?.status==='review'&&(isChristmasEveBooking()||state.reason!=='no-gps');
        }
        function refreshBookingSummary() {
            const pending = transportNeedsReview();
            const label = document.getElementById('booking-summary-total-label');
            const note = document.getElementById('booking-summary-note');
            const compact = document.getElementById('booking-summary-compact');
            const sub = app.cart.reduce((a,i)=>a+Number(i.price)*i.quantity,0);
            const discount = Math.min(sub, Math.max(0, appliedCoupon ? (appliedCoupon.type === 'percent' ? sub*Number(appliedCoupon.discount)/100 : Number(appliedCoupon.discount)) : 0));
            if (label) label.textContent = pending ? 'Servicios:' : 'Total estimado:';
            if (note) { note.hidden = !pending; note.textContent = 'Transporte pendiente de cotizar. El total final se confirma antes de aprobar la reserva.'; }
            if (compact) compact.textContent = `$${(sub-discount+(pending?0:effectiveTransportCost(app.cart.reduce((a,i)=>a+i.quantity,0)))).toFixed(2)}${pending?' · transporte pendiente':''}`;
            const appointment = document.getElementById('booking-summary-appointment');
            const form = document.getElementById('bookingForm');
            if(appointment && form) {
                const value = name => String(form.elements?.namedItem(name)?.value || '').trim();
                const date = value('date');
                appointment.textContent = [date?date.split('-').reverse().join('/'):'Fecha por elegir',value('time')||'Hora por elegir',value('address')].filter(Boolean).join(' · ');
            }
            const cartLabel = document.getElementById('cart-total-label');
            if (cartLabel) cartLabel.textContent = pending ? 'Servicios · transporte pendiente' : 'Total estimado';
            const cartTransport = document.getElementById('transportCost');
            if (cartTransport && pending) cartTransport.textContent = 'Por cotizar';
        }
        function confirmTransportReview() {
            return new Promise(resolve => {
                const dialog = document.createElement('dialog');
                if(typeof dialog.showModal !== 'function') {
                    resolve(window.confirm('El transporte de esta dirección está pendiente de cotizar. El precio mostrado incluye solo los servicios. Te contactaremos por WhatsApp con el costo y el total final antes de aprobar. ¿Enviar la solicitud pendiente?'));
                    return;
                }
                dialog.className = 'booking-review-dialog';
                dialog.setAttribute('aria-labelledby','transport-review-title');
                dialog.innerHTML = `<h3 id="transport-review-title">Transporte pendiente de cotizar</h3><p>Esta dirección necesita revisión y puede estar fuera del área de cobertura automática.</p><p>El precio mostrado corresponde a los servicios y <strong>no incluye el transporte pendiente</strong>. Te enviaremos el costo por WhatsApp antes de aprobar la reserva.</p><button type="button" data-review-send>Enviar solicitud pendiente</button><button type="button" data-review-back>Revisar dirección</button>`;
                document.body.appendChild(dialog);
                let done = false;
                const finish = value => { if(done)return; done=true; dialog.close(); dialog.remove(); resolve(value); };
                dialog.querySelector('[data-review-send]').onclick = () => finish(true);
                dialog.querySelector('[data-review-back]').onclick = () => finish(false);
                dialog.oncancel = event => { event.preventDefault(); finish(false); };
                dialog.showModal();
                dialog.querySelector('[data-review-send]').focus();
            });
        }

        async function handleBookingSubmit(e) {
            e.preventDefault();
            const submitForm = e.target;
            if (!submitForm || submitForm.dataset.validating === '1') return;
            submitForm.dataset.validating = '1';
            try {
            if (submitForm.dataset.sending === '1') return;
            if(app.cart.length===0) return showToast('Selecciona al menos un servicio', 'error');

            // An earlier write may have committed without its acknowledgement arriving.
            // Recover its owner-only receipt before validating or changing the retry form.
            if (pendingBooking?.id && !pendingBooking.promise) {
                submitForm.dataset.sending = '1';
                let receipt = null;
                try {
                    await ensureFirebaseRuntime();
                    const receiptRef = doc(db,'artifacts',CRM_APP_ID,'public','data','reservas_cliente',pendingBooking.id);
                    receipt = await fetchWithTimeout(readBookingReceipt(getDoc, receiptRef, auth.currentUser?.uid),7000);
                } catch (_) {
                    // Missing receipts are denied by the current rules. An uncommitted
                    // request can still be sent, retaining its original reservation ID.
                }
                if (receipt) {
                    const request = pendingBooking;
                    request.data = { ...request.data, ...receipt };
                    request.recoveredReceipt = true;
                    try { await finishBookingRequest(request); }
                    finally { delete submitForm.dataset.sending; }
                    return;
                }
                delete submitForm.dataset.sending;
            }

            const placeFormData = new FormData(submitForm);
            const placeReferenceField = isChristmasEveBooking() ? 'christmasReference' : 'normalReference';
            if(needsPlaceReference({direccion:placeFormData.get('address'),referenciaLugar:placeFormData.get(placeReferenceField)||(!isChristmasEveBooking()?normalLocationState?.resolvedPlaceName:'')})){
                showToast('Escribe la barriada, PH o salón del evento. El GPS solo marca el punto.','error');
                submitForm.querySelector(`[name="${placeReferenceField}"]`)?.focus?.();
                return;
            }

            // NAVIDAD FASE 2 SEGURA — validación final obligatoria antes de Firebase.
            // Aunque el campo conserve una fecha previa, Nochebuena solo acepta 24 o 25/12/2026.
            if (isChristmasEveBooking()) {
                const christmasFormData = new FormData(e.target);
                // NAVIDAD: validación explícita para evitar que campos ocultos del wizard bloqueen el submit nativo.
                const requiredChristmasFields = [
                    ['name', 'Escribe tu nombre para continuar.'],
                    ['email', 'Escribe tu correo para continuar.'],
                    ['phone', 'Escribe tu teléfono para continuar.'],
                    ['date', 'Selecciona la fecha de la visita.'],
                    ['time', 'Selecciona la hora de la visita.'],
                    ['location', 'Selecciona la zona de la visita.']
                ];
                for (const [field, message] of requiredChristmasFields) {
                    if (!cleanStr(christmasFormData.get(field))) return showToast(message, 'error');
                }
                const christmasEmail = cleanStr(christmasFormData.get('email'));
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(christmasEmail)) {
                    return showToast('Escribe un correo válido para continuar.', 'error');
                }
                const christmasZoneText = cleanStr(christmasFormData.get('location')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                if (christmasZoneText.includes('arraijan') || christmasZoneText.includes('chorrera')) {
                    return showToast('Entregas de Nochebuena está disponible únicamente en Ciudad de Panamá.', 'error');
                }
                const christmasGuests = Number(christmasFormData.get('guests') || 0);
                if (![1,2].includes(christmasGuests)) return showToast('La entrega de Santa permite un máximo de 2 niños.', 'error');
                if (christmasLocationState.status === 'review' || bookingFormState.christmasCoverageStatus === 'review') {
                    // Se guarda como solicitud pendiente. Diverty revisa ubicación/transporte en CRM
                    // y contacta al cliente por WhatsApp antes de aceptar o rechazar.
                    renderChristmasCoverageStatus();
                }
                const christmasDate = normalizeChristmasDateForSubmit(christmasFormData.get('date'));
                const validChristmasDates = new Set(['2026-12-24', '2026-12-25']);
                if (!validChristmasDates.has(christmasDate)) {
                    return showToast('Para Entregas de Nochebuena selecciona el 24 o 25 de diciembre de 2026.', 'error');
                }
                const christmasAddress = cleanStr(christmasFormData.get('address'));
                const christmasReference = cleanStr(christmasFormData.get('christmasReference'));
                if (christmasAddress.length<3) {
                    return showToast('Comparte la ubicación exacta donde debe llegar Santa.', 'error');
                }

                const christmasTime = cleanStr(christmasFormData.get('time'));
                const timeMatch = christmasTime.match(/^(\d{2}):(\d{2})$/);
                const christmasMinutes = timeMatch ? (Number(timeMatch[1]) * 60 + Number(timeMatch[2])) : -1;
                const validChristmasTime = christmasDate === '2026-12-24'
                    ? christmasMinutes >= 16 * 60 && christmasMinutes <= 23 * 60 + 30
                    : christmasMinutes >= 0 && christmasMinutes <= 14 * 60;
                if (!validChristmasTime) {
                    return showToast(christmasDate === '2026-12-24'
                        ? 'El 24 de diciembre las entregas comienzan a las 4:00 PM.'
                        : 'El 25 de diciembre las entregas están disponibles hasta las 2:00 PM.', 'error');
                }
            }

            // RESERVAS NORMALES — la solicitud solo puede salir cuando ubicación,
            // referencia y personal han sido validados. El precio final todavía puede
            // ser corregido por Diverty CRM antes de aceptar la reserva.
            if (!isChristmasEveBooking()) {
                const normalFormData = new FormData(e.target);
                const requiredNormalFields = [
                    ['name', 'Escribe tu nombre para continuar.'],
                    ['email', 'Escribe tu correo para continuar.'],
                    ['phone', 'Escribe tu teléfono para continuar.'],
                    ['date', 'Selecciona la fecha del evento.'],
                    ['time', 'Selecciona la hora del evento.'],
                    ['eventType', 'Selecciona el tipo de evento.']
                ];
                for (const [field, message] of requiredNormalFields) {
                    if (!cleanStr(normalFormData.get(field))) return showToast(message, 'error');
                }
                const normalEmail = cleanStr(normalFormData.get('email'));
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail)) {
                    return showToast('Escribe un correo válido para continuar.', 'error');
                }
                const normalDate = cleanStr(normalFormData.get('date')).slice(0,10);
                if (normalDate === '2026-12-24' || normalDate === '2026-12-25') {
                    return showToast('El 24 y 25 de diciembre están reservados exclusivamente para Entregas de Santa.', 'error');
                }
                const normalReference = cleanStr(normalFormData.get('normalReference'));


                const locationStatus = normalLocationState?.status || bookingFormState.normalCoverageStatus || 'pending';
                const locationSource = normalLocationState?.source || bookingFormState.normalLocationSource || '';
                const manualAddress = cleanStr(normalFormData.get('address'));
                // La ubicación manual no debe servir para saltarse el filtro de seguridad.
                // Si la dirección/referencia escrita coincide claramente con un sector restringido,
                // detenemos la solicitud igual que cuando el GPS/reverse-geocoding lo detecta.
                const manualSecurityText = normalizeChristmasPlace(`${manualAddress} ${normalReference}`);
                if (NORMAL_RESTRICTED_TERMS.some(term => manualSecurityText.includes(term))) {
                    normalLocationState = {status:'blocked',charge:0,label:'Ubicación no disponible',reason:'security-manual',source:locationSource||'manual'};
                    renderNormalCoverageStatus();
                    return showToast('Esta ubicación no está disponible para solicitudes desde la web.', 'error');
                }
                if (locationStatus === 'blocked') {
                    renderNormalCoverageStatus();
                    return showToast('Esta ubicación no está disponible para solicitudes desde la web.', 'error');
                }
                if (!['included','review'].includes(locationStatus)) {
                    return showToast('Primero indica la ubicación del evento para calcular el transporte.', 'error');
                }
                if (locationStatus === 'review') renderNormalCoverageStatus();
                if (manualAddress.length<3) {
                    return showToast('Escribe la dirección, PH o barriada donde será el evento.', 'error');
                }
                if (!cleanStr(normalFormData.get('location'))) {
                    return showToast('Selecciona o verifica la zona del evento.', 'error');
                }

                const resourceCheck = await checkNormalResourceAvailability(
                    cleanStr(normalFormData.get('date')),
                    cleanStr(normalFormData.get('time')),
                    { force:true }
                );
                bookingFormState.resourceStatus = resourceCheck;
                if (!resourceCheck.feasible) {
                    const msg = document.getElementById('normal-resource-message');
                    if (msg) {
                        msg.textContent = '⚠️ Este horario ya no tiene disponibilidad operativa. Elige otra hora.';
                        msg.className = 'mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-600';
                    }
                    return showToast('Ese horario ya no está disponible. Elige otra hora.', 'error');
                }
            }

            const sBtn = e.target.querySelector(isChristmasEveBooking()?'#btn-submit':'[data-location-continue]') || e.target.querySelector('button[type="submit"]'); if(!sBtn) return;
            let capacidadSimultanea = isChristmasEveBooking() ? 1 : 3;
            const obh = sBtn.innerHTML; submitForm.dataset.sending = '1'; sBtn.disabled = true; sBtn.innerHTML = '<div class="loading-spinner !w-5 !h-5 !border-2 !border-t-[var(--s-primary)] inline-block align-middle mr-2"></div> Enviando reserva...';
            try {
                if (transportNeedsReview() && !await confirmTransportReview()) return;
                await ensureFirebaseRuntime();
                const fd = new FormData(e.target);
                const sub = app.cart.reduce((s,i)=>s+(Number(i.price)*i.quantity),0);
                const count = app.cart.reduce((s,i)=>s+i.quantity,0);
                const tc = effectiveTransportCost(count);
                let dv = 0; if(appliedCoupon) dv = appliedCoupon.type==='percent' ? sub*(Number(appliedCoupon.discount)/100) : Number(appliedCoupon.discount);
                dv=Math.min(sub,Math.max(0,dv)); const ft = sub - dv + tc;
                const lo = locations.find(l=>l.value===app.location);
                let christmasSmartSanta = '';
                let christmasSmartCapacity = null;
                if (isChristmasEveBooking()) {
                    const zoneCheck = cleanStr(`${app.location} ${lo?.label || ''}`).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                    if (zoneCheck.includes('arraijan') || zoneCheck.includes('chorrera')) {
                        return showToast('Entregas de Nochebuena está disponible únicamente en Ciudad de Panamá.', 'error');
                    }

                    // Revalidación final de ruta justo antes de guardar. Así el Santa elegido
                    // considera las reservas que pudieron entrar mientras el cliente llenaba el formulario.
                    const smartDate = normalizeChristmasDateForSubmit(fd.get('date') || '');
                    const smartTime = String(fd.get('time') || '');
                    let smartLat = Number(bookingFormState.christmasLat);
                    let smartLng = Number(bookingFormState.christmasLng);
                    if (!Number.isFinite(smartLat) || !Number.isFinite(smartLng)) {
                        const g=String(fd.get('address')||'').match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
                        if (g) { smartLat=Number(g[1]); smartLng=Number(g[2]); }
                    }
                    const smartGps = Number.isFinite(smartLat) && Number.isFinite(smartLng) && Math.abs(smartLat)<=90 && Math.abs(smartLng)<=180 && !(smartLat===0 && smartLng===0) ? {lat:smartLat,lng:smartLng} : null;
                    const manualReview = christmasLocationState.status==='review' && String(fd.get('address')||'').trim().length>=3;
                    if(!smartGps && !manualReview) return showToast('Escribe la dirección o utiliza el GPS para continuar.','error');
                    await loadRouteEventsForMonth(new Date(`${smartDate}T12:00:00`), {force:true});
                    christmasSmartCapacity = await getChristmasCapacity({force:true});
                    const smartRoute = computeChristmasSmartRoute(smartDate, smartTime, christmasSmartCapacity, smartGps, routeEvents);
                    if (smartGps && (!smartRoute?.feasible || !smartRoute.bestSanta)) {
                        return showToast('Ese horario dejó de ser viable para las rutas de Santa. Elige otro horario disponible.', 'error');
                    }
                    // La web pública usa este resultado solo para validar/recomendar la ruta.
                    // La asignación definitiva se persiste desde la app administrativa,
                    // porque las reglas de Firestore no permiten que el cliente escriba santaAsignado.
                    christmasSmartSanta = smartRoute?.bestSanta || '';
                }
                const dataToSave = {
                    id: pendingBooking?.id || `web-${crypto.randomUUID()}`, ownerUid: auth.currentUser.uid, cliente: fd.get('name')||'', email: fd.get('email')||'', telefono: fd.get('phone')||'', telefonoBusqueda: String(fd.get('phone')||'').replace(/\D/g,'').replace(/^00507/,'').replace(/^507/,''), tipoEvento: fd.get('eventType')||'Cumpleaños', ninos: fd.get('guests')||'', fecha: isChristmasEveBooking() ? normalizeChristmasDateForSubmit(fd.get('date')||'') : (fd.get('date')||''), hora: fd.get('time')||'', ubicacion: isChristmasEveBooking()
                        ? (christmasLocationState.status==='review' ? 'Ubicación por confirmar' : String(bookingFormState.christmasLocationName || bookingFormState.christmasCoverageLabel || 'Ubicación GPS').slice(0,200))
                        : (normalLocationState.label || bookingFormState.normalCoverageLabel || 'Ubicación por revisar'),
                    direccion: fd.get('address')||'',
                    referenciaLugar: isChristmasEveBooking() ? (fd.get('christmasReference')||'') : (fd.get('normalReference')||normalLocationState?.resolvedPlaceName||''),
                    comentarios: fd.get('comments')||'', servicio: app.cart.map(i=>i.quantity>1?`${cleanStr(i.name)} (x${i.quantity})`:cleanStr(i.name)).join(' + '), serviciosSeleccionados: app.cart.map(i=>{ const incluye = Array.isArray(i.services) ? i.services.map(x=>cleanStr(x)).filter(Boolean) : []; const descripcionBase = cleanStr(i.description)||''; const descripcionCompleta = [descripcionBase, incluye.length ? `Todo lo que incluye:\n${incluye.map(x=>`• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n'); const duracionHoras = serviceDurationHours(i,i._raw); return { id:i.id, nombre:cleanStr(i.name), precioOriginal:i.price, precio:Number(i.price)*i.quantity, cantidad:i.quantity, descripcion:descripcionCompleta, incluye, tipoCobro:i.tipoCobro || (i.isHourly?'hora':'paquete'), isHourly:i.isHourly===true, duracionHoras:duracionHoras||0, origenCatalogo:i.isCampaign?'campana_web':'catalogo_web' }; }), descripcionEvento: app.cart.map(i=>{ const incluye = Array.isArray(i.services) ? i.services.map(x=>cleanStr(x)).filter(Boolean) : []; const titulo = i.quantity>1 ? `${cleanStr(i.name)} (x${i.quantity})` : cleanStr(i.name); return [titulo, cleanStr(i.description), incluye.length ? `Todo lo que incluye:\n${incluye.map(x=>`• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n'); }).join('\n\n'), transporte: tc.toString(), descuento: dv.toString(), gastos: '0', detalleGastos: '', total: ft.toString(), abono: '0', estado: 'Pendiente', createdAt: new Date().toISOString(), deletedLocally: false, colisionAprobada: false, origen: 'Web Directa',
                    esNavidad: isChristmasEveBooking(),
                    recursoNavidad: isChristmasEveBooking() ? 'Santa' : '',
                    // Mantener el esquema público compatible con las reglas actuales.
                    // Para reservas normales el GPS queda en `direccion` como enlace de Maps;
                    // las coordenadas numéricas se guardan directamente solo en Navidad.
                    ...(isChristmasEveBooking() && (() => {
                        let lat = Number(bookingFormState.christmasLat);
                        let lng = Number(bookingFormState.christmasLng);
                        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                            const g=String(fd.get('address')||'').match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
                            if (g) { lat=Number(g[1]); lng=Number(g[2]); }
                        }
                        return Number.isFinite(lat) && Number.isFinite(lng) &&
                            Math.abs(lat)<=90 && Math.abs(lng)<=180 && !(lat===0 && lng===0)
                            ? { lat, lng } : {};
                    })())
                };
                
                // Capacidad simultánea operativa configurada desde Diverty CRM.
                // Se consulta al confirmar para que un cambio se aplique sin volver a publicar la Web.
                const reservaNavidad = isChristmasEveBooking();
                let centralValidation = false;
                try {
                    const capacitySnap = await getDoc(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','global'));
                    const configCapacity = capacitySnap?.exists() ? (capacitySnap.data() || {}) : {};
                    centralValidation = configCapacity.centralBookingValidation === true;
                    const configuredCapacity = Number(
                        reservaNavidad
                            ? (christmasSmartCapacity ?? await getChristmasCapacity())
                            : (configCapacity.capacidadSimultanea ?? 3)
                    );
                    if (Number.isInteger(configuredCapacity) && configuredCapacity >= 1 && configuredCapacity <= 100) capacidadSimultanea = configuredCapacity;
                } catch (_) {
                    capacidadSimultanea = reservaNavidad ? 1 : 3;
                }

                // El documento slot_* funciona como contador transaccional. Firestore serializa
                // confirmaciones concurrentes para que nunca se supere la capacidad configurada.
                pendingBooking = prepareBookingAttempt(pendingBooking, dataToSave);
                const request = pendingBooking;
                if (!request.promise) {
                    request.promise = (async () => {
                        if (centralValidation) {
                            const result = await callBookingFunction('createWebBooking', {
                                event: request.data, couponCode: appliedCoupon?.code || '',
                                location: isChristmasEveBooking() ? {lat:bookingFormState.christmasLat,lng:bookingFormState.christmasLng} : {lat:normalLocationState.lat,lng:normalLocationState.lng}
                            });
                            request.data = result.event;
                            request.recoveredReceipt = result.recovered === true;
                            return;
                        }
                        // AHORRO FIRESTORE: Navidad usa directamente su contador slot_santa_*.
                        // Así evitamos descargar todas las reservas del día en cada confirmación.
                        // Reservas normales conservan la comprobación histórica para no alterar su lógica.
                        let existingReservationIds = [];
                        if (reservaNavidad) {
                            // Sin consulta adicional: reutiliza la disponibilidad mensual ya cargada.
                            existingReservationIds = bookedEvents.filter(ev => {
                                const id = String(ev._availabilityId || ev.id || '');
                                if (!id || id.startsWith('slot_') || id === request.id || !isChristmasAvailabilityRow(ev)) return false;
                                return String(ev.fecha || '') === String(request.data.fecha || '') &&
                                       String(ev.hora || '') === String(request.data.hora || '');
                            }).map(ev => String(ev._availabilityId || ev.id || '')).filter(Boolean);
                            if (existingReservationIds.length >= capacidadSimultanea) throw new Error('SLOT_FULL');
                        } else {
                            const sameDateSnap = await getDocs(query(
                                collection(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web'),
                                where('fecha','==',request.data.fecha)
                            ));
                            const sameTimeDocs = sameDateSnap.docs.filter(d => {
                                if (d.id.startsWith('slot_') || d.id === request.id) return false;
                                const row = d.data() || {};
                                if (!isBlockingEvent(row)) return false;
                                if (row.esNavidad === true || String(row.recursoNavidad || '').toLowerCase() === 'santa') return false;
                                return String(row.hora || '') === String(request.data.hora || '');
                            });
                            existingReservationIds = sameTimeDocs.map(d => String(d.id));
                            if (existingReservationIds.length >= capacidadSimultanea) throw new Error('SLOT_FULL');
                        }

                        const safeSlot = `${request.data.fecha}_${String(request.data.hora||'').replace(':','-')}`.replace(/[^0-9A-Za-z_-]/g,'');
                        const slotPrefix = reservaNavidad ? 'slot_santa_' : 'slot_';
                        const slotRef = doc(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web',`${slotPrefix}${safeSlot}`);
                        const eventRef = doc(db,'artifacts',CRM_APP_ID,'public','data','eventos',request.id);
                        const availabilityRef = doc(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web',request.id);
                        const customerRef = doc(db,'artifacts',CRM_APP_ID,'public','data','reservas_cliente',request.id);

                        await runTransaction(db, async tx => {
                            const closureSnap = await tx.get(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','fechas_cerradas'));
                            if (isClosedBookingDate(closureSnap.data(), request.data.fecha)) throw new Error('DATE_CLOSED');
                            const lockSnap = await tx.get(slotRef);
                            const lock = lockSnap.exists() ? (lockSnap.data() || {}) : {};
                            const lockIds = Array.isArray(lock.reservationIds) ? lock.reservationIds.map(String) : [];

                            // Validate IDs kept by the transaction lock. This makes the lock self-healing:
                            // if an old app version deleted a reservation but left its slot_* ID behind,
                            // that stale ID no longer consumes capacity.
                            const validLockIds = [];
                            for (const lockedId of [...new Set(lockIds)]) {
                                if (!lockedId || lockedId === request.id || existingReservationIds.includes(lockedId)) continue;
                                const lockedRef = doc(db,'artifacts',CRM_APP_ID,'public','data','disponibilidad_web',lockedId);
                                const lockedSnap = await tx.get(lockedRef);
                                if (!lockedSnap.exists()) continue;
                                const lockedData = lockedSnap.data() || {};
                                if (!isBlockingEvent(lockedData)) continue;
                                if (String(lockedData.fecha || '') !== String(request.data.fecha || '')) continue;
                                if (String(lockedData.hora || '') !== String(request.data.hora || '')) continue;
                                validLockIds.push(lockedId);
                            }

                            const occupiedIds = new Set([
                                ...existingReservationIds.map(String),
                                ...validLockIds
                            ].filter(x => x && x !== request.id));

                            // Reintentar la misma solicitud nunca consume un segundo cupo. A la vez,
                            // la unión conserva reservas detectadas por consulta y reservas concurrentes
                            // ya confirmadas en el lock transaccional.
                            if (occupiedIds.size >= capacidadSimultanea) throw new Error('SLOT_FULL');
                            occupiedIds.add(request.id);
                            tx.set(slotRef,{
                                fecha:request.data.fecha,
                                hora:request.data.hora,
                                count:occupiedIds.size,
                                capacity:capacidadSimultanea,
                                reservationIds:[...occupiedIds],
                                updatedAt:new Date().toISOString()
                            });

                            tx.set(eventRef,request.data);
                            // El navegador público conserva el esquema histórico autorizado.
                            // El CRM publica los metadatos operativos de personal después de aceptar.
                            tx.set(availabilityRef,{
                                fecha:request.data.fecha,
                                hora:request.data.hora,
                                esNavidad:request.data.esNavidad === true,
                                recursoNavidad:request.data.recursoNavidad || '',
                                ...(request.data.esNavidad === true && Number.isFinite(Number(request.data.lat)) && Number.isFinite(Number(request.data.lng)) ? { lat:Number(request.data.lat), lng:Number(request.data.lng) } : {})
                            });
                            tx.set(customerRef,Object.fromEntries(['ownerUid','cliente','telefono','fecha','hora','estado','servicio','total','abono'].map(key=>[key,String(request.data[key]??'')])));
                        });
                    })().catch(err => { request.promise=null; throw err; });
                }
                try {
                    await fetchWithTimeout(request.promise,15000);
                } catch (submitErr) {
                    // Una transacción puede haber llegado a Firestore aunque el cliente no reciba
                    // la confirmación antes del timeout. Verificamos el MISMO ID antes de pedir reintento.
                    if (submitErr?.message !== 'SLOT_FULL') {
                        try {
                            const verifyRef = doc(db,'artifacts',CRM_APP_ID,'public','data','reservas_cliente',request.id);
                            const receipt = await fetchWithTimeout(readBookingReceipt(getDoc, verifyRef, auth.currentUser?.uid),7000);
                            if (!receipt) throw submitErr;
                            request.data = { ...request.data, ...receipt };
                            request.recoveredReceipt = true;
                        } catch (verifyErr) {
                            throw submitErr;
                        }
                    } else {
                        throw submitErr;
                    }
                }
                await finishBookingRequest(request);
            } catch(err){
                console.error(err);
                // Rules may reject a closure before Firestore retries the stale
                // transaction. Read the public closure afresh to explain that denial.
                if (String(err?.code || '').includes('permission-denied') && db) {
                    try {
                        let closed = false;
                        await runTransaction(db, async tx => {
                            const snapshot = await tx.get(doc(db,'artifacts',CRM_APP_ID,'public','data','config_web','fechas_cerradas'));
                            closed = isClosedBookingDate(snapshot.data(), String(new FormData(submitForm).get('date') || ''));
                        });
                        if (closed) err = new Error('DATE_CLOSED');
                    } catch (_) {}
                }
                if (err?.details?.reason === 'PRICE_CHANGED' && err.details.quote) {
                    const quote = err.details.quote;
                    app.cart.forEach((item,index)=>{const updated=quote.items?.[index];if(updated && updated.id===item.id)item.price=updated.precioOriginal;});
                    const state = isChristmasEveBooking() ? christmasLocationState : normalLocationState;
                    Object.assign(state, quote.coverage);
                    if (appliedCoupon) { appliedCoupon.type='fixed';appliedCoupon.discount=Number(quote.descuento); }
                    pendingBooking = null;
                    if(isChristmasEveBooking())renderChristmasCoverageStatus();else renderNormalCoverageStatus();
                    updateCartUI();
                    renderBooking();
                    showToast('Actualizamos el precio y transporte. Revisa el resumen y envía de nuevo para aceptar esos importes.', 'error');
                } else if (err?.details?.reason === 'DATE_CLOSED' || err?.message === 'DATE_CLOSED') {
                    pendingBooking = null;
                    dateClosures[String(new FormData(submitForm).get('date') || '')] = true;
                    updateBookingDateClosures();
                    showToast('Esta fecha está sin disponibilidad. Elige otra fecha para enviar tu reserva.', 'error');
                } else if (['SLOT_FULL','ROUTE_FULL'].includes(err?.details?.reason) || err?.message === 'SLOT_FULL') {
                    pendingBooking = null;
                    bookedEventsMonthCache.clear(); routeEventsMonthCache.clear();
                    await loadBookedEventsForMonth(new Date(currentCalDate), { force: true });
                    if (isChristmasEveBooking()) renderBooking();
                    showToast(
                        isChristmasEveBooking()
                            ? `Ese horario de Santa ya alcanzó el máximo de ${capacidadSimultanea} reserva${capacidadSimultanea === 1 ? '' : 's'}. Elige otra hora disponible.`
                            : `Ese horario ya alcanzó el máximo de ${capacidadSimultanea} eventos. Elige otra hora disponible.`,
                        'error'
                    );
                } else if (err?.details?.reason) {
                    showToast(String(err.message || 'Revisa los datos de la solicitud.'), 'error');
                } else {
                    const rawCode = String(err?.code || err?.name || 'UNKNOWN_ERROR');
                    const rawMessage = String(err?.message || 'Sin detalle').replace(/\s+/g,' ').trim();
                    const diagnosticCode = rawCode.replace(/^FirebaseError:\s*/i,'').replace(/^firestore\//i,'');
                    console.error('[DIVERTY BOOKING DIAGNOSTIC]', {
                        code: diagnosticCode,
                        message: rawMessage,
                        requestId: pendingBooking?.id || null,
                        uid: auth?.currentUser?.uid || null,
                        online: navigator.onLine
                    });
                    showToast('No pudimos completar la reserva en este momento. Inténtalo nuevamente; si continúa, contáctanos por WhatsApp.', 'error');
                }
            } 
            finally{ submitForm.dataset.sending = '0'; sBtn.disabled=false; sBtn.innerHTML=obh; }
            } finally { delete submitForm.dataset.validating; }
        }

        async function finishBookingRequest(request) {
                // Netlify indexes the saved request privately without Cloud Functions.
                // Synchronize alongside the existing notification, preserving the saved booking on failure.
                void (async()=>{
                    try{await requestCustomerPortal({action:'sync',reservationId:request.id},await auth.currentUser.getIdToken());}
                    catch(_){console.warn('Reserva guardada; el portal se actualizará al abrir el panel administrador.');}
                })();
                // Aviso push al CRM: se ejecuta solo después de confirmar que la reserva existe.
                // Si el servicio de notificaciones falla, la reserva permanece guardada normalmente.
                try {
                    await fetchWithTimeout(fetch('https://diverty-notificaciones.divertypty.workers.dev', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reservationId: request.id })
                    }), 7000);
                } catch (notifyErr) {
                    console.warn('Reserva guardada, pero no se pudo enviar la notificación push:', notifyErr);
                }

                pendingBooking = null;
                bookedEventsMonthCache.clear(); routeEventsMonthCache.clear();

                try { localStorage.setItem('datosClienteDiverty', JSON.stringify({ nombre: request.data.cliente || '', email: request.data.email || '', telefono: request.data.telefono || '' })); } catch (_) {}

                showModal('infoModal');
                const pendingTransport = transportNeedsReview(request.data);
                const title = document.getElementById('modalTitle'); if(title) title.textContent = pendingTransport ? 'Solicitud recibida' : '¡Gracias por elegir Diverty!';
                const mm = document.getElementById('modalMessage'); if(mm) mm.textContent = pendingTransport
                    ? `Tu solicitud para el ${request.data.fecha} a las ${request.data.hora} quedó pendiente de cotizar transporte y aprobar la reserva. El precio de los servicios no incluye ese transporte. Te contactaremos por WhatsApp con el costo y el total final antes de confirmar.`
                    : request.recoveredReceipt
                    ? `Tu solicitud ya estaba guardada para el ${request.data.fecha} a las ${request.data.hora}. Te contactaremos por WhatsApp.`
                    : 'Recibimos tu solicitud. Te contactaremos por WhatsApp para coordinar el abono y confirmar tu reserva. ¡Nos encantará celebrar contigo!';
                app.cart=[]; appliedCoupon=null; bookingFormState={}; christmasLocationState={ status:'pending', charge:0, label:'', displayName:'', lat:null, lng:null, source:'' }; normalLocationState={ status:'pending', charge:null, label:'', displayName:'', lat:null, lng:null, source:'', zoneValue:'' }; app.wizardStep=1; updateCartUI();
                setDirectRoute('section','home','replace'); setActiveSection('home');
                bookingFormState={};
        }

        async function initFirebaseAndData() {
            // 6A: el arranque público NO descarga Firebase SDK.
            // Catálogo/tema/campañas se leen por REST ligero y el SDK se reserva para reservas.
            const T_OUT = 8000;

            // DIVERTY FIRESTORE OPTIMIZER
            // Un solo documento pequeño indica si el administrador cambió contenido web.
            // Las colecciones públicas se conservan en localStorage entre visitas y solo
            // vuelven a descargarse cuando cambia esta versión.
            const WEB_CACHE_PREFIX = 'diverty_web_cache_v4_';
            let currentWebSyncVersion = '';
            let sectionVersions = {};
            let refreshStaticContent = null;
            let bootComplete = false, refreshPending = false, refreshing = false;
            // FASE 1 / PASO 4: acumula únicamente las colecciones que cambiaron.
            // Así una edición de catálogo no obliga a volver a leer galería, reseñas,
            // transporte, cupones, campañas y tema al mismo tiempo.
            const pendingSyncSections = new Set();
            const queueChangedSections = (previous, next, globalChanged) => {
                const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
                keys.forEach(key => {
                    if (String(previous?.[key] ?? '') !== String(next?.[key] ?? '')) pendingSyncSections.add(key);
                });
                // Compatibilidad con administradores antiguos que solo incrementaban
                // la versión global y no informaban qué colección había cambiado.
                if (globalChanged && keys.size === 0) pendingSyncSections.add('*');
            };
            const cacheVersion = name => String(sectionVersions[name === 'config_global' ? 'config_web' : name] ?? (Object.keys(sectionVersions).length ? 0 : 'legacy:' + currentWebSyncVersion));
            const readCachedCollection = name => {
                try {const parsed=JSON.parse(localStorage.getItem(WEB_CACHE_PREFIX+name)); return Array.isArray(parsed?.data) && parsed.version===cacheVersion(name) ? parsed.data : null;} catch(_) {return null;}
            };
            const saveCachedCollection = (name,data,version=cacheVersion(name)) => {
                if(version!==cacheVersion(name)) return;
                try {localStorage.setItem(WEB_CACHE_PREFIX+name,JSON.stringify({version,data}));} catch(_) {}
            };
            const inFlight=new Map();
            const fetchStaticCollection=async name=>{
                const cached=isThemePreview?null:readCachedCollection(name); if(cached) return cached;
                const version=cacheVersion(name), key=name+':'+version;
                if(inFlight.has(key)) return inFlight.get(key);
                const request=(async()=>{
                    const rows=await fetchWithTimeout(fetchPublicRestCollection(name),T_OUT);
                    if(version!==cacheVersion(name)) return fetchStaticCollection(name);
                    if(!isThemePreview)saveCachedCollection(name,rows,version); return rows;
                })();
                inFlight.set(key,request); try{return await request;} finally{inFlight.delete(key);}
            };
            async function drainRefresh(){
                if(!bootComplete || refreshing || !refreshStaticContent) return;
                refreshing=true;
                try {while(refreshPending){refreshPending=false; await refreshStaticContent();}} finally{refreshing=false;}
            }
            const applySyncDocument = next => {
                next=next||{};
                const version=String(next.version||'0'), sections=next.versions||{};
                const previousSections=sectionVersions;
                const globalChanged=version!==currentWebSyncVersion;
                const initial=currentWebSyncVersion==='';
                const changed=globalChanged || JSON.stringify(sections)!==JSON.stringify(previousSections);
                if(changed && currentWebSyncVersion!=='') queueChangedSections(previousSections,sections,globalChanged);
                currentWebSyncVersion=version; sectionVersions=sections;
                if(changed && !initial){refreshPending=true; drainRefresh();}
            };
            try { applySyncDocument(await fetchWithTimeout(fetchPublicRestDoc('config_web','web_sync'),T_OUT)); }
            catch(error){ console.warn('Sincronización pública inicial no disponible',error); }

            // Mantiene cambios del administrador sin cargar Firestore SDK completo.
            // Se consulta solo cuando la pestaña está visible y a baja frecuencia.
            setInterval(async()=>{
                if(isThemePreview || document.hidden) return;
                try { applySyncDocument(await fetchPublicRestDoc('config_web','web_sync')); } catch(_) {}
            },45000);

            const loadBanner = async () => {
                try {
                    // config_web ya se usa para el tema. Reutilizamos la misma colección/cache
                    // en lugar de hacer una segunda lectura independiente del documento global.
                    const configRows = await fetchStaticCollection('config_web');
                    const bannerData = configRows.find(row => row.id === 'global') || {};
                    const bannerEl = document.getElementById('topAnnouncementBanner');
                    if (bannerData.bannerActive === true && bannerData.bannerText) {
                        document.getElementById('bannerTextSpan').textContent = cleanStr(bannerData.bannerText);
                        bannerEl.style.display = 'flex'; 
                    } else { bannerEl.style.display = 'none'; }
                } catch(e) {}
            };

            const loadCampaigns = async () => {
                try {
                    const rows = await fetchStaticCollection('campanas_web');
                    const todayStr = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
                    app.campaigns = rows.filter(c => {
                        if (c.activo !== true) return false;
                        if (c.fechaInicio && todayStr < cleanStr(c.fechaInicio)) return false;
                        if (c.fechaFin && todayStr > cleanStr(c.fechaFin)) return false;
                        return true;
                    }).sort((a, b) => (a.destacada === true && !b.destacada ? -1 : (!a.destacada && b.destacada ? 1 : (Number(a.orden) || 0) - (Number(b.orden) || 0))));
                } catch(e) {}
            };

            const loadCategories = async () => {
                try {
                    const rows = await fetchStaticCollection('categorias_web');
                    dynamicCategories = rows.filter(c => isCategoryCurrentlyVisible(c)).sort((a, b) => (a.orden || 0) - (b.orden || 0));
                } catch(e) { dynamicCategories = []; }
            };

            const loadCatalog = async () => {
                try {
                    const rows = await fetchStaticCollection('catalogo_web');
                    if(rows.length) {
                        const cd = rows.map(dt => { 
                            return markChristmasBookingItem({ id:dt.id, name:dt.nombre, title:dt.titulo, slug:dt.slug, price:dt.precio, originalPrice:dt.precioOriginal||dt.precio, discountApplied: dt.oferta===true, destacado: dt.destacado===true, description:dt.descripcion, image:dt.imagen, cardImage:dt.imagenTarjeta || dt.imagen, services:dt.serviciosLista?dt.serviciosLista.split('\n').filter(s=>s.trim()!==''):[], tipoServicio:dt.tipoServicio||'servicio', tematica:dt.tematica||'', tipoCobro:dt.tipoCobro||'paquete', isHourly:dt.tipoCobro==='hora', isPerChild:dt.tipoCobro==='nino', cantidadMinima:dt.cantidadMinima, cantidadMaxima:dt.cantidadMaxima, incrementoCantidad:dt.incrementoCantidad, unidadEtiqueta:dt.unidadEtiqueta, categoria:dt.categoria, orden: dt.orden, esNavidad:dt.esNavidad===true, recursoNavidad:dt.recursoNavidad||'', _raw:dt });
                        });
                        if(cd.length>0){ app.catalog = cd.sort((a,b) => (a.orden || 0) - (b.orden || 0)); allPurchasableItems = [...app.catalog]; }
                        catalogLoaded = true; window.catalogLoaded = true;
                    } else {
                        app.catalog = [];
                        catalogLoaded = true; window.catalogLoaded = true;
                    }
                } catch(e) {
                    catalogLoaded = true; window.catalogLoaded = true;
                }
            };

            const loadTheme = async () => {
                if(isThemePreview){applyThemeColors(previewTheme||{nombre:'Normal'});return;}
                try {
                    const themes = await fetchStaticCollection('temas_web');
                    if (themes.length) {
                        
                        // Busca EXACTAMENTE el tema que marcaste como activo en tu administrador
                        let themeConfig=(await fetchStaticCollection('config_web')).find(t=>t.id==='tema_global')||{};
                        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Panama',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
                        let sel = themeConfig.modo==='manual' ? themes.find(t=>t.id===themeConfig.temaManualActivo) : themes.find(t=>t.fechaInicio && t.fechaFin && today>=t.fechaInicio && today<=t.fechaFin);
                        if (!sel) sel = themes.find(t => t.isDefault === true);
                        if (!sel) sel = themes[0];
                        
                        if (sel) { app.theme = sel; applyThemeColors(app.theme); }
                    }
                } catch(e) {}
            };

            const loadTransport = async () => {
                // La administración visual ya no gobierna las tarifas operativas. Cargamos
                // exclusivamente la tabla comercial vigente para que ningún documento viejo
                // de `transporte_web` pueda cambiar un precio del GPS sin que el CRM lo sepa.
                locations = NORMAL_MANUAL_ZONES
                    .filter(z => !z.review)
                    .map(z => ({ value:z.value, label:z.label, cost:Number(z.cost)||0, pricingVersion:3 }));
                populateLocationSelects();
                updateCartBadgeAndTotals();
            };
            const loadGallery = async () => { gallery=(await fetchStaticCollection('galeria_web')).map(d=>({image:d.image,alt:'Diverty'})); };
            const loadReviews = async () => { customerReviews=await fetchStaticCollection('resenas_web'); };
            const loadCoupons = async () => { activeCoupons=(await fetchStaticCollection('cupones_web')).filter(c=>c.active!==false && c.activo!==false); if(appliedCoupon){appliedCoupon=activeCoupons.find(c=>c.code===appliedCoupon.code)||null;} };
            const loadSecondary = async () => { await Promise.allSettled([loadTransport(),loadGallery(),loadReviews(),loadCoupons()]); };

            const normalizeCatalogVisibility = () => {
                const visibleCategoryIds = new Set(dynamicCategories.map(c => c.id));
                app.catalog = app.catalog.filter(item => visibleCategoryIds.has(item.categoria));
                allPurchasableItems = [...app.catalog];
            };
            const rerenderAfterSelectiveSync = changed => {
                const affectsNav = changed.has('categorias_web');
                const affectsCatalog = affectsNav || changed.has('catalogo_web');
                const affectsHome = affectsCatalog || changed.has('campanas_web') || changed.has('resenas_web') || changed.has('galeria_web');
                if (affectsNav) buildDynamicNav();

                // Mantiene el detalle abierto si llegó por WhatsApp/enlace directo.
                if (affectsCatalog && app.activeSection!=='booking' && getDirectRoute().planId && openDirectRouteFromUrl({ invalidFallback:false })) { updateCartUI(); return; }

                if (app.activeSection === 'home' && affectsHome) renderHome();
                else if (app.activeSection === 'catalog' && affectsCatalog) renderAllCatalog();
                else if (app.activeSection?.startsWith('cat_') && affectsCatalog) renderCategory(app.activeSection.replace('cat_',''));
                else if (app.activeSection === 'gallery' && changed.has('galeria_web')) renderGallery();
                // El formulario activo conserva foco, paso y campos mientras llega contenido nuevo.
                updateCartUI();
            };
            refreshStaticContent = async () => {
                try {
                    const changed = new Set(pendingSyncSections);
                    pendingSyncSections.clear();
                    // Si no conocemos la sección exacta, conservamos el refresco completo
                    // para no romper compatibilidad con datos/versiones anteriores.
                    const full = changed.size === 0 || changed.has('*');
                    const jobs = [];
                    if (full || changed.has('temas_web') || changed.has('config_web')) jobs.push(loadTheme());
                    if (full || changed.has('config_web')) jobs.push(loadBanner());
                    if (!isThemePreview && (full || changed.has('config_web'))) jobs.push(loadClosedDates({force:true}).then(()=>{renderCalendar();updateBookingDateClosures();}));
                    if (full || changed.has('categorias_web')) jobs.push(loadCategories());
                    if (full || changed.has('catalogo_web')) jobs.push(loadCatalog());
                    if (full || changed.has('campanas_web')) jobs.push(loadCampaigns());
                    if (full || changed.has('transporte_web')) jobs.push(loadTransport());
                    if (full || changed.has('galeria_web')) jobs.push(loadGallery());
                    if (full || changed.has('resenas_web')) jobs.push(loadReviews());
                    if (full || changed.has('cupones_web')) jobs.push(loadCoupons());
                    await Promise.allSettled(jobs);

                    if (full || changed.has('categorias_web') || changed.has('catalogo_web')) normalizeCatalogVisibility();
                    rerenderAfterSelectiveSync(full ? new Set(['categorias_web','catalogo_web','campanas_web','resenas_web','galeria_web','transporte_web','cupones_web']) : changed);
                } catch (e) { console.warn('No se pudo refrescar contenido web:', e); }
            };

            // Load public content together: categories and catalog need not wait
            // for the theme. The brief brand transition already released the page.
            await Promise.allSettled([
                loadTheme(),
                loadCategories(), 
                loadCatalog(), 
                loadBanner(), 
                loadCampaigns() 
            ]);

            // La visibilidad del catálogo se aplica a TODA la web, no solo al explorador.
            // Así un catálogo oculto o fuera de temporada tampoco deja paquetes sueltos
            // en destacados, búsquedas, páginas de categoría o acciones de compra.
            const visibleCategoryIds = new Set(dynamicCategories.map(c => c.id));
            app.catalog = app.catalog.filter(item => visibleCategoryIds.has(item.categoria));
            allPurchasableItems = [...app.catalog];

            buildDynamicNav();
            isFirebaseLoaded = true;
            
            // Si el visitante llegó desde un enlace compartido, abre exactamente ese contenido
            // después de que Firebase y las reglas de temporada hayan terminado de cargar.
            const directOpened = openDirectRouteFromUrl();
            if (!directOpened) {
                if (app.activeSection === 'home') renderHome();
                else setActiveSection(app.activeSection);
            }
            
            updateCartUI();
            finishThemeBoot();

            // Secundarios públicos siguen por REST; disponibilidad/Firebase completo se carga
            // solamente cuando el calendario se acerca a pantalla o el usuario entra a Reservar.
            await Promise.allSettled([loadSecondary()]);
            if(app.activeSection==='home') renderHome();
            else if(app.activeSection==='gallery') renderGallery();
            bootComplete=true; await drainRefresh();

            let lazyAvailabilityStartedAt=0;
            const lazyLoadAvailability = async () => {
                if (isThemePreview || availabilityReady || Date.now()-lazyAvailabilityStartedAt<30000) return;
                lazyAvailabilityStartedAt=Date.now();
                try {
                    await loadBookedEventsForMonth(new Date(currentCalDate));
                    if(app.activeSection==='home') renderCalendar();
                } catch(e) { console.warn('Disponibilidad bajo demanda no disponible', e); }
            };
            let calendarObserver=null;
            window.__divertyObserveCalendar=()=>{
                if(calendarObserver)calendarObserver.disconnect();
                const calendarEl=document.getElementById('calendar-section');
                if(!calendarEl||isThemePreview)return;
                if('IntersectionObserver' in window){
                    calendarObserver=new IntersectionObserver(entries=>{
                        if(entries.some(x=>x.isIntersecting)){calendarObserver.disconnect();lazyLoadAvailability();}
                    },{rootMargin:'180px 0px'});
                    calendarObserver.observe(calendarEl);
                }else{lazyLoadAvailability();}
            };
            window.__divertyLazyAvailability=lazyLoadAvailability;
            window.__divertyObserveCalendar();

        }

        // Las pantallas temporales se cierran antes de interpretar Atrás como navegación.
        window.addEventListener('popstate', (event) => {
            if (suppressNextCartPopstate) {
                suppressNextCartPopstate = false;
                return;
            }
            if (suppressNextMenuPopstate) {
                suppressNextMenuPopstate = false;
                return;
            }

            const cartModal = document.getElementById('cartModal');
            if (cartModal?.classList.contains('show')) {
                toggleCartDrawer(false, true);
                return;
            }

            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenu?.classList.contains('open')) {
                toggleMobileMenu(false, true);
                return;
            }

            if(app.activeSection==='booking' && getDirectRoute().view==='booking'){
                const targetStep=Math.min(3,Math.max(1,Number(event.state?.bookingStep)||1));
                if(targetStep!==app.wizardStep){
                    const form=document.getElementById('bookingForm');
                    if(form) bookingFormState={...bookingFormState,...Object.fromEntries(new FormData(form).entries())};
                    app.wizardStep=targetStep;renderBooking();
                    requestAnimationFrame(()=>document.getElementById('bookingForm')?.scrollIntoView({behavior:'smooth',block:'start'}));
                }
                return;
            }

            if (!isFirebaseLoaded) return;
            if (!openDirectRouteFromUrl({ invalidFallback: false })) {
                app.activeSection = 'home';
                renderHome();
                window.scrollTo(0, 0);
            }
        });

        let catalogScrollSaveTimer = null;
        window.addEventListener('scroll', () => {
            if (!app.activeSection || (app.activeSection !== 'catalog' && !app.activeSection.startsWith('cat_'))) return;
            clearTimeout(catalogScrollSaveTimer);
            catalogScrollSaveTimer = setTimeout(() => {
                const memoryKey = app.activeSection === 'catalog' ? 'catalog' : app.activeSection.replace('cat_', '');
                catalogNavMemory.save(memoryKey);
            }, 120);
        }, { passive:true });

        function setupEventListeners() {
            if (window.location.hash) { history.replaceState(null, null, ' '); }
            setTimeout(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, 50);
            
            document.body.addEventListener('click', handleGlobalClick);
            
            const header=document.getElementById('headerWrapper');
            const measureHeader=()=>{if(header) document.documentElement.style.setProperty('--diverty-header-bottom',`${Math.ceil(header.getBoundingClientRect().bottom)+8}px`);};
            measureHeader();
            if(header && 'ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
            window.addEventListener('resize',measureHeader,{passive:true});
            const mt = document.getElementById('mobileToggle');
            if(mt) mt.onclick = () => {
                const menu = document.getElementById('mobileMenu');
                toggleMobileMenu(!(menu && menu.classList.contains('open')));
            };
            const mmo = document.getElementById('mobileMenuOverlay');
            if(mmo) mmo.onclick = () => toggleMobileMenu(false);
            
            const vc = document.getElementById('viewCart');
            if(vc) {
                vc.setAttribute('aria-expanded', 'false');
                vc.onclick = () => toggleCartDrawer();
            }
            const vcs = document.getElementById('viewCartSummary');
            if(vcs) {
                vcs.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleCartDrawer(true);
                };
            }
            
            let ticking = false;
            window.addEventListener('scroll', () => { 
                if (!ticking) {
                    window.requestAnimationFrame(() => {
                        const hw = document.getElementById('headerWrapper'); 
                        if(hw) window.scrollY > 50 ? hw.classList.add('scrolled') : hw.classList.remove('scrolled');
                        ticking = false;
                    });
                    ticking = true;
                }
            }, { passive: true });
            
            document.addEventListener('change', e => {
                if (!e.target.matches('[data-service-quantity]')) return;
                const item=allPurchasableItems.find(row=>row.id===e.target.dataset.serviceQuantity);
                if(item) setItemQuantityDisplay(item,e.target.value);
            });
            document.addEventListener('change', e => { if (e.target.matches('#cartLocation')) { app.location = e.target.value; updateCartUI(); } });
        }

        // Estado inicial seguro: ningún overlay invisible puede interceptar el primer toque.
        const __initialMenuOverlay = document.getElementById('mobileMenuOverlay');
        if (__initialMenuOverlay) {
            __initialMenuOverlay.classList.remove('menu-overlay-open');
            __initialMenuOverlay.style.opacity = '0';
            __initialMenuOverlay.style.visibility = 'hidden';
            __initialMenuOverlay.style.pointerEvents = 'none';
        }

        setupEventListeners(); 
        populateLocationSelects(); 
        updateThemeAssets(document.body.dataset.theme||'default');
        if(typeof lucide !== 'undefined') lucide.createIcons();
        if(app.activeSection === 'home') renderHome(); else setActiveSection(app.activeSection);
        document.body.classList.add('js-loaded');
        const loader = document.getElementById('initial-loader'); if(loader) loader.style.display = 'none';

        setTimeout(() => { initFirebaseAndData(); }, 50);
