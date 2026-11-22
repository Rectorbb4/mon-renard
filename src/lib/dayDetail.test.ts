import { describe, expect, it } from 'vitest';
import type { HealthSample, SleepNight, SleepStage } from '../data/types';
import { dayActivity, dayHeart, dayMetric, formatKm, HRV_ZONES, nightDetail, SPO2_ZONES, STRESS_ZONES, zonesOf } from './dayDetail';
import { formatDuration } from './healthDays';
import { startOfDay } from './history';

// La nuit du 22 novembre 2026, avec les chiffres affichés par QRing
const DAY = startOfDay(new Date(2026, 10, 22, 12).getTime());
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const stages: [SleepStage, number][] = [
  [2, 120],
  [3, 95],
  [5, 4],
  [4, 25],
  [2, 96],
  [3, 60],
  [5, 3],
  [4, 25],
  [2, 60],
  [3, 40],
  [5, 5]
];
const NIGHT: SleepNight = { night: DAY, start: at(21, 23, 3), end: at(22, 7, 56), stages };

describe('une nuit, comme dans QRing', () => {
  const n = nightDetail(NIGHT, []);

  it('donne 8 h 41 dormies pour 8 h 53 au lit', () => {
    expect(formatDuration(n.asleep)).toBe('8 h 41');
    expect(formatDuration(n.inBed)).toBe('8 h 53');
  });

  it('donne chaque phase et sa part du temps au lit', () => {
    expect(n.stages.map((s) => [s.name, s.minutes, s.share])).toEqual([
      ['Éveillé', 12, 2],
      ['Paradoxal', 50, 9],
      ['Léger', 276, 52],
      ['Profond', 195, 37]
    ]);
  });

  it('place les phases dans le temps', () => {
    expect(n.segments[0].from).toBe(NIGHT.start);
    expect(n.segments.at(-1)?.to).toBe(NIGHT.end);
  });

  it('prend le pouls, la variabilité et l’oxygène de la nuit seulement', () => {
    const samples: HealthSample[] = [
      { metric: 'hr', at: at(21, 22, 55), value: 120 },
      { metric: 'hr', at: at(21, 23, 5), value: 46 },
      { metric: 'hr', at: at(22, 4, 15), value: 53 },
      { metric: 'hr', at: at(22, 7, 55), value: 96 },
      { metric: 'hr', at: at(22, 8, 0), value: 130 },
      { metric: 'hrv', at: at(21, 23, 0), value: 36 },
      { metric: 'hrv', at: at(22, 3, 0), value: 40 },
      { metric: 'hrv', at: at(22, 12, 0), value: 90 },
      ...Array.from({ length: 9 }, (_, i) => ({ metric: 'spo2' as const, at: at(21, 23 + i), value: i === 3 ? 97 : 99 })),
      { metric: 'spo2', at: at(22, 8), value: 80 }
    ];
    const d = nightDetail(NIGHT, samples);
    expect(d.hrRange).toEqual({ avg: 65, min: 46, max: 96 });
    expect(d.hrvAvg).toBe(38);
    expect(d.spo2).toHaveLength(9);
    expect(d.spo2Avg).toBe(99);
  });
});

describe('le réveil d’après le pouls', () => {
  const END = at(22, 7, 56);
  const pulse = (value: (t: number) => number): HealthSample[] => {
    const out: HealthSample[] = [];
    for (let t = at(21, 23, 5); t <= END; t += 5 * 60_000) out.push({ metric: 'hr', at: t, value: value(t) });
    return out;
  };
  const sleeping = (t: number) => 50 + (Math.round(t / 300_000) % 3);
  const morning = (t: number) => {
    if (t === at(22, 7, 55)) return 96;
    if (t === at(22, 7, 20)) return 80;
    return t > at(22, 7, 20) ? 58 : sleeping(t);
  };
  const withWake: [SleepStage, number][] = [[2, 200], [3, 100], [5, 3], [4, 30], [2, 100], [3, 64], [5, 7], [2, 29]];
  const night = (s: [SleepStage, number][]): SleepNight => ({ night: DAY, start: at(21, 23, 3), end: END, stages: s });

  it('repère 07:20 quand le pouls reste plus haut ensuite, au lit', () => {
    const w = nightDetail(night(withWake), pulse(morning)).wake;
    expect(w?.at).toBe(at(22, 7, 20));
    expect(formatDuration(w!.asleep)).toBe('8 h 14');
    expect(w?.lingered).toBe(36);
  });

  it('ne compte pas un réveil suivi d’un rendormissement', () => {
    const back = (t: number) => (t === at(22, 7, 20) ? 80 : sleeping(t));
    expect(nightDetail(night(withWake), pulse(back)).wake).toBeNull();
  });

  it('passe un faux réveil pour trouver le vrai', () => {
    const stages: [SleepStage, number][] = [[2, 200], [3, 100], [4, 33], [2, 64], [5, 3], [2, 33], [3, 64], [5, 7], [2, 29]];
    const value = (t: number) => (t === at(22, 5, 40) ? 78 : morning(t));
    expect(nightDetail(night(stages), pulse(value)).wake?.at).toBe(at(22, 7, 20));
  });

  it('ne dit rien sans pic de pouls ni assez de mesures', () => {
    expect(nightDetail(night(withWake), pulse(sleeping)).wake).toBeNull();
    expect(nightDetail(night(withWake), pulse(morning).slice(-10)).wake).toBeNull();
  });
});

describe('variabilité, oxygène et stress, comme dans QRing', () => {
  it('donne 37, 32 et 49 ms, tout en zone normale', () => {
    const samples: HealthSample[] = [40, 35, 32, 33, 35, 41, 34, 49, 35].map((value, i) => ({ metric: 'hrv', at: at(22, i), value }));
    const d = dayMetric(DAY, samples, 'hrv');
    expect([d.avg, d.min, d.max]).toEqual([37, 32, 49]);
    expect(zonesOf(d.points, HRV_ZONES).map((z) => z.share)).toEqual([0, 100, 0, 0]);
  });

  it('donne 99, 98 et 99 % avec le plus bas réel de chaque heure', () => {
    const samples: HealthSample[] = Array.from({ length: 8 }, (_, i) => ({
      metric: 'spo2',
      at: at(22, i),
      value: i === 2 ? 98 : 99,
      min: i === 2 ? 98 : 99,
      max: 99
    }));
    const d = dayMetric(DAY, samples, 'spo2');
    expect([d.avg, d.min, d.max]).toEqual([99, 98, 99]);
    expect(zonesOf(d.points, SPO2_ZONES).map((z) => z.share)).toEqual([0, 0, 100]);
  });

  it('donne 27, 21 et 32, et des zones qui font 100 %', () => {
    const values = [24, 26, 26, 24, 25, 29, 27, 29, 27, 31, 27, 32, 28, 23, 29, 21, 25];
    const samples: HealthSample[] = values.map((value, i) => ({ metric: 'stress', at: at(22, 0, i * 30), value }));
    const d = dayMetric(DAY, samples, 'stress');
    expect([d.avg, d.min, d.max]).toEqual([27, 21, 32]);
    expect(zonesOf(d.points, STRESS_ZONES).map((z) => z.share)).toEqual([88, 12, 0, 0]);
  });
});

describe('une journée', () => {
  it('donne le pouls moyen, le plus bas, le plus haut et le dernier', () => {
    const samples: HealthSample[] = [
      { metric: 'hr', at: at(21, 23, 55), value: 150 },
      { metric: 'hr', at: at(22, 0, 0), value: 46 },
      { metric: 'hr', at: at(22, 4, 15), value: 53 },
      { metric: 'hr', at: at(22, 7, 55), value: 96 },
      { metric: 'hr', at: at(23, 0, 0), value: 140 }
    ];
    expect(dayHeart(DAY, samples)).toMatchObject({ avg: 65, min: 46, max: 96, last: { value: 96 } });
  });

  it('additionne les pas par heure, et écrit la distance comme QRing', () => {
    const samples: HealthSample[] = [
      { metric: 'steps', at: at(22, 6, 15), value: 30 },
      { metric: 'steps', at: at(22, 6, 45), value: 12 },
      { metric: 'meters', at: at(22, 6, 15), value: 15 },
      { metric: 'meters', at: at(22, 6, 45), value: 5 },
      { metric: 'steps', at: at(21, 20, 0), value: 900 }
    ];
    const a = dayActivity(DAY, samples);
    expect(a.steps).toBe(42);
    expect(a.hours).toEqual([{ at: at(22, 6), value: 42 }]);
    expect(formatKm(a.meters).replace(/\s/g, ' ')).toBe('0,02 km');
  });
});
