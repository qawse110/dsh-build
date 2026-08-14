// install-dsh.mjs - 在 DshLauncher app 内完成 dsh 依赖安装与构建
// 由内置 node 执行： node install-dsh.mjs
// 功能：1) 定位内置 node 2) 用 pnpm 安装依赖 3) 构建 4) 输出状态到共享目录
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NODE = '/data/user/0/com.dsh.launcher/files/node';
const HOME = '/data/user/0/com.dsh.launcher/files';
const DSH_DIR = join(HOME, 'deepseek-harness-master');
const PNPM_MJS = join(HOME, '.tools/lib/node_modules/pnpm/dist/pnpm.mjs');
const OUT = '/sdcard/Download/DshLauncher/install_log.txt';

const TMP = join(HOME, 'tmp');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: join(NODE, 'lib'),
  HOME,
  TMPDIR: TMP, // files/tmp 可写目录（node 目录只读）
  TMP: TMP, TEMP: TMP,
  OPENSSL_CONF: '/dev/null',
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  PUPPETEER_SKIP_DOWNLOAD: '1',
  PATH: [join(HOME, '.tools/bin'), join(NODE, 'bin'), '/system/bin', '/bin'].join(':'),
};

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { writeFileSync(OUT, line + '\n', { flag: 'a' }); } catch {}
}

function run(label, cmd, args, opts = {}) {
  log(`>> ${label}`);
  const r = spawnSync(cmd, args, { env, encoding: 'utf8', timeout: 30 * 60 * 1000, ...opts });
  if (r.stdout) { try { writeFileSync(OUT, String(r.stdout), { flag: 'a' }); } catch {} }
  if (r.stderr) { try { writeFileSync(OUT, String(r.stderr), { flag: 'a' }); } catch {} }
  log(`${label} exit=${r.status}`);
  if (r.status !== 0 && !opts.ignoreFail) { process.exit(r.status ?? 1); }
  return r;
}

try {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'probe.txt'), 'ok');
} catch (e) {
  log('WARN mkdir tmp failed: ' + e.message);
}

log('=== dsh install start ===');
log(`node=${process.version} dsh_dir=${existsSync(DSH_DIR)} pnpm=${existsSync(PNPM_MJS)}`);

if (!existsSync(DSH_DIR)) { log('ERROR: dsh source dir missing'); process.exit(1); }
if (!existsSync(PNPM_MJS)) { log('ERROR: pnpm missing'); process.exit(1); }

function patchPnpm() {
  try {
    const s0 = readFileSync(PNPM_MJS, 'utf8');
    if (s0.indexOf('PNPM_EROFS_PATCHED') >= 0) { log('pnpm already patched'); return true; }
    const needle = '"EXDEV" || err2.code === "EACCES" || err2.code === "EPERM"';
    if (s0.indexOf(needle) < 0) { log('WARN pnpm patch needle not found'); return false; }
    writeFileSync(PNPM_MJS, s0.split(needle).join(needle + ' || err2.code === "EROFS"'));
    log('pnpm patched for EROFS');
    return true;
  } catch (e) { log('WARN pnpm patch failed: ' + e.message); return false; }
}
// 创建 pnpm 命令包装（供 build 脚本内 pnpm 命令使用）
try {
  const pdir = join(HOME, ".tools/bin");
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, "pnpm"), "#!/system/bin/sh\nexec " + process.execPath + " " + PNPM_MJS + " \"$@\"\n", { mode: 0o555 });
  log("pnpm wrapper created");
} catch (e) { log("WARN pnpm wrapper failed: " + e.message); }
// 安装依赖
patchPnpm();
// 安装依赖
run('pnpm install', process.execPath, [PNPM_MJS, 'install', '--no-frozen-lockfile', '--ignore-scripts', '--child-concurrency=1', '--network-concurrency=2'], { cwd: DSH_DIR });
// 设备端不构建：用 Ubuntu 预构建产物（lib/dist）替代，省时且避免进程被杀
log('skip device build (use Ubuntu artifacts)');
// 下载 Ubuntu 构建产物并解压
const ART_URL = 'https://raw.githubusercontent.com/qawse110/dsh-build/84c9afd/dsh-artifacts.tar.gz';
const ART_FILE = join(HOME, 'artifacts.tar.gz');
log('>> download artifacts...');
const dl = spawnSync(process.execPath, ['-e', 'fetch(process.env.AU).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.arrayBuffer()}).then(b=>require("fs").writeFileSync(process.env.AF,Buffer.from(b))).then(()=>console.log("ART_DL_OK")).catch(e=>{console.log("ERR",e.message);process.exit(1)})'], { env: { ...env, AU: ART_URL, AF: ART_FILE }, encoding: 'utf8', timeout: 8 * 60 * 1000 });
log('artifact dl: ' + ((dl.stdout || '').trim() || 'status=' + dl.status) + ' ' + ((dl.stderr || '').trim().slice(0, 200)));
if (dl.status === 0) {
  const tx = spawnSync('/system/bin/tar', ['-xzf', ART_FILE, '-C', DSH_DIR], { env, encoding: 'utf8', timeout: 5 * 60 * 1000 });
  log('artifact extract exit=' + tx.status + ' ' + ((tx.stderr || '').slice(0, 200)));
}
// 启动 dsh web（nohup 后台长驻）
const web = spawnSync('/system/bin/sh', ['-c', 'cd ' + DSH_DIR + ' && nohup ' + NODE + '/bin/node ./node_modules/.bin/dsh web > /sdcard/Download/DshLauncher/dsh-web.log 2>&1 & echo PID=$!'], { env, encoding: 'utf8', timeout: 30000 });
log('dsh web start: ' + ((web.stdout || '').trim() || 'status=' + web.status));
log('=== dsh install DONE ===');