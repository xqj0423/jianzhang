import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../lib/handler.mjs';
const host='https://jianzhang.example',upstream='https://upstream.example';
const setup=(fetchImpl)=>createHandler({html:'<html>ledger</html>',shortcut:new Uint8Array([65,69,65,49]),upstream,fetchImpl,publicAccess:true});

test('owner directory proxy forwards pagination and cookie; preserves forbidden response',async()=>{
 const handle=setup(async(url,options)=>{assert.equal(String(url),upstream+'/api/admin/users?after=owner&limit=30');assert.equal(options.headers.get('cookie'),'fixture-cookie');return Response.json({error:'forbidden'},{status:403});});
 const response=await handle(new Request(host+'/api/index?__route=/api/admin/users&after=owner&limit=30&unsafe=ignored',{headers:{cookie:'fixture-cookie'}}));assert.equal(response.status,403);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('homepage and signed shortcut are served locally; no database request',async()=>{
 const handle=setup(()=>{throw Error('Must not fetch');});
 const home=await handle(new Request(host+'/api/index?__route=/'));
 assert.equal(home.status,200);assert.equal(await home.text(),'<html>ledger</html>');assert.match(home.headers.get('content-security-policy'),/connect-src 'self'/);
 const download=await handle(new Request(host+'/download/shortcut'));assert.equal(Buffer.from(await download.arrayBuffer()).toString(),'AEA1');
});
test('state GET preserves original revision and complete ledger',async()=>{
 const snapshot={revision:37,db:{version:1,initial:88,rows:[{id:'existing',cents:902,note:'烤鸭',date:'2026-10-13 12:00:00'}]}};
 const handle=setup(async(url,options)=>{assert.equal(String(url),upstream+'/api/state');assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');return Response.json(snapshot);});
 const response=await handle(new Request(host+'/api/index?__route=/api/state'));assert.deepEqual(await response.json(),snapshot);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('cross-origin or absent-origin writes are rejected before forwarding',async()=>{
 let calls=0;const handle=setup(async()=>{calls++;return Response.json({saved:true});});
 for(const path of ['/api/state','/api/shortcut-config','/api/login-request','/api/login-verify','/api/lock'])for(const origin of [undefined,'https://wrong.example']){
   const response=await handle(new Request(host+path,{method:path==='/api/state'?'PUT':'POST',headers:origin?{origin}:{},body:'{}'}));assert.equal(response.status,403);
 }
 assert.equal(calls,0);
});
test('valid save retains bytes and revision; conflicts remain 409',async()=>{
 const body=JSON.stringify({db:{version:1,initial:0,rows:[]},revision:37});
 const handle=setup(async(url,options)=>{
  assert.equal(String(url),upstream+'/api/state');assert.equal(options.headers.get('origin'),upstream);assert.equal(Buffer.from(options.body).toString(),body);
  return Response.json({error:'stale revision'},{status:409});
 });
 const response=await handle(new Request(host+'/api/state',{method:'PUT',headers:{origin:host,'content-type':'application/json'},body}));assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'stale revision'});
});
test('shortcut token and stable request id survive proxy; duplicate result preserved',async()=>{
 const payload={request_id:'stable-id-00001',text:'支付成功 9.02'};
 const handle=setup(async(url,options)=>{
   assert.equal(String(url),upstream+'/api/capture');assert.equal(options.headers.get('authorization'),'Bearer fixture-token');assert.deepEqual(JSON.parse(Buffer.from(options.body)),payload);
   return Response.json({saved:true,duplicate:true,id:'shortcut-stable-id-00001'});
 });
 const response=await handle(new Request(host+'/api/capture',{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json'},body:JSON.stringify(payload)}));assert.equal((await response.json()).duplicate,true);
});
test('new shortcut configuration changes only endpoint; original token retained',async()=>{
 const original={url:upstream+'/api/record',method:'POST',headers:{Authorization:'Bearer fixture-token'},body:{request_id:'UUID'}};
 const handle=setup(async()=>Response.json(original));
 const response=await handle(new Request(host+'/api/shortcut-config',{method:'POST',headers:{origin:host},body:'{}'}));
 assert.deepEqual(await response.json(),{...original,url:host+'/api/record'});
});
test('upstream outage never reports success or retries a write',async()=>{
 let calls=0;const handle=setup(async()=>{calls++;throw Error('network failure after write');});
 const response=await handle(new Request(host+'/api/record',{method:'POST',body:'{}'}));assert.equal(response.status,503);assert.equal((await response.json()).saved,false);assert.equal(calls,1);
});
test('unknown paths cannot turn adapter into arbitrary proxy',async()=>{
 const handle=setup(()=>{throw Error('Must not fetch');});
 for(const path of ['/api/unknown','/api/index?__route=https://wrong.example/api/state'])assert.equal((await handle(new Request(host+path))).status,404);
 assert.equal((await handle(new Request(host+'/api/state',{method:'DELETE'}))).status,405);
});
test('upstream authentication and same-site redirects preserved',async()=>{
 const unauthorized=setup(async()=>Response.json({saved:false,error:'bad token'},{status:401}));assert.equal((await unauthorized(new Request(host+'/api/record',{method:'POST',body:'{}'}))).status,401);
 const redirect=setup(async()=>new Response(null,{status:302,headers:{location:upstream+'/'}}));assert.equal((await redirect(new Request(host+'/shortcut-help'))).headers.get('location'),'/');
});
