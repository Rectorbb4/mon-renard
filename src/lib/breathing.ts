// Respiration guidée : inspirer 4 secondes, expirer 6 secondes, pendant 1 à 3 minutes.
// Tout est calculé à partir du temps écoulé, pour que le cercle, le texte et le renard restent d'accord.

export const INHALE_MS = 4000;
export const EXHALE_MS = 6000;
export const CYCLE_MS = INHALE_MS + EXHALE_MS;
/** Petit temps pour s'installer avant la première inspiration. */
export const LEAD_IN_MS = 3000;
export const DURATIONS = [1, 2, 3] as const;
export type BreathMinutes = (typeof DURATIONS)[number];

export type BreathStage = 'ready' | 'in' | 'out' | 'done';

export interface BreathState {
  stage: BreathStage;
  /** Air dans les poumons : 0 = vide, 1 = plein. */
  fullness: number;
  /** Secondes restantes dans l'étape en cours (arrondi vers le haut). */
  secondsLeft: number;
  /** Numéro du cycle en cours, à partir de 0. */
  cycle: number;
  cycles: number;
  /** Temps restant sur toute la séance, préparation comprise. */
  remainingMs: number;
  /** Avancement de la séance, de 0 à 1 (hors préparation). */
  progress: number;
}

export function isBreathMinutes(value: unknown): value is BreathMinutes {
  return DURATIONS.includes(value as BreathMinutes);
}

export function cyclesFor(minutes: number): number {
  return Math.max(1, Math.round((minutes * 60_000) / CYCLE_MS));
}

export function sessionMs(minutes: number): number {
  return LEAD_IN_MS + cyclesFor(minutes) * CYCLE_MS;
}

const ease = (p: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, p)))) / 2;

export function breathAt(elapsedMs: number, minutes: number): BreathState {
  const cycles = cyclesFor(minutes);
  const total = cycles * CYCLE_MS;
  const elapsed = Math.max(0, elapsedMs);
  const remainingMs = Math.max(0, LEAD_IN_MS + total - elapsed);

  if (elapsed < LEAD_IN_MS) {
    return {
      stage: 'ready',
      fullness: 0,
      secondsLeft: Math.ceil((LEAD_IN_MS - elapsed) / 1000),
      cycle: 0,
      cycles,
      remainingMs,
      progress: 0
    };
  }

  const t = elapsed - LEAD_IN_MS;
  if (t >= total) {
    return { stage: 'done', fullness: 0, secondsLeft: 0, cycle: cycles, cycles, remainingMs: 0, progress: 1 };
  }

  const cycle = Math.floor(t / CYCLE_MS);
  const r = t - cycle * CYCLE_MS;
  const progress = t / total;
  if (r < INHALE_MS) {
    return {
      stage: 'in',
      fullness: ease(r / INHALE_MS),
      secondsLeft: Math.ceil((INHALE_MS - r) / 1000),
      cycle,
      cycles,
      remainingMs,
      progress
    };
  }
  return {
    stage: 'out',
    fullness: 1 - ease((r - INHALE_MS) / EXHALE_MS),
    secondsLeft: Math.ceil((CYCLE_MS - r) / 1000),
    cycle,
    cycles,
    remainingMs,
    progress
  };
}

/** « 2:05 » */
export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
