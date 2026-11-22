import { describe, expect, it } from 'vitest';
import { calmLevel, calmSentence, calmSummary, startPulse, type PulseReading } from './calmGame';

const T = 1_000_000;
const series = (from: number, to: number, seconds = 120): PulseReading[] =>
  Array.from({ length: seconds }, (_, i) => ({ at: T + i * 1000, bpm: from + ((to - from) * i) / (seconds - 1) }));

describe('respiration vivante', () => {
  it('avance avec le temps sans capteur, sans jamais endormir tout à fait', () => {
    expect(calmLevel([], T, T + 60_000, 0.5)).toBeCloseTo(0.3);
    expect(calmLevel([], T, T + 120_000, 1)).toBeCloseTo(0.6);
  });

  it('un pouls qui baisse de 6 bpm endort le renard', () => {
    expect(calmLevel(series(80, 72), T, T + 119_000, 0.9)).toBe(1);
  });

  it('un pouls qui monte ne fait pas reculer sous la part du temps', () => {
    expect(calmLevel(series(70, 85), T, T + 119_000, 0.5)).toBeCloseTo(0.3);
  });

  it('attend trois mesures pour connaître le pouls de départ', () => {
    expect(startPulse([{ at: T + 1000, bpm: 70 }, { at: T + 2000, bpm: 72 }], T)).toBeNull();
  });

  it('résume le début et la fin de la séance', () => {
    const s = calmSummary(series(80, 70), T, T + 119_000)!;
    expect(s.from).toBeGreaterThan(s.to);
    expect(calmSentence(s)).toContain('est passé de');
  });

  it('ne présente jamais une hausse comme un échec', () => {
    expect(calmSentence({ from: 70, to: 76 })).toContain('c’est normal');
  });

  it('ne résume pas une séance sans mesure', () => {
    expect(calmSummary([], T, T + 120_000)).toBeNull();
  });
});
