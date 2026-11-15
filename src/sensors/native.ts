// Les capteurs branchés par l'appli Android (Bluetooth natif), vus comme des sources ordinaires.
// La WebView de l'appli n'a pas Web Bluetooth : la page demande à Java de se connecter
// (window.RenardAndroid.bleStart), et Java renvoie les mesures par un événement « renard-ble ».
// La connexion reste ouverte quand l'appli passe en arrière-plan : c'est elle qui tient le widget à jour.

import type { Reading, SensorSource, SourceInfo } from './types';

export type SensorKind = 'ceinture' | 'bague';

/** Ce que Java envoie à la page. */
export type NativeEvent =
  | { kind: SensorKind; type: 'status'; state: 'permission' | 'scanning' | 'connecting' | 'connected' | 'reconnecting'; name?: string }
  | { kind: SensorKind; type: 'reading'; hr?: number; rr?: number[]; at?: number }
  | { kind: SensorKind; type: 'notice'; message: string }
  | { kind: SensorKind; type: 'end'; message?: string };

interface BleBridge {
  bleStart?(kind: string): boolean;
  bleStop?(kind: string): void;
  bleActive?(): string;
}

function bridge(): BleBridge | null {
  return typeof window !== 'undefined' ? ((window as unknown as { RenardAndroid?: BleBridge }).RenardAndroid ?? null) : null;
}

/** L'appli Android sait-elle brancher les capteurs ? (appli 1.3 et suivantes) */
export function hasNativeBle(): boolean {
  return typeof bridge()?.bleStart === 'function';
}

/** Les capteurs que l'appli Android garde déjà connectés (par exemple après une réouverture de la page). */
export function nativeActive(): { kind: SensorKind; state: string; name?: string }[] {
  try {
    const raw = bridge()?.bleActive?.();
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && (x.kind === 'ceinture' || x.kind === 'bague')) : [];
  } catch {
    return [];
  }
}

/** Libellé à afficher pour un état de connexion. */
export function stateLabel(state: string): string {
  switch (state) {
    case 'permission':
      return 'autorisation…';
    case 'scanning':
      return 'recherche…';
    case 'connecting':
      return 'connexion…';
    case 'reconnecting':
      return 'reconnexion…';
    case 'connected':
      return 'connectée';
    default:
      return state;
  }
}

/**
 * Une source branchée par Java. `start` rend la main dès que Java a accepté la demande ;
 * les états (recherche, connexion…) arrivent ensuite par `onStatus`.
 */
export function nativeSource(info: SourceInfo & { id: SensorKind }, onStatus: (state: string, name?: string) => void): SensorSource {
  let listener: ((e: Event) => void) | null = null;

  const detach = () => {
    if (listener) window.removeEventListener('renard-ble', listener);
    listener = null;
  };

  return {
    info,
    async start(onReading: (r: Reading) => void, onEnd?: (reason: string | null) => void, onNotice?: (m: string) => void) {
      const b = bridge();
      if (!b?.bleStart) throw new Error('Cette version de l’appli ne sait pas encore brancher les capteurs : mets-la à jour.');
      detach();
      listener = (e: Event) => {
        const ev = (e as CustomEvent).detail as NativeEvent | undefined;
        if (!ev || ev.kind !== info.id) return;
        if (ev.type === 'reading') {
          const r: Reading = { at: ev.at ?? Date.now(), source: info.id };
          if (ev.hr != null && ev.hr > 0) r.hr = ev.hr;
          if (ev.rr?.length) r.rr = ev.rr;
          onReading(r);
        } else if (ev.type === 'status') onStatus(ev.state, ev.name);
        else if (ev.type === 'notice') onNotice?.(ev.message);
        else if (ev.type === 'end') {
          detach();
          onEnd?.(ev.message ?? null);
        }
      };
      window.addEventListener('renard-ble', listener);
      // Java répond false s'il n'y a pas de Bluetooth sur le téléphone
      if (!b.bleStart(info.id)) {
        detach();
        throw new Error('Ce téléphone n’a pas de Bluetooth utilisable.');
      }
    },
    stop() {
      detach();
      try {
        bridge()?.bleStop?.(info.id);
      } catch {
        /* sans effet */
      }
    }
  };
}
