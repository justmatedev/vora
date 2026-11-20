import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, link, copyFile, rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright';
import electron from 'electron';
import { ModelManager } from '../electron/whisper-models.ts';
test(
  'Electron real: arquivo local pela interface até TXT/SRT com Small instalado',
  { timeout: 3_600_000 },
  async (t) => {
    if (process.env.VORA_TEST_TRANSCRIPTION !== '1')
      return t.skip('Ative VORA_TEST_TRANSCRIPTION=1 para executar o motor real no Electron.');
    const input = process.env.VORA_TRANSCRIPTION_INPUT,
      weights = process.env.VORA_WHISPER_MODELS;
    if (!input || !weights) return t.skip('Defina VORA_TRANSCRIPTION_INPUT e VORA_WHISPER_MODELS.');
    try {
      await access(input);
      await access(join(weights, 'ggml-small.bin'));
    } catch {
      return t.skip('Arquivo ou modelo Small ausente.');
    }
    await mkdir('.cache', { recursive: true });
    const profile = await mkdtemp(resolve('.cache/transcription-desktop-'));
    let app;
    try {
      const models = new ModelManager(join(profile, 'models/whisper'), () => {});
      const paths = models.paths('small');
      await mkdir(paths.directory, { recursive: true });
      try {
        await link(join(weights, 'ggml-small.bin'), paths.installed);
      } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        await copyFile(join(weights, 'ggml-small.bin'), paths.installed);
      }
      const output = join(profile, 'output');
      await mkdir(output);
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.VORA_DEV_URL;
      app = await _electron.launch({
        executablePath: electron,
        args: [
          '.',
          `--user-data-dir=${profile}`,
          '--no-sandbox',
          '--disable-gpu',
          ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : []),
        ],
        env,
      });
      // Only the native chooser is replaced; UI, preload, IPC, services and engine are real.
      await app.evaluate(
        ({ dialog, session }, { input, output }) => {
          session.defaultSession.webRequest.onBeforeRequest(
            { urls: ['http://*/*', 'https://*/*'] },
            (_details, done) => done({ cancel: true }),
          );
          dialog.showOpenDialog = async (_window, options) => ({
            canceled: false,
            filePaths: [options.properties.includes('openFile') ? input : output],
          });
        },
        { input: resolve(input), output },
      );
      const page = await app.firstWindow();
      page.setDefaultTimeout(3_300_000);
      await page.getByRole('tab', { name: 'Transcrições', exact: true }).click();
      await page.getByRole('button', { name: 'Selecionar arquivo', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Nova transcrição', exact: true });
      await dialog.getByRole('button', { name: 'Escolher outra pasta', exact: true }).click();
      await dialog.getByRole('button', { name: 'Adicionar e iniciar', exact: true }).click();
      await page.getByRole('button', { name: 'Abrir TXT', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Abrir SRT', exact: true }).waitFor();
      const snapshot = await page.evaluate(() => window.vora.transcriptions.snapshot());
      assert.equal(snapshot.items[0].status, 'completed', snapshot.items[0].error);
      for (const result of snapshot.items[0].outputs) {
        assert.ok(result.path.startsWith(output));
        assert.ok((await readFile(result.path, 'utf8')).trim());
      }
    } finally {
      await app?.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
);
