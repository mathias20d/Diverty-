import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePreciseGps,gpsAccuracyMessage} from '../assets/js/diverty-gps-capture.mjs';

function fixture(){
 let now=1700000000000,id=0,callbacks,options;const timers=new Map(),cleared=[];
 const advance=ms=>{const end=now+ms;while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].run();}now=end;};
 const progress=[];
 const search=capturePreciseGps({geolocation:{watchPosition(success,error,opts){callbacks={success,error};options=opts;return 0;},clearWatch(value){cleared.push(value);}},now:()=>now,setTimer:(run,delay)=>{timers.set(++id,{run,at:now+delay});return id;},clearTimer:value=>timers.delete(value),onProgress:point=>progress.push(point)});
 const sample=(accuracy,lat=9.01234567,age=0)=>callbacks.success({coords:{latitude:lat,longitude:-79.50123456,accuracy},timestamp:now-age});
 return {search,sample,advance,progress,cleared,timers,error:code=>callbacks.error({code}),get options(){return options;}};
}
test('does not stop at the first 25m fix and selects the later 6m point',async()=>{
 const f=fixture();let done=false;f.search.promise.then(()=>done=true);f.sample(25,9.0129);f.advance(1000);f.sample(18,9.0128);f.advance(1000);await Promise.resolve();assert.equal(done,false);
 f.sample(6,9.01234567);const point=await f.search.promise;assert.equal(point.lat,9.01234567);assert.equal(point.accuracy,6);assert.deepEqual(f.cleared,[0]);assert.equal(f.timers.size,0);
 assert.deepEqual(f.options,{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 f.sample(1,9.9);assert.equal(f.progress.length,3,'late readings cannot replace the accepted point');
});
test('a good fresh fix completes after settling even if the device emits no second reading',async()=>{
 const f=fixture();f.sample(5);f.advance(2000);assert.equal((await f.search.promise).accuracy,5);assert.equal(f.timers.size,0);
});
test('cached, invalid and unknown-accuracy fixes are ignored and the best estimate is retained',async()=>{
 const f=fixture();f.sample(2,9.5,8000);f.sample(0);f.sample(NaN);f.sample(3,91);f.sample(40,9.0123);f.advance(1000);f.sample(35,9.0124);f.advance(2000);f.sample(70,9.99);f.advance(9000);
 const point=await f.search.promise;assert.equal(point.lat,9.0124);assert.equal(point.accuracy,35);assert.match(gpsAccuracyMessage(point.accuracy),/aproximada.*35 m/);assert.doesNotMatch(gpsAccuracyMessage(point.accuracy),/verificada/);assert.equal(f.progress.length,2);
});
test('transient GPS errors can recover, while permission denial stops immediately',async()=>{
 const f=fixture();f.error(3);f.advance(1500);f.sample(7);f.advance(500);assert.equal((await f.search.promise).accuracy,7);
 const denied=fixture();const rejection=assert.rejects(denied.search.promise,e=>e.code===1);denied.error(1);await rejection;assert.deepEqual(denied.cleared,[0]);assert.equal(denied.timers.size,0);
});
test('cancellation and no valid reading release the watcher and every timer',async()=>{
 const f=fixture();const cancelled=assert.rejects(f.search.promise,e=>e.code==='GPS_CANCELLED');f.search.cancel();f.sample(5);await cancelled;assert.equal(f.progress.length,0);assert.equal(f.timers.size,0);assert.deepEqual(f.cleared,[0]);
 const empty=fixture();const failure=assert.rejects(empty.search.promise,e=>e.code===2);empty.advance(12000);await failure;assert.equal(empty.timers.size,0);assert.deepEqual(empty.cleared,[0]);
});
