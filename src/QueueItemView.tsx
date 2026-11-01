import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  FolderOpen,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
  Video,
  X,
} from 'lucide-react';
import type { QueueItem } from '../shared/types';
import { desktop } from './queue-client';
import { configurationLabel } from './QueueGroupHeader';
import { folderLabel, statusLabel } from './queue-view';
import { TransferPanel } from './TransferPanel';

export function ItemSummary({
  item,
  formatEta,
  details,
}: {
  item: QueueItem;
  formatEta: (value: number) => string;
  details?: () => void;
}) {
  const [brokenImage, setBrokenImage] = useState(false);
  useEffect(() => setBrokenImage(false), [item.preview?.thumbnail]);
  return (
    <div className="queue-video-summary">
      <div className="queue-thumb-frame">
        {item.preview?.thumbnail && !brokenImage ? (
          <img
            className="queue-thumbnail"
            src={item.preview.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setBrokenImage(true)}
          />
        ) : (
          <Video size={20} aria-hidden="true" />
        )}
      </div>
      <div className="queue-video-details">
        <h3 title={item.title}>{item.title}</h3>
        <p className="queue-metadata">
          {item.preview ? (
            [
              item.preview.channel,
              item.preview.duration ? formatEta(item.preview.duration) : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || 'Informações do vídeo'
          ) : item.previewState === 'error' ? (
            'Prévia indisponível'
          ) : item.status === 'waiting' ? (
            <>
              <LoaderCircle size={12} className="spin" /> Carregando informações…
            </>
          ) : (
            'YouTube'
          )}
        </p>
      </div>
      <span className={`queue-status ${item.status}`}>
        {item.status === 'completed' && <CheckCircle2 size={12} />}
        {statusLabel(item)}
      </span>
      {details && (
        <button
          className="icon-button active-info-button"
          aria-label="Detalhes do download ativo"
          title="Detalhes do download ativo"
          onClick={details}
        >
          <Info size={15} />
        </button>
      )}
    </div>
  );
}
function ItemWarnings({ item }: { item: QueueItem }) {
  return (
    <>
      {item.error && <p className="queue-item-error">{item.error}</p>}
      {item.previewState === 'error' && item.status === 'waiting' && (
        <p className="queue-preview-warning" title={item.previewError}>
          Não foi possível carregar a prévia. Tentaremos novamente ao iniciar o download.
        </p>
      )}
      {item.cleanupPending && (
        <p className="queue-item-error">
          Há arquivos temporários pendentes. Revise a recuperação para limpá-los.
        </p>
      )}
    </>
  );
}
export function ActiveDownload({
  item,
  cancelling,
  working,
  cancel,
  formatSize,
  formatEta,
}: {
  item: QueueItem;
  cancelling: boolean;
  working: boolean;
  cancel: () => void;
  formatSize: (value: number) => string;
  formatEta: (value: number) => string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <article className="active-download" aria-label={item.title}>
      <ItemSummary item={item} formatEta={formatEta} details={() => setDetailsOpen(true)} />
      <p className="active-config" title={item.destination}>
        {configurationLabel(item.preferences)} · {folderLabel(item.destination)}
      </p>
      {item.progress ? (
        <TransferPanel
          progress={item.progress}
          cancelling={cancelling}
          disabled={working}
          cancel={cancel}
          cancelLabel="Cancelar item"
          formatSpeed={formatSize}
          formatEta={formatEta}
        />
      ) : (
        <div className="queue-analyzing">
          <span role="status">
            <LoaderCircle size={15} className="spin" />
            {cancelling ? (
              'Cancelando e limpando arquivos…'
            ) : item.status === 'retrying' ? (
              <RetryCountdown retryAt={item.retryAt} attempt={(item.attempt ?? 1) + 1} />
            ) : (
              'Consultando formatos disponíveis…'
            )}
          </span>
          <button className="text-button" disabled={working || cancelling} onClick={cancel}>
            Cancelar item
          </button>
        </div>
      )}
      {item.status !== 'retrying' && (item.attempt ?? 0) > 1 && (
        <p className="queue-metadata">Tentativa {item.attempt} de 3</p>
      )}
      <ItemWarnings item={item} />
      {detailsOpen && <ActiveDetailsDialog item={item} onClose={() => setDetailsOpen(false)} />}
    </article>
  );
}
export function QueueRow({
  item,
  expanded,
  toggle,
  working,
  command,
  canMoveUp,
  canMoveDown,
  reorderDisabled,
  formatSize,
  formatEta,
}: {
  item: QueueItem;
  expanded: boolean;
  toggle: () => void;
  working: boolean;
  command: (action: () => Promise<unknown>) => Promise<void>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  reorderDisabled: boolean;
  formatSize: (value: number) => string;
  formatEta: (value: number) => string;
}) {
  const retryable = ['failed', 'cancelled', 'interrupted'].includes(item.status);
  return (
    <article className="queue-item queue-compact-row" aria-label={item.title}>
      <ItemSummary item={item} formatEta={formatEta} />
      <div className="queue-item-quick-actions">
        {item.status === 'completed' && item.result && (
          <>
            <span className="result-size">{formatSize(item.result.size)}</span>
            <button
              className="text-button"
              disabled={working}
              onClick={() => void command(() => desktop().openCompletedFile(item.id))}
            >
              <Play size={13} />
              Abrir arquivo
            </button>
          </>
        )}
        {retryable && (
          <button
            className="text-button"
            disabled={working}
            onClick={() => void command(() => desktop().retryItem(item.id))}
          >
            <RotateCcw size={13} />
            {item.status === 'interrupted' || item.cleanupPending
              ? 'Limpar e tentar novamente'
              : 'Tentar novamente'}
          </button>
        )}
        <button
          className="text-button row-details-toggle"
          aria-expanded={expanded}
          aria-label={`Detalhes: ${item.title}`}
          onClick={toggle}
        >
          Detalhes
          <ChevronDown size={13} className={expanded ? 'expanded' : ''} />
        </button>
      </div>
      <ItemWarnings item={item} />
      {expanded && (
        <div className="queue-item-details">
          <p className="detail-title">{item.title}</p>
          <p>
            <span>Link</span>
            {item.url}
          </p>
          <p>
            <span>Salvar em</span>
            {item.destination}
          </p>
          {item.result && (
            <p>
              <span>Arquivo</span>
              {item.result.path}
            </p>
          )}
          {item.status === 'waiting' && (
            <>
              {reorderDisabled && (
                <p className="reorder-hint">Limpe a busca e selecione Todos para reordenar.</p>
              )}
              <div className="queue-row-actions">
                <button
                  className="icon-button"
                  aria-label={`Mover para cima: ${item.title}`}
                  disabled={working || reorderDisabled || !canMoveUp}
                  onClick={() => void command(() => desktop().moveItem(item.id, 'up'))}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Mover para baixo: ${item.title}`}
                  disabled={working || reorderDisabled || !canMoveDown}
                  onClick={() => void command(() => desktop().moveItem(item.id, 'down'))}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  className="text-button"
                  disabled={working}
                  onClick={() => void command(() => desktop().removeItem(item.id))}
                >
                  <X size={14} />
                  Remover
                </button>
              </div>
            </>
          )}
          {item.status === 'completed' && item.result && (
            <div className="queue-file-actions">
              <button
                className="text-button"
                disabled={working}
                onClick={() => void command(() => desktop().showCompletedFile(item.id))}
              >
                <FolderOpen size={14} />
                Mostrar na pasta
              </button>
              <button
                className="text-button"
                aria-label={`Copiar caminho: ${item.title}`}
                disabled={working}
                onClick={() => void command(() => desktop().copyCompletedPath(item.id))}
              >
                <Copy size={14} />
                Copiar caminho
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
function RetryCountdown({ retryAt, attempt }: { retryAt?: number; attempt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const seconds = Math.max(0, Math.ceil(((retryAt ?? now) - now) / 1000));
  return (
    <span>
      Tentativa {attempt} de 3 · {seconds ? `nova tentativa em ${seconds}s` : 'tentando novamente…'}
    </span>
  );
}

function ActiveDetailsDialog({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog active-details-dialog"
      aria-labelledby="active-details-title"
      onCancel={onClose}
    >
      <div className="modal-header">
        <h2 id="active-details-title">Detalhes do download</h2>
        <button className="icon-button" aria-label="Fechar detalhes do download" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="queue-item-details">
        <p className="detail-title">{item.title}</p>
        <p>{configurationLabel(item.preferences)}</p>
        <p>
          <span>Link</span>
          {item.url}
        </p>
        <p>
          <span>Salvar em</span>
          {item.destination}
        </p>
      </div>
    </dialog>
  );
}
