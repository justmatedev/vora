import { lstat } from 'node:fs/promises';
import { extname } from 'node:path';
import type {
  TranscriptionSelectionRequest,
  TranscriptFormat,
} from '../shared/transcription-types';
import { parseTranscriptionOptions } from '../shared/transcription-options';
import { SourceRegistry } from './transcription-sources';
import { TranscriptionQueue } from './transcription-queue';
import { ModelManager } from './whisper-models';
import { SettingsStore } from './settings';

interface Dependencies {
  queue: TranscriptionQueue;
  models: ModelManager;
  sources: SourceRegistry;
  settings: SettingsStore;
  selectFiles: () => Promise<string[]>;
  selectDirectory: () => Promise<string | null>;
  completedPath: (id: string) => Promise<string>;
  openPath: (path: string) => Promise<string>;
  showPath: (path: string) => void;
  modelRoot: string;
}
type Register = (channel: string, handler: (...args: any[]) => unknown) => void;
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 256)
    throw new Error('Identificador de arquivo inválido.');
  return value;
}
export function registerTranscriptionIPC(handle: Register, deps: Dependencies) {
  const { queue, models, sources } = deps;
  handle('vora:transcriptions', () => queue.snapshot());
  handle('vora:models', () => models.snapshot());
  handle('vora:transcription-choose-files', async () =>
    sources.register(await deps.selectFiles(), 'local'),
  );
  handle(
    'vora:transcription-from-download',
    async (input) =>
      (await sources.register([await deps.completedPath(identifier(input))], 'download'))[0],
  );
  handle('vora:transcription-directory', async () => {
    const path = await deps.selectDirectory();
    return path ? await sources.chooseDestination(path) : null;
  });
  handle('vora:transcription-add', async (input) => {
    const value = input as TranscriptionSelectionRequest | null;
    if (
      !value ||
      !Array.isArray(value.sourceIds) ||
      !value.sourceIds.length ||
      value.sourceIds.length > 1000 ||
      typeof value.downloadModel !== 'boolean' ||
      typeof value.start !== 'boolean'
    )
      throw new Error('Solicitação de transcrição inválida.');
    const options = parseTranscriptionOptions(value.options),
      selected = await Promise.all(value.sourceIds.map((id) => sources.resolve(identifier(id))));
    const destination = value.destinationId
      ? await sources.resolveDestination(identifier(value.destinationId))
      : undefined;
    return queue.add({
      sources: selected,
      options,
      destination,
      downloadModel: value.downloadModel,
      start: value.start,
    });
  });
  handle('vora:transcription-preferences', (input) =>
    deps.settings.setTranscriptionPreferences(input),
  );
  handle('vora:transcription-start', () => queue.start());
  handle('vora:transcription-pause', () => queue.pause());
  handle('vora:transcription-cancel', (id) => queue.cancel(identifier(id)));
  handle('vora:transcription-remove', (id) => queue.remove(identifier(id)));
  handle('vora:transcription-retry', (id) => queue.retry(identifier(id)));
  handle('vora:transcription-clear', () => queue.clearCompleted());
  async function outputPath(id: unknown, format: unknown) {
    if (format !== 'txt' && format !== 'srt') throw new Error('Formato de arquivo inválido.');
    const item = queue.snapshot().items.find((item) => item.id === identifier(id)),
      output = item?.outputs.find((o) => o.format === format);
    if (!output || extname(output.path).toLowerCase() !== '.' + format)
      throw new Error('Arquivo de transcrição não encontrado.');
    const info = await lstat(output.path).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink())
      throw new Error('O arquivo foi movido ou removido.');
    return output.path;
  }
  handle('vora:transcription-open-output', async (id, format) => {
    const error = await deps.openPath(await outputPath(id, format));
    if (error) throw new Error('Não foi possível abrir o arquivo. Verifique o aplicativo padrão.');
  });
  handle('vora:transcription-show-output', async (id, format) =>
    deps.showPath(await outputPath(id, format)),
  );
  handle('vora:model-install', (id) => models.install(id));
  handle('vora:model-cancel', (id) => models.cancel(id));
  handle('vora:model-discard-partial', (id) => models.discardPartial(id));
  handle('vora:model-remove', (id) => models.remove(id));
  handle('vora:model-open-directory', async () => {
    const error = await deps.openPath(deps.modelRoot);
    if (error) throw new Error('Não foi possível abrir a pasta de modelos.');
  });
}
