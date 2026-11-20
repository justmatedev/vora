import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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
    const queue = new TranscriptionQueue(
      file,
      { sessions: new TranscriptionSessions(join(root, 'sessions.json')) } as never,
      () => {},
    );
    await queue.load();
    await queue.retry('finished');
    assert.equal(queue.snapshot().items[0].cleanupPending, false);
    assert.equal(queue.snapshot().items[0].status, 'completed');
    await queue.shutdown();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
