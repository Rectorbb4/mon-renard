// Connexion Bluetooth basse consommation (BLE) depuis le navigateur, avec Web Bluetooth.
// Marche dans Chrome sur Android (appli installée depuis Chrome) ; PAS dans la WebView de l'appli Android :
// là, il faudra passer par le Bluetooth natif (Java) et le pont window.RenardAndroid.

import type { Reading, SensorSource, SourceInfo } from '../types';

// Types minimaux de Web Bluetooth (absents de TypeScript)
interface BtCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  stopNotifications(): Promise<BtCharacteristic>;
}
interface BtService {
  getCharacteristic(uuid: number | string): Promise<BtCharacteristic>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: number | string): Promise<BtService>;
}
interface BtDevice extends EventTarget {
  name?: string;
  gatt?: BtServer;
}
interface Bluetooth {
  requestDevice(options: { filters: { services: (number | string)[] }[]; optionalServices?: (number | string)[] }): Promise<BtDevice>;
}

function bluetooth(): Bluetooth | null {
  return typeof navigator !== 'undefined' ? ((navigator as unknown as { bluetooth?: Bluetooth }).bluetooth ?? null) : null;
}

/** Le navigateur sait-il parler aux capteurs Bluetooth ? */
export function hasWebBluetooth(): boolean {
  return bluetooth() != null;
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
      const bt = bluetooth();
      if (!bt) throw new Error("Ce navigateur ne sait pas se connecter aux capteurs Bluetooth.");
      device = await bt.requestDevice({ filters: [{ services: [profile.service] }] });
      if (!device.gatt) throw new Error("Cet appareil ne propose pas de connexion.");
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
        onEnd?.('Le capteur s’est déconnecté.');
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
      device = null;
    }
  };
}
