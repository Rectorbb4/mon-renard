import { describe, expect, it } from 'vitest';
import { widgetState } from './android';

describe('état envoyé au widget Android', () => {
  it("donne l'humeur du dernier check-in, les jauges et les heures", () => {
    expect(
      widgetState(
        { profileId: 1, at: 1000, mood: 0.5, energy: 0.7, sleep: null },
        { profileId: 1, at: 2000 },
        { profileId: 1, at: 500, mood: 0, energy: 0.4, sleep: 0.75 }
      )
    ).toEqual({
      mood: 'elan',
      label: 'Élan',
      lastCheckIn: 1000,
      lastFelt: 2000,
      score: 0.5,
      energy: 0.7,
      sleep: 0.75,
      sleepAt: 500,
      sleepMinutes: 0
    });
  });

  it('reste neutre sans check-in', () => {
    expect(widgetState(null, null)).toEqual({
      mood: null,
      label: null,
      lastCheckIn: 0,
      lastFelt: 0,
      score: 0,
      energy: 0,
      sleep: 0,
      sleepAt: 0,
      sleepMinutes: 0
    });
  });
});
