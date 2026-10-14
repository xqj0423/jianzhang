import fs from 'node:fs';
import {build} from 'esbuild';
const html=fs.readFileSync('../data/ledger.html','utf8');
fs.writeFileSync('src/ledger-html.ts','export const ledgerHtml = '+JSON.stringify(html)+';\n');
fs.cpSync('../public/assets','assets',{recursive:true});
await build({entryPoints:['src/server.ts'],outfile:'server.mjs',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external'});
