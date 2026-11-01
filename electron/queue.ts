import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type {
  DownloadPreferences,
  DownloadRequest,
  JobEvent,
  QueueAddResult,
  QueueItem,
  QueuePreview,
  QueueSnapshot,
  VideoInfo,
} from '../shared/types';
import { validPreferences, preferredOption } from '../shared/preferences';
import { normalizeYouTubeUrl, friendlyError } from './media';
import { CancelledError } from './processes';
import { failureReason, MediaError } from './failures';

type Progress = Extract<JobEvent, { type: 'progress' }>;
export type QueueNotice =
  | { type: 'finished'; completed: number; failed: number; cancelled: number }
  | { type: 'attention'; message: string };
export const MAX_ATTEMPTS = 3;
interface Dependencies {
  notice?(notice: QueueNotice): void;
  retryDelay?(nextAttempt: number): number;
  beforeStart?(): Promise<void>;
  preview?(url: string, signal: AbortSignal): Promise<QueuePreview>;
  analyze(url: string, signal: AbortSignal): Promise<VideoInfo>;
  download(
    info: VideoInfo,
    request: DownloadRequest,
    destination: string,
    id: string,
    emit: (event: JobEvent) => void,
  ): Promise<JobEvent>;
  cancelDownload(): Promise<void>;
  cleanItem(id: string): Promise<void>;
}
const activeStatuses = new Set(['analyzing', 'downloading', 'processing', 'retrying']);
export function requestForItem(info: VideoInfo, preferences: DownloadPreferences): DownloadRequest {
  const p = validPreferences(preferences);
  if (p.kind === 'audio' && !info.audio)
    throw new Error('Nenhum áudio disponível no formato solicitado.');
  const options = p.quality
    ? info[p.videoMode].filter((option) => option.height <= p.quality!.height)
    : info[p.videoMode];
  const option = preferredOption(options, p.quality);
  if (p.kind === 'video' && !option)
    throw new Error('Nenhum formato disponível dentro da qualidade e do modo solicitados.');
  return {
    videoId: info.id,
    kind: p.kind,
    videoMode: p.videoMode,
    audioMode: p.audioMode,
    ...(p.kind === 'video' ? { optionId: option!.id } : {}),
  };
}
export class QueueManager {
  private previewsPaused = false;
  async pausePreviews() {
    this.previewsPaused = true;
    this.previewController?.abort();
    await this.previewWorker;
    await this.mutations;
  }
  resumePreviews() {
    this.previewsPaused = false;
    this.schedulePreviews();
  }
  private state: QueueSnapshot = { groups: [], items: [], mode: 'paused' };
  private mutations: Promise<unknown> = Promise.resolve();
  private worker?: Promise<void>;
  private controller?: AbortController;
  private closing = false;
  private previewWorker?: Promise<void>;
  private previewController?: AbortController;
  private previewId?: string;
  private cancelled = new Set<string>();
  private results = new Map<string, 'completed' | 'failed' | 'cancelled'>();
  constructor(
    private path: string,
    private deps: Dependencies,
    private notify: (snapshot: QueueSnapshot) => void,
    private emit: (event: JobEvent) => void,
  ) {}
  snapshot(): QueueSnapshot {
    return structuredClone(this.state);
  }
  get busy() {
    return !!this.state.activeId;
  }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(saved.groups) || !Array.isArray(saved.items))
        throw new Error('invalid queue');
      const ids = new Set<string>();
      const groups = saved.groups.filter((group: any) => {
        try {
          if (
            typeof group.id !== 'string' ||
            ids.has(group.id) ||
            typeof group.label !== 'string' ||
            typeof group.destination !== 'string' ||
            !isAbsolute(group.destination)
          )
            return false;
          validPreferences(group.preferences);
          ids.add(group.id);
          return true;
        } catch {
          return false;
        }
      });
      const itemIds = new Set<string>();
      const items: QueueItem[] = [];
      for (const item of saved.items) {
        try {
          const group = groups.find((group: any) => group.id === item.groupId);
          if (
            !group ||
            typeof item.id !== 'string' ||
            itemIds.has(item.id) ||
            typeof item.title !== 'string' ||
            normalizeYouTubeUrl(item.url) !== item.url
          )
            continue;
          const statuses = [
            'waiting',
            'analyzing',
            'downloading',
            'processing',
            'retrying',
            'completed',
            'failed',
            'cancelled',
            'interrupted',
          ];
          if (!statuses.includes(item.status)) continue;
          if (
            item.status === 'completed' &&
            (!item.result ||
              typeof item.result.path !== 'string' ||
              !isAbsolute(item.result.path) ||
              dirname(item.result.path) !== group.destination ||
              typeof item.result.size !== 'number' ||
              !Number.isFinite(item.result.size) ||
              item.result.size < 0)
          )
            continue;
          itemIds.add(item.id);
          items.push({
            id: item.id,
            groupId: group.id,
            title: item.title,
            ...(Number.isInteger(item.attempt) && item.attempt >= 0 && item.attempt <= MAX_ATTEMPTS
              ? { attempt: item.attempt }
              : {}),
            url: item.url,
            ...(item.preview && typeof item.preview.title === 'string'
              ? { preview: this.basicInfo(item.preview), previewState: 'ready' as const }
              : { previewState: 'pending' as const }),
            preferences: validPreferences(group.preferences),
            destination: group.destination,
            status: activeStatuses.has(item.status) ? 'interrupted' : item.status,
            ...(typeof item.error === 'string' ? { error: item.error } : {}),
            ...(item.status === 'completed' ? { result: item.result } : {}),
            ...(item.cleanupPending ? { cleanupPending: true } : {}),
          });
        } catch {
          /* Invalid rows never become work. */
        }
      }
      this.state = { groups, items, mode: 'paused' };
    } catch {
      /* No valid queue: start paused. */
    }
    this.schedulePreviews();
  }
  private basicInfo(info: QueuePreview): QueuePreview {
    return {
      title: info.title,
      ...(typeof info.channel === 'string' ? { channel: info.channel } : {}),
      ...(typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0
        ? { duration: info.duration }
        : {}),
      ...(typeof info.thumbnail === 'string' && /^https:\/\//.test(info.thumbnail)
        ? { thumbnail: info.thumbnail }
        : {}),
    };
  }
  private schedulePreviews() {
    if (!this.deps.preview || this.previewWorker || this.closing || this.previewsPaused) return;
    let failed = false;
    this.previewWorker = this.loadPreviews()
      .catch((error) => {
        failed = true;
        console.error('Falha ao salvar prévia da fila:', error);
      })
      .finally(() => {
        this.previewWorker = undefined;
        if (
          !failed &&
          this.state.items.some(
            (item) =>
              item.status === 'waiting' && (!item.previewState || item.previewState === 'pending'),
          )
        )
          this.schedulePreviews();
      });
  }
  private async loadPreviews() {
    while (!this.closing && !this.previewsPaused) {
      const next = await this.change(() => {
        const item = this.state.items.find(
          (item) =>
            item.status === 'waiting' && (!item.previewState || item.previewState === 'pending'),
        );
        if (!item) return;
        item.previewState = 'loading';
        return { id: item.id, url: item.url };
      });
      if (!next || this.closing) return;
      if (this.state.items.find((item) => item.id === next.id)?.status !== 'waiting') continue;
      const controller = new AbortController();
      this.previewController = controller;
      this.previewId = next.id;
      try {
        const info = this.basicInfo(await this.deps.preview!(next.url, controller.signal));
        await this.change(() => {
          const item = this.state.items.find((item) => item.id === next.id);
          if (!item || controller.signal.aborted || item.status !== 'waiting') return;
          item.title = info.title;
          item.preview = info;
          item.previewState = 'ready';
          delete item.previewError;
        });
      } catch (error) {
        await this.change(() => {
          const item = this.state.items.find((item) => item.id === next.id);
          if (!item || item.previewState !== 'loading') return;
          item.previewState = controller.signal.aborted ? 'pending' : 'error';
          if (!controller.signal.aborted)
            item.previewError = friendlyError((error as Error).message);
        });
      } finally {
        this.previewController = undefined;
        this.previewId = undefined;
      }
    }
  }
  private async persist() {
    await mkdir(dirname(this.path), { recursive: true });
    const saved = {
      ...this.state,
      mode: 'paused',
      items: this.state.items.map(({ progress: _progress, ...item }) => item),
    };
    await writeFile(`${this.path}.tmp`, JSON.stringify(saved, null, 2));
    await rename(`${this.path}.tmp`, this.path);
  }
  private change<T>(action: () => T): Promise<T> {
    const operation = this.mutations.then(async () => {
      const before = this.snapshot();
      try {
        const result = action();
        await this.persist();
        this.notify(this.snapshot());
        return result;
      } catch (error) {
        this.state = before;
        throw error;
      }
    });
    this.mutations = operation.catch(() => {});
    return operation;
  }
  async add(
    entries: { url: string; title?: string; preview?: QueuePreview }[],
    input: DownloadPreferences,
    destination: string,
    label = 'Links',
  ): Promise<QueueAddResult> {
    const preferences = validPreferences(input);
    if (!isAbsolute(destination) || !Array.isArray(entries) || !entries.length)
      throw new Error('Informe links e uma pasta de destino válidos.');
    const normalized = entries.map((entry) => ({
      url: normalizeYouTubeUrl(entry.url),
      title: entry.title,
      preview: entry.preview ? this.basicInfo(entry.preview) : undefined,
    }));
    const result = await this.change(() => {
      const group = {
        id: randomUUID(),
        label: label.slice(0, 200),
        createdAt: new Date().toISOString(),
        destination,
        preferences,
      };
      const seen = new Set<string>();
      let ignored = 0;
      for (const entry of normalized) {
        const duplicate =
          seen.has(entry.url) ||
          this.state.items.some(
            (item) =>
              item.status === 'waiting' &&
              item.url === entry.url &&
              item.destination === destination &&
              JSON.stringify(item.preferences) === JSON.stringify(preferences),
          );
        seen.add(entry.url);
        if (duplicate) {
          ignored++;
          continue;
        }
        this.state.items.push({
          id: randomUUID(),
          groupId: group.id,
          url: entry.url,
          title: entry.title || `Vídeo ${new URL(entry.url).searchParams.get('v')}`,
          preferences: structuredClone(preferences),
          destination,
          status: 'waiting',
          ...(entry.preview
            ? { preview: entry.preview, previewState: 'ready' as const }
            : { previewState: 'pending' as const }),
        });
      }
      const added = normalized.length - ignored;
      if (added) this.state.groups.push(group);
      return { added, ignored };
    });
    this.schedule();
    this.schedulePreviews();
    return result;
  }
  editableGroup(id: string) {
    const group = this.state.groups.find((group) => group.id === id);
    if (
      !group ||
      !this.state.items.some((item) => item.groupId === id && item.status === 'waiting')
    )
      throw new Error('Este grupo não tem mais itens pendentes para editar.');
    return structuredClone(group);
  }
  async editGroup(id: string, input: DownloadPreferences, destination: string) {
    const preferences = validPreferences(input);
    if (typeof destination !== 'string' || !isAbsolute(destination))
      throw new Error('Escolha uma pasta de destino válida.');
    await this.change(() => {
      const group = this.editableGroup(id);
      const pending = this.state.items.filter(
        (item) => item.groupId === id && item.status === 'waiting',
      );
      // Keep the original settings for active, finished and recoverable items.
      const mixed = this.state.items.some(
        (item) => item.groupId === id && item.status !== 'waiting',
      );
      const updated = { ...group, id: mixed ? randomUUID() : group.id, preferences, destination };
      if (mixed) this.state.groups.push(updated);
      else
        this.state.groups = this.state.groups.map((current) =>
          current.id === id ? updated : current,
        );
      for (const item of pending) {
        item.groupId = updated.id;
        item.preferences = structuredClone(preferences);
        item.destination = destination;
      }
    });
  }
  async start() {
    if (this.closing) throw new Error('O aplicativo está encerrando.');
    await this.deps.beforeStart?.();
    await this.change(() => {
      if (!this.busy && this.state.mode !== 'running') this.results.clear();
      this.state.mode = 'running';
      delete this.state.pauseReason;
    });
    this.schedule();
  }
  async pause() {
    await this.change(() => {
      this.state.mode = this.busy ? 'pausing' : 'paused';
    });
  }
  async cancel(id: string) {
    if (id !== this.state.activeId) throw new Error('Este item não está ativo.');
    this.cancelled.add(id);
    this.controller?.abort();
    await this.deps.cancelDownload();
  }
  async remove(id: string) {
    await this.change(() => {
      const item = this.item(id);
      if (item.status !== 'waiting')
        throw new Error('Somente itens aguardando podem ser removidos.');
      this.state.items = this.state.items.filter((item) => item.id !== id);
      this.pruneGroups();
    });
    if (this.previewId === id) this.previewController?.abort();
  }
  async move(id: string, direction: 'up' | 'down') {
    if (!['up', 'down'].includes(direction)) throw new Error('Movimento inválido.');
    await this.change(() => {
      const item = this.item(id);
      if (item.status !== 'waiting') throw new Error('Somente pendentes podem mudar de posição.');
      const pending = this.state.items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.status === 'waiting');
      const from = pending.findIndex(({ item }) => item.id === id),
        to = from + (direction === 'up' ? -1 : 1);
      if (to < 0 || to >= pending.length) return;
      const a = pending[from].index,
        b = pending[to].index;
      [this.state.items[a], this.state.items[b]] = [this.state.items[b], this.state.items[a]];
    });
  }
  async retry(id: string) {
    const item = this.item(id);
    if (!['failed', 'cancelled', 'interrupted'].includes(item.status))
      throw new Error('Este item não pode ser repetido agora.');
    await this.deps.cleanItem(id);
    await this.change(() => {
      const current = this.item(id);
      if (!['failed', 'cancelled', 'interrupted'].includes(current.status))
        throw new Error('O estado deste item mudou.');
      current.status = 'waiting';
      current.attempt = 0;
      delete current.retryAt;
      delete current.error;
      delete current.progress;
      delete current.cleanupPending;
    });
    this.schedule();
  }
  async clearCompleted() {
    await this.change(() => {
      this.state.items = this.state.items.filter((item) => item.status !== 'completed');
      this.pruneGroups();
    });
  }
  private pruneGroups() {
    this.state.groups = this.state.groups.filter((group) =>
      this.state.items.some((item) => item.groupId === group.id),
    );
  }
  private item(id: string) {
    const item = this.state.items.find((item) => item.id === id);
    if (!item) throw new Error('Item não encontrado na fila.');
    return item;
  }
  result(id: string) {
    const item = this.item(id);
    if (item.status !== 'completed' || !item.result)
      throw new Error('Nenhum arquivo concluído está disponível para este item.');
    return structuredClone(item.result);
  }
  private notice(notice: QueueNotice) {
    if (this.closing) return;
    try {
      this.deps.notice?.(notice);
    } catch (error) {
      console.error('[Vora/notificação]', error);
    }
  }
  private schedule() {
    if (this.worker || this.closing || this.state.mode !== 'running') return;
    this.worker = this.work()
      .catch((error) => {
        if (this.state.activeId) {
          this.item(this.state.activeId).status = 'interrupted';
          delete this.state.activeId;
        }
        this.state.mode = 'paused';
        this.state.pauseReason = `Não foi possível salvar ou continuar a fila. ${(error as Error).message}`;
        this.notify(this.snapshot());
        this.notice({ type: 'attention', message: this.state.pauseReason });
      })
      .finally(() => {
        this.worker = undefined;
        if (
          !this.closing &&
          this.state.mode === 'running' &&
          this.state.items.some((item) => item.status === 'waiting')
        )
          this.schedule();
      });
  }
  private async execute(next: QueueItem, signal: AbortSignal): Promise<JobEvent> {
    try {
      const info = await this.deps.analyze(next.url, signal);
      if (signal.aborted) throw new CancelledError();
      const request = requestForItem(info, next.preferences);
      await this.change(() => {
        const item = this.item(next.id);
        item.title = info.title;
        item.preview = this.basicInfo(info);
        item.previewState = 'ready';
        delete item.previewError;
        item.status = 'downloading';
      });
      if (signal.aborted) throw new CancelledError();
      return await this.deps.download(info, request, next.destination, next.id, (event) =>
        this.onEvent(next.id, event),
      );
    } catch (error) {
      return signal.aborted || error instanceof CancelledError
        ? { type: 'cancelled' }
        : {
            type: 'error',
            message: (error as Error).message,
            reason:
              error instanceof MediaError ? error.reason : failureReason((error as Error).message),
          };
    }
  }
  private async executeWithRetries(next: QueueItem, signal: AbortSignal): Promise<JobEvent> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (signal.aborted) return { type: 'cancelled' };
      await this.change(() => {
        const item = this.item(next.id);
        item.status = 'analyzing';
        item.attempt = attempt;
        delete item.retryAt;
        delete item.error;
        delete item.progress;
      });
      const terminal = await this.execute(next, signal);
      if (terminal.type === 'complete') return terminal;
      if (signal.aborted)
        return {
          type: 'cancelled',
          ...('cleanupPending' in terminal ? { cleanupPending: terminal.cleanupPending } : {}),
        };
      if (
        terminal.type !== 'error' ||
        terminal.reason !== 'network' ||
        terminal.cleanupPending ||
        attempt === MAX_ATTEMPTS
      )
        return terminal;
      const milliseconds = this.deps.retryDelay?.(attempt + 1) ?? (attempt === 1 ? 5_000 : 15_000);
      await this.change(() => {
        const item = this.item(next.id);
        item.status = 'retrying';
        item.retryAt = Date.now() + milliseconds;
        item.error = terminal.message;
        delete item.progress;
      });
      try {
        await delay(milliseconds, undefined, { signal });
        await this.deps.cleanItem(next.id);
      } catch (error) {
        if (signal.aborted) return { type: 'cancelled' };
        return {
          type: 'error',
          reason: 'destination',
          cleanupPending: true,
          message:
            'Não foi possível limpar os temporários para tentar novamente. Revise a recuperação antes de continuar.',
        };
      }
    }
    throw new Error('Limite de tentativas inválido.');
  }
  private async work() {
    while (!this.closing) {
      let drained = false;
      const next = await this.change(() => {
        if (this.state.mode !== 'running') return undefined;
        const item = this.state.items.find((item) => item.status === 'waiting');
        if (!item) {
          this.state.mode = 'paused';
          drained = true;
          return undefined;
        }
        item.status = 'analyzing';
        if (this.previewId === item.id) this.previewController?.abort();
        this.state.activeId = item.id;
        return structuredClone(item);
      });
      if (!next) {
        if (drained && this.results.size) {
          const outcomes = [...this.results.values()];
          this.results.clear();
          this.notice({
            type: 'finished',
            completed: outcomes.filter((value) => value === 'completed').length,
            failed: outcomes.filter((value) => value === 'failed').length,
            cancelled: outcomes.filter((value) => value === 'cancelled').length,
          });
        }
        return;
      }
      this.controller = new AbortController();
      if (this.closing || this.cancelled.has(next.id)) this.controller.abort();
      const terminal = await this.executeWithRetries(next, this.controller.signal);
      let attention: string | undefined;
      await this.change(() => {
        const item = this.item(next.id);
        delete item.progress;
        delete item.retryAt;
        if (terminal.type === 'complete') {
          item.status = 'completed';
          item.result = { ...terminal, itemId: next.id };
        } else if (terminal.type === 'cancelled') {
          item.status = 'cancelled';
          delete item.error;
        } else if (terminal.type === 'error') {
          item.status = 'failed';
          item.error = terminal.message;
          if (
            (terminal.reason && !['item', 'network'].includes(terminal.reason)) ||
            terminal.cleanupPending
          ) {
            this.state.mode = 'paused';
            this.state.pauseReason = terminal.cleanupPending
              ? 'Há temporários pendentes de limpeza. Revise a recuperação antes de continuar.'
              : terminal.message;
            attention = this.state.pauseReason;
          }
        }
        if ('cleanupPending' in terminal) item.cleanupPending = terminal.cleanupPending;
        delete this.state.activeId;
        if (this.state.mode === 'pausing' || this.closing) this.state.mode = 'paused';
      });
      if (terminal.type !== 'progress')
        this.results.set(
          next.id,
          terminal.type === 'complete'
            ? 'completed'
            : terminal.type === 'cancelled'
              ? 'cancelled'
              : 'failed',
        );
      if (attention) this.notice({ type: 'attention', message: attention });
      this.emit({ ...terminal, itemId: next.id });
      this.controller = undefined;
      this.cancelled.delete(next.id);
      if (this.state.mode !== 'running') return;
    }
  }
  private onEvent(id: string, event: JobEvent) {
    if (this.state.activeId !== id || event.type !== 'progress') return;
    const item = this.item(id);
    item.progress = { ...event, itemId: id };
    // Processing remains an active row; its detailed stage is carried by progress.
    this.emit({ ...event, itemId: id });
  }
  async shutdown() {
    this.closing = true;
    this.state.mode = 'paused';
    this.controller?.abort();
    this.previewController?.abort();
    await this.deps.cancelDownload();
    await this.worker;
    await this.previewWorker;
    await this.change(() => {
      this.state.mode = 'paused';
    });
  }
}
