import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { queueFixture } from './ui-fixture.mjs';
import { transcriptionFixture } from './transcription-ui-fixture.mjs';
test(
  'transcrições: arquivo local, opções, destino independente, resultado e modelos',
  { timeout: 60000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      page.setDefaultTimeout(5000);
      await page.addInitScript(queueFixture);
      await page.addInitScript(transcriptionFixture);
      await page.goto('http://127.0.0.1:4176');
      await page.getByRole('tab', { name: 'Transcrições', exact: true }).click();
      await page.getByRole('button', { name: 'Selecionar arquivo', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Nova transcrição', exact: true });
      await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(
        await page
          .getByRole('button', { name: 'Selecionar arquivo', exact: true })
          .evaluate((element) => element === document.activeElement),
        true,
      );
      await page.getByRole('button', { name: 'Selecionar arquivo', exact: true }).click();
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('radio', { name: /Small/ }).isChecked(), true);
      await dialog.getByRole('checkbox', { name: 'TXT', exact: true }).uncheck();
      await dialog.getByRole('checkbox', { name: 'SRT', exact: true }).uncheck();
      await dialog.getByRole('button', { name: 'Adicionar e iniciar', exact: true }).click();
      await dialog.getByRole('alert').waitFor();
      await dialog.getByRole('checkbox', { name: 'TXT', exact: true }).check();
      await dialog.getByRole('checkbox', { name: 'SRT', exact: true }).check();
      await dialog.getByRole('button', { name: 'Escolher outra pasta', exact: true }).click();
      await dialog.getByRole('button', { name: 'Adicionar e iniciar', exact: true }).click();
      await page.getByRole('heading', { name: 'entrevista.mp4', exact: true }).waitFor();
      const calls = await page.evaluate(() => window.__transcription.calls());
      assert.equal(calls[0].destinationId, 'separate-output');
      assert.equal(calls[0].options.modelId, 'small');
      assert.equal(
        (await page.evaluate(() => window.vora.settings())).destination,
        '/home/teste/Downloads',
      );
      await page.evaluate(() => window.__transcription.setStatus('job-0', 'completed'));
      await page.getByRole('button', { name: 'Abrir TXT', exact: true }).click();
      assert.ok(
        (await page.evaluate(() => window.__transcription.calls())).some(
          (call) => call.open === 'job-0',
        ),
      );
      await page.getByRole('button', { name: 'Modelos', exact: true }).click();
      const models = page.getByRole('dialog', { name: 'Modelos de transcrição', exact: true });
      await models.getByRole('button', { name: 'Baixar Medium', exact: true }).click();
      await models
        .getByRole('button', { name: 'Cancelar download de Medium', exact: true })
        .click();
      await models.getByRole('button', { name: 'Retomar Medium', exact: true }).waitFor();
      await page.evaluate(() => window.__transcription.finishModel('medium'));
      await models.getByRole('button', { name: 'Remover Medium', exact: true }).click();
      await models.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
      await models.getByRole('button', { name: 'Baixar Medium', exact: true }).waitFor();
      await models.getByRole('button', { name: 'Fechar modelos', exact: true }).click();
      for (let index = 0; index < 3; index++) {
        await page.getByRole('tab', { name: 'Downloads', exact: true }).click();
        await page.getByRole('tab', { name: 'Transcrições', exact: true }).click();
      }
      assert.deepEqual(await page.evaluate(() => window.__transcription.listeners()), {
        queue: 1,
        models: 1,
      });
      await mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/transcriptions-960.png' });
      await page.setViewportSize({ width: 620, height: 600 });
      await page.getByRole('button', { name: 'Selecionar arquivo', exact: true }).click();
      await dialog.waitFor();
      const box = await dialog
        .getByRole('button', { name: 'Adicionar e iniciar', exact: true })
        .boundingBox();
      assert.ok(box && box.y + box.height <= 600);
      await page.screenshot({ path: 'test-results/transcriptions-dialog-620.png' });
    } finally {
      await browser?.close();
      server.httpServer?.close();
    }
  },
);
test(
  'download concluído entra na transcrição com consentimento explícito de modelo ausente',
  { timeout: 30000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      page.setDefaultTimeout(5000);
      await page.addInitScript(queueFixture);
      await page.addInitScript(transcriptionFixture);
      await page.goto('http://127.0.0.1:4177');
      await page.evaluate(() =>
        window.__test.replaceQueue({
          mode: 'paused',
          groups: [
            {
              id: 'group',
              label: 'Downloads',
              createdAt: new Date().toISOString(),
              destination: '/home/teste/Videos',
              preferences: { kind: 'video', videoMode: 'original', audioMode: 'original' },
            },
          ],
          items: [
            {
              id: 'download',
              groupId: 'group',
              url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
              title: 'Vídeo baixado',
              destination: '/home/teste/Videos',
              preferences: { kind: 'video', videoMode: 'original', audioMode: 'original' },
              status: 'completed',
              result: {
                type: 'complete',
                filename: 'baixado.mp4',
                path: '/home/teste/Videos/baixado.mp4',
                size: 1234,
              },
            },
          ],
        }),
      );
      await page.getByRole('button', { name: 'Detalhes: Vídeo baixado', exact: true }).click();
      await page.getByRole('button', { name: 'Transcrever', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Nova transcrição', exact: true });
      await dialog.getByRole('radio', { name: /Medium/ }).check();
      await dialog.getByRole('button', { name: 'Baixar modelo e adicionar', exact: true }).click();
      const request = (await page.evaluate(() => window.__transcription.calls()))[0];
      assert.deepEqual(request.sourceIds, ['download-file']);
      assert.equal(request.options.modelId, 'medium');
      assert.equal(request.downloadModel, true);
      await page.getByText('Aguardando modelo', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Remover da fila', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Suas transcrições aparecem aqui', exact: true })
        .waitFor();
      assert.equal((await page.evaluate(() => window.__transcription.state())).items.length, 0);
    } finally {
      await browser?.close();
      server.httpServer?.close();
    }
  },
);

test(
  'remoção consistente nas duas filas e controles sem trabalho pendente',
  { timeout: 30000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      page.setDefaultTimeout(3000);
      await page.addInitScript(queueFixture);
      await page.addInitScript(transcriptionFixture);
      await page.goto('http://127.0.0.1:4178');
      const downloads = page.getByRole('region', { name: 'Fila de downloads' });
      for (const status of ['failed', 'interrupted', 'cancelled', 'completed']) {
        await page.evaluate((status) => {
          window.__test.replaceQueue({
            mode: 'paused',
            groups: [],
            items: [
              {
                id: 'terminal',
                groupId: 'group',
                title: 'Download encerrado',
                url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
                destination: '/home/teste/Downloads',
                preferences: { kind: 'video', videoMode: 'original', audioMode: 'original' },
                status,
              },
            ],
          });
        }, status);
        await downloads.getByRole('heading', { name: 'Download encerrado', exact: true }).waitFor();
        assert.equal(
          await downloads.getByRole('button', { name: 'Continuar fila', exact: true }).count(),
          0,
        );
        if (status !== 'completed') {
          await downloads
            .getByRole('button', { name: 'Detalhes: Download encerrado', exact: true })
            .click();
          await downloads.getByRole('button', { name: 'Remover', exact: true }).click();
          await downloads.getByRole('heading', { name: 'Adicione um link para começar' }).waitFor();
        }
      }
      await page.getByRole('tab', { name: 'Transcrições', exact: true }).click();
      for (const status of ['model', 'waiting', 'cancelled', 'failed', 'interrupted']) {
        await page.evaluate(async (status) => {
          const ids = await window.vora.transcriptions.add({
            sourceIds: ['selected-file'],
            options: { modelId: 'small', language: 'pt', formats: ['txt'] },
            start: false,
            downloadModel: false,
          });
          window.__transcription.setStatus(ids[0], status);
        }, status);
        const row = page.getByRole('article', { name: 'entrevista.mp4', exact: true });
        await row.waitFor();
        await row
          .getByRole('button', {
            name: ['model', 'waiting'].includes(status) ? 'Remover da fila' : 'Remover',
            exact: true,
          })
          .click();
        await page
          .getByRole('heading', { name: 'Suas transcrições aparecem aqui', exact: true })
          .waitFor();
        assert.equal((await page.evaluate(() => window.__transcription.state())).items.length, 0);
      }
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  },
);
