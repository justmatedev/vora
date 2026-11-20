import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, platformKey } from './tool-utils.mjs';
export async function verifyWhisper(root, target) {
  const directory = join(root, 'whisper');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const lock = JSON.parse(
    await readFile(new URL('../resources/whisper.lock.json', import.meta.url), 'utf8'),
  );
  if (
    manifest.version !== lock.version ||
    manifest.platform !== target ||
    !manifest.files ||
    Array.isArray(manifest.files)
  )
    throw new Error('Manifesto Whisper inválido.');
  const executable = target.startsWith('win') ? 'whisper-cli.exe' : 'whisper-cli';
  if (!manifest.files[executable]) throw new Error('Executável Whisper ausente do manifesto.');
  for (const name of await readdir(directory))
    if (name !== 'manifest.json' && !Object.hasOwn(manifest.files, name))
      throw new Error(`Arquivo extra no Whisper: ${name}`);
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (!/^[\w.+-]+$/.test(name) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error('Manifesto Whisper inválido.');
    if ((await sha256(join(directory, name))) !== hash)
      throw new Error(`Binário Whisper alterado: ${name}`);
  }
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = platformKey(process.argv[2]);
  await verifyWhisper(join('resources', 'tools', target), target);
  console.log(`Whisper verificado: ${target}`);
}
