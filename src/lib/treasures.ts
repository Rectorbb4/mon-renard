// Les trésors du terrier : un nouvel objet toutes les trois noisettes, à sa place pour toujours.
// Chaque objet est dessiné autour de son point d'accroche (0, 0) : posé dessus, ou suspendu dessous.

export const NUTS_PER_TREASURE = 3;

export interface Treasure {
  id: string;
  name: string;
  x: number;
  y: number;
  /** [couleur, tracé] */
  shapes: [string, string][];
}

const ROPE = '#c9a77c';
const METAL = '#8a6a45';
const LIGHT = '#ffd76e';
const CREAM = '#f4e2c4';
const RED = '#d9593f';
const WOOD = '#9a6236';
const DARK = '#6b4226';
const LEAF = '#7fae5a';
const GOLD = '#e9b949';
const BLUE = '#7fb2d6';
const PINK = '#e59ab0';
const VIOLET = '#a98bd6';
const STONE = '#a9a39a';

const cord = (h: number) => `M-.6 0h1.2v${h}h-1.2z`;

export const TREASURES: Treasure[] = [
  { id: 'lanterne', name: 'Une lanterne', x: 170, y: 62, shapes: [[ROPE, cord(12)], [METAL, 'M-6 15h12l-2-3h-8z'], [LIGHT, 'M-5 15h10l-1 11h-8z'], [METAL, 'M-6 26h12v2h-12z']] },
  { id: 'champignon', name: 'Un champignon', x: 78, y: 173, shapes: [[CREAM, 'M-3 0h6l-1-9h-4z'], [RED, 'M-10-8a10 9 0 0 1 20 0z'], [CREAM, 'M-5-12a1.6 1.6 0 1 0 .1 0zM3-13a1.4 1.4 0 1 0 .1 0z']] },
  { id: 'coussin', name: 'Un coussin', x: 124, y: 183, shapes: [[PINK, 'M-13 0C-16-5-15-10-11-11-5-13 5-13 11-11 15-10 16-5 13 0Z'], [CREAM, 'M-9-6h18v1.4h-18z']] },
  { id: 'feuille', name: 'Une feuille rare', x: 40, y: 128, shapes: [[GOLD, 'M-8 0C-9-9-3-15 8-17 9-7 4-1-8 0Z'], [METAL, 'M-8 0L5-13l.8.7L-7 .8z']] },
  { id: 'gland', name: 'Un gland', x: 216, y: 183, shapes: [[WOOD, 'M-6-9h12C6-4 3-1 0 0-3-1-6-4-6-9Z'], [DARK, 'M-7-9a7 5 0 0 1 14 0z'], [DARK, 'M-.7-16h1.4v3h-1.4z']] },
  { id: 'etoile', name: 'Une étoile en papier', x: 140, y: 63, shapes: [[ROPE, cord(11)], [GOLD, 'M0 11l2.6 5.6 6 .7-4.5 4.1 1.2 6L0 24.4l-5.3 3 1.2-6-4.5-4.1 6-.7z']] },
  { id: 'pomme-de-pin', name: 'Une pomme de pin', x: 266, y: 171, shapes: [[DARK, 'M0 0C-8-2-9-10-5-15-2-19 2-19 5-15 9-10 8-2 0 0Z'], [WOOD, 'M-5-11l5 3 5-3v2l-5 3-5-3zM-5-6l5 3 5-3v2l-5 3-5-3z']] },
  { id: 'plume', name: 'Une plume', x: 300, y: 128, shapes: [[BLUE, 'M-6-1C-9-9-3-18 7-20 8-11 4-3-6-1Z'], [CREAM, 'M-7 1L4-14l.8.6L-6 1.6z']] },
  { id: 'miel', name: 'Un pot de miel', x: 106, y: 179, shapes: [[GOLD, 'M-7 0C-10-5-9-11-6-13H6C9-11 10-5 7 0Z'], [CREAM, 'M-7-16h14v3h-14z'], [DARK, 'M-3-7h6v3h-6z']] },
  { id: 'lune', name: 'Une lune', x: 200, y: 63, shapes: [[ROPE, cord(10)], [CREAM, 'M3 10A9 9 0 1 0 9 24 8 8 0 0 1 3 10Z']] },
  { id: 'baies', name: 'Des baies', x: 68, y: 128, shapes: [[RED, 'M-5-3a3.6 3.6 0 1 0 .1 0zM4-3a3.6 3.6 0 1 0 .1 0zM0-9a3.6 3.6 0 1 0 .1 0z'], [LEAF, 'M0-9C2-14 6-15 9-14 8-10 4-8 0-9Z']] },
  { id: 'caillou', name: 'Un caillou tout rond', x: 238, y: 179, shapes: [[STONE, 'M-10 0C-12-6-6-11 0-11 7-11 12-6 10 0Z'], [CREAM, 'M-5-7a3 1.6 0 1 0 .1 0z']] },
  { id: 'livre', name: 'Un petit livre', x: 96, y: 128, shapes: [[VIOLET, 'M-10 0v-13h20v13z'], [CREAM, 'M-8-2v-9h16v9z'], [DARK, 'M-.6-13h1.2V0h-1.2z']] },
  { id: 'clochette', name: 'Une clochette', x: 110, y: 68, shapes: [[ROPE, cord(9)], [GOLD, 'M0 9C-5 9-6 14-6 18L-8 21H8L6 18C6 14 5 9 0 9Z'], [METAL, 'M-2 21h4a2 2 0 0 1-4 0z']] },
  { id: 'coquillage', name: 'Un coquillage', x: 48, y: 161, shapes: [[PINK, 'M0 0C-9-1-11-9-7-13-3-16 3-16 7-13 11-9 9-1 0 0Z'], [CREAM, 'M-.5-1l-5-11 1-.5L0-3l4.5-9.5 1 .5-5 11z']] },
  { id: 'tasse', name: 'Une tasse', x: 244, y: 128, shapes: [[BLUE, 'M-7-12H6V-3C6-1 4 0 3 0H-4C-6 0-7-1-7-3Z'], [BLUE, 'M6-10c5 0 5 7 0 7v-2c2 0 2-3 0-3z'], [CREAM, 'M-6-12H5v2H-6z']] },
  { id: 'cristal', name: 'Un cristal', x: 272, y: 128, shapes: [[VIOLET, 'M-7 0l-2-9 6-8h6l6 8-2 9z'], [CREAM, 'M-3-17l-1 8 4 9-2-9 2-8z']] },
  { id: 'mobile', name: 'Un mobile de plumes', x: 230, y: 67, shapes: [[ROPE, cord(8)], [WOOD, 'M-11 8h22v1.6h-22z'], [BLUE, 'M-9 10c-3 4-2 9 1 11 2-4 2-8-1-11z'], [PINK, 'M9 10c-3 4-2 9 1 11 2-4 2-8-1-11z'], [GOLD, 'M0 10c-3 5-2 11 1 14 2-5 2-10-1-14z']] },
  { id: 'tas-feuilles', name: 'Un tas de feuilles', x: 294, y: 160, shapes: [[RED, 'M-13 0C-11-6-6-8-2-7-5-4-7-2-8 0Z'], [GOLD, 'M-7 0C-5-9 3-11 8-8 4-6 1-3 0 0Z'], [LEAF, 'M0 0C2-6 8-8 13-5 10-2 7-1 5 0Z']] },
  { id: 'fleur', name: 'Une fleur devant le terrier', x: 60, y: 47, shapes: [[LEAF, 'M-.7 0v-10h1.4V0z'], [PINK, 'M0-14a3 3 0 1 0 .1 0zM-4-11a3 3 0 1 0 .1 0zM4-11a3 3 0 1 0 .1 0zM-2-7a3 3 0 1 0 .1 0zM2-7a3 3 0 1 0 .1 0z'], [GOLD, 'M0-11a2 2 0 1 0 .1 0z']] },
  { id: 'carte', name: 'Une carte aux trésors', x: 52, y: 102, shapes: [[CREAM, 'M-10 0l2-13 18 1-2 13z'], [RED, 'M2-8l3 3m0-3l-3 3'], [METAL, 'M-6-3h6v1h-6zM-5-7h4v1h-4z']] },
  { id: 'sablier', name: 'Un sablier', x: 84, y: 102, shapes: [[WOOD, 'M-6-16h12v2h-12zM-6-2h12V0h-12z'], [BLUE, 'M-4-14H4C4-11 1-9 1-8 1-7 4-5 4-2H-4C-4-5-1-7-1-8-1-9-4-11-4-14Z'], [GOLD, 'M-3-3h6L0-7z']] },
  { id: 'guitare', name: 'Une petite guitare', x: 256, y: 102, shapes: [[WOOD, 'M-3 0C-8 0-8-6-4-7-6-10-3-13 0-12 3-13 6-10 4-7 8-6 8 0 3 0Z'], [DARK, 'M-1-20h2v10h-2z'], [DARK, 'M0-5a2 2 0 1 0 .1 0z']] },
  { id: 'couronne', name: 'Une couronne de feuilles', x: 288, y: 102, shapes: [[LEAF, 'M-9-1C-12-7-8-14 0-14 8-14 12-7 9-1L6-3C8-7 5-11 0-11-5-11-8-7-6-3Z'], [RED, 'M-1-15a2 2 0 1 0 .1 0z'], [GOLD, 'M8-9a1.6 1.6 0 1 0 .1 0zM-8-9a1.6 1.6 0 1 0 .1 0z']] }
];

export interface DenProgress {
  nuts: number;
  unlocked: number;
  /** Noisettes qu'il manque pour le prochain trésor (0 quand ils sont tous là). */
  toNext: number;
  /** Noisettes déjà posées vers le prochain trésor. */
  filled: number;
}

export function denProgress(nuts: number): DenProgress {
  const unlocked = Math.min(TREASURES.length, Math.floor(nuts / NUTS_PER_TREASURE));
  if (unlocked >= TREASURES.length) return { nuts, unlocked, toNext: 0, filled: NUTS_PER_TREASURE };
  const filled = nuts % NUTS_PER_TREASURE;
  return { nuts, unlocked, toNext: NUTS_PER_TREASURE - filled, filled };
}
