import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join } from 'node:path';
import type { DownloadRequest, JobEvent, VideoInfo } from '../shared/types';
import { failureReason } from './failures';
export { failureReason } from './failures';
import { friendlyError } from './media';
import { CancelledError, runProcess } from './processes';
import { parseProgress, PROGRESS_ARGUMENTS, TransferTracker } from './progress';
import { publishUnique } from './files';
import { commonToolArgs, toolEnvironment } from './metadata';
import { RecoveryStore, SESSION_MARKER, type DownloadSession } from './recovery';

export interface ToolPaths {
  ytdlp: string;
  ffmpeg: string;
  ffprobe: string;
  node: string;
}

export function downloadArguments(info: VideoInfo, request: DownloadRequest): string[] {
  if (
    !request ||
    request.videoId !== info.id ||
    !['video', 'audio'].includes(request.kind) ||
    !['compatible', 'original'].includes(request.videoMode) ||
    !['original', 'mp3'].includes(request.audioMode)
  ) {
    throw new Error('Opção inválida. Analise o link novamente.');
  }
  if (request.kind === 'audio') {
    if (!info.audio) throw new Error('Não há áudio disponível para este vídeo.');
    return [
      '-f',
      info.audio.id,
      ...(request.audioMode === 'mp3'
        ? ['-x', '--audio-format', 'mp3', '--audio-quality', '0']
        : []),
    ];
  }
  const option = info[request.videoMode].find((item) => item.id === request.optionId);
  if (!option) throw new Error('Opção inválida. Analise o link novamente.');
  return [
    '-f',
    option.videoId + (option.audioId ? `+${option.audioId}` : ''),
    '--merge-output-format',
    option.container,
    '--remux-video',
    option.container,
  ];
}

export class Downloader {
  private operation?: { controller: AbortController; finished: Promise<void> };
  constructor(
    private tools: ToolPaths,
    private emit: (event: JobEvent) => void,
    private run = runProcess,
    private recovery?: RecoveryStore,
  ) {}
  get busy() {
    return !!this.operation;
  }
  private async exclusively<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.operation) throw new Error('Aguarde a operação atual terminar.');
    let release!: () => void;
    const state = {
      controller: new AbortController(),
      finished: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    this.operation = state;
    try {
      return await operation(state.controller.signal);
    } finally {
      if (this.operation === state) this.operation = undefined;
      release();
    }
  }
  async cancel() {
    const operation = this.operation;
    if (operation) {
      operation.controller.abort();
      await operation.finished;
    }
  }
  async download(
    info: VideoInfo,
    request: DownloadRequest,
    destination: string,
    context?: { itemId: string; onEvent: (event: JobEvent) => void },
  ): Promise<JobEvent> {
    return this.exclusively(async (signal) => {
      const emit = (event: JobEvent) => {
        const tagged = context ? { ...event, itemId: context.itemId } : event;
        this.emit(tagged);
        context?.onEvent(tagged);
      };
      const formatArgs = downloadArguments(info, request);
      let temporary: string | undefined;
      let session: DownloadSession | undefined;
      let terminal: JobEvent;
      try {
        try {
          await access(destination, constants.W_OK);
        } catch (error) {
          if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
            throw new Error('DESTINATION_NOT_FOUND');
          throw error;
        }
        session = await this.recovery?.create(destination, info, context?.itemId);
        temporary = session?.path ?? (await mkdtemp(join(destination, '.vora-')));
        const tracker = new TransferTracker(info, request);
        emit(tracker.event({ type: 'progress', stage: 'downloading' }));
        const onLine = (line: string) => {
          const event = parseProgress(line);
          if (event?.type === 'progress') {
            if (request.kind === 'audio' && event.stage === 'merging')
              event.stage = request.audioMode === 'mp3' ? 'converting' : 'saving';
            emit(tracker.event(event));
          }
        };
        await this.run(
          this.tools.ytdlp,
          [
            ...commonToolArgs(this.tools),
            '--no-playlist',
            ...formatArgs,
            '--windows-filenames',
            '--no-overwrites',
            '--newline',
            '--progress',
            '--no-simulate',
            '--progress-delta',
            '0.3',
            ...PROGRESS_ARGUMENTS,
            '--print',
            'after_move:VORA_FILE:%(filepath)s',
            '-o',
            join(temporary, '%(title).160B [%(id)s].%(ext)s'),
            '--',
            info.url,
          ],
          {
            signal,
            env: toolEnvironment(),
            timeout: 24 * 60 * 60 * 1000,
            onLine,
            maxOutput: 32 * 1024 * 1024,
            onSpawn:
              session && this.recovery
                ? (pid) => this.recovery!.recordProcess(session!, pid)
                : undefined,
          },
        );
        if (signal.aborted) throw new CancelledError();
        const files = (await readdir(temporary)).filter(
          (name) => name !== SESSION_MARKER && !name.endsWith('.part') && !name.endsWith('.ytdl'),
        );
        if (files.length !== 1) throw new Error('O download não produziu um arquivo final único.');
        emit(tracker.event({ type: 'progress', stage: 'saving' }));
        // Publication is the short, non-cancellable commit point.
        const path = await publishUnique(join(temporary, files[0]), destination);
        terminal = {
          type: 'complete',
          filename: basename(path),
          path,
          size: (await stat(path)).size,
        };
      } catch (error) {
        if (error instanceof CancelledError || signal.aborted) terminal = { type: 'cancelled' };
        else {
          console.error('[Vora/download]', (error as Error).message);
          terminal = {
            type: 'error',
            message: friendlyError((error as Error).message),
            reason: failureReason((error as Error).message),
          };
        }
      } finally {
        if (temporary) {
          try {
            if (session && this.recovery) await this.recovery.finish(session);
            else
              await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
          } catch (error) {
            console.error('[Vora/limpeza]', error);
            terminal = { ...terminal!, cleanupPending: true } as JobEvent;
          }
        }
      }
      emit(terminal!);
      return terminal!;
    });
  }
}
