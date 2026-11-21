<script lang="ts">
  // Affiche le renard en 3D. three.js et le modèle sont chargés à la demande,
  // pour que l'appli s'ouvre vite même avant que le renard soit prêt.
  import { onMount } from 'svelte';
  import type { FoxScene } from '../fox/FoxScene';
  import { MOODS, type MoodId } from '../fox/moods';

  let {
    mood,
    compact = false,
    reactSignal = 0,
    guide = null,
    calm = false,
    pulse = 0
  }: {
    mood: MoodId;
    /** Scène moins haute, pour laisser la place au check-in. */
    compact?: boolean;
    /** Scène un peu moins haute, pour que le guide de respiration tienne sur l'écran. */
    calm?: boolean;
    /** Chaque changement de ce nombre fait réagir le renard. */
    reactSignal?: number;
    /** Respiration guidée : air dans les poumons (0 à 1), lu à chaque image. */
    guide?: (() => number) | null;
    /** Le pouls qui monte (0 à 1) : il s'agite sans changer d'humeur. */
    pulse?: number;
  } = $props();

  let host: HTMLDivElement;
  let scene = $state.raw<FoxScene | null>(null);
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let progress = $state(0);

  const portrait = `${import.meta.env.BASE_URL}renard-portrait.png`;
  const modelUrl = `${import.meta.env.BASE_URL}models/fox.glb`;

  function webglAvailable(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  onMount(() => {
    let cancelled = false;
    if (!webglAvailable()) {
      status = 'error';
      return;
    }
    import('../fox/FoxScene')
      .then(({ FoxScene }) =>
        FoxScene.create(host, {
          modelUrl,
          mood,
          onProgress: (f) => (progress = f)
        })
      )
      .then((s) => {
        if (cancelled) return s.dispose();
        scene = s;
        if (import.meta.env.DEV) (window as unknown as { __foxScene: FoxScene }).__foxScene = s;
        status = 'ready';
      })
      .catch((e) => {
        console.error('Le renard 3D ne peut pas s’afficher :', e);
        if (!cancelled) status = 'error';
      });
    return () => {
      cancelled = true;
      if (import.meta.env.DEV) delete (window as unknown as { __foxScene?: FoxScene }).__foxScene;
      scene?.dispose();
      scene = null;
    };
  });

  $effect(() => {
    // Lire l'humeur avant tout : avec `scene?.setMood(mood)`, elle ne serait pas suivie tant que la scène charge.
    const next = mood;
    scene?.setMood(next);
  });

  $effect(() => {
    const next = guide;
    scene?.setGuide(next);
  });

  $effect(() => {
    const next = pulse;
    scene?.setPulse(next);
  });

  let lastSignal = 0;
  $effect(() => {
    const signal = reactSignal;
    if (signal !== lastSignal && scene) {
      lastSignal = signal;
      // Laisse d'abord l'humeur commencer à changer, puis il réagit
      setTimeout(() => scene?.react(), 350);
    }
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scene?.react();
    }
  }
</script>

<div
  class="stage"
  class:ready={status === 'ready'}
  class:compact
  class:calm
  role="img"
  aria-label={`Ton renard. ${MOODS[mood].caption}`}
>
  <div class="canvas" bind:this={host}></div>

  {#if status !== 'ready'}
    <img class="placeholder" src={portrait} alt="" width="512" height="512" />
  {/if}

  {#if status === 'loading'}
    <div class="loading" aria-live="polite">
      <span>Ton renard arrive…</span>
      <span class="bar"><span style:width={`${Math.round(progress * 100)}%`}></span></span>
    </div>
  {:else if status === 'ready'}
    <!-- Bouton invisible pour que le renard réagisse aussi au clavier et aux lecteurs d'écran -->
    <button class="pet" type="button" onkeydown={onKey} onclick={(e) => e.detail === 0 && scene?.react()}>
      Caresser le renard
    </button>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    border-radius: var(--radius);
    background: linear-gradient(var(--sky-top), var(--sky-bottom));
    height: min(54vh, 112vw, 600px);
    width: 100%;
    overflow: hidden;
    isolation: isolate;
    transition: height 0.4s ease;
  }

  .stage.compact {
    height: min(36vh, 320px);
  }

  .stage.calm {
    height: min(calc(100svh - var(--nav-h) - 390px), 112vw, 560px);
    min-height: 240px;
  }

  @media (prefers-reduced-motion: reduce) {
    .stage {
      transition: none;
    }
  }

  .canvas {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.6s ease;
  }

  .ready .canvas {
    opacity: 1;
  }

  .placeholder {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: auto;
    height: auto;
    max-width: 92%;
    max-height: 100%;
    pointer-events: none;
  }

  .loading {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 10px 16px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 80%, transparent);
    font-size: 14px;
    color: var(--fg);
  }

  .bar {
    width: 140px;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }

  .pet {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
    padding: 0;
  }
</style>
