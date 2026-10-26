// 发布打包（运维规矩：打包脚本固化依赖与冒烟自检）
// 流程：构建 → 临时目录组装产物并 npm ci --omit=dev 装生产依赖 → 隔离目录冒烟启动 → 生成 dist/release-<时间戳>.zip
// dist/ 仅本地留档（已 gitignore），只保留最近 5 个发布包，线上异常时重传上一个稳定包回滚。
// 用法：在 backend/ 下执行 npm run package
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import zlib from 'node:zlib';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const keepReleases = 5;
const stamp = new Date();
const pad = n => String(n).padStart(2, '0');
const releaseName = `release-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.zip`;

function run(cmd, args, cwd) {
  execFileSync(cmd, args, {cwd, stdio: 'inherit'});
}

// ---------- 最小 ZIP 写入（无第三方依赖，deflate + CRC32） ----------
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (~c) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
function writeZip(dir, outFile) {
  const entries = [];
  (function walk(rel) {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.statSync(path.join(dir, r));
      if (st.isDirectory()) { entries.push({name: r + '/', dir: true}); walk(r); }
      else entries.push({name: r, data: fs.readFileSync(path.join(dir, r))});
    }
  })('');
  const {time, date} = dosTime(new Date());
  const chunks = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.dir ? Buffer.alloc(0) : e.data;
    const packed = e.dir ? data : zlib.deflateRawSync(data, {level: 9});
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(e.dir ? 0 : 8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, packed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(e.dir ? 0 : 8, 10); cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(((e.dir ? 0o755 : 0o644) << 16) | (e.dir ? 0x10 : 0), 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.reduce((n, c) => n + c.length, 0), 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(outFile, Buffer.concat([...chunks, ...central, end]));
}

// ---------- 冒烟：在隔离目录用假环境变量启动产物，确认登录页可达 ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
async function smoke(stageDir) {
  const port = await freePort();
  const env = {
    PATH: process.env.PATH || '',
    PORT: String(port),
    BOOK_SESSION_KEY: 'smoke-only-session-key',
    RESEND_API_KEY: 're_smoke_only',
    MAIL_FROM: 'smoke@example.com',
    OWNER_EMAIL: 'owner@example.com',
    CLOUDBASE_ENV_ID: 'smoke-env'
  };
  const child = spawn(process.execPath, ['server.mjs'], {cwd: stageDir, env});
  let errOut = '';
  child.stderr.on('data', d => { errOut += d; });
  try {
    const deadline = Date.now() + 20000;
    for (;;) {
      if (child.exitCode !== null) throw Error(`冒烟失败：产物进程提前退出\n${errOut}`);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        const body = await res.text();
        if (res.status === 200 && body.includes('简账')) return;
        throw Error(`冒烟失败：首页状态 ${res.status}`);
      } catch (e) {
        if (e.message.startsWith('冒烟失败')) throw e;
        if (Date.now() > deadline) throw Error(`冒烟失败：20 秒内首页未就绪\n${errOut}`);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  } finally {
    child.kill();
  }
}

// ---------- 主流程 ----------
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'jianzhang-release-'));
try {
  console.log('1/4 构建后端…');
  run(process.execPath, ['build.mjs'], root);
  console.log('2/4 组装产物并安装生产依赖…');
  for (const f of ['server.mjs', 'scf_bootstrap', 'package.json', 'package-lock.json'])
    fs.copyFileSync(path.join(root, f), path.join(stage, f));
  fs.cpSync(path.join(root, 'assets'), path.join(stage, 'assets'), {recursive: true});
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], stage);
  if (!fs.existsSync(path.join(stage, 'node_modules', '@cloudbase', 'node-sdk')))
    throw Error('生产依赖安装不完整：缺少 node_modules/@cloudbase/node-sdk');
  console.log('3/4 隔离目录冒烟启动…');
  await smoke(stage);
  console.log('冒烟通过：产物可独立启动，登录页返回 200');
  console.log('4/4 生成发布包…');
  fs.mkdirSync(distDir, {recursive: true});
  const outFile = path.join(distDir, releaseName);
  writeZip(stage, outFile);
  const releases = fs.readdirSync(distDir).filter(f => /^release-.*\.zip$/.test(f)).sort().reverse();
  for (const old of releases.slice(keepReleases)) fs.unlinkSync(path.join(distDir, old));
  console.log(`完成：${outFile}（${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB），dist/ 留档 ${Math.min(releases.length, keepReleases)} 个`);
} finally {
  fs.rmSync(stage, {recursive: true, force: true});
}
