import cloudbase from '@cloudbase/node-sdk';
import {gzipSync,gunzipSync} from 'node:zlib';
import {timingSafeEqual} from 'node:crypto';
if(!process.env.CLOUDBASE_ENV_ID)throw Error('请配置 CLOUDBASE_ENV_ID');
const app=cloudbase.init({env:process.env.CLOUDBASE_ENV_ID,
...(process.env.CLOUDBASE_APIKEY?{accessKey:process.env.CLOUDBASE_APIKEY}:{}),
...(process.env.TENCENTCLOUD_SECRETID?{secretId:process.env.TENCENTCLOUD_SECRETID}:{}),
...(process.env.TENCENTCLOUD_SECRETKEY?{secretKey:process.env.TENCENTCLOUD_SECRETKEY}:{}),
...(process.env.TENCENTCLOUD_SESSIONTOKEN?{sessionToken:process.env.TENCENTCLOUD_SESSIONTOKEN}:{})
});
const ledgerCollection=process.env.LEDGER_COLLECTION||'jianzhang_ledger';
const ledgerDocument=process.env.LEDGER_DOCUMENT_ID||'main';
const accessCollection=process.env.ACCESS_LIMITS_COLLECTION||'jianzhang_access';
const db=app.database();
function value(r:any){return Array.isArray(r.data)?r.data[0]:r.data;}
// "owner" keeps the existing ledger document; everyone else gets their own document.
const ledgerDocFor=(uid:string)=>{
if(!/^(owner|[a-f0-9]{24})$/.test(uid))throw Error('Invalid user id');
return uid==='owner'?ledgerDocument:'u_'+uid;
};

export async function readSnapshot(uid:string,empty:any){
const doc=value(await db.collection(ledgerCollection).doc(ledgerDocFor(uid)).get());
return doc?{db:JSON.parse(gunzipSync(Buffer.from(doc.payload,'base64'),{maxOutputLength:16000000}).toString()),revision:doc.revision}:{db:structuredClone(empty),revision:0};
}
export async function writeSnapshot(uid:string,ledger:any,revision:number){
const payload=gzipSync(Buffer.from(JSON.stringify(ledger))).toString('base64');
if(Buffer.byteLength(payload)>500000)throw Error('账本过大，请先导出归档');
return db.runTransaction(async(t:any)=>{
const ref=t.collection(ledgerCollection).doc(ledgerDocFor(uid)),current=value(await ref.get());
if((current?.revision||0)!==revision)return false;
await ref.set({payload,revision:revision+1});return true;
});
}

export async function getLimit(id:string){return value(await db.collection(accessCollection).doc(id).get());}
export async function incrementLimit(id:string,now:number,window:number){
return db.runTransaction(async(t:any)=>{
const ref=t.collection(accessCollection).doc(id),old=value(await ref.get());
const next=old&&old.since>=now-window?{attempts:old.attempts+1,since:old.since}:{attempts:1,since:now};
await ref.set(next);return next;
});
}
export async function clearLimit(id:string){await db.collection(accessCollection).doc(id).remove();}

// Login codes are stored in the same "access" collection under ids like "code:<emailKey>".
export async function getAccessDoc(id:string){return value(await db.collection(accessCollection).doc(id).get());}
export async function setAccessDoc(id:string,data:any){await db.collection(accessCollection).doc(id).set(data);}
export async function removeAccessDoc(id:string){await db.collection(accessCollection).doc(id).remove();}

// Keep verified account metadata separate from ledger payloads and login-code documents.
export async function recordUserLogin(uid:string,email:string,now:number){
if(!/^(owner|[a-f0-9]{24})$/.test(uid))throw Error('Invalid user id');
return db.runTransaction(async(t:any)=>{
const ref=t.collection(accessCollection).doc('user:'+uid),old=value(await ref.get());
await ref.set({kind:'user-profile',uid,email,firstRecordedAt:old?.firstRecordedAt||now,lastLoginAt:Math.max(old?.lastLoginAt||0,now)});
});
}
export async function listUserProfiles(after:string,limit:number){
const range=(start:string)=>({_id:db.command.gt(start).and(db.command.lt('user;'))});
const [result,count]=await Promise.all([
db.collection(accessCollection).where(range(after?'user:'+after:'user:')).orderBy('_id','asc').limit(limit+1).get(),
db.collection(accessCollection).where(range('user:')).count()
]);
const docs=Array.isArray(result.data)?result.data:[];
return {users:docs.slice(0,limit).map((v:any)=>({email:v.email,firstRecordedAt:v.firstRecordedAt,lastLoginAt:v.lastLoginAt,isOwner:v.uid==='owner'})),total:count.total,nextCursor:docs.length>limit?docs[limit-1].uid:null};
}

// Consume and count guesses in one transaction: concurrent requests cannot reuse a code.
export async function consumeLoginCode(id:string,expectedHash:string,now:number){
return db.runTransaction(async(t:any)=>{
const ref=t.collection(accessCollection).doc(id),doc=value(await ref.get());
if(!doc||doc.expires<=now||doc.attempts>=5)return 'invalid';
const actual=Buffer.from(typeof doc.hash==='string'?doc.hash:''),expected=Buffer.from(expectedHash);
if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){
await ref.set({...doc,attempts:doc.attempts+1});return 'incorrect';
}
await ref.remove();return 'ok';
});
}
