// Les objectifs côté interface : lit tes pas, tes nuits et tes noisettes, et range ce que tu viens de gagner.

import { checkInsBetween } from '../data/checkins';
import { getDB } from '../data/db';
import { nightsBetween, samplesBetween, wakesBetween } from '../data/health';
import type { Goals, Reward, RewardKind, SleepNight } from '../data/types';
import { bedtimeBridge } from './android';
import { fitNights } from './dayDetail';
import { baseline, buildDays } from './healthDays';
import { addDays, startOfDay } from './history';
import { journal } from './journal.svelte';
import { changeBedtime, changeSteps, dueRewards, newGoals, rewardKey, stepsTarget, type QuestDay } from './quests';
import { rhythm } from './rhythm';

/** Assez de jours pour connaître ton rythme habituel. */
const LOADED_DAYS = 35;
/** Tes pas ou ta nuit peuvent arriver plus tard : on regarde la semaine écoulée. */
const LOOK_BACK = 7;

export const quests = $state({
  ready: false,
  goals: null as Goals | null,
  rewards: [] as Reward[],
  /** Pas d'aujourd'hui. */
  steps: null as number | null,
  /** Objectif de pas d'aujourd'hui. */
  target: 0,
  /** Nuits plus courtes avec plus d'énergie : l'objectif de pas est mis de côté. */
  rising: false,
  /** La nuit qui s'est terminée aujourd'hui. */
  lastNight: null as SleepNight | null,
  /** La noisette qu'on vient de gagner, le temps de la montrer. */
  won: null as RewardKind | null,
  error: false
});

let running: Promise<void> | null = null;
let wonTimer: ReturnType<typeof setTimeout> | undefined;

function showWon(kind: RewardKind) {
  quests.won = kind;
  clearTimeout(wonTimer);
  wonTimer = setTimeout(() => (quests.won = null), 6000);
}

function syncReminder(g: Goals) {
  try {
    bedtimeBridge()?.setBedtimeReminder(g.reminder, g.bedtime);
  } catch (e) {
    console.error(e);
  }
}

async function load(): Promise<void> {
  const db = getDB();
  const now = Date.now();
  const today = startOfDay(now);
  const from = addDays(today, -LOADED_DAYS);
  const to = addDays(today, 1);
  const profileId = journal.profileId;
  const [steps, hr, rawNights, wakes, checkins, have, stored] = await Promise.all([
    samplesBetween(db, 'steps', from, to),
    samplesBetween(db, 'hr', from, to),
    nightsBetween(db, from, to),
    wakesBetween(db, from, to),
    profileId != null ? checkInsBetween(db, profileId, from, to) : Promise.resolve([]),
    db.rewards.toArray(),
    db.goals.get(1)
  ]);
  const nights = fitNights(rawNights, hr, wakes).map((f) => f.night);
  const days = buildDays({ samples: steps, nights, checkins, events: [] }, from, to);

  let goals = stored;
  if (!goals) {
    goals = newGoals(now, baseline(days, 'steps', 1));
    await db.goals.put(goals);
  }

  const nightOf = new Map(nights.map((n) => [n.night, n]));
  const recent: QuestDay[] = days.slice(-LOOK_BACK).map((d) => ({
    day: d.day,
    steps: d.steps,
    rising: rhythm(days.slice(0, days.indexOf(d) + 1)).kind === 'rising',
    night: nightOf.get(d.day) ?? null
  }));
  const due = dueRewards(goals, recent, new Set(have.map((r) => rewardKey(r.day, r.kind))), now);
  if (due.length) await db.rewards.bulkPut(due);

  quests.goals = goals;
  quests.rewards = [...have, ...due];
  quests.steps = days.at(-1)?.steps ?? null;
  quests.target = stepsTarget(goals, today);
  quests.rising = recent.at(-1)?.rising ?? false;
  quests.lastNight = nightOf.get(today) ?? null;
  quests.ready = true;
  quests.error = false;
  if (due.length) showWon(due[due.length - 1].kind);
  syncReminder(goals);
}

/** Relit tout. Plusieurs appels en même temps n'en font qu'un. */
export function refreshQuests(): Promise<void> {
  running ??= load()
    .catch((e) => {
      console.error(e);
      quests.error = true;
    })
    .finally(() => (running = null));
  return running;
}

async function saveGoals(next: Goals) {
  await getDB().goals.put(next);
  quests.goals = next;
  quests.target = stepsTarget(next, startOfDay(Date.now()));
  syncReminder(next);
}

export async function setStepGoal(steps: number): Promise<void> {
  if (quests.goals) await saveGoals(changeSteps($state.snapshot(quests.goals), steps, Date.now()));
}

export async function setBedtimeGoal(bedtime: number): Promise<void> {
  if (quests.goals) await saveGoals(changeBedtime($state.snapshot(quests.goals), bedtime, Date.now()));
}

export async function setBedtimeReminder(on: boolean): Promise<void> {
  if (quests.goals) await saveGoals({ ...$state.snapshot(quests.goals), reminder: on });
}

/** Une respiration menée jusqu'au bout : une noisette, une seule fois par jour. Vrai si elle est nouvelle. */
export async function rewardBreath(now = Date.now()): Promise<boolean> {
  const day = startOfDay(now);
  const db = getDB();
  const won = await db.transaction('rw', db.rewards, async () => {
    if (await db.rewards.get([day, 'souffle'])) return false;
    await db.rewards.put({ day, kind: 'souffle', at: now });
    return true;
  });
  if (won) {
    quests.rewards = [...quests.rewards, { day, kind: 'souffle', at: now }];
    showWon('souffle');
  }
  return won;
}
