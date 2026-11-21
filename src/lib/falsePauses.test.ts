import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenardDB } from '../data/db';
import { FALSE_PAUSE_FROM, FALSE_PAUSE_TO, eraseFalsePauses } from './falsePauses';

const MINUTE = 60000;
const after = (minutes: number) => FALSE_PAUSE_FROM + minutes * MINUTE;
let db: RenardDB;
let n = 0;
let store: Map<string, string>;

const left = async () => (await db.events.toArray()).map((e) => e.at).sort((a, b) => a - b);

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  });
  db = new RenardDB(`fausses-${++n}`);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete();
});

describe('effacement des fausses pauses', () => {
  it('retire les moments sans note de la soirée et garde tout le reste', async () => {
    await db.events.bulkAdd([
      { profileId: 1, at: after(-10) },
      { profileId: 1, at: after(5) },
      { profileId: 1, at: after(6), note: 'dispute' },
      { profileId: 1, at: after(20) },
      { profileId: 2, at: after(7) }
    ]);
    expect(await eraseFalsePauses(db, 1, 9, after(30))).toBe(2);
    expect(await left()).toEqual([after(-10), after(6), after(7)]);
    expect(JSON.parse(store.get('mon-renard:fausses-pauses-copie')!)).toHaveLength(2);
  });

  it("une fois l'appli corrigée, ne repasse jamais", async () => {
    await eraseFalsePauses(db, 1, 9, after(30));
    await db.events.add({ profileId: 1, at: after(31) });
    expect(await eraseFalsePauses(db, 1, 9, after(40))).toBe(0);
    expect(await left()).toEqual([after(31)]);
  });

  it("avec l'ancienne appli, repasse à chaque ouverture", async () => {
    await db.events.add({ profileId: 1, at: after(5) });
    expect(await eraseFalsePauses(db, 1, 8, after(10))).toBe(1);
    await db.events.add({ profileId: 1, at: after(15) });
    expect(await eraseFalsePauses(db, 1, 8, after(20))).toBe(1);
    expect(JSON.parse(store.get('mon-renard:fausses-pauses-copie')!)).toHaveLength(2);
  });

  it('ne touche jamais à ce qui suit la nuit', async () => {
    await db.events.add({ profileId: 1, at: FALSE_PAUSE_TO + MINUTE });
    expect(await eraseFalsePauses(db, 1, 9, FALSE_PAUSE_TO + 60 * MINUTE)).toBe(0);
    expect(await left()).toHaveLength(1);
  });

  it("n'efface rien hors de l'appli Android", async () => {
    await db.events.add({ profileId: 1, at: after(5) });
    expect(await eraseFalsePauses(db, 1, null, after(10))).toBe(0);
    expect(await left()).toHaveLength(1);
  });

  it("n'efface rien si la copie est impossible", async () => {
    await db.events.add({ profileId: 1, at: after(5) });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('plein');
      }
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await eraseFalsePauses(db, 1, 8, after(10))).toBe(0);
    quiet.mockRestore();
    expect(await left()).toHaveLength(1);
  });
});
