<script lang="ts">
  // Ton terrier : ce que tu peux gagner aujourd'hui, même sans jamais avoir besoin d'une pause.
  // Chaque objectif atteint donne une noisette ; toutes les trois, un nouvel objet s'installe. Rien ne se perd.
  import { bedtimeBridge, isAndroidApp } from '../lib/android';
  import { ringSync } from '../lib/healthSync.svelte';
  import { startOfDay } from '../lib/history';
  import {
    clockText,
    fellAsleepAt,
    parseClock,
    reminderClock,
    rewardKey,
    STEP_INCREMENT,
    STEP_MAX,
    STEP_MIN
  } from '../lib/quests';
  import { quests, refreshQuests, setBedtimeGoal, setBedtimeReminder, setStepGoal } from '../lib/quests.svelte';
  import { dayPartOf, hasVisitor, seasonOf, VISITORS } from '../lib/season';
  import { denProgress, NUTS_PER_TREASURE, TREASURES } from '../lib/treasures';
  import type { RewardKind } from '../data/types';

  let { now }: { now: number } = $props();

  $effect(() => {
    void ringSync.revision;
    void refreshQuests();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshQuests();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

  const today = $derived(startOfDay(now));
  const have = $derived(new Set(quests.rewards.map((r) => rewardKey(r.day, r.kind))));
  const done = (kind: RewardKind) => have.has(rewardKey(today, kind));
  const den = $derived(denProgress(quests.rewards.length));
  const owned = $derived(TREASURES.slice(0, den.unlocked));

  const season = $derived(seasonOf(now));
  const part = $derived(dayPartOf(now));
  const visitor = $derived(hasVisitor(now));
  const lit = $derived(den.unlocked > 0);

  const n = (v: number) => v.toLocaleString('fr-FR');
  const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const stepsNow = $derived(quests.steps ?? 0);
  const stepShare = $derived(quests.target ? Math.min(1, stepsNow / quests.target) : 0);
  const asleepAt = $derived(quests.lastNight ? fellAsleepAt(quests.lastNight) : null);

  const WON: Record<RewardKind, string> = {
    pas: 'Une noisette pour tes pas',
    coucher: 'Une noisette pour ton coucher',
    souffle: 'Une noisette pour ta respiration'
  };

  const canRemind = bedtimeBridge() != null;
  const inApp = isAndroidApp();
  let bedError = $state<string | null>(null);

  function onBedtime(e: Event) {
    const value = parseClock((e.currentTarget as HTMLInputElement).value);
    if (value == null) {
      bedError = 'Choisis une heure.';
      return;
    }
    bedError = null;
    void setBedtimeGoal(value);
  }

  const scene = $derived(
    `Ton terrier en ${season === 'ete' ? 'été' : season}, avec ${den.unlocked} ${den.unlocked > 1 ? 'trésors' : 'trésor'}.` +
      (visitor ? ` ${VISITORS[season]} te rend visite aujourd'hui.` : '')
  );

  const STARS = [[24, 12], [58, 26], [98, 9], [142, 20], [196, 11], [236, 27], [282, 10], [318, 22]];
  const SNOW = [[18, 8], [64, 30], [110, 16], [160, 34], [214, 10], [262, 26], [312, 16]];
  const FLOWERS = [22, 96, 132, 214, 248, 318];
  const FALLEN = [[30, '#d9593f'], [94, '#e9b949'], [136, '#d9823f'], [208, '#d9593f'], [252, '#e9b949'], [322, '#d9823f']] as const;
</script>

{#if quests.ready && quests.goals}
  <section class="den" aria-labelledby="den-title">
    <svg class="scene part-{part}" viewBox="0 0 340 200" role="img" aria-label={scene}>
      <rect class="sky" width="340" height="49" />
      {#if part === 'nuit'}
        {#each STARS as [x, y] (x)}
          <circle cx={x} cy={y} r="1" fill="#fff" opacity="0.8" />
        {/each}
        <path d="M296 8a11 11 0 1 0 10 17 9 9 0 0 1-10-17Z" fill="#f4e2c4" />
      {:else if part === 'jour'}
        <circle cx="296" cy="18" r="10" fill="#ffd76e" />
      {:else}
        <circle cx="296" cy="42" r="13" fill="#ffc27a" />
      {/if}
      {#if season === 'hiver'}
        {#each SNOW as [x, y] (x)}
          <circle cx={x} cy={y} r="1.5" fill="#fff" />
        {/each}
      {/if}

      <rect class="soil" y="48" width="340" height="152" />
      <path class="tunnel" d="M323 47C318 74 306 88 286 98" />
      <rect y="46" width="340" height="4" fill={season === 'hiver' ? '#eef3f7' : season === 'automne' ? '#b9893f' : 'var(--grass)'} />
      {#if season === 'printemps'}
        {#each FLOWERS as x (x)}
          <path d="M{x} 47v-5" stroke="var(--grass)" stroke-width="1.4" />
          <circle cx={x} cy="40" r="2.4" fill="#f4a9c0" />
        {/each}
      {:else if season === 'ete'}
        {#each FLOWERS as x (x)}
          <path d="M{x} 47q-2-6 1-11M{x + 4} 47q2-5 0-8" stroke="var(--grass)" stroke-width="1.6" fill="none" />
        {/each}
      {:else if season === 'automne'}
        {#each FALLEN as [x, c] (x)}
          <ellipse cx={x} cy="45" rx="4" ry="1.8" fill={c} />
        {/each}
      {/if}

      <ellipse class="chamber" cx="170" cy="124" rx="154" ry="62" />
      {#if lit}
        <ellipse cx="170" cy="112" rx="110" ry="46" fill="#ffc766" opacity="0.13" />
      {/if}

      {#if owned.some((t) => t.y === 128)}
        <path class="shelf" d="M26 129h92M222 129h92" />
      {/if}
      {#if owned.some((t) => t.y === 102)}
        <path class="shelf" d="M38 103h60M242 103h60" />
      {/if}

      {#each owned as t (t.id)}
        <g transform="translate({t.x} {t.y})">
          {#each t.shapes as [fill, d], i (i)}
            <path {d} {fill} />
          {/each}
        </g>
      {/each}

      <g transform="translate(170 169) scale(1.9)">
        <path class="fox" d="M-15 6C-17-5-7-11 3-10 12-9 17-2 15 4 13 10-12 11-15 6Z" />
        <path class="tail" d="M15 3C11 10-3 11-11 7-4 7 4 6 9 1Z" />
        <path class="fox" d="M-12-1-14-10-8-7-3-10-2-1Z" />
        <path class="eye" d="M-10-2Q-8-.5-6-2" />
      </g>

      {#if visitor}
        {#if season === 'hiver'}
          <g transform="translate(22 46)">
            <circle cy="-6" r="6" fill="#fff" /><circle cy="-15" r="4" fill="#fff" />
            <path d="M0-15l5 1-5 1z" fill="#e8843f" />
          </g>
        {:else if season === 'printemps'}
          <g transform="translate(244 26)">
            <path d="M0 0C-7-8-11-3-8 2-6 5-2 3 0 0ZM0 0C7-8 11-3 8 2 6 5 2 3 0 0Z" fill="#7fb2d6" />
            <path d="M-.5-4h1v8h-1z" fill="#3a2a1c" />
          </g>
        {:else if season === 'ete'}
          <g transform="translate(246 30)">
            <circle r="7" fill="#e8ff9c" opacity="0.35" /><circle r="2.2" fill="#f4ffb8" />
          </g>
        {:else}
          <g transform="translate(26 46)">
            <path d="M-10 0C-11-9-2-13 5-10 9-8 11-4 13-1L8 0Z" fill="#6b4226" />
            <circle cx="10" cy="-2.4" r=".9" fill="#1d120a" />
          </g>
        {/if}
      {/if}
    </svg>

    <div class="body">
      <div class="head">
        <h2 id="den-title">Ton terrier</h2>
        <p class="nuts">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15C4 13 2 10 3 6h10c1 4-1 7-5 9Z" fill="#b9793f" /><path d="M2 6c0-3 3-4 6-4s6 1 6 4Z" fill="#6b4226" /></svg>
          {den.nuts} {den.nuts > 1 ? 'noisettes' : 'noisette'}
        </p>
      </div>

      {#if quests.won}
        <p class="won" role="status">{WON[quests.won]}</p>
      {/if}

      {#if den.toNext > 0}
        <div class="next">
          <span class="pips" aria-hidden="true">
            {#each Array.from({ length: NUTS_PER_TREASURE }, (_, i) => i) as i (i)}
              <i class:on={i < den.filled}></i>
            {/each}
          </span>
          <span>Encore {den.toNext} {den.toNext > 1 ? 'noisettes' : 'noisette'} pour le prochain trésor</span>
        </div>
      {:else}
        <p class="next">Ton terrier est au complet.</p>
      {/if}

      <ul class="quests" aria-label="Objectifs du jour">
        <li class:done={done('pas')}>
          <span class="tick" aria-hidden="true"></span>
          <div>
            {#if done('pas')}
              <p class="title">Tes pas du jour sont faits</p>
              <p class="sub">{n(stepsNow)} pas, rien de plus à faire.</p>
            {:else if quests.rising}
              <p class="title">Pas d'objectif de pas en ce moment</p>
              <p class="sub">Tes nuits raccourcissent. Pas besoin de marcher plus, protège plutôt ta nuit.</p>
            {:else}
              <p class="title">{n(stepsNow)} sur {n(quests.target)} pas</p>
              <span class="meter"><b style:width="{stepShare * 100}%"></b></span>
            {/if}
          </div>
        </li>
        <li class:done={done('coucher')}>
          <span class="tick" aria-hidden="true"></span>
          <div>
            {#if done('coucher')}
              <p class="title">Endormi à {asleepAt ? hour.format(asleepAt) : 'temps'} cette nuit</p>
              <p class="sub">Ce soir, avant {clockText(quests.goals.bedtime)}.</p>
            {:else}
              <p class="title">Endors-toi avant {clockText(quests.goals.bedtime)}</p>
              <p class="sub">{quests.goals.reminder && canRemind ? `Rappel à ${reminderClock(quests.goals.bedtime)}` : 'Compté au prochain relevé de la bague'}</p>
            {/if}
          </div>
        </li>
        <li class:done={done('souffle')}>
          <span class="tick" aria-hidden="true"></span>
          <div>
            <p class="title">{done('souffle') ? 'Respiration faite' : 'Une respiration jusqu’au bout'}</p>
            {#if !done('souffle')}
              <p class="sub">Même d'une minute, même quand tout va bien.</p>
            {/if}
          </div>
        </li>
      </ul>

      <details>
        <summary>Régler mes objectifs</summary>
        <div class="settings">
          <div class="row">
            <span id="steps-goal">Pas par jour</span>
            <div class="stepper" role="group" aria-labelledby="steps-goal">
              <button type="button" aria-label="500 pas de moins" disabled={quests.goals.steps <= STEP_MIN} onclick={() => setStepGoal(quests.goals!.steps - STEP_INCREMENT)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
              </button>
              <output>{n(quests.goals.steps)}</output>
              <button type="button" aria-label="500 pas de plus" disabled={quests.goals.steps >= STEP_MAX} onclick={() => setStepGoal(quests.goals!.steps + STEP_INCREMENT)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
              </button>
            </div>
          </div>
          <div class="row">
            <label for="bed-goal">M'endormir avant</label>
            <input id="bed-goal" type="time" value={clockText(quests.goals.bedtime)} onchange={onBedtime} />
          </div>
          {#if bedError}
            <p class="error" role="alert">{bedError}</p>
          {/if}
          <label class="row check">
            <span>Me le rappeler 1 h avant</span>
            <input type="checkbox" checked={quests.goals.reminder} onchange={(e) => setBedtimeReminder(e.currentTarget.checked)} />
          </label>
          {#if !canRemind}
            <p class="hint">
              {inApp ? 'Pour recevoir le rappel, installe la version 2.9 de l’appli depuis Repères.' : 'Le rappel fonctionne dans l’appli Android.'}
            </p>
          {/if}
          <p class="hint">Un changement vaut à partir de demain pour les pas et de la prochaine nuit pour le coucher. Ce qui est gagné reste gagné.</p>
        </div>
      </details>

      {#if owned.length}
        <details>
          <summary>Mes trésors, {owned.length} sur {TREASURES.length}</summary>
          <ul class="list">
            {#each owned as t (t.id)}
              <li>{t.name}</li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  </section>
{/if}

<style>
  .den {
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid color-mix(in srgb, var(--soil) 45%, var(--line));
  }

  .scene {
    display: block;
    width: 100%;
    height: auto;
  }

  .sky {
    fill: var(--scene-day);
  }

  .part-aube .sky {
    fill: var(--scene-dawn);
  }

  .part-soir .sky {
    fill: var(--scene-dusk);
  }

  .part-nuit .sky {
    fill: var(--scene-night);
  }

  .soil {
    fill: var(--soil);
  }

  .tunnel {
    fill: none;
    stroke: var(--tunnel);
    stroke-width: 20;
  }

  .chamber {
    fill: var(--tunnel);
  }

  .shelf {
    stroke: #8a6a45;
    stroke-width: 2.4;
    stroke-linecap: round;
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
    stroke-width: 1;
    stroke-linecap: round;
  }

  .body {
    display: grid;
    gap: 10px;
    padding: 12px 16px 8px;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    font-size: 22px;
  }

  .nuts {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .nuts svg {
    width: 16px;
    height: 16px;
  }

  .won {
    padding: 7px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    font-weight: 700;
    animation: pop 0.45s ease-out;
  }

  @keyframes pop {
    from {
      transform: scale(0.92);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .won {
      animation: none;
    }
  }

  .next {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--muted);
    font-size: 14px;
  }

  .pips {
    display: inline-flex;
    flex: none;
    gap: 3px;
  }

  .pips i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid #b9793f;
  }

  .pips i.on {
    background: #b9793f;
  }

  .quests {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .quests > li {
    display: grid;
    grid-template-columns: 24px 1fr;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid var(--line);
  }

  .tick {
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border: 2px solid var(--line);
    border-radius: 50%;
  }

  .done .tick {
    position: relative;
    border-color: var(--grass);
    background: var(--grass);
  }

  .done .tick::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 1px;
    width: 5px;
    height: 10px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(42deg);
  }

  .title {
    font-weight: 700;
    line-height: 1.25;
  }

  .sub {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.3;
  }

  .meter {
    display: block;
    height: 6px;
    margin-top: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--line);
  }

  .meter b {
    display: block;
    height: 100%;
    background: var(--grass);
  }

  details {
    border-top: 1px solid var(--line);
    font-size: 15px;
  }

  summary {
    min-height: 44px;
    padding: 11px 0;
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
  }

  .settings {
    display: grid;
    gap: 10px;
    padding-bottom: 12px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
  }

  .check {
    cursor: pointer;
  }

  .check input {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }

  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 12px;
    background: var(--surface-2);
  }

  .stepper button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }

  .stepper button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .stepper svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  output {
    min-width: 62px;
    font-weight: 700;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  input[type='time'] {
    min-height: 44px;
    padding: 0 12px;
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--fg);
    font: inherit;
    font-weight: 700;
    color-scheme: light dark;
  }

  .hint {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.35;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
  }

  .list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
    margin: 0 0 12px;
    padding: 0;
    color: var(--muted);
    font-size: 14px;
    list-style: none;
  }
</style>
