// Browser IPC fixture; scheduling and durable state are tested against QueueManager.
export function queueFixture() {
  const canonical = (id) => `https://www.youtube.com/watch?v=${id}`;
  const firstUrl = canonical('BaW_jenozKc');
  let preferences = JSON.parse(localStorage.getItem('test-preferences') || 'null') || {
    kind: 'video',
    videoMode: 'compatible',
    audioMode: 'original',
  };
  let destination = '/home/teste/Downloads';
  let notificationsEnabled = JSON.parse(localStorage.getItem('test-notifications') ?? 'true');
  let update = { status: 'idle', currentVersion: '0.6.0', canInstall: false };
  const updateListeners = new Set();
  const setUpdate = (value) => {
    update = { ...update, ...value };
    updateListeners.forEach((callback) => callback(JSON.parse(JSON.stringify(update))));
  };
  const snapshot = JSON.parse(localStorage.getItem('test-queue') || 'null') || {
    groups: [],
    items: [],
    mode: 'paused',
  };
  snapshot.mode = 'paused';
  delete snapshot.activeId;
  snapshot.items.forEach((item) => {
    if (['analyzing', 'downloading', 'processing'].includes(item.status))
      item.status = 'interrupted';
  });
  const queueListeners = new Set(),
    jobListeners = new Set(),
    playlistListeners = new Set(),
    listings = new Map();
  let recoveries = [];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const notify = () => {
    localStorage.setItem('test-queue', JSON.stringify(snapshot));
    queueListeners.forEach((callback) => callback(copy(snapshot)));
  };
  const video = (url) => ({
    id: new URL(url).searchParams.get('v'),
    url,
    title: 'Vídeo individual de teste',
    channel: 'Canal de teste',
    duration: 125,
    compatible: [
      {
        id: 'c-137',
        label: '1080p',
        height: 1080,
        fps: 30,
        container: 'mp4',
        videoId: '137',
        audioId: '140',
        estimatedSize: 1024 ** 2 * 42,
      },
      {
        id: 'c-298',
        label: '720p · 60 fps',
        height: 720,
        fps: 60,
        container: 'mp4',
        videoId: '298',
        audioId: '140',
      },
      {
        id: 'c-135',
        label: '480p',
        height: 480,
        fps: 30,
        container: 'mp4',
        videoId: '135',
        audioId: '140',
      },
    ],
    original: [
      {
        id: 'o-248',
        label: '2160p · 60 fps',
        height: 2160,
        fps: 60,
        container: 'webm',
        videoId: '248',
        audioId: '251',
      },
    ],
    audio: { id: '251', extension: 'webm', bitrate: 160 },
  });
  const add = (entries, config, label = 'Links') => {
    const group = {
      id: crypto.randomUUID(),
      label,
      destination,
      preferences: copy(config),
      createdAt: new Date().toISOString(),
    };
    let added = 0,
      ignored = 0;
    const seen = new Set();
    for (const entry of entries) {
      if (
        seen.has(entry.url) ||
        snapshot.items.some(
          (item) =>
            item.status === 'waiting' &&
            item.url === entry.url &&
            JSON.stringify(item.preferences) === JSON.stringify(config) &&
            item.destination === destination,
        )
      ) {
        ignored++;
        continue;
      }
      seen.add(entry.url);
      snapshot.items.push({
        id: crypto.randomUUID(),
        groupId: group.id,
        url: entry.url,
        title:
          entry.title ||
          (entry.url === firstUrl
            ? 'Vídeo individual de teste'
            : `Link ${new URL(entry.url).searchParams.get('v')}`),
        preferences: copy(config),
        destination,
        status: 'waiting',
      });
      added++;
    }
    if (added) snapshot.groups.push(group);
    notify();
    return { added, ignored };
  };
  function progress(event) {
    const item = snapshot.items.find((item) => item.id === snapshot.activeId);
    if (!item) throw new Error('No active fixture item');
    if (event.type === 'progress') item.progress = event;
    else {
      delete item.progress;
      if (event.type === 'complete') {
        item.status = 'completed';
        item.result = { ...event, itemId: item.id };
      }
      if (event.type === 'error') {
        item.status = 'failed';
        item.error = event.message;
      }
      if (event.type === 'cancelled') item.status = 'cancelled';
      delete snapshot.activeId;
      snapshot.mode = 'paused';
      notify();
    }
    jobListeners.forEach((callback) => callback({ ...event, itemId: item.id }));
  }
  window.__test = {
    updateActions: [],
    setUpdate,
    actions: [],
    holdPlaylist: false,
    analyzed: [],
    selectedIndices: [],
    state: () => copy(snapshot),
    replaceQueue: (value) => {
      Object.keys(snapshot).forEach((key) => delete snapshot[key]);
      Object.assign(snapshot, copy(value));
      notify();
    },
    activate: (id) => {
      const item = snapshot.items.find((item) => item.id === id);
      const previous = snapshot.items.find((item) => item.id === snapshot.activeId);
      if (previous && previous.id !== id) {
        previous.status = 'completed';
        delete previous.progress;
        previous.result = {
          type: 'complete',
          path: `${previous.destination}/arquivo.mp4`,
          filename: 'arquivo.mp4',
          size: 1024,
        };
      }
      snapshot.activeId = id;
      snapshot.mode = 'running';
      item.status = 'downloading';
      item.progress = { type: 'progress', stage: 'downloading', track: 'video', percent: 30 };
      notify();
    },
    setRecoveries: (items) => {
      recoveries = copy(items);
      jobListeners.forEach((callback) => callback({ type: 'cancelled', itemId: 'recovery-test' }));
    },
    notificationTests: 0,
    retrying: () => {
      const item = snapshot.items.find((item) => item.id === snapshot.activeId);
      delete item.progress;
      item.status = 'retrying';
      item.attempt = 1;
      item.retryAt = Date.now() + 15_000;
      item.error = 'Não foi possível conectar ao YouTube.';
      notify();
    },
    setPreview: (index, state, preview) => {
      const item = snapshot.items[index];
      item.previewState = state;
      item.preview = preview;
      if (preview) item.title = preview.title;
      notify();
    },
  };
  window.__emit = progress;
  window.__complete = () => {
    const item = snapshot.items.find((item) => item.id === snapshot.activeId);
    const filename =
      item.preferences.kind === 'audio' ? 'Áudio de teste.mp3' : 'Vídeo de teste.mp4';
    progress({
      type: 'complete',
      filename,
      path: `${item.destination}/${filename}`,
      size: 1024 ** 2 * 42,
    });
  };
  const fileAction = (id, action) => {
    if (!snapshot.items.find((item) => item.id === id)?.result)
      throw new Error('Nenhum arquivo concluído disponível.');
    window.__test.actions.push({ id, action });
  };
  window.vora = {
    updates: async () => copy(update),
    checkForUpdates: async () => {
      window.__test.updateActions.push('check');
      setUpdate({
        status: 'available',
        version: '0.7.0',
        notes: 'Melhorias de teste',
        message: undefined,
      });
    },
    downloadUpdate: async () => {
      window.__test.updateActions.push('download');
      setUpdate({ status: 'downloading', percent: 42, bytesPerSecond: 1024 ** 2 });
    },
    installUpdate: async () => {
      if (!update.canInstall) throw new Error('Pause a fila antes de instalar.');
      window.__test.updateActions.push('install');
      setUpdate({ status: 'installing', canInstall: false });
    },
    openReleases: async () => {
      window.__test.updateActions.push('releases');
    },
    onUpdate: (callback) => {
      updateListeners.add(callback);
      return () => updateListeners.delete(callback);
    },
    settings: async () => ({ destination, preferences, notificationsEnabled }),
    setNotificationsEnabled: async (value) => {
      notificationsEnabled = value;
      localStorage.setItem('test-notifications', JSON.stringify(value));
      return value;
    },
    testNotification: async () => {
      window.__test.notificationTests++;
    },
    savePreferences: async (value) => {
      preferences = copy(value);
      localStorage.setItem('test-preferences', JSON.stringify(value));
      return value;
    },
    chooseDirectory: async () => {
      destination = '/home/teste/Vídeos com espaços';
      return destination;
    },
    pasteLink: async () => firstUrl,
    analyze: async (url) => {
      window.__test.analyzed.push(url);
      return video(url);
    },
    queue: async () => copy(snapshot),
    addLinks: async (urls, config) =>
      add(
        urls.map((url) => ({ url })),
        config,
      ),
    addPlaylist: async (id, indices, config) => {
      window.__test.selectedIndices = indices;
      const listing = listings.get(id);
      return add(
        listing.entries
          .filter((entry) => indices.includes(entry.index))
          .map((entry) => ({ url: entry.url, title: entry.title })),
        config,
        listing.title,
      );
    },
    chooseGroupDirectory: async () => '/home/teste/Novo destino á',
    editQueueGroup: async (id, preferences, useSelectedDirectory) => {
      const group = snapshot.groups.find((group) => group.id === id);
      group.preferences = copy(preferences);
      if (useSelectedDirectory) group.destination = '/home/teste/Novo destino á';
      snapshot.items
        .filter((item) => item.groupId === id && item.status === 'waiting')
        .forEach((item) => {
          item.preferences = copy(preferences);
          item.destination = group.destination;
        });
      notify();
    },
    startQueue: async () => {
      const item = snapshot.items.find((item) => item.status === 'waiting');
      if (!item) return;
      snapshot.mode = 'running';
      snapshot.activeId = item.id;
      item.status = 'downloading';
      notify();
      progress({
        type: 'progress',
        stage: 'downloading',
        track: item.preferences.kind === 'audio' ? 'audio' : 'video',
        percent: 42,
        speed: 3 * 1024 ** 2,
        eta: 30,
        transfers:
          item.preferences.kind === 'audio'
            ? [{ kind: 'audio', status: 'downloading', percent: 42 }]
            : [
                { kind: 'video', status: 'downloading', percent: 42 },
                { kind: 'audio', status: 'waiting' },
              ],
      });
    },
    pauseQueue: async () => {
      snapshot.mode = snapshot.activeId ? 'pausing' : 'paused';
      notify();
    },
    cancelItem: async (id) => {
      if (snapshot.activeId !== id) throw new Error('not active');
      progress({ type: 'cancelled' });
    },
    removeItem: async (id) => {
      snapshot.items = snapshot.items.filter((item) => item.id !== id);
      notify();
    },
    moveItem: async (id, direction) => {
      const pending = snapshot.items.filter((item) => item.status === 'waiting');
      const index = pending.findIndex((item) => item.id === id),
        other = pending[index + (direction === 'up' ? -1 : 1)];
      if (other) {
        const a = snapshot.items.findIndex((item) => item.id === id),
          b = snapshot.items.indexOf(other);
        [snapshot.items[a], snapshot.items[b]] = [snapshot.items[b], snapshot.items[a]];
      }
      notify();
    },
    retryItem: async (id) => {
      const item = snapshot.items.find((item) => item.id === id);
      item.status = 'waiting';
      delete item.error;
      recoveries = recoveries.filter((item) => item.queueItemId !== id);
      notify();
    },
    clearCompleted: async () => {
      snapshot.items = snapshot.items.filter((item) => item.status !== 'completed');
      notify();
    },
    recoveries: async () => copy(recoveries),
    cleanupRecovery: async (id) => {
      recoveries = recoveries.filter((item) => item.id !== id);
    },
    openDestination: async () => {},
    openCompletedFile: async (id) => fileAction(id, 'open'),
    showCompletedFile: async (id) => fileAction(id, 'show'),
    copyCompletedPath: async (id) => fileAction(id, 'copy'),
    playlistStart: async (_url, id) => {
      const entries = Array.from({ length: 203 }, (_, i) => ({
        index: i + 1,
        title: i === 1 ? '[Private video]' : `Vídeo da playlist ${i + 1}`,
        url: canonical(String(i + 1).padStart(11, '0')),
        available: i !== 1,
        ...(i === 0 ? { duration: 30 } : {}),
      }));
      const listing = {
        id,
        title: 'Playlist pública de teste',
        state: 'loading',
        count: 1,
        entries,
      };
      listings.set(id, listing);
      playlistListeners.forEach((callback) =>
        callback({ id, title: listing.title, state: 'loading', count: 1 }),
      );
      if (!window.__test.holdPlaylist)
        setTimeout(() => {
          if (!listings.has(id)) return;
          listing.state = 'complete';
          listing.count = entries.length;
          playlistListeners.forEach((callback) =>
            callback({ id, title: listing.title, count: listing.count, state: 'complete' }),
          );
        }, 40);
    },
    playlistPage: async (id, page) => {
      const listing = listings.get(id);
      return {
        ...copy(listing),
        page,
        entries: copy(listing.entries.slice(page * 100, Math.min((page + 1) * 100, listing.count))),
      };
    },
    playlistAvailable: async (id) =>
      listings
        .get(id)
        .entries.filter((entry) => entry.available)
        .map((entry) => entry.index),
    playlistCancel: async (id) => {
      const listing = listings.get(id);
      listing.state = 'cancelled';
      playlistListeners.forEach((callback) =>
        callback({ id, title: listing.title, state: 'cancelled', count: listing.count }),
      );
    },
    playlistDispose: async (id) => {
      listings.delete(id);
    },
    info: async () => ({
      version: '0.6.0',
      tools: [
        { name: 'yt-dlp', version: '2026.10.26' },
        { name: 'FFmpeg', version: '8.1.3' },
      ],
    }),
    onJob: (callback) => {
      jobListeners.add(callback);
      return () => jobListeners.delete(callback);
    },
    onQueue: (callback) => {
      queueListeners.add(callback);
      return () => queueListeners.delete(callback);
    },
    onPlaylist: (callback) => {
      playlistListeners.add(callback);
      return () => playlistListeners.delete(callback);
    },
  };
}
