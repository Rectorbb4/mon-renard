// Rappel discret de sauvegarde : le journal ne vit que sur le téléphone.

const KEY_LAST = 'mon-renard:derniere-sauvegarde';
const DAY = 24 * 3600_000;
/** En dessous, il n'y a pas encore grand-chose à perdre. */
export const REMIND_FROM_ENTRIES = 15;
export const REMIND_EVERY_DAYS = 30;

export function lastBackupAt(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY_LAST));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markBackup(at: number): void {
  try {
    localStorage.setItem(KEY_LAST, String(at));
  } catch {
    /* stockage indisponible : le rappel reviendra */
  }
}

/** Vrai s'il est temps de proposer une sauvegarde. */
export function backupDue(entries: number, last: number | null, now = Date.now()): boolean {
  if (entries < REMIND_FROM_ENTRIES) return false;
  return last == null || now - last > REMIND_EVERY_DAYS * DAY;
}
