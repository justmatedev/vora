import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright';
import electron from 'electron';

test(
  'Electron: protocolo local, preload isolado, IPC e ferramentas empacotadas',
  { timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vora-desktop-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VORA_DEV_URL;
    const packaged = process.env.VORA_TEST_PACKAGED;
    const launchOptions = {
      executablePath: packaged ? resolve(packaged) : electron,
      args: [
        ...(packaged ? [] : ['.']),
        `--user-data-dir=${directory}`,
        '--no-sandbox',
        '--disable-gpu',
        '--disable-renderer-backgrounding',
        ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []),
      ],
      env,
    };
    const temporary = await mkdtemp(join(directory, '.vora-'));
    const interrupted = {
      id: randomUUID(),
      path: temporary,
      destination: directory,
      title: 'Sessão interrompida',
      url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
      createdAt: new Date().toISOString(),
    };
    await writeFile(join(temporary, '.vora-session.json'), JSON.stringify(interrupted));
    await writeFile(join(temporary, 'video.part'), 'incompleto');
    await writeFile(join(directory, 'recoveries.json'), JSON.stringify([interrupted]));
    await writeFile(join(directory, 'settings.json'), JSON.stringify({ destination: directory }));
    let application;
    try {
      application = await _electron.launch(launchOptions);
      const page = await application.firstWindow();
      await application.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
      });
      await page.bringToFront();
      await page.getByRole('heading', { name: 'Adicione um link para começar' }).waitFor();
      assert.equal(page.url(), 'vora://app/index.html');
      assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
      assert.equal(await page.evaluate(() => typeof window.vora.analyze), 'function');
      const versions = await page.evaluate(() => window.vora.info());
      assert.equal(versions.tools.length, 4);
      assert.ok(
        versions.tools.every((tool) => tool.version && !tool.error),
        JSON.stringify(versions.tools),
      );
      assert.ok(versions.tools.some((tool) => tool.name === 'Node.js (Electron)'));
      assert.ok(!versions.tools.some((tool) => tool.name === 'Deno'));
      const runtime = await application.evaluate(async ({ app }) => {
        const { execFile } = process.getBuiltinModule('node:child_process');
        const { join } = process.getBuiltinModule('node:path');
        const directory = app.isPackaged
          ? join(process.resourcesPath, 'tools')
          : join(
              app.getAppPath(),
              'resources',
              'tools',
              process.platform === 'win32' ? 'win-x64' : 'linux-x64',
            );
        const executable = join(directory, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
        const stderr = await new Promise((resolve) => {
          execFile(
            executable,
            [
              '--ignore-config',
              '--no-js-runtimes',
              '--js-runtimes',
              `node:${process.execPath}`,
              '--verbose',
            ],
            {
              timeout: 20_000,
              windowsHide: true,
              env: {
                ...process.env,
                ELECTRON_RUN_AS_NODE: '1',
                NODE_OPTIONS: undefined,
                NODE_PATH: undefined,
              },
            },
            (_error, _stdout, stderr) => resolve(stderr),
          );
        });
        return { version: process.versions.node, stderr };
      });
      assert.ok(runtime.stderr.includes(`JS runtimes: node-${runtime.version}`), runtime.stderr);
      const message = await page.evaluate(async () => {
        try {
          await window.vora.analyze('file:///etc/passwd');
        } catch (error) {
          return error.message;
        }
      });
      assert.match(message, /link válido/);
      const saved = await page.evaluate(() => window.vora.settings());
      assert.equal(saved.destination, directory);
      assert.equal(saved.preferences.kind, 'video');
      assert.equal(saved.notificationsEnabled, true);
      await page.evaluate(() => window.vora.setNotificationsEnabled(false));
      await assert.rejects(
        page.evaluate(() => window.vora.testNotification()),
        /Ative as notificações/,
      );
      assert.equal((await page.evaluate(() => window.vora.recoveries())).length, 1);
      await page.evaluate((id) => window.vora.cleanupRecovery(id), interrupted.id);
      assert.deepEqual(await page.evaluate(() => window.vora.recoveries()), []);
      for (const action of ['openCompletedFile', 'showCompletedFile', 'copyCompletedPath']) {
        const error = await page.evaluate(async (action) => {
          try {
            await window.vora[action]('missing-item');
          } catch (error) {
            return error.message;
          }
        }, action);
        assert.match(error, /Nenhum arquivo concluído|não encontrado/);
      }
      await page.evaluate(() =>
        window.vora.savePreferences({
          kind: 'audio',
          videoMode: 'original',
          audioMode: 'mp3',
          quality: { height: 720, fps: 60 },
        }),
      );
      await page.evaluate(() =>
        window.vora.addLinks(
          [
            'https://www.youtube.com/watch?v=BaW_jenozKc',
            'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          ],
          { kind: 'audio', videoMode: 'original', audioMode: 'mp3' },
        ),
      );
      const beforeRestart = await page.evaluate(() => window.vora.queue());
      assert.equal(beforeRestart.items.length, 2);
      assert.equal(beforeRestart.mode, 'paused');
      await assert.rejects(
        page.evaluate(() => window.vora.chooseGroupDirectory('missing')),
        /pendentes/,
      );
      await assert.rejects(
        page.evaluate(
          (id) =>
            window.vora.editQueueGroup(
              id,
              { kind: 'audio', videoMode: 'original', audioMode: 'mp3' },
              true,
            ),
          beforeRestart.groups[0].id,
        ),
        /Escolha a pasta/,
      );
      await page.evaluate(
        (id) =>
          window.vora.editQueueGroup(
            id,
            { kind: 'audio', videoMode: 'original', audioMode: 'original' },
            false,
          ),
        beforeRestart.groups[0].id,
      );
      assert.ok(beforeRestart.items.every((item) => item.status === 'waiting'));
      // Native compositors can pause animation frames; pointer interactions are covered by test:ui.
      await page.getByRole('button', { name: 'Configurações', exact: true }).dispatchEvent('click');
      await page.getByRole('dialog').waitFor();
      await page.getByText('2026.10.26', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await mkdir('test-results', { recursive: true });
      await page.screenshot({
        path: `test-results/vora-desktop${packaged ? '-packaged' : ''}.png`,
      });
      await application.close();
      application = await _electron.launch(launchOptions);
      const restarted = await application.firstWindow();
      await restarted.getByRole('textbox', { name: /Link do YouTube/ }).waitFor();
      const afterSettings = await restarted.evaluate(() => window.vora.settings());
      assert.equal(afterSettings.notificationsEnabled, false);
      const preferences = afterSettings.preferences;
      assert.equal(preferences.kind, 'audio');
      assert.equal(preferences.audioMode, 'mp3');
      assert.deepEqual(preferences.quality, { height: 720, fps: 60 });
      assert.deepEqual(await restarted.evaluate(() => window.vora.recoveries()), []);
      const afterRestart = await restarted.evaluate(() => window.vora.queue());
      assert.equal(afterRestart.mode, 'paused');
      assert.equal(afterRestart.activeId, undefined);
      assert.deepEqual(
        afterRestart.items.map((item) => item.id),
        beforeRestart.items.map((item) => item.id),
      );
      assert.ok(afterRestart.items.every((item) => item.status === 'waiting'));
      assert.ok(
        afterRestart.items.every(
          (item) => item.preferences.audioMode === 'original' && item.destination === directory,
        ),
      );

      assert.equal(
        JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')).destination,
        directory,
      );
    } finally {
      await application?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
