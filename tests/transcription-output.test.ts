import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpath, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import {
  publishTranscript,
  serializeTranscript,
  PartialTranscriptOutputError,
} from '../electron/transcription-output';
import type { TranscriptDocument } from '../shared/transcription-types';
const doc: TranscriptDocument = {
  language: 'pt',
  durationMs: 120000,
  segments: [{ startMs: 0, endMs: 120400, text: 'Olá, mundo.' }],
};
test('TXT e SRT usam o mesmo sufixo e preservam arquivo existente', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-output-')));
  try {
    await writeFile(join(root, 'clovis.transcricao.txt'), 'anterior');
    const outputs = await publishTranscript(
      doc,
      ['txt', 'srt'],
      root,
      'clovis.mp4',
      async () => {},
    );
    assert.deepEqual(
      outputs.map((o) => basename(o.path)),
      ['clovis.transcricao (1).txt', 'clovis.transcricao (1).srt'],
    );
    assert.equal(await readFile(join(root, 'clovis.transcricao.txt'), 'utf8'), 'anterior');
    assert.match(await readFile(outputs[1].path, 'utf8'), /00:02:00,000/);
    assert.equal(await readFile(outputs[0].path, 'utf8'), 'Olá, mundo.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('criação concorrente do segundo formato não sobrescreve e relata saída parcial', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-output-race-')));
  try {
    await assert.rejects(
      publishTranscript(doc, ['txt', 'srt'], root, 'clovis.mp4', async (output) => {
        if (output.format === 'txt')
          await writeFile(join(root, 'clovis.transcricao.srt'), 'external');
      }),
      (error) => {
        assert.ok(error instanceof PartialTranscriptOutputError);
        assert.deepEqual(
          error.published.map((o) => o.format),
          ['txt'],
        );
        return true;
      },
    );
    assert.equal(await readFile(join(root, 'clovis.transcricao.srt'), 'utf8'), 'external');
    assert.equal(await readFile(join(root, 'clovis.transcricao.txt'), 'utf8'), 'Olá, mundo.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('SRT recorta tempos e recusa resultados sem fala útil', () => {
  assert.equal(serializeTranscript(doc, 'srt'), '1\n00:00:00,000 --> 00:02:00,000\nOlá, mundo.\n');
  assert.throws(() => serializeTranscript({ ...doc, segments: [] }, 'txt'), /fala/i);
});
test('falha de diário preserva o arquivo publicado e nomes de dispositivo são neutralizados', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-output-journal-')));
  try {
    await assert.rejects(
      publishTranscript(doc, ['txt', 'srt'], root, 'CON.mp4', async () => {
        throw new Error('journal unavailable');
      }),
      (error) => {
        assert.ok(error instanceof PartialTranscriptOutputError);
        assert.equal(basename(error.published[0].path), '_CON.transcricao.txt');
        return true;
      },
    );
    assert.equal(await readFile(join(root, '_CON.transcricao.txt'), 'utf8'), 'Olá, mundo.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
