import { readFile, mkdir, copyFile, rm, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const destination = 'dist-notices';
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const manifest = [];
for (const [root, entry] of Object.entries(lock.packages)) {
  if (!root || entry.dev || entry.link) continue;
  let metadata;
  try {
    metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch (error) {
    if (entry.optional && error.code === 'ENOENT') continue;
    throw error;
  }
  const noticeFiles = (await readdir(root)).filter((name) =>
    /^(licen[sc]e|copying|notice|copyright)([._-]|$)/i.test(name),
  );
  if (!noticeFiles.length) {
    if (`${metadata.name}@${metadata.version}` !== 'lazy-val@1.0.5')
      throw new Error(`Licença ausente: ${metadata.name} ${metadata.version}`);
    manifest.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license,
      file: 'lazy-val-NOTICE.txt',
    });
  }
  const key = createHash('sha256').update(root).digest('hex').slice(0, 8);
  for (const original of noticeFiles) {
    const file = `${metadata.name.replaceAll('/', '-')}-${metadata.version}-${key}-${original}`;
    await copyFile(join(root, original), join(destination, file));
    manifest.push({
      name: metadata.name,
      version: metadata.version,
      license: metadata.license,
      file,
    });
  }
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
