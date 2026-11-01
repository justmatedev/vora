import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { QueueManager } from '../electron/queue.ts';
import { MetadataService } from '../electron/metadata.ts';
import { Downloader } from '../electron/downloader.ts';
import { RecoveryStore } from '../electron/recovery.ts';
import { runProcess } from '../electron/processes.ts';

const rootTools = resolve(
  'resources/tools',
  process.platform === 'win32' ? 'win-x64' : 'linux-x64',
);
const tool = (name) => join(rootTools, name + (process.platform === 'win32' ? '.exe' : ''));
const tools = {
  ytdlp: tool('yt-dlp'),
  ffmpeg: tool('ffmpeg'),
  ffprobe: tool('ffprobe'),
  node: process.execPath,
};
async function until(check) {
  const deadline = Date.now() + 30_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test(
  'ferramenta real lista playlist incrementalmente sem extrair os vídeos',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-playlist-real-'));
    let metadata;
    try {
      const info = join(root, 'playlist.html');
      await writeFile(
        info,
        '<html><head><title>Playlist local de teste</title></head><body><iframe src="https://www.youtube.com/embed/BaW_jenozKc"></iframe><iframe src="https://www.youtube.com/embed/aqz-KE-bpKQ"></iframe></body></html>',
      );
      metadata = new MetadataService(
        tools,
        () => {},
        (executable, args, options) =>
          runProcess(
            executable,
            [
              ...args.slice(0, args.lastIndexOf('--')),
              '--enable-file-urls',
              '--',
              pathToFileURL(info).href,
            ],
            options,
          ),
      );
      const id = randomUUID();
      metadata.start('https://www.youtube.com/playlist?list=PL1234567890abcdef', id);
      await until(() => metadata.page(id, 0).state !== 'loading');
      const page = metadata.page(id, 0);
      assert.equal(page.state, 'complete');
      assert.equal(page.title, 'Playlist local de teste');
      assert.deepEqual(
        page.entries.map((entry) => new URL(entry.url).searchParams.get('v')),
        ['BaW_jenozKc', 'aqz-KE-bpKQ'],
      );
      assert.equal(page.entries[1].duration, undefined);
      assert.ok(page.entries.every((entry) => entry.available));
    } finally {
      await metadata?.cancelAll();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'fila real consulta por item, baixa vídeo e MP3 em sequência e limpa temporários identificados',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-queue-real-'));
    let queue, metadata;
    try {
      const video = join(root, 'video.webm'),
        audio = join(root, 'audio.webm');
      await runProcess(tools.ffmpeg, [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=160x90:r=10',
        '-t',
        '0.5',
        '-c:v',
        'libvpx-vp9',
        video,
      ]);
      await runProcess(tools.ffmpeg, [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '0.5',
        '-c:a',
        'libopus',
        audio,
      ]);
      const urls = ['BaW_jenozKc', 'aqz-KE-bpKQ'].map(
          (id) => `https://www.youtube.com/watch?v=${id}`,
        ),
        manifests = new Map();
      for (let i = 0; i < urls.length; i++) {
        const path = join(root, `info-${i}.json`);
        manifests.set(urls[i], path);
        await writeFile(
          path,
          JSON.stringify({
            id: new URL(urls[i]).searchParams.get('v'),
            title: `Mídia local ${i + 1}`,
            extractor: 'generic',
            extractor_key: 'Generic',
            webpage_url: urls[i],
            duration: 0.5,
            formats: [
              {
                format_id: '137',
                url: pathToFileURL(video).href,
                ext: 'webm',
                vcodec: 'vp9',
                acodec: 'none',
                height: 90,
                fps: 10,
              },
              {
                format_id: '251',
                url: pathToFileURL(audio).href,
                ext: 'webm',
                vcodec: 'none',
                acodec: 'opus',
                abr: 128,
              },
            ],
          }),
        );
      }
      const analyzed = [],
        events = [];
      const runner = (executable, args, options) => {
        const url = args.at(-1);
        if (args.includes('--dump-single-json')) analyzed.push(url);
        return runProcess(
          executable,
          [
            ...args.slice(0, args.lastIndexOf('--')),
            '--enable-file-urls',
            '--load-info-json',
            manifests.get(url),
          ],
          options,
        );
      };
      metadata = new MetadataService(tools, () => {}, runner);
      const recovery = new RecoveryStore(join(root, 'recoveries.json'));
      const downloader = new Downloader(tools, () => {}, runner, recovery);
      queue = new QueueManager(
        join(root, 'queue.json'),
        {
          analyze: (url, signal) => metadata.analyze(url, signal),
          download: (info, request, destination, itemId, onEvent) =>
            downloader.download(info, request, destination, { itemId, onEvent }),
          cancelDownload: () => downloader.cancel(),
          cleanItem: async () => {},
        },
        () => {},
        (event) => events.push(event),
      );
      await queue.add(
        [{ url: urls[0] }],
        {
          kind: 'video',
          videoMode: 'original',
          audioMode: 'original',
          quality: { height: 720, fps: 30 },
        },
        root,
      );
      await queue.add(
        [{ url: urls[1] }],
        { kind: 'audio', videoMode: 'compatible', audioMode: 'mp3' },
        root,
      );
      await queue.start();
      await until(() => !queue.busy && queue.snapshot().mode === 'paused');
      const state = queue.snapshot();
      assert.ok(
        state.items.every((item) => item.status === 'completed'),
        JSON.stringify(state.items),
      );
      assert.deepEqual(analyzed, urls);
      assert.ok(events.some((event) => event.track === 'video'));
      assert.ok(events.some((event) => event.track === 'audio'));
      assert.ok(events.every((event) => !!event.itemId));
      assert.deepEqual(await recovery.list(), []);
      assert.ok(!(await readdir(root)).some((name) => name.startsWith('.vora-')));
      const codecs = [];
      for (const item of state.items) {
        assert.equal((await stat(item.result.path)).size, item.result.size);
        codecs.push(
          JSON.parse(
            await runProcess(tools.ffprobe, [
              '-v',
              'error',
              '-show_streams',
              '-of',
              'json',
              item.result.path,
            ]),
          ).streams.map((stream) => stream.codec_name),
        );
      }
      assert.deepEqual(codecs, [['vp9', 'opus'], ['mp3']]);
    } finally {
      await queue?.shutdown();
      await metadata?.cancelAll();
      await rm(root, { recursive: true, force: true });
    }
  },
);
