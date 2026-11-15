// Les mesures des capteurs portés, horodatées, prêtes pour des flux continus.
// Une « source » (ceinture cardio, boîtier ESP32, simulateur…) produit des mesures ;
// le reste de l'appli ne sait pas d'où elles viennent.

/** Une mesure, à un instant donné. Chaque source ne remplit que ce qu'elle sait mesurer. */
export interface Reading {
  /** Instant de la mesure, en millisecondes (horloge du téléphone). */
  at: number;
  /** Identifiant de la source (voir SourceInfo.id). */
  source: string;
  /** Fréquence cardiaque, en battements par minute. */
  hr?: number;
  /** Intervalles entre deux battements (RR), en millisecondes, du plus ancien au plus récent. */
  rr?: number[];
  /** Conductance de la peau (GSR), en microsiemens. */
  gsr?: number;
  /** Amplitude du pouls optique (PPG), sans unité, de 0 à 1. */
  ppgAmp?: number;
  /** Accélération sur trois axes, en g. */
  accel?: [number, number, number];
}

export type Measure = 'hr' | 'rr' | 'gsr' | 'ppgAmp' | 'accel';

export interface SourceInfo {
  id: string;
  /** Nom affiché (« Ceinture cardio », « Démo »…). */
  label: string;
  /** Vrai pour des valeurs inventées (démo, tests). */
  simulated: boolean;
  /** Ce que la source sait mesurer. */
  measures: Measure[];
}

/** Une source de mesures en continu. */
export interface SensorSource {
  readonly info: SourceInfo;
  /**
   * Démarre l'envoi des mesures. Peut demander une connexion (Bluetooth) et échouer.
   * `onNotice` reçoit les messages à montrer sans arrêter la source (« bague mal placée »…).
   */
  start(onReading: (r: Reading) => void, onEnd?: (reason: string | null) => void, onNotice?: (message: string) => void): Promise<void>;
  /** Arrête l'envoi. Sans effet si la source est déjà arrêtée. */
  stop(): void;
}
