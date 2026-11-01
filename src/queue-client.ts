import { useEffect, useState } from 'react';
import type { QueueSnapshot, VoraAPI } from '../shared/types';
export function desktop(): VoraAPI {
  if (!window.vora)
    throw new Error('Abra o Vora pelo aplicativo desktop para analisar e baixar vídeos.');
  return window.vora;
}
export function message(error: unknown) {
  return (error instanceof Error ? error.message : 'Não foi possível concluir a operação.').replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
}
export function useQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({
    groups: [],
    items: [],
    mode: 'paused',
  });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!window.vora) return;
    let active = true,
      updates = 0;
    const offQueue = window.vora.onQueue((value) => {
      updates++;
      if (active) setSnapshot(value);
    });
    const offJob = window.vora.onJob((event) => {
      if (!active || event.type !== 'progress' || !event.itemId) return;
      setSnapshot((value) => ({
        ...value,
        items: value.items.map((item) =>
          item.id === event.itemId ? { ...item, progress: event } : item,
        ),
      }));
    });
    const before = updates;
    void window.vora
      .queue()
      .then((value) => {
        if (active && updates === before) setSnapshot(value);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
      offQueue();
      offJob();
    };
  }, []);
  async function command(action: () => Promise<unknown>) {
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(message(error));
    } finally {
      setWorking(false);
    }
  }
  return { snapshot, error, setError, working, command };
}
