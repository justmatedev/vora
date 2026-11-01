import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPackage } from '@electron/asar';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkCyclePackage } from '../scripts/check-update-cycle-package.mjs';

for (const missing of [false, true]) {
  test(`pacote de validação: ${missing ? 'recusa dependência transitiva ausente' : 'confere dependências e feed isolado'}`, async () => {
    await mkdir('test-results', { recursive: true });
    const directory = await mkdtemp(resolve('test-results/cycle-package-'));
    const source = join(directory, 'source');
    const resources = join(directory, 'linux-unpacked/resources');
    try {
      const updater = join(source, 'node_modules/electron-updater');
      await mkdir(updater, { recursive: true });
      await mkdir(resources, { recursive: true });
      await writeFile(
        join(source, 'package.json'),
        JSON.stringify({
          name: 'vora-update-test',
          version: '0.6.0',
          dependencies: { 'electron-updater': '6.8.12' },
        }),
      );
      await writeFile(
        join(updater, 'package.json'),
        JSON.stringify({
          name: 'electron-updater',
          main: 'index.js',
          dependencies: { 'fs-extra': '10.1.0' },
        }),
      );
      await writeFile(join(updater, 'index.js'), '');
      if (!missing) {
        const dependency = join(source, 'node_modules/fs-extra');
        await mkdir(dependency);
        await writeFile(
          join(dependency, 'package.json'),
          JSON.stringify({ name: 'fs-extra', main: 'index.js' }),
        );
        await writeFile(join(dependency, 'index.js'), '');
      }
      await createPackage(source, join(resources, 'app.asar'));
      await writeFile(
        join(resources, 'app-update.yml'),
        'provider: generic\nurl: http://127.0.0.1:47831/\nupdaterCacheDirName: vora-update-test-updater\n',
      );
      // fs-extra exists in the host project. Falling back to it must still fail.
      if (missing)
        await assert.rejects(
          checkCyclePackage(directory, 'linux', '0.6.0'),
          /Dependência ausente no pacote: fs-extra/,
        );
      else await checkCyclePackage(directory, 'linux', '0.6.0');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
