# Transcrições locais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** integrar transcrição local opcional de arquivos do computador e downloads concluídos, com Small/Medium, fila persistente e TXT/SRT.

**Architecture:** serviços separados para modelos, entradas locais, sessões temporárias, execução, publicação e fila. O processo principal controla arquivos e subprocessos; React recebe snapshots e operações específicas pela ponte isolada. Downloads mantêm sua fila atual, podendo executar junto de uma única transcrição.

**Tech Stack:** Electron, React, TypeScript, Node.js >=22.12, FFmpeg/ffprobe existentes, whisper.cpp v1.8.2 CPU, node:test/tsx e Playwright existentes. Sem serviço remoto de transcrição ou nova dependência de produção obrigatória.

**Spec:** [desenho aprovado](../specs/2026-11-20-transcricoes-locais-design.md). Ler ambos os documentos antes de executar. A aprovação do desenho ocorreu na conversa após o commit `2f196ed`.

## Global Constraints

- Linux e Windows x64; preservar downloads, recuperação, notificações e atualizador existentes.
- Small multilíngue recomendado; Medium multilíngue opcional; CPU; somente uma transcrição ativa.
- Modelos completos, sem quantização, na revisão `5359861c739e955e79d9a303bcbc70fb988958b1`; copiar tamanhos e SHA-256 exatos da especificação.
- Modelos em `join(app.getPath('userData'), 'models', 'whisper')`; fila própria em `transcriptions.json`; não alterar o esquema de `queue.json`.
- Nenhum download automático de modelo ao abrir/atualizar; instalação depende de ação explícita; preservar pesos compatíveis e versões fixadas.
- TXT/SRT UTF-8, sem tradução automática, sem sobrescrita e com originais preservados; não declarar sucesso antes de publicar todos os formatos solicitados.
- Retorno do aplicativo com fila pausada, ativos anteriores interrompidos e tentativa explícita desde o início; não retomar transcrição pelo último minuto.
- Modelos e motor com licenças preservadas; usuário final não instala Python, CMake ou compilador.
- Interface em português, Inter, tokens de `src/styles.css` e organização aprovada na prévia. Não copiar temporizadores/dados simulados para o aplicativo.
- Publicação de Release e mudança de versão não fazem parte deste plano.

## Review Focus

1. Origem movida, substituída ou com nome contendo aspas/Unicode: revalidar identidade e nunca interpolar caminhos em shell (tarefas 4/6/9).
2. Servidor ignora Range ou muda o validador: reiniciar de forma informada e nunca instalar concatenação incorreta (tarefa 3).
3. Corrida entre dois formatos de saída: preservar nomes existentes e registrar arquivos já publicados se o segundo falhar (tarefa 7).
4. Queda com processo vivo ou PID reutilizado: não duplicar trabalho, matar processo alheio nem limpar pastas sem propriedade comprovada (tarefas 5/8/9).
5. Áudio longo com fala junto à divisão: limitar memória, manter tempos globais e verificar duplicação/omissão nas bordas (tarefas 6/11).

## Mapa de arquivos e contratos

Novos módulos ficam pequenos e por responsabilidade, seguindo os padrões atuais:

| Responsabilidade | Arquivos novos principais |
| --- | --- |
| Tipos, opções e idiomas | `shared/transcription-types.ts`, `shared/transcription-options.ts`, `shared/whisper-languages.ts` |
| Catálogo fixado | `shared/whisper-models.ts`, `resources/whisper.lock.json` |
| Distribuição do motor | `scripts/prepare-whisper.mjs`, `scripts/verify-whisper.mjs` |
| Instalação de pesos | `electron/model-download.ts`, `electron/whisper-models.ts` |
| Entradas/destinos escolhidos | `electron/transcription-sources.ts` |
| Propriedade e recuperação de temporários | `electron/transcription-sessions.ts` |
| Áudio, Whisper e segmentos | `electron/transcription-audio.ts`, `electron/transcriber.ts`, `electron/transcript-segments.ts` |
| Publicação de TXT/SRT | `electron/transcription-output.ts` |
| Agendamento/persistência | `electron/transcription-queue.ts` |
| IPC e ciclo de vida | `electron/transcription-ipc.ts`, `electron/work-activity.ts` |
| Interface | `src/transcription-client.ts`, `src/TranscriptionsPanel.tsx`, `src/TranscriptionDialog.tsx`, `src/WhisperModelsDialog.tsx`, `src/transcriptions.css` |

Modificar os arquivos existentes somente nos pontos descritos nas tarefas. Não refatorar a fila de downloads como pré-requisito.

Contratos de apoio definidos na tarefa 1 em `shared/transcription-types.ts` (os registros privados podem ser exportados somente pelos módulos de `electron/` que os possuem):

```ts
type ModelSpec = {id:WhisperModelId;revision:string;bytes:number;sha256:string;url:string};
type ModelPaths = {directory:string;partial:string;partialMeta:string;installed:string};
type ModelProgress = {state:'downloading'|'verifying';receivedBytes:number;totalBytes:number};
type ModelInfo = {spec:ModelSpec;state:'missing'|'partial'|'downloading'|'verifying'|'installed'|'error';bytesOnDisk:number;path:string;error?:string};
type ModelSnapshot = Record<WhisperModelId,ModelInfo>;
type SourceSelection = {id:string;name:string;size:number;durationMs:number;origin:'local'|'download'};
type SourceRecord = SourceSelection & {path:string;mtimeMs:number;device:string;inode:string;audioStreamIndex:number};
type DestinationSelection = {id:string;path:string};
type LocalMedia = {durationMs:number;audioStreamIndex:number};
type TranscriptionWork = {id:string;source:SourceRecord;destination:string;options:TranscriptionOptions;modelRevision:string};
type TranscriptionProgress = {stage:'preparing'|'transcribing'|'saving';percent?:number};
type TranscriptDocument = {language:string;durationMs:number;segments:TranscriptSegment[]};
type AudioChunk = {coreStartMs:number;coreEndMs:number;startMs:number;endMs:number};
type ChunkTranscript = {chunk:AudioChunk;language:string;segments:TranscriptSegment[]};
type TranscriptOutput = {format:TranscriptFormat;path:string;size:number};
```

`TranscriptSession` e `SessionRecovery` são contratos internos da tarefa 5: ID, itemId, diretório canônico, marcador/diário, registros de processo/identidade, saídas publicadas e indicação de processo vivo/limpeza pendente. Não devem aparecer na ponte pública. Helpers citados nos testes, como `verifyWhisperFixture` e `inspectFixture`, são arranjos locais definidos pelo implementador no arquivo de teste responsável, com os cenários explicitados na tarefa.

## Sequência e verificação

As tarefas 1–3 entregam catálogo/motor/instalação testáveis; 4–8 entregam processamento durável; 9–10 conectam aplicativo e interface; 11 valida distribuição. São etapas do mesmo recurso, com contratos compartilhados, não projetos independentes.

Em cada ciclo, demonstrar a falha do teste antes de implementar e executar o comando de verificação indicado depois. Os trechos de teste abaixo fixam as asserções mínimas; montar os arranjos e dependências injetadas no próprio arquivo de teste, sem downloads grandes nas verificações comuns. Commitar somente os arquivos da tarefa concluída.

### Tarefa 1: Contratos, catálogo e preferências independentes

**Files:** criar os cinco arquivos `shared/`/`resources/` correspondentes do mapa e `tests/transcription-options.test.ts`; modificar `shared/types.ts`, `electron/settings.ts`, `tests/preferences.test.ts`.

**Interfaces:** exportar `WhisperModelId = 'small' | 'medium'`, `TranscriptFormat = 'txt' | 'srt'`, `TranscriptSegment = {startMs:number; endMs:number; text:string}` e `TranscriptionOptions = {modelId:WhisperModelId; language:string; formats:TranscriptFormat[]}`. `parseTranscriptionOptions(value:unknown):TranscriptionOptions` retorna formatos deduplicados em ordem TXT/SRT e rejeita opções inválidas. `MODEL_CATALOG` contém revisão, URL imutável, tamanho e hash. `LANGUAGES` vem da lista suportada pelo código v1.8.2, com rótulos em português. `AppSettings.transcriptionPreferences` tem padrão Small/auto/TXT+SRT, com migração de configurações antigas.

- [ ] Escrever testes de opções válidas, zero formatos, idioma inexistente, modelo externo, duplicatas e migração sem alterar preferências de download:
  ```ts
  assert.deepEqual(parseTranscriptionOptions({modelId:'small',language:'auto',formats:['srt','txt','txt']}),
    {modelId:'small',language:'auto',formats:['txt','srt']});
  assert.throws(() => parseTranscriptionOptions({modelId:'small',language:'auto',formats:[]}));
  assert.throws(() => parseTranscriptionOptions({modelId:'https://example.test/model',language:'auto',formats:['txt']}));
  ```
- [ ] Executar `node --import tsx --test tests/transcription-options.test.ts tests/preferences.test.ts`; confirmar falha pelas novas funções ausentes.
- [ ] Implementar contratos/validação e migração no `SettingsStore`; estados da fila e dos modelos são unions discriminadas, sem reutilizar `JobEvent` de download. O catálogo usa exatamente os dois hashes da especificação.
- [ ] Reexecutar o comando e `npm run typecheck`; exigir sucesso e manutenção dos defaults de download.
- [ ] Commit: `feat: define local transcription contracts and preferences`.

### Tarefa 2: Motor CPU portátil e cadeia de empacotamento

**Files:** criar os dois scripts do motor e `tests/whisper-packaging.test.ts`; modificar `scripts/fetch-tools.mjs`, `scripts/verify-tools.mjs`, `scripts/check-packaged-runtime.mjs`, `resources/notices/sources.json`, `THIRD_PARTY.md`, `.github/workflows/packages.yml`, `docs/DEVELOPMENT.md`. Adicionar textos de licença em `resources/notices/` com seus hashes.

**Interfaces:** `prepare-whisper.mjs <linux|win32>` constrói no sistema nativo correspondente e entrega `resources/tools/<platform>/whisper/whisper-cli[.exe]`, bibliotecas necessárias e manifesto de arquivos. `verify-whisper.mjs <target>` verifica somente artefatos/versões/hashes declarados. O motor fica em subdiretório; preservar a verificação restritiva da raiz existente.

- [ ] Escrever teste do verificador com diretório de ferramentas temporário: arquivo ausente, biblioteca alterada e arquivo extra devem falhar; conjunto completo deve passar. Parametrizar raiz nos helpers importáveis dos scripts para o teste não tocar ferramentas reais.
  ```ts
  await assert.rejects(verifyWhisperFixture({altered:'ggml-base'}), /checksum|alterad/i);
  await assert.rejects(verifyWhisperFixture({extra:'untracked.dll'}), /extra|inesperad/i);
  ```
- [ ] Executar `node --import tsx --test tests/whisper-packaging.test.ts` e confirmar a falha inicial.
- [ ] Fixar origem `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.8.2.tar.gz`, SHA-256 `bcee25589bb8052d9e155369f6759a05729a2022d2a8085c1aa4345108523077`; construir Release com `GGML_NATIVE=OFF`, `BUILD_SHARED_LIBS=ON`, `GGML_BACKEND_DL=ON`, `GGML_CPU_ALL_VARIANTS=ON`, CUDA/Vulkan/Metal/CURL/server/testes desativados e alvo `whisper-cli`. Preservar variante CPU de base e variantes aceleradas; incluir todas as bibliotecas declaradas, sem depender do PATH de desenvolvimento. Testar opções no código CMake v1.8.2, não assumir flags de versões recentes.
- [ ] Integrar preparação/verificação à cadeia atual e instalação nativa de CMake/compilador no ambiente de build. Copiar/registrar licenças e hashes do Whisper, GGML e bibliotecas de runtime redistribuídas. Não reutilizar o binário `-march=native` do experimento.
- [ ] Executar teste, `npm run tools:fetch -- linux`/`win32` no respectivo sistema, `npm run tools:verify`, e inicialização `whisper-cli --help` fora da árvore de build. Pacote nativo precisa passar em `check-packaged-runtime.mjs`; preparação cruzada não equivale a execução Windows.
- [ ] Commit: `build: package pinned portable whisper cpu runtime`.

### Tarefa 3: Download retomável e gerenciamento dos modelos

**Files:** criar os dois módulos de instalação do mapa, `tests/model-download.test.ts`, `tests/whisper-models.test.ts` e `tests/model-download.integration.test.mjs`.

**Interfaces:** `downloadModel(spec:ModelSpec, paths:ModelPaths, options:{signal:AbortSignal;onProgress:(p:ModelProgress)=>void}):Promise<void>`. `ModelManager` oferece `load()`, `snapshot()`, `install(id)`, `cancel(id)`, `discardPartial(id)`, `remove(id)`, `path(id)`, `shutdown()` e getters `busy`/`cleanupPending`. `install()` resolve ao concluir, mas chamadas concorrentes para o mesmo ID compartilham a operação; IDs diferentes aguardam o instalador único. `remove()` consulta dependentes por callback injetado e retorna erro enquanto houver uso ativo/aguardando.

- [ ] Escrever testes com bytes pequenos, hashes conhecidos e transporte/disco injetados; o teste de integração usa HTTP local real. Fixar asserções:
  ```ts
  assert.equal(snapshot.small.state, 'partial'); // depois de cancelar
  assert.equal(resumeRequest.headers.range, 'bytes=4-');
  assert.equal(await installedHash(), expectedHash);
  assert.equal(requestCountForTwoConcurrentInstalls, 1);
  await assert.rejects(manager.remove('small'), /em uso|aguardando/i);
  ```
  Cobrir resposta 200 a Range, 416, ETag/If-Range alterado, checksum errado, ENOSPC, hash de instalação adulterado e download incompleto após reinício.
- [ ] Executar `node --import tsx --test tests/model-download.test.ts tests/whisper-models.test.ts tests/model-download.integration.test.mjs`; observar falhas iniciais.
- [ ] Implementar arquivos por revisão dentro do diretório aprovado, parcial e metadados persistidos, espaço livre, tamanho/hash, publicação final e estados `missing/partial/downloading/verifying/installed/error`. Ao cancelar, conservar parcial; descarte é ação separada. Não seguir URL/revisão fornecida pelo renderer. Redirects HTTPS necessários do provedor fixado podem ser seguidos pelo transporte; cada conteúdo final continua sujeito ao tamanho/hash do manifesto.
- [ ] Toda mudança de instalação notifica assinantes; não marcar instalado antes da verificação. Download iniciado explicitamente na área Modelos pode terminar sem trabalhos na fila; cancelamento de um item não cancela um download compartilhado. Mostrar essa atividade na área Modelos, com cancelamento próprio. Não baixar ao chamar `load()`.
- [ ] Reexecutar o comando; provar que arquivos de resultados e originais não são removidos na remoção/limpeza de modelo.
- [ ] Commit: `feat: manage verified resumable whisper model downloads`.

### Tarefa 4: Seleção e validação de arquivos/destinos locais

**Files:** criar `electron/transcription-sources.ts` e `tests/transcription-sources.test.ts`.

**Interfaces:** `SourceRegistry.register(paths:string[], origin:'local'|'download'):Promise<SourceSelection[]>`, `resolve(id:string):Promise<SourceRecord>`, `chooseDestination(path:string):Promise<DestinationSelection>`, `resolveDestination(id:string):Promise<string>`. Seleção pública contém ID/nome/tamanho/duração/origem; registro privado captura caminho canônico, tamanho e mtime. Seletores nativos serão conectados na tarefa 9. `inspectLocalMedia(path:string, tools:Pick<ToolPaths,'ffprobe'>, signal:AbortSignal):Promise<LocalMedia>` retorna duração e índice da faixa de áudio padrão, ou primeira faixa de áudio quando não houver padrão.

- [ ] Testar arquivo sem áudio, não regular, ausente, alterado depois de selecionado, nome Unicode/aspas, destino sem escrita, ID desconhecido e playlist disfarçada como vídeo:
  ```ts
  await assert.rejects(registry.resolve(selectedIdAfterReplacement), /alterad|selecione/i);
  await assert.rejects(inspectFixture('playlist-renamed.mp4'), /local|playlist|formato/i);
  assert.equal(ffprobeArgs.includes('-protocol_whitelist'), true);
  assert.equal(downloadPreferences.destination, previousDestination);
  ```
- [ ] Executar `node --import tsx --test tests/transcription-sources.test.ts` para confirmar falha.
- [ ] Implementar inspeção restrita a arquivos locais, protocolos `file,pipe` e recusa de demuxers playlist/HLS/DASH/concat/SDP; não inferir segurança pela extensão. Destinos selecionados não alteram a pasta global de downloads. Ler/salvar somente caminhos registrados no processo principal, revalidando antes de processar.
- [ ] Reexecutar os testes. Para lote com inválidos, recusar a inclusão inteira com nomes e motivos, sem adicionar parcialmente em silêncio.
- [ ] Commit: `feat: validate selected local transcription sources`.

### Tarefa 5: Sessões temporárias e propriedade dos processos

**Files:** criar `electron/transcription-sessions.ts` e `tests/transcription-sessions.test.ts`; modificar `electron/processes.ts` e adicionar `tests/processes.test.ts`.

**Interfaces:** `TranscriptionSessions.create(itemId,destination):Promise<TranscriptSession>`, `registerProcess(sessionId,pid,executable):Promise<void>`, `recordPublished(sessionId,output):Promise<void>`, `recover():Promise<SessionRecovery[]>`, `cleanup(sessionId):Promise<void>`, `running():Promise<boolean>`. Sessões usam diretórios identificados/diário separado em `userData`; validar marcador/caminho canônico e identidade de processo, não somente PID. Estender `RunOptions.timeout` para `number | null`; `null` desativa deadline absoluta explicitamente, preservando 120000 ms como padrão dos consumidores existentes.

- [ ] Testar cancelamento de pai/filho real, encerramento aguardado antes de limpeza, marcador alheio, symlink, PID reutilizado e falha ao registrar o processo:
  ```ts
  await assert.rejects(sessions.cleanup(foreignMarkerId), /verific|propriedade/i);
  assert.equal(unrelatedProcessKilled, false);
  assert.equal(await childStillRunningAfterCancellation(), false);
  assert.equal(defaultTimeoutForExistingCall, 120000);
  ```
- [ ] Executar `node --import tsx --test tests/processes.test.ts tests/transcription-sessions.test.ts tests/recovery.test.ts` e confirmar falha inicial.
- [ ] Implementar diário serializado, propriedade comprovada e erro explícito quando não for possível verificar processo/temporário. Reutilizar a lógica de encerramento da árvore em `runProcess`, sem adaptar o `RecoveryStore` de URLs para aceitar caminhos locais. Transcrições longas usam `timeout:null`; permanecem acompanhadas pelo serviço e canceláveis, sem processo abandonado após sair.
- [ ] Reexecutar o comando nos dois sistemas, incluindo arquivos bloqueados no Windows. Erro de limpeza mantém `cleanupPending` e bloqueia retomada/atualização até resolver.
- [ ] Commit: `feat: track and recover transcription process sessions`.

### Tarefa 6: Processamento limitado em memória e segmentos globais

**Files:** criar os três módulos de execução/segmentos do mapa, `tests/transcriber.test.ts`, `tests/transcript-segments.test.ts` e `tests/fixtures/whisper-small-output.json` com a estrutura real do CLI fixado.

**Interfaces:** `Transcriber.run(item:TranscriptionWork, signal:AbortSignal, emit:(event:TranscriptionProgress)=>void):Promise<TranscriptDocument>`. `planAudioChunks(durationMs:number):AudioChunk[]`, `mergeSegments(chunks:ChunkTranscript[], durationMs:number):TranscriptSegment[]`, `parseWhisperJson(value:unknown, chunk:AudioChunk):ChunkTranscript`. Dependências injetadas: ferramentas, `ModelManager.path`, sessões e executor.

- [ ] Testar argumentos sem shell/tradução/GPU, cancelamento durante FFmpeg e Whisper, JSON inválido, documento sem fala, idioma manual e detecção automática. Fixar limites:
  ```ts
  assert.ok(chunks.every(c => c.endMs - c.startMs <= 304000));
  assert.equal(result.segments.at(-1)!.endMs, 120000); // CLI retorna 120400
  assert.equal(activeWhisperProcessHighWaterMark, 1);
  assert.ok(whisperArgs.includes('-ng'));
  assert.equal(whisperArgs.includes('--translate'), false);
  ```
  Criar caso de fala na borda de dois chunks e exigir uma ocorrência do segmento e tempos globais ordenados.
- [ ] Executar `node --import tsx --test tests/transcriber.test.ts tests/transcript-segments.test.ts`; confirmar falha.
- [ ] Implementar cores de 300 s com até 2 s de contexto em cada lado, WAV mono/16 kHz/PCM16 por chunk e um processo Whisper por vez. Excluir WAV após processar seu chunk; nunca ler todo o vídeo/áudio em um Buffer. Usar `-oj` do CLI, offsets em milissegundos, `-ng`, `-pp`, idioma e `-t Math.max(1, Math.min(6, availableParallelism()-1))`.
- [ ] Mesclar pelo tempo global: manter segmento cujo ponto médio pertence ao core (último inclui o fim), aplicar offset, recortar para `[0,durationMs]`, remover segmentos vazios/invertidos e ordenar. Não duplicar overlap no TXT. Para idioma automático, fixar o primeiro idioma detectado em chunk com fala para os seguintes; sem fala em todos os chunks resulta em erro informativo, não sucesso vazio. Não prometer detectar todas as alucinações do modelo.
- [ ] Emitir fases/progresso a partir do chunk e do motor, nunca de temporizador. Evitar capturar todo stdout; guardar logs limitados e ler o JSON temporário. Revalidar fonte/modelo antes de usar, conferir espaço temporário e limpar somente a sessão.
- [ ] Reexecutar testes e `npm run typecheck`.
- [ ] Commit: `feat: transcribe local audio with bounded whisper chunks`.

### Tarefa 7: Exportação TXT/SRT sem sobrescrita

**Files:** criar `electron/transcription-output.ts`, `tests/transcription-output.test.ts`; reutilizar ou extrair primitivas de `electron/files.ts` sem mudar o contrato de `publishUnique`.

**Interfaces:** `serializeTranscript(doc:TranscriptDocument, format:TranscriptFormat):string`, `publishTranscript(doc, formats, destination, sourceName, onPublished):Promise<TranscriptOutput[]>`; `TranscriptOutput={format:TranscriptFormat;path:string;size:number}`. `PartialTranscriptOutputError` expõe `published:TranscriptOutput[]`.

- [ ] Escrever testes de UTF-8, nomes Windows, conflito em apenas um formato, criação concorrente do segundo destino, falha de escrita e callback de diário:
  ```ts
  assert.deepEqual(outputs.map(o => basename(o.path)), ['clovis.transcricao (1).txt','clovis.transcricao (1).srt']);
  assert.equal(await readFile(existingTxt,'utf8'), 'conteúdo anterior');
  assert.deepEqual(partialError.published.map(o => o.format), ['txt']);
  assert.equal(srt.includes('00:02:00,400'), false);
  ```
- [ ] Executar `node --import tsx --test tests/transcription-output.test.ts tests/download.test.ts` para confirmar falha.
- [ ] Preparar ambos os arquivos na sessão, conferir tempos e UTF-8, escolher sufixo comum e publicar sem substituição. Após a primeira publicação, conflito/falha no segundo formato retorna erro parcial com caminhos preservados; não tentar renomear ou apagar resultados já publicados. Registrar cada publicação no diário antes de prosseguir. Prevenir corrida no destino com criação exclusiva/hard link e tratar fallback do sistema de arquivos.
- [ ] Reexecutar os testes, incluindo permissão/espaço alterados depois da pré-validação e falha do diário durante publicação.
- [ ] Commit: `feat: export transcript sets without replacing existing files`.

### Tarefa 8: Fila persistente de transcrições

**Files:** criar `electron/transcription-queue.ts`, `tests/transcription-queue.test.ts`.

**Interfaces:** `TranscriptionQueue.load()`, `snapshot()`, `add(request):Promise<string[]>`, `start()`, `pause()`, `cancel(id)`, `retry(id)`, `clearCompleted()`, `shutdown()`, `usesModel(id):boolean`; getters `busy`/`cleanupPending`. `request={sources:SourceRecord[];options:TranscriptionOptions;destination?:string;downloadModel:boolean;start:boolean}`; cada item captura revisão do catálogo, identidade da origem, destino efetivo e opções. Snapshot tem schemaVersion, modo, itens e activeId; resultados parciais são mantidos em itens com falha.

- [ ] Testar serialização, ordenação, compartilhamento de modelo, falha sem bloquear os próximos, cancelamento ativo/pendente, encerramento e retomada:
  ```ts
  assert.equal(maxConcurrentTranscriptions, 1);
  assert.equal(reloaded.snapshot().mode, 'paused');
  assert.equal(reloaded.snapshot().items.find(i => i.id===previousActive)!.status, 'interrupted');
  await reloaded.start(); assert.equal(executedIds.includes(previousActive), false);
  await reloaded.retry(previousActive); assert.equal(retryOffsetMs, 0);
  ```
- [ ] Executar `node --import tsx --test tests/transcription-queue.test.ts tests/queue.test.ts`; observar falha.
- [ ] Implementar worker com dependências das tarefas 3–7, snapshot inicial antes de executar e atualizações serializadas. `load()` nunca inicia modelo/processo. `add()` só instala modelo ausente se `downloadModel=true`; a flag `start` representa uma ação explícita do usuário, não restauração automática. Persistir o estado interrompido antes de expor a fila restaurada. Verificar mudança da origem novamente ao iniciar cada item.
- [ ] Pausar impede o próximo item e deixa o ativo terminar; cancelar espera encerrar e limpar antes do próximo. `retry()` apenas recoloca o item: execução depende da fila em andamento ou de **Continuar fila**. Cancelar/remover item pendente retira sua dependência do modelo. Limpar concluídos não remove saída/modelo/original ou registros de falha parcial.
- [ ] Reexecutar os testes; verificar que `queue.json` e preferências de download permanecem byte a byte intactos.
- [ ] Commit: `feat: persist and schedule a separate transcription queue`.

### Tarefa 9: IPC, encerramento, notificações e atualizações

**Files:** criar `electron/transcription-ipc.ts`, `electron/work-activity.ts`, `tests/transcription-ipc.test.ts`, `tests/work-activity.test.ts`; modificar `shared/types.ts`, `electron/preload.ts`, `electron/main.ts`, `electron/notifications.ts`, `tests/notifications.test.ts`, `tests/desktop.test.mjs`, `tests/updates.test.ts`.

**Interfaces:** acrescentar `VoraAPI.transcriptions` e `VoraAPI.models`, sem alterar os métodos existentes. Transcrições expõem `chooseFiles():Promise<SourceSelection[]>`, `fromDownload(id):Promise<SourceSelection>`, `chooseDirectory():Promise<DestinationSelection|null>`, `add({sourceIds,options,destinationId?,downloadModel,start}):Promise<string[]>`, snapshot, start/pause/cancel/retry/clearCompleted, `openOutput(itemId,format)`, `showOutput(itemId,format)`, `savePreferences(options)` e `onChange(callback):()=>void`. Modelos expõem snapshot, install/cancel/discardPartial/remove/openDirectory e onChange. Argumentos são validados no processo principal. Eventos: `vora:transcriptions` e `vora:models`.

- [ ] Testar ID/caminho/URL/idioma adulterados, origem não confiável, inscrição/remoção de listeners, fechamento simultâneo com as duas filas e instalação de atualização em cada fase:
  ```ts
  await assert.rejects(api.models.install('https://example.test/model'), /modelo/i);
  await assert.rejects(api.transcriptions.openOutput(unknownId,'txt'), /arquivo|item/i);
  assert.equal(activity({modelVerifying:true}).canInstall, false);
  assert.equal(activity({transcriptionQueueMode:'running'}).canInstall, false);
  assert.equal(childRunningAfterConfirmedClose, false);
  ```
- [ ] Executar `node --import tsx --test tests/transcription-ipc.test.ts tests/work-activity.test.ts tests/notifications.test.ts tests/updates.test.ts`; confirmar falha.
- [ ] Conectar serviços em `main.ts`, usando o guard `trusted`/`handle` atual. Seleção local é nativa/múltipla; download usa `completedPath(id)` como origem. Operações de arquivo recebem IDs registrados, não um caminho de shell. Listar a versão fixada do Whisper em `info()` e atualizar a contagem do teste desktop.
- [ ] Centralizar consulta de atividade: download, transcrição, instalação/verificação de modelo, limpeza e modos das filas. `busy` do atualizador observa tudo; preparar atualização pausa filas e confirma ausência de processo anterior. Mudanças dos novos serviços chamam `updates.activityChanged()`.
- [ ] Fechamento mostra uma única confirmação para todo trabalho ativo, pausa downloads de modelos e aguarda `shutdown()`/persistência/árvores de processos de ambas as filas. Cancelar a saída mantém tudo em funcionamento. As notificações de transcrição usam preferência/limite existentes, com título que identifica transcrições e clique que foca o Vora; não mudar o contrato dos avisos de download.
- [ ] Reexecutar o comando, `npm run build` e `npm run test:desktop` no ambiente gráfico suportado; não simular credenciais, URLs de atualização ou caminhos arbitrários para contornar guardas.
- [ ] Commit: `feat: connect transcription services to secure desktop lifecycle`.

### Tarefa 10: Interface aprovada e fluxos reais

**Files:** criar os cinco arquivos `src/` do mapa, `tests/transcription-ui-fixture.mjs`, `tests/transcription-ui.test.mjs`; modificar `src/App.tsx`, `src/QueuePanel.tsx`, `src/QueueItemView.tsx`, `src/queue-client.ts`, `tests/ui-fixture.mjs`, `package.json` (incluir a nova suíte em `test:ui`).

**Interfaces:** `useTranscriptions()` e `useWhisperModels()` retornam snapshot/erro/comandos e removem listeners ao desmontar, com proteção contra resposta inicial atrasada como `useQueue`. `TranscriptionDialog({sources,onClose,onAdded})`; `TranscriptionsPanel({onChooseFiles,onModels})`; `WhisperModelsDialog({onClose})`. `QueuePanel`/`QueueItemView` recebem callback `onTranscribe(id)` para encaminhar ao diálogo, sem acoplar o estado de transcrição ao item de download.

- [ ] Escrever cenários de interface para ambos os caminhos, Small padrão, Medium, zero formatos, download necessário, cancelamento/retomada do modelo, uso protegido, pasta separada e resultado parcial. Conferir acessibilidade e retorno de foco:
  ```js
  await page.getByRole('button',{name:'Transcrever',exact:true}).click();
  await expectDialog('Nova transcrição');
  assert.equal(await page.getByRole('radio',{name:/Small/}).isChecked(), true);
  assert.equal(downloadOptionsAfterChoosingTranscriptDestination, originalDownloadOptions);
  assert.equal(listenerCountAfterUnmount, 0);
  ```
- [ ] Executar `node --test tests/transcription-ui.test.mjs`; confirmar falha com a ponte simulada específica.
- [ ] Implementar abas Downloads/Transcrições, indicação de pendentes, fila própria e diálogos com tokens atuais. No primeiro lote de uma fila vazia, a ação **Adicionar e iniciar** envia `start:true`; em fila já restaurada/pausada, **Adicionar à fila** preserva a pausa e mostra **Continuar fila**. Não iniciar interrompidos junto dos pendentes sem tentativa explícita.
- [ ] Exibir modelos somente em sua área/diálogo de configuração; mostrar tamanho/caminho real e confirmar remoção/discard do parcial via diálogo próprio. O download tem progresso e cancelamento reais. Não usar a simulação/HTML da prévia como componente de produção.
- [ ] Exibir fases reais, cancelamento, falha e arquivos publicados; saída abre com aplicativo padrão, conforme desenho aprovado, em vez do leitor simulado. Para origem sem escrita, pedir outra pasta. Manter footer/ações dos diálogos visíveis e rolar só o conteúdo em janelas baixas; navegação por teclado, foco e movimento reduzido preservados.
- [ ] Executar `npm run build`, `npm run test:ui`, inspecionar capturas em 960×720 e 620×600, incluindo títulos/caminhos longos, diálogo, fila ativa e aba Downloads com transcrição em execução. Os testes UI verificam interação; não contam como teste de Whisper real.
- [ ] Commit: `feat: add transcription workspace and model management ui`.

### Tarefa 11: Integração real, pacotes e documentação

**Files:** criar `tests/transcription.integration.test.mjs`, `scripts/check-packaged-whisper.mjs`; modificar `package.json`, `.github/workflows/packages.yml`, `README.md`, `docs/USAGE.md`, `docs/DEVELOPMENT.md`, `docs/VALIDATION.md`, `CHANGELOG.md` e `THIRD_PARTY.md` se necessário.

**Interfaces:** `npm run test:transcription` roda testes reais apenas com `VORA_TEST_TRANSCRIPTION=1`; ausência de modelo/arquivo retorna skip com motivo explícito, nunca PASS de execução inexistente. Configurar `VORA_TRANSCRIPTION_INPUT`, `VORA_WHISPER_MODELS` e caminho de ferramentas para fixtures locais verificadas. `check-packaged-whisper.mjs <linux|win32>` testa o pacote nativo, sem depender do compilador ou das bibliotecas da árvore de build.

- [ ] Escrever integração usando um vídeo local autorizado e os modelos fixados: duas saídas não vazias, UTF-8, tempos até a duração, offline após instalação, original preservado, arquivos existentes preservados e cancelamento sem processos restantes. Não fixar texto exato como prova de precisão.
  ```js
  assert.equal(await hashFile(input), originalHash);
  assert.ok(segments.every(s => 0 <= s.startMs && s.startMs <= s.endMs && s.endMs <= durationMs));
  assert.equal(await remainingOwnedProcesses(), 0);
  ```
- [ ] Rodar com modelos ausentes para confirmar skip explícito e depois com fixtures reais para confirmar falha inicial das partes ainda não conectadas. Não baixar 2 GB nos testes unitários ou usar `/home/admin/Videos` como fixture obrigatória de CI.
- [ ] Completar o harness e a verificação nativa. O `clovis.mp4` pode ser usado localmente com autorização já dada; incluir amostra adicional com outro idioma, silêncio/ruído e fala na borda de chunk, além de arquivo de pelo menos uma hora para verificar memória/estabilidade. Revisar bordas ouvindo o áudio; distinguir observações humanas de asserções automáticas.
- [ ] Executar uma vez `npm test`, `npm run build`, `npm run test:ui`, `npm run test:media`, `npm run test:updates`, `npm run test:packaging` e `npm run test:desktop`. Rodar a integração real com Small e Medium usando rede desativada para o serviço de teste depois da instalação. Investigar falhas antes de ampliar/repetir a suíte.
- [ ] Gerar pacotes com `npm run dist:linux` e `npm run dist:win` em seus sistemas nativos e executar `check-packaged-whisper.mjs`/teste desktop. A pipeline inclui fonte e ferramentas de build do Whisper, mas os instaladores finais não incluem os pesos nem exigem toolchain. Verificar preservação de modelos/filas em perfil de teste durante atualização e comportamento de **Reiniciar e atualizar**.
- [ ] Documentar uso, local dos modelos, download/remoção/retomada, desempenho sem promessas, fechamento/reinício, erros e limites. Registrar exatamente o que passou, o que foi manual e o que ficou sem validação nativa. Não declarar Windows validado se apenas gerou artefato ou executou mocks; não promover Release com essa lacuna.
- [ ] Commit: `test: validate local transcription packages and document usage`.

## Revisão própria e conclusão

**Auto-revisão do plano realizada nesta etapa:** interface/entradas cobertas pelas tarefas 4/9/10; instalação/armazenamento/versões pelas tarefas 1/2/3; execução longa/recursos pelas tarefas 5/6; nomes/resultados parciais pela tarefa 7; fila/recuperação pela tarefa 8; encerramento/atualizador pela tarefa 9; validação nativa e documentação pela tarefa 11. Foram alinhados os tipos compartilhados e o contexto de chunks do parser, sem acrescentar retomada parcial, GPU, editor ou serviços remotos. Os itens abaixo são a checagem final da futura execução, não testes de aplicativo realizados nesta etapa de planejamento.

- [ ] Conferir que cada requisito do desenho tem tarefa responsável; resolver divergências sem mudar o comportamento aprovado silenciosamente.
- [ ] Conferir que os IDs, formatos e assinaturas usados por fila/IPC/UI são os mesmos e que helpers de teste são locais aos testes, não APIs de produção inventadas para satisfazer a suíte.
- [ ] Conferir os cinco casos de Review Focus nos testes responsáveis, cancelamento em todas as fases e exclusão restrita a temporários comprovados.
- [ ] Revisar o diff completo, rodar verificação de whitespace e confirmar que nenhum modelo grande, mídia pessoal, simulação ou segredo entrou no Git.
- [ ] Fazer a revisão final conforme o método de execução escolhido; corrigir achados antes de declarar a implementação pronta. Documentar limites de validação; entregar commits e instruções de teste, sem publicar Release automaticamente.

**Handoff:** este plano é para revisão antes de implementação. Recomenda-se execução nesta sessão, com revisão independente do conjunto ao final, porque os contratos entre modelo, sessão, fila, IPC e interface são fortemente dependentes. A alternativa é implementar e revisar cada tarefa com agentes separados, com maior custo de contexto. A escolha do método deve ser preservada para a execução.
