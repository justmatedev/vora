import { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  FileText,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { TranscriptionSnapshot, ModelSnapshot } from '../shared/transcription-types';
import { desktop } from './queue-client';
import { transcriptionMessage } from './transcription-client';
const labels = {
  model: 'Aguardando modelo',
  waiting: 'Aguardando',
  preparing: 'Preparando áudio',
  transcribing: 'Transcrevendo',
  saving: 'Salvando arquivos',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  interrupted: 'Interrompida',
};
export function TranscriptionsPanel({
  snapshot,
  models,
  error,
  onChooseFiles,
  onModels,
  choosing,
}: {
  snapshot: TranscriptionSnapshot;
  models: ModelSnapshot | undefined;
  error: string;
  onChooseFiles: () => void;
  onModels: () => void;
  choosing: boolean;
}) {
  const [actionError, setActionError] = useState(''),
    [working, setWorking] = useState<string>();
  async function command(id: string, action: () => Promise<void>) {
    setWorking(id);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(transcriptionMessage(error));
    } finally {
      setWorking(undefined);
    }
  }
  const waiting = snapshot.items.filter((item) =>
      ['model', 'waiting'].includes(item.status),
    ).length,
    completed = snapshot.items.filter((item) => item.status === 'completed').length;
  const modelBusy =
    models &&
    Object.values(models).some((model) => ['downloading', 'verifying'].includes(model.state));
  return (
    <section className="transcriptions-panel" aria-labelledby="transcriptions-heading">
      <div className="transcriptions-heading">
        <div>
          <h1 id="transcriptions-heading">Transcrições</h1>
          <p>Transforme a fala dos seus áudios e vídeos em texto e legendas.</p>
        </div>
        <div>
          <button className="text-button" onClick={onModels}>
            {modelBusy ? <LoaderCircle size={16} className="spin" /> : <Cpu size={16} />}Modelos
          </button>
          {!!snapshot.items.length && (
            <button className="primary" disabled={choosing} onClick={onChooseFiles}>
              <Plus size={16} />
              Selecionar arquivo
            </button>
          )}
        </div>
      </div>
      {!snapshot.items.length && (
        <div className="transcription-file-intro">
          <FolderOpen size={24} />
          <div>
            <strong>Use um arquivo do seu computador</strong>
            <p>Escolha um áudio ou vídeo. O original será preservado.</p>
          </div>
          <button className="primary" disabled={choosing} onClick={onChooseFiles}>
            {choosing ? <LoaderCircle size={16} className="spin" /> : null}Selecionar arquivo
          </button>
        </div>
      )}
      <p className="transcription-local-note">
        <ShieldCheck size={15} />
        Processamento local. Seu áudio não é enviado para a internet.
      </p>
      {(error || snapshot.error || actionError) && (
        <p className="queue-error" role="alert">
          {actionError || snapshot.error || error}
        </p>
      )}
      <section className="transcription-queue" aria-label="Fila de transcrições">
        <header>
          <div>
            <h2>Fila de transcrições</h2>
            <p>
              {waiting} aguardando · {completed} concluída{completed === 1 ? '' : 's'}
            </p>
          </div>
          <div>
            {snapshot.mode !== 'paused' ? (
              <button
                className="text-button"
                disabled={!!working}
                onClick={() => void command('pause', () => desktop().transcriptions.pause())}
              >
                <Pause size={15} />
                {snapshot.mode === 'pausing' ? 'Pausando' : 'Pausar após atual'}
              </button>
            ) : waiting > 0 ? (
              <button
                className="text-button"
                disabled={!!working}
                onClick={() => void command('start', () => desktop().transcriptions.start())}
              >
                <Play size={15} />
                Continuar fila
              </button>
            ) : null}
            {completed > 0 && (
              <button
                className="text-button"
                disabled={!!working}
                onClick={() =>
                  void command('clear', () => desktop().transcriptions.clearCompleted())
                }
              >
                Limpar concluídas
              </button>
            )}
          </div>
        </header>
        <div className="transcription-items">
          {!snapshot.items.length ? (
            <div className="transcription-empty">
              <FileText size={30} />
              <h3>Suas transcrições aparecem aqui</h3>
              <p>
                Selecione um arquivo do computador ou use “Transcrever” em um download concluído.
              </p>
            </div>
          ) : (
            snapshot.items.map((item) => {
              const active = item.id === snapshot.activeId,
                canCancel = active || ['model', 'waiting'].includes(item.status),
                canRetry =
                  ['failed', 'cancelled', 'interrupted'].includes(item.status) ||
                  item.cleanupPending;
              return (
                <article
                  key={item.id}
                  className={`transcription-item ${active ? 'active' : ''}`}
                  aria-label={item.source.name}
                >
                  <div className="transcription-item-top">
                    <div className="transcription-file-icon">
                      <FileText size={20} />
                    </div>
                    <div className="transcription-item-copy">
                      <h3>{item.source.name}</h3>
                      <p>
                        {item.options.modelId === 'small' ? 'Small' : 'Medium'} ·{' '}
                        {item.options.formats.map((f) => f.toUpperCase()).join(' + ')} ·{' '}
                        {item.source.origin === 'download'
                          ? 'Download do Vora'
                          : 'Arquivo do computador'}
                      </p>
                    </div>
                    <span
                      className={`transcription-state ${item.status === 'completed' ? 'success' : ''}`}
                    >
                      {item.status === 'completed' && <CheckCircle2 size={13} />}{' '}
                      {labels[item.status]}
                    </span>
                  </div>
                  {active && (
                    <div className="transcription-progress">
                      <span>
                        {labels[item.status]}
                        {item.progress?.percent !== undefined ? ` · ${item.progress.percent}%` : ''}
                      </span>
                      {item.progress?.percent !== undefined ? (
                        <progress
                          aria-label="Progresso da transcrição"
                          max={100}
                          value={item.progress.percent}
                        />
                      ) : (
                        <progress aria-label={labels[item.status]} />
                      )}
                    </div>
                  )}
                  {item.error && (
                    <p className="queue-error" role="alert">
                      {item.error}
                    </p>
                  )}
                  <div className="transcription-item-actions">
                    {item.outputs.map((output) => (
                      <button
                        className="text-button"
                        key={output.format}
                        disabled={working === item.id}
                        onClick={() =>
                          void command(item.id, () =>
                            desktop().transcriptions.openOutput(item.id, output.format),
                          )
                        }
                      >
                        Abrir {output.format.toUpperCase()}
                      </button>
                    ))}
                    {!!item.outputs.length && (
                      <button
                        className="text-button"
                        onClick={() =>
                          void command(item.id, () =>
                            desktop().transcriptions.showOutput(item.id, item.outputs[0].format),
                          )
                        }
                      >
                        <FolderOpen size={14} />
                        Mostrar na pasta
                      </button>
                    )}
                    {canRetry && (
                      <button
                        className="text-button"
                        disabled={!!working}
                        onClick={() =>
                          void command(item.id, () => desktop().transcriptions.retry(item.id))
                        }
                      >
                        {item.status === 'completed' ? 'Limpar temporários' : 'Tentar novamente'}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        className="text-button"
                        disabled={working === item.id}
                        onClick={() =>
                          void command(item.id, () => desktop().transcriptions.cancel(item.id))
                        }
                      >
                        <X size={14} />
                        {active ? 'Cancelar' : 'Remover da fila'}
                      </button>
                    )}
                  </div>
                  {item.outputs.length > 0 && (
                    <details className="transcription-result-path">
                      <summary>
                        Arquivos salvos{item.status !== 'completed' ? ' · resultado parcial' : ''}
                      </summary>
                      {item.outputs.map((output) => (
                        <p key={output.path}>{output.path}</p>
                      ))}
                    </details>
                  )}
                </article>
              );
            })
          )}
        </div>
        <div className="transcription-queue-footer">
          <Cpu size={14} />
          Uma transcrição por vez para controlar o uso de memória. O texto gerado pode precisar de
          revisão.
        </div>
      </section>
    </section>
  );
}
