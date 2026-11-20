import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat, realpath, open, unlink } from 'node:fs/promises';
import { basename, join, isAbsolute } from 'node:path';
import { runProcess } from './processes';
import type { ToolPaths } from './downloader';
import type {
  SourceSelection,
  SourceRecord,
  DestinationSelection,
  LocalMedia,
} from '../shared/transcription-types';

export async function inspectLocalMedia(
  path: string,
  tools: Pick<ToolPaths, 'ffprobe'>,
  signal: AbortSignal,
  run: typeof runProcess = runProcess,
): Promise<LocalMedia> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw new Error('Selecione um arquivo local válido.');
  const output = await run(
    tools.ffprobe,
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-show_entries',
      'format=duration,format_name:stream=index,codec_type,duration:stream_disposition=default',
      '-of',
      'json',
      '-i',
      path,
    ],
    { signal, timeout: 60000, maxOutput: 1024 * 1024 },
  );
  let raw: {
    format?: { format_name?: string; duration?: string };
    streams?: {
      index: number;
      codec_type: string;
      duration?: string;
      disposition?: { default?: number };
    }[];
  };
  try {
    raw = JSON.parse(output);
  } catch {
    throw new Error('Não foi possível analisar o arquivo de mídia.');
  }
  if (
    !raw ||
    !raw.format?.format_name ||
    raw.format.format_name
      .split(',')
      .some((f) => ['hls', 'dash', 'concat', 'sdp', 'rtsp', 'm3u8', 'image2'].includes(f))
  )
    throw new Error(
      'Playlists e fontes de rede não são aceitas. Escolha um arquivo de áudio ou vídeo local.',
    );
  const audios = Array.isArray(raw.streams)
    ? raw.streams.filter((s) => s.codec_type === 'audio')
    : [];
  const audio = audios.find((s) => s.disposition?.default === 1) ?? audios[0];
  if (!audio || !Number.isInteger(audio.index) || audio.index < 0)
    throw new Error('O arquivo não contém uma faixa de áudio válida.');
  const duration = Number(raw.format.duration ?? audio.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Não foi possível determinar a duração do áudio.');
  return { durationMs: Math.ceil(duration * 1000), audioStreamIndex: audio.index };
}
export async function revalidateSource(source: SourceRecord): Promise<void> {
  try {
    const info = await stat(source.path);
    const canonical = await realpath(source.path);
    if (
      !info.isFile() ||
      canonical !== source.path ||
      info.size !== source.size ||
      info.mtimeMs !== source.mtimeMs ||
      String(info.dev) !== source.device ||
      String(info.ino) !== source.inode
    )
      throw new Error();
    await access(source.path, constants.R_OK);
  } catch {
    throw new Error(`O arquivo "${source.name}" foi movido ou alterado. Selecione-o novamente.`);
  }
}
export async function writableDirectory(path: string): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw new Error('Escolha uma pasta de saída válida.');
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error('Escolha uma pasta de saída válida.');
  const probe = join(canonical, `.vora-write-${randomUUID()}`);
  try {
    const file = await open(probe, 'wx');
    await file.close();
    await unlink(probe);
  } catch {
    throw new Error('Sem permissão para gravar nessa pasta. Escolha outra pasta de saída.');
  }
  return canonical;
}
export class SourceRegistry {
  private sources = new Map<string, SourceRecord>();
  private destinations = new Map<string, string>();
  constructor(
    private tools: Pick<ToolPaths, 'ffprobe'>,
    private inspect: typeof inspectLocalMedia = inspectLocalMedia,
  ) {}
  async register(paths: string[], origin: 'local' | 'download'): Promise<SourceSelection[]> {
    const records: SourceRecord[] = [];
    for (const path of paths) {
      if (typeof path !== 'string' || !isAbsolute(path))
        throw new Error('Selecione um arquivo local válido.');
      try {
        const canonical = await realpath(path),
          info = await stat(canonical);
        if (!info.isFile()) throw new Error('Não é um arquivo de mídia.');
        await access(canonical, constants.R_OK);
        const media = await this.inspect(canonical, this.tools, new AbortController().signal);
        const record: SourceRecord = {
          id: randomUUID(),
          name: basename(path),
          path: canonical,
          size: info.size,
          mtimeMs: info.mtimeMs,
          device: String(info.dev),
          inode: String(info.ino),
          origin,
          ...media,
        };
        await revalidateSource(record);
        records.push(record);
      } catch (error) {
        throw new Error(`${basename(path)}: ${(error as Error).message}`);
      }
    }
    for (const record of records) this.sources.set(record.id, record);
    return records.map(({ id, name, size, durationMs, origin }) => ({
      id,
      name,
      size,
      durationMs,
      origin,
    }));
  }
  async resolve(id: string): Promise<SourceRecord> {
    const record = this.sources.get(id);
    if (!record) throw new Error('Seleção de arquivo inválida. Selecione novamente.');
    await revalidateSource(record);
    return structuredClone(record);
  }
  async chooseDestination(path: string): Promise<DestinationSelection> {
    const canonical = await writableDirectory(path),
      id = randomUUID();
    this.destinations.set(id, canonical);
    return { id, path: canonical };
  }
  async resolveDestination(id: string): Promise<string> {
    const path = this.destinations.get(id);
    if (!path) throw new Error('Selecione a pasta de saída novamente.');
    return writableDirectory(path);
  }
}
