import http from 'node:http';
import fs from 'node:fs';
import * as root from './route';
import * as state from './api/state/route';
import * as record from './api/record/route';
import * as loginRequest from './api/login-request/route';
import * as loginVerify from './api/login-verify/route';
import {normalizeEmail} from './book-access';
import * as lock from './api/lock/route';
import * as config from './api/shortcut-config/route';
import * as help from './shortcut-help/route';
import * as recognize from './api/recognize/route';
import * as capture from './api/capture/route';
const routes:Record<string,any>={'/':root,'/api/state':state,'/api/record':record,'/api/login-request':loginRequest,'/api/login-verify':loginVerify,'/api/lock':lock,'/api/shortcut-config':config,'/shortcut-help':help};
routes['/api/recognize']=recognize;
routes['/api/capture']=capture;
if(!['BOOK_SESSION_KEY','RESEND_API_KEY','MAIL_FROM'].every(k=>process.env[k]))throw Error('请配置账本访问环境变量');
if(process.env.BOOK_PUBLIC_ACCESS==='true')throw Error('多用户模式下必须关闭 BOOK_PUBLIC_ACCESS');
if(!normalizeEmail(process.env.OWNER_EMAIL))throw Error('请配置有效的 OWNER_EMAIL，以保留原账本入口');
const origin=process.env.PUBLIC_ORIGIN;
if(origin&&(new URL(origin).origin!==origin||!origin.startsWith('https://')))throw Error('PUBLIC_ORIGIN 必须是无末尾斜杠的 HTTPS 网站地址');
http.createServer(async(req,res)=>{
 try{
  const chunks:Buffer[]=[];let n=0;
  for await(const chunk of req){n+=chunk.length;if(n>8500000){res.writeHead(413);res.end('请求过大');return;}chunks.push(chunk);}
  const base=origin||'http://127.0.0.1:'+ (process.env.PORT||9000);
  const url=new URL(req.url||'/',base);url.protocol=new URL(base).protocol;url.host=new URL(base).host;
  const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  // Only trust the gateway client IP header in the cloud; ignore spoofable Cloudflare headers.
  headers.set('x-jianzhang-client-ip',origin?(req.headers['x-cloudbase-real-ip']?.toString()||'shared-gateway'):(req.socket.remoteAddress||'local'));
  const request=new Request(url,{method:req.method,headers,...(n?{body:Buffer.concat(chunks)}:{})});
  if(url.pathname==='/download/shortcut'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store','Content-Disposition':"attachment; filename=Jianzhang-v7.shortcut; filename*=UTF-8''"+encodeURIComponent('简账截图自动记账4.shortcut'),'X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(process.env.SHORTCUT_FILE_PATH || (()=>{throw Error('请配置 SHORTCUT_FILE_PATH');})()));return;}
  const browserAssets:Record<string,string>={
    '/assets/gsap-3.15.0/gsap.min.js':'gsap-3.15.0/gsap.min.js',
    '/assets/gsap-3.15.0/ScrollTrigger.min.js':'gsap-3.15.0/ScrollTrigger.min.js',
    '/assets/ledger-motion-v1.js':'ledger-motion-v1.js',
    '/assets/ledger-motion-v2.js':'ledger-motion-v2.js',
    '/assets/ledger-motion-v3.js':'ledger-motion-v3.js',
    '/assets/ledger-motion-v4.js':'ledger-motion-v4.js'
  };
  if(req.method==='GET'&&Object.hasOwn(browserAssets,url.pathname)){
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
    res.end(fs.readFileSync(new URL('./assets/'+browserAssets[url.pathname],import.meta.url)));return;
  }
  const handler=routes[url.pathname]?.[req.method||'GET'];
  const response=handler?await handler(request):new Response('未找到页面',{status:404});
  res.statusCode=response.status;for(const [k,v]of response.headers)res.setHeader(k,v);
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({saved:false,error:'服务暂不可用，请保留截图并重试'}));}
}).listen(Number(process.env.PORT||9000),'0.0.0.0',()=>console.log('简账 HTTP 服务已启动'));
