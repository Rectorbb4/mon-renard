// Calculs de l'historique : périodes, graduations par jour, regroupement du journal par journée.

import type { CheckIn, FeltEvent } from '../data/types';

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

export function averageMood(checkins: CheckIn[]): number | null {
  if (!checkins.length) return null;
  return checkins.reduce((sum, c) => sum + c.mood, 0) / checkins.length;
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
