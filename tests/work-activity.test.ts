import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workActivity } from '../electron/work-activity';
test('atualização exige ambas as filas pausadas e nenhuma operação ou limpeza', () => {
  assert.equal(workActivity({}).canInstall, true);
  for (const input of [
    { downloadBusy: true },
    { downloadsMode: 'running' as const },
    { transcriptionBusy: true },
    { transcriptionMode: 'running' as const },
    { modelBusy: true },
    { cleanupPending: true },
    { metadataBusy: true },
    { pendingIpc: 1 },
  ])
    assert.equal(workActivity(input).canInstall, false);
});
