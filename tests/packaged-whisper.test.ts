import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test('verificador de pacote recusa validar plataforma diferente da nativa', async () => {
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      'scripts/check-packaged-whisper.mjs',
      process.platform === 'win32' ? 'linux' : 'win32',
    ]),
    /sistema nativo correspondente/,
  );
});
