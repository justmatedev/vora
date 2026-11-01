import assert from 'node:assert/strict';
import { extractAll } from '@electron/asar';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

// Resolve the complete required production dependency tree from extracted bytes.
// Never allow resolution to fall back to the maintainer/runner's node_modules.
export async function checkCyclePackage(build, platform, version) {
  const resources = join(
    build,
    platform === 'linux' ? 'linux-unpacked' : 'win-unpacked',
    'resources',
  );
  const directory = await mkdtemp(join(build, 'verify-dependencies-'));
  try {
    extractAll(join(resources, 'app.asar'), directory);
    const visited = new Set();
    async function inspect(packagePath) {
      if (visited.has(packagePath)) return;
      visited.add(packagePath);
      const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
      const localRequire = createRequire(packagePath);
      for (const dependency of Object.keys(pkg.dependencies || {})) {
        if (pkg.optionalDependencies?.[dependency]) continue;
        const entry = localRequire.resolve(dependency);
        assert.ok(
          entry.startsWith(directory + sep),
          `Dependência ausente no pacote: ${dependency}`,
        );
        let parent = dirname(entry);
        let dependencyPackage;
        while (parent.startsWith(directory + sep)) {
          try {
            const path = join(parent, 'package.json');
            if (JSON.parse(await readFile(path, 'utf8')).name === dependency) {
              dependencyPackage = path;
              break;
            }
          } catch {
            /* Keep looking above the entry's lib/out directory. */
          }
          parent = dirname(parent);
        }
        assert.ok(dependencyPackage, `Manifesto ausente: ${dependency}`);
        await inspect(dependencyPackage);
      }
    }
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'vora-update-test');
    assert.equal(pkg.version, version);
    await inspect(join(directory, 'package.json'));
    const require = createRequire(import.meta.url);
    const { load } = require('js-yaml');
    const feed = load(await readFile(join(resources, 'app-update.yml'), 'utf8'));
    assert.equal(feed.provider, 'generic');
    assert.equal(feed.url, 'http://127.0.0.1:47831/');
    assert.equal(feed.updaterCacheDirName, 'vora-update-test-updater');
    console.log(`${version}: ${visited.size} pacotes de produção e feed isolado conferidos.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
