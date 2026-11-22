import { describe, expect, it } from 'vitest';
import type { DayStat } from './healthDays';
import { rhythm } from './rhythm';

const day = (i: number, sleep: number | null, energy: number | null = 0.5, mood: number | null = 0): DayStat => ({
  day: i,
  sleep,
  deep: null,
  rem: null,
  light: null,
  awake: null,
  restHr: null,
  hrv: null,
  stress: null,
  spo2: null,
  spo2Low: null,
  steps: null,
  meters: null,
  mood,
  energy,
  felt: 0
});

const usual = (n = 10) => Array.from({ length: n }, (_, i) => day(i, 480));
const last = (...d: DayStat[]) => [...usual(), ...d];

describe('ton rythme', () => {
  it('apprend tant qu’il manque des nuits', () => {
    const r = rhythm([day(0, 480), day(1, 470), day(2, 460), day(3, 450)]);
    expect(r).toMatchObject({ kind: 'learning', missing: 6 });
  });

  it('reste calme quand tes nuits ressemblent à ton habitude', () => {
    expect(rhythm(last(day(10, 470), day(11, 490), day(12, 480))).kind).toBe('steady');
  });

  it('repère des nuits courtes avec une énergie qui monte', () => {
    const r = rhythm(last(day(10, 370, 0.8), day(11, 380, 0.8), day(12, 480, 0.8)));
    expect(r).toMatchObject({ kind: 'rising', recent: 380, usual: 480 });
  });

  it('ne parle pas de montée si seules les nuits changent', () => {
    expect(rhythm(last(day(10, 370), day(11, 380), day(12, 390))).kind).toBe('shorter');
  });

  it('repère des nuits longues avec une énergie qui baisse', () => {
    expect(rhythm(last(day(10, 600, 0.2), day(11, 610, 0.2), day(12, 590, 0.2))).kind).toBe('falling');
  });

  it('ne compare pas ton énergie sans assez de check-ins', () => {
    const past = Array.from({ length: 10 }, (_, i) => day(i, 480, null, null));
    expect(rhythm([...past, day(10, 370, 1, 1), day(11, 380, 1, 1), day(12, 390, 1, 1)]).kind).toBe('shorter');
  });

  it('une seule nuit courte ne suffit pas', () => {
    expect(rhythm(last(day(10, 300, 0.9), day(11, 480, 0.9), day(12, 480, 0.9))).kind).toBe('steady');
  });
});
