import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  realpath,
  mkdtemp,
  writeFile,
  readFile,
  rm,
  symlink,
  rename,
  mkdir,
  copyFile,
  chmod,
  unlink,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptionSessions, processIdentity } from '../electron/transcription-sessions';
test(
  'processo Linux continua identificável após remoção do executável extraído',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-deleted-runtime-')));
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const runtime = join(root, 'runtime');
      await copyFile(process.execPath, runtime);
      await chmod(runtime, 0o755);
      child = spawn(runtime, ['-e', 'setInterval(()=>{},1000)'], {
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      await once(child, 'spawn');
      const before = await processIdentity(child.pid!);
      assert.ok(before);
      await unlink(runtime);
      assert.deepEqual(await processIdentity(child.pid!), before);
    } finally {
      if (child) {
        child.kill('SIGKILL');
        await once(child, 'close');
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
test('limpeza só remove sessão identificada e não toca saídas publicadas', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-session-')));
  try {
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    const session = await sessions.create('item', root);
    const output = join(root, 'resultado.txt');
    await writeFile(output, 'saved');
    await sessions.recordPublished(session.id, { format: 'txt', path: output, size: 5 });
    await sessions.cleanup(session.id);
    assert.equal(await readFile(output, 'utf8'), 'saved');
    await assert.rejects(readFile(join(session.path, '.vora-transcription.json')));
    const foreign = await sessions.create('foreign', root);
    await writeFile(
      join(foreign.path, '.vora-transcription.json'),
      JSON.stringify({ id: 'someone-else' }),
    );
    await assert.rejects(sessions.cleanup(foreign.id), /verific|propriedade/i);
    assert.ok(await readFile(join(foreign.path, '.vora-transcription.json')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('recuperação distingue processo original vivo de PID reutilizado sem matar nenhum deles', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-session-pid-')));
  let birth = 'first';
  const identity = async (pid: number) => ({ pid, started: birth, executable: process.execPath });
  try {
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'), identity);
    const session = await sessions.create('item', root);
    await sessions.registerProcess(session.id, 123, process.execPath);
    assert.equal(await sessions.running(), true);
    await assert.rejects(sessions.cleanup(session.id), /execução/i);
    birth = 'other';
    const recovered = new TranscriptionSessions(join(root, 'sessions.json'), identity);
    assert.equal(await recovered.running(), false);
    await recovered.cleanup(session.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('sessão substituída por symlink não apaga o destino externo', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-session-link-')));
  try {
    const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
    const session = await sessions.create('item', root);
    await rename(session.path, join(root, 'old'));
    const external = join(root, 'external');
    await mkdir(external);
    await writeFile(join(external, 'keep.txt'), 'keep');
    await symlink(external, session.path, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(sessions.cleanup(session.id), /propriedade|verific/i);
    assert.equal(await readFile(join(external, 'keep.txt'), 'utf8'), 'keep');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('temporário já removido permite limpar somente seu registro do diário', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-session-gone-')));
  try {
    const sessions = new TranscriptionSessions(join(root, 'journal.json'));
    const session = await sessions.create('item', root);
    await rm(session.path, { recursive: true });
    await sessions.cleanup(session.id);
    assert.deepEqual(await sessions.recover(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('consulta de processo vivo não confunde marcador inválido com processo em execução', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vora-session-status-')));
  try {
    const sessions = new TranscriptionSessions(join(root, 'journal.json'));
    const session = await sessions.create('item', root);
    await writeFile(join(session.path, '.vora-transcription.json'), '{}');
    assert.equal(await sessions.running(), false);
    await assert.rejects(sessions.cleanup(session.id), /propriedade|verific/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
