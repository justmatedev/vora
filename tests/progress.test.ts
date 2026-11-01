import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgress, TransferTracker } from '../electron/progress';
import type { DownloadRequest, VideoInfo } from '../shared/types';
const info = {
  compatible: [{ id: 'c', videoId: '137', audioId: '140' }],
  original: [{ id: 'o', videoId: '22' }],
  audio: { id: '251' },
} as VideoInfo;
const request: DownloadRequest = {
  videoId: '',
  kind: 'video',
  videoMode: 'compatible',
  audioMode: 'original',
  optionId: 'c',
};
const line = (id: string, percent?: number, status = 'downloading') =>
  `VORA_PROGRESS:${JSON.stringify({ format_id: id, progress: { status, downloaded_bytes: percent, total_bytes: 100 } })}`;
test('áudio e vídeo têm percentuais independentes, sem regredir a faixa concluída', () => {
  const tracker = new TransferTracker(info, request);
  const video = tracker.event(parseProgress(line('137', 100, 'finished'))!);
  const audio = tracker.event(parseProgress(line('140', 10))!);
  assert.equal(video.track, 'video');
  assert.equal(audio.track, 'audio');
  assert.deepEqual(
    audio.transfers?.map((t) => [t.kind, t.status, t.percent]),
    [
      ['video', 'complete', 100],
      ['audio', 'downloading', 10],
    ],
  );
  assert.equal(video.transfers?.[1].status, 'waiting');
  const merging = tracker.event(parseProgress('VORA_POST:{"postprocessor":"Merger"}')!);
  assert.ok(merging.transfers?.every((t) => t.status === 'complete'));
  assert.equal(merging.percent, undefined);
});
test('vídeo já combinado tem uma única faixa; áudio não exibe uma faixa de vídeo', () => {
  const combined = new TransferTracker(info, { ...request, videoMode: 'original', optionId: 'o' });
  assert.equal(combined.event(parseProgress(line('22', 25))!).track, 'combined');
  assert.equal(combined.event(parseProgress(line('22', 25))!).transfers?.length, 1);
  const audio = new TransferTracker(info, { ...request, kind: 'audio' });
  const event = audio.event(parseProgress(line('251', undefined))!);
  assert.equal(event.track, 'audio');
  assert.equal(event.percent, undefined);
  assert.equal(event.transfers?.length, 1);
});
test('identifica formato pelo nome como fallback, mas não inventa progresso para um ID desconhecido', () => {
  const tracker = new TransferTracker(info, request);
  const known = tracker.event(
    parseProgress(
      'VORA_PROGRESS:' +
        JSON.stringify({
          filename: 'C:\\Vídeos com espaços\\vídeo.f140.m4a',
          downloaded_bytes: 5,
          total_bytes: 10,
        }),
    )!,
  );
  assert.equal(known.track, 'audio');
  const unknown = tracker.event(parseProgress(line('unknown', 50))!);
  assert.equal(unknown.track, undefined);
  assert.equal(unknown.transfers?.[0].status, 'waiting');
});
