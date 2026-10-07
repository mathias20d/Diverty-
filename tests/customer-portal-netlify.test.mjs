import test from 'node:test';
import assert from 'node:assert/strict';
import {customerPortalHandler} from '../netlify/lib/customer-portal-handler.mjs';
import {PortalError} from '../firebase/functions/portal-policy.mjs';
import {requestCustomerPortal} from '../assets/js/diverty-portal-api.mjs';
import {searchCustomerPortal} from '../assets/js/diverty-portal.mjs';
import deployedHandler from '../netlify/functions/customer-portal.mjs';

const request=(payload={search:'60702108'},options={})=>new Request('https://divertypanama.netlify.app/api/customer-portal',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-token',Origin:'https://divertypanama.netlify.app',...options.headers},body:JSON.stringify(payload)});
test('Netlify authenticates the Firebase session, passes a trusted IP and never caches lookup results',async()=>{
  let seen;
  const handler=customerPortalHandler(()=>({verifyToken:async token=>{assert.equal(token,'fixture-token');return {uid:'new-browser'};},portal:{lookup:async(...args)=>{seen=args;return {reservations:[{id:'web-fixture',cliente:'María Peña',fecha:'2026-12-24',abono:'25'}]};}}}));
  const response=await handler(request(),{ip:'192.0.2.1'});
  assert.equal(response.status,200);assert.deepEqual(seen,['new-browser',{search:'60702108'},'192.0.2.1']);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal((await response.json()).reservations[0].abono,'25');
});

test('method, foreign origin, missing authorization and malformed bodies stop before any database access',async()=>{
  const handler=customerPortalHandler(()=>assert.fail('invalid input must not access Firebase'));
  for(const [req,status] of [
    [new Request('https://divertypanama.netlify.app/api/customer-portal'),405],
    [request({}, {headers:{Origin:'https://other.example'}}),403],
    [request({}, {headers:{Authorization:''}}),401],
    [request({}, {headers:{Authorization:'Bearer '}}),401],
    [request({}, {headers:{'Content-Type':'text/plain'}}),415],
    [request([]),400],[request({search:'123'}),400],[request({search:'x'.repeat(300)}),400],
    [request({action:'sync',reservationId:'../secret'}),400],[request({action:'sync',reservationId:'manual-event'}),400],
    [request({action:'sync',reservationId:['web-array']}),400],
    [request({search:'María',extra:'x'.repeat(2050)}),400]
  ])assert.equal((await handler(req)).status,status);
});

test('failed verification and internal errors reveal no private credential or reservation details',async()=>{
  for(const failure of ['bad-token','credential']){
    const handler=customerPortalHandler(()=>{
      if(failure==='credential')throw new Error('private_key and private customer data');
      return {verifyToken:async()=>{throw new Error('private token');}};
    });
    const response=await handler(request());assert.equal(response.status,failure==='credential'?503:401);
    assert.doesNotMatch(await response.text(),/private_key|private token|customer data/);
  }
  const previous=process.env.DIVERTY_PORTAL_FIREBASE_ACCOUNT;
  delete process.env.DIVERTY_PORTAL_FIREBASE_ACCOUNT;
  try{assert.equal((await deployedHandler(request())).status,503);}
  finally{if(previous!==undefined)process.env.DIVERTY_PORTAL_FIREBASE_ACCOUNT=previous;}
});

test('web synchronization supplies the verified owner; forbidden attempts return no document data',async()=>{
  let seen;
  const handler=customerPortalHandler(()=>({verifyToken:async()=>({uid:'booking-owner'}),portal:{sync:async(...args)=>{seen=args;if(args[0]==='web-other')throw new PortalError('FORBIDDEN');}}}));
  const synced=await handler(request({action:'sync',reservationId:'web-own'}));
  assert.equal(synced.status,200);assert.deepEqual(seen,['web-own','booking-owner']);assert.deepEqual(await synced.json(),{synced:true});
  assert.equal((await handler(request({action:'sync',reservationId:'web-other'}))).status,403);
});

test('client sends the search in a private POST, accepts authoritative emptiness and handles platform limits/timeouts',async()=>{
  const fetchImpl=async(path,options)=>{
    assert.equal(path,'/api/customer-portal');assert.equal(options.headers.Authorization,'Bearer fixture-token');
    assert.equal(options.credentials,'omit');assert.deepEqual(JSON.parse(options.body),{search:'60702108'});
    return new Response(JSON.stringify({reservations:[]}),{status:200});
  };
  assert.deepEqual(await requestCustomerPortal({search:'60702108'},'fixture-token',{fetchImpl}),{reservations:[]});
  for(const [response,reason] of [
    [new Response('Netlify rate limit',{status:429}),'RATE_LIMITED'],
    [new Response(JSON.stringify({error:{reason:'AMBIGUOUS_NAME'}}),{status:409}),'AMBIGUOUS_NAME'],
    [new Response('Function unavailable',{status:503}),'UNAVAILABLE'],
    [new Response(JSON.stringify({reservations:null}),{status:200}),'UNAVAILABLE']
  ])await assert.rejects(requestCustomerPortal({search:'60702108'},'fixture-token',{fetchImpl:async()=>response}),error=>error.reason===reason);
  await assert.rejects(requestCustomerPortal({search:'60702108'},'fixture-token',{timeoutMs:5,fetchImpl:(_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}))}),error=>error.reason==='UNAVAILABLE');
  await assert.rejects(searchCustomerPortal('María Peña',{getOwned:async()=>[],lookup:()=>requestCustomerPortal({search:'María Peña'},'fixture-token',{fetchImpl:async()=>new Response(JSON.stringify({error:{reason:'AMBIGUOUS_NAME'}}),{status:409})})}),error=>error.reason==='AMBIGUOUS_NAME');
});
