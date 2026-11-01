// Loopback-only feed for the generated validation app. Never used by production.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function startUpdateServer(directory, port = 47831) {
  const allowed = new Set(
    (await readdir(directory)).filter((name) =>
      /^(latest(?:-linux)?\.yml|VoraUpdateTest-[\w.-]+\.(?:AppImage|exe|exe\.blockmap))$/.test(
        name,
      ),
    ),
  );
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).slice(1);
      if (!allowed.has(name)) {
        res.writeHead(404).end();
        return;
      }
      const path = join(directory, name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        res.writeHead(404).end();
        return;
      }
      let start = 0,
        end = stat.size - 1;
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        start = match ? Number(match[1]) : -1;
        end = match?.[2] ? Number(match[2]) : end;
        if (start < 0 || start > end || end >= stat.size) {
          res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
          return;
        }
      }
      requests.push({ name, method: req.method, range: req.headers.range });
      res.writeHead(req.headers.range ? 206 : 200, {
        'content-length': end - start + 1,
        'content-type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
        'cache-control': 'no-store',
        'accept-ranges': 'bytes',
        ...(req.headers.range ? { 'content-range': `bytes ${start}-${end}/${stat.size}` } : {}),
      });
      if (req.method === 'HEAD') res.end();
      else {
        const stream = createReadStream(path, { start, end });
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      }
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return { server, requests };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startUpdateServer(join(dirname(fileURLToPath(import.meta.url)), 'updates'));
  console.log('Servidor de validação: http://127.0.0.1:47831/ — mantenha esta janela aberta.');
}
