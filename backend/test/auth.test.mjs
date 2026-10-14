import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import {build} from 'esbuild';
fs.mkdirSync('generated',{recursive:true});
await build({entryPoints:['src/book-access.ts'],outfile:'generated/auth.mjs',bundle:true,platform:'node',format:'esm'});
const auth=await import('../generated/auth.mjs');
test('environment-controlled public mode and signed private sessions',async()=>{
 const previous={BOOK_PUBLIC_ACCESS:process.env.BOOK_PUBLIC_ACCESS,BOOK_SESSION_KEY:process.env.BOOK_SESSION_KEY};
 try{
  process.env.BOOK_SESSION_KEY=randomBytes(32).toString('hex');
  process.env.BOOK_PUBLIC_ACCESS='true';assert.equal(await auth.bookAccess(new Request('https://fixture.example/')),true);
  process.env.BOOK_PUBLIC_ACCESS='false';assert.equal(await auth.bookAccess(new Request('https://fixture.example/')),false);
  const cookie=(await auth.sessionCookie(new Request('https://fixture.example/'))).split(';')[0];
  assert.equal(await auth.bookAccess(new Request('https://fixture.example/',{headers:{cookie}})),true);
  assert.equal(await auth.bookAccess(new Request('https://fixture.example/',{headers:{cookie:cookie+'tampered'}})),false);
 }finally{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
