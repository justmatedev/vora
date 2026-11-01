# Runtime embutido e fontes correspondentes — 1 de novembro de 2026

- Com autorização do mantenedor, Deno separado substituído pelo Node.js incluído no Electron. O runtime é passado ao yt-dlp por caminho absoluto; ELECTRON_RUN_AS_NODE é aplicado apenas ao ambiente dos subprocessos. Node continua desabilitado na interface.
- 75 testes do núcleo passaram no Linux, incluindo seleção explícita do runtime, caminho com espaços e isolamento do ambiente. Quatro testes com ferramentas reais e um teste Electron passaram. O teste Electron também confirma que o yt-dlp reconhece o Node do próprio aplicativo.
- Análise online real de Big Buck Bunny (aqz-KE-bpKQ) usando o Node do Electron retornou sete opções compatíveis, dez originais e áudio disponível. Nenhum arquivo desse vídeo foi baixado nesta consulta.
- Fontes FFmpeg da revisão 8dca1586f468bfcbb78ae3ed618af1361d9f140a e receitas 5031c6f1082414e53688d39e521849905071070d preservadas, com logs das variantes originais e cache oficial contendo 129 arquivos de dependências. Avisos coletados também de cabeçalhos quando não havia LICENSE separado. Manifestos registram origem e SHA-256.
- Fontes preparadas para anexação ao rascunho em cinco arquivos mais SOURCES-SHA256SUMS. Os materiais de desenvolvimento são separados dos instaladores. O cache inclui variantes opcionais não usadas nos nossos binários.
- Workflow de pacotes ampliado para verificar Node/yt-dlp no pacote de cada sistema e ausência de Deno. Nova geração dos pacotes e validação do AppImage em andamento; teste manual do instalador Windows continua pendente.

---

# Preparação dos pacotes para Release — 1 de novembro de 2026

- Ajustes de URL e documentação enviados no commit `fdef5a5`.
- 74 testes do núcleo e quatro testes com ferramentas reais passaram no Linux. Corrigida a sincronização dos testes de recuperação: aguardar o processo iniciar efetivamente e evitar duas sessões simuladas gravando o mesmo journal. Falhas intermitentes do CI anterior foram investigadas; os três jobs do CI corrigido passaram no commit `b8523ff` (execução 41352683014).
- Primeiro workflow de pacotes revelou conversão de quebras de linha dos avisos no Windows e publicação implícita do electron-builder no CI. Adicionados .gitattributes para preservar os bytes e `--publish never` nos comandos de empacotamento.
- Build passou com preparo dos avisos de React, React DOM, scheduler, Lucide e Inter. Licenças e manifesto adicionados aos recursos do aplicativo.
- Avisos agregados do yt-dlp e textos LGPLv3/GPLv3 fixados em resources/notices, com origem e SHA-256. Ferramentas de Linux e Windows passaram na verificação local com os novos avisos.
- Corrigida a identificação do build FFmpeg: LGPLv3, conforme configuração `--enable-version3` e LICENSE.txt do asset.
- AppImage Linux e instalador Windows gerados com sucesso no GitHub Actions, execução 41352682628, commit `b8523ff`. Checksums dos dois artefatos conferidos e reunidos em manifesto único.
- O AppImage exato gerado no CI passou no teste real de Electron (inicialização, IPC, restauração e ferramentas). Conteúdo conferido: MIT, avisos das cinco bibliotecas, três textos fixados e avisos Chromium. Isso não representa uma nova rodada completa de downloads online.
- Release v0.5.1 preparada como rascunho com artefatos de teste, sem publicação pública.
- Permanecem pendentes os materiais listados em THIRD_PARTY.md e a validação nativa Windows do pacote novo. Preparar artefatos de teste não significa publicar uma Release validada.

---

# Repositório GitHub — 1 de novembro de 2026

- Repositório publicado em https://github.com/justmatedev/vora, com branch main. Primeiro commit: `fa69509`.
- CI inicial aprovado: núcleo e build no Ubuntu 24.04 e Windows 2022, além de interface no Linux. [Execução](https://github.com/justmatedev/vora/actions/runs/41351613421).
- Metadados do pacote, links do README, instruções de clone e badge do CI atualizados com a URL real.
- Ainda sem Release ou nova geração de instaladores. Permanecem pendentes os materiais de terceiros para distribuição e a validação nativa do instalador Windows atual. O sucesso do CI não substitui essa validação.

---

# Preparação do repositório — após 0.5.1

- Autoria definida como justmatedev; código do Vora sob MIT, com LICENSE incluído nos próximos empacotamentos. Componentes de terceiros conservam suas licenças e pendências de distribuição.
- README reorganizado, guias separados, capturas demonstrativas versionáveis, histórico e modelos de contribuição adicionados.
- Na preparação inicial, workflows e links locais foram verificados. O resultado remoto posterior está registrado acima.
- 74 testes do núcleo e build/TypeScript passaram no Linux. O gerador de checksums foi verificado com dois arquivos de teste em diretório temporário.
- Nenhuma mudança na interface ou no executor. Os pacotes 0.5.1 existentes não foram regenerados nesta etapa.
- Na preparação inicial, ainda não havia repositório remoto ou Git local utilizável neste ambiente. A publicação posterior está registrada acima.

---

# Validação da versão 0.5.1

- Layout compacto permanente: o campo de link e a área da fila mantêm suas posições desde a abertura, com ou sem itens. A tela vazia mostra “Adicione um link para começar” e orientação para vídeos e playlists.
- Todas as análises individuais abrem em modal, inclusive a primeira. Cancelar conserva a fila vazia, e Rever opções reaproveita os dados já consultados. Busca, filtros e controles de execução aparecem somente com itens.
- 74 testes do núcleo passaram. Quatro testes de interface passaram. Incluem cancelamento da primeira análise, reabertura sem nova consulta, adição, retorno à fila vazia após limpar concluídos sem deslocar o campo, fila grande, filtros, download ativo e avisos temporários.
- Electron real validou a nova abertura e a restauração da fila, incluindo o aplicativo Linux empacotado. Build e TypeScript passaram.
- AppImage Linux e instalador Windows NSIS 0.5.1 gerados. Checksums atualizados em `release/SHA256SUMS`.
- Captura da tela inicial: `test-results/vora-inicio-compacto.png`.
- A validação nativa desta versão no Windows permanece pendente. Nenhuma mudança no executor, na ponte IPC ou nos dados persistidos.

---

# Validação da versão 0.5.0

- Interface centrada na fila: topo compacto quando há itens, ativo fixo e exibido uma única vez, rolagem restrita à lista e análise individual em modal. A tela vazia mantém a apresentação.
- Linhas compactas, detalhes por identificador, configuração/pasta no cabeçalho do grupo e marcação de continuação em grupos intercalados, preservando a ordem real. Detalhes do ativo mostram título completo, configuração, URL e destino.
- Busca por título, canal ou URL, sem distinção de caixa/acentos, combinada com Todos/Aguardando/Concluídos/Com erro. Paginação de 100 após filtrar. Mudanças do ativo não resetam página, busca ou recolhimento da lista. Reordenação bloqueada com busca ou filtro parcial.
- Confirmações de adição/duplicatas com seis segundos de duração, dispensáveis e com temporizador suspenso por foco ou mouse. Erros e recuperação permanecem visíveis.
- 74 testes do núcleo passaram, incluindo quatro testes dos cálculos de busca, grupos, filtros e paginação. Quatro testes de interface passaram, incluindo fila de 206 itens, troca do ativo fora da página, modal com download em andamento, arquivos por item, edição de grupos filtrados e temporizador controlado.
- Janela mínima de 800 × 600, 960 × 720 e área útil de 800 × 572 verificadas sem rolagem horizontal ou rolagem da página. Cancelamento do ativo permaneceu visível; recuperação e erro de link também foram exercitados junto ao download ativo.
- Quatro testes com ferramentas reais passaram: fila sequencial, playlist local, vídeo/áudio, MP3, mux e codecs. Nenhuma mudança no executor, na ponte IPC ou nos dados persistidos foi necessária.
- Electron real validou a inicialização, IPC e restauração da fila no novo layout. O aplicativo Linux empacotado também passou nessa verificação.
- AppImage Linux e instalador Windows NSIS 0.5.0 gerados. Checksums em `release/SHA256SUMS`.
- Capturas: `test-results/vora-fila-compacta-800.png`, `test-results/vora-fila-compacta-960.png`, `test-results/vora-analise-modal.png` e `test-results/vora-editar-grupo.png`.
- A validação nativa desta versão no Windows permanece pendente. Esta rodada não realizou novos downloads online.

---

# Validação da versão 0.4.0

- Novas tentativas automáticas para falhas transitórias de rede/HTTP 5xx: três tentativas por ciclo, com esperas de 5 e 15 segundos. A consulta de formatos é refeita e os temporários do próprio item são limpos antes de repetir.
- Falhas de acesso (incluindo 403/429), vídeo removido/privado e formato indisponível não geram repetição automática. Falhas de pasta, espaço, ferramentas ou limpeza pausam a fila e geram aviso de atenção.
- Contador e espera restante na interface; cancelamento interrompe o temporizador. A pausa após o atual inclui as tentativas do item. Reinício restaura uma espera como interrompida, sem repetição automática. Uma publicação concluída permanece registrada mesmo se houver cancelamento no limite da conclusão.
- Notificações silenciosas de fim da execução, com resumo por resultado, e de pausa por problema. Preferência persistida, botão de teste e clique que traz a janela enquanto o aplicativo está aberto. Notificações não geram falhas na fila se o serviço estiver indisponível.
- 70 testes do núcleo passaram, incluindo falhas controladas, repetição sequencial sem duplicação, esgotamento, cancelamento durante espera, restauração, pausa e tratamento de limpeza. Dois testes de interface e quatro com ferramentas reais também passaram.
- Electron real validou IPC e persistência da preferência de notificações. Um teste adicional enviou uma notificação pela API do Vora e observou a chamada ao serviço nativo Linux via D-Bus, filtrada pelo título do próprio aviso. Suporte nativo retornou verdadeiro. A exibição visual e o clique no aviso do sistema não foram automatizados; o clique é coberto com adaptador controlado.
- AppImage Linux e instalador Windows NSIS 0.4.0 gerados. O aplicativo Linux empacotado também passou no teste de IPC, preferência de notificações e persistência após reiniciar.
- Capturas: `test-results/vora-notificacoes.png` e `test-results/vora-novas-tentativas.png`.
- Esta versão ainda precisa de validação nativa no Windows. O relato de sucesso do usuário corresponde a uma versão anterior.

---

# Validação da versão 0.3.2

- Cartão de análise recolhido após adicionar, com ação para rever as opções sem nova consulta.
- Edição de formato, qualidade e pasta dos pendentes por grupo. Testes verificam identidade, ordem, persistência e preservação do ativo e de outros grupos. Quando necessário, os pendentes recebem uma configuração de grupo separada dos itens que já começaram.
- Seleção de pasta pelo diálogo nativo, com caminho resolvido pelo processo principal. A edição não altera a pasta padrão.
- Prévias usam consulta leve do yt-dlp, sem JavaScript do player ou manifestos HLS/DASH, com cache limitado e temporário. O download continua consultando os formatos completos.
- Consulta online de prévia validada em Big Buck Bunny: título, canal, duração e miniatura retornaram em aproximadamente 2 segundos nesta execução, sem download de mídia. Esse resultado não é uma garantia de latência.
- 56 testes do núcleo, dois de interface e um no Electron real passaram, cobrindo edição, cancelamento do modal, recolhimento, persistência e separação entre prévia e análise completa. Quatro testes com yt-dlp e FFmpeg reais também passaram (mídia local e fila sequencial).
- AppImage Linux e instalador Windows NSIS 0.3.2 gerados. O pacote Linux passou no teste de inicialização, edição de grupos por IPC e persistência após reiniciar.
- Interface validada em 800 × 600. Capturas: `test-results/vora-fila.png` e `test-results/vora-editar-grupo.png`.
- O usuário relatou funcionamento da versão anterior no Windows. A versão 0.3.2 ainda não foi validada nativamente nesse sistema.

---

# Validação da versão 0.3.1

- Prévias da fila carregam em segundo plano, uma por vez: título, miniatura, canal e duração quando disponíveis. A análise individual fornece uma prévia reutilizável, sem repetir essa consulta na adição.
- Pendentes sem informações são consultados ao restaurar a fila. Prévias persistidas são reaproveitadas. Falhas de consulta mantêm o item pendente e exibem um aviso; a execução consulta os dados novamente.
- 52 testes do núcleo passaram, incluindo cinco novos cenários: consultas sequenciais com fila pausada, persistência, falha sem impedir download, remoção/cancelamento, início durante consulta, encerramento e migração da fila antiga.
- Dois testes de interface e um teste no Electron real passaram. A interface verifica carregamento, aviso, título/canal/duração, miniatura e janela mínima.
- AppImage Linux e instalador Windows NSIS 0.3.1 gerados. A versão Linux empacotada passou no teste de inicialização, IPC e persistência.
- Captura: `test-results/vora-fila.png`.
- A validação nativa no Windows permanece pendente. Esta rodada não realizou novos downloads online.

---

# Validação da versão 0.3.0

- Fila sequencial persistida, com configuração e destino por grupo, análise por item e identificação dos eventos de progresso.
- 47 testes do núcleo passaram, incluindo inclusão durante download, pausa após o atual, cancelamento de análise/download, reordenação, deduplicação, falhas individuais, pausa por espaço/destino, retry sem duplicação e restauração pausada.
- Dois testes de interface passaram: grupos e ações por item, fila restaurada, progresso ativo; link misto, playlist de 203 entradas com paginação/seleção em páginas diferentes, indisponíveis e cancelamento da consulta. Janela mínima de 800 × 600 sem rolagem horizontal.
- Quatro testes com ferramentas reais passaram. Incluem listagem incremental a partir de HTML local com referências a vídeos, sem extrair os vídeos; e fila completa com vídeo original e MP3 usando mídia sintética, codecs conferidos por ffprobe e limpeza de temporários identificados por item.
- Electron real validou a nova ponte IPC, rejeição de ações com identificador desconhecido, preferências e fila persistida após reiniciar, sem início automático.
- AppImage Linux e instalador Windows NSIS 0.3.0 gerados. A versão Linux empacotada também passou no teste de inicialização, IPC e persistência após reiniciar.
- Capturas: `test-results/vora-fila.png` e `test-results/vora-playlist.png`.

A consulta online também foi verificada na playlist pública [Essence of linear algebra](https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab): 16 itens disponíveis, com títulos e durações, sem baixar os vídeos. A validação nativa no Windows permanece pendente. As verificações online de download da versão 0.1 permanecem como histórico.

---

# Validação da versão 0.2.1

- Progresso simplificado para exibir somente a faixa ativa. Ícone, “Baixando vídeo”/“Baixando áudio” e percentual ficam na mesma linha.
- A troca de vídeo para áudio substitui a barra; faixas aguardando ou concluídas não são exibidas. Junção, conversão e preparação mantêm um único indicador indeterminado.
- Build/TypeScript e teste de interface passaram, incluindo a troca da barra e a etapa de junção com ambas as faixas concluídas.
- AppImage Linux e instalador Windows NSIS 0.2.1 gerados.
- Captura: `test-results/vora-progresso-ativo.png`. A validação nativa do Windows permanece pendente.

---

# Validação da versão 0.2.0

Validação em Linux x64, em 1 de novembro de 2026.

- 30 testes do núcleo passaram: preferências persistidas e migração, fallback de resolução/FPS, progresso independente, recuperação em múltiplas pastas, proteção de arquivos, symlinks, limpeza com falha, processos órfãos e cancelamento.
- Interface automatizada: barras de vídeo e áudio, preferências após recarregar, fallback sem perder a escolha, limpeza/reinício pela recuperação e ações da nova conclusão.
- Dois testes com ferramentas reais: conversão MP3/preservação de codecs e download/mux de faixas separadas com IDs de formato e progresso reais. A mídia foi gerada localmente.
- Electron real: migração de configurações 0.1, recuperação de sessão interrompida, persistência após fechar e abrir novamente e recusa de ações sem arquivo concluído.
- TypeScript e build de produção passaram. AppImage Linux e instalador Windows NSIS 0.2.0 foram gerados; o aplicativo Linux empacotado também passou no teste de reinício, preferências e recuperação.

As capturas dos novos fluxos ficam em `test-results/vora-progresso-separado.png`, `test-results/vora-conclusao.png` e `test-results/vora-recuperacao.png`.

O instalador Windows continua sem validação em Windows nativo. A recuperação oferece limpeza e reinício do download; não implementa retomada dos bytes. As verificações online abaixo correspondem à versão 0.1; esta rodada usa mídia local para validar as novas mudanças sem depender do YouTube.

---

# Validação da versão 0.1.0

Validação realizada em **Linux x64**, em 1 de novembro de 2026.

| Verificação                                                                                                     | Resultado |
| --------------------------------------------------------------------------------------------------------------- | --------- |
| TypeScript e build de produção                                                                                  | Passou    |
| Núcleo: 16 testes de URLs, formatos, erros, progresso, publicação e cancelamento                                | Passou    |
| Interface automatizada: análise, formatos, MP3, pasta, progresso, erro, cancelamento, conclusão e configurações | Passou    |
| Janela de 800 × 600, sem rolagem horizontal                                                                     | Passou    |
| Binários reais: mídia sintética, conversão MP3, preservação de codecs e mensagens de progresso do yt-dlp        | Passou    |
| Electron real e versão Linux empacotada: protocolo local, preload, IPC e quatro ferramentas internas            | Passou    |
| Inicialização de desenvolvimento: Vite, React e IPC                                                             | Passou    |
| SHA-256 dos binários Linux e Windows                                                                            | Passou    |
| AppImage Linux                                                                                                  | Gerado    |
| Instalador Windows NSIS, por compilação no Linux                                                                | Gerado    |

## Downloads reais

Fonte: [Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film](https://www.youtube.com/watch?v=aqz-KE-bpKQ).

A análise retornou resoluções de 144p a 2160p, incluindo variantes de FPS. Para limitar o tráfego dos testes, os downloads de vídeo usaram 144p.

- Vídeo compatível: arquivo MP4 com H.264 e AAC, confirmado pelo ffprobe.
- Vídeo original: codecs VP9 e AAC preservados, confirmados pelo ffprobe.
- Áudio original: AAC em M4A.
- MP3: conversão concluída e codec confirmado pelo ffprobe.
- Os dois vídeos produziram nomes iguais na fonte; o segundo recebeu sufixo numérico e o primeiro foi preservado.

Os arquivos de teste e capturas ficam em `test-results/`, fora do controle de versão. Os pacotes estão em `release/`.

## Limites da validação

O instalador Windows foi gerado, mas **não foi executado em um Windows nativo**. Instalação, permissões de pasta e encerramento da árvore de processos nesse sistema ainda precisam de validação nativa. Wine foi usado somente durante a geração do instalador.

O download de todas as resoluções, a matriz de distribuições Linux e dispositivos de reprodução não foram testados. Os testes automatizados de falha de rede e cancelamento usam processos/entradas controlados; downloads reais bem-sucedidos foram verificados separadamente.
