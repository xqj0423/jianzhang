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
// A user id is derived from the email, so no user table is needed.
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
export async function sessionCookie(req:Request,uid:string){const expires=String(Date.now()+365*86400000),signature=await mac('session:'+uid+':'+expires);return `${cookieName(req)}=${uid}.${expires}.${signature}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export function clearCookie(req:Request){return `${cookieName(req)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${new URL(req.url).protocol==='https:'?'; Secure':''}`;}

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

export const unlockHtml=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>简账 · 登录</title><meta name="theme-color" content="#223d38"><style>*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f4f6f1;color:#223d38;font:16px/1.7 system-ui;min-height:100vh;display:grid;place-items:center;padding:24px}.box{width:100%;max-width:440px;background:white;border:1px solid #dce4dc;border-radius:20px;padding:32px}h1{font-size:27px;margin:15px 0}p{color:#738178;font-size:14px}input,button{width:100%;font:inherit;padding:13px;border-radius:9px;border:1px solid #cddbcf;margin:8px 0}button{background:#24705a;color:white;cursor:pointer}#msg{color:#a44d37}small{color:#738178}a{color:#24705a}</style></head><body><main class="box"><b>◒ 简账</b><h1>登录你的账本</h1><p>输入邮箱，我们会发送一个验证码。没有账号会自动创建，每个邮箱拥有自己独立的账本。</p><form id="f1"><label for="email">邮箱</label><input id="email" type="email" autocomplete="email" required maxlength="254" autofocus><button id="b1">发送验证码</button></form><form id="f2" hidden><label for="code">6 位验证码</label><input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button id="b2">登录</button><p><a href="#" id="back">换一个邮箱</a></p></form><p id="msg" role="status"></p><small>登录后这台设备将记住你一年。清理浏览数据、使用无痕浏览或更换设备后，需要重新登录。</small></main><script>var $=function(i){return document.getElementById(i)};var email='';function say(t){$('msg').textContent=t}async function post(u,b){var r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});var v=await r.json().catch(function(){return {}});if(!r.ok)throw Error(v.error||'操作失败，请重试');return v}$('f1').onsubmit=async function(e){e.preventDefault();var b=$('b1');b.disabled=true;say('');try{email=$('email').value.trim();await post('/api/login-request',{email:email});$('f1').hidden=true;$('f2').hidden=false;$('code').focus();say('验证码已发送到 '+email+'，10 分钟内有效。收不到请查看垃圾邮件箱。')}catch(x){say(x.message)}b.disabled=false};$('f2').onsubmit=async function(e){e.preventDefault();var b=$('b2');b.disabled=true;say('');try{await post('/api/login-verify',{email:email,code:$('code').value.trim()});location.replace('/')}catch(x){say(x.message);b.disabled=false}};$('back').onclick=function(e){e.preventDefault();$('f2').hidden=true;$('f1').hidden=false;say('')};</script></body></html>`;
