import {randomInt} from 'node:crypto';
import {getAccessDoc,setAccessDoc,incrementLimit} from '../../database';
import {json,sameOrigin} from '../../ledger-store';
import {normalizeEmail,emailKey,codeHash,rateKey} from '../../book-access';
import {sendLoginCode} from '../../mailer';
export const dynamic='force-dynamic';
export async function POST(req:Request){
if(!sameOrigin(req))return json({error:'请求来源无效'},403);
try{
const text=await req.text();if(text.length>1000)return json({error:'请求过大'},413);
const email=normalizeEmail(JSON.parse(text).email);if(!email)return json({error:'请输入有效的邮箱'},400);
const now=Date.now(),win=15*60000;
// Global flood guard (the backend sits behind Vercel, so the client IP is shared; real limits are per email).
const g=await incrementLimit('reqip:'+await rateKey(req),now,win);if(!g||g.attempts>300)return json({error:'请求过于频繁，请稍后再试'},429);
const ek=emailKey(email),old=await getAccessDoc('code:'+ek);
if(old&&old.sent>now-60000)return json({error:'发送过于频繁，请 1 分钟后再试'},429);
const lim=await incrementLimit('reqmail:'+ek,now,win);if(!lim||lim.attempts>5)return json({error:'该邮箱请求过于频繁，请 15 分钟后再试'},429);
const code=String(randomInt(0,1000000)).padStart(6,'0');
await setAccessDoc('code:'+ek,{hash:codeHash(email,code),expires:now+10*60000,attempts:0,sent:now});
await sendLoginCode(email,code);
return json({sent:true});
}catch{return json({error:'验证码发送失败，请稍后重试'},503);}
}
