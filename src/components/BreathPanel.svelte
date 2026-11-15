<script lang="ts">
  // Respiration guidée avec le renard : inspirer 4 s, expirer 6 s, pendant 1 à 3 minutes.
  // Le cercle, le texte et le renard suivent la même horloge (src/lib/breathing.ts).
  // Si l'appli passe en arrière-plan, la séance se met en pause toute seule.
  import { onMount } from 'svelte';
  import {
    DURATIONS,
    breathAt,
    formatClock,
    isBreathMinutes,
    sessionMs,
    type BreathMinutes,
    type BreathStage
  } from '../lib/breathing';

  let {
    onguide,
    oncomplete,
    onclose
  }: {
    /** Donne au renard le souffle à suivre, ou `null` pour lui rendre le sien. */
    onguide: (guide: (() => number) | null) => void;
    /** La séance est allée jusqu'au bout. */
    oncomplete: () => void;
    /** Fermer le panneau ; `checkin` ouvre ensuite le check-in. */
    onclose: (next: 'checkin' | null) => void;
  } = $props();

  const KEY_MINUTES = 'mon-renard:respiration-minutes';
  const KEY_VIBRATE = 'mon-renard:respiration-vibreur';
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  function load<T>(key: string, check: (v: unknown) => v is T, fallback: T): T {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      return check(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible : le choix ne sera pas retenu */
    }
  }

  let phase = $state<'choose' | 'run' | 'done'>('choose');
  let minutes = $state<BreathMinutes>(load(KEY_MINUTES, isBreathMinutes, 2));
  let vibrate = $state(load(KEY_VIBRATE, (v): v is boolean => typeof v === 'boolean', true));
  let elapsed = $state(0);
  const s = $derived(breathAt(elapsed, minutes));

  let heading = $state<HTMLHeadingElement>();
  let raf = 0;
  let last = 0;
  let fullness = 0;
  let prevStage: BreathStage | null = null;
  let wakeLock: { release: () => Promise<void> } | null = null;

  // À chaque étape (choix, séance, fin), le titre prend le focus pour les lecteurs d'écran
  $effect(() => {
    heading?.focus({ preventScroll: true });
  });

  onMount(() => {
    return () => {
      cancelAnimationFrame(raf);
      onguide(null);
      releaseWakeLock();
    };
  });

  function pick(m: BreathMinutes) {
    minutes = m;
    save(KEY_MINUTES, m);
  }

  function toggleVibrate() {
    vibrate = !vibrate;
    save(KEY_VIBRATE, vibrate);
  }

  async function keepScreenOn() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  function buzz(pattern: number | number[]) {
    if (!vibrate) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* pas de vibreur */
    }
  }

  function start() {
    elapsed = 0;
    fullness = 0;
    prevStage = null;
    phase = 'run';
    onguide(() => fullness);
    keepScreenOn();
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    // Pas plus de 0,1 s d'un coup : si l'écran s'éteint ou si on change d'appli, la séance attend.
    elapsed += Math.min(100, Math.max(0, now - last));
    last = now;
    const st = breathAt(elapsed, minutes);
    fullness = st.fullness;
    if (st.stage !== prevStage) {
      if (st.stage === 'in') buzz(30);
      else if (st.stage === 'out') buzz([12, 90, 12]);
      prevStage = st.stage;
    }
    if (st.stage === 'done') return finish();
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    cancelAnimationFrame(raf);
    onguide(null);
    releaseWakeLock();
    phase = 'done';
    oncomplete();
  }

  function stop() {
    cancelAnimationFrame(raf);
    onguide(null);
    releaseWakeLock();
    onclose(null);
  }

  // Quand on revient dans l'appli, l'écran doit rester allumé de nouveau
  function onVisibility() {
    if (phase === 'run' && !document.hidden && !wakeLock) keepScreenOn();
    if (document.hidden) wakeLock = null;
  }

  const words: Record<BreathStage, string> = {
    ready: 'Installe-toi',
    in: 'Inspire',
    out: 'Expire',
    done: 'C’est fini'
  };
</script>

<svelte:document onvisibilitychange={onVisibility} />

<section class="breath" aria-labelledby="breath-title">
  {#if phase === 'choose'}
    <h2 id="breath-title" tabindex="-1" bind:this={heading}>Respirer avec ton renard</h2>
    <p class="soft">Inspire 4 secondes, souffle 6 secondes. Suis le cercle, ou ferme les yeux et laisse les vibrations te guider.</p>

    <fieldset class="durations">
      <legend class="sr-only">Durée</legend>
      {#each DURATIONS as m (m)}
        <label class:on={minutes === m}>
          <input type="radio" name="breath-minutes" value={m} checked={minutes === m} onchange={() => pick(m)} />
          {m} min
        </label>
      {/each}
    </fieldset>

    {#if canVibrate}
      <label class="switch">
        <input type="checkbox" checked={vibrate} onchange={toggleVibrate} />
        <span>Vibrer à chaque changement</span>
      </label>
    {/if}

    <button class="primary" type="button" onclick={start}>Commencer · {formatClock(sessionMs(minutes))}</button>
    <button class="secondary" type="button" onclick={() => onclose(null)}>Pas maintenant</button>
  {:else if phase === 'run'}
    <h2 id="breath-title" class="sr-only" tabindex="-1" bind:this={heading}>Respiration guidée</h2>
    <div class="guide">
      <div class="ring" aria-hidden="true">
        <span class="halo" style:transform={`scale(${0.62 + 0.38 * s.fullness})`}></span>
        <span class="core" style:transform={`scale(${0.42 + 0.4 * s.fullness})`}></span>
        <span class="count">{s.secondsLeft}</span>
      </div>
      <div class="words">
        <p class="word" aria-live="assertive">{words[s.stage]}</p>
        <p class="hint">
          {#if s.stage === 'ready'}La première inspiration arrive…{:else if s.stage === 'in'}par le nez, en gonflant le ventre{:else}lentement, comme pour souffler une bougie sans l'éteindre{/if}
        </p>
        <p class="left">Encore {formatClock(s.remainingMs)}</p>
      </div>
    </div>
    <div class="bar" role="progressbar" aria-label="Avancement de la séance" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress * 100)}>
      <span style:width={`${s.progress * 100}%`}></span>
    </div>
    <button class="secondary" type="button" onclick={stop}>Arrêter</button>
  {:else}
    <h2 id="breath-title" tabindex="-1" bind:this={heading}>Bravo, {minutes} minute{minutes > 1 ? 's' : ''} de calme</h2>
    <p class="soft">Ton renard a respiré avec toi. Comment tu te sens maintenant ?</p>
    <button class="primary" type="button" onclick={() => onclose('checkin')}>Faire un check-in</button>
    <button class="secondary" type="button" onclick={start}>Recommencer</button>
    <button class="secondary" type="button" onclick={() => onclose(null)}>Fermer</button>
  {/if}
</section>

<style>
  .breath {
    display: grid;
    gap: 12px;
    padding: 20px 18px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid color-mix(in srgb, var(--breath) 50%, var(--line));
    box-shadow: 0 6px 22px color-mix(in srgb, var(--breath) 16%, transparent);
  }

  h2 {
    font-size: 21px;
    outline: none;
  }

  .soft {
    color: var(--muted);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .durations {
    display: flex;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
    border: 0;
  }

  .durations label {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 48px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    font-weight: 700;
    cursor: pointer;
  }

  .durations label.on {
    border-color: var(--breath);
    background: color-mix(in srgb, var(--breath) 14%, var(--surface));
    color: var(--fg);
  }

  .durations label:has(input:focus-visible) {
    outline: 3px solid var(--breath);
    outline-offset: 2px;
  }

  .durations input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    cursor: pointer;
  }

  .switch input {
    width: 22px;
    height: 22px;
    accent-color: var(--breath);
  }

  .guide {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 18px;
  }

  .ring {
    position: relative;
    width: 128px;
    height: 128px;
    display: grid;
    place-items: center;
  }

  .ring::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px dashed color-mix(in srgb, var(--breath) 45%, transparent);
  }

  .halo,
  .core {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    will-change: transform;
  }

  .halo {
    background: color-mix(in srgb, var(--breath) 22%, transparent);
  }

  .core {
    background: radial-gradient(circle at 40% 35%, color-mix(in srgb, var(--breath) 70%, white), var(--breath));
  }

  .count {
    position: relative;
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 700;
    color: var(--breath-fg);
    font-variant-numeric: tabular-nums;
  }

  .words {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .word {
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 700;
    color: var(--breath);
    line-height: 1.1;
  }

  .hint {
    color: var(--muted);
    font-size: 15px;
    min-height: 2.6em;
  }

  .left {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--breath);
  }

  .primary {
    min-height: 54px;
    margin-top: 4px;
    border: 0;
    border-radius: 999px;
    background: var(--breath);
    color: var(--breath-fg);
    font: inherit;
    font-weight: 700;
    font-size: 17px;
    cursor: pointer;
  }

  .secondary {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 15px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
