# Guia de uso

[Voltar ao projeto](../README.md)

1. Cole o endereço de um vídeo ou Short e clique em **Analisar**.
2. Escolha **Vídeo** ou **Áudio**.
3. Para vídeo, selecione **Compatível** (MP4/H.264/AAC) ou **Original**, e uma resolução disponível. Para áudio, escolha o formato original ou MP3.
4. Escolha a pasta e clique em **Adicionar à fila**.
5. Na seção **Fila**, clique em **Iniciar fila**. Adicionar itens não inicia uma fila pausada.

O layout permanece compacto desde a abertura, com o campo de link no topo e a área da fila ocupando o espaço restante. Sem itens, a fila mostra “Adicione um link para começar”; busca, filtros e controles de execução aparecem quando houver itens. Toda análise individual abre em um modal, inclusive a do primeiro vídeo. Adicionar fecha o modal; cancelar conserva a fila. **Rever opções** reabre os dados já analisados sem nova consulta. Confirmações de adição e duplicatas são compactas, dispensáveis e somem após seis segundos, suspendendo a contagem enquanto houver foco ou mouse sobre o aviso. Erros e avisos que exigem decisão continuam visíveis.

### Vários links e playlists

Use **Adicionar links** para colar um endereço por linha e definir a configuração do grupo. Links com vídeo e playlist oferecem a escolha entre **Somente este vídeo** e **Selecionar vídeos da playlist**. Para revisar playlists, importe uma por vez; você pode adicionar vários grupos à mesma fila.

Na playlist, a consulta é incremental e pode ser cancelada. A revisão tem páginas de 100 itens, seleção individual, **Selecionar todos** e **Limpar seleção**. Entradas identificadas como indisponíveis ficam desabilitadas. Durações ausentes aparecem como “—”. Somente a seleção confirmada entra na fila, na ordem original. Os arquivos ficam diretamente na pasta escolhida, sem numeração ou subpasta automática.

Cada grupo captura formato, qualidade e pasta ao ser adicionado. Alterar as configurações gerais depois não modifica grupos existentes. Use **Editar grupo** na fila para alterar áudio/vídeo, formato, qualidade preferida e pasta dos itens aguardando. O ativo e os itens já finalizados ou interrompidos conservam suas opções. A edição preserva os identificadores e a ordem; não inicia downloads nem altera a pasta padrão do aplicativo. Na fila, **Até 1080p**, por exemplo, limita a resolução a 1080p e permite resoluções menores. Se não houver formato dentro do limite e modo escolhido, o item falha; o Vora não troca silenciosamente MP3 por áudio original, vídeo por áudio ou modo compatível por original.

Os links adicionados carregam título, miniatura, canal e duração em segundo plano, mesmo com a fila pausada. As consultas leves ocorrem uma por vez e não iniciam downloads. Elas dispensam o JavaScript do player e os manifestos de streaming, aceitam metadados sem formatos utilizáveis e usam cache de até 500 vídeos por 10 minutos. A análise completa continua sendo feita na execução. [Opções do extrator yt-dlp](https://github.com/yt-dlp/yt-dlp#extractor-arguments). Dados já obtidos pela análise individual são reaproveitados. Se a prévia falhar, o item permanece pendente com um aviso; a execução consulta os dados novamente. Ao reabrir, pendentes antigos sem prévia também são consultados.

### Acompanhar e localizar itens

O download ativo fica fixo acima da lista, com etapa, progresso, tentativas e cancelamento, inclusive ao recolher a fila ou filtrar os itens. Ele aparece uma única vez. A rolagem fica na lista; modais têm rolagem própria. O botão de informações do ativo mostra título completo, configuração, link e destino.

Os demais itens usam linhas compactas. **Detalhes** mostra título completo, link, pasta e ações secundárias; abrir o arquivo concluído ou tentar novamente continua disponível na linha. Configuração e pasta ficam no cabeçalho do grupo. Grupos intercalados são apresentados em blocos com a indicação **continuação**, mantendo a ordem real da fila.

A busca aceita título, canal ou URL e ignora maiúsculas e acentos. Os filtros são **Todos**, **Aguardando**, **Concluídos** e **Com erro** (somente falhos). Cancelados e interrompidos aparecem em Todos. A busca combina com o filtro e precede a paginação de 100 itens. A troca do download ativo não altera busca, filtro ou página. Essas escolhas visuais não são salvas ao fechar.

Para reordenar, abra os detalhes de um pendente com a busca vazia e o filtro Todos; isso evita mover itens ocultos sem perceber. Editar um grupo altera todos os pendentes desse grupo, inclusive os ocultos pelos filtros, como indicado no modal.

### Novas tentativas e notificações

Falhas temporárias de conexão e respostas HTTP 5xx permitem até três tentativas por item (a inicial e duas novas), com esperas de 5 e 15 segundos. A fila mostra a próxima tentativa e a espera restante; **Cancelar item** interrompe a espera. As tentativas conservam o item, suas opções e sua pasta, consultam os formatos novamente e começam o download desde o início. Falhas de limpeza impedem a repetição e pausam a fila. Ao esgotar as tentativas, o item fica com erro e a fila segue para o próximo.

Vídeos privados/removidos, formatos indisponíveis, recusas de acesso e respostas 403/429 não são repetidos automaticamente. A proteção e a limpeza dos temporários permanecem ativas. **Pausar após o atual** aguarda o item atual, incluindo suas tentativas, e preserva os seguintes. Ao reiniciar durante uma espera, o item volta como **Interrompido**, sem retomada automática. Uma nova tentativa manual inicia outro ciclo de até três tentativas. O yt-dlp também tem repetições internas para requisições e fragmentos.

O Vora envia notificações silenciosas quando a execução da fila termina (com resumo de concluídos, erros e cancelados) ou quando precisa pausar por um problema de pasta, espaço, ferramenta ou limpeza. Não envia um aviso por vídeo nem ao pausar manualmente ou encerrar o aplicativo. O resumo conta os itens executados desde o último início/continuação, incluindo os adicionados durante a execução. Clicar em um aviso traz a janela do aplicativo enquanto ele estiver aberto.

Em **Configurações → Notificações**, é possível desativar os avisos ou enviar um teste. A preferência é persistida. O botão de teste solicita o envio ao sistema; a exibição depende das permissões, do modo Não perturbe e do serviço de notificações do ambiente. No Windows, use o aplicativo instalado com o atalho do menu Iniciar. A integração usa a [API de notificações do Electron](https://www.electronjs.org/docs/latest/tutorial/notifications).

### Controles da fila

- **Iniciar/Continuar fila** aguarda processos registrados de sessões anteriores encerrarem e processa um item por vez; sua análise completa ocorre na vez dele. Você pode adicionar grupos ou consultar playlists durante um download.
- **Pausar após o atual** aguarda o download e o processamento atuais terminarem. **Cancelar item** encerra somente o ativo e permite seguir ao próximo, exceto quando uma pausa já foi solicitada.
- Pendentes podem ser removidos ou movidos para cima/baixo. Falhos, cancelados e interrompidos oferecem uma nova tentativa no mesmo item.
- Uma falha de vídeo/formato segue para o próximo. Falta de espaço, problemas no destino ou ferramentas ausentes pausam a fila para correção.
- Duplicatas dentro de uma importação e duplicatas já aguardando com a mesma configuração e destino são ignoradas, com aviso. Itens concluídos podem ser adicionados novamente, sem sobrescrever seus arquivos.
- **Limpar concluídos** remove apenas os registros da fila. Não apaga arquivos.

A fila fica em `queue.json`, na pasta de dados do aplicativo, com gravação atômica. Ao reabrir, ela sempre volta pausada. Itens que estavam ativos tornam-se **Interrompidos** e exigem **Limpar e tentar novamente**. Essa ação reutiliza o mesmo item; **Continuar fila** sozinho executa somente pendentes. Não há retomada dos bytes já baixados.

No modo original, o aplicativo pode usar MKV para combinar codecs que não cabem juntos em MP4 ou WebM. Não há aumento artificial de resolução ou conversão de vídeo. O áudio MP3 é convertido em qualidade variável alta; isso não melhora a fonte.

O Vora lembra a última escolha de áudio/vídeo, os formatos e a resolução/FPS preferidos. Na prévia de um vídeo individual, uma qualidade alternativa pode ser selecionada quando a preferida não estiver disponível, sem apagar a preferência; você pode revisar essa escolha antes de adicioná-la à fila. A pasta continua sendo lembrada. Configurações da versão 0.1 são migradas automaticamente.

Durante o download, apenas a barra da faixa ativa é exibida, com ícone, “Baixando vídeo” ou “Baixando áudio” e percentual na mesma linha. Ao mudar de faixa, a barra passa a representar o novo download. Faixas aguardando ou já concluídas não ocupam espaço no painel. Vídeos já combinados mostram uma única faixa “Vídeo com áudio”. Conversão e junção usam uma etapa própria, sem percentual inventado.

Ao concluir, o Vora mostra o tamanho real, o formato e o caminho do arquivo. As ações **Abrir arquivo**, **Mostrar na pasta** e **Copiar caminho** de cada item usam seu próprio arquivo concluído, mesmo que a pasta padrão seja alterada depois. Se ele for movido ou removido, o aplicativo informa isso.

Arquivos existentes são preservados: o novo arquivo recebe um sufixo numérico. Temporários ficam em uma subpasta `.vora-*` no destino e são removidos após sucesso, falha ou cancelamento. Se o aplicativo for interrompido, o próximo início oferece uma revisão dos temporários registrados: limpar ou limpar e baixar novamente, desde o começo. Isso não retoma os bytes já baixados.

O registro de recuperação fica em `recoveries.json` na pasta de dados do Vora e cobre downloads em diferentes destinos. A limpeza verifica o marcador de propriedade de cada pasta, recusa symlinks e não apaga arquivos finais. Se um processo anterior ainda estiver ativo, a limpeza fica bloqueada até ele encerrar; o painel atualiza esse estado automaticamente. Falhas na limpeza são informadas e conservam o registro para tentar depois.

Pastas antigas sem registro, inclusive temporários deixados pela versão 0.1, não são removidas automaticamente. A recuperação é aplicada aos downloads criados por esta versão.

Configurações e versões das ferramentas ficam no botão de ajustes. A última pasta é persistida em `settings.json` na pasta de dados do aplicativo do sistema. O Vora consulta o YouTube diretamente; não usa servidor próprio.

## Atualização do Vora (a partir de 0.6.0)

O aplicativo verifica novas versões dez segundos após abrir. Em Configurações → Atualizações, você também pode verificar manualmente. São consultadas apenas versões estáveis publicadas no repositório do Vora; rascunhos e pré-lançamentos não são oferecidos. Falhas nessa consulta não interrompem os downloads da fila.

Ao encontrar uma versão, o Vora avisa no topo. Abra as configurações para ler as mudanças e escolher Baixar atualização. O progresso aparece no painel, e você pode fechá-lo enquanto o download continua. Baixar não instala e fechar normalmente o aplicativo também não instala.

Quando estiver pronta, pause a fila, aguarde o item ativo e outras operações terminarem e clique em Reiniciar e atualizar. A fila pendente e suas configurações são salvas. No Windows, o instalador pode solicitar permissão do sistema conforme o tipo de instalação. No Linux, o AppImage é substituído no mesmo caminho, preservando atalhos; a cópia é preparada ao lado do arquivo antes da substituição. Se a pasta não permitir gravação, use Ver versões no GitHub e faça a troca manual.

O recurso funciona no aplicativo empacotado: instalador NSIS no Windows e AppImage no Linux. Em npm run dev e na pasta Linux descompactada, utilize a página de versões. Quem está na versão 0.5.1 precisa instalar manualmente a primeira versão com esse recurso. A atualização não altera os arquivos de mídia já salvos.
