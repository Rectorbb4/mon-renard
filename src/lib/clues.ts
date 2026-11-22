// Le carnet du renard : quand une tendance apparaît, il la note comme une piste à vérifier.
// Une piste reste dans le carnet même si la tendance change ensuite. Ce n'est jamais un diagnostic.

import type { FeltEvent, MomentCapture } from '../data/types';
import type { DayStat, Relation } from './healthDays';
import { median } from './healthDays';
import { addDays, startOfDay } from './history';
import { momentPattern, PATTERN_MIN } from './moments';

export interface FoundClue {
  id: string;
  text: string;
}

const PARTS: { id: string; name: string; from: number; to: number }[] = [
  { id: 'matin', name: 'le matin', from: 6, to: 12 },
  { id: 'aprem', name: "l'après-midi", from: 12, to: 18 },
  { id: 'soir', name: 'le soir', from: 18, to: 23 },
  { id: 'nuit', name: 'la nuit', from: 23, to: 30 }
];

function partOf(at: number) {
  const h = new Date(at).getHours();
  const hour = h < 6 ? h + 24 : h;
  return PARTS.find((p) => hour >= p.from && hour < p.to)!;
}

/** Un moment sur deux au moins dans une même partie de la journée, sur 5 moments ou plus. */
function hourClue(events: FeltEvent[]): FoundClue | null {
  if (events.length < PATTERN_MIN) return null;
  const counts = new Map<string, number>();
  for (const e of events) counts.set(partOf(e.at).id, (counts.get(partOf(e.at).id) ?? 0) + 1);
  const [id, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n / events.length < 0.6) return null;
  const part = PARTS.find((p) => p.id === id)!;
  return { id: `heure-${id}`, text: `Tes moments « je le sens » arrivent surtout ${part.name} : ${n} sur ${events.length}.` };
}

/** Les moments tombent plus souvent après une nuit plus courte que d'habitude. */
function shortNightClue(events: FeltEvent[], days: DayStat[]): FoundClue | null {
  if (events.length < PATTERN_MIN) return null;
  const nights = days.map((d) => d.sleep).filter((v): v is number => v != null);
  if (nights.length < 10) return null;
  const usual = median(nights)!;
  const short = new Set(days.filter((d) => d.sleep != null && d.sleep <= usual - 45).map((d) => d.day));
  if (short.size < 2) return null;
  const measured = new Set(days.filter((d) => d.sleep != null).map((d) => d.day));
  const counted = events.filter((e) => measured.has(startOfDay(e.at)));
  if (counted.length < PATTERN_MIN) return null;
  // On compare des moments par jour, depuis le premier moment noté : avant, il n'y avait rien à compter
  const first = Math.min(...counted.map((e) => startOfDay(e.at)));
  const period = [...measured].filter((d) => d >= first);
  const shortDays = period.filter((d) => short.has(d)).length;
  const otherDays = period.length - shortDays;
  if (shortDays < 2 || otherDays < 3) return null;
  const after = counted.filter((e) => short.has(startOfDay(e.at))).length;
  const others = counted.length - after;
  if (after < 3 || after / shortDays < (others / otherDays) * 1.5) return null;
  return { id: 'nuit-courte', text: `Tes moments arrivent plus souvent après une nuit plus courte que d’habitude : ${after} sur ${counted.length}.` };
}

function pulseClue(captures: MomentCapture[]): FoundClue | null {
  const p = momentPattern(captures);
  if (p.count < PATTERN_MIN || p.rising / p.count < 0.6) return null;
  return { id: 'pouls-avant', text: `Dans ${p.rising} moments sur ${p.count}, ton pouls montait déjà dans les 10 secondes avant ton geste.` };
}

export function findClues(days: DayStat[], events: FeltEvent[], links: Relation[]): FoundClue[] {
  const out: FoundClue[] = links.map((l) => ({ id: `lien:${l.text}`, text: l.text }));
  const recent = events.filter((e) => days.length && e.at >= addDays(days[0].day, 0));
  for (const c of [
    hourClue(recent),
    shortNightClue(recent, days),
    pulseClue(recent.flatMap((e) => (e.capture ? [e.capture] : [])))
  ]) {
    if (c) out.push(c);
  }
  return out;
}
