// Capteur simulé : des mesures plausibles (pouls, intervalles RR, conductance de la peau…),
// pour construire et essayer l'affichage en direct avant d'avoir le vrai matériel.
// Ce ne sont PAS des mesures : l'interface le dit toujours.

import type { Reading, SensorSource, SourceInfo } from './types';

export const SIMULATOR_INFO: SourceInfo = {
  id: 'demo',
  label: 'Démo',
  simulated: true,
  measures: ['hr', 'rr', 'gsr', 'ppgAmp', 'accel']
};

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Le corps simulé, seconde après seconde : un pouls qui dérive doucement et suit la respiration,
 * une conductance de la peau avec de petites réactions de temps en temps.
 * `arousal` (0 = très calme, 1 = très activé) déplace le pouls et la conductance.
 */
export class Simulation {
  private random: () => number;
  private drift = 0;
  private tonic = 2.6;
  private phasic = 0;
  private phasicTarget = 0;
  /** Temps (s) depuis le début, et instant du prochain battement. */
  private t = 0;
  private nextBeat = 0;
  arousal: number;

  constructor(seed = Date.now(), arousal = 0.35) {
    this.random = seededRandom(seed);
    this.arousal = clamp(arousal, 0, 1);
  }

  private noise(amount: number): number {
    return (this.random() * 2 - 1) * amount;
  }

  /** Pouls instantané (bpm) au temps t. */
  private heartAt(t: number): number {
    const base = 58 + this.arousal * 38;
    // Arythmie respiratoire : le cœur accélère à l'inspiration (une respiration toutes les ~5,5 s)
    const breath = (4.5 - this.arousal * 2.5) * Math.sin((2 * Math.PI * t) / 5.5);
    return clamp(base + this.drift + breath, 42, 150);
  }

  /** Les mesures de la seconde qui s'achève à `at`. */
  next(at: number, dt = 1): Reading {
    const start = this.t;
    this.t += dt;

    // Dérive lente du pouls (marche aléatoire ramenée vers 0)
    this.drift = clamp(this.drift * 0.97 + this.noise(1.1), -9, 9);

    // Battements de cette seconde, avec leurs intervalles RR
    const rr: number[] = [];
    if (this.nextBeat < start) this.nextBeat = start;
    while (this.nextBeat < this.t) {
      const interval = 60 / this.heartAt(this.nextBeat) + this.noise(0.022 * (1.2 - this.arousal));
      rr.push(Math.round(interval * 1000));
      this.nextBeat += interval;
    }
    const hr = rr.length ? 60000 / (rr.reduce((s, v) => s + v, 0) / rr.length) : this.heartAt(this.t);

    // Conductance de la peau : niveau de fond qui dérive, plus de petites réactions (montée rapide, descente lente)
    const tonicTarget = 1.8 + this.arousal * 4;
    this.tonic = clamp(this.tonic + (tonicTarget - this.tonic) * 0.01 + this.noise(0.02), 0.5, 12);
    if (this.random() < 0.015 + this.arousal * 0.04) this.phasicTarget += 0.25 + this.random() * (0.4 + this.arousal);
    this.phasic += (this.phasicTarget - this.phasic) * 0.45;
    this.phasicTarget *= 0.86;

    return {
      at,
      source: SIMULATOR_INFO.id,
      hr: Math.round(hr * 10) / 10,
      rr,
      gsr: Math.round((this.tonic + this.phasic) * 100) / 100,
      ppgAmp: Math.round(clamp(0.62 + 0.08 * Math.sin(this.t / 3) + this.noise(0.03), 0, 1) * 100) / 100,
      accel: [this.noise(0.03), this.noise(0.03), 1 + this.noise(0.03)].map((v) => Math.round(v * 1000) / 1000) as [number, number, number]
    };
  }
}

/** La démo comme source de mesures : une mesure par seconde. */
export function createSimulator(options: { seed?: number; arousal?: number } = {}): SensorSource & { setArousal(v: number): void } {
  const sim = new Simulation(options.seed, options.arousal);
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    info: SIMULATOR_INFO,
    async start(onReading) {
      if (timer) return;
      onReading(sim.next(Date.now()));
      timer = setInterval(() => onReading(sim.next(Date.now())), 1000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    setArousal(v: number) {
      sim.arousal = clamp(v, 0, 1);
    }
  };
}
