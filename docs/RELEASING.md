# Publicação no GitHub

## Preparar o repositório

Autor: **justmatedev**. O endereço do repositório ainda não foi definido. Quando ele existir, adicione `repository`, `homepage` e `bugs` ao `package.json` com os endereços reais e atualize a seção de download do README com o link de Releases.

O código do Vora usa MIT, registrada em `LICENSE`, `package.json` e `package-lock.json`; o aviso é incluído no empacotamento. Não altere as licenças dos componentes de terceiros. Revise as pendências de distribuição pública descritas em [THIRD_PARTY.md](../THIRD_PARTY.md).

Antes do primeiro push, revise os arquivos que serão enviados com `git status` e `git diff --cached`. Não inclua `.env`, credenciais, perfis do aplicativo, binários ou instaladores. O `.gitignore` não remove arquivos já rastreados. As imagens em `docs/images/` são capturas da interface com dados demonstrativos.

O campo `private: true` impede publicação acidental no npm; a visibilidade no GitHub é configurada separadamente. A criação do repositório e o envio não são feitos pelos scripts deste projeto.

## Verificações automáticas

O workflow **Verificações** roda em pushes, pull requests e por acionamento manual. Confere testes do núcleo e build no Linux/Windows, além da interface no Linux. Não consulta o YouTube nem baixa os binários de mídia nesses jobs.

O workflow **Gerar pacotes** é manual, na aba Actions. Ele prepara as ferramentas fixadas, executa os testes do núcleo e gera AppImage no Linux e NSIS no Windows. Os artefatos ficam disponíveis por 14 dias e incluem SHA256SUMS. Não há publicação automática de Releases nem assinatura digital. A primeira execução real dos workflows no GitHub ainda precisa ser validada.

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
