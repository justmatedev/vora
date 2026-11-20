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
  type Candidate = TranscriptSegment & { owner: number; inCore: boolean };
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const words = (text: string) => [...segmenter.segment(text)].filter((part) => part.isWordLike);
  const normalized = (text: string) =>
    words(text)
      .map((part) => part.segment.normalize('NFKC').toLowerCase())
      .join(' ');
  const candidates: Candidate[] = [];
  for (const { chunk, segments } of chunks)
    for (const segment of segments) {
      const startMs = Math.max(0, Math.min(durationMs, chunk.startMs + segment.startMs));
      const endMs = Math.max(0, Math.min(durationMs, chunk.endMs, chunk.startMs + segment.endMs));
      if (endMs <= startMs || !segment.text.trim()) continue;
      const midpoint = (startMs + endMs) / 2;
      candidates.push({
        startMs,
        endMs,
        text: segment.text.trim(),
        owner: chunk.coreStartMs,
        inCore:
          midpoint >= chunk.coreStartMs && (midpoint < chunk.coreEndMs || midpoint === durationMs),
      });
    }
  const retained: Candidate[] = [];
  const byOwner = new Map<number, Candidate[]>();
  const keep = (candidate: Candidate) => {
    retained.push(candidate);
    const list = byOwner.get(candidate.owner) ?? [];
    list.push(candidate);
    byOwner.set(candidate.owner, list);
  };
  for (const candidate of candidates) if (candidate.inCore) keep(candidate);
  // Midpoints vary between independent recognitions. Do not discard both
  // versions of boundary speech merely because each points into its neighbour.
  for (const candidate of candidates)
    if (!candidate.inCore) {
      const neighbour =
        byOwner.get(
          candidate.startMs < candidate.owner ? candidate.owner - 300000 : candidate.owner + 300000,
        ) ?? [];
      const text = normalized(candidate.text);
      const covered = neighbour.some((other) => {
        if (candidate.startMs >= other.endMs || candidate.endMs <= other.startMs) return false;
        const midpoint = (candidate.startMs + candidate.endMs) / 2;
        if (midpoint >= other.startMs && midpoint <= other.endMs) return true;
        const otherText = normalized(other.text);
        return (
          text &&
          otherText &&
          (` ${text} `.includes(` ${otherText} `) || ` ${otherText} `.includes(` ${text} `))
        );
      });
      if (!covered) keep(candidate);
    }
  retained.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const result: TranscriptSegment[] = [];
  let previousOwner = -1;
  for (const candidate of retained) {
    let { startMs, text } = candidate;
    const { endMs, owner } = candidate;
    const previous = result.at(-1);
    // Trim only matching text in actual overlap between different chunks.
    // Repetitions within a chunk or without temporal overlap are preserved.
    if (
      previous &&
      previousOwner !== owner &&
      startMs < previous.endMs &&
      endMs > previous.startMs
    ) {
      const before = words(previous.text),
        after = words(text);
      if (normalized(previous.text) === normalized(text)) continue;
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
      previousOwner = owner;
    }
  }
  return result;
}
