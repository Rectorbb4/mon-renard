// Les objectifs du quotidien : tes pas, l'heure où tu t'endors, une respiration.
// Chaque réussite donne une noisette. Rien ne se perd, il n'y a pas de série à tenir,
// et rien ici ne récompense l'humeur, l'énergie ni le fait de dormir peu.

import type { Goals, Reward, RewardKind, SleepNight } from '../data/types';
import { stageMinutes, stageSegments } from './healthDays';
import { startOfDay } from './history';

export const STEP_MIN = 1000;
export const STEP_MAX = 20_000;
export const STEP_INCREMENT = 500;
export const DEFAULT_STEPS = 6000;
/** 23 h 30. */
export const DEFAULT_BEDTIME = 23 * 60 + 30;
/** Une sieste ne compte pas comme une nuit. */
const MIN_NIGHT_MINUTES = 180;
/** Une heure limite à partir de midi tombe la veille du réveil. */
const NOON = 12 * 60;
/** Au-delà, ce n'est plus un coucher mais une longue sieste d'après-midi. */
const LONGEST_BEFORE = 10 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function cleanSteps(value: number): number {
  const round = Math.round(value / STEP_INCREMENT) * STEP_INCREMENT;
  return Math.max(STEP_MIN, Math.min(STEP_MAX, Number.isFinite(round) ? round : DEFAULT_STEPS));
}

/** Un objectif atteignable : ton habitude, plus 500 pas. */
export function suggestedSteps(habit: number | null): number {
  return habit == null || !Number.isFinite(habit) ? DEFAULT_STEPS : cleanSteps(Math.round(habit / STEP_INCREMENT) * STEP_INCREMENT + STEP_INCREMENT);
}

export function cleanBedtime(value: number): number {
  const m = Math.round(value) % 1440;
  return m < 0 ? m + 1440 : m;
}

/** « 23:30 » en minutes depuis minuit, ou null. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export const clockText = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** L'heure du rappel : une heure avant. */
export const reminderClock = (bedtime: number) => clockText(cleanBedtime(bedtime - 60));

export function newGoals(now: number, habit: number | null): Goals {
  return {
    id: 1,
    steps: suggestedSteps(habit),
    stepsChangedDay: startOfDay(now),
    bedtime: DEFAULT_BEDTIME,
    bedSince: now,
    reminder: true,
    createdAt: now
  };
}

/** L'objectif du jour où on le change reste le plus haut des deux : baisser la barre ne donne pas la noisette. */
export function stepsTarget(g: Goals, day: number): number {
  return day > g.stepsChangedDay ? g.steps : Math.max(g.steps, g.stepsBefore ?? g.steps);
}

export function changeSteps(g: Goals, steps: number, now: number): Goals {
  const today = startOfDay(now);
  const before = today === g.stepsChangedDay ? g.stepsBefore : stepsTarget(g, today);
  const next: Goals = { ...g, steps: cleanSteps(steps), stepsChangedDay: today };
  if (before != null) next.stepsBefore = before;
  else delete next.stepsBefore;
  return next;
}

/** La nouvelle heure vaut pour les prochaines nuits : les nuits passées ne sont pas relues avec elle. */
export function changeBedtime(g: Goals, bedtime: number, now: number): Goals {
  const clean = cleanBedtime(bedtime);
  return clean === g.bedtime ? g : { ...g, bedtime: clean, bedSince: now };
}

/** L'instant limite d'une nuit (`night` : minuit du jour du réveil). 23:30 tombe la veille, 00:30 le jour même. */
export function bedDeadline(night: number, bedtime: number): number {
  const d = new Date(night);
  if (bedtime >= NOON) d.setDate(d.getDate() - 1);
  d.setHours(Math.floor(bedtime / 60), bedtime % 60, 0, 0);
  return d.getTime();
}

/** Le moment où tu t'es vraiment endormi : après les premières minutes éveillées au lit. */
export function fellAsleepAt(n: SleepNight): number | null {
  return stageSegments(n).find((s) => s.stage !== 5)?.from ?? null;
}

export function madeBedtime(g: Goals, n: SleepNight): boolean {
  if (n.start < g.bedSince || stageMinutes(n).asleep < MIN_NIGHT_MINUTES) return false;
  const at = fellAsleepAt(n);
  if (at == null) return false;
  const limit = bedDeadline(n.night, g.bedtime);
  return at <= limit && at >= limit - LONGEST_BEFORE;
}

export const rewardKey = (day: number, kind: RewardKind) => `${day}:${kind}`;

export interface QuestDay {
  day: number;
  steps: number | null;
  /** Nuits plus courtes avec plus d'énergie : l'objectif de pas se met de côté, sans rien faire perdre. */
  rising: boolean;
  night: SleepNight | null;
}

/** Les noisettes gagnées et pas encore rangées. */
export function dueRewards(g: Goals, days: QuestDay[], have: ReadonlySet<string>, now: number): Reward[] {
  const from = startOfDay(g.createdAt);
  const out: Reward[] = [];
  for (const d of days) {
    if (d.day >= from && !d.rising && d.steps != null && d.steps >= stepsTarget(g, d.day) && !have.has(rewardKey(d.day, 'pas'))) {
      out.push({ day: d.day, kind: 'pas', at: now });
    }
    if (d.night && madeBedtime(g, d.night) && !have.has(rewardKey(d.night.night, 'coucher'))) {
      out.push({ day: d.night.night, kind: 'coucher', at: now });
    }
  }
  return out;
}
