// install-dsh.mjs - 在 DshLauncher app 内完成 dsh 依赖安装与构建
// 由内置 node 执行： node install-dsh.mjs
// 功能：1) 定位内置 node 2) 用 pnpm 安装依赖 3) 构建 4) 输出状态到共享目录
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NODE = '/data/user/0/com.dsh.launcher/files/node';
const HOME = '/data/user/0/com.dsh.launcher/files';
const DSH_DIR = join(HOME, 'deepseek-harness-master');
const PNPM_MJS = join(HOME, '.tools/lib/node_modules/pnpm/bin/pnpm.mjs');
const OUT = '/sdcard/Download/DshLauncher/install_log.txt';

const TMP = join(HOME, 'tmp');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: join(NODE, 'lib'),
  HOME,
  TMPDIR: TMP, // files/tmp 可写目录（node 目录只读）
  OPENSSL_CONF: '/dev/null',
  PATH: [join(NODE, 'bin'), '/system/bin', '/bin'].join(':'),
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

// 安装依赖
run('pnpm install', process.execPath, [PNPM_MJS, 'install', '--no-frozen-lockfile']);
// 构建
run('pnpm build', process.execPath, [PNPM_MJS, 'run', 'build']);
log('=== dsh install DONE ===');