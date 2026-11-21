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

/** Un moment « je le sens » (étape 3). */
export interface FeltEvent {
  id?: number;
  profileId: number;
  at: number;
  note?: string;
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

/** Ce que l'interface envoie pour créer un check-in. */
export interface CheckInInput {
  mood: number;
  energy: number;
  sleep?: number | null;
  word?: string;
}
