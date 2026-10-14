import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHandler} from '../lib/handler.mjs';
const handle=createHandler({html:fs.readFileSync('data/ledger.html','utf8')});
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost:3000');
    if(req.method==='GET'&&url.pathname.startsWith('/assets/')){
      const file=path.resolve('public', '.'+decodeURIComponent(url.pathname));
      const assets=path.resolve('public/assets')+path.sep;
      if(!file.startsWith(assets)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/plain; charset=utf-8'});res.end(fs.readFileSync(file));return;
    }
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>4000000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request(url,{method:req.method,headers:req.headers,...(size?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end('Development server error');}
}).listen(3000,'127.0.0.1',()=>console.log('Local preview: http://localhost:3000'));
