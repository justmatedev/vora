import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
import { access } from 'node:fs/promises';

const target = process.argv[2];
if (!['linux', 'win32'].includes(target) || target !== process.platform)
  throw new Error('Valide o runtime no sistema nativo correspondente ao pacote.');
const windows = target === 'win32';
const root = resolve('release', windows ? 'win-unpacked' : 'linux-unpacked');
const executable = join(root, windows ? 'Vora.exe' : 'vora');
const tools = join(root, 'resources', 'tools');
const env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',
  NODE_OPTIONS: undefined,
  NODE_PATH: undefined,
};
const exec = promisify(execFile);
const options = { env, timeout: 30_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 };
const version = (await exec(executable, ['--version'], options)).stdout.trim();
if (!/^v\d+\.\d+\.\d+$/.test(version) || Number(version.slice(1).split('.')[0]) < 22)
  throw new Error('Node embutido ausente ou incompatível com EJS.');
let stderr = '';
try {
  await exec(
    join(tools, windows ? 'yt-dlp.exe' : 'yt-dlp'),
    [
      '--ignore-config',
      '--ffmpeg-location',
      join(tools, windows ? 'ffmpeg.exe' : 'ffmpeg'),
      '--no-js-runtimes',
      '--js-runtimes',
      `node:${executable}`,
      '--verbose',
    ],
    options,
  );
} catch (error) {
  // yt-dlp initializes its runtimes, then exits with code 2 because no URL was supplied.
  if (error.code !== 2) throw new Error('Falha ao inicializar yt-dlp com o runtime empacotado.');
  stderr = error.stderr;
}
if (!stderr.includes(`JS runtimes: node-${version.slice(1)}`))
  throw new Error('yt-dlp não reconheceu o Node embutido no pacote.');
try {
  await access(join(tools, windows ? 'deno.exe' : 'deno'));
  throw new Error('Deno antigo ainda está incluído no pacote.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log(
  `Runtime empacotado validado no ${target}: Node ${version}, reconhecido por yt-dlp; sem Deno separado.`,
);
