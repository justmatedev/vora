import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../electron/processes';
import { processIdentity } from '../electron/transcription-sessions';
test('operação longa com timeout null não recebe a deadline padrão de dois minutos', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = runProcess(process.execPath, ['-e', 'console.log("ready")'], { timeout: null });
  t.mock.timers.tick(120001);
  assert.equal((await pending).trim(), 'ready');
});
test('cancelamento aguarda encerramento do processo real', async () => {
  const controller = new AbortController();
  let pid = 0;
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], {
      signal: controller.signal,
      onSpawn: (value) => {
        pid = value;
      },
      onLine: (line) => {
        if (line === 'ready') controller.abort();
      },
    }),
    /cancelad/i,
  );
  assert.throws(() => process.kill(pid, 0));
});
test('falha ao registrar um subprocesso encerra a árvore antes de rejeitar', async () => {
  let pid = 0;
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      onSpawn: (value) => {
        pid = value;
        throw new Error('journal unavailable');
      },
    }),
    /journal unavailable/,
  );
  assert.equal(await processIdentity(pid), null);
});
test('cancelamento encerra também o filho do processo executado', async () => {
  const controller = new AbortController();
  let child = 0;
  const code =
    "const {spawn}=require('node:child_process');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(p.pid);setInterval(()=>{},1000)";
  await assert.rejects(
    runProcess(process.execPath, ['-e', code], {
      signal: controller.signal,
      onLine: (line) => {
        child = Number(line);
        controller.abort();
      },
    }),
    /cancelad/i,
  );
  assert.ok(child > 0);
  assert.equal(await processIdentity(child), null);
});
