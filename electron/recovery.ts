import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { RecoveryItem, VideoInfo } from '../shared/types';
import { normalizeYouTubeUrl } from './media';

export const SESSION_MARKER = '.vora-session.json';
export interface DownloadSession {
  id: string;
  path: string;
  destination: string;
  title: string;
  url: string;
  createdAt: string;
  processId?: number;
  queueItemId?: string;
}
function validSession(value: unknown): value is DownloadSession {
  const s = value as DownloadSession;
  return (
    !!s &&
    typeof s.id === 'string' &&
    /^[a-f0-9-]{36}$/.test(s.id) &&
    typeof s.path === 'string' &&
    isAbsolute(s.path) &&
    typeof s.destination === 'string' &&
    isAbsolute(s.destination) &&
    dirname(s.path) === s.destination &&
    /^\.vora-[\w-]+$/.test(basename(s.path)) &&
    typeof s.title === 'string' &&
    typeof s.url === 'string' &&
    typeof s.createdAt === 'string' &&
    Number.isFinite(Date.parse(s.createdAt))
  );
}
async function bytesInDirectory(path: string): Promise<number> {
  let size = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === SESSION_MARKER || entry.isSymbolicLink()) continue;
    const item = join(path, entry.name);
    if (entry.isDirectory()) size += await bytesInDirectory(item);
    else if (entry.isFile()) size += (await lstat(item)).size;
  }
  return size;
}

/** Only journaled directories bearing the matching marker can be removed. */
export class RecoveryStore {
  private sessions = new Map<string, DownloadSession>();
  private active = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private journal: string) {}
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.journal, 'utf8'));
      if (Array.isArray(saved))
        for (const s of saved) {
          if (validSession(s)) {
            try {
              if (normalizeYouTubeUrl(s.url) === s.url) this.sessions.set(s.id, s);
            } catch {
              /* Invalid journal entry. */
            }
          }
        }
    } catch {
      /* First launch: no recovery journal. Never infer ownership from a folder name. */
    }
  }
  private persist() {
    const operation = this.queue.then(async () => {
      await mkdir(dirname(this.journal), { recursive: true });
      await writeFile(`${this.journal}.tmp`, JSON.stringify([...this.sessions.values()], null, 2));
      await rename(`${this.journal}.tmp`, this.journal);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async verify(session: DownloadSession) {
    const directory = await lstat(session.path);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (await realpath(session.path)) !== resolve(session.path)
    )
      throw new Error('Temporário não pôde ser verificado.');
    const marker = join(session.path, SESSION_MARKER);
    if (!(await lstat(marker)).isFile() || (await lstat(marker)).isSymbolicLink())
      throw new Error('Temporário não pôde ser verificado.');
    const saved = JSON.parse(await readFile(marker, 'utf8'));
    if (
      saved.id !== session.id ||
      saved.path !== session.path ||
      saved.destination !== session.destination
    )
      throw new Error('O identificador do temporário não corresponde ao Vora.');
  }
  async create(
    destination: string,
    info: VideoInfo,
    queueItemId?: string,
  ): Promise<DownloadSession> {
    const canonical = await realpath(destination);
    const path = await mkdtemp(join(canonical, '.vora-'));
    const session = {
      id: randomUUID(),
      path,
      destination: canonical,
      title: info.title,
      url: info.url,
      createdAt: new Date().toISOString(),
      ...(queueItemId ? { queueItemId } : {}),
    };
    try {
      await writeFile(join(path, SESSION_MARKER), JSON.stringify(session), { flag: 'wx' });
      this.sessions.set(session.id, session);
      this.active.add(session.id);
      await this.persist();
      return session;
    } catch (error) {
      this.sessions.delete(session.id);
      this.active.delete(session.id);
      await rm(path, { recursive: true, force: true });
      throw error;
    }
  }
  async finish(session: DownloadSession) {
    try {
      await this.verify(session);
      // Keep the ownership marker until all media is gone, even if cleanup is interrupted.
      for (const name of await readdir(session.path))
        if (name !== SESSION_MARKER)
          await rm(join(session.path, name), {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
          });
      await rm(join(session.path, SESSION_MARKER));
      await rmdir(session.path);
      this.sessions.delete(session.id);
      await this.persist();
    } finally {
      this.active.delete(session.id);
    }
  }
  async recordProcess(session: DownloadSession, pid: number) {
    if (!this.active.has(session.id) || !Number.isInteger(pid) || pid < 1)
      throw new Error('Não foi possível registrar o processo do download.');
    session.processId = pid;
    await this.persist();
  }
  private async isRunning(session: DownloadSession) {
    const pid = session.processId;
    if (!Number.isInteger(pid) || !pid || pid < 1) return false;
    try {
      process.kill(pid, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (process.platform === 'linux') {
      try {
        const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
        return args.some((arg) => arg === session.path || arg.startsWith(session.path + sep));
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ENOENT';
      }
    }
    return true;
  }
  async list(): Promise<RecoveryItem[]> {
    const result: RecoveryItem[] = [];
    let pruned = false;
    for (const s of this.sessions.values()) {
      if (this.active.has(s.id)) continue;
      try {
        await this.verify(s);
        result.push({
          id: s.id,
          title: s.title,
          url: s.url,
          destination: s.destination,
          createdAt: s.createdAt,
          size: await bytesInDirectory(s.path),
          running: await this.isRunning(s),
          ...(s.queueItemId ? { queueItemId: s.queueItemId } : {}),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.sessions.delete(s.id);
          pruned = true;
        } else console.error('[Vora/recuperação]', s.id, (error as Error).message);
      }
    }
    if (pruned) await this.persist();
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async remove(id: unknown) {
    if (typeof id !== 'string' || !this.sessions.has(id))
      throw new Error('Este temporário não está registrado no Vora.');
    if (this.active.has(id)) throw new Error('Este download ainda está em andamento.');
    const session = this.sessions.get(id)!;
    if (await this.isRunning(session))
      throw new Error(
        'O processo desse download ainda está em execução. Aguarde terminar antes de limpar os arquivos.',
      );
    try {
      await this.finish(session);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.sessions.delete(id);
        await this.persist();
        return;
      }
      throw new Error(
        'Não foi possível limpar esse download. Verifique se a pasta está disponível e tente novamente.',
      );
    }
  }
}
