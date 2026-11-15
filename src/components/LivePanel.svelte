<script lang="ts">
  // « En direct » : pouls, variabilité et conductance de la peau, seconde après seconde.
  // Tant qu'aucun capteur n'est branché, une démo avec des valeurs simulées (toujours signalée comme telle).
  import { isAndroidApp } from '../lib/android';
  import { live, resumeDemoIfWanted, setDemoArousal, startDemo, stopLive } from '../lib/live.svelte';
  import { journal } from '../lib/journal.svelte';

  const inApp = isAndroidApp();

  // La démo reprend si elle était allumée à la dernière visite
  resumeDemoIfWanted();

  $effect(() => {
    setDemoArousal(journal.last?.mood ?? null, journal.last?.energy ?? null);
  });

  const W = 300;
  const H = 64;

  /** La courbe du pouls des deux dernières minutes. */
  const curve = $derived.by(() => {
    const pts = live.hrSeries;
    if (pts.length < 2) return null;
    // Fenêtre de 2 minutes ; au début, la courbe part de la gauche et avance
    const start = Math.max(pts[0][0], pts[pts.length - 1][0] - 120_000);
    let min = Infinity;
    let max = -Infinity;
    for (const [, v] of pts) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const pad = Math.max(4, (max - min) * 0.2);
    min -= pad;
    max += pad;
    const line = pts
      .map(([t, v]) => `${(((t - start) / 120_000) * W).toFixed(1)},${(H - ((v - min) / (max - min)) * H).toFixed(1)}`)
      .join(' ');
    return { line, min: Math.round(min + pad), max: Math.round(max - pad) };
  });

  const beat = $derived(live.hr ? `${(60 / live.hr).toFixed(2)}s` : '1s');
  const fmt = (v: number, digits = 0) => v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
</script>

<section class="live" aria-labelledby="live-title">
  <header>
    <h2 id="live-title"><span class="dot" class:on={live.running}></span>En direct</h2>
    {#if live.running && live.source?.simulated}
      <span class="badge">Démo · valeurs simulées</span>
    {/if}
  </header>

  {#if live.running}
    <div class="tiles">
      <div class="tile heart">
        <svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true" style:animation-duration={beat}>
          <path d="M12 20.5s-7.5-4.6-9.2-9.6C1.6 7.3 4 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4 20 4 22.4 7.3 21.2 10.9c-1.7 5-9.2 9.6-9.2 9.6z" />
        </svg>
        <p class="value">{live.hr ?? '…'}</p>
        <p class="unit">battements / min</p>
        <p class="label">Pouls</p>
      </div>
      <div class="tile">
        <p class="value">{live.hrv != null ? fmt(live.hrv) : '…'}</p>
        <p class="unit">ms</p>
        <p class="label">Variabilité</p>
      </div>
      <div class="tile">
        <p class="value">{live.gsr != null ? fmt(live.gsr, 1) : '…'}</p>
        <p class="unit">µS</p>
        <p class="label">Peau</p>
      </div>
    </div>

    {#if curve}
      <figure class="curve">
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Pouls des deux dernières minutes">
          <polyline points={curve.line} />
        </svg>
        <figcaption>
          <span>Pouls, 2 dernières minutes</span>
          <span>{curve.min}–{curve.max}</span>
        </figcaption>
      </figure>
    {/if}

    <p class="note">
      Valeurs inventées pour essayer l'affichage{#if inApp}, ici et sur le widget (une notification le rappelle quand
      l'appli est fermée){/if}. La variabilité est l'écart
      entre deux battements (RMSSD) ; « peau » est sa conductance (GSR). Ta ceinture et ton boîtier prendront le relais.
    </p>
    <button type="button" class="stop" onclick={stopLive}>Arrêter la démo</button>
  {:else}
    <p class="intro">
      Quand ta ceinture cardio et ton boîtier seront branchés, ton pouls, sa variabilité et la conductance de ta peau
      s'afficheront ici en direct{#if inApp}, et sur le widget{/if}.
    </p>
    {#if live.error}
      <p class="error" role="alert">{live.error}</p>
    {/if}
    <button type="button" class="start" onclick={startDemo}>Essayer avec des valeurs simulées</button>
  {/if}
</section>

<style>
  .live {
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid var(--line);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 10px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--line);
  }

  .dot.on {
    background: var(--heart);
    animation: blink 2s ease-in-out infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.35;
    }
  }

  .badge {
    padding: 2px 10px;
    border-radius: 999px;
    border: 1.5px dashed var(--muted);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  .tiles {
    display: grid;
    grid-template-columns: 1.25fr 1fr 1fr;
    gap: 8px;
  }

  .tile {
    position: relative;
    display: grid;
    align-content: start;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--surface-2);
  }

  .tile.heart {
    background: color-mix(in srgb, var(--heart) 12%, var(--surface));
  }

  .heart-icon {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 22px;
    height: 22px;
    fill: var(--heart);
    animation: beat 1s ease-out infinite;
    transform-origin: center;
  }

  @keyframes beat {
    0%,
    100% {
      transform: scale(0.82);
    }
    12% {
      transform: scale(1.08);
    }
    28% {
      transform: scale(0.9);
    }
    40% {
      transform: scale(1);
    }
  }

  .value {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .heart .value {
    color: var(--heart);
  }

  .unit {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.2;
  }

  .label {
    margin-top: 4px;
    font-weight: 700;
    font-size: 14px;
  }

  .curve {
    margin: 0;
    display: grid;
    gap: 4px;
  }

  .curve svg {
    width: 100%;
    height: 64px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--heart) 5%, transparent);
  }

  polyline {
    fill: none;
    stroke: var(--heart);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  figcaption {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--muted);
  }

  .note,
  .intro {
    font-size: 14px;
    color: var(--muted);
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
    font-size: 15px;
  }

  button {
    min-height: 48px;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .start {
    border: 1.5px solid var(--heart);
    background: color-mix(in srgb, var(--heart) 8%, var(--surface));
    color: var(--heart);
  }

  .stop {
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
  }

  @media (max-width: 360px) {
    .tiles {
      grid-template-columns: 1fr 1fr;
    }
    .tile.heart {
      grid-column: 1 / -1;
    }
  }
</style>
