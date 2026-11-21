// Pendant une pause lancée par la bague : ce qu'on peut dire de son état, d'un seul geste.

export const PAUSE_FEELINGS = ['Colère', 'Impulsion', 'Angoisse', 'Agitation', 'Tristesse', 'Fatigue', 'Je ne sais pas'] as const;

export type PauseFeeling = (typeof PAUSE_FEELINGS)[number];

/** La note gardée dans le journal. */
export function pauseNote(feeling: PauseFeeling): string {
  return `Pause : ${feeling.toLowerCase()}`;
}
