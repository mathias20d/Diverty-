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
function computeChristmasSmartRoute(date,time,capacity,gps,rows=[]){
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
export {computeChristmasSmartRoute};
