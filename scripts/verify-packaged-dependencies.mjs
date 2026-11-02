import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { checkPackagedDependencies } from './check-packaged-dependencies.mjs';

const target = process.argv[2];
if (!['linux', 'win32'].includes(target)) throw new Error('Especifique linux ou win32.');
const { name, version } = JSON.parse(await readFile('package.json', 'utf8'));
await checkPackagedDependencies(
  resolve('release', target === 'linux' ? 'linux-unpacked' : 'win-unpacked', 'resources'),
  { name, version },
);
