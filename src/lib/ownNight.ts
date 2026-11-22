// La nuit du renard quand elle n'a pas été notée : celle qui s'arrête à ton vrai réveil, jamais la nuit brute de la bague.
// Elle se lit par rapport à tes propres nuits, pas à une norme.

import type { RenardDB } from '../data/db';
import { nightsBetween, samplesBetween, wakesBetween } from '../data/health';
import { fitNights, median, type FittedNight } from './dayDetail';
import { stageMinutes } from './healthDays';
import { addDays, startOfDay } from './history';

export interface OwnNight {
  /** L'heure du réveil repéré. */
  at: number;
  /** Minutes dormies avant ce réveil. */
  asleep: number;
  /** Ta durée habituelle, en minutes, ou null tant qu'il y a trop peu de nuits. */
  usual: number | null;
  /** Remplissage de la jauge, de 0 à 1 : pleine à partir de ta durée habituelle. */
  fill: number;
}

const LOOKBACK_DAYS = 14;
const MIN_NIGHTS = 3;
/** Repère de départ, tant que tes propres nuits ne suffisent pas. */
const FIRST_REFERENCE = 8 * 60;

export function ownNight(fitted: FittedNight[], now = Date.now()): OwnNight | null {
  const today = startOfDay(now);
  const tonight = fitted.find((f) => f.night.night === today);
  // Sans réveil repéré, il ne resterait que le chiffre de la bague
  if (!tonight?.wake) return null;
  const from = addDays(today, -LOOKBACK_DAYS);
  const past = fitted
    .filter((f) => f.night.night >= from && f.night.night < today)
    .map((f) => stageMinutes(f.night).asleep)
    .filter((m) => m > 0);
  const usual = past.length >= MIN_NIGHTS ? Math.round(median(past)) : null;
  const { at, asleep } = tonight.wake;
  return { at, asleep, usual, fill: Math.min(1, asleep / (usual ?? FIRST_REFERENCE)) };
}

/** Relit la nuit de ce matin et les deux semaines d'avant. */
export async function readOwnNight(db: RenardDB, now = Date.now()): Promise<OwnNight | null> {
  const today = startOfDay(now);
  const first = addDays(today, -LOOKBACK_DAYS);
  const nights = await nightsBetween(db, first, addDays(today, 1));
  if (!nights.some((n) => n.night === today)) return null;
  const from = Math.min(...nights.map((n) => n.start));
  const to = Math.max(...nights.map((n) => n.end)) + 1;
  const [hr, noted] = await Promise.all([samplesBetween(db, 'hr', from, to), wakesBetween(db, first, addDays(today, 1))]);
  return ownNight(fitNights(nights, hr, noted), now);
}
