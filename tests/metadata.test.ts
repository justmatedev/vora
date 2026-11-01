import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  MetadataService,
  parsePlaylistEntry,
  commonToolArgs,
  toolEnvironment,
} from '../electron/metadata';
import { youtubeSource } from '../shared/youtube';
import { CancelledError, runProcess } from '../electron/processes';
const tools = { ytdlp: '', ffmpeg: '', ffprobe: '', node: process.execPath };
const url = 'https://www.youtube.com/playlist?list=PL1234567890abcdef';

test('runtime usa caminho explícito do Node, desativa descoberta e isola o ambiente do subprocesso', async () => {
  const toolsWithSpaces = { ...tools, node: '/Aplicativo com espaços/Vora.exe' };
  const args = commonToolArgs(toolsWithSpaces);
  assert.ok(args.indexOf('--no-js-runtimes') < args.indexOf('--js-runtimes'));
  assert.equal(args[args.indexOf('--js-runtimes') + 1], 'node:/Aplicativo com espaços/Vora.exe');
  const previous = process.env.ELECTRON_RUN_AS_NODE;
  const env = toolEnvironment();
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, previous);
  assert.equal(
    (
      await runProcess(process.execPath, ['-e', 'console.log(process.env.ELECTRON_RUN_AS_NODE)'], {
        env,
      })
    ).trim(),
    '1',
  );
});
async function complete(service: MetadataService, id: string) {
  for (let i = 0; i < 100; i++) {
    if (service.page(id, 0).state !== 'loading') return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('Timeout');
}
test('distingue vídeo, playlist e link misto e recusa canais e mixes', () => {
  assert.equal(youtubeSource('https://youtu.be/BaW_jenozKc').kind, 'video');
  assert.equal(youtubeSource(url).kind, 'playlist');
  const mixed = youtubeSource(
    'https://www.youtube.com/watch?v=BaW_jenozKc&list=PL1234567890abcdef',
  );
  assert.equal(mixed.kind, 'mixed');
  assert.equal(mixed.playlistUrl, url);
  assert.throws(() => youtubeSource('https://youtube.com/@channel/videos'));
  assert.throws(() => youtubeSource('https://youtube.com/playlist?list=RDMIX123456789'));
  assert.equal(
    youtubeSource('https://youtube.com/watch?v=BaW_jenozKc&list=RDMIX123456789').videoUrl,
    'https://www.youtube.com/watch?v=BaW_jenozKc',
  );
});
test('consulta incremental pagina em 100 itens, preserva ordem e não inventa duração', async () => {
  const events: number[] = [];
  const service = new MetadataService(
    tools,
    (event) => events.push(event.count),
    async (_exe, args, options) => {
      assert.ok(args.includes('--flat-playlist'));
      assert.ok(args.includes('--lazy-playlist'));
      assert.equal(options?.captureOutput, false);
      for (let i = 0; i < 205; i++)
        options?.onLine?.(
          JSON.stringify({
            id: i === 1 ? 'aqz-KE-bpKQ' : 'BaW_jenozKc',
            title: i === 1 ? '[Private video]' : `Vídeo ${i + 1}`,
            playlist_title: 'Minha playlist',
            ...(i === 0 ? { duration: 30 } : {}),
          }),
        );
      return '';
    },
  );
  const id = randomUUID();
  service.start(url, id);
  await complete(service, id);
  assert.equal(service.page(id, 0).entries.length, 100);
  assert.equal(service.page(id, 2).entries.length, 5);
  assert.equal(service.page(id, 0).title, 'Minha playlist');
  assert.equal(service.page(id, 0).entries[1].duration, undefined);
  assert.equal(service.page(id, 0).entries[1].available, false);
  assert.equal(service.availableIndices(id).length, 204);
  assert.deepEqual(
    service.selected(id, [205, 100, 1]).entries.map((entry) => entry.title),
    ['Vídeo 1', 'Vídeo 100', 'Vídeo 205'],
  );
  assert.throws(() => service.selected(id, [2]), /indisponíveis/);
  assert.throws(() => service.page(id, 3), /Página/);
  assert.ok(events.includes(1));
  assert.equal(events.at(-1), 205);
  await service.dispose(id);
});
test('cancelar consulta não permite importar resultados parciais e dispose libera a consulta', async () => {
  const service = new MetadataService(
    tools,
    () => {},
    async (_exe, _args, options) => {
      options?.onLine?.(JSON.stringify({ id: 'BaW_jenozKc', title: 'Item' }));
      if (options?.signal?.aborted) throw new CancelledError();
      await new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(new CancelledError()), {
          once: true,
        }),
      );
      return '';
    },
  );
  const id = randomUUID();
  service.start(url, id);
  await service.cancel(id);
  assert.equal(service.page(id, 0).state, 'cancelled');
  assert.throws(() => service.selected(id, [1]), /Aguarde/);
  await service.dispose(id);
  assert.throws(() => service.page(id, 0));
});
test('vídeos removidos e dados inválidos são marcados indisponíveis', () => {
  assert.equal(
    parsePlaylistEntry({ id: 'BaW_jenozKc', title: '[Deleted video]' }, 1).available,
    false,
  );
  assert.equal(parsePlaylistEntry({ id: 'not-video', title: 'Título' }, 1).available, false);
  assert.equal(
    parsePlaylistEntry({ id: 'BaW_jenozKc', title: 'Título', duration: null }, 1).duration,
    undefined,
  );
});

test('playlist inexistente produz erro claro e não permite adicionar itens', async () => {
  const service = new MetadataService(
    tools,
    () => {},
    async () => {
      throw new Error('YouTube said: The playlist does not exist.');
    },
  );
  const id = randomUUID();
  service.start(url, id);
  await complete(service, id);
  assert.equal(service.page(id, 0).state, 'error');
  assert.match(service.page(id, 0).error!, /não existe/);
  assert.throws(() => service.selected(id, [1]));
  await service.dispose(id);
});
test('cancelAll aguarda consultas de metadados encerrarem', async () => {
  let ended = false;
  const service = new MetadataService(
    tools,
    () => {},
    async (_exe, _args, options) => {
      if (options?.signal?.aborted) throw new CancelledError();
      await new Promise((_resolve, reject) =>
        options?.signal?.addEventListener(
          'abort',
          () => {
            ended = true;
            reject(new CancelledError());
          },
          { once: true },
        ),
      );
      return '';
    },
  );
  const query = service.analyze('https://youtu.be/BaW_jenozKc');
  const rejected = assert.rejects(query, CancelledError);
  await service.cancelAll();
  await rejected;
  assert.equal(ended, true);
});
test('executor interrompe com segurança callbacks de saída inválidos', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'console.log("{bad");setInterval(()=>{},1000)'], {
      captureOutput: false,
      onLine: (line) => {
        JSON.parse(line);
      },
    }),
    SyntaxError,
  );
});

test('prévia leve funciona sem formatos, usa cache e análise de execução permanece completa', async () => {
  const target = 'https://www.youtube.com/watch?v=BaW_jenozKc';
  const requests: string[][] = [];
  const service = new MetadataService(
    tools,
    () => {},
    async (_exe, args) => {
      requests.push(args);
      return JSON.stringify({
        id: 'BaW_jenozKc',
        title: 'Prévia',
        uploader: 'Canal',
        duration: 12,
        thumbnail: 'https://i.ytimg.com/vi/BaW_jenozKc/default.jpg',
        ...(args.includes('--ignore-no-formats-error')
          ? {}
          : {
              formats: [{ format_id: '140', ext: 'm4a', acodec: 'mp4a.40.2', vcodec: 'none' }],
            }),
      });
    },
  );
  const preview = await service.preview(target);
  assert.equal(preview.title, 'Prévia');
  assert.equal(preview.channel, 'Canal');
  assert.equal(preview.duration, 12);
  assert.ok(requests[0].includes('--no-js-runtimes'));
  assert.ok(requests[0].some((arg) => arg.includes('player_skip=js')));
  assert.deepEqual(await service.preview(target), preview);
  assert.equal(requests.length, 1);
  const full = await service.analyze(target);
  assert.ok(full.audio);
  assert.equal(requests.length, 2);
  assert.ok(!requests[1].includes('--ignore-no-formats-error'));
  assert.equal(requests[1].filter((arg) => arg === '--no-js-runtimes').length, 1);
  assert.ok(requests[1].includes(`node:${process.execPath}`));
});

test('prévia recusa dados de outro vídeo e não inventa duração ou imagem externa', async () => {
  let wrong = true;
  const service = new MetadataService(
    tools,
    () => {},
    async () =>
      JSON.stringify({
        id: wrong ? 'aqz-KE-bpKQ' : 'BaW_jenozKc',
        title: 'Teste',
        thumbnail: 'https://example.com/image.jpg',
      }),
  );
  const target = 'https://www.youtube.com/watch?v=BaW_jenozKc';
  await assert.rejects(service.preview(target), /interpretar/);
  wrong = false;
  const result = await service.preview(target);
  assert.equal(result.duration, undefined);
  assert.equal(result.thumbnail, undefined);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.preview(target, controller.signal), CancelledError);
});

test('consulta preserva a classificação de falha de rede ao traduzir a mensagem', async () => {
  const service = new MetadataService(
    tools,
    () => {},
    async () => {
      throw new Error('Connection timed out');
    },
  );
  await assert.rejects(
    service.analyze('https://www.youtube.com/watch?v=BaW_jenozKc'),
    (error: any) => {
      assert.equal(error.reason, 'network');
      assert.match(error.message, /conectar ao YouTube/);
      return true;
    },
  );
});
