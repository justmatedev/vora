import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import type { AppSettings } from '../shared/types';
import { DEFAULT_PREFERENCES, validPreferences } from '../shared/preferences';

export class SettingsStore {
  private value: AppSettings;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private path: string,
    destination: string,
  ) {
    this.value = {
      destination,
      notificationsEnabled: true,
      preferences: { ...DEFAULT_PREFERENCES },
    };
  }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'));
      if (typeof saved.notificationsEnabled === 'boolean')
        this.value.notificationsEnabled = saved.notificationsEnabled;
      if (typeof saved.destination === 'string' && isAbsolute(saved.destination))
        this.value.destination = saved.destination;
      try {
        this.value.preferences = validPreferences(saved.preferences);
      } catch {
        /* Migrate old settings or ignore invalid preferences. */
      }
    } catch {
      /* First launch or malformed settings. */
    }
    return this.get();
  }
  get(): AppSettings {
    return structuredClone(this.value);
  }
  private update(change: (settings: AppSettings) => AppSettings) {
    const operation = this.queue.then(async () => {
      const next = change(this.get());
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, JSON.stringify(next, null, 2));
      await rename(`${this.path}.tmp`, this.path);
      this.value = next;
      return this.get();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async setNotificationsEnabled(enabled: unknown) {
    if (typeof enabled !== 'boolean') throw new Error('Preferência de notificações inválida.');
    return (await this.update((settings) => ({ ...settings, notificationsEnabled: enabled })))
      .notificationsEnabled;
  }
  async setPreferences(input: unknown) {
    const preferences = validPreferences(input);
    return (await this.update((settings) => ({ ...settings, preferences }))).preferences;
  }
  async setDestination(destination: string) {
    if (!isAbsolute(destination)) throw new Error('Pasta de destino inválida.');
    return this.update((settings) => ({ ...settings, destination }));
  }
}
