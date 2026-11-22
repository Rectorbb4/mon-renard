import { describe, expect, it } from 'vitest';
import type { Goals, SleepNight, SleepStage } from '../data/types';
import { addDays } from './history';
import {
  bedDeadline,
  changeBedtime,
  changeSteps,
  cleanSteps,
  dueRewards,
  fellAsleepAt,
  madeBedtime,
  newGoals,
  parseClock,
  reminderClock,
  rewardKey,
  stepsTarget,
  suggestedSteps
} from './quests';

const D = new Date(2026, 10, 20).getTime();
const at = (day: number, h: number, m = 0) => {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

function night(wakeDay: number, start: number, stages: [SleepStage, number][]): SleepNight {
  const minutes = stages.reduce((a, [, m]) => a + m, 0);
  return { night: wakeDay, start, end: start + minutes * 60_000, stages };
}

const goals = (over: Partial<Goals> = {}): Goals => ({ ...newGoals(addDays(D, -5), null), ...over });

describe('objectif de pas', () => {
  it('part de ton habitude plus 500, ou de 6000 sans données', () => {
    expect(suggestedSteps(null)).toBe(6000);
    expect(suggestedSteps(7340)).toBe(8000);
    expect(suggestedSteps(30000)).toBe(20000);
  });

  it('reste entre 1000 et 20000, par 500', () => {
    expect(cleanSteps(120)).toBe(1000);
    expect(cleanSteps(7260)).toBe(7500);
    expect(cleanSteps(99999)).toBe(20000);
  });

  it('baisser la barre ne donne pas la noisette du jour', () => {
    const g = changeSteps(goals({ steps: 8000 }), 3000, at(D, 18));
    expect(stepsTarget(g, D)).toBe(8000);
    expect(stepsTarget(g, addDays(D, 1))).toBe(3000);
    expect(dueRewards(g, [{ day: D, steps: 3500, rising: false, night: null }], new Set(), at(D, 19))).toEqual([]);
  });

  it('deux changements le même jour gardent la barre du matin', () => {
    const once = changeSteps(goals({ steps: 8000 }), 5000, at(D, 10));
    const twice = changeSteps(once, 3000, at(D, 11));
    expect(stepsTarget(twice, D)).toBe(8000);
  });

  it('ne donne rien pendant une phase de montée, sans rien retirer', () => {
    const day = { day: D, steps: 12000, rising: true, night: null };
    expect(dueRewards(goals(), [day], new Set(), at(D, 20))).toEqual([]);
  });

  it('une seule noisette par jour, quel que soit le nombre de pas', () => {
    const g = goals({ steps: 5000 });
    const day = { day: D, steps: 25000, rising: false, night: null };
    expect(dueRewards(g, [day], new Set(), at(D, 20))).toHaveLength(1);
    expect(dueRewards(g, [day], new Set([rewardKey(D, 'pas')]), at(D, 21))).toEqual([]);
  });

  it("ne remonte pas avant la création de l'objectif", () => {
    const g = newGoals(at(D, 9), null);
    const hier = { day: addDays(D, -1), steps: 20000, rising: false, night: null };
    expect(dueRewards(g, [hier], new Set(), at(D, 9))).toEqual([]);
  });
});

describe('objectif de coucher', () => {
  it('place 23:30 la veille du réveil et 00:30 le jour même', () => {
    expect(bedDeadline(D, 23 * 60 + 30)).toBe(at(addDays(D, -1), 23, 30));
    expect(bedDeadline(D, 30)).toBe(at(D, 0, 30));
  });

  it("compte l'endormissement, pas le moment où tu te mets au lit", () => {
    const n = night(D, at(addDays(D, -1), 23, 10), [[5, 40], [2, 200], [3, 120]]);
    expect(fellAsleepAt(n)).toBe(at(addDays(D, -1), 23, 50));
    expect(madeBedtime(goals({ bedtime: 23 * 60 + 30 }), n)).toBe(false);
    expect(madeBedtime(goals({ bedtime: 23 * 60 + 55 }), n)).toBe(true);
  });

  it('ne compte pas une sieste', () => {
    const n = night(D, at(addDays(D, -1), 22, 0), [[2, 60]]);
    expect(madeBedtime(goals(), n)).toBe(false);
  });

  it('ne compte pas une longue sieste de l’après-midi comme un coucher', () => {
    const n = night(D, at(addDays(D, -1), 12, 0), [[2, 240]]);
    expect(madeBedtime(goals(), n)).toBe(false);
  });

  it('une nouvelle heure ne relit pas les nuits passées', () => {
    const n = night(D, at(addDays(D, -1), 23, 45), [[2, 300]]);
    const late = changeBedtime(goals(), 2 * 60, at(D, 9));
    expect(madeBedtime(late, n)).toBe(false);
  });

  it('une nuit commencée avant la création ne compte pas', () => {
    const g = newGoals(at(D, 8), null);
    const n = night(D, at(addDays(D, -1), 22, 30), [[2, 300]]);
    expect(dueRewards(g, [{ day: D, steps: null, rising: false, night: n }], new Set(), at(D, 9))).toEqual([]);
  });

  it('prépare le rappel une heure avant, même autour de minuit', () => {
    expect(reminderClock(23 * 60 + 30)).toBe('22:30');
    expect(reminderClock(30)).toBe('23:30');
  });

  it('lit une heure', () => {
    expect(parseClock('23:30')).toBe(1410);
    expect(parseClock('25:00')).toBeNull();
  });
});
