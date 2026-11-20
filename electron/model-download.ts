import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  writeFile,
  rename,
  rm,
  lstat,
  realpath,
  statfs,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ModelSpec, ModelPaths, ModelProgress } from '../shared/transcription-types';

export async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) hash.update(data);
  return hash.digest('hex');
}
export async function regularSize(path: string): Promise<number> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Arquivo de modelo inválido.');
    return info.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}
export async function downloadModel(
  spec: ModelSpec,
  paths: ModelPaths,
  options: {
    signal: AbortSignal;
    onProgress: (p: ModelProgress) => void;
    availableBytes?: () => Promise<number>;
  },
): Promise<void> {
  await mkdir(paths.directory, { recursive: true });
  if ((await realpath(paths.directory)) !== resolve(paths.directory))
    throw new Error('A pasta do modelo não pôde ser verificada.');
  let offset = await regularSize(paths.partial);
  let meta: { url?: string; revision?: string; etag?: string; modified?: string } = {};
  try {
    await regularSize(paths.partialMeta);
    meta = JSON.parse(await readFile(paths.partialMeta, 'utf8'));
  } catch {
    /* unknown partial cannot be resumed */
  }
  if (meta.url !== spec.url || meta.revision !== spec.revision || offset > spec.bytes) {
    offset = 0;
    await rm(paths.partial, { force: true });
  }
  const space = await statfs(paths.directory);
  const available = options.availableBytes
    ? await options.availableBytes()
    : space.bavail * space.bsize;
  if (available < spec.bytes - offset + 64 * 1024 * 1024)
    throw new Error('Não há espaço suficiente para baixar o modelo.');
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const heartbeat = (ms = 90000) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(
      () => controller.abort(new Error('O download ficou sem resposta. Tente novamente.')),
      ms,
    );
    watchdog.unref();
  };
  try {
    signal.throwIfAborted();
    if (offset < spec.bytes) {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        heartbeat(30000);
        const headers: Record<string, string> = {};
        if (offset) {
          headers.Range = `bytes=${offset}-`;
          if (meta.etag || meta.modified) headers['If-Range'] = meta.etag || meta.modified!;
        }
        response = await fetch(spec.url, { headers, signal, redirect: 'follow' });
        const range = response.headers.get('content-range');
        const expectedRange = new RegExp(`^bytes ${offset}-([0-9]+)/${spec.bytes}$`);
        const changedValidator =
          offset &&
          response.status === 206 &&
          meta.etag &&
          response.headers.get('etag') &&
          meta.etag !== response.headers.get('etag');
        if ((response.status === 416 || changedValidator) && attempt === 0) {
          await response.body?.cancel();
          offset = 0;
          options.onProgress({
            state: 'downloading',
            receivedBytes: 0,
            totalBytes: spec.bytes,
            message: 'O servidor não permitiu retomar. O download será reiniciado.',
          });
          continue;
        }
        if (!response.ok || !response.body)
          throw new Error(`Download do modelo falhou (${response.status}).`);
        if (response.status === 200) {
          if (offset)
            options.onProgress({
              state: 'downloading',
              receivedBytes: 0,
              totalBytes: spec.bytes,
              message: 'O servidor não permitiu retomar. O download será reiniciado.',
            });
          offset = 0;
        } else if (
          response.status !== 206 ||
          !range ||
          !expectedRange.test(range) ||
          Number(range.match(expectedRange)![1]) !== spec.bytes - 1
        )
          throw new Error('Resposta de retomada do modelo inválida.');
        const length = response.headers.get('content-length');
        if (length !== null && Number(length) !== spec.bytes - offset)
          throw new Error('Tamanho recebido do modelo é inválido.');
        break;
      }
      if (!response?.ok || !response.body) throw new Error('Não foi possível retomar o modelo.');
      await writeFile(
        paths.partialMeta + '.tmp',
        JSON.stringify({
          url: spec.url,
          revision: spec.revision,
          etag: response.headers.get('etag'),
          modified: response.headers.get('last-modified'),
        }),
      );
      await rename(paths.partialMeta + '.tmp', paths.partialMeta);
      // Refuse pre-existing symlinks before opening any writable model file.
      await regularSize(paths.partial);
      const file = await open(paths.partial, offset ? 'a' : 'w');
      try {
        for await (const data of response.body) {
          signal.throwIfAborted();
          heartbeat();
          if (offset + data.length > spec.bytes)
            throw new Error('Modelo excedeu o tamanho esperado.');
          await file.writeFile(data);
          offset += data.length;
          options.onProgress({
            state: 'downloading',
            receivedBytes: offset,
            totalBytes: spec.bytes,
          });
        }
        await file.sync();
      } finally {
        await file.close();
      }
    }
    signal.throwIfAborted();
    options.onProgress({ state: 'verifying', receivedBytes: offset, totalBytes: spec.bytes });
    if (offset !== spec.bytes || (await fileHash(paths.partial)) !== spec.sha256) {
      await rm(paths.partial, { force: true });
      await rm(paths.partialMeta, { force: true });
      throw new Error('Falha de integridade do modelo (checksum ou tamanho incorreto).');
    }
    signal.throwIfAborted();
    await rename(paths.partial, paths.installed);
    await rm(paths.partialMeta, { force: true });
  } finally {
    clearTimeout(watchdog);
    controller.abort();
  }
}
