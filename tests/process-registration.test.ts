import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptionSessions, processIdentity } from '../electron/transcription-sessions';
test(
  'queda durante registro não inicia ferramenta nem deixa sessão em uso',
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-registration-crash-'));
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    const session = await sessions.create('job', root);
    const started = join(root, 'tool-started'),
      pidFile = join(root, 'child-pid');
    let parent: ReturnType<typeof spawn> | undefined, childPid: number | undefined;
    try {
      const script = join(root, 'parent.mjs');
      const modulePath = new URL('../electron/processes.ts', import.meta.url).href;
      await writeFile(
        script,
        `import { runProcess } from ${JSON.stringify(modulePath)};\nimport { writeFile } from 'node:fs/promises';\nawait runProcess(process.execPath, ['-e', ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(started)}, 'started'); setInterval(() => {}, 1000);`)}], { registrationGate: true, timeout: null, onSpawn: async (pid) => { await writeFile(${JSON.stringify(pidFile)}, String(pid)); await new Promise(() => {}); } });`,
      );
      parent = spawn(process.execPath, ['--import', 'tsx', script], {
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      for (let i = 0; i < 100 && !childPid; i++) {
        childPid = await readFile(pidFile, 'utf8')
          .then(Number)
          .catch(() => undefined);
        if (!childPid) await new Promise((done) => setTimeout(done, 25));
      }
      assert.ok(childPid, 'o processo controlado deve estar na janela anterior ao registro');
      assert.ok(await processIdentity(childPid));
      await new Promise((done) => setTimeout(done, 150));
      await assert.rejects(readFile(started), { code: 'ENOENT' });
      parent.kill('SIGKILL');
      await once(parent, 'close');
      for (let i = 0; i < 100 && (await processIdentity(childPid)); i++)
        await new Promise((done) => setTimeout(done, 25));
      assert.equal(await processIdentity(childPid), null);
      const recovered = new TranscriptionSessions(join(root, 'sessions.json'));
      assert.equal(await recovered.running(), false);
      await recovered.cleanup(session.id);
      await assert.rejects(readFile(started), { code: 'ENOENT' });
    } finally {
      if (parent && parent.exitCode === null) parent.kill('SIGKILL');
      if (childPid) {
        try {
          process.kill(process.platform === 'win32' ? childPid : -childPid, 'SIGKILL');
        } catch {
          /* own fixture already exited */
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
