import { spawnSync } from 'node:child_process';
const TMP = '/data/user/0/com.dsh.launcher/files/tmp';
const env = { ...process.env, TMPDIR: TMP, TMP, TEMP: TMP };
console.log('A parent os.tmpdir=', require('node:os').tmpdir(), 'env.TMPDIR=', process.env.TMPDIR);
const r = spawnSync(process.execPath, ['-e', 'console.log("B child env.TMPDIR="+process.env.TMPDIR+" os.tmpdir="+require("node:os").tmpdir())'], { env, encoding: 'utf8' });
console.log('B stdout:', r.stdout.trim() || r.status);
console.log('B stderr:', (r.stderr || '').trim().slice(0, 300));
