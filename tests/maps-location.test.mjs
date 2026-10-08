import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {shortMapsUrl,mapsLocationFromUrl,readMapsLocation} from '../assets/js/diverty-maps-link.mjs';
import handler from '../netlify/functions/map-location.mjs';

const short='https://maps.app.goo.gl/ocTJwiG8PGL8XaSG9';
const expanded='https://www.google.com/maps/place/PH+Allure,+Calle+Colombia,+Panam%C3%A1,+Provincia+de+Panam%C3%A1/data=!4m2!3m1!1s0x8faca8e848ed5abf:0x89c159ff151b95a2';
const place={displayName:'PH Allure, Calle Colombia, Panamá, Provincia de Panamá',point:null};
const request=body=>new Request('https://divertypanama.netlify.app/api/map-location',{method:'POST',body:JSON.stringify(body)});

test('Google links identify a place without inventing coordinates',()=>{
  assert.equal(shortMapsUrl(short),short);assert.ok(shortMapsUrl('https://goo.gl/maps/12345678'));
  for(const url of ['http://maps.app.goo.gl/12345678','https://example.com/12345678','https://maps.app.goo.gl.example.com/12345678','https://user@maps.app.goo.gl/12345678','https://maps.app.goo.gl:8080/12345678','https://maps.app.goo.gl/a/b',null])assert.equal(shortMapsUrl(url),null);
  assert.deepEqual(mapsLocationFromUrl(expanded),place);
  assert.equal(mapsLocationFromUrl('https://example.com/maps/place/Allure'),null);
  assert.equal(mapsLocationFromUrl('https://www.google.com/maps/place/%ZZ'),null);
  assert.deepEqual(mapsLocationFromUrl('https://www.google.com/maps/place/Prueba/@9.02,-79.52,18z/data=!3d9.01!4d-79.51').point,{lat:9.01,lng:-79.51});
});

test('resolver reads only the allowlisted first redirect and handles failures safely',async()=>{
  const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,short);assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:expanded}});};
    const response=await handler(request({url:short}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),place);
    assert.equal((await handler(request({url:short}))).status,200);assert.equal(calls,1,'resolved names are cached; the destination is never fetched');
    for(const body of [null,{}, {url:'https://example.com/12345678'}])assert.equal((await handler(request(body))).status,400);
    assert.equal((await handler(new Request('https://divertypanama.netlify.app/api/map-location'))).status,405);
    assert.equal((await handler(new Request('https://divertypanama.netlify.app/api/map-location',{method:'POST',headers:{origin:'https://example.com'},body:JSON.stringify({url:short})}))).status,403);
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://example.com/maps/place/Allure'}});
    assert.equal((await handler(request({url:'https://maps.app.goo.gl/foreign123'}))).status,422);
    globalThis.fetch=async()=>{throw new Error('timeout');};
    assert.equal((await handler(request({url:'https://maps.app.goo.gl/timeout123'}))).status,503);
  }finally{globalThis.fetch=original;}
});

test('client can resolve links, retaining manual booking if the lookup fails',async()=>{
  assert.deepEqual(await readMapsLocation(expanded,{fetcher:()=>assert.fail('no request for a long link')}),place);
  assert.deepEqual(await readMapsLocation(short,{fetcher:async(url,options)=>{assert.equal(url,'/api/map-location');assert.deepEqual(JSON.parse(options.body),{url:short});return Response.json(place);}}),place);
  for(const fetcher of [async()=>Response.json({}, {status:503}),async()=>{throw new Error('offline');}])assert.equal(await readMapsLocation(short,{fetcher}),null);
});

// Exercise the application's actual coverage function, including the previous
// null-to-zero bug; no duplicate implementation of the business rules.
const source=readFileSync(new URL('../assets/js/diverty-app-78bb30f118.js',import.meta.url),'utf8');
const scope=vm.createContext({normalizeChristmasPlace:value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),christmasRouteDistanceKm:(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng)*111});
vm.runInContext(source.slice(source.indexOf('const NORMAL_RESTRICTED_TERMS'),source.indexOf('function normalTransportCost()'))+';globalThis.coverage=evaluateNormalCoverage;',scope);
test('PH Allure is free without GPS; existing fees and restrictions remain',()=>{
  for(const coordinates of [[null,null],[undefined,undefined],['','']]){const result=scope.coverage(...coordinates,place.displayName);assert.equal(result.status,'included');assert.equal(result.charge,0);assert.equal(result.zoneValue,'ciudad-panama');}
  for(const [name,charge] of [['Punta Pacífica',5],['Costa del Este',5],['Albrook',5],['Arraiján',15],['Pacora',15],['Villa Grecia',15],['Costa Verde',20],['La Chorrera, Barrio Colón',25]])assert.equal(scope.coverage(null,null,name).charge,charge,name);
  assert.equal(scope.coverage(null,null,'Casa en Chepo').reason,'outside');
  assert.equal(scope.coverage(9.25,-79.5,'Calle Colombia').reason,'outside');
  assert.equal(scope.coverage(null,null,'El Chorrillo').status,'blocked');
  assert.equal(scope.coverage(null,null,'PH desconocido').reason,'no-gps');
});
