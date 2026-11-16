// Alerte quand le pouls monte : sonnerie et vibration forte pour penser à respirer.
// Seulement pendant les plages horaires choisies (jamais au bureau, par exemple), et seulement avec de vrais capteurs.
// La même règle est écrite en Java pour l'appli Android (android/.../PulseAlert.java) : les garder d'accord.

/** Une plage horaire : des jours (0 = dimanche … 6 = samedi) et des heures, en minutes depuis minuit. */
export interface AlertSlot {
  days: number[];
  /** Début, en minutes depuis minuit (18 h = 1080). */
  from: number;
  /** Fin ; si elle est avant le début, la plage passe minuit (22 h → 2 h). */
  to: number;
}

export type AlertSound = 'carillon' | 'sonnerie';

export interface AlertConfig {
  enabled: boolean;
  /** Pouls (battements / min) à partir duquel l'alerte sonne. */
  threshold: number;
  slots: AlertSlot[];
  /** Son joué dans le navigateur (l'appli Android utilise un son du téléphone). */
  sound: AlertSound;
}

/** Le pouls doit rester haut pendant 30 secondes : un pic d'une seconde ne déclenche rien. */
export const SUSTAIN_MS = 30_000;
/** Part des mesures au-dessus du seuil sur ces 30 secondes (la bague a parfois un raté). */
export const SHARE_ABOVE = 0.8;
/** Après une alerte, 15 minutes de calme avant la suivante. */
export const COOLDOWN_MS = 15 * 60_000;
/** « Pas maintenant » : plus d'alerte pendant une heure. */
export const SNOOZE_MS = 60 * 60_000;
/** Un trou de plus de 10 s dans les mesures (capteur déconnecté) : on recommence à compter. */
const GAP_MS = 10_000;

export const THRESHOLD_MIN = 70;
export const THRESHOLD_MAX = 160;

export const DEFAULT_ALERT: AlertConfig = {
  enabled: false,
  threshold: 100,
  slots: [
    { days: [1, 2, 3, 4, 5], from: 18 * 60, to: 23 * 60 },
    { days: [0, 6], from: 9 * 60, to: 23 * 60 }
  ],
  sound: 'carillon'
};

const isMinute = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 24 * 60;

/** Relit une configuration enregistrée ; ce qui manque ou est abîmé reprend la valeur par défaut. */
export function parseAlertConfig(value: unknown): AlertConfig {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_ALERT);
  const v = value as Partial<AlertConfig>;
  const slots = Array.isArray(v.slots)
    ? v.slots
        .filter((s): s is AlertSlot => !!s && isMinute(s.from) && isMinute(s.to) && Array.isArray(s.days))
        .map((s) => ({ from: s.from, to: s.to, days: [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() }))
    : structuredClone(DEFAULT_ALERT.slots);
  const threshold = typeof v.threshold === 'number' && Number.isFinite(v.threshold) ? Math.round(v.threshold) : DEFAULT_ALERT.threshold;
  return {
    enabled: v.enabled === true,
    threshold: Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, threshold)),
    slots,
    sound: v.sound === 'sonnerie' ? 'sonnerie' : 'carillon'
  };
}

/** Est-on dans une des plages horaires ? Une plage qui passe minuit compte pour le jour où elle commence. */
export function inSlots(date: Date, slots: AlertSlot[]): boolean {
  const day = date.getDay();
  const minute = date.getHours() * 60 + date.getMinutes();
  const yesterday = (day + 6) % 7;
  return slots.some((s) => {
    if (s.from === s.to) return s.days.includes(day);
    if (s.from < s.to) return s.days.includes(day) && minute >= s.from && minute < s.to;
    return (s.days.includes(day) && minute >= s.from) || (s.days.includes(yesterday) && minute < s.to);
  });
}

/** Surveille le pouls et dit quand sonner. */
export class PulseWatch {
  private samples: [number, number][] = [];
  private quietUntil = 0;

  /** Ajoute une mesure ; renvoie vrai s'il faut sonner maintenant. */
  push(hr: number, at: number, config: AlertConfig): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && at - last[0] > GAP_MS) this.samples = [];
    this.samples.push([at, hr]);
    while (this.samples.length && at - this.samples[0][0] > SUSTAIN_MS) this.samples.shift();

    if (!config.enabled || at < this.quietUntil || !inSlots(new Date(at), config.slots)) return false;
    // Au moins 25 secondes de mesures, et presque toutes au-dessus du seuil
    if (at - this.samples[0][0] < SUSTAIN_MS - 5000 || this.samples.length < 5) return false;
    const above = this.samples.filter(([, v]) => v >= config.threshold).length;
    if (above / this.samples.length < SHARE_ABOVE) return false;

    this.quietUntil = at + COOLDOWN_MS;
    this.samples = [];
    return true;
  }

  /** « Pas maintenant » : silence pendant une heure. */
  snooze(now: number): void {
    this.quietUntil = Math.max(this.quietUntil, now + SNOOZE_MS);
    this.samples = [];
  }

  reset(): void {
    this.samples = [];
    this.quietUntil = 0;
  }
}

export const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** Ordre d'affichage : la semaine commence le lundi. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** « 18:30 » */
export function formatMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** « 18:30 » → 1110 ; null si l'heure est illisible. */
export function parseMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** « lun. → ven., 18:00 – 23:00 » pour le résumé. */
export function describeSlot(s: AlertSlot): string {
  const days = WEEK.filter((d) => s.days.includes(d));
  let when: string;
  if (days.length === 7) when = 'tous les jours';
  else if (days.length === 0) when = 'aucun jour';
  else {
    // Jours qui se suivent (dans l'ordre lundi → dimanche) : « du lundi au vendredi »
    const idx = days.map((d) => WEEK.indexOf(d));
    const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    when =
      consecutive && days.length > 2
        ? `du ${DAY_NAMES[days[0]]} au ${DAY_NAMES[days[days.length - 1]]}`
        : days.map((d) => DAY_NAMES[d]).join(', ');
  }
  const hours = s.from === s.to ? 'toute la journée' : `${formatMinutes(s.from)} – ${formatMinutes(s.to)}`;
  return `${when}, ${hours}`;
}
