import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, readdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { QueueManager, requestForItem } from '../electron/queue';
import { DEFAULT_PREFERENCES } from '../shared/preferences';
import type { DownloadPreferences, JobEvent, VideoInfo } from '../shared/types';
import { CancelledError } from '../electron/processes';
import { RecoveryStore } from '../electron/recovery';
import { Downloader } from '../electron/downloader';

const urls = ['BaW_jenozKc', 'aqz-KE-bpKQ', 'M7lc1UVf-VE'].map(
  (id) => `https://www.youtube.com/watch?v=${id}`,
);
function video(url = urls[0]): VideoInfo {
  return {
    id: new URL(url).searchParams.get('v')!,
    url,
    title: `Título ${new URL(url).searchParams.get('v')}`,
    channel: 'Teste',
    duration: 1,
    compatible: [
      {
        id: 'c',
        videoId: '137',
        audioId: '140',
        height: 720,
        fps: 30,
        label: '720p',
        container: 'mp4',
      },
    ],
    original: [
      {
        id: 'o',
        videoId: '248',
        audioId: '251',
        height: 2160,
        fps: 60,
        label: '2160p',
        container: 'webm',
      },
    ],
    audio: { id: '251', extension: 'webm' },
  };
}
async function until(condition: () => boolean, limit = 3000) {
  const deadline = Date.now() + limit;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for queue');
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function setup(overrides: Partial<ConstructorParameters<typeof QueueManager>[1]> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vora-queue-'));
  const deps: ConstructorParameters<typeof QueueManager>[1] = {
    analyze: async (url) => video(url),
    download: async (_info, _request, destination, id) => ({
      type: 'complete',
      filename: `${id}.mp4`,
      path: join(destination, `${id}.mp4`),
      size: 4,
    }),
    cancelDownload: async () => {},
    cleanItem: async () => {},
    ...overrides,
  };
  const events: JobEvent[] = [];
  const manager = new QueueManager(
    join(root, 'queue.json'),
    deps,
    () => {},
    (event) => events.push(event),
  );
  return {
    root,
    deps,
    manager,
    events,
    close: async () => {
      await manager.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test('fila não inicia ao importar, consolida duplicatas e preserva grupos e preferências', async () => {
  const s = await setup();
  try {
    const p = { ...DEFAULT_PREFERENCES, quality: { height: 1080, fps: 30 } };
    assert.deepEqual(
      await s.manager.add([{ url: urls[0] }, { url: urls[0] }, { url: urls[1] }], p, s.root),
      { added: 2, ignored: 1 },
    );
    assert.deepEqual(await s.manager.add([{ url: urls[0] }], p, s.root), { added: 0, ignored: 1 });
    await s.manager.add([{ url: urls[0] }], { ...p, kind: 'audio', audioMode: 'mp3' }, s.root);
    p.quality.height = 144;
    const state = s.manager.snapshot();
    assert.equal(state.mode, 'paused');
    assert.equal(state.groups.length, 2);
    assert.equal(state.items.length, 3);
    assert.equal(state.items[0].preferences.quality?.height, 1080);
    assert.equal(state.items[2].preferences.audioMode, 'mp3');
    const restarted = new QueueManager(
      join(s.root, 'queue.json'),
      s.deps,
      () => {},
      () => {},
    );
    await restarted.load();
    assert.equal(restarted.snapshot().items.length, 3);
    assert.equal(restarted.snapshot().mode, 'paused');
  } finally {
    await s.close();
  }
});
test('execução é estritamente sequencial e consulta cada vídeo na sua vez', async () => {
  let active = 0,
    maximum = 0;
  const order: string[] = [],
    requests: string[] = [];
  const s = await setup({
    analyze: async (url) => {
      order.push(url);
      return video(url);
    },
    download: async (_info, request, destination, id, emit) => {
      active++;
      maximum = Math.max(maximum, active);
      requests.push(request.kind);
      emit({ type: 'progress', stage: 'downloading', percent: 50 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return {
        type: 'complete',
        filename: id + '.mp4',
        path: join(destination, id + '.mp4'),
        size: 4,
      };
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.add(
      [{ url: urls[2] }],
      { ...DEFAULT_PREFERENCES, kind: 'audio', audioMode: 'mp3' },
      s.root,
    );
    await s.manager.start();
    await until(() => s.manager.snapshot().items.every((item) => item.status === 'completed'));
    assert.equal(maximum, 1);
    assert.deepEqual(order, urls);
    assert.deepEqual(requests, ['video', 'video', 'audio']);
    assert.ok(s.events.every((event) => !!event.itemId));
    const results = s.manager.snapshot().items.map((item) => s.manager.result(item.id).path);
    assert.equal(new Set(results).size, 3);
  } finally {
    await s.close();
  }
});
test('pausar aguarda o atual; adicionar durante download não muda sua configuração', async () => {
  const first = gate();
  let entered = false,
    executions = 0;
  const s = await setup({
    download: async (_info, _request, destination, id) => {
      executions++;
      if (!entered) {
        entered = true;
        await first.promise;
      }
      return { type: 'complete', filename: id, path: join(destination, id), size: 4 };
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.start();
    await until(() => entered);
    await s.manager.add(
      [{ url: urls[2] }],
      { ...DEFAULT_PREFERENCES, kind: 'audio' },
      s.root,
      'Segundo grupo',
    );
    await s.manager.pause();
    assert.equal(s.manager.snapshot().mode, 'pausing');
    first.release();
    await until(() => !s.manager.busy);
    assert.equal(executions, 1);
    assert.equal(s.manager.snapshot().mode, 'paused');
    assert.equal(s.manager.snapshot().items.filter((item) => item.status === 'waiting').length, 2);
    await s.manager.start();
    await until(() => s.manager.snapshot().items.every((item) => item.status === 'completed'));
    assert.equal(executions, 3);
  } finally {
    first.release();
    await s.close();
  }
});
test('cancelar análise ou download marca só o item ativo e continua os demais', async () => {
  for (const phase of ['analysis', 'download']) {
    let abortDownload: (() => void) | undefined,
      entered = false;
    const s = await setup({
      analyze: async (url, signal) => {
        if (phase !== 'analysis' || url !== urls[0]) return video(url);
        entered = true;
        if (signal.aborted) throw new CancelledError();
        await new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new CancelledError()), { once: true }),
        );
        return video(url);
      },
      download: async (info, _request, destination, id) => {
        if (phase === 'download' && info.url === urls[0]) {
          entered = true;
          await new Promise((_resolve, reject) => {
            abortDownload = () => reject(new CancelledError());
          });
        }
        return { type: 'complete', filename: id, path: join(destination, id), size: 4 };
      },
      cancelDownload: async () => abortDownload?.(),
    });
    try {
      await s.manager.add(
        urls.slice(0, 2).map((url) => ({ url })),
        DEFAULT_PREFERENCES,
        s.root,
      );
      await s.manager.start();
      await until(() => entered);
      const id = s.manager.snapshot().activeId!;
      await s.manager.cancel(id);
      await until(() => s.manager.snapshot().items[1].status === 'completed');
      assert.equal(s.manager.snapshot().items[0].status, 'cancelled');
    } finally {
      abortDownload?.();
      await s.close();
    }
  }
});
test('falha individual continua; espaço ou destino pausa; retry reutiliza o mesmo item', async () => {
  for (const reason of ['item', 'space', 'destination'] as const) {
    let fail = true,
      cleanCount = 0;
    const s = await setup({
      cleanItem: async () => {
        cleanCount++;
      },
      download: async (info, _request, destination, id) => {
        if (fail && info.url === urls[0])
          return { type: 'error', message: 'Falha controlada', reason };
        return { type: 'complete', filename: id, path: join(destination, id), size: 1 };
      },
    });
    try {
      await s.manager.add(
        urls.slice(0, 2).map((url) => ({ url })),
        DEFAULT_PREFERENCES,
        s.root,
      );
      const id = s.manager.snapshot().items[0].id;
      await s.manager.start();
      await until(() => !s.manager.busy && s.manager.snapshot().mode === 'paused');
      assert.equal(s.manager.snapshot().items[0].status, 'failed');
      assert.equal(
        s.manager.snapshot().items[1].status,
        reason === 'item' ? 'completed' : 'waiting',
      );
      fail = false;
      await s.manager.retry(id);
      assert.equal(s.manager.snapshot().mode, 'paused');
      assert.equal(s.manager.snapshot().items[0].id, id);
      assert.equal(cleanCount, 1);
      await s.manager.start();
      await until(() => s.manager.snapshot().items.every((item) => item.status === 'completed'));
    } finally {
      await s.close();
    }
  }
});
test('reordenação e remoção afetam pendentes; limpar concluídos preserva os arquivos', async () => {
  const s = await setup({
    download: async (_info, _request, destination, id) => {
      const path = join(destination, `${id}.mp4`);
      await writeFile(path, 'file');
      return { type: 'complete', filename: `${id}.mp4`, path, size: 4 };
    },
  });
  try {
    await s.manager.add(
      urls.map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    const ids = s.manager.snapshot().items.map((item) => item.id);
    await s.manager.move(ids[2], 'up');
    assert.deepEqual(
      s.manager.snapshot().items.map((item) => item.id),
      [ids[0], ids[2], ids[1]],
    );
    await s.manager.remove(ids[1]);
    await s.manager.start();
    await until(() => s.manager.snapshot().items.every((item) => item.status === 'completed'));
    await assert.rejects(s.manager.remove(ids[0]));
    const path = s.manager.result(ids[0]).path;
    await s.manager.clearCompleted();
    assert.equal(await readFile(path, 'utf8'), 'file');
    assert.equal(s.manager.snapshot().items.length, 0);
    assert.throws(() => s.manager.result(ids[0]), /encontrado/);
  } finally {
    await s.close();
  }
});
test('seleção estrita nunca troca formato, tipo ou ultrapassa a resolução máxima', () => {
  const info = video();
  assert.throws(
    () => requestForItem({ ...info, compatible: [] }, DEFAULT_PREFERENCES),
    /Nenhum formato/,
  );
  assert.throws(
    () =>
      requestForItem(info, {
        ...DEFAULT_PREFERENCES,
        videoMode: 'original',
        quality: { height: 1080, fps: 60 },
      }),
    /Nenhum formato/,
  );
  assert.throws(
    () => requestForItem({ ...info, audio: undefined }, { ...DEFAULT_PREFERENCES, kind: 'audio' }),
    /Nenhum áudio/,
  );
  assert.equal(
    requestForItem(info, { ...DEFAULT_PREFERENCES, quality: { height: 1080, fps: 60 } }).optionId,
    'c',
  );
});

test('início aguarda processos de sessões anteriores, sem ativar a fila', async () => {
  let previousRunning = true;
  const s = await setup({
    beforeStart: async () => {
      if (previousRunning) throw new Error('processo anterior');
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await assert.rejects(s.manager.start(), /processo anterior/);
    assert.equal(s.manager.snapshot().mode, 'paused');
    assert.equal(s.manager.busy, false);
    previousRunning = false;
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'completed');
  } finally {
    await s.close();
  }
});
test('restaura ativo como interrompido e mantém pendentes pausados, sem executar', async () => {
  const s = await setup();
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    const saved = s.manager.snapshot();
    saved.items[0].status = 'downloading';
    saved.mode = 'running';
    saved.activeId = saved.items[0].id;
    await writeFile(join(s.root, 'queue.json'), JSON.stringify(saved));
    const restored = new QueueManager(
      join(s.root, 'queue.json'),
      s.deps,
      () => {},
      () => {},
    );
    await restored.load();
    assert.equal(restored.snapshot().items[0].status, 'interrupted');
    assert.equal(restored.snapshot().items[1].status, 'waiting');
    assert.equal(restored.snapshot().mode, 'paused');
    assert.equal(restored.busy, false);
  } finally {
    await s.close();
  }
});
test('retry de interrompido limpa o temporário associado e não duplica o item', async () => {
  const s = await setup();
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    const saved = s.manager.snapshot(),
      id = saved.items[0].id;
    saved.items[0].status = 'analyzing';
    await writeFile(join(s.root, 'queue.json'), JSON.stringify(saved));
    const journal = join(s.root, 'recoveries.json'),
      recovery = new RecoveryStore(journal);
    const session = await recovery.create(s.root, video(), id);
    await writeFile(join(session.path, 'partial.part'), 'partial');
    const restarted = new RecoveryStore(journal);
    await restarted.load();
    const q = new QueueManager(
      join(s.root, 'queue.json'),
      {
        ...s.deps,
        cleanItem: async (itemId) => {
          for (const item of await restarted.list())
            if (item.queueItemId === itemId) await restarted.remove(item.id);
        },
      },
      () => {},
      () => {},
    );
    await q.load();
    await q.retry(id);
    assert.equal(q.snapshot().items.length, 1);
    assert.equal(q.snapshot().items[0].id, id);
    assert.equal(q.snapshot().items[0].status, 'waiting');
    assert.deepEqual(await restarted.list(), []);
    assert.ok(!(await readdir(s.root)).some((name) => name.startsWith('.vora-')));
    await q.shutdown();
  } finally {
    await s.close();
  }
});

test('prévias carregam com fila pausada, uma por vez, e persistem sem iniciar downloads', async () => {
  const first = gate();
  let calls = 0,
    active = 0,
    maximum = 0,
    downloads = 0;
  const s = await setup({
    preview: async (url) => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      if (calls === 1) await first.promise;
      active--;
      return { ...video(url), thumbnail: 'https://i.ytimg.com/vi/test/default.jpg' };
    },
    download: async () => {
      downloads++;
      throw new Error('unexpected');
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await until(() => calls === 1);
    assert.equal(s.manager.snapshot().items[0].previewState, 'loading');
    await s.manager.add([{ url: urls[1] }], DEFAULT_PREFERENCES, s.root);
    first.release();
    await until(() => s.manager.snapshot().items.every((item) => item.previewState === 'ready'));
    assert.equal(maximum, 1);
    assert.equal(downloads, 0);
    assert.equal(s.manager.snapshot().mode, 'paused');
    // A restarted instance must not share the journal with a live preview worker.
    await s.manager.shutdown();
    const restored = new QueueManager(
      join(s.root, 'queue.json'),
      s.deps,
      () => {},
      () => {},
    );
    await restored.load();
    assert.equal(restored.snapshot().items[0].preview?.channel, 'Teste');
    assert.equal(restored.snapshot().items[0].preview?.duration, 1);
    assert.match(restored.snapshot().items[0].preview?.thumbnail ?? '', /https:/);
    assert.equal(calls, 2);
    await restored.shutdown();
  } finally {
    first.release();
    await s.close();
  }
});

test('falha de prévia mantém item pendente e execução consulta os dados novamente', async () => {
  let analyses = 0;
  const s = await setup({
    preview: async () => {
      throw new Error('Network unavailable');
    },
    analyze: async (url) => {
      analyses++;
      return video(url);
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await until(() => s.manager.snapshot().items[0].previewState === 'error');
    assert.equal(s.manager.snapshot().items[0].status, 'waiting');
    assert.ok(s.manager.snapshot().items[0].previewError);
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'completed');
    assert.equal(analyses, 1);
    assert.equal(s.manager.snapshot().items[0].previewState, 'ready');
    assert.equal(s.manager.snapshot().items[0].previewError, undefined);
  } finally {
    await s.close();
  }
});

test('remover item cancela sua prévia e continua consultando os demais', async () => {
  let aborted = false;
  const s = await setup({
    preview: async (url, signal) => {
      if (url !== urls[0]) return video(url);
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new CancelledError());
          },
          { once: true },
        ),
      );
      return video(url);
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }, { url: urls[1] }], DEFAULT_PREFERENCES, s.root);
    await until(() => s.manager.snapshot().items[0].previewState === 'loading');
    await s.manager.remove(s.manager.snapshot().items[0].id);
    await until(() => s.manager.snapshot().items[0].previewState === 'ready');
    assert.equal(aborted, true);
    assert.equal(s.manager.snapshot().items.length, 1);
  } finally {
    await s.close();
  }
});

test('iniciar download cancela prévia ativa e encerramento cancela consultas restantes', async () => {
  let aborted = 0,
    calls = 0;
  const s = await setup({
    preview: async (url, signal) => {
      calls++;
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted++;
            reject(new CancelledError());
          },
          { once: true },
        ),
      );
      return video(url);
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await until(() => calls === 1);
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'completed');
    assert.equal(aborted, 1);
    await s.manager.pause();
    await s.manager.add([{ url: urls[1] }], DEFAULT_PREFERENCES, s.root);
    await until(() => calls === 2);
    await s.manager.shutdown();
    assert.equal(aborted, 2);
  } finally {
    await s.close();
  }
});

test('fila antiga consulta informações faltantes ao restaurar e reaproveita prévia conhecida', async () => {
  let calls = 0;
  const s = await setup();
  try {
    await s.manager.add(
      [{ url: urls[0] }, { url: urls[1], title: 'Conhecido', preview: video(urls[1]) }],
      DEFAULT_PREFERENCES,
      s.root,
    );
    const saved = JSON.parse(await readFile(join(s.root, 'queue.json'), 'utf8'));
    delete saved.items[0].previewState;
    await writeFile(join(s.root, 'queue.json'), JSON.stringify(saved));
    const restored = new QueueManager(
      join(s.root, 'queue.json'),
      {
        ...s.deps,
        preview: async (url) => {
          calls++;
          return video(url);
        },
      },
      () => {},
      () => {},
    );
    await restored.load();
    await until(() => restored.snapshot().items.every((item) => item.previewState === 'ready'));
    assert.equal(calls, 1);
    assert.equal(restored.snapshot().mode, 'paused');
    await restored.shutdown();
  } finally {
    await s.close();
  }
});

test('editar grupo altera somente pendentes e conserva identificadores, ordem e prévias', async () => {
  const s = await setup();
  try {
    await s.manager.add(
      [{ url: urls[0], preview: video(urls[0]) }, { url: urls[1] }],
      DEFAULT_PREFERENCES,
      s.root,
    );
    const before = s.manager.snapshot();
    const config = { ...DEFAULT_PREFERENCES, kind: 'audio' as const, audioMode: 'mp3' as const };
    const destination = join(s.root, 'Pasta com acentos á');
    await s.manager.editGroup(before.groups[0].id, config, destination);
    const after = s.manager.snapshot();
    assert.deepEqual(
      after.items.map((item) => item.id),
      before.items.map((item) => item.id),
    );
    assert.equal(after.groups.length, 1);
    assert.equal(after.groups[0].id, before.groups[0].id);
    assert.ok(
      after.items.every(
        (item) => item.preferences.audioMode === 'mp3' && item.destination === destination,
      ),
    );
    assert.deepEqual(after.items[0].preview, before.items[0].preview);
    assert.equal(after.mode, 'paused');
    const restored = new QueueManager(
      join(s.root, 'queue.json'),
      s.deps,
      () => {},
      () => {},
    );
    await restored.load();
    assert.deepEqual(restored.snapshot().items, after.items);
    await restored.shutdown();
    await assert.rejects(s.manager.editGroup(before.groups[0].id, config, 'relative'), /pasta/);
    await assert.rejects(
      s.manager.editGroup(before.groups[0].id, { ...config, audioMode: 'bad' } as any, destination),
      /inválidas/,
    );
  } finally {
    await s.close();
  }
});

test('editar durante download preserva ativo e grupo distinto; pendente usa novas opções', async () => {
  const held = gate();
  const received: { destination: string; kind: string }[] = [];
  const s = await setup({
    download: async (_info, request, destination, id) => {
      received.push({ destination, kind: request.kind });
      if (received.length === 1) await held.promise;
      return {
        type: 'complete',
        path: join(destination, `${id}.mp4`),
        filename: `${id}.mp4`,
        size: 1,
      };
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }, { url: urls[1] }], DEFAULT_PREFERENCES, s.root);
    await s.manager.add([{ url: urls[2] }], DEFAULT_PREFERENCES, s.root, 'Outro');
    const original = s.manager.snapshot();
    await s.manager.start();
    await until(() => received.length === 1);
    const destination = join(s.root, 'Novo destino');
    await s.manager.editGroup(
      original.groups[0].id,
      { ...DEFAULT_PREFERENCES, kind: 'audio' },
      destination,
    );
    const updated = s.manager.snapshot();
    assert.equal(updated.items[0].groupId, original.items[0].groupId);
    assert.equal(updated.items[0].destination, s.root);
    assert.equal(updated.items[1].destination, destination);
    assert.notEqual(updated.items[1].groupId, original.items[1].groupId);
    assert.deepEqual(updated.items[2], original.items[2]);
    held.release();
    await until(() => s.manager.snapshot().items.every((item) => item.status === 'completed'));
    assert.deepEqual(received, [
      { destination: s.root, kind: 'video' },
      { destination, kind: 'audio' },
      { destination: s.root, kind: 'video' },
    ]);
    await assert.rejects(
      s.manager.editGroup(updated.items[1].groupId, DEFAULT_PREFERENCES, s.root),
      /pendentes/,
    );
  } finally {
    held.release();
    await s.close();
  }
});

test('rede repete o mesmo item até três tentativas, consulta formatos novamente e mantém execução sequencial', async () => {
  let calls = 0,
    clean = 0;
  const order: string[] = [],
    delays: number[] = [],
    notices: unknown[] = [];
  const s = await setup({
    retryDelay: (attempt) => {
      delays.push(attempt);
      return 0;
    },
    notice: (notice) => notices.push(notice),
    analyze: async (url) => {
      order.push(url);
      return video(url);
    },
    cleanItem: async () => {
      clean++;
    },
    download: async (_info, _request, destination, id) => {
      calls++;
      return calls < 3
        ? { type: 'error', message: 'Conexão interrompida', reason: 'network' }
        : { type: 'complete', filename: id, path: join(destination, id), size: 1 };
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    const id = s.manager.snapshot().items[0].id;
    await s.manager.start();
    await until(() => notices.length === 1);
    assert.deepEqual(order, [urls[0], urls[0], urls[0], urls[1]]);
    assert.deepEqual(delays, [2, 3]);
    assert.equal(clean, 2);
    assert.equal(s.manager.snapshot().items[0].id, id);
    assert.equal(s.manager.snapshot().items[0].attempt, 3);
    assert.equal(s.manager.snapshot().items.length, 2);
    assert.deepEqual(notices, [{ type: 'finished', completed: 2, failed: 0, cancelled: 0 }]);
  } finally {
    await s.close();
  }
});

test('rede esgotada falha após três tentativas e segue; nova tentativa manual zera o contador', async () => {
  let fail = true,
    calls = 0;
  const notices: unknown[] = [];
  const s = await setup({
    retryDelay: () => 0,
    notice: (notice) => notices.push(notice),
    analyze: async (url) => {
      if (url === urls[0]) {
        calls++;
        if (fail) throw new Error('ECONNRESET');
      }
      return video(url);
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.start();
    await until(() => notices.length === 1);
    assert.equal(calls, 3);
    assert.equal(s.manager.snapshot().items[0].status, 'failed');
    assert.equal(s.manager.snapshot().items[1].status, 'completed');
    assert.deepEqual(notices[0], { type: 'finished', completed: 1, failed: 1, cancelled: 0 });
    fail = false;
    await s.manager.retry(s.manager.snapshot().items[0].id);
    assert.equal(s.manager.snapshot().items[0].attempt, 0);
    await s.manager.start();
    await until(() => notices.length === 2);
    assert.equal(s.manager.snapshot().items[0].attempt, 1);
    assert.deepEqual(notices[1], { type: 'finished', completed: 1, failed: 0, cancelled: 0 });
  } finally {
    await s.close();
  }
});

test('cancelar durante espera encerra imediatamente, não repete e permite seguir ao próximo', async () => {
  let calls = 0;
  const s = await setup({
    retryDelay: () => 60_000,
    analyze: async (url) => {
      calls++;
      if (url === urls[0]) throw new Error('Connection timed out');
      return video(url);
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'retrying');
    assert.ok(s.manager.snapshot().items[0].retryAt! > Date.now());
    await s.manager.cancel(s.manager.snapshot().items[0].id);
    await until(() => s.manager.snapshot().items[1].status === 'completed');
    assert.equal(s.manager.snapshot().items[0].status, 'cancelled');
    assert.equal(calls, 2);
  } finally {
    await s.close();
  }
});

test('reinício restaura espera como interrompida; encerrar cancela temporizador sem notificar', async () => {
  const notices: unknown[] = [];
  const s = await setup({
    retryDelay: () => 60_000,
    notice: (notice) => notices.push(notice),
    analyze: async () => {
      throw new Error('Connection timed out');
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'retrying');
    // Flush the saved retry state and restore a copy, simulating a separate session.
    await s.manager.pause();
    const restoredPath = join(s.root, 'restored.json');
    await copyFile(join(s.root, 'queue.json'), restoredPath);
    const restored = new QueueManager(
      restoredPath,
      s.deps,
      () => {},
      () => {},
    );
    await restored.load();
    assert.equal(restored.snapshot().mode, 'paused');
    assert.equal(restored.snapshot().items[0].status, 'interrupted');
    assert.equal(restored.snapshot().items[0].retryAt, undefined);
    await restored.shutdown();
    await s.manager.shutdown();
    assert.deepEqual(notices, []);
  } finally {
    await s.close();
  }
});

test('pausa após atual inclui suas novas tentativas e mantém os seguintes pendentes, sem aviso de conclusão', async () => {
  let calls = 0;
  const notices: unknown[] = [];
  const s = await setup({
    retryDelay: () => 35,
    notice: (notice) => notices.push(notice),
    analyze: async (url) => {
      calls++;
      if (calls === 1) throw new Error('Connection timed out');
      return video(url);
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'retrying');
    await s.manager.pause();
    await until(() => s.manager.snapshot().items[0].status === 'completed');
    assert.equal(s.manager.snapshot().items[1].status, 'waiting');
    assert.equal(s.manager.snapshot().mode, 'paused');
    assert.equal(calls, 2);
    assert.deepEqual(notices, []);
  } finally {
    await s.close();
  }
});

test('erros permanentes não repetem; falhas de pasta/limpeza pausam e geram atenção', async () => {
  for (const reason of ['item', 'space', 'destination', 'tools', 'network'] as const) {
    let calls = 0;
    const notices: unknown[] = [];
    const s = await setup({
      retryDelay: () => 0,
      notice: (notice) => notices.push(notice),
      download: async () => {
        calls++;
        return {
          type: 'error',
          message: 'Falha controlada',
          reason,
          ...(reason === 'network' ? { cleanupPending: true } : {}),
        };
      },
    });
    try {
      await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
      await s.manager.start();
      await until(() => notices.length === 1);
      assert.equal(calls, 1);
      assert.equal(s.manager.snapshot().items[0].status, 'failed');
      assert.equal((notices[0] as any).type, reason === 'item' ? 'finished' : 'attention');
    } finally {
      await s.close();
    }
  }
});

test('falha ao limpar antes da nova tentativa pausa a fila e não inicia outro download', async () => {
  let calls = 0;
  const notices: unknown[] = [];
  const s = await setup({
    retryDelay: () => 0,
    notice: (notice) => notices.push(notice),
    cleanItem: async () => {
      throw new Error('EACCES');
    },
    analyze: async () => {
      calls++;
      throw new Error('Connection timed out');
    },
  });
  try {
    await s.manager.add(
      urls.slice(0, 2).map((url) => ({ url })),
      DEFAULT_PREFERENCES,
      s.root,
    );
    await s.manager.start();
    await until(() => notices.length === 1);
    assert.equal(calls, 1);
    assert.equal(s.manager.snapshot().items[0].cleanupPending, true);
    assert.equal(s.manager.snapshot().items[1].status, 'waiting');
    assert.equal(s.manager.snapshot().mode, 'paused');
    assert.equal((notices[0] as any).type, 'attention');
  } finally {
    await s.close();
  }
});

test('cancelamento após publicação não perde o registro do arquivo concluído', async () => {
  let cancel: Promise<void> | undefined;
  const s = await setup({
    download: async (_info, _request, destination, id) => {
      cancel = s.manager.cancel(id);
      return { type: 'complete', filename: id, path: join(destination, id), size: 1 };
    },
  });
  try {
    await s.manager.add([{ url: urls[0] }], DEFAULT_PREFERENCES, s.root);
    await s.manager.start();
    await until(() => s.manager.snapshot().items[0].status === 'completed');
    await cancel;
    assert.ok(s.manager.result(s.manager.snapshot().items[0].id).path);
  } finally {
    await s.close();
  }
});
