<script lang="ts">
  // Une petite courbe ou des barres, à lire au doigt : une valeur par point, sans lissage.
  import type { Point } from '../lib/dayDetail';

  interface Props {
    points: Point[];
    from: number;
    to: number;
    kind?: 'line' | 'bars';
    color: string;
    format: (v: number) => string;
    /** Résumé lu par les lecteurs d'écran. */
    label: string;
    ticks: { t: number; label: string }[];
    /** Échelle imposée ; sinon, calée sur les valeurs. */
    domain?: [number, number];
    /** Durée couverte par une barre. */
    slot?: number;
    /** Au-delà de ce trou entre deux mesures, la courbe s'interrompt. */
    gap?: number;
    /** Un instant à repérer par un trait vertical. */
    mark?: number | null;
  }

  let { points, from, to, kind = 'line', color, format, label, ticks, domain, slot = 3_600_000, gap = 20 * 60_000, mark = null }: Props = $props();

  const W = 340;
  const H = 140;
  const PAD = { left: 32, right: 6, top: 8, bottom: 22 };

  let picked = $state<Point | null>(null);
  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const scale = $derived.by((): [number, number] => {
    if (domain) return domain;
    const v = points.map((p) => p.value);
    if (kind === 'bars') return [0, Math.max(10, Math.ceil(Math.max(...v, 0) * 1.1))];
    const lo = Math.floor(Math.min(...v) - 4);
    const hi = Math.ceil(Math.max(...v) + 4);
    return [Math.max(0, lo), Math.max(hi, lo + 10)];
  });

  const x = (t: number) => PAD.left + ((t - from) / (to - from || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => {
    const [lo, hi] = scale;
    const clamped = Math.max(lo, Math.min(hi, v));
    return H - PAD.bottom - ((clamped - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  };

  const line = $derived.by(() => {
    let d = '';
    let previous: number | null = null;
    for (const p of points) {
      d += `${previous == null || p.at - previous > gap ? 'M' : 'L'}${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`;
      previous = p.at;
    }
    return d;
  });

  const barWidth = $derived(Math.max(3, (slot / (to - from || 1)) * (W - PAD.left - PAD.right) - 2));
  const levels = $derived([scale[0], Math.round((scale[0] + scale[1]) / 2), scale[1]]);
  const center = (p: Point) => (kind === 'bars' ? p.at + slot / 2 : p.at);

  function read(e: PointerEvent) {
    if (!points.length) return;
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = from + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (to - from);
    picked = points.reduce((a, b) => (Math.abs(center(b) - t) < Math.abs(center(a) - t) ? b : a));
  }

  const anchor = (t: number) => (x(t) < PAD.left + 16 ? 'start' : x(t) > W - PAD.right - 16 ? 'end' : 'middle');
</script>

<figure>
  <p class="readout" aria-live="off">{picked ? `${clock.format(picked.at)} : ${format(picked.value)}` : ''}</p>
  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label={label}
    onpointermove={read}
    onpointerdown={read}
    onpointerleave={() => (picked = null)}
  >
    {#each levels as v (v)}
      <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
      <text class="tick" x={PAD.left - 5} y={y(v) + 4} text-anchor="end">{v}</text>
    {/each}
    {#if mark != null}
      <line class="mark" x1={x(mark)} x2={x(mark)} y1={PAD.top} y2={H - PAD.bottom} />
    {/if}
    {#if kind === 'bars'}
      {#each points as p (p.at)}
        <rect
          class:dim={picked != null && picked.at !== p.at}
          x={x(p.at) + 1}
          y={y(p.value)}
          width={barWidth}
          height={Math.max(2, H - PAD.bottom - y(p.value))}
          rx="2"
          style:fill={color}
        />
      {/each}
    {:else}
      <path d={line} style:stroke={color} />
      {#if points.length <= 12}
        {#each points as p (p.at)}
          <circle class="point" cx={x(p.at)} cy={y(p.value)} r="3.5" style:fill={color} />
        {/each}
      {/if}
    {/if}
    {#if picked}
      <line class="cursor" x1={x(center(picked))} x2={x(center(picked))} y1={PAD.top} y2={H - PAD.bottom} />
      {#if kind === 'line'}
        <circle class="point" cx={x(picked.at)} cy={y(picked.value)} r="5" style:fill={color} />
      {/if}
    {/if}
    {#each ticks as k (k.t)}
      <text class="tick" x={x(k.t)} y={H - 6} text-anchor={anchor(k.t)}>{k.label}</text>
    {/each}
  </svg>
</figure>

<style>
  figure {
    margin: 0;
    min-width: 0;
  }

  .readout {
    min-height: 21px;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  path {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .point {
    stroke: var(--bg);
    stroke-width: 2;
  }

  .cursor {
    stroke: var(--fg);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .mark {
    stroke: var(--fg);
    stroke-width: 1.5;
    stroke-dasharray: 5 4;
    opacity: 0.75;
  }

  rect.dim {
    opacity: 0.4;
  }
</style>
