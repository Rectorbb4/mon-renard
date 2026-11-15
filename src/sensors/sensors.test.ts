import { describe, expect, it } from 'vitest';
import { parseEsp32 } from './ble/esp32';
import { heartRateProfile, parseHeartRate } from './ble/heartRate';
import { LiveWindow, rmssd } from './metrics';
import { Simulation } from './simulator';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);

describe('ceinture cardio (Heart Rate 0x2A37)', () => {
  it('lit un pouls sur 8 bits sans RR', () => {
    expect(parseHeartRate(view([0x00, 72]))).toEqual({ hr: 72, rr: [], contact: null });
  });

  it('lit un pouls sur 16 bits, le contact et les intervalles RR (1/1024 s → ms)', () => {
    // drapeaux : 16 bits + contact géré et détecté + RR ; pouls 130 ; RR 1024 et 512
    const p = parseHeartRate(view([0x01 | 0x06 | 0x10, 130, 0, 0x00, 0x04, 0x00, 0x02]));
    expect(p).toEqual({ hr: 130, rr: [1000, 500], contact: true });
  });

  it("saute l'énergie dépensée avant les RR", () => {
    const p = parseHeartRate(view([0x08 | 0x10, 60, 0x10, 0x00, 0x00, 0x04]));
    expect(p).toEqual({ hr: 60, rr: [1000], contact: null, energy: 16 });
  });

  it('refuse un paquet trop court, et écarte une mesure sans contact', () => {
    expect(parseHeartRate(view([0x01, 70]))).toBeNull();
    expect(heartRateProfile.parse(view([0x04, 70]))).toBeNull();
    expect(heartRateProfile.parse(view([0x06, 70]))).toEqual({ hr: 70 });
  });
});

describe('boîtier ESP32 (format proposé)', () => {
  it('lit conductance, pouls optique et accéléromètre', () => {
    const bytes = new DataView(new ArrayBuffer(16));
    bytes.setUint8(0, 1);
    bytes.setUint8(1, 0b111);
    bytes.setUint32(2, 123456, true);
    bytes.setUint16(6, 345, true);
    bytes.setUint16(8, 6200, true);
    bytes.setInt16(10, -20, true);
    bytes.setInt16(12, 15, true);
    bytes.setInt16(14, 1002, true);
    expect(parseEsp32(bytes)).toEqual({ deviceMs: 123456, gsr: 3.45, ppgAmp: 0.62, accel: [-0.02, 0.015, 1.002] });
  });

  it("ne lit que ce que les drapeaux annoncent, et refuse un autre format ou un paquet tronqué", () => {
    expect(parseEsp32(view([1, 0b001, 0, 0, 0, 0, 0x2c, 0x01]))).toEqual({ deviceMs: 0, gsr: 3 });
    expect(parseEsp32(view([2, 0, 0, 0, 0, 0]))).toBeNull();
    expect(parseEsp32(view([1, 0b100, 0, 0, 0, 0, 1, 2]))).toBeNull();
  });
});

describe('variabilité cardiaque (RMSSD)', () => {
  it('calcule la racine de la moyenne des carrés des différences', () => {
    // différences : 20, -20, 20 → RMSSD 20
    expect(rmssd([800, 820, 800, 820])).toBe(20);
  });

  it('écarte les artefacts et refuse trop peu de données', () => {
    expect(rmssd([800, 820])).toBeNull();
    expect(rmssd([800, 820, 100, 800, 820, 1900])).toBe(20);
  });
});

describe('fenêtre glissante', () => {
  it('ne garde que les dernières secondes', () => {
    const w = new LiveWindow(10_000);
    for (let s = 0; s <= 20; s++) w.push({ at: s * 1000, source: 't', hr: 60 + s, rr: [1000] });
    expect(w.readings[0].at).toBe(10_000);
    expect(w.series('hr').at(-1)).toEqual([20_000, 80]);
    expect(w.rrSince(3000, 20_000)).toHaveLength(4);
  });
});

describe('capteur simulé', () => {
  it('donne des valeurs plausibles et cohérentes', () => {
    const sim = new Simulation(42, 0.3);
    const readings = Array.from({ length: 300 }, (_, i) => sim.next(i * 1000));
    for (const r of readings) {
      expect(r.hr).toBeGreaterThan(45);
      expect(r.hr).toBeLessThan(110);
      expect(r.gsr).toBeGreaterThan(0.5);
      expect(r.gsr).toBeLessThan(12);
      for (const v of r.rr ?? []) expect(Math.abs(60000 / v - r.hr!)).toBeLessThan(25);
    }
    // Environ un battement par seconde au total
    const beats = readings.reduce((n, r) => n + (r.rr?.length ?? 0), 0);
    const meanHr = readings.reduce((s, r) => s + r.hr!, 0) / readings.length;
    expect(Math.abs(beats - (meanHr / 60) * 300)).toBeLessThan(10);
    // Une variabilité réaliste au repos
    const v = rmssd(readings.flatMap((r) => r.rr ?? []));
    expect(v).toBeGreaterThan(8);
    expect(v).toBeLessThan(120);
  });

  it('est reproductible et suit le niveau d’activation', () => {
    const a = new Simulation(7, 0.2);
    const b = new Simulation(7, 0.2);
    expect(a.next(0)).toEqual(b.next(0));
    const mean = (arousal: number) => {
      const s = new Simulation(3, arousal);
      let sum = 0;
      for (let i = 0; i < 120; i++) sum += s.next(i * 1000).hr!;
      return sum / 120;
    };
    expect(mean(0.9)).toBeGreaterThan(mean(0.1) + 15);
  });
});
