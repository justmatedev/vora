import type { DownloadPreferences, VideoInfo, VideoOption } from './types';

export const DEFAULT_PREFERENCES: DownloadPreferences = {
  kind: 'video',
  videoMode: 'compatible',
  audioMode: 'original',
};

export function validPreferences(value: unknown): DownloadPreferences {
  const p = value as DownloadPreferences | undefined;
  if (
    !p ||
    !['video', 'audio'].includes(p.kind) ||
    !['compatible', 'original'].includes(p.videoMode) ||
    !['original', 'mp3'].includes(p.audioMode)
  )
    throw new Error('Preferências de download inválidas.');
  if (
    p.quality &&
    (!Number.isInteger(p.quality.height) ||
      p.quality.height < 1 ||
      p.quality.height > 32768 ||
      !Number.isFinite(p.quality.fps) ||
      p.quality.fps < 1 ||
      p.quality.fps > 1000)
  )
    throw new Error('Qualidade preferida inválida.');
  return {
    kind: p.kind,
    videoMode: p.videoMode,
    audioMode: p.audioMode,
    ...(p.quality ? { quality: { height: p.quality.height, fps: p.quality.fps } } : {}),
  };
}

export function preferredOption(options: VideoOption[], quality?: DownloadPreferences['quality']) {
  if (!quality) return options[0];
  const heights = [...new Set(options.map((option) => option.height))].sort((a, b) => b - a);
  const height = heights.find((height) => height <= quality.height) ?? heights.at(-1);
  return options
    .filter((option) => option.height === height)
    .sort((a, b) => Math.abs(a.fps - quality.fps) - Math.abs(b.fps - quality.fps))[0];
}

export function resolvePreferences(info: VideoInfo, preferences: DownloadPreferences) {
  const videoMode = info[preferences.videoMode].length
    ? preferences.videoMode
    : preferences.videoMode === 'compatible'
      ? 'original'
      : 'compatible';
  const kind =
    preferences.kind === 'audio'
      ? info.audio
        ? 'audio'
        : 'video'
      : info.original.length
        ? 'video'
        : 'audio';
  return {
    kind,
    videoMode,
    option: preferredOption(info[videoMode], preferences.quality),
  } as const;
}
