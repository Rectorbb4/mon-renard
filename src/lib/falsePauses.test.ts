import { describe, expect, it } from 'vitest';
import type { FeltEvent } from '../data/types';
import { FALSE_PAUSE_FROM, falsePauses } from './falsePauses';

const MINUTE = 60000;
const at = (id: number, minutes: number, note?: string): FeltEvent => ({
  id,
  profileId: 1,
  at: FALSE_PAUSE_FROM + minutes * MINUTE,
  ...(note ? { note } : {})
});

describe('fausses pauses', () => {
  const until = FALSE_PAUSE_FROM + 30 * MINUTE;

  it('propose les moments sans note de la période', () => {
    expect(falsePauses([at(1, 5), at(2, 20)], until).map((e) => e.id)).toEqual([1, 2]);
  });

  it('garde les moments avec une note', () => {
    expect(falsePauses([at(1, 5, 'dispute'), at(2, 6)], until).map((e) => e.id)).toEqual([2]);
  });

  it('ne touche ni à ce qui est avant ni à ce qui est après', () => {
    expect(falsePauses([at(1, -1), at(2, 31), at(3, 30)], until).map((e) => e.id)).toEqual([3]);
  });
});
