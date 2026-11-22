<script lang="ts">
  // Le terrier : une journée en coupe, sur un seul axe du temps.
  // Au-dessus du sol, le ciel de l'heure, la crête du pouls, l'herbe des pas, les check-ins.
  // Sous le sol, la nuit creusée comme un terrier : plus le sommeil est profond, plus la galerie descend.
  import type { CheckIn, FeltEvent, HealthSample, SleepNight, SleepStage } from '../data/types';
  import { MOODS, moodFromScore, type MoodId } from '../fox/moods';
  import { clampView, timeTicks, type Span } from '../lib/chartZoom';
  import { stageSegments } from '../lib/healthDays';
  import { addDays } from '../lib/history';
  import { pinch } from '../lib/pinch';
  import ZoomBar from './ZoomBar.svelte';

  interface Props {
    day: number;
    now: number;
    night: SleepNight | null;
    pulse: { at: number; value: number }[];
    steps: HealthSample[];
    checkins: CheckIn[];
    events: FeltEvent[];
    /** Ce qu'on lit quand le doigt n'est pas sur la scène. */
    summary: string;
  }

  let { day, now, night, pulse, steps, checkins, events, summary }: Props = $props();

  const H = 356;
  const G = 192; // ligne du sol
  const DEPTH: Record<SleepStage, number> = { 5: G + 26, 4: G + 56, 2: G + 88, 3: G + 120 };
  const STAGE_COLOR: Record<SleepStage, string> = {
    5: 'var(--stage-awake)',
    4: 'var(--stage-rem)',
    2: 'var(--stage-light)',
    3: 'var(--stage-deep)'
  };
  const STAGE_LABEL: Record<SleepStage, string> = { 5: 'éveillé', 4: 'paradoxal', 2: 'léger', 3: 'profond' };
  const MOOD_COLOR: Record<MoodId, string> = {
    creux: 'var(--mood-low)',
    grisaille: 'color-mix(in srgb, var(--mood-low) 55%, var(--muted))',
    equilibre: 'var(--breath)',
    elan: 'var(--energy)',
    emballement: 'var(--accent)'
  };
  const SKY: [number, string][] = [
    [5, 'night'],
    [9.5, 'day'],
    [16.5, 'day'],
    [21, 'night']
  ];

  let width = $state(360);
  let scrub = $state<number | null>(null);
  let dragging = false;
  let svg = $state<SVGSVGElement>();

  const W = $derived(Math.max(280, width));

  function atHour(d: number, h: number) {
    const x = new Date(d);
    x.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0);
    return x.getTime();
  }

  // Vue « Nuit » : le terrier occupe toute la largeur
  let nightView = $state(false);
  const zoomed = $derived(nightView && night != null);
  // À gauche de la galerie, on garde la place d'écrire les noms des phases
  const LABELS_PX = 70;
  const baseFrom = $derived.by(() => {
    if (zoomed) {
      const span = night!.end - night!.start;
      return night!.start - (span * LABELS_PX) / Math.max(120, W - LABELS_PX - 24);
    }
    const dayStart = atHour(addDays(day, -1), 20);
    return Math.min(dayStart, night ? night.start - (LABELS_PX / W) * 30 * 3600000 : Infinity);
  });
  const baseTo = $derived(zoomed ? night!.end + 25 * 60000 : addDays(day, 1));

  // À deux doigts : une plage plus courte dans la journée ou la nuit affichée
  const MIN_VIEW = 60 * 60000;
  let pinchZoom = $state.raw<Span | null>(null);
  let pinching = $state(false);
  const bounds = $derived({ from: baseFrom, to: baseTo });
  const view = $derived(pinchZoom ? clampView(pinchZoom, bounds, MIN_VIEW) : bounds);
  const closer = $derived(pinchZoom != null);
  const t0 = $derived(view.from);
  const t1 = $derived(view.to);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * W;

  function setView(next: Span) {
    scrub = null;
    pinchZoom = next.from <= bounds.from && next.to >= bounds.to ? null : next;
  }

  const gesture = $derived({
    left: 0,
    right: 1,
    view: () => view,
    bounds: () => bounds,
    minSpan: () => MIN_VIEW,
    onview: setView,
    onpinch: (active: boolean) => {
      pinching = active;
      if (active) {
        dragging = false;
        scrub = null;
      }
    }
  });

  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // --- Ciel ---
  const sky = $derived.by(() => {
    // Passage nuit-jour adouci : sans paliers intermédiaires, on verrait des bandes verticales
    const stops: { t: number; c: string }[] = [];
    const mix = (share: number) => `color-mix(in srgb, var(--scene-day) ${Math.round(share * 100)}%, var(--scene-night))`;
    for (const d of [addDays(day, -1), day]) {
      for (let i = 0; i < SKY.length; i += 2) {
        const [from] = SKY[i];
        const [to] = SKY[i + 1];
        const rising = i === 0;
        for (let k = 0; k <= 8; k++) {
          const p = k / 8;
          const eased = p * p * (3 - 2 * p);
          stops.push({ t: atHour(d, from + (to - from) * p), c: mix(rising ? eased : 1 - eased) });
        }
      }
    }
    const first = stops[0].t;
    const last = stops[stops.length - 1].t;
    return {
      x1: x(first),
      x2: x(last),
      stops: stops.map((s) => ({ offset: (s.t - first) / (last - first), color: s.c }))
    };
  });

  // Lever et coucher : une lueur posée sur l'horizon
  const glows = $derived(
    [addDays(day, -1), day]
      .flatMap((d) => [
        { kind: 'dawn', at: atHour(d, 7) },
        { kind: 'dusk', at: atHour(d, 19) }
      ])
      .filter((g) => g.at > t0 - 3 * 3600000 && g.at < t1 + 3 * 3600000)
      .map((g) => ({ kind: g.kind, x: x(g.at) }))
  );

  const stars = $derived.by(() => {
    const dark = (t: number) =>
      (t >= atHour(addDays(day, -1), 20.5) && t <= atHour(day, 5.5)) || t >= atHour(day, 20.5);
    const rand = (n: number) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 1; i <= 34; i++) {
      // Les étoiles restent à leur place dans le ciel quand on zoome
      const t = baseFrom + rand(i) * (baseTo - baseFrom);
      if (dark(t)) out.push({ x: x(t), y: 8 + rand(i + 50) * 92, r: 0.7 + rand(i + 90) * 0.7 });
    }
    return out;
  });

  // --- Pouls : une crête, moyennée par dix minutes, plus finement quand on se rapproche ---
  const yHr = (b: number) => G - 6 - ((Math.max(40, Math.min(160, b)) - 40) / 120) * (G - 62);

  const ridge = $derived.by(() => {
    const hours = (t1 - t0) / 3600000;
    const size = (hours <= 2 ? 2 : hours <= 6 ? 5 : 10) * 60000;
    const buckets = new Map<number, { sum: number; n: number }>();
    for (const p of pulse) {
      // Un peu au-delà des bords, pour que la courbe sorte du cadre au lieu de s'y arrêter
      if (p.at < t0 - 30 * 60000 || p.at > t1 + 30 * 60000) continue;
      const k = Math.floor(p.at / size) * size;
      const b = buckets.get(k) ?? { sum: 0, n: 0 };
      b.sum += p.value;
      b.n++;
      buckets.set(k, b);
    }
    const pts = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t: t + size / 2, v: b.sum / b.n }));
    const runs: (typeof pts)[] = [];
    for (const p of pts) {
      const run = runs[runs.length - 1];
      if (run && p.t - run[run.length - 1].t <= 45 * 60000) run.push(p);
      else runs.push([p]);
    }
    return runs.map((run) => {
      const line = run.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${yHr(p.v).toFixed(1)}`).join('');
      const area = `${line}L${x(run[run.length - 1].t).toFixed(1)} ${G}L${x(run[0].t).toFixed(1)} ${G}Z`;
      return { line, area };
    });
  });

  // --- Pas : un brin d'herbe par demi-heure ---
  const grass = $derived.by(() => {
    const size = 30 * 60000;
    const bins = new Map<number, number>();
    for (const s of steps) {
      if (s.at < t0 - size || s.at > t1 + size) continue;
      const k = Math.floor(s.at / size) * size;
      bins.set(k, (bins.get(k) ?? 0) + s.value);
    }
    const max = Math.max(400, ...bins.values());
    return [...bins.entries()].map(([t, v]) => ({ x: x(t + size / 2), h: 4 + (v / max) * 26 }));
  });

  // --- Terrier ---
  const segments = $derived(night ? stageSegments(night) : []);

  const tunnel = $derived.by(() => {
    if (!segments.length) return '';
    // Une galerie qui serpente : elle passe au milieu de chaque phase, à la profondeur de cette phase
    const pts = [
      { x: x(segments[0].from), y: G },
      ...segments.map((s) => ({ x: x((s.from + s.to) / 2), y: DEPTH[s.stage] })),
      { x: x(segments[segments.length - 1].to), y: G }
    ];
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const mid = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
      d += `C${mid} ${pts[i - 1].y} ${mid} ${pts[i].y} ${pts[i].x.toFixed(1)} ${pts[i].y}`;
    }
    return d;
  });

  /** La couleur de la galerie change à chaque phase. */
  const stageStops = $derived.by(() => {
    if (!segments.length) return null;
    const from = segments[0].from;
    const span = segments[segments.length - 1].to - from || 1;
    return {
      x1: x(from),
      x2: x(segments[segments.length - 1].to),
      stops: segments.flatMap((s) => [
        { offset: (s.from - from) / span, color: STAGE_COLOR[s.stage] },
        { offset: (s.to - from) / span, color: STAGE_COLOR[s.stage] }
      ])
    };
  });

  /** La chambre du renard : la plus longue phase profonde (ou, à défaut, la plus longue). */
  const den = $derived.by(() => {
    if (!segments.length) return null;
    const deep = segments.filter((s) => s.stage === 3);
    const pool = deep.length ? deep : segments.filter((s) => s.stage !== 5);
    if (!pool.length) return null;
    const best = pool.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
    const at = x((best.from + best.to) / 2);
    // De près, le renard reste dans sa chambre, même si elle sort du cadre
    if (closer) return at > -30 && at < W + 30 ? { x: at, y: DEPTH[best.stage] } : null;
    return { x: Math.max(26, Math.min(W - 26, at)), y: DEPTH[best.stage] };
  });

  const ticks = $derived.by(() => {
    if (closer) return timeTicks(view).filter((k) => k.t > t0 + (t1 - t0) * 0.04 && k.t < t1 - (t1 - t0) * 0.04);
    if (zoomed) {
      const start = new Date(t0);
      start.setMinutes(0, 0, 0);
      const every = t1 - t0 > 9 * 3600000 ? 2 : 1;
      const out: { t: number; label: string }[] = [];
      for (let t = start.getTime() + 3600000; t < t1 - 10 * 60000; t += 3600000) {
        const hour = new Date(t).getHours();
        if (hour % every === 0) out.push({ t, label: hour === 0 ? 'minuit' : `${hour} h` });
      }
      return out;
    }
    const list = [
      { t: atHour(addDays(day, -1), 18), label: '18 h' },
      { t: day, label: 'minuit' },
      { t: atHour(day, 6), label: '6 h' },
      { t: atHour(day, 12), label: 'midi' },
      { t: atHour(day, 18), label: '18 h' }
    ];
    return list.filter((k) => k.t >= t0 + 20 * 60000);
  });

  const isToday = $derived(now >= day && now < baseTo);

  // --- Lecture au doigt ---
  function fromEvent(e: PointerEvent) {
    if (!svg || pinching) return;
    const r = svg.getBoundingClientRect();
    const px = Math.max(0, Math.min(r.width, e.clientX - r.left));
    scrub = t0 + (px / r.width) * (t1 - t0);
  }

  function onDown(e: PointerEvent) {
    if (pinching) return;
    dragging = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    fromEvent(e);
  }

  function onMove(e: PointerEvent) {
    if (dragging || e.pointerType === 'mouse') fromEvent(e);
  }

  function onUp() {
    dragging = false;
  }

  function onCancel() {
    dragging = false;
    scrub = null;
  }

  function onLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse' && !dragging) scrub = null;
  }

  // Changer de jour referme la lecture
  $effect(() => {
    void day;
    scrub = null;
    pinchZoom = null;
  });

  const reading = $derived.by(() => {
    if (scrub == null) return null;
    const at = scrub;
    const parts: string[] = [];
    const seg = segments.find((s) => at >= s.from && at < s.to);
    if (seg) parts.push(seg.stage === 5 ? 'Éveillé dans la nuit' : `Sommeil ${STAGE_LABEL[seg.stage]}`);
    let best: { at: number; value: number } | null = null;
    for (const p of pulse) {
      if (Math.abs(p.at - at) <= 8 * 60000 && (!best || Math.abs(p.at - at) < Math.abs(best.at - at))) best = p;
    }
    if (best) parts.push(`Pouls ${Math.round(best.value)} bpm`);
    const quarter = steps.find((s) => at >= s.at && at < s.at + 15 * 60000);
    if (quarter) parts.push(`${quarter.value.toLocaleString('fr-FR')} pas`);
    const c = checkins.find((k) => Math.abs(k.at - at) <= 25 * 60000);
    if (c) parts.push(`Check-in : ${MOODS[moodFromScore(c.mood)].label.toLowerCase()}`);
    if (events.some((k) => Math.abs(k.at - at) <= 25 * 60000)) parts.push('Moment « je le sens »');
    return { time: clock.format(at), parts: parts.length ? parts : ['Pas de mesure à ce moment'], y: best ? yHr(best.value) : null, seg };
  });

  const valueText = $derived(reading ? `${reading.time} : ${reading.parts.join(', ')}` : summary);
  const figure = $derived(
    night
      ? `Journée en coupe. Nuit de ${clock.format(night.start)} à ${clock.format(night.end)}. ${summary}`
      : `Journée en coupe. ${summary}`
  );
</script>

<figure class="terrier" bind:clientWidth={width}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    width={W}
    height={H}
    role="img"
    aria-label={figure}
    use:pinch={gesture}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onCancel}
    onpointerleave={onLeave}
  >
    <defs>
      <linearGradient id="terrier-sky" gradientUnits="userSpaceOnUse" x1={sky.x1} x2={sky.x2} y1="0" y2="0">
        {#each sky.stops as s, i (i)}
          <stop offset={s.offset} style="stop-color: {s.color}" />
        {/each}
      </linearGradient>
      <linearGradient id="terrier-soil" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" style="stop-color: var(--soil)" />
        <stop offset="1" style="stop-color: var(--soil-deep)" />
      </linearGradient>
      <radialGradient id="terrier-dawn">
        <stop offset="0" style="stop-color: var(--scene-dawn); stop-opacity: 0.95" />
        <stop offset="1" style="stop-color: var(--scene-dawn); stop-opacity: 0" />
      </radialGradient>
      <radialGradient id="terrier-dusk">
        <stop offset="0" style="stop-color: var(--scene-dusk); stop-opacity: 0.95" />
        <stop offset="1" style="stop-color: var(--scene-dusk); stop-opacity: 0" />
      </radialGradient>
      <clipPath id="terrier-horizon"><rect width={W} height={G} /></clipPath>
      <linearGradient id="terrier-later" gradientUnits="userSpaceOnUse" x1={x(now)} x2={x(now) + 26} y1="0" y2="0">
        <stop offset="0" style="stop-color: var(--bg); stop-opacity: 0" />
        <stop offset="1" style="stop-color: var(--bg); stop-opacity: 0.55" />
      </linearGradient>
      {#if stageStops}
        <linearGradient id="terrier-stages" gradientUnits="userSpaceOnUse" x1={stageStops.x1} x2={stageStops.x2} y1="0" y2="0">
          {#each stageStops.stops as s, i (i)}
            <stop offset={s.offset} style="stop-color: {s.color}" />
          {/each}
        </linearGradient>
      {/if}
    </defs>

    <rect width={W} height={G} fill="url(#terrier-sky)" />
    <g clip-path="url(#terrier-horizon)">
      {#each glows as g, i (i)}
        <ellipse cx={g.x} cy={G} rx={Math.max(70, W * 0.2)} ry={G * 0.42} fill="url(#terrier-{g.kind})" />
      {/each}
    </g>
    {#each stars as s, i (i)}
      <circle cx={s.x} cy={s.y} r={s.r} class="star" />
    {/each}

    {#each [60, 100, 140] as b (b)}
      <line x1="0" x2={W} y1={yHr(b)} y2={yHr(b)} class="grid" />
    {/each}

    {#each ridge as r, i (i)}
      <path d={r.area} class="ridge" />
      <path d={r.line} class="pulse" />
    {/each}

    <rect y={G} width={W} height={H - G} fill="url(#terrier-soil)" />
    <line x1="0" x2={W} y1={G} y2={G} class="ground" />

    {#each grass as g, i (i)}
      <line x1={g.x} x2={g.x} y1={G} y2={G - g.h} class="blade" />
    {/each}

    {#if segments.length}
      {#each [5, 4, 2, 3] as const as st (st)}
        <text x="8" y={DEPTH[st] + 4} class="level">{STAGE_LABEL[st]}</text>
      {/each}
      <path d={tunnel} class="tunnel" />
      <path d={tunnel} class="stage" stroke="url(#terrier-stages)" />
      <ellipse cx={x(segments[0].from)} cy={G} rx="10" ry="3.5" class="hole" />
      <ellipse cx={x(segments[segments.length - 1].to)} cy={G} rx="10" ry="3.5" class="hole" />
      {#if den}
        <g transform="translate({den.x} {den.y})" class="den">
          <ellipse rx="25" ry="16" class="chamber" />
          <path class="fox" d="M-15 6C-17-5-7-11 3-10 12-9 17-2 15 4 13 10-12 11-15 6Z" />
          <path class="tail" d="M15 3C11 10-3 11-11 7-4 7 4 6 9 1Z" />
          <path class="fox" d="M-12-1-14-10-8-7-3-10-2-1Z" />
          <path class="eye" d="M-10-2Q-8-.5-6-2" />
        </g>
      {/if}
    {/if}

    {#each ticks as k (k.t)}
      <line x1={x(k.t)} x2={x(k.t)} y1={H - 26} y2={H - 21} class="tick" />
      <text x={Math.max(16, Math.min(W - 18, x(k.t)))} y={H - 7} text-anchor="middle" class="tick-label">{k.label}</text>
    {/each}

    {#each events as e (e.id ?? e.at)}
      {#if e.at >= t0 && e.at <= t1}
        <rect x={x(e.at) - 5} y="33" width="10" height="10" rx="2" transform="rotate(45 {x(e.at)} 38)" class="felt" />
      {/if}
    {/each}
    {#each checkins as c (c.id ?? c.at)}
      {#if c.at >= t0 && c.at <= t1}
        <circle cx={x(c.at)} cy="17" r="6" style="fill: {MOOD_COLOR[moodFromScore(c.mood)]}" class="mark" />
      {/if}
    {/each}

    {#if isToday}
      <rect x={x(now)} width={Math.max(0, W - x(now))} height={G} fill="url(#terrier-later)" />
    {/if}

    {#each [60, 100, 140] as b (b)}
      <text x={W - 6} y={yHr(b) - 3} text-anchor="end" class="grid-label">{b}</text>
    {/each}

    {#if scrub != null && reading}
      <line x1={x(scrub)} x2={x(scrub)} y1="0" y2={H - 28} class="cursor" />
      {#if reading.y != null}
        <circle cx={x(scrub)} cy={reading.y} r="5" class="cursor-dot" />
      {/if}
      {#if reading.seg}
        <circle cx={x(scrub)} cy={DEPTH[reading.seg.stage]} r="5" class="cursor-dot" />
      {/if}
    {/if}
  </svg>

  <input
    type="range"
    class="keys"
    min={t0}
    max={t1}
    step={5 * 60000}
    value={scrub ?? t0}
    aria-label="Moment de la journée"
    aria-valuetext={valueText}
    oninput={(e) => (scrub = Number(e.currentTarget.value))}
    onblur={() => (scrub = null)}
  />

  <div class="readout">
    {#if reading}
      <strong>{reading.time}</strong>
      <span class="facts">
        {#each reading.parts as p (p)}
          <span>{p}</span>
        {/each}
      </span>
      <button type="button" onclick={() => (scrub = null)}>Fermer</button>
    {:else}
      <span class="summary">{summary}</span>
    {/if}
  </div>

  <div class="tools">
    {#if night}
      <div class="zoom" role="group" aria-label="Échelle de la scène">
        <button type="button" aria-pressed={!zoomed} onclick={() => { nightView = false; pinchZoom = null; scrub = null; }}>Journée</button>
        <button type="button" aria-pressed={zoomed} onclick={() => { nightView = true; pinchZoom = null; scrub = null; }}>Nuit</button>
      </div>
    {/if}
    <ZoomBar {view} {bounds} minSpan={MIN_VIEW} name="scène du terrier" onview={setView} />
    <p class="key">
      <span><i class="k-dot"></i>check-in</span>
      <span><i class="k-felt"></i>je le sens</span>
      <span><i class="k-pulse"></i>pouls</span>
      <span><i class="k-grass"></i>pas</span>
    </p>
  </div>
</figure>

<style>
  .terrier {
    position: relative;
    margin: 0 -16px;
    min-width: 0;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: pan-y;
    cursor: crosshair;
    user-select: none;
  }

  .terrier:has(.keys:focus-visible) svg {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }

  .star {
    fill: #fff;
    opacity: 0.75;
  }

  .grid {
    stroke: var(--scene-ink);
    stroke-opacity: 0.12;
    stroke-dasharray: 2 5;
  }

  .grid-label {
    fill: var(--scene-ink);
    fill-opacity: 0.68;
    font-size: 11px;
  }

  .ridge {
    fill: var(--scene-ridge);
    fill-opacity: 0.62;
  }

  .pulse {
    fill: none;
    stroke: var(--heart);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ground {
    stroke: var(--grass);
    stroke-width: 2;
  }

  .blade {
    stroke: var(--grass);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .level {
    fill: var(--soil-ink);
    fill-opacity: 0.8;
    font-size: 12px;
    paint-order: stroke;
    stroke: var(--soil);
    stroke-width: 3px;
  }

  .tunnel {
    fill: none;
    stroke: var(--tunnel);
    stroke-width: 12;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stage {
    fill: none;
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hole,
  .chamber {
    fill: var(--tunnel);
  }

  .fox {
    fill: #e8843f;
  }

  .tail {
    fill: #f7e6d3;
  }

  .eye {
    fill: none;
    stroke: #2a1a10;
    stroke-width: 1.3;
    stroke-linecap: round;
  }

  .tick {
    stroke: var(--soil-ink);
    stroke-opacity: 0.5;
  }

  .tick-label {
    fill: var(--soil-ink);
    font-size: 12px;
  }

  .mark {
    stroke: var(--scene-ring);
    stroke-width: 2;
  }

  .felt {
    fill: var(--felt);
    stroke: var(--scene-ring);
    stroke-width: 2;
  }

  .cursor {
    stroke: var(--fg);
    stroke-width: 1.5;
  }

  .cursor-dot {
    fill: var(--fg);
    stroke: var(--bg);
    stroke-width: 2;
  }

  .keys {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
  }

  .readout {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 68px;
    padding: 10px 16px;
    background: var(--soil-deep);
    color: var(--soil-ink);
    font-size: 15px;
    line-height: 1.35;
  }

  .readout strong {
    flex: none;
    font-family: var(--font-display);
    font-size: 22px;
    color: #fff;
  }

  .facts {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    min-width: 0;
  }

  .summary {
    flex: 1;
  }

  .readout button {
    flex: none;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--soil-ink);
    text-decoration: underline;
    cursor: pointer;
  }

  .tools {
    display: grid;
    gap: 8px;
    padding: 10px 16px 0;
  }

  .zoom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    border-radius: 12px;
    background: var(--surface-2);
  }

  .zoom button {
    min-height: 40px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .zoom button[aria-pressed='true'] {
    background: var(--soil);
    color: #fff;
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px 16px;
    color: var(--muted);
    font-size: 13px;
  }

  .key span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .key i {
    display: inline-block;
  }

  .k-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--breath);
  }

  .k-felt {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: var(--felt);
    transform: rotate(45deg);
  }

  .k-pulse {
    width: 16px;
    height: 2px;
    border-radius: 2px;
    background: var(--heart);
  }

  .k-grass {
    width: 2px;
    height: 12px;
    border-radius: 2px;
    background: var(--grass);
  }

  @media (min-width: 592px) {
    .terrier {
      margin: 0;
      border-radius: var(--radius);
      overflow: hidden;
    }
  }
</style>
