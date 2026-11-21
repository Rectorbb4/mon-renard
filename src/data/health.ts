// Range les relevés des capteurs dans la base, et les relit par période.

import type { RenardDB } from './db';
import { parseReply, type Parsed, type RingReply } from './ringParse';
import type { HealthMetric, HealthSample, SleepNight } from './types';

export interface IngestResult {
  samples: number;
  nights: number;
  battery?: Parsed['battery'];
}

/** Une ligne du fichier de relevés : une réponse de la bague, ou une minute de ceinture. */
export function parseLine(line: string): Parsed | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || typeof o.at !== 'number') return null;
  if (o.k === 'belt') {
    const samples: HealthSample[] = [];
    if (typeof o.hr === 'number' && o.hr >= 30 && o.hr <= 230) samples.push({ metric: 'beltHr', at: o.at, value: o.hr });
    if (typeof o.rmssd === 'number' && o.rmssd > 0) samples.push({ metric: 'beltHrv', at: o.at, value: o.rmssd });
    return { samples, nights: [] };
  }
  if (typeof o.k !== 'string' || typeof o.d !== 'number' || !Array.isArray(o.f)) return null;
  return parseReply(o as unknown as RingReply);
}

/** Range un lot de lignes. Relire deux fois le même lot ne change rien. */
export async function ingestLines(db: RenardDB, text: string): Promise<IngestResult> {
  const samples: HealthSample[] = [];
  const nights = new Map<number, SleepNight>();
  let battery: Parsed['battery'];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const p = parseLine(line);
    if (!p) continue;
    samples.push(...p.samples);
    for (const n of p.nights) nights.set(n.night, n);
    if (p.battery) battery = p.battery;
  }
  await db.transaction('rw', db.samples, db.nights, async () => {
    if (samples.length) await db.samples.bulkPut(samples);
    if (nights.size) await db.nights.bulkPut([...nights.values()]);
  });
  return { samples: samples.length, nights: nights.size, battery };
}

export function samplesBetween(db: RenardDB, metric: HealthMetric, from: number, to: number): Promise<HealthSample[]> {
  return db.samples.where('[metric+at]').between([metric, from], [metric, to], true, false).toArray();
}

export function nightsBetween(db: RenardDB, from: number, to: number): Promise<SleepNight[]> {
  return db.nights.where('night').between(from, to, true, false).toArray();
}
