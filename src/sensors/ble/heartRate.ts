// La ceinture cardio : service Bluetooth standard « Heart Rate » (0x180D).
// Toutes les ceintures du commerce (Polar, Garmin, Wahoo…) le proposent.
// Spécification : Bluetooth SIG, Heart Rate Service 1.0, caractéristique Heart Rate Measurement (0x2A37).

import type { SourceInfo } from '../types';
import { bleSource, type BleProfile } from './webBluetooth';

export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

export const HEART_RATE_INFO: SourceInfo = {
  id: 'ceinture',
  label: 'Ceinture cardio',
  simulated: false,
  measures: ['hr', 'rr']
};

export interface HeartRatePacket {
  hr: number;
  /** Intervalles RR en millisecondes (convertis depuis des 1/1024 s). */
  rr: number[];
  /** Contact avec la peau : true, false, ou null si la ceinture ne le dit pas. */
  contact: boolean | null;
  /** Énergie dépensée (kJ) si la ceinture l'envoie. */
  energy?: number;
}

/**
 * Lit un paquet « Heart Rate Measurement ».
 * Octet 0 = drapeaux : bit 0 pouls sur 16 bits, bits 1-2 contact, bit 3 énergie présente, bit 4 intervalles RR présents.
 */
export function parseHeartRate(data: DataView): HeartRatePacket | null {
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  let offset = 1;
  let hr: number;
  if (flags & 0x01) {
    if (data.byteLength < 3) return null;
    hr = data.getUint16(offset, true);
    offset += 2;
  } else {
    hr = data.getUint8(offset);
    offset += 1;
  }
  const contactSupported = (flags & 0x04) !== 0;
  const packet: HeartRatePacket = { hr, rr: [], contact: contactSupported ? (flags & 0x02) !== 0 : null };
  if (flags & 0x08) {
    if (data.byteLength >= offset + 2) packet.energy = data.getUint16(offset, true);
    offset += 2;
  }
  if (flags & 0x10) {
    for (; offset + 1 < data.byteLength; offset += 2) packet.rr.push(Math.round((data.getUint16(offset, true) * 1000) / 1024));
  }
  return packet;
}

export const heartRateProfile: BleProfile = {
  info: HEART_RATE_INFO,
  service: HEART_RATE_SERVICE,
  characteristic: HEART_RATE_MEASUREMENT,
  parse(data) {
    const p = parseHeartRate(data);
    // Pas de contact avec la peau : la valeur ne veut rien dire
    if (!p || p.contact === false || p.hr === 0) return null;
    return p.rr.length ? { hr: p.hr, rr: p.rr } : { hr: p.hr };
  }
};

/** La ceinture comme source de mesures (Web Bluetooth : Chrome seulement). */
export const heartRateSource = () => bleSource(heartRateProfile);
