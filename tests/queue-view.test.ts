import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueView, folderLabel, toggleExpanded } from '../src/queue-view';
import type { QueueItem, QueueSnapshot } from '../shared/types';
const item = (id: string, groupId = 'a', status: QueueItem['status'] = 'waiting'): QueueItem => ({
  id,
  groupId,
  title: id,
  status,
  url: `https://www.youtube.com/watch?v=${id}`,
  destination: '/tmp',
  preferences: { kind: 'video', videoMode: 'original', audioMode: 'original' },
});
test('busca ignora acentos e caixa e combina título, canal, URL e filtro', () => {
  const first = {
    ...item('one'),
    title: 'Música ÁGUA',
    preview: { title: 'Música ÁGUA', channel: 'Canal Épico' },
  };
  const snapshot: QueueSnapshot = {
    mode: 'paused',
    groups: [],
    items: [first, { ...item('two', 'b', 'failed'), title: 'Água' }],
  };
  assert.equal(queueView(snapshot, 'MUSICA agua', 'all').rows.length, 1);
  assert.equal(queueView(snapshot, 'epico', 'waiting').rows[0].item.id, 'one');
  assert.equal(queueView(snapshot, 'watch?v=one', 'all').rows.length, 1);
  assert.equal(queueView(snapshot, 'agua', 'failed').rows[0].item.id, 'two');
  assert.equal(queueView(snapshot, 'ausente', 'all').rows.length, 0);
});
test('blocos mantêm ordem global e continuação, inclusive quando a busca oculta blocos intermediários', () => {
  const snapshot: QueueSnapshot = {
    mode: 'paused',
    groups: [],
    items: [item('first'), item('middle', 'b'), item('last')],
  };
  const rows = queueView(snapshot, '', 'all').rows;
  assert.deepEqual(
    rows.map(({ item }) => item.id),
    ['first', 'middle', 'last'],
  );
  assert.deepEqual(
    rows.map(({ continuation }) => continuation),
    [false, false, true],
  );
  snapshot.items[0].title = 'Visível';
  snapshot.items[2].title = 'Visível';
  const filtered = queueView(snapshot, 'visivel', 'all').rows;
  assert.equal(filtered.length, 2);
  assert.notEqual(filtered[0].block, filtered[1].block);
  assert.equal(filtered[1].continuation, true);
});
test('ativo é retirado da lista sem reordenar demais itens; filtro precede paginação', () => {
  const snapshot: QueueSnapshot = {
    mode: 'running',
    groups: [],
    activeId: 'active',
    items: [
      item('active'),
      ...Array.from({ length: 205 }, (_, i) =>
        item(`item${i}`, 'a', i % 2 ? 'failed' : 'completed'),
      ),
    ],
  };
  const rows = queueView(snapshot, '', 'completed').rows;
  assert.equal(rows.length, 103);
  assert.equal(rows.slice(100).length, 3);
  assert.equal(rows[100].item.id, 'item200');
  assert.equal(queueView(snapshot, 'active', 'all').rows.length, 0);
  assert.equal(queueView(snapshot, '', 'all').total, 205);
});
test('detalhes são identificados pelo item e nomes de pasta suportam Linux e Windows', () => {
  const opened = toggleExpanded(new Set(), 'a');
  assert.ok(opened.has('a'));
  assert.ok(toggleExpanded(opened, 'b').has('a'));
  assert.ok(!toggleExpanded(opened, 'a').has('a'));
  assert.equal(folderLabel('/home/teste/Vídeos'), 'Vídeos');
  assert.equal(folderLabel('C:\\Users\\Teste\\Downloads'), 'Downloads');
});
