import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = 'release';
const files = (await readdir(directory))
  .filter(
    (name) =>
      /^Vora-.*(?:\.AppImage|-setup\.exe|\.blockmap)$/.test(name) ||
      /^latest(?:-linux)?\.yml$/.test(name),
  )
  .sort();
if (!files.length) throw new Error('Nenhum pacote encontrado em release/.');
const lines = [];
for (const name of files) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
console.log(`Checksums gerados para ${files.length} pacote(s).`);
