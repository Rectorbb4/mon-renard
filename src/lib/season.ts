// La vraie saison et le moment de la journée, pour le décor. Et, certains jours, une petite visite.

export type SeasonId = 'hiver' | 'printemps' | 'ete' | 'automne';
export type DayPart = 'aube' | 'jour' | 'soir' | 'nuit';

export function seasonOf(at: number): SeasonId {
  const m = new Date(at).getMonth();
  if (m === 11 || m <= 1) return 'hiver';
  if (m <= 4) return 'printemps';
  if (m <= 7) return 'ete';
  return 'automne';
}

export function dayPartOf(at: number): DayPart {
  const h = new Date(at).getHours();
  if (h >= 6 && h < 9) return 'aube';
  if (h >= 9 && h < 18) return 'jour';
  if (h >= 18 && h < 21) return 'soir';
  return 'nuit';
}

export const VISITORS: Record<SeasonId, string> = {
  hiver: 'Un bonhomme de neige',
  printemps: 'Un papillon',
  ete: 'Une luciole',
  automne: 'Un hérisson'
};

/** Environ un jour sur dix, toujours le même pour une date donnée. */
export function hasVisitor(at: number): boolean {
  const d = new Date(at);
  const seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return v - Math.floor(v) < 0.1;
}
