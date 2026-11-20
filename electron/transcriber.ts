import { availableParallelism } from 'node:os';
import { readFile, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  TranscriptionWork,
  TranscriptionProgress,
  TranscriptDocument,
  ChunkTranscript,
} from '../shared/transcription-types';
import { runProcess } from './processes';
import type { ModelManager } from './whisper-models';
import { fileHash, regularSize } from './model-download';
import { TranscriptionSessions } from './transcription-sessions';
import { revalidateSource } from './transcription-sources';
import { prepareAudioChunk } from './transcription-audio';
import { planAudioChunks, parseWhisperJson, mergeSegments } from './transcript-segments';

export interface TranscriptionTools {
  ffmpeg: string;
  ffprobe: string;
  whisper: string;
}
export class Transcriber {
  private active = false;
  constructor(
    private tools: TranscriptionTools,
    private models: Pick<ModelManager, 'path' | 'snapshot'>,
    private sessions: TranscriptionSessions,
    private execute: typeof runProcess = runProcess,
  ) {}
  async run(
    item: TranscriptionWork,
    signal: AbortSignal,
    emit: (event: TranscriptionProgress) => void,
  ): Promise<TranscriptDocument> {
    if (this.active) throw new Error('Uma transcrição já está em andamento.');
    this.active = true;
    try {
      return await this.process(item, signal, emit);
    } finally {
      this.active = false;
    }
  }
  private async process(
    item: TranscriptionWork,
    signal: AbortSignal,
    emit: (event: TranscriptionProgress) => void,
  ): Promise<TranscriptDocument> {
    signal.throwIfAborted();
    await revalidateSource(item.source);
    const model = this.models.snapshot()[item.options.modelId].spec,
      path = this.models.path(item.options.modelId);
    if (model.revision !== item.modelRevision)
      throw new Error(
        'A versão do modelo deste item não está disponível. Adicione o arquivo novamente.',
      );
    if ((await regularSize(path)) !== model.bytes || (await fileHash(path)) !== model.sha256)
      throw new Error('O modelo foi alterado. Baixe-o novamente antes de transcrever.');
    const session =
      (await this.sessions.forItem(item.id)) ??
      (await this.sessions.create(item.id, item.destination));
    const chunks = planAudioChunks(item.source.durationMs),
      results: ChunkTranscript[] = [];
    let language = item.options.language;
    for (let index = 0; index < chunks.length; index++) {
      signal.throwIfAborted();
      const chunk = chunks[index],
        audio = join(session.path, `chunk-${index}.wav`),
        output = join(session.path, `chunk-${index}`);
      const space = await statfs(session.path);
      if (space.bavail * space.bsize < (chunk.endMs - chunk.startMs) * 32 + 64 * 1024 * 1024)
        throw new Error('Não há espaço suficiente para preparar o áudio.');
      emit({ stage: 'preparing' });
      await prepareAudioChunk(
        item.source,
        chunk,
        audio,
        this.tools.ffmpeg,
        {
          signal,
          timeout: null,
          captureOutput: false,
          onSpawn: (pid) => this.sessions.registerProcess(session.id, pid, this.tools.ffmpeg),
        },
        this.execute,
      );
      emit({
        stage: 'transcribing',
        percent: Math.floor((chunk.coreStartMs / item.source.durationMs) * 100),
      });
      try {
        await this.execute(
          this.tools.whisper,
          [
            '-m',
            path,
            '-f',
            audio,
            '-l',
            language,
            '-t',
            String(Math.max(1, Math.min(6, availableParallelism() - 1))),
            '-ng',
            '-pp',
            '-oj',
            '-of',
            output,
          ],
          {
            signal,
            timeout: null,
            captureOutput: false,
            onSpawn: (pid) => this.sessions.registerProcess(session.id, pid, this.tools.whisper),
            onLine: (line) => {
              const match = /progress\s*=\s*(\d+)%/.exec(line);
              if (match) {
                const progress = Math.min(100, Number(match[1]));
                emit({
                  stage: 'transcribing',
                  percent: Math.min(
                    99,
                    Math.floor(
                      ((chunk.coreStartMs +
                        ((chunk.coreEndMs - chunk.coreStartMs) * progress) / 100) /
                        item.source.durationMs) *
                        100,
                    ),
                  ),
                });
              }
            },
          },
        );
        if ((await stat(output + '.json')).size > 16 * 1024 * 1024)
          throw new Error('O resultado de transcrição excedeu o limite seguro.');
        const result = parseWhisperJson(
          JSON.parse(await readFile(output + '.json', 'utf8')),
          chunk,
        );
        results.push(result);
        if (language === 'auto' && result.segments.length) language = result.language;
      } finally {
        await rm(audio, { force: true });
        await rm(output + '.json', { force: true });
      }
    }
    const segments = mergeSegments(results, item.source.durationMs);
    if (!segments.length) throw new Error('Nenhum trecho de fala foi detectado neste arquivo.');
    return {
      language: language === 'auto' ? (results[0]?.language ?? 'auto') : language,
      durationMs: item.source.durationMs,
      segments,
    };
  }
}
