import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadModel } from '../electron/model-download';
import { ModelManager } from '../electron/whisper-models';
import type { ModelSpec, ModelPaths } from '../shared/transcription-types';

for (const scenario of ['416', 'changed-etag', 'changed-last-modified', 'cancel', 'space'] as const)
  test(`download de modelo: ${scenario}`, async () => {
    const bytes = Buffer.from('abcdefgh');
    let requests = 0;
    const server = createServer((req, res) => {
      requests++;
      if (scenario === '416' && req.headers.range) {
        res.writeHead(416);
        res.end();
        return;
      }
      if (scenario === 'cancel') {
        res.writeHead(200, { 'content-length': 8, etag: '"new"' });
        res.write('abcd');
        return;
      }
      const start = req.headers.range ? 4 : 0;
      res.writeHead(start ? 206 : 200, {
        'content-length': 8 - start,
        ...(scenario === 'changed-last-modified'
          ? { 'last-modified': 'Fri, 20 Nov 2026 12:00:00 GMT' }
          : { etag: '"new"' }),
        ...(start ? { 'content-range': 'bytes 4-7/8' } : {}),
      });
      res.end(bytes.subarray(start));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const root = await mkdtemp(join(tmpdir(), 'vora-model-edge-'));
    const spec: ModelSpec = {
      id: 'small',
      revision: 'one',
      bytes: 8,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      url: `http://127.0.0.1:${(server.address() as { port: number }).port}/model`,
    };
    const paths: ModelPaths = {
      directory: root,
      partial: join(root, 'part'),
      partialMeta: join(root, 'meta'),
      installed: join(root, 'model'),
    };
    const controller = new AbortController();
    try {
      if (
        scenario === '416' ||
        scenario === 'changed-etag' ||
        scenario === 'changed-last-modified'
      ) {
        await writeFile(paths.partial, 'abcd');
        await writeFile(
          paths.partialMeta,
          JSON.stringify({
            url: spec.url,
            revision: 'one',
            ...(scenario === 'changed-last-modified'
              ? { modified: 'Thu, 19 Nov 2026 12:00:00 GMT' }
              : { etag: '"old"' }),
          }),
        );
      }
      const promise = downloadModel(spec, paths, {
        signal: controller.signal,
        onProgress: () => {
          if (scenario === 'cancel') controller.abort();
        },
        availableBytes: scenario === 'space' ? async () => 0 : undefined,
      });
      if (scenario === 'space') {
        await assert.rejects(promise, /espaço/i);
        assert.equal(requests, 0);
      } else if (scenario === 'cancel') {
        await assert.rejects(promise);
        assert.equal(await readFile(paths.partial, 'utf8'), 'abcd');
        await assert.rejects(readFile(paths.installed));
      } else {
        await promise;
        assert.equal(await readFile(paths.installed, 'utf8'), 'abcdefgh');
        assert.equal(requests, 2);
      }
    } finally {
      controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });

test('modelo adulterado após instalação não é considerado disponível ao reabrir', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-model-tamper-'));
  const spec: ModelSpec = {
    id: 'small',
    revision: 'one',
    bytes: 8,
    sha256: createHash('sha256').update('abcdefgh').digest('hex'),
    url: 'https://example.test/model',
  };
  try {
    const deps = { catalog: { small: spec, medium: { ...spec, id: 'medium' as const } } };
    const manager = new ModelManager(root, () => {}, deps);
    await manager.load();
    await writeFile(manager.paths('small').installed, 'tampered');
    const next = new ModelManager(root, () => {}, deps);
    await next.load();
    assert.equal(next.snapshot().small.state, 'error');
    assert.throws(() => next.path('small'), /não está instalado/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
