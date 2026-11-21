// Le soir du 21 novembre 2026, l'appli 1.7 a pu lancer des pauses toutes seules : chacune a noté un moment
// « je le sens ». Rien ne les distingue d'un vrai moment, alors c'est toi qui choisis ce qui part.

import type { FeltEvent } from '../data/types';

/** Mise en ligne de la 1.7. */
export const FALSE_PAUSE_FROM = new Date(2026, 10, 21, 21, 0).getTime();
/** Après cette date, le nettoyage n'est plus proposé. */
export const FALSE_PAUSE_OFFER_ENDS = new Date(2026, 11, 5).getTime();
const FIXED_KEY = 'mon-renard:geste-corrige';

/** Les moments de la période, sauf ceux où tu as écrit une note : ceux-là sont forcément voulus. */
export function falsePauses(events: FeltEvent[], until: number): FeltEvent[] {
  return events.filter((e) => e.id != null && !e.note && e.at >= FALSE_PAUSE_FROM && e.at <= until);
}

/** Retient la première ouverture avec l'appli corrigée (1.8, code 9) : plus aucune fausse pause après. */
export function rememberGestureFix(versionCode: number | null, now = Date.now()): void {
  if (versionCode == null || versionCode < 9) return;
  try {
    if (!localStorage.getItem(FIXED_KEY)) localStorage.setItem(FIXED_KEY, String(now));
  } catch {
    /* stockage indisponible */
  }
}

/** Jusqu'où chercher : l'arrivée de la 1.8 ou, si elle n'est pas encore installée, maintenant. */
export function falsePauseEnd(now = Date.now()): number {
  try {
    const saved = Number(localStorage.getItem(FIXED_KEY));
    if (saved > 0) return saved;
  } catch {
    /* stockage indisponible */
  }
  return now;
}
