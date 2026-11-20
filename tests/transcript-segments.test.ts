import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planAudioChunks, mergeSegments, parseWhisperJson } from '../electron/transcript-segments';
test('variação de tempo entre chunks não descarta a mesma frase dos dois núcleos', () => {
  const chunks = planAudioChunks(312000);
  const result = mergeSegments(
    [
      {
        chunk: chunks[0],
        language: 'pt',
        segments: [{ startMs: 299500, endMs: 301000, text: 'Frase na borda.' }],
      },
      {
        chunk: chunks[1],
        language: 'pt',
        segments: [{ startMs: 1000, endMs: 2500, text: 'Frase na borda.' }],
      },
    ],
    312000,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'Frase na borda.');
});
test('contexto truncado com palavras divergentes não repete fala já coberta pelo núcleo vizinho', () => {
  const chunks = planAudioChunks(312000);
  const result = mergeSegments(
    [
      {
        chunk: chunks[0],
        language: 'en',
        segments: [
          { startMs: 299000, endMs: 302000, text: 'A sentence crosses the five-minute hour.' },
        ],
      },
      {
        chunk: chunks[1],
        language: 'en',
        segments: [
          { startMs: 0, endMs: 6520, text: 'A sentence crosses the five minute boundary.' },
        ],
      },
    ],
    312000,
  );
  assert.deepEqual(
    result.map((s) => s.text),
    ['A sentence crosses the five minute boundary.'],
  );
});
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
test('frase parcial sobreposta entre chunks não repete o sufixo da frase anterior', () => {
  const chunks = planAudioChunks(312000);
  assert.deepEqual(
    mergeSegments(
      [
        {
          chunk: chunks[0],
          language: 'en',
          segments: [
            { startMs: 297000, endMs: 299000, text: 'The recording stays on this computer.' },
          ],
        },
        {
          chunk: chunks[1],
          language: 'en',
          segments: [
            { startMs: 0, endMs: 6520, text: 'on this computer. A sentence crosses the boundary.' },
          ],
        },
      ],
      312000,
    ),
    [
      { startMs: 297000, endMs: 299000, text: 'The recording stays on this computer.' },
      { startMs: 299000, endMs: 304520, text: 'A sentence crosses the boundary.' },
    ],
  );
});
test('marcador no audio real do Whisper não vira fala em trechos silenciosos', () => {
  const result = parseWhisperJson(
    {
      result: { language: 'en' },
      transcription: [{ offsets: { from: 0, to: 2000 }, text: '[no audio]' }],
    },
    planAudioChunks(2000)[0],
  );
  assert.deepEqual(result.segments, []);
});
test('repetição falada sem overlap temporal e dentro do mesmo chunk é preservada', () => {
  const chunks = planAudioChunks(312000);
  const result = mergeSegments(
    [
      {
        chunk: chunks[0],
        language: 'pt',
        segments: [
          { startMs: 296000, endMs: 298000, text: 'muito bem' },
          { startMs: 297000, endMs: 299000, text: 'muito bem outra vez' },
        ],
      },
      {
        chunk: chunks[1],
        language: 'pt',
        segments: [{ startMs: 3000, endMs: 5000, text: 'outra vez muito bem' }],
      },
    ],
    312000,
  );
  assert.deepEqual(
    result.map((s) => s.text),
    ['muito bem', 'muito bem outra vez', 'outra vez muito bem'],
  );
});
