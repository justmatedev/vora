import { readFile, mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const destination = 'dist-notices';
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const packages = ['react', 'react-dom', 'scheduler', 'lucide-react', '@fontsource/inter'];
const manifest = [];
for (const name of packages) {
  const root = join('node_modules', name);
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const file = `${name.replaceAll('/', '-')}-LICENSE.txt`;
  await copyFile(join(root, 'LICENSE'), join(destination, file));
  manifest.push({ name, version: metadata.version, license: metadata.license, file });
}
const sources = JSON.parse(await readFile('resources/notices/sources.json', 'utf8'));
for (const source of sources) {
  const content = await readFile(join('resources/notices', source.file));
  if (createHash('sha256').update(content).digest('hex') !== source.sha256)
    throw new Error(`Aviso de terceiros alterado: ${source.file}`);
  await copyFile(join('resources/notices', source.file), join(destination, source.file));
}
await writeFile(
  join(destination, 'manifest.json'),
  JSON.stringify({ packages: manifest, sources }, null, 2) + '\n',
);
console.log('Avisos das bibliotecas e ferramentas preparados.');
