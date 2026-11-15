<script lang="ts">
  // Les trois jauges du renard, façon animal de compagnie, d'après le dernier check-in.
  // L'humeur est centrée : l'équilibre est au milieu, la barre part à gauche (plus bas) ou à droite (plus haut).
  import type { GaugeValues } from '../lib/gauges';
  import { moodFill } from '../lib/gauges';

  let { values }: { values: GaugeValues } = $props();

  const fill = $derived(moodFill(values.mood));
  const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
</script>

<div class="gauges" class:stale={values.stale}>
  <div class="gauge" role="meter" aria-label="Humeur" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={values.mood} aria-valuetext={values.moodWord}>
    <svg class="icon mood-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1.2" class="dot" />
      <circle cx="15" cy="10" r="1.2" class="dot" />
      <path d="M8.5 14.5q3.5 3 7 0" />
    </svg>
    <span class="name">Humeur</span>
    <span class="track centered">
      <span class="calm-zone"></span>
      <span class="fill {fill.side}" style:left="{fill.from}%" style:width="{fill.width}%"></span>
      <span class="mid"></span>
    </span>
    <span class="word">{values.moodWord}</span>
  </div>

  <div class="gauge" role="meter" aria-label="Énergie" aria-valuemin={0} aria-valuemax={1} aria-valuenow={values.energy} aria-valuetext={values.energyWord}>
    <svg class="icon energy-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.5 2.5 5.5 13.5h5.5l-1 8 8-11h-5.5z" />
    </svg>
    <span class="name">Énergie</span>
    <span class="track"><span class="fill energy" style:width={pct(values.energy)}></span></span>
    <span class="word">{values.energyWord}</span>
  </div>

  <div
    class="gauge"
    class:empty={values.sleep == null}
    role="meter"
    aria-label="Nuit"
    aria-valuemin={0}
    aria-valuemax={1}
    aria-valuenow={values.sleep ?? 0}
    aria-valuetext={values.sleepWord}
  >
    <svg class="icon sleep-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
    </svg>
    <span class="name">Nuit</span>
    <span class="track"><span class="fill sleep" style:width={pct(values.sleep ?? 0)}></span></span>
    <span class="word">{values.sleepWord}</span>
  </div>

  {#if values.stale}
    <p class="stale-note">Ces jauges datent de ton dernier check-in. Un nouveau les remet à jour.</p>
  {/if}
</div>

<style>
  .gauges {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid var(--line);
  }

  /* Icône à gauche ; à droite, le nom et le mot sur une ligne, la barre dessous */
  .gauge {
    display: grid;
    grid-template-columns: 26px 1fr auto;
    grid-template-areas:
      'icon name word'
      'icon track track';
    align-items: center;
    gap: 2px 10px;
    font-size: 15px;
    line-height: 1.3;
    transition: opacity 0.3s ease;
  }

  .icon {
    grid-area: icon;
  }

  .name {
    grid-area: name;
  }

  .word {
    grid-area: word;
  }

  .track {
    grid-area: track;
  }

  .stale .gauge,
  .gauge.empty {
    opacity: 0.5;
  }

  .icon {
    width: 26px;
    height: 26px;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mood-icon {
    stroke: var(--accent);
  }

  .mood-icon .dot {
    fill: var(--accent);
    stroke: none;
  }

  .energy-icon {
    stroke: var(--energy);
    fill: color-mix(in srgb, var(--energy) 30%, transparent);
  }

  .sleep-icon {
    stroke: var(--sleep);
    fill: color-mix(in srgb, var(--sleep) 25%, transparent);
  }

  .name {
    font-weight: 700;
  }

  .word {
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }

  .track {
    position: relative;
    height: 10px;
    margin-bottom: 2px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-radius: 999px;
    transition:
      width 0.6s cubic-bezier(0.3, 1.3, 0.5, 1),
      left 0.6s cubic-bezier(0.3, 1.3, 0.5, 1);
  }

  .fill.energy {
    background: var(--energy);
  }

  .fill.sleep {
    background: var(--sleep);
  }

  .fill.high {
    background: var(--accent);
    border-radius: 0 999px 999px 0;
  }

  .fill.low {
    background: var(--mood-low);
    border-radius: 999px 0 0 999px;
  }

  /* L'équilibre (humeur entre -0,25 et 0,25) et son milieu */
  .calm-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 37.5%;
    width: 25%;
    background: color-mix(in srgb, var(--breath) 22%, transparent);
  }

  .mid {
    position: absolute;
    top: -2px;
    bottom: -2px;
    left: calc(50% - 1px);
    width: 2px;
    background: var(--fg);
    opacity: 0.55;
  }

  .stale-note {
    margin-top: 2px;
    font-size: 14px;
    color: var(--muted);
  }

</style>
