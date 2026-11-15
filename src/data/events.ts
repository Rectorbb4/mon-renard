// Les moments « je le sens » : un geste pour noter l'instant, une note facultative après coup.

import { Dexie } from 'dexie';
import type { RenardDB } from './db';
import type { FeltEvent } from './types';

export const NOTE_MAX = 200;

/** Nettoie une note : espaces superflus retirés, longueur bornée. Renvoie undefined si elle est vide. */
export function cleanNote(note: string | undefined): string | undefined {
  const clean = note?.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_MAX);
  return clean ? clean : undefined;
}

export async function addFeltEvent(db: RenardDB, profileId: number, at = Date.now()): Promise<FeltEvent> {
  const event: FeltEvent = { profileId, at };
  event.id = (await db.events.add(event)) as number;
  return event;
}

/** Ajoute, change ou efface (note vide) la note d'un moment. */
export async function setFeltNote(db: RenardDB, id: number, note: string | undefined): Promise<void> {
  const clean = cleanNote(note);
  await db.events.where('id').equals(id).modify((e) => {
    if (clean) e.note = clean;
    else delete e.note;
  });
}

export function deleteFeltEvent(db: RenardDB, id: number): Promise<void> {
  return db.events.delete(id);
}

/** Remet un moment effacé, avec le même identifiant (bouton « Annuler »). */
export async function restoreFeltEvent(db: RenardDB, event: FeltEvent): Promise<void> {
  await db.events.put(event);
}

export function lastFeltEvent(db: RenardDB, profileId: number): Promise<FeltEvent | undefined> {
  return db.events
    .where('[profileId+at]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .last();
}

/** Les moments du profil entre deux instants (bornes comprises), du plus ancien au plus récent. */
export function feltEventsBetween(db: RenardDB, profileId: number, from: number, to: number): Promise<FeltEvent[]> {
  return db.events.where('[profileId+at]').between([profileId, from], [profileId, to], true, true).toArray();
}
