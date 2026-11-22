export function transcriptionFixture() {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const listeners = new Set(),
    modelListeners = new Set();
  const state = { schemaVersion: 1, mode: 'paused', items: [] };
  const models = Object.fromEntries(
    ['small', 'medium'].map((id) => [
      id,
      {
        spec: {
          id,
          revision: 'fixed',
          bytes: id === 'small' ? 487601967 : 1533763059,
          sha256: '0'.repeat(64),
          url: 'https://example.test/model',
        },
        state: id === 'small' ? 'installed' : 'missing',
        bytesOnDisk: id === 'small' ? 487601967 : 0,
        path: `/home/teste/.config/Vora/models/whisper/${id}/fixed/ggml-${id}.bin`,
      },
    ]),
  );
  const changed = () => listeners.forEach((callback) => callback(copy(state)));
  const modelChanged = () => modelListeners.forEach((callback) => callback(copy(models)));
  const source = {
    id: 'selected-file',
    name: 'entrevista.mp4',
    size: 1234567,
    durationMs: 120000,
    origin: 'local',
  };
  const calls = [];
  window.vora.transcriptions = {
    snapshot: async () => copy(state),
    chooseFiles: async () => [copy(source)],
    fromDownload: async () => ({
      ...source,
      id: 'download-file',
      name: 'baixado.mp4',
      origin: 'download',
    }),
    chooseDirectory: async () => ({ id: 'separate-output', path: '/home/teste/Transcricoes' }),
    add: async (request) => {
      calls.push(copy(request));
      const ids = request.sourceIds.map((id, index) => {
        const job = {
          id: `job-${state.items.length + index}`,
          source: { ...source, id, name: id === 'download-file' ? 'baixado.mp4' : source.name },
          destination: request.destinationId ? '/home/teste/Transcricoes' : '/home/teste/Videos',
          options: copy(request.options),
          modelRevision: 'fixed',
          status: models[request.options.modelId].state === 'installed' ? 'waiting' : 'model',
          outputs: [],
        };
        state.items.push(job);
        return job.id;
      });
      if (request.start) state.mode = 'running';
      changed();
      return ids;
    },
    start: async () => {
      state.mode = 'running';
      changed();
    },
    pause: async () => {
      state.mode = 'paused';
      changed();
    },
    cancel: async (id) => {
      state.items.find((item) => item.id === id).status = 'cancelled';
      changed();
    },
    remove: async (id) => {
      state.items = state.items.filter((item) => item.id !== id);
      changed();
    },
    retry: async (id) => {
      state.items.find((item) => item.id === id).status = 'waiting';
      changed();
    },
    clearCompleted: async () => {
      state.items = state.items.filter((item) => item.status !== 'completed');
      changed();
    },
    openOutput: async (id, format) => {
      calls.push({ open: id, format });
    },
    showOutput: async () => {},
    savePreferences: async (options) => copy(options),
    onChange: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
  window.vora.models = {
    snapshot: async () => copy(models),
    install: async (id) => {
      models[id].state = 'downloading';
      models[id].receivedBytes = 100;
      modelChanged();
    },
    cancel: async (id) => {
      models[id].state = 'partial';
      models[id].bytesOnDisk = 100;
      modelChanged();
    },
    remove: async (id) => {
      models[id].state = 'missing';
      models[id].bytesOnDisk = 0;
      modelChanged();
    },
    discardPartial: async (id) => {
      models[id].state = 'missing';
      models[id].bytesOnDisk = 0;
      modelChanged();
    },
    openDirectory: async () => {},
    onChange: (callback) => {
      modelListeners.add(callback);
      return () => modelListeners.delete(callback);
    },
  };
  window.__transcription = {
    state: () => copy(state),
    calls: () => copy(calls),
    listeners: () => ({ queue: listeners.size, models: modelListeners.size }),
    setStatus: (id, status) => {
      const item = state.items.find((item) => item.id === id);
      item.status = status;
      if (status === 'completed')
        item.outputs = [
          { format: 'txt', path: '/home/teste/Videos/entrevista.transcricao.txt', size: 30 },
          { format: 'srt', path: '/home/teste/Videos/entrevista.transcricao.srt', size: 60 },
        ];
      if (
        status === 'completed' &&
        !state.items.some((job) =>
          ['model', 'waiting', 'preparing', 'transcribing', 'saving'].includes(job.status),
        )
      )
        state.mode = 'paused';
      changed();
    },
    finishModel: (id) => {
      models[id].state = 'installed';
      models[id].bytesOnDisk = models[id].spec.bytes;
      modelChanged();
    },
    missingSmall: () => {
      models.small.state = 'missing';
      modelChanged();
    },
  };
}
