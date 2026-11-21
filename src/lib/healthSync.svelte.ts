// Fait passer les relevés de l'appli Android (bague, ceinture) dans la base de la page.

import { getDB } from '../data/db';
import { ingestLines } from '../data/health';
import type { RenardAndroid } from './android';

const KEY = 'mon-renard:releve-bague';

interface Saved {
  lastAt: number | null;
  battery: number | null;
  charging: boolean;
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') {
      return {
        lastAt: typeof v.lastAt === 'number' ? v.lastAt : null,
        battery: typeof v.battery === 'number' ? v.battery : null,
        charging: v.charging === true
      };
    }
  } catch {
    /* stockage indisponible */
  }
  return { lastAt: null, battery: null, charging: false };
}

export const ringSync = $state({
  ...load(),
  running: false,
  done: 0,
  total: 0,
  error: null as string | null,
  /** Augmente quand de nouvelles mesures sont rangées : l'écran Suivi se recharge. */
  revision: 0
});

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lastAt: ringSync.lastAt, battery: ringSync.battery, charging: ringSync.charging }));
  } catch {
    /* stockage indisponible */
  }
}

const bridge = () => (typeof window !== 'undefined' ? ((window as unknown as { RenardAndroid?: RenardAndroid }).RenardAndroid ?? null) : null);

let pulling = false;

/** Range tout ce que l'appli Android a gardé. */
export async function pullReadings(): Promise<void> {
  const b = bridge();
  if (pulling || typeof b?.ringSyncRead !== 'function') return;
  pulling = true;
  try {
    for (let i = 0; i < 40; i++) {
      const text = b.ringSyncRead();
      if (!text) break;
      const r = await ingestLines(getDB(), text);
      if (r.battery) {
        ringSync.battery = r.battery.level;
        ringSync.charging = r.battery.charging;
        ringSync.lastAt = r.battery.at;
        save();
      }
      // Effacé seulement une fois rangé dans la base
      b.ringSyncAck?.(text.length);
      if (r.samples || r.nights) ringSync.revision++;
    }
    ringSync.error = null;
  } catch (e) {
    console.error(e);
    ringSync.error = "Les relevés n'ont pas pu être rangés. Ils restent sur le téléphone : réessaie.";
  } finally {
    pulling = false;
  }
}

/** Demande un relevé tout de suite. Faux si la bague n'est pas connectée. */
export function syncNow(): boolean {
  const ok = bridge()?.ringSync?.() ?? false;
  ringSync.error = ok ? null : "La bague n'est pas connectée : branche-la dans « En direct », sur l'accueil.";
  return ok;
}

export function canSyncRing(): boolean {
  return typeof bridge()?.ringSync === 'function';
}

let started = false;

/** À l'ouverture de l'appli : range ce qui attend, puis suit les relevés de la bague. */
export function startHealthSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void pullReadings();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pullReadings();
  });
  window.addEventListener('renard-ble', (e) => {
    const d = (e as CustomEvent).detail ?? {};
    if (d.kind !== 'bague' || d.type !== 'sync') return;
    ringSync.running = d.state === 'running';
    ringSync.done = typeof d.done === 'number' ? d.done : 0;
    ringSync.total = typeof d.total === 'number' ? d.total : 0;
    if (d.state === 'done') {
      ringSync.lastAt = Date.now();
      save();
    }
    if (d.state === 'done' || d.state === 'stopped') void pullReadings();
  });
}
