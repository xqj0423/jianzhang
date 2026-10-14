import {consumeLoginCode,incrementLimit,recordUserLogin} from '../../database';
import {json,sameOrigin} from '../../ledger-store';
import {normalizeEmail,emailKey,codeHash,rateKey,userIdFor,sessionCookie} from '../../book-access';
export const dynamic='force-dynamic';
export async function POST(req:Request){
if(!sameOrigin(req))return json({error:'请求来源无效'},403);
try{
const text=await req.text();if(text.length>1000)return json({error:'请求过大'},413);
const v=JSON.parse(text),email=normalizeEmail(v.email),code=typeof v.code==='string'?v.code.trim():'';
if(!email||!/^[0-9]{6}$/.test(code))return json({error:'请输入邮箱和 6 位验证码'},400);
const now=Date.now();
const g=await incrementLimit('verifyip:'+await rateKey(req),now,15*60000);if(!g||g.attempts>300)return json({error:'请求过于频繁，请稍后再试'},429);
const result=await consumeLoginCode('code:'+emailKey(email),codeHash(email,code),now);
if(result==='invalid')return json({error:'验证码无效或已过期，请重新获取'},400);
if(result==='incorrect')return json({error:'验证码不正确'},401);
const uid=userIdFor(email);await recordUserLogin(uid,email,now);
return Response.json({ok:true},{headers:{'Set-Cookie':await sessionCookie(req,uid),'Cache-Control':'no-store'}});
}catch{return json({error:'暂时无法登录，请稍后重试'},503);}
}
