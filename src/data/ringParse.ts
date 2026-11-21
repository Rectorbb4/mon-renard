// Décode les relevés de la bague Colmi, gardés tels quels par l'appli Android (RingSync.java).
// Formats repris de Gadgetbridge (YawellRingPacketHandler) et de colmi_r02_client.
// Les calories de la bague ne sont pas gardées : les deux sources se contredisent sur leur unité.

import { addDays, startOfDay } from '../lib/history';
import type { HealthSample, SleepNight, SleepStage } from './types';

export interface RingReply {
  /** Ce qui a été demandé. */
  k: 'battery' | 'steps' | 'hr' | 'stress' | 'spo2' | 'sleep' | 'hrv';
  /** Il y a combien de jours. */
  d: number;
  /** Moment de la relève. */
  at: number;
  /** Messages reçus, en hexadécimal. */
  f: string[];
}

export interface Parsed {
  samples: HealthSample[];
  nights: SleepNight[];
  battery?: { level: number; charging: boolean; at: number };
}

export function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const v = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(v)) return [];
    out.push(v);
  }
  return out;
}

const u16 = (b: number[], i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
/** 0x26 → 26. */
const bcd = (v: number) => (v >> 4) * 10 + (v & 0x0f);

/** Un instant, en minutes depuis minuit (peut être négatif), juste même les jours de changement d'heure. */
function atMinutes(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

export function parseBattery(frames: number[][], at: number): Parsed['battery'] {
  const b = frames[0];
  if (!b || b.length < 3 || b[1] > 100) return undefined;
  return { level: b[1], charging: b[2] === 1, at };
}

/** Pas et mètres, par quart d'heure. */
export function parseSteps(frames: number[][]): HealthSample[] {
  const out: HealthSample[] = [];
  for (const b of frames) {
    if (b.length < 13 || b[1] === 0xff || b[1] === 0xf0) continue;
    const year = 2000 + bcd(b[1]);
    const month = bcd(b[2]);
    const date = bcd(b[3]);
    const quarter = b[4];
    if (month < 1 || month > 12 || date < 1 || date > 31 || quarter > 95) continue;
    const at = new Date(year, month - 1, date, 0, quarter * 15).getTime();
    const steps = u16(b, 9);
    const meters = u16(b, 11);
    if (steps > 0) out.push({ metric: 'steps', at, value: steps });
    if (meters > 0) out.push({ metric: 'meters', at, value: meters });
  }
  return out;
}

/** Pouls de la journée, une case toutes les `interval` minutes (5 par défaut). */
export function parseHeartRate(frames: number[][], day: number, receivedAt: number): HealthSample[] {
  const out: HealthSample[] = [];
  let interval = 5;
  for (const b of frames) {
    if (b.length < 15 || b[1] === 0xff) continue;
    const sub = b[1];
    if (sub === 0) {
      if (b[3] > 0) interval = b[3];
      continue;
    }
    const first = sub === 1 ? 6 : 2;
    const before = sub === 1 ? 0 : 9 + (sub - 2) * 13;
    for (let i = first; i <= 14; i++) {
      const hr = b[i];
      if (hr < 30 || hr > 230) continue;
      const at = atMinutes(day, (before + i - first) * interval);
      if (at <= receivedAt) out.push({ metric: 'hr', at, value: hr });
    }
  }
  return out;
}

/** Stress et variabilité : même format, une case par demi-heure. */
function parseHalfHours(frames: number[][], metric: 'stress' | 'hrv', day: number, receivedAt: number): HealthSample[] {
  const out: HealthSample[] = [];
  for (const b of frames) {
    if (b.length < 15) continue;
    const packet = b[1];
    if (packet === 0xff || packet === 0 || packet > 4) continue;
    const first = packet === 1 ? 3 : 2;
    const before = packet === 1 ? 0 : 12 + (packet - 2) * 13;
    for (let i = first; i <= 14; i++) {
      if (!b[i]) continue;
      const at = atMinutes(day, (before + i - first) * 30);
      if (at <= receivedAt) out.push({ metric, at, value: b[i] });
    }
  }
  return out;
}

/** Oxygène : pour chaque jour, le plus bas et le plus haut de chaque heure. */
export function parseSpo2(b: number[], receivedAt: number): HealthSample[] {
  const out: HealthSample[] = [];
  if (b.length < 7) return out;
  const length = u16(b, 2);
  const today = startOfDay(receivedAt);
  let index = 6;
  let daysAgo = -1;
  while (daysAgo !== 0 && index - 6 < length && index < b.length) {
    daysAgo = b[index++];
    const day = addDays(today, -daysAgo);
    for (let hour = 0; hour < 24 && index + 1 < b.length; hour++) {
      const min = b[index++];
      const max = b[index++];
      if (min >= 70 && max >= min && max <= 100) {
        const at = atMinutes(day, hour * 60);
        if (at <= receivedAt) out.push({ metric: 'spo2', at, value: Math.round((min + max) / 2), min, max });
      }
      if (index - 6 >= length) break;
    }
  }
  return out;
}

const STAGES = new Set([2, 3, 4, 5]);

/** Sommeil : une fiche par nuit, puis ses phases à la suite (phase, minutes). */
export function parseSleep(b: number[], receivedAt: number): SleepNight[] {
  const out: SleepNight[] = [];
  if (b.length < 8 || u16(b, 2) < 2) return out;
  const today = startOfDay(receivedAt);
  const count = b[6];
  let index = 7;
  for (let n = 0; n < count && index + 6 <= b.length; n++) {
    const daysAgo = b[index];
    const dayBytes = b[index + 1];
    const sleepStart = u16(b, index + 2);
    const sleepEnd = u16(b, index + 4);
    index += 6;
    const stages: [SleepStage, number][] = [];
    for (let j = 4; j < dayBytes && index + 1 < b.length; j += 2, index += 2) {
      if (STAGES.has(b[index]) && b[index + 1] > 0) stages.push([b[index] as SleepStage, b[index + 1]]);
    }
    if (!stages.length || sleepStart === sleepEnd) continue;
    const night = addDays(today, -daysAgo);
    const start = atMinutes(night, sleepStart > sleepEnd ? sleepStart - 1440 : sleepStart);
    const end = atMinutes(night, sleepEnd);
    if (end > start) out.push({ night, start, end, stages });
  }
  return out;
}

/** Décode une réponse de la bague. Une réponse illisible ne donne rien, sans bloquer les autres. */
export function parseReply(r: RingReply): Parsed {
  const frames = r.f.map(hexToBytes).filter((b) => b.length > 0);
  const day = addDays(startOfDay(r.at), -r.d);
  switch (r.k) {
    case 'battery':
      return { samples: [], nights: [], battery: parseBattery(frames, r.at) };
    case 'steps':
      return { samples: parseSteps(frames), nights: [] };
    case 'hr':
      return { samples: parseHeartRate(frames, day, r.at), nights: [] };
    case 'stress':
      return { samples: parseHalfHours(frames, 'stress', day, r.at), nights: [] };
    case 'hrv':
      return { samples: parseHalfHours(frames, 'hrv', day, r.at), nights: [] };
    case 'spo2':
      return { samples: frames[0] ? parseSpo2(frames[0], r.at) : [], nights: [] };
    case 'sleep':
      return { samples: [], nights: frames[0] ? parseSleep(frames[0], r.at) : [] };
    default:
      return { samples: [], nights: [] };
  }
}
