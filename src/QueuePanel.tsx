import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ListOrdered, ListPlus, Pause, Play, Search, X } from 'lucide-react';
import type { QueueSnapshot, QueueGroup } from '../shared/types';
import { EditGroupDialog } from './EditGroupDialog';
import { ActiveDownload, QueueRow } from './QueueItemView';
import { QueueGroupHeader } from './QueueGroupHeader';
import { queueView, toggleExpanded, type QueueFilter } from './queue-view';
import { desktop } from './queue-client';
export { configurationLabel } from './QueueGroupHeader';

export function QueuePanel({
  snapshot,
  working,
  error,
  command,
  formatSize,
  formatEta,
}: {
  snapshot: QueueSnapshot;
  working: boolean;
  error: string;
  command: (action: () => Promise<unknown>) => Promise<void>;
  formatSize: (value: number) => string;
  formatEta: (value: number) => string;
}) {
  const [open, setOpen] = useState(true),
    [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState<QueueFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<QueueGroup>();
  const [cancellingId, setCancellingId] = useState<string>();
  const hasItems = snapshot.items.length > 0;
  useEffect(() => {
    if (!hasItems) {
      setOpen(true);
      setPage(0);
      setQuery('');
      setFilter('all');
      setExpanded(new Set());
    }
  }, [hasItems]);
  const pending = snapshot.items.filter((item) => item.status === 'waiting');
  const completed = snapshot.items.filter((item) => item.status === 'completed').length;
  const active = snapshot.items.find((item) => item.id === snapshot.activeId);
  const view = useMemo(() => queueView(snapshot, query, filter), [snapshot, query, filter]);
  const lastPage = Math.max(0, Math.ceil(view.rows.length / 100) - 1),
    currentPage = Math.min(page, lastPage);
  const visible = view.rows.slice(currentPage * 100, (currentPage + 1) * 100);
  const reorderDisabled = !!query.trim() || filter !== 'all';
  useEffect(() => {
    setPage((value) => Math.min(value, lastPage));
  }, [lastPage]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentPage, query, filter]);
  async function cancel() {
    if (!active) return;
    setCancellingId(active.id);
    try {
      await command(() => desktop().cancelItem(active.id));
    } finally {
      setCancellingId(undefined);
    }
  }
  function clearFilters() {
    setQuery('');
    setFilter('all');
    setPage(0);
  }
  if (!hasItems)
    return (
      <section className="queue-panel queue-layout" aria-label="Fila de downloads">
        <div className="queue-header">
          <h2 className="queue-empty-heading">
            <ListOrdered size={18} />
            Fila
          </h2>
        </div>
        {error && (
          <p className="queue-error" role="alert">
            {error}
          </p>
        )}
        <div className="queue-empty-state">
          <div className="queue-empty-icon">
            <ListPlus size={30} strokeWidth={1.5} />
          </div>
          <h2>Adicione um link para começar</h2>
          <p>
            Cole o link de um vídeo no campo acima ou use <strong>Adicionar links</strong> para
            importar vários vídeos e playlists.
          </p>
        </div>
      </section>
    );
  return (
    <section className="queue-panel queue-layout" aria-label="Fila de downloads">
      <div className="queue-header">
        <button
          className="queue-toggle"
          aria-expanded={open}
          aria-label="Recolher ou expandir fila"
          onClick={() => setOpen(!open)}
        >
          <ListOrdered size={18} />
          <span>
            Fila <small>{snapshot.items.length}</small>
          </span>
          <ChevronDown size={15} className={open ? 'expanded' : ''} />
        </button>
        <span className="queue-summary">
          {active ? '1 em andamento · ' : ''}
          {pending.length} aguardando · {completed} concluído{completed === 1 ? '' : 's'}
          <span className="queue-run-status" role="status">
            {snapshot.mode === 'pausing'
              ? 'Pausando após o atual'
              : snapshot.mode === 'running'
                ? 'Fila em execução'
                : 'Fila pausada'}
          </span>
        </span>
        <div className="queue-controls">
          {snapshot.mode === 'running' ? (
            <button
              className="secondary"
              disabled={working}
              onClick={() => void command(() => desktop().pauseQueue())}
            >
              <Pause size={14} />
              Pausar após o atual
            </button>
          ) : (
            <button
              className="primary"
              disabled={working || (!pending.length && !active)}
              onClick={() => void command(() => desktop().startQueue())}
            >
              <Play size={14} />
              {completed || snapshot.items.some((item) => item.status !== 'waiting')
                ? 'Continuar fila'
                : 'Iniciar fila'}
            </button>
          )}
        </div>
      </div>
      {snapshot.pauseReason && (
        <p className="queue-warning" role="status">
          {snapshot.pauseReason}
        </p>
      )}
      {error && (
        <p className="queue-error" role="alert">
          {error}
        </p>
      )}
      {active && (
        <ActiveDownload
          key={active.id}
          item={active}
          cancelling={cancellingId === active.id}
          working={working}
          cancel={() => void cancel()}
          formatSize={formatSize}
          formatEta={formatEta}
        />
      )}
      {open && (
        <>
          <div className="queue-filters">
            <div className="queue-search">
              <Search size={15} />
              <input
                aria-label="Buscar na fila"
                placeholder="Buscar título, canal ou link"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setQuery('');
                    setPage(0);
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="queue-filter-buttons" role="group" aria-label="Filtros da fila">
              {(
                [
                  ['all', 'Todos'],
                  ['waiting', 'Aguardando'],
                  ['completed', 'Concluídos'],
                  ['failed', 'Com erro'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className="text-button"
                  aria-pressed={filter === value}
                  onClick={() => {
                    setFilter(value);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="queue-results-bar">
            <span>
              {view.rows.length} de {view.total} itens na lista
            </span>
            {completed > 0 && (
              <button
                className="text-button"
                disabled={working}
                onClick={() => void command(() => desktop().clearCompleted())}
              >
                Limpar concluídos
              </button>
            )}
          </div>
          <div className="queue-items" ref={listRef} aria-label="Itens da fila" tabIndex={0}>
            {!visible.length && (
              <div className="queue-no-results">
                <Search size={24} />
                <p>
                  {reorderDisabled
                    ? 'Nenhum item corresponde à busca e ao filtro.'
                    : active
                      ? 'Os próximos itens aparecerão aqui.'
                      : 'Nenhum item nesta lista.'}
                </p>
                {reorderDisabled && (
                  <button className="text-button" onClick={clearFilters}>
                    Limpar busca e filtros
                  </button>
                )}
              </div>
            )}
            {visible.map((row, index) => {
              const group = snapshot.groups.find((group) => group.id === row.item.groupId);
              return (
                <Fragment key={row.item.id}>
                  {group && (index === 0 || row.block !== visible[index - 1].block) && (
                    <QueueGroupHeader
                      group={group}
                      continuation={
                        row.continuation ||
                        (index === 0 &&
                          currentPage > 0 &&
                          view.rows[currentPage * 100 - 1]?.block === row.block)
                      }
                      editable={pending.some((item) => item.groupId === group.id)}
                      working={working}
                      edit={() => setEditingGroup(group)}
                    />
                  )}
                  <QueueRow
                    item={row.item}
                    expanded={expanded.has(row.item.id)}
                    toggle={() => setExpanded((current) => toggleExpanded(current, row.item.id))}
                    working={working}
                    command={command}
                    canMoveUp={pending[0]?.id !== row.item.id}
                    canMoveDown={pending.at(-1)?.id !== row.item.id}
                    reorderDisabled={reorderDisabled}
                    formatSize={formatSize}
                    formatEta={formatEta}
                  />
                </Fragment>
              );
            })}
          </div>
          {view.rows.length > 100 && (
            <div className="pagination">
              <button
                className="text-button"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {currentPage + 1} de {lastPage + 1}
              </span>
              <button
                className="text-button"
                disabled={currentPage >= lastPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {editingGroup && (
        <EditGroupDialog
          key={editingGroup.id}
          group={editingGroup}
          pendingCount={pending.filter((item) => item.groupId === editingGroup.id).length}
          onClose={() => setEditingGroup(undefined)}
        />
      )}
    </section>
  );
}
