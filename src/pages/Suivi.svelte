<script lang="ts">
  // Suivi : la journée en coupe (le terrier), chaque mesure comparée à ton habitude,
  // et ce qui bouge ensemble entre ton humeur et ton corps.
  import { untrack } from 'svelte';
  import FourWeeks from '../components/FourWeeks.svelte';
  import Terrier from '../components/Terrier.svelte';
  import TrendChart from '../components/TrendChart.svelte';
  import { checkInsBetween } from '../data/checkins';
  import { getDB } from '../data/db';
  import { feltEventsBetween } from '../data/events';
  import { nightsBetween, samplesBetween } from '../data/health';
  import type { CheckIn, FeltEvent, HealthMetric, HealthSample, SleepNight } from '../data/types';
  import {
    baseline,
    buildDays,
    compareToHabit,
    formatDuration,
    pulseSeries,
    RELATION_MIN_DAYS,
    relations,
    signals,
    type DayStat,
    type MetricKey
  } from '../lib/healthDays';
  import { canSyncRing, pullReadings, ringSync, syncNow } from '../lib/healthSync.svelte';
  import { addDays, dayLabel, startOfDay } from '../lib/history';
  import { isAndroidApp } from '../lib/android';
  import { journal, startJournal } from '../lib/journal.svelte';
  import { hrefFor } from '../lib/router';

  const LOADED_DAYS = 120;
  const DAILY: HealthMetric[] = ['hr', 'hrv', 'stress', 'spo2', 'steps', 'meters'];

  interface Loaded {
    samples: HealthSample[];
    nights: SleepNight[];
    checkins: CheckIn[];
    events: FeltEvent[];
  }

  let now = $state(Date.now());
  const today = $derived(startOfDay(now));
  let selected = $state(startOfDay(Date.now()));
  let loaded = $state.raw<Loaded | null>(null);
  let failed = $state(false);
  let belt = $state.raw<HealthSample[]>([]);
  let open = $state<MetricKey | null>(null);
  let period = $state<7 | 30 | 90>(30);

  let ticket = 0;

  async function load(day: number) {
    const mine = ++ticket;
    try {
      await startJournal();
      const db = getDB();
      const from = addDays(day, -LOADED_DAYS);
      const to = addDays(day, 1);
      const profileId = journal.profileId;
      const [lists, nights, checkins, events] = await Promise.all([
        Promise.all(DAILY.map((m) => samplesBetween(db, m, from, to))),
        nightsBetween(db, from, to),
        profileId != null ? checkInsBetween(db, profileId, from, to) : Promise.resolve([]),
        profileId != null ? feltEventsBetween(db, profileId, from, to) : Promise.resolve([])
      ]);
      if (mine !== ticket) return;
      loaded = { samples: lists.flat(), nights, checkins, events };
      failed = false;
    } catch (e) {
      console.error(e);
      if (mine === ticket) failed = true;
    }
  }

  $effect(() => {
    void ringSync.revision;
    const day = today;
    untrack(() => void load(day));
  });

  $effect(() => {
    void ringSync.revision;
    const day = selected;
    let cancelled = false;
    samplesBetween(getDB(), 'beltHr', addDays(day, -1), addDays(day, 1))
      .then((list) => {
        if (!cancelled) belt = list;
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    void pullReadings();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const before = startOfDay(now);
      now = Date.now();
      if (startOfDay(now) !== before && selected === before) selected = startOfDay(now);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const days = $derived(
    loaded ? buildDays(loaded, addDays(today, -LOADED_DAYS), addDays(today, 1)) : ([] as DayStat[])
  );
  const index = $derived(days.findIndex((d) => d.day === selected));
  const stat = $derived(index >= 0 ? days[index] : null);
  const night = $derived(loaded?.nights.find((n) => n.night === selected) ?? null);
  const hasMeasures = $derived(!!loaded && (loaded.samples.length > 0 || loaded.nights.length > 0));

  const windowFrom = $derived(addDays(selected, -1));
  const windowTo = $derived(addDays(selected, 1));
  const inWindow = <T extends { at: number }>(list: T[]) => list.filter((x) => x.at >= windowFrom && x.at < windowTo);

  const pulse = $derived(
    pulseSeries(inWindow((loaded?.samples ?? []).filter((s) => s.metric === 'hr')), belt)
  );
  const stepsNow = $derived(inWindow((loaded?.samples ?? []).filter((s) => s.metric === 'steps')));
  const dayCheckins = $derived(inWindow(loaded?.checkins ?? []));
  const dayEvents = $derived(inWindow(loaded?.events ?? []));

  const summary = $derived.by(() => {
    if (!stat) return 'Chargement…';
    const bits: string[] = [];
    if (stat.sleep != null) bits.push(`${formatDuration(stat.sleep)} de sommeil`);
    if (stat.restHr != null) bits.push(`pouls au repos à ${stat.restHr}`);
    if (stat.steps != null) bits.push(`${stat.steps.toLocaleString('fr-FR')} pas`);
    if (!bits.length) return 'Rien de relevé ce jour-là.';
    const text = bits.join(', ');
    return `${text[0].toUpperCase()}${text.slice(1)}. Glisse le doigt sur la scène pour lire chaque instant.`;
  });

  const bpm = (v: number | null) => (v == null ? '—' : `${Math.round(v)} bpm`);
  const ms = (v: number | null) => (v == null ? '—' : `${Math.round(v)} ms`);
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)} %`);
  const score = (v: number | null) => (v == null ? '—' : `${Math.round(v)} sur 100`);
  const count = (v: number | null) => (v == null ? '—' : Math.round(v).toLocaleString('fr-FR'));

  interface MetricDef {
    key: MetricKey;
    name: string;
    kind: 'bar' | 'line';
    color: string;
    format: (v: number | null) => string;
    detail: (d: DayStat) => string | null;
    about: string;
  }

  const METRICS: MetricDef[] = [
    {
      key: 'sleep',
      name: 'Sommeil',
      kind: 'bar',
      color: 'var(--stage-light)',
      format: formatDuration,
      detail: (d) => (d.deep != null ? `Profond ${formatDuration(d.deep)}, paradoxal ${formatDuration(d.rem)}` : null),
      about: "Le temps dormi, sans les moments éveillés. Une nuit compte pour le jour où tu te réveilles."
    },
    {
      key: 'restHr',
      name: 'Pouls au repos',
      kind: 'line',
      color: 'var(--heart)',
      format: bpm,
      detail: () => null,
      about: 'Lu surtout pendant la nuit. Il monte souvent avec la fatigue, le stress, l’alcool ou un début de maladie.'
    },
    {
      key: 'hrv',
      name: 'Variabilité',
      kind: 'line',
      color: 'var(--breath)',
      format: ms,
      detail: () => null,
      about: 'Les petites différences entre deux battements. Plus haute, elle indique en général un corps mieux reposé. Compare-la seulement à toi-même.'
    },
    {
      key: 'spo2',
      name: 'Oxygène',
      kind: 'line',
      color: 'var(--mood-low)',
      format: pct,
      detail: (d) => (d.spo2Low != null ? `Plus bas ${d.spo2Low} %` : null),
      about: 'Estimation de la bague, moins précise qu’un oxymètre. Si tu as un doute sur ta respiration, demande un vrai contrôle.'
    },
    {
      key: 'stress',
      name: 'Stress',
      kind: 'line',
      color: 'var(--energy)',
      format: score,
      detail: () => null,
      about: 'C’est ce que QRing appelle « Pression ». Ce n’est pas ta tension artérielle : la bague ne sait pas la mesurer.'
    },
    {
      key: 'steps',
      name: 'Pas',
      kind: 'bar',
      color: 'var(--grass)',
      format: count,
      detail: (d) => (d.meters != null ? `${(d.meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km` : null),
      about: 'Compté par quart d’heure. Une activité inhabituelle peut aussi être un signe à regarder, dans un sens comme dans l’autre.'
    }
  ];

  const habitOf = (key: MetricKey) => (index >= 0 ? baseline(days.slice(0, index + 1), key, 1) : null);

  function sparkPath(key: MetricKey) {
    const part = days.slice(Math.max(0, index - 13), index + 1);
    const v = part.map((d) => d[key]);
    const known = v.filter((x): x is number => x != null);
    if (known.length < 2) return '';
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    let d = '';
    let pen = false;
    v.forEach((x, i) => {
      if (x == null) {
        pen = false;
        return;
      }
      const px = 2 + (i / Math.max(1, part.length - 1)) * 60;
      const py = 21 - ((x - lo) / (hi - lo || 1)) * 18;
      d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  const strip = $derived.by(() => {
    const end = Math.min(today, addDays(selected, 3));
    return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  });
  const stripMax = $derived(Math.max(480, ...days.map((d) => d.sleep ?? 0)));
  const statOf = (day: number) => days.find((d) => d.day === day) ?? null;
  const letter = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' });
  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

  function pick(day: number) {
    if (day <= today) selected = day;
  }

  const syncText = $derived.by(() => {
    if (ringSync.running) return `Relevé en cours, ${ringSync.done} sur ${ringSync.total}`;
    if (ringSync.lastAt == null) return 'Bague pas encore relevée';
    const when = startOfDay(ringSync.lastAt) === today ? clock.format(ringSync.lastAt) : `le ${dateShort.format(ringSync.lastAt)}`;
    const sep = startOfDay(ringSync.lastAt) === today ? 'à ' : '';
    const battery = ringSync.battery != null ? `, bague à ${ringSync.battery} %${ringSync.charging ? ' en charge' : ''}` : '';
    return `Relevé ${sep}${when}${battery}`;
  });

  const inApp = isAndroidApp();
  const canSync = canSyncRing();

  const allSignals = $derived(signals(days));
  const links = $derived(relations(days.slice(-60)));
  const measuredDays = $derived(days.filter((d) => d.sleep != null || d.restHr != null || d.steps != null).length);
  const linkedDays = $derived(days.slice(-60).filter((d) => d.mood != null && (d.sleep != null || d.steps != null)).length);
</script>

<div class="suivi">
  <header class="top">
    <div>
      <h1>{dayLabel(selected, now)}</h1>
      <p class="sync" role="status">{syncText}</p>
    </div>
    {#if canSync}
      <button type="button" class="sync-btn" onclick={syncNow} disabled={ringSync.running}>
        {ringSync.running ? 'Relevé…' : 'Relever'}
      </button>
    {/if}
  </header>

  {#if ringSync.running && ringSync.total}
    <progress max={ringSync.total} value={ringSync.done} aria-label="Relevé de la bague"></progress>
  {/if}
  {#if ringSync.error}
    <p class="error" role="alert">{ringSync.error}</p>
  {/if}
  {#if failed}
    <p class="error" role="alert">Tes mesures n'ont pas pu être lues. Ferme puis rouvre l'appli.</p>
  {/if}

  <div class="strip" role="group" aria-label="Choisir un jour">
    <button type="button" class="chev" aria-label="Jour précédent" onclick={() => pick(addDays(selected, -1))}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    {#each strip as d (d)}
      {@const s = statOf(d)}
      <button
        type="button"
        class="day"
        aria-pressed={d === selected}
        aria-label="{dayLabel(d, now)}{s?.sleep != null ? `, ${formatDuration(s.sleep)} de sommeil` : ''}"
        onclick={() => pick(d)}
      >
        <span class="l">{letter.format(d)}</span>
        <span class="n">{new Date(d).getDate()}</span>
        <span class="bar"><i style="height: {s?.sleep != null ? Math.max(2, (s.sleep / stripMax) * 14) : 0}px"></i></span>
      </button>
    {/each}
    <button
      type="button"
      class="chev"
      aria-label="Jour suivant"
      disabled={selected >= today}
      onclick={() => pick(addDays(selected, 1))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
  </div>

  <Terrier
    day={selected}
    {now}
    {night}
    {pulse}
    steps={stepsNow}
    checkins={dayCheckins}
    events={dayEvents}
    {summary}
  />

  {#if loaded && !hasMeasures}
    <section class="first">
      <h2>Ton terrier attend sa première nuit</h2>
      {#if !inApp}
        <p>Les relevés viennent de l'appli Android de Mon renard : ouvre cet écran dans l'appli.</p>
      {:else if !canSync}
        <p>Mets l'appli à jour (version 1.7) depuis Repères pour relever ta bague.</p>
      {:else}
        <ol>
          <li>Force l'arrêt de QRing : la bague ne parle qu'à une appli à la fois.</li>
          <li>Branche la bague dans <a href={hrefFor('accueil')}>« En direct », sur l'accueil</a>.</li>
          <li>Reviens ici et appuie sur Relever. Ses 7 derniers jours arrivent en une minute environ.</li>
        </ol>
      {/if}
    </section>
  {/if}

  {#if hasMeasures}
    <section aria-labelledby="mesures">
      <h2 id="mesures">Les mesures du jour</h2>
      <ul class="metrics">
        {#each METRICS as m (m.key)}
          {@const value = stat?.[m.key] ?? null}
          {@const habit = habitOf(m.key)}
          {@const partial = m.key === 'steps' && selected === today}
          {@const compare = partial ? null : compareToHabit(m.key, value, habit)}
          {@const extra = stat ? m.detail(stat) : null}
          <li class:open={open === m.key}>
            <button
              type="button"
              class="metric"
              aria-expanded={open === m.key}
              onclick={() => (open = open === m.key ? null : m.key)}
            >
              <span class="who">
                <span class="name">{m.name}</span>
                <span class="sub">{compare ?? extra ?? (value == null ? 'Pas de mesure' : 'Ton habitude se dessine')}</span>
              </span>
              <svg class="spark" viewBox="0 0 64 24" aria-hidden="true">
                <path d={sparkPath(m.key)} style="stroke: {m.color}" />
              </svg>
              <span class="value">{m.format(value)}</span>
            </button>
            {#if open === m.key}
              <div class="more">
                {#if compare && extra}
                  <p class="extra">{extra}</p>
                {/if}
                <p class="about">{m.about}</p>
                <div class="periods" role="group" aria-label="Période">
                  {#each [7, 30, 90] as const as p (p)}
                    <button type="button" aria-pressed={period === p} onclick={() => (period = p)}>
                      {p === 90 ? '3 mois' : `${p} jours`}
                    </button>
                  {/each}
                </div>
                <TrendChart
                  days={days.slice(-period)}
                  metric={m.key}
                  name={m.name}
                  kind={m.kind}
                  color={m.color}
                  format={m.format}
                  {habit}
                  {selected}
                  {now}
                  onpick={pick}
                />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section aria-labelledby="regarder">
      <h2 id="regarder">À regarder</h2>
      {#if allSignals.length}
        <ul class="signals">
          {#each allSignals as s (s.id)}
            <li class:strong={s.strong}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          {/each}
        </ul>
      {:else if measuredDays < 8}
        <p class="calm">
          Ton renard apprend ton rythme. Encore {8 - measuredDays}
          {8 - measuredDays > 1 ? 'jours' : 'jour'} de port pour comparer tes mesures à ton habitude.
        </p>
      {:else}
        <p class="calm">Rien ne s'écarte de ton habitude ces derniers jours.</p>
      {/if}
    </section>

    <section aria-labelledby="semaines">
      <h2 id="semaines">Quatre semaines, humeur et corps</h2>
      <p class="lead">Chaque case est un jour, comparé à toi-même. Touche une colonne pour ouvrir ce jour.</p>
      <FourWeeks {days} {selected} {now} onpick={pick} />
    </section>

    <section aria-labelledby="ensemble">
      <h2 id="ensemble">Ce qui bouge ensemble chez toi</h2>
      {#if links.length}
        <ul class="links">
          {#each links as l (l.id)}
            <li>{l.text} <span>Sur {l.days} jours.</span></li>
          {/each}
        </ul>
        <p class="note">Deux choses qui varient ensemble ne s'expliquent pas forcément l'une par l'autre.</p>
      {:else if linkedDays >= RELATION_MIN_DAYS}
        <p class="calm">Aucun lien net entre ton humeur et tes mesures pour l'instant.</p>
      {:else}
        <p class="calm">
          Il faut au moins {RELATION_MIN_DAYS} jours avec tes check-ins et ta bague pour voir ce qui va ensemble. Un
          check-in par jour suffit.
        </p>
      {/if}
    </section>

    <p class="foot">
      Ces mesures viennent d'une bague grand public et servent à t'observer dans le temps. Elles ne remplacent ni un
      examen ni l'avis de ton médecin. Si tu vas mal, regarde l'onglet <a href={hrefFor('reperes')}>Repères</a>.
    </p>
  {/if}
</div>

<style>
  .suivi {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .top > div {
    min-width: 0;
  }

  h1 {
    font-size: 30px;
    font-weight: 700;
  }

  h1::first-letter {
    text-transform: uppercase;
  }

  .sync {
    margin-top: 2px;
    color: var(--muted);
    font-size: 14px;
  }

  .sync-btn {
    flex: none;
    min-height: 44px;
    padding: 0 20px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 700;
    cursor: pointer;
  }

  .sync-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  progress {
    width: 100%;
    height: 4px;
    accent-color: var(--accent);
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
    font-size: 15px;
  }

  .strip {
    display: grid;
    grid-template-columns: 32px repeat(7, minmax(0, 1fr)) 32px;
    align-items: stretch;
    gap: 2px;
  }

  .chev {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .chev:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .chev svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .day {
    display: grid;
    justify-items: center;
    gap: 1px;
    min-height: 66px;
    padding: 5px 0 6px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }

  .day[aria-pressed='true'] {
    background: var(--soil);
    color: #fff;
  }

  .day .l {
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
  }

  .day[aria-pressed='true'] .l {
    color: var(--soil-ink);
  }

  .day .n {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
  }

  .day .bar {
    display: flex;
    align-items: flex-end;
    height: 14px;
  }

  .day .bar i {
    display: block;
    width: 6px;
    border-radius: 3px 3px 1px 1px;
    background: var(--stage-light);
  }

  section {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  h2 {
    font-size: 22px;
  }

  h3 {
    font-size: 17px;
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
  }

  .first {
    padding: 18px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid var(--line);
  }

  .first ol {
    padding-left: 20px;
    display: grid;
    gap: 6px;
  }

  .metrics {
    list-style: none;
    border-top: 1px solid var(--line);
  }

  .metrics > li {
    border-bottom: 1px solid var(--line);
  }

  .metric {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 64px minmax(84px, auto);
    align-items: center;
    gap: 10px;
    min-height: 66px;
    padding: 8px 2px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .who {
    display: grid;
    min-width: 0;
  }

  .name {
    font-weight: 700;
  }

  .sub {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.25;
  }

  .spark {
    width: 64px;
    height: 24px;
  }

  .spark path {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .value {
    text-align: right;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .more {
    display: grid;
    gap: 10px;
    padding: 2px 2px 16px;
  }

  .about,
  .extra {
    color: var(--muted);
    font-size: 15px;
  }

  .extra {
    color: var(--fg);
  }

  .periods {
    display: flex;
    gap: 4px;
  }

  .periods button {
    flex: 1;
    min-height: 40px;
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .periods button[aria-pressed='true'] {
    border-color: var(--fg);
    color: var(--fg);
  }

  .signals {
    list-style: none;
    display: grid;
    gap: 12px;
  }

  .signals li {
    display: grid;
    gap: 3px;
    padding-left: 14px;
    border-left: 3px solid var(--line);
  }

  .signals li.strong {
    border-left-color: var(--accent);
  }

  .signals p {
    color: var(--muted);
    font-size: 15px;
  }

  .calm,
  .lead,
  .note {
    color: var(--muted);
    font-size: 15px;
  }

  .links {
    list-style: none;
    display: grid;
    gap: 8px;
  }

  .links span {
    color: var(--muted);
    font-size: 14px;
  }

  .foot {
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 14px;
  }
</style>
