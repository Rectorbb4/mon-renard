// Calculs de l'historique : périodes, graduations par jour, regroupement du journal par journée.

import type { CheckIn, FeltEvent } from '../data/types';
import { MOOD_IDS, moodFromScore, type MoodId } from '../fox/moods';

/** Minuit (heure locale) du jour qui contient `at`. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Minuit, `n` jours plus tard (ou plus tôt si n < 0), en tenant compte des changements d'heure. */
export function addDays(day: number, n: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Début d'une période de `days` jours qui finit aujourd'hui (aujourd'hui compris). */
export function periodStart(days: number, now = Date.now()): number {
  return addDays(startOfDay(now), -(days - 1));
}

/** Les minuits à afficher sous une courbe, au plus `max`, régulièrement espacés et finissant aujourd'hui. */
export function dayTicks(from: number, to: number, max = 7): number[] {
  const days: number[] = [];
  for (let d = startOfDay(to); d >= from; d = addDays(d, -1)) days.push(d);
  const step = Math.max(1, Math.ceil(days.length / max));
  return days.filter((_, i) => i % step === 0).reverse();
}

export interface MoodShare {
  /** Part de chaque humeur, de 0 à 1 (la somme fait 1). */
  share: Record<MoodId, number>;
  /** Nombre de journées avec au moins un check-in. */
  days: number;
}

/**
 * Où était l'humeur sur la période : chaque journée compte autant, quel que soit le nombre de check-ins
 * (deux check-ins le même jour comptent chacun pour une demi-journée). Plus juste qu'une moyenne,
 * qui ferait d'un creux et d'un emballement un faux « équilibre ».
 */
export function moodShare(checkins: CheckIn[]): MoodShare | null {
  if (!checkins.length) return null;
  const perDay = new Map<number, CheckIn[]>();
  for (const c of checkins) {
    const day = startOfDay(c.at);
    const list = perDay.get(day);
    if (list) list.push(c);
    else perDay.set(day, [c]);
  }
  const share = Object.fromEntries(MOOD_IDS.map((id) => [id, 0])) as Record<MoodId, number>;
  for (const list of perDay.values()) {
    for (const c of list) share[moodFromScore(c.mood)] += 1 / list.length / perDay.size;
  }
  return { share, days: perDay.size };
}

export type JournalItem = { kind: 'checkin'; at: number; checkin: CheckIn } | { kind: 'felt'; at: number; event: FeltEvent };

export interface JournalDay {
  day: number;
  items: JournalItem[];
}

/** Check-ins et moments mêlés, regroupés par jour : le plus récent en premier. */
export function groupByDay(checkins: CheckIn[], events: FeltEvent[]): JournalDay[] {
  const items: JournalItem[] = [
    ...checkins.map((checkin) => ({ kind: 'checkin' as const, at: checkin.at, checkin })),
    ...events.map((event) => ({ kind: 'felt' as const, at: event.at, event }))
  ].sort((a, b) => b.at - a.at);
  const days: JournalDay[] = [];
  for (const item of items) {
    const day = startOfDay(item.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days;
}

/** « Aujourd'hui », « Hier », ou « lundi 10 novembre ». */
export function dayLabel(day: number, now = Date.now()): string {
  const today = startOfDay(now);
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, -1)) return 'Hier';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(day);
}
