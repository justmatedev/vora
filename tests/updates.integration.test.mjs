import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { UpdateManager } from '../electron/updates.ts';
import { replaceAppImage } from '../electron/appimage-update.ts';

const require = createRequire(import.meta.url);
const { AppImageUpdater, NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
// Use Node's loopback transport, keeping the library's metadata, download,
// progress and DigestTransform implementation intact. No Electron app is quit.
class LocalHttpExecutor extends ElectronHttpExecutor {
  createRequest(options, callback) {
    return request(options, callback);
  }
}
for (const corrupt of [false, true]) {
  test(
    `atualizador real: ${corrupt ? 'recusa bytes com SHA-512 incorreto' : 'consulta, baixa após clique e aplica somente sem trabalho ativo'}`,
    { timeout: 30_000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vora-update-real-'));
      const previousAppImage = process.env.APPIMAGE;
      const current = join(root, 'Vora atual com espaços.AppImage');
      let server;
      try {
        await mkdir(join(root, 'profile'));
        await writeFile(current, 'old application');
        await writeFile(join(root, 'queue.json'), '{"items":["preserved"]}');
        await writeFile(join(root, 'app-update.yml'), 'updaterCacheDirName: vora-update-test\n');
        process.env.APPIMAGE = current;
        const payload = Buffer.from('new application fixture');
        const sha512 = createHash('sha512')
          .update(corrupt ? 'different bytes' : payload)
          .digest('base64');
        const filename =
          process.platform === 'win32'
            ? 'Vora-0.7.0-windows-x64-setup.exe'
            : 'Vora-0.7.0-linux-x86_64.AppImage';
        let downloads = 0;
        server = createServer((req, res) => {
          const path = new URL(req.url, 'http://localhost').pathname;
          if (path.endsWith('.yml')) {
            res.end(
              JSON.stringify({
                version: '0.7.0',
                files: [{ url: filename, sha512, size: payload.length }],
                path: filename,
                sha512,
                releaseDate: new Date().toISOString(),
                releaseNotes: 'Fixture update',
              }),
            );
          } else if (path === `/${filename}`) {
            downloads++;
            res.writeHead(200, { 'content-length': payload.length });
            res.end(payload);
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        let quitHandlers = 0,
          installs = 0;
        const app = {
          version: '0.6.0',
          name: 'Vora fixture',
          isPackaged: true,
          appUpdateConfigPath: join(root, 'app-update.yml'),
          userDataPath: join(root, 'profile'),
          baseCachePath: join(root, 'cache'),
          whenReady: async () => {},
          quit: () => {},
          relaunch: () => {},
          onQuit: () => {
            quitHandlers++;
          },
        };
        const Base = process.platform === 'win32' ? NsisUpdater : AppImageUpdater;
        class FixtureUpdater extends Base {
          quitAndInstall() {
            this.install(false, true);
          }
          doInstall() {
            installs++;
            if (process.platform === 'win32') copyFileSync(this.installerPath, current);
            else replaceAppImage(this.installerPath, current);
            return true;
          }
        }
        const updater = new FixtureUpdater(null, app);
        updater.httpExecutor = new LocalHttpExecutor();
        updater.setFeedURL({
          provider: 'generic',
          url: `http://127.0.0.1:${server.address().port}/`,
        });
        updater.disableDifferentialDownload = true;
        updater.logger = null;
        const errors = [];
        updater.on('error', (error) => errors.push(error.stack));
        let busy = false;
        const manager = new UpdateManager(updater, {
          version: '0.6.0',
          availability: async () => undefined,
          busy: () => busy,
          prepare: async () => {},
          recover: () => {},
          notify: () => {},
        });
        await manager.check();
        assert.equal(manager.snapshot().status, 'available', errors.join('\n'));
        assert.equal(downloads, 0);
        await manager.download();
        assert.equal(downloads, 1);
        assert.equal(await readFile(current, 'utf8'), 'old application');
        assert.equal(quitHandlers, 0, 'não deve registrar instalação automática no fechamento');
        if (corrupt) {
          assert.equal(manager.snapshot().status, 'error');
          assert.match(manager.snapshot().message, /integridade/);
          await manager.install();
          assert.equal(installs, 0);
        } else {
          assert.equal(manager.snapshot().status, 'downloaded');
          busy = true;
          await assert.rejects(manager.install(), /Pause a fila/);
          assert.equal(installs, 0);
          busy = false;
          await manager.install();
          assert.equal(installs, 1);
          assert.deepEqual(await readFile(current), payload);
        }
        assert.equal(await readFile(join(root, 'queue.json'), 'utf8'), '{"items":["preserved"]}');
      } finally {
        if (previousAppImage === undefined) delete process.env.APPIMAGE;
        else process.env.APPIMAGE = previousAppImage;
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
