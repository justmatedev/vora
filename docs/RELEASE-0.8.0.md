# Lançamento 0.8.0

Estado: em preparação. A versão estável publicada continua sendo a 0.7.0 até a conclusão da validação e publicação desta release.

## Notas de versão

Título: **Vora 0.8.0 — transcrições locais e fila simplificada**.

- Nova aba **Transcrições**: transforme áudio e vídeo do computador em texto TXT e legendas SRT. Nos downloads concluídos, use **Detalhes → Transcrever**.
- Reconhecimento local com whisper.cpp 1.8.2 e modelos multilíngues Small ou Medium. Os modelos são opcionais, baixados somente sob ação explícita e conferidos por tamanho e SHA-256; ficam separados do aplicativo e são preservados nas atualizações.
- Fila de transcrições independente, idioma automático ou manual, cancelamento e recuperação pausada. Originais e resultados existentes são preservados, com proteção contra sobrescrita.
- Fila de downloads mais enxuta: progresso em destaque, informações secundárias em **Detalhes**, filtros a partir de cinco itens ou ao abrir a busca e busca automática a partir de dez itens da lista.
- Downloads cancelados, com falha ou interrompidos podem ser removidos por **Detalhes → Remover**, sem tentar novamente. Transcrições pendentes e encerradas também podem ser removidas, limpando temporários próprios e preservando resultados publicados.
- **Continuar fila** fica oculto quando não há trabalho para continuar. Gerenciamento de modelos simplificado, com **Abrir pasta dos modelos** para localizar seus arquivos.

O reconhecimento usa a CPU. Small ocupa cerca de 488 MB e Medium cerca de 1,53 GB; os pesos não vêm no instalador. Depois de instalado o modelo, a transcrição funciona sem internet e não envia o áudio para serviços externos. O texto e os tempos podem exigir revisão; não há garantia de precisão uniforme entre idiomas, música, ruído e silêncio.

## Atualização

A partir da versão 0.6.0, use **Configurações → Atualizações**, baixe a nova versão e escolha **Reiniciar e atualizar**, com as filas pausadas e sem trabalho ativo. Versões 0.5.1 ou anteriores exigem instalação manual. A atualização preserva o perfil, os modelos e os resultados salvos.

Linux e Windows x64. O instalador Windows não possui assinatura digital. As ferramentas de mídia permanecem nas versões fixadas; os materiais de fontes do FFmpeg continuam nos [anexos da versão 0.5.1](https://github.com/justmatedev/vora/releases/tag/v0.5.1). Fontes e licenças de Whisper/whisper.cpp e dos modelos estão descritas em [THIRD_PARTY.md](../THIRD_PARTY.md).

## Validação e anexos

Os resultados de CI, empacotamento e testes dos artefatos exatos serão registrados em [VALIDATION.md](VALIDATION.md). A validação manual do instalador e da atualização no Windows continua pendente; os ensaios históricos de transcrição e atualização no Linux não substituem o teste dos novos pacotes.

Anexos previstos: AppImage, instalador NSIS, blockmap Windows, `latest-linux.yml`, `latest.yml` e manifesto único `SHA256SUMS`. A release permanecerá em rascunho enquanto os pacotes e sua validação estiverem incompletos.
