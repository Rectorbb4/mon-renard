import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { addDays, startOfDay } from '../lib/history';
import { RenardDB } from './db';
import { ingestLines, samplesBetween } from './health';
import { hexToBytes, parseBattery, parseHeartRate, parseReply, parseSleep, parseSpo2, parseSteps } from './ringParse';

const NOW = new Date(2026, 10, 21, 20, 30).getTime();
const TODAY = startOfDay(NOW);
const frame = (...b: number[]) => [...b, ...new Array(16 - b.length).fill(0)];
const toHex = (b: number[]) => b.map((v) => v.toString(16).padStart(2, '0')).join('');

describe('bague : décodage', () => {
  it('lit la batterie', () => {
    expect(parseBattery([frame(0x03, 55, 1)], NOW)).toEqual({ level: 55, charging: true, at: NOW });
  });

  it('lit les pas par quart d’heure, dates en BCD', () => {
    // 21/11/2026, quart 81 = 20:15, 12 pas, 9 m
    const s = parseSteps([frame(0x43, 0xf0, 5, 1), frame(0x43, 0x26, 0x11, 0x21, 81, 0, 1, 3, 0, 12, 0, 9, 0)]);
    expect(s).toEqual([
      { metric: 'steps', at: new Date(2026, 10, 21, 20, 15).getTime(), value: 12 },
      { metric: 'meters', at: new Date(2026, 10, 21, 20, 15).getTime(), value: 9 }
    ]);
  });

  it('place chaque pouls sur sa case de 5 minutes', () => {
    const s = parseHeartRate(
      [frame(0x15, 0, 3, 5), frame(0x15, 1, 0, 0, 0, 0, 60, 0, 62), frame(0x15, 2, 70)],
      TODAY,
      NOW
    );
    expect(s.map((x) => [(x.at - TODAY) / 60000, x.value])).toEqual([[0, 60], [10, 62], [45, 70]]);
  });

  it('ignore le pouls dans le futur', () => {
    const early = TODAY + 3 * 60000;
    expect(parseHeartRate([frame(0x15, 1, 0, 0, 0, 0, 60, 61)], TODAY, early).map((x) => x.value)).toEqual([60]);
  });

  it('lit le stress et la variabilité par demi-heure', () => {
    const r = parseReply({ k: 'stress', d: 0, at: NOW, f: [toHex(frame(0x37, 0)), toHex(frame(0x37, 1, 9, 30, 0, 40)), toHex(frame(0x37, 2, 50))] });
    expect(r.samples.map((x) => [(x.at - TODAY) / 60000, x.value])).toEqual([[0, 30], [60, 40], [360, 50]]);
  });

  it('lit le plus bas et le plus haut de l’oxygène, heure par heure', () => {
    const pairs = new Array(48).fill(0);
    pairs[2] = 96;
    pairs[3] = 99;
    const b = [0xbc, 0x2a, 49, 0, 0, 0, 0, ...pairs];
    expect(parseSpo2(b, NOW)).toEqual([{ metric: 'spo2', at: new Date(2026, 10, 21, 1).getTime(), value: 98, min: 96, max: 99 }]);
  });

  it('lit une nuit commencée avant minuit, avec ses phases', () => {
    const start = 23 * 60;
    const end = 7 * 60;
    const stages = [2, 60, 3, 90, 4, 30, 5, 10];
    const b = [0xbc, 0x27, 20, 0, 0, 0, 1, 0, 4 + stages.length, start & 255, start >> 8, end & 255, end >> 8, ...stages];
    const [n] = parseSleep(b, NOW);
    expect(n.night).toBe(TODAY);
    expect(n.start).toBe(new Date(2026, 10, 20, 23).getTime());
    expect(n.end).toBe(new Date(2026, 10, 21, 7).getTime());
    expect(n.stages).toEqual([[2, 60], [3, 90], [4, 30], [5, 10]]);
  });

  it('ne plante pas sur un message abîmé', () => {
    expect(hexToBytes('zz')).toEqual([]);
    expect(parseReply({ k: 'sleep', d: 0, at: NOW, f: ['bc27'] })).toEqual({ samples: [], nights: [] });
    expect(parseSleep([0xbc, 0x27, 200, 0, 0, 0, 5, 1], NOW)).toEqual([]);
  });
});

describe('relevés : rangement', () => {
  it('garde le journal existant en ajoutant les tables de mesures', async () => {
    const name = `test-migration-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ profiles: '++id', checkins: '++id, [profileId+at]', events: '++id, [profileId+at]' });
    await old.open();
    await old.table('profiles').add({ name: 'Moi', kind: 'adult', createdAt: NOW });
    await old.table('checkins').add({ profileId: 1, at: NOW, mood: 0.2, energy: 0.5, sleep: null });
    await old.table('events').add({ profileId: 1, at: NOW, note: 'avant' });
    old.close();

    const db = new RenardDB(name);
    expect(await db.checkins.count()).toBe(1);
    expect((await db.events.toArray())[0].note).toBe('avant');
    await db.samples.put({ metric: 'hr', at: NOW, value: 60 });
    expect(await db.samples.count()).toBe(1);
    db.close();
  });

  it('ne crée pas de doublons quand on relit le même lot', async () => {
    const db = new RenardDB(`test-sante-${Math.random()}`);
    const line = JSON.stringify({ k: 'hr', d: 0, at: NOW, f: [toHex(frame(0x15, 1, 0, 0, 0, 0, 60, 62))] });
    const belt = JSON.stringify({ k: 'belt', at: NOW, hr: 66, rmssd: 41.5 });
    await ingestLines(db, `${line}\n${belt}\npas du json\n`);
    await ingestLines(db, `${line}\n${belt}\n`);
    expect((await samplesBetween(db, 'hr', TODAY, addDays(TODAY, 1))).length).toBe(2);
    expect((await samplesBetween(db, 'beltHrv', TODAY, addDays(TODAY, 1)))[0].value).toBe(41.5);
    db.close();
  });
});
