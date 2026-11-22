import { contextBridge, ipcRenderer } from 'electron';
import type {
  JobEvent,
  VoraAPI,
  QueueSnapshot,
  PlaylistSummary,
  UpdateSnapshot,
} from '../shared/types';

const api: VoraAPI = {
  transcriptions: {
    snapshot: () => ipcRenderer.invoke('vora:transcriptions'),
    chooseFiles: () => ipcRenderer.invoke('vora:transcription-choose-files'),
    fromDownload: (id) => ipcRenderer.invoke('vora:transcription-from-download', id),
    chooseDirectory: () => ipcRenderer.invoke('vora:transcription-directory'),
    add: (request) => ipcRenderer.invoke('vora:transcription-add', request),
    start: () => ipcRenderer.invoke('vora:transcription-start'),
    pause: () => ipcRenderer.invoke('vora:transcription-pause'),
    cancel: (id) => ipcRenderer.invoke('vora:transcription-cancel', id),
    remove: (id) => ipcRenderer.invoke('vora:transcription-remove', id),
    retry: (id) => ipcRenderer.invoke('vora:transcription-retry', id),
    clearCompleted: () => ipcRenderer.invoke('vora:transcription-clear'),
    openOutput: (id, format) => ipcRenderer.invoke('vora:transcription-open-output', id, format),
    showOutput: (id, format) => ipcRenderer.invoke('vora:transcription-show-output', id, format),
    savePreferences: (options) => ipcRenderer.invoke('vora:transcription-preferences', options),
    onChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        value: import('../shared/transcription-types').TranscriptionSnapshot,
      ) => callback(value);
      ipcRenderer.on('vora:transcriptions', listener);
      return () => ipcRenderer.removeListener('vora:transcriptions', listener);
    },
  },
  models: {
    snapshot: () => ipcRenderer.invoke('vora:models'),
    install: (id) => ipcRenderer.invoke('vora:model-install', id),
    cancel: (id) => ipcRenderer.invoke('vora:model-cancel', id),
    discardPartial: (id) => ipcRenderer.invoke('vora:model-discard-partial', id),
    remove: (id) => ipcRenderer.invoke('vora:model-remove', id),
    openDirectory: () => ipcRenderer.invoke('vora:model-open-directory'),
    onChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        value: import('../shared/transcription-types').ModelSnapshot,
      ) => callback(value);
      ipcRenderer.on('vora:models', listener);
      return () => ipcRenderer.removeListener('vora:models', listener);
    },
  },
  updates: () => ipcRenderer.invoke('vora:updates'),
  checkForUpdates: () => ipcRenderer.invoke('vora:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('vora:update-download'),
  installUpdate: () => ipcRenderer.invoke('vora:update-install'),
  openReleases: () => ipcRenderer.invoke('vora:update-releases'),
  onUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: UpdateSnapshot) =>
      callback(snapshot);
    ipcRenderer.on('vora:update', listener);
    return () => ipcRenderer.removeListener('vora:update', listener);
  },
  setNotificationsEnabled: (enabled) => ipcRenderer.invoke('vora:notifications-enabled', enabled),
  testNotification: () => ipcRenderer.invoke('vora:notification-test'),
  settings: () => ipcRenderer.invoke('vora:settings'),
  savePreferences: (preferences) => ipcRenderer.invoke('vora:save-preferences', preferences),
  recoveries: () => ipcRenderer.invoke('vora:recoveries'),
  cleanupRecovery: (id) => ipcRenderer.invoke('vora:cleanup-recovery', id),
  chooseDirectory: () => ipcRenderer.invoke('vora:choose-directory'),
  pasteLink: () => ipcRenderer.invoke('vora:paste'),
  analyze: (url) => ipcRenderer.invoke('vora:analyze', url),
  queue: () => ipcRenderer.invoke('vora:queue'),
  addLinks: (urls, preferences) => ipcRenderer.invoke('vora:add-links', urls, preferences),
  addPlaylist: (id, indices, preferences) =>
    ipcRenderer.invoke('vora:add-playlist', id, indices, preferences),
  chooseGroupDirectory: (id) => ipcRenderer.invoke('vora:group-directory', id),
  editQueueGroup: (id, preferences, useSelectedDirectory) =>
    ipcRenderer.invoke('vora:group-edit', id, preferences, useSelectedDirectory),
  startQueue: () => ipcRenderer.invoke('vora:queue-start'),
  pauseQueue: () => ipcRenderer.invoke('vora:queue-pause'),
  cancelItem: (id) => ipcRenderer.invoke('vora:queue-cancel', id),
  removeItem: (id) => ipcRenderer.invoke('vora:queue-remove', id),
  moveItem: (id, direction) => ipcRenderer.invoke('vora:queue-move', id, direction),
  retryItem: (id) => ipcRenderer.invoke('vora:queue-retry', id),
  clearCompleted: () => ipcRenderer.invoke('vora:queue-clear'),
  playlistStart: (url, id) => ipcRenderer.invoke('vora:playlist-start', url, id),
  playlistPage: (id, page) => ipcRenderer.invoke('vora:playlist-page', id, page),
  playlistAvailable: (id) => ipcRenderer.invoke('vora:playlist-available', id),
  playlistCancel: (id) => ipcRenderer.invoke('vora:playlist-cancel', id),
  playlistDispose: (id) => ipcRenderer.invoke('vora:playlist-dispose', id),
  onQueue: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: QueueSnapshot) =>
      callback(snapshot);
    ipcRenderer.on('vora:queue', listener);
    return () => ipcRenderer.removeListener('vora:queue', listener);
  },
  onPlaylist: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, summary: PlaylistSummary) =>
      callback(summary);
    ipcRenderer.on('vora:playlist', listener);
    return () => ipcRenderer.removeListener('vora:playlist', listener);
  },
  openDestination: () => ipcRenderer.invoke('vora:open-destination'),
  openCompletedFile: (id) => ipcRenderer.invoke('vora:open-completed-file', id),
  showCompletedFile: (id) => ipcRenderer.invoke('vora:show-completed-file', id),
  copyCompletedPath: (id) => ipcRenderer.invoke('vora:copy-completed-path', id),
  info: () => ipcRenderer.invoke('vora:info'),
  onJob: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: JobEvent) => callback(message);
    ipcRenderer.on('vora:job', listener);
    return () => ipcRenderer.removeListener('vora:job', listener);
  },
};
contextBridge.exposeInMainWorld('vora', api);
