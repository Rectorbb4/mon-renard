// L'essai des gestes de la bague : on fait chaque geste, on regarde ce qu'elle envoie,
// et on compare. Deux gestes ne sont utilisables séparément que s'ils n'envoient pas le même signal.

export interface RingSignal {
  /** « touche » : comme une télécommande ; « message » : par sa liaison Bluetooth. */
  channel: 'touche' | 'message';
  code: string;
  at: number;
}

export type Trials = Record<string, RingSignal[]>;

export const CONTROL = 'rien';

export const GESTURES = [
  { id: CONTROL, label: 'Ne rien faire', hint: 'Pose la main et ne bouge plus.' },
  { id: 'tap1', label: 'Un tapotement', hint: 'Tapote une fois la bague avec le pouce.' },
  { id: 'tap2', label: 'Deux tapotements', hint: 'Tapote deux fois de suite, vite.' },
  { id: 'tap3', label: 'Trois tapotements', hint: 'Tapote trois fois en 3 secondes, à ton rythme.' },
  { id: 'glisser-bout', label: 'Glisser vers le bout du doigt', hint: 'Fais glisser le pouce sur la bague, vers ton ongle.' },
  { id: 'glisser-main', label: 'Glisser vers la main', hint: 'Fais glisser le pouce sur la bague, vers ta paume.' },
  { id: 'coup', label: 'Coup sec de la main', hint: 'Donne un petit coup sec de la main.' }
] as const;

const KEY_NAMES: Record<string, string> = {
  KEYCODE_MEDIA_NEXT: 'touche suivant',
  KEYCODE_MEDIA_PREVIOUS: 'touche précédent',
  KEYCODE_MEDIA_PLAY_PAUSE: 'touche lecture',
  KEYCODE_MEDIA_PLAY: 'touche lecture',
  KEYCODE_MEDIA_PAUSE: 'touche pause',
  KEYCODE_HEADSETHOOK: 'touche casque',
  KEYCODE_VOLUME_UP: 'volume plus',
  KEYCODE_VOLUME_DOWN: 'volume moins',
  KEYCODE_PAGE_UP: 'page précédente',
  KEYCODE_PAGE_DOWN: 'page suivante',
  KEYCODE_DPAD_UP: 'touche haut',
  KEYCODE_DPAD_DOWN: 'touche bas',
  KEYCODE_DPAD_LEFT: 'touche gauche',
  KEYCODE_DPAD_RIGHT: 'touche droite',
  KEYCODE_ENTER: 'touche entrée',
  KEYCODE_CAMERA: 'touche photo'
};

/** Le signal sans sa somme de contrôle (dernier octet) ni ses zéros de fin. */
function payload(code: string): string {
  const body = code.length >= 32 ? code.slice(0, 30) : code;
  return body.replace(/(00)+$/, '').toLowerCase();
}

export function signature(s: RingSignal): string {
  return s.channel === 'touche' ? `touche:${s.code}` : `message:${payload(s.code)}`;
}

export function signatureLabel(sig: string): string {
  const [channel, code = ''] = sig.split(':');
  if (channel === 'touche') return KEY_NAMES[code] ?? code.replace('KEYCODE_', 'touche ').toLowerCase();
  return `message ${(code.match(/../g) ?? []).join(' ')}`;
}

export interface GestureResult {
  id: string;
  label: string;
  count: number;
  /** Les signaux reçus, avec leur nombre. */
  signals: { label: string; count: number }[];
  /** à part : lui seul envoie ça ; commun : un autre geste aussi ; parasite : reçu aussi sans bouger. */
  status: 'apart' | 'commun' | 'parasite' | 'rien' | 'calme';
  sameAs: string[];
}

function kinds(list: RingSignal[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const s of list) {
    const sig = signature(s);
    seen.set(sig, (seen.get(sig) ?? 0) + 1);
  }
  return seen;
}

const keyOf = (seen: Map<string, number>) => [...seen.keys()].sort().join('|');

/** Compare les gestes essayés, dans l'ordre de la liste. */
export function compareGestures(trials: Trials): GestureResult[] {
  const control = new Set(kinds(trials[CONTROL] ?? []).keys());
  const tried = GESTURES.filter((g) => trials[g.id]).map((g) => ({ ...g, seen: kinds(trials[g.id]) }));
  return tried.map((g) => {
    const sameAs =
      g.id === CONTROL || !g.seen.size
        ? []
        : tried.filter((o) => o.id !== g.id && o.id !== CONTROL && keyOf(o.seen) === keyOf(g.seen)).map((o) => o.label);
    let status: GestureResult['status'];
    if (g.id === CONTROL) status = g.seen.size ? 'parasite' : 'calme';
    else if (!g.seen.size) status = 'rien';
    else if ([...g.seen.keys()].some((k) => control.has(k))) status = 'parasite';
    else status = sameAs.length ? 'commun' : 'apart';
    return {
      id: g.id,
      label: g.label,
      count: trials[g.id].length,
      signals: [...g.seen].map(([sig, count]) => ({ label: signatureLabel(sig), count })),
      status,
      sameAs
    };
  });
}

/** Combien de gestes différents sont vraiment utilisables : un par signal fiable. */
export function usableGestures(results: GestureResult[]): number {
  const groups = new Set<string>();
  for (const r of results) {
    if (r.status === 'apart' || r.status === 'commun') groups.add(r.signals.map((s) => s.label).sort().join('|'));
  }
  return groups.size;
}

const KEY = 'mon-renard:essai-gestes-3';

export function loadTrials(): Trials {
  try {
    // Les essais d'avant la 2.1 ont été faits avec le tactile fermé
    localStorage.removeItem('mon-renard:essai-gestes');
    localStorage.removeItem('mon-renard:essai-gestes-2');
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function saveTrials(trials: Trials): void {
  try {
    if (Object.keys(trials).length) localStorage.setItem(KEY, JSON.stringify(trials));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : les essais durent jusqu'à la fermeture */
  }
}
