import { failureReason } from './failures';
import type { VideoInfo, VideoOption } from '../shared/types';

export interface RawFormat {
  format_id: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
  has_drm?: boolean;
}
export interface RawVideo {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  live_status?: string;
  is_live?: boolean;
  formats?: RawFormat[];
}

export function normalizeYouTubeUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2048)
    throw new Error('Informe um link válido do YouTube.');
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Informe um link válido do YouTube.');
  }
  const host = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Informe um link válido do YouTube.');
  }
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
  ) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    throw new Error('Use o link de um vídeo ou Short do YouTube, não de uma playlist ou canal.');
  return `https://www.youtube.com/watch?v=${id}`;
}

const size = (f: RawFormat) => f.filesize ?? f.filesize_approx;
const hasVideo = (f: RawFormat) => !!f.vcodec && f.vcodec !== 'none' && !!f.height;
const hasAudio = (f: RawFormat) => !!f.acodec && f.acodec !== 'none';
const avc = (f: RawFormat) => /^(avc|h264)/i.test(f.vcodec ?? '');
const aac = (f: RawFormat) => /^(mp4a|aac)/i.test(f.acodec ?? '');

export function parseVideo(raw: RawVideo, url: string): VideoInfo {
  if (raw.is_live || ['is_live', 'is_upcoming', 'post_live'].includes(raw.live_status ?? '')) {
    throw new Error(
      'Lives em andamento ou ainda em processamento não estão disponíveis nesta versão.',
    );
  }
  if (!raw.id || typeof raw.title !== 'string')
    throw new Error('Não foi possível interpretar os dados do vídeo.');
  const formats = (raw.formats ?? []).filter((f) => !f.has_drm && /^[\w.-]+$/.test(f.format_id));
  const audios = formats
    .filter((f) => !hasVideo(f) && hasAudio(f))
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0));
  const bestAudio = audios[0];
  const aacAudio = audios.find(aac);
  const buildOptions = (compatible: boolean): VideoOption[] => {
    const groups = new Map<string, RawFormat[]>();
    for (const f of formats.filter(hasVideo)) {
      if (compatible && (!avc(f) || f.ext !== 'mp4' || (hasAudio(f) ? !aac(f) : !aacAudio)))
        continue;
      if (!hasAudio(f) && !bestAudio) continue;
      const key = `${f.height}-${Math.round(f.fps ?? 30)}`;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    return [...groups.values()]
      .map((group) => {
        const f = group.sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0];
        const audio = hasAudio(f) ? undefined : compatible ? aacAudio : bestAudio;
        const container: VideoOption['container'] = compatible
          ? 'mp4'
          : f.ext === 'mp4' && (!audio || ['m4a', 'mp4'].includes(audio.ext ?? ''))
            ? 'mp4'
            : f.ext === 'webm' && (!audio || audio.ext === 'webm')
              ? 'webm'
              : 'mkv';
        const fps = Math.round(f.fps ?? 30);
        const multiFps = [...groups.values()].some(
          (g) => g[0].height === f.height && Math.round(g[0].fps ?? 30) !== fps,
        );
        const videoSize = size(f),
          audioSize = audio ? size(audio) : 0;
        return {
          id: `${compatible ? 'c' : 'o'}-${f.format_id}`,
          label: `${f.height}p${multiFps ? ` · ${fps} fps` : ''}`,
          height: f.height!,
          fps,
          container,
          videoId: f.format_id,
          audioId: audio?.format_id,
          estimatedSize:
            videoSize !== undefined && audioSize !== undefined ? videoSize + audioSize : undefined,
        };
      })
      .sort((a, b) => b.height - a.height || b.fps - a.fps);
  };
  let thumbnail: string | undefined;
  try {
    const t = new URL(raw.thumbnail ?? '');
    if (t.protocol === 'https:' && ['i.ytimg.com', 'img.youtube.com'].includes(t.hostname))
      thumbnail = t.href;
  } catch {
    /* optional */
  }
  const compatible = buildOptions(true),
    original = buildOptions(false);
  if (!original.length && !bestAudio)
    throw new Error('Nenhum formato de áudio ou vídeo disponível foi encontrado.');
  return {
    id: raw.id,
    url,
    title: raw.title,
    channel: raw.channel ?? raw.uploader ?? 'YouTube',
    duration: raw.duration ?? 0,
    thumbnail,
    compatible,
    original,
    audio: bestAudio
      ? {
          id: bestAudio.format_id,
          extension: bestAudio.ext ?? 'webm',
          bitrate: bestAudio.abr,
          estimatedSize: size(bestAudio),
        }
      : undefined,
  };
}

export function friendlyError(raw: string): string {
  if (/DESTINATION_NOT_FOUND/.test(raw))
    return 'A pasta de destino não existe mais. Escolha outra pasta para salvar o arquivo.';
  if (/403|429|sign in|bot|cookies|PO Token/i.test(raw))
    return 'O YouTube recusou esta solicitação. Tente novamente mais tarde; se persistir, atualize as ferramentas do aplicativo.';
  if (/requested format|format is not available/i.test(raw))
    return 'Esse formato deixou de estar disponível. Analise o link novamente.';
  if (/private|unavailable|removed|not available|members.only|age.restricted/i.test(raw))
    return 'Este vídeo está indisponível ou exige acesso autenticado, que esta versão não oferece.';
  if (/ENOSPC|No space left/i.test(raw))
    return 'Não há espaço suficiente no disco. Libere espaço e tente novamente.';
  if (/EACCES|EPERM|permission denied|read.only/i.test(raw))
    return 'Sem permissão para gravar nessa pasta. Escolha outra pasta de destino.';
  if (failureReason(raw) === 'network' || /network|resolve/i.test(raw))
    return 'Não foi possível conectar ao YouTube. Verifique a conexão e tente novamente.';
  if (/ENOENT/i.test(raw))
    return 'Uma ferramenta do aplicativo não foi encontrada. Prepare os binários ou reinstale o Vora.';
  return 'Não foi possível concluir a operação. Tente novamente ou analise o link de novo.';
}
