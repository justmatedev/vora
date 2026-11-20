import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceRegistry, inspectLocalMedia } from '../electron/transcription-sources';
test('seleção mantém identidade e recusa arquivo substituído ou id desconhecido', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-source-'));
  try {
    const file = join(root, "áudio 'especial'.mp4");
    await writeFile(file, 'media');
    const registry = new SourceRegistry({ ffprobe: 'unused' }, async () => ({
      durationMs: 120000,
      audioStreamIndex: 1,
    }));
    const [selected] = await registry.register([file], 'local');
    assert.equal(selected.name, "áudio 'especial'.mp4");
    assert.equal((await registry.resolve(selected.id)).audioStreamIndex, 1);
    await writeFile(file, 'altered media');
    await assert.rejects(registry.resolve(selected.id), /alterad|selecione/i);
    await assert.rejects(registry.resolve('/etc/passwd'), /seleção|arquivo/i);
    await assert.rejects(registry.register([root], 'local'), /arquivo/i);
    const directory = await registry.chooseDestination(root);
    assert.equal(await registry.resolveDestination(directory.id), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('inspeção exige áudio, recusa playlists disfarçadas e restringe protocolos', async () => {
  const signal = new AbortController().signal;
  const run = async (_exe: string, args: string[]) => {
    assert.deepEqual(
      args.slice(args.indexOf('-protocol_whitelist'), args.indexOf('-protocol_whitelist') + 2),
      ['-protocol_whitelist', 'file,pipe'],
    );
    return JSON.stringify({
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '10' },
      streams: [{ index: 2, codec_type: 'audio', disposition: { default: 1 } }],
    });
  };
  const result = await inspectLocalMedia('/tmp/video.mp4', { ffprobe: 'ffprobe' }, signal, run);
  assert.deepEqual(result, { durationMs: 10000, audioStreamIndex: 2 });
  await assert.rejects(
    inspectLocalMedia('/tmp/x.mp4', { ffprobe: 'ffprobe' }, signal, async () =>
      JSON.stringify({
        format: { format_name: 'hls', duration: '10' },
        streams: [{ index: 0, codec_type: 'audio' }],
      }),
    ),
    /playlist|local/i,
  );
  await assert.rejects(
    inspectLocalMedia('/tmp/x.mp4', { ffprobe: 'ffprobe' }, signal, async () =>
      JSON.stringify({ format: { format_name: 'mp4', duration: '10' }, streams: [] }),
    ),
    /áudio/i,
  );
});
