// Ton rythme : tes trois dernières nuits et ton énergie, comparées à tes propres semaines.
// Un repère pour t'aider à anticiper, jamais un diagnostic.

import { median, type DayStat } from './healthDays';

export type RhythmKind = 'learning' | 'steady' | 'shorter' | 'longer' | 'rising' | 'falling';

export interface Rhythm {
  kind: RhythmKind;
  /** Nuits encore nécessaires pour connaître ton habitude. */
  missing: number;
  /** Durée typique de tes trois dernières nuits, en minutes. */
  recent: number | null;
  /** Ta durée habituelle, en minutes. */
  usual: number | null;
}

const RECENT_DAYS = 3;
const PAST_DAYS = 28;
const MIN_PAST_NIGHTS = 7;
const MIN_RECENT_NIGHTS = 2;
const MIN_PAST_CHECKINS = 5;
/** Une nuit compte comme différente à partir d'une heure d'écart. */
const SLEEP_SHIFT = 60;
const ENERGY_SHIFT = 0.15;
const MOOD_SHIFT = 0.2;

const known = (v: (number | null)[]) => v.filter((x): x is number => x != null);

/** 1 si la valeur récente est nettement plus haute que d'habitude, -1 plus basse, 0 sinon. */
function direction(recent: DayStat[], past: DayStat[], key: 'energy' | 'mood', shift: number): number {
  const now = known(recent.map((d) => d[key]));
  const before = known(past.map((d) => d[key]));
  if (!now.length || before.length < MIN_PAST_CHECKINS) return 0;
  const diff = now.reduce((a, b) => a + b, 0) / now.length - median(before)!;
  return diff >= shift ? 1 : diff <= -shift ? -1 : 0;
}

export function rhythm(days: DayStat[]): Rhythm {
  const cut = Math.max(0, days.length - RECENT_DAYS);
  const recentDays = days.slice(cut);
  const pastDays = days.slice(Math.max(0, cut - PAST_DAYS), cut);
  const nights = known(recentDays.map((d) => d.sleep));
  const past = known(pastDays.map((d) => d.sleep));
  const missing = Math.max(MIN_PAST_NIGHTS - past.length, MIN_RECENT_NIGHTS - nights.length, 0);
  if (missing > 0) return { kind: 'learning', missing, recent: null, usual: null };

  const usual = median(past)!;
  const recent = median(nights)!;
  const shorter = nights.filter((m) => m <= usual - SLEEP_SHIFT).length >= MIN_RECENT_NIGHTS;
  const longer = nights.filter((m) => m >= usual + SLEEP_SHIFT).length >= MIN_RECENT_NIGHTS;
  const energy = direction(recentDays, pastDays, 'energy', ENERGY_SHIFT);
  const mood = direction(recentDays, pastDays, 'mood', MOOD_SHIFT);

  let kind: RhythmKind = 'steady';
  if (shorter) kind = energy > 0 || mood > 0 ? 'rising' : 'shorter';
  else if (longer) kind = energy < 0 || mood < 0 ? 'falling' : 'longer';
  return { kind, missing: 0, recent: Math.round(recent), usual: Math.round(usual) };
}
