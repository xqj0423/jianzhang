import {getLimit,incrementLimit,clearLimit} from '../../database';
import {json,sameOrigin} from '../../ledger-store';
import {passwordCorrect,sessionCookie,rateKey} from '../../book-access';
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'请求来源无效'},403);try{

  const text=await req.text();if(text.length>1000)return json({error:'请求过大'},413);const v=JSON.parse(text);if(typeof v.password!=='string'||v.password.length>200)return json({error:'请输入账本密码'},400);
  const key=await rateKey(req),now=Date.now(),window=15*60000;
  const old=await getLimit(key);
  if(old&&old.since>now-window&&old.attempts>=5)return json({error:'尝试次数过多，请 15 分钟后再试'},429);
  const counter=await incrementLimit(key,now,window);
  if(!counter||counter.attempts>5)return json({error:'尝试次数过多，请稍后再试'},429);
  if(!passwordCorrect(v.password))return json({error:'账本密码不正确'},401);
  await clearLimit(key);
  return Response.json({unlocked:true},{headers:{'Set-Cookie':await sessionCookie(req),'Cache-Control':'no-store'}});
}catch{return json({error:'暂时无法打开账本，请稍后重试'},503);}}
