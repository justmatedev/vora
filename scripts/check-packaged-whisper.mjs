import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { verifyWhisper } from './verify-whisper.mjs';

const target = process.argv[2];
if (!['linux', 'win32'].includes(target) || target !== process.platform)
  throw new Error('Valide o Whisper no sistema nativo correspondente ao pacote.');
const windows = target === 'win32';
const tools = resolve('release', windows ? 'win-unpacked' : 'linux-unpacked', 'resources/tools');
await verifyWhisper(tools, windows ? 'win-x64' : 'linux-x64');
const temporary = await mkdtemp(join(tmpdir(), 'vora-packaged-whisper-'));
try {
  // Run a copy outside both the package and build trees, with no compiler paths.
  await cp(join(tools, 'whisper'), temporary, { recursive: true });
  const env = { ...process.env };
  for (const key of ['LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'CMAKE_PREFIX_PATH', 'LIB', 'LIBPATH'])
    delete env[key];
  if (windows) env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  const result = await promisify(execFile)(
    join(temporary, windows ? 'whisper-cli.exe' : 'whisper-cli'),
    ['--help'],
    { cwd: temporary, env, timeout: 30_000, windowsHide: true },
  );
  if (!`${result.stdout}${result.stderr}`.includes('--model'))
    throw new Error('CLI Whisper não inicializou corretamente.');
  console.log(
    `Whisper empacotado validado fora da árvore de build: ${target}. Pesos não incluídos.`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
