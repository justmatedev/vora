import type { ModelSpec, WhisperModelId } from './transcription-types';
const revision = '5359861c739e955e79d9a303bcbc70fb988958b1';
export const MODEL_CATALOG: Readonly<Record<WhisperModelId, ModelSpec>> = Object.freeze({
  small: {
    id: 'small',
    revision,
    bytes: 487601967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/ggml-small.bin`,
  },
  medium: {
    id: 'medium',
    revision,
    bytes: 1533763059,
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${revision}/ggml-medium.bin`,
  },
});
export function modelSpec(id: unknown): ModelSpec {
  if (id !== 'small' && id !== 'medium') throw new Error('Modelo de transcrição inválido.');
  return MODEL_CATALOG[id];
}
