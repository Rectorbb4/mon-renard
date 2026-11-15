import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { RenardDB } from './db';
import {
  WORD_MAX,
  addCheckIn,
  checkInsBetween,
  deleteCheckIn,
  ensureProfile,
  lastCheckIn,
  lastSleepCheckIn,
  normalizeCheckIn,
  restoreCheckIn,
  sleepNotedToday,
  startOfDay
} from './checkins';

let n = 0;
let db: RenardDB;
function freshDB() {
  db = new RenardDB(`test-${++n}`);
  return db;
}
afterEach(async () => {
  await db?.delete();
});

const HOUR = 3600_000;
const NOON = new Date(2026, 10, 15, 12, 0).getTime();

describe('normalizeCheckIn', () => {
  it('borne les valeurs et nettoie le mot', () => {
    const c = normalizeCheckIn({ mood: 3, energy: -1, sleep: 2, word: '  trop   de  boulot  ' }, 1, 10);
    expect(c).toEqual({ profileId: 1, at: 10, mood: 1, energy: 0, sleep: 1, word: 'trop de boulot' });
  });

  it('accepte une nuit non renseignée et un mot vide', () => {
    const c = normalizeCheckIn({ mood: -0.5, energy: 0.5, word: '   ' }, 1, 10);
    expect(c.sleep).toBeNull();
    expect(c).not.toHaveProperty('word');
  });

  it('coupe un mot trop long', () => {
    const c = normalizeCheckIn({ mood: 0, energy: 0, word: 'a'.repeat(100) }, 1, 10);
    expect(c.word).toHaveLength(WORD_MAX);
  });

  it('refuse une humeur invalide', () => {
    expect(() => normalizeCheckIn({ mood: Number.NaN, energy: 0 }, 1, 10)).toThrow();
  });
});

describe('base locale', () => {
  it('crée un seul profil, même appelé plusieurs fois', async () => {
    freshDB();
    const a = await ensureProfile(db);
    const b = await ensureProfile(db);
    expect(a).toBe(b);
    expect(await db.profiles.count()).toBe(1);
  });

  it('renvoie le check-in le plus récent du bon profil', async () => {
    freshDB();
    const me = await ensureProfile(db);
    const other = (await db.profiles.add({ name: 'Enfant', kind: 'child', createdAt: 0 })) as number;
    expect(await lastCheckIn(db, me)).toBeUndefined();

    await addCheckIn(db, me, { mood: -0.8, energy: 0.2 }, NOON - 2 * HOUR);
    await addCheckIn(db, me, { mood: 0.5, energy: 0.9 }, NOON);
    await addCheckIn(db, me, { mood: 0, energy: 0.5 }, NOON - HOUR);
    await addCheckIn(db, other, { mood: 1, energy: 1 }, NOON + HOUR);

    const last = await lastCheckIn(db, me);
    expect(last?.mood).toBe(0.5);
    expect(last?.at).toBe(NOON);
  });

  it('liste les check-ins d’une période dans l’ordre', async () => {
    freshDB();
    const me = await ensureProfile(db);
    for (const h of [5, 1, 3]) await addCheckIn(db, me, { mood: 0, energy: h / 10 }, NOON - h * HOUR);
    const list = await checkInsBetween(db, me, NOON - 4 * HOUR, NOON);
    expect(list.map((c) => c.energy)).toEqual([0.3, 0.1]);
  });

  it('sait si la nuit a déjà été notée aujourd’hui', async () => {
    freshDB();
    const me = await ensureProfile(db);
    await addCheckIn(db, me, { mood: 0, energy: 0.5, sleep: 0.75 }, startOfDay(NOON) - HOUR); // hier soir
    expect(await sleepNotedToday(db, me, NOON)).toBe(false);
    await addCheckIn(db, me, { mood: 0, energy: 0.5, sleep: 0.25 }, NOON - HOUR);
    expect(await sleepNotedToday(db, me, NOON)).toBe(true);
  });

  it('retrouve la dernière nuit notée, même si le dernier check-in ne la dit pas', async () => {
    freshDB();
    const me = await ensureProfile(db);
    expect(await lastSleepCheckIn(db, me)).toBeUndefined();
    await addCheckIn(db, me, { mood: 0, energy: 0.5, sleep: 0.25 }, NOON - 5 * HOUR);
    await addCheckIn(db, me, { mood: 0, energy: 0.5, sleep: 0.75 }, NOON - 3 * HOUR);
    await addCheckIn(db, me, { mood: 0.4, energy: 0.6 }, NOON);
    const s = await lastSleepCheckIn(db, me);
    expect(s?.sleep).toBe(0.75);
    expect(s?.at).toBe(NOON - 3 * HOUR);
  });

  it('efface un check-in puis le remet à l’identique', async () => {
    freshDB();
    const me = await ensureProfile(db);
    await addCheckIn(db, me, { mood: 0, energy: 0.5 }, NOON - HOUR);
    const last = await addCheckIn(db, me, { mood: 0.4, energy: 0.6, word: 'oups' }, NOON);
    await deleteCheckIn(db, last.id!);
    expect((await lastCheckIn(db, me))?.at).toBe(NOON - HOUR);
    await restoreCheckIn(db, last);
    expect(await lastCheckIn(db, me)).toEqual(last);
    expect(await db.checkins.count()).toBe(2);
  });
});
