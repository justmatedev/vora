import type { QueueNotice } from './queue';

export interface NativeNotice {
  on(event: 'click' | 'close' | 'failed', callback: (...args: unknown[]) => void): unknown;
  show(): void;
  close(): void;
}
interface Dependencies {
  supported(): boolean;
  enabled(): boolean;
  create(options: { title: string; body: string; silent: boolean }): NativeNotice;
  focus(): void;
}
export function notificationText(notice: QueueNotice): { title: string; body: string } {
  if (notice.type === 'attention')
    return { title: 'Vora precisa de atenção', body: notice.message };
  const parts = [`${notice.completed} concluído${notice.completed === 1 ? '' : 's'}`];
  if (notice.failed) parts.push(`${notice.failed} com erro`);
  if (notice.cancelled)
    parts.push(`${notice.cancelled} cancelado${notice.cancelled === 1 ? '' : 's'}`);
  return {
    title: notice.failed ? 'Fila finalizada com erros' : 'Fila finalizada',
    body: `${parts.join(' · ')}. Abra o Vora para conferir.`,
  };
}
export class DesktopNotifier {
  private active = new Set<NativeNotice>();
  constructor(private deps: Dependencies) {}
  queue(notice: QueueNotice) {
    this.show(notificationText(notice));
  }
  test() {
    if (!this.deps.enabled()) throw new Error('Ative as notificações para enviar um teste.');
    if (!this.deps.supported())
      throw new Error('Notificações não estão disponíveis neste ambiente.');
    this.show(
      {
        title: 'Notificações do Vora',
        body: 'Você receberá avisos quando a fila terminar ou precisar de atenção.',
      },
      true,
    );
  }
  private show(text: { title: string; body: string }, strict = false) {
    try {
      if (!this.deps.enabled() || !this.deps.supported()) return;
      while (this.active.size >= 3) {
        const oldest = this.active.values().next().value!;
        this.active.delete(oldest);
        oldest.close();
      }
      const notice = this.deps.create({ ...text, silent: true });
      this.active.add(notice);
      notice.on('click', () => {
        this.deps.focus();
        this.active.delete(notice);
      });
      notice.on('close', () => this.active.delete(notice));
      notice.on('failed', (...args) => {
        this.active.delete(notice);
        console.error('[Vora/notificação]', ...args);
      });
      notice.show();
    } catch (error) {
      console.error('[Vora/notificação]', error);
      if (strict)
        throw new Error(
          'Não foi possível enviar a notificação. Verifique as configurações do sistema.',
        );
    }
  }
}
