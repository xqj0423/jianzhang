import {test} from 'node:test';
import fs from 'node:fs';
import {uiCases} from './ui-regressions.mjs';
import {authCases} from './auth-regressions.mjs';
const html=fs.readFileSync(new URL('../data/ledger.html',import.meta.url),'utf8');
const auth=fs.readFileSync(new URL('../backend/src/book-access.ts',import.meta.url),'utf8');
for(const [name,run] of uiCases)test(name,()=>run(html));
for(const [name,run] of authCases)test(name,()=>run(auth));
