// Le carnet : une piste découverte y reste, datée du jour où elle est apparue.

import type { FoundClue } from '../lib/clues';
import type { RenardDB } from './db';
import type { Clue } from './types';

/** Ajoute les nouvelles pistes et renvoie tout le carnet, de la plus récente à la plus ancienne. */
export async function keepClues(db: RenardDB, found: FoundClue[], now = Date.now()): Promise<Clue[]> {
  return db.transaction('rw', db.clues, async () => {
    const have = new Set(await db.clues.toCollection().primaryKeys());
    const fresh = found.filter((c) => !have.has(c.id)).map((c) => ({ ...c, at: now }));
    if (fresh.length) await db.clues.bulkPut(fresh);
    return (await db.clues.toArray()).sort((a, b) => b.at - a.at);
  });
}
