<script lang="ts">
  // Écran d'alerte « ton pouls monte » : par-dessus tout, avec un grand bouton pour respirer tout de suite.
  import { alarm, silence, snoozeAlert } from '../lib/alert.svelte';
  import { requestAction } from '../lib/appAction.svelte';
  import { hrefFor, parseRoute } from '../lib/router';

  let primary = $state<HTMLButtonElement>();
  $effect(() => {
    primary?.focus();
  });

  function breathe() {
    silence();
    requestAction('breathe');
    if (parseRoute(location.hash) !== 'accueil') location.hash = hrefFor('accueil');
  }
</script>

<div class="backdrop">
  <div class="card" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-text">
    <div class="pulse" class:ringing={alarm.ringing} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 20.5s-7.5-4.6-9.2-9.6C1.6 7.3 4 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4 20 4 22.4 7.3 21.2 10.9c-1.7 5-9.2 9.6-9.2 9.6z" />
      </svg>
    </div>

    {#if alarm.manual}
      <h2 id="alert-title">Stop, on fait une pause</h2>
      <p id="alert-text">
        Ta bague ou ton bouton a lancé une pause, notée dans ton journal. Avant d'agir, respire deux minutes avec ton
        renard. Si tu n'as rien demandé, ferme simplement.
      </p>
    {:else if alarm.test}
      <h2 id="alert-title">Essai de l'alerte</h2>
      <p id="alert-text">Voilà ce que tu entendras et sentiras quand ton pouls montera. Ensuite, ton renard te proposera de respirer.</p>
    {:else}
      <h2 id="alert-title">Ton pouls monte{#if alarm.bpm}&nbsp;: {alarm.bpm}{/if}</h2>
      <p id="alert-text">Pause. On respire ensemble, deux minutes : inspire 4 secondes, souffle 6 secondes.</p>
    {/if}

    <button class="primary" type="button" bind:this={primary} onclick={breathe}>Respirer avec mon renard</button>
    {#if alarm.ringing}
      <button class="secondary" type="button" onclick={() => silence(false)}>Arrêter la sonnerie</button>
    {/if}
    {#if alarm.test || alarm.manual}
      <button class="secondary" type="button" onclick={() => silence()}>Fermer</button>
    {:else}
      <button class="secondary" type="button" onclick={snoozeAlert}>Pas maintenant · pas d'alerte pendant 1 h</button>
      <button class="link" type="button" onclick={() => silence()}>Fermer</button>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    backdrop-filter: blur(8px);
  }

  .card {
    width: min(100%, 440px);
    display: grid;
    gap: 12px;
    padding: 24px 20px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 2px solid var(--heart);
    box-shadow: 0 12px 40px color-mix(in srgb, var(--heart) 25%, transparent);
    text-align: center;
  }

  .pulse {
    justify-self: center;
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--heart) 14%, var(--surface));
  }

  .pulse svg {
    width: 40px;
    height: 40px;
    fill: var(--heart);
  }

  .pulse.ringing {
    animation: ring 0.8s ease-in-out infinite;
  }

  @keyframes ring {
    50% {
      transform: scale(1.12);
      box-shadow: 0 0 0 10px color-mix(in srgb, var(--heart) 18%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse.ringing {
      animation: none;
    }
  }

  h2 {
    font-size: 26px;
    color: var(--heart);
  }

  p {
    color: var(--muted);
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  .primary {
    min-height: 58px;
    margin-top: 6px;
    border: 0;
    border-radius: 999px;
    background: var(--breath);
    color: var(--breath-fg);
    font-weight: 700;
    font-size: 18px;
  }

  .secondary {
    min-height: 48px;
    border: 1.5px solid var(--line);
    border-radius: 999px;
    background: transparent;
    color: var(--fg);
    font-weight: 600;
  }

  .link {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    text-decoration: underline;
  }
</style>
