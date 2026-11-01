import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, readdir, rm, stat, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateManager } from '../electron/updates';
import { appImageAvailability, replaceAppImage } from '../electron/appimage-update';

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checks = 0;
  downloads = 0;
  installs = 0;
  checkError?: Error;
  downloadError?: Error;
  installError?: Error;
  async checkForUpdates() {
    this.checks++;
    if (this.checkError) throw this.checkError;
    this.emit('update-available', {
      version: '0.7.0',
      releaseNotes: '<p>Melhorias &amp; correções</p><script>ignored()</script>',
    });
  }
  async downloadUpdate() {
    this.downloads++;
    this.emit('download-progress', { percent: 40, bytesPerSecond: 2048 });
    if (this.downloadError) throw this.downloadError;
    this.emit('update-downloaded', { version: '0.7.0' });
  }
  quitAndInstall() {
    this.installs++;
    if (this.installError) this.emit('error', this.installError);
  }
}
function setup(overrides: Partial<ConstructorParameters<typeof UpdateManager>[1]> = {}) {
  const updater = new FakeUpdater();
  const events: ReturnType<UpdateManager['snapshot']>[] = [];
  let busy = false,
    recovered = 0,
    prepared = 0;
  const manager = new UpdateManager(updater, {
    version: '0.6.0',
    availability: async () => undefined,
    busy: () => busy,
    prepare: async () => {
      prepared++;
    },
    recover: () => {
      recovered++;
    },
    notify: (snapshot) => events.push(snapshot),
    ...overrides,
  });
  return {
    updater,
    manager,
    events,
    busy: (value: boolean) => {
      busy = value;
      manager.activityChanged();
    },
    recovered: () => recovered,
    prepared: () => prepared,
  };
}
test('consulta avisa sem baixar; somente o clique baixa e instalação no fechamento fica desativada', async () => {
  const s = setup();
  assert.equal(s.updater.autoDownload, false);
  assert.equal(s.updater.autoInstallOnAppQuit, false);
  assert.equal(s.updater.allowPrerelease, false);
  assert.equal(s.updater.allowDowngrade, false);
  await s.manager.check();
  assert.equal(s.manager.snapshot().status, 'available');
  assert.equal(s.manager.snapshot().notes, 'Melhorias & correções');
  assert.equal(s.updater.downloads, 0);
  await s.manager.download();
  assert.ok(s.events.some((event) => event.status === 'downloading' && event.percent === 40));
  assert.equal(s.manager.snapshot().status, 'downloaded');
  assert.equal(s.updater.installs, 0);
});
test('instalação preserva atualização pronta enquanto há trabalho e só ocorre depois da preparação', async () => {
  const s = setup();
  await s.manager.check();
  await s.manager.download();
  s.busy(true);
  assert.equal(s.manager.snapshot().canInstall, false);
  await assert.rejects(s.manager.install(), /Pause a fila/);
  assert.equal(s.manager.snapshot().status, 'downloaded');
  assert.equal(s.updater.installs, 0);
  s.busy(false);
  await s.manager.install();
  assert.equal(s.prepared(), 1);
  assert.equal(s.updater.installs, 1);
  assert.equal(s.manager.installing, true);
  await s.manager.install();
  assert.equal(s.updater.installs, 1);
});
test('erros de rede e integridade permitem nova consulta sem instalar arquivo inválido', async () => {
  const s = setup();
  s.updater.checkError = new Error('Connection reset: private path');
  await s.manager.check();
  assert.equal(s.manager.snapshot().status, 'error');
  assert.ok(!s.manager.snapshot().message?.includes('private path'));
  s.updater.checkError = undefined;
  await s.manager.check();
  s.updater.downloadError = new Error('sha512 checksum mismatch');
  await s.manager.download();
  assert.match(s.manager.snapshot().message!, /integridade/);
  await s.manager.install();
  assert.equal(s.updater.installs, 0);
  s.updater.downloadError = undefined;
  await s.manager.check();
  await s.manager.download();
  assert.equal(s.manager.snapshot().status, 'downloaded');
});
test('desenvolvimento e pasta indisponível oferecem alternativa manual sem acessar o feed', async () => {
  const dev = setup({ disabledReason: 'Desenvolvimento' });
  await dev.manager.check();
  assert.equal(dev.manager.snapshot().status, 'unavailable');
  assert.equal(dev.updater.checks, 0);
  let readonly = true;
  const s = setup({ availability: async () => (readonly ? 'Pasta sem permissão' : undefined) });
  await s.manager.check();
  assert.equal(s.updater.checks, 0);
  readonly = false;
  await s.manager.check();
  assert.equal(s.updater.checks, 1);
});
test('falha na preparação ou no instalador libera o aplicativo e não instala duas vezes', async () => {
  const s = setup({
    prepare: async () => {
      throw new Error('EACCES');
    },
  });
  await s.manager.check();
  await s.manager.download();
  await s.manager.install();
  assert.equal(s.updater.installs, 0);
  assert.equal(s.manager.installing, false);
  assert.equal(s.recovered(), 1);
  const other = setup();
  await other.manager.check();
  await other.manager.download();
  other.updater.installError = new Error('EACCES');
  await other.manager.install();
  assert.equal(other.manager.installing, false);
  assert.equal(other.recovered(), 1);
  assert.equal(other.manager.snapshot().status, 'error');
});
test('operações simultâneas não repetem consulta e novos comandos não instalam enquanto prepara', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const s = setup({ prepare: () => held });
  await Promise.all([s.manager.check(), s.manager.check()]);
  assert.equal(s.updater.checks, 1);
  await s.manager.download();
  const installation = s.manager.install();
  assert.equal(s.manager.installing, true);
  await s.manager.check();
  await s.manager.download();
  await s.manager.install();
  assert.equal(s.updater.installs, 0);
  release();
  await installation;
  assert.equal(s.updater.installs, 1);
});
test(
  'AppImage substitui no mesmo caminho e preserva o original se a cópia falhar',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-appimage-'));
    try {
      const current = join(root, 'Vora com espaços.AppImage'),
        next = join(root, 'nova.AppImage');
      await writeFile(current, 'antigo');
      await writeFile(next, 'novo');
      assert.equal(appImageAvailability(current), undefined);
      assert.throws(() => replaceAppImage(join(root, 'ausente'), current));
      assert.equal(await readFile(current, 'utf8'), 'antigo');
      replaceAppImage(next, current);
      assert.equal(await readFile(current, 'utf8'), 'novo');
      assert.equal((await stat(current)).mode & 0o777, 0o755);
      assert.ok(!(await readdir(root)).some((name) => name.startsWith('.vora-update-')));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
test(
  'AppImage por symlink ou pasta sem permissão mantém arquivo e oferece atualização manual',
  { skip: process.platform === 'win32' || process.getuid?.() === 0 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vora-appimage-permission-'));
    const current = join(root, 'Vora.AppImage'),
      alias = join(root, 'atalho'),
      next = join(root, 'novo');
    try {
      await writeFile(current, 'antigo');
      await writeFile(next, 'novo');
      await symlink(current, alias);
      assert.ok(appImageAvailability(alias));
      assert.throws(() => replaceAppImage(next, alias));
      await chmod(root, 0o500);
      assert.ok(appImageAvailability(current));
      assert.throws(() => replaceAppImage(next, current));
      assert.equal(await readFile(current, 'utf8'), 'antigo');
    } finally {
      await chmod(root, 0o700);
      await rm(root, { recursive: true, force: true });
    }
  },
);
