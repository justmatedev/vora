import { useEffect, useRef, useState } from 'react';
import { FolderOpen, LoaderCircle, X } from 'lucide-react';
import type {
  ModelSnapshot,
  TranscriptionSnapshot,
  WhisperModelId,
} from '../shared/transcription-types';
import { desktop } from './queue-client';
import { storageBytes, transcriptionMessage } from './transcription-client';
export function WhisperModelsDialog({
  models,
  snapshot,
  onClose,
}: {
  models: ModelSnapshot | undefined;
  snapshot: TranscriptionSnapshot;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(''),
    [pending, setPending] = useState<Set<string>>(new Set()),
    [confirmation, setConfirmation] = useState<{ id: WhisperModelId; partial: boolean }>();
  useEffect(() => {
    ref.current?.showModal();
    return () => {
      if (ref.current?.open) ref.current.close();
    };
  }, []);
  useEffect(() => {
    if (confirmation)
      ref.current?.querySelector<HTMLButtonElement>('.transcription-confirm button')?.focus();
  }, [confirmation]);
  function close() {
    ref.current?.close();
    onClose();
  }
  async function command(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (error) {
      if (!/abort|cancel/i.test(transcriptionMessage(error))) setError(transcriptionMessage(error));
    }
  }
  function install(id: WhisperModelId) {
    setPending((value) => new Set([...value, id]));
    void command(() => desktop().models.install(id)).finally(() =>
      setPending((value) => {
        const next = new Set(value);
        next.delete(id);
        return next;
      }),
    );
  }
  async function remove() {
    if (!confirmation) return;
    const current = confirmation;
    setConfirmation(undefined);
    await command(() =>
      current.partial
        ? desktop().models.discardPartial(current.id)
        : desktop().models.remove(current.id),
    );
  }
  return (
    <dialog
      ref={ref}
      className="transcription-dialog"
      aria-labelledby="whisper-models-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-header">
        <h2 id="whisper-models-title">Modelos de transcrição</h2>
        <button className="icon-button" aria-label="Fechar modelos" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <div className="transcription-dialog-body">
        <p className="modal-description">
          Baixe apenas os modelos que quiser usar. Depois de instalados, funcionam sem internet.
        </p>
        {!models ? (
          <p>Carregando modelos…</p>
        ) : (
          (['small', 'medium'] as const).map((id) => {
            const model = models[id],
              name = id === 'small' ? 'Small' : 'Medium',
              active = ['downloading', 'verifying'].includes(model.state) || pending.has(id),
              inUse = snapshot.items.some(
                (item) =>
                  item.options.modelId === id &&
                  ['model', 'waiting', 'preparing', 'transcribing', 'saving'].includes(item.status),
              );
            return (
              <section className="whisper-model-row" key={id}>
                <div className="whisper-model-row-heading">
                  <h3>
                    {name}
                    {id === 'small' && <span className="transcription-badge">Recomendado</span>}
                  </h3>
                  <span>{storageBytes(model.spec.bytes)}</span>
                </div>
                <p>
                  {id === 'small'
                    ? 'Equilíbrio entre velocidade e precisão.'
                    : 'Mais precisão, com maior uso de memória e tempo.'}
                </p>
                <p className="whisper-model-state">
                  {model.state === 'installed'
                    ? 'Instalado · disponível sem internet'
                    : model.state === 'verifying'
                      ? 'Verificando integridade…'
                      : active
                        ? `Baixando · ${Math.floor(((model.receivedBytes ?? 0) / model.spec.bytes) * 100)}%`
                        : model.bytesOnDisk
                          ? `Download parcial · ${storageBytes(model.bytesOnDisk)}`
                          : 'Não instalado'}
                </p>
                {active && (
                  <progress
                    aria-label={`Download de ${name}`}
                    max={model.spec.bytes}
                    value={
                      model.state === 'verifying' ? model.spec.bytes : (model.receivedBytes ?? 0)
                    }
                  />
                )}
                <div className="whisper-model-actions">
                  {active ? (
                    <button
                      className="secondary"
                      aria-label={`Cancelar download de ${name}`}
                      onClick={() => void command(() => desktop().models.cancel(id))}
                    >
                      Cancelar download
                    </button>
                  ) : model.state === 'installed' ? (
                    <button
                      className="text-button"
                      aria-label={`Remover ${name}`}
                      disabled={inUse}
                      onClick={() => setConfirmation({ id, partial: false })}
                    >
                      Remover modelo
                    </button>
                  ) : (
                    <>
                      <button
                        className="secondary"
                        aria-label={`${model.bytesOnDisk ? 'Retomar' : 'Baixar'} ${name}`}
                        onClick={() => install(id)}
                      >
                        {model.bytesOnDisk ? 'Retomar download' : 'Baixar modelo'}
                      </button>
                      {!!model.bytesOnDisk && (
                        <button
                          className="text-button"
                          onClick={() => setConfirmation({ id, partial: true })}
                        >
                          Descartar parcial
                        </button>
                      )}
                    </>
                  )}
                  {inUse && !active && <small>Em uso por itens da fila.</small>}
                </div>
                <details className="whisper-model-path">
                  <summary>Caminho do modelo</summary>
                  <p>{model.path}</p>
                </details>
                {model.message && <p>{model.message}</p>}
                {model.error && (
                  <p className="queue-error" role="alert">
                    {model.error}
                  </p>
                )}
              </section>
            );
          })
        )}
        {confirmation && (
          <div className="transcription-confirm" role="alert">
            <p>
              {confirmation.partial ? 'Descartar o download parcial' : 'Remover o modelo'}{' '}
              {confirmation.id === 'small' ? 'Small' : 'Medium'}? Textos e legendas serão
              preservados.
            </p>
            <div>
              <button className="text-button" onClick={() => setConfirmation(undefined)}>
                Manter
              </button>
              <button className="secondary" onClick={() => void remove()}>
                Confirmar remoção
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="queue-error" role="alert">
            {error}
          </p>
        )}
        {models && (
          <p className="modal-footnote">
            Espaço ocupado: {storageBytes(models.small.bytesOnDisk + models.medium.bytesOnDisk)}.
            Remover um modelo libera espaço e preserva as transcrições.
          </p>
        )}
      </div>
      <div className="transcription-dialog-footer">
        <button
          className="text-button"
          onClick={() => void command(() => desktop().models.openDirectory())}
        >
          <FolderOpen size={15} />
          Abrir pasta dos modelos
        </button>
        <button className="secondary" onClick={close}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
