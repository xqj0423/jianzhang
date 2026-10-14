import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {build} from 'esbuild';

process.env.CLOUDBASE_ENV_ID='fixture-env';
process.env.BOOK_SESSION_KEY=randomBytes(32).toString('hex');
process.env.OWNER_EMAIL='owner@example.com';
process.env.SHORTCUT_WRITE_TOKEN=randomBytes(32).toString('hex');
process.env.RESEND_API_KEY='fixture-mail-key';
process.env.MAIL_FROM='Ledger <login@example.com>';
delete process.env.BOOK_PUBLIC_ACCESS;
globalThis.__fixtureDocuments=new Map();
const documents=globalThis.__fixtureDocuments;
fs.mkdirSync('generated',{recursive:true});
await build({
 stdin:{contents:`export * as auth from './src/book-access';
 export * as database from './src/database';
 export * as store from './src/ledger-store';
 export * as state from './src/api/state/route';
 export * as record from './src/api/record/route';
 export * as capture from './src/api/capture/route';
 export * as config from './src/api/shortcut-config/route';
 export * as requestCode from './src/api/login-request/route';
 export * as verifyCode from './src/api/login-verify/route';`,resolveDir:process.cwd(),loader:'ts'},
 outfile:'generated/multiuser.mjs',bundle:true,platform:'node',format:'esm',
 plugins:[{name:'memory-cloudbase',setup(b){
  b.onResolve({filter:/^@cloudbase\/node-sdk$/},()=>({path:'mock-sdk',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`
   const docs=globalThis.__fixtureDocuments;let tail=Promise.resolve();
   const collection=name=>({doc(id){const key=name+'/'+id;return {
    async get(){return {data:docs.has(key)?[structuredClone(docs.get(key))]:[]}},
    async set(value){docs.set(key,structuredClone(value))},
    async remove(){docs.delete(key)}
   }}});
   const database={collection,runTransaction(fn){const next=tail.then(()=>fn({collection}));tail=next.catch(()=>{});return next}};
   export default {init:()=>({database:()=>database})};`,loader:'js'}));
 }}]
});
const {auth,database,store,state,record,capture,config,requestCode,verifyCode}=await import('../generated/multiuser.mjs');
const origin='https://fixture.example';
const owner='owner',alice=auth.userIdFor('alice@example.com'),bob=auth.userIdFor('bob@example.com');
const empty=()=>({version:1,initial:0,rows:[]});
const row={id:'fixture-existing',date:'2026-10-14 12:00:00',type:'支出',cents:1234,party:'美团',note:'午餐',category:'餐饮',source:'支付宝',tx:''};
const cookie=async uid=>(await auth.sessionCookie(new Request(origin),uid)).split(';')[0];
const browserRequest=async(path,uid,method='GET',body)=>new Request(origin+path,{method,headers:{cookie:await cookie(uid),origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const login=(email,code)=>new Request(origin+'/api/login-verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,code})});
const seedCode=async(email,code='123456',expires=Date.now()+600000)=>database.setAccessDoc('code:'+auth.emailKey(email),{hash:auth.codeHash(email,code),expires,attempts:0,sent:Date.now()});

test('email identities, signed cookies and tokens cannot impersonate another user',async()=>{
 assert.equal(auth.normalizeEmail(' Owner@Example.com '),'owner@example.com');
 assert.equal(auth.userIdFor('owner@example.com'),owner);
 assert.notEqual(alice,bob);
 assert.equal(await auth.bookAccess(new Request(origin)),null);
 const c=await cookie(alice);
 assert.equal(await auth.bookAccess(new Request(origin,{headers:{cookie:c}})),alice);
 assert.equal(await auth.bookAccess(new Request(origin,{headers:{cookie:c.replace(alice,bob)}})),null);
 const header={authorization:'Bearer '+auth.shortcutToken(alice)};
 assert.equal(auth.shortcutAccess(new Request(origin,{headers:header})),alice);
 assert.equal(auth.shortcutAccess(new Request(origin,{headers:{authorization:header.authorization.replace(alice,bob)}})),null);
 assert.equal(auth.shortcutAccess(new Request(origin,{headers:{authorization:'Bearer '+process.env.SHORTCUT_WRITE_TOKEN}})),owner);
 process.env.BOOK_PUBLIC_ACCESS='true';
 assert.equal(await auth.bookAccess(new Request(origin)),null);
 delete process.env.BOOK_PUBLIC_ACCESS;
});

test('owner retains the existing document; other users start empty and writes stay isolated',async()=>{
 assert.equal(await store.writeLedger(owner,{version:1,initial:500,rows:[row]},0),true);
 assert.ok(documents.has('jianzhang_ledger/main'));
 const original=structuredClone(documents.get('jianzhang_ledger/main'));
 assert.deepEqual((await store.readLedger(alice)).db,empty());
 assert.deepEqual((await store.readLedger(bob)).db,empty());
 const body={db:{version:1,initial:0,rows:[{...row,id:'alice-only'}]},revision:0};
 assert.equal((await state.PUT(await browserRequest('/api/state',alice,'PUT',body))).status,200);
 assert.equal((await state.PUT(await browserRequest('/api/state',alice,'PUT',body))).status,409);
 assert.deepEqual(documents.get('jianzhang_ledger/main'),original);
 assert.deepEqual((await (await state.GET(await browserRequest('/api/state',bob))).json()).db,empty());
 assert.equal((await state.GET(new Request(origin+'/api/state'))).status,401);
 assert.equal((await state.PUT(new Request(origin+'/api/state',{method:'PUT',headers:{cookie:await cookie(alice),origin:'https://wrong.example'},body:'{}'}))).status,403);
 await assert.rejects(()=>store.readLedger('invalid-user'));
});

test('legacy and per-user shortcuts append to the correct ledger and deduplicate per user',async()=>{
 const payload={request_id:'fixture-shortcut-0001',amount:'12.34',type:'支出',source:'支付宝',party:'美团',note:'午餐'};
 const submit=token=>record.POST(new Request(origin+'/api/record',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload)}));
 assert.equal((await submit(auth.shortcutToken(bob))).status,201);
 assert.equal((await (await submit(auth.shortcutToken(bob))).json()).duplicate,true);
 assert.equal((await submit(process.env.SHORTCUT_WRITE_TOKEN)).status,201);
 assert.equal((await store.readLedger(bob)).db.rows.length,1);
 assert.equal((await store.readLedger(owner)).db.rows.length,2);
 assert.equal((await store.readLedger(alice)).db.rows.length,1);
 const cfg=await (await config.POST(await browserRequest('/api/shortcut-config',bob,'POST',{}))).json();
 assert.equal(cfg.headers.Authorization,'Bearer '+auth.shortcutToken(bob));
 assert.equal((await submit('invalid')).status,401);
 const response=await capture.POST(new Request(origin+'/api/capture',{method:'POST',headers:{authorization:'Bearer '+auth.shortcutToken(alice),'content-type':'application/json'},body:JSON.stringify({request_id:'fixture-capture-0002',text:'账单详情\n美团\n-12.34\n交易成功\n支付时间\n2026-10-14 12:00:00\n付款方式\n余额宝'})}));
 assert.equal((await response.json()).saved,true);
 assert.equal((await store.readLedger(alice)).db.rows.length,2);
 assert.equal((await store.readLedger(bob)).db.rows.length,1);
});

test('email sending, cooldown and login work with mocked mail; no actual email is sent',async()=>{
 const previous=globalThis.fetch;let sent;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent=JSON.parse(options.body);return Response.json({id:'fixture-mail'});};
 try{
  const request=()=>new Request(origin+'/api/login-request',{method:'POST',headers:{origin},body:JSON.stringify({email:' Owner@Example.com '})});
  assert.equal((await requestCode.POST(request())).status,200);
  assert.deepEqual(sent.to,['owner@example.com']);
  const code=sent.text.match(/验证码是 (\d{6})/)[1];
  assert.equal((await requestCode.POST(request())).status,429);
  const response=await verifyCode.POST(login('owner@example.com',code));
  assert.equal(response.status,200);
  assert.equal(await auth.bookAccess(new Request(origin,{headers:{cookie:response.headers.get('set-cookie').split(';')[0]}})),owner);
  assert.equal((await verifyCode.POST(login('owner@example.com',code))).status,400);
 }finally{globalThis.fetch=previous;}
});

test('concurrent code use succeeds once and concurrent wrong guesses cannot bypass limits',async()=>{
 await seedCode('alice@example.com');
 const responses=await Promise.all(Array.from({length:6},()=>verifyCode.POST(login('alice@example.com','123456'))));
 assert.equal(responses.filter(r=>r.status===200).length,1);
 await seedCode('alice@example.com');
 await Promise.all(Array.from({length:8},()=>verifyCode.POST(login('alice@example.com','000000'))));
 assert.equal((await verifyCode.POST(login('alice@example.com','123456'))).status,400);
 await seedCode('alice@example.com','123456',Date.now()-1);
 assert.equal((await verifyCode.POST(login('alice@example.com','123456'))).status,400);
 assert.equal((await verifyCode.POST(new Request(origin+'/api/login-verify',{method:'POST',headers:{origin:'https://wrong.example'},body:'{}'}))).status,403);
});
