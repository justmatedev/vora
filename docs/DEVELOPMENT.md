# Desenvolvimento

[Voltar ao projeto](../README.md)

Requisitos: Node.js **22.12 ou superior**, npm e ambiente gráfico Linux ou Windows x64. Para preparar os arquivos `.tar.xz` no Linux, instale `tar` com suporte a xz. O usuário final não precisa de Node.js, Python ou FFmpeg instalados separadamente.

```sh
npm ci
npm run tools:fetch
npm run dev
```

`tools:fetch` baixa os executável oficial de yt-dlp e o build LGPL de FFmpeg/ffprobe do BtbN. As URLs, versões e checksums estão em `resources/tools.lock.json`; os downloads são verificados antes da instalação. O Electron é preparado por `predev` (ou manualmente com `npm run electron:install`).

A interface usa atualização automática no desenvolvimento. Alterações no processo principal ou preload são recompiladas, mas exigem reiniciar `npm run dev`. `npm run dev:ui` permite inspecionar somente a interface no navegador; análise e download requerem o aplicativo Electron.

## Compilar e empacotar

O motor de transcrição usa whisper.cpp **1.8.2** compilado no sistema nativo x64. Para `tools:fetch`, o ambiente de desenvolvimento precisa também de CMake 3.25+ e compilador C/C++ (GCC/Clang no Linux, Visual Studio Build Tools 2022 com C++ no Windows). A variável `CMAKE` permite indicar o executável. Esses requisitos são somente do build; o usuário final recebe o motor com suas bibliotecas, sem Python ou compilador. Os pesos Small/Medium não entram no instalador e são obtidos apenas quando solicitados no aplicativo.

`node scripts/prepare-whisper.mjs linux` (ou `win32` no Windows) prepara apenas o motor. `node scripts/verify-whisper.mjs linux` confere seu manifesto. O build usa variantes de CPU, sem `-march=native`, GPU, OpenMP externo ou download de modelos pelo próprio motor. Fonte e checksum estão em `resources/whisper.lock.json`.

```sh
npm run build
npm run tools:verify
```

No Linux:

```sh
npm run tools:fetch -- linux
npm run dist:linux
chmod +x release/Vora-0.6.1-linux-x86_64.AppImage
./release/Vora-0.6.1-linux-x86_64.AppImage
```

O AppImage depende das bibliotecas de desktop do sistema e, conforme a distribuição, de FUSE. É possível executar com `--appimage-extract-and-run` quando FUSE não estiver disponível. O build FFmpeg Linux escolhido exige glibc compatível com o build upstream. Valide no Linux de destino.

No Windows (PowerShell):

```powershell
npm ci
npm run tools:fetch -- win32
npm run dist:win
```

O instalador NSIS fica em `release/`, permite escolher a pasta e inclui todas as ferramentas. A versão pessoal não usa certificado de assinatura. Execute o empacotamento e a validação nativa no Windows antes de considerar esse pacote validado nesse sistema.

`tools:fetch -- linux` e `tools:fetch -- win32` permitem preparar cada arquitetura. Os builds datados do BtbN podem ser removidos após o prazo de retenção: nesses casos, atualize deliberadamente o lock com uma versão e checksum novos. Não use URLs mutáveis de `latest` no lock.

## Testes

```sh
npm test                 # fila, playlists, formatos, preferências, recuperação, progresso e subprocessos
npm run build
npx playwright install chromium
npm run test:ui          # fluxos da interface com ponte simulada, sem acessar o YouTube
npm run test:media       # executáveis reais: fila, playlist local, MP3 e preservação de codecs
npm run test:updates     # atualizador real com feed HTTP local e checksum inválido
npm run test:packaging   # dependências do pacote e servidor local do kit, sem downloads externos
npm run test:desktop     # Electron real, protocolo local, IPC e ferramentas
```

Para usar um Chromium já instalado, defina `VORA_TEST_BROWSER` com o caminho do executável antes de `test:ui`. Para validar a pasta empacotada, defina `VORA_TEST_PACKAGED` com o caminho de `release/linux-unpacked/vora` (ou do executável Windows) antes de `test:desktop`. O teste desktop usa perfil temporário e desativa o sandbox Chromium **somente na instância de teste** para compatibilidade com ambientes automatizados.

Os testes de interface não substituem um teste real de download. Para validação manual, use um vídeo autorizado e confira: vídeo compatível, vídeo original, MP3, áudio original, falha de rede, destino sem permissão, cancelamento durante download/processamento e confirmação de fechamento. Repita no pacote de cada sistema.

## Estrutura e segurança

- `src/`: React, estilos, fontes locais e interface.
- `shared/`: tipos da ponte e eventos de trabalho.
- `electron/`: janela, preload, validação de formatos, subprocessos, publicação de arquivos e IPC.
- `scripts/`: desenvolvimento, build, preparação e verificação dos binários.
- `tests/`: testes do núcleo, interface, ferramentas e aplicativo desktop.

A interface não tem acesso ao Node.js. O preload expõe apenas operações específicas, com origem e frame verificados no processo principal. Os processos externos são executados sem shell e os IDs de formato são conferidos contra a análise do próprio item, realizada antes da execução. O aplicativo empacotado usa protocolo local próprio e CSP. Não são carregados módulos JavaScript remotos durante o uso.

O YouTube pode alterar formatos, exigir autenticação ou recusar solicitações. O aplicativo informa essas falhas; não promete disponibilidade permanente. Atualize yt-dlp com sua distribuição EJS e teste novamente quando necessário.

## Runtime do yt-dlp

O runtime JavaScript é o Node.js já incluído no Electron. O aplicativo passa o caminho absoluto de seu próprio executável ao yt-dlp e define `ELECTRON_RUN_AS_NODE=1` somente para esses subprocessos. Não depende de Node ou Deno instalados no sistema. O teste Electron verifica a detecção do runtime pelo yt-dlp real.

## Atualizador

A integração usa electron-updater 6.8.12 com provider GitHub fixado em justmatedev/vora. autoDownload e autoInstallOnAppQuit são false; prereleases e downgrades também ficam desabilitados. A ponte não recebe URLs de feed ou caminhos de instalador da interface. Em desenvolvimento, o atualizador fica indisponível, sem forçar configurações de produção.

UpdateManager é testado com adaptador controlado. `npm run test:updates` usa o downloader e a verificação SHA-512 reais com servidor local e payloads de teste; não instala o aplicativo do usuário. No Linux, a substituição preserva o nome do AppImage e prepara uma cópia no mesmo diretório antes do rename. O workflow de pacotes confere os metadados e o canal embutido em cada sistema.

O ciclo completo com instalador/reinício deve ser validado em ambiente nativo antes de promover uma versão: os testes de servidor local não equivalem à execução de um instalador NSIS real ou ao reinício de um AppImage real.

### Teste opcional de Reels públicos

`npm run test:instagram` fica ignorado por padrão. Para executar o teste de rede dos três Reels de referência, use `VORA_TEST_INSTAGRAM=1 npm run test:instagram` (no PowerShell, defina `$env:VORA_TEST_INSTAGRAM="1"` antes do comando). Ele usa os serviços de metadados, fila, download e recuperação reais, baixa vídeo original, áudio original e MP3 e verifica os nove arquivos com ffprobe e decodificação FFmpeg. Não importa cookies nem usa login. O conteúdo temporário é removido ao terminar; `VORA_KEEP_INSTAGRAM_TEST=1` preserva os resultados para inspeção. A disponibilidade depende do Instagram e não faz parte da suíte offline.

## Integração real de transcrição

```sh
npm run test:transcription  # skip explícito: não baixa modelos
VORA_TEST_TRANSCRIPTION=1 \
VORA_TRANSCRIPTION_INPUT=/caminho/amostra.wav \
VORA_WHISPER_MODELS=/caminho/pesos \
npm run test:transcription
node scripts/check-packaged-whisper.mjs linux
```

A pasta de pesos deve conter `ggml-small.bin` e `ggml-medium.bin` da revisão fixada em `shared/whisper-models.ts`. Os hashes são verificados pelo serviço real. `VORA_TRANSCRIPTION_MODELS=small` restringe o ensaio; `VORA_TRANSCRIPTION_TOOLS` aponta a pasta com FFmpeg, ffprobe e o subdiretório `whisper`. Sem opt-in ou fixtures, o resultado é **skip**, sem alegar execução do motor. Use somente mídia autorizada. Os resultados e perfis temporários ficam em `.cache` e são removidos ao fim.

O teste percorre inspeção, modelo, sessão, preparação de áudio, motor nativo, fila, publicação e recuperação; inclui também o fluxo pelo Electron real, substituindo somente a seleção no diálogo nativo; bloqueia HTTP no serviço depois da instalação. Confere UTF-8, limites dos tempos, preservação do original/resultados e cancelamento sem processos próprios. Não mede precisão por igualdade de texto. A interface tem testes separados com a ponte simulada; o teste desktop usa Electron real e IPC isolado.

`check-packaged-whisper.mjs` confere o manifesto e executa uma cópia das bibliotecas/CLI do pacote fora das árvores de build e instalação, sem caminhos de compilador. O workflow de pacotes executa essa checagem nativamente em Linux e Windows. O ensaio real de reconhecimento exige os pesos opcionais; `--help` sozinho só verifica inicialização do runtime.
