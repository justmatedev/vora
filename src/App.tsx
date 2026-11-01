import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Clipboard,
  Folder,
  Link2,
  LoaderCircle,
  Settings2,
  X,
  AlertCircle,
  RotateCcw,
  ListPlus,
} from 'lucide-react';
import type {
  AppInfo,
  AudioMode,
  MediaKind,
  VideoInfo,
  VideoMode,
  VoraAPI,
  DownloadPreferences,
  RecoveryItem,
} from '../shared/types';
import { DEFAULT_PREFERENCES, resolvePreferences } from '../shared/preferences';
import { AnalysisPanel, AnalysisDialog } from './AnalysisPanel';
import { TemporaryNotice } from './TemporaryNotice';
import { QueuePanel } from './QueuePanel';
import { ImportDialog } from './ImportDialog';
import { useQueue } from './queue-client';
import { youtubeSource } from '../shared/youtube';
import { RecoveryDialog } from './RecoveryDialog';
import { UpdateSection, useUpdates } from './UpdateSection';
import type { UpdateSnapshot } from '../shared/types';

type Phase = 'idle' | 'analyzing' | 'ready';
const api = (): VoraAPI => {
  if (!window.vora)
    throw new Error('Abra o Vora pelo aplicativo desktop para analisar e baixar vídeos.');
  return window.vora;
};
const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : 'Não foi possível concluir a operação.').replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
export const duration = (seconds: number) => {
  const n = Math.max(0, Math.floor(seconds)),
    h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = n % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};
export const bytes = (n?: number) =>
  n === undefined
    ? undefined
    : n < 1024
      ? `${n} B`
      : n < 1024 ** 2
        ? `${(n / 1024).toFixed(1)} KB`
        : n >= 1024 ** 3
          ? `${(n / 1024 ** 3).toFixed(1)} GB`
          : `${(n / 1024 ** 2).toFixed(1)} MB`;

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M7 7.5 16 25 25 7.5M16 6v16M10.5 17 16 23l5.5-6"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>
        Vora<span className="brand-dot">.</span>
      </span>
    </span>
  );
}

export function App() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<VideoInfo>();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ id: number; text: string }>();
  const confirmationSerial = useRef(0);
  const [destination, setDestination] = useState('');
  const [kind, setKind] = useState<MediaKind>('video');
  const [videoMode, setVideoMode] = useState<VideoMode>('compatible');
  const [audioMode, setAudioMode] = useState<AudioMode>('original');
  const [optionId, setOptionId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const preferences = useRef<DownloadPreferences>({ ...DEFAULT_PREFERENCES });
  const settingsReady = useRef<Promise<unknown>>(Promise.resolve());
  const urlInput = useRef<HTMLInputElement>(null);
  const busy = phase === 'analyzing';
  const queue = useQueue();
  const updates = useUpdates();
  const [importOpen, setImportOpen] = useState(false);
  const [importInitial, setImportInitial] = useState('');
  const [adding, setAdding] = useState(false);
  const options = info?.[videoMode] ?? [];
  const selected = options.find((option) => option.id === optionId);
  const waitingForPreviousProcess = recoveries.some((item) => item.running);

  useEffect(() => {
    if (!recoveryOpen || !waitingForPreviousProcess) return;
    let active = true;
    const timer = setInterval(() => {
      void api()
        .recoveries()
        .then((items) => {
          if (active) setRecoveries(items);
        })
        .catch((error) => {
          if (active) setRecoveryError(errorText(error));
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [recoveryOpen, waitingForPreviousProcess]);

  useEffect(() => {
    if (!window.vora) return;
    let active = true;
    settingsReady.current = window.vora
      .settings()
      .then((value) => {
        if (active) {
          setDestination(value.destination);
          preferences.current = value.preferences;
          setKind(value.preferences.kind);
          setVideoMode(value.preferences.videoMode);
          setAudioMode(value.preferences.audioMode);
        }
      })
      .catch((error) => {
        if (active) setError(errorText(error));
      });
    const refreshRecoveries = () =>
      window
        .vora!.recoveries()
        .then((items) => {
          if (active) setRecoveries(items);
        })
        .catch((error) => {
          if (active) setError(errorText(error));
        });
    void refreshRecoveries();
    const unsubscribe = window.vora.onJob((event) => {
      if (event.type !== 'progress') void refreshRecoveries();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function analyze(input = url) {
    if (busy || directoryBusy || !input.trim()) return;
    try {
      if (youtubeSource(input).kind !== 'video') {
        setImportInitial(input);
        setImportOpen(true);
        return;
      }
    } catch (error) {
      setError(errorText(error));
      return;
    }
    setError('');
    setNotice('');
    setInfo(undefined);
    setPhase('analyzing');
    try {
      await settingsReady.current;
      const video = await api().analyze(input);
      const choice = resolvePreferences(video, preferences.current);
      setInfo(video);
      setAnalysisOpen(true);
      setVideoMode(choice.videoMode);
      setOptionId(choice.option?.id ?? '');
      setKind(choice.kind);
      setAudioMode(preferences.current.audioMode);
      if (
        preferences.current.quality &&
        choice.kind === 'video' &&
        choice.option &&
        (choice.option.height !== preferences.current.quality.height ||
          choice.option.fps !== preferences.current.quality.fps)
      )
        setNotice(
          `A qualidade preferida não está disponível. Selecionamos ${choice.option.label}; sua preferência foi mantida.`,
        );
      setPhase('ready');
    } catch (error) {
      setError(errorText(error));
      setPhase('idle');
    }
  }
  function remember(change: Partial<DownloadPreferences>) {
    setNotice('');
    const next = { ...preferences.current, ...change };
    preferences.current = next;
    void api()
      .savePreferences(next)
      .catch((error) => setError(`Não foi possível salvar as escolhas. ${errorText(error)}`));
  }
  async function cleanupRecovery(item: RecoveryItem, retry: boolean) {
    setRecoveryBusy(true);
    setRecoveryError('');
    try {
      const queued =
        item.queueItemId &&
        queue.snapshot.items.some(
          (row) =>
            row.id === item.queueItemId &&
            ['failed', 'cancelled', 'interrupted'].includes(row.status),
        );
      if (retry && queued) await api().retryItem(item.queueItemId!);
      else await api().cleanupRecovery(item.id);
      setRecoveries(await api().recoveries());
      if (retry) {
        setRecoveryOpen(false);
        setUrl(item.url);
        if (queued) setNotice('O item foi recolocado na fila.');
        else await analyze(item.url);
      }
    } catch (error) {
      setRecoveryError(errorText(error));
    } finally {
      setRecoveryBusy(false);
    }
  }
  async function paste() {
    try {
      const text = await api().pasteLink();
      if (!text.trim()) {
        setNotice('A área de transferência está vazia.');
        return;
      }
      if (text.trim().split(/\r?\n/).filter(Boolean).length > 1) {
        setImportInitial(text.trim());
        setImportOpen(true);
        return;
      }
      setUrl(text.trim());
      setInfo(undefined);
      setPhase('idle');
      setError('');
      setNotice('');
      urlInput.current?.focus();
    } catch (error) {
      setError(errorText(error));
    }
  }
  async function chooseDirectory() {
    setDirectoryBusy(true);
    try {
      const path = await api().chooseDirectory();
      if (path) setDestination(path);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setDirectoryBusy(false);
    }
  }
  function added(result: { added: number; ignored: number }) {
    setAnalysisOpen(false);
    setNotice('');
    setImportOpen(false);
    setImportInitial('');
    setConfirmation({
      id: ++confirmationSerial.current,
      text: `${result.added === 1 ? '1 item adicionado' : `${result.added} itens adicionados`} à fila.${result.ignored ? ` ${result.ignored === 1 ? '1 link repetido ignorado' : `${result.ignored} links repetidos ignorados`}.` : ''}${queue.snapshot.mode === 'paused' ? ' Inicie ou continue a fila para baixar.' : ''}`,
    });
  }
  async function addCurrent() {
    if (!info || busy || adding) return;
    setAdding(true);
    setError('');
    try {
      added(
        await api().addLinks([info.url], {
          kind,
          videoMode,
          audioMode,
          ...(selected
            ? { quality: { height: selected.height, fps: selected.fps } }
            : preferences.current.quality
              ? { quality: preferences.current.quality }
              : {}),
        }),
      );
    } catch (error) {
      setError(errorText(error));
    } finally {
      setAdding(false);
    }
  }
  async function queueCommand(action: () => Promise<unknown>) {
    await queue.command(action);
    try {
      setRecoveries(await api().recoveries());
    } catch (error) {
      setError(errorText(error));
    }
  }

  return (
    <div className="app-shell compact-layout">
      <header className="app-header">
        <Logo />
        <div className="header-right">
          {['available', 'downloading', 'downloaded'].includes(updates.status) && (
            <button className="update-badge" disabled={busy} onClick={() => setSettingsOpen(true)}>
              {updates.status === 'downloaded'
                ? 'Atualização pronta'
                : updates.status === 'downloading'
                  ? 'Baixando atualização'
                  : 'Nova versão disponível'}
            </button>
          )}
          <span className="local-badge">
            <span />
            No seu computador
          </span>
          <button
            className="icon-button"
            title="Configurações"
            aria-label="Configurações"
            disabled={busy}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <main>
        {!!recoveries.length && (
          <div className="recovery-banner" role="status">
            <RotateCcw size={19} />
            <div>
              <strong>
                {recoveries.length === 1
                  ? 'Um download foi interrompido'
                  : `${recoveries.length} downloads foram interrompidos`}
              </strong>
              <p>
                {bytes(recoveries.reduce((total, item) => total + item.size, 0))} em temporários de
                sessões anteriores.
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy || recoveryBusy}
              onClick={() => setRecoveryOpen(true)}
            >
              Revisar
            </button>
          </div>
        )}
        <section className="workspace" aria-label="Download do YouTube">
          <form
            className="link-form"
            onSubmit={(event) => {
              event.preventDefault();
              void analyze();
            }}
          >
            <label htmlFor="youtube-url">
              <span>Link do YouTube</span>
              <span className="composer-actions">
                {info && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAnalysisOpen(true)}
                  >
                    Rever opções
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setImportInitial('');
                    setImportOpen(true);
                  }}
                >
                  <ListPlus size={14} />
                  Adicionar links
                </button>
              </span>
            </label>
            <div className="url-row">
              <div className="url-field">
                <Link2 size={19} aria-hidden="true" />
                <input
                  id="youtube-url"
                  aria-label="Link do YouTube"
                  ref={urlInput}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Cole o link do vídeo aqui"
                  value={url}
                  disabled={busy || directoryBusy}
                  maxLength={2048}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setInfo(undefined);
                    setPhase('idle');
                    setError('');
                    setNotice('');
                  }}
                />
                <button
                  type="button"
                  className="paste-button"
                  onClick={() => void paste()}
                  disabled={busy || directoryBusy}
                >
                  <Clipboard size={15} />
                  Colar
                </button>
              </div>
              <button
                type="submit"
                className="primary analyze-button"
                disabled={!url.trim() || busy || directoryBusy}
              >
                {phase === 'analyzing' ? (
                  <>
                    <LoaderCircle size={17} className="spin" />
                    Analisando
                  </>
                ) : (
                  <>
                    Analisar
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </div>
          </form>

          {error && !analysisOpen && (
            <div className="message error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="dismiss" aria-label="Dispensar erro" onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {confirmation && (
            <TemporaryNotice
              key={confirmation.id}
              text={confirmation.text}
              onDismiss={() =>
                setConfirmation((current) =>
                  current?.id === confirmation.id ? undefined : current,
                )
              }
            />
          )}
        </section>

        <QueuePanel
          snapshot={queue.snapshot}
          working={queue.working}
          error={queue.error}
          command={queueCommand}
          formatSize={(value) => bytes(value)!}
          formatEta={duration}
        />
      </main>
      {analysisOpen && info && (
        <AnalysisDialog busy={adding || directoryBusy} onClose={() => setAnalysisOpen(false)}>
          {notice && (
            <p className="analysis-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="queue-error" role="alert">
              {error}
            </p>
          )}
          <AnalysisPanel
            info={info}
            kind={kind}
            videoMode={videoMode}
            audioMode={audioMode}
            optionId={optionId}
            destination={destination}
            busy={busy}
            directoryBusy={directoryBusy}
            adding={adding}
            preferences={preferences.current}
            setKind={setKind}
            setVideoMode={setVideoMode}
            setAudioMode={setAudioMode}
            setOptionId={setOptionId}
            remember={remember}
            chooseDirectory={chooseDirectory}
            addCurrent={addCurrent}
            formatSize={bytes}
            formatDuration={duration}
          />
        </AnalysisDialog>
      )}
      {importOpen && (
        <ImportDialog
          initial={importInitial}
          preferences={preferences.current}
          destination={destination}
          chooseDirectory={chooseDirectory}
          onAdded={added}
          onClose={() => {
            setImportOpen(false);
            setImportInitial('');
          }}
          formatDuration={duration}
        />
      )}
      {recoveryOpen && (
        <RecoveryDialog
          items={recoveries}
          busy={recoveryBusy}
          error={recoveryError}
          onCleanup={(item, retry) => void cleanupRecovery(item, retry)}
          onClose={() => setRecoveryOpen(false)}
          formatSize={(value) => bytes(value)!}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          updates={updates}
          destination={destination}
          chooseDirectory={chooseDirectory}
          directoryBusy={directoryBusy}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  updates,
  destination,
  chooseDirectory,
  directoryBusy,
  onClose,
}: {
  updates: UpdateSnapshot;
  destination: string;
  chooseDirectory: () => Promise<void>;
  directoryBusy: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<AppInfo>();
  const [notifications, setNotifications] = useState<boolean>();
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    try {
      void api()
        .settings()
        .then((value) => {
          if (active) setNotifications(value.notificationsEnabled ?? true);
        })
        .catch((error) => {
          if (active) setNotificationMessage(errorText(error));
        });
      api()
        .info()
        .then((value) => {
          if (active) setInfo(value);
        })
        .catch((error) => {
          if (active) setError(errorText(error));
        });
    } catch (error) {
      setError(errorText(error));
    }
    return () => {
      active = false;
      dialog.current?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">DO SEU JEITO</span>
          <h2 id="settings-title">Configurações</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar configurações"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <UpdateSection state={updates} />
      <section>
        <h3>Pasta de destino</h3>
        <p className="modal-description">Seus próximos downloads serão salvos aqui.</p>
        <div className="settings-folder">
          <Folder size={18} />
          <span title={destination}>{destination || 'Downloads'}</span>
          <button
            className="text-button"
            disabled={directoryBusy}
            onClick={() => void chooseDirectory()}
          >
            Alterar
          </button>
        </div>
      </section>
      <section>
        <h3>Notificações</h3>
        <label className="notification-toggle">
          <input
            type="checkbox"
            checked={notifications ?? true}
            disabled={notificationBusy || notifications === undefined}
            onChange={async (event) => {
              const enabled = event.target.checked;
              setNotificationBusy(true);
              setNotificationMessage('');
              try {
                setNotifications(await api().setNotificationsEnabled(enabled));
              } catch (error) {
                setNotificationMessage(errorText(error));
              } finally {
                setNotificationBusy(false);
              }
            }}
          />
          Avisar quando a fila terminar ou precisar de atenção
        </label>
        <button
          className="text-button"
          disabled={!notifications || notificationBusy}
          onClick={async () => {
            setNotificationBusy(true);
            setNotificationMessage('');
            try {
              await api().testNotification();
              setNotificationMessage('Teste enviado. Confira as notificações do sistema.');
            } catch (error) {
              setNotificationMessage(errorText(error));
            } finally {
              setNotificationBusy(false);
            }
          }}
        >
          Testar notificação
        </button>
        {notificationMessage && (
          <p className="modal-footnote" role="status">
            {notificationMessage}
          </p>
        )}
      </section>
      <section>
        <h3>Aplicativo e ferramentas</h3>
        {error ? (
          <p className="message error">{error}</p>
        ) : !info ? (
          <p className="loading-tools">
            <LoaderCircle size={16} className="spin" />
            Consultando versões…
          </p>
        ) : (
          <div className="version-list">
            <div>
              <span>Vora</span>
              <code>{info.version}</code>
            </div>
            {info.tools.map((tool) => (
              <div key={tool.name}>
                <span>{tool.name}</span>
                <code
                  title={tool.version ?? tool.error}
                  className={tool.error ? 'tool-missing' : ''}
                >
                  {tool.version ?? tool.error}
                </code>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="modal-brand">
        <Logo small />
        <span>Áudio e vídeo, do seu jeito.</span>
      </div>
    </dialog>
  );
}
