import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { RecoveryStore, SESSION_MARKER } from '../electron/recovery';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Downloader } from '../electron/downloader';
import { parseVideo } from '../electron/media';
import type { JobEvent, VideoInfo } from '../shared/types';

const info = {
  id: 'BaW_jenozKc',
  title: 'Vídeo interrompido',
  url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
} as VideoInfo;

test('recuperação aguarda processo órfão encerrar antes de permitir limpeza', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-recovery-process-'));
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const journal = join(root, 'recoveries.json');
    const store = new RecoveryStore(journal),
      session = await store.create(root, info);
    child = spawn(
      process.execPath,
      ['-e', 'process.send("ready"); setInterval(()=>{},1000)', session.path],
      {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    // Wait for Node to execute the script before inspecting its command line.
    // The spawn event alone can precede exec completing on Linux.
    await once(child, 'message');
    await store.recordProcess(session, child.pid!);
    const restarted = new RecoveryStore(journal);
    await restarted.load();
    assert.equal((await restarted.list())[0].running, true);
    await assert.rejects(restarted.remove(session.id), /processo/);
    const closed = once(child, 'close');
    child.kill();
    await closed;
    child = undefined;
    assert.equal((await restarted.list())[0].running, false);
    await restarted.remove(session.id);
  } finally {
    if (child) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
    await rm(root, { recursive: true, force: true });
  }
});
test('reinício recupera temporários em pastas diferentes e só remove o item escolhido', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-recovery-'));
  try {
    const a = join(root, 'A'),
      b = join(root, 'B'),
      journal = join(root, 'profile', 'recoveries.json');
    await mkdir(a);
    await mkdir(b);
    const first = new RecoveryStore(journal);
    await first.load();
    const sa = await first.create(a, info),
      sb = await first.create(b, info);
    await writeFile(join(sa.path, 'video.part'), '12345');
    await writeFile(join(sb.path, 'audio.part'), '123');
    await mkdir(join(a, '.vora-not-owned'));
    await writeFile(join(a, 'final.mp4'), 'final');
    assert.deepEqual(await first.list(), []);
    await assert.rejects(first.remove(sa.id), /andamento/);
    const restarted = new RecoveryStore(journal);
    await restarted.load();
    const recovered = await restarted.list();
    assert.equal(recovered.length, 2);
    assert.equal(
      recovered.reduce((sum, item) => sum + item.size, 0),
      8,
    );
    await restarted.remove(sa.id);
    assert.deepEqual(
      (await restarted.list()).map((item) => item.id),
      [sb.id],
    );
    assert.equal(await readFile(join(a, 'final.mp4'), 'utf8'), 'final');
    assert.ok((await lstat(join(a, '.vora-not-owned'))).isDirectory());
    await assert.rejects(restarted.remove('../final.mp4'), /registrado/);
    await restarted.remove(sb.id);
    assert.deepEqual(await restarted.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test(
  'recuperação recusa diretório substituído por symlink e preserva arquivos externos',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-recovery-'));
    try {
      const journal = join(root, 'recoveries.json'),
        external = join(root, 'external');
      await mkdir(external);
      await writeFile(join(external, 'precious.txt'), 'keep');
      const store = new RecoveryStore(journal);
      const session = await store.create(root, info);
      await rm(session.path, { recursive: true });
      await symlink(external, session.path);
      const restarted = new RecoveryStore(journal);
      await restarted.load();
      await assert.rejects(restarted.remove(session.id), /limpar/);
      assert.equal(await readFile(join(external, 'precious.txt'), 'utf8'), 'keep');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
test('pastas com marcador alterado não são apagadas e registros de pasta removida são descartados', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-recovery-'));
  try {
    const journal = join(root, 'recoveries.json');
    const store = new RecoveryStore(journal);
    const a = await store.create(root, info),
      b = await store.create(root, info);
    await writeFile(join(a.path, SESSION_MARKER), JSON.stringify({ id: 'other' }));
    await writeFile(join(a.path, 'data.mp4'), 'preserve');
    await rm(b.path, { recursive: true });
    const restarted = new RecoveryStore(journal);
    await restarted.load();
    await assert.rejects(restarted.remove(a.id));
    assert.equal(await readFile(join(a.path, 'data.mp4'), 'utf8'), 'preserve');
    assert.deepEqual(await restarted.list(), []);
    assert.equal(JSON.parse(await readFile(journal, 'utf8')).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('download com diário publica somente a mídia, informa tamanho e limpa registro', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-recovery-'));
  try {
    const events: JobEvent[] = [];
    const recovery = new RecoveryStore(join(root, 'profile', 'recoveries.json'));
    const service = new Downloader(
      { ytdlp: '', ffmpeg: '', ffprobe: '', deno: '' },
      (event) => events.push(event),
      async (_executable, args) => {
        if (args.includes('--dump-single-json'))
          return JSON.stringify({
            ...info,
            formats: [{ format_id: '22', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', height: 720 }],
          });
        const temporary = dirname(args[args.indexOf('-o') + 1]);
        assert.ok((await readdir(temporary)).includes(SESSION_MARKER));
        await writeFile(join(temporary, 'Pronto.mp4'), 'video');
        return '';
      },
      recovery,
    );
    await service.download(
      parseVideo(
        {
          ...info,
          formats: [{ format_id: '22', ext: 'mp4', vcodec: 'avc1', acodec: 'mp4a', height: 720 }],
        },
        info.url,
      ),
      {
        videoId: info.id,
        kind: 'video',
        videoMode: 'compatible',
        audioMode: 'original',
        optionId: 'c-22',
      },
      root,
    );
    assert.equal(events.at(-1)?.type, 'complete');
    assert.equal((events.at(-1) as Extract<JobEvent, { type: 'complete' }>).size, 5);
    assert.deepEqual(await recovery.list(), []);
    assert.deepEqual((await readdir(root)).sort(), ['Pronto.mp4', 'profile']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test(
  'falha na limpeza permanece recuperável após reinício',
  { skip: process.platform === 'win32' || process.getuid?.() === 0 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-recovery-'));
    let path: string | undefined;
    try {
      const journal = join(root, 'profile', 'recoveries.json');
      const store = new RecoveryStore(journal);
      const session = await store.create(root, info);
      path = session.path;
      await chmod(path, 0o500);
      await assert.rejects(store.finish(session));
      const restarted = new RecoveryStore(journal);
      await restarted.load();
      assert.equal((await restarted.list()).length, 1);
      await chmod(path, 0o700);
      await restarted.remove(session.id);
      assert.deepEqual(await restarted.list(), []);
    } finally {
      if (path) await chmod(path, 0o700).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  },
);
