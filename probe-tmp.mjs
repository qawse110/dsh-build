import { spawnSync } from 'node:child_process';
import os from 'node:os';
const TMP = '/data/user/0/com.dsh.launcher/files/tmp';
const env = { ...process.env, TMPDIR: TMP, TMP, TEMP: TMP };
console.log('A parent os.tmpdir=', os.tmpdir(), 'env.TMPDIR=', process.env.TMPDIR);
const r = spawnSync(process.execPath, ['--input-type=module', '-e', 'import os from "node:os"; console.log("B child env.TMPDIR="+process.env.TMPDIR+" os.tmpdir="+os.tmpdir())'], { env, encoding: 'utf8' });
console.log('B stdout:', r.stdout.trim() || r.status);
console.log('B stderr:', (r.stderr || '').trim().slice(0, 300));
