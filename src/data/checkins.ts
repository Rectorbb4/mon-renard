// Lecture et écriture des profils et des check-ins.

import { Dexie } from 'dexie';
import type { RenardDB } from './db';
import type { CheckIn, CheckInInput } from './types';

export const WORD_MAX = 40;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Nettoie une saisie : valeurs bornées, mot coupé et sans espaces superflus. Lève une erreur si c'est inutilisable. */
export function normalizeCheckIn(input: CheckInInput, profileId: number, at: number): CheckIn {
  if (!Number.isFinite(input.mood) || !Number.isFinite(input.energy)) {
    throw new Error('Humeur et énergie doivent être des nombres.');
  }
  const sleep = input.sleep == null || !Number.isFinite(input.sleep) ? null : round(clamp(input.sleep, 0, 1));
  const word = input.word?.replace(/\s+/g, ' ').trim().slice(0, WORD_MAX);
  const checkin: CheckIn = {
    profileId,
    at,
    mood: round(clamp(input.mood, -1, 1)),
    energy: round(clamp(input.energy, 0, 1)),
    sleep
  };
  if (word) checkin.word = word;
  return checkin;
}

/** Renvoie le profil principal, en le créant à la première ouverture. */
export async function ensureProfile(db: RenardDB, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.profiles, async () => {
    const first = await db.profiles.orderBy('id').first();
    if (first?.id != null) return first.id;
    return (await db.profiles.add({ name: 'Moi', kind: 'adult', createdAt: now })) as number;
  });
}

export async function addCheckIn(db: RenardDB, profileId: number, input: CheckInInput, at = Date.now()): Promise<CheckIn> {
  const checkin = normalizeCheckIn(input, profileId, at);
  checkin.id = (await db.checkins.add(checkin)) as number;
  return checkin;
}

/** Le check-in le plus récent du profil, ou undefined s'il n'y en a pas encore. */
export function lastCheckIn(db: RenardDB, profileId: number): Promise<CheckIn | undefined> {
  return db.checkins
    .where('[profileId+at]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .last();
}

/** Le check-in le plus récent où la nuit a été notée, ou undefined. */
export function lastSleepCheckIn(db: RenardDB, profileId: number): Promise<CheckIn | undefined> {
  return db.checkins
    .where('[profileId+at]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .reverse()
    .filter((c) => c.sleep != null)
    .first();
}

/** Les check-ins du profil entre deux instants (bornes comprises), du plus ancien au plus récent. */
export function checkInsBetween(db: RenardDB, profileId: number, from: number, to: number): Promise<CheckIn[]> {
  return db.checkins.where('[profileId+at]').between([profileId, from], [profileId, to], true, true).toArray();
}

/** Début de la journée (minuit, heure locale) qui contient `at`. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Vrai si la nuit a déjà été notée aujourd'hui. */
export async function sleepNotedToday(db: RenardDB, profileId: number, now = Date.now()): Promise<boolean> {
  const today = await checkInsBetween(db, profileId, startOfDay(now), now);
  return today.some((c) => c.sleep != null);
}
