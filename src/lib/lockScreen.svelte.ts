// La pause peut s'afficher sur un téléphone verrouillé. Seule la pause : ton journal reste protégé.

import { lockBridge } from './android';

/** Le temps que l'appli passe derrière le verrouillage, sans laisser voir la page. */
const LEAVE_MS = 400;

export const lockScreen = $state({
  /** La page est visible alors que le téléphone est encore verrouillé. */
  over: false,
  /** La respiration a été demandée depuis la pause : l'appli reste affichée. */
  breathing: false,
  /** Le panneau de respiration est ouvert : lui seul peut apparaître. */
  breathShown: false
});

export function refreshLock(): void {
  try {
    lockScreen.over = lockBridge()?.isOverLock() ?? false;
  } catch {
    lockScreen.over = false;
  }
  if (!lockScreen.over) {
    lockScreen.breathing = false;
    lockScreen.breathShown = false;
  }
}

/** La pause est finie : l'appli repasse derrière l'écran de verrouillage. */
export function leaveLock(): void {
  lockScreen.breathing = false;
  lockScreen.breathShown = false;
  try {
    lockBridge()?.leaveLock();
  } catch {
    /* appli trop ancienne */
  }
  // La page reste masquée le temps de passer derrière le verrouillage
  setTimeout(refreshLock, LEAVE_MS);
}
