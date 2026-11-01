import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DesktopNotifier, notificationText } from '../electron/notifications';
import { failureReason } from '../electron/failures';

class Notice extends EventEmitter {
  shown = false;
  closed = false;
  show() {
    this.shown = true;
  }
  close() {
    this.closed = true;
    this.emit('close');
  }
}
test('notificações resumem resultados e clique traz a janela; atenção mostra a causa', () => {
  const sent: { title: string; body: string; silent: boolean; notice: Notice }[] = [];
  let focused = 0;
  const service = new DesktopNotifier({
    enabled: () => true,
    supported: () => true,
    create: (options) => {
      const notice = new Notice();
      sent.push({ ...options, notice });
      return notice;
    },
    focus: () => {
      focused++;
    },
  });
  service.queue({ type: 'finished', completed: 2, failed: 1, cancelled: 1 });
  assert.equal(sent[0].title, 'Fila finalizada com erros');
  assert.match(sent[0].body, /2 concluídos · 1 com erro · 1 cancelado/);
  assert.equal(sent[0].silent, true);
  assert.equal(sent[0].notice.shown, true);
  sent[0].notice.emit('click');
  assert.equal(focused, 1);
  service.queue({ type: 'attention', message: 'Sem espaço no disco.' });
  assert.match(sent[1].body, /Sem espaço/);
  assert.equal(
    notificationText({ type: 'finished', completed: 1, failed: 0, cancelled: 0 }).title,
    'Fila finalizada',
  );
});
test('preferência e suporte impedem notificações; falhas do sistema não afetam a fila', () => {
  let enabled = false,
    supported = true,
    calls = 0;
  const service = new DesktopNotifier({
    enabled: () => enabled,
    supported: () => supported,
    create: () => {
      calls++;
      throw new Error('Sistema indisponível');
    },
    focus: () => {},
  });
  service.queue({ type: 'finished', completed: 1, failed: 0, cancelled: 0 });
  assert.equal(calls, 0);
  assert.throws(() => service.test(), /Ative/);
  enabled = true;
  supported = false;
  assert.throws(() => service.test(), /não estão disponíveis/);
  service.queue({ type: 'attention', message: 'Erro' });
  assert.equal(calls, 0);
  supported = true;
  assert.doesNotThrow(() => service.queue({ type: 'attention', message: 'Erro' }));
  assert.equal(calls, 1);
  assert.throws(() => service.test(), /Não foi possível enviar/);
});
test('notificações mantêm referências limitadas e tratam falha assíncrona', () => {
  const notices: Notice[] = [];
  const service = new DesktopNotifier({
    enabled: () => true,
    supported: () => true,
    create: () => {
      const notice = new Notice();
      notices.push(notice);
      return notice;
    },
    focus: () => {},
  });
  for (let i = 0; i < 4; i++) service.test();
  assert.equal(notices[0].closed, true);
  notices[1].emit('failed', 'Sem serviço');
  service.test();
  assert.equal(notices[2].closed, false);
});
test('somente falhas transitórias são classificadas para nova tentativa', () => {
  for (const message of [
    'Connection timed out',
    'ECONNRESET',
    'HTTP Error 503: unavailable server',
    'Temporary failure in name resolution',
    'IncompleteRead',
  ]) {
    assert.equal(failureReason(message), 'network', message);
  }
  assert.equal(failureReason('HTTP Error 503: Service Unavailable'), 'network');
  for (const message of [
    'Private video',
    'Video unavailable',
    'HTTP Error 403',
    'HTTP Error 429',
    'Requested format is not available',
    'Sign in to confirm you are not a bot',
  ])
    assert.equal(failureReason(message), 'item', message);
  assert.equal(failureReason('HTTP Error 503: Service temporarily down'), 'network');
  assert.equal(failureReason('ENOSPC'), 'space');
  assert.equal(failureReason('EACCES'), 'destination');
});
