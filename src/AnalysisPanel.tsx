import { useEffect, useRef, type ReactNode } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  Folder,
  ListPlus,
  LoaderCircle,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import type {
  AudioMode,
  DownloadPreferences,
  MediaKind,
  VideoInfo,
  VideoMode,
} from '../shared/types';
import { preferredOption } from '../shared/preferences';
export function AnalysisPanel({
  info,
  kind,
  videoMode,
  audioMode,
  optionId,
  destination,
  busy,
  directoryBusy,
  adding,
  preferences,
  setKind,
  setVideoMode,
  setAudioMode,
  setOptionId,
  remember,
  chooseDirectory,
  addCurrent,
  formatSize,
  formatDuration,
}: {
  info: VideoInfo;
  kind: MediaKind;
  videoMode: VideoMode;
  audioMode: AudioMode;
  optionId: string;
  destination: string;
  busy: boolean;
  directoryBusy: boolean;
  adding: boolean;
  preferences: DownloadPreferences;
  setKind: (value: MediaKind) => void;
  setVideoMode: (value: VideoMode) => void;
  setAudioMode: (value: AudioMode) => void;
  setOptionId: (value: string) => void;
  remember: (value: Partial<DownloadPreferences>) => void;
  chooseDirectory: () => Promise<void>;
  addCurrent: () => Promise<void>;
  formatSize: (value?: number) => string | undefined;
  formatDuration: (value: number) => string;
}) {
  const options = info[videoMode],
    selected = options.find((option) => option.id === optionId);
  return (
    <div className="video-content">
      <article className="video-card">
        <div className="thumbnail">
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Video size={28} />
          )}
          <span>{formatDuration(info.duration)}</span>
        </div>
        <div className="video-details">
          <span className="source-label">
            <span className="youtube-mark">
              <span />
            </span>
            YOUTUBE<span className="source-dot">·</span>VÍDEO ENCONTRADO
          </span>
          <h2 title={info.title}>{info.title}</h2>
          <p>{info.channel}</p>
        </div>
        <span className="found-check" title="Vídeo analisado">
          <Check size={17} />
        </span>
      </article>

      <>
        <fieldset className="download-options" disabled={busy || directoryBusy}>
          <legend className="sr-only">Opções de download</legend>
          <div className="segment" aria-label="Tipo de download">
            <button
              type="button"
              aria-pressed={kind === 'video'}
              className={kind === 'video' ? 'active' : ''}
              disabled={!info.original.length}
              onClick={() => {
                setKind('video');
                remember({ kind: 'video' });
              }}
            >
              <Video size={17} />
              Vídeo
            </button>
            <button
              type="button"
              aria-pressed={kind === 'audio'}
              className={kind === 'audio' ? 'active' : ''}
              disabled={!info.audio}
              onClick={() => {
                setKind('audio');
                remember({ kind: 'audio' });
              }}
            >
              <AudioLines size={17} />
              Áudio
            </button>
          </div>
          <div className="option-grid">
            {kind === 'video' ? (
              <>
                <div className="select-group">
                  <label htmlFor="video-mode">Formato</label>
                  <div className="select-wrap">
                    <select
                      id="video-mode"
                      value={videoMode}
                      onChange={(event) => {
                        const mode = event.target.value as VideoMode;
                        setVideoMode(mode);
                        setOptionId(preferredOption(info[mode], preferences.quality)?.id ?? '');
                        remember({ videoMode: mode });
                      }}
                    >
                      <option value="compatible" disabled={!info.compatible.length}>
                        Compatível · MP4
                      </option>
                      <option value="original">Original · sem reconversão</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <p>
                    {videoMode === 'compatible'
                      ? 'H.264 + AAC, para mais dispositivos.'
                      : 'Preserva os codecs disponíveis na fonte.'}
                  </p>
                </div>
                <div className="select-group">
                  <label htmlFor="video-quality">Qualidade</label>
                  <div className="select-wrap">
                    <select
                      id="video-quality"
                      value={optionId}
                      onChange={(event) => {
                        const option = options.find((option) => option.id === event.target.value);
                        setOptionId(event.target.value);
                        if (option)
                          remember({
                            quality: { height: option.height, fps: option.fps },
                          });
                      }}
                    >
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {option.container.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <p>
                    {selected?.estimatedSize
                      ? `Tamanho estimado: ${formatSize(selected.estimatedSize)}`
                      : 'Somente resoluções disponíveis no vídeo.'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="select-group">
                  <label htmlFor="audio-format">Formato do áudio</label>
                  <div className="select-wrap">
                    <select
                      id="audio-format"
                      value={audioMode}
                      onChange={(event) => {
                        const mode = event.target.value as AudioMode;
                        setAudioMode(mode);
                        remember({ audioMode: mode });
                      }}
                    >
                      <option value="original">
                        Original · {info.audio?.extension.toUpperCase()}
                      </option>
                      <option value="mp3">MP3 · alta qualidade</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                  <p>
                    {audioMode === 'original'
                      ? 'Sem conversão, preservando a fonte.'
                      : 'Conversão com qualidade variável alta.'}
                  </p>
                </div>
                <div className="audio-note">
                  <AudioLines size={24} />
                  <span>
                    {audioMode === 'original'
                      ? 'O som, como ele veio.'
                      : 'Sua música vai com você.'}
                    <small>
                      {audioMode === 'original'
                        ? 'Preserve a qualidade disponível.'
                        : 'Compatível com mais reprodutores.'}
                    </small>
                  </span>
                </div>
              </>
            )}
          </div>
        </fieldset>
        <div className="destination">
          <Folder size={18} />
          <div>
            <span>Salvar em</span>
            <p title={destination}>{destination || 'Pasta Downloads'}</p>
          </div>
          <button
            className="text-button"
            disabled={busy || directoryBusy}
            onClick={() => void chooseDirectory()}
          >
            {directoryBusy ? 'Selecionando…' : 'Alterar'}
          </button>
        </div>
      </>

      <div className="download-action">
        <span>
          <ShieldCheck size={15} />O download começa ao iniciar a fila
        </span>
        <button
          className="primary"
          onClick={() => void addCurrent()}
          disabled={adding || directoryBusy || (kind === 'video' ? !selected : !info.audio)}
        >
          {adding ? <LoaderCircle size={17} className="spin" /> : <ListPlus size={18} />}
          Adicionar à fila
        </button>
      </div>
    </div>
  );
}
export function AnalysisDialog({
  children,
  busy,
  onClose,
}: {
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog analysis-dialog"
      aria-labelledby="analysis-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">SUAS OPÇÕES</span>
          <h2 id="analysis-title">Opções do vídeo</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar análise"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
