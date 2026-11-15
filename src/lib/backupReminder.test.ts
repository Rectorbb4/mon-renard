import { describe, expect, it } from 'vitest';
import { REMIND_EVERY_DAYS, REMIND_FROM_ENTRIES, backupDue } from './backupReminder';

const DAY = 24 * 3600_000;

describe('rappel de sauvegarde', () => {
  const now = 1_800_000_000_000;

  it('se tait tant que le journal est presque vide', () => {
    expect(backupDue(REMIND_FROM_ENTRIES - 1, null, now)).toBe(false);
  });

  it('propose une première sauvegarde quand le journal se remplit', () => {
    expect(backupDue(REMIND_FROM_ENTRIES, null, now)).toBe(true);
  });

  it('revient un mois après la dernière sauvegarde', () => {
    expect(backupDue(100, now - 3 * DAY, now)).toBe(false);
    expect(backupDue(100, now - (REMIND_EVERY_DAYS + 1) * DAY, now)).toBe(true);
  });
});
