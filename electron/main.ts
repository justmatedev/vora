import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  Notification,
  protocol,
  session,
  shell,
} from 'electron';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Downloader, type ToolPaths } from './downloader';
import { runProcess } from './processes';
import { SettingsStore } from './settings';
import { RecoveryStore } from './recovery';
import { MetadataService, toolEnvironment } from './metadata';
import { DesktopNotifier } from './notifications';
import { QueueManager } from './queue';
import { youtubeSource } from '../shared/youtube';
import type { AppInfo, JobEvent } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  { scheme: 'vora', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.setName('Vora');
if (process.platform === 'win32') app.setAppUserModelId('app.vora.desktop');
let window: BrowserWindow;
let downloader: Downloader;
let settings: SettingsStore;
let recovery: RecoveryStore;
let metadata: MetadataService;
let queue: QueueManager;
let allowClose = false,
  askingClose = false;
const devUrl = !app.isPackaged ? process.env.VORA_DEV_URL : undefined;
if (devUrl && devUrl !== 'http://127.0.0.1:5173') throw new Error('Invalid development URL');

function toolPaths(): ToolPaths {
  const platform = process.platform === 'win32' ? 'win' : 'linux';
  const root = app.isPackaged
    ? join(process.resourcesPath, 'tools')
    : join(app.getAppPath(), 'resources', 'tools', `${platform}-${process.arch}`);
  const executable = (name: string) =>
    join(root, name + (process.platform === 'win32' ? '.exe' : ''));
  return {
    ytdlp: executable('yt-dlp'),
    ffmpeg: executable('ffmpeg'),
    ffprobe: executable('ffprobe'),
    node: process.execPath,
  };
}
async function completedPath(id: string) {
  const completed = queue.result(id);
  try {
    if (!(await stat(completed.path)).isFile()) throw new Error();
  } catch {
    throw new Error('O arquivo foi movido ou removido. Verifique a pasta de destino.');
  }
  return completed.path;
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url;
  const parsed = url ? new URL(url) : undefined;
  return (
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    !!parsed &&
    (devUrl ? parsed.origin === devUrl : parsed.protocol === 'vora:' && parsed.hostname === 'app')
  );
}
function handle(channel: string, handler: (...args: any[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error('Origem não autorizada.');
    try {
      return await handler(...args);
    } catch (error) {
      throw new Error((error as Error).message);
    }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      settings = new SettingsStore(
        join(app.getPath('userData'), 'settings.json'),
        app.getPath('downloads'),
      );
      await settings.load();
      recovery = new RecoveryStore(join(app.getPath('userData'), 'recoveries.json'));
      await recovery.load();
      const tools = toolPaths();
      const send = (channel: string, event: unknown) => {
        if (window && !window.isDestroyed()) window.webContents.send(channel, event);
      };
      const notifier = new DesktopNotifier({
        supported: () => Notification.isSupported(),
        enabled: () => settings.get().notificationsEnabled,
        create: (options) => new Notification(options),
        focus: () => {
          if (!window || window.isDestroyed()) return;
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        },
      });
      metadata = new MetadataService(tools, (event) => send('vora:playlist', event));
      downloader = new Downloader(tools, () => {}, runProcess, recovery);
      queue = new QueueManager(
        join(app.getPath('userData'), 'queue.json'),
        {
          notice: (notice) => notifier.queue(notice),
          beforeStart: async () => {
            if ((await recovery.list()).some((item) => item.running))
              throw new Error(
                'Um processo de uma sessão anterior ainda está em execução. Aguarde encerrar antes de iniciar a fila.',
              );
          },
          analyze: (url, signal) => metadata.analyze(url, signal),
          preview: (url, signal) => metadata.preview(url, signal),
          download: (info, request, destination, itemId, onEvent) =>
            downloader.download(info, request, destination, { itemId, onEvent }),
          cancelDownload: () => downloader.cancel(),
          cleanItem: async (id) => {
            for (const item of await recovery.list())
              if (item.queueItemId === id) await recovery.remove(item.id);
          },
        },
        (snapshot) => send('vora:queue', snapshot),
        (event) => send('vora:job', event),
      );
      await queue.load();
      const dist = resolve(app.getAppPath(), 'dist');
      protocol.handle('vora', (request) => {
        const url = new URL(request.url);
        if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
        const target = resolve(
          dist,
          '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
        );
        if (!target.startsWith(dist + sep)) return new Response('Forbidden', { status: 403 });
        return net.fetch(pathToFileURL(target).toString());
      });
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      window = new BrowserWindow({
        title: 'Vora',
        width: 960,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#111115',
        show: false,
        autoHideMenuBar: true,
        icon: join(app.getAppPath(), 'dist', 'icon.png'),
        webPreferences: {
          preload: join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.removeMenu();
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.once('ready-to-show', () => window.show());
      window.on('close', (event) => {
        if (allowClose) return;
        event.preventDefault();
        if (askingClose) return;
        askingClose = true;
        const shutdown = async () => {
          await queue.shutdown();
          await metadata.cancelAll();
          allowClose = true;
          window.close();
        };
        if (!queue.busy) {
          void shutdown().catch((error) => {
            askingClose = false;
            dialog.showErrorBox('Vora', (error as Error).message);
          });
          return;
        }
        void dialog
          .showMessageBox(window, {
            type: 'question',
            title: 'Encerrar o Vora?',
            message: 'Uma operação está em andamento.',
            detail:
              'O item atual será cancelado. Os pendentes ficam salvos para continuar na próxima abertura.',
            buttons: ['Continuar no Vora', 'Cancelar operação e sair'],
            defaultId: 0,
            cancelId: 0,
          })
          .then(async ({ response }) => {
            if (response === 1) {
              await shutdown();
            }
          })
          .catch((error) => dialog.showErrorBox('Vora', (error as Error).message))
          .finally(() => {
            askingClose = false;
          });
      });
      handle('vora:settings', () => settings.get());
      handle('vora:notifications-enabled', (enabled) => settings.setNotificationsEnabled(enabled));
      handle('vora:notification-test', () => notifier.test());
      handle('vora:save-preferences', (preferences) => settings.setPreferences(preferences));
      handle('vora:recoveries', () => recovery.list());
      handle('vora:cleanup-recovery', async (id) => {
        await recovery.remove(id);
      });
      handle('vora:paste', async () => (await clipboard.readText()).slice(0, 131072));
      handle('vora:choose-directory', async () => {
        const result = await dialog.showOpenDialog(window, {
          title: 'Pasta de destino',
          defaultPath: settings.get().destination,
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        try {
          await settings.setDestination(result.filePaths[0]);
        } catch {
          throw new Error('Não foi possível salvar a preferência de pasta.');
        }
        return settings.get().destination;
      });
      handle('vora:analyze', (url) => metadata.analyze(url));
      handle('vora:queue', () => queue.snapshot());
      handle('vora:add-links', (urls, preferences) => {
        if (!Array.isArray(urls) || !urls.length || urls.some((url) => typeof url !== 'string'))
          throw new Error('Informe um link por linha.');
        const entries = urls.map((url) => {
          const source = youtubeSource(url);
          if (!source.videoUrl || source.kind !== 'video')
            throw new Error('Revise os links com playlist antes de adicioná-los.');
          return {
            url: source.videoUrl,
            title: metadata.title(source.videoUrl),
            preview: metadata.cachedPreview(source.videoUrl),
          };
        });
        return queue.add(entries, preferences, settings.get().destination);
      });
      handle('vora:add-playlist', (id, indices, preferences) => {
        const selected = metadata.selected(id, indices);
        return queue.add(selected.entries, preferences, settings.get().destination, selected.label);
      });
      const groupDirectories = new Map<string, string>();
      handle('vora:group-directory', async (id) => {
        const group = queue.editableGroup(id);
        const result = await dialog.showOpenDialog(window, {
          title: 'Pasta dos itens pendentes',
          defaultPath: groupDirectories.get(id) ?? group.destination,
          properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        queue.editableGroup(id);
        groupDirectories.set(id, result.filePaths[0]);
        return result.filePaths[0];
      });
      handle('vora:group-edit', async (id, preferences, useSelectedDirectory) => {
        if (typeof useSelectedDirectory !== 'boolean')
          throw new Error('Configuração de pasta inválida.');
        const group = queue.editableGroup(id);
        const destination = useSelectedDirectory ? groupDirectories.get(id) : group.destination;
        if (!destination) throw new Error('Escolha a pasta antes de salvar.');
        await queue.editGroup(id, preferences, destination);
        groupDirectories.delete(id);
      });
      handle('vora:queue-start', () => queue.start());
      handle('vora:queue-pause', () => queue.pause());
      handle('vora:queue-cancel', (id) => queue.cancel(id));
      handle('vora:queue-remove', (id) => queue.remove(id));
      handle('vora:queue-move', (id, direction) => queue.move(id, direction));
      handle('vora:queue-retry', (id) => queue.retry(id));
      handle('vora:queue-clear', () => queue.clearCompleted());
      handle('vora:playlist-start', (url, id) => metadata.start(url, id));
      handle('vora:playlist-page', (id, page) => metadata.page(id, page));
      handle('vora:playlist-available', (id) => metadata.availableIndices(id));
      handle('vora:playlist-cancel', (id) => metadata.cancel(id));
      handle('vora:playlist-dispose', (id) => metadata.dispose(id));
      handle('vora:open-destination', async () => {
        const error = await shell.openPath(settings.get().destination);
        if (error) throw new Error('Não foi possível abrir a pasta de destino.');
      });
      handle('vora:open-completed-file', async (id) => {
        const error = await shell.openPath(await completedPath(id));
        if (error)
          throw new Error(
            'Não foi possível abrir o arquivo. Verifique se há um reprodutor instalado.',
          );
      });
      handle('vora:show-completed-file', async (id) =>
        shell.showItemInFolder(await completedPath(id)),
      );
      handle('vora:copy-completed-path', async (id) =>
        clipboard.writeText(await completedPath(id)),
      );
      handle(
        'vora:info',
        async (): Promise<AppInfo> => ({
          version: app.getVersion(),
          tools: await Promise.all(
            [
              ['yt-dlp', tools.ytdlp, '--version'],
              ['FFmpeg', tools.ffmpeg, '-version'],
              ['ffprobe', tools.ffprobe, '-version'],
              ['Node.js (Electron)', tools.node, '--version'],
            ].map(async ([name, executable, argument]) => {
              try {
                return {
                  name,
                  version: (
                    await runProcess(executable, [argument], {
                      timeout: 10_000,
                      env: toolEnvironment(),
                    })
                  ).split(/\r?\n/)[0],
                };
              } catch {
                return { name, error: 'Não encontrado ou indisponível' };
              }
            }),
          ),
        }),
      );
      await window.loadURL(devUrl ?? 'vora://app/index.html');
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox(
        'Vora',
        'Não foi possível iniciar o aplicativo. Consulte o terminal para mais detalhes.',
      );
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
}
