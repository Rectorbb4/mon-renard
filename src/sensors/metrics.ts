// Calculs sur les mesures en direct : variabilité cardiaque, fenêtre glissante.

import type { Reading } from './types';

/**
 * RMSSD (en ms) : racine de la moyenne des carrés des différences entre intervalles RR successifs.
 * C'est la mesure de variabilité cardiaque à court terme la plus courante. null s'il manque des données.
 * Les intervalles hors de 300-2000 ms (artefacts, battements manqués) sont écartés.
 */
export function rmssd(rr: number[]): number | null {
  const clean = rr.filter((v) => v >= 300 && v <= 2000);
  if (clean.length < 3) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < clean.length; i++) {
    const d = clean[i] - clean[i - 1];
    // Un saut de plus de 25 % entre deux battements est presque toujours un artefact
    if (Math.abs(d) > clean[i - 1] * 0.25) continue;
    sum += d * d;
    n++;
  }
  return n < 2 ? null : Math.round(Math.sqrt(sum / n) * 10) / 10;
}

/** Les mesures des dernières secondes, pour les courbes et les calculs. */
export class LiveWindow {
  readonly readings: Reading[] = [];

  constructor(readonly spanMs = 120_000) {}

  push(r: Reading): void {
    this.readings.push(r);
    const limit = r.at - this.spanMs;
    let drop = 0;
    while (drop < this.readings.length && this.readings[drop].at < limit) drop++;
    if (drop) this.readings.splice(0, drop);
  }

  clear(): void {
    this.readings.length = 0;
  }

  /** Les intervalles RR des `ms` dernières millisecondes. */
  rrSince(ms: number, now: number): number[] {
    return this.readings.filter((r) => r.at >= now - ms).flatMap((r) => r.rr ?? []);
  }

  /** Points (instant, valeur) d'une mesure, pour tracer une courbe. */
  series(key: 'hr' | 'gsr'): [number, number][] {
    const out: [number, number][] = [];
    for (const r of this.readings) {
      const v = r[key];
      if (v != null && Number.isFinite(v)) out.push([r.at, v]);
    }
    return out;
  }
}
