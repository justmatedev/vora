import { normalizeYouTubeUrl, parseVideo, friendlyError, type RawVideo } from './media';
import { failureReason, MediaError } from './failures';
import { youtubeSource } from '../shared/youtube';
import { CancelledError, runProcess } from './processes';
import type { PlaylistEntry, PlaylistPage, PlaylistSummary, QueuePreview } from '../shared/types';
import type { ToolPaths } from './downloader';

/** Inherited by the Electron executable that yt-dlp launches as its Node runtime. */
export function toolEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_OPTIONS: undefined,
    NODE_PATH: undefined,
  };
}

export function commonToolArgs(tools: ToolPaths) {
  return [
    '--ignore-config',
    '--encoding',
    'utf-8',
    '--no-colors',
    '--no-warnings',
    '--socket-timeout',
    '25',
    '--retries',
    '2',
    '--no-js-runtimes',
    '--js-runtimes',
    `node:${tools.node}`,
    '--ffmpeg-location',
    tools.ffmpeg,
  ];
}
export function parsePlaylistEntry(raw: Record<string, unknown>, index: number): PlaylistEntry {
  let url: string | undefined;
  try {
    url = normalizeYouTubeUrl(
      typeof raw.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(raw.id)
        ? `https://www.youtube.com/watch?v=${raw.id}`
        : (raw.url ?? raw.webpage_url),
    );
  } catch {
    /* unavailable entry */
  }
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title
      : url
        ? `Vídeo ${new URL(url).searchParams.get('v')}`
        : 'Vídeo indisponível';
  const available =
    !!url &&
    !/^(\[?private video\]?|\[?deleted video\]?|vídeo indisponível)$/i.test(title) &&
    !['private', 'needs_auth', 'premium_only', 'subscriber_only'].includes(
      String(raw.availability),
    );
  return {
    index,
    title,
    ...(url ? { url } : {}),
    available,
    ...(typeof raw.duration === 'number' && Number.isFinite(raw.duration) && raw.duration >= 0
      ? { duration: raw.duration }
      : {}),
  };
}
interface Listing {
  summary: PlaylistSummary;
  entries: PlaylistEntry[];
  controller: AbortController;
  finished: Promise<void>;
}
export class MetadataService {
  get listingBusy() {
    return [...this.listings.values()].some((listing) => listing.summary.state === 'loading');
  }
  private listings = new Map<string, Listing>();
  private queries = new Map<AbortController, Promise<void>>();
  private previews = new Map<string, { info: QueuePreview; at: number }>();
  cachedPreview(url: string) {
    const cached = this.previews.get(url);
    if (cached && Date.now() - cached.at < 10 * 60_000) return structuredClone(cached.info);
    this.previews.delete(url);
  }
  private remember(url: string, info: QueuePreview) {
    this.previews.delete(url);
    this.previews.set(url, { info, at: Date.now() });
    if (this.previews.size > 500) {
      const oldest = this.previews.keys().next().value!;
      this.previews.delete(oldest);
    }
    return structuredClone(info);
  }
  async preview(input: string, signal?: AbortSignal): Promise<QueuePreview> {
    const url = normalizeYouTubeUrl(input);
    if (signal?.aborted) throw new CancelledError();
    const cached = this.cachedPreview(url);
    if (cached) return cached;
    const raw = await this.query(url, signal, true);
    let thumbnail: string | undefined;
    try {
      const image = new URL(raw.thumbnail ?? '');
      if (
        image.protocol === 'https:' &&
        ['i.ytimg.com', 'img.youtube.com'].includes(image.hostname)
      )
        thumbnail = image.href;
    } catch {
      /* Thumbnail is optional. */
    }
    return this.remember(url, {
      title: raw.title,
      channel: raw.channel ?? raw.uploader,
      ...(typeof raw.duration === 'number' && raw.duration > 0 ? { duration: raw.duration } : {}),
      ...(thumbnail ? { thumbnail } : {}),
    });
  }
  constructor(
    private tools: ToolPaths,
    private emit: (event: PlaylistSummary) => void,
    private run = runProcess,
  ) {}
  title(url: string) {
    return this.cachedPreview(url)?.title;
  }
  async analyze(input: string, signal?: AbortSignal) {
    const url = normalizeYouTubeUrl(input);
    const info = parseVideo(await this.query(url, signal), url);
    this.remember(url, {
      title: info.title,
      channel: info.channel,
      duration: info.duration,
      thumbnail: info.thumbnail,
    });
    return info;
  }
  private async query(url: string, signal?: AbortSignal, lightweight = false): Promise<RawVideo> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let finished!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finished = resolve;
    });
    this.queries.set(controller, waiting);
    try {
      const data = await this.run(
        this.tools.ytdlp,
        [
          ...commonToolArgs(this.tools),
          '--no-playlist',
          '--dump-single-json',
          '--skip-download',
          ...(lightweight
            ? [
                '--ignore-no-formats-error',
                '--no-check-formats',
                '--no-js-runtimes',
                '--extractor-args',
                'youtube:player_skip=js,configs,initial_data;skip=hls,dash,translated_subs',
              ]
            : []),
          '--',
          url,
        ],
        {
          signal: controller.signal,
          timeout: lightweight ? 45_000 : 120_000,
          env: toolEnvironment(),
        },
      );
      if (controller.signal.aborted) throw new CancelledError();
      const raw = JSON.parse(data) as RawVideo;
      if (
        raw.id !== new URL(url).searchParams.get('v') ||
        typeof raw.title !== 'string' ||
        !raw.title.trim()
      )
        throw new Error('Não foi possível interpretar os dados do vídeo.');
      return raw;
    } catch (error) {
      if (error instanceof CancelledError || controller.signal.aborted) throw new CancelledError();
      const message = (error as Error).message;
      if (/Lives|Nenhum formato|interpretar/.test(message)) throw error;
      console.error('[Vora/análise]', message);
      throw new MediaError(friendlyError(message), failureReason(message));
    } finally {
      this.queries.delete(controller);
      finished();
      signal?.removeEventListener('abort', abort);
    }
  }
  start(input: string, id: string) {
    const url = youtubeSource(input).playlistUrl;
    if (!url) throw new Error('Informe um link de playlist pública.');
    if (!/^[A-Za-z0-9-]{20,80}$/.test(id) || this.listings.has(id))
      throw new Error('Consulta de playlist inválida.');
    if (this.listings.size >= 3)
      throw new Error('Feche a revisão anterior antes de consultar outra playlist.');
    const listing: Listing = {
      summary: { id, title: 'Playlist', count: 0, state: 'loading' },
      entries: [],
      controller: new AbortController(),
      finished: Promise.resolve(),
    };
    this.listings.set(id, listing);
    listing.finished = this.list(listing, url);
  }
  private async list(listing: Listing, url: string) {
    let lastSent = 0;
    const notify = () => this.emit({ ...listing.summary });
    try {
      await this.run(
        this.tools.ytdlp,
        [
          ...commonToolArgs(this.tools),
          '--yes-playlist',
          '--flat-playlist',
          '--lazy-playlist',
          '--dump-json',
          '--skip-download',
          '--',
          url,
        ],
        {
          signal: listing.controller.signal,
          env: toolEnvironment(),
          timeout: 15 * 60 * 1000,
          captureOutput: false,
          onLine: (line) => {
            if (!line.startsWith('{')) return;
            const raw = JSON.parse(line) as Record<string, unknown>;
            const entry = parsePlaylistEntry(raw, listing.entries.length + 1);
            listing.entries.push(entry);
            if (typeof raw.playlist_title === 'string') listing.summary.title = raw.playlist_title;
            listing.summary.count = listing.entries.length;
            if (Date.now() - lastSent > 100 || listing.entries.length === 1) {
              notify();
              lastSent = Date.now();
            }
          },
        },
      );
      listing.summary.state = 'complete';
    } catch (error) {
      listing.summary.state = listing.controller.signal.aborted ? 'cancelled' : 'error';
      if (listing.summary.state === 'error') {
        console.error('[Vora/playlist]', (error as Error).message);
        listing.summary.error =
          /playlist.*(does not exist|private|unavailable|not available)/i.test(
            (error as Error).message,
          )
            ? 'Esta playlist não existe ou não está acessível publicamente. Verifique o link.'
            : friendlyError((error as Error).message);
      }
    }
    notify();
  }
  page(id: string, page: number): PlaylistPage {
    const listing = this.get(id);
    if (
      !Number.isInteger(page) ||
      page < 0 ||
      page > Math.max(0, Math.ceil(listing.entries.length / 100) - 1)
    )
      throw new Error('Página de playlist inválida.');
    return structuredClone({
      ...listing.summary,
      page,
      entries: listing.entries.slice(page * 100, (page + 1) * 100),
    });
  }
  selected(id: string, indices: number[]) {
    const listing = this.get(id);
    if (listing.summary.state !== 'complete')
      throw new Error('Aguarde a consulta da playlist terminar.');
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      indices.length > listing.entries.length ||
      indices.some(
        (index) => !Number.isInteger(index) || index < 1 || index > listing.entries.length,
      )
    )
      throw new Error('Seleção de playlist inválida.');
    const selected = new Set(indices);
    const entries = listing.entries.filter((entry) => selected.has(entry.index));
    if (entries.some((entry) => !entry.available || !entry.url))
      throw new Error('A seleção contém vídeos indisponíveis.');
    return {
      label: listing.summary.title,
      entries: entries.map((entry) => ({ url: entry.url!, title: entry.title })),
    };
  }
  availableIndices(id: string) {
    if (this.get(id).summary.state !== 'complete') throw new Error('Aguarde a consulta terminar.');
    return this.get(id)
      .entries.filter((entry) => entry.available)
      .map((entry) => entry.index);
  }
  private get(id: string) {
    const listing = this.listings.get(id);
    if (!listing) throw new Error('Consulta de playlist não encontrada.');
    return listing;
  }
  async cancel(id: string) {
    const listing = this.get(id);
    listing.controller.abort();
    await listing.finished;
  }
  async dispose(id: string) {
    const listing = this.listings.get(id);
    if (!listing) return;
    listing.controller.abort();
    await listing.finished;
    this.listings.delete(id);
  }
  async cancelAll() {
    const queries = [...this.queries.entries()];
    queries.forEach(([controller]) => controller.abort());
    await Promise.all([
      ...queries.map(([, waiting]) => waiting),
      ...[...this.listings.keys()].map((id) => this.dispose(id)),
    ]);
  }
}
