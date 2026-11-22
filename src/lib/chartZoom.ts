// La plage de temps d'un graphique : zoom autour d'un point, pincement à deux doigts, déplacement.
// Aucun lien avec l'écran ici : ces calculs se testent seuls.

export interface Span {
  from: number;
  to: number;
}

/** Plage la plus courte qu'on peut afficher par défaut. */
export const MIN_SPAN = 30 * 60_000;
/** Sous cet écart entre les doigts (en part de la largeur), on déplace sans zoomer. */
const MIN_SPREAD = 0.05;

/** Garde la plage dans les limites du graphique, sans changer sa durée quand c'est possible. */
export function clampView(view: Span, bounds: Span, minSpan = MIN_SPAN): Span {
  const whole = bounds.to - bounds.from;
  const span = Math.min(whole, Math.max(Math.min(minSpan, whole), view.to - view.from));
  const from = Math.max(bounds.from, Math.min(bounds.to - span, view.from));
  return { from, to: from + span };
}

/** Zoome autour d'un instant, qui reste au même endroit à l'écran. `factor` < 1 rapproche. */
export function zoomAt(view: Span, bounds: Span, at: number, factor: number, minSpan = MIN_SPAN): Span {
  const span = view.to - view.from;
  const part = span > 0 ? (at - view.from) / span : 0.5;
  const next = span * factor;
  return clampView({ from: at - part * next, to: at + (1 - part) * next }, bounds, minSpan);
}

/** Fait glisser la plage d'une part de sa durée (positif : vers plus tard). */
export function panBy(view: Span, bounds: Span, share: number, minSpan = MIN_SPAN): Span {
  const shift = (view.to - view.from) * share;
  return clampView({ from: view.from + shift, to: view.to + shift }, bounds, minSpan);
}

/**
 * La plage après un pincement. `a0` et `b0` : position des deux doigts au début du geste,
 * `a1` et `b1` : leur position maintenant, de 0 (bord gauche de la courbe) à 1 (bord droit).
 * L'instant entre les deux doigts les suit.
 */
export function pinchView(start: Span, bounds: Span, a0: number, b0: number, a1: number, b1: number, minSpan = MIN_SPAN): Span {
  const span = start.to - start.from;
  const before = b0 - a0;
  const after = b1 - a1;
  let next = span;
  if (Math.abs(before) >= MIN_SPREAD) {
    const spread = before * after > 0 ? Math.max(Math.abs(after), MIN_SPREAD) : MIN_SPREAD;
    next = span * (Math.abs(before) / spread);
  }
  const focus = start.from + ((a0 + b0) / 2) * span;
  const from = focus - ((a1 + b1) / 2) * next;
  return clampView({ from, to: from + next }, bounds, minSpan);
}

export const isWhole = (view: Span, bounds: Span) => view.from <= bounds.from && view.to >= bounds.to;

const STEPS = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720];

/** « minuit », « 6 h », « midi », « 22 h 30 ». */
export function hourLabel(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  const m = d.getMinutes();
  if (!m && h === 0) return 'minuit';
  if (!m && h === 12) return 'midi';
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Des repères à des heures rondes, à l'heure locale, assez espacés pour rester lisibles. */
export function timeTicks(view: Span): { t: number; label: string }[] {
  const minutes = (view.to - view.from) / 60_000;
  const step = STEPS.find((s) => minutes / s <= 5) ?? 1440;
  const first = new Date(view.from);
  const out: { t: number; label: string }[] = [];
  const year = first.getFullYear();
  const month = first.getMonth();
  const date = first.getDate();
  for (let i = 0; ; i++) {
    const t = new Date(year, month, date, 0, i * step).getTime();
    if (t > view.to) break;
    if (t >= view.from) out.push({ t, label: hourLabel(t) });
  }
  return out;
}
