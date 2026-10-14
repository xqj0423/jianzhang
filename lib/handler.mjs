const methods = new Map([
  ['/api/state', ['GET', 'PUT']],
  ['/api/record', ['POST']],
  ['/api/capture', ['POST']],
  ['/api/recognize', ['POST']],
  ['/api/shortcut-config', ['POST']],
  ['/api/login-request', ['POST']],
  ['/api/login-verify', ['POST']],
  ['/api/lock', ['POST']],
  ['/shortcut-help', ['GET']],
  ['/download/shortcut', ['GET']]
]);
const sameOriginRoutes = new Set(['/api/state', '/api/shortcut-config', '/api/login-request', '/api/login-verify', '/api/lock']);
const json = (body, status=200) => Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createHandler({html, shortcut, fetchImpl=fetch, upstream=process.env.LEDGER_UPSTREAM_ORIGIN, publicAccess=process.env.BOOK_PUBLIC_ACCESS==='true'}={}) {
  if (!upstream) throw Error('请设置 LEDGER_UPSTREAM_ORIGIN');
  const target = new URL(upstream);
  if (target.protocol !== 'https:' || target.origin !== upstream || target.username || target.password) throw Error('Invalid ledger upstream origin');
  return async function handle(request) {
    const incoming = new URL(request.url);
    const path = incoming.searchParams.get('__route') || incoming.pathname;
    const method = request.method;
    if (path === '/') {
      if (method !== 'GET' && method !== 'HEAD') return json({error:'请求方法无效'},405);
      if (!publicAccess) {
        try {
          const response = await fetchImpl(new URL('/',upstream),{method:'GET',headers:{cookie:request.headers.get('cookie')||''},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
          const headers = new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          for (const name of ['content-type','content-security-policy','referrer-policy']) if(response.headers.has(name)) headers.set(name,response.headers.get(name));
          return new Response(method==='HEAD'?null:response.body,{status:response.status,headers});
        } catch (_) { return json({error:'账本服务暂时不可用'},503); }
      }
      return new Response(method==='HEAD'?null:html,{headers:{
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'",
        'X-Jianzhang-Hosting':'vercel'
      }});
    }
    if (path === '/download/shortcut' && method === 'GET' && shortcut) return new Response(shortcut,{headers:{
      'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Disposition':"attachment; filename=Jianzhang-v7.shortcut; filename*=UTF-8''"+encodeURIComponent('简账截图自动记账4.shortcut')
    }});
    if (!methods.has(path)) return json({error:'未找到页面'},404);
    if (!methods.get(path).includes(method)) return json({error:'请求方法无效'},405);
    if (method !== 'GET' && sameOriginRoutes.has(path) && request.headers.get('origin') !== incoming.origin) return json({error:'请求来源无效'},403);
    try {
      // Forward only selected headers; never relay an arbitrary URL or host supplied by a caller.
      const headers = new Headers();
      for (const name of ['authorization','cookie','content-type']) if (request.headers.has(name)) headers.set(name,request.headers.get(name));
      headers.set('origin', upstream);
      let body;
      if (method !== 'GET') {
        body = new Uint8Array(await request.arrayBuffer());
        if (body.byteLength > 4000000) return json({saved:false,error:'请求过大，请先导出归档'},413);
      }
      const response = await fetchImpl(new URL(path,upstream),{
        method,headers,body,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)
      });
      const resultHeaders = new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      for (const name of ['content-type','referrer-policy','content-disposition']) if (response.headers.has(name)) resultHeaders.set(name,response.headers.get(name));
      const cookies = response.headers.getSetCookie?.() || [];
      for (const cookie of cookies) resultHeaders.append('set-cookie',cookie);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const next = new URL(location,upstream);
          if (next.origin !== upstream) return json({error:'服务响应无效'},502);
          resultHeaders.set('location',next.pathname+next.search);
        }
      }
      if (path === '/api/shortcut-config' && response.ok) {
        const config = await response.json();
        config.url = new URL('/api/record',incoming.origin).href;
        return json(config,response.status);
      }
      return new Response(response.body,{status:response.status,headers:resultHeaders});
    } catch (_) {
      // An uncertain write must not be retried with a new id or reported as successful.
      return json({saved:false,error:'账目服务暂时不可用，请保留截图或输入内容后重试'},503);
    }
  };
}
