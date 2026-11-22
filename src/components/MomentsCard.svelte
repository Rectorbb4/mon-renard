<script lang="ts">
  // Autour de tes moments : le pouls des 10 secondes avant le geste et des 10 secondes après,
  // moment par moment ou tous ensemble, avec ce qu'on sait d'autre sur chacun.
  import type { CheckIn, FeltEvent, HealthSample, SleepNight } from '../data/types';
  import {
    medianCurve,
    momentContext,
    momentPattern,
    momentStats,
    patternText,
    PATTERN_MIN,
    relativeCurve
  } from '../lib/moments';

  interface Props {
    events: FeltEvent[];
    samples: HealthSample[];
    checkins: CheckIn[];
    nights: SleepNight[];
  }

  let { events, samples, checkins, nights }: Props = $props();

  const LIST_MAX = 5;
  const W = 340;
  const H = 168;
  const PAD = { left: 34, right: 8, top: 10, bottom: 24 };
  /** Au-delà de ce trou entre deux mesures, la courbe s'interrompt. */
  const GAP_MS = 6000;

  const captured = $derived(events.filter((e) => e.capture).sort((a, b) => b.at - a.at));
  const measured = $derived(captured.filter((e) => e.capture!.hr.length > 0));
  const pattern = $derived(momentPattern(measured.map((e) => e.capture!)));

  let pickedAt = $state<number | null>(null);
  let showAll = $state(false);
  let readout = $state<string | null>(null);

  const picked = $derived(captured.find((e) => e.at === pickedAt) ?? null);
  /** Le moment affiché seul ; sinon, tous les moments ensemble. */
  const single = $derived(picked ?? (measured.length === 1 ? measured[0] : null));
  const stats = $derived(single?.capture ? momentStats(single.capture) : null);
  const context = $derived(single ? momentContext(single.at, { samples, checkins, nights }) : []);
  const visible = $derived(showAll ? captured : captured.slice(0, LIST_MAX));

  const curves = $derived(measured.map((e) => relativeCurve(e.capture!)).filter((c) => c.length));
  const middle = $derived(medianCurve(curves));

  const scale = $derived.by(() => {
    if (single?.capture?.hr.length) {
      const v = single.capture.hr.map(([, x]) => x);
      const lo = Math.floor(Math.min(...v) - 3);
      const hi = Math.ceil(Math.max(...v) + 3);
      return { lo, hi: Math.max(hi, lo + 10) };
    }
    const v = curves.flat().map(([, x]) => Math.abs(x));
    const span = Math.ceil(Math.max(6, ...v));
    return { lo: -span, hi: span };
  });

  const x = (t: number) => PAD.left + ((t + 10_000) / 20_000) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - ((v - scale.lo) / (scale.hi - scale.lo)) * (H - PAD.top - PAD.bottom);

  function path(points: [number, number][]) {
    let d = '';
    let previous: number | null = null;
    for (const [t, v] of points) {
      const jump = previous == null || t - previous > GAP_MS;
      d += `${jump ? 'M' : 'L'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`;
      previous = t;
    }
    return d;
  }

  const ticks = $derived(single ? [scale.lo, Math.round((scale.lo + scale.hi) / 2), scale.hi] : [scale.lo, 0, scale.hi]);
  const tickLabel = (v: number) => (single ? String(v) : v > 0 ? `+${v}` : String(v));
  const secondLabel = (t: number) => {
    const s = Math.round(t / 1000);
    return s === 0 ? 'au geste' : s < 0 ? `${-s} s avant` : `${s} s après`;
  };

  function read(e: PointerEvent) {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = ((px - PAD.left) / (W - PAD.left - PAD.right)) * 20_000 - 10_000;
    const list: [number, number][] = single?.capture ? single.capture.hr : middle;
    if (!list.length) return;
    const near = list.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a));
    const value = single ? `${Math.round(near[1])} bpm` : `${near[1] > 0 ? '+' : ''}${Math.round(near[1])} bpm`;
    readout = `${secondLabel(near[0])} : ${value}`;
  }

  const when = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const bpm = (v: number | null) => (v == null ? 'pas de mesure' : `${Math.round(v)} bpm`);
  const ms = (v: number | null) => (v == null ? 'pas assez de battements' : `${Math.round(v)} ms`);

  function rowText(e: FeltEvent) {
    const s = momentStats(e.capture!);
    if (s.before != null && s.after != null) return `${Math.round(s.before)} puis ${Math.round(s.after)} bpm`;
    if (s.before != null) return `${Math.round(s.before)} bpm avant`;
    if (s.after != null) return `${Math.round(s.after)} bpm après`;
    return 'Sans mesure';
  }

  const chartLabel = $derived(
    single && stats
      ? `Pouls autour du moment : ${bpm(stats.before)} avant le geste, ${bpm(stats.after)} après.`
      : `Écart de pouls autour de ${curves.length} moments, chacun comparé à son pouls d'avant le geste.`
  );
</script>

<section class="moments" aria-labelledby="moments-title">
  <h2 id="moments-title">Autour de tes moments</h2>

  {#if !captured.length}
    <p class="calm">
      Quand tu tapotes trois fois ta bague, ton renard garde ton pouls des 10 secondes d'avant et des 10 secondes
      d'après. Ton premier moment apparaîtra ici.
    </p>
  {:else}
    <p class="lead" role="status">{patternText(pattern)}</p>

    {#if single && !single.capture?.hr.length}
      <p class="calm">Aucun capteur ne mesurait ton pouls à ce moment-là.</p>
    {:else if measured.length}
      <figure>
        <figcaption>
          <span>{single ? when.format(single.at) : 'Tous tes moments, comparés à leur pouls d’avant'}</span>
          <span class="readout" aria-live="off">{readout ?? ''}</span>
        </figcaption>
        <svg
          viewBox="0 0 {W} {H}"
          role="img"
          aria-label={chartLabel}
          onpointermove={read}
          onpointerdown={read}
          onpointerleave={() => (readout = null)}
        >
          <rect class="after-band" x={x(0)} y={PAD.top} width={x(10_000) - x(0)} height={H - PAD.top - PAD.bottom} />
          {#each ticks as t (t)}
            <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text class="tick" x={PAD.left - 5} y={y(t) + 4} text-anchor="end">{tickLabel(t)}</text>
          {/each}
          <line class="gesture" x1={x(0)} x2={x(0)} y1={PAD.top} y2={H - PAD.bottom} />
          {#if single?.capture}
            <path class="line" d={path(single.capture.hr)} />
            {#if single.capture.hr.length <= 8}
              {#each single.capture.hr as [t, v] (t)}
                <circle class="dot" cx={x(t)} cy={y(v)} r="4" />
              {/each}
            {/if}
          {:else}
            {#each curves as c, i (i)}
              <path class="faint" d={path(c)} />
            {/each}
            <path class="line" d={path(middle)} />
          {/if}
          <text class="tick" x={PAD.left} y={H - 7}>10 s avant</text>
          <text class="tick strong" x={x(0)} y={H - 7} text-anchor="middle">geste</text>
          <text class="tick" x={W - PAD.right} y={H - 7} text-anchor="end">10 s après</text>
        </svg>
        {#if !single}
          <p class="legend">
            <span><i class="key mid"></i> le milieu de tes moments</span>
            <span><i class="key thin"></i> chaque moment</span>
          </p>
        {/if}
      </figure>
    {/if}

    {#if single && stats}
      {#if single.note}<p class="quote">« {single.note} »</p>{/if}
      <dl class="facts">
        {#if single.capture?.hr.length}
          <div><dt>Mesuré par</dt><dd>{single.capture.source === 'bague' ? 'la bague, approximatif' : 'la ceinture'}</dd></div>
          <div><dt>Pouls avant</dt><dd>{bpm(stats.before)}</dd></div>
          <div><dt>Pouls après</dt><dd>{bpm(stats.after)}</dd></div>
        {/if}
        {#if single.capture?.rr.length}
          <div><dt>Variabilité avant</dt><dd>{ms(stats.hrvBefore)}</dd></div>
          <div><dt>Variabilité après</dt><dd>{ms(stats.hrvAfter)}</dd></div>
        {/if}
        {#each context as c (c.label)}
          <div><dt>{c.label}</dt><dd>{c.value}</dd></div>
        {/each}
      </dl>
    {/if}

    <ul class="list">
      {#each visible as e (e.at)}
        <li>
          <button type="button" aria-pressed={single?.at === e.at} onclick={() => (pickedAt = pickedAt === e.at ? null : e.at)}>
            <span class="row-main">
              <span class="row-when">{when.format(e.at)}</span>
              {#if e.note}<span class="row-note">{e.note}</span>{/if}
            </span>
            <span class="row-value">{rowText(e)}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if captured.length > LIST_MAX}
      <button type="button" class="more" onclick={() => (showAll = !showAll)}>
        {showAll ? 'Voir moins' : `Voir les ${captured.length - LIST_MAX} autres`}
      </button>
    {/if}

    <p class="note">
      La vibration de la pause peut faire bouger ton pouls juste après le geste : pour anticiper, regarde surtout la
      partie d'avant.{#if pattern.count >= PATTERN_MIN} Une tendance sur quelques moments reste une piste à confirmer, pas une certitude.{/if}
    </p>
  {/if}
</section>

<style>
  .moments {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  h2 {
    font-size: 22px;
  }

  .calm,
  .note {
    color: var(--muted);
    font-size: 15px;
  }

  .note {
    font-size: 14px;
  }

  .lead {
    font-size: 17px;
    line-height: 1.35;
  }

  figure {
    display: grid;
    gap: 4px;
    margin: 0;
    min-width: 0;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    min-height: 20px;
    color: var(--muted);
    font-size: 14px;
  }

  figcaption span:first-child::first-letter {
    text-transform: uppercase;
  }

  .readout {
    color: var(--fg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
  }

  .after-band {
    fill: var(--surface-2);
    opacity: 0.55;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .gesture {
    stroke: var(--felt);
    stroke-width: 2;
    stroke-dasharray: 4 3;
  }

  .tick {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .tick.strong {
    fill: var(--felt);
    font-weight: 700;
  }

  .line,
  .faint {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .line {
    stroke: var(--heart);
    stroke-width: 2.5;
  }

  .faint {
    stroke: var(--muted);
    stroke-width: 1;
    opacity: 0.4;
  }

  .dot {
    fill: var(--heart);
    stroke: var(--bg);
    stroke-width: 2;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    color: var(--muted);
    font-size: 13px;
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .key {
    display: inline-block;
    width: 18px;
    border-radius: 2px;
  }

  .key.mid {
    height: 3px;
    background: var(--heart);
  }

  .key.thin {
    height: 1px;
    background: var(--muted);
  }

  .quote {
    padding-left: 12px;
    border-left: 3px solid var(--felt);
    font-size: 16px;
  }

  .facts {
    display: grid;
    margin: 0;
    border-top: 1px solid var(--line);
  }

  .facts div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 2px;
    border-bottom: 1px solid var(--line);
  }

  .facts dt {
    color: var(--muted);
    font-size: 15px;
  }

  .facts dd {
    margin: 0;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .list {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .list button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    padding: 7px 12px;
    border: 1.5px solid transparent;
    border-radius: 12px;
    background: var(--surface);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }

  .list button[aria-pressed='true'] {
    border-color: var(--felt);
  }

  .row-main {
    display: grid;
    min-width: 0;
  }

  .row-when {
    font-size: 15px;
    font-weight: 700;
  }

  .row-when::first-letter {
    text-transform: uppercase;
  }

  .row-note {
    overflow: hidden;
    color: var(--muted);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-value {
    flex: none;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .more {
    justify-self: start;
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--fg);
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
