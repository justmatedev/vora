import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DownloadPreferences } from '../shared/types';
export function GroupOptions({
  config,
  setConfig,
  disabled = false,
}: {
  config: DownloadPreferences;
  setConfig: (value: DownloadPreferences) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="group-options" disabled={disabled}>
      <legend>Configuração do grupo</legend>
      <div className="option-grid">
        <div className="select-group">
          <label htmlFor={`${id}-kind`}>Baixar</label>
          <div className="select-wrap">
            <select
              id={`${id}-kind`}
              value={config.kind}
              onChange={(event) =>
                setConfig({ ...config, kind: event.target.value as 'video' | 'audio' })
              }
            >
              <option value="video">Vídeo</option>
              <option value="audio">Áudio</option>
            </select>
            <ChevronDown size={15} />
          </div>
        </div>
        <div className="select-group">
          <label htmlFor={`${id}-format`}>Formato</label>
          <div className="select-wrap">
            {config.kind === 'audio' ? (
              <select
                id={`${id}-format`}
                value={config.audioMode}
                onChange={(event) =>
                  setConfig({ ...config, audioMode: event.target.value as 'mp3' | 'original' })
                }
              >
                <option value="original">Áudio original</option>
                <option value="mp3">MP3</option>
              </select>
            ) : (
              <select
                id={`${id}-format`}
                value={config.videoMode}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    videoMode: event.target.value as 'compatible' | 'original',
                  })
                }
              >
                <option value="compatible">MP4 compatível</option>
                <option value="original">Original</option>
              </select>
            )}
            <ChevronDown size={15} />
          </div>
        </div>
        {config.kind === 'video' && (
          <>
            <div className="select-group">
              <label htmlFor={`${id}-quality`}>Qualidade máxima</label>
              <div className="select-wrap">
                <select
                  id={`${id}-quality`}
                  value={config.quality?.height ?? 0}
                  onChange={(event) => {
                    const height = Number(event.target.value);
                    setConfig({
                      ...config,
                      quality: height ? { height, fps: config.quality?.fps ?? 30 } : undefined,
                    });
                  }}
                >
                  <option value={0}>Melhor disponível</option>
                  {[
                    ...new Set([
                      144,
                      240,
                      360,
                      480,
                      720,
                      1080,
                      1440,
                      2160,
                      4320,
                      ...(config.quality ? [config.quality.height] : []),
                    ]),
                  ]
                    .sort((a, b) => a - b)
                    .map((height) => (
                      <option key={height} value={height}>
                        Até {height}p
                      </option>
                    ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
            <div className="select-group">
              <label htmlFor={`${id}-fps`}>FPS preferido</label>
              <div className="select-wrap">
                <select
                  id={`${id}-fps`}
                  value={config.quality?.fps ?? 30}
                  disabled={!config.quality}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      quality: {
                        height: config.quality!.height,
                        fps: Number(event.target.value),
                      },
                    })
                  }
                >
                  {[...new Set([30, 60, ...(config.quality ? [config.quality.fps] : [])])]
                    .sort((a, b) => a - b)
                    .map((fps) => (
                      <option value={fps} key={fps}>
                        {fps} fps
                      </option>
                    ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
          </>
        )}
      </div>
      <p className="modal-footnote">
        Os formatos serão consultados na vez de cada vídeo. O modo escolhido será preservado;
        resoluções podem ser menores que o limite.
      </p>
    </fieldset>
  );
}
