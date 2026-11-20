import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerTranscriptionIPC } from '../electron/transcription-ipc';
test('ponte rejeita corpo inválido e não aceita caminhos no lugar dos identificadores', async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let writes = 0;
  registerTranscriptionIPC((channel, handler) => handlers.set(channel, handler), {
    sources: {
      resolve: async () => {
        throw new Error('Seleção de arquivo inválida');
      },
    },
    queue: {
      add: async () => {
        writes++;
      },
      snapshot: () => ({ items: [] }),
    },
    models: {
      install: (id: unknown) => {
        if (id !== 'small' && id !== 'medium') throw new Error('Modelo inválido');
      },
    },
  } as never);
  await assert.rejects(async () => handlers.get('vora:transcription-add')!(null), /inválid/i);
  await assert.rejects(
    async () =>
      handlers.get('vora:transcription-add')!({
        sourceIds: ['/etc/passwd'],
        options: { modelId: 'small', language: 'pt', formats: ['txt'] },
        downloadModel: false,
        start: false,
      }),
    /seleção|arquivo/i,
  );
  await assert.rejects(
    async () => handlers.get('vora:model-install')!('https://example.test/model'),
    /modelo/i,
  );
  await assert.rejects(
    async () => handlers.get('vora:transcription-open-output')!('unknown', 'exe'),
    /formato|arquivo/i,
  );
  assert.equal(writes, 0);
});
