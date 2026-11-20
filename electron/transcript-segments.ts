import type { AudioChunk, ChunkTranscript, TranscriptSegment } from '../shared/transcription-types';
export function planAudioChunks(durationMs: number): AudioChunk[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    throw new Error('Duração de áudio inválida.');
  const chunks: AudioChunk[] = [];
  for (let coreStartMs = 0; coreStartMs < durationMs; coreStartMs += 300000) {
    const coreEndMs = Math.min(durationMs, coreStartMs + 300000);
    chunks.push({
      coreStartMs,
      coreEndMs,
      startMs: Math.max(0, coreStartMs - 2000),
      endMs: Math.min(durationMs, coreEndMs + 2000),
    });
  }
  return chunks;
}
export function parseWhisperJson(value: unknown, chunk: AudioChunk): ChunkTranscript {
  const raw = value as {
    result?: { language?: unknown };
    transcription?: { offsets?: { from?: unknown; to?: unknown }; text?: unknown }[];
  } | null;
  if (!raw || typeof raw.result?.language !== 'string' || !Array.isArray(raw.transcription))
    throw new Error('Resultado de transcrição inválido.');
  const segments = raw.transcription
    .map((segment) => {
      const from = segment.offsets?.from,
        to = segment.offsets?.to;
      if (
        typeof from !== 'number' ||
        typeof to !== 'number' ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from < 0 ||
        to < from ||
        typeof segment.text !== 'string'
      )
        throw new Error('Resultado de transcrição contém tempos inválidos.');
      return { startMs: Math.round(from), endMs: Math.round(to), text: segment.text.trim() };
    })
    .filter((s) => s.text && !/^\[(?:_?BLANK_AUDIO_?|SILENCE|NO_SPEECH|MUSIC)\]$/i.test(s.text));
  return { chunk, language: raw.result.language, segments };
}
export function mergeSegments(chunks: ChunkTranscript[], durationMs: number): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  for (const { chunk, segments } of chunks)
    for (const segment of segments) {
      const midpoint = chunk.startMs + (segment.startMs + segment.endMs) / 2;
      if (
        midpoint < chunk.coreStartMs ||
        midpoint > chunk.coreEndMs ||
        (midpoint === chunk.coreEndMs && chunk.coreEndMs !== durationMs)
      )
        continue;
      const startMs = Math.max(0, Math.min(durationMs, chunk.startMs + segment.startMs)),
        endMs = Math.max(0, Math.min(durationMs, chunk.startMs + segment.endMs));
      if (endMs > startMs && segment.text.trim())
        result.push({ startMs, endMs, text: segment.text.trim() });
    }
  return result.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}
