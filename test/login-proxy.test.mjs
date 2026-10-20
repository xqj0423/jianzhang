import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../lib/handler.mjs';
test('account resume forwards only its allowed flag and returns the renewed cookie',async()=>{
 const handle=createHandler({upstream:'https://backend.example',publicAccess:false,fetchImpl:async(url,options)=>{
  assert.equal(String(url),'https://backend.example/api/account?resume=1');
  assert.equal(options.headers.get('cookie'),'fixture=session');
  return Response.json({isOwner:true},{headers:{'Set-Cookie':'__Host-jianzhang=renewed; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000'}});
 }});
 const response=await handle(new Request('https://frontend.example/api/account?resume=1&unsafe=ignored',{headers:{cookie:'fixture=session'}}));
 assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
});
test('email login routes preserve payload, session cookies and failure statuses through Vercel',async()=>{
 const origin='https://frontend.example',upstream='https://backend.example';
 const handle=createHandler({html:'',upstream,publicAccess:false,fetchImpl:async(url,options)=>{
  assert.equal(options.headers.get('origin'),upstream);
  assert.equal(Buffer.from(options.body).toString(),'{"email":"fixture@example.com","code":"123456"}');
  if(url.pathname==='/api/login-request')return Response.json({error:'cooldown'},{status:429});
  return Response.json({ok:true},{headers:{'Set-Cookie':'__Host-jianzhang=fixture-session; Path=/; HttpOnly; Secure; SameSite=Strict'}});
 }});
 for(const path of ['/api/login-request','/api/login-verify']){
  const r=await handle(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"email":"fixture@example.com","code":"123456"}'}));
  assert.equal(r.status,path.endsWith('request')?429:200);
  if(path.endsWith('verify'))assert.match(r.headers.get('set-cookie'),/__Host-jianzhang=/);
 }
 assert.equal((await handle(new Request(origin+'/api/unlock',{method:'POST'}))).status,404);
});
