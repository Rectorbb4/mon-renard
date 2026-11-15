// Base de données locale (IndexedDB, via Dexie). Rien ne quitte le téléphone.
// Pour ajouter une table plus tard (capteurs…), créer une version 2 sans toucher à la version 1.

import Dexie, { type EntityTable } from 'dexie';
import type { CheckIn, FeltEvent, Profile } from './types';

export class RenardDB extends Dexie {
  profiles!: EntityTable<Profile, 'id'>;
  checkins!: EntityTable<CheckIn, 'id'>;
  events!: EntityTable<FeltEvent, 'id'>;

  constructor(name = 'mon-renard') {
    super(name);
    this.version(1).stores({
      profiles: '++id',
      checkins: '++id, [profileId+at]',
      events: '++id, [profileId+at]'
    });
  }
}

let shared: RenardDB | null = null;

/** La base de l'appli (créée au premier appel). */
export function getDB(): RenardDB {
  shared ??= new RenardDB();
  return shared;
}
