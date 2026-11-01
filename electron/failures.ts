import type { FailureReason } from '../shared/types';

export function failureReason(message: string): FailureReason {
  if (/ENOSPC|No space left|espaço suficiente/i.test(message)) return 'space';
  if (
    /DESTINATION|EACCES|EPERM|ENOTDIR|permission denied|read.only|permissão|pasta de destino/i.test(
      message,
    )
  )
    return 'destination';
  if (/ENOENT|ferramenta.*não.*encontrad|ferramentas.*indispon/i.test(message)) return 'tools';
  // Access restrictions and permanent errors must never become automatic retries.
  if (/\b403\b|\b429\b|sign in|bot|cookies|PO Token/i.test(message)) return 'item';
  if (/HTTP(?: Error)?\s*5\d\d/i.test(message)) return 'network';
  if (
    /private|removed|not available|unavailable|requested format|format is not available/i.test(
      message,
    )
  )
    return 'item';
  if (
    /timed?\s?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|connection (?:reset|closed|aborted|refused)|network (?:is unreachable|error)|NetworkError|temporary failure|Name or service not known|ConnectionError|RemoteDisconnected|IncompleteRead|HTTP(?: Error)?\s*5\d\d|conectar ao YouTube|conexão.*(?:interrompida|perdida)/i.test(
      message,
    )
  )
    return 'network';
  return 'item';
}
export class MediaError extends Error {
  constructor(
    message: string,
    readonly reason: FailureReason,
  ) {
    super(message);
  }
}
