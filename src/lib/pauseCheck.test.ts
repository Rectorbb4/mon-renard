import { describe, expect, it } from 'vitest';
import { PAUSE_FEELINGS, pauseNote } from './pauseCheck';

describe('état pendant une pause', () => {
  it('écrit une note lisible dans le journal', () => {
    expect(pauseNote('Colère')).toBe('Pause : colère');
    expect(pauseNote('Je ne sais pas')).toBe('Pause : je ne sais pas');
  });

  it('propose des états distincts', () => {
    expect(new Set(PAUSE_FEELINGS).size).toBe(PAUSE_FEELINGS.length);
  });
});
