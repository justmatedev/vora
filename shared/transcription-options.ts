import type { TranscriptionOptions } from './transcription-types';
import { LANGUAGES } from './whisper-languages';
export const DEFAULT_TRANSCRIPTION_OPTIONS: TranscriptionOptions = {
  modelId: 'small',
  language: 'auto',
  formats: ['txt', 'srt'],
};
export function parseTranscriptionOptions(value: unknown): TranscriptionOptions {
  const v = value as Partial<TranscriptionOptions> | null;
  if (
    !v ||
    !['small', 'medium'].includes(v.modelId ?? '') ||
    typeof v.language !== 'string' ||
    (v.language !== 'auto' && !LANGUAGES.some((l) => l.code === v.language)) ||
    !Array.isArray(v.formats) ||
    !v.formats.length ||
    v.formats.some((f) => !['txt', 'srt'].includes(f))
  )
    throw new Error('Opções de transcrição inválidas.');
  return {
    modelId: v.modelId!,
    language: v.language,
    formats: (['txt', 'srt'] as const).filter((f) => v.formats!.includes(f)),
  };
}
