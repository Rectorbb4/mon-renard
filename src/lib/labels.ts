// Mots utilisés pour décrire l'énergie et la nuit, partout dans l'appli.

export function energyLabel(v: number): string {
  if (v < 0.2) return 'À plat';
  if (v < 0.4) return 'Fatigue';
  if (v < 0.6) return 'Ça va';
  if (v < 0.8) return 'En forme';
  return 'Pleine forme';
}

export const SLEEP_OPTIONS = [
  { value: 0, label: 'Très mauvaise' },
  { value: 0.25, label: 'Mauvaise' },
  { value: 0.5, label: 'Moyenne' },
  { value: 0.75, label: 'Bonne' },
  { value: 1, label: 'Très bonne' }
] as const;

/** Libellé de la nuit la plus proche de la valeur. */
export function sleepLabel(v: number): string {
  let best: (typeof SLEEP_OPTIONS)[number] = SLEEP_OPTIONS[0];
  for (const o of SLEEP_OPTIONS) if (Math.abs(o.value - v) < Math.abs(best.value - v)) best = o;
  return best.label;
}
