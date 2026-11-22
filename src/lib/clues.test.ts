import { describe, expect, it } from 'vitest';
import type { FeltEvent } from '../data/types';
import type { DayStat } from './healthDays';
import { addDays } from './history';
import { findClues } from './clues';

const D = new Date(2026, 10, 20).getTime();
const at = (day: number, h: number) => {
  const d = new Date(day);
  d.setHours(h, 10, 0, 0);
  return d.getTime();
};
const event = (day: number, h: number): FeltEvent => ({ profileId: 1, at: at(day, h) });
const stat = (day: number, sleep: number | null): DayStat => ({
  day,
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
  mood: null,
  energy: null,
  felt: 0
});

const days = (n: number, sleep: (i: number) => number | null = () => 450) =>
  Array.from({ length: n }, (_, i) => stat(addDays(D, i - n + 1), sleep(i)));

describe('carnet du renard', () => {
  it('ne dit rien avant cinq moments', () => {
    const e = [0, 1, 2, 3].map((i) => event(addDays(D, -i), 20));
    expect(findClues(days(20), e, [])).toEqual([]);
  });

  it('note une partie de la journée qui revient', () => {
    const e = [0, 1, 2, 3, 4].map((i) => event(addDays(D, -i), 20));
    const clue = findClues(days(20), e, []).find((c) => c.id === 'heure-soir');
    expect(clue?.text).toContain('le soir');
  });

  it('ne force pas une tendance quand les moments sont dispersés', () => {
    const e = [8, 13, 20, 1, 9, 15].map((h, i) => event(addDays(D, -i), h));
    expect(findClues(days(20), e, []).filter((c) => c.id.startsWith('heure'))).toEqual([]);
  });

  it('remarque les moments après une nuit plus courte', () => {
    // Les 5 derniers jours ont une nuit courte et portent presque tous les moments
    const list = days(20, (i) => (i >= 15 ? 340 : 460));
    const e = [0, 1, 2, 3, 10].map((i) => event(addDays(D, -i), 10 + (i % 4) * 2));
    expect(findClues(list, e, []).some((c) => c.id === 'nuit-courte')).toBe(true);
  });

  it('ne voit pas de lien quand il y a autant de moments les autres jours', () => {
    const list = days(21, (i) => (i >= 18 ? 340 : 460));
    const e = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => event(addDays(D, -i), 20));
    expect(findClues(list, e, []).some((c) => c.id === 'nuit-courte')).toBe(false);
  });

  it('reprend les liens déjà calculés, comme des pistes', () => {
    const found = findClues(days(20), [], [{ id: 'nuit-humeur', text: 'Après tes nuits les plus courtes, ton humeur est plus haute.', days: 14 }]);
    expect(found[0].text).toContain('nuits les plus courtes');
  });
});
