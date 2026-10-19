import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const testDir = path.resolve(import.meta.dirname, '..');
const rootDir = path.resolve(testDir, '../..');
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts') && f !== 'attendance_browser_real.test.ts')
  .sort()
  .map((f) => path.join('test', f));

let commitHash = 'N/A';
try {
  commitHash = execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
} catch {}

console.log('='.repeat(80));
console.log('SkoolSys 2.0 PR-004: Server & Unit Test Suite Execution');
console.log(`Commit Hash: ${commitHash}`);
console.log(`Working Dir: ${rootDir}`);
console.log(`Discovered Backend Test Files (${files.length} suites):`);
files.forEach((f, idx) => {
  console.log(`  [${String(idx + 1).padStart(2, '0')}] ${f}`);
});
console.log('='.repeat(80));

const tsxCli = path.resolve(testDir, '../node_modules/tsx/dist/cli.mjs');

const res = spawnSync(process.execPath, [tsxCli, '--test', ...files], {
  stdio: 'inherit',
  cwd: path.resolve(testDir, '..')
});

process.exit(res.status ?? 0);
