import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROGRESS_ARGUMENTS, parseProgress, TransferTracker } from '../electron/progress.ts';
import { parseVideo } from '../electron/media.ts';

const exec = promisify(execFile);
const tools = resolve('resources/tools', process.platform === 'win32' ? 'win-x64' : 'linux-x64');
const tool = (name) => join(tools, name + (process.platform === 'win32' ? '.exe' : ''));
test(
  'binários reais: download local e conversão MP3, áudio original e mux sem reconversão',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-media-'));
    try {
      const source = join(root, 'Vídeo com espaços.webm');
      await exec(tool('ffmpeg'), [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=160x90:r=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '0.5',
        '-c:v',
        'libvpx-vp9',
        '-c:a',
        'libopus',
        source,
      ]);
      const output = join(root, 'saída');
      await mkdir(output);
      const download = await exec(tool('yt-dlp'), [
        '--ignore-config',
        '--enable-file-urls',
        '--no-playlist',
        '--progress',
        '--newline',
        '--no-simulate',
        ...PROGRESS_ARGUMENTS,
        '--print',
        'after_move:VORA_FILE:%(filepath)s',
        '--ffmpeg-location',
        tool('ffmpeg'),
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '-o',
        join(output, 'Áudio.%(ext)s'),
        '--',
        pathToFileURL(source).href,
      ]);
      const lines = (download.stdout + '\n' + download.stderr).split(/\r?\n/);
      const events = lines.map(parseProgress).filter(Boolean);
      assert.ok(
        events.some((event) => event.stage === 'downloading' && event.percent !== undefined),
        'yt-dlp deve emitir progresso estruturado com percentual real',
      );
      assert.ok(
        events.some((event) => event.stage === 'converting'),
        'a conversão deve ser identificada pelo postprocessador real',
      );
      assert.ok(
        lines
          .filter((line) => line.startsWith('VORA_PROGRESS:'))
          .every((line) => line.length < 2048),
        'o progresso não deve incluir os metadados completos do vídeo',
      );
      assert.deepEqual(await readdir(output), ['Áudio.mp3']);
      const mp3 = JSON.parse(
        (
          await exec(tool('ffprobe'), [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            join(output, 'Áudio.mp3'),
          ])
        ).stdout,
      );
      assert.equal(mp3.streams.length, 1);
      assert.equal(mp3.streams[0].codec_name, 'mp3');
      await exec(tool('ffmpeg'), [
        '-v',
        'error',
        '-i',
        source,
        '-vn',
        '-c:a',
        'copy',
        join(output, 'Original.opus'),
      ]);
      const original = JSON.parse(
        (
          await exec(tool('ffprobe'), [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            join(output, 'Original.opus'),
          ])
        ).stdout,
      );
      assert.equal(original.streams[0].codec_name, 'opus');
      await exec(tool('ffmpeg'), [
        '-v',
        'error',
        '-i',
        source,
        '-c',
        'copy',
        join(output, 'Vídeo.mkv'),
      ]);
      const video = JSON.parse(
        (
          await exec(tool('ffprobe'), [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            join(output, 'Vídeo.mkv'),
          ])
        ).stdout,
      );
      assert.deepEqual(
        video.streams.map((stream) => stream.codec_name),
        ['vp9', 'opus'],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'yt-dlp real identifica vídeo e áudio separados e o progresso preserva ambas as faixas',
  { timeout: 60_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-separate-media-'));
    try {
      const video = join(root, 'video.webm'),
        audio = join(root, 'audio.webm');
      await exec(tool('ffmpeg'), [
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
      await exec(tool('ffmpeg'), [
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
      const raw = {
        id: 'BaW_jenozKc',
        title: 'Faixas separadas',
        extractor: 'generic',
        extractor_key: 'Generic',
        webpage_url: pathToFileURL(video).href,
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
      };
      const manifest = join(root, 'info.json');
      await writeFile(manifest, JSON.stringify(raw));
      const output = await exec(tool('yt-dlp'), [
        '--ignore-config',
        '--enable-file-urls',
        '--ffmpeg-location',
        tool('ffmpeg'),
        '--progress',
        '--newline',
        '--no-simulate',
        ...PROGRESS_ARGUMENTS,
        '--print',
        'after_move:VORA_FILE:%(filepath)s',
        '-f',
        '137+251',
        '--merge-output-format',
        'webm',
        '-o',
        join(root, 'final.%(ext)s'),
        '--load-info-json',
        manifest,
      ]);
      const parsed = (output.stdout + '\n' + output.stderr)
        .split(/\r?\n/)
        .map(parseProgress)
        .filter(Boolean);
      assert.ok(parsed.some((event) => event.formatId === '137'));
      assert.ok(parsed.some((event) => event.formatId === '251'));
      const info = parseVideo(raw, 'https://www.youtube.com/watch?v=BaW_jenozKc');
      const tracker = new TransferTracker(info, {
        videoId: info.id,
        kind: 'video',
        videoMode: 'original',
        audioMode: 'original',
        optionId: 'o-137',
      });
      const events = parsed.map((event) => tracker.event(event));
      assert.ok(events.some((event) => event.track === 'video'));
      assert.ok(
        events.some((event) => event.track === 'audio' && event.transfers[0].status === 'complete'),
      );
      assert.ok(events.at(-1).transfers.every((transfer) => transfer.status === 'complete'));
      const final = JSON.parse(
        (
          await exec(tool('ffprobe'), [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            join(root, 'final.webm'),
          ])
        ).stdout,
      );
      assert.deepEqual(
        final.streams.map((stream) => stream.codec_name),
        ['vp9', 'opus'],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
