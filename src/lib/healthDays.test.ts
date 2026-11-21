import { describe, expect, it } from 'vitest';
import type { CheckIn, SleepNight } from '../data/types';
import { baseline, buildDays, compareToHabit, deviations, formatDuration, pulseSeries, relations, signals, stageSegments, type DayStat } from './healthDays';
import { addDays, startOfDay } from './history';

const TODAY = startOfDay(new Date(2026, 10, 21, 12).getTime());
const empty = (day: number): DayStat => ({
  day, sleep: null, deep: null, rem: null, light: null, awake: null, restHr: null, hrv: null, stress: null,
  spo2: null, spo2Low: null, steps: null, meters: null, mood: null, energy: null, felt: 0
});
const series = (n: number, make: (i: number) => Partial<DayStat>) =>
  Array.from({ length: n }, (_, i) => ({ ...empty(addDays(TODAY, i - n + 1)), ...make(i) }));

describe('jours', () => {
  it('compte la nuit au jour du réveil, sans les moments éveillés', () => {
    const night: SleepNight = {
      night: TODAY,
      start: addDays(TODAY, -1) + 23 * 3600000,
      end: TODAY + 7 * 3600000,
      stages: [[2, 240], [3, 120], [4, 90], [5, 30]]
    };
    const [d] = buildDays({ samples: [], nights: [night], checkins: [], events: [] }, TODAY, addDays(TODAY, 1));
    expect(d.sleep).toBe(450);
    expect(d.awake).toBe(30);
  });

  it('additionne les pas et prend le pouls au repos dans la nuit', () => {
    const night: SleepNight = { night: TODAY, start: TODAY, end: TODAY + 6 * 3600000, stages: [[2, 360]] };
    const samples = [
      ...[50, 52, 54, 60, 62, 64].map((value, i) => ({ metric: 'hr' as const, at: TODAY + i * 3600000, value })),
      { metric: 'hr' as const, at: TODAY + 12 * 3600000, value: 120 },
      { metric: 'steps' as const, at: TODAY + 9 * 3600000, value: 100 },
      { metric: 'steps' as const, at: TODAY + 10 * 3600000, value: 50 }
    ];
    const [d] = buildDays({ samples, nights: [night], checkins: [], events: [] }, TODAY, addDays(TODAY, 1));
    expect(d.steps).toBe(150);
    expect(d.restHr).toBe(52);
  });

  it('fait la moyenne de l’humeur du jour', () => {
    const c = (at: number, mood: number): CheckIn => ({ profileId: 1, at, mood, energy: 0.5, sleep: null });
    const [d] = buildDays({ samples: [], nights: [], checkins: [c(TODAY + 1, 0.2), c(TODAY + 2, 0.6)], events: [] }, TODAY, addDays(TODAY, 1));
    expect(d.mood).toBeCloseTo(0.4);
  });

  it('attend 5 jours pour parler d’habitude', () => {
    expect(baseline(series(7, () => ({ sleep: 420 })), 'sleep')).toBeNull();
    expect(baseline(series(8, () => ({ sleep: 420 })), 'sleep')).toBe(420);
  });

  it('écrit les durées simplement', () => {
    expect(formatDuration(432)).toBe('7 h 12');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('signaux', () => {
  it('reste silencieux quand tout est habituel', () => {
    expect(signals(series(14, () => ({ sleep: 430, restHr: 58, hrv: 45, stress: 35, steps: 5000, mood: 0.1, energy: 0.5 })))).toEqual([]);
  });

  it('repère moins de sommeil avec plus d’élan, en premier', () => {
    const days = series(14, (i) => (i < 11 ? { sleep: 450, energy: 0.5, mood: 0 } : { sleep: 320, energy: 0.85, mood: 0.6 }));
    expect(signals(days)[0]).toMatchObject({ id: 'court-haut', strong: true });
  });

  it('distingue trois nuits courtes sans élan', () => {
    const days = series(14, (i) => (i < 11 ? { sleep: 450, energy: 0.5 } : { sleep: 320, energy: 0.4 }));
    expect(signals(days).map((s) => s.id)).toEqual(['court']);
  });

  it('ne s’alarme pas pour une seule mauvaise nuit', () => {
    const days = series(14, (i) => ({ sleep: i === 13 ? 200 : 450 }));
    expect(signals(days)).toEqual([]);
  });

  it('repère un pouls au repos qui monte', () => {
    const days = series(14, (i) => ({ restHr: i < 11 ? 58 : 67 }));
    expect(signals(days).map((s) => s.id)).toEqual(['repos']);
  });
});

describe('lecture du jour', () => {
  it('place les phases dans le temps, sans dépasser le réveil', () => {
    const n: SleepNight = { night: TODAY, start: TODAY, end: TODAY + 90 * 60000, stages: [[2, 60], [3, 60], [4, 10]] };
    expect(stageSegments(n)).toEqual([
      { stage: 2, from: TODAY, to: TODAY + 60 * 60000 },
      { stage: 3, from: TODAY + 60 * 60000, to: TODAY + 90 * 60000 }
    ]);
  });

  it('préfère la ceinture à la bague au même moment', () => {
    const ring = [0, 5, 60].map((m) => ({ metric: 'hr' as const, at: TODAY + m * 60000, value: 70 }));
    const belt = [{ metric: 'beltHr' as const, at: TODAY + 4 * 60000, value: 66 }];
    expect(pulseSeries(ring, belt).map((p) => p.value)).toEqual([70, 66, 70]);
    expect(pulseSeries(ring, belt).length).toBe(3);
  });

  it('situe un jour par rapport aux autres', () => {
    const v = deviations(series(10, (i) => ({ sleep: i === 9 ? 300 : 450 })), 'sleep');
    expect(v[0]).toBe(0);
    expect(v[9]).toBe(-1);
    expect(deviations(series(4, () => ({ sleep: 450 })), 'sleep')[0]).toBeNull();
  });

  it('compare à l’habitude avec des mots simples', () => {
    expect(compareToHabit('sleep', 400, 430)).toBe('30 min de moins que d’habitude'.replace('’', "'"));
    expect(compareToHabit('restHr', 58, 58.5)).toBe("comme d'habitude");
    expect(compareToHabit('steps', 8000, null)).toBeNull();
  });
});

describe('liens', () => {
  it('attend assez de jours', () => {
    expect(relations(series(9, (i) => ({ sleep: 300 + i * 30, mood: i / 10 })))).toEqual([]);
  });

  it('voit quand les nuits courtes vont avec une humeur plus haute', () => {
    const days = series(14, (i) => (i % 2 ? { sleep: 300, mood: 0.6 } : { sleep: 480, mood: 0 }));
    expect(relations(days).find((r) => r.id === 'nuit-humeur')?.text).toContain('plus haute');
  });
});
