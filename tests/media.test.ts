import { test } from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, normalizeYouTubeUrl, parseVideo, type RawVideo } from '../electron/media';
import { downloadArguments } from '../electron/downloader';
import { parseProgress } from '../electron/progress';

export const raw: RawVideo = {
  id: 'BaW_jenozKc',
  title: 'Vídeo de teste com acentuação',
  channel: 'Canal de teste',
  duration: 10,
  formats: [
    {
      format_id: '137',
      ext: 'mp4',
      vcodec: 'avc1.640028',
      acodec: 'none',
      height: 1080,
      fps: 30,
      tbr: 2000,
      filesize: 10_000,
    },
    {
      format_id: '399',
      ext: 'mp4',
      vcodec: 'av01',
      acodec: 'none',
      height: 1080,
      fps: 30,
      tbr: 1800,
    },
    {
      format_id: '248',
      ext: 'webm',
      vcodec: 'vp9',
      acodec: 'none',
      height: 2160,
      fps: 60,
      tbr: 5000,
    },
    {
      format_id: '22',
      ext: 'mp4',
      vcodec: 'avc1',
      acodec: 'mp4a.40.2',
      height: 720,
      fps: 30,
      tbr: 1200,
    },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 1000 },
    { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', abr: 160 },
    { format_id: 'drm', ext: 'mp4', vcodec: 'avc1', acodec: 'none', height: 4320, has_drm: true },
  ],
};
const url = 'https://www.youtube.com/watch?v=BaW_jenozKc';
test('normaliza vídeos, Shorts e links com contexto de playlist sem incluir a playlist', () => {
  for (const input of [
    'https://youtu.be/BaW_jenozKc?t=2',
    'https://m.youtube.com/shorts/BaW_jenozKc',
    url + '&list=PL123',
  ])
    assert.equal(normalizeYouTubeUrl(input), url);
});
test('rejeita hosts parecidos, credenciais, protocolos e entradas sem vídeo', () => {
  for (const input of [
    'https://youtube.com.evil.test/watch?v=BaW_jenozKc',
    'https://youtube.com@evil.test/watch?v=BaW_jenozKc',
    'file:///etc/passwd',
    '--exec=evil',
    'https://youtube.com/playlist?list=x',
    'https://youtube.com/watch?v=short',
    'https://youtube.com:444/watch?v=BaW_jenozKc',
  ])
    assert.throws(() => normalizeYouTubeUrl(input));
});
test('qualidade compatível exige H264/AAC; original preserva codecs e escolhe container correto', () => {
  const video = parseVideo(raw, url);
  assert.deepEqual(
    video.compatible.map((v) => v.height),
    [1080, 720],
  );
  assert.equal(video.compatible[0].videoId, '137');
  assert.equal(video.compatible[0].audioId, '140');
  assert.equal(video.compatible[0].estimatedSize, 11_000);
  assert.deepEqual(
    video.original.map((v) => v.height),
    [2160, 1080, 720],
  );
  assert.equal(video.original[0].container, 'webm');
  assert.equal(video.original[1].container, 'mkv');
  assert.equal(video.audio?.id, '251');
});
test('não oferece MP4 compatível com áudio Opus nem vídeo sem faixa de áudio', () => {
  const video = parseVideo(
    { ...raw, formats: raw.formats!.filter((f) => f.format_id !== '140' && f.format_id !== '22') },
    url,
  );
  assert.equal(video.compatible.length, 0);
  assert.throws(() => parseVideo({ ...raw, formats: [raw.formats![0]] }, url), /Nenhum formato/);
});
test('distingue FPS da mesma resolução e exclui lives e thumbnails externos', () => {
  const video = parseVideo(
    {
      ...raw,
      thumbnail: 'https://evil.test/image.png',
      formats: [...raw.formats!, { ...raw.formats![0], format_id: '299', fps: 60 }],
    },
    url,
  );
  assert.equal(video.thumbnail, undefined);
  assert.ok(video.compatible.some((v) => v.label === '1080p · 60 fps'));
  assert.throws(() => parseVideo({ ...raw, is_live: true }, url), /Lives/);
});
test('seleção de download usa apenas IDs analisados e não reconverte vídeo', () => {
  const video = parseVideo(raw, url);
  const base = {
    videoId: raw.id,
    kind: 'video' as const,
    videoMode: 'compatible' as const,
    audioMode: 'original' as const,
    optionId: 'c-137',
  };
  const args = downloadArguments(video, base);
  assert.deepEqual(args.slice(0, 2), ['-f', '137+140']);
  assert.ok(!args.includes('--recode-video'));
  assert.throws(() => downloadArguments(video, { ...base, optionId: '--exec' }));
  assert.throws(() => downloadArguments(video, { ...base, videoId: 'outro' }));
  assert.ok(downloadArguments(video, { ...base, kind: 'audio', audioMode: 'mp3' }).includes('mp3'));
  assert.deepEqual(downloadArguments(video, { ...base, kind: 'audio' }), ['-f', '251']);
});
test('progresso desconhecido fica indeterminado; conversão não inventa percentual', () => {
  assert.deepEqual(
    parseProgress('VORA_PROGRESS:{"downloaded_bytes":50,"total_bytes":100,"speed":20,"eta":2}'),
    { type: 'progress', stage: 'downloading', percent: 50, speed: 20, eta: 2 },
  );
  assert.equal((parseProgress('VORA_PROGRESS:{"downloaded_bytes":50}') as any).percent, undefined);
  assert.equal((parseProgress('[ExtractAudio] Destination: a.mp3') as any).stage, 'converting');
  assert.equal(parseProgress('VORA_PROGRESS:not-json'), undefined);
  assert.deepEqual(parseProgress('VORA_POST:{"postprocessor":"MoveFiles","status":"started"}'), {
    type: 'progress',
    stage: 'saving',
  });
  assert.deepEqual(parseProgress('VORA_POST:{"postprocessor":"ExtractAudio","status":"started"}'), {
    type: 'progress',
    stage: 'converting',
  });
  assert.equal(parseProgress('unrelated line'), undefined);
});
test('traduz erros comuns sem expor comandos ao usuário', () => {
  assert.match(friendlyError('HTTP 403'), /recusou/);
  assert.match(friendlyError('EACCES'), /permissão/);
  assert.match(friendlyError('No space left on device'), /espaço/);
  assert.match(friendlyError('Requested format is not available'), /Analise/);
});
