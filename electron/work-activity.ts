export interface WorkActivity {
  downloadBusy: boolean;
  downloadsMode: 'paused' | 'running' | 'pausing';
  transcriptionBusy: boolean;
  transcriptionMode: 'paused' | 'running' | 'pausing';
  modelBusy: boolean;
  cleanupPending: boolean;
  metadataBusy: boolean;
  pendingIpc: number;
}
export function workActivity(input: Partial<WorkActivity>) {
  const busy = !!(
    input.downloadBusy ||
    input.transcriptionBusy ||
    input.modelBusy ||
    input.cleanupPending ||
    input.metadataBusy ||
    input.pendingIpc ||
    (input.downloadsMode && input.downloadsMode !== 'paused') ||
    (input.transcriptionMode && input.transcriptionMode !== 'paused')
  );
  return { busy, canInstall: !busy };
}
export async function shutdownWork(operations: (() => Promise<void>)[]): Promise<void> {
  const results = await Promise.allSettled(
    operations.map((operation) => Promise.resolve().then(operation)),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
