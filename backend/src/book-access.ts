import {createHmac} from 'node:crypto';
import {env} from './cloud-env';
const vars=()=>env as unknown as Record<string,string>;
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,'0')).join('');
export function constantEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
async function mac(s:string){const key=vars().BOOK_SESSION_KEY;if(!key)throw Error('Access is not configured');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(s)));}
// Same HMAC-SHA256 as mac(), but synchronous (used for ids, codes and shortcut tokens).
function macSync(s:string){const key=vars().BOOK_SESSION_KEY;if(!key)throw Error('Access is not configured');return createHmac('sha256',key).update(s).digest('hex');}
function cookieName(req:Request){return new URL(req.url).protocol==='https:'?'__Host-jianzhang':'jianzhang-dev';}

// ---- users -------------------------------------------------------------
// A user id is derived from the email; verified login metadata lives in the access collection.
// The OWNER_EMAIL account maps to the special id "owner" = the existing ledger document.
const UID=/^(owner|[a-f0-9]{24})$/;
export function normalizeEmail(s:unknown):string|null{if(typeof s!=='string')return null;const e=s.trim().toLowerCase();return e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null;}
export function emailKey(email:string){return macSync('email:'+email);}
export function codeHash(email:string,code:string){return macSync('code:'+email+':'+code);}
export function userIdFor(email:string){const o=(vars().OWNER_EMAIL||'').trim().toLowerCase();if(o&&email===o)return 'owner';return macSync('uid:'+email).slice(0,24);}

// ---- browser session: cookie = <uid>.<expires>.<signature> --------------
// Returns the user id, or null when not logged in.
export async function bookAccess(req:Request):Promise<string|null>{
const name=cookieName(req),cookies=req.headers.get('cookie')||'';
const value=cookies.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
if(!value)return null;
const parts=value.split('.');if(parts.length!==3||!UID.test(parts[0])||!/^\d+$/.test(parts[1]))return null;
const expires=Number(parts[1]);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+366*86400000)return null;
return constantEqual(parts[2],await mac('session:'+parts[0]+':'+parts[1]))?parts[0]:null;
}
export async function sessionCookie(req:Request,uid:string){const expires=String(Date.now()+365*86400000),signature=await mac('session:'+uid+':'+expires);return `${cookieName(req)}=${uid}.${expires}.${signature}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export function clearCookie(req:Request){return `${cookieName(req)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${new URL(req.url).protocol==='https:'?'; Secure':''}`;}

// ---- iPhone shortcut: one token per user ---------------------------------
export function shortcutToken(uid:string){return uid+'.'+macSync('shortcut:'+uid).slice(0,48);}
// Returns the user id, or null. The old global SHORTCUT_WRITE_TOKEN (if still set) keeps working for the owner.
export function shortcutAccess(req:Request):string|null{
const h=req.headers.get('authorization')||'';if(!h.startsWith('Bearer '))return null;
const t=h.slice(7),legacy=vars().SHORTCUT_WRITE_TOKEN;
if(legacy&&constantEqual(t,legacy))return 'owner';
const i=t.indexOf('.');if(i<0)return null;
const uid=t.slice(0,i);if(!UID.test(uid))return null;
return constantEqual(t,shortcutToken(uid))?uid:null;
}

export async function rateKey(req:Request){return mac('ip:'+(req.headers.get('x-jianzhang-client-ip')||'unknown'));}

export const unlockHtml=`<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>简账 · 登录</title><meta name="theme-color" content="#24705a">
<style>
:root{color-scheme:light dark;--bg:#f2f2f7;--card:#fff;--text:#1c1c1e;--secondary:#62626b;--line:#cdd7d1;--brand:#24705a;--error:#a13324}
@media(prefers-color-scheme:dark){:root{--bg:#1c1c1e;--card:#2c2c2e;--text:#fff;--secondary:#b0b0ba;--line:#5c635e;--error:#ff9c8e}}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px}.box{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px}h1{font-size:27px;line-height:1.3;margin:20px 0 12px}p{color:var(--secondary);font-size:14px}input,button{width:100%;font:inherit;padding:12px;border-radius:9px;border:1px solid var(--line);margin:8px 0;min-height:48px}input{background:var(--bg);color:var(--text)}button{background:var(--brand);color:white;cursor:pointer}button:disabled{opacity:.55;cursor:default}.secondary{background:transparent;color:var(--text)}#msg{color:var(--error);min-height:22px}small{color:var(--secondary);font-size:13px}input:focus-visible,button:focus-visible{outline:3px solid var(--brand);outline-offset:3px}#sessionStatus{min-height:22px}
</style></head><body><main class="box"><b>◒ 简账</b><h1>登录你的账本</h1><p>输入邮箱，我们会发送一个验证码。首次登录会自动创建独立账本。</p><p id="sessionStatus" role="status">正在检查这台设备的登录状态…</p>
<form id="f1"><label for="email">邮箱</label><input id="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required maxlength="254"><button id="b1">发送验证码</button></form>
<form id="f2" hidden><label for="code">6 位验证码</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button id="b2">登录</button><button type="button" class="secondary" id="resend" disabled>重新发送验证码</button><button type="button" class="secondary" id="back">换一个邮箱</button></form>
<p id="msg" role="status"></p><small>在自己的手机上登录后，会记住这台设备。清理网站数据、使用无痕浏览或更换设备后，需要重新验证。</small></main>
<script>
var $=function(id){return document.getElementById(id)};
var email='',resendAt=0,sending=false,checking=null;
function say(text){$('msg').textContent=text}
async function post(url,body){
 var control=new AbortController(),timer=setTimeout(function(){control.abort()},15000);
 try{
  var response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:control.signal});
  var value=await response.json().catch(function(){return {}});
  if(!response.ok){var error=Error(value.error||'操作失败，请重试');error.status=response.status;throw error}
  return value;
 }finally{clearTimeout(timer)}
}
function updateCooldown(){
 var remaining=Math.max(0,Math.ceil((resendAt-Date.now())/1000));
 $('resend').disabled=sending||remaining>0;
 $('resend').textContent=remaining?'重新发送（'+remaining+'秒）':'重新发送验证码';
 $('b1').disabled=sending||remaining>0;
}
async function sendCode(){
 if(sending||Date.now()<resendAt)return;
 sending=true;updateCooldown();say('');
 try{
  var target=$('f1').hidden?email:$('email').value.trim();
  await post('/api/login-request',{email:target});
  email=target;resendAt=Date.now()+60000;
  $('f1').hidden=true;$('f2').hidden=false;$('code').value='';$('code').focus();
  say('验证码已发送到 '+email+'，10 分钟内有效。收不到请查看垃圾邮件箱。');
 }catch(error){
  if(error.status===429)resendAt=Date.now()+60000;
  say(error.name==='AbortError'?'连接超时，请稍后重试':error.message);
 }finally{sending=false;updateCooldown()}
}
function checkSession(){
 if(document.visibilityState==='hidden')return Promise.resolve();
 if(checking)return checking;
 checking=(async function(){
  var control=new AbortController(),timer=setTimeout(function(){control.abort()},10000);
  try{
   var response=await fetch('/api/account?resume=1',{method:'GET',credentials:'same-origin',cache:'no-store',signal:control.signal});
   if(response.ok)location.replace('/');
  }catch(error){/* A network failure is not a logout; leave email login available. */}
  finally{clearTimeout(timer);$('sessionStatus').textContent='';checking=null}
 })();
 return checking;
}
$('f1').onsubmit=function(event){event.preventDefault();return sendCode()};
$('resend').onclick=sendCode;
$('f2').onsubmit=async function(event){
 event.preventDefault();if($('b2').disabled)return;$('b2').disabled=true;say('');
 try{await post('/api/login-verify',{email:email,code:$('code').value.trim()});location.replace('/')}
 catch(error){say(error.name==='AbortError'?'连接超时，请重试':error.message);$('b2').disabled=false}
};
$('back').onclick=function(){$('f2').hidden=true;$('f1').hidden=false;$('code').value='';resendAt=0;updateCooldown();say('');$('email').focus()};
setInterval(updateCooldown,1000);
window.addEventListener('pageshow',checkSession);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')checkSession()});
checkSession();
</script></body></html>`;
