import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startUpdateServer } from '../scripts/update-cycle-server.mjs';

test('feed de validação: loopback, arquivos permitidos, HEAD e intervalos de bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vora-cycle-server-'));
  const filename = 'VoraUpdateTest-0.6.1-linux-x86_64.AppImage';
  let server;
  try {
    await writeFile(join(directory, filename), '0123456789');
    await writeFile(join(directory, 'latest-linux.yml'), 'version: 0.6.1');
    await writeFile(join(directory, 'settings.json'), 'privado');
    ({ server } = await startUpdateServer(directory, 0));
    assert.equal(server.address().address, '127.0.0.1');
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(`${url}/latest-linux.yml?noCache=1`)).text(), 'version: 0.6.1');
    const head = await fetch(`${url}/${filename}`, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    const range = await fetch(`${url}/${filename}`, { headers: { range: 'bytes=2-5' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(await range.text(), '2345');
    const tail = await fetch(`${url}/${filename}`, { headers: { range: 'bytes=8-' } });
    assert.equal(await tail.text(), '89');
    for (const value of ['bytes=10-', 'bytes=5-2', 'bytes=0-2,5-8', 'bytes=-3']) {
      const response = await fetch(`${url}/${filename}`, { headers: { range: value } });
      assert.equal(response.status, 416);
    }
    for (const path of ['settings.json', '%2e%2e%2fsettings.json', 'initial/test.exe', '%ZZ']) {
      assert.ok((await fetch(`${url}/${path}`)).status >= 400);
    }
    assert.equal((await fetch(`${url}/${filename}`, { method: 'POST' })).status, 405);
    // Replace an initially allowed artifact by a symlink: it must not be served.
    // Windows runners may not grant symlink privileges; other protections run there.
    if (process.platform !== 'win32') {
      await rm(join(directory, filename));
      await symlink(join(directory, 'settings.json'), join(directory, filename));
      assert.equal((await fetch(`${url}/${filename}`)).status, 404);
    }
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((accept) => server.close(accept));
    }
    await rm(directory, { recursive: true, force: true });
  }
});
