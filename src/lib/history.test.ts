import { describe, expect, it } from 'vitest';
import type { CheckIn, FeltEvent } from '../data/types';
import { addDays, averageMood, dayLabel, dayTicks, groupByDay, periodStart, startOfDay } from './history';
import { energyLabel, sleepLabel } from './labels';

const now = new Date(2026, 10, 15, 14, 0).getTime();
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).getTime();
const checkin = (time: number, mood = 0): CheckIn => ({ profileId: 1, at: time, mood, energy: 0.5, sleep: null });
const felt = (time: number): FeltEvent => ({ profileId: 1, at: time });

describe('périodes', () => {
  it('commence 6 jours avant aujourd’hui pour 7 jours', () => {
    expect(periodStart(7, now)).toBe(new Date(2026, 10, 9).getTime());
    expect(periodStart(30, now)).toBe(new Date(2026, 9, 17).getTime());
  });

  it('passe correctement le changement d’heure', () => {
    // Nuit du 24 au 25 octobre 2026 : passage à l'heure d'hiver en France
    const d = addDays(new Date(2026, 9, 24).getTime(), 1);
    expect(new Date(d).getDate()).toBe(25);
    expect(new Date(d).getHours()).toBe(0);
  });

  it('place au plus 7 graduations, la dernière aujourd’hui', () => {
    const week = dayTicks(periodStart(7, now), now);
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toBe(startOfDay(now));
    const month = dayTicks(periodStart(30, now), now);
    expect(month.length).toBeLessThanOrEqual(7);
    expect(month.at(-1)).toBe(startOfDay(now));
  });
});

describe('journal', () => {
  it('mêle check-ins et moments, regroupés par jour, du plus récent au plus ancien', () => {
    const days = groupByDay([checkin(at(14, 9)), checkin(at(15, 8))], [felt(at(15, 11)), felt(at(13, 20))]);
    expect(days.map((d) => new Date(d.day).getDate())).toEqual([15, 14, 13]);
    expect(days[0].items.map((i) => i.kind)).toEqual(['felt', 'checkin']);
  });

  it('nomme les jours', () => {
    expect(dayLabel(startOfDay(now), now)).toBe("Aujourd'hui");
    expect(dayLabel(addDays(startOfDay(now), -1), now)).toBe('Hier');
    expect(dayLabel(new Date(2026, 10, 9).getTime(), now)).toBe('lundi 9 novembre');
  });

  it('calcule l’humeur moyenne', () => {
    expect(averageMood([])).toBeNull();
    expect(averageMood([checkin(1, -1), checkin(2, 0.5)])).toBe(-0.25);
  });
});

describe('libellés', () => {
  it('décrit l’énergie et la nuit', () => {
    expect(energyLabel(0.1)).toBe('À plat');
    expect(energyLabel(0.9)).toBe('Pleine forme');
    expect(sleepLabel(0.25)).toBe('Mauvaise');
    expect(sleepLabel(0.9)).toBe('Très bonne');
  });
});
