// Les jauges du renard, façon animal de compagnie : humeur, énergie et nuit, d'après les check-ins.
// Données pures (pas d'interface) : utilisées par l'accueil et par le widget Android.

import { startOfDay } from '../data/checkins';
import type { CheckIn } from '../data/types';
import { MOODS, moodFromScore } from '../fox/moods';
import { energyLabel, sleepLabel } from './labels';

/** Au-delà, les jauges sont pâlies : elles parlent d'un check-in déjà ancien. */
export const STALE_AFTER = 12 * 3600_000;

export interface GaugeValues {
  /** De -1 (creux) à 1 (emballement) ; l'équilibre est au milieu. */
  mood: number;
  moodWord: string;
  /** De 0 à 1. */
  energy: number;
  energyWord: string;
  /** Nuit notée aujourd'hui, de 0 à 1, ou null si pas encore notée. */
  sleep: number | null;
  sleepWord: string;
  /** Le dernier check-in date de plus de 12 h. */
  stale: boolean;
}

export function gaugeValues(last: CheckIn | null, lastSleep: CheckIn | null, now = Date.now()): GaugeValues | null {
  if (!last) return null;
  const sleepToday = lastSleep?.sleep != null && lastSleep.at >= startOfDay(now) ? lastSleep.sleep : null;
  return {
    mood: last.mood,
    moodWord: MOODS[moodFromScore(last.mood)].label,
    energy: last.energy,
    energyWord: energyLabel(last.energy),
    sleep: sleepToday,
    sleepWord: sleepToday == null ? 'Pas notée' : sleepLabel(sleepToday),
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
