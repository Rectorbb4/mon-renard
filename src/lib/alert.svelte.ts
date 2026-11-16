// L'alerte « ton pouls monte », côté interface : réglages, sonnerie, écran d'alerte.
// Dans Chrome, c'est la page qui surveille le pouls et qui sonne (seulement tant qu'elle est ouverte).
// Dans l'appli Android, c'est l'appli qui surveille et sonne, même fermée (PulseAlert.java) ; la page
// lui envoie les réglages et affiche l'écran d'alerte quand on l'ouvre.

import { alertBridge } from './android';
import { parseAlertConfig, PulseWatch, type AlertConfig } from './pulseAlert';

const KEY = 'mon-renard:alerte-pouls';
/** La sonnerie s'arrête toute seule au bout d'une minute (l'écran d'alerte, lui, reste). */
const RING_MS = 60_000;
const TEST_MS = 5_000;

function load(): AlertConfig {
  try {
    return parseAlertConfig(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseAlertConfig(null);
  }
}

export const alertConfig: AlertConfig = $state(load());

export const alarm = $state({
  /** L'écran d'alerte est affiché. */
  open: false,
  /** Ça sonne en ce moment. */
  ringing: false,
  bpm: null as number | null,
  test: false
});

const watch = new PulseWatch();
let stopTimer: ReturnType<typeof setTimeout> | null = null;

/** L'appli Android sait-elle sonner elle-même (appli 1.4 et suivantes) ? */
export function nativeAlert(): boolean {
  return alertBridge() != null;
}

/** Enregistre les réglages (et les passe à l'appli Android). */
export function saveAlertConfig(): void {
  const json = JSON.stringify($state.snapshot(alertConfig));
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* stockage indisponible : les réglages durent jusqu'à la fermeture */
  }
  try {
    alertBridge()?.setAlertConfig(json);
  } catch (e) {
    console.error(e);
  }
}

/** À l'ouverture de l'appli : l'appli Android reçoit les réglages (au cas où elle vient d'être mise à jour). */
export function syncAlertConfig(): void {
  if (nativeAlert()) saveAlertConfig();
}

/** Une mesure de pouls d'un vrai capteur branché dans le navigateur (Web Bluetooth). */
export function checkPulse(hr: number, at: number): void {
  if (watch.push(hr, at, alertConfig)) raise(Math.round(hr), false);
}

function raise(bpm: number | null, test: boolean) {
  alarm.open = true;
  alarm.bpm = bpm;
  alarm.test = test;
  alarm.ringing = true;
  ring(test ? TEST_MS : RING_MS);
}

/** « Essayer l'alerte » : 5 secondes de sonnerie et de vibration. */
export function testAlert(): void {
  const b = alertBridge();
  if (b) {
    try {
      b.testAlert();
    } catch (e) {
      console.error(e);
    }
    alarm.open = true;
    alarm.test = true;
    alarm.bpm = null;
    alarm.ringing = true;
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => (alarm.ringing = false), TEST_MS);
    return;
  }
  raise(null, true);
}

/** L'appli Android a sonné (appli ouverte, ou ouverte depuis la notification). */
export function showNativeAlert(bpm: number | null, ringing: boolean): void {
  alarm.open = true;
  alarm.test = false;
  alarm.bpm = bpm;
  alarm.ringing = ringing;
}

/** Arrête la sonnerie (l'écran d'alerte reste si `close` est faux). */
export function silence(close = true): void {
  stopSound();
  alarm.ringing = false;
  if (close) alarm.open = false;
  try {
    alertBridge()?.stopAlert();
  } catch {
    /* rien à arrêter */
  }
}

/** « Pas maintenant » : plus d'alerte pendant une heure. */
export function snoozeAlert(): void {
  watch.snooze(Date.now());
  try {
    alertBridge()?.snoozeAlert();
  } catch {
    /* appli trop ancienne */
  }
  silence();
}

// ------------------------------------------------------------------ son et vibration (navigateur)

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let loop: ReturnType<typeof setInterval> | null = null;

function ring(ms: number) {
  stopSound();
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audio ??= new Ctx();
      void audio.resume();
      master = audio.createGain();
      master.gain.value = 0.9;
      master.connect(audio.destination);
    }
  } catch {
    audio = null;
  }
  const play = () => {
    vibrate();
    if (audio && master) (alertConfig.sound === 'sonnerie' ? beeps : chime)(audio, master, audio.currentTime + 0.05);
  };
  play();
  loop = setInterval(play, 2400);
  stopTimer = setTimeout(() => {
    stopSound();
    alarm.ringing = false;
    if (alarm.test) alarm.open = false;
  }, ms);
}

function stopSound() {
  if (loop) clearInterval(loop);
  if (stopTimer) clearTimeout(stopTimer);
  loop = null;
  stopTimer = null;
  try {
    navigator.vibrate?.(0);
  } catch {
    /* pas de vibreur */
  }
  if (master) {
    master.disconnect();
    master = null;
  }
}

/** Vibration longue et forte : on doit la sentir même téléphone dans la poche. */
function vibrate() {
  try {
    navigator.vibrate?.([900, 250, 900]);
  } catch {
    /* pas de vibreur */
  }
}

/** Carillon : quatre notes qui montent, comme une cloche (bien audible sans être agressif). */
function chime(ctx: AudioContext, out: AudioNode, t: number) {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(ctx, out, f, t + i * 0.32, 1.6));
}

function bell(ctx: AudioContext, out: AudioNode, freq: number, t: number, len: number) {
  for (const [mult, level] of [
    [1, 0.5],
    [2.01, 0.2],
    [3.02, 0.08]
  ]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

/** Sonnerie : bips rapides, comme un réveil. */
function beeps(ctx: AudioContext, out: AudioNode, t: number) {
  for (let i = 0; i < 6; i++) {
    const start = t + i * 0.3 + (i >= 3 ? 0.4 : 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = i % 2 ? 880 : 1175;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    g.gain.setValueAtTime(0.25, start + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + 0.22);
  }
}
