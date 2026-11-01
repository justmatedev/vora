import { Folder, Pencil } from 'lucide-react';
import type { DownloadPreferences, QueueGroup } from '../shared/types';
import { folderLabel } from './queue-view';
export function configurationLabel(p: DownloadPreferences) {
  return p.kind === 'audio'
    ? `Áudio · ${p.audioMode === 'mp3' ? 'MP3' : 'Original'}`
    : `Vídeo · ${p.videoMode === 'compatible' ? 'MP4 compatível' : 'Original'} · ${p.quality ? `até ${p.quality.height}p · ${p.quality.fps} fps` : 'melhor disponível'}`;
}
export function QueueGroupHeader({
  group,
  continuation,
  editable,
  working,
  edit,
}: {
  group: QueueGroup;
  continuation: boolean;
  editable: boolean;
  working: boolean;
  edit: () => void;
}) {
  return (
    <header className="queue-group-header">
      <div className="group-description">
        <span className="group-name">
          {group.label}
          {continuation && <small> · continuação</small>}
        </span>
        <span className="queue-config">{configurationLabel(group.preferences)}</span>
      </div>
      <details className="group-folder">
        <summary title={group.destination}>
          <Folder size={13} />
          {folderLabel(group.destination)}
        </summary>
        <p>{group.destination}</p>
      </details>
      {editable && (
        <button
          className="text-button"
          disabled={working}
          aria-label={`Editar grupo: ${group.label}`}
          onClick={edit}
        >
          <Pencil size={13} />
          Editar grupo
        </button>
      )}
    </header>
  );
}
