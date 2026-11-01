import type { QueueItem, QueueSnapshot } from '../shared/types';
export type QueueFilter = 'all' | 'waiting' | 'completed' | 'failed';
export const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
export function queueView(snapshot: QueueSnapshot, query: string, filter: QueueFilter) {
  const search = normalizeSearch(query.trim());
  const remaining = snapshot.items.filter((item) => item.id !== snapshot.activeId);
  const seen = new Set<string>();
  let previous: string | undefined,
    block = 0,
    continuation = false;
  const rows = remaining
    .map((item) => {
      if (item.groupId !== previous) {
        block++;
        continuation = seen.has(item.groupId);
        seen.add(item.groupId);
        previous = item.groupId;
      }
      return { item, block, continuation };
    })
    .filter(
      ({ item }) =>
        (filter === 'all' || item.status === filter) &&
        (!search ||
          normalizeSearch(`${item.title} ${item.preview?.channel ?? ''} ${item.url}`).includes(
            search,
          )),
    );
  return { rows, total: remaining.length };
}
export function toggleExpanded(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
export const folderLabel = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) || path;
export function statusLabel(item: QueueItem) {
  if (item.status === 'downloading' && item.progress && item.progress.stage !== 'downloading')
    return 'Processando';
  return {
    waiting: 'Aguardando',
    analyzing: 'Analisando',
    downloading: 'Baixando',
    processing: 'Processando',
    retrying: 'Nova tentativa',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
    interrupted: 'Interrompido',
  }[item.status];
}
