// Les mesures en direct, côté interface : quelle source tourne, dernières valeurs, courbe du pouls.
// Pour l'instant, seule la démo (capteur simulé) existe ; les vrais capteurs se brancheront ici (voir src/sensors/).

import { LiveWindow, rmssd } from '../sensors/metrics';
import { createSimulator } from '../sensors/simulator';
import type { Reading, SensorSource, SourceInfo } from '../sensors/types';
import { liveStoppedOutside, updateLiveHeart } from './android';

const PREF = 'mon-renard:demo-direct';
/** Le widget reçoit le pouls au plus toutes les 5 secondes. */
const WIDGET_EVERY = 5000;

export const live = $state({
  running: false,
  source: null as SourceInfo | null,
  hr: null as number | null,
  /** Variabilité cardiaque (RMSSD, ms) sur la dernière minute. */
  hrv: null as number | null,
  gsr: null as number | null,
  lastAt: 0,
  /** Pouls des deux dernières minutes : [instant, bpm]. */
  hrSeries: [] as [number, number][],
  error: null as string | null
});

const window120 = new LiveWindow(120_000);
let source: (SensorSource & { setArousal?(v: number): void }) | null = null;
let arousal = 0.35;
let lastWidget = 0;
let paused = false;
let watching = false;

function onReading(r: Reading) {
  window120.push(r);
  live.lastAt = r.at;
  if (r.hr != null) live.hr = Math.round(r.hr);
  if (r.gsr != null) live.gsr = r.gsr;
  live.hrv = rmssd(window120.rrSince(60_000, r.at));
  live.hrSeries = window120.series('hr');
  if (live.hr != null && r.at - lastWidget >= WIDGET_EVERY) {
    lastWidget = r.at;
    updateLiveHeart(live.hr, live.source?.simulated ?? false);
  }
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(PREF, '1');
    else localStorage.removeItem(PREF);
  } catch {
    /* stockage indisponible */
  }
}

function demoWanted(): boolean {
  try {
    return localStorage.getItem(PREF) === '1';
  } catch {
    return false;
  }
}

/** Relance la démo si elle était allumée à la dernière visite (et pas arrêtée depuis la notification). */
export function resumeDemoIfWanted(): void {
  if (live.running || !demoWanted()) return;
  if (liveStoppedOutside()) remember(false);
  else startDemo();
}

/** Page cachée (appli en arrière-plan) : on arrête, et on reprend au retour. */
function watchVisibility() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    // (L'appli Android garde le pouls du widget pendant ce temps : voir android/…/LiveService.java)
    if (document.hidden && source) {
      paused = true;
      source.stop();
      lastWidget = 0;
    } else if (!document.hidden && paused && source) {
      paused = false;
      if (liveStoppedOutside()) {
        stopLive();
        return;
      }
      window120.clear();
      source.start(onReading, onEnd).catch(onError);
    }
  });
}

function onEnd(reason: string | null) {
  stopLive();
  live.error = reason;
}

function onError(e: unknown) {
  console.error(e);
  stopLive();
  live.error = e instanceof Error ? e.message : 'La source n’a pas pu démarrer.';
}

/** Démarre la démo : des valeurs simulées, une par seconde. */
export async function startDemo(): Promise<void> {
  if (source) return;
  live.error = null;
  const sim = createSimulator({ arousal });
  source = sim;
  live.source = sim.info;
  live.running = true;
  remember(true);
  watchVisibility();
  try {
    await sim.start(onReading, onEnd);
  } catch (e) {
    onError(e);
  }
}

export function stopLive(): void {
  source?.stop();
  source = null;
  paused = false;
  window120.clear();
  live.running = false;
  live.source = null;
  live.hr = null;
  live.hrv = null;
  live.gsr = null;
  live.hrSeries = [];
  lastWidget = 0;
  remember(false);
  updateLiveHeart(0, false);
}

/**
 * La démo suit un peu l'humeur du dernier check-in : pouls plus rapide dans l'élan ou l'emballement.
 * Sans effet sur un vrai capteur.
 */
export function setDemoArousal(mood: number | null, energy: number | null): void {
  const m = mood ?? 0;
  const e = energy ?? 0.5;
  arousal = Math.min(1, Math.max(0, 0.3 + 0.45 * Math.max(0, m) + 0.2 * (e - 0.5)));
  source?.setArousal?.(arousal);
}
