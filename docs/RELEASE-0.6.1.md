# Preparação do lançamento 0.6.1

Estado: rascunho da 0.6.1 criado no GitHub; publicação pendente das validações manuais descritas abaixo. A versão estável anunciada no README continua sendo 0.6.0 até a publicação da nova Release.

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

Os seis anexos da versão já estão no rascunho, e os tamanhos e digests SHA-256 recebidos pelo GitHub conferem com os arquivos locais. Os pacotes validados foram preservados sem alterações após a geração.

Consulte [VALIDATION.md](VALIDATION.md) para os resultados efetivamente obtidos. A publicação depende de:

- Checks do código e build aprovados no Linux e Windows, além dos testes de interface no Linux.
- Pacotes gerados com dependências, runtime embutido, canal e metadados conferidos.
- Teste nativo do AppImage e do instalador NSIS, incluindo a leitura do ícone no Windows.
- Ciclo de atualização da versão 0.6.0 para 0.6.1 validado sem perda da fila e das preferências.
- Rascunho com AppImage, instalador, blockmaps gerados, `latest-linux.yml`, `latest.yml` e manifesto único `SHA256SUMS`, todos da mesma geração validada.

Não reúna pacotes de versões anteriores no manifesto. Os YAMLs precisam permanecer idênticos aos gerados para os instaladores anexados.

Após concluir a validação, registre os resultados, publique a Release e atualize os links de download e o estado do lançamento no README. A publicação da versão estável passa a oferecê-la aos usuários pelo atualizador.
