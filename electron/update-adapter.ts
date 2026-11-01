import { app } from 'electron';
import { AppImageUpdater, NsisUpdater } from 'electron-updater';
import type { InstallOptions } from 'electron-updater/out/BaseUpdater';
import { replaceAppImage } from './appimage-update';

class VoraAppImageUpdater extends AppImageUpdater {
  protected doInstall(_options: InstallOptions): boolean {
    const current = process.env.APPIMAGE;
    if (!current || !this.installerPath) throw new Error('AppImage indisponível para atualização.');
    replaceAppImage(this.installerPath, current);
    // Relaunch after quitting; preserve the path used by existing desktop shortcuts.
    app.relaunch({ execPath: current, args: process.argv.slice(1) });
    return true;
  }
}
export function createUpdater() {
  const feed = { provider: 'github' as const, owner: 'justmatedev', repo: 'vora', private: false };
  return process.platform === 'win32' ? new NsisUpdater(feed) : new VoraAppImageUpdater(feed);
}
