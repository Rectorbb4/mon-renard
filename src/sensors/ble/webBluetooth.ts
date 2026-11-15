// Connexion Bluetooth basse consommation (BLE) depuis le navigateur, avec Web Bluetooth.
// Marche dans Chrome sur Android (appli installée depuis Chrome) ; PAS dans la WebView de l'appli Android :
// là, c'est le Bluetooth natif (android/…/BleSensors.java) qui s'en charge, voir src/sensors/native.ts.

import type { Reading, SensorSource, SourceInfo } from '../types';

// Types minimaux de Web Bluetooth (absents de TypeScript)
export interface BtCharacteristic extends EventTarget {
  value?: DataView;
  properties?: { write?: boolean; writeWithoutResponse?: boolean };
  startNotifications(): Promise<BtCharacteristic>;
  stopNotifications(): Promise<BtCharacteristic>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValue?(value: BufferSource): Promise<void>;
}
export interface BtService {
  getCharacteristic(uuid: number | string): Promise<BtCharacteristic>;
}
export interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: number | string): Promise<BtService>;
}
export interface BtDevice extends EventTarget {
  name?: string;
  gatt?: BtServer;
}
/** Un filtre de recherche : par service annoncé, ou par début de nom. */
export type BtFilter = { services: (number | string)[] } | { namePrefix: string };
interface Bluetooth {
  requestDevice(options: { filters: BtFilter[]; optionalServices?: (number | string)[] }): Promise<BtDevice>;
}

function bluetooth(): Bluetooth | null {
  return typeof navigator !== 'undefined' ? ((navigator as unknown as { bluetooth?: Bluetooth }).bluetooth ?? null) : null;
}

/** Le navigateur sait-il parler aux capteurs Bluetooth ? */
export function hasWebBluetooth(): boolean {
  return bluetooth() != null;
}

/** Le navigateur affiche la liste des appareils trouvés ; la personne choisit le sien. */
export async function requestDevice(filters: BtFilter[], optionalServices: (number | string)[] = []): Promise<BtDevice> {
  const bt = bluetooth();
  if (!bt) throw new Error('Ce navigateur ne sait pas se connecter aux capteurs Bluetooth.');
  try {
    return await bt.requestDevice({ filters, optionalServices });
  } catch (e) {
    // Fenêtre fermée sans choisir : ce n'est pas une erreur à afficher
    if (e instanceof Error && e.name === 'NotFoundError') throw new CancelledError();
    throw e;
  }
}

/** La personne a fermé la fenêtre de choix sans prendre d'appareil. */
export class CancelledError extends Error {
  constructor() {
    super('Aucun appareil choisi.');
    this.name = 'CancelledError';
  }
}

/** Envoie un paquet, sans attendre de réponse si le capteur le permet. */
export async function writePacket(c: BtCharacteristic, bytes: Uint8Array): Promise<void> {
  const data = new Uint8Array(bytes);
  if (c.writeValueWithoutResponse && c.properties?.writeWithoutResponse !== false) return c.writeValueWithoutResponse(data);
  if (c.writeValueWithResponse) return c.writeValueWithResponse(data);
  if (c.writeValue) return c.writeValue(data);
  throw new Error('Impossible d’écrire vers ce capteur.');
}

/** Ce qu'il faut pour brancher un capteur : son service, sa caractéristique de mesure, et comment lire un paquet. */
export interface BleProfile {
  info: SourceInfo;
  service: number | string;
  characteristic: number | string;
  /** Transforme un paquet reçu en mesure (sans l'instant ni la source), ou null s'il est illisible. */
  parse(data: DataView): Omit<Reading, 'at' | 'source'> | null;
}

/** Une source de mesures branchée sur un capteur Bluetooth. Le navigateur demande quel appareil utiliser. */
export function bleSource(profile: BleProfile): SensorSource {
  let device: BtDevice | null = null;
  let characteristic: BtCharacteristic | null = null;
  let onValue: ((e: Event) => void) | null = null;
  let onGone: (() => void) | null = null;

  const cleanup = () => {
    if (characteristic && onValue) characteristic.removeEventListener('characteristicvaluechanged', onValue);
    if (device && onGone) device.removeEventListener('gattserverdisconnected', onGone);
    characteristic = null;
    onValue = null;
    onGone = null;
  };

  return {
    info: profile.info,
    async start(onReading, onEnd) {
      // Après une pause (appli en arrière-plan), on se reconnecte au même appareil sans redemander
      if (!device) device = await requestDevice([{ services: [profile.service] }]);
      if (!device.gatt) throw new Error('Cet appareil ne propose pas de connexion.');
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(profile.service);
      characteristic = await service.getCharacteristic(profile.characteristic);
      onValue = (e) => {
        const data = (e.target as BtCharacteristic).value;
        const parsed = data ? profile.parse(data) : null;
        if (parsed) onReading({ at: Date.now(), source: profile.info.id, ...parsed });
      };
      onGone = () => {
        cleanup();
        onEnd?.(`${profile.info.label} : connexion perdue.`);
      };
      characteristic.addEventListener('characteristicvaluechanged', onValue);
      device.addEventListener('gattserverdisconnected', onGone);
      await characteristic.startNotifications();
    },
    stop() {
      const c = characteristic;
      cleanup();
      c?.stopNotifications().catch(() => undefined);
      if (device?.gatt?.connected) device.gatt.disconnect();
    }
  };
}
