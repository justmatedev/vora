import { useEffect, useState } from 'react';
import type { TranscriptionSnapshot, ModelSnapshot } from '../shared/transcription-types';
export function transcriptionMessage(error: unknown) {
  return (error instanceof Error ? error.message : 'Não foi possível concluir a operação.').replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    '',
  );
}
interface SnapshotService<T> {
  snapshot(): Promise<T>;
  onChange(callback: (snapshot: T) => void): () => void;
}
function useRemoteSnapshot<T>(kind: 'transcriptions' | 'models', initial: T) {
  const [snapshot, setSnapshot] = useState(initial),
    [error, setError] = useState('');
  useEffect(() => {
    const service = window.vora?.[kind] as SnapshotService<T> | undefined;
    if (!service) {
      setError('Abra o Vora pelo aplicativo desktop para usar transcrições.');
      return;
    }
    let active = true,
      revision = 0;
    const off = service.onChange((value) => {
      revision++;
      if (active) setSnapshot(value);
    });
    const before = revision;
    void service
      .snapshot()
      .then((value) => {
        if (active && before === revision) setSnapshot(value);
      })
      .catch((error) => {
        if (active) setError(transcriptionMessage(error));
      });
    return () => {
      active = false;
      off();
    };
  }, [kind]);
  return { snapshot, error };
}
const empty: TranscriptionSnapshot = { schemaVersion: 1, mode: 'paused', items: [] };
export function useTranscriptions() {
  return useRemoteSnapshot('transcriptions', empty);
}
export function useWhisperModels() {
  return useRemoteSnapshot<ModelSnapshot | undefined>('models', undefined);
}
export function storageBytes(value: number) {
  return value >= 2 ** 30
    ? `${(value / 2 ** 30).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GiB`
    : `${(value / 2 ** 20).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB`;
}
export function audioDuration(ms: number) {
  const total = Math.floor(ms / 1000),
    hours = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60,
    seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
