import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BackupError,
  backupFileName,
  backupToJson,
  exportBackup,
  importBackup,
  parseBackup,
  summarizeBackup
} from './backup';
import { addCheckIn, checkInsBetween, ensureProfile } from './checkins';
import { RenardDB } from './db';
import { addFeltEvent, feltEventsBetween, setFeltNote } from './events';

let n = 0;
const dbs: RenardDB[] = [];
afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()));
});
function newDB() {
  const db = new RenardDB(`backup-${++n}`);
  dbs.push(db);
  return db;
}

async function phoneWithData() {
  const db = newDB();
  const me = await ensureProfile(db, 10);
  await addCheckIn(db, me, { mood: -0.4, energy: 0.3, sleep: 0.25, word: 'fatigué' }, 1000);
  await addCheckIn(db, me, { mood: 0.5, energy: 0.8 }, 3000);
  const e = await addFeltEvent(db, me, 2000);
  await setFeltNote(db, e.id!, 'au travail');
  return { db, me };
}

const ALL: [number, number] = [0, Number.MAX_SAFE_INTEGER];

describe('export', () => {
  it('met tout le journal dans un fichier, sans les numéros internes', async () => {
    const { db } = await phoneWithData();
    const backup = await exportBackup(db, 5000, '0.7.0');
    expect(backup).toMatchObject({ app: 'mon-renard', format: BACKUP_FORMAT, exportedAt: 5000, appVersion: '0.7.0' });
    expect(backup.profiles).toEqual([{ id: 1, name: 'Moi', kind: 'adult', createdAt: 10 }]);
    expect(backup.checkins.map((c) => c.at)).toEqual([1000, 3000]);
    expect(backup.checkins[0]).toEqual({ profileId: 1, at: 1000, mood: -0.4, energy: 0.3, sleep: 0.25, word: 'fatigué' });
    expect(backup.events).toEqual([{ profileId: 1, at: 2000, note: 'au travail' }]);
  });

  it('nomme le fichier avec la date du jour', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 59).getTime())).toBe('mon-renard-sauvegarde-2026-11-05.json');
  });
});

describe('import', () => {
  it('retrouve tout sur un nouveau téléphone', async () => {
    const { db: oldPhone } = await phoneWithData();
    const file = backupToJson(await exportBackup(oldPhone));

    const newPhone = newDB();
    const me = await ensureProfile(newPhone);
    const { backup, invalid } = parseBackup(file);
    expect(invalid).toBe(0);
    expect(summarizeBackup(backup)).toEqual({ checkins: 2, events: 1, from: 1000, to: 3000 });

    expect(await importBackup(newPhone, backup)).toEqual({ checkins: 2, events: 1, already: 0 });
    expect((await checkInsBetween(newPhone, me, ...ALL)).map((c) => c.word ?? null)).toEqual(['fatigué', null]);
    expect((await feltEventsBetween(newPhone, me, ...ALL))[0].note).toBe('au travail');
    expect(await newPhone.profiles.count()).toBe(1);
  });

  it('ne crée pas de doublons si on importe deux fois, et garde ce qui est déjà là', async () => {
    const { db, me } = await phoneWithData();
    const { backup } = parseBackup(backupToJson(await exportBackup(db)));
    await addCheckIn(db, me, { mood: 0, energy: 0.5 }, 4000);

    expect(await importBackup(db, backup)).toEqual({ checkins: 0, events: 0, already: 3 });
    expect(await db.checkins.count()).toBe(3);
    expect(await db.events.count()).toBe(1);
  });

  it('récupère la note d’un moment noté sans note sur ce téléphone', async () => {
    const { db: oldPhone } = await phoneWithData();
    const { backup } = parseBackup(backupToJson(await exportBackup(oldPhone)));
    const phone = newDB();
    const me = await ensureProfile(phone);
    await addFeltEvent(phone, me, 2000);
    await importBackup(phone, backup);
    expect((await feltEventsBetween(phone, me, ...ALL)).map((e) => e.note)).toEqual(['au travail']);
  });

  it('range chaque profil à sa place quand il y en a plusieurs', async () => {
    const phone = newDB();
    const me = await ensureProfile(phone);
    const file = JSON.stringify({
      app: 'mon-renard',
      format: 1,
      profiles: [
        { id: 7, name: 'Moi', kind: 'adult', createdAt: 1 },
        { id: 8, name: 'Léo', kind: 'child', createdAt: 2 }
      ],
      checkins: [
        { profileId: 7, at: 100, mood: 0.2, energy: 0.5, sleep: null },
        { profileId: 8, at: 100, mood: -0.2, energy: 0.9, sleep: null }
      ],
      events: []
    });
    expect(await importBackup(phone, parseBackup(file).backup)).toMatchObject({ checkins: 2 });
    const leo = (await phone.profiles.toArray()).find((p) => p.name === 'Léo')!;
    expect((await checkInsBetween(phone, me, ...ALL)).map((c) => c.mood)).toEqual([0.2]);
    expect((await checkInsBetween(phone, leo.id!, ...ALL)).map((c) => c.mood)).toEqual([-0.2]);
  });
});

describe('fichiers refusés ou abîmés', () => {
  const base = { app: 'mon-renard', format: 1, profiles: [{ id: 1, name: 'Moi', kind: 'adult', createdAt: 1 }] };
  const message = (text: string) => {
    try {
      parseBackup(text);
      return 'accepté';
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      return (e as Error).message;
    }
  };

  it('explique pourquoi un fichier ne peut pas être importé', () => {
    expect(message('pas du json')).toMatch(/pas une sauvegarde lisible/);
    expect(message(JSON.stringify({ app: 'autre' }))).toMatch(/ne vient pas de Mon renard/);
    expect(message(JSON.stringify({ ...base, format: 99, checkins: [], events: [] }))).toMatch(/version plus récente/);
    expect(message(JSON.stringify({ ...base, checkins: [] }))).toMatch(/il manque/);
    expect(message(JSON.stringify({ ...base, checkins: [], events: [] }))).toMatch(/vide/);
  });

  it('laisse de côté les lignes illisibles et borne les valeurs', () => {
    const { backup, invalid } = parseBackup(
      '﻿' +
        JSON.stringify({
          ...base,
          checkins: [
            { profileId: 1, at: 100, mood: 5, energy: -1, sleep: 'bof', word: '  un   mot  ' },
            { profileId: 2, at: 200, mood: 0, energy: 0 },
            { profileId: 1, at: 'hier', mood: 0, energy: 0 },
            'n’importe quoi'
          ],
          events: [{ profileId: 1, at: 300, note: '   ' }, { profileId: 1 }]
        })
    );
    expect(invalid).toBe(4);
    expect(backup.checkins).toEqual([{ profileId: 1, at: 100, mood: 1, energy: 0, sleep: null, word: 'un mot' }]);
    expect(backup.events).toEqual([{ profileId: 1, at: 300 }]);
  });
});
