<script lang="ts">
  // Sous chaque graphique : la plage affichée et des boutons, pour ne pas dépendre du geste à deux doigts.
  import { clampView, isWhole, MIN_SPAN, panBy, zoomAt, type Span } from '../lib/chartZoom';

  interface Props {
    view: Span;
    bounds: Span;
    minSpan?: number;
    /** Ce que montre le graphique, pour nommer les boutons. */
    name: string;
    onview: (view: Span) => void;
  }

  let { view, bounds, minSpan = MIN_SPAN, name, onview }: Props = $props();

  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const whole = $derived(isWhole(view, bounds));
  const tightest = $derived(view.to - view.from <= Math.min(minSpan, bounds.to - bounds.from) + 1000);
  const middle = $derived((view.from + view.to) / 2);

  const zoom = (factor: number) => onview(zoomAt(view, bounds, middle, factor, minSpan));
  const move = (share: number) => onview(panBy(view, bounds, share, minSpan));
  const reset = () => onview(clampView(bounds, bounds, minSpan));
</script>

<div class="bar">
  <p class="where" aria-live="polite">
    {#if whole}
      <span class="hint">Écarte deux doigts pour zoomer</span>
    {:else}
      <span class="range">De {clock.format(view.from)} à {clock.format(view.to)}</span>
      <button type="button" class="all" onclick={reset}>Tout voir</button>
    {/if}
  </p>
  <div class="keys" role="group" aria-label="Plage de temps : {name}">
    {#if !whole}
      <button type="button" aria-label="Plus tôt" disabled={view.from <= bounds.from} onclick={() => move(-0.5)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <button type="button" aria-label="Plus tard" disabled={view.to >= bounds.to} onclick={() => move(0.5)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    {/if}
    <button type="button" aria-label="Élargir la plage" disabled={whole} onclick={() => zoom(2)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
    </button>
    <button type="button" aria-label="Rapprocher" disabled={tightest} onclick={() => zoom(0.5)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
    </button>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 2px;
  }

  .where {
    display: grid;
    min-width: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.25;
  }

  .range {
    color: var(--fg);
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .all {
    justify-self: start;
    min-height: 24px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .keys {
    display: flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    border-radius: 12px;
    background: var(--surface-2);
  }

  .keys button {
    display: grid;
    place-items: center;
    width: 42px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }

  .keys button:disabled {
    color: var(--muted);
    opacity: 0.4;
    cursor: default;
  }

  .keys svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
