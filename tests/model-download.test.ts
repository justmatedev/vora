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

test('retoma bytes locais e só publica o modelo depois de conferir hash', async () => {
  const bytes = Buffer.from('abcdefgh');
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.headers.range ?? '');
    const start = req.headers.range ? Number(req.headers.range.match(/\d+/)![0]) : 0;
    res.writeHead(start ? 206 : 200, {
      etag: '"one"',
      'content-length': bytes.length - start,
      ...(start ? { 'content-range': `bytes ${start}-7/8` } : {}),
    });
    res.end(bytes.subarray(start));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = await mkdtemp(join(tmpdir(), 'vora-model-'));
  const paths: ModelPaths = {
    directory: root,
    partial: join(root, 'm.part'),
    partialMeta: join(root, 'm.json'),
    installed: join(root, 'm.bin'),
  };
  const address = server.address() as { port: number };
  const spec: ModelSpec = {
    id: 'small',
    revision: 'one',
    bytes: 8,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    url: `http://127.0.0.1:${address.port}/model`,
  };
  try {
    await writeFile(paths.partial, 'abcd');
    await writeFile(
      paths.partialMeta,
      JSON.stringify({ url: spec.url, revision: 'one', etag: '"one"' }),
    );
    await downloadModel(spec, paths, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    assert.deepEqual(requests, ['bytes=4-']);
    assert.equal(await readFile(paths.installed, 'utf8'), 'abcdefgh');
    await rm(paths.installed);
    await assert.rejects(
      downloadModel({ ...spec, sha256: '0'.repeat(64) }, paths, {
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
      /integridade|checksum/i,
    );
    await assert.rejects(readFile(paths.installed));
    await writeFile(paths.partial, 'abcd');
    await writeFile(paths.partialMeta, 'null');
    await downloadModel(spec, paths, {
      signal: new AbortController().signal,
      onProgress: () => {},
    });
    assert.equal(await readFile(paths.installed, 'utf8'), 'abcdefgh');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test('servidor que ignora Range não é concatenado ao parcial e modelo em uso não é removido', async () => {
  const bytes = Buffer.from('abcdefgh');
  let calls = 0;
  const server = createServer((_req, res) => {
    calls++;
    res.writeHead(200, { etag: '"two"', 'content-length': 8 });
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = await mkdtemp(join(tmpdir(), 'vora-model-manager-'));
  const address = server.address() as { port: number };
  const spec: ModelSpec = {
    id: 'small',
    revision: 'one',
    bytes: 8,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    url: `http://127.0.0.1:${address.port}/model`,
  };
  try {
    let inUse = false;
    const manager = new ModelManager(root, () => {}, {
      catalog: { small: spec, medium: { ...spec, id: 'medium' } },
      inUse: () => inUse,
    });
    await manager.load();
    assert.equal(calls, 0);
    await Promise.all([manager.install('small'), manager.install('small')]);
    assert.equal(calls, 1);
    assert.equal(await readFile(manager.path('small'), 'utf8'), 'abcdefgh');
    inUse = true;
    await assert.rejects(manager.remove('small'), /em uso|aguardando/i);
    inUse = false;
    await manager.remove('small');
    assert.equal(manager.snapshot().small.state, 'missing');
    const paths = manager.paths('small');
    await writeFile(paths.partial, 'abcd');
    await writeFile(
      paths.partialMeta,
      JSON.stringify({ url: spec.url, revision: 'one', etag: '"one"' }),
    );
    await manager.install('small');
    assert.equal(await readFile(manager.path('small'), 'utf8'), 'abcdefgh');
    await manager.shutdown();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
