import fs from 'node:fs';
import path from 'node:path';
import {createHandler} from '../lib/handler.mjs';
const handler = createHandler({
  html:fs.readFileSync(path.join(process.cwd(),'data/ledger.html'),'utf8'),
  upstream:process.env.LEDGER_UPSTREAM_ORIGIN
});
export default { fetch:handler };
