// Le boîtier ESP32 maison : un service Bluetooth personnalisé.
// PROPOSITION : le boîtier n'existe pas encore. Son micrologiciel devra annoncer ce service et envoyer
// des paquets dans le format ci-dessous (ou ce fichier changera avec lui).

import type { SourceInfo } from '../types';
import { bleSource, type BleProfile } from './webBluetooth';

/** Identifiants propres à Mon renard (tirés au hasard, à reprendre tels quels dans le boîtier). */
export const ESP32_SERVICE = 'b5f3a0e0-6d1c-4c9a-9a51-3f2e7c1d0a01';
export const ESP32_MEASUREMENT = 'b5f3a0e0-6d1c-4c9a-9a51-3f2e7c1d0a02';

export const ESP32_INFO: SourceInfo = {
  id: 'boitier',
  label: 'Boîtier',
  simulated: false,
  measures: ['gsr', 'ppgAmp', 'accel']
};

export const ESP32_FORMAT = 1;

export interface Esp32Packet {
  /** Horloge du boîtier, en millisecondes depuis son démarrage. */
  deviceMs: number;
  gsr?: number;
  ppgAmp?: number;
  accel?: [number, number, number];
}

/**
 * Format d'un paquet (octets en petit-boutiste) :
 *  - u8  version (1)
 *  - u8  drapeaux : bit 0 conductance, bit 1 pouls optique, bit 2 accéléromètre
 *  - u32 horloge du boîtier (ms)
 *  - u16 conductance de la peau, en centièmes de microsiemens        (si bit 0)
 *  - u16 amplitude du pouls optique, de 0 à 10 000 (= 0 à 1)          (si bit 1)
 *  - 3 × i16 accélération x, y, z, en millièmes de g                  (si bit 2)
 */
export function parseEsp32(data: DataView): Esp32Packet | null {
  if (data.byteLength < 6 || data.getUint8(0) !== ESP32_FORMAT) return null;
  const flags = data.getUint8(1);
  const need = 6 + (flags & 1 ? 2 : 0) + (flags & 2 ? 2 : 0) + (flags & 4 ? 6 : 0);
  if (data.byteLength < need) return null;
  const packet: Esp32Packet = { deviceMs: data.getUint32(2, true) };
  let o = 6;
  if (flags & 1) {
    packet.gsr = data.getUint16(o, true) / 100;
    o += 2;
  }
  if (flags & 2) {
    packet.ppgAmp = Math.min(1, data.getUint16(o, true) / 10000);
    o += 2;
  }
  if (flags & 4) {
    packet.accel = [data.getInt16(o, true) / 1000, data.getInt16(o + 2, true) / 1000, data.getInt16(o + 4, true) / 1000];
  }
  return packet;
}

export const esp32Profile: BleProfile = {
  info: ESP32_INFO,
  service: ESP32_SERVICE,
  characteristic: ESP32_MEASUREMENT,
  parse(data) {
    const p = parseEsp32(data);
    if (!p) return null;
    const { deviceMs: _, ...measures } = p;
    return measures;
  }
};

/** Le boîtier comme source de mesures (Web Bluetooth : Chrome seulement). */
export const esp32Source = () => bleSource(esp32Profile);
