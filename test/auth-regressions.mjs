const check=(condition,message)=>{if(!condition)throw Error(message);};
function loginFixture(source,{authenticated=false,offline=false}={}){
 const html=source.match(/export const unlockHtml=\x60([\s\S]*?)\x60;/)?.[1];
 if(!html)throw Error('login HTML missing');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 const elements=new Map(),listeners={},calls=[],redirects=[],server={authenticated,offline},clock={now:1000};
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:id==='f2',focus(){},setAttribute(){}});return elements.get(id)};
 const document={visibilityState:'visible',getElementById:element,addEventListener:(type,fn)=>listeners[type]=fn};
 const request=async(url,options={})=>{calls.push({url,options});if(server.offline)throw Error('offline');const ok=url.startsWith('/api/account')?server.authenticated:true;return {ok,status:ok?200:401,json:async()=>ok?{isOwner:true}:{error:'请先登录'}}};
 const factory=new Function('document','window','fetch','location','Date','setInterval','setTimeout','clearTimeout','AbortController',script+
  '\nreturn {checkSession:typeof checkSession==="function"?checkSession:null,sendCode:typeof sendCode==="function"?sendCode:null,updateCooldown:typeof updateCooldown==="function"?updateCooldown:null};');
 const api=factory(document,{addEventListener:(type,fn)=>listeners[type]=fn},request,{replace:url=>redirects.push(url)},{now:()=>clock.now},()=>1,()=>1,()=>{},class{signal={};abort(){}});
 return {api,element,listeners,calls,redirects,server,clock};
}
export const authCases=[
 ['session cookie supports top-level navigation while preserving security attributes',async source=>{
  const declaration=source.match(/export async function sessionCookie\([^\n]+/)[0].replace('export ','').replace('req:Request','req').replace('uid:string','uid');
  const cookie=new Function('mac','cookieName','URL',declaration+';return sessionCookie;')(async()=> 'fixture-signature',()=> '__Host-jianzhang',class{constructor(url){this.protocol=url.startsWith('https:')?'https:':'http:'}});
  const value=await cookie({url:'https://fixture.example'},'owner');
  for(const part of ['SameSite=Lax','HttpOnly','Secure','Path=/','Max-Age=31536000'])check(value.includes(part),'missing cookie attribute '+part);
 }],
 ['existing signed session resumes without requesting an email',async source=>{
  const f=loginFixture(source,{authenticated:true});check(f.api.checkSession,'session resume check missing');await f.api.checkSession();
  check(f.redirects.includes('/'),'valid session did not open ledger');check(f.calls.every(c=>!c.options.method||c.options.method==='GET'),'resume attempted a write');
  check(f.calls.some(c=>c.url==='/api/account?resume=1'&&c.options.cache==='no-store'),'resume did not request fresh account status');
 }],
 ['returning to the tab rechecks an existing session',async source=>{
  const f=loginFixture(source);check(f.api.checkSession,'session resume check missing');await f.api.checkSession();check(!f.redirects.length,'anonymous user redirected');
  f.server.authenticated=true;check(typeof f.listeners.pageshow==='function','page restore listener missing');await f.listeners.pageshow();
  check(f.redirects.includes('/'),'page restore ignored valid session');
 }],
 ['offline session check keeps the email form usable',async source=>{
  const f=loginFixture(source,{offline:true});check(f.api.checkSession,'session resume check missing');await f.api.checkSession();
  check(!f.redirects.length,'offline check redirected');check(!f.element('b1').disabled,'offline check disabled login');
 }],
 ['resend waits for cooldown and clears a stale verification code',async source=>{
  const f=loginFixture(source);check(f.api.sendCode&&f.api.updateCooldown,'resend controls missing');await f.api.checkSession();f.element('email').value='fixture@example.com';
  await f.api.sendCode();check(f.element('resend').disabled,'resend ignores cooldown');check(!f.element('f2').hidden,'verification form missing');
  f.element('code').value='123456';f.clock.now+=61000;f.api.updateCooldown();check(!f.element('resend').disabled,'resend stays disabled after cooldown');
  await f.api.sendCode();check(f.calls.filter(c=>c.url==='/api/login-request').length===2,'resend did not send another request');check(f.element('code').value==='','stale code retained after resend');
 }]
];
export async function runAuthRegressions(source){
 const results=[];for(const [name,run] of authCases){try{await run(source);results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}return results;
}
