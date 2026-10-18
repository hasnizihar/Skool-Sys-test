import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const testDir = path.resolve(import.meta.dirname, '..');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts') && f !== 'attendance_browser_real.test.ts')
  .map((f) => path.join('test', f));

const tsxCli = path.resolve(testDir, '../node_modules/tsx/dist/cli.mjs');

const res = spawnSync(process.execPath, [tsxCli, '--test', ...files], {
  stdio: 'inherit',
  cwd: path.resolve(testDir, '..')
});

process.exit(res.status ?? 0);
