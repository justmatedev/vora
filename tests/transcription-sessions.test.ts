import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptionSessions } from '../electron/transcription-sessions';
test('limpeza só remove sessão identificada e não toca saídas publicadas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-session-'));
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
  const root = await mkdtemp(join(tmpdir(), 'vora-session-pid-'));
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
  const root = await mkdtemp(join(tmpdir(), 'vora-session-link-'));
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
  const root = await mkdtemp(join(tmpdir(), 'vora-session-gone-'));
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
