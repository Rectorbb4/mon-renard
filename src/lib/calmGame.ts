// La respiration vivante : ton vrai pouls détend le renard. Il n'y a pas d'échec possible :
// la séance avance de toute façon, et un cœur qui ralentit l'endort simplement plus vite.

export interface PulseReading {
  at: number;
  bpm: number;
}

/** Une baisse de 6 bpm suffit pour que le renard s'endorme. */
export const CALM_TARGET_BPM = 6;
const START_WINDOW = 20_000;
const RECENT_WINDOW = 15_000;
/** Sans capteur ou sans baisse, le temps seul l'amène jusqu'à la somnolence. */
const TIME_SHARE = 0.6;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Le pouls au début de la séance, sur les 20 premières secondes. */
export function startPulse(readings: PulseReading[], startedAt: number): number | null {
  const v = readings.filter((r) => r.at >= startedAt && r.at < startedAt + START_WINDOW).map((r) => r.bpm);
  return v.length >= 3 ? median(v) : null;
}

export function recentPulse(readings: PulseReading[], now: number, windowMs = RECENT_WINDOW): number | null {
  const v = readings.filter((r) => r.at > now - windowMs && r.at <= now).map((r) => r.bpm);
  return v.length >= 2 ? median(v) : null;
}

/** De 0 (éveillé) à 1 (endormi). `share` : la part de la séance déjà passée. */
export function calmLevel(readings: PulseReading[], startedAt: number, now: number, share: number): number {
  const byTime = Math.max(0, Math.min(1, share)) * TIME_SHARE;
  // Avant la fin de la fenêtre de départ, comparer n'aurait pas de sens
  if (now < startedAt + START_WINDOW) return byTime;
  const from = startPulse(readings, startedAt);
  const to = recentPulse(readings, now);
  if (from == null || to == null) return byTime;
  return Math.max(byTime, Math.min(1, (from - to) / CALM_TARGET_BPM));
}

export interface CalmSummary {
  from: number;
  to: number;
}

export function calmSummary(readings: PulseReading[], startedAt: number, endedAt: number): CalmSummary | null {
  const from = startPulse(readings, startedAt);
  const to = recentPulse(readings, endedAt, START_WINDOW);
  // Une séance trop courte pour que le début et la fin soient deux moments différents
  if (from == null || to == null || endedAt - startedAt < START_WINDOW * 2) return null;
  return { from: Math.round(from), to: Math.round(to) };
}

export function calmSentence(s: CalmSummary): string {
  if (s.to <= s.from - 2) return `Ton pouls est passé de ${s.from} à ${s.to} pendant la séance.`;
  if (s.to >= s.from + 2) return `Ton pouls était à ${s.from} au début et à ${s.to} à la fin. Il ne descend pas à chaque fois, et c’est normal.`;
  return `Ton pouls est resté autour de ${s.to}.`;
}

export function calmWord(level: number): string {
  if (level < 0.3) return 'Ton renard respire avec toi';
  if (level < 0.6) return 'Ses paupières s’alourdissent';
  if (level < 0.9) return 'La lanterne s’allume doucement';
  return 'Il s’est endormi contre toi';
}
