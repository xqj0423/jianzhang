import fs from 'node:fs';
import path from 'node:path';
const excluded=new Set(['.git','node_modules','.vercel','generated','private','backups','assets-cache']);
const problems=[];let files=0;
const forbidden=[
  /Bearer\s+[A-Za-z0-9_-]{40,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp_|github_pat_|sk_live_)[A-Za-z0-9_]{20,}/,
  /["'](?:password|secretKey|secretId|SHORTCUT_WRITE_TOKEN|BOOK_SESSION_KEY)["']\s*:\s*["'][A-Za-z0-9_\-]{20,}["']/
];
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name),rel=path.relative('.',file).replaceAll('\\','/');
  if(entry.isDirectory()){if(!excluded.has(entry.name))walk(file);continue;}
  if(!entry.isFile())continue;
  files++;
  if(entry.name.startsWith('.env')){
    if(entry.name!=='.env.example'){problems.push(rel+': real environment file');continue;}
    const lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/);
    if(lines.some(l=>!/^\w+=$/.test(l)))problems.push(rel+': env example contains a value');
  }
  if(/\.(shortcut|plist|db|sqlite3?|csv|xlsx?|zip|tar\.gz|pem|key|p12|pfx)$/i.test(file))problems.push(rel+': private/binary/export artifact');
  const text=fs.readFileSync(file,'utf8');
  if(forbidden.some(re=>re.test(text)))problems.push(rel+': potential credential');
  if(file.endsWith('.json'))try{
    const v=JSON.parse(text),db=v?.db??v;
    if(Array.isArray(db?.rows)&&db.rows.length)problems.push(rel+': nonempty ledger snapshot');
  }catch{}
 }
}
walk('.');
if(fs.existsSync('.git'))problems.push('Git history exists: audit its tracked files and all commits separately');
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(JSON.stringify({sourceFilesChecked:files,credentialPatternsFound:0,nonemptyLedgerFiles:0,envExamplesBlank:true,gitHistoryIncluded:false}));
