import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../electron/settings';
import {
  DEFAULT_PREFERENCES,
  preferredOption,
  resolvePreferences,
  validPreferences,
} from '../shared/preferences';
import type { VideoInfo, VideoOption } from '../shared/types';

const option = (height: number, fps = 30): VideoOption => ({
  id: `${height}-${fps}`,
  label: `${height}p`,
  height,
  fps,
  container: 'mp4',
  videoId: `${height}`,
});
test('preferência de resolução usa a disponível mais próxima abaixo e respeita FPS', () => {
  const options = [option(2160), option(1080, 60), option(1080, 30), option(720), option(480)];
  assert.equal(preferredOption(options)?.height, 2160);
  assert.equal(preferredOption(options, { height: 1440, fps: 30 })?.id, '1080-30');
  assert.equal(preferredOption(options, { height: 1080, fps: 60 })?.id, '1080-60');
  assert.equal(preferredOption(options, { height: 144, fps: 30 })?.height, 480);
  assert.equal(preferredOption([], { height: 720, fps: 30 }), undefined);
});
test('fallback por vídeo não altera a preferência salva', () => {
  const preferences = { ...DEFAULT_PREFERENCES, quality: { height: 1080, fps: 60 } };
  const info = {
    compatible: [],
    original: [option(720)],
    audio: { id: 'a', extension: 'webm' },
  } as unknown as VideoInfo;
  const choice = resolvePreferences(info, preferences);
  assert.equal(choice.videoMode, 'original');
  assert.equal(choice.option?.height, 720);
  assert.equal(preferences.videoMode, 'compatible');
  assert.equal(preferences.quality.height, 1080);
});
test('migra configurações antigas e conserva pasta e preferências após reiniciar', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-settings-'));
  const path = join(root, 'settings.json');
  try {
    await writeFile(path, JSON.stringify({ destination: root }));
    const store = new SettingsStore(path, join(root, 'default'));
    assert.deepEqual((await store.load()).preferences, DEFAULT_PREFERENCES);
    await store.setPreferences({
      kind: 'audio',
      videoMode: 'original',
      audioMode: 'mp3',
      quality: { height: 720, fps: 60 },
    });
    const restarted = new SettingsStore(path, '/unused');
    const saved = await restarted.load();
    assert.equal(saved.destination, root);
    assert.equal(saved.preferences.audioMode, 'mp3');
    assert.equal(saved.preferences.quality?.fps, 60);
    saved.preferences.kind = 'video';
    assert.equal(restarted.get().preferences.kind, 'audio');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('gravações simultâneas não perdem mudanças de pasta ou formato', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-settings-'));
  try {
    const store = new SettingsStore(join(root, 'settings.json'), root);
    await Promise.all([
      store.setPreferences({ ...DEFAULT_PREFERENCES, audioMode: 'mp3' }),
      store.setDestination(join(root, 'other')),
      store.setPreferences({ ...DEFAULT_PREFERENCES, audioMode: 'mp3', kind: 'audio' }),
    ]);
    const saved = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
    assert.equal(saved.destination, join(root, 'other'));
    assert.equal(saved.preferences.kind, 'audio');
    assert.equal(saved.preferences.audioMode, 'mp3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('preferências inválidas não entram no disco e configurações corrompidas têm defaults', async () => {
  assert.throws(() =>
    validPreferences({ ...DEFAULT_PREFERENCES, quality: { height: -1, fps: 30 } }),
  );
  assert.throws(() => validPreferences(null));
  const root = await mkdtemp(join(tmpdir(), 'vora-settings-'));
  try {
    const path = join(root, 'settings.json');
    await writeFile(path, '{broken');
    const store = new SettingsStore(path, root);
    assert.equal((await store.load()).destination, root);
    await assert.rejects(store.setPreferences({ ...DEFAULT_PREFERENCES, kind: 'invalid' }));
    assert.equal(await readFile(path, 'utf8'), '{broken');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('notificações são ativadas ao migrar e preferência persiste sem alterar pasta ou formato', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vora-notifications-'));
  try {
    const path = join(root, 'settings.json');
    await writeFile(path, JSON.stringify({ destination: root }));
    const store = new SettingsStore(path, root);
    assert.equal((await store.load()).notificationsEnabled, true);
    await store.setNotificationsEnabled(false);
    const restored = new SettingsStore(path, root);
    assert.equal((await restored.load()).notificationsEnabled, false);
    assert.equal(restored.get().destination, root);
    assert.deepEqual(restored.get().preferences, DEFAULT_PREFERENCES);
    await assert.rejects(restored.setNotificationsEnabled('yes'), /inválida/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
