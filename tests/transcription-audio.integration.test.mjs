import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { runProcess } from '../electron/processes.ts';
import { SourceRegistry } from '../electron/transcription-sources.ts';
import { prepareAudioChunk } from '../electron/transcription-audio.ts';
const rootTools = resolve(
  'resources/tools',
  process.platform === 'win32' ? 'win-x64' : 'linux-x64',
);
const tool = (name) => join(rootTools, name + (process.platform === 'win32' ? '.exe' : ''));
test('áudio extraído conserva atraso da faixa e preenche trecho posterior ao fim do áudio', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-audio-timeline-'));
  try {
    const input = join(root, 'delayed.mkv');
    await runProcess(tool('ffmpeg'), [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=size=16x16:rate=1:duration=8',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=16000:duration=2',
      '-filter:a',
      'asetpts=PTS+2/TB',
      '-c:v',
      'ffv1',
      '-c:a',
      'pcm_s16le',
      input,
    ]);
    const registry = new SourceRegistry({ ffprobe: tool('ffprobe') });
    const [selected] = await registry.register([input], 'local');
    const source = await registry.resolve(selected.id);
    const wav = join(root, 'audio.wav');
    await prepareAudioChunk(
      source,
      { startMs: 0, endMs: 6000, coreStartMs: 0, coreEndMs: 6000 },
      wav,
      tool('ffmpeg'),
      {},
    );
    const bytes = await readFile(wav);
    const dataIndex = bytes.indexOf(Buffer.from('data')) + 8;
    const pcm = bytes.subarray(dataIndex);
    const peak = (from, to) => {
      let n = 0;
      for (let i = from * 32000; i < to * 32000 && i + 1 < pcm.length; i += 2)
        n = Math.max(n, Math.abs(pcm.readInt16LE(i)));
      return n;
    };
    assert.equal(peak(0, 1.9), 0, 'o atraso deve aparecer como silêncio na linha do tempo');
    assert.ok(peak(2.1, 3.9) > 1000);
    assert.ok(pcm.length >= 6 * 32000, 'a duração do trecho deve incluir o silêncio final');
    const tail = join(root, 'tail.wav');
    await prepareAudioChunk(
      source,
      { startMs: 6000, endMs: 8000, coreStartMs: 6000, coreEndMs: 8000 },
      tail,
      tool('ffmpeg'),
      {},
    );
    assert.ok((await readFile(tail)).length >= 2 * 32000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
