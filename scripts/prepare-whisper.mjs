import { mkdir, readFile, writeFile, copyFile, chmod, readdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, platformKey } from './tool-utils.mjs';
const exec = promisify(execFile);
export async function prepareWhisper(target, toolsRoot) {
  if (target !== platformKey(process.platform) || process.arch !== 'x64')
    throw new Error('Compile o Whisper no sistema x64 nativo correspondente.');
  const lock = JSON.parse(
    await readFile(new URL('../resources/whisper.lock.json', import.meta.url), 'utf8'),
  );
  const cache = resolve('.cache', 'whisper-build');
  await mkdir(cache, { recursive: true });
  const archive = join(cache, 'source.tar.gz');
  if ((await sha256(archive).catch(() => null)) !== lock.sha256) {
    const response = await fetch(lock.source, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body)
      throw new Error('Não foi possível baixar o código do Whisper.');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    if ((await sha256(archive)) !== lock.sha256)
      throw new Error('Checksum incorreto do código do Whisper.');
  }
  await exec('tar', ['-xzf', archive, '-C', cache]);
  const source = join(cache, `whisper.cpp-${lock.version}`),
    build = join(cache, `build-${target}`),
    cmake = process.env.CMAKE || 'cmake';
  const flags = [
    '-DCMAKE_BUILD_TYPE=Release',
    '-DGGML_NATIVE=OFF',
    '-DBUILD_SHARED_LIBS=ON',
    '-DGGML_BACKEND_DL=ON',
    '-DGGML_CPU_ALL_VARIANTS=ON',
    '-DGGML_CUDA=OFF',
    '-DGGML_VULKAN=OFF',
    '-DGGML_METAL=OFF',
    '-DGGML_OPENMP=OFF',
    '-DWHISPER_CURL=OFF',
    '-DWHISPER_BUILD_SERVER=OFF',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
    '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON',
    '-DCMAKE_INSTALL_RPATH=$ORIGIN',
  ];
  const options = { maxBuffer: 16 * 1024 * 1024, windowsHide: true };
  await exec(cmake, ['-S', source, '-B', build, ...flags], options);
  await exec(
    cmake,
    [
      '--build',
      build,
      '--config',
      'Release',
      '--target',
      'whisper-cli',
      '-j',
      process.env.VORA_BUILD_JOBS || '4',
    ],
    options,
  );
  const directory = join(toolsRoot, 'whisper');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const files = {};
  async function collect(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (/^(whisper-cli(?:\.exe)?|.*\.(?:so(?:\.[\d.]+)?|dll|dylib))$/.test(entry.name)) {
        const destination = join(directory, basename(path));
        await copyFile(path, destination);
        await chmod(destination, 0o755);
        files[entry.name] = await sha256(destination);
      }
    }
  }
  await collect(build);
  for (const [from, to] of [
    [join(source, 'LICENSE'), 'whisper-LICENSE.txt'],
    [join(source, 'LICENSE'), 'ggml-LICENSE.txt'],
  ]) {
    await copyFile(from, join(directory, to));
    files[to] = await sha256(join(directory, to));
  }
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(
      { version: lock.version, platform: target, sourceSha256: lock.sha256, files },
      null,
      2,
    ) + '\n',
  );
  console.log(`Whisper CPU preparado: ${target}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = platformKey(process.argv[2]);
  await prepareWhisper(target, join('resources', 'tools', target));
}
