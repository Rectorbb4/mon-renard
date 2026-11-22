// Le détail d'une journée, calculé comme le montre QRing : la nuit par phases (en part du temps au lit),
// le pouls moyen, le plus bas et le plus haut, la variabilité et l'oxygène de la nuit, les pas heure par heure.

import type { HealthMetric, HealthSample, SleepNight, SleepStage } from '../data/types';
import { pulseSeries, stageMinutes, stageSegments, type StageSegment } from './healthDays';
import { addDays } from './history';

export interface Point {
  at: number;
  value: number;
}

export interface Range {
  avg: number | null;
  min: number | null;
  max: number | null;
}

const HALF_HOUR = 30 * 60_000;
const HOUR = 60 * 60_000;

function pointsOf(samples: HealthSample[], metric: HealthMetric, from: number, to: number): Point[] {
  return samples
    .filter((s) => s.metric === metric && s.at >= from && s.at <= to)
    .map(({ at, value }) => ({ at, value }))
    .sort((a, b) => a.at - b.at);
}

/** Une mesure de ceinture remplace celles de la bague prises dans les 3 minutes autour. */
const BELT_REACH = 3 * 60_000;

/** Le pouls d'une période : la ceinture quand elle est portée, la bague sinon. */
function heartPoints(samples: HealthSample[], belt: HealthSample[], from: number, to: number): Point[] {
  const ring = samples.filter((s) => s.metric === 'hr' && s.at >= from && s.at <= to);
  if (!belt.length) return pointsOf(ring, 'hr', from, to);
  const near = belt.filter((s) => s.at >= from - BELT_REACH && s.at <= to + BELT_REACH);
  return pulseSeries(ring, near).filter((p) => p.at >= from && p.at <= to);
}

export function rangeOf(points: Point[]): Range {
  if (!points.length) return { avg: null, min: null, max: null };
  const v = points.map((p) => p.value);
  return {
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    min: Math.min(...v),
    max: Math.max(...v)
  };
}

export interface StageLine {
  stage: SleepStage;
  name: string;
  minutes: number;
  /** Part du temps au lit, en %. */
  share: number;
}

/** Le moment où le corps s'est vraiment réveillé, même si la bague compte encore du sommeil au lit. */
export interface WakeEstimate {
  at: number;
  /** Minutes dormies avant ce réveil. */
  asleep: number;
  /** Minutes passées au lit ensuite. */
  lingered: number;
  /** Tu as indiqué cette heure toi-même. */
  manual?: boolean;
}

const WAKE_WINDOW = 3 * HOUR;
const WAKE_NEAR = 10 * 60_000;
const WAKE_MIN_LINGER = 15 * 60_000;
/** Le pic doit dépasser le pouls habituel de la nuit d'autant. */
const WAKE_RISE = 12;
/** Après le pic, le pouls doit rester au-dessus de celui de l'heure d'avant d'autant. */
const WAKE_HELD = 4;

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function wakeAt(segments: StageSegment[], end: number, at: number): WakeEstimate {
  const asleep = segments
    .filter((x) => x.stage !== 5 && x.from < at)
    .reduce((sum, x) => sum + (Math.min(x.to, at) - x.from) / 60_000, 0);
  return { at, asleep: Math.round(asleep), lingered: Math.round((end - at) / 60_000) };
}

/**
 * Un moment éveillé en fin de nuit, avec un pic de pouls, après lequel le pouls ne redescend pas.
 * Un réveil suivi d'un rendormissement ne compte pas : le pouls y retrouve son niveau de sommeil.
 */
export function wakeFromPulse(d: { start: number; end: number; segments: StageSegment[]; hr: Point[] }): WakeEstimate | null {
  if (d.hr.length < 24) return null;
  const usual = median(d.hr.map((p) => p.value));
  for (const s of d.segments) {
    if (s.stage !== 5 || s.from < d.end - WAKE_WINDOW || s.to > d.end - WAKE_MIN_LINGER) continue;
    const peak = d.hr.find((p) => p.at >= s.from - WAKE_NEAR && p.at <= s.to + WAKE_NEAR && p.value >= usual + WAKE_RISE);
    if (!peak) continue;
    const before = d.hr.filter((p) => p.at < peak.at && p.at >= peak.at - HOUR).map((p) => p.value);
    const after = d.hr.filter((p) => p.at > Math.max(peak.at, s.to)).map((p) => p.value);
    if (before.length < 3 || after.length < 3 || median(after) < median(before) + WAKE_HELD) continue;
    return wakeAt(d.segments, d.end, Math.min(s.from, peak.at));
  }
  return null;
}

export interface FittedNight {
  night: SleepNight;
  wake: WakeEstimate | null;
}

/** La même nuit, arrêtée à un instant. */
function cutAt(n: SleepNight, at: number): SleepNight {
  const stages: SleepNight['stages'] = [];
  let t = n.start;
  for (const [stage, minutes] of n.stages) {
    if (t >= at) break;
    const keep = Math.round(Math.min(minutes, (at - t) / 60_000));
    if (keep > 0) stages.push([stage, keep]);
    t += minutes * 60_000;
  }
  return { ...n, end: at, stages };
}

function fit(n: SleepNight, hr: Point[], noted?: number): FittedNight {
  const segments = stageSegments(n);
  // L'heure que tu donnes passe avant celle lue dans le pouls
  const wake =
    noted != null && noted > n.start && noted <= n.end
      ? { ...wakeAt(segments, n.end, noted), manual: true }
      : wakeFromPulse({ start: n.start, end: n.end, segments, hr });
  return wake ? { night: cutAt(n, wake.at), wake } : { night: n, wake: null };
}

/** La nuit ajustée : elle s'arrête au vrai réveil. Sans réveil connu, c'est la nuit de la bague. */
export function fitNight(n: SleepNight, samples: HealthSample[], noted?: number): FittedNight {
  return fit(n, pointsOf(samples, 'hr', n.start, n.end), noted);
}

/** « 07:15 » devient un instant de cette nuit, ou null s'il tombe en dehors. */
export function wakeFromClock(n: SleepNight, clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!m) return null;
  const d = new Date(n.end);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  // Réveil avant minuit pour une nuit finie après minuit
  if (d.getTime() > n.end) d.setDate(d.getDate() - 1);
  const at = d.getTime();
  return at > n.start && at <= n.end ? at : null;
}

function firstAt(points: Point[], t: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].at < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Toutes les nuits d'un coup, sans relire tout le pouls pour chacune. */
export function fitNights(nights: SleepNight[], samples: HealthSample[], noted: ReadonlyMap<number, number> = new Map()): FittedNight[] {
  const hr = samples
    .filter((s) => s.metric === 'hr')
    .map(({ at, value }) => ({ at, value }))
    .sort((a, b) => a.at - b.at);
  return nights.map((n) => fit(n, hr.slice(firstAt(hr, n.start), firstAt(hr, n.end + 1)), noted.get(n.night)));
}

export interface NightDetail {
  start: number;
  end: number;
  /** Minutes entre le coucher et le lever. */
  inBed: number;
  /** Minutes dormies, sans les moments éveillés. */
  asleep: number;
  stages: StageLine[];
  segments: StageSegment[];
  hr: Point[];
  hrRange: Range;
  hrv: Point[];
  hrvAvg: number | null;
  spo2: Point[];
  spo2Avg: number | null;
}

export const STAGE_NAMES: Record<SleepStage, string> = { 5: 'Éveillé', 4: 'Paradoxal', 2: 'Léger', 3: 'Profond' };

/** `belt` : les minutes de ceinture à préférer à la bague pour le pouls. */
export function nightDetail(n: SleepNight, samples: HealthSample[], belt: HealthSample[] = []): NightDetail {
  const t = stageMinutes(n);
  const total = t.asleep + t.awake || 1;
  const line = (stage: SleepStage, minutes: number): StageLine => ({
    stage,
    name: STAGE_NAMES[stage],
    minutes,
    share: Math.round((minutes / total) * 100)
  });
  // La mesure prise à l'instant du réveil n'appartient plus au sommeil
  const last = n.end - 1;
  const hr = heartPoints(samples, belt, n.start, last);
  // La case de la variabilité couvre une demi-heure et celle de l'oxygène une heure : celle du coucher compte
  const hrv = pointsOf(samples, 'hrv', n.start - HALF_HOUR + 1, last);
  const spo2 = pointsOf(samples, 'spo2', n.start - HOUR + 1, last);
  const segments = stageSegments(n);
  return {
    start: n.start,
    end: n.end,
    inBed: Math.round((n.end - n.start) / 60_000),
    asleep: t.asleep,
    stages: [line(5, t.awake), line(4, t.rem), line(2, t.light), line(3, t.deep)],
    segments,
    hr,
    hrRange: rangeOf(hr),
    hrv,
    hrvAvg: rangeOf(hrv).avg,
    spo2,
    spo2Avg: rangeOf(spo2).avg
  };
}

export interface HeartDetail extends Range {
  points: Point[];
  last: Point | null;
  /** Minutes venues de la ceinture. */
  beltMinutes: number;
  /** Mesures venues de la bague. */
  ringCount: number;
}

/** Le pouls de ce jour-là, de minuit à minuit : la bague, ou la ceinture quand `belt` en contient. */
export function dayHeart(day: number, samples: HealthSample[], belt: HealthSample[] = []): HeartDetail {
  const end = addDays(day, 1) - 1;
  const points = heartPoints(samples, belt, day, end);
  const beltMinutes = belt.filter((s) => s.at >= day && s.at <= end).length;
  return { ...rangeOf(points), points, last: points.at(-1) ?? null, beltMinutes, ringCount: points.length - beltMinutes };
}

export interface ActivityDetail {
  steps: number;
  meters: number;
  /** Pas par heure, seulement les heures où il y en a. */
  hours: Point[];
}

export function dayActivity(day: number, samples: HealthSample[]): ActivityDetail {
  const end = addDays(day, 1) - 1;
  const quarter = pointsOf(samples, 'steps', day, end);
  const bins = new Map<number, number>();
  for (const p of quarter) {
    const d = new Date(p.at);
    d.setMinutes(0, 0, 0);
    bins.set(d.getTime(), (bins.get(d.getTime()) ?? 0) + p.value);
  }
  return {
    steps: quarter.reduce((a, p) => a + p.value, 0),
    meters: pointsOf(samples, 'meters', day, end).reduce((a, p) => a + p.value, 0),
    hours: [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([at, value]) => ({ at, value }))
  };
}

export interface DayMetric extends Range {
  points: Point[];
}

/** Une mesure sur la journée. L'oxygène garde le plus bas et le plus haut réels de chaque heure. */
export function dayMetric(day: number, samples: HealthSample[], metric: HealthMetric): DayMetric {
  const end = addDays(day, 1);
  const kept = samples.filter((s) => s.metric === metric && s.at >= day && s.at < end).sort((a, b) => a.at - b.at);
  const points = kept.map(({ at, value }) => ({ at, value }));
  if (!kept.length) return { ...rangeOf([]), points };
  return {
    avg: rangeOf(points).avg,
    min: Math.min(...kept.map((s) => s.min ?? s.value)),
    max: Math.max(...kept.map((s) => s.max ?? s.value)),
    points
  };
}

export interface ZoneDef {
  name: string;
  range: string;
  from: number;
  to: number;
}

export interface ZoneShare extends ZoneDef {
  share: number;
}

export const HRV_ZONES: ZoneDef[] = [
  { name: 'Faible', range: 'moins de 30', from: 0, to: 29 },
  { name: 'Normal', range: '30 à 60', from: 30, to: 60 },
  { name: 'Bon', range: '61 à 101', from: 61, to: 101 },
  { name: 'Excellent', range: 'plus de 101', from: 102, to: Infinity }
];

export const SPO2_ZONES: ZoneDef[] = [
  { name: 'Moins de 95 %', range: '', from: 0, to: 94 },
  { name: '95 à 97 %', range: '', from: 95, to: 97 },
  { name: '98 % ou plus', range: '', from: 98, to: 100 }
];

export const STRESS_ZONES: ZoneDef[] = [
  { name: 'Détendu', range: '0 à 29', from: 0, to: 29 },
  { name: 'Normal', range: '30 à 59', from: 30, to: 59 },
  { name: 'Moyen', range: '60 à 79', from: 60, to: 79 },
  { name: 'Élevé', range: '80 à 100', from: 80, to: 100 }
];

/** La part des mesures dans chaque zone. Les arrondis tombent toujours juste sur 100 %. */
export function zonesOf(points: Point[], defs: ZoneDef[]): ZoneShare[] {
  if (!points.length) return defs.map((d) => ({ ...d, share: 0 }));
  const exact = defs.map((d) => (points.filter((p) => p.value >= d.from && p.value <= d.to).length / points.length) * 100);
  const share = exact.map(Math.floor);
  const rest = Math.round(exact.reduce((a, b) => a + b, 0)) - share.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, left: v - share[i] })).sort((a, b) => b.left - a.left);
  for (let k = 0; k < rest; k++) share[order[k].i]++;
  return defs.map((d, i) => ({ ...d, share: share[i] }));
}

/** « 0,02 km ». */
export function formatKm(meters: number): string {
  return `${(meters / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}
