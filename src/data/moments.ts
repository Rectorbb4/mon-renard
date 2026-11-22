// Range avec chaque moment le pouls gardé par l'appli Android autour de lui (MomentCapture.java).

import type { RenardDB } from './db';
import type { MomentCapture } from './types';

const SPAN_MS = 10_000;
/** Marge : une mesure reçue juste à la limite de la fenêtre reste valable. */
const SLACK_MS = 2_000;
const MAX_POINTS = 120;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function cleanPoints(raw: unknown, min: number, max: number): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) continue;
    if (Math.abs(p[0]) > SPAN_MS + SLACK_MS || p[1] < min || p[1] > max) continue;
    out.push([p[0], p[1]]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, MAX_POINTS);
}

/** Vérifie une capture (fichier de l'appli ou sauvegarde). null si elle est inutilisable. */
export function cleanCapture(raw: unknown): MomentCapture | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!isNum(o.start) || o.start <= 0) return null;
  const hr = cleanPoints(o.hr, 30, 230);
  const rr = cleanPoints(o.rr, 250, 2500);
  const named = o.source ?? o.src;
  const source = named === 'ceinture' || named === 'bague' ? named : null;
  return { start: o.start, source: hr.length ? source : null, hr, rr };
}

export function parseMomentLine(line: string): { at: number; capture: MomentCapture } | null {
  try {
    const o = JSON.parse(line);
    const capture = cleanCapture(o);
    return capture && isNum(o.at) && o.at > 0 ? { at: o.at, capture } : null;
  } catch {
    return null;
  }
}

/**
 * Pose chaque capture sur son moment. Un moment effacé entre-temps (« c'est une erreur ») n'existe plus :
 * sa capture part avec lui. Ranger deux fois la même ligne ne change rien.
 */
export async function ingestMoments(db: RenardDB, profileId: number, text: string): Promise<number> {
  let saved = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const m = parseMomentLine(line);
    if (!m) continue;
    saved += await db.events.where('[profileId+at]').equals([profileId, m.at]).modify({ capture: m.capture });
  }
  return saved;
}
