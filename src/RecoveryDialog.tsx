import { useEffect, useRef } from 'react';
import { Folder, RotateCcw, Trash2, X } from 'lucide-react';
import type { RecoveryItem } from '../shared/types';

export function RecoveryDialog({
  items,
  busy,
  error,
  onCleanup,
  onClose,
  formatSize,
}: {
  items: RecoveryItem[];
  busy: boolean;
  error: string;
  onCleanup: (item: RecoveryItem, retry: boolean) => void;
  onClose: () => void;
  formatSize: (size: number) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog recovery-dialog"
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">CONTINUE DE ONDE PAROU</span>
          <h2 id="recovery-title">Downloads interrompidos</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar recuperação"
          onClick={onClose}
          disabled={busy}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <p className="modal-description">
        Encontramos temporários de sessões anteriores. Você pode liberar esse espaço ou limpar e
        iniciar o download novamente. O download será reiniciado do começo.
      </p>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="recovery-list">
        {items.length ? (
          items.map((item) => (
            <article className="recovery-item" key={item.id}>
              <h3>{item.title}</h3>
              <p>
                {formatSize(item.size)} · {new Date(item.createdAt).toLocaleString('pt-BR')}
              </p>
              <p className="recovery-path" title={item.destination}>
                <Folder size={14} />
                {item.destination}
              </p>
              {item.running && (
                <p role="status">
                  Um processo anterior ainda está em execução. A limpeza será liberada quando ele
                  encerrar.
                </p>
              )}
              <div className="recovery-actions">
                <button
                  className="secondary"
                  disabled={busy || item.running}
                  onClick={() => onCleanup(item, true)}
                >
                  <RotateCcw size={14} />
                  Limpar e baixar novamente
                </button>
                <button
                  className="text-button"
                  disabled={busy || item.running}
                  onClick={() => onCleanup(item, false)}
                >
                  <Trash2 size={14} />
                  Limpar temporários
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="recovery-empty" role="status">
            Tudo limpo. Nenhum download interrompido.
          </p>
        )}
      </div>
      {busy && (
        <p className="modal-footnote" role="status">
          Limpando arquivos temporários…
        </p>
      )}
    </dialog>
  );
}
