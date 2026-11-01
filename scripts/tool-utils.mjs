import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
export const platformKey = (input = process.platform) => {
  if (!['win32', 'win', 'windows', 'linux'].includes(input))
    throw new Error('Somente Linux e Windows x64 são suportados.');
  return input === 'linux' ? 'linux-x64' : 'win-x64';
};
export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
