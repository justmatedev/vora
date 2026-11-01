import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  fsyncSync,
  lstatSync,
  openSync,
  closeSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function appImageAvailability(path: string | undefined): string | undefined {
  try {
    if (!path || !isAbsolute(path) || path.includes('\0')) throw new Error();
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error();
    accessSync(path, constants.R_OK);
    accessSync(dirname(path), constants.W_OK);
    return undefined;
  } catch {
    return 'A atualização interna não está disponível neste local. Use a página de versões para baixar e substituir o AppImage.';
  }
}

/** Stage beside the running AppImage; an unsuccessful copy/rename preserves it. */
export function replaceAppImage(installer: string, current: string) {
  if (appImageAvailability(current))
    throw new Error('EACCES: AppImage indisponível para substituição.');
  const stage = join(dirname(current), `.vora-update-${randomUUID()}.AppImage`);
  try {
    copyFileSync(installer, stage, constants.COPYFILE_EXCL);
    chmodSync(stage, 0o755);
    const file = openSync(stage, 'r');
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(stage, current);
  } finally {
    rmSync(stage, { force: true });
  }
}
