<script lang="ts">
  // Quatre semaines d'un coup d'œil : l'humeur et le corps, jour par jour, chacun par rapport à toi-même.
  import { deviations, formatDuration, type DayStat, type MetricKey } from '../lib/healthDays';
  import { dayLabel } from '../lib/history';
  import { MOODS, moodFromScore } from '../fox/moods';

  interface Props {
    days: DayStat[];
    selected: number;
    now: number;
    onpick: (day: number) => void;
  }

  let { days, selected, now, onpick }: Props = $props();

  const shownDays = $derived(days.slice(-28));

  const rows = $derived.by(() => {
    const dev = (key: MetricKey) => deviations(days, key).slice(-28);
    return [
      { name: 'Humeur', cells: shownDays.map((d) => d.mood) },
      { name: 'Énergie', cells: shownDays.map((d) => (d.energy == null ? null : (d.energy - 0.5) * 2)) },
      { name: 'Sommeil', cells: dev('sleep') },
      { name: 'Activité', cells: dev('steps') },
      { name: 'Stress', cells: dev('stress') },
      { name: 'Pouls repos', cells: dev('restHr') }
    ];
  });

  function fill(v: number | null) {
    if (v == null) return 'transparent';
    const size = Math.abs(v);
    const mix = size < 0.15 ? 0 : size < 0.5 ? 50 : 100;
    if (!mix) return 'var(--dv-mid)';
    return `color-mix(in srgb, var(${v > 0 ? '--dv-high' : '--dv-low'}) ${mix}%, var(--dv-mid))`;
  }

  function describe(d: DayStat) {
    const bits: string[] = [];
    if (d.mood != null) bits.push(`humeur ${MOODS[moodFromScore(d.mood)].label.toLowerCase()}`);
    if (d.sleep != null) bits.push(`${formatDuration(d.sleep)} de sommeil`);
    if (d.steps != null) bits.push(`${d.steps.toLocaleString('fr-FR')} pas`);
    if (d.stress != null) bits.push(`stress ${d.stress}`);
    if (d.restHr != null) bits.push(`pouls au repos ${d.restHr}`);
    return bits.length ? bits.join(', ') : 'rien de noté';
  }

  const short = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const picked = $derived(shownDays.find((d) => d.day === selected) ?? null);
</script>

<div class="weeks">
  <div class="grid" style="--n: {shownDays.length}">
    {#each rows as row (row.name)}
      <span class="name">{row.name}</span>
      <span class="cells">
        {#each row.cells as v, i (shownDays[i].day)}
          <i class:empty={v == null} class:on={shownDays[i].day === selected} style="background: {fill(v)}"></i>
        {/each}
      </span>
    {/each}

    <span></span>
    <span class="dates">
      {#if shownDays.length}
        <span>{short.format(shownDays[0].day)}</span>
        <span>{short.format(shownDays[shownDays.length - 1].day)}</span>
      {/if}
    </span>

    <span class="hits">
      {#each shownDays as d (d.day)}
        <button
          type="button"
          aria-pressed={d.day === selected}
          aria-label="{dayLabel(d.day, now)} : {describe(d)}"
          onclick={() => onpick(d.day)}
        ></button>
      {/each}
    </span>
  </div>

  <p class="scale">
    <span>plus bas</span>
    <i style="background: var(--dv-low)"></i>
    <i style="background: color-mix(in srgb, var(--dv-low) 50%, var(--dv-mid))"></i>
    <i style="background: var(--dv-mid)"></i>
    <i style="background: color-mix(in srgb, var(--dv-high) 50%, var(--dv-mid))"></i>
    <i style="background: var(--dv-high)"></i>
    <span>plus haut</span>
  </p>

  {#if picked}
    <p class="picked"><strong>{dayLabel(picked.day, now)}</strong> : {describe(picked)}.</p>
  {/if}
</div>

<style>
  .weeks {
    display: grid;
    gap: 10px;
  }

  .grid {
    position: relative;
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    align-items: center;
    gap: 3px 6px;
  }

  .name {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.1;
  }

  .cells {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
  }

  .cells i {
    height: 20px;
    border-radius: 3px;
  }

  .cells i.empty {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 60%, transparent);
  }

  .cells i.on {
    outline: 2px solid var(--fg);
    outline-offset: 0;
  }

  .dates {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 12px;
  }

  .hits {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 90px;
    right: 0;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 2px;
  }

  .hits button {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .scale {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--muted);
    font-size: 13px;
  }

  .scale span:first-child {
    margin-right: 5px;
  }

  .scale span:last-child {
    margin-left: 5px;
  }

  .scale i {
    width: 22px;
    height: 10px;
    border-radius: 2px;
  }

  .picked {
    font-size: 15px;
    color: var(--muted);
  }

  .picked strong {
    color: var(--fg);
  }
</style>
