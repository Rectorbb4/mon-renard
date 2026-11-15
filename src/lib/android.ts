// Le lien avec l'appli Android (dossier android/) quand Mon renard tourne dedans.
// Dans un navigateur ordinaire, `window.RenardAndroid` n'existe pas et tout ceci ne fait rien.

import type { CheckIn, FeltEvent } from '../data/types';
import { MOODS, moodFromScore } from '../fox/moods';

interface RenardAndroid {
  setWidgetState(json: string): void;
  saveFile(name: string, content: string): boolean;
  keepScreenOn(on: boolean): void;
  version(): string;
  versionCode(): number;
  canPinWidget(): boolean;
  pinWidget(size: 'small' | 'large'): boolean;
}

function bridge(): RenardAndroid | null {
  return typeof window !== 'undefined' ? ((window as unknown as { RenardAndroid?: RenardAndroid }).RenardAndroid ?? null) : null;
}

export function isAndroidApp(): boolean {
  return bridge() != null;
}

/** Ce que le widget doit afficher : humeur du dernier check-in et heures des derniers instants. */
export function widgetState(last: CheckIn | null, lastFelt: FeltEvent | null) {
  const mood = last ? moodFromScore(last.mood) : null;
  return {
    mood,
    label: mood ? MOODS[mood].label : null,
    lastCheckIn: last?.at ?? 0,
    lastFelt: lastFelt?.at ?? 0
  };
}

let lastSent = '';

/** Met le widget à jour (seulement si quelque chose a changé). */
export function updateWidget(last: CheckIn | null, lastFelt: FeltEvent | null): void {
  const b = bridge();
  if (!b) return;
  const json = JSON.stringify(widgetState(last, lastFelt));
  if (json === lastSent) return;
  lastSent = json;
  try {
    b.setWidgetState(json);
  } catch (e) {
    console.error(e);
  }
}

/** Enregistre un fichier dans Téléchargements. Renvoie null hors de l'appli Android. */
export function saveFileInApp(name: string, content: string): boolean | null {
  const b = bridge();
  if (!b) return null;
  try {
    return b.saveFile(name, content);
  } catch {
    return false;
  }
}

export function keepScreenOnInApp(on: boolean): void {
  try {
    bridge()?.keepScreenOn(on);
  } catch {
    /* sans effet */
  }
}

export function appVersion(): { name: string; code: number } | null {
  const b = bridge();
  if (!b) return null;
  try {
    return { name: b.version(), code: b.versionCode() };
  } catch {
    return null;
  }
}

export function canPinWidget(): boolean {
  try {
    return bridge()?.canPinWidget() ?? false;
  } catch {
    return false;
  }
}

export function pinWidget(size: 'small' | 'large'): boolean {
  try {
    return bridge()?.pinWidget(size) ?? false;
  } catch {
    return false;
  }
}

export type AppAction = 'feel' | 'checkin';

/** Action demandée par un bouton du widget au lancement (« ?action=feel »), retirée de l'adresse ensuite. */
export function takeLaunchAction(): AppAction | null {
  const url = new URL(location.href);
  const action = url.searchParams.get('action');
  if (action !== 'feel' && action !== 'checkin') return null;
  url.searchParams.delete('action');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return action;
}

/** Actions envoyées par le widget quand l'appli est déjà ouverte. */
export function onAppAction(handler: (action: AppAction) => void): () => void {
  const listener = (e: Event) => {
    const action = (e as CustomEvent).detail;
    if (action === 'feel' || action === 'checkin') handler(action);
  };
  window.addEventListener('renard-action', listener);
  return () => window.removeEventListener('renard-action', listener);
}
