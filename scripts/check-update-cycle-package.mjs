import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { checkPackagedDependencies } from './check-packaged-dependencies.mjs';

export async function checkCyclePackage(build, platform, version) {
  const resources = join(
    build,
    platform === 'linux' ? 'linux-unpacked' : 'win-unpacked',
    'resources',
  );
  await checkPackagedDependencies(resources, { name: 'vora-update-test', version });
  const require = createRequire(import.meta.url);
  const { load } = require('js-yaml');
  const feed = load(await readFile(join(resources, 'app-update.yml'), 'utf8'));
  assert.equal(feed.provider, 'generic');
  assert.equal(feed.url, 'http://127.0.0.1:47831/');
  assert.equal(feed.updaterCacheDirName, 'vora-update-test-updater');
  console.log(`${version}: feed isolado conferido.`);
}
