// Le lien entre la base locale et l'interface : profil actif et dernier check-in, tenus à jour en direct.

import { liveQuery } from 'dexie';
import { addCheckIn, ensureProfile, lastCheckIn, sleepNotedToday } from '../data/checkins';
import { getDB } from '../data/db';
import type { CheckIn, CheckInInput } from '../data/types';

export const journal = $state({
  /** La base est ouverte et le profil connu. */
  ready: false,
  /** La base locale n'a pas pu s'ouvrir (navigation privée stricte, stockage plein…). */
  error: null as string | null,
  profileId: null as number | null,
  last: null as CheckIn | null
});

let started: Promise<void> | null = null;

/** Ouvre la base et suit le dernier check-in. Sans effet si c'est déjà fait. */
export function startJournal(): Promise<void> {
  started ??= (async () => {
    try {
      // Ancien réglage de la version d'essai (étape 1), devenu inutile.
      try {
        localStorage.removeItem('mon-renard:essai-humeur');
      } catch {
        /* stockage indisponible */
      }
      const db = getDB();
      const profileId = await ensureProfile(db);
      journal.profileId = profileId;
      liveQuery(() => lastCheckIn(db, profileId)).subscribe({
        next: (c) => {
          journal.last = c ?? null;
          journal.ready = true;
        },
        error: (e) => {
          console.error(e);
          journal.error = "Tes check-ins n'ont pas pu être lus sur ce téléphone.";
        }
      });
    } catch (e) {
      console.error(e);
      journal.error = "Le stockage du téléphone n'est pas disponible. Les check-ins ne pourront pas être gardés.";
    }
  })();
  return started;
}

export async function saveCheckIn(input: CheckInInput): Promise<CheckIn> {
  await startJournal();
  if (journal.profileId == null) throw new Error(journal.error ?? 'Stockage indisponible');
  const saved = await addCheckIn(getDB(), journal.profileId, input);
  journal.last = saved;
  askPersistentStorage();
  return saved;
}

export async function isSleepNotedToday(): Promise<boolean> {
  await startJournal();
  if (journal.profileId == null) return false;
  return sleepNotedToday(getDB(), journal.profileId);
}

/** Demande au navigateur de ne jamais effacer les données de l'appli pour faire de la place. */
function askPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}
