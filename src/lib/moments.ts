// Ce qu'on peut lire dans le pouls gardé autour des moments, et ce qui les entoure.
// Rien ici n'est un diagnostic : on décrit, et on ne compare qu'à partir de plusieurs moments.

import type { CheckIn, HealthSample, MomentCapture, SleepNight } from '../data/types';
import { MOODS, moodFromScore } from '../fox/moods';
import { rmssd } from '../sensors/metrics';
import { formatDuration } from './healthDays';
import { addDays, startOfDay } from './history';

/** En dessous de cet écart, le pouls est considéré comme stable (il varie déjà avec la respiration). */
export const DRIFT_BPM = 4;
/** Nombre de moments mesurés avant de dire quoi que ce soit de général. */
export const PATTERN_MIN = 5;

const median = (v: number[]): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const meanIn = (pts: [number, number][], from: number, to: number, least = 1): number | null => {
  const v = pts.filter(([t]) => t >= from && t < to).map(([, x]) => x);
  return v.length >= least ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export interface MomentStats {
  /** Pouls moyen des 10 s avant le geste, puis des 10 s après. */
  before: number | null;
  after: number | null;
  /** Ce qui a bougé avant le geste : 3 dernières secondes moins 3 premières. */
  drift: number | null;
  hrvBefore: number | null;
  hrvAfter: number | null;
}

export function momentStats(c: MomentCapture): MomentStats {
  const early = meanIn(c.hr, -10_000, -7_000, 2);
  const late = meanIn(c.hr, -3_000, 0, 2);
  const beats = (from: number, to: number) => c.rr.filter(([t]) => t >= from && t < to).map(([, v]) => v);
  return {
    before: meanIn(c.hr, -10_000, 0),
    after: meanIn(c.hr, 0, 10_001),
    drift: early != null && late != null ? late - early : null,
    hrvBefore: rmssd(beats(-10_000, 0)),
    hrvAfter: rmssd(beats(0, 10_001))
  };
}

export interface MomentPattern {
  /** Moments où l'on peut dire ce que faisait le pouls avant le geste. */
  count: number;
  rising: number;
  falling: number;
  steady: number;
  /** Écart médian avant le geste, en bpm. */
  drift: number | null;
}

export function momentPattern(list: MomentCapture[]): MomentPattern {
  const drifts = list.map((c) => momentStats(c).drift).filter((d): d is number => d != null);
  const rising = drifts.filter((d) => d >= DRIFT_BPM).length;
  const falling = drifts.filter((d) => d <= -DRIFT_BPM).length;
  return { count: drifts.length, rising, falling, steady: drifts.length - rising - falling, drift: median(drifts) };
}

export function patternText(p: MomentPattern): string {
  if (p.count < PATTERN_MIN) {
    const left = PATTERN_MIN - p.count;
    const have = p.count ? `${p.count} ${p.count > 1 ? 'moments mesurés' : 'moment mesuré'}. ` : '';
    return `${have}Encore ${left} ${left > 1 ? 'moments' : 'moment'} pour commencer à comparer.`;
  }
  return `Sur ${p.count} moments, dans les 10 secondes avant ton geste, ton pouls montait dans ${p.rising}, baissait dans ${p.falling} et restait stable dans ${p.steady}.`;
}

/** L'écart au pouls moyen d'avant le geste : des moments à des pouls différents deviennent comparables. */
export function relativeCurve(c: MomentCapture): [number, number][] {
  const base = meanIn(c.hr, -10_000, 0);
  return base == null ? [] : c.hr.map(([t, v]) => [t, v - base]);
}

/** La courbe du milieu, seconde par seconde, là où au moins la moitié des moments ont une mesure. */
export function medianCurve(curves: [number, number][][]): [number, number][] {
  const out: [number, number][] = [];
  if (!curves.length) return out;
  for (let s = -10; s <= 10; s++) {
    const here: number[] = [];
    for (const curve of curves) {
      const near = curve.filter(([t]) => Math.abs(t - s * 1000) <= 1000);
      if (near.length) here.push(near.reduce((a, [, v]) => a + v, 0) / near.length);
    }
    if (here.length * 2 >= curves.length) out.push([s * 1000, median(here)!]);
  }
  return out;
}

export interface ContextData {
  samples: HealthSample[];
  checkins: CheckIn[];
  nights: SleepNight[];
}

const CHECKIN_WITHIN = 12 * 3_600_000;
const NEAR = 45 * 60_000;
const STEPS_SPAN = 30 * 60_000;

function nearest(samples: HealthSample[], metric: HealthSample['metric'], at: number): number | null {
  let best: HealthSample | null = null;
  for (const s of samples) {
    if (s.metric !== metric || Math.abs(s.at - at) > NEAR) continue;
    if (!best || Math.abs(s.at - at) < Math.abs(best.at - at)) best = s;
  }
  return best?.value ?? null;
}

/** Ce qu'on sait d'autre sur ce moment : dernière humeur, nuit, stress, variabilité, activité. */
export function momentContext(at: number, data: ContextData): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  let last: CheckIn | null = null;
  for (const c of data.checkins) if (c.at <= at && at - c.at <= CHECKIN_WITHIN && (!last || c.at > last.at)) last = c;
  if (last) out.push({ label: 'Dernière humeur notée', value: MOODS[moodFromScore(last.mood)].label });

  const day = startOfDay(at);
  const night = data.nights.find((n) => n.night === day && n.end <= at) ?? data.nights.find((n) => n.night === addDays(day, -1) && at - n.end < 86_400_000);
  if (night) {
    const asleep = night.stages.reduce((sum, [stage, min]) => (stage === 5 ? sum : sum + min), 0);
    out.push({ label: 'Nuit précédente', value: formatDuration(asleep) });
  }
  const stress = nearest(data.samples, 'stress', at);
  if (stress != null) out.push({ label: 'Stress relevé par la bague', value: `${Math.round(stress)} sur 100` });
  const hrv = nearest(data.samples, 'hrv', at);
  if (hrv != null) out.push({ label: 'Variabilité relevée par la bague', value: `${Math.round(hrv)} ms` });
  const steps = data.samples.filter((s) => s.metric === 'steps' && s.at <= at && at - s.at <= STEPS_SPAN);
  if (steps.length) {
    out.push({ label: 'Pas dans la demi-heure avant', value: Math.round(steps.reduce((a, s) => a + s.value, 0)).toLocaleString('fr-FR') });
  }
  return out;
}
