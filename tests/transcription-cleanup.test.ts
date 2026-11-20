import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptionQueue } from '../electron/transcription-queue';
import { TranscriptionSessions } from '../electron/transcription-sessions';
test('limpar temporários de concluído não exige que o vídeo original ainda exista', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-finished-cleanup-'));
  try {
    const file = join(root, 'transcriptions.json');
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        mode: 'paused',
        items: [
          {
            id: 'finished',
            source: {
              id: 'source',
              name: 'gone.mp4',
              path: join(root, 'gone.mp4'),
              size: 1,
              mtimeMs: 0,
              device: '0',
              inode: '1',
              durationMs: 1000,
              audioStreamIndex: 0,
              origin: 'local',
            },
            destination: root,
            options: { modelId: 'small', language: 'pt', formats: ['txt'] },
            modelRevision: 'fixed',
            status: 'completed',
            outputs: [],
            cleanupPending: true,
          },
        ],
      }),
    );
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    let queue = new TranscriptionQueue(file, { sessions } as never, () => {});
    await queue.load();
    await queue.retry('finished');
    assert.equal(queue.snapshot().items[0].cleanupPending, false);
    assert.equal(queue.snapshot().items[0].error, undefined);
    // A missing source can prevent restarting, but must not keep a cleaned
    // session marked as pending and block updates indefinitely.
    const saved = JSON.parse(await readFile(file, 'utf8'));
    saved.items[0].status = 'interrupted';
    saved.items[0].cleanupPending = true;
    await queue.shutdown();
    await writeFile(file, JSON.stringify(saved));
    queue = new TranscriptionQueue(file, { sessions } as never, () => {});
    await queue.load();
    await assert.rejects(queue.retry('finished'), /movido|alterado/);
    assert.equal(queue.snapshot().items[0].cleanupPending, false);
    assert.equal(queue.snapshot().items[0].status, 'interrupted');
    await queue.shutdown();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('limpeza falha na abertura pode ser repetida sem tornar a fila somente leitura', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-startup-cleanup-'));
  let queue: TranscriptionQueue | undefined;
  try {
    const file = join(root, 'transcriptions.json');
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    await sessions.create('finished', root);
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        mode: 'paused',
        items: [
          {
            id: 'finished',
            source: {
              id: 'source',
              name: 'gone.wav',
              path: join(root, 'gone.wav'),
              size: 1,
              mtimeMs: 0,
              device: '0',
              inode: '1',
              durationMs: 1000,
              audioStreamIndex: 0,
              origin: 'local',
            },
            destination: root,
            options: { modelId: 'small', language: 'pt', formats: ['txt'] },
            modelRevision: 'fixed',
            status: 'completed',
            outputs: [],
          },
        ],
      }),
    );
    const cleanup = sessions.cleanup.bind(sessions);
    let fail = true;
    sessions.cleanup = async (id) => {
      if (fail) {
        fail = false;
        throw new Error('EBUSY');
      }
      await cleanup(id);
    };
    queue = new TranscriptionQueue(file, { sessions } as never, () => {});
    await queue.load();
    assert.equal(queue.snapshot().error, undefined);
    assert.equal(queue.snapshot().mode, 'paused');
    assert.equal(queue.snapshot().items[0].cleanupPending, true);
    await queue.retry('finished');
    assert.equal(queue.snapshot().items[0].cleanupPending, false);
  } finally {
    await queue?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
