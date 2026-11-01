import { AudioLines, LoaderCircle, Video } from 'lucide-react';
import type { JobEvent, TransferKind } from '../shared/types';

export const transferLabels: Record<TransferKind, string> = {
  video: 'Vídeo',
  audio: 'Áudio',
  combined: 'Vídeo com áudio',
};
export function TransferPanel({
  progress,
  cancelling,
  cancel,
  formatSpeed,
  formatEta,
  cancelLabel = 'Cancelar',
  disabled = false,
}: {
  progress?: Extract<JobEvent, { type: 'progress' }>;
  cancelling: boolean;
  cancel: () => void;
  formatSpeed: (bytes: number) => string;
  formatEta: (seconds: number) => string;
  cancelLabel?: string;
  disabled?: boolean;
}) {
  const downloading = progress?.stage === 'downloading';
  const activeTransfer = downloading
    ? (progress.transfers?.find((transfer) => transfer.kind === progress.track) ??
      progress.transfers?.find((transfer) => transfer.status === 'downloading'))
    : undefined;
  const track = downloading ? (activeTransfer?.kind ?? progress.track) : undefined;
  const percent = downloading && track ? (activeTransfer?.percent ?? progress.percent) : undefined;
  const label = cancelling
    ? 'Cancelando e limpando arquivos…'
    : progress
      ? {
          downloading: track
            ? `Baixando ${transferLabels[track].toLowerCase()}`
            : 'Preparando download',
          merging: 'Juntando áudio e vídeo',
          converting: 'Convertendo para MP3',
          saving: 'Salvando arquivo',
        }[progress.stage]
      : 'Preparando download';
  return (
    <div className="job-panel">
      <div className="progress-heading" role="status">
        <span>
          {track && !cancelling ? (
            track === 'audio' ? (
              <AudioLines size={16} />
            ) : (
              <Video size={16} />
            )
          ) : (
            <LoaderCircle size={16} className="spin" />
          )}
          {label}
        </span>
        {percent !== undefined && <strong>{Math.floor(percent)}%</strong>}
      </div>
      <div
        key={downloading ? (track ?? 'preparing') : (progress?.stage ?? 'preparing')}
        className={`progress-track ${percent === undefined ? 'indeterminate' : ''}`}
        role="progressbar"
        aria-label={
          track
            ? `Progresso ${track === 'audio' ? 'do áudio' : track === 'combined' ? 'do vídeo com áudio' : 'do vídeo'}`
            : label
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={percent !== undefined ? { width: `${percent}%` } : undefined} />
      </div>
      <div className="progress-bottom">
        <span>
          {downloading && progress?.speed
            ? `${formatSpeed(progress.speed)}/s`
            : 'Processando no seu computador'}
          {downloading && progress?.eta !== undefined
            ? ` · ${formatEta(progress.eta)} restantes`
            : ''}
        </span>
        <button className="text-button" onClick={cancel} disabled={cancelling || disabled}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
