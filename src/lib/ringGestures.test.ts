import { describe, expect, it } from 'vitest';
import { compareGestures, signature, signatureLabel, usableGestures, type RingSignal, type Trials } from './ringGestures';

const key = (code: string): RingSignal => ({ channel: 'touche', code: `KEYCODE_${code}`, at: 1 });
const msg = (code: string): RingSignal => ({ channel: 'message', code, at: 1 });
const status = (trials: Trials) => Object.fromEntries(compareGestures(trials).map((r) => [r.id, r.status]));

describe('signaux de la bague', () => {
  it('ignore la somme de contrôle et les zéros de fin', () => {
    expect(signature(msg('02020000000000000000000000000004'))).toBe('message:0202');
    expect(signatureLabel('message:0202')).toBe('message 02 02');
  });

  it('garde ce qui différencie deux messages', () => {
    expect(signature(msg('02020100000000000000000000000005'))).not.toBe(signature(msg('02020200000000000000000000000006')));
  });

  it('nomme les touches connues et inconnues', () => {
    expect(signatureLabel('touche:KEYCODE_MEDIA_NEXT')).toBe('touche suivant');
    expect(signatureLabel('touche:KEYCODE_F5')).toBe('touche f5');
  });
});

describe('comparaison des gestes', () => {
  it('reconnaît deux gestes aux signaux différents', () => {
    const trials = { rien: [], tap1: [key('MEDIA_NEXT')], coup: [msg('0202')] };
    expect(status(trials)).toEqual({ rien: 'calme', tap1: 'apart', coup: 'apart' });
    expect(usableGestures(compareGestures(trials))).toBe(2);
  });

  it('signale deux gestes au même signal, quel que soit leur nombre', () => {
    const results = compareGestures({ tap1: [key('MEDIA_NEXT')], tap2: [key('MEDIA_NEXT'), key('MEDIA_NEXT')] });
    expect(results.map((r) => r.status)).toEqual(['commun', 'commun']);
    expect(results[0].sameAs).toEqual(['Deux tapotements']);
    expect(usableGestures(results)).toBe(1);
  });

  it("écarte un signal reçu aussi sans bouger", () => {
    const trials = { rien: [msg('0202')], coup: [msg('0202')], tap1: [key('MEDIA_NEXT')] };
    expect(status(trials)).toEqual({ rien: 'parasite', tap1: 'apart', coup: 'parasite' });
    expect(usableGestures(compareGestures(trials))).toBe(1);
  });

  it('dit quand un geste ne donne rien', () => {
    expect(status({ coup: [] })).toEqual({ coup: 'rien' });
  });
});
