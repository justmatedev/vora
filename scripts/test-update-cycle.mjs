// Real AppImage replacement and relaunch, isolated from the maintainer's app/profile.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startUpdateServer } from './update-cycle-server.mjs';

if (process.platform !== 'linux')
  throw new Error('Este executor automatiza AppImage no Linux; no Windows use o roteiro do kit.');
const kit = resolve(process.argv[2] || 'release/update-cycle-linux');
const output = resolve('test-results/update-cycle');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'session-'));
const profile = join(directory, 'profile');
const cache = join(directory, 'cache');
const current = join(directory, 'Vora com espaços.AppImage');
await mkdir(profile);
await mkdir(cache);
await cp(join(kit, 'initial/VoraUpdateTest-0.6.0-linux-x86_64.AppImage'), current);
await chmod(current, 0o755);
const hash = async (path) =>
  createHash('sha512')
    .update(await readFile(path))
    .digest('hex');
const preferences = { kind: 'audio', videoMode: 'original', audioMode: 'mp3' };
const settings = { destination: directory, notificationsEnabled: false, preferences };
await writeFile(join(profile, 'settings.json'), JSON.stringify(settings));
const completed = join(directory, 'arquivo preservado.mp3');
await writeFile(completed, 'Conteúdo anterior à atualização.');
const savedFileHash = await hash(completed);
const savedFileSize = (await readFile(completed)).length;
const group = {
  id: 'cycle-group',
  label: 'Validação da atualização',
  createdAt: new Date().toISOString(),
  preferences,
  destination: directory,
};
const items = ['waiting', 'completed'].map((status, index) => ({
  id: `cycle-item-${index}`,
  groupId: group.id,
  title: `Item de teste ${index + 1}`,
  preview: { title: `Item de teste ${index + 1}`, channel: 'Validação local', duration: 42 },
  url: `https://www.youtube.com/watch?v=${index ? 'aqz-KE-bpKQ' : 'BaW_jenozKc'}`,
  preferences,
  destination: directory,
  status,
  ...(status === 'completed'
    ? {
        result: {
          type: 'complete',
          filename: 'arquivo preservado.mp3',
          path: completed,
          size: savedFileSize,
        },
      }
    : {}),
}));
await writeFile(
  join(profile, 'queue.json'),
  JSON.stringify({ groups: [group], items, mode: 'paused' }),
);
const portProbe = createServer();
await new Promise((accept) => portProbe.listen(0, '127.0.0.1', accept));
const port = portProbe.address().port;
await new Promise((accept) => portProbe.close(accept));
const { server, requests } = await startUpdateServer(join(kit, 'updates'));
let application, browser, initialBrowser;
let processLog = '';
const env = {
  ...process.env,
  APPIMAGE_EXTRACT_AND_RUN: '1',
  XDG_CACHE_HOME: cache,
  VORA_CYCLE_DEBUG_PORT: String(port),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.VORA_DEV_URL;
const sleep = (ms) => new Promise((accept) => setTimeout(accept, ms));
async function until(action, description, timeout = 90_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await action();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(500);
  }
  throw new Error(`Tempo esgotado: ${description}; ${last?.message || ''}`);
}
async function connectVersion(version) {
  const connection = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 });
  try {
    const candidate = connection
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url().startsWith('vora://'));
    if (
      candidate &&
      (await candidate.evaluate(() => window.vora.updates())).currentVersion === version
    )
      return { connection, page: candidate };
  } catch {
    /* The renderer may still be loading or the previous process may be quitting. */
  }
  await connection.close();
}
try {
  // Start the real packaged app without Playwright's Electron launch hooks. CDP
  // reconnects to both instances, including the one started by app.relaunch().
  application = spawn(
    current,
    [`--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--ozone-platform=x11'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [application.stdout, application.stderr]) {
    stream.on('data', (chunk) => {
      processLog = (processLog + chunk).slice(-64_000);
    });
  }
  application.on('error', (error) => {
    processLog += error.stack;
  });
  const initial = await until(() => connectVersion('0.6.0'), 'inicialização do AppImage 0.6.0');
  initialBrowser = initial.connection;
  const page = initial.page;
  console.log('AppImage inicial aberto; conferindo consulta e download por clique.');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  assert.equal((await page.evaluate(() => window.vora.updates())).currentVersion, '0.6.0');
  const initialQueue = await page.evaluate(() => window.vora.queue());
  assert.equal(initialQueue.items.length, 2);
  assert.equal(initialQueue.mode, 'paused');
  await page.evaluate(() => window.vora.checkForUpdates());
  await until(
    async () => (await page.evaluate(() => window.vora.updates())).status === 'available',
    'oferecer 0.6.1',
  );
  assert.equal((await page.evaluate(() => window.vora.updates())).version, '0.6.1');
  assert.equal(
    requests.some(({ name }) => name.endsWith('.AppImage')),
    false,
    'Consulta não pode baixar automaticamente',
  );
  await page.screenshot({ path: join(output, 'antes.png') });
  await page.getByRole('button', { name: 'Baixar atualização', exact: true }).click();
  await until(
    async () => {
      const state = await page.evaluate(() => window.vora.updates());
      if (state.status === 'error') throw new Error(state.message);
      return state.status === 'downloaded' && state.canInstall;
    },
    'download completo',
    180_000,
  );
  assert.ok(requests.some(({ name }) => name.endsWith('.AppImage')));
  console.log('Download confirmado; instalando e aguardando a nova versão abrir.');
  await page.getByRole('button', { name: 'Reiniciar e atualizar', exact: true }).click();
  const next = await until(() => connectVersion('0.6.1'), 'reinício real na versão 0.6.1');
  browser = next.connection;
  const updated = next.page;
  const nextQueue = await updated.evaluate(() => window.vora.queue());
  assert.deepEqual(nextQueue.items, initialQueue.items);
  assert.deepEqual(nextQueue.groups, initialQueue.groups);
  assert.equal(nextQueue.mode, 'paused');
  assert.deepEqual(await updated.evaluate(() => window.vora.settings()), settings);
  assert.equal(await hash(completed), savedFileHash);
  assert.equal(
    await hash(current),
    await hash(join(kit, 'updates/VoraUpdateTest-0.6.1-linux-x86_64.AppImage')),
  );
  await updated.getByRole('button', { name: 'Configurações', exact: true }).click();
  await updated.evaluate(() => window.vora.checkForUpdates());
  await until(
    async () => (await updated.evaluate(() => window.vora.updates())).status === 'current',
    'confirmar ausência de atualização após instalar',
  );
  await updated.screenshot({ path: join(output, 'depois.png') });
  const report = {
    platform: process.platform,
    date: new Date().toISOString(),
    from: '0.6.0',
    to: '0.6.1',
    result: 'passed',
    realAppImageReplacement: true,
    realRelaunch: true,
    sameAppImagePath: true,
    settingsPreserved: true,
    pendingAndCompletedItemsPreserved: true,
    queuePaused: true,
    completedFileUnchanged: true,
    noAutomaticDownload: true,
    noPublicRelease: true,
    requests,
  };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await updated.close();
} catch (error) {
  await writeFile(join(output, 'failure.log'), `${error.stack}\n\n${processLog}`);
  console.error(processLog.slice(-6000));
  throw error;
} finally {
  for (const connection of [browser, initialBrowser].filter(Boolean)) {
    for (const context of connection.contexts()) {
      for (const page of context.pages()) {
        if (page.url().startsWith('vora://')) await page.close().catch(() => {});
      }
    }
  }
  await browser?.close().catch(() => {});
  await initialBrowser?.close().catch(() => {});
  if (application && application.exitCode === null) application.kill('SIGTERM');
  await new Promise((accept) => server.close(accept));
  // Keep the two screenshots/report, remove only this generated session and cache.
  await rm(directory, { recursive: true, force: true });
}
