# Lançamento 0.8.0

Estado: [release 0.8.0 publicada](https://github.com/justmatedev/vora/releases/tag/v0.8.0) como estável e mais recente em 22 de novembro de 2026, após confirmação do mantenedor. Os seis anexos conferidos foram preservados na publicação.

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

Código dos pacotes: commit `1c51f65`. [CI Linux/Windows e interface](https://github.com/justmatedev/vora/actions/runs/45059789415) e [empacotamento nativo nos dois sistemas](https://github.com/justmatedev/vora/actions/runs/45059791444) aprovados. Conferidos dependências de produção, Node embutido, Whisper nativo fora da árvore de build, canal GitHub e metadados de atualização.

Validação local Linux: 163 testes do núcleo, 11 de interface, cinco de mídia, dois do atualizador, três de empacotamento, build e Electron real aprovados. Small e Medium passaram na integração offline de 120 segundos. O AppImage exato do CI também passou no teste Electron/IPC e na transcrição offline com Small pela interface. Detalhes em [VALIDATION.md](VALIDATION.md).

Anexos: AppImage, instalador NSIS, blockmap Windows, `latest-linux.yml`, `latest.yml` e manifesto único `SHA256SUMS`. Os hashes originais dos dois jobs foram conferidos e os YAMLs correspondem à versão, nomes, tamanhos e SHA-512 dos instaladores. Os arquivos não foram alterados após a geração. Os seis anexos recebidos pelo GitHub tiveram tamanho e SHA-256 comparados com os arquivos locais, sem divergências.

Em 22 de novembro de 2026, após a apresentação dos pacotes e das pendências nativas no Windows, o mantenedor confirmou que estava tudo certo e autorizou a publicação estável. Os cenários individuais de instalação, transcrição offline e atualização no Windows não foram detalhados. Essa confirmação é um relato do mantenedor, distinto das verificações automatizadas registradas acima; não foi executado nesta sessão um salto entre os pacotes oficiais 0.7.0→0.8.0.
