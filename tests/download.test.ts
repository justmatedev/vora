import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { publishUnique } from '../electron/files';
import { Downloader } from '../electron/downloader';
import { parseVideo } from '../electron/media';
import { CancelledError, runProcess } from '../electron/processes';
import type { JobEvent, DownloadRequest } from '../shared/types';

const fixture = {
  id: 'BaW_jenozKc',
  title: 'Teste',
  formats: [{ format_id: '22', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', height: 720 }],
};
const downloadInfo = parseVideo(fixture, 'https://www.youtube.com/watch?v=BaW_jenozKc');
const request: DownloadRequest = {
  videoId: fixture.id,
  kind: 'video',
  videoMode: 'compatible',
  audioMode: 'original',
  optionId: 'c-22',
};
const tools = {
  ytdlp: '/not-used/ytdlp',
  ffmpeg: '/not-used/ffmpeg',
  ffprobe: '/not-used/ffprobe',
  node: process.execPath,
};

test('destino removido retorna orientação para escolher outra pasta', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-missing-'));
  const events: JobEvent[] = [];
  const service = new Downloader(
    tools,
    (event) => events.push(event),
    async () => JSON.stringify(fixture),
  );
  try {
    await service.download(downloadInfo, request, join(root, 'não existe'));
    assert.match(
      (events.at(-1) as Extract<JobEvent, { type: 'error' }>).message,
      /pasta de destino não existe/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'destino sem permissão não inicia download nem deixa temporários',
  { skip: process.platform === 'win32' || process.getuid?.() === 0 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-permission-'));
    const events: JobEvent[] = [];
    let executions = 0;
    const service = new Downloader(
      tools,
      (event) => events.push(event),
      async () => {
        executions++;
        return JSON.stringify(fixture);
      },
    );
    try {
      await chmod(root, 0o500);
      await service.download(downloadInfo, request, root);
      assert.match((events.at(-1) as Extract<JobEvent, { type: 'error' }>).message, /permissão/);
      assert.equal(executions, 0);
      assert.deepEqual(await readdir(root), []);
    } finally {
      await chmod(root, 0o700);
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('publicação preserva arquivos existentes, inclusive nomes acentuados, e evita corrida entre operações', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-files-'));
  try {
    await writeFile(join(root, 'ação com espaços.mp4'), 'original');
    const sources = await Promise.all([
      mkdtemp(join(root, '.vora-')),
      mkdtemp(join(root, '.vora-')),
    ]);
    for (const path of sources) await writeFile(join(path, 'ação com espaços.mp4'), 'novo');
    const published = await Promise.all(
      sources.map((path) => publishUnique(join(path, 'ação com espaços.mp4'), root)),
    );
    assert.equal(new Set(published).size, 2);
    assert.equal(await readFile(join(root, 'ação com espaços.mp4'), 'utf8'), 'original');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('download completo publica arquivo e limpa os temporários antes de emitir conclusão', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-download-'));
  const events: JobEvent[] = [];
  const runner: typeof runProcess = async (_exe, args, options) => {
    assert.ok(args.includes('--ignore-config'));
    assert.ok(args.includes('--no-playlist'));
    const folder = dirname(args[args.indexOf('-o') + 1]);
    options?.onLine?.('VORA_PROGRESS:{"downloaded_bytes":10,"total_bytes":10}');
    await writeFile(join(folder, 'Teste [BaW_jenozKc].mp4'), 'video');
    return '';
  };
  const service = new Downloader(tools, (event) => events.push(event), runner);
  try {
    await service.download(downloadInfo, request, root);
    assert.equal(service.busy, false);
    assert.equal(events.at(-1)?.type, 'complete');
    assert.deepEqual(await readdir(root), ['Teste [BaW_jenozKc].mp4']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelamento aguarda o processo, limpa somente a operação e permite tentar de novo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-cancel-'));
  await writeFile(join(root, 'anterior.mp4'), 'preservado');
  const events: JobEvent[] = [];
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runner: typeof runProcess = async (_exe, args, options) => {
    await writeFile(join(dirname(args[args.indexOf('-o') + 1]), 'partial.mp4.part'), 'partial');
    started();
    await new Promise<void>((_resolve, reject) =>
      options?.signal?.addEventListener('abort', () => reject(new CancelledError()), {
        once: true,
      }),
    );
    return '';
  };
  const service = new Downloader(tools, (event) => events.push(event), runner);
  try {
    const download = service.download(downloadInfo, request, root);
    await ready;
    await assert.rejects(service.download(downloadInfo, request, root), /Aguarde/);
    await service.cancel();
    await download;
    assert.equal(service.busy, false);
    assert.deepEqual(await readdir(root), ['anterior.mp4']);
    assert.equal(events.at(-1)?.type, 'cancelled');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('falha de rede remove parciais e emite erro recuperável', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-error-'));
  const events: JobEvent[] = [];
  const service = new Downloader(
    tools,
    (event) => events.push(event),
    async (_exe, args) => {
      throw new Error('Connection timed out');
    },
  );
  try {
    await service.download(downloadInfo, request, root);
    assert.deepEqual(await readdir(root), []);
    assert.match((events.at(-1) as any).message, /conexão/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('executor recebe argumentos literalmente e identifica cancelamento e timeout', async () => {
  const literal = '`echo nope` $(echo nope) ação';
  assert.equal(
    (await runProcess(process.execPath, ['-e', 'console.log(process.argv[1])', literal])).trim(),
    literal,
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 50 }),
    /timed out/,
  );
  const controller = new AbortController();
  const operation = runProcess(
    process.execPath,
    ['-e', 'console.log("ready"); setInterval(()=>{},1000)'],
    { signal: controller.signal, onLine: () => controller.abort() },
  );
  await assert.rejects(operation, CancelledError);
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
      onSpawn: async () => {
        throw new Error('Falha ao registrar processo');
      },
    }),
    /registrar processo/,
  );
});

test(
  'no Linux, cancelar encerra descendentes antes que possam continuar gravando',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-tree-'));
    const marker = join(root, 'should-not-exist');
    const controller = new AbortController();
    const grandchild = `setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'alive'),500);setInterval(()=>{},1000)`;
    const code = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});console.log('ready');setInterval(()=>{},1000)`;
    try {
      await assert.rejects(
        runProcess(process.execPath, ['-e', code], {
          signal: controller.signal,
          onLine: () => controller.abort(),
        }),
        CancelledError,
      );
      await new Promise((resolve) => setTimeout(resolve, 650));
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
