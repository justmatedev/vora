import type { VoraAPI } from '../shared/types';
declare global {
  interface Window {
    vora?: VoraAPI;
  }
}
