import {
  writeFile,
  readFile,
  link,
  open,
  lstat,
  unlink,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import type {
  TranscriptDocument,
  TranscriptFormat,
  TranscriptOutput,
} from '../shared/transcription-types';
import { writableDirectory } from './transcription-sources';
export class PartialTranscriptOutputError extends Error {
  constructor(
    message: string,
    public published: TranscriptOutput[],
  ) {
    super(message);
    this.name = 'PartialTranscriptOutputError';
  }
}
function timestamp(ms: number) {
  const n = Math.max(0, Math.floor(ms));
  return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')},${String(n % 1000).padStart(3, '0')}`;
}
export function serializeTranscript(doc: TranscriptDocument, format: TranscriptFormat): string {
  if (!['txt', 'srt'].includes(format) || !Number.isFinite(doc.durationMs) || doc.durationMs <= 0)
    throw new Error('Formato ou duração de transcrição inválido.');
  const segments = doc.segments
    .map((s) => ({
      startMs: Math.max(0, Math.min(doc.durationMs, s.startMs)),
      endMs: Math.max(0, Math.min(doc.durationMs, s.endMs)),
      text: s.text.replace(/\s+/g, ' ').trim(),
    }))
    .filter(
      (s) =>
        Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs && s.text,
    )
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!segments.length) throw new Error('Nenhum trecho de fala foi detectado neste arquivo.');
  return format === 'txt'
    ? segments.map((s) => s.text).join('\n') + '\n'
    : segments
        .map((s, i) => `${i + 1}\n${timestamp(s.startMs)} --> ${timestamp(s.endMs)}\n${s.text}\n`)
        .join('\n');
}
function safeStem(name: string) {
  const base = basename(name),
    extension = extname(base);
  let stem = base
    .slice(0, base.length - extension.length)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[ .]+$/g, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
  let short = '';
  for (const character of stem) {
    if (Buffer.byteLength(short + character) > 160) break;
    short += character;
  }
  return (short || 'arquivo') + '.transcricao';
}
async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function publishExact(source: string, target: string) {
  try {
    await link(source, target);
    return;
  } catch (error) {
    if (
      !['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      )
    )
      throw error;
  }
  const file = await open(target, 'wx');
  const identity = await file.stat();
  try {
    await file.writeFile(await readFile(source));
    await file.sync();
  } catch (error) {
    const current = await lstat(target).catch(() => null);
    if (current?.ino === identity.ino && current?.dev === identity.dev)
      await unlink(target).catch(() => {});
    throw error;
  } finally {
    await file.close();
  }
}
export async function publishTranscript(
  doc: TranscriptDocument,
  formats: TranscriptFormat[],
  destination: string,
  sourceName: string,
  onPublished: (output: TranscriptOutput) => Promise<void>,
  options: { sessionDirectory?: string; signal?: AbortSignal } = {},
): Promise<TranscriptOutput[]> {
  if (!formats.length || formats.some((f) => !['txt', 'srt'].includes(f)))
    throw new Error('Escolha um formato de saída válido.');
  const ordered = (['txt', 'srt'] as const).filter((f) => formats.includes(f));
  const canonical = await writableDirectory(destination);
  if (canonical !== resolve(destination))
    throw new Error('A pasta de saída foi alterada. Selecione novamente.');
  const standalone = !options.sessionDirectory;
  const stage = options.sessionDirectory
    ? join(options.sessionDirectory, 'export')
    : await mkdtemp(join(canonical, '.vora-output-'));
  await mkdir(stage, { recursive: true });
  const published: TranscriptOutput[] = [];
  try {
    for (const format of ordered)
      await writeFile(join(stage, `result.${format}`), serializeTranscript(doc, format), {
        flag: 'wx',
      });
    const stem = safeStem(sourceName);
    let selected: string | undefined;
    for (let index = 0; index < 10000; index++) {
      const candidate = stem + (index ? ` (${index})` : '');
      if (
        !(await Promise.all(ordered.map((f) => exists(join(canonical, `${candidate}.${f}`))))).some(
          Boolean,
        )
      ) {
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error('Não foi possível encontrar um nome livre para a transcrição.');
    for (const format of ordered) {
      options.signal?.throwIfAborted();
      const target = join(canonical, `${selected}.${format}`),
        source = join(stage, `result.${format}`);
      await publishExact(source, target);
      const output: TranscriptOutput = { format, path: target, size: (await lstat(target)).size };
      published.push(output);
      await onPublished(output);
    }
    return published;
  } catch (error) {
    throw new PartialTranscriptOutputError(
      `${(error as Error).message}${published.length ? ' Alguns arquivos já foram salvos e foram preservados.' : ''}`,
      published,
    );
  } finally {
    if (standalone) await rm(stage, { recursive: true, force: true });
  }
}
