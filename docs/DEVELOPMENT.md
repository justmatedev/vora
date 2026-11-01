# Desenvolvimento

[Voltar ao projeto](../README.md)

Requisitos: Node.js **22.12 ou superior**, npm e ambiente gráfico Linux ou Windows x64. Para preparar os arquivos `.tar.xz` no Linux, instale `tar` com suporte a xz. O usuário final não precisa de Node.js, Python, FFmpeg ou Deno instalados separadamente.

```sh
npm ci
npm run tools:fetch
npm run dev
```

`tools:fetch` baixa os executáveis oficiais de yt-dlp e Deno e o build LGPL de FFmpeg/ffprobe do BtbN. As URLs, versões e checksums estão em `resources/tools.lock.json`; os downloads são verificados antes da instalação. O Electron é preparado por `predev` (ou manualmente com `npm run electron:install`).

A interface usa atualização automática no desenvolvimento. Alterações no processo principal ou preload são recompiladas, mas exigem reiniciar `npm run dev`. `npm run dev:ui` permite inspecionar somente a interface no navegador; análise e download requerem o aplicativo Electron.

## Compilar e empacotar

```sh
npm run build
npm run tools:verify
```

No Linux:

```sh
npm run tools:fetch -- linux
npm run dist:linux
chmod +x release/Vora-0.5.1-linux-x86_64.AppImage
./release/Vora-0.5.1-linux-x86_64.AppImage
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
