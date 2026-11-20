import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type {
  TranscriptionSnapshot,
  TranscriptionItem,
  TranscriptionOptions,
  SourceRecord,
  WhisperModelId,
  TranscriptOutput,
} from '../shared/transcription-types';
import { parseTranscriptionOptions } from '../shared/transcription-options';
import type { ModelManager } from './whisper-models';
import { TranscriptionSessions } from './transcription-sessions';
import type { Transcriber } from './transcriber';
import { publishTranscript, PartialTranscriptOutputError } from './transcription-output';
import { revalidateSource, writableDirectory } from './transcription-sources';
import type { QueueNotice } from './queue';

interface Dependencies {
  models: Pick<ModelManager, 'snapshot' | 'install'>;
  sessions: TranscriptionSessions;
  transcriber: Pick<Transcriber, 'run'>;
  publish?: typeof publishTranscript;
  notice?: (notice: QueueNotice) => void;
}
export interface TranscriptionAddRequest {
  sources: SourceRecord[];
  options: TranscriptionOptions;
  destination?: string;
  downloadModel: boolean;
  start: boolean;
}
const pendingStatuses = new Set(['model', 'waiting']);
const activeStatuses = new Set(['preparing', 'transcribing', 'saving']);
function validateStored(item: TranscriptionItem) {
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id ||
    !item.source ||
    typeof item.source.name !== 'string' ||
    !isAbsolute(item.source.path) ||
    typeof item.source.device !== 'string' ||
    typeof item.source.inode !== 'string' ||
    !Number.isFinite(item.source.size) ||
    !Number.isFinite(item.source.mtimeMs) ||
    !Number.isFinite(item.source.durationMs) ||
    item.source.durationMs <= 0 ||
    !Number.isInteger(item.source.audioStreamIndex) ||
    !isAbsolute(item.destination) ||
    typeof item.modelRevision !== 'string' ||
    !Array.isArray(item.outputs) ||
    ![
      'model',
      'waiting',
      'preparing',
      'transcribing',
      'saving',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ].includes(item.status)
  )
    throw new Error('Item de transcrição inválido.');
  item.options = parseTranscriptionOptions(item.options);
  for (const output of item.outputs)
    if (
      !['txt', 'srt'].includes(output.format) ||
      typeof output.path !== 'string' ||
      !isAbsolute(output.path) ||
      dirname(output.path) !== item.destination ||
      !Number.isFinite(output.size)
    )
      throw new Error('Saída de transcrição inválida.');
  return item;
}
export class TranscriptionQueue {
  private state: TranscriptionSnapshot = { schemaVersion: 1, mode: 'paused', items: [] };
  private changes: Promise<unknown> = Promise.resolve();
  private worker?: Promise<void>;
  private current?: Promise<void>;
  private controller?: AbortController;
  private closing = false;
  private readOnly = false;
  private results = new Map<string, 'completed' | 'failed' | 'cancelled'>();
  constructor(
    private file: string,
    private deps: Dependencies,
    private notify: (snapshot: TranscriptionSnapshot) => void,
  ) {}
  snapshot() {
    return structuredClone(this.state);
  }
  get busy() {
    return !!this.state.activeId;
  }
  get cleanupPending() {
    return (
      this.deps.sessions.cleanupPending || this.state.items.some((item) => item.cleanupPending)
    );
  }
  private async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(this.state, null, 2));
    await rename(this.file + '.tmp', this.file);
  }
  private change(fn: () => void) {
    const operation = this.changes.then(async () => {
      if (this.readOnly) throw new Error(this.state.error ?? 'Fila de transcrições indisponível.');
      fn();
      await this.persist();
      this.notify(this.snapshot());
    });
    this.changes = operation.catch(() => {});
    return operation;
  }
  async load() {
    try {
      try {
        const saved = JSON.parse(await readFile(this.file, 'utf8'));
        if (saved.schemaVersion !== 1 || !Array.isArray(saved.items))
          throw new Error('Versão da fila de transcrições inválida.');
        const seen = new Set<string>();
        this.state.items = saved.items.map((value: TranscriptionItem) => {
          const item = validateStored(value);
          if (seen.has(item.id)) throw new Error('Item duplicado.');
          seen.add(item.id);
          if (activeStatuses.has(item.status) || saved.activeId === item.id)
            item.status = 'interrupted';
          delete item.progress;
          return item;
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      this.state.mode = 'paused';
      delete this.state.activeId;
      for (const recovered of await this.deps.sessions.recover()) {
        const item = this.state.items.find((i) => i.id === recovered.itemId);
        if (item)
          for (const output of recovered.outputs)
            if (!item.outputs.some((o) => o.path === output.path)) item.outputs.push(output);
        if (!recovered.running && !recovered.cleanupPending) {
          await this.deps.sessions.cleanup(recovered.id);
          if (item) item.cleanupPending = false;
        } else if (item) item.cleanupPending = true;
      }
      for (const item of this.state.items)
        if (
          item.status === 'waiting' &&
          this.deps.models.snapshot()[item.options.modelId].state !== 'installed'
        )
          item.status = 'model';
      await this.persist();
    } catch (error) {
      this.readOnly = true;
      this.state.mode = 'paused';
      this.state.error = `Não foi possível recuperar a fila de transcrições: ${(error as Error).message}`;
    }
    this.notify(this.snapshot());
  }
  private item(id: string) {
    const item = this.state.items.find((i) => i.id === id);
    if (!item) throw new Error('Item de transcrição não encontrado.');
    return item;
  }
  usesModel(id: WhisperModelId) {
    return this.state.items.some(
      (i) =>
        i.options.modelId === id && (pendingStatuses.has(i.status) || activeStatuses.has(i.status)),
    );
  }
  async add(request: TranscriptionAddRequest) {
    if (this.closing) throw new Error('O aplicativo está encerrando.');
    const options = parseTranscriptionOptions(request.options),
      info = this.deps.models.snapshot()[options.modelId];
    if (!request.sources.length) throw new Error('Selecione pelo menos um arquivo.');
    if (info.state !== 'installed' && !request.downloadModel)
      throw new Error('Baixe ou retome o modelo antes de adicionar.');
    const items: TranscriptionItem[] = [];
    for (const source of request.sources) {
      await revalidateSource(source);
      const destination = await writableDirectory(request.destination ?? dirname(source.path));
      items.push({
        id: randomUUID(),
        source: structuredClone(source),
        destination,
        options: structuredClone(options),
        modelRevision: info.spec.revision,
        status: info.state === 'installed' ? 'waiting' : 'model',
        outputs: [],
      });
    }
    await this.change(() => {
      this.state.items.push(...items);
      if (request.start) this.state.mode = 'running';
    });
    if (info.state !== 'installed')
      void this.deps.models
        .install(options.modelId)
        .then(() => this.modelChanged())
        .catch((error) => {
          if (!this.closing)
            void this.change(() => {
              for (const item of this.state.items)
                if (item.options.modelId === options.modelId && item.status === 'model')
                  item.error = `Baixe ou retome o modelo: ${(error as Error).message}`;
              this.state.mode = this.busy ? 'pausing' : 'paused';
            }).catch(() => {});
        });
    this.schedule();
    return items.map((i) => i.id);
  }
  async modelChanged() {
    if (this.closing || this.readOnly) return;
    const models = this.deps.models.snapshot();
    if (
      !this.state.items.some(
        (item) => item.status === 'model' && models[item.options.modelId].state === 'installed',
      )
    )
      return;
    await this.change(() => {
      for (const item of this.state.items)
        if (item.status === 'model' && models[item.options.modelId].state === 'installed') {
          item.status = 'waiting';
          delete item.error;
        }
    });
    this.schedule();
  }
  async start() {
    if (this.closing) throw new Error('O aplicativo está encerrando.');
    if ((await this.deps.sessions.running()) || this.cleanupPending)
      throw new Error('Resolva os temporários ou aguarde o processo anterior antes de continuar.');
    await this.modelChanged();
    const first = this.state.items.find((i) => pendingStatuses.has(i.status));
    if (first?.status === 'model')
      throw new Error('Baixe ou retome o modelo na área Modelos antes de continuar a fila.');
    await this.change(() => {
      this.state.mode = 'running';
      delete this.state.error;
    });
    this.schedule();
  }
  async pause() {
    await this.change(() => {
      this.state.mode = this.busy ? 'pausing' : 'paused';
    });
  }
  async cancel(id: string) {
    const item = this.item(id);
    if (this.state.activeId === id) {
      const current = this.current;
      this.controller?.abort();
      await current;
      return;
    }
    if (!pendingStatuses.has(item.status))
      throw new Error('Este item não está aguardando execução.');
    await this.change(() => {
      item.status = 'cancelled';
    });
  }
  async retry(id: string) {
    const item = this.item(id);
    if (!['failed', 'cancelled', 'interrupted'].includes(item.status) && !item.cleanupPending)
      throw new Error('Este item não pode ser repetido.');
    const session = await this.deps.sessions.forItem(id);
    if (session) await this.deps.sessions.cleanup(session.id);
    await revalidateSource(item.source);
    await this.change(() => {
      const onlyCleanup = item.status === 'completed';
      item.cleanupPending = false;
      if (!onlyCleanup) {
        item.status =
          this.deps.models.snapshot()[item.options.modelId].state === 'installed'
            ? 'waiting'
            : 'model';
        item.outputs = [];
        delete item.error;
        delete item.progress;
      }
    });
    this.schedule();
  }
  async clearCompleted() {
    await this.change(() => {
      this.state.items = this.state.items.filter(
        (i) => i.status !== 'completed' || i.cleanupPending,
      );
    });
  }
  private schedule() {
    if (this.worker || this.closing || this.readOnly || this.state.mode !== 'running') return;
    this.worker = this.work()
      .catch((error) => {
        this.state.error = (error as Error).message;
        this.state.mode = 'paused';
        this.notify(this.snapshot());
      })
      .finally(() => {
        this.worker = undefined;
        const next = this.state.items.find((i) => pendingStatuses.has(i.status));
        if (next?.status === 'waiting' && this.state.mode === 'running' && !this.closing)
          this.schedule();
      });
  }
  private async work() {
    while (!this.closing && this.state.mode === 'running') {
      const next = this.state.items.find((i) => pendingStatuses.has(i.status));
      if (!next || next.status === 'model') break;
      this.current = this.runItem(next);
      await this.current;
      this.current = undefined;
      if (this.cleanupPending) break;
    }
    if (
      !this.state.items.some((i) => pendingStatuses.has(i.status)) &&
      this.state.mode === 'running'
    ) {
      await this.change(() => {
        this.state.mode = 'paused';
      });
      if (this.results.size) {
        const values = [...this.results.values()];
        this.deps.notice?.({
          type: 'finished',
          completed: values.filter((v) => v === 'completed').length,
          failed: values.filter((v) => v === 'failed').length,
          cancelled: values.filter((v) => v === 'cancelled').length,
        });
        this.results.clear();
      }
    }
  }
  private async runItem(item: TranscriptionItem) {
    const controller = new AbortController();
    this.controller = controller;
    await this.change(() => {
      this.state.activeId = item.id;
      item.status = 'preparing';
      delete item.error;
    });
    try {
      await revalidateSource(item.source);
      const destination = await writableDirectory(item.destination);
      if (destination !== item.destination) throw new Error('A pasta de saída foi alterada.');
      if (await this.deps.sessions.running())
        throw new Error('Um processo anterior ainda está em execução.');
      const previous = await this.deps.sessions.forItem(item.id);
      if (previous) await this.deps.sessions.cleanup(previous.id);
      const session = await this.deps.sessions.create(item.id, item.destination);
      const document = await this.deps.transcriber.run(item, controller.signal, (event) => {
        if (controller.signal.aborted) return;
        item.status = event.stage;
        item.progress = event;
        this.notify(this.snapshot());
      });
      controller.signal.throwIfAborted();
      await this.change(() => {
        item.status = 'saving';
        item.progress = { stage: 'saving' };
      });
      item.outputs = await (this.deps.publish ?? publishTranscript)(
        document,
        item.options.formats,
        item.destination,
        item.source.name,
        async (output) => {
          await this.deps.sessions.recordPublished(session.id, output);
          await this.change(() => {
            if (!item.outputs.some((o) => o.path === output.path)) item.outputs.push(output);
          });
        },
        { sessionDirectory: session.path, signal: controller.signal },
      );
      await this.change(() => {
        item.status = 'completed';
      });
      this.results.set(item.id, 'completed');
    } catch (error) {
      await this.change(() => {
        if (error instanceof PartialTranscriptOutputError) item.outputs = error.published;
        item.status = controller.signal.aborted
          ? this.closing
            ? 'interrupted'
            : 'cancelled'
          : 'failed';
        item.error = item.status === 'failed' ? (error as Error).message : undefined;
      });
      if (item.status !== 'interrupted')
        this.results.set(item.id, item.status === 'cancelled' ? 'cancelled' : 'failed');
    } finally {
      try {
        const session = await this.deps.sessions.forItem(item.id);
        if (session) await this.deps.sessions.cleanup(session.id);
        item.cleanupPending = false;
      } catch (error) {
        item.cleanupPending = true;
        item.error = `${item.error ? item.error + ' ' : ''}Temporários pendentes: ${(error as Error).message}`;
        this.state.mode = 'paused';
      }
      this.controller = undefined;
      await this.change(() => {
        delete this.state.activeId;
        delete item.progress;
        if (this.state.mode === 'pausing') this.state.mode = 'paused';
      });
    }
  }
  async shutdown() {
    this.closing = true;
    this.controller?.abort();
    await this.worker;
    await this.change(() => {
      this.state.mode = 'paused';
    });
  }
}
