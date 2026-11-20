import { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, LoaderCircle, X } from 'lucide-react';
import type {
  SourceSelection,
  ModelSnapshot,
  TranscriptionOptions,
  DestinationSelection,
  TranscriptionSnapshot,
} from '../shared/transcription-types';
import { DEFAULT_TRANSCRIPTION_OPTIONS } from '../shared/transcription-options';
import { LANGUAGES } from '../shared/whisper-languages';
import { desktop } from './queue-client';
import { storageBytes, transcriptionMessage, audioDuration } from './transcription-client';
export function TranscriptionDialog({
  sources,
  models,
  snapshot,
  onClose,
  onAdded,
}: {
  sources: SourceSelection[];
  models: ModelSnapshot | undefined;
  snapshot: TranscriptionSnapshot;
  onClose: () => void;
  onAdded: (notice?: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const [options, setOptions] = useState<TranscriptionOptions>(
    structuredClone(DEFAULT_TRANSCRIPTION_OPTIONS),
  );
  const [destination, setDestination] = useState<DestinationSelection>(),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  function close() {
    ref.current?.close();
    onClose();
  }
  useEffect(() => {
    ref.current?.showModal();
    let active = true;
    void desktop()
      .settings()
      .then((settings) => {
        if (active && !dirty.current && settings.transcriptionPreferences)
          setOptions(settings.transcriptionPreferences);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (ref.current?.open) ref.current.close();
    };
  }, []);
  const model = models?.[options.modelId],
    installed = model?.state === 'installed';
  const hasPending = snapshot.items.some((item) =>
    ['model', 'waiting', 'preparing', 'transcribing', 'saving', 'interrupted'].includes(
      item.status,
    ),
  );
  const shouldStart = snapshot.mode === 'running' || !hasPending;
  const update = (next: TranscriptionOptions) => {
    dirty.current = true;
    setOptions(next);
  };
  async function submit() {
    if (!options.formats.length) {
      setError('Escolha pelo menos um formato de saída.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      await desktop().transcriptions.add({
        sourceIds: sources.map((s) => s.id),
        options,
        destinationId: destination?.id,
        downloadModel: !installed,
        start: shouldStart,
      });
      let warning: string | undefined;
      try {
        await desktop().transcriptions.savePreferences(options);
      } catch {
        warning = 'A transcrição foi adicionada, mas a preferência não pôde ser salva.';
      }
      ref.current?.close();
      onAdded(warning);
    } catch (error) {
      setError(transcriptionMessage(error));
    } finally {
      setWorking(false);
    }
  }
  async function choose() {
    setWorking(true);
    setError('');
    try {
      const selected = await desktop().transcriptions.chooseDirectory();
      if (selected) setDestination(selected);
    } catch (error) {
      setError(transcriptionMessage(error));
    } finally {
      setWorking(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="transcription-dialog"
      aria-labelledby="transcription-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="modal-header">
        <h2 id="transcription-title">Nova transcrição</h2>
        <button className="icon-button" aria-label="Fechar opções de transcrição" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="transcription-dialog-body">
          <div className="transcription-source">
            <FileText size={22} />
            <div>
              <strong>
                {sources.length === 1 ? sources[0].name : `${sources.length} arquivos selecionados`}
              </strong>
              <p>
                {sources.length === 1
                  ? `${sources[0].origin === 'download' ? 'Download do Vora' : 'Arquivo do computador'} · ${audioDuration(sources[0].durationMs)}`
                  : 'As opções serão aplicadas a todos os arquivos.'}
              </p>
            </div>
          </div>
          {sources.length > 1 && (
            <details className="transcription-batch">
              <summary>Ver arquivos selecionados</summary>
              <ul>
                {sources.map((source) => (
                  <li key={source.id}>{source.name}</li>
                ))}
              </ul>
            </details>
          )}
          <fieldset disabled={working} className="transcription-model-options">
            <legend>Modelo de transcrição</legend>
            <div className="transcription-model-grid">
              {(['small', 'medium'] as const).map((id) => (
                <label
                  key={id}
                  className={`transcription-model-option ${options.modelId === id ? 'selected' : ''}`}
                >
                  <span>
                    <input
                      type="radio"
                      name="transcription-model"
                      value={id}
                      checked={options.modelId === id}
                      onChange={() => update({ ...options, modelId: id })}
                    />
                    <strong>{id === 'small' ? 'Small' : 'Medium'}</strong>
                  </span>
                  <b>{id === 'small' ? 'Recomendado' : 'Maior precisão'}</b>
                  <p>
                    {id === 'small'
                      ? 'Equilíbrio entre velocidade e precisão.'
                      : 'Exige mais memória e pode demorar mais.'}
                  </p>
                  <small>
                    {models?.[id].state === 'installed'
                      ? 'Instalado'
                      : `Download de ${id === 'small' ? '465 MiB' : '1,43 GiB'}`}
                  </small>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="transcription-fields">
            <label>
              Idioma do áudio
              <select
                disabled={working}
                value={options.language}
                onChange={(event) => update({ ...options, language: event.target.value })}
              >
                <option value="auto">Detectar automaticamente</option>
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset disabled={working}>
              <legend>Salvar como</legend>
              <div className="transcription-checks">
                {(['txt', 'srt'] as const).map((format) => (
                  <label key={format}>
                    <input
                      type="checkbox"
                      checked={options.formats.includes(format)}
                      onChange={(event) =>
                        update({
                          ...options,
                          formats: event.target.checked
                            ? [...options.formats, format]
                            : options.formats.filter((f) => f !== format),
                        })
                      }
                    />
                    {format.toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="transcription-destination">
            <span>Pasta de saída</span>
            <p>
              {destination?.path ??
                (sources.length > 1 ? 'Mesma pasta de cada arquivo' : 'Mesma pasta do arquivo')}
            </p>
            <button
              className="text-button"
              type="button"
              disabled={working}
              onClick={() => void choose()}
            >
              <FolderOpen size={15} />
              Escolher outra pasta
            </button>
            <small>Arquivos existentes serão preservados.</small>
          </div>
          <p className="transcription-model-hint">
            {!model ? (
              'Verificando modelos…'
            ) : installed ? (
              'Modelo instalado. A transcrição será feita no seu computador, no idioma falado.'
            ) : (
              <>
                O modelo {options.modelId === 'small' ? 'Small' : 'Medium'} precisa ser{' '}
                {model.bytesOnDisk ? 'retomado ou baixado' : 'baixado'} (
                {storageBytes(model.spec.bytes)}). Ele ficará salvo para as próximas transcrições.
              </>
            )}
          </p>
          {error && (
            <p className="queue-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="transcription-dialog-footer">
          <button className="text-button" type="button" disabled={working} onClick={close}>
            Cancelar
          </button>
          <button className="primary" type="submit" disabled={working || !model}>
            {working ? (
              <>
                <LoaderCircle size={16} className="spin" />
                Adicionando
              </>
            ) : !installed ? (
              'Baixar modelo e adicionar'
            ) : shouldStart ? (
              'Adicionar e iniciar'
            ) : (
              'Adicionar à fila'
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
