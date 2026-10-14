# 简账 多用户邮箱登录 改动清单

## 一、整个替换的文件（直接覆盖仓库里的同名文件）
- backend/src/book-access.ts
- backend/src/database.ts
- backend/src/api/state/route.ts
- backend/src/api/shortcut-config/route.ts

## 二、新增的文件
- backend/src/mailer.ts
- backend/src/api/login-request/route.ts
- backend/src/api/login-verify/route.ts

## 三、删除的文件
- backend/src/api/unlock/route.ts
- backend/test/auth.test.mjs（旧的密码登录测试，会失败；之后可另写新测试）

## 四、局部修改（查找 → 替换）

### backend/src/ledger-store.ts（两处）
1. 查找：
   export async function readLedger(){const snapshot=await readSnapshot(empty);
   替换为：
   export async function readLedger(uid:string){const snapshot=await readSnapshot(uid,empty);
2. 查找：
   export async function writeLedger(db:Ledger,revision:number){return writeSnapshot(normalizeLedgerCategories(db),revision);}
   替换为：
   export async function writeLedger(uid:string,db:Ledger,revision:number){return writeSnapshot(uid,normalizeLedgerCategories(db),revision);}

### backend/src/api/record/route.ts（三处）
1. 查找：
   if(!shortcutAccess(req))return json({saved:false,error:'快捷指令连接密钥无效'},401);try{
   替换为：
   const uid=shortcutAccess(req);if(!uid)return json({saved:false,error:'快捷指令连接密钥无效'},401);try{
2. 查找：readLedger()      替换为：readLedger(uid)
3. 查找：writeLedger(current.db,current.revision)   替换为：writeLedger(uid,current.db,current.revision)

### backend/src/server.ts（三处）
1. 查找：import * as unlock from './api/unlock/route';
   替换为：
   import * as loginRequest from './api/login-request/route';
   import * as loginVerify from './api/login-verify/route';
2. 查找：'/api/unlock':unlock,
   替换为：'/api/login-request':loginRequest,'/api/login-verify':loginVerify,
3. 查找：['BOOK_PASSWORD','BOOK_SESSION_KEY','SHORTCUT_WRITE_TOKEN']
   替换为：['BOOK_SESSION_KEY','RESEND_API_KEY','MAIL_FROM']
   并在这一行后面另起一行加上：
   if(process.env.BOOK_PUBLIC_ACCESS==='true')throw Error('多用户模式下必须关闭 BOOK_PUBLIC_ACCESS');

### lib/handler.mjs（两处）
1. 查找：['/api/unlock', ['POST']],
   替换为：
   ['/api/login-request', ['POST']],
   ['/api/login-verify', ['POST']],
2. 查找：'/api/unlock'（在 sameOriginRoutes 那一行）
   替换为：'/api/login-request', '/api/login-verify'

### vercel.json
找到处理 /api/unlock 的那一条，复制一份，路径分别改成 /api/login-request 和 /api/login-verify。

### test/handler.test.mjs
如果里面用到 /api/unlock，改成 /api/login-request 再跑 npm test。

## 五、环境变量
腾讯云后端：
- 新增 OWNER_EMAIL = 你自己的邮箱（登录后自动进入你现有的账本）
- 新增 RESEND_API_KEY、MAIL_FROM（例如：简账 <login@xqj0423.pw>）
- 保留 BOOK_SESSION_KEY（不要改）
- 保留 SHORTCUT_WRITE_TOKEN（你已安装的快捷指令继续可用；每个新用户用自己的令牌）
- 删除 BOOK_PASSWORD，删除或设为非 true 的 BOOK_PUBLIC_ACCESS
Vercel：
- 把 BOOK_PUBLIC_ACCESS 删除或改成 false

## 六、Resend 设置
1. 注册 resend.com，添加域名 xqj0423.pw。
2. 按提示在域名解析里添加它给的 SPF / DKIM 记录，等验证通过。
3. 创建 API Key，填入 RESEND_API_KEY。

## 七、上线前
1. 备份：先在网站里导出你现有账本。
2. 先在 Vercel 预览环境测试，再上生产。
3. 测试：用 OWNER_EMAIL 登录应看到旧账本；用另一个邮箱登录应是空账本；两边互不可见。
