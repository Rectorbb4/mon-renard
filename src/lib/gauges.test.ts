import { describe, expect, it } from 'vitest';
import type { CheckIn } from '../data/types';
import { gaugeValues, moodFill, STALE_AFTER } from './gauges';

const NOON = new Date(2026, 10, 15, 12, 0).getTime();
const HOUR = 3600_000;
const c = (at: number, mood: number, energy: number, sleep: number | null = null): CheckIn => ({ profileId: 1, at, mood, energy, sleep });

describe('jauges du renard', () => {
  it("rien sans check-in", () => {
    expect(gaugeValues(null, null, NOON)).toBeNull();
  });

  it("prend humeur et énergie du dernier check-in, et la nuit notée aujourd'hui", () => {
    const g = gaugeValues(c(NOON - HOUR, 0.4, 0.7), c(NOON - 4 * HOUR, 0, 0.5, 0.75), NOON);
    expect(g).toEqual({
      mood: 0.4,
      moodWord: 'Élan',
      energy: 0.7,
      energyWord: 'En forme',
      sleep: 0.75,
      sleepWord: 'Bonne',
      sleepNote: null,
      stale: false
    });
  });

  it("prend la nuit ajustée quand elle n'est pas notée", () => {
    const own = { at: new Date(2026, 10, 15, 7, 20).getTime(), asleep: 494, usual: 500, fill: 0.988 };
    const g = gaugeValues(c(NOON - HOUR, 0, 0.5), null, NOON, own);
    expect(g?.sleep).toBe(0.988);
    expect(g?.sleepWord).toBe('8 h 14');
    expect(g?.sleepNote).toContain('07:20');
  });

  it('garde toujours la nuit que tu as notée', () => {
    const own = { at: new Date(2026, 10, 15, 7, 20).getTime(), asleep: 494, usual: 500, fill: 0.988 };
    const g = gaugeValues(c(NOON - HOUR, 0, 0.5), c(NOON - 2 * HOUR, 0, 0.5, 0.25), NOON, own);
    expect(g?.sleep).toBe(0.25);
    expect(g?.sleepNote).toBeNull();
  });

  it("ignore une nuit ajustée d'un autre jour", () => {
    const own = { at: new Date(2026, 10, 14, 7, 20).getTime(), asleep: 494, usual: 500, fill: 0.988 };
    expect(gaugeValues(c(NOON, 0, 0.5), null, NOON, own)?.sleepWord).toBe('Pas notée');
  });

  it("ignore une nuit notée hier", () => {
    const yesterday = new Date(2026, 10, 14, 22, 0).getTime();
    const g = gaugeValues(c(NOON, 0, 0.5), c(yesterday, 0, 0.5, 1), NOON);
    expect(g?.sleep).toBeNull();
    expect(g?.sleepWord).toBe('Pas notée');
  });

  it('pâlit après 12 heures', () => {
    expect(gaugeValues(c(NOON - STALE_AFTER, 0, 0.5), null, NOON)?.stale).toBe(false);
    expect(gaugeValues(c(NOON - STALE_AFTER - 1, 0, 0.5), null, NOON)?.stale).toBe(true);
  });
});

describe("jauge d'humeur centrée", () => {
  it("part du milieu vers la droite quand l'humeur monte", () => {
    expect(moodFill(0.5)).toEqual({ from: 50, width: 25, side: 'high' });
    expect(moodFill(1)).toEqual({ from: 50, width: 50, side: 'high' });
  });

  it("part du milieu vers la gauche quand elle baisse", () => {
    expect(moodFill(-0.8)).toEqual({ from: 10, width: 40, side: 'low' });
  });

  it("reste vide à l'équilibre parfait et borne les valeurs", () => {
    expect(moodFill(0).width).toBe(0);
    expect(moodFill(7)).toEqual({ from: 50, width: 50, side: 'high' });
    expect(moodFill(Number.NaN).width).toBe(0);
  });
});
