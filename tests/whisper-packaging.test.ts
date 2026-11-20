import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
test('verificador do Whisper recusa arquivo ausente, alterado e não declarado', async () => {
  const { verifyWhisper } = await import(pathToFileURL(resolve('scripts/verify-whisper.mjs')).href);
  const root = await mkdtemp(join(tmpdir(), 'vora-whisper-package-'));
  try {
    await mkdir(join(root, 'whisper'));
    const dir = join(root, 'whisper'),
      file = join(dir, 'whisper-cli');
    await writeFile(file, 'fixture');
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: '1.8.2',
        platform: 'linux-x64',
        files: { 'whisper-cli': createHash('sha256').update('fixture').digest('hex') },
      }),
    );
    await verifyWhisper(root, 'linux-x64');
    await writeFile(file, 'changed');
    await assert.rejects(verifyWhisper(root, 'linux-x64'), /alterad|checksum/i);
    await writeFile(file, 'fixture');
    await writeFile(join(dir, 'extra.dll'), 'extra');
    await assert.rejects(verifyWhisper(root, 'linux-x64'), /extra|inesperad/i);
    await rm(join(dir, 'extra.dll'));
    await rm(file);
    await assert.rejects(verifyWhisper(root, 'linux-x64'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
