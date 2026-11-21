// Le soir du 21 novembre 2026, l'appli 1.7 a lancé des pauses toutes seules : chacune a noté un moment
// « je le sens ». Ils sont retirés une fois pour toutes à l'ouverture de l'appli. Une copie reste sur
// le téléphone, au cas où un vrai moment serait parti avec.

import type { RenardDB } from '../data/db';
import { deleteFeltEvents, feltEventsBetween } from '../data/events';
import type { FeltEvent } from '../data/types';

/** Mise en ligne de la 1.7. */
export const FALSE_PAUSE_FROM = new Date(2026, 10, 21, 21, 0).getTime();
/** Fin de la soirée : ce qui est noté ensuite n'est jamais touché. */
export const FALSE_PAUSE_TO = new Date(2026, 10, 22, 6, 0).getTime();
/** Première appli corrigée (1.8). */
const FIXED_VERSION = 9;

const FIXED_KEY = 'mon-renard:geste-corrige';
const DONE_KEY = 'mon-renard:fausses-pauses-fini';
const COPY_KEY = 'mon-renard:fausses-pauses-copie';

/** Les moments de la période, sauf ceux où tu as écrit une note : ceux-là sont forcément voulus. */
export function falsePauses(events: FeltEvent[], until: number): FeltEvent[] {
  return events.filter((e) => e.id != null && !e.note && e.at >= FALSE_PAUSE_FROM && e.at <= until);
}

/**
 * Efface les fausses pauses et renvoie leur nombre. Tant que l'appli n'est pas corrigée, de nouvelles
 * peuvent arriver : on repasse à chaque ouverture, puis plus jamais dès que la 1.8 est là.
 * Sans copie possible, on n'efface rien.
 */
export async function eraseFalsePauses(
  db: RenardDB,
  profileId: number,
  versionCode: number | null,
  now = Date.now()
): Promise<number> {
  if (versionCode == null) return 0;
  try {
    if (localStorage.getItem(DONE_KEY)) return 0;
    const fixed = versionCode >= FIXED_VERSION;
    if (fixed && !localStorage.getItem(FIXED_KEY)) localStorage.setItem(FIXED_KEY, String(now));
    const fixedAt = Number(localStorage.getItem(FIXED_KEY));
    const until = Math.min(fixedAt > 0 ? fixedAt : now, now, FALSE_PAUSE_TO);

    const found = falsePauses(await feltEventsBetween(db, profileId, FALSE_PAUSE_FROM, until), until);
    if (found.length) {
      const copy: FeltEvent[] = JSON.parse(localStorage.getItem(COPY_KEY) ?? '[]');
      localStorage.setItem(COPY_KEY, JSON.stringify([...copy, ...found]));
      await deleteFeltEvents(db, found.map((e) => e.id!));
    }
    if (fixed || now >= FALSE_PAUSE_TO) localStorage.setItem(DONE_KEY, '1');
    return found.length;
  } catch (e) {
    console.error(e);
    return 0;
  }
}
