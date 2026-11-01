export interface YouTubeSource {
  kind: 'video' | 'playlist' | 'mixed';
  videoUrl?: string;
  playlistUrl?: string;
  playlistError?: string;
}
export function youtubeSource(input: unknown): YouTubeSource {
  if (typeof input !== 'string' || input.length > 2048)
    throw new Error('Informe um link válido do YouTube.');
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Informe um link válido do YouTube.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(
      url.hostname,
    )
  )
    throw new Error('Informe um link válido do YouTube.');
  let videoId =
    url.hostname === 'youtu.be'
      ? url.pathname.split('/')[1]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : /^\/(shorts|embed|live)\//.test(url.pathname)
          ? url.pathname.split('/')[2]
          : undefined;
  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) videoId = undefined;
  const list =
    url.pathname === '/watch' || url.pathname === '/playlist' || url.hostname === 'youtu.be'
      ? url.searchParams.get('list')
      : null;
  let playlistError: string | undefined;
  if (list && (!/^[A-Za-z0-9_-]{10,150}$/.test(list) || /^(RD|UL|UU|WL$|LL$)/.test(list)))
    playlistError =
      'Use uma playlist pública finita. Mixes, listas automáticas e listas que exigem login não são suportados.';
  if (!videoId && (!list || playlistError))
    throw new Error(
      playlistError ?? 'Use o link de um vídeo, Short ou playlist pública do YouTube.',
    );
  return {
    kind: videoId && list ? 'mixed' : videoId ? 'video' : 'playlist',
    ...(videoId ? { videoUrl: `https://www.youtube.com/watch?v=${videoId}` } : {}),
    ...(list && !playlistError
      ? { playlistUrl: `https://www.youtube.com/playlist?list=${list}` }
      : {}),
    ...(playlistError ? { playlistError } : {}),
  };
}
