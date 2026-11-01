export type MediaKind = 'video' | 'audio';
export type VideoMode = 'compatible' | 'original';
export type AudioMode = 'original' | 'mp3';
export type JobStage = 'downloading' | 'merging' | 'converting' | 'saving';
export type TransferKind = 'video' | 'audio' | 'combined';
export interface TransferProgress {
  kind: TransferKind;
  status: 'waiting' | 'downloading' | 'complete';
  percent?: number;
}
export interface DownloadPreferences {
  kind: MediaKind;
  videoMode: VideoMode;
  audioMode: AudioMode;
  quality?: { height: number; fps: number };
}
export interface RecoveryItem {
  id: string;
  title: string;
  url: string;
  destination: string;
  createdAt: string;
  size: number;
  running?: boolean;
  queueItemId?: string;
}

export interface VideoOption {
  id: string;
  label: string;
  height: number;
  fps: number;
  container: 'mp4' | 'webm' | 'mkv';
  videoId: string;
  audioId?: string;
  estimatedSize?: number;
}
export interface VideoInfo {
  id: string;
  url: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail?: string;
  compatible: VideoOption[];
  original: VideoOption[];
  audio?: { id: string; extension: string; bitrate?: number; estimatedSize?: number };
}
export interface DownloadRequest {
  videoId: string;
  kind: MediaKind;
  videoMode: VideoMode;
  optionId?: string;
  audioMode: AudioMode;
}
export type FailureReason = 'item' | 'destination' | 'space' | 'tools' | 'network';
export type JobEvent = (
  | {
      type: 'progress';
      stage: JobStage;
      percent?: number;
      speed?: number;
      eta?: number;
      track?: TransferKind;
      transfers?: TransferProgress[];
    }
  | { type: 'complete'; filename: string; path: string; size: number; cleanupPending?: boolean }
  | { type: 'cancelled'; cleanupPending?: boolean }
  | {
      type: 'error';
      message: string;
      cleanupPending?: boolean;
      reason?: FailureReason;
    }
) & { itemId?: string };

export type QueueItemStatus =
  | 'waiting'
  | 'analyzing'
  | 'downloading'
  | 'processing'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export interface QueueGroup {
  id: string;
  label: string;
  createdAt: string;
  preferences: DownloadPreferences;
  destination: string;
}
export interface QueuePreview {
  title: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
}
export interface QueueItem {
  id: string;
  groupId: string;
  preview?: QueuePreview;
  previewState?: 'pending' | 'loading' | 'ready' | 'error';
  previewError?: string;
  url: string;
  title: string;
  preferences: DownloadPreferences;
  destination: string;
  status: QueueItemStatus;
  attempt?: number;
  retryAt?: number;
  error?: string;
  progress?: Extract<JobEvent, { type: 'progress' }>;
  result?: Extract<JobEvent, { type: 'complete' }>;
  cleanupPending?: boolean;
}
export interface QueueSnapshot {
  groups: QueueGroup[];
  items: QueueItem[];
  mode: 'paused' | 'running' | 'pausing';
  activeId?: string;
  pauseReason?: string;
}
export interface QueueAddResult {
  added: number;
  ignored: number;
}
export interface PlaylistEntry {
  index: number;
  title: string;
  url?: string;
  duration?: number;
  available: boolean;
}
export interface PlaylistSummary {
  id: string;
  title: string;
  count: number;
  state: 'loading' | 'complete' | 'cancelled' | 'error';
  error?: string;
}
export interface PlaylistPage extends PlaylistSummary {
  entries: PlaylistEntry[];
  page: number;
}

export interface AppSettings {
  notificationsEnabled: boolean;
  destination: string;
  preferences: DownloadPreferences;
}
export interface ToolVersion {
  name: string;
  version?: string;
  error?: string;
}
export interface AppInfo {
  version: string;
  tools: ToolVersion[];
}
export type UpdateStatus =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';
export interface UpdateSnapshot {
  status: UpdateStatus;
  currentVersion: string;
  version?: string;
  notes?: string;
  message?: string;
  percent?: number;
  bytesPerSecond?: number;
  canInstall: boolean;
}
export interface VoraAPI {
  updates(): Promise<UpdateSnapshot>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  openReleases(): Promise<void>;
  onUpdate(callback: (snapshot: UpdateSnapshot) => void): () => void;
  settings(): Promise<AppSettings>;
  setNotificationsEnabled(enabled: boolean): Promise<boolean>;
  testNotification(): Promise<void>;
  savePreferences(preferences: DownloadPreferences): Promise<DownloadPreferences>;
  recoveries(): Promise<RecoveryItem[]>;
  cleanupRecovery(id: string): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  pasteLink(): Promise<string>;
  analyze(url: string): Promise<VideoInfo>;
  queue(): Promise<QueueSnapshot>;
  addLinks(urls: string[], preferences: DownloadPreferences): Promise<QueueAddResult>;
  addPlaylist(
    importId: string,
    indices: number[],
    preferences: DownloadPreferences,
  ): Promise<QueueAddResult>;
  chooseGroupDirectory(id: string): Promise<string | null>;
  editQueueGroup(
    id: string,
    preferences: DownloadPreferences,
    useSelectedDirectory: boolean,
  ): Promise<void>;
  startQueue(): Promise<void>;
  pauseQueue(): Promise<void>;
  cancelItem(id: string): Promise<void>;
  removeItem(id: string): Promise<void>;
  moveItem(id: string, direction: 'up' | 'down'): Promise<void>;
  retryItem(id: string): Promise<void>;
  clearCompleted(): Promise<void>;
  playlistStart(url: string, id: string): Promise<void>;
  playlistPage(id: string, page: number): Promise<PlaylistPage>;
  playlistAvailable(id: string): Promise<number[]>;
  playlistCancel(id: string): Promise<void>;
  playlistDispose(id: string): Promise<void>;
  onPlaylist(callback: (event: PlaylistSummary) => void): () => void;
  onQueue(callback: (snapshot: QueueSnapshot) => void): () => void;
  openDestination(): Promise<void>;
  openCompletedFile(id: string): Promise<void>;
  showCompletedFile(id: string): Promise<void>;
  copyCompletedPath(id: string): Promise<void>;
  info(): Promise<AppInfo>;
  onJob(callback: (event: JobEvent) => void): () => void;
}
