<script lang="ts">
  // La courbe d'une mesure sur 7, 30 ou 90 jours, avec ton habitude en pointillés.
  import type { DayStat, MetricKey } from '../lib/healthDays';
  import { dayLabel } from '../lib/history';

  interface Props {
    days: DayStat[];
    metric: MetricKey;
    name: string;
    kind: 'bar' | 'line';
    color: string;
    format: (v: number | null) => string;
    habit: number | null;
    selected: number;
    now: number;
    onpick: (day: number) => void;
  }

  let { days, metric, name, kind, color, format, habit, selected, now, onpick }: Props = $props();

  const H = 176;
  const M = { top: 12, right: 44, bottom: 24, left: 2 };

  let width = $state(320);
  let hover = $state<number | null>(null);
  let svg = $state<SVGSVGElement>();

  const W = $derived(Math.max(240, width));
  const plotW = $derived(W - M.left - M.right);
  const base = H - M.bottom;
  const step = $derived(plotW / Math.max(1, days.length));

  const values = $derived(days.map((d) => d[metric]));
  const known = $derived(values.filter((v): v is number => v != null));

  /** Un pas de graduation rond : des heures pour le sommeil, 1, 2 ou 5 × 10ⁿ pour le reste. */
  function niceStep(range: number) {
    if (metric === 'sleep') return [60, 120, 180, 240].find((s) => range / s <= 3) ?? 300;
    const raw = Math.max(range / 3, 1);
    const p = 10 ** Math.floor(Math.log10(raw));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  const domain = $derived.by(() => {
    const all = habit != null ? [...known, habit] : known;
    if (!all.length) return { lo: 0, hi: 1, step: 1 };
    const max = Math.max(...all);
    const min = kind === 'bar' ? 0 : Math.min(...all) - Math.max((max - Math.min(...all)) * 0.12, 1);
    const top = kind === 'bar' ? max : max + Math.max((max - min) * 0.08, 1);
    const step = niceStep(top - min || 1);
    return { lo: Math.max(0, Math.floor(min / step) * step), hi: Math.ceil(top / step) * step, step };
  });

  const y = (v: number) => base - ((v - domain.lo) / (domain.hi - domain.lo || 1)) * (base - M.top);
  const cx = (i: number) => M.left + step * (i + 0.5);

  const line = $derived.by(() => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  /** Barre arrondie en haut, posée sur la base. */
  function bar(i: number, v: number) {
    const w = Math.max(1.5, step - 2);
    const left = cx(i) - w / 2;
    const top = Math.min(y(v), base - 1);
    const r = Math.min(4, w / 2, base - top);
    return `M${left} ${base}V${top + r}Q${left} ${top} ${left + r} ${top}H${left + w - r}Q${left + w} ${top} ${left + w} ${top + r}V${base}Z`;
  }

  const ticks = $derived.by(() => {
    const out: { v: number; y: number }[] = [];
    for (let v = domain.lo; v <= domain.hi + 0.001; v += domain.step) out.push({ v, y: y(v) });
    return out;
  });

  const short = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const selectedIndex = $derived(days.findIndex((d) => d.day === selected));
  const shown = $derived(hover ?? (selectedIndex >= 0 ? selectedIndex : days.length - 1));

  function indexOf(e: PointerEvent) {
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W - M.left;
    return Math.max(0, Math.min(days.length - 1, Math.floor(px / step)));
  }

  let dragging = false;
</script>

<div class="trend" bind:clientWidth={width}>
  <p class="now-reading" aria-live="polite">
    <span>{days[shown] ? dayLabel(days[shown].day, now) : ''}</span>
    <strong>{days[shown] ? format(days[shown][metric]) : '—'}</strong>
  </p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    width={W}
    height={H}
    role="img"
    aria-label="{name} sur {days.length} jours"
    onpointerdown={(e) => {
      dragging = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      hover = indexOf(e);
    }}
    onpointermove={(e) => {
      if (dragging || e.pointerType === 'mouse') hover = indexOf(e);
    }}
    onpointerup={(e) => {
      dragging = false;
      const i = indexOf(e);
      if (i != null && days[i]) onpick(days[i].day);
      hover = null;
    }}
    onpointercancel={() => {
      dragging = false;
      hover = null;
    }}
    onpointerleave={(e) => {
      if (e.pointerType === 'mouse' && !dragging) hover = null;
    }}
  >
    {#each ticks as t, i (i)}
      <line x1={M.left} x2={M.left + plotW} y1={t.y} y2={t.y} class="grid" />
      <text x={W - 2} y={t.y + 4} text-anchor="end" class="axis">{format(Math.round(t.v))}</text>
    {/each}

    {#if kind === 'bar'}
      {#each values as v, i (days[i].day)}
        {#if v != null}
          <path d={bar(i, v)} style="fill: {color}" fill-opacity={i === shown ? 1 : 0.5} />
        {/if}
      {/each}
    {:else}
      <path d={line} class="series" style="stroke: {color}" />
      {#each values as v, i (days[i].day)}
        {#if v != null && (values[i - 1] == null && values[i + 1] == null)}
          <circle cx={cx(i)} cy={y(v)} r="3" style="fill: {color}" />
        {/if}
      {/each}
      {#if values[shown] != null}
        <circle cx={cx(shown)} cy={y(values[shown]!)} r="5" class="marker" style="fill: {color}" />
      {/if}
    {/if}

    {#if habit != null}
      <line x1={M.left} x2={M.left + plotW} y1={y(habit)} y2={y(habit)} class="habit" />
    {/if}

    <line x1={cx(shown)} x2={cx(shown)} y1={M.top} y2={base} class="cross" />

    {#if days.length}
      <text x={M.left} y={H - 6} class="axis">{short.format(days[0].day)}</text>
      <text x={M.left + plotW} y={H - 6} text-anchor="end" class="axis">{short.format(days[days.length - 1].day)}</text>
    {/if}
  </svg>

  {#if habit != null}
    <p class="legend"><i></i>Ton habitude : {format(Math.round(habit))}</p>
  {/if}

  <details>
    <summary>Voir les valeurs</summary>
    <table>
      <thead>
        <tr><th scope="col">Jour</th><th scope="col">{name}</th></tr>
      </thead>
      <tbody>
        {#each [...days].reverse() as d (d.day)}
          {#if d[metric] != null}
            <tr><th scope="row">{dayLabel(d.day, now)}</th><td>{format(d[metric])}</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </details>
</div>

<style>
  .trend {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .now-reading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    color: var(--muted);
    font-size: 14px;
  }

  .now-reading span::first-letter {
    text-transform: uppercase;
  }

  .now-reading span {
    display: inline-block;
  }

  .now-reading strong {
    color: var(--fg);
    font-size: 17px;
    font-variant-numeric: tabular-nums;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
    cursor: crosshair;
    user-select: none;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .axis {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .series {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .marker {
    stroke: var(--surface);
    stroke-width: 2;
  }

  .habit {
    stroke: var(--fg);
    stroke-width: 1.5;
    stroke-dasharray: 2 4;
    stroke-linecap: round;
  }

  .cross {
    stroke: var(--muted);
    stroke-opacity: 0.5;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 14px;
  }

  .legend i {
    width: 20px;
    border-top: 2px dotted var(--fg);
  }

  details {
    color: var(--muted);
    font-size: 14px;
  }

  summary {
    min-height: 36px;
    padding-top: 6px;
    cursor: pointer;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 5px 0;
    border-top: 1px solid var(--line);
    text-align: left;
    font-weight: 400;
  }

  td,
  thead th:last-child {
    text-align: right;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }
</style>
