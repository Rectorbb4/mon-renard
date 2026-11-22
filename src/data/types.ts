// Ce qui est enregistré sur le téléphone. Tout est horodaté en millisecondes (Date.now()).

/** Une personne qui utilise l'appli. Un seul profil pour l'instant ; le mode enfant en ajoutera d'autres. */
export interface Profile {
  id?: number;
  name: string;
  kind: 'adult' | 'child';
  createdAt: number;
}

/** Un check-in : comment ça va, à un instant donné. */
export interface CheckIn {
  id?: number;
  profileId: number;
  at: number;
  /** Humeur, de -1 (au plus bas) à +1 (au plus haut). */
  mood: number;
  /** Énergie, de 0 (à plat) à 1 (pleine forme). */
  energy: number;
  /** Qualité de la nuit, de 0 (très mauvaise) à 1 (très bonne), ou null si non renseignée. */
  sleep: number | null;
  /** Un mot libre, facultatif. */
  word?: string;
}

/**
 * Le pouls gardé autour d'une pause demandée : 10 s avant le début du geste, 10 s après.
 * Les instants sont en millisecondes par rapport à `start` (négatifs = avant le geste).
 * Listes vides : aucun capteur ne mesurait le pouls à ce moment.
 */
export interface MomentCapture {
  /** Le premier tapotement du geste. */
  start: number;
  source: 'ceinture' | 'bague' | null;
  /** [instant, battements par minute] */
  hr: [number, number][];
  /** [instant, intervalle entre deux battements en ms] : ceinture seulement. */
  rr: [number, number][];
}

/** Un moment « je le sens » (étape 3). */
export interface FeltEvent {
  id?: number;
  profileId: number;
  at: number;
  note?: string;
  capture?: MomentCapture;
}

/** Ce que les capteurs relèvent. `belt…` : une valeur par minute de ceinture portée. */
export const HEALTH_METRICS = ['hr', 'hrv', 'stress', 'spo2', 'steps', 'meters', 'beltHr', 'beltHrv'] as const;
export type HealthMetric = (typeof HEALTH_METRICS)[number];

/** Une mesure datée. Une seule par mesure et par instant : relire la bague ne crée pas de doublons. */
export interface HealthSample {
  metric: HealthMetric;
  at: number;
  value: number;
  /** Oxygène : plus bas et plus haut de l'heure. */
  min?: number;
  max?: number;
}

/** Codes de la bague : 2 léger, 3 profond, 4 paradoxal, 5 éveillé. */
export type SleepStage = 2 | 3 | 4 | 5;

/** Une nuit, rangée au jour du réveil. */
export interface SleepNight {
  /** Minuit (heure locale) du jour du réveil. */
  night: number;
  start: number;
  end: number;
  /** Phases à la suite : [phase, minutes]. */
  stages: [SleepStage, number][];
}

/** L'heure de réveil que tu as corrigée toi-même pour une nuit. La nuit de la bague, elle, ne change pas. */
export interface WakeNote {
  /** Minuit du jour du réveil, comme `SleepNight.night`. */
  night: number;
  at: number;
}

/** Tes objectifs du quotidien. Une seule ligne. */
export interface Goals {
  id: 1;
  steps: number;
  /** L'objectif de pas d'avant le dernier changement : il compte encore pour le jour du changement. */
  stepsBefore?: number;
  /** Minuit du jour du dernier changement de l'objectif de pas. */
  stepsChangedDay: number;
  /** Heure limite pour s'endormir, en minutes depuis minuit. */
  bedtime: number;
  /** Seules les nuits commencées après ce moment comptent pour l'heure choisie. */
  bedSince: number;
  /** Rappel une heure avant. */
  reminder: boolean;
  createdAt: number;
}

export type RewardKind = 'pas' | 'coucher' | 'souffle';

/** Une noisette gagnée. Une seule par type et par jour, et elle ne se perd jamais. */
export interface Reward {
  /** Minuit du jour concerné (pour le coucher : le jour du réveil). */
  day: number;
  kind: RewardKind;
  at: number;
}

/** Une piste notée dans le carnet du renard, gardée même si la tendance change ensuite. */
export interface Clue {
  id: string;
  at: number;
  text: string;
}

/** Ce que l'interface envoie pour créer un check-in. */
export interface CheckInInput {
  mood: number;
  energy: number;
  sleep?: number | null;
  word?: string;
}
