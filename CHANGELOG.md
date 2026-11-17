# Histórico de mudanças

## Não lançado

- Reels públicos do Instagram na análise e na fila, com vídeo original, áudio original e MP3, sem login ou cookies.
- Validação de formato antes de adicionar ou editar grupos com Reels: escolha explícita de Original quando MP4 compatível não estiver disponível.
- Miniaturas, duração desconhecida, erros e recuperação de downloads adaptados ao Instagram.
- Títulos genéricos do Instagram exibidos como “Reel de @usuário” na análise, na fila e na recuperação, inclusive para itens salvos anteriormente; títulos reais preservados.

- Textos operacionais e auxiliares padronizados em pelo menos 12 px, inclusive avisos compactos e diálogos.
- Cores, espaçamentos e raios dos componentes alinhados aos tokens da identidade visual.
- Guia visual atualizado com a confirmação do mantenedor sobre a validação do ícone no Windows na versão 0.6.1.

## 0.6.1 — 2026-11-01

- Identidade visual refinada, com ícone atualizado, textos mais legíveis e maior contraste.
- Download ativo e grupos da fila com hierarquia visual mais clara.
- Busca exibida automaticamente a partir de 10 itens na lista, sem contar o download ativo; abertura manual pela lupa em filas menores.
- Busca em uso preservada quando a fila diminui; fechamento por botão ou Esc limpa a pesquisa e mantém o filtro escolhido.
- Foco pelo teclado, seleção de vídeo/playlist e estados desabilitados mais consistentes.
- Estilos consolidados, novos testes de interface e documentação visual com capturas atualizadas.

## 0.6.0 — 2026-11-01

- Verificação automática de novas versões e painel de atualizações nas configurações.
- Download e instalação por clique, com progresso, notas da versão e alternativa manual.
- Instalação bloqueada durante trabalho ativo; fila e preferências preservadas.
- AppImage substituído no mesmo caminho após preparar uma cópia; atalhos preservados.
- Metadados e blockmaps de atualização gerados e conferidos no workflow de pacotes.
- Instalação automática ao fechar desabilitada. A primeira instalação a partir de 0.5.1 é manual.

## 0.5.1 — 2026-11-01

- Layout compacto desde a abertura, com fila vazia e análise individual sempre em modal.
- yt-dlp usa o Node.js incluído no Electron; Deno separado removido dos pacotes.
- Fontes exatas, receitas e avisos das dependências do FFmpeg preservados com manifestos e checksums junto à Release.
- Licenças das bibliotecas da interface e avisos agregados do yt-dlp incluídos no empacotamento.
- Testes de recuperação sincronizados para evitar condições de corrida entre sessões simuladas.
- Repositório preparado com licença MIT, documentação, modelos de issues e pull requests, CI e geração manual de pacotes.
- AppImage validado no Linux; teste manual do instalador Windows confirmado pelo mantenedor.

## 0.5.0

- Interface centrada na fila, painel ativo fixo, grupos compactos e detalhes por item.
- Busca sem distinção de acentos e filtros combinados com paginação.

## 0.4.0

- Notificações do sistema e novas tentativas automáticas para falhas temporárias.

## 0.3.2

- Edição dos itens pendentes por grupo e consultas leves de metadados.

## 0.3.1

- Carregamento em segundo plano das informações dos links adicionados à fila.

## 0.3.0

- Fila sequencial persistente e importação de links e playlists públicas.

## Versões anteriores

Download individual, seleção de formatos, progresso, preferências e recuperação após interrupção. Consulte [VALIDATION.md](docs/VALIDATION.md) para os registros detalhados e os limites de cada validação.
