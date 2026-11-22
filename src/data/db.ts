// Base de données locale (IndexedDB, via Dexie). Rien ne quitte le téléphone.
// Pour ajouter une table plus tard, créer une nouvelle version sans toucher aux précédentes.

import Dexie, { type EntityTable, type Table } from 'dexie';
import type { CheckIn, FeltEvent, HealthMetric, HealthSample, Profile, SleepNight, WakeNote } from './types';

export class RenardDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  checkins!: EntityTable<CheckIn, 'id'>;
  events!: EntityTable<FeltEvent, 'id'>;
  /** Mesures de la bague et de la ceinture. */
  samples!: Table<HealthSample, [HealthMetric, number]>;
  nights!: Table<SleepNight, number>;
  /** Les heures de réveil corrigées à la main : à part, car chaque relevé remplace la nuit de la bague. */
  wakes!: Table<WakeNote, number>;

  constructor(name = 'mon-renard') {
    super(name);
    this.version(1).stores({
      profiles: '++id',
      checkins: '++id, [profileId+at]',
      events: '++id, [profileId+at]'
    });
    this.version(2).stores({
      samples: '[metric+at]',
      nights: 'night'
    });
    this.version(3).stores({
      wakes: 'night'
    });
  }
}

let shared: RenardDB | null = null;

/** La base de l'appli (créée au premier appel). */
export function getDB(): RenardDB {
  shared ??= new RenardDB();
  return shared;
}
