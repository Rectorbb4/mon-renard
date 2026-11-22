<script lang="ts">
  // Le détail du jour choisi : la nuit phase par phase, le cœur, l'activité.
  import type { HealthSample, SleepNight, SleepStage } from '../data/types';
  import {
    dayActivity,
    dayHeart,
    dayMetric,
    formatKm,
    HRV_ZONES,
    nightDetail,
    SPO2_ZONES,
    STAGE_NAMES,
    STRESS_ZONES,
    zonesOf,
    type WakeEstimate,
    type ZoneDef
  } from '../lib/dayDetail';
  import { formatDuration, stageMinutes, type StageSegment } from '../lib/healthDays';
  import { addDays } from '../lib/history';
  import DetailChart from './DetailChart.svelte';

  interface Props {
    day: number;
    /** La nuit affichée : ajustée, ou telle que la bague l'a notée. */
    night: SleepNight | null;
    /** La nuit de la bague, pour dire ce qui a changé. */
    ringNight: SleepNight | null;
    wake: WakeEstimate | null;
    adjusted: boolean;
    samples: HealthSample[];
  }

  let { day, night, ringNight, wake, adjusted, samples }: Props = $props();

  const ringAsleep = $derived(ringNight ? stageMinutes(ringNight).asleep : null);
  const inBed = $derived(ringNight ? Math.round((ringNight.end - ringNight.start) / 60_000) : null);

  type VitalId = 'hrv' | 'spo2' | 'stress';
  type Tab = 'nuit' | 'coeur' | VitalId | 'activite';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'nuit', label: 'Nuit' },
    { id: 'coeur', label: 'Cœur' },
    { id: 'hrv', label: 'Variabilité' },
    { id: 'spo2', label: 'Oxygène' },
    { id: 'stress', label: 'Stress' },
    { id: 'activite', label: 'Activité' }
  ];
  let tab = $state<Tab>('nuit');

  const sleep = $derived(night ? nightDetail(night, samples) : null);
  const heart = $derived(dayHeart(day, samples));
  const moves = $derived(dayActivity(day, samples));

  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const bpm = (v: number) => `${Math.round(v)} bpm`;
  const ms = (v: number) => `${Math.round(v)} ms`;
  const pct = (v: number) => `${Math.round(v)} %`;
  const steps = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} pas`;

  interface Vital {
    name: string;
    unit: string;
    color: string;
    kind: 'line' | 'bars';
    zones: ZoneDef[];
    format: (v: number) => string;
    domain?: [number, number];
    slot?: number;
    gap?: number;
  }
  const VITALS: Record<VitalId, Vital> = {
    hrv: { name: 'Variabilité', unit: 'ms', color: 'var(--breath)', kind: 'line', zones: HRV_ZONES, format: ms, gap: 3 * 3_600_000 },
    spo2: { name: 'Oxygène', unit: '%', color: 'var(--mood-low)', kind: 'bars', zones: SPO2_ZONES, format: pct, domain: [80, 100], slot: 3_600_000 },
    stress: {
      name: 'Stress',
      unit: 'sur 100',
      color: 'var(--energy)',
      kind: 'bars',
      zones: STRESS_ZONES,
      format: (v) => `${Math.round(v)} sur 100`,
      domain: [0, 100],
      slot: 30 * 60_000
    }
  };
  const vital = $derived(tab === 'hrv' || tab === 'spo2' || tab === 'stress' ? VITALS[tab] : null);
  const vitalDay = $derived(tab === 'hrv' || tab === 'spo2' || tab === 'stress' ? dayMetric(day, samples, tab) : null);
  const vitalZones = $derived(vital && vitalDay ? zonesOf(vitalDay.points, vital.zones) : []);

  const STAGE_COLOR: Record<SleepStage, string> = {
    5: 'var(--stage-awake)',
    4: 'var(--stage-rem)',
    2: 'var(--stage-light)',
    3: 'var(--stage-deep)'
  };
  const ROW: Record<SleepStage, number> = { 5: 0, 4: 1, 2: 2, 3: 3 };

  const nightTicks = $derived(
    sleep
      ? [
          { t: sleep.start, label: clock.format(sleep.start) },
          { t: sleep.end, label: clock.format(sleep.end) }
        ]
      : []
  );
  const dayEnd = $derived(addDays(day, 1));
  const hourAt = (h: number) => {
    const d = new Date(day);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  };
  const dayTicks = $derived([
    { t: day, label: 'minuit' },
    { t: hourAt(6), label: '6 h' },
    { t: hourAt(12), label: 'midi' },
    { t: hourAt(18), label: '18 h' },
    { t: dayEnd, label: 'minuit' }
  ]);

  // --- Les phases de la nuit, lisibles au doigt ---
  const HW = 340;
  const HH = 132;
  const ROW_H = 30;
  let phase = $state<StageSegment | null>(null);

  const hx = (t: number) => (sleep ? ((t - sleep.start) / (sleep.end - sleep.start || 1)) * HW : 0);

  function readPhase(e: PointerEvent) {
    if (!sleep) return;
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const t = sleep.start + ((e.clientX - box.left) / box.width) * (sleep.end - sleep.start);
    phase = sleep.segments.find((s) => t >= s.from && t < s.to) ?? null;
  }

  const phaseText = $derived(
    phase
      ? `${STAGE_NAMES[phase.stage]}, ${formatDuration(Math.round((phase.to - phase.from) / 60_000))}, de ${clock.format(phase.from)} à ${clock.format(phase.to)}`
      : ''
  );
</script>

<section class="details" aria-labelledby="detail-title">
  <h2 id="detail-title" class="hidden">Détail du jour</h2>
  <div class="tabs" role="group" aria-label="Détail du jour">
    {#each TABS as t (t.id)}
      <button type="button" aria-pressed={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </div>

  {#if tab === 'nuit'}
    {#if sleep}
      <div class="hero">
        <p class="big">{formatDuration(sleep.asleep)}</p>
        <p class="sub">
          dormies, de {clock.format(sleep.start)} à {clock.format(sleep.end)}<br />
          {formatDuration(inBed ?? sleep.inBed)} au lit
        </p>
      </div>

      {#if adjusted && wake}
        <p class="wake">
          <strong>Réveil vers {clock.format(wake.at)}, repéré à ton pouls.</strong>
          Les {formatDuration(wake.lingered)} suivantes ne comptent plus comme du sommeil. La bague indique {formatDuration(ringAsleep)}.
        </p>
      {:else if adjusted}
        <p class="wake">Pas de réveil plus tôt repéré cette nuit : mêmes chiffres que la bague.</p>
      {/if}

      <figure class="phases">
        <p class="readout" aria-live="off">{phaseText}</p>
        <svg
          viewBox="0 0 {HW} {HH}"
          role="img"
          aria-label={`Phases de la nuit : ${sleep.stages.map((s) => `${s.name} ${formatDuration(s.minutes)}`).join(', ')}.`}
          onpointermove={readPhase}
          onpointerdown={readPhase}
          onpointerleave={() => (phase = null)}
        >
          {#each sleep.segments as s (s.from)}
            <rect
              class:dim={phase != null && phase.from !== s.from}
              x={hx(s.from)}
              y={ROW[s.stage] * (ROW_H + 3)}
              width={Math.max(1.5, hx(s.to) - hx(s.from) - 1)}
              height={ROW_H}
              rx="3"
              style:fill={STAGE_COLOR[s.stage]}
            />
          {/each}
        </svg>
        <p class="ends"><span>{clock.format(sleep.start)}</span><span>{clock.format(sleep.end)}</span></p>
      </figure>

      <ul class="stages">
        {#each sleep.stages as s (s.stage)}
          <li>
            <span class="stage-name"><i style:background={STAGE_COLOR[s.stage]}></i>{s.name}</span>
            <span class="stage-time">{formatDuration(s.minutes)}</span>
            <span class="stage-share">{s.share} %</span>
            <span class="track"><b style:width="{s.share}%" style:background={STAGE_COLOR[s.stage]}></b></span>
          </li>
        {/each}
      </ul>

      {#if sleep.hr.length}
        <section class="series">
          <h3>Pouls moyen de la nuit <strong>{bpm(sleep.hrRange.avg!)}</strong></h3>
          <p class="range">De {sleep.hrRange.min} à {sleep.hrRange.max} bpm</p>
          <DetailChart
            points={sleep.hr}
            from={sleep.start}
            to={sleep.end}
            color="var(--heart)"
            format={bpm}
            ticks={nightTicks}
            label={`Pouls pendant la nuit : ${sleep.hrRange.avg} bpm en moyenne, de ${sleep.hrRange.min} à ${sleep.hrRange.max}.`}
          />
        </section>
      {/if}
      {#if sleep.hrv.length}
        <section class="series">
          <h3>Variabilité moyenne <strong>{ms(sleep.hrvAvg!)}</strong></h3>
          <DetailChart
            points={sleep.hrv}
            from={sleep.start - 30 * 60_000}
            to={sleep.end}
            color="var(--breath)"
            format={ms}
            gap={3 * 3_600_000}
            ticks={nightTicks}
            label={`Variabilité pendant la nuit : ${sleep.hrvAvg} millisecondes en moyenne.`}
          />
        </section>
      {/if}
      {#if sleep.spo2.length}
        <section class="series">
          <h3>Oxygène moyen <strong>{pct(sleep.spo2Avg!)}</strong></h3>
          <DetailChart
            kind="bars"
            points={sleep.spo2}
            from={sleep.spo2[0].at}
            to={sleep.spo2.at(-1)!.at + 3_600_000}
            domain={[80, 100]}
            color="var(--mood-low)"
            format={pct}
            ticks={nightTicks.length ? [{ t: sleep.spo2[0].at, label: nightTicks[0].label }, { t: sleep.spo2.at(-1)!.at + 3_600_000, label: nightTicks[1].label }] : []}
            label={`Oxygène pendant la nuit : ${sleep.spo2Avg} % en moyenne.`}
          />
        </section>
      {/if}
    {:else}
      <p class="calm">Pas de nuit relevée pour ce jour.</p>
    {/if}
  {:else if tab === 'coeur'}
    {#if heart.points.length}
      <dl class="trio">
        <div><dt>Moyenne</dt><dd>{heart.avg}</dd></div>
        <div><dt>Minimum</dt><dd>{heart.min}</dd></div>
        <div><dt>Maximum</dt><dd>{heart.max}</dd></div>
      </dl>
      <DetailChart
        points={heart.points}
        from={day}
        to={dayEnd}
        mark={adjusted ? wake?.at : null}
        color="var(--heart)"
        format={bpm}
        ticks={dayTicks}
        label={`Pouls du jour : ${heart.avg} bpm en moyenne, de ${heart.min} à ${heart.max}.`}
      />
      <p class="calm">
        {heart.points.length} mesures de la bague. Dernière : {heart.last?.value} bpm à {clock.format(heart.last?.at ?? day)}.
        {#if adjusted && wake}Le pointillé marque ton réveil.{/if}
      </p>
    {:else}
      <p class="calm">Pas de pouls relevé pour ce jour.</p>
    {/if}
  {:else if vital && vitalDay}
    {#if vitalDay.points.length}
      <dl class="trio">
        <div><dt>Moyenne</dt><dd>{vitalDay.avg}</dd></div>
        <div><dt>Minimum</dt><dd>{vitalDay.min}</dd></div>
        <div><dt>Maximum</dt><dd>{vitalDay.max}</dd></div>
      </dl>
      {#key tab}
        <DetailChart
          kind={vital.kind}
          points={vitalDay.points}
          from={day}
          to={dayEnd}
          color={vital.color}
          format={vital.format}
          domain={vital.domain}
          slot={vital.slot}
          gap={vital.gap}
          ticks={dayTicks}
          label={`${vital.name} du jour : ${vitalDay.avg} ${vital.unit} en moyenne, de ${vitalDay.min} à ${vitalDay.max}.`}
        />
      {/key}
      <ul class="stages zones">
        {#each vitalZones as z (z.name)}
          <li>
            <span class="stage-name">{z.name}{#if z.range}<small>{z.range}</small>{/if}</span>
            <span class="stage-time">{z.share} %</span>
            <span class="track"><b style:width="{z.share}%" style:background={vital.color}></b></span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="calm">Pas de mesure pour ce jour.</p>
    {/if}
  {:else if moves.steps > 0}
    <dl class="duo">
      <div><dt>Pas</dt><dd>{moves.steps.toLocaleString('fr-FR')}</dd></div>
      <div><dt>Distance</dt><dd>{formatKm(moves.meters)}</dd></div>
    </dl>
    <DetailChart
      kind="bars"
      points={moves.hours}
      from={day}
      to={dayEnd}
      color="var(--grass)"
      format={steps}
      ticks={dayTicks}
      label={`Pas du jour : ${moves.steps} au total.`}
    />
  {:else}
    <p class="calm">Pas d'activité relevée pour ce jour.</p>
  {/if}
</section>

<style>
  .details {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
    background: var(--surface-2);
  }

  .tabs button {
    min-height: 44px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .tabs button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--fg);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.14);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .big {
    flex: none;
    font-family: var(--font-display);
    font-size: 42px;
    font-weight: 700;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }

  .sub,
  .range,
  .calm {
    color: var(--muted);
    font-size: 15px;
    line-height: 1.3;
  }

  figure {
    margin: 0;
    min-width: 0;
  }

  .readout {
    min-height: 21px;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .phases svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
  }

  .wake {
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 15px;
    line-height: 1.35;
  }

  .wake strong {
    display: block;
    color: var(--fg);
  }

  .phases rect.dim {
    opacity: 0.4;
  }

  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    color: var(--muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .stages {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 9px;
  }

  .stages li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 46px;
    align-items: baseline;
    gap: 3px 10px;
  }

  .stages.zones li {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .stage-name {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 15px;
  }

  .stage-name small {
    color: var(--muted);
    font-size: 14px;
  }

  .stage-name i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .stage-time {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .stage-share {
    color: var(--muted);
    font-size: 14px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .track {
    grid-column: 1 / -1;
    display: block;
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--surface-2);
  }

  .track b {
    display: block;
    height: 100%;
    border-radius: 3px;
  }

  .series {
    display: grid;
    gap: 1px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  h3 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 16px;
  }

  h3 strong {
    flex: none;
    font-family: var(--font-display);
    font-size: 21px;
    font-variant-numeric: tabular-nums;
  }

  .trio,
  .duo {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 0;
  }

  .duo {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .trio div,
  .duo div {
    display: grid;
    justify-items: center;
    gap: 1px;
    padding: 4px;
    border-left: 1px solid var(--line);
  }

  .trio div:first-child,
  .duo div:first-child {
    border-left: 0;
  }

  dt {
    order: 2;
    color: var(--muted);
    font-size: 14px;
  }

  dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
