import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  access,
  mkdir,
  mkdtemp,
  link,
  copyFile,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ModelManager } from '../electron/whisper-models.ts';
import { SourceRegistry } from '../electron/transcription-sources.ts';
import { TranscriptionSessions } from '../electron/transcription-sessions.ts';
import { Transcriber } from '../electron/transcriber.ts';
import { TranscriptionQueue } from '../electron/transcription-queue.ts';
import { publishTranscript } from '../electron/transcription-output.ts';
import { fileHash } from '../electron/model-download.ts';

const enabled = process.env.VORA_TEST_TRANSCRIPTION === '1';
const input = process.env.VORA_TRANSCRIPTION_INPUT;
const weights = process.env.VORA_WHISPER_MODELS;
const toolsRoot = resolve(
  process.env.VORA_TRANSCRIPTION_TOOLS ??
    join('resources/tools', process.platform === 'win32' ? 'win-x64' : 'linux-x64'),
);
const executable = (name) => name + (process.platform === 'win32' ? '.exe' : '');
const tools = {
  ffmpeg: join(toolsRoot, executable('ffmpeg')),
  ffprobe: join(toolsRoot, executable('ffprobe')),
  whisper: join(toolsRoot, 'whisper', executable('whisper-cli')),
};
const ids = process.env.VORA_TRANSCRIPTION_MODELS?.split(',') ?? ['small', 'medium'];
async function until(check, timeout = 600_000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Tempo limite da integração real.');
    await new Promise((done) => setTimeout(done, 25));
  }
}
for (const id of ids)
  test(
    `Whisper ${id}: fila real offline, TXT/SRT, preservação, recuperação e cancelamento`,
    { timeout: 3_600_000 },
    async (t) => {
      if (!enabled) return t.skip('Ative VORA_TEST_TRANSCRIPTION=1 para executar o motor real.');
      if (!input || !weights)
        return t.skip(
          'Defina VORA_TRANSCRIPTION_INPUT e VORA_WHISPER_MODELS; nenhum modelo é baixado pelo teste.',
        );
      for (const path of [input, join(weights, `ggml-${id}.bin`), ...Object.values(tools)]) {
        try {
          await access(path);
        } catch {
          return t.skip(`Fixture/ferramenta ausente: ${path}`);
        }
      }
      assert.ok(['small', 'medium'].includes(id));
      await mkdir('.cache', { recursive: true });
      const root = await mkdtemp(resolve('.cache/transcription-real-'));
      const originalHash = await fileHash(input);
      let queue;
      const oldFetch = globalThis.fetch;
      // No HTTP request is permitted in the production service during this run.
      globalThis.fetch = async () => {
        throw new Error('Rede desativada na integração de transcrição.');
      };
      try {
        const models = new ModelManager(join(root, 'models'), () => {});
        const paths = models.paths(id);
        await mkdir(paths.directory, { recursive: true });
        try {
          await link(join(weights, `ggml-${id}.bin`), paths.installed);
        } catch (error) {
          if (error.code !== 'EXDEV') throw error;
          await copyFile(join(weights, `ggml-${id}.bin`), paths.installed);
        }
        await models.load();
        assert.equal(models.snapshot()[id].state, 'installed');
        const registry = new SourceRegistry(tools);
        const [selection] = await registry.register([resolve(input)], 'local');
        const source = await registry.resolve(selection.id);
        const destination = join(root, 'output');
        await mkdir(destination);
        const sentinel = join(destination, 'existing.txt');
        await writeFile(sentinel, 'preservado');
        const sessions = new TranscriptionSessions(join(root, 'sessions.json'));
        const transcriber = new Transcriber(tools, models, sessions);
        let documents = 0;
        const deps = {
          models,
          sessions,
          transcriber,
          publish: async (doc, ...args) => {
            documents++;
            if (process.env.VORA_TRANSCRIPTION_REPORT)
              await writeFile(
                resolve(process.env.VORA_TRANSCRIPTION_REPORT),
                JSON.stringify(doc, null, 2),
              );
            assert.ok(doc.segments.length > 0);
            assert.ok(
              doc.segments.every(
                (s) => 0 <= s.startMs && s.startMs < s.endMs && s.endMs <= doc.durationMs,
              ),
            );
            return publishTranscript(doc, ...args);
          },
        };
        const queueFile = join(root, 'transcriptions.json');
        queue = new TranscriptionQueue(queueFile, deps, () => {});
        await queue.load();
        await queue.add({
          sources: [source],
          options: { modelId: id, language: 'auto', formats: ['txt', 'srt'] },
          destination,
          downloadModel: false,
          start: true,
        });
        await until(
          () =>
            queue.snapshot().items[0]?.status === 'completed' ||
            queue.snapshot().items[0]?.status === 'failed',
          3_300_000,
        );
        await until(() => !queue.busy);
        const completed = queue.snapshot().items[0];
        assert.equal(completed.status, 'completed', completed.error);
        assert.equal(documents, 1);
        assert.equal(completed.outputs.length, 2);
        const outputHashes = new Map();
        for (const output of completed.outputs) {
          const content = await readFile(output.path);
          assert.ok(content.length > 0);
          assert.ok(new TextDecoder('utf-8', { fatal: true }).decode(content).trim());
          if (output.format === 'srt') assert.match(content.toString(), /\d\d:\d\d:\d\d,\d{3} -->/);
          outputHashes.set(output.path, await fileHash(output.path));
        }
        // A second publication chooses a new common stem and never overwrites prior outputs.
        await publishTranscript(
          {
            language: 'pt',
            durationMs: 1000,
            segments: [{ startMs: 0, endMs: 1000, text: 'Verificação de preservação.' }],
          },
          ['txt', 'srt'],
          destination,
          source.name,
          async () => {},
        );
        for (const [path, hash] of outputHashes) assert.equal(await fileHash(path), hash);
        assert.equal(await readFile(sentinel, 'utf8'), 'preservado');
        await queue.shutdown();
        queue = new TranscriptionQueue(queueFile, deps, () => {});
        await queue.load();
        assert.equal(queue.snapshot().mode, 'paused');
        assert.deepEqual(queue.snapshot().items[0].outputs, completed.outputs);
        assert.equal(models.snapshot()[id].state, 'installed');
        const [cancelId] = await queue.add({
          sources: [source],
          options: { modelId: id, language: 'pt', formats: ['txt'] },
          destination,
          downloadModel: false,
          start: true,
        });
        await until(
          () => queue.snapshot().items.find((i) => i.id === cancelId)?.status === 'transcribing',
        );
        await queue.cancel(cancelId);
        assert.equal(queue.snapshot().items.find((i) => i.id === cancelId).status, 'cancelled');
        await queue.shutdown();
        assert.equal(await sessions.running(), false);
        assert.deepEqual(await sessions.recover(), []);
        assert.equal(
          (await readdir(destination)).some((name) => name.startsWith('.vora-')),
          false,
        );
        assert.equal(await fileHash(input), originalHash);
        t.diagnostic(
          `Motor nativo ${id}; ${Math.round(source.durationMs / 1000)} s de mídia; nenhum HTTP permitido; original e resultados preservados.`,
        );
      } finally {
        await queue?.shutdown();
        globalThis.fetch = oldFetch;
        await rm(root, { recursive: true, force: true });
      }
    },
  );
