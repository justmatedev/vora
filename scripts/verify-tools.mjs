import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256, platformKey } from './tool-utils.mjs';

const target = platformKey(process.argv[2]),
  root = join('resources', 'tools', target);
try {
  const lock = JSON.parse(await readFile('resources/tools.lock.json', 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const suffix = target.startsWith('win') ? '.exe' : '';
  const allowed = new Set([
    'licenses',
    'manifest.json',
    ...['yt-dlp', 'ffmpeg', 'ffprobe'].map((name) => name + suffix),
  ]);
  if ((await readdir(root)).some((name) => !allowed.has(name)))
    throw new Error(
      'Arquivos extras na pasta de ferramentas. Prepare novamente para evitar distribuir binários antigos.',
    );
  if (
    manifest.platform !== target ||
    JSON.stringify(manifest.sources) !== JSON.stringify(lock[target])
  )
    throw new Error('Manifesto não corresponde às versões fixadas.');
  for (const name of ['yt-dlp', 'ffmpeg', 'ffprobe']) {
    const filename = name + (target.startsWith('win') ? '.exe' : '');
    if ((await sha256(join(root, filename))) !== manifest.files[filename])
      throw new Error(`Binário alterado: ${filename}`);
  }
  for (const name of [
    'yt-dlp.txt',
    'FFmpeg-LGPL-2.1.txt',
    'FFmpeg-LGPL-3.0.txt',
    'FFmpeg-GPL-3.0.txt',
    'yt-dlp-THIRD_PARTY_LICENSES.txt',
    'THIRD_PARTY.md',
  ])
    await access(join(root, 'licenses', name));
  const notices = JSON.parse(await readFile('resources/notices/sources.json', 'utf8'));
  for (const notice of notices)
    if ((await sha256(join(root, 'licenses', notice.file))) !== notice.sha256)
      throw new Error(`Aviso de terceiros alterado: ${notice.file}`);
  console.log(`Binários e licenças verificados: ${target}`);
} catch (error) {
  console.error(
    `Ferramentas indisponíveis: ${error.message}\nExecute: npm run tools:fetch -- ${target.startsWith('win') ? 'win32' : 'linux'}`,
  );
  process.exitCode = 1;
}
