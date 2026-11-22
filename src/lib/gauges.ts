// Les jauges du renard, façon animal de compagnie : humeur et énergie d'après les check-ins.
// La nuit vient du check-in, sinon de la nuit ajustée à ton vrai réveil, jamais de la nuit brute de la bague.
// Données pures (pas d'interface) : utilisées par l'accueil et par le widget Android.

import { startOfDay } from '../data/checkins';
import type { CheckIn } from '../data/types';
import { MOODS, moodFromScore } from '../fox/moods';
import { formatDuration } from './healthDays';
import { energyLabel, sleepLabel } from './labels';
import type { OwnNight } from './ownNight';

/** Au-delà, les jauges sont pâlies : elles parlent d'un check-in déjà ancien. */
export const STALE_AFTER = 12 * 3600_000;

export interface GaugeValues {
  /** De -1 (creux) à 1 (emballement) ; l'équilibre est au milieu. */
  mood: number;
  moodWord: string;
  /** De 0 à 1. */
  energy: number;
  energyWord: string;
  /** Nuit de ce matin, de 0 à 1, ou null si on ne sait rien d'elle. */
  sleep: number | null;
  sleepWord: string;
  /** Rempli quand la nuit vient de ton réveil repéré et pas d'un check-in. */
  sleepNote: string | null;
  /** Le dernier check-in date de plus de 12 h. */
  stale: boolean;
}

const hourFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function gaugeValues(
  last: CheckIn | null,
  lastSleep: CheckIn | null,
  now = Date.now(),
  own: OwnNight | null = null
): GaugeValues | null {
  if (!last) return null;
  const today = startOfDay(now);
  const sleepToday = lastSleep?.sleep != null && lastSleep.at >= today ? lastSleep.sleep : null;
  // Ce que tu as noté passe toujours avant la mesure
  const measured = sleepToday == null && own && own.at >= today ? own : null;
  return {
    mood: last.mood,
    moodWord: MOODS[moodFromScore(last.mood)].label,
    energy: last.energy,
    energyWord: energyLabel(last.energy),
    sleep: measured ? measured.fill : sleepToday,
    sleepWord: measured ? formatDuration(measured.asleep) : sleepToday == null ? 'Pas notée' : sleepLabel(sleepToday),
    sleepNote: measured ? `Ta nuit s'arrête à ton réveil de ${hourFormat.format(measured.at)}. Ton check-in la remplace.` : null,
    stale: now - last.at > STALE_AFTER
  };
}

/**
 * Remplissage de la jauge d'humeur, centrée sur l'équilibre : la barre part du milieu,
 * vers la gauche quand l'humeur baisse, vers la droite quand elle monte. En pourcentages de la largeur.
 */
export function moodFill(mood: number): { from: number; width: number; side: 'low' | 'high' } {
  const m = Math.max(-1, Math.min(1, Number.isFinite(mood) ? mood : 0));
  const width = Math.round(Math.abs(m) * 50 * 10) / 10;
  return m < 0 ? { from: 50 - width, width, side: 'low' } : { from: 50, width, side: 'high' };
}
