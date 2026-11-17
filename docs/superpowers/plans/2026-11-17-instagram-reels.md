# Reels públicos no Vora

Plano aprovado na conversa: aceitar apenas Reels públicos em /reel/ e /reels/, sem login/cookies. Reutilizar yt-dlp, FFmpeg, fila, áudio original e MP3. Preservar YouTube, filas antigas e alterações locais. Sem publicação.

- [x] Fontes compartilhadas, metadados, miniaturas e erros por plataforma; fixtures sanitizadas dos três Reels.
- [x] Pré-validação atômica de lotes e edição de grupos: exigir Original explicitamente quando MP4 compatível não existir. Persistência e recuperação para ambas as fontes.
- [x] Interface existente com identificação Instagram, duração desconhecida e aviso explícito, sem mudar preferência salva automaticamente.
- [x] Documentação, testes unitários/UI/desktop e downloads reais com verificação FFmpeg.

## Registro

Worktree bloqueado pelo sandbox ao criar refs em .git; execução no checkout atual. A especificação é o plano aprovado na conversa. Plataforma aditiva opcional nos tipos para compatibilidade; URLs identificam itens antigos. Pré-validação usa análise completa dos Reels somente em vídeo compatível; não muda a política de qualidade.

## Validação final

- `npm test`: 99 testes aprovados, incluindo tradução de títulos novos e antigos na fila e recuperação.
- `npm run test:ui`: 8 testes aprovados no Chromium instalado, incluindo preferência de áudio → vídeo sem troca automática de formato.
- `npm run test:media`: 4 testes aprovados com ferramentas reais.
- `npm run test:desktop`: aprovado no Electron, incluindo fila mista normalizada e restauração após reiniciar.
- `VORA_TEST_INSTAGRAM=1 VORA_KEEP_INSTAGRAM_TEST=1 npm run test:instagram`: aprovado; três Reels × vídeo original, áudio original e MP3, com nove arquivos verificados via ffprobe e decodificação FFmpeg.
- `npm run build`, `npm run typecheck` e `git diff --check`: aprovados.

Revisão independente: corrigido o caminho áudio → vídeo que podia selecionar Original implicitamente; teste de regressão reproduziu a falha antes da correção. Título provisório de Reels corrigido para usar seu ID em vez de “Vídeo null”. Alterações locais anteriores preservadas. Publicação fora do escopo; commits organizados separadamente para identidade visual e suporte a Reels.
