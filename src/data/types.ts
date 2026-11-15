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

/** Ce que l'interface envoie pour créer un check-in. */
export interface CheckInInput {
  mood: number;
  energy: number;
  sleep?: number | null;
  word?: string;
}
