import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  lstat,
  realpath,
  readlink,
} from 'node:fs/promises';
import { dirname, basename, isAbsolute, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TranscriptOutput } from '../shared/transcription-types';

const MARKER = '.vora-transcription.json';
export interface ProcessIdentity {
  pid: number;
  started: string;
  executable: string;
}
export interface TranscriptSession {
  id: string;
  itemId: string;
  path: string;
  destination: string;
  process?: ProcessIdentity;
  outputs: TranscriptOutput[];
}
export interface SessionRecovery extends TranscriptSession {
  running: boolean;
  cleanupPending: boolean;
  error?: string;
}
export async function processIdentity(pid: number): Promise<ProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Identidade de processo inválida.');
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null;
    throw error;
  }
  if (process.platform === 'linux') {
    try {
      const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
      const started = raw.slice(raw.lastIndexOf(')') + 2).split(' ')[19];
      // /proc remains authoritative even when an extracted AppImage runtime
      // has been unlinked. realpath would incorrectly report that PID as gone.
      const executable = (await readlink(`/proc/${pid}/exe`)).replace(/ \(deleted\)$/, '');
      if (!started || !executable) throw new Error('Não foi possível verificar o processo.');
      return { pid, started, executable };
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
      throw error;
    }
  }
  if (process.platform === 'win32') {
    const command = `$ErrorActionPreference='Stop'; $p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){@{pid=$p.Id;started=$p.StartTime.ToUniversalTime().Ticks.ToString();executable=$p.Path}|ConvertTo-Json -Compress}`;
    const { stdout } = await promisify(execFile)(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      ),
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 10000 },
    );
    if (!stdout.trim()) return null;
    const value = JSON.parse(stdout);
    if (!value.started || !value.executable)
      throw new Error('Não foi possível verificar o processo anterior.');
    return value;
  }
  throw new Error('Sistema não suportado para transcrição local.');
}
function validSession(value: unknown): value is TranscriptSession {
  const s = value as TranscriptSession | null;
  return (
    !!s &&
    typeof s.id === 'string' &&
    /^[a-f0-9-]{36}$/.test(s.id) &&
    typeof s.itemId === 'string' &&
    typeof s.path === 'string' &&
    isAbsolute(s.path) &&
    typeof s.destination === 'string' &&
    isAbsolute(s.destination) &&
    dirname(s.path) === s.destination &&
    /^\.vora-transcription-[\w-]+$/.test(basename(s.path)) &&
    Array.isArray(s.outputs) &&
    (!s.process ||
      (Number.isSafeInteger(s.process.pid) &&
        s.process.pid > 0 &&
        typeof s.process.started === 'string' &&
        typeof s.process.executable === 'string'))
  );
}
export class TranscriptionSessions {
  private entries = new Map<string, TranscriptSession>();
  private pending = new Set<string>();
  private loaded?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private journal: string,
    private identity: (pid: number) => Promise<ProcessIdentity | null> = processIdentity,
  ) {}
  private load() {
    return (this.loaded ??= (async () => {
      try {
        const raw = JSON.parse(await readFile(this.journal, 'utf8'));
        if (raw?.schemaVersion !== 1 || !Array.isArray(raw.sessions))
          throw new Error('Diário de transcrição inválido.');
        for (const s of raw.sessions) {
          if (!validSession(s)) throw new Error('Diário de transcrição inválido.');
          this.entries.set(s.id, s);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    })());
  }
  private persist() {
    const save = this.writes.then(async () => {
      await mkdir(dirname(this.journal), { recursive: true });
      await writeFile(
        this.journal + '.tmp',
        JSON.stringify({ schemaVersion: 1, sessions: [...this.entries.values()] }, null, 2),
      );
      await rename(this.journal + '.tmp', this.journal);
    });
    this.writes = save.catch(() => {});
    return save;
  }
  get cleanupPending() {
    return this.pending.size > 0;
  }
  async forItem(itemId: string) {
    await this.load();
    const s = [...this.entries.values()].find((s) => s.itemId === itemId);
    return s ? structuredClone(s) : undefined;
  }
  private async entry(id: string) {
    await this.load();
    const s = this.entries.get(id);
    if (!s) throw new Error('Sessão de transcrição desconhecida.');
    return s;
  }
  private async verify(s: TranscriptSession) {
    const dir = await lstat(s.path),
      marker = join(s.path, MARKER);
    if (!dir.isDirectory() || dir.isSymbolicLink() || (await realpath(s.path)) !== resolve(s.path))
      throw new Error('A propriedade do temporário não pôde ser verificada.');
    const info = await lstat(marker);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('A propriedade do temporário não pôde ser verificada.');
    const saved = JSON.parse(await readFile(marker, 'utf8'));
    if (
      saved.id !== s.id ||
      saved.path !== s.path ||
      saved.destination !== s.destination ||
      saved.itemId !== s.itemId
    )
      throw new Error('A propriedade do temporário não pôde ser verificada.');
  }
  private async alive(s: TranscriptSession) {
    if (!s.process) return false;
    const now = await this.identity(s.process.pid);
    return (
      !!now &&
      now.started === s.process.started &&
      now.executable.toLowerCase() === s.process.executable.toLowerCase()
    );
  }
  async create(itemId: string, destination: string): Promise<TranscriptSession> {
    await this.load();
    const canonical = await realpath(destination);
    const path = await mkdtemp(join(canonical, '.vora-transcription-'));
    const s: TranscriptSession = {
      id: randomUUID(),
      itemId,
      path,
      destination: canonical,
      outputs: [],
    };
    try {
      await writeFile(join(path, MARKER), JSON.stringify(s), { flag: 'wx' });
      this.entries.set(s.id, s);
      await this.persist();
      return structuredClone(s);
    } catch (error) {
      this.entries.delete(s.id);
      await rm(path, { recursive: true, force: true });
      throw error;
    }
  }
  async registerProcess(id: string, pid: number, executable: string) {
    const s = await this.entry(id);
    await this.verify(s);
    const identity = await this.identity(pid);
    if (identity) {
      const expected = await realpath(executable);
      if (identity.executable.toLowerCase() !== expected.toLowerCase())
        throw new Error('O processo não corresponde à ferramenta de transcrição.');
      s.process = identity;
    } else delete s.process;
    await this.persist();
  }
  async recordPublished(id: string, output: TranscriptOutput) {
    const s = await this.entry(id);
    if (dirname(output.path) !== s.destination) throw new Error('Saída fora da pasta da sessão.');
    s.outputs.push({ ...output });
    await this.persist();
  }
  async recover(): Promise<SessionRecovery[]> {
    await this.load();
    const results: SessionRecovery[] = [];
    for (const s of this.entries.values()) {
      try {
        const exists = await lstat(s.path)
          .then(() => true)
          .catch((error) => {
            if (error.code === 'ENOENT') return false;
            throw error;
          });
        if (!exists) {
          const running = await this.alive(s);
          this.pending.delete(s.id);
          results.push({ ...structuredClone(s), running, cleanupPending: false });
          continue;
        }
        await this.verify(s);
        const running = await this.alive(s);
        results.push({ ...structuredClone(s), running, cleanupPending: this.pending.has(s.id) });
      } catch (error) {
        this.pending.add(s.id);
        results.push({
          ...structuredClone(s),
          running: true,
          cleanupPending: true,
          error: (error as Error).message,
        });
      }
    }
    return results;
  }
  async running() {
    await this.load();
    for (const session of this.entries.values()) if (await this.alive(session)) return true;
    return false;
  }
  async cleanup(id: string) {
    const s = await this.entry(id);
    try {
      const exists = await lstat(s.path)
        .then(() => true)
        .catch((error) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        });
      if (!exists) {
        if (await this.alive(s))
          throw new Error('O processo da transcrição ainda está em execução.');
        this.entries.delete(id);
        this.pending.delete(id);
        await this.persist();
        return;
      }
      await this.verify(s);
      if (await this.alive(s)) throw new Error('O processo da transcrição ainda está em execução.');
      await rm(s.path, { recursive: true });
      this.entries.delete(id);
      this.pending.delete(id);
      await this.persist();
    } catch (error) {
      this.pending.add(id);
      throw error;
    }
  }
}
