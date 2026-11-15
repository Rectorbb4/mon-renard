// Les mesures en direct, côté interface : quelles sources tournent, dernières valeurs, courbe du pouls.
// Sources possibles : la démo (valeurs simulées), la ceinture cardio et la bague, ensemble ou séparément.
// Dans Chrome, les capteurs passent par Web Bluetooth ; dans l'appli Android, par le Bluetooth natif (src/sensors/native.ts).

import { colmiSource, COLMI_INFO } from '../sensors/ble/colmi';
import { heartRateSource, HEART_RATE_INFO } from '../sensors/ble/heartRate';
import { CancelledError, hasWebBluetooth } from '../sensors/ble/webBluetooth';
import { LiveWindow, rmssd } from '../sensors/metrics';
import { hasNativeBle, nativeActive, nativeSource, stateLabel, type SensorKind } from '../sensors/native';
import { createSimulator } from '../sensors/simulator';
import type { Reading, SensorSource, SourceInfo } from '../sensors/types';
import { liveStoppedOutside, updateLiveHeart } from './android';

export type { SensorKind };

const PREF = 'mon-renard:demo-direct';
/** Le widget reçoit le pouls au plus toutes les 5 secondes. */
const WIDGET_EVERY = 5000;
/** La ceinture est plus précise : tant qu'elle donne un pouls (moins de 5 s), celui de la bague est ignoré. */
const PREFER_BELT_MS = 5000;

export const SENSOR_INFO: Record<SensorKind, SourceInfo & { id: SensorKind }> = {
  ceinture: { ...HEART_RATE_INFO, id: 'ceinture' },
  bague: { ...COLMI_INFO, id: 'bague' }
};

export const live = $state({
  running: false,
  /** Vrai pendant la démo (valeurs inventées). */
  simulated: false,
  /** Les sources en marche, avec leur état de connexion affichable. */
  sources: [] as { info: SourceInfo; state: string }[],
  hr: null as number | null,
  /** D'où vient le pouls affiché (« ceinture », « bague », « demo »). */
  hrFrom: null as string | null,
  /** Variabilité cardiaque (RMSSD, ms) sur la dernière minute. */
  hrv: null as number | null,
  gsr: null as number | null,
  lastAt: 0,
  /** Pouls des deux dernières minutes : [instant, bpm]. */
  hrSeries: [] as [number, number][],
  error: null as string | null,
  /** Message passager d'un capteur (« bague mal placée »…). */
  notice: null as string | null
});

type Running = { source: SensorSource & { setArousal?(v: number): void }; native: boolean; since: number };

const window120 = new LiveWindow(120_000);
const running = new Map<string, Running>();
let arousal = 0.35;
let lastWidget = 0;
let lastBeltHr = 0;
let paused = false;
let watching = false;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

/** Peut-on brancher de vrais capteurs ici ? */
export function canUseSensors(): boolean {
  return hasNativeBle() || hasWebBluetooth();
}

function refreshSources() {
  live.sources = [...running.values()].map(({ source }) => ({
    info: source.info,
    state: live.sources.find((s) => s.info.id === source.info.id)?.state ?? ''
  }));
  live.running = running.size > 0;
  live.simulated = running.has('demo');
}

function setState(id: string, state: string) {
  live.sources = live.sources.map((s) => (s.info.id === id ? { ...s, state } : s));
}

function onReading(r: Reading) {
  if (!running.has(r.source)) return;
  if (r.source === 'ceinture' && r.hr != null) lastBeltHr = r.at;
  // Pouls de la bague ignoré quand la ceinture en donne un (elle est plus précise)
  const kept: Reading = r.source === 'bague' && r.at - lastBeltHr < PREFER_BELT_MS ? { ...r, hr: undefined } : r;
  window120.push(kept);
  live.lastAt = r.at;
  if (kept.hr != null) {
    live.hr = Math.round(kept.hr);
    live.hrFrom = r.source;
  }
  if (r.gsr != null) live.gsr = r.gsr;
  live.hrv = rmssd(window120.rrSince(60_000, r.at));
  live.hrSeries = window120.series('hr');
  if (r.source !== 'ceinture' && r.source !== 'bague') setState(r.source, '');
  else if (live.sources.find((s) => s.info.id === r.source)?.state !== 'connected') setState(r.source, 'connected');
  // Dans l'appli Android, les vrais capteurs mettent le widget à jour eux-mêmes (côté Java)
  const native = running.get(r.source)?.native ?? false;
  if (!native && live.hr != null && r.at - lastWidget >= WIDGET_EVERY) {
    lastWidget = r.at;
    updateLiveHeart(live.hr, live.simulated);
  }
}

function showNotice(message: string) {
  live.notice = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (live.notice = null), 15_000);
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

/**
 * À l'ouverture : reprend les capteurs que l'appli Android garde connectés,
 * sinon relance la démo si elle était allumée à la dernière visite (et pas arrêtée depuis la notification).
 */
export function resumeLive(): void {
  if (live.running) return;
  const active = hasNativeBle() ? nativeActive() : [];
  if (active.length) {
    for (const a of active) void startSensor(a.kind);
    return;
  }
  if (!demoWanted()) return;
  if (liveStoppedOutside()) remember(false);
  else void startDemo();
}

/**
 * Page cachée (appli en arrière-plan) : la démo et les capteurs Web Bluetooth s'arrêtent, et reprennent au retour.
 * Les capteurs de l'appli Android, eux, continuent (pour le widget).
 */
function watchVisibility() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) dropEndedNative();
    const pausable = [...running.values()].filter((r) => !r.native);
    if (document.hidden && pausable.length) {
      paused = true;
      for (const r of pausable) r.source.stop();
      lastWidget = 0;
    } else if (!document.hidden && paused) {
      paused = false;
      if (running.has('demo') && liveStoppedOutside()) {
        stopSource('demo');
        return;
      }
      window120.clear();
      for (const r of pausable) startRunning(r);
    }
  });
}

/** Au retour dans l'appli : les capteurs arrêtés pendant l'absence (notification, erreur) disparaissent aussi ici. */
function dropEndedNative() {
  const native = [...running.entries()].filter(([, r]) => r.native);
  if (!native.length) return;
  const still = new Set(nativeActive().map((a) => a.kind as string));
  // (Une source toute récente peut attendre une autorisation : Java ne la connaît pas encore)
  for (const [id, r] of native) if (!still.has(id) && Date.now() - r.since > 10_000) stopSource(id);
}

function startRunning(r: Running) {
  const id = r.source.info.id;
  return r.source
    .start(onReading, (reason) => onEnd(id, reason), showNotice)
    .then(() => {
      // Web Bluetooth : connecté dès que start a rendu la main (Java, lui, envoie ses propres états)
      if (!r.native && id !== 'demo' && running.get(id) === r) setState(id, 'connected');
    })
    .catch((e) => onError(id, e));
}

function onEnd(id: string, reason: string | null) {
  stopSource(id);
  live.error = reason;
}

function onError(id: string, e: unknown) {
  stopSource(id);
  if (e instanceof CancelledError) return;
  console.error(e);
  live.error = e instanceof Error ? e.message : 'La source n’a pas pu démarrer.';
}

/** Démarre la démo : des valeurs simulées, une par seconde. Elle remplace les vrais capteurs. */
export async function startDemo(): Promise<void> {
  if (running.has('demo')) return;
  for (const id of [...running.keys()]) stopSource(id);
  live.error = null;
  const sim = createSimulator({ arousal });
  const r: Running = { source: sim, native: false, since: Date.now() };
  running.set('demo', r);
  refreshSources();
  remember(true);
  watchVisibility();
  await startRunning(r);
}

/** Branche la ceinture ou la bague. Doit être appelé depuis un appui (le navigateur l'exige pour Web Bluetooth). */
export async function startSensor(kind: SensorKind): Promise<void> {
  if (running.has(kind)) return;
  if (running.has('demo')) stopSource('demo');
  live.error = null;
  const native = hasNativeBle();
  const info = SENSOR_INFO[kind];
  const source = native
    ? nativeSource(info, (state) => setState(kind, state))
    : kind === 'ceinture'
      ? heartRateSource()
      : colmiSource();
  const r: Running = { source, native, since: Date.now() };
  running.set(kind, r);
  refreshSources();
  setState(kind, native ? 'scanning' : 'connecting');
  watchVisibility();
  await startRunning(r);
}

/** Arrête une source ; tout s'éteint quand il n'en reste plus. */
export function stopSource(id: string): void {
  const r = running.get(id);
  if (!r) return;
  r.source.stop();
  running.delete(id);
  if (id === 'demo') remember(false);
  if (id === 'ceinture') lastBeltHr = 0;
  refreshSources();
  if (running.size === 0) clearValues();
  else if (live.hrFrom === id) {
    live.hr = null;
    live.hrFrom = null;
  }
  if (!running.has('demo')) live.gsr = null;
  if (!running.has('demo') && !running.has('ceinture')) live.hrv = null;
}

function clearValues() {
  paused = false;
  window120.clear();
  live.running = false;
  live.simulated = false;
  live.hr = null;
  live.hrFrom = null;
  live.hrv = null;
  live.gsr = null;
  live.hrSeries = [];
  live.notice = null;
  lastWidget = 0;
  lastBeltHr = 0;
  updateLiveHeart(0, false);
}

/** Arrête tout. */
export function stopLive(): void {
  for (const id of [...running.keys()]) stopSource(id);
}

export { stateLabel };

/**
 * La démo suit un peu l'humeur du dernier check-in : pouls plus rapide dans l'élan ou l'emballement.
 * Sans effet sur un vrai capteur.
 */
export function setDemoArousal(mood: number | null, energy: number | null): void {
  const m = mood ?? 0;
  const e = energy ?? 0.5;
  arousal = Math.min(1, Math.max(0, 0.3 + 0.45 * Math.max(0, m) + 0.2 * (e - 0.5)));
  running.get('demo')?.source.setArousal?.(arousal);
}
