// La bague connectée Colmi (R02, R03, R06, R09, R10, R12… celles qui s'utilisent avec l'appli QRing).
// Protocole non chiffré, décodé par des passionnés :
//  - https://github.com/tahnok/colmi_r02_client (packet.py, real_time.py)
//  - Gadgetbridge, appareils « Yawell ring » (YawellRingDeviceSupport.java, YawellRingConstants.java)
// Le même protocole est écrit en Java pour l'appli Android : android/…/ColmiProtocol.java. Garder les deux d'accord.
//
// Chaque paquet fait 16 octets : octet 0 = commande, octets 1 à 14 = données, octet 15 = somme des 15 premiers (mod 256).
// On écrit sur la caractéristique 6e400002, la bague répond par notifications sur 6e400003.

import type { Reading, SensorSource, SourceInfo } from '../types';
import { requestDevice, writePacket, type BtCharacteristic, type BtDevice, type BtFilter } from './webBluetooth';

export const COLMI_SERVICE = '6e40fff0-b5a3-f393-e0a9-e50e24dcca9e';
export const COLMI_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const COLMI_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Pouls en continu, environ une valeur par seconde. Données : 1 = démarrer, 2 = arrêter, 3 = continuer. */
export const CMD_REALTIME_HR = 0x1e;
/** Mesure « ponctuelle » (celle de l'appli QRing). Données : type (1 = pouls), action (1 = démarrer). */
export const CMD_MEASURE = 0x69;
export const CMD_MEASURE_STOP = 0x6a;

/** Débuts de nom Bluetooth des bagues compatibles (repris de Gadgetbridge). */
const COLMI_MODELS = ['R02_', 'R03_', 'R06_', 'R07_', 'R09_', 'R10_', 'R11_', 'R11C_', 'R12_'];
export const COLMI_NAME_PREFIXES = [...COLMI_MODELS, ...COLMI_MODELS.map((m) => `COLMI ${m}`)];

/** La bague arrête le pouls en continu au bout de 60 s sans « continuer » : on le redit toutes les 25 s. */
export const KEEP_ALIVE_MS = 25_000;
/** Sans pouls au bout de ce délai, on essaie aussi la mesure ponctuelle (certains micrologiciels ne font que celle-là). */
export const FALLBACK_MS = 15_000;

export const COLMI_INFO: SourceInfo = {
  id: 'bague',
  label: 'Bague',
  simulated: false,
  measures: ['hr']
};

/** Un paquet de 16 octets, avec sa somme de contrôle. */
export function colmiPacket(...bytes: number[]): Uint8Array {
  if (bytes.length > 15) throw new Error('Paquet trop long');
  const p = new Uint8Array(16);
  p.set(bytes);
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += p[i];
  p[15] = sum & 0xff;
  return p;
}

export type ColmiMessage = { hr: number } | { error: string } | null;

/**
 * Lit une notification de la bague. Renvoie un pouls, une erreur à afficher, ou null (paquet sans intérêt ici,
 * ou pouls pas encore prêt : la bague envoie 0 pendant les premières secondes).
 */
export function parseColmi(data: DataView): ColmiMessage {
  if (data.byteLength < 2) return null;
  const cmd = data.getUint8(0);
  if (cmd === CMD_REALTIME_HR) {
    const bpm = data.getUint8(1);
    return bpm >= 30 && bpm <= 230 ? { hr: bpm } : null;
  }
  if (cmd === CMD_MEASURE && data.byteLength >= 4) {
    // octet 1 = type de mesure, 2 = code d'erreur, 3 = valeur
    if (data.getUint8(1) !== 1) return null;
    const code = data.getUint8(2);
    if (code === 1) return { error: 'La bague est mal placée : capteurs côté paume, bien contre la peau.' };
    if (code !== 0) return null; // 2 = donnée pas encore prête
    const bpm = data.getUint8(3);
    return bpm >= 30 && bpm <= 230 ? { hr: bpm } : null;
  }
  return null;
}

/**
 * Le dialogue avec la bague, sans Bluetooth (pour pouvoir le tester) : quoi envoyer, et quand.
 * `tick` est appelé chaque seconde.
 */
export class ColmiSession {
  private startedAt = 0;
  private lastKeepAlive = 0;
  private lastHrAt = 0;
  private fallback = false;

  constructor(private readonly send: (packet: Uint8Array) => void) {}

  start(now: number): void {
    this.startedAt = now;
    this.lastKeepAlive = now;
    this.lastHrAt = 0;
    this.fallback = false;
    this.send(colmiPacket(CMD_REALTIME_HR, 1));
  }

  tick(now: number): void {
    if (!this.fallback && this.lastHrAt === 0 && now - this.startedAt >= FALLBACK_MS) {
      this.fallback = true;
      this.send(colmiPacket(CMD_MEASURE, 1, 1));
    }
    if (now - this.lastKeepAlive >= KEEP_ALIVE_MS) {
      this.lastKeepAlive = now;
      this.send(colmiPacket(CMD_REALTIME_HR, 3));
      // La mesure ponctuelle s'arrête seule : on la relance
      if (this.fallback) this.send(colmiPacket(CMD_MEASURE, 1, 1));
    }
  }

  receive(data: DataView, now: number): ColmiMessage {
    const m = parseColmi(data);
    if (m && 'hr' in m) this.lastHrAt = now;
    return m;
  }

  /** Paquets à envoyer pour arrêter les mesures (la bague économise sa batterie). */
  stopPackets(): Uint8Array[] {
    const out = [colmiPacket(CMD_REALTIME_HR, 2)];
    if (this.fallback) out.push(colmiPacket(CMD_MEASURE_STOP, 1, 0, 0));
    return out;
  }
}

const NAME_FILTERS: BtFilter[] = COLMI_NAME_PREFIXES.map((namePrefix) => ({ namePrefix }));

/** La bague comme source de mesures (Web Bluetooth : Chrome seulement). */
export function colmiSource(): SensorSource {
  let device: BtDevice | null = null;
  let tx: BtCharacteristic | null = null;
  let rx: BtCharacteristic | null = null;
  let session: ColmiSession | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let onValue: ((e: Event) => void) | null = null;
  let onGone: (() => void) | null = null;

  const cleanup = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (rx && onValue) rx.removeEventListener('characteristicvaluechanged', onValue);
    if (device && onGone) device.removeEventListener('gattserverdisconnected', onGone);
    onValue = null;
    onGone = null;
  };

  return {
    info: COLMI_INFO,
    async start(onReading: (r: Reading) => void, onEnd?: (reason: string | null) => void, onNotice?: (message: string) => void) {
      if (!device) device = await requestDevice(NAME_FILTERS, [COLMI_SERVICE]);
      if (!device.gatt) throw new Error('Cet appareil ne propose pas de connexion.');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(COLMI_SERVICE);
      tx = await service.getCharacteristic(COLMI_WRITE);
      rx = await service.getCharacteristic(COLMI_NOTIFY);
      const writer = tx;
      session = new ColmiSession((p) => {
        writePacket(writer, p).catch((e) => console.warn('Bague : envoi refusé', e));
      });
      const s = session;
      onValue = (e) => {
        const data = (e.target as BtCharacteristic).value;
        if (!data) return;
        const now = Date.now();
        const m = s.receive(data, now);
        if (m && 'hr' in m) onReading({ at: now, source: COLMI_INFO.id, hr: m.hr });
        else if (m) onNotice?.(m.error);
      };
      onGone = () => {
        cleanup();
        onEnd?.('Bague : connexion perdue.');
      };
      rx.addEventListener('characteristicvaluechanged', onValue);
      device.addEventListener('gattserverdisconnected', onGone);
      await rx.startNotifications();
      s.start(Date.now());
      timer = setInterval(() => s.tick(Date.now()), 1000);
    },
    stop() {
      const t = tx;
      const r = rx;
      const packets = session?.stopPackets() ?? [];
      cleanup();
      session = null;
      tx = null;
      rx = null;
      void (async () => {
        try {
          if (t) for (const p of packets) await writePacket(t, p);
          await r?.stopNotifications();
        } catch {
          /* déjà déconnectée */
        }
        if (device?.gatt?.connected) device.gatt.disconnect();
      })();
    }
  };
}
