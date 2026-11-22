// Le lien avec l'appli Android (dossier android/) quand Mon renard tourne dedans.
// Dans un navigateur ordinaire, `window.RenardAndroid` n'existe pas et tout ceci ne fait rien.

import type { CheckIn, FeltEvent } from '../data/types';
import { MOODS, moodFromScore } from '../fox/moods';
import { startOfDay } from './history';
import type { OwnNight } from './ownNight';

export interface RenardAndroid {
  setWidgetState(json: string): void;
  saveFile(name: string, content: string): boolean;
  keepScreenOn(on: boolean): void;
  version(): string;
  versionCode(): number;
  canPinWidget(): boolean;
  pinWidget(size: 'small' | 'large'): boolean;
  /** Appli 1.2 et suivantes : pouls en direct (0 = plus de mesure). */
  setLiveHeart?(bpm: number, simulated: boolean): void;
  takeLiveStoppedOutside?(): boolean;
  /** Appli 1.4 et suivantes : alerte quand le pouls monte (src/lib/alert.svelte.ts). */
  setAlertConfig?(json: string): void;
  /** « music » : une musique du téléphone ; « ringtone » : les sonneries. */
  pickAlertSound?(kind: 'music' | 'ringtone'): void;
  alertSoundName?(): string;
  testAlert?(): void;
  stopAlert?(): void;
  snoozeAlert?(): void;
  /** JSON : {ringing, bpm, at, manual} de la dernière alerte. */
  alertState?(): string;
  /** Appli 1.5 et suivantes : instants des pauses demandées (bouton, geste de la bague), séparés par des virgules. */
  takePendingFelt?(): string;
  /** Paquets de la bague encore inconnus (diagnostic). */
  bleUnknown?(): string;
  /** Appli 1.6 et suivantes : fait réagir la bague ; faux si elle n'est pas connectée. */
  ringPing?(): boolean;
  /** Appli 1.7 et suivantes : relève la bague ; faux si elle n'est pas connectée. */
  ringSync?(): boolean;
  /** Les relevés pas encore rangés, une ligne JSON par réponse. */
  ringSyncRead?(): string;
  ringSyncAck?(chars: number): void;
  /** Appli 1.8 et suivantes : le geste de la bague lance une pause seulement si l'option est activée. */
  ringGestureOn?(): boolean;
  setRingGesture?(on: boolean): void;
  ringGesturesLastHour?(): number;
  /** Appli 1.9 et suivantes : essai des gestes, montrés à la page sans lancer de pause. */
  setRingTest?(on: boolean): void;
  bleStart?(kind: string): boolean;
  bleStop?(kind: string): void;
  bleActive?(): string;
  /** Appli 2.4 et suivantes : le pouls gardé autour des pauses, une ligne JSON par moment. */
  momentsRead?(): string;
  momentsAck?(chars: number): void;
  /** Appli 2.6 et suivantes : la pause s'affiche sur un téléphone verrouillé. */
  isOverLock?(): boolean;
  leaveLock?(): void;
  openLockSettings?(): void;
  /** Appli 2.7 et suivantes : instants des pauses retirées avec « Erreur » sur la notification. */
  takeErasedFelt?(): string;
}

/** Le bouton pause (appli 1.5 et suivantes), ou null. */
type PauseBridge = Required<Pick<RenardAndroid, 'takePendingFelt' | 'bleUnknown' | 'bleStart' | 'bleStop' | 'bleActive'>> &
  Pick<RenardAndroid, 'ringPing' | 'ringGestureOn' | 'setRingGesture' | 'ringGesturesLastHour' | 'setRingTest' | 'openLockSettings' | 'takeErasedFelt'>;

/** La pause sur l'écran verrouillé (appli 2.6 et suivantes), ou null. */
export function lockBridge(): Required<Pick<RenardAndroid, 'isOverLock' | 'leaveLock'>> | null {
  const b = bridge();
  return b && typeof b.isOverLock === 'function' && typeof b.leaveLock === 'function'
    ? (b as Required<Pick<RenardAndroid, 'isOverLock' | 'leaveLock'>>)
    : null;
}

export function pauseBridge(): PauseBridge | null {
  const b = bridge();
  return b && typeof b.takePendingFelt === 'function' && typeof b.bleStart === 'function' ? (b as PauseBridge) : null;
}

export type AlertBridge = Required<Pick<RenardAndroid, 'setAlertConfig' | 'pickAlertSound' | 'alertSoundName' | 'testAlert' | 'stopAlert' | 'snoozeAlert' | 'alertState'>>;

/** Le côté Android de l'alerte, ou null (navigateur, ou appli d'avant la 1.4). */
export function alertBridge(): AlertBridge | null {
  const b = bridge();
  return b && typeof b.setAlertConfig === 'function' && typeof b.alertState === 'function' ? (b as AlertBridge) : null;
}

/** Le pouls gardé autour des pauses (appli 2.4 et suivantes), ou null. */
export function momentsBridge(): Required<Pick<RenardAndroid, 'momentsRead' | 'momentsAck'>> | null {
  const b = bridge();
  return b && typeof b.momentsRead === 'function' && typeof b.momentsAck === 'function'
    ? (b as Required<Pick<RenardAndroid, 'momentsRead' | 'momentsAck'>>)
    : null;
}

function bridge(): RenardAndroid | null {
  return typeof window !== 'undefined' ? ((window as unknown as { RenardAndroid?: RenardAndroid }).RenardAndroid ?? null) : null;
}

export function isAndroidApp(): boolean {
  return bridge() != null;
}

/**
 * Ce que le widget doit afficher : humeur du dernier check-in, jauges (humeur, énergie, nuit)
 * et heures des derniers instants. Le widget décide lui-même si la nuit date d'aujourd'hui.
 * Sans nuit notée aujourd'hui, il prend ta nuit ajustée à ton vrai réveil.
 */
export function widgetState(
  last: CheckIn | null,
  lastFelt: FeltEvent | null,
  lastSleep: CheckIn | null = null,
  own: OwnNight | null = null,
  now = Date.now()
) {
  const mood = last ? moodFromScore(last.mood) : null;
  const today = startOfDay(now);
  const noted = lastSleep?.sleep != null && lastSleep.at >= today;
  const measured = !noted && own && own.at >= today ? own : null;
  return {
    mood,
    label: mood ? MOODS[mood].label : null,
    lastCheckIn: last?.at ?? 0,
    lastFelt: lastFelt?.at ?? 0,
    score: last?.mood ?? 0,
    energy: last?.energy ?? 0,
    sleep: measured ? measured.fill : (lastSleep?.sleep ?? 0),
    sleepAt: measured ? measured.at : lastSleep?.sleep != null ? lastSleep.at : 0,
    /** Une nuit mesurée se dit en durée, pas en « bonne » ou « mauvaise ». */
    sleepMinutes: measured ? measured.asleep : 0
  };
}

let lastSent = '';

/** Met le widget à jour (seulement si quelque chose a changé). */
export function updateWidget(
  last: CheckIn | null,
  lastFelt: FeltEvent | null,
  lastSleep: CheckIn | null = null,
  own: OwnNight | null = null
): void {
  const b = bridge();
  if (!b) return;
  const json = JSON.stringify(widgetState(last, lastFelt, lastSleep, own));
  if (json === lastSent) return;
  lastSent = json;
  try {
    b.setWidgetState(json);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Pouls en direct sur le widget (appelé au plus toutes les 5 s). `bpm` à 0 efface l'affichage.
 * Quand l'appli passe en arrière-plan, l'appli Android prend le relais elle-même.
 * Sans effet hors de l'appli Android, ou avec une appli trop ancienne (avant la 1.2).
 */
export function updateLiveHeart(bpm: number, simulated: boolean): void {
  const b = bridge();
  if (!b?.setLiveHeart) return;
  const value = Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : 0;
  try {
    b.setLiveHeart(value, simulated);
  } catch (e) {
    console.error(e);
  }
}

/** Vrai si la démo a été arrêtée depuis la notification Android pendant que l'appli était en arrière-plan. */
export function liveStoppedOutside(): boolean {
  try {
    return bridge()?.takeLiveStoppedOutside?.() ?? false;
  } catch {
    return false;
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

/** feel, checkin : boutons du widget ; alert : notification « ton pouls monte » ; breathe : respirer tout de suite. */
export type AppAction = 'feel' | 'checkin' | 'alert' | 'breathe';
const ACTIONS: AppAction[] = ['feel', 'checkin', 'alert', 'breathe'];
const isAction = (v: unknown): v is AppAction => ACTIONS.includes(v as AppAction);

/** Action demandée par un bouton du widget au lancement (« ?action=feel »), retirée de l'adresse ensuite. */
export function takeLaunchAction(): AppAction | null {
  const url = new URL(location.href);
  const action = url.searchParams.get('action');
  if (!isAction(action)) return null;
  url.searchParams.delete('action');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return action;
}

/** Actions envoyées par le widget quand l'appli est déjà ouverte. */
export function onAppAction(handler: (action: AppAction) => void): () => void {
  const listener = (e: Event) => {
    const action = (e as CustomEvent).detail;
    if (isAction(action)) handler(action);
  };
  window.addEventListener('renard-action', listener);
  return () => window.removeEventListener('renard-action', listener);
}
