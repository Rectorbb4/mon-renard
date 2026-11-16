import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_MS,
  DEFAULT_ALERT,
  describeSlot,
  inSlots,
  parseAlertConfig,
  parseMinutes,
  PulseWatch,
  SNOOZE_MS,
  type AlertConfig
} from './pulseAlert';

// Lundi 16 novembre 2026, 20 h (heure locale)
const MONDAY_20H = new Date(2026, 10, 16, 20, 0).getTime();
const on = (patch: Partial<AlertConfig> = {}): AlertConfig => ({ ...DEFAULT_ALERT, enabled: true, ...patch });

/** Une mesure par seconde pendant `seconds` secondes. */
function feed(w: PulseWatch, cfg: AlertConfig, start: number, seconds: number, hr: (i: number) => number): number | null {
  for (let i = 0; i < seconds; i++) {
    if (w.push(hr(i), start + i * 1000, cfg)) return i;
  }
  return null;
}

describe('plages horaires', () => {
  const evening = [{ days: [1, 2, 3, 4, 5], from: 18 * 60, to: 23 * 60 }];

  it('sonne le soir en semaine, pas au bureau ni le week-end', () => {
    expect(inSlots(new Date(2026, 10, 16, 20, 0), evening)).toBe(true);
    expect(inSlots(new Date(2026, 10, 16, 10, 0), evening)).toBe(false);
    expect(inSlots(new Date(2026, 10, 16, 23, 0), evening)).toBe(false);
    expect(inSlots(new Date(2026, 10, 21, 20, 0), evening)).toBe(false); // samedi
  });

  it('une plage qui passe minuit compte pour le jour où elle commence', () => {
    const night = [{ days: [5], from: 22 * 60, to: 2 * 60 }]; // vendredi 22 h → samedi 2 h
    expect(inSlots(new Date(2026, 10, 20, 23, 30), night)).toBe(true); // vendredi
    expect(inSlots(new Date(2026, 10, 21, 1, 0), night)).toBe(true); // samedi, 1 h
    expect(inSlots(new Date(2026, 10, 21, 23, 0), night)).toBe(false); // samedi soir
    expect(inSlots(new Date(2026, 10, 20, 1, 0), night)).toBe(false); // vendredi, 1 h
  });

  it('début = fin : toute la journée', () => {
    expect(inSlots(new Date(2026, 10, 16, 3, 0), [{ days: [1], from: 0, to: 0 }])).toBe(true);
  });
});

describe('surveillance du pouls', () => {
  it('sonne quand le pouls reste au-dessus du seuil une trentaine de secondes', () => {
    const w = new PulseWatch();
    const at = feed(w, on(), MONDAY_20H, 60, () => 112);
    expect(at).toBe(25);
  });

  it('un pic court ne déclenche rien', () => {
    const w = new PulseWatch();
    expect(feed(w, on(), MONDAY_20H, 120, (i) => (i % 40 < 10 ? 120 : 80))).toBeNull();
  });

  it('quelques ratés de la bague ne l’empêchent pas', () => {
    const w = new PulseWatch();
    expect(feed(w, on(), MONDAY_20H, 60, (i) => (i % 8 === 0 ? 85 : 115))).not.toBeNull();
  });

  it('rien hors des plages horaires, ni quand l’alerte est coupée', () => {
    const morning = new Date(2026, 10, 16, 10, 0).getTime();
    expect(feed(new PulseWatch(), on(), morning, 60, () => 130)).toBeNull();
    expect(feed(new PulseWatch(), on({ enabled: false }), MONDAY_20H, 60, () => 130)).toBeNull();
  });

  it('15 minutes de calme après une alerte', () => {
    const w = new PulseWatch();
    expect(feed(w, on(), MONDAY_20H, 30, () => 120)).not.toBeNull();
    expect(feed(w, on(), MONDAY_20H + 30_000, 600, () => 120)).toBeNull();
    expect(feed(w, on(), MONDAY_20H + COOLDOWN_MS + 1000, 30, () => 120)).not.toBeNull();
  });

  it('« Pas maintenant » : silence pendant une heure', () => {
    const w = new PulseWatch();
    w.snooze(MONDAY_20H);
    expect(feed(w, on(), MONDAY_20H + 1000, 60, () => 120)).toBeNull();
    expect(feed(w, on(), MONDAY_20H + SNOOZE_MS, 30, () => 120)).not.toBeNull();
  });

  it('un trou dans les mesures fait recommencer le compte', () => {
    const w = new PulseWatch();
    expect(feed(w, on(), MONDAY_20H, 20, () => 120)).toBeNull();
    // Capteur perdu 15 s, puis 20 s de mesures : pas assez depuis le retour
    expect(feed(w, on(), MONDAY_20H + 35_000, 20, () => 120)).toBeNull();
  });
});

describe('réglages', () => {
  it('relit une configuration abîmée sans planter', () => {
    expect(parseAlertConfig(null)).toEqual(DEFAULT_ALERT);
    const c = parseAlertConfig({ enabled: true, threshold: 400, slots: [{ days: [9, 1, 1], from: 60, to: 120 }, { days: [1] }], sound: 'x' });
    expect(c).toEqual({ enabled: true, threshold: 160, slots: [{ days: [1], from: 60, to: 120 }], sound: 'carillon' });
  });

  it('lit et décrit les heures', () => {
    expect(parseMinutes('18:30')).toBe(1110);
    expect(parseMinutes('25:00')).toBeNull();
    expect(describeSlot({ days: [1, 2, 3, 4, 5], from: 1080, to: 1380 })).toBe('du lundi au vendredi, 18:00 – 23:00');
    expect(describeSlot({ days: [0, 6], from: 540, to: 540 })).toBe('samedi, dimanche, toute la journée');
  });
});
