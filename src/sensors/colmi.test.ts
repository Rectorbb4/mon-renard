import { describe, expect, it } from 'vitest';
import { colmiPacket, ColmiSession, CMD_MEASURE, CMD_REALTIME_HR, FALLBACK_MS, KEEP_ALIVE_MS, parseColmi } from './ble/colmi';

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
const packet = (...bytes: number[]) => new DataView(colmiPacket(...bytes).buffer);

describe('bague Colmi : paquets', () => {
  it('fait des paquets de 16 octets avec la somme de contrôle', () => {
    // Exemples connus (colmi_r02_client) : démarrer le pouls en direct = 69 01 01 … 6B
    const p = colmiPacket(0x69, 1, 1);
    expect(p).toHaveLength(16);
    expect([...p.slice(0, 3)]).toEqual([0x69, 1, 1]);
    expect(p[15]).toBe(0x6b);
    // La somme déborde : on garde l'octet de poids faible
    expect(colmiPacket(0xff, 0xff, 0x03)[15]).toBe((0xff + 0xff + 0x03) & 0xff);
    expect(() => colmiPacket(...new Array(16).fill(0))).toThrow();
  });

  it('lit le pouls en continu (0x1E) et ignore la valeur 0 du démarrage', () => {
    expect(parseColmi(packet(CMD_REALTIME_HR, 72))).toEqual({ hr: 72 });
    expect(parseColmi(packet(CMD_REALTIME_HR, 0))).toBeNull();
    expect(parseColmi(packet(CMD_REALTIME_HR, 250))).toBeNull();
  });

  it('lit la mesure ponctuelle (0x69) et ses erreurs', () => {
    expect(parseColmi(packet(CMD_MEASURE, 1, 0, 64))).toEqual({ hr: 64 });
    expect(parseColmi(packet(CMD_MEASURE, 1, 0, 0))).toBeNull();
    expect(parseColmi(packet(CMD_MEASURE, 1, 2, 0))).toBeNull();
    expect(parseColmi(packet(CMD_MEASURE, 1, 1, 0))).toEqual({ error: expect.stringContaining('mal placée') });
    // Autre type de mesure (oxygène du sang) : pas un pouls
    expect(parseColmi(packet(CMD_MEASURE, 3, 0, 97))).toBeNull();
  });

  it('ignore les autres paquets (batterie…) et les paquets trop courts', () => {
    expect(parseColmi(packet(0x03, 80, 0))).toBeNull();
    expect(parseColmi(view([0x1e]))).toBeNull();
  });
});

describe('bague Colmi : dialogue', () => {
  const run = () => {
    const sent: number[][] = [];
    const s = new ColmiSession((p) => sent.push([...p.slice(0, 4)]));
    return { s, sent };
  };

  it('démarre le pouls en continu et le relance avant la coupure de 60 s', () => {
    const { s, sent } = run();
    s.start(0);
    expect(sent).toEqual([[CMD_REALTIME_HR, 1, 0, 0]]);
    s.receive(packet(CMD_REALTIME_HR, 70), 2000);
    for (let t = 1000; t <= 60_000; t += 1000) s.tick(t);
    const keepAlives = sent.filter((p) => p[0] === CMD_REALTIME_HR && p[1] === 3);
    expect(keepAlives).toHaveLength(Math.floor(60_000 / KEEP_ALIVE_MS));
    // Le pouls est arrivé : pas besoin de la mesure ponctuelle
    expect(sent.some((p) => p[0] === CMD_MEASURE)).toBe(false);
    expect(s.stopPackets().map((p) => [...p.slice(0, 2)])).toEqual([[CMD_REALTIME_HR, 2]]);
  });

  it('essaie la mesure ponctuelle quand le pouls en continu ne vient pas', () => {
    const { s, sent } = run();
    s.start(0);
    for (let t = 1000; t < FALLBACK_MS; t += 1000) s.tick(t);
    expect(sent.some((p) => p[0] === CMD_MEASURE)).toBe(false);
    s.tick(FALLBACK_MS);
    expect(sent.at(-1)).toEqual([CMD_MEASURE, 1, 1, 0]);
    // Relancée avec le « continuer » suivant, et arrêtée à la fin
    s.tick(KEEP_ALIVE_MS);
    expect(sent.slice(-2)).toEqual([
      [CMD_REALTIME_HR, 3, 0, 0],
      [CMD_MEASURE, 1, 1, 0]
    ]);
    expect(s.stopPackets()).toHaveLength(2);
  });
});
