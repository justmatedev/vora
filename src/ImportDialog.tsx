import { useEffect, useMemo, useRef, useState } from 'react';
import { Clipboard, Folder, ListPlus, LoaderCircle, X } from 'lucide-react';
import type {
  DownloadPreferences,
  PlaylistPage,
  PlaylistSummary,
  QueueAddResult,
} from '../shared/types';
import { youtubeSource } from '../shared/youtube';
import { GroupOptions } from './GroupOptions';
import { desktop, message } from './queue-client';

export function ImportDialog({
  initial,
  preferences,
  destination,
  chooseDirectory,
  onAdded,
  onClose,
  formatDuration,
}: {
  initial: string;
  preferences: DownloadPreferences;
  destination: string;
  chooseDirectory: () => Promise<void>;
  onAdded: (result: QueueAddResult) => void;
  onClose: () => void;
  formatDuration: (seconds: number) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    importRef = useRef<string | null>(null);
  const [text, setText] = useState(initial),
    [choice, setChoice] = useState<'video' | 'playlist'>();
  const [config, setConfig] = useState<DownloadPreferences>(() => structuredClone(preferences));
  const [summary, setSummary] = useState<PlaylistSummary>(),
    [data, setData] = useState<PlaylistPage>();
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const parsed = useMemo(() => {
    try {
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      return { lines, sources: lines.map(youtubeSource), error: '' };
    } catch (error) {
      return { lines: [], sources: [], error: message(error) };
    }
  }, [text]);
  const mixed = parsed.sources.some((source) => source.kind === 'mixed');
  const hasPlaylist =
    parsed.sources.some((source) => source.kind === 'playlist') || (mixed && choice === 'playlist');
  async function beginPlaylist(input: string) {
    if (importRef.current) await desktop().playlistDispose(importRef.current);
    const id = crypto.randomUUID();
    importRef.current = id;
    setSummary({ id, title: 'Playlist', count: 0, state: 'loading' });
    setData(undefined);
    setSelected(new Set());
    setPage(0);
    setError('');
    try {
      await desktop().playlistStart(input, id);
    } catch (error) {
      if (importRef.current === id) {
        setError(message(error));
        setSummary((value) => (value ? { ...value, state: 'error' } : value));
      }
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    const off = window.vora?.onPlaylist((event) => {
      if (event.id === importRef.current) setSummary(event);
    });
    if (initial) {
      try {
        if (youtubeSource(initial).kind === 'playlist') void beginPlaylist(initial);
      } catch {
        /* validation shown in the form */
      }
    }
    return () => {
      off?.();
      const id = importRef.current;
      importRef.current = null;
      if (id) void window.vora?.playlistDispose(id).catch(() => {});
      dialog.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!summary) return;
    let active = true;
    void desktop()
      .playlistPage(summary.id, page)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [summary?.id, summary?.count, summary?.state, page]);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (summary) {
        if (summary.state !== 'complete')
          throw new Error('Conclua a consulta antes de adicionar vídeos.');
        onAdded(await desktop().addPlaylist(summary.id, [...selected], config));
      } else {
        if (parsed.error) throw new Error(parsed.error);
        if (!parsed.lines.length) throw new Error('Cole pelo menos um link.');
        if (mixed && !choice) throw new Error('Escolha entre o vídeo e a playlist.');
        if (hasPlaylist) {
          if (parsed.lines.length !== 1)
            throw new Error(
              'Para revisar uma playlist, cole apenas o link dela. Você pode adicionar outros grupos depois.',
            );
          await beginPlaylist(parsed.lines[0]);
          return;
        }
        onAdded(
          await desktop().addLinks(
            parsed.sources.map((source) => source.videoUrl!),
            config,
          ),
        );
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function selectAll() {
    try {
      const indices = await desktop().playlistAvailable(summary!.id);
      setSelected(new Set(indices));
    } catch (error) {
      setError(message(error));
    }
  }
  const loading = summary?.state === 'loading';
  return (
    <dialog
      ref={dialog}
      className="settings-dialog import-dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">UM GRUPO, SUAS ESCOLHAS</span>
          <h2 id="import-title">{summary ? 'Selecionar vídeos da playlist' : 'Adicionar links'}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Fechar importação"
          onClick={onClose}
          disabled={busy}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      {summary ? (
        <div className="playlist-preview">
          <h3>{summary.title}</h3>
          <div className="playlist-summary" role="status">
            <span>
              {loading && <LoaderCircle size={14} className="spin" />}
              {summary.count} itens encontrados · {selected.size} selecionados
              {loading ? ' · consultando…' : ''}
            </span>
            {loading ? (
              <button
                className="text-button"
                onClick={() =>
                  void desktop()
                    .playlistCancel(summary.id)
                    .catch((error) => setError(message(error)))
                }
              >
                Cancelar consulta
              </button>
            ) : (
              <button
                className="text-button"
                disabled={busy || summary.state !== 'complete' || !summary.count}
                onClick={() => void selectAll()}
              >
                Selecionar todos
              </button>
            )}
            {selected.size > 0 && !loading && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </button>
            )}
          </div>
          {(summary.state === 'error' || summary.state === 'cancelled') && (
            <div className="queue-warning">
              {summary.error ?? 'Consulta cancelada. Nenhum item foi adicionado.'}
              <button className="text-button" onClick={() => void beginPlaylist(text)}>
                Consultar novamente
              </button>
            </div>
          )}
          <div className="playlist-entries">
            {data?.entries.map((entry) => (
              <label
                className={`playlist-entry ${!entry.available ? 'unavailable' : ''}`}
                key={entry.index}
              >
                <input
                  type="checkbox"
                  disabled={!entry.available || busy || loading || summary.state !== 'complete'}
                  checked={selected.has(entry.index)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(entry.index);
                      else next.delete(entry.index);
                      return next;
                    });
                  }}
                />
                <span className="entry-index">{entry.index}</span>
                <span className="entry-title">
                  {entry.title}
                  {!entry.available && <small>Indisponível</small>}
                </span>
                <span className="entry-duration">
                  {entry.duration === undefined ? '—' : formatDuration(entry.duration)}
                </span>
              </label>
            ))}
          </div>
          {summary.count > 100 && (
            <div className="pagination">
              <button
                className="text-button"
                disabled={!page || busy}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(summary.count / 100)}
              </span>
              <button
                className="text-button"
                disabled={(page + 1) * 100 >= summary.count || busy}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
          {summary.state === 'complete' && !summary.count && (
            <p className="modal-description">
              Esta playlist não possui itens disponíveis para listar.
            </p>
          )}
        </div>
      ) : (
        <>
          <label className="batch-label" htmlFor="batch-links">
            Links do YouTube <span>Um por linha</span>
          </label>
          <textarea
            id="batch-links"
            value={text}
            disabled={busy}
            rows={5}
            maxLength={131072}
            placeholder="https://www.youtube.com/watch?v=…"
            onChange={(event) => {
              setText(event.target.value);
              setChoice(undefined);
              setError('');
            }}
          />
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void desktop()
                .pasteLink()
                .then(setText)
                .catch((error) => setError(message(error)))
            }
          >
            <Clipboard size={14} />
            Colar links
          </button>
          {mixed && (
            <div className="source-choice">
              <p>O link contém vídeo e playlist. O que deseja adicionar?</p>
              <button
                className={choice === 'video' ? 'secondary selected' : 'secondary'}
                onClick={() => setChoice('video')}
              >
                Somente {parsed.lines.length > 1 ? 'estes vídeos' : 'este vídeo'}
              </button>
              <button
                className={choice === 'playlist' ? 'secondary selected' : 'secondary'}
                disabled={parsed.lines.length !== 1 || !parsed.sources[0]?.playlistUrl}
                onClick={() => setChoice('playlist')}
              >
                Selecionar vídeos da playlist
              </button>
              {parsed.sources.find((source) => source.playlistError)?.playlistError && (
                <small>
                  {parsed.sources.find((source) => source.playlistError)?.playlistError}
                </small>
              )}
            </div>
          )}
        </>
      )}
      <GroupOptions config={config} setConfig={setConfig} disabled={busy} />
      <div className="settings-folder">
        <Folder size={17} />
        <span title={destination}>{destination || 'Downloads'}</span>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void chooseDirectory().catch((error) => setError(message(error)))}
        >
          Alterar
        </button>
      </div>
      {(error || (!summary && parsed.error)) && (
        <p className="queue-error" role="alert">
          {error || parsed.error}
        </p>
      )}
      <div className="import-footer">
        <span>A fila só começa quando você iniciar.</span>
        <button
          className="primary"
          disabled={
            busy ||
            (summary
              ? summary.state !== 'complete' || !selected.size
              : !text.trim() || !!parsed.error || (mixed && !choice))
          }
          onClick={() => void submit()}
        >
          {busy ? <LoaderCircle size={15} className="spin" /> : <ListPlus size={16} />}
          {summary
            ? `Adicionar selecionados (${selected.size})`
            : hasPlaylist
              ? 'Revisar playlist'
              : 'Adicionar à fila'}
        </button>
      </div>
    </dialog>
  );
}
