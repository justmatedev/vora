import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electron from 'electron';

const contextBuild = await context({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
});
await contextBuild.rebuild();
await contextBuild.watch();
const server = await createServer();
await server.listen();
const childEnvironment = { ...process.env, VORA_DEV_URL: 'http://127.0.0.1:5173' };
delete childEnvironment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: childEnvironment });
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  child.kill();
  await Promise.all([server.close(), contextBuild.dispose()]);
  process.exit(code);
}
child.on('error', (error) => {
  console.error(error);
  void close(1);
});
child.on('exit', (code) => void close(code ?? 0));
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
console.log(
  'Vora em desenvolvimento. A interface tem atualização automática; reinicie para mudanças no Electron.',
);
