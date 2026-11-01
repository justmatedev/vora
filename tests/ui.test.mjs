import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { queueFixture } from './ui-fixture.mjs';

test(
  'interface: fila, grupos, progresso ativo, pausa, arquivos por item e restauração',
  { timeout: 60_000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: process.env.VORA_TEST_BROWSER ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
      });
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(queueFixture);
      await page.goto('http://127.0.0.1:4173');
      await page.getByRole('heading', { name: 'Adicione um link para começar' }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: 'Buscar na fila', exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByRole('button', { name: 'Iniciar fila', exact: true }).count(),
        0,
      );
      await mkdir('test-results', { recursive: true });
      await page.screenshot({
        path: 'test-results/vora-inicio-compacto.png',
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Colar', exact: true }).click();
      await page.getByRole('textbox', { name: /Link do YouTube/ }).press('Enter');
      const firstAnalysis = page.getByRole('dialog', { name: 'Opções do vídeo', exact: true });
      await firstAnalysis.waitFor();
      await page.keyboard.press('Escape');
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 0);
      await page.getByRole('heading', { name: 'Adicione um link para começar' }).waitFor();
      await page.getByRole('button', { name: 'Rever opções', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__test.analyzed.length), 1);
      await page.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Adicionar à fila', exact: true }).count(),
        0,
      );
      await page.getByRole('button', { name: 'Rever opções', exact: true }).click();
      const queue = page.getByRole('region', { name: 'Fila de downloads' });
      await queue.getByText('Fila pausada', { exact: true }).waitFor();
      assert.equal(await queue.getByRole('progressbar').count(), 0);
      await page.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      await page.getByText('1 link repetido ignorado.', { exact: false }).waitFor();
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 1);
      const firstId = await page.evaluate(() => window.__test.state().items[0].id);
      await queue.getByText('Carregando informações…', { exact: true }).waitFor();
      await page.evaluate(() => window.__test.setPreview(0, 'error'));
      await queue.getByText(/Não foi possível carregar a prévia/).waitFor();
      await page.route('https://i.ytimg.com/**', (route) =>
        route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1EAAAAASUVORK5CYII=',
            'base64',
          ),
        }),
      );
      await page.evaluate(() =>
        window.__test.setPreview(0, 'ready', {
          title: 'Vídeo individual de teste',
          channel: 'Canal da prévia',
          duration: 125,
          thumbnail: 'https://i.ytimg.com/vi/test/default.jpg',
        }),
      );
      await queue.getByText('Canal da prévia · 2:05', { exact: true }).waitFor();
      assert.equal(await queue.locator('.queue-thumbnail').count(), 1);
      assert.equal(await queue.getByText('Carregando informações…', { exact: true }).count(), 0);
      await queue.getByRole('button', { name: 'Iniciar fila', exact: true }).click();
      await queue.getByText('Baixando vídeo', { exact: true }).waitFor();
      assert.equal(await queue.getByRole('progressbar').count(), 1);
      assert.equal(await page.getByRole('textbox', { name: /Link do YouTube/ }).isEnabled(), true);
      await page.getByRole('button', { name: 'Adicionar links', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Adicionar links' });
      await dialog
        .getByRole('textbox', { name: /Links do YouTube/ })
        .fill(
          'https://www.youtube.com/watch?v=aqz-KE-bpKQ\nhttps://www.youtube.com/watch?v=M7lc1UVf-VE',
        );
      await dialog.getByLabel('Baixar', { exact: true }).selectOption('audio');
      await dialog.getByLabel('Formato', { exact: true }).selectOption('mp3');
      await dialog.getByRole('button', { name: 'Alterar', exact: true }).click();
      await dialog.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      const state = await page.evaluate(() => window.__test.state());
      assert.equal(state.items.length, 3);
      assert.equal(state.items[0].destination, '/home/teste/Downloads');
      assert.equal(state.items[1].preferences.audioMode, 'mp3');
      assert.equal(state.items[1].destination, '/home/teste/Vídeos com espaços');
      await page.setViewportSize({ width: 800, height: 600 });
      await queue.getByRole('button', { name: 'Editar grupo: Links', exact: true }).click();
      let editor = page.getByRole('dialog', { name: 'Editar grupo', exact: true });
      await editor.getByLabel('Formato', { exact: true }).selectOption('original');
      await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(
        (await page.evaluate(() => window.__test.state())).items[1].preferences.audioMode,
        'mp3',
      );
      await queue.getByRole('button', { name: 'Editar grupo: Links', exact: true }).click();
      editor = page.getByRole('dialog', { name: 'Editar grupo', exact: true });
      await editor.getByLabel('Formato', { exact: true }).selectOption('original');
      await editor.getByRole('button', { name: 'Alterar', exact: true }).click();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({
        path: 'test-results/vora-editar-grupo.png',
        fullPage: true,
        animations: 'disabled',
      });
      await editor.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
      await queue.locator('.group-folder summary').filter({ hasText: 'Novo destino á' }).click();
      await queue.getByText('/home/teste/Novo destino á', { exact: true }).first().waitFor();
      const edited = await page.evaluate(() => window.__test.state());
      assert.equal(edited.items[1].preferences.audioMode, 'original');
      assert.equal(edited.items[1].destination, '/home/teste/Novo destino á');
      assert.equal(edited.items[2].destination, '/home/teste/Novo destino á');
      assert.equal(edited.items[0].destination, '/home/teste/Downloads');
      assert.equal(edited.items[1].id, state.items[1].id);

      await queue.getByRole('button', { name: 'Pausar após o atual', exact: true }).click();
      await queue.getByText('Pausando após o atual', { exact: true }).waitFor();
      await page.evaluate(() =>
        window.__emit({
          type: 'progress',
          stage: 'downloading',
          track: 'audio',
          percent: 12,
          transfers: [
            { kind: 'video', status: 'complete', percent: 100 },
            { kind: 'audio', status: 'downloading', percent: 12 },
          ],
        }),
      );
      await queue.getByText('Baixando áudio', { exact: true }).waitFor();
      assert.equal(await queue.getByRole('progressbar').count(), 1);
      assert.equal(
        await queue.getByRole('progressbar', { name: 'Progresso do vídeo', exact: true }).count(),
        0,
      );
      await mkdir('test-results', { recursive: true });
      await page.screenshot({
        path: 'test-results/vora-fila.png',
        fullPage: true,
        animations: 'disabled',
      });
      await page.evaluate(() => window.__complete());
      await queue.getByText('Fila pausada', { exact: true }).waitFor();
      const firstRow = queue.getByRole('article', {
        name: 'Vídeo individual de teste',
        exact: true,
      });
      await firstRow.getByRole('button', { name: 'Abrir arquivo', exact: true }).click();
      await firstRow
        .getByRole('button', { name: 'Detalhes: Vídeo individual de teste', exact: true })
        .click();
      await firstRow.getByRole('button', { name: 'Mostrar na pasta', exact: true }).click();
      await firstRow.getByRole('button', { name: /Copiar caminho:/ }).click();
      assert.deepEqual(await page.evaluate(() => window.__test.actions), [
        { id: firstId, action: 'open' },
        { id: firstId, action: 'show' },
        { id: firstId, action: 'copy' },
      ]);
      await queue.getByRole('button', { name: /Detalhes: Link aqz/ }).click();
      await queue.getByRole('button', { name: /Mover para baixo: Link aqz/ }).click();
      assert.equal(
        (await page.evaluate(() => window.__test.state())).items[1].url.includes('M7lc1UVf-VE'),
        true,
      );
      await queue.getByRole('button', { name: 'Continuar fila', exact: true }).click();
      await queue.getByText('Baixando áudio', { exact: true }).waitFor();
      await page.evaluate(() => window.__test.retrying());
      await queue.getByText('Nova tentativa', { exact: true }).waitFor();
      await queue.getByText(/Tentativa 2 de 3 · nova tentativa em/).waitFor();
      assert.equal(await queue.getByRole('progressbar').count(), 0);
      await page.screenshot({
        path: 'test-results/vora-novas-tentativas.png',
        fullPage: true,
        animations: 'disabled',
      });
      await queue.getByRole('button', { name: 'Cancelar item', exact: true }).click();
      const cancelled = queue.getByRole('article', { name: 'Link M7lc1UVf-VE', exact: true });
      await cancelled.getByText('Cancelado', { exact: true }).waitFor();
      await cancelled.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
      await cancelled.getByRole('button', { name: /Detalhes: Link M7/ }).click();
      await cancelled.getByRole('button', { name: 'Remover', exact: true }).click();
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 2);
      await page.reload();
      await queue.getByText('Fila pausada', { exact: true }).waitFor();
      assert.equal(await queue.getByRole('progressbar').count(), 0);
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 2);
      await page.setViewportSize({ width: 800, height: 600 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await queue.getByRole('button', { name: 'Continuar fila', exact: true }).click();
      await queue.getByText('Baixando áudio', { exact: true }).waitFor();
      await page.evaluate(() => window.__complete());
      const inputTop = (await page.getByRole('textbox', { name: /Link do YouTube/ }).boundingBox())
        .y;
      await queue.getByRole('button', { name: 'Limpar concluídos', exact: true }).click();
      await page.getByRole('heading', { name: 'Adicione um link para começar' }).waitFor();
      assert.equal(
        (await page.getByRole('textbox', { name: /Link do YouTube/ }).boundingBox()).y,
        inputTop,
      );
      assert.equal(
        await page.getByRole('textbox', { name: 'Buscar na fila', exact: true }).count(),
        0,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollHeight > innerHeight),
        false,
      );
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 0);
      await page.getByRole('button', { name: 'Configurações', exact: true }).click();
      let settings = page.getByRole('dialog', { name: 'Configurações', exact: true });
      const toggle = settings.getByRole('checkbox', { name: /Avisar quando a fila/ });
      await toggle.uncheck();
      assert.equal(
        await settings
          .getByRole('button', { name: 'Testar notificação', exact: true })
          .isDisabled(),
        true,
      );
      await toggle.check();
      await settings.getByRole('button', { name: 'Testar notificação', exact: true }).click();
      await settings
        .getByText('Teste enviado. Confira as notificações do sistema.', { exact: true })
        .waitFor();
      assert.equal(await page.evaluate(() => window.__test.notificationTests), 1);
      await page.screenshot({ path: 'test-results/vora-notificacoes.png', animations: 'disabled' });
      await toggle.uncheck();
      await settings.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Configurações', exact: true }).click();
      settings = page.getByRole('dialog', { name: 'Configurações', exact: true });
      assert.equal(
        await settings.getByRole('checkbox', { name: /Avisar quando a fila/ }).isChecked(),
        false,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  },
);

test(
  'interface: link misto, playlist paginada, seleção parcial em ordem e cancelamento',
  { timeout: 60_000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: process.env.VORA_TEST_BROWSER ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
      });
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(queueFixture);
      await page.goto('http://127.0.0.1:4173');
      const input = page.getByRole('textbox', { name: /Link do YouTube/ });
      await input.fill('https://www.youtube.com/watch?v=BaW_jenozKc&list=PL1234567890abcdef');
      await input.press('Enter');
      let dialog = page.getByRole('dialog', { name: 'Adicionar links' });
      await dialog.getByRole('button', { name: 'Somente este vídeo', exact: true }).click();
      await dialog.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 1);
      assert.equal(await page.evaluate(() => window.__test.analyzed.length), 0);
      await input.fill('https://www.youtube.com/playlist?list=PL1234567890abcdef');
      await input.press('Enter');
      dialog = page.getByRole('dialog', { name: 'Selecionar vídeos da playlist' });
      await dialog.getByText('203 itens encontrados', { exact: false }).waitFor();
      assert.equal(await dialog.locator('.playlist-entry').count(), 100);
      assert.equal(
        await dialog.locator('.playlist-entry').nth(1).getByRole('checkbox').isDisabled(),
        true,
      );
      assert.equal(
        await dialog.locator('.playlist-entry').nth(2).locator('.entry-duration').innerText(),
        '—',
      );
      await dialog.getByRole('button', { name: 'Selecionar todos', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Adicionar selecionados (202)', exact: true })
        .waitFor();
      await dialog.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
      await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
      await dialog.getByText('Página 2 de 3', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Próxima', exact: true }).click();
      await dialog.getByText('Página 3 de 3', { exact: true }).waitFor();
      await dialog
        .locator('.playlist-entry')
        .filter({ hasText: 'Vídeo da playlist 203' })
        .getByRole('checkbox')
        .check();
      await dialog.getByRole('button', { name: 'Anterior', exact: true }).click();
      await dialog.getByRole('button', { name: 'Anterior', exact: true }).click();
      await dialog.getByText('Página 1 de 3', { exact: true }).waitFor();
      await dialog.locator('.playlist-entry').first().getByRole('checkbox').check();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({
        path: 'test-results/vora-playlist.png',
        fullPage: true,
        animations: 'disabled',
      });
      await dialog.getByRole('button', { name: 'Adicionar selecionados (2)', exact: true }).click();
      const state = await page.evaluate(() => window.__test.state());
      assert.equal(state.items.length, 3);
      assert.equal(state.mode, 'paused');
      assert.deepEqual(
        state.items.slice(1).map((item) => item.title),
        ['Vídeo da playlist 1', 'Vídeo da playlist 203'],
      );
      await page.evaluate(() => {
        window.__test.holdPlaylist = true;
      });
      await input.press('Enter');
      dialog = page.getByRole('dialog', { name: 'Selecionar vídeos da playlist' });
      await dialog.getByRole('button', { name: 'Cancelar consulta', exact: true }).click();
      await dialog.getByText('Consulta cancelada.', { exact: false }).waitFor();
      assert.equal(
        await dialog
          .getByRole('button', { name: 'Adicionar selecionados (0)', exact: true })
          .isDisabled(),
        true,
      );
      await dialog.getByRole('button', { name: 'Fechar importação', exact: true }).click();
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 3);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  },
);

test(
  'interface: painel ativo fixo, grupos intercalados, busca, filtros, paginação e análise em modal',
  { timeout: 60_000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: process.env.VORA_TEST_BROWSER ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
      });
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(queueFixture);
      await page.goto('http://127.0.0.1:4173');
      await page.evaluate(() => {
        const preferences = { kind: 'video', videoMode: 'original', audioMode: 'original' };
        const make = (id, title, groupId = 'a', status = 'waiting') => ({
          id,
          title,
          groupId,
          status,
          url: `https://www.youtube.com/watch?v=${id.padEnd(11, '0').slice(0, 11)}`,
          preferences,
          destination: '/home/teste/Downloads',
          preview: {
            title,
            channel: id === 'row0' ? 'Canal Épico' : 'Canal de teste',
            duration: 125,
          },
          previewState: 'ready',
        });
        const rows = Array.from({ length: 205 }, (_, i) =>
          make(
            `row${i}`,
            i === 0
              ? 'Canção ÁGUA'
              : i === 3
                ? 'Falha ÁGUA'
                : i === 10
                  ? 'Um título longo '.repeat(25)
                  : `Vídeo ${i}`,
            i === 2 ? 'b' : 'a',
            i === 1
              ? 'completed'
              : i === 3
                ? 'failed'
                : i === 4
                  ? 'cancelled'
                  : i === 5
                    ? 'interrupted'
                    : 'waiting',
          ),
        );
        rows[1].result = {
          type: 'complete',
          filename: 'Vídeo salvo.mp4',
          path: '/home/teste/Downloads/Vídeo salvo.mp4',
          size: 1024,
        };
        rows[3].error = 'Este vídeo foi removido.';
        const active = make('active', 'Download em andamento');
        active.status = 'downloading';
        active.progress = { type: 'progress', stage: 'downloading', track: 'video', percent: 30 };
        window.__test.replaceQueue({
          mode: 'running',
          activeId: active.id,
          items: [active, ...rows],
          groups: [
            { id: 'a', label: 'Lote principal', preferences, destination: '/home/teste/Downloads' },
            {
              id: 'b',
              label: 'Playlist secundária',
              preferences,
              destination: '/home/teste/Downloads',
            },
          ],
        });
      });
      const queue = page.getByRole('region', { name: 'Fila de downloads' });
      const list = queue.locator('.queue-items'),
        search = queue.getByRole('textbox', { name: 'Buscar na fila' });
      await queue.getByRole('article', { name: 'Download em andamento', exact: true }).waitFor();
      assert.equal(await queue.getByRole('article').count(), 101);
      assert.deepEqual(await queue.locator('.group-name').allTextContents(), [
        'Lote principal',
        'Playlist secundária',
        'Lote principal · continuação',
      ]);
      for (const viewport of [
        { width: 800, height: 600 },
        { width: 960, height: 720 },
        { width: 800, height: 572 },
      ]) {
        await page.setViewportSize(viewport);
        const box = await queue
          .getByRole('button', { name: 'Cancelar item', exact: true })
          .boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= viewport.height);
        assert.equal(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth > innerWidth ||
              document.documentElement.scrollHeight > innerHeight,
          ),
          false,
        );
      }
      await page.evaluate(() =>
        window.__test.setRecoveries([
          {
            id: 'rec',
            title: 'Sessão anterior',
            destination: '/home/teste/Downloads',
            url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
            createdAt: new Date().toISOString(),
            size: 2048,
          },
        ]),
      );
      await page.getByRole('button', { name: 'Revisar', exact: true }).waitFor();
      await page.getByRole('textbox', { name: /Link do YouTube/ }).fill('link inválido');
      await page.getByRole('textbox', { name: /Link do YouTube/ }).press('Enter');
      await page.getByRole('button', { name: 'Dispensar erro', exact: true }).waitFor();
      const withWarnings = await queue
        .getByRole('button', { name: 'Cancelar item', exact: true })
        .boundingBox();
      assert.ok(withWarnings.y + withWarnings.height <= 572);
      await page.getByRole('button', { name: 'Dispensar erro', exact: true }).click();
      await page.getByRole('button', { name: 'Revisar', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Downloads interrompidos', exact: true })
        .getByText('Sessão anterior', { exact: true })
        .waitFor();
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.__test.setRecoveries([]));
      await page.setViewportSize({ width: 800, height: 600 });
      await queue.getByRole('button', { name: 'Detalhes do download ativo', exact: true }).click();
      const activeDetails = page.getByRole('dialog', { name: 'Detalhes do download', exact: true });
      await activeDetails.getByText('/home/teste/Downloads', { exact: false }).waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await activeDetails.count(), 0);
      await search.fill('titulo longo');
      await queue.getByRole('button', { name: /Detalhes: Um título longo/ }).click();
      assert.equal(
        await list.locator('.detail-title').innerText(),
        'Um título longo '.repeat(25).trim(),
      );
      await queue
        .getByRole('button', { name: 'Editar grupo: Lote principal', exact: true })
        .click();
      const groupEditor = page.getByRole('dialog', { name: 'Editar grupo', exact: true });
      await groupEditor.getByText(/inclusive os ocultos pela busca ou filtro/).waitFor();
      await groupEditor.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await search.fill('');
      const first = queue.getByRole('article', { name: 'Canção ÁGUA', exact: true });
      await first.getByRole('button', { name: 'Detalhes: Canção ÁGUA', exact: true }).click();
      await search.fill('epico');
      assert.equal(await list.getByRole('article').count(), 1);
      assert.equal(
        await first.getByRole('button', { name: /Mover para baixo/ }).isDisabled(),
        true,
      );
      await first
        .getByText('Limpe a busca e selecione Todos para reordenar.', { exact: true })
        .waitFor();
      await search.fill('');
      await queue.getByRole('button', { name: 'Concluídos', exact: true }).click();
      assert.equal(await list.getByRole('article').count(), 1);
      await queue.getByRole('button', { name: 'Aguardando', exact: true }).click();
      assert.equal(await list.getByRole('article').count(), 100);
      await search.fill('AGUA');
      await queue.getByRole('button', { name: 'Com erro', exact: true }).click();
      assert.equal(await list.getByRole('article').count(), 1);
      await list.getByText('Este vídeo foi removido.', { exact: true }).waitFor();
      assert.equal(
        await queue.getByRole('article', { name: 'Download em andamento', exact: true }).count(),
        1,
      );
      await search.fill('não existe');
      await queue.getByRole('button', { name: 'Limpar busca e filtros', exact: true }).click();
      assert.equal(await list.getByRole('article').count(), 100);
      const activeTop = (await queue.locator('.active-download').boundingBox()).y;
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      assert.equal((await queue.locator('.active-download').boundingBox()).y, activeTop);
      await queue.getByRole('button', { name: 'Próxima', exact: true }).click();
      await queue.getByText('Página 2 de 3', { exact: true }).waitFor();
      await page.evaluate(() => window.__test.activate('row200'));
      await queue.getByText('Página 2 de 3', { exact: true }).waitFor();
      assert.equal(await queue.getByRole('article', { name: 'Vídeo 200', exact: true }).count(), 1);
      await queue.getByRole('button', { name: 'Recolher ou expandir fila', exact: true }).click();
      assert.equal(await list.count(), 0);
      await page.evaluate(() => window.__test.activate('row201'));
      assert.equal(await list.count(), 0);
      assert.equal(
        await queue.getByRole('button', { name: 'Cancelar item', exact: true }).isVisible(),
        true,
      );
      await queue.getByRole('button', { name: 'Recolher ou expandir fila', exact: true }).click();
      await search.fill('Vídeo 150');
      const input = page.getByRole('textbox', { name: /Link do YouTube/ });
      await input.fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');
      await input.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Opções do vídeo', exact: true });
      await dialog.waitFor();
      await page.evaluate(() =>
        window.__emit({ type: 'progress', stage: 'downloading', track: 'audio', percent: 47 }),
      );
      await page.screenshot({
        path: 'test-results/vora-analise-modal.png',
        animations: 'disabled',
      });
      await dialog.getByRole('button', { name: 'Fechar análise', exact: true }).click();
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 206);
      assert.equal(await search.inputValue(), 'Vídeo 150');
      assert.equal(await queue.getByRole('progressbar').getAttribute('aria-valuenow'), '47');
      await page.getByRole('button', { name: 'Rever opções', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__test.analyzed.length), 1);
      await dialog.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      assert.equal(await dialog.count(), 0);
      assert.equal((await page.evaluate(() => window.__test.state())).items.length, 207);
      await queue.getByRole('button', { name: 'Todos', exact: true }).click();
      await search.fill('');
      await page.screenshot({
        path: 'test-results/vora-fila-compacta-800.png',
        animations: 'disabled',
      });
      const dismissConfirmation = page.getByRole('button', {
        name: 'Dispensar confirmação',
        exact: true,
      });
      if (await dismissConfirmation.count()) await dismissConfirmation.click();
      const retainedDetails = queue.getByRole('button', {
        name: 'Detalhes: Canção ÁGUA',
        exact: true,
      });
      assert.equal(await retainedDetails.getAttribute('aria-expanded'), 'true');
      await retainedDetails.click();
      await page.screenshot({
        path: 'test-results/vora-fila-compacta-800.png',
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 960, height: 720 });
      await page.screenshot({
        path: 'test-results/vora-fila-compacta-960.png',
        animations: 'disabled',
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  },
);

test(
  'interface: confirmação dura seis segundos e suspende o temporizador com foco ou mouse',
  { timeout: 60_000 },
  async () => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 4173, strictPort: true } });
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: process.env.VORA_TEST_BROWSER || undefined,
        headless: true,
        args: process.env.VORA_TEST_BROWSER ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
      });
      const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
      await page.addInitScript(queueFixture);
      await page.clock.install();
      await page.goto('http://127.0.0.1:4173');
      await page.getByRole('button', { name: 'Colar', exact: true }).click();
      await page.getByRole('textbox', { name: /Link do YouTube/ }).press('Enter');
      await page.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      const confirmation = page.locator('.compact-confirmation');
      await confirmation.waitFor();
      await page.clock.runFor(4000);
      await confirmation.hover();
      await page.clock.runFor(8000);
      assert.equal(await confirmation.count(), 1);
      await page.mouse.move(0, 0);
      await page.clock.runFor(2500);
      assert.equal(await confirmation.count(), 0);
      await page.getByRole('button', { name: 'Rever opções', exact: true }).click();
      await page.getByRole('button', { name: 'Adicionar à fila', exact: true }).click();
      const dismiss = page.getByRole('button', { name: 'Dispensar confirmação', exact: true });
      await dismiss.focus();
      await page.mouse.move(0, 0);
      await page.clock.runFor(8000);
      assert.equal(await confirmation.count(), 1);
      await dismiss.click();
      assert.equal(await confirmation.count(), 0);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.httpServer.close(resolve));
    }
  },
);
