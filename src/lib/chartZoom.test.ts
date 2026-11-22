import { describe, expect, it } from 'vitest';
import { clampView, hourLabel, isWhole, MIN_SPAN, panBy, pinchView, timeTicks, zoomAt } from './chartZoom';

const HOUR = 3_600_000;
const day = new Date(2026, 10, 20).getTime();
const bounds = { from: day, to: day + 24 * HOUR };

describe('la plage visible', () => {
  it('ne sort jamais du graphique', () => {
    expect(clampView({ from: day - 2 * HOUR, to: day + 2 * HOUR }, bounds)).toEqual({ from: day, to: day + 4 * HOUR });
    expect(clampView({ from: day + 23 * HOUR, to: day + 27 * HOUR }, bounds)).toEqual({ from: day + 20 * HOUR, to: day + 24 * HOUR });
  });

  it('ne descend pas sous la durée minimale ni au-delà de toute la journée', () => {
    const tiny = clampView({ from: day + HOUR, to: day + HOUR + 1000 }, bounds);
    expect(tiny.to - tiny.from).toBe(MIN_SPAN);
    expect(clampView({ from: day - 40 * HOUR, to: day + 40 * HOUR }, bounds)).toEqual(bounds);
  });

  it('accepte un graphique plus court que la durée minimale', () => {
    const short = { from: day, to: day + 10 * 60_000 };
    expect(clampView({ from: day, to: day + 1000 }, short)).toEqual(short);
  });

  it('garde sous le doigt l’instant autour duquel on zoome', () => {
    const at = day + 6 * HOUR;
    const v = zoomAt(bounds, bounds, at, 0.5);
    expect((at - v.from) / (v.to - v.from)).toBeCloseTo(0.25);
    expect(v.to - v.from).toBe(12 * HOUR);
  });

  it('se déplace puis s’arrête au bord', () => {
    const v = { from: day + 2 * HOUR, to: day + 6 * HOUR };
    expect(panBy(v, bounds, 0.5)).toEqual({ from: day + 4 * HOUR, to: day + 8 * HOUR });
    expect(panBy(v, bounds, -5)).toEqual({ from: day, to: day + 4 * HOUR });
  });
});

describe('le pincement à deux doigts', () => {
  it('écarter les doigts rapproche la courbe autour du milieu', () => {
    const v = pinchView(bounds, bounds, 0.4, 0.6, 0.2, 0.8);
    expect(v.to - v.from).toBeCloseTo(8 * HOUR);
    expect((v.from + v.to) / 2).toBeCloseTo(day + 12 * HOUR);
  });

  it('les deux instants touchés restent sous les doigts', () => {
    const v = pinchView(bounds, bounds, 0.3, 0.5, 0.2, 0.7);
    const span = v.to - v.from;
    expect(v.from + 0.2 * span).toBeCloseTo(day + 0.3 * 24 * HOUR);
    expect(v.from + 0.7 * span).toBeCloseTo(day + 0.5 * 24 * HOUR);
  });

  it('rapprocher les doigts revient vers toute la journée', () => {
    const start = { from: day + 6 * HOUR, to: day + 12 * HOUR };
    expect(pinchView(start, bounds, 0.1, 0.9, 0.45, 0.55)).toEqual(bounds);
  });

  it('glisser les deux doigts déplace sans changer la durée', () => {
    const start = { from: day + 6 * HOUR, to: day + 12 * HOUR };
    const v = pinchView(start, bounds, 0.4, 0.6, 0.3, 0.5);
    expect(v.to - v.from).toBeCloseTo(6 * HOUR);
    expect(v.from).toBeCloseTo(start.from + 0.1 * 6 * HOUR);
  });

  it('deux doigts l’un au-dessus de l’autre ne font pas exploser le zoom', () => {
    const start = { from: day + 6 * HOUR, to: day + 12 * HOUR };
    const v = pinchView(start, bounds, 0.5, 0.501, 0.5, 0.7);
    expect(v.to - v.from).toBeCloseTo(6 * HOUR);
  });

  it('des doigts qui se croisent ne retournent pas la plage', () => {
    const v = pinchView(bounds, bounds, 0.3, 0.7, 0.7, 0.3);
    expect(v.to).toBeGreaterThan(v.from);
    expect(isWhole(v, bounds)).toBe(true);
  });
});

describe('les repères horaires', () => {
  it('garde minuit, 6 h, midi, 18 h sur toute la journée', () => {
    expect(timeTicks(bounds).map((k) => k.label)).toEqual(['minuit', '6 h', 'midi', '18 h', 'minuit']);
  });

  it('s’affine quand on zoome', () => {
    const v = { from: day + 7 * HOUR + 10 * 60_000, to: day + 8 * HOUR + 10 * 60_000 };
    expect(timeTicks(v).map((k) => k.label)).toEqual(['7 h 15', '7 h 30', '7 h 45', '8 h']);
  });

  it('reste dans la plage à cheval sur minuit', () => {
    const v = { from: day - 57 * 60_000, to: day + 476 * 60_000 };
    const list = timeTicks(v);
    expect(list.length).toBeGreaterThan(2);
    expect(list.length).toBeLessThanOrEqual(6);
    expect(list.every((k) => k.t >= v.from && k.t <= v.to)).toBe(true);
    expect(list.map((k) => k.label)).toContain('minuit');
  });

  it('écrit les heures comme on les dit', () => {
    expect(hourLabel(day)).toBe('minuit');
    expect(hourLabel(day + 12 * HOUR)).toBe('midi');
    expect(hourLabel(day + 22.5 * HOUR)).toBe('22 h 30');
  });
});
