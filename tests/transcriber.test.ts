import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transcriber } from '../electron/transcriber';
import { TranscriptionSessions } from '../electron/transcription-sessions';
import type { TranscriptionWork, ModelSpec } from '../shared/transcription-types';
test('substituição da origem entre chunks falha antes de ler a segunda gravação', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-source-replaced-'));
  const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
  try {
    const sourcePath = join(root, 'source.wav'),
      model = join(root, 'model');
    await writeFile(sourcePath, 'first');
    await writeFile(model, 'weights');
    const info = await stat(sourcePath);
    const spec = {
      id: 'small',
      revision: 'fixed',
      bytes: 7,
      sha256: createHash('sha256').update('weights').digest('hex'),
      url: 'https://example.test/model',
    };
    const item: TranscriptionWork = {
      id: 'job',
      destination: root,
      modelRevision: 'fixed',
      options: { modelId: 'small', language: 'auto', formats: ['txt'] },
      source: {
        id: 'source',
        name: 'source.wav',
        path: sourcePath,
        origin: 'local',
        size: info.size,
        mtimeMs: info.mtimeMs,
        device: String(info.dev),
        inode: String(info.ino),
        durationMs: 320000,
        audioStreamIndex: 0,
      },
    };
    let reads = 0,
      recognitions = 0;
    const run = async (exe: string, args: string[]) => {
      if (exe === 'ffmpeg') {
        reads++;
        await writeFile(args.at(-1)!, 'wav');
      } else {
        recognitions++;
        await writeFile(
          args[args.indexOf('-of') + 1] + '.json',
          JSON.stringify({
            result: { language: 'pt' },
            transcription: [{ offsets: { from: 0, to: 1000 }, text: 'Primeira gravação.' }],
          }),
        );
        if (recognitions === 1) {
          await rename(sourcePath, sourcePath + '.original');
          await writeFile(sourcePath, 'second');
        }
      }
      return '';
    };
    const worker = new Transcriber(
      { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper' },
      { path: () => model, snapshot: () => ({ small: { spec } }) } as never,
      sessions,
      run,
    );
    await assert.rejects(
      worker.run(item, new AbortController().signal, () => {}),
      /movido|alterado/i,
    );
    assert.equal(reads, 1);
  } finally {
    const session = await sessions.forItem('job');
    if (session) await sessions.cleanup(session.id);
    await rm(root, { recursive: true, force: true });
  }
});
test('motor prepara áudio local e usa JSON sem GPU ou tradução', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-transcriber-'));
  try {
    const source = join(root, 'origem.mp4'),
      model = join(root, 'model');
    await writeFile(source, 'media');
    await writeFile(model, 'weights');
    const info = await stat(source);
    const spec: ModelSpec = {
      id: 'small',
      revision: 'fixed',
      bytes: 7,
      sha256: createHash('sha256').update('weights').digest('hex'),
      url: 'https://example.test/model',
    };
    const work: TranscriptionWork = {
      id: 'job',
      destination: root,
      modelRevision: 'fixed',
      options: { modelId: 'small', language: 'auto', formats: ['txt', 'srt'] },
      source: {
        id: 'source',
        name: 'origem.mp4',
        path: source,
        origin: 'local',
        size: info.size,
        mtimeMs: info.mtimeMs,
        device: String(info.dev),
        inode: String(info.ino),
        durationMs: 120000,
        audioStreamIndex: 1,
      },
    };
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    const invocations: { exe: string; args: string[] }[] = [];
    const run = async (exe: string, args: string[]) => {
      invocations.push({ exe, args });
      if (exe === 'whisper') {
        assert.ok(args.includes('-ng'));
        assert.equal(args.includes('--translate'), false);
        assert.ok(args.includes('-oj'));
        const output = args[args.indexOf('-of') + 1];
        await writeFile(
          output + '.json',
          JSON.stringify({
            result: { language: 'pt' },
            transcription: [{ offsets: { from: 0, to: 120400 }, text: 'Olá mundo' }],
          }),
        );
      } else {
        assert.equal(args[args.indexOf('-map') + 1], '0:1');
        await writeFile(args.at(-1)!, 'wav');
      }
      return '';
    };
    const worker = new Transcriber(
      { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper' },
      { path: () => model, snapshot: () => ({ small: { spec } }) } as never,
      sessions,
      run,
    );
    const result = await worker.run(work, new AbortController().signal, () => {});
    assert.equal(result.language, 'pt');
    assert.deepEqual(result.segments, [{ startMs: 0, endMs: 120000, text: 'Olá mundo' }]);
    assert.equal(invocations.length, 2);
    const session = await sessions.forItem('job');
    await sessions.cleanup(session!.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('resultado sem fala não é declarado concluído', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-transcriber-empty-'));
  try {
    const source = join(root, 'source.wav'),
      model = join(root, 'model');
    await writeFile(source, 'audio');
    await writeFile(model, 'weights');
    const info = await stat(source);
    const spec = {
      id: 'small',
      revision: 'fixed',
      bytes: 7,
      sha256: createHash('sha256').update('weights').digest('hex'),
      url: 'https://example.test/model',
    };
    const item: TranscriptionWork = {
      id: 'job',
      destination: root,
      modelRevision: 'fixed',
      options: { modelId: 'small', language: 'pt', formats: ['txt'] },
      source: {
        id: 'source',
        name: 'source.wav',
        path: source,
        origin: 'local',
        size: info.size,
        mtimeMs: info.mtimeMs,
        device: String(info.dev),
        inode: String(info.ino),
        durationMs: 1000,
        audioStreamIndex: 0,
      },
    };
    const sessions = new TranscriptionSessions(join(root, 'journal.json'));
    const run = async (exe: string, args: string[]) => {
      if (exe === 'whisper')
        await writeFile(
          args[args.indexOf('-of') + 1] + '.json',
          JSON.stringify({ result: { language: 'pt' }, transcription: [] }),
        );
      return '';
    };
    const worker = new Transcriber(
      { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', whisper: 'whisper' },
      { path: () => model, snapshot: () => ({ small: { spec } }) } as never,
      sessions,
      run,
    );
    await assert.rejects(
      worker.run(item, new AbortController().signal, () => {}),
      /fala/i,
    );
    const session = await sessions.forItem('job');
    await sessions.cleanup(session!.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
