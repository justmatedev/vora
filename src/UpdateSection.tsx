import { useEffect, useState } from 'react';
import { Download, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { UpdateSnapshot } from '../shared/types';

export function useUpdates() {
  const [state, setState] = useState<UpdateSnapshot>({
    status: 'idle',
    currentVersion: '',
    canInstall: false,
  });
  useEffect(() => {
    if (!window.vora) return;
    let active = true,
      received = false;
    const unsubscribe = window.vora.onUpdate((snapshot) => {
      received = true;
      if (active) setState(snapshot);
    });
    void window.vora
      .updates()
      .then((snapshot) => {
        if (active && !received) setState(snapshot);
      })
      .catch(() => {
        if (active)
          setState({
            status: 'unavailable',
            currentVersion: '',
            canInstall: false,
            message: 'Não foi possível consultar as atualizações. Use a página de versões.',
          });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}

export function UpdateSection({ state }: { state: UpdateSnapshot }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const running = ['checking', 'downloading', 'installing'].includes(state.status);
  async function action(
    command: 'checkForUpdates' | 'downloadUpdate' | 'installUpdate' | 'openReleases',
  ) {
    setError('');
    setPending(true);
    try {
      if (!window.vora) throw new Error('Abra o Vora pelo aplicativo desktop para atualizar.');
      await window.vora[command]();
    } catch (error) {
      setError(
        (error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''),
      );
    } finally {
      setPending(false);
    }
  }
  const message =
    state.message ??
    {
      idle: 'O Vora verifica novas versões ao abrir. Você decide quando baixar e instalar.',
      checking: 'Verificando novas versões…',
      current: 'Você está usando a versão mais recente.',
      available: `Vora ${state.version} disponível.`,
      downloading: 'Baixando atualização…',
      downloaded: 'Atualização pronta para instalar.',
      installing: 'Preparando a atualização e o reinício…',
      unavailable: 'Use a página de versões para atualizar manualmente.',
      error: 'Não foi possível concluir a atualização.',
    }[state.status];
  return (
    <section className="update-section" aria-labelledby="updates-title">
      <h3 id="updates-title">Atualizações</h3>
      {state.currentVersion && (
        <p className="modal-description">Versão atual: {state.currentVersion}</p>
      )}
      <p className="update-status" role="status">
        {running && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
        {message}
      </p>
      {state.status === 'downloading' && (
        <div className="update-progress">
          <progress max={100} value={state.percent} aria-label="Download da atualização" />
          <span>
            {state.percent === undefined ? 'Baixando…' : `${Math.floor(state.percent)}%`}
            {state.bytesPerSecond
              ? ` · ${(state.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
              : ''}
          </span>
        </div>
      )}
      {state.notes && ['available', 'downloading', 'downloaded'].includes(state.status) && (
        <details className="update-notes">
          <summary>O que mudou</summary>
          <p>{state.notes}</p>
        </details>
      )}
      {state.status === 'downloaded' && !state.canInstall && (
        <p className="modal-footnote">
          Pause a fila e aguarde a operação atual terminar para instalar. Os itens pendentes serão
          preservados.
        </p>
      )}
      <div className="update-actions">
        {state.status === 'available' ? (
          <button
            className="primary"
            disabled={pending}
            onClick={() => void action('downloadUpdate')}
          >
            <Download size={16} />
            Baixar atualização
          </button>
        ) : state.status === 'downloaded' || state.status === 'installing' ? (
          <button
            className="primary"
            disabled={pending || !state.canInstall}
            onClick={() => void action('installUpdate')}
          >
            <RefreshCw size={16} />
            Reiniciar e atualizar
          </button>
        ) : !running ? (
          <button
            className="secondary"
            disabled={pending}
            onClick={() => void action('checkForUpdates')}
          >
            <RefreshCw size={16} />
            {state.status === 'error' ? 'Tentar novamente' : 'Verificar atualização'}
          </button>
        ) : null}
        <button
          className="text-button"
          disabled={state.status === 'installing'}
          onClick={() => void action('openReleases')}
        >
          <ExternalLink size={14} />
          Ver versões no GitHub
        </button>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
