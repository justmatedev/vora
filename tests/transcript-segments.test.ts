import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planAudioChunks, mergeSegments, parseWhisperJson } from '../electron/transcript-segments';
test('áudio longo usa cores de cinco minutos e contexto limitado', () => {
  const chunks = planAudioChunks(3600000);
  assert.equal(chunks.length, 12);
  assert.ok(chunks.every((c) => c.endMs - c.startMs <= 304000));
  assert.deepEqual(chunks[1], {
    coreStartMs: 300000,
    coreEndMs: 600000,
    startMs: 298000,
    endMs: 602000,
  });
});
test('segmentos de overlap aparecem uma vez e não ultrapassam duração', () => {
  const chunks = planAudioChunks(320000);
  const result = mergeSegments(
    [
      {
        chunk: chunks[0],
        language: 'pt',
        segments: [{ startMs: 298000, endMs: 300000, text: 'borda' }],
      },
      {
        chunk: chunks[1],
        language: 'pt',
        segments: [
          { startMs: 0, endMs: 2000, text: 'borda' },
          { startMs: 2000, endMs: 22400, text: 'final' },
        ],
      },
    ],
    320000,
  );
  assert.deepEqual(result, [
    { startMs: 298000, endMs: 300000, text: 'borda' },
    { startMs: 300000, endMs: 320000, text: 'final' },
  ]);
});
test('JSON inválido falha e offsets reais do Whisper são milissegundos', () => {
  const chunk = planAudioChunks(120000)[0];
  const parsed = parseWhisperJson(
    {
      result: { language: 'pt' },
      transcription: [{ offsets: { from: 0, to: 120400 }, text: ' fala real ' }],
    },
    chunk,
  );
  assert.equal(mergeSegments([parsed], 120000)[0].endMs, 120000);
  assert.throws(
    () => parseWhisperJson({ transcription: [{ text: 'missing offsets' }] }, chunk),
    /resultado|transcrição/i,
  );
});
test('estrutura sanitizada do motor portátil real é aceita pelo parser', async () => {
  const raw = JSON.parse(
    await readFile(new URL('./fixtures/whisper-small-output.json', import.meta.url), 'utf8'),
  );
  const result = parseWhisperJson(raw, planAudioChunks(120000)[0]);
  assert.equal(result.language, 'pt');
  assert.equal(result.segments.length, 2);
});
