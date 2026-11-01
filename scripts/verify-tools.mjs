import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256, platformKey } from './tool-utils.mjs';

const target = platformKey(process.argv[2]),
  root = join('resources', 'tools', target);
try {
  const lock = JSON.parse(await readFile('resources/tools.lock.json', 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  if (
    manifest.platform !== target ||
    JSON.stringify(manifest.sources) !== JSON.stringify(lock[target])
  )
    throw new Error('Manifesto não corresponde às versões fixadas.');
  for (const name of ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno']) {
    const filename = name + (target.startsWith('win') ? '.exe' : '');
    if ((await sha256(join(root, filename))) !== manifest.files[filename])
      throw new Error(`Binário alterado: ${filename}`);
  }
  for (const name of ['yt-dlp.txt', 'Deno.txt', 'FFmpeg-LGPL-2.1.txt', 'THIRD_PARTY.md'])
    await access(join(root, 'licenses', name));
  console.log(`Binários e licenças verificados: ${target}`);
} catch (error) {
  console.error(
    `Ferramentas indisponíveis: ${error.message}\nExecute: npm run tools:fetch -- ${target.startsWith('win') ? 'win32' : 'linux'}`,
  );
  process.exitCode = 1;
}
