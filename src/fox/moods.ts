// Les cinq humeurs du renard : ce qu'on voit (ciel, lumière, météo) et comment il se comporte.
// Données pures, sans three.js, pour pouvoir les tester et les réutiliser ailleurs (check-in, historique).

export const MOOD_IDS = ['creux', 'grisaille', 'equilibre', 'elan', 'emballement'] as const;
export type MoodId = (typeof MOOD_IDS)[number];

export type Weather = 'none' | 'rain' | 'pollen' | 'wind';
export type Posture = 'sit' | 'stand';

/** Un geste joué de temps en temps par-dessus l'animation de fond. */
export interface Gesture {
  clip: string;
  /** Nombre de répétitions (les courses sur place sont très courtes). */
  repeat?: number;
  /** Vitesse de lecture propre au geste. */
  speed?: number;
}

export interface Mood {
  id: MoodId;
  label: string;
  /** Une phrase pour dire ce que traverse le renard, sans jugement. */
  caption: string;

  // --- Ce qu'on voit ---
  sky: { top: string; bottom: string };
  ground: string;
  /** Lumière principale (soleil ou lune). */
  sun: { color: string; intensity: number; height: number };
  ambient: { sky: string; ground: string; intensity: number };
  /** Halo dans le ciel (soleil, lune, ou rien). */
  glow: { color: string; opacity: number };
  exposure: number;
  fog: number;
  weather: Weather;
  /** Intensité de la météo, de 0 à 1. */
  weatherAmount: number;

  // --- Comment il se comporte ---
  posture: Posture;
  base: string;
  speed: number;
  /** Gestes spontanés et intervalle (en secondes) entre deux gestes. */
  gestures: Gesture[];
  gestureEvery: [number, number];
  /** Réaction quand on le touche. */
  reaction: Gesture;
  /** Tête baissée (radians, positif = vers le bas). */
  headDown: number;
  /** Oreilles couchées, de 0 (dressées) à 1 (rabattues). */
  earsDown: number;
  /** Paupières tombantes, de 0 (grands ouverts) à 1 (mi-clos). */
  lids: number;
  blinkEvery: [number, number];
  /** Amplitude et rythme de la respiration (1 = calme). */
  breath: { depth: number; rate: number };
  /** Agitation : petits tremblements et regards rapides, de 0 à 1. */
  restless: number;
}

export const MOODS: Record<MoodId, Mood> = {
  creux: {
    id: 'creux',
    label: 'Creux',
    caption: "Il pleut dans sa tête. Il reste là, tout doucement.",
    sky: { top: '#141c33', bottom: '#3a4766' },
    ground: '#2c3a46',
    sun: { color: '#9fb3e8', intensity: 0.9, height: 0.7 },
    ambient: { sky: '#6a7ca6', ground: '#242c38', intensity: 0.95 },
    glow: { color: '#c9d6ff', opacity: 0.35 },
    exposure: 0.95,
    fog: 0.09,
    weather: 'rain',
    weatherAmount: 1,
    posture: 'sit',
    base: 'Fox_Sit2_Idle',
    speed: 0.45,
    gestures: [],
    gestureEvery: [999, 999],
    reaction: { clip: 'Fox_Sit_Idle_Break', speed: 0.5 },
    headDown: 0.32,
    earsDown: 1,
    lids: 0.85,
    blinkEvery: [5, 9],
    breath: { depth: 0.7, rate: 0.6 },
    restless: 0
  },
  grisaille: {
    id: 'grisaille',
    label: 'Grisaille',
    caption: 'Le ciel est bas. Il attend que ça passe.',
    sky: { top: '#7d8894', bottom: '#c3c9cd' },
    ground: '#7d927f',
    sun: { color: '#e6ebf0', intensity: 1.1, height: 1.2 },
    ambient: { sky: '#c8d0d8', ground: '#55605a', intensity: 0.9 },
    glow: { color: '#ffffff', opacity: 0.08 },
    exposure: 0.95,
    fog: 0.07,
    weather: 'rain',
    weatherAmount: 0.25,
    posture: 'sit',
    base: 'Fox_Sit2_Idle',
    speed: 0.7,
    gestures: [{ clip: 'Fox_Sit_Idle_Break', speed: 0.7 }],
    gestureEvery: [16, 26],
    reaction: { clip: 'Fox_Sit_Yes', speed: 0.7 },
    headDown: 0.14,
    earsDown: 0.5,
    lids: 0.45,
    blinkEvery: [3.5, 7],
    breath: { depth: 0.85, rate: 0.8 },
    restless: 0
  },
  equilibre: {
    id: 'equilibre',
    label: 'Équilibre',
    caption: 'Il fait doux. Il regarde le monde tranquillement.',
    sky: { top: '#86c3e6', bottom: '#f7e3cb' },
    ground: '#8fc276',
    sun: { color: '#fff1da', intensity: 2.2, height: 1.6 },
    ambient: { sky: '#dbeeff', ground: '#6f7f55', intensity: 1.1 },
    glow: { color: '#fff4d6', opacity: 0.55 },
    exposure: 1,
    fog: 0.035,
    weather: 'none',
    weatherAmount: 0,
    posture: 'sit',
    base: 'Fox_Sit2_Idle',
    speed: 1,
    gestures: [{ clip: 'Fox_Sit_Idle_Break' }],
    gestureEvery: [7, 13],
    reaction: { clip: 'Fox_Sit_Yes' },
    headDown: 0,
    earsDown: 0,
    lids: 0,
    blinkEvery: [2.5, 5.5],
    breath: { depth: 1, rate: 1 },
    restless: 0
  },
  elan: {
    id: 'elan',
    label: 'Élan',
    caption: "Plein d'énergie, il a envie de bouger.",
    sky: { top: '#4aa8ec', bottom: '#ffe39a' },
    ground: '#9fd15c',
    sun: { color: '#ffe7b0', intensity: 2.7, height: 1.9 },
    ambient: { sky: '#e6f4ff', ground: '#7a8a40', intensity: 1.2 },
    glow: { color: '#fff0b8', opacity: 0.8 },
    exposure: 1.08,
    fog: 0.025,
    weather: 'pollen',
    weatherAmount: 0.7,
    posture: 'stand',
    base: 'Fox_Idle',
    speed: 1.1,
    gestures: [
      { clip: 'Fox_Jump_Pivot_InPlace' },
      { clip: 'Fox_Walk_Left_InPlace', repeat: 2 },
      { clip: 'Fox_Walk_Right_InPlace', repeat: 2 }
    ],
    gestureEvery: [5, 10],
    reaction: { clip: 'Fox_Jump_Pivot_InPlace' },
    headDown: -0.08,
    earsDown: 0,
    lids: 0,
    blinkEvery: [3, 6],
    breath: { depth: 1.1, rate: 1.25 },
    restless: 0.15
  },
  emballement: {
    id: 'emballement',
    label: 'Emballement',
    caption: 'Tout va trop vite. Il ne tient plus en place.',
    sky: { top: '#5b1f4f', bottom: '#ff8a55' },
    ground: '#7a5844',
    sun: { color: '#ffb27a', intensity: 2.6, height: 0.9 },
    ambient: { sky: '#ffb0a0', ground: '#4a2a2a', intensity: 1 },
    glow: { color: '#ffb36b', opacity: 0.9 },
    exposure: 1.1,
    fog: 0.045,
    weather: 'wind',
    weatherAmount: 1,
    posture: 'stand',
    base: 'Fox_Idle',
    speed: 1.7,
    gestures: [
      { clip: 'Fox_Run_InPlace', repeat: 6, speed: 1.1 },
      { clip: 'Fox_Run_Left_InPlace', repeat: 4 },
      { clip: 'Fox_Run_Right_InPlace', repeat: 4 },
      { clip: 'Fox_Jump_Pivot_InPlace', speed: 1.3 },
      { clip: 'Fox_Somersault_InPlace' }
    ],
    gestureEvery: [0.8, 2.5],
    reaction: { clip: 'Fox_Somersault_InPlace', speed: 1.2 },
    headDown: -0.12,
    earsDown: 0.25,
    lids: 0,
    blinkEvery: [1.2, 3],
    breath: { depth: 1.3, rate: 2.4 },
    restless: 1
  }
};

/**
 * Convertit une valeur d'humeur entre -1 (au plus bas) et +1 (au plus haut) en état du renard.
 * L'équilibre occupe la zone centrale, un peu plus large que les autres.
 */
export function moodFromScore(score: number): MoodId {
  const s = Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0;
  if (s <= -0.6) return 'creux';
  if (s <= -0.25) return 'grisaille';
  if (s < 0.25) return 'equilibre';
  if (s < 0.6) return 'elan';
  return 'emballement';
}

/** Durée aléatoire dans un intervalle [min, max] ; `random` est injectable pour les tests. */
export function randomBetween([min, max]: [number, number], random: () => number = Math.random): number {
  return min + (max - min) * random();
}

export function isMoodId(value: unknown): value is MoodId {
  return typeof value === 'string' && (MOOD_IDS as readonly string[]).includes(value);
}

/** Tous les noms d'animations utilisés, pour vérifier qu'ils existent dans le modèle. */
export function clipsUsed(): string[] {
  const names = new Set<string>(['Fox_Sit1', 'Fox_Sit3_StandUp']);
  for (const m of Object.values(MOODS)) {
    names.add(m.base);
    names.add(m.reaction.clip);
    m.gestures.forEach((g) => names.add(g.clip));
  }
  return [...names];
}
