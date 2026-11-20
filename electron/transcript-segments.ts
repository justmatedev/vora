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
    .filter(
      (s) =>
        s.text &&
        !/^\[\s*_?(?:BLANK[ _]AUDIO|NO[ _](?:AUDIO|SPEECH)|SILENCE|MUSIC)_?\s*\]$/i.test(s.text),
    );
  return { chunk, language: raw.result.language, segments };
}
export function mergeSegments(chunks: ChunkTranscript[], durationMs: number): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  let previousOwner = -1;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const words = (text: string) => [...segmenter.segment(text)].filter((part) => part.isWordLike);
  for (const { chunk, segments } of chunks)
    for (const segment of segments) {
      const midpoint = chunk.startMs + (segment.startMs + segment.endMs) / 2;
      if (
        midpoint < chunk.coreStartMs ||
        midpoint > chunk.coreEndMs ||
        (midpoint === chunk.coreEndMs && chunk.coreEndMs !== durationMs)
      )
        continue;
      let startMs = Math.max(0, Math.min(durationMs, chunk.startMs + segment.startMs));
      const endMs = Math.max(0, Math.min(durationMs, chunk.startMs + segment.endMs));
      let text = segment.text.trim();
      const previous = result.at(-1);
      // Independently decoded context can end one segment mid-sentence and start
      // the next with the same words. Only trim matching text in actual time
      // overlap between different chunks; repetitions within a chunk are kept.
      if (
        previous &&
        previousOwner !== chunk.coreStartMs &&
        startMs < previous.endMs &&
        endMs > previous.startMs
      ) {
        const before = words(previous.text),
          after = words(text);
        for (let count = Math.min(before.length, after.length, 64); count >= 2; count--) {
          if (
            after
              .slice(0, count)
              .every(
                (part, index) =>
                  part.segment.normalize('NFKC').toLowerCase() ===
                  before[before.length - count + index].segment.normalize('NFKC').toLowerCase(),
              )
          ) {
            text = count === after.length ? '' : text.slice(after[count].index).trim();
            startMs = Math.max(startMs, previous.endMs);
            break;
          }
        }
      }
      if (endMs > startMs && text) {
        result.push({ startMs, endMs, text });
        previousOwner = chunk.coreStartMs;
      }
    }
  return result.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}
