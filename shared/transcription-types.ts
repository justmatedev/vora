export type WhisperModelId = 'small' | 'medium';
export type TranscriptFormat = 'txt' | 'srt';
export interface TranscriptionOptions {
  modelId: WhisperModelId;
  language: string;
  formats: TranscriptFormat[];
}
export interface ModelSpec {
  id: WhisperModelId;
  revision: string;
  bytes: number;
  sha256: string;
  url: string;
}
export interface ModelPaths {
  directory: string;
  partial: string;
  partialMeta: string;
  installed: string;
}
export interface ModelProgress {
  message?: string;
  state: 'downloading' | 'verifying';
  receivedBytes: number;
  totalBytes: number;
}
export interface ModelInfo {
  message?: string;
  spec: ModelSpec;
  state: 'missing' | 'partial' | 'downloading' | 'verifying' | 'installed' | 'error';
  bytesOnDisk: number;
  path: string;
  receivedBytes?: number;
  error?: string;
}
export type ModelSnapshot = Record<WhisperModelId, ModelInfo>;
export interface SourceSelection {
  id: string;
  name: string;
  size: number;
  durationMs: number;
  origin: 'local' | 'download';
}
export interface SourceRecord extends SourceSelection {
  path: string;
  mtimeMs: number;
  device: string;
  inode: string;
  audioStreamIndex: number;
}
export interface DestinationSelection {
  id: string;
  path: string;
}
export interface LocalMedia {
  durationMs: number;
  audioStreamIndex: number;
}
export interface TranscriptionWork {
  id: string;
  source: SourceRecord;
  destination: string;
  options: TranscriptionOptions;
  modelRevision: string;
}
export interface TranscriptionProgress {
  stage: 'preparing' | 'transcribing' | 'saving';
  percent?: number;
}
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}
export interface TranscriptDocument {
  language: string;
  durationMs: number;
  segments: TranscriptSegment[];
}
export interface AudioChunk {
  coreStartMs: number;
  coreEndMs: number;
  startMs: number;
  endMs: number;
}
export interface ChunkTranscript {
  chunk: AudioChunk;
  language: string;
  segments: TranscriptSegment[];
}
export interface TranscriptOutput {
  format: TranscriptFormat;
  path: string;
  size: number;
}
export interface TranscriptionItem extends TranscriptionWork {
  status:
    | 'model'
    | 'waiting'
    | 'preparing'
    | 'transcribing'
    | 'saving'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'interrupted';
  progress?: TranscriptionProgress;
  outputs: TranscriptOutput[];
  error?: string;
  cleanupPending?: boolean;
}
export interface TranscriptionSnapshot {
  schemaVersion: 1;
  mode: 'paused' | 'running' | 'pausing';
  items: TranscriptionItem[];
  activeId?: string;
  error?: string;
}
export interface TranscriptionSelectionRequest {
  sourceIds: string[];
  options: TranscriptionOptions;
  destinationId?: string;
  downloadModel: boolean;
  start: boolean;
}
export interface TranscriptionsAPI {
  snapshot(): Promise<TranscriptionSnapshot>;
  chooseFiles(): Promise<SourceSelection[]>;
  fromDownload(id: string): Promise<SourceSelection>;
  chooseDirectory(): Promise<DestinationSelection | null>;
  add(request: TranscriptionSelectionRequest): Promise<string[]>;
  start(): Promise<void>;
  pause(): Promise<void>;
  cancel(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  clearCompleted(): Promise<void>;
  openOutput(id: string, format: TranscriptFormat): Promise<void>;
  showOutput(id: string, format: TranscriptFormat): Promise<void>;
  savePreferences(options: TranscriptionOptions): Promise<TranscriptionOptions>;
  onChange(callback: (snapshot: TranscriptionSnapshot) => void): () => void;
}
export interface ModelsAPI {
  snapshot(): Promise<ModelSnapshot>;
  install(id: WhisperModelId): Promise<void>;
  cancel(id: WhisperModelId): Promise<void>;
  discardPartial(id: WhisperModelId): Promise<void>;
  remove(id: WhisperModelId): Promise<void>;
  openDirectory(): Promise<void>;
  onChange(callback: (snapshot: ModelSnapshot) => void): () => void;
}
