import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureProfile } from './checkins';
import { RenardDB } from './db';
import {
  NOTE_MAX,
  addFeltEvent,
  cleanNote,
  deleteFeltEvent,
  deleteFeltEventsAt,
  feltEventsBetween,
  lastFeltEvent,
  noteFeltEventsAt,
  setFeltNote
} from './events';

let n = 0;
let db: RenardDB;
afterEach(async () => {
  await db?.delete();
});
async function setup() {
  db = new RenardDB(`events-${++n}`);
  return ensureProfile(db);
}

describe('cleanNote', () => {
  it('retire les espaces superflus et coupe les notes trop longues', () => {
    expect(cleanNote('  le cœur   qui bat \n\n\n\nvite ')).toBe('le cœur qui bat \n\nvite');
    expect(cleanNote('x'.repeat(500))).toHaveLength(NOTE_MAX);
  });

  it('renvoie undefined pour une note vide', () => {
    expect(cleanNote('   ')).toBeUndefined();
    expect(cleanNote(undefined)).toBeUndefined();
  });
});

describe('pause de la bague', () => {
  it('écrit ce qu’on ressent sur le bon moment', async () => {
    const me = await setup();
    await addFeltEvent(db, me, 1000);
    await addFeltEvent(db, me, 2000);
    await noteFeltEventsAt(db, me, 2000, 'Pause : colère');
    const [first, second] = await feltEventsBetween(db, me, 0, 3000);
    expect(first).not.toHaveProperty('note');
    expect(second.note).toBe('Pause : colère');
  });

  it('retire seulement la pause lancée par erreur', async () => {
    const me = await setup();
    await addFeltEvent(db, me, 1000);
    await addFeltEvent(db, me, 2000);
    await deleteFeltEventsAt(db, me, 2000);
    expect((await feltEventsBetween(db, me, 0, 3000)).map((e) => e.at)).toEqual([1000]);
  });
});

describe('moments « je le sens »', () => {
  it('note l’instant tout de suite, la note vient après', async () => {
    const me = await setup();
    const e = await addFeltEvent(db, me, 1000);
    expect(await lastFeltEvent(db, me)).toEqual({ id: e.id, profileId: me, at: 1000 });

    await setFeltNote(db, e.id!, '  au travail ');
    expect((await lastFeltEvent(db, me))?.note).toBe('au travail');

    await setFeltNote(db, e.id!, '');
    expect(await lastFeltEvent(db, me)).not.toHaveProperty('note');
  });

  it('permet d’annuler un appui par erreur', async () => {
    const me = await setup();
    await addFeltEvent(db, me, 1000);
    const oops = await addFeltEvent(db, me, 2000);
    await deleteFeltEvent(db, oops.id!);
    expect((await lastFeltEvent(db, me))?.at).toBe(1000);
  });

  it('liste les moments d’une période pour le bon profil', async () => {
    const me = await setup();
    const other = (await db.profiles.add({ name: 'Enfant', kind: 'child', createdAt: 0 })) as number;
    for (const at of [300, 100, 200]) await addFeltEvent(db, me, at);
    await addFeltEvent(db, other, 150);
    expect((await feltEventsBetween(db, me, 100, 250)).map((e) => e.at)).toEqual([100, 200]);
  });
});
