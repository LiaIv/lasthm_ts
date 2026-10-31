import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('test_main_piped_input_opens_menu_and_exits_without_creating_data', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'budget-main-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
  const child = spawn(process.execPath, [main], { cwd: directory });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = '';
  let stderr = '';
  let selectedExit = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (!selectedExit && stdout.includes('Главное меню')) {
      selectedExit = true;
      child.stdin.write('\u001b[B\r');
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(status, 0);
  assert.match(stdout, /Главное меню/);
  assert.match(stdout, /Работа завершена/);
  assert.equal(stderr, '');
  assert.deepEqual(await readdir(directory), []);
});
