import type {
  DownloadRequest,
  JobEvent,
  TransferKind,
  TransferProgress,
  VideoInfo,
} from '../shared/types';

export const PROGRESS_ARGUMENTS = [
  '--progress-template',
  'download:VORA_PROGRESS:{"format_id":%(info.format_id)j,"progress":%(progress.{downloaded_bytes,total_bytes,total_bytes_estimate,speed,eta,filename,status})j}',
  '--progress-template',
  'postprocess:VORA_POST:%(progress.{postprocessor,status})j',
];

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

type ProgressEvent = Extract<JobEvent, { type: 'progress' }>;
export type ParsedProgress = ProgressEvent & {
  formatId?: string;
  downloadFinished?: boolean;
  filename?: string;
};
export function parseProgress(line: string): ParsedProgress | undefined {
  if (line.startsWith('VORA_PROGRESS:')) {
    try {
      const data = JSON.parse(line.slice('VORA_PROGRESS:'.length));
      const p = data.progress ?? data;
      const downloaded = number(p.downloaded_bytes),
        total = number(p.total_bytes) ?? number(p.total_bytes_estimate);
      return {
        type: 'progress',
        stage: 'downloading',
        percent:
          downloaded !== undefined && total ? Math.min(100, (downloaded / total) * 100) : undefined,
        speed: number(p.speed),
        eta: number(p.eta),
        ...(typeof data.format_id === 'string' ? { formatId: data.format_id } : {}),
        ...(typeof p.filename === 'string' ? { filename: p.filename } : {}),
        ...(p.status === 'finished' ? { downloadFinished: true } : {}),
      };
    } catch {
      return undefined;
    }
  }
  if (line.startsWith('VORA_POST:')) {
    try {
      const p = JSON.parse(line.slice('VORA_POST:'.length));
      return {
        type: 'progress',
        stage: /ExtractAudio/.test(p.postprocessor)
          ? 'converting'
          : /Merger/.test(p.postprocessor)
            ? 'merging'
            : 'saving',
      };
    } catch {
      return undefined;
    }
  }
  if (/^\[Merger\]/.test(line)) return { type: 'progress', stage: 'merging' };
  if (/^\[ExtractAudio\]/.test(line)) return { type: 'progress', stage: 'converting' };
  if (line.startsWith('VORA_FILE:')) return { type: 'progress', stage: 'saving' };
  return undefined;
}

export class TransferTracker {
  private transfers: TransferProgress[];
  private formats = new Map<string, TransferKind>();
  constructor(info: VideoInfo, request: DownloadRequest) {
    const option = info[request.videoMode].find((option) => option.id === request.optionId);
    if (request.kind === 'audio') {
      this.transfers = [{ kind: 'audio', status: 'waiting' }];
      if (info.audio) this.formats.set(info.audio.id, 'audio');
    } else if (option?.audioId) {
      this.transfers = [
        { kind: 'video', status: 'waiting' },
        { kind: 'audio', status: 'waiting' },
      ];
      this.formats.set(option.videoId, 'video');
      this.formats.set(option.audioId, 'audio');
    } else {
      this.transfers = [{ kind: 'combined', status: 'waiting' }];
      if (option) this.formats.set(option.videoId, 'combined');
    }
  }
  event(parsed: ParsedProgress): ProgressEvent {
    let track = parsed.formatId ? this.formats.get(parsed.formatId) : undefined;
    if (!track && parsed.filename)
      for (const [id, kind] of this.formats) {
        if (parsed.filename.includes(`.f${id}.`)) track = kind;
      }
    if (!track && this.transfers.length === 1) track = this.transfers[0].kind;
    if (parsed.stage !== 'downloading') {
      this.transfers.forEach((transfer) => {
        transfer.status = 'complete';
        transfer.percent = 100;
      });
    } else if (track) {
      const transfer = this.transfers.find((transfer) => transfer.kind === track)!;
      transfer.status = parsed.downloadFinished ? 'complete' : 'downloading';
      transfer.percent = parsed.downloadFinished ? 100 : parsed.percent;
    }
    const { formatId: _id, downloadFinished: _finished, filename: _filename, ...event } = parsed;
    return {
      ...event,
      ...(track ? { track } : {}),
      transfers: this.transfers.map((transfer) => ({ ...transfer })),
    };
  }
}
