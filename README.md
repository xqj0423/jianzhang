# 简账

日常收支记账网站，支持手动记账、账单导入、分类统计、日历与当天明细、编辑删除、备份恢复，以及 iPhone 截图文字识别记账。

## 技术栈与现有架构

| 层 | 技术 |
|---|---|
| 页面 | HTML、CSS、原生 JavaScript；系统字体，GSAP 3.15.0 / ScrollTrigger |
| Vercel 入口 | Node.js 22、ES Modules、Web Request/Response；单个 Node Function，无 React/Next.js 运行依赖 |
| 账目后端 | TypeScript、Node HTTP、esbuild，腾讯云 CloudBase SDK 3.18.3 |
| 数据库 | 腾讯云 CloudBase 文档数据库；gzip/base64 快照、revision 事务检查 |
| 快捷指令工具 | Python 3 标准库生成未签名 Apple plist 工作流；个人配置只在安装后粘贴 |

浏览器 → Vercel 同源 API → 已有腾讯云后端 → 已有 CloudBase 数据库。Vercel 不新建第二本账，也不把账目存入函数临时磁盘。账单文件由浏览器解析，账目通过 API 保存；截图 OCR 由 iPhone 完成，后端解析 OCR 文本。

以前的 Next.js/Cloudflare 试验模板不是当前线上运行栈，未纳入本公开源码包。当前版本尚无 GitHub 自动部署记录；连接 GitHub 应当在环境配置完成之后进行。

## 文件结构

完整、逐文件清单见 [docs/文件结构.md](docs/文件结构.md)。

- `api/index.mjs`：Vercel 函数入口。
- `lib/handler.mjs`：同源校验、接口代理、失败反馈和下载转发。
- `data/ledger.html`：页面代码模板，初始账目为空；它不是数据库或账目备份。
- `public/assets/`：固定版本动画资源及许可证声明。
- `backend/src/`：当前腾讯云后端的运行源码，包括记账、防重复、识别、访问控制及数据库操作。
- `shortcut/build.py`：不含个人令牌的快捷指令生成器。
- `test/`、`backend/test/`：完全合成的数据和会话测试，不访问线上账本。
- `scripts/`：本地预览、公开上传扫描。

## 安装与本地运行

需要 Node.js 22 和 Python 3。复制 `.env.example` 为 `.env.local`，自行填写值：

```bash
npm install
npm test
npm run audit:public
npm run dev
```

开发预览在 `http://localhost:3000`。根目录环境变量：

| 变量 | 用途 |
|---|---|
| `LEDGER_UPSTREAM_ORIGIN` | 实际已有账目后端的 HTTPS 来源地址，不能包含路径、账号或密码；缺失会停止启动 |
| `BOOK_PUBLIC_ACCESS` | 多用户版本必须删除或设为 `false`，让首页转发至后端的邮箱登录页面 |

测试使用 `*.example` 合成地址，并以模拟后端检查行为，不读写真实账目。

## 保留已有数据库

发布 Vercel 前先配置现有后端地址。只改前端/API 入口时不必重新部署 `backend/`。

如果以后修改并部署后端，复制 `backend/.env.example` 为 `backend/.env.local`，在腾讯云运行环境配置同样的变量：

| 变量 | 用途 |
|---|---|
| `CLOUDBASE_ENV_ID` | 已有 CloudBase 环境 ID，必须保持指向现有数据库 |
| `CLOUDBASE_APIKEY` | 可选服务端 API key，与其他身份方式择一；不要使用客户端公开 key 替代服务端权限 |
| `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY` / `TENCENTCLOUD_SESSIONTOKEN` | 可选服务端凭据方式；优先使用平台提供的运行身份或受限服务端凭据 |
| `PUBLIC_ORIGIN` | 腾讯云后端自己的 HTTPS 来源地址 |
| `PORT` | 后端监听端口；默认 9000 |
| `BOOK_PUBLIC_ACCESS` | 多用户版本必须删除或设为 `false`；后端检测到 `true` 会停止启动 |
| `OWNER_EMAIL` | 你的邮箱，必填；该邮箱登录映射到现有账本，其他邮箱独立建账 |
| `RESEND_API_KEY` | Resend 服务端邮件 API 密钥，不提交仓库 |
| `MAIL_FROM` | Resend 已验证域名的发件人地址 |
| `BOOK_SESSION_KEY` | 会话和用户身份签名密钥，必须保留已有值；更换会改变其他用户的账本 ID，并使会话、个人快捷指令令牌失效 |
| `SHORTCUT_WRITE_TOKEN` | 可选旧快捷指令令牌，保留后继续写入你的原账本；新用户从自己的登录会话生成独立令牌 |
| `SHORTCUT_FILE_PATH` | 已签名工作流的服务器绝对路径；文件由私密部署资产提供，不提交 GitHub |
| `LEDGER_COLLECTION` | 默认 `jianzhang_ledger`；沿用已有集合 |
| `LEDGER_DOCUMENT_ID` | 默认 `main`；沿用已有文档 |
| `ACCESS_LIMITS_COLLECTION` | 默认 `jianzhang_access`；访问尝试限制集合 |

```bash
cd backend
npm install
npm run build
npm run test:auth
npm start
```

`build.mjs` 只由页面模板生成 `src/ledger-html.ts`、编译后端并复制公开动画资源，不读取或复制私密 `.env`。这些生成文件被 `.gitignore` 排除。`scf_bootstrap` 保留腾讯云 HTTP 函数启动入口；在云函数中使用 `npm run start:cloud` 或该入口，由平台提供环境变量。不要把新环境/新集合的空账本覆盖到现有账本。

## 部署至现有 Vercel 项目

1. 在现有项目中先配置 `LEDGER_UPSTREAM_ORIGIN` 和 `BOOK_PUBLIC_ACCESS`；保留现有自定义域名、后端和数据库。此公开准备包移除了旧代码中的默认个人后端地址，缺少配置会无法提供服务。
2. 使用仓库根目录，Framework 选择 Other，Node.js 使用 22，沿用 `vercel.json`；不改成 Next.js 项目。
3. 如果连接 GitHub，在现有项目中连接新仓库及生产分支；先验证预览部署，再使用正常生产流程。不要另建替代项目，不把 Vercel token 写入 CI 或前端。
4. 如果继续使用 CLI，先核对 `.vercel/project.json` 的项目与账户，然后部署；`.vercel/` 不提交。
5. 后端源码如有改动，通过腾讯云现有发布流程更新同一函数。保持数据库身份、集合和文档不变。

Vercel 的自动 Git 部署不会自动更新腾讯云后端。这是两套运行部署，需要分别验证。

## iPhone 快捷指令

公开仓库不提供已安装的个人工作流、签名文件或个人连接配置。设置 `SHORTCUT_API_ORIGIN` 环境变量后运行：

```bash
python shortcut/build.py
```

生成文件在 `shortcut/generated/`，默认不进入 Git。该变量是部署网站的 HTTPS 来源地址；生成器从不读取或嵌入 `SHORTCUT_WRITE_TOKEN`。工作流安装时，在自己的手机粘贴网站生成的个人配置。签名步骤需要自行处理；生成成功不等于已经签名或已在 iPhone 上安装。

网站下载接口转发至配置的后端，后端从 `SHORTCUT_FILE_PATH` 读取私密部署资产。因此不把签名二进制提交 GitHub，也可以保留下载功能。未配置文件时下载会报告服务不可用。

## 公开上传与访问模式

只上传这个准备目录，不上传整个工作区。`.env.example` 仅包含空的变量赋值，没有任何真实值；所有本地环境文件、导出的 CSV/XLSX、数据库、备份、快捷指令二进制、签名材料、云 CLI 配置均被排除。

公开源代码不等于账目私有。这个分支采用邮箱验证码登录和独立账本；Vercel 与后端均关闭公开访问。这里只修改源码，尚未修改线上环境变量或部署。

`.gitignore` 不会删除已经提交到历史中的秘密。若以前已公开过密钥或账目，应撤销/轮换相关凭据并清理历史，再公开；不能只删除当前文件。

第三方 GSAP 的许可声明随资源保留；自有代码以 MIT 许可证开源，见 [LICENSE](LICENSE)。上传前执行 [docs/上传前检查清单.md](docs/上传前检查清单.md)。

## 多用户邮箱登录上线步骤

本次实现以 CHANGES.md 为基础。旧密码接口已移除，旧密码 cookie 需要重新登录；新会话保存一年。

1. 在现有网站导出并妥善保存账本备份，不能把备份提交到 GitHub。
2. 在 Resend 添加你的域名，按它提供的记录验证 SPF / DKIM，配置 `RESEND_API_KEY` 和 `MAIL_FROM`。
3. 腾讯云设置 `OWNER_EMAIL` 为自己的邮箱，保留 `BOOK_SESSION_KEY`、旧 `SHORTCUT_WRITE_TOKEN` 和原数据库环境、集合、文档。默认你的账本仍是 `jianzhang_ledger/main`；其他用户使用 `u_<uid>` 文档。不要重建或清空数据库。
4. 腾讯云删除 `BOOK_PASSWORD`，删除 `BOOK_PUBLIC_ACCESS` 或设为 `false`；Vercel 同样关闭 `BOOK_PUBLIC_ACCESS`。
5. 先用隔离数据库测试后端及 Vercel 预览。生产数据库不得用于新邮箱、写入或错误验证码测试。确认自己的邮箱能打开旧账本、新邮箱账本为空、互不可见，旧快捷指令仍写入原账本。
6. 两端分别按现有流程发布；Vercel 的 Git 部署不会发布腾讯云后端。缺少邮件配置或有效 `OWNER_EMAIL` 时，新后端会停止启动。

验证码仅保存签名摘要，10 分钟有效。验证和尝试计数使用同一数据库事务，成功一次后即失效。测试使用内存数据库与模拟邮件，不接触线上数据。

## 开源许可证

自有代码以 [MIT 许可证](LICENSE) 开源；仓库内第三方资源（GSAP 等）保留其各自的许可声明。
