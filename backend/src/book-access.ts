import {env} from './cloud-env';
const vars=()=>env as unknown as Record<string,string>;
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(v=>v.toString(16).padStart(2,'0')).join('');
export function constantEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
async function mac(s:string){const key=vars().BOOK_SESSION_KEY;if(!key)throw Error('Access is not configured');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(s)));}
function cookieName(req:Request){return new URL(req.url).protocol==='https:'?'__Host-jianzhang':'jianzhang-dev';}
export async function bookAccess(req:Request){
  if(vars().BOOK_PUBLIC_ACCESS==='true')return true;
  const name=cookieName(req),cookies=req.headers.get('cookie')||'';
  const value=cookies.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
  if(!value)return false;
  const parts=value.split('.');if(parts.length!==2||!/^\d+$/.test(parts[0]))return false;
  const expires=Number(parts[0]);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+366*86400000)return false;
  return constantEqual(parts[1],await mac('session:'+parts[0]));
}
export async function sessionCookie(req:Request){const expires=String(Date.now()+365*86400000),signature=await mac('session:'+expires);return `${cookieName(req)}=${expires}.${signature}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export function clearCookie(req:Request){return `${cookieName(req)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export function passwordCorrect(s:string){return !!vars().BOOK_PASSWORD&&constantEqual(s,vars().BOOK_PASSWORD);}
export function shortcutAccess(req:Request){const token=vars().SHORTCUT_WRITE_TOKEN;return !!token&&constantEqual(req.headers.get('authorization')||'','Bearer '+token);}
export function shortcutToken(){return vars().SHORTCUT_WRITE_TOKEN;}
export async function rateKey(req:Request){return mac('ip:'+(req.headers.get('x-jianzhang-client-ip')||'unknown'));}
export const unlockHtml=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>简账 · 打开私人账本</title><meta name="theme-color" content="#223d38"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f1;color:#223d38;font:16px/1.7 system-ui;min-height:100vh;display:grid;place-items:center;padding:24px}.box{width:100%;max-width:440px;background:white;border:1px solid #dce4dc;border-radius:20px;padding:32px}h1{font-size:27px;margin:15px 0}p{color:#738178;font-size:14px}input,button{width:100%;font:inherit;padding:13px;border-radius:9px;border:1px solid #cddbcf;margin:8px 0}button{background:#24705a;color:white;cursor:pointer}#msg{color:#a44d37}small{color:#738178}</style></head><body><main class="box"><b>◒ 简账</b><h1>打开你的私人账本</h1><p>无需注册，也无需登录 ChatGPT。首次输入账本密码，这台设备将记住访问权限一年。</p><form id="unlock"><label for="password">账本密码</label><input id="password" type="password" autocomplete="current-password" required maxlength="200" autofocus><button id="go">打开账本</button><p id="msg" role="status"></p></form><small>密码在交付的「简账访问密码.txt」中。清理浏览数据、使用无痕浏览或更换设备后，需要重新输入。</small></main><script>document.getElementById('unlock').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('go');b.disabled=true;document.getElementById('msg').textContent='';try{const r=await fetch('/api/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});const v=await r.json();if(!r.ok)throw Error(v.error||'无法打开账本');location.replace('/');}catch(e){document.getElementById('msg').textContent=e.message;b.disabled=false;}};</script></body></html>`;
