// Sauvegarde manuelle : tout le journal dans un fichier JSON, et retour depuis ce fichier.
// L'import ajoute ce qui manque sans rien effacer : refaire deux fois le même import ne crée pas de doublons.

import { Dexie } from 'dexie';
import { WORD_MAX, ensureProfile, normalizeCheckIn } from './checkins';
import type { RenardDB } from './db';
import { cleanNote } from './events';
import { cleanCapture } from './moments';
import { HEALTH_METRICS, type CheckIn, type FeltEvent, type HealthMetric, type HealthSample, type Profile, type SleepNight, type SleepStage, type WakeNote } from './types';

export const BACKUP_APP = 'mon-renard';
export const BACKUP_FORMAT = 1;
/** Au-delà, ce n'est sûrement pas une sauvegarde de l'appli (des années de journal font moins de 5 Mo). */
const MAX_CHARS = 30 * 1024 * 1024;
const NAME_MAX = 40;

export interface BackupProfile {
  /** Numéro du profil dans la sauvegarde, repris par `profileId` des check-ins et des moments. */
  id: number;
  name: string;
  kind: Profile['kind'];
  createdAt: number;
}

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: number;
  appVersion?: string;
  profiles: BackupProfile[];
  checkins: Omit<CheckIn, 'id'>[];
  events: Omit<FeltEvent, 'id'>[];
  /** Mesures des capteurs, si l'appli en a. Les versions plus anciennes l'ignorent simplement. */
  health?: BackupHealth;
}

/** Une mesure en liste courte, pour que des mois de pouls restent un petit fichier. */
export type BackupSample = [HealthMetric, number, number] | [HealthMetric, number, number, number, number];

export interface BackupHealth {
  samples: BackupSample[];
  nights: SleepNight[];
  /** Les heures de réveil corrigées à la main. */
  wakes?: WakeNote[];
}

const toBackupSample = (s: HealthSample): BackupSample =>
  s.min != null && s.max != null ? [s.metric, s.at, s.value, s.min, s.max] : [s.metric, s.at, s.value];

function fromBackupSample(s: BackupSample): HealthSample {
  const out: HealthSample = { metric: s[0], at: s[1], value: s[2] };
  if (s.length === 5) {
    out.min = s[3];
    out.max = s[4];
  }
  return out;
}

/** Message lisible par l'utilisateur quand un fichier ne peut pas être importé. */
export class BackupError extends Error {}

export async function exportBackup(db: RenardDB, now = Date.now(), appVersion?: string): Promise<Backup> {
  return db.transaction('r', [db.profiles, db.checkins, db.events, db.samples, db.nights, db.wakes], async () => {
    const profiles = (await db.profiles.toArray()).map(({ id, name, kind, createdAt }) => ({ id: id!, name, kind, createdAt }));
    const byTime = <T extends { at: number }>(a: T, b: T) => a.at - b.at;
    const checkins = (await db.checkins.toArray()).map(({ id: _id, ...c }) => c).sort(byTime);
    const events = (await db.events.toArray()).map(({ id: _id, ...e }) => e).sort(byTime);
    const backup: Backup = { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: now, profiles, checkins, events };
    if (appVersion) backup.appVersion = appVersion;
    const samples = await db.samples.toArray();
    const nights = await db.nights.toArray();
    const wakes = await db.wakes.toArray();
    if (samples.length || nights.length) {
      backup.health = { samples: samples.map(toBackupSample), nights };
      if (wakes.length) backup.health.wakes = wakes;
    }
    return backup;
  });
}

export function backupToJson(backup: Backup): string {
  // Avec les mesures, sans mise en forme : le fichier resterait sinon plusieurs fois plus gros
  return backup.health || backup.events.some((e) => e.capture) ? JSON.stringify(backup) : JSON.stringify(backup, null, 1);
}

/** « mon-renard-sauvegarde-2026-11-15.json » (date locale). */
export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `mon-renard-sauvegarde-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export interface ParsedBackup {
  backup: Backup;
  /** Lignes illisibles, laissées de côté. */
  invalid: number;
}

const METRICS = new Set<string>(HEALTH_METRICS);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseHealth(raw: unknown): { health?: BackupHealth; invalid: number } {
  if (!isObject(raw)) return { invalid: 0 };
  let invalid = 0;
  const samples: BackupSample[] = [];
  for (const s of Array.isArray(raw.samples) ? raw.samples : []) {
    if (!Array.isArray(s) || !METRICS.has(s[0]) || !isTime(s[1]) || !isNum(s[2])) {
      invalid++;
    } else if (isNum(s[3]) && isNum(s[4])) {
      samples.push([s[0], s[1], s[2], s[3], s[4]]);
    } else {
      samples.push([s[0], s[1], s[2]]);
    }
  }
  const nights: SleepNight[] = [];
  for (const n of Array.isArray(raw.nights) ? raw.nights : []) {
    const stages = isObject(n) && Array.isArray(n.stages)
      ? n.stages.filter((x): x is [SleepStage, number] => Array.isArray(x) && [2, 3, 4, 5].includes(x[0]) && isNum(x[1]) && x[1] > 0)
      : [];
    if (!isObject(n) || !isTime(n.night) || !isTime(n.start) || !isTime(n.end) || n.end <= n.start || !stages.length) {
      invalid++;
      continue;
    }
    nights.push({ night: n.night, start: n.start, end: n.end, stages: stages.map(([s, m]) => [s, m]) });
  }
  if (!samples.length && !nights.length) return { invalid };
  const wakes: WakeNote[] = [];
  for (const w of Array.isArray(raw.wakes) ? raw.wakes : []) {
    if (isObject(w) && isTime(w.night) && isTime(w.at)) wakes.push({ night: w.night, at: w.at });
    else invalid++;
  }
  const health: BackupHealth = { samples, nights };
  if (wakes.length) health.wakes = wakes;
  return { health, invalid };
}

/** Lit et vérifie le contenu d'un fichier. Lève une BackupError avec un message clair si ce n'est pas utilisable. */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > MAX_CHARS) throw new BackupError("Ce fichier est bien trop gros pour être une sauvegarde de Mon renard.");
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new BackupError("Ce fichier n'est pas une sauvegarde lisible.");
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) throw new BackupError('Ce fichier ne vient pas de Mon renard.');
  if (typeof raw.format !== 'number' || raw.format < 1) throw new BackupError("Cette sauvegarde est abîmée : son format n'est pas reconnu.");
  if (raw.format > BACKUP_FORMAT) {
    throw new BackupError("Cette sauvegarde vient d'une version plus récente de l'appli. Mets l'appli à jour, puis réessaie.");
  }
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.checkins) || !Array.isArray(raw.events)) {
    throw new BackupError('Cette sauvegarde est abîmée : il manque une partie du journal.');
  }

  let invalid = 0;
  const profiles: BackupProfile[] = [];
  for (const p of raw.profiles) {
    if (!isObject(p) || !Number.isInteger(p.id) || profiles.some((q) => q.id === p.id)) {
      invalid++;
      continue;
    }
    const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
    profiles.push({
      id: p.id as number,
      name: name || 'Moi',
      kind: p.kind === 'child' ? 'child' : 'adult',
      createdAt: isTime(p.createdAt) ? p.createdAt : Date.now()
    });
  }
  const known = new Set(profiles.map((p) => p.id));

  const checkins: Omit<CheckIn, 'id'>[] = [];
  for (const c of raw.checkins) {
    if (!isObject(c) || !known.has(c.profileId as number) || !isTime(c.at) || typeof c.mood !== 'number' || typeof c.energy !== 'number') {
      invalid++;
      continue;
    }
    const { id: _id, ...clean } = normalizeCheckIn(
      {
        mood: c.mood,
        energy: c.energy,
        sleep: typeof c.sleep === 'number' ? c.sleep : null,
        word: typeof c.word === 'string' ? c.word.slice(0, WORD_MAX * 4) : undefined
      },
      c.profileId as number,
      c.at
    );
    checkins.push(clean);
  }

  const events: Omit<FeltEvent, 'id'>[] = [];
  for (const e of raw.events) {
    if (!isObject(e) || !known.has(e.profileId as number) || !isTime(e.at)) {
      invalid++;
      continue;
    }
    const event: Omit<FeltEvent, 'id'> = { profileId: e.profileId as number, at: e.at };
    const note = cleanNote(typeof e.note === 'string' ? e.note : undefined);
    if (note) event.note = note;
    const capture = cleanCapture(e.capture);
    if (capture) event.capture = capture;
    events.push(event);
  }

  const parsedHealth = parseHealth(raw.health);
  invalid += parsedHealth.invalid;

  if (!checkins.length && !events.length && !parsedHealth.health) {
    throw new BackupError(invalid ? 'Cette sauvegarde est abîmée : aucune ligne du journal ne peut être lue.' : 'Cette sauvegarde est vide.');
  }

  const backup: Backup = {
    app: BACKUP_APP,
    format: raw.format,
    exportedAt: isTime(raw.exportedAt) ? raw.exportedAt : 0,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 20) : undefined,
    profiles,
    checkins,
    events
  };
  if (parsedHealth.health) backup.health = parsedHealth.health;
  return { backup, invalid };
}

export interface BackupSummary {
  checkins: number;
  events: number;
  /** Premier et dernier instant du journal. */
  from: number;
  to: number;
  /** Mesures des capteurs et nuits, s'il y en a. */
  measures?: number;
}

export function summarizeBackup(backup: Backup): BackupSummary {
  let from = Infinity;
  let to = -Infinity;
  const see = (at: number) => {
    if (at < from) from = at;
    if (at > to) to = at;
  };
  for (const x of backup.checkins) see(x.at);
  for (const x of backup.events) see(x.at);
  for (const s of backup.health?.samples ?? []) see(s[1]);
  for (const n of backup.health?.nights ?? []) see(n.end);
  const summary: BackupSummary = { checkins: backup.checkins.length, events: backup.events.length, from, to };
  if (backup.health) summary.measures = backup.health.samples.length + backup.health.nights.length;
  return summary;
}

export interface ImportResult {
  checkins: number;
  events: number;
  /** Déjà présents sur le téléphone (même profil, même instant). */
  already: number;
  /** Mesures et nuits ajoutées. */
  measures?: number;
}

/** Ajoute le contenu de la sauvegarde au journal du téléphone, sans doublons et sans rien effacer. */
export async function importBackup(db: RenardDB, backup: Backup): Promise<ImportResult> {
  return db.transaction('rw', [db.profiles, db.checkins, db.events, db.samples, db.nights, db.wakes], async () => {
    // Chaque profil de la sauvegarde retrouve son profil sur le téléphone (même nom, même type).
    // Une sauvegarde à un seul profil va dans le profil principal, comme avant le changement de téléphone.
    const local = await db.profiles.toArray();
    const map = new Map<number, number>();
    for (const p of backup.profiles) {
      const same = local.find((l) => l.name === p.name && l.kind === p.kind);
      if (same?.id != null) map.set(p.id, same.id);
      else if (backup.profiles.length === 1) map.set(p.id, await ensureProfile(db));
      else {
        const id = (await db.profiles.add({ name: p.name, kind: p.kind, createdAt: p.createdAt })) as number;
        local.push({ id, name: p.name, kind: p.kind, createdAt: p.createdAt });
        map.set(p.id, id);
      }
    }

    const result: ImportResult = { checkins: 0, events: 0, already: 0 };

    for (const [from, to] of map) {
      const localCheckins = await db.checkins
        .where('[profileId+at]')
        .between([to, Dexie.minKey], [to, Dexie.maxKey])
        .toArray();
      const haveCheckins = new Set(localCheckins.map((c) => c.at));
      const newCheckins: CheckIn[] = [];
      for (const c of backup.checkins) {
        if (c.profileId !== from) continue;
        if (haveCheckins.has(c.at)) {
          result.already++;
          continue;
        }
        haveCheckins.add(c.at);
        newCheckins.push({ ...c, profileId: to });
      }
      await db.checkins.bulkAdd(newCheckins);
      result.checkins += newCheckins.length;

      const localEvents = await db.events
        .where('[profileId+at]')
        .between([to, Dexie.minKey], [to, Dexie.maxKey])
        .toArray();
      const haveEvents = new Map(localEvents.map((e) => [e.at, e]));
      const newEvents: FeltEvent[] = [];
      for (const e of backup.events) {
        if (e.profileId !== from) continue;
        const twin = haveEvents.get(e.at);
        if (twin) {
          result.already++;
          // Le même moment, noté sur l'autre téléphone : on garde la note si celui-ci n'en a pas
          if (!twin.note && e.note) {
            twin.note = e.note;
            await db.events.update(twin.id!, { note: e.note });
          }
          // Pareil pour le pouls gardé autour de ce moment
          if (!twin.capture && e.capture) {
            twin.capture = e.capture;
            await db.events.update(twin.id!, { capture: e.capture });
          }
          continue;
        }
        const event: FeltEvent = { ...e, profileId: to };
        haveEvents.set(e.at, event);
        newEvents.push(event);
      }
      await db.events.bulkAdd(newEvents);
      result.events += newEvents.length;
    }

    if (backup.health) {
      // Ce qui est déjà sur le téléphone n'est pas remplacé
      const haveSamples = new Set((await db.samples.toCollection().primaryKeys()).map(([m, at]) => `${m}:${at}`));
      const newSamples = backup.health.samples.filter((s) => !haveSamples.has(`${s[0]}:${s[1]}`)).map(fromBackupSample);
      const haveNights = new Set(await db.nights.toCollection().primaryKeys());
      const newNights = backup.health.nights.filter((n) => !haveNights.has(n.night));
      await db.samples.bulkPut(newSamples);
      await db.nights.bulkPut(newNights);
      // Un réveil déjà corrigé sur ce téléphone reste celui de ce téléphone
      const haveWakes = new Set(await db.wakes.toCollection().primaryKeys());
      await db.wakes.bulkPut((backup.health.wakes ?? []).filter((w) => !haveWakes.has(w.night)));
      result.measures = newSamples.length + newNights.length;
      result.already += backup.health.samples.length + backup.health.nights.length - result.measures;
    }
    return result;
  });
}
