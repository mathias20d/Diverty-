// Geofences and fees mirrored from the existing web policy. Labels from clients
// are never used to override a GPS point in the authoritative check.
const christmasRouteDistanceKm = (a,b) => {
            if (!a || !b) return null;
            const R=6371, rad=Math.PI/180;
            const dLat=(b.lat-a.lat)*rad, dLng=(b.lng-a.lng)*rad;
            const x=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
            return 2*R*Math.asin(Math.sqrt(x));
        };
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
        function evaluateChristmasCoverage(lat,lng,label=''){
            const text=normalizeChristmasPlace(label);
            const special=CHRISTMAS_REVIEW_TERMS.some(term=>text.includes(term));
            if(special) return {status:'review',charge:0,label:'Ubicación especial · confirmar',reason:'security'};

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
            const hasGps=Number.isFinite(la)&&Number.isFinite(lo);

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

            // Sin GPS se intenta orientar por el texto; si no es inequívoco, se manda a revisión.
            const named=[
                {terms:['punta pacifica'],charge:5,label:'Punta Pacífica',zoneValue:'punta-pacifica'},
                {terms:['costa del este'],charge:5,label:'Costa del Este',zoneValue:'costa-del-este'},
                {terms:['albrook','clayton','ciudad del saber'],charge:5,label:'Albrook / Clayton',zoneValue:'albrook-clayton'},
                {terms:['panama pacifico','arraijan'],charge:15,label:'Arraiján / Panamá Pacífico',zoneValue:'arraijan'},
                {terms:['pacora'],charge:15,label:'Panamá Este · después de Megamall hasta Pacora',zoneValue:'panama-este'},
                {terms:['villa grecia','panama norte','las cumbres','villa zaita','ernesto cordoba'],charge:15,label:'Panamá Norte · hasta Villa Grecia',zoneValue:'panama-norte'},
                {terms:['costa verde'],charge:20,label:'Costa Verde · hasta 3 km',zoneValue:'costa-verde-3km'},
                {terms:['la chorrera','chorrera'],charge:25,label:'La Chorrera',zoneValue:'chorrera'},
                {terms:['las acacias','don bosco','juan diaz','el crisol','concepcion','panama viejo','bella vista','avenida peru','avenida brasil','via brasil','tocumen'],charge:0,label:'Ciudad de Panamá',zoneValue:'ciudad-panama'}
            ];
            for(const z of named) if(z.terms.some(t=>text.includes(t))) return {status:'included',charge:normalConfiguredCost(z.zoneValue,z.charge),label:z.label,zoneValue:z.zoneValue};
            return {status:'review',charge:0,label:'Ubicación por revisar',reason:'no-gps',zoneValue:''};
        }
        
export function gps(value) {
  if(value?.lat == null || value?.lng == null || value.lat === '' || value.lng === '') return null;
  const lat=Number(value.lat), lng=Number(value.lng);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0)?{lat,lng}:null;
}
export function addressGps(address) {
  let raw=String(address||''); try {raw=decodeURIComponent(raw);}catch{}
  const m=raw.match(/(?:[?&](?:q|query|ll|center)=|@|^)(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i);
  return m?gps({lat:m[1],lng:m[2]}):null;
}
export function coverage(point, christmas, text='') {
  const restricted=NORMAL_RESTRICTED_TERMS.some(t=>normalizeChristmasPlace(text).includes(t));
  if(restricted)return {status:christmas?'review':'blocked',charge:0,label:'Ubicación por revisar',reason:'security'};
  if(!point)return {status:'review',charge:0,label:christmas?'Ubicación por confirmar':'Ubicación por revisar',reason:'no-gps'};
  if(!christmas && ((christmasRouteDistanceKm(point,{lat:8.97644,lng:-79.50794})<=1.35)||(christmasRouteDistanceKm(point,{lat:9.01318,lng:-79.46807})<=1.9))) return {status:'included',charge:5,label:'Transporte adicional'};
  return christmas?evaluateChristmasCoverage(point.lat,point.lng,''):evaluateNormalCoverage(point.lat,point.lng,'');
}
export {christmasRouteDistanceKm as distanceKm};
