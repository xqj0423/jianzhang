import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../lib/handler.mjs';
const host='https://frontend.example', upstream='https://backend.example';
const session='__Host-jianzhang=fixture-session; Path=/; HttpOnly; Secure; SameSite=Lax';

test('public homepage mode fails closed, including environment misconfiguration',()=>{
  assert.throws(()=>createHandler({upstream,publicAccess:true}),/BOOK_PUBLIC_ACCESS/);
  const previous=process.env.BOOK_PUBLIC_ACCESS;
  try {
    process.env.BOOK_PUBLIC_ACCESS='true';
    assert.throws(()=>createHandler({upstream}),/BOOK_PUBLIC_ACCESS/);
    assert.throws(()=>createHandler({upstream,publicAccess:false}),/BOOK_PUBLIC_ACCESS/);
  } finally {
    if(previous===undefined)delete process.env.BOOK_PUBLIC_ACCESS;
    else process.env.BOOK_PUBLIC_ACCESS=previous;
  }
});

test('homepage preserves separate cookies and security headers, not arbitrary upstream headers',async()=>{
  const handle=createHandler({upstream,fetchImpl:async(url,options)=>{
    assert.equal(String(url),upstream+'/');
    assert.equal(options.headers.cookie,'fixture=existing');
    assert.equal(options.redirect,'manual');
    assert.equal(options.cache,'no-store');
    const headers=new Headers({'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'",'Referrer-Policy':'no-referrer','Cache-Control':'public','X-Internal-Secret':'not-forwarded','Content-Disposition':'attachment'});
    headers.append('Set-Cookie',session);
    headers.append('Set-Cookie','fixture=expired; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure');
    return new Response('login page',{headers});
  }});
  const response=await handle(new Request(host+'/',{headers:{cookie:'fixture=existing'}}));
  assert.equal(await response.text(),'login page');
  assert.equal(response.headers.getSetCookie().length,2);
  assert.equal(response.headers.getSetCookie()[0],session);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('content-security-policy'),"default-src 'self'");
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  assert.equal(response.headers.get('x-internal-secret'),null);
  assert.equal(response.headers.get('content-disposition'),null);
});

test('homepage and API share same-origin redirect rewriting with query and fragment',async()=>{
  for(const path of ['/','/shortcut-help']) {
    for(const location of [upstream+'/login?next=%2F#email','/login?next=%2F#email']) {
      const handle=createHandler({upstream,fetchImpl:async()=>new Response(null,{status:302,headers:{Location:location,'Set-Cookie':session}})});
      const response=await handle(new Request(host+path));
      assert.equal(response.status,302);
      assert.equal(response.headers.get('location'),'/login?next=%2F#email');
      assert.equal(response.headers.get('set-cookie'),session);
    }
  }
});

test('homepage and API reject external, credential-bearing, and malformed redirects',async()=>{
  for(const path of ['/','/shortcut-help']) {
    for(const location of ['https://other.example/','//other.example/','javascript:alert(1)','https://name:password@backend.example/','https://[']) {
      const handle=createHandler({upstream,fetchImpl:async()=>new Response(null,{status:302,headers:{Location:location,'Set-Cookie':session}})});
      const response=await handle(new Request(host+path));
      assert.equal(response.status,502,location);
      assert.equal(response.headers.get('location'),null);
      assert.equal(response.headers.get('set-cookie'),null);
    }
  }
});

test('homepage HEAD has no body and retains upstream cookies and status',async()=>{
  let cancelled=false;
  const handle=createHandler({upstream,fetchImpl:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:200,headers:{'Set-Cookie':session,'Content-Type':'text/html'}})});
  const response=await handle(new Request(host+'/',{method:'HEAD'}));
  assert.equal(response.status,200);
  assert.equal(await response.text(),'');
  assert.equal(response.headers.get('set-cookie'),session);
  assert.equal(cancelled,true);
});

test('homepage preserves authentication failures and reports outages without local fallback',async()=>{
  const unauthorized=createHandler({upstream,html:'must not be served',fetchImpl:async()=>new Response('login required',{status:401})});
  const response=await unauthorized(new Request(host+'/'));
  assert.equal(response.status,401);
  assert.equal(await response.text(),'login required');
  let calls=0;
  const offline=createHandler({upstream,html:'must not be served',fetchImpl:async()=>{calls++;throw Error('offline');}});
  assert.equal((await offline(new Request(host+'/'))).status,503);
  assert.equal(calls,1);
});
