import { mkdir, rm, realpath, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MODEL_CATALOG } from '../shared/whisper-models';
import type {
  ModelSnapshot,
  ModelSpec,
  WhisperModelId,
  ModelPaths,
} from '../shared/transcription-types';
import { downloadModel, fileHash, regularSize } from './model-download';

export class ModelManager {
  private state: ModelSnapshot;
  private tasks = new Map<
    WhisperModelId,
    { controller: AbortController; promise: Promise<void> }
  >();
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  cleanupPending = false;
  private catalog: Readonly<Record<WhisperModelId, ModelSpec>>;
  constructor(
    private root: string,
    private notify: (snapshot: ModelSnapshot) => void,
    private deps: {
      catalog?: Readonly<Record<WhisperModelId, ModelSpec>>;
      inUse?: (id: WhisperModelId) => boolean;
    } = {},
  ) {
    this.catalog = deps.catalog ?? MODEL_CATALOG;
    this.state = Object.fromEntries(
      (['small', 'medium'] as const).map((id) => [
        id,
        {
          spec: this.catalog[id],
          state: 'missing',
          bytesOnDisk: 0,
          path: this.paths(id).installed,
        },
      ]),
    ) as ModelSnapshot;
  }
  private id(input: unknown): WhisperModelId {
    if (input !== 'small' && input !== 'medium') throw new Error('Modelo de transcrição inválido.');
    return input;
  }
  paths(input: unknown): ModelPaths {
    const id = this.id(input),
      directory = join(this.root, id, this.catalog[id].revision);
    return {
      directory,
      installed: join(directory, `ggml-${id}.bin`),
      partial: join(directory, `ggml-${id}.part`),
      partialMeta: join(directory, 'partial.json'),
    };
  }
  snapshot(): ModelSnapshot {
    return structuredClone(this.state);
  }
  get busy() {
    return this.tasks.size > 0;
  }
  private changed() {
    this.notify(this.snapshot());
  }
  async load() {
    await mkdir(this.root, { recursive: true });
    this.root = await realpath(this.root);
    for (const id of ['small', 'medium'] as const) {
      const paths = this.paths(id);
      await mkdir(paths.directory, { recursive: true });
      if ((await realpath(paths.directory)) !== resolve(paths.directory))
        throw new Error('Pasta de modelo inválida.');
      const model = this.state[id];
      model.path = paths.installed;
      try {
        const bytes = await regularSize(paths.installed);
        if (bytes) {
          if (bytes !== model.spec.bytes || (await fileHash(paths.installed)) !== model.spec.sha256)
            throw new Error('Modelo alterado ou incompleto. Baixe-o novamente.');
          model.state = 'installed';
          model.bytesOnDisk = bytes;
        } else {
          model.bytesOnDisk = await regularSize(paths.partial);
          model.state = model.bytesOnDisk ? 'partial' : 'missing';
        }
      } catch (error) {
        model.state = 'error';
        model.error = (error as Error).message;
      }
    }
    this.changed();
  }
  path(input: unknown): string {
    const id = this.id(input);
    if (this.state[id].state !== 'installed') throw new Error('O modelo ainda não está instalado.');
    return this.paths(id).installed;
  }
  install(input: unknown): Promise<void> {
    const id = this.id(input);
    if (this.closing) return Promise.reject(new Error('O aplicativo está encerrando.'));
    if (this.tasks.has(id)) return this.tasks.get(id)!.promise;
    if (this.state[id].state === 'installed') return Promise.resolve();
    const controller = new AbortController();
    const promise = this.tail
      .catch(() => {})
      .then(async () => {
        controller.signal.throwIfAborted();
        this.state[id].state = 'downloading';
        delete this.state[id].error;
        this.changed();
        try {
          await downloadModel(this.catalog[id], this.paths(id), {
            signal: controller.signal,
            onProgress: (p) => {
              Object.assign(this.state[id], {
                state: p.state,
                receivedBytes: p.receivedBytes,
                bytesOnDisk: p.receivedBytes,
              });
              if (p.message) this.state[id].message = p.message;
              this.changed();
            },
          });
          Object.assign(this.state[id], {
            state: 'installed',
            bytesOnDisk: this.catalog[id].bytes,
          });
        } catch (error) {
          this.state[id].bytesOnDisk = await regularSize(this.paths(id).partial).catch(() => 0);
          this.state[id].state = controller.signal.aborted
            ? this.state[id].bytesOnDisk
              ? 'partial'
              : 'missing'
            : 'error';
          if (!controller.signal.aborted) this.state[id].error = (error as Error).message;
          throw error;
        } finally {
          this.tasks.delete(id);
          this.changed();
        }
      })
      .finally(() => {
        this.tasks.delete(id);
        this.changed();
      });
    this.tasks.set(id, { controller, promise });
    this.tail = promise;
    this.changed();
    return promise;
  }
  async cancel(input: unknown) {
    const id = this.id(input),
      task = this.tasks.get(id);
    if (task) {
      task.controller.abort();
      await task.promise.catch(() => {});
    }
  }
  private async safeDirectory(id: WhisperModelId) {
    const dir = this.paths(id).directory;
    if ((await realpath(dir)) !== resolve(dir)) throw new Error('Pasta de modelo inválida.');
    return dir;
  }
  async discardPartial(input: unknown) {
    const id = this.id(input);
    if (this.tasks.has(id)) throw new Error('Cancele o download do modelo primeiro.');
    await this.safeDirectory(id);
    const paths = this.paths(id);
    await rm(paths.partial, { force: true });
    await rm(paths.partialMeta, { force: true });
    if (this.state[id].state !== 'installed')
      Object.assign(this.state[id], { state: 'missing', bytesOnDisk: 0, error: undefined });
    this.changed();
  }
  async remove(input: unknown) {
    const id = this.id(input);
    if (this.tasks.has(id) || this.deps.inUse?.(id))
      throw new Error('O modelo está em uso ou aguardando na fila. Cancele os itens primeiro.');
    await this.safeDirectory(id);
    const path = this.paths(id).installed;
    const entry = await lstat(path).catch(() => null);
    if (entry?.isSymbolicLink()) throw new Error('Arquivo do modelo inválido.');
    await rm(path, { force: true });
    await this.discardPartial(id);
    Object.assign(this.state[id], { state: 'missing', bytesOnDisk: 0, error: undefined });
    this.changed();
  }
  async shutdown() {
    this.closing = true;
    await Promise.all([...this.tasks.keys()].map((id) => this.cancel(id)));
  }
}
