import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscriptionOptions } from '../shared/transcription-options';
import { SettingsStore } from '../electron/settings';

test('formatos são normalizados e opções desconhecidas são recusadas', () => {
  assert.deepEqual(
    parseTranscriptionOptions({
      modelId: 'small',
      language: 'auto',
      formats: ['srt', 'txt', 'txt'],
    }),
    { modelId: 'small', language: 'auto', formats: ['txt', 'srt'] },
  );
  for (const patch of [
    { formats: [] },
    { formats: ['pdf'] },
    { language: 'invalid' },
    { language: 'yue' }, // The fixed Small/Medium vocabularies have 99 languages, not Large-v3's 100.
    { modelId: 'https://bad.test/model' },
  ]) {
    assert.throws(() =>
      parseTranscriptionOptions({ modelId: 'small', language: 'auto', formats: ['txt'], ...patch }),
    );
  }
  assert.throws(() => parseTranscriptionOptions(null));
});
test('preferências de transcrição migram e persistem sem alterar downloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vora-transcription-settings-'));
  try {
    const path = join(directory, 'settings.json');
    await writeFile(
      path,
      JSON.stringify({
        destination: directory,
        preferences: { kind: 'audio', audioMode: 'mp3', videoMode: 'original' },
      }),
    );
    const store = new SettingsStore(path, 'unused');
    const initial = await store.load();
    assert.deepEqual(initial.transcriptionPreferences, {
      modelId: 'small',
      language: 'auto',
      formats: ['txt', 'srt'],
    });
    await store.setTranscriptionPreferences({
      modelId: 'medium',
      language: 'pt',
      formats: ['srt'],
    });
    const restored = await new SettingsStore(path, 'unused').load();
    assert.equal(restored.preferences.audioMode, 'mp3');
    assert.equal(restored.destination, directory);
    assert.deepEqual(restored.transcriptionPreferences, {
      modelId: 'medium',
      language: 'pt',
      formats: ['srt'],
    });
    const saved = await readFile(path, 'utf8');
    await assert.rejects(
      store.setTranscriptionPreferences({ modelId: 'medium', language: 'pt', formats: [] }),
    );
    assert.equal(await readFile(path, 'utf8'), saved);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
