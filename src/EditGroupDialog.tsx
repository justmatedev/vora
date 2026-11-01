import { useEffect, useRef, useState } from 'react';
import { Folder, LoaderCircle, X } from 'lucide-react';
import type { QueueGroup } from '../shared/types';
import { GroupOptions } from './GroupOptions';
import { desktop, message } from './queue-client';

export function EditGroupDialog({
  group,
  pendingCount,
  onClose,
}: {
  group: QueueGroup;
  pendingCount: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState(() => structuredClone(group.preferences));
  const [destination, setDestination] = useState(group.destination);
  const [changedDirectory, setChangedDirectory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function chooseDirectory() {
    setBusy(true);
    setError('');
    try {
      const path = await desktop().chooseGroupDirectory(group.id);
      if (path) {
        setDestination(path);
        setChangedDirectory(true);
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await desktop().editQueueGroup(group.id, config, changedDirectory);
      onClose();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog import-dialog"
      aria-labelledby="edit-group-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">{group.label}</span>
          <h2 id="edit-group-title">Editar grupo</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar edição"
          onClick={onClose}
          disabled={busy}
        >
          <X size={19} />
        </button>
      </div>
      <p className="modal-footnote">
        As alterações serão aplicadas somente aos {pendingCount} itens aguardando, inclusive os
        ocultos pela busca ou filtro. O item ativo e os já finalizados conservam suas opções.
      </p>
      <GroupOptions config={config} setConfig={setConfig} disabled={busy || !pendingCount} />
      <div className="settings-folder">
        <Folder size={17} />
        <span title={destination}>{destination}</span>
        <button
          className="text-button"
          disabled={busy || !pendingCount}
          onClick={() => void chooseDirectory()}
        >
          Alterar
        </button>
      </div>
      {!pendingCount && (
        <p className="queue-warning" role="status">
          Não há mais itens aguardando neste grupo.
        </p>
      )}
      {error && (
        <p className="queue-error" role="alert">
          {error}
        </p>
      )}
      <div className="import-footer">
        <button className="secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button className="primary" onClick={() => void save()} disabled={busy || !pendingCount}>
          {busy && <LoaderCircle size={16} className="spin" />} Salvar alterações
        </button>
      </div>
    </dialog>
  );
}
