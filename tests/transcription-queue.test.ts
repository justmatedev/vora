import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptionQueue } from '../electron/transcription-queue';
import { TranscriptionSessions } from '../electron/transcription-sessions';
import { MODEL_CATALOG } from '../shared/whisper-models';
import type {
  ModelSnapshot,
  SourceRecord,
  TranscriptionWork,
  TranscriptDocument,
} from '../shared/transcription-types';
const doc: TranscriptDocument = {
  durationMs: 1000,
  language: 'pt',
  segments: [{ startMs: 0, endMs: 1000, text: 'Olá' }],
};
async function eventually(fn: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!fn()) {
    if (Date.now() > deadline) assert.fail('state did not arrive');
    await new Promise((r) => setTimeout(r, 5));
  }
}
test('fila executa um por vez e reinicia pausada sem repetir o interrompido automaticamente', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-transcription-queue-'));
  const snapshot = Object.fromEntries(
    (['small', 'medium'] as const).map((id) => [
      id,
      {
        spec: MODEL_CATALOG[id],
        state: 'installed',
        bytesOnDisk: MODEL_CATALOG[id].bytes,
        path: join(root, id),
      },
    ]),
  ) as ModelSnapshot;
  const models = { snapshot: () => structuredClone(snapshot), install: async () => {} };
  const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
  const options = { modelId: 'small' as const, language: 'pt', formats: ['txt' as const] };
  let queue: TranscriptionQueue | undefined, restored: TranscriptionQueue | undefined;
  try {
    const sources: SourceRecord[] = [];
    for (const name of ['one.mp4', 'two.mp4']) {
      const path = join(root, name);
      await writeFile(path, 'media');
      const s = await stat(path);
      sources.push({
        id: name,
        name,
        path,
        size: s.size,
        mtimeMs: s.mtimeMs,
        device: String(s.dev),
        inode: String(s.ino),
        durationMs: 1000,
        audioStreamIndex: 0,
        origin: 'local',
      });
    }
    let active = 0,
      peak = 0;
    const entered: string[] = [];
    const worker = {
      run: async (item: TranscriptionWork, signal: AbortSignal) => {
        active++;
        peak = Math.max(peak, active);
        entered.push(item.id);
        try {
          return await new Promise<TranscriptDocument>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
          );
        } finally {
          active--;
        }
      },
    };
    const path = join(root, 'transcriptions.json');
    queue = new TranscriptionQueue(path, { models, sessions, transcriber: worker }, () => {});
    await queue.load();
    const ids = await queue.add({ sources, options, downloadModel: false, start: true });
    await eventually(() => entered.length === 1);
    assert.equal(peak, 1);
    await queue.shutdown();
    const completed: string[] = [];
    restored = new TranscriptionQueue(
      path,
      {
        models,
        sessions,
        transcriber: {
          run: async (item) => {
            completed.push(item.id);
            return doc;
          },
        },
      },
      () => {},
    );
    await restored.load();
    assert.equal(restored!.snapshot().mode, 'paused');
    assert.equal(restored!.snapshot().items[0].status, 'interrupted');
    assert.deepEqual(completed, []);
    await restored.start();
    await eventually(() => restored!.snapshot().items[1].status === 'completed');
    assert.deepEqual(completed, [ids[1]]);
    await restored.retry(ids[0]);
    await restored.start();
    await eventually(() => restored!.snapshot().items[0].status === 'completed');
    assert.deepEqual(completed, [ids[1], ids[0]]);
    assert.equal(await readFile(sources[0].path, 'utf8'), 'media');
    await restored.shutdown();
  } finally {
    await queue?.shutdown().catch(() => {});
    await restored?.shutdown().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
test('falha de origem não bloqueia o próximo item e não altera queue.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-transcription-failure-'));
  try {
    const legacy = join(root, 'queue.json');
    await writeFile(legacy, 'legacy queue');
    const snapshot = Object.fromEntries(
      (['small', 'medium'] as const).map((id) => [
        id,
        {
          spec: MODEL_CATALOG[id],
          state: 'installed',
          bytesOnDisk: MODEL_CATALOG[id].bytes,
          path: join(root, id),
        },
      ]),
    ) as ModelSnapshot;
    const sources: SourceRecord[] = [];
    for (const name of ['one.mp4', 'two.mp4']) {
      const path = join(root, name);
      await writeFile(path, 'media');
      const s = await stat(path);
      sources.push({
        id: name,
        name,
        path,
        size: s.size,
        mtimeMs: s.mtimeMs,
        device: String(s.dev),
        inode: String(s.ino),
        durationMs: 1000,
        audioStreamIndex: 0,
        origin: 'local',
      });
    }
    const entered: string[] = [];
    const queue = new TranscriptionQueue(
      join(root, 'transcriptions.json'),
      {
        models: { snapshot: () => snapshot, install: async () => {} },
        sessions: new TranscriptionSessions(join(root, 'sessions.json')),
        transcriber: {
          run: async (item) => {
            entered.push(item.source.name);
            return doc;
          },
        },
      },
      () => {},
    );
    await queue.load();
    await queue.add({
      sources,
      options: { modelId: 'small', language: 'pt', formats: ['txt'] },
      downloadModel: false,
      start: false,
    });
    await writeFile(sources[0].path, 'changed');
    await queue.start();
    await eventually(() => queue!.snapshot().items[1].status === 'completed');
    assert.equal(queue!.snapshot().items[0].status, 'failed');
    assert.deepEqual(entered, ['two.mp4']);
    await queue.shutdown();
    await queue.clearCompleted();
    assert.equal(queue!.snapshot().items.length, 1);
    assert.equal(await readFile(legacy, 'utf8'), 'legacy queue');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
