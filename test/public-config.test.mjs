import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHandler} from '../lib/handler.mjs';
test('missing backend configuration fails instead of falling back to a personal account',()=>{
 const previous=process.env.LEDGER_UPSTREAM_ORIGIN;delete process.env.LEDGER_UPSTREAM_ORIGIN;
 try{assert.throws(()=>createHandler({html:''}),/LEDGER_UPSTREAM_ORIGIN/);}finally{if(previous!==undefined)process.env.LEDGER_UPSTREAM_ORIGIN=previous;}
});
test('private access forwards login page and cookie without exposing credentials',async()=>{
 const handle=createHandler({html:'local page',upstream:'https://backend.example',publicAccess:false,fetchImpl:async(url,options)=>{assert.equal(String(url),'https://backend.example/');assert.equal(options.headers.cookie,'fixture=session');return new Response('login page');}});
 const response=await handle(new Request('https://frontend.example/',{headers:{cookie:'fixture=session'}}));assert.equal(await response.text(),'login page');
});
test('signed workflow is not bundled; download proxies the configured backend',async()=>{
 const handle=createHandler({html:'page',upstream:'https://backend.example',fetchImpl:async(url)=>{assert.equal(String(url),'https://backend.example/download/shortcut');return new Response('workflow',{headers:{'Content-Disposition':'attachment; filename=fixture.shortcut'}});}});
 const r=await handle(new Request('https://frontend.example/download/shortcut'));assert.equal(await r.text(),'workflow');assert.match(r.headers.get('content-disposition'),/attachment/);
});
test('public source initialises a fresh empty book and retains import/calendar functions',()=>{
 const html=fs.readFileSync('data/ledger.html','utf8');assert.match(html,/rows:\[\]/);for(const id of ['id="import"','id="ledger"','calendarDayRows','id="restore"','id="export"'])assert.ok(html.includes(id),id);
});
