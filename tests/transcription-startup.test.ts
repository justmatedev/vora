import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shutdownWork } from '../electron/work-activity';
import { ModelManager } from '../electron/whisper-models';
import { TranscriptionQueue } from '../electron/transcription-queue';
import { TranscriptionSessions } from '../electron/transcription-sessions';
test('encerramento espera todos os serviços mesmo quando um falha', async () => {
  let release!: () => void;
  let finished = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const result = shutdownWork([
    async () => {
      throw new Error('journal error');
    },
    async () => {
      await gate;
    },
  ]);
  result.catch(() => {
    finished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(finished, false);
  release();
  await assert.rejects(result, /journal error/);
});
test('pasta de modelos indisponível vira estado de erro sem abortar inicialização do Vora', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-model-root-'));
  try {
    const file = join(root, 'not-a-directory');
    await writeFile(file, 'file');
    const manager = new ModelManager(file, () => {});
    await manager.load();
    assert.equal(manager.snapshot().small.state, 'error');
    assert.equal(manager.snapshot().medium.state, 'error');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('fila incompatível pode encerrar sem substituir o arquivo original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-queue-version-'));
  try {
    const path = join(root, 'queue.json');
    await writeFile(path, '{"schemaVersion":999,"items":[]}');
    const queue = new TranscriptionQueue(
      path,
      { sessions: new TranscriptionSessions(join(root, 'sessions.json')) } as never,
      () => {},
    );
    await queue.load();
    assert.match(queue.snapshot().error!, /recuperar/i);
    await queue.shutdown();
    assert.equal(await readFile(path, 'utf8'), '{"schemaVersion":999,"items":[]}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
