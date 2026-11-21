// Le renard sent ton cœur : quand le pouls monte, il s'agite un moment, puis retrouve son calme.
// Ton humeur, elle, ne change pas : un pouls rapide peut venir du sport ou d'un café.

// La bague seule donne peu de mesures : fenêtre large, et la médiane pour ignorer un pic isolé.
const WINDOW_MS = 20_000;
const STALE_MS = 15_000;
const MIN_SAMPLES = 3;
/** L'agitation commence 20 battements sous le seuil d'alerte et atteint son maximum au seuil. */
const RAMP = 20;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** De 0 (calme) à 1 (très agité), d'après le pouls des 20 dernières secondes. */
export function pulseLevel(series: readonly (readonly [number, number])[], now: number, threshold: number): number {
  const recent = series.filter(([t]) => t <= now && now - t <= WINDOW_MS);
  if (recent.length < MIN_SAMPLES) return 0;
  if (now - recent[recent.length - 1][0] > STALE_MS) return 0;
  return clamp01((median(recent.map(([, bpm]) => bpm)) - (threshold - RAMP)) / RAMP);
}

export interface Bearing {
  headDown: number;
  earsDown: number;
  lids: number;
  breathDepth: number;
  breathRate: number;
  restless: number;
}

/** Son attitude avec le cœur qui s'emballe : tête levée, oreilles dressées, souffle court. Le décor ne bouge pas. */
export function agitated<T extends Bearing>(b: T, level: number): T {
  const l = clamp01(level);
  return {
    ...b,
    headDown: mix(b.headDown, Math.min(b.headDown, -0.06), l),
    earsDown: mix(b.earsDown, Math.min(b.earsDown, 0.15), l),
    lids: mix(b.lids, 0, l),
    breathDepth: mix(b.breathDepth, Math.max(b.breathDepth, 1.25), l),
    breathRate: mix(b.breathRate, Math.max(b.breathRate, 2.2), l),
    restless: mix(b.restless, Math.max(b.restless, 0.8), l)
  };
}
