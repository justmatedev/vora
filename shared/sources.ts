import { youtubeSource, type YouTubeSource } from './youtube';

export type SourcePlatform = 'youtube' | 'instagram';
export type MediaSource = YouTubeSource & { platform: SourcePlatform };

export function sourceTitle(title: string, platform: SourcePlatform): string {
  const generic = platform === 'instagram' && /^Video by @?([A-Za-z0-9_.]{1,30})$/.exec(title);
  return generic ? `Reel de @${generic[1]}` : title;
}

export function mediaSource(input: unknown): MediaSource {
  if (typeof input !== 'string' || input.length > 2048)
    throw new Error('Informe um link válido do YouTube ou de um Reel público do Instagram.');
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Informe um link válido do YouTube ou de um Reel público do Instagram.');
  }
  if (['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
    const match = /^\/(?:reel|reels)\/([A-Za-z0-9_-]{1,100})\/?$/.exec(url.pathname);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      !match
    )
      throw new Error(
        'Use o link de um Reel público do Instagram. Fotos, carrosséis, Stories e perfis não são suportados.',
      );
    return {
      platform: 'instagram',
      kind: 'video',
      videoUrl: `https://www.instagram.com/reel/${match[1]}/`,
    };
  }
  return { ...youtubeSource(input), platform: 'youtube' };
}

export function normalizeMediaUrl(input: unknown): string {
  const source = mediaSource(input);
  if (!source.videoUrl)
    throw new Error('Use o link de um vídeo, Short ou Reel público, sem playlist.');
  return source.videoUrl;
}

export function sourceVideoId(url: string): string {
  const source = mediaSource(url);
  if (!source.videoUrl) throw new Error('Link sem vídeo.');
  const parsed = new URL(source.videoUrl);
  return source.platform === 'instagram'
    ? parsed.pathname.split('/')[2]
    : parsed.searchParams.get('v')!;
}

export function safeThumbnail(input: unknown, platform: SourcePlatform): string | undefined {
  if (typeof input !== 'string') return;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return;
    const allowed =
      platform === 'youtube'
        ? ['i.ytimg.com', 'img.youtube.com'].includes(url.hostname)
        : ['cdninstagram.com', 'fbcdn.net'].some(
            (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
          );
    if (allowed) return url.href;
  } catch {
    /* Thumbnail is optional. */
  }
}

export const REEL_COMPATIBILITY_MESSAGE =
  'MP4 compatível indisponível para este Reel. Selecione Original para continuar.';
