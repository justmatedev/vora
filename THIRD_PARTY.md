# Ferramentas e recursos de terceiros

O Vora executa as ferramentas abaixo como processos separados. Os arquivos de licença e o manifesto SHA-256 são incluídos em `resources/tools/<plataforma>/licenses` e no aplicativo empacotado. As versões exatas e URLs estão em `resources/tools.lock.json` e `manifest.json`.

| Componente                 | Origem                                 | Licença / informações                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| yt-dlp standalone, com EJS | https://github.com/yt-dlp/yt-dlp       | Código principal Unlicense; a distribuição PyInstaller também contém componentes de terceiros. Consulte https://github.com/yt-dlp/yt-dlp#license e os avisos do release.                                                                                                                                                                                       |
| FFmpeg e ffprobe           | https://github.com/BtbN/FFmpeg-Builds  | Builds **LGPL**, sem bibliotecas GPL/não livres. O build incluído usa **LGPL-3.0-or-later** (`--enable-version3`), conforme LICENSE.txt do arquivo BtbN. As bibliotecas habilitadas têm suas próprias licenças; configuração exibida por `ffmpeg -version`. Fonte upstream: https://github.com/FFmpeg/FFmpeg; receitas: https://github.com/BtbN/FFmpeg-Builds. |
| Electron, Node.js e V8     | https://github.com/electron/electron   | MIT e avisos Chromium/Node fornecidos pelo empacotamento do Electron.                                                                                                                                                                                                                                                                                          |
| React                      | https://github.com/facebook/react      | MIT                                                                                                                                                                                                                                                                                                                                                            |
| Inter                      | https://github.com/rsms/inter          | SIL Open Font License 1.1; fontes locais via @fontsource/inter.                                                                                                                                                                                                                                                                                                |
| Lucide                     | https://github.com/lucide-icons/lucide | ISC                                                                                                                                                                                                                                                                                                                                                            |

Os binários são obtidos de releases fixos e têm seus hashes conferidos antes da extração. O pacote não baixa código de processamento durante o uso. Atualizações de yt-dlp e EJS são feitas juntas, substituindo a distribuição standalone.

Os builds datados do BtbN têm retenção limitada. Se um asset for removido, atualize deliberadamente URL, versão e SHA-256 em `tools.lock.json`; o preparador falha em vez de substituir a versão silenciosamente. Os materiais das versões distribuídas devem ser preservados junto das Releases, mesmo quando um asset upstream expirar.

## Avisos incluídos no build

`npm run build` prepara `dist-notices/`, incluída como `resources/licenses` no aplicativo. Contém as licenças de React, React DOM, scheduler, Lucide e Inter das versões instaladas pelo lockfile, com manifesto. O Electron fornece seus próprios arquivos LICENSE e LICENSES.chromium.html no pacote.

Os textos LGPLv3/GPLv3 e o aviso agregado `THIRD_PARTY_LICENSES.txt` do yt-dlp 2026.10.26 estão em `resources/notices/`, com URLs fixas e SHA-256 em `sources.json`. A preparação das ferramentas também os copia para `tools/licenses/`. A licença Unlicense do núcleo yt-dlp sozinha não descreve todas as dependências do standalone.

## Runtime JavaScript

O yt-dlp usa o **Node.js incluído no Electron**, apontado por caminho absoluto. O Vora configura `ELECTRON_RUN_AS_NODE=1` somente no ambiente dos subprocessos das ferramentas; não altera o processo principal nem habilita Node na interface. A seleção desativa a descoberta de outros runtimes antes de registrar o Node explícito. EJS continua incluído no yt-dlp standalone, sem download de componentes durante o uso.

Deno não é mais baixado nem distribuído nos novos pacotes. Seus avisos não fazem parte dos novos instaladores. As licenças do Node.js e V8 acompanham o Electron nos arquivos LICENSE e LICENSES.chromium.html fornecidos pelo empacotamento. Referências: [runtimes aceitos pelo yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/EJS#node) e [modo Node do Electron](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node).

## Fontes correspondentes do FFmpeg

Os materiais foram recuperados da [execução oficial BtbN de 31/10/2026](https://github.com/BtbN/FFmpeg-Builds/actions/runs/41199749965), incluindo seu artefato `download-cache` (ID 13042311561), além da fonte do FFmpeg na revisão **8dca1586f468bfcbb78ae3ed618af1361d9f140a**. As receitas são da revisão **5031c6f1082414e53688d39e521849905071070d**. Os logs preservam as configurações exatas das variantes Linux x64 e Windows x64 LGPL 8.1.

O arquivo `resources/notices/FFmpeg-SOURCES.json`, também incluído no aplicativo, registra a proveniência, os checksums do cache, de cada um dos 129 arquivos de fontes de dependências e dos avisos coletados. `FFmpeg-THIRD_PARTY_NOTICES.txt` acompanha os binários. Algumas bibliotecas guardam suas permissões em cabeçalhos de código; esses avisos foram preservados também.

Os materiais acompanham a [Release 0.5.1](https://github.com/justmatedev/vora/releases) como arquivos separados:

- `Vora-0.5.1-ffmpeg-source.tar.gz`: fonte da revisão exata do FFmpeg.
- `Vora-0.5.1-ffmpeg-build-materials.tar.gz`: receitas, logs, manifestos, avisos e instruções de reconstrução, com patch para fixar a revisão do FFmpeg.
- `Vora-0.5.1-ffmpeg-dependency-sources.tar.gz.part01`, `part02` e `part03`: cache original de fontes dividido para caber nos assets do GitHub. É necessário reunir as três partes, na ordem numérica, antes de extrair.
- `SOURCES-SHA256SUMS`: checksums dos materiais acima.

O cache original é amplo e inclui componentes de variantes opcionais que **não estão ligados aos nossos binários**. A presença de seus avisos no conjunto não muda a licença MIT do Vora nem significa que o FFmpeg distribuído usa a variante GPL. A linha configure original não habilita `--enable-gpl` ou `--enable-nonfree`.

Esses arquivos não aumentam o tamanho do instalador: são materiais de desenvolvimento separados. Os textos e manifestos de avisos são incluídos no aplicativo. Enquanto a Release estiver em rascunho, seus anexos dependem de acesso de mantenedor; após publicada, as fontes e os binários estarão disponíveis juntos.

A geração dos materiais é descrita em [docs/RELEASING.md](docs/RELEASING.md). Esta organização registra os materiais verificados; não promete reprodução binária bit a bit. Referência: [orientações do FFmpeg](https://ffmpeg.org/legal.html).
