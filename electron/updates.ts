import type { UpdateSnapshot } from '../shared/types';

export const RELEASES_URL = 'https://github.com/justmatedev/vora/releases';
export interface UpdaterPort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: string, callback: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, forceRun?: boolean): void;
}
interface Dependencies {
  version: string;
  disabledReason?: string;
  availability(): Promise<string | undefined>;
  busy(): boolean;
  prepare(): Promise<void>;
  recover(): void;
  notify(snapshot: UpdateSnapshot): void;
}
function notes(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.map((item) => (typeof item?.note === 'string' ? item.note : '')).join('\n')
        : '';
  return text
    .slice(0, 32000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]!,
    )
    .trim()
    .slice(0, 16000);
}
export class UpdateManager {
  private state: UpdateSnapshot;
  private locked = false;
  private operation?: 'check' | 'download';
  constructor(
    private updater: UpdaterPort,
    private deps: Dependencies,
  ) {
    this.state = {
      currentVersion: deps.version,
      status: deps.disabledReason ? 'unavailable' : 'idle',
      message: deps.disabledReason,
      canInstall: false,
    };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('error', (error) => this.fail(error));
    updater.on('update-available', (info) => {
      if (this.operation !== 'check' || this.state.status !== 'checking') return;
      this.change({
        status: 'available',
        version: info.version,
        notes: notes(info.releaseNotes),
        message: undefined,
      });
    });
    updater.on('update-not-available', () => {
      if (this.operation !== 'check' || this.state.status !== 'checking') return;
      this.change({ status: 'current', version: undefined, notes: undefined, message: undefined });
    });
    updater.on('download-progress', (progress) => {
      if (this.operation !== 'download' || this.state.status !== 'downloading') return;
      this.change({
        status: 'downloading',
        percent: Number.isFinite(progress.percent)
          ? Math.max(0, Math.min(100, progress.percent))
          : undefined,
        bytesPerSecond: Number.isFinite(progress.bytesPerSecond)
          ? Math.max(0, progress.bytesPerSecond)
          : undefined,
      });
    });
    updater.on('update-downloaded', (info) => {
      if (this.operation !== 'download' || this.state.status !== 'downloading') return;
      this.change({
        status: 'downloaded',
        version: info.version,
        percent: 100,
        bytesPerSecond: undefined,
        message: undefined,
      });
    });
  }
  get installing() {
    return this.locked;
  }
  snapshot(): UpdateSnapshot {
    return {
      ...this.state,
      canInstall: this.state.status === 'downloaded' && !this.locked && !this.deps.busy(),
    };
  }
  activityChanged() {
    this.deps.notify(this.snapshot());
  }
  private change(value: Partial<UpdateSnapshot>) {
    this.state = { ...this.state, ...value };
    this.activityChanged();
  }
  private fail(error: unknown) {
    if (this.locked) {
      this.locked = false;
      this.deps.recover();
    }
    const message = String((error as Error)?.message ?? error);
    const friendly = /trabalho|processo anterior|operação.*andamento/i.test(message)
      ? 'Pause a fila e aguarde o trabalho atual terminar antes de instalar.'
      : /EACCES|EPERM|read.only|permission/i.test(message)
        ? 'Não foi possível gravar a atualização. Baixe a nova versão pela página de versões.'
        : /ENOSPC|disk.*space/i.test(message)
          ? 'Não há espaço suficiente para a atualização. Libere espaço e tente novamente.'
          : /checksum|sha512|signature|integrity/i.test(message)
            ? 'A atualização não passou na verificação de integridade. Tente baixar novamente.'
            : /latest.*yml|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|404/i.test(message)
              ? 'Ainda não há uma atualização interna disponível neste canal. Confira a página de versões ou tente novamente mais tarde.'
              : 'Não foi possível concluir a atualização. Verifique sua conexão e tente novamente, ou use a página de versões.';
    this.change({
      status: 'error',
      message: friendly,
      percent: undefined,
      bytesPerSecond: undefined,
    });
  }
  private async available() {
    const reason = this.deps.disabledReason ?? (await this.deps.availability());
    if (!reason) return true;
    this.change({ status: 'unavailable', message: reason });
    return false;
  }
  async check() {
    if (this.operation || this.locked || ['available', 'downloaded'].includes(this.state.status))
      return;
    this.operation = 'check';
    try {
      if (!(await this.available())) return;
      this.change({ status: 'checking', message: undefined, percent: undefined });
      await this.updater.checkForUpdates();
      if (this.snapshot().status === 'checking') this.fail(new Error('Update check incomplete'));
    } catch (error) {
      this.fail(error);
    } finally {
      this.operation = undefined;
    }
  }
  async download() {
    if (this.operation || this.locked || this.state.status !== 'available') return;
    this.operation = 'download';
    try {
      if (!(await this.available())) return;
      this.change({ status: 'downloading', message: undefined, percent: 0 });
      await this.updater.downloadUpdate();
      if (this.snapshot().status === 'downloading')
        this.fail(new Error('Update download incomplete'));
    } catch (error) {
      this.fail(error);
    } finally {
      this.operation = undefined;
    }
  }
  async install() {
    if (this.locked || this.operation || this.state.status !== 'downloaded') return;
    if (this.deps.busy())
      throw new Error('Pause a fila e aguarde a operação atual terminar antes de instalar.');
    this.locked = true;
    this.change({ status: 'installing', message: undefined });
    try {
      if (!(await this.available())) {
        this.locked = false;
        this.activityChanged();
        return;
      }
      if (this.deps.busy()) throw new Error('Ainda há trabalho em andamento.');
      await this.deps.prepare();
      this.updater.quitAndInstall(true, true);
    } catch (error) {
      this.fail(error);
    }
  }
}
