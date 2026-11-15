// Dates lisibles, en français.

const MINUTE = 60_000;

function clock(at: number): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(at);
}

function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** « à l'instant », « il y a 12 min », « aujourd'hui à 09:30 », « hier à 21:15 », « le 3 novembre à 08:00 ». */
export function formatSince(at: number, now = Date.now()): string {
  const diff = now - at;
  if (diff < MINUTE) return "à l'instant";
  if (diff < 60 * MINUTE) return `il y a ${Math.floor(diff / MINUTE)} min`;
  const today = dayStart(now);
  if (at >= today) return `aujourd'hui à ${clock(at)}`;
  const yesterday = dayStart(today - 1);
  if (at >= yesterday) return `hier à ${clock(at)}`;
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(at);
  return `le ${date} à ${clock(at)}`;
}
