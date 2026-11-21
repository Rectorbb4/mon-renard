// Le suivi jour par jour : ce que disent les capteurs et le journal, comparé à ton habitude.
// Toujours par rapport à toi-même : les chiffres d'une bague varient d'une personne à l'autre.

import type { CheckIn, FeltEvent, HealthSample, SleepNight } from '../data/types';
import { addDays, startOfDay } from './history';

export interface DayStat {
  day: number;
  /** Minutes dormies (hors moments éveillés). */
  sleep: number | null;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number | null;
  /** Pouls au repos : la moyenne des valeurs les plus basses. */
  restHr: number | null;
  hrv: number | null;
  stress: number | null;
  spo2: number | null;
  spo2Low: number | null;
  steps: number | null;
  meters: number | null;
  mood: number | null;
  energy: number | null;
  felt: number;
}

export type MetricKey = 'sleep' | 'restHr' | 'hrv' | 'stress' | 'spo2' | 'steps';

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const sum = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) : null);

export function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** La moyenne du `share` le plus bas des valeurs. */
function lowest(v: number[], share: number): number | null {
  if (v.length < 6) return null;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(mean(s.slice(0, Math.max(3, Math.ceil(s.length * share))))!);
}

export function stageMinutes(n: SleepNight) {
  const t = { 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const [stage, minutes] of n.stages) t[stage] += minutes;
  return { light: t[2], deep: t[3], rem: t[4], awake: t[5], asleep: t[2] + t[3] + t[4] };
}

export interface DayInput {
  samples: HealthSample[];
  nights: SleepNight[];
  checkins: CheckIn[];
  events: FeltEvent[];
}

/** Une ligne par jour, du plus ancien au plus récent (`from` et `to` : minuits, `to` exclu). */
export function buildDays({ samples, nights, checkins, events }: DayInput, from: number, to: number): DayStat[] {
  const byDay = new Map<number, Record<string, HealthSample[]>>();
  for (const s of samples) {
    const d = startOfDay(s.at);
    const day = byDay.get(d) ?? {};
    (day[s.metric] ??= []).push(s);
    byDay.set(d, day);
  }
  const nightOf = new Map(nights.map((n) => [n.night, n]));
  const moods = new Map<number, CheckIn[]>();
  for (const c of checkins) {
    const d = startOfDay(c.at);
    moods.set(d, [...(moods.get(d) ?? []), c]);
  }
  const felt = new Map<number, number>();
  for (const e of events) {
    const d = startOfDay(e.at);
    felt.set(d, (felt.get(d) ?? 0) + 1);
  }

  const out: DayStat[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) {
    const m = byDay.get(day) ?? {};
    const n = nightOf.get(day);
    const st = n ? stageMinutes(n) : null;
    const values = (k: string) => (m[k] ?? []).map((s) => s.value);
    // Le pouls au repos se lit de préférence pendant la nuit, y compris avant minuit
    let rest: number | null = null;
    if (n) {
      const before = byDay.get(addDays(day, -1))?.hr ?? [];
      rest = lowest(
        [...before, ...(m.hr ?? [])].filter((s) => s.at >= n.start && s.at <= n.end).map((s) => s.value),
        0.3
      );
    }
    rest ??= lowest(values('hr'), 0.2);
    const o2 = m.spo2 ?? [];
    const c = moods.get(day) ?? [];
    const round = (v: number | null) => (v == null ? null : Math.round(v));
    out.push({
      day,
      sleep: st?.asleep ?? null,
      deep: st?.deep ?? null,
      rem: st?.rem ?? null,
      light: st?.light ?? null,
      awake: st?.awake ?? null,
      restHr: rest,
      hrv: round(mean(values('hrv'))),
      stress: round(mean(values('stress'))),
      spo2: round(mean(o2.map((s) => s.value))),
      spo2Low: o2.length ? Math.min(...o2.map((s) => s.min ?? s.value)) : null,
      steps: sum(values('steps')),
      meters: sum(values('meters')),
      mood: mean(c.map((x) => x.mood)),
      energy: mean(c.map((x) => x.energy)),
      felt: felt.get(day) ?? 0
    });
  }
  return out;
}

/** Ton habitude : la médiane des 28 jours précédents, sans les `skip` derniers. Il faut au moins 5 jours. */
export function baseline(days: DayStat[], key: MetricKey, skip = 3): number | null {
  const end = Math.max(0, days.length - skip);
  const v = days
    .slice(Math.max(0, end - 28), end)
    .map((d) => d[key])
    .filter((x): x is number => x != null);
  return v.length >= 5 ? median(v) : null;
}

/** Les `n` dernières valeurs remplissent toutes la condition (journée en cours exclue si `skipToday`). */
function streak(days: DayStat[], pick: (d: DayStat) => number | null, n: number, test: (v: number) => boolean, skipToday = false) {
  const end = skipToday ? days.length - 1 : days.length;
  const part = days.slice(Math.max(0, end - n), end);
  return part.length === n && part.every((d) => {
    const v = pick(d);
    return v != null && test(v);
  });
}

export interface Signal {
  id: string;
  title: string;
  text: string;
  /** Mérite qu'on s'y arrête. */
  strong: boolean;
}

const TALK = 'Si ça continue, parles-en à ton médecin.';

/** Ce qui s'écarte de ton habitude depuis plusieurs jours. Jamais un diagnostic : des choses à regarder. */
export function signals(days: DayStat[]): Signal[] {
  const out: Signal[] = [];
  if (!days.length) return out;
  const sleepBase = baseline(days, 'sleep');
  const recent = days.slice(-3);
  const energyHigh = recent.filter((d) => (d.energy ?? 0) >= 0.7).length >= 2;
  const moodHigh = recent.filter((d) => (d.mood ?? 0) >= 0.4).length >= 2;
  const moodLow = recent.filter((d) => d.mood != null && d.mood <= -0.4).length >= 2;

  const shortLimit = sleepBase != null ? sleepBase - 60 : 330;
  if (streak(days, (d) => d.sleep, 3, (v) => v < shortLimit)) {
    if (energyHigh || moodHigh) {
      out.push({
        id: 'court-haut',
        title: 'Moins de sommeil, plus d’élan',
        text: `Trois nuits courtes alors que ton énergie ou ton humeur sont hautes. Ce duo peut accompagner une montée : protège ta prochaine nuit. ${TALK}`,
        strong: true
      });
    } else {
      out.push({
        id: 'court',
        title: 'Trois nuits plus courtes',
        text: 'Tu dors moins que d’habitude depuis trois nuits. Essaie de te coucher plus tôt ce soir.',
        strong: false
      });
    }
  }
  if (sleepBase != null && moodLow && streak(days, (d) => d.sleep, 3, (v) => v > sleepBase + 90)) {
    out.push({
      id: 'long-bas',
      title: 'Nuits longues, humeur basse',
      text: `Tu dors nettement plus que d’habitude et ton humeur est basse. Sortir un peu à la lumière du jour peut aider. ${TALK}`,
      strong: true
    });
  }
  const rest = baseline(days, 'restHr');
  if (rest != null && streak(days, (d) => d.restHr, 3, (v) => v >= rest + 7)) {
    out.push({
      id: 'repos',
      title: 'Pouls au repos plus haut',
      text: 'Depuis trois jours, il dépasse ton habitude de 7 battements ou plus. Fatigue, stress, alcool ou début de maladie peuvent l’expliquer.',
      strong: false
    });
  }
  const hrv = baseline(days, 'hrv');
  if (hrv != null && streak(days, (d) => d.hrv, 3, (v) => v <= hrv * 0.75)) {
    out.push({
      id: 'vfc',
      title: 'Variabilité en baisse',
      text: 'Ton corps récupère moins bien que d’habitude depuis trois jours. Une journée plus calme lui ferait du bien.',
      strong: false
    });
  }
  const stress = baseline(days, 'stress');
  if (stress != null && streak(days, (d) => d.stress, 3, (v) => v >= stress + 15)) {
    out.push({
      id: 'stress',
      title: 'Stress au-dessus de ton habitude',
      text: 'Le score de la bague reste élevé depuis trois jours. Quelques minutes de respiration avec ton renard peuvent aider.',
      strong: false
    });
  }
  const steps = baseline(days, 'steps');
  if (steps != null && steps > 500 && streak(days, (d) => d.steps, 3, (v) => v >= steps * 1.6, true) && (energyHigh || moodHigh)) {
    out.push({
      id: 'actif',
      title: 'Beaucoup plus d’activité',
      text: `Tu bouges bien plus que d’habitude, avec une énergie haute. Pense à garder des temps de pause. ${TALK}`,
      strong: true
    });
  }
  if (days.slice(-3).reduce((n, d) => n + d.felt, 0) >= 4) {
    out.push({
      id: 'moments',
      title: 'Plusieurs moments « je le sens »',
      text: 'Tu en as noté au moins quatre en trois jours. Relis-les dans l’historique : ils ont peut-être un point commun.',
      strong: false
    });
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong));
}

export interface Relation {
  id: string;
  text: string;
  days: number;
}

/** Il faut au moins ce nombre de jours avec sommeil et humeur pour oser une comparaison. */
export const RELATION_MIN_DAYS = 10;

function compare(days: DayStat[], cause: (d: DayStat) => number | null, effect: (d: DayStat) => number | null) {
  const rows = days
    .map((d) => [cause(d), effect(d)] as const)
    .filter((r): r is readonly [number, number] => r[0] != null && r[1] != null);
  if (rows.length < RELATION_MIN_DAYS) return null;
  const mid = median(rows.map((r) => r[0]))!;
  const low = rows.filter((r) => r[0] < mid).map((r) => r[1]);
  const high = rows.filter((r) => r[0] >= mid).map((r) => r[1]);
  if (low.length < 4 || high.length < 4) return null;
  return { diff: mean(low)! - mean(high)!, days: rows.length };
}

/** Ce qui varie ensemble chez toi. Un lien n'est pas une cause. */
export function relations(days: DayStat[]): Relation[] {
  const out: Relation[] = [];
  const add = (id: string, c: ReturnType<typeof compare>, seuil: number, higher: string, lower: string) => {
    if (c && Math.abs(c.diff) >= seuil) out.push({ id, text: c.diff > 0 ? higher : lower, days: c.days });
  };
  add('nuit-humeur', compare(days, (d) => d.sleep, (d) => d.mood), 0.15,
    'Après tes nuits les plus courtes, ton humeur est plus haute.',
    'Après tes nuits les plus courtes, ton humeur est plus basse.');
  add('nuit-energie', compare(days, (d) => d.sleep, (d) => d.energy), 0.1,
    'Après tes nuits les plus courtes, tu te sens plus d’énergie.',
    'Après tes nuits les plus courtes, tu as moins d’énergie.');
  add('pas-humeur', compare(days, (d) => d.steps, (d) => d.mood), 0.15,
    'Les jours où tu marches le moins, ton humeur est plus haute.',
    'Les jours où tu marches le plus, ton humeur est plus haute.');
  add('stress-humeur', compare(days, (d) => d.stress, (d) => d.mood), 0.15,
    'Les jours les moins stressés, ton humeur est plus haute.',
    'Les jours les plus stressés, ton humeur est plus haute.');
  return out;
}

export interface StageSegment {
  stage: SleepNight['stages'][number][0];
  from: number;
  to: number;
}

/** Les phases d'une nuit, placées dans le temps. */
export function stageSegments(n: SleepNight): StageSegment[] {
  const out: StageSegment[] = [];
  let t = n.start;
  for (const [stage, minutes] of n.stages) {
    if (t >= n.end) break;
    const to = Math.min(n.end, t + minutes * 60000);
    out.push({ stage, from: t, to });
    t = to;
  }
  return out;
}

/** Le pouls d'une journée : la ceinture quand elle est portée (plus précise), la bague sinon. */
export function pulseSeries(ring: HealthSample[], belt: HealthSample[]): { at: number; value: number }[] {
  const GAP = 3 * 60000;
  const beltTimes = belt.map((s) => s.at).sort((a, b) => a - b);
  const nearBelt = (at: number) => {
    let lo = 0;
    let hi = beltTimes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Math.abs(beltTimes[mid] - at) <= GAP) return true;
      if (beltTimes[mid] < at) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  };
  return [...belt, ...ring.filter((s) => !nearBelt(s.at))]
    .map(({ at, value }) => ({ at, value }))
    .sort((a, b) => a.at - b.at);
}

/** Écart minimal considéré comme réel, pour qu'une mesure très stable ne s'affole pas pour un rien. */
const SPREAD_MIN: Record<MetricKey, number> = { sleep: 45, restHr: 3, hrv: 6, stress: 8, spo2: 1.5, steps: 1500 };

/** Chaque jour par rapport à toi-même, de -1 (bien plus bas) à 1 (bien plus haut). Il faut 5 jours. */
export function deviations(days: DayStat[], key: MetricKey): (number | null)[] {
  const v = days.map((d) => d[key]).filter((x): x is number => x != null);
  if (v.length < 5) return days.map(() => null);
  const mid = median(v)!;
  const mad = median(v.map((x) => Math.abs(x - mid)))!;
  const scale = Math.max(mad * 1.4826, SPREAD_MIN[key]);
  return days.map((d) => {
    const x = d[key];
    return x == null ? null : Math.max(-1, Math.min(1, (x - mid) / (2 * scale)));
  });
}

/** « 25 min de moins que d'habitude ». Sans habitude connue, rien. */
export function compareToHabit(key: MetricKey, value: number | null, habit: number | null): string | null {
  if (value == null || habit == null) return null;
  const diff = value - habit;
  const size = Math.abs(diff);
  const same = "comme d'habitude";
  const word = diff > 0 ? 'de plus' : 'de moins';
  switch (key) {
    case 'sleep':
      return size < 15 ? same : `${formatDuration(Math.round(size))} ${word} que d'habitude`;
    case 'restHr':
      return size < 2 ? same : `${Math.round(size)} bpm ${word} que d'habitude`;
    case 'hrv':
      return size < 4 ? same : `${Math.round(size)} ms ${word} que d'habitude`;
    case 'stress':
      return size < 5 ? same : `${Math.round(size)} points ${word} que d'habitude`;
    case 'spo2':
      return size < 1 ? same : `${Math.round(size)} % ${word} que d'habitude`;
    case 'steps':
      return size < habit * 0.1 ? same : `${Math.round(size).toLocaleString('fr-FR')} pas ${word} que d'habitude`;
  }
}

/** « 7 h 12 ». */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
