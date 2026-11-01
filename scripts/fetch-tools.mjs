import {
  readFile,
  mkdir,
  mkdtemp,
  writeFile,
  copyFile,
  chmod,
  readdir,
  rm,
  rename,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { extract } from '@electron-internal/extract-zip';
import { sha256, platformKey } from './tool-utils.mjs';

const target = platformKey(process.argv[2]);
if (process.arch !== 'x64' && !process.argv[2])
  throw new Error('Especifique linux ou win32 para preparar os binários x64.');
const lock = JSON.parse(
  await readFile(new URL('../resources/tools.lock.json', import.meta.url), 'utf8'),
);
const root = resolve('resources/tools'),
  destination = join(root, target),
  stage = join(root, `${target}-preparing`);
await mkdir(root, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, 'licenses'), { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'vora-tools-'));
const suffix = target.startsWith('win') ? '.exe' : '';
const manifest = { platform: target, versions: lock.versions, sources: lock[target], files: {} };

async function download(url, path) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body)
    throw new Error(`Download falhou (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
}
async function walk(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(path)));
    else if (entry.isFile()) results.push(path);
  }
  return results;
}
try {
  for (const asset of lock[target]) {
    console.log(`Preparando ${asset.name} (${target})…`);
    const archive = join(temp, `${asset.name}.${asset.kind}`);
    await download(asset.url, archive);
    if ((await sha256(archive)) !== asset.sha256)
      throw new Error(`Checksum incorreto: ${asset.name}. Nenhum binário foi instalado.`);
    if (asset.kind === 'binary') await copyFile(archive, join(stage, asset.name + suffix));
    else {
      const unpacked = join(temp, asset.name);
      await mkdir(unpacked, { recursive: true });
      if (asset.kind === 'zip') await extract(archive, { dir: unpacked });
      else await promisify(execFile)('tar', ['-xJf', archive, '-C', unpacked]);
      const files = await walk(unpacked);
      for (const executable of asset.name === 'ffmpeg' ? ['ffmpeg', 'ffprobe'] : ['deno']) {
        const file = files.find((path) => basename(path) === executable + suffix);
        if (!file) throw new Error(`Executável ausente no arquivo: ${executable}`);
        await copyFile(file, join(stage, executable + suffix));
      }
      for (const file of files.filter((path) =>
        /^(license|copying|readme)/i.test(basename(path)),
      )) {
        await copyFile(file, join(stage, 'licenses', `${asset.name}-${basename(file)}`));
      }
    }
  }
  const licenses = [
    ['yt-dlp', 'https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.10.26/LICENSE'],
    ['Deno', 'https://raw.githubusercontent.com/denoland/deno/v2.9.8/LICENSE.md'],
    ['FFmpeg-LGPL-2.1', 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.3/COPYING.LGPLv2.1'],
  ];
  for (const [name, url] of licenses) await download(url, join(stage, 'licenses', `${name}.txt`));
  const notices = JSON.parse(await readFile('resources/notices/sources.json', 'utf8'));
  for (const notice of notices) {
    const path = join('resources/notices', notice.file);
    if ((await sha256(path)) !== notice.sha256)
      throw new Error(`Aviso de terceiros alterado: ${notice.file}`);
    await copyFile(path, join(stage, 'licenses', notice.file));
  }
  for (const executable of ['yt-dlp', 'deno', 'ffmpeg', 'ffprobe']) {
    const filename = executable + suffix,
      path = join(stage, filename);
    await chmod(path, 0o755);
    manifest.files[filename] = await sha256(path);
  }
  await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await copyFile('THIRD_PARTY.md', join(stage, 'licenses', 'THIRD_PARTY.md'));
  await rm(destination, { recursive: true, force: true });
  await rename(stage, destination);
  console.log(`Ferramentas verificadas em ${destination}`);
} finally {
  await rm(temp, { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
}
