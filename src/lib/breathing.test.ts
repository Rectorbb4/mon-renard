import { describe, expect, it } from 'vitest';
import { LEAD_IN_MS, breathAt, cyclesFor, formatClock, isBreathMinutes, sessionMs } from './breathing';

describe('respiration guidée', () => {
  it('compte 6 cycles de 10 secondes par minute', () => {
    expect(cyclesFor(1)).toBe(6);
    expect(cyclesFor(2)).toBe(12);
    expect(cyclesFor(3)).toBe(18);
    expect(sessionMs(1)).toBe(LEAD_IN_MS + 60_000);
  });

  it("commence par un temps pour s'installer, poumons vides", () => {
    const s = breathAt(0, 1);
    expect(s.stage).toBe('ready');
    expect(s.fullness).toBe(0);
    expect(s.secondsLeft).toBe(3);
    expect(breathAt(2500, 1).secondsLeft).toBe(1);
  });

  it('inspire 4 secondes puis expire 6 secondes', () => {
    const at = (ms: number) => breathAt(LEAD_IN_MS + ms, 1);
    expect(at(0)).toMatchObject({ stage: 'in', secondsLeft: 4, cycle: 0 });
    expect(at(0).fullness).toBeCloseTo(0);
    expect(at(2000).fullness).toBeCloseTo(0.5);
    expect(at(3999)).toMatchObject({ stage: 'in', secondsLeft: 1 });
    expect(at(4000)).toMatchObject({ stage: 'out', secondsLeft: 6 });
    expect(at(4000).fullness).toBeCloseTo(1);
    expect(at(7000).fullness).toBeCloseTo(0.5);
    expect(at(9999).secondsLeft).toBe(1);
    expect(at(10_000)).toMatchObject({ stage: 'in', cycle: 1 });
  });

  it("s'arrête pile à la fin du dernier cycle", () => {
    const end = sessionMs(2);
    expect(breathAt(end - 1, 2).stage).toBe('out');
    expect(breathAt(end, 2)).toMatchObject({ stage: 'done', progress: 1, remainingMs: 0 });
    expect(breathAt(end + 5000, 2).stage).toBe('done');
  });

  it('donne le temps restant et l’avancement', () => {
    const s = breathAt(LEAD_IN_MS + 30_000, 1);
    expect(s.remainingMs).toBe(30_000);
    expect(s.progress).toBeCloseTo(0.5);
    expect(formatClock(30_000)).toBe('0:30');
    expect(formatClock(125_000)).toBe('2:05');
    expect(formatClock(59_100)).toBe('1:00');
  });

  it('ne connaît que 1, 2 ou 3 minutes', () => {
    expect(isBreathMinutes(2)).toBe(true);
    expect(isBreathMinutes(5)).toBe(false);
    expect(isBreathMinutes('2')).toBe(false);
  });
});
