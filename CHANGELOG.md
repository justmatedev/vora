# Histórico de mudanças

## 0.6.0 — em preparação

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
