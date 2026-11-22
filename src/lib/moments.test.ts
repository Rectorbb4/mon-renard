import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ensureProfile } from '../data/checkins';
import { RenardDB } from '../data/db';
import { addFeltEvent } from '../data/events';
import { cleanCapture, ingestMoments, parseMomentLine } from '../data/moments';
import type { MomentCapture } from '../data/types';
import { medianCurve, momentPattern, momentStats, patternText, relativeCurve } from './moments';

/** Un pouls par seconde, de -10 s à +10 s. */
function capture(f: (s: number) => number): MomentCapture {
  const hr: [number, number][] = [];
  for (let s = -10; s <= 10; s++) hr.push([s * 1000, f(s)]);
  return { start: 1_000_000, source: 'ceinture', hr, rr: [] };
}

describe('momentStats', () => {
  it('sépare l’avant et l’après du geste', () => {
    const s = momentStats(capture((t) => (t < 0 ? 80 : 100)));
    expect(s.before).toBe(80);
    expect(s.after).toBe(100);
    expect(s.drift).toBe(0);
  });

  it('voit un pouls qui monte déjà avant le geste', () => {
    expect(momentStats(capture((t) => 90 + t)).drift).toBeCloseTo(7, 5);
  });

  it('ne conclut rien sans mesure', () => {
    const s = momentStats({ start: 1, source: null, hr: [], rr: [] });
    expect(s.before).toBeNull();
    expect(s.drift).toBeNull();
  });

  it('calcule la variabilité de chaque côté à partir des battements', () => {
    const rr: [number, number][] = [-5000, -4200, -3400, -2600].map((t, i) => [t, 800 + (i % 2) * 20]);
    const s = momentStats({ ...capture(() => 75), rr });
    expect(s.hrvBefore).toBe(20);
    expect(s.hrvAfter).toBeNull();
  });
});

describe('momentPattern', () => {
  it('compte ce que fait le pouls avant le geste', () => {
    const list = [capture((t) => 90 + t), capture((t) => 90 + t), capture((t) => 90 - t), capture(() => 70)];
    const p = momentPattern(list);
    expect(p).toMatchObject({ count: 4, rising: 2, falling: 1, steady: 1 });
  });

  it('demande un écart plus net à la bague qu’à la ceinture', () => {
    const rise = (t: number) => 90 + t * 0.7;
    expect(momentPattern([capture(rise)]).rising).toBe(1);
    expect(momentPattern([{ ...capture(rise), source: 'bague' }])).toMatchObject({ rising: 0, steady: 1 });
  });

  it('lit une bague qui donne peu de mesures', () => {
    const c: MomentCapture = { start: 1, source: 'bague', hr: [[-9000, 80], [-5000, 84], [-1000, 90], [4000, 95]], rr: [] };
    expect(momentStats(c).drift).toBe(10);
  });

  it('ne dit rien de général avant cinq moments', () => {
    expect(patternText(momentPattern([capture(() => 70)]))).toContain('Encore 4 moments');
    const five = Array.from({ length: 5 }, () => capture((t) => 90 + t));
    expect(patternText(momentPattern(five))).toContain('Sur 5 moments');
  });
});

describe('courbes', () => {
  it('ramène chaque moment à son pouls d’avant le geste', () => {
    const c = relativeCurve(capture((t) => (t < 0 ? 120 : 130)));
    expect(c[0][1]).toBe(0);
    expect(c[c.length - 1][1]).toBe(10);
  });

  it('prend le milieu des moments, seconde par seconde', () => {
    const m = medianCurve([relativeCurve(capture(() => 70)), relativeCurve(capture(() => 90)), relativeCurve(capture((t) => (t < 0 ? 80 : 86)))]);
    expect(m).toHaveLength(21);
    expect(m[20][1]).toBe(0);
  });
});

describe('captures', () => {
  it('écarte les valeurs impossibles', () => {
    const c = cleanCapture({ start: 5, src: 'ceinture', hr: [[0, 72], [100, 900], [99_999, 70]], rr: [[0, 800], [10, 12]] });
    expect(c).toEqual({ start: 5, source: 'ceinture', hr: [[0, 72]], rr: [[0, 800]] });
  });

  it('refuse une ligne abîmée', () => {
    expect(parseMomentLine('pas du json')).toBeNull();
    expect(parseMomentLine('{"at":5}')).toBeNull();
  });

  it('pose la capture sur son moment, et oublie celle d’un moment effacé', async () => {
    const db = new RenardDB('moments-1');
    const profileId = await ensureProfile(db);
    await addFeltEvent(db, profileId, 100_000);
    const line = (at: number) => JSON.stringify({ at, start: at - 2000, src: 'ceinture', hr: [[-1000, 80]], rr: [] });
    expect(await ingestMoments(db, profileId, `${line(100_000)}\n${line(200_000)}\n`)).toBe(1);
    const all = await db.events.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].capture?.hr).toEqual([[-1000, 80]]);
    await db.delete();
  });
});
