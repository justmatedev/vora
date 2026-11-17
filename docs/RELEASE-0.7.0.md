# Lançamento 0.7.0

Estado: [release 0.7.0 em rascunho](https://github.com/justmatedev/vora/releases), com seis anexos completos e conferidos. A versão estável publicada continua sendo 0.6.1.

## Notas de versão

Título: **Vora 0.7.0 — Reels do Instagram**.

- Reels públicos do Instagram no mesmo campo de links e na mesma fila do YouTube, sem login nem cookies.
- Download de vídeo original, áudio original e MP3. Fotos, carrosséis, Stories e perfis não são suportados.
- Escolha explícita de Original quando MP4 compatível não estiver disponível; a preferência não é trocada automaticamente.
- Miniaturas, mensagens de erro, duração desconhecida e recuperação adaptadas ao Instagram.
- Títulos genéricos exibidos como “Reel de @usuário”, preservando títulos reais e itens antigos da fila e recuperação.
- Estilos, cores e espaçamentos alinhados à identidade visual; textos operacionais de pelo menos 12 px.

Reels públicos podem deixar de estar acessíveis sem login por restrições do Instagram. O modo Original preserva os codecs da fonte, inclusive VP9; MP4 compatível exige H.264/AAC disponível na fonte, sem reconversão de vídeo.

Atualização a partir da 0.6.0 ou 0.6.1, depois da publicação: use **Configurações → Atualizações**, baixe a nova versão e, com a fila pausada e sem trabalho ativo, escolha **Reiniciar e atualizar**. Versões 0.5.1 ou anteriores exigem instalação manual.

As ferramentas de mídia permanecem nas versões fixadas anteriormente. Os materiais de fontes do FFmpeg continuam nos [anexos da versão 0.5.1](https://github.com/justmatedev/vora/releases/tag/v0.5.1); veja [THIRD_PARTY.md](../THIRD_PARTY.md) para origem e hashes. Linux e Windows x64; instalador Windows sem assinatura digital.

## Validação e anexos

Rascunho com AppImage, instalador NSIS, blockmap Windows, `latest-linux.yml`, `latest.yml` e manifesto único `SHA256SUMS`. Versões, tamanhos, SHA-512 dos YAMLs e SHA-256 dos seis anexos recebidos pelo GitHub conferidos. Pacotes e YAMLs preservados sem alterações após a geração.

Código dos pacotes: commit `90a2d51`. [CI](https://github.com/justmatedev/vora/actions/runs/44195248462) e [empacotamento nativo Linux/Windows](https://github.com/justmatedev/vora/actions/runs/44195247794) aprovados; AppImage exato do CI aprovado no teste Electron no Linux. Evidências em [VALIDATION.md](VALIDATION.md). Teste nativo do instalador Windows e ciclo real de atualização para 0.7.0 permanecem pendentes até confirmação específica; resultados de versões anteriores não validam estes pacotes.
