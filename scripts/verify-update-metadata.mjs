import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const updaterRequire = createRequire(
  new URL('../node_modules/electron-updater/package.json', import.meta.url),
);
const { load } = updaterRequire('js-yaml');
const target = process.argv[2];
if (!['linux', 'win32'].includes(target)) throw new Error('Especifique linux ou win32.');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const windows = target === 'win32';
const filename = `Vora-${version}-${windows ? 'windows-x64-setup.exe' : 'linux-x86_64.AppImage'}`;
const metadata = load(
  await readFile(join('release', windows ? 'latest.yml' : 'latest-linux.yml'), 'utf8'),
);
const file = metadata.files?.find((file) => file.url === filename);
if (metadata.version !== version || metadata.path !== filename || !file?.sha512)
  throw new Error('Metadados de atualização não correspondem à versão e ao pacote gerado.');
const hash = createHash('sha512');
let size = 0;
for await (const chunk of createReadStream(join('release', filename))) {
  hash.update(chunk);
  size += chunk.length;
}
const sha512 = hash.digest('base64');
if (file.sha512 !== sha512 || metadata.sha512 !== sha512 || file.size !== size)
  throw new Error('Checksum ou tamanho dos metadados de atualização incorreto.');
const config = load(
  await readFile(
    join('release', windows ? 'win-unpacked' : 'linux-unpacked', 'resources', 'app-update.yml'),
    'utf8',
  ),
);
if (
  config.provider !== 'github' ||
  config.owner !== 'justmatedev' ||
  config.repo !== 'vora' ||
  config.private
)
  throw new Error('Canal de atualização do pacote não corresponde ao repositório público do Vora.');
console.log(`Metadados de atualização ${version} conferidos: ${filename}, SHA-512 e canal GitHub.`);
