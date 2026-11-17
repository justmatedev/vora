import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { QueueManager } from '../electron/queue.ts';
import { MetadataService } from '../electron/metadata.ts';
import { Downloader } from '../electron/downloader.ts';
import { RecoveryStore } from '../electron/recovery.ts';
import { runProcess } from '../electron/processes.ts';

// Opt-in: requests only these public Reels; never reads browser cookies or credentials.
test(
  'Instagram real: três Reels pela análise, fila, vídeo original, áudio original e MP3',
  {
    skip: process.env.VORA_TEST_INSTAGRAM !== '1',
    timeout: 600_000,
  },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'vora-instagram-integrated-'));
    const directory = resolve(
      'resources/tools',
      process.platform === 'win32' ? 'win-x64' : 'linux-x64',
    );
    const tool = (name) => join(directory, name + (process.platform === 'win32' ? '.exe' : ''));
    const tools = {
      ytdlp: tool('yt-dlp'),
      ffmpeg: tool('ffmpeg'),
      ffprobe: tool('ffprobe'),
      node: process.execPath,
    };
    const recovery = new RecoveryStore(join(root, 'recoveries.json'));
    const metadata = new MetadataService(tools, () => {});
    const downloader = new Downloader(tools, () => {}, runProcess, recovery);
    const queue = new QueueManager(
      join(root, 'queue.json'),
      {
        analyze: (url, signal) => metadata.analyze(url, signal),
        download: (info, request, destination, itemId, onEvent) =>
          downloader.download(info, request, destination, { itemId, onEvent }),
        cancelDownload: () => downloader.cancel(),
        cleanItem: async (id) => {
          for (const item of await recovery.list())
            if (item.queueItemId === id) await recovery.remove(item.id);
        },
      },
      () => {},
      () => {},
    );
    try {
      const links = ['Df2T11TxZQr', 'Df2LJrnMJpT', 'Df24KCoBALu'].map((id) => ({
        url: `https://www.instagram.com/reels/${id}/`,
      }));
      for (const [kind, audioMode] of [
        ['video', 'original'],
        ['audio', 'original'],
        ['audio', 'mp3'],
      ]) {
        assert.equal(
          (await queue.add(links, { kind, audioMode, videoMode: 'original' }, root)).added,
          3,
        );
      }
      await queue.start();
      const deadline = Date.now() + 480_000;
      while (
        queue
          .snapshot()
          .items.some((item) =>
            ['waiting', 'analyzing', 'downloading', 'processing', 'retrying'].includes(item.status),
          )
      ) {
        assert.ok(Date.now() < deadline, 'Tempo limite da fila');
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const snapshot = queue.snapshot();
      assert.equal(snapshot.items.length, 9);
      const report = [];
      for (const item of snapshot.items) {
        assert.equal(
          item.status,
          'completed',
          JSON.stringify({ url: item.url, error: item.error, preferences: item.preferences }),
        );
        const data = JSON.parse(
          await runProcess(tools.ffprobe, [
            '-v',
            'error',
            '-show_entries',
            'format=duration:stream=codec_type,codec_name,width,height',
            '-of',
            'json',
            item.result.path,
          ]),
        );
        assert.ok(Number(data.format.duration) > 0);
        assert.ok(data.streams.some((stream) => stream.codec_type === 'audio'));
        assert.equal(
          data.streams.some((stream) => stream.codec_type === 'video'),
          item.preferences.kind === 'video',
        );
        if (item.preferences.kind === 'audio' && item.preferences.audioMode === 'mp3')
          assert.equal(data.streams[0].codec_name, 'mp3');
        await runProcess(
          tools.ffmpeg,
          [
            '-v',
            'error',
            '-xerror',
            '-i',
            item.result.path,
            '-map',
            '0:v?',
            '-map',
            '0:a?',
            '-f',
            'null',
            '-',
          ],
          { timeout: 60_000 },
        );
        report.push({
          url: item.url,
          preferences: item.preferences,
          size: item.result.size,
          ...data,
        });
      }
      assert.equal((await recovery.list()).length, 0);
      await writeFile(join(root, 'verification.json'), JSON.stringify(report, null, 2));
      t.diagnostic(`9 arquivos verificados; resultados em ${root}`);
    } finally {
      await queue.shutdown();
      await metadata.cancelAll();
      if (process.env.VORA_KEEP_INSTAGRAM_TEST !== '1')
        await rm(root, { recursive: true, force: true });
    }
  },
);
