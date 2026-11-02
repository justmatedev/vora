# Lançamento 0.6.1

Estado: [Release 0.6.1 publicada](https://github.com/justmatedev/vora/releases/tag/v0.6.1) como estável e mais recente em 1 de novembro de 2026, após confirmação das validações pendentes e autorização do mantenedor.

Código dos pacotes: commit `61f4037`. [CI aprovado](https://github.com/justmatedev/vora/actions/runs/41368236220) e [geração nativa dos pacotes aprovada](https://github.com/justmatedev/vora/actions/runs/41368251616). O AppImage exato do CI passou no teste Electron no Linux; hashes dos artefatos baixados e metadados conferidos.

## Notas de versão

Título: **Vora 0.6.1 — interface refinada e busca adaptativa**.

- Interface mais legível, com contraste aprimorado e ícone refinado.
- Destaque mais claro para o download ativo e para os grupos da fila.
- Busca automática a partir de 10 itens na lista, sem contar o download ativo. Em filas menores, abra pela lupa no cabeçalho.
- A pesquisa permanece aberta durante o uso, mesmo que a fila diminua. Fechar ou pressionar Esc limpa o texto e conserva o filtro escolhido.
- Melhorias no foco pelo teclado, na seleção de vídeo/playlist e nos controles desabilitados.

Atualização a partir da 0.6.0: use **Configurações → Atualizações**, baixe a nova versão e, com a fila pausada e sem trabalho ativo, escolha **Reiniciar e atualizar**. Para versões 0.5.1 ou anteriores, instale manualmente o novo pacote.

As ferramentas de mídia permanecem nas versões fixadas para a 0.6.0. Os materiais de fontes do FFmpeg continuam nos [anexos da versão 0.5.1](https://github.com/justmatedev/vora/releases/tag/v0.5.1); veja [THIRD_PARTY.md](../THIRD_PARTY.md) para origem e hashes. Linux e Windows x64; instalador Windows sem assinatura digital.

## Validação e anexos

Os seis anexos da versão estão publicados: AppImage, instalador NSIS, blockmap Windows, `latest-linux.yml`, `latest.yml` e manifesto único `SHA256SUMS`. Os tamanhos e digests SHA-256 recebidos pelo GitHub conferem com os arquivos locais. Os pacotes e YAMLs foram preservados sem alterações após a geração.

O CI e a geração nativa passaram nas duas plataformas. O AppImage exato do CI passou no teste Electron no Linux. O mantenedor confirmou as validações pendentes de instalação/leitura do ícone no Windows e do ciclo de atualização de 0.6.0 para 0.6.1; os cenários e a edição do Windows não foram detalhados. Consulte [VALIDATION.md](VALIDATION.md) para distinguir os resultados automatizados da confirmação manual.

O README aponta para os instaladores publicados. A versão estável passa a ser oferecida aos usuários pelo atualizador; o download e a instalação continuam dependendo de ações explícitas do usuário.
