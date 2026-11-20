import { spawn } from 'node:child_process';
import { join } from 'node:path';

export class CancelledError extends Error {
  constructor() {
    super('Operação cancelada.');
  }
}
export interface RunOptions {
  signal?: AbortSignal;
  timeout?: number | null;
  onLine?: (line: string) => void;
  maxOutput?: number;
  onSpawn?: (pid: number, executable?: string) => Promise<void> | void;
  registrationGate?: boolean;
  captureOutput?: boolean;
  env?: NodeJS.ProcessEnv;
}

// This supervisor does no filesystem work and cannot launch the tool until its
// own identity has been durably registered by the parent. If the parent dies
// before granting permission, stdin closes and the supervisor exits harmlessly.
const PROCESS_GATE = `
const { spawn } = require('node:child_process');
let permission = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { permission += chunk; if (permission.length > 16) process.exit(1); });
process.stdin.on('end', () => {
  if (permission !== 'GO\\n') return;
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.argv[1], process.argv.slice(2), { shell: false, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'], env });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('close', code => { process.exitCode = code === null ? 1 : code; });
});
`;

/** Resolves only after the child and its process tree have stopped. */
export function runProcess(
  executable: string,
  args: string[],
  options: RunOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    if (options.registrationGate && !options.onSpawn) {
      reject(new Error('O lançamento protegido exige registro do processo.'));
      return;
    }
    const program = options.registrationGate ? process.execPath : executable;
    const child = spawn(
      program,
      options.registrationGate ? ['-e', PROCESS_GATE, '--', executable, ...args] : args,
      {
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: [options.registrationGate ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        shell: false,
        env: options.registrationGate
          ? { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1' }
          : options.env,
      },
    );
    child.stdin?.on('error', () => {
      /* a cancelled supervisor may already have closed */
    });
    let output = '',
      errors = '',
      stopped = false,
      timedOut = false,
      tooLarge = false;
    let treeStopped: Promise<void> = Promise.resolve();
    let hardKill: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped || !child.pid) return;
      stopped = true;
      if (process.platform === 'win32') {
        treeStopped = new Promise((resolve) => {
          const killer = spawn(
            join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/pid', String(child.pid), '/T', '/F'],
            { windowsHide: true, shell: false, stdio: 'ignore' },
          );
          killer.on('error', () => {
            child.kill();
            resolve();
          });
          killer.on('close', () => resolve());
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* already exited */
        }
        hardKill = setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {
            /* exited */
          }
        }, 1200);
      }
    };
    options.signal?.addEventListener('abort', stop, { once: true });
    let registrationError: unknown;
    let callbackError: unknown;
    const registered = child.pid
      ? Promise.resolve()
          .then(() => options.onSpawn?.(child.pid!, program))
          .then(() => {
            if (options.registrationGate)
              child.stdin?.end(!stopped && !options.signal?.aborted ? 'GO\n' : '');
          })
          .catch((error) => {
            registrationError = error;
            stop();
          })
      : Promise.resolve();
    const timeout =
      options.timeout === null
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            stop();
          }, options.timeout ?? 120_000);
    const buffers = { stdout: '', stderr: '' };
    const dispatch = (line: string) => {
      if (callbackError) return;
      try {
        options.onLine?.(line);
      } catch (error) {
        callbackError = error;
        stop();
      }
    };
    const read = (source: 'stdout' | 'stderr', chunk: string) => {
      if (source === 'stdout' && options.captureOutput !== false) {
        output += chunk;
        if (output.length > (options.maxOutput ?? 24 * 1024 * 1024)) {
          tooLarge = true;
          stop();
        }
      } else if (source === 'stderr') errors = (errors + chunk).slice(-16_000);
      buffers[source] += chunk;
      const lines = buffers[source].split(/\r?\n/);
      buffers[source] = lines.pop() ?? '';
      for (const line of lines) dispatch(line);
      // Also bound output when receiving a malformed line with no newline.
      if (buffers[source].length > 24 * 1024 * 1024) {
        tooLarge = true;
        stop();
      }
    };
    child.stdout!.setEncoding('utf8').on('data', (chunk) => read('stdout', chunk));
    child.stderr!.setEncoding('utf8').on('data', (chunk) => read('stderr', chunk));
    const cleanup = () => {
      clearTimeout(timeout);
      if (hardKill) clearTimeout(hardKill);
      options.signal?.removeEventListener('abort', stop);
    };
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', async (code) => {
      await registered;
      await treeStopped;
      // A killed parent can leave a descendant alive: finish the group before cleaning files.
      if (stopped && process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* exited */
        }
      }
      cleanup();
      for (const line of Object.values(buffers)) if (line) dispatch(line);
      if (options.signal?.aborted) reject(new CancelledError());
      else if (registrationError) reject(registrationError);
      else if (callbackError) reject(callbackError);
      else if (timedOut) reject(new Error('Connection timed out'));
      else if (tooLarge) reject(new Error('Saída da ferramenta excedeu o limite.'));
      else if (code !== 0)
        reject(
          new Error(errors || output.slice(-4000) || `Ferramenta encerrou com código ${code}.`),
        );
      else resolve(output);
    });
  });
}
