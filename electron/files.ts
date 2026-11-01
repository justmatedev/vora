import { constants } from 'node:fs';
import { copyFile, link, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

/** Same-directory hard link publishes a complete file without replacing existing files. */
export async function publishUnique(source: string, destination: string): Promise<string> {
  const name = basename(source),
    extension = extname(name),
    stem = name.slice(0, name.length - extension.length);
  for (let index = 0; index < 10_000; index++) {
    const target = join(destination, `${stem}${index ? ` (${index})` : ''}${extension}`);
    try {
      try {
        await link(source, target);
      } catch (error) {
        if (
          !['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV'].includes(
            (error as NodeJS.ErrnoException).code ?? '',
          )
        )
          throw error;
        await copyFile(source, target, constants.COPYFILE_EXCL);
      }
      await unlink(source).catch(() => {});
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Não foi possível criar um nome único para o arquivo.');
}
