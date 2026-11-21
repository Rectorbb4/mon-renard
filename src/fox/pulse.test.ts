import { describe, expect, it } from 'vitest';
import { agitated, pulseLevel } from './pulse';

const NOW = 1_000_000;
const steady = (bpm: number, count = 15, end = NOW): [number, number][] =>
  Array.from({ length: count }, (_, i) => [end - (count - 1 - i) * 1000, bpm]);

describe('niveau du pouls', () => {
  it('reste à zéro quand le cœur est calme', () => {
    expect(pulseLevel(steady(70), NOW, 100)).toBe(0);
  });

  it('monte progressivement jusqu’au seuil', () => {
    expect(pulseLevel(steady(90), NOW, 100)).toBeCloseTo(0.5);
    expect(pulseLevel(steady(100), NOW, 100)).toBe(1);
    expect(pulseLevel(steady(130), NOW, 100)).toBe(1);
  });

  it('suit le seuil choisi', () => {
    expect(pulseLevel(steady(90), NOW, 120)).toBe(0);
  });

  it('ne réagit pas à un pic isolé', () => {
    const series = steady(70);
    series[series.length - 1] = [NOW, 140];
    expect(pulseLevel(series, NOW, 100)).toBe(0);
  });

  it('retombe si le capteur ne donne plus rien', () => {
    expect(pulseLevel(steady(120, 15, NOW - 16_000), NOW, 100)).toBe(0);
    expect(pulseLevel(steady(120, 2), NOW, 100)).toBe(0);
  });

  it('fonctionne avec les mesures espacées de la bague', () => {
    const sparse: [number, number][] = [[NOW - 12_000, 112], [NOW - 6000, 115], [NOW, 118]];
    expect(pulseLevel(sparse, NOW, 100)).toBe(1);
  });
});

describe('attitude agitée', () => {
  const calm = { headDown: 0.32, earsDown: 1, lids: 0.85, breathDepth: 0.7, breathRate: 0.6, restless: 0, fog: 0.09 };

  it('ne change rien au repos', () => {
    expect(agitated(calm, 0)).toEqual(calm);
  });

  it('relève le renard sans toucher au décor', () => {
    const up = agitated(calm, 1);
    expect(up.headDown).toBeLessThan(0);
    expect(up.earsDown).toBeLessThan(0.2);
    expect(up.lids).toBe(0);
    expect(up.breathRate).toBeGreaterThan(2);
    expect(up.restless).toBeGreaterThan(0.7);
    expect(up.fog).toBe(calm.fog);
  });

  it('ne calme jamais un renard déjà plus agité', () => {
    const wild = { ...calm, breathRate: 2.4, restless: 1 };
    expect(agitated(wild, 1).breathRate).toBe(2.4);
    expect(agitated(wild, 1).restless).toBe(1);
  });
});
