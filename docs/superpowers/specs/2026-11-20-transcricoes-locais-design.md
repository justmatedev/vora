# Transcrições locais no Vora

**Data:** 20 de novembro de 2026. **Estado:** desenho para revisão do mantenedor; implementação ainda não autorizada por este documento.

## Objetivo e decisões aprovadas

Oferecer transcrição opcional de áudio e vídeo no computador, sem conta, assinatura, créditos ou envio de áudio a serviços externos. A pessoa pode transcrever um download concluído do Vora ou selecionar arquivos que já estejam no computador. O arquivo original é preservado.

Foram aprovados o teste local, a organização visual da prévia e o armazenamento dos modelos nos dados do aplicativo. A proposta apresentada reúne:

- Abas **Downloads** e **Transcrições**, preservando a identidade visual atual.
- Ação **Transcrever** nos downloads concluídos e **Selecionar arquivo** na aba Transcrições.
- **Small** multilíngue como recomendado e **Medium** multilíngue como opção de maior precisão, com aviso de maior consumo e tempo.
- Download separado e opcional dos modelos, guardados entre sessões e atualizações.
- Fila de transcrições, progresso, cancelamento e saída em TXT/SRT.
- Área **Modelos** com tamanho ocupado, caminho, abertura da pasta e remoção individual.

As regras abaixo identificadas como **proposta** são decisões do autor deste desenho para revisão; não representam preferências já expressas pelo mantenedor. A aprovação deste documento confirma o conjunto final.

## Abordagens consideradas

| Abordagem | Benefício | Custo e decisão |
| --- | --- | --- |
| Uma transcrição por vez, sem fila | Menos controles e estado persistente | Obriga a esperar para adicionar outro arquivo. Alternativa apresentada e preterida na prévia aceita. |
| Fila própria, executada sequencialmente | Permite adicionar outros arquivos e separar as atividades | Exige persistência e recuperação. Abordagem da prévia aceita; é a base deste desenho. |

O motor local escolhido é whisper.cpp. Uma API hospedada acrescentaria dependência de serviço, credenciais e cobrança, contrariando o uso local e gratuito aprovado. A execução ocorre em processo separado do Electron/React.

## Fluxo e interface

1. **Entrada:** escolher um ou mais arquivos locais, ou usar o caminho do resultado de um download concluído. Validar existência, acesso de leitura e faixa de áudio com ffprobe. Não copiar o vídeo para os dados do Vora.
2. **Opções:** Small selecionado inicialmente; idioma automático com seleção manual dos idiomas suportados; TXT e SRT selecionados inicialmente, exigindo ao menos um formato; mesma pasta da origem como destino inicial, com seletor nativo para outra pasta. **Proposta:** opções de um lote são capturadas ao adicionar e não mudam os itens já enfileirados.
3. **Modelo ausente:** informar tamanho e oferecer **Baixar modelo e adicionar**. Somente essa ação, ou **Baixar modelo** na área Modelos, autoriza o download. Nenhum modelo é baixado ao abrir ou atualizar o Vora.
4. **Fila:** exibir arquivo, origem, modelo, formatos e estado. O item ativo mostra preparação, transcrição e gravação. Preparação usa indicador indeterminado; percentuais da transcrição vêm do progresso real do motor. Não apresentar estimativas de duração sem medição adequada.
5. **Resultado:** mostrar os caminhos e ações para abrir TXT, localizar os arquivos e abrir o SRT. Avisar que o texto é gerado automaticamente e pode precisar de revisão. **Proposta:** usar os aplicativos padrão do sistema, sem editor de transcrição embutido nesta versão.

O download original continua concluído quando se inicia uma transcrição. Limpar seu histórico não cancela a transcrição nem apaga seus arquivos. Limpar transcrições concluídas também remove somente registros. Uma indicação de trabalho pendente na aba evita perder a atividade ao alternar de área.

**Proposta:** as preferências de transcrição são próprias e não alteram qualidade, formato ou destino dos downloads. Small permanece o recomendado; uma escolha explícita posterior pode ser lembrada para a próxima inclusão. Cada item conserva seu modelo exato.

## Modelos, armazenamento e instalação

Usar `join(app.getPath('userData'), 'models', 'whisper')`, com subpastas por identidade/versionamento do modelo. O caminho efetivo, incluindo nome e capitalização do aplicativo, vem do Electron; exemplos de Linux e Windows não devem ser codificados como caminhos fixos. Mostrar o caminho real na interface.

**Proposta técnica:** adotar inicialmente os modelos completos do experimento, sem quantização, e whisper.cpp v1.8.2, condicionados à validação dos binários empacotados nos dois sistemas. Fixar URLs por revisão, tamanho, SHA-256 e licenças em manifesto versionado. A revisão dos modelos usada no teste foi `5359861c739e955e79d9a303bcbc70fb988958b1` do repositório `ggerganov/whisper.cpp`:

| Modelo | Tamanho em bytes | SHA-256 |
| --- | ---: | --- |
| Small | 487601967 | `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b` |
| Medium | 1533763059 | `6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208` |

**Propostas para instalação e manutenção:**

- Distribuir o motor CPU para Linux/Windows x64 com as ferramentas do Vora, sem exigir Python, CMake ou instalação manual pelo usuário. O binário compilado para o Ryzen no experimento não serve como pacote universal: validar compatibilidade das instruções de CPU no empacotamento.
- Baixar pesos apenas quando solicitados, um modelo por vez, compartilhando a mesma instalação entre os itens que o usam. Modelos diferentes podem ficar instalados; somente um é carregado para transcrever.
- Gravar em arquivo parcial, permitir cancelamento e retomada com Range/validador da origem. Se o servidor não permitir retomar ou a identidade mudar, informar o reinício. Só declarar instalado depois de conferir tamanho e hash e publicar o arquivo completo.
- Interromper o download conserva o parcial para retomada explícita. Oferecer descarte do parcial e contabilizar seu espaço. Conferir espaço livre antes de baixar; tratar também esgotamento durante a gravação.
- Falha de rede ou integridade mantém o modelo indisponível, com mensagem e nova tentativa. Não trocar automaticamente de modelo ou fonte não verificada.
- Atualizações comuns preservam modelos compatíveis e não os substituem silenciosamente. Uma futura troca de versão exige uma ação explícita e deve preservar a instalação anterior até a nova estar validada.
- **Remover modelo** pede confirmação com tamanho e caminho. Impedir remoção enquanto houver uma transcrição ativa ou aguardando que dependa dele; orientar cancelar os itens primeiro. A remoção preserva textos, legendas e originais.
- Modelos nunca ficam na pasta de instalação, na pasta de vídeos ou no cache descartável do sistema. Alterar a pasta dos modelos, importar modelos externos e espelhos de download ficam fora da primeira versão.

O manifesto e os materiais de distribuição devem preservar os avisos e licenças do Whisper, dos pesos e do whisper.cpp. Guardar cópias verificadas dos artefatos de distribuição e registrar sua procedência; se uma fonte deixar de existir, apenas novas instalações/reinstalações dependem de providenciar outra origem verificada. Modelos já instalados funcionam sem esse endereço.

## Execução, recursos e persistência

**Proposta:** manter uma única transcrição ativa, com início automático dos itens seguintes enquanto a fila estiver em execução. Downloads conservam seu comportamento atual e podem continuar em paralelo; um novo item de transcrição não pausa a fila de downloads. A interface deve continuar responsiva com ambos em atividade.

Na primeira versão, usar CPU, com até seis threads e reserva de capacidade em máquinas menores; a fórmula exata fica com a implementação e deve respeitar a capacidade disponível. Não exigir GPU nem carregá-la silenciosamente. Carregar o modelo somente durante o trabalho e encerrar o processo ao terminar ou cancelar, liberando a memória.

Reutilizar FFmpeg/ffprobe para preparar o áudio, com duração e faixa validadas. Processar apenas arquivos de mídia locais; não aceitar playlists ou entradas que façam o FFmpeg buscar conteúdo na rede. Temporários têm diretório e identificação próprios. Arquivos longos precisam de tratamento que limite o áudio residente em memória; limites da ferramenta devem ser detectados e comunicados, sem cortar a transcrição silenciosamente.

Salvar uma fila própria, versionada, em `transcriptions.json` dentro de `userData`, sem alterar o formato de `queue.json`. Cada item registra origem absoluta, identidade básica da origem, destino, modelo/revisão, idioma, formatos, estado, erros e resultados publicados. As gravações de estado são serializadas e substituídas de forma segura, seguindo a prática do projeto.

Estados necessários: aguardando modelo, aguardando execução, preparando áudio, transcrevendo, salvando, concluída, falhou, cancelada e interrompida. A implementação pode agrupar fases operacionais, mantendo esses comportamentos distinguíveis na interface. Antes de executar, revalidar a origem; arquivo removido ou alterado após a inclusão exige nova seleção, sem procurar ou substituir automaticamente.

**Propostas para cancelamento, fechamento e recuperação:**

- Cancelar encerra a árvore de processos FFmpeg/Whisper e só libera o próximo trabalho depois de sua parada. Limpar exclusivamente temporários identificados como pertencentes ao item. O original nunca é apagado.
- Fechar o aplicativo durante transcrição ou download de modelo exige confirmação, aproveitando o aviso já existente para downloads. Confirmar a saída interrompe o trabalho, salva a fila e aguarda os processos encerrarem antes de fechar. Não deixar uma transcrição oculta em segundo plano.
- Ao reabrir, itens ativos da sessão anterior ficam **Interrompidos**; os demais permanecem aguardando. A fila de transcrições volta pausada e não inicia processamento nem downloads de modelos automaticamente.
- **Continuar fila** inicia os itens aguardando. O item interrompido só volta com **Tentar novamente**, recomeçando do início; recuperação a partir do último minuto não faz parte desta versão. O parcial de um download de modelo pode ser retomado separadamente.
- Após encerramento inesperado, verificar a propriedade dos temporários e se um processo anterior ainda está vivo antes de limpar ou reiniciar, seguindo as proteções já usadas na recuperação do Vora.
- Incluir transcrição, instalação de modelo e limpeza pendente na verificação de atividade que bloqueia **Reiniciar e atualizar**. Exigir filas pausadas e trabalho encerrado para instalar a atualização.

## Saídas e proteção de arquivos

**Proposta:** gerar `nome.transcricao.txt` e/ou `nome.transcricao.srt`. Quando algum nome já existir, escolher um novo sufixo comum, como `nome.transcricao (1)`, para todos os formatos do item. A publicação deve impedir sobrescrita mesmo se outro processo criar o destino depois da verificação inicial, aproveitando a proteção de `electron/files.ts` quando aplicável.

Preparar e validar resultados em temporários antes de publicar. Gravar UTF-8, preservar o idioma falado e conferir a sequência dos tempos SRT, limitando-os à duração real do áudio. Não traduzir automaticamente. Se nenhum trecho de fala for detectado, informar isso em vez de declarar uma transcrição útil concluída.

Concluir somente depois de publicar todos os formatos pedidos. Se ocorrer falha entre as publicações, registrar os arquivos que já foram salvos e informar conclusão parcial como falha recuperável; preservá-los. **Proposta:** uma nova tentativa refaz a transcrição e usa novos nomes sem sobrescrever esses resultados. Recuperar apenas a exportação faltante fica fora desta versão.

Validar permissão e espaço do destino antes do processamento e tratar mudanças posteriores. Se a pasta da origem não permitir gravação, pedir outra pasta; não trocar silenciosamente para Downloads. Exclusão de temporários não pode atingir originais, modelos, resultados anteriores ou arquivos sem identificação de propriedade.

## Componentes e limites do escopo

Separar gerenciamento de modelos, fila persistente e execução de transcrição em serviços do processo principal. Reutilizar `runProcess`, ferramentas de mídia, notificações e padrões de recuperação onde seus contratos se aplicarem; adaptar o timeout padrão de dois minutos do executor para operações longas, sem permitir processos abandonados. A ponte IPC recebe opções tipadas e identificadores; o processo principal valida caminhos, modelos e ações, sem aceitar comandos de shell ou URLs de modelos vindos do renderer.

Ficam fora desta entrega: tradução, diarização de falantes, editor interno, gravação de microfone, legendas embutidas no vídeo, GPU, modelos quantizados, importação de pastas recursivas, retomada parcial da transcrição e sincronização em nuvem. Não anunciar suporte a qualquer idioma, precisão garantida ou requisito mínimo de RAM antes de validação.

## Evidência e critérios de aceitação

No experimento aprovado, um trecho de 120 s em português levou 33,48 s/853 MiB com Small e 95,38 s/2176 MiB com Medium, em Ryzen 9 3900X, Linux, seis threads e sem GPU. Uma execução por modelo; os números não medem todo o Vora, Windows ou computadores modestos. A precisão não foi medida contra referência humana. O SRT do Medium ultrapassou a amostra em 0,4 s, justificando a validação dos tempos na exportação. Evidência local: `test-results/whisper-benchmark/relatorio.md` e `metrics.json` (arquivos ignorados pelo Git).

Antes de publicar a funcionalidade:

- Verificar os dois caminhos de entrada, os dois modelos e a execução offline após instalação, nos pacotes Linux e Windows x64.
- Cobrir download incompleto/retomada, hash incorreto, cancelamento, falha de disco, modelo em uso e preservação entre sessões/atualizações.
- Cobrir fila persistida, fechamento, falha inesperada, interrupção, tentativa explícita e bloqueio de atualização enquanto houver trabalho.
- Verificar TXT/SRT, conflito de nomes, publicação parcial, tempos válidos, ausência de áudio/fala, origem alterada e destino sem permissão.
- Conferir arquivos longos, ruído/silêncio, nomes próprios, detecção automática e ao menos outro idioma, sem usar sucesso do processo como prova de precisão.
- Verificar interface e teclado em janelas pequenas, atividade entre abas e comportamento junto a downloads; executar os testes existentes relevantes para evitar regressões.

## O que permanece com a implementação

Definir nomes e divisão exatos de módulos/IPC, esquema versionado, estratégia para áudio longo, detecção de processo vivo, timeout/inatividade, ajuste de threads e construção dos binários portáveis. Essas escolhas devem cumprir os comportamentos acima. Uma mudança perceptível de escopo, privacidade, formatos ou política de atualização de modelos volta para revisão do mantenedor.

Este documento é o resultado desta etapa de definição. Após aprovação do conjunto, o próximo artefato é o plano técnico de implementação.
