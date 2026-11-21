// Le lien entre la base locale et l'interface : profil actif et dernier check-in, tenus à jour en direct.

import { liveQuery } from 'dexie';
import {
  addCheckIn,
  deleteCheckIn,
  ensureProfile,
  lastCheckIn,
  lastSleepCheckIn,
  restoreCheckIn,
  sleepNotedToday
} from '../data/checkins';
import { getDB } from '../data/db';
import {
  addFeltEvent,
  deleteFeltEvent,
  deleteFeltEventsAt,
  lastFeltEvent,
  noteFeltEventsAt,
  restoreFeltEvent,
  setFeltNote
} from '../data/events';
import type { CheckIn, CheckInInput, FeltEvent } from '../data/types';
import { isAndroidApp, updateWidget } from './android';

export const journal = $state({
  /** La base est ouverte et le profil connu. */
  ready: false,
  /** La base locale n'a pas pu s'ouvrir (navigation privée stricte, stockage plein…). */
  error: null as string | null,
  profileId: null as number | null,
  last: null as CheckIn | null,
  /** Le dernier check-in où la nuit a été notée (jauge « nuit »). */
  lastSleep: null as CheckIn | null,
  /** Le dernier moment « je le sens ». */
  lastFelt: null as FeltEvent | null
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
      liveQuery(() => lastSleepCheckIn(db, profileId)).subscribe({
        next: (c) => (journal.lastSleep = c ?? null),
        error: (e) => console.error(e)
      });
      liveQuery(() => lastFeltEvent(db, profileId)).subscribe({
        next: (e) => (journal.lastFelt = e ?? null),
        error: (e) => console.error(e)
      });
      // Dans l'appli Android, le widget suit le dernier check-in et le dernier moment
      if (isAndroidApp()) {
        $effect.root(() => {
          $effect(() => {
            if (journal.ready)
              updateWidget($state.snapshot(journal.last), $state.snapshot(journal.lastFelt), $state.snapshot(journal.lastSleep));
          });
        });
      }
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
  if (saved.sleep != null) journal.lastSleep = saved;
  askPersistentStorage();
  return saved;
}

async function profile(): Promise<number> {
  await startJournal();
  if (journal.profileId == null) throw new Error(journal.error ?? 'Stockage indisponible');
  return journal.profileId;
}

/** « Je le sens » : note l'instant tout de suite (ou un instant passé : pause demandée appli fermée). */
export async function feelIt(at = Date.now()): Promise<FeltEvent> {
  const event = await addFeltEvent(getDB(), await profile(), at);
  if (!journal.lastFelt || event.at >= journal.lastFelt.at) journal.lastFelt = event;
  askPersistentStorage();
  return event;
}

export async function noteFelt(id: number, note: string): Promise<void> {
  await setFeltNote(getDB(), id, note);
}

/** Une pause lancée par erreur : elle disparaît du journal. */
export async function cancelFeltAt(at: number): Promise<void> {
  await deleteFeltEventsAt(getDB(), await profile(), at);
}

/** Ce qu'on ressent pendant une pause, sur le moment noté à cet instant. */
export async function noteFeltAt(at: number, note: string): Promise<void> {
  await noteFeltEventsAt(getDB(), await profile(), at, note);
}

/** Annule un moment noté par erreur. */
export async function cancelFelt(id: number): Promise<void> {
  await deleteFeltEvent(getDB(), id);
}

/** Une saisie du journal : un check-in ou un moment « je le sens ». */
export type Entry = { kind: 'checkin'; checkin: CheckIn } | { kind: 'felt'; event: FeltEvent };

/** Efface une saisie du journal (le renard et le widget suivent tout seuls). */
export async function removeEntry(entry: Entry): Promise<void> {
  const db = getDB();
  if (entry.kind === 'checkin') {
    if (entry.checkin.id != null) await deleteCheckIn(db, entry.checkin.id);
  } else if (entry.event.id != null) await deleteFeltEvent(db, entry.event.id);
}

/** Remet une saisie qui vient d'être effacée. */
export async function restoreEntry(entry: Entry): Promise<void> {
  const db = getDB();
  if (entry.kind === 'checkin') await restoreCheckIn(db, entry.checkin);
  else await restoreFeltEvent(db, entry.event);
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
