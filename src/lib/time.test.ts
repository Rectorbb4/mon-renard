import { describe, expect, it } from 'vitest';
import { formatSince } from './time';

const now = new Date(2026, 10, 15, 14, 0).getTime();

describe('formatSince', () => {
  it('dit « à l’instant » puis compte les minutes', () => {
    expect(formatSince(now - 20_000, now)).toBe("à l'instant");
    expect(formatSince(now - 12 * 60_000, now)).toBe('il y a 12 min');
  });

  it('donne l’heure pour aujourd’hui et hier', () => {
    expect(formatSince(new Date(2026, 10, 15, 9, 30).getTime(), now)).toBe("aujourd'hui à 09:30");
    expect(formatSince(new Date(2026, 10, 14, 21, 15).getTime(), now)).toBe('hier à 21:15');
  });

  it('donne la date au-delà', () => {
    expect(formatSince(new Date(2026, 10, 3, 8, 0).getTime(), now)).toBe('le 3 novembre à 08:00');
  });
});
