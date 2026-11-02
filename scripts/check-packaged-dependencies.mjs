import assert from 'node:assert/strict';
import { extractAll } from '@electron/asar';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep, resolve } from 'node:path';

// Resolve only from extracted package bytes, never the host's node_modules.
export async function checkPackagedDependencies(resources, { name, version }) {
  const directory = await mkdtemp(join(resolve(resources, '..'), 'verify-dependencies-'));
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
    assert.equal(pkg.name, name);
    assert.equal(pkg.version, version);
    await inspect(join(directory, 'package.json'));
    console.log(`${name} ${version}: ${visited.size} pacotes de produção conferidos.`);
    return visited.size;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
