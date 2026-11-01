# Testar uma atualização completa sem publicar uma versão

O kit usa **VoraUpdateTest**, separado do Vora: outro nome, identificador, perfil e cache. As versões 0.6.0 e 0.6.1 do kit contêm o mesmo código, com números diferentes para testar o atualizador. Não são releases públicas. O servidor oferece arquivos apenas em `127.0.0.1:47831`.

## Windows

1. Extraia o kit inteiro para uma pasta. Instale o `.exe` da pasta `initial`; o nome instalado será **VoraUpdateTest**. Feche esse aplicativo.
2. Abra `iniciar-servidor.cmd` e mantenha a janela aberta. Ele usa uma cópia separada do runtime do aplicativo, sem exigir Node.js instalado. Se não encontrar a instalação, passe a pasta dela como argumento.
3. Abra **VoraUpdateTest** pelo menu Iniciar. Adicione um link à fila sem iniciar o download e mude uma preferência, como o formato de áudio ou as notificações.
4. Em Configurações, confira a versão 0.6.0 e clique em **Verificar atualização**, se necessário. A consulta deve oferecer 0.6.1 sem baixar automaticamente.
5. Clique em **Baixar atualização**. Ao terminar, clique em **Reiniciar e atualizar**.
6. Confira a reabertura na versão **0.6.1**, com a mesma fila pausada e as preferências preservadas. Consulte novamente: não deve oferecer outra atualização.

Depois, feche o servidor e desinstale somente **VoraUpdateTest**. O Vora normal continua separado. Para repetir o ciclo, desinstale a versão de teste, remova apenas o cache `%LOCALAPPDATA%\vora-update-test-updater` e reinstale o pacote `initial`.

## Linux

1. Dê permissão de execução ao AppImage em `initial`. Execute `sh ./iniciar-servidor.sh` e mantenha esse terminal aberto.
2. Abra o AppImage em `initial` e siga os passos 3–6 acima.
3. O AppImage deve atualizar no **mesmo caminho**, mesmo que seu nome ainda contenha `0.6.0`. A versão exibida dentro do app deve ser 0.6.1.

Sem FUSE, use `APPIMAGE_EXTRACT_AND_RUN=1 ./initial/VoraUpdateTest-0.6.0-linux-x86_64.AppImage`. Para repetir o ciclo, restaure o AppImage inicial a partir do kit original e remova apenas `~/.cache/vora-update-test-updater`.

## Gerar o kit a partir do código

Com as dependências e ferramentas da plataforma preparadas:

```sh
node scripts/build-update-cycle.mjs
```

A saída fica em `release/update-cycle-linux` ou `release/update-cycle-win32`. Distribua `initial`, `updates`, `serve.mjs`, `LEIA-ME.md` e o iniciador do servidor juntos. As pastas `project` e `*-build` são intermediárias e não precisam entrar no kit.

O script modifica somente uma cópia gerada dentro de `release`. O código de produção continua com seu nome, versão e feed público do GitHub. Não edite o provider de produção para executar este teste.

O workflow manual **Kit de teste de atualização**, na aba Actions, gera os kits Linux e Windows como artefatos. No Linux, também executa a substituição e o reinício reais com Playwright e publica relatório e capturas. No Windows, gera os instaladores nativamente; a instalação e o reinício devem ser conferidos pelo roteiro acima.

Para executar a validação automatizada no Linux com uma sessão gráfica disponível:

```sh
node scripts/test-update-cycle.mjs
```

Ela usa cópia do AppImage, perfil e cache temporários. Confere consulta sem download automático, download por clique, SHA-512, substituição no mesmo caminho, reinício real em 0.6.1, fila pausada, preferências e arquivo concluído preservados. Relatório e capturas ficam em `test-results/update-cycle`. A porta de depuração existe somente na cópia gerada para o teste automatizado e não é habilitada pelo iniciador manual.
