import { describe, expect, it } from 'vitest';
import type { SleepNight, SleepStage } from '../data/types';
import { widgetState } from './android';
import type { FittedNight } from './dayDetail';
import { startOfDay } from './history';
import { ownNight } from './ownNight';

const NOW = new Date(2026, 10, 22, 12).getTime();
const TODAY = startOfDay(NOW);
const WAKE = new Date(2026, 10, 22, 7, 20).getTime();

const fitted = (daysAgo: number, minutes: number, wake = daysAgo === 0): FittedNight => {
  const day = new Date(2026, 10, 22 - daysAgo).getTime();
  const stages: [SleepStage, number][] = [[2, minutes]];
  const night: SleepNight = { night: day, start: day - 3600_000, end: day - 3600_000 + minutes * 60_000, stages };
  return { night, wake: wake ? { at: WAKE, asleep: minutes, lingered: 36 } : null };
};

describe('la nuit du renard', () => {
  it('ne reprend pas la nuit de la bague sans réveil repéré', () => {
    expect(ownNight([fitted(0, 500, false)], NOW)).toBeNull();
  });

  it("se compare à tes propres nuits", () => {
    const n = ownNight([fitted(3, 400), fitted(2, 420), fitted(1, 440), fitted(0, 315)], NOW);
    expect(n?.usual).toBe(420);
    expect(n?.fill).toBeCloseTo(0.75);
  });

  it('reste pleine au-delà de ta durée habituelle', () => {
    expect(ownNight([fitted(3, 400), fitted(2, 400), fitted(1, 400), fitted(0, 500)], NOW)?.fill).toBe(1);
  });

  it('prend 8 h comme repère tant qu’il y a trop peu de nuits', () => {
    const n = ownNight([fitted(1, 400), fitted(0, 240)], NOW);
    expect(n?.usual).toBeNull();
    expect(n?.fill).toBeCloseTo(0.5);
  });

  it('ignore les nuits trop anciennes', () => {
    const n = ownNight([fitted(20, 100), fitted(19, 100), fitted(18, 100), fitted(0, 480)], NOW);
    expect(n?.usual).toBeNull();
  });
});

describe('la nuit sur le widget', () => {
  const own = { at: WAKE, asleep: 494, usual: 500, fill: 0.9 };
  const checkIn = { profileId: 1, at: TODAY + 9 * 3600_000, mood: 0, energy: 0.5, sleep: 0.25 };

  it("reçoit la nuit ajustée quand elle n'est pas notée", () => {
    expect(widgetState(checkIn, null, null, own, NOW)).toMatchObject({ sleep: 0.9, sleepAt: WAKE });
  });

  it('garde la nuit notée', () => {
    expect(widgetState(checkIn, null, checkIn, own, NOW)).toMatchObject({ sleep: 0.25, sleepAt: checkIn.at });
  });
});
