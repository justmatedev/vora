# Publicação no GitHub

## Preparar o repositório

Autor: **justmatedev**. Repositório: [justmatedev/vora](https://github.com/justmatedev/vora). Os campos `repository`, `homepage` e `bugs` do `package.json` apontam para esse endereço. Os instaladores serão disponibilizados em [Releases](https://github.com/justmatedev/vora/releases).

O código do Vora usa MIT, registrada em `LICENSE`, `package.json` e `package-lock.json`; o aviso é incluído no empacotamento. Não altere as licenças dos componentes de terceiros. Revise as pendências de distribuição pública descritas em [THIRD_PARTY.md](../THIRD_PARTY.md).

Antes de cada push, revise os arquivos que serão enviados com `git status` e `git diff --cached`. Não inclua `.env`, credenciais, perfis do aplicativo, binários ou instaladores. O `.gitignore` não remove arquivos já rastreados. As imagens em `docs/images/` são capturas da interface com dados demonstrativos.

O campo `private: true` impede publicação acidental no npm; a visibilidade no GitHub é configurada separadamente. A criação do repositório e o envio não são feitos pelos scripts deste projeto.

## Verificações automáticas

O workflow **Verificações** roda em pushes, pull requests e por acionamento manual. Confere testes do núcleo e build no Linux/Windows, além da interface no Linux. Não consulta o YouTube nem baixa os binários de mídia nesses jobs.

O workflow **Gerar pacotes** é manual, na aba Actions. Após empacotar, verifica no sistema nativo se o yt-dlp reconhece o Node do aplicativo e se Deno está ausente. Ele prepara as ferramentas fixadas, executa os testes do núcleo e gera AppImage no Linux e NSIS no Windows. Os artefatos ficam disponíveis por 14 dias e incluem SHA256SUMS. Não há publicação automática de Releases nem assinatura digital. A geração automatizada de Linux e Windows passou na [execução 41352682628](https://github.com/justmatedev/vora/actions/runs/41352682628), no commit `b8523ff`. A execução gera artefatos de teste; a publicação continua condicionada às pendências de THIRD_PARTY.md e à validação dos aplicativos.

O CI do commit `b8523ff` passou nos três jobs: núcleo/build Linux, núcleo/build Windows e interface Linux. [Registro da execução](https://github.com/justmatedev/vora/actions/runs/41352683014). Isso não inclui teste do instalador Windows ou dos binários de mídia.

Os workflows seguem a [documentação de CI Node.js do GitHub](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs). Uma geração bem-sucedida não substitui teste manual do aplicativo instalado.

## Preparar uma versão

1. Atualize a versão no `package.json` e no `package-lock.json`, o CHANGELOG e as referências aos nomes dos pacotes na documentação.
2. Rode os testes do núcleo, build, interface, ferramentas reais e Electron conforme [DEVELOPMENT.md](DEVELOPMENT.md).
3. Gere os pacotes pelo workflow manual ou pelos comandos locais documentados.
4. Teste o AppImage e o instalador em sistemas nativos. Registre cada plataforma separadamente em [VALIDATION.md](VALIDATION.md); marque como pendente o que não foi verificado.
5. Confira os avisos e fontes correspondentes dos componentes distribuídos conforme registrado em THIRD_PARTY.md.
6. Gere os checksums localmente com `node scripts/release-checksums.mjs`. O script inclui todos os pacotes presentes em `release/`; publique apenas os da versão escolhida. Para juntar artefatos dos dois jobs, reúna os pacotes e gere um novo manifesto único.
7. Crie uma tag como `v0.5.1` para o commit validado e uma Release no GitHub, com notas de versão, AppImage, instalador e SHA256SUMS. Use rascunho enquanto a revisão estiver pendente.

As versões dos binários estão em `resources/tools.lock.json`. Os assets datados do FFmpeg podem expirar; uma falha no download exige atualização deliberada de versão, URL e checksum, sem substituição silenciosa por `latest`.

## Preservar as fontes do FFmpeg

Os materiais da versão 0.5.1 foram reunidos da execução oficial BtbN `41199749965`, artefato `download-cache` ID `13042311561`, receitas `5031c6f1082414e53688d39e521849905071070d` e FFmpeg `8dca1586f468bfcbb78ae3ed618af1361d9f140a`. Os logs dos jobs `124536872122` (Linux) e `124536872118` (Windows) registram a configuração original.

Para uma manutenção futura, baixe esses materiais pela API do GitHub/gh e execute `scripts/prepare-ffmpeg-sources.py` com os argumentos `--cache`, `--recipes`, `--ffmpeg-source`, `--linux-log`, `--windows-log` e `--output`. Essa ferramenta de manutenção requer Python 3.12 ou superior; o aplicativo e o build normal não requerem Python. O script lê os arquivos como dados e gera o inventário, avisos e partes do cache, sem executar o código baixado.

Preserve os arquivos de fonte na Release, separados dos instaladores, junto com `SOURCES-SHA256SUMS`. As instruções de reunião das partes e reconstrução estão no README do arquivo `Vora-0.5.1-ffmpeg-build-materials.tar.gz`. Atualizações de FFmpeg exigem repetir a coleta para a nova revisão e atualizar os manifestos e avisos. As fontes da versão anterior devem continuar disponíveis para quem recebeu seus binários.
