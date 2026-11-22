<script lang="ts">
  import AlertOverlay from './components/AlertOverlay.svelte';
  import { alertBridge, appVersion, onAppAction, takeLaunchAction, type AppAction } from './lib/android';
  import { getDB } from './data/db';
  import { eraseFalsePauses } from './lib/falsePauses';
  import { journal, startJournal } from './lib/journal.svelte';
  import { alarm, pullMoments, recordPendingPauses, showNativeAlert, syncAlertConfig } from './lib/alert.svelte';
  import { requestAction } from './lib/appAction.svelte';
  import { startHealthSync } from './lib/healthSync.svelte';
  import { leaveLock, lockScreen, refreshLock } from './lib/lockScreen.svelte';
  import { hrefFor, parseRoute, type Route } from './lib/router';
  import Accueil from './pages/Accueil.svelte';
  import Reperes from './pages/Reperes.svelte';

  let route: Route = $state(parseRoute(location.hash));

  // Boutons du widget Android : l'accueil traite l'action, on y retourne si besoin.
  // « alert » (notification « ton pouls monte ») ouvre l'écran d'alerte, par-dessus tout.
  function handleAction(action: AppAction) {
    if (action === 'alert') {
      openNativeAlert();
      refreshLock();
      return;
    }
    requestAction(action);
    if (parseRoute(location.hash) !== 'accueil') location.hash = hrefFor('accueil');
  }

  /** Téléphone verrouillé : on ne montre jamais que la pause. */
  function syncLock() {
    refreshLock();
    if (lockScreen.over && !alarm.open && !lockScreen.breathing) openNativeAlert();
  }

  /** L'appli Android dit où en est la dernière alerte (sonne-t-elle encore ?). */
  function openNativeAlert() {
    try {
      const s = JSON.parse(alertBridge()?.alertState() ?? 'null');
      showNativeAlert(typeof s?.bpm === 'number' && s.bpm > 0 ? s.bpm : null, s?.ringing === true, s?.manual === true);
    } catch {
      showNativeAlert(null, false);
    }
  }

  /** Pauses demandées pendant que l'appli était fermée : notées, puis les fausses du 21 novembre retirées. */
  async function catchUpPauses() {
    await recordPendingPauses();
    const code = appVersion()?.code ?? null;
    if (code == null) return;
    await startJournal();
    if (journal.profileId != null) await eraseFalsePauses(getDB(), journal.profileId, code);
    await pullMoments();
  }

  syncAlertConfig();
  // Relevés de la bague et de la ceinture gardés par l'appli Android
  startHealthSync();
  catchUpPauses().catch((e) => console.error(e));
  $effect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      syncLock();
      catchUpPauses().catch((e) => console.error(e));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
  // Les 20 secondes autour d'une pause viennent d'être enregistrées, appli ouverte
  $effect(() => {
    const onMoment = () => void pullMoments().catch((e) => console.error(e));
    window.addEventListener('renard-moment', onMoment);
    return () => window.removeEventListener('renard-moment', onMoment);
  });
  const launchAction = takeLaunchAction();
  if (launchAction) handleAction(launchAction);
  syncLock();
  $effect(() => onAppAction(handleAction));

  // Pause terminée sur l'écran verrouillé : l'appli repasse derrière lui
  $effect(() => {
    if (lockScreen.over && !alarm.open && !lockScreen.breathing) leaveLock();
  });

  // L'appli Android sonne (ou s'arrête de sonner) pendant que la page est ouverte
  $effect(() => {
    const onAlert = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      // (l'essai, lui, a déjà ouvert son écran depuis la page)
      if (d.ringing && !d.test) showNativeAlert(typeof d.bpm === 'number' && d.bpm > 0 ? d.bpm : null, true, d.manual === true);
      else alarm.ringing = false;
    };
    window.addEventListener('renard-alert', onAlert);
    return () => window.removeEventListener('renard-alert', onAlert);
  });

  $effect(() => {
    const onHash = () => {
      route = parseRoute(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  const TITLES: Record<Route, string> = {
    accueil: 'Mon renard',
    suivi: 'Suivi · Mon renard',
    historique: 'Historique · Mon renard',
    reperes: 'Repères · Mon renard'
  };

  $effect(() => {
    document.title = TITLES[route];
  });

  const NAV: { route: Route; label: string; icon: string }[] = [
    {
      route: 'accueil',
      label: 'Mon renard',
      // maison
      icon: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z'
    },
    {
      route: 'suivi',
      label: 'Suivi',
      // battement de cœur
      icon: 'M3 12.5h4l2.4-6.5 4.2 12.5 2.6-6H21'
    },
    {
      route: 'historique',
      label: 'Historique',
      // courbe montante
      icon: 'M4 20h16M5 16l4.5-5 3.5 3 6-7M15 7h4v4'
    },
    {
      route: 'reperes',
      label: 'Repères',
      // bouée
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM5.6 5.6l3.6 3.6M18.4 5.6l-3.6 3.6M5.6 18.4l3.6-3.6M18.4 18.4l-3.6-3.6'
    }
  ];
</script>

{#if alarm.open}
  <AlertOverlay />
{/if}

<div class="shell">
  <main class:veiled={lockScreen.over && !(lockScreen.breathShown && route === 'accueil')}>
    {#if route === 'reperes'}
      <Reperes />
    {:else if route === 'suivi'}
      {#await import('./pages/Suivi.svelte') then page}
        <page.default />
      {:catch}
        <div class="load-error" role="alert">
          <p>Le suivi n'a pas pu s'ouvrir. Tes données sont intactes.</p>
          <button type="button" onclick={() => location.reload()}>Recharger l'appli</button>
        </div>
      {/await}
    {:else if route === 'historique'}
      <!-- Chargé à la demande : les courbes ne pèsent rien tant qu'on n'ouvre pas l'historique -->
      {#await import('./pages/Historique.svelte') then page}
        <page.default />
      {:catch}
        <div class="load-error" role="alert">
          <p>L'historique n'a pas pu s'ouvrir. Tes données sont intactes.</p>
          <button type="button" onclick={() => location.reload()}>Recharger l'appli</button>
        </div>
      {/await}
    {:else}
      <Accueil />
    {/if}
  </main>

  {#if !lockScreen.over}
    <nav aria-label="Navigation principale">
      {#each NAV as item (item.route)}
        <a href={hrefFor(item.route)} aria-current={route === item.route ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .shell {
    min-height: 100%;
    display: grid;
    grid-template-rows: 1fr auto;
  }

  main {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding-top: max(20px, env(safe-area-inset-top, 0px));
    padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 24px);
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }

  main.veiled {
    visibility: hidden;
  }

  .load-error {
    display: grid;
    gap: 12px;
    margin-top: 40px;
    text-align: center;
  }

  .load-error button {
    justify-self: center;
    min-height: 48px;
    padding: 0 24px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 6px max(16px, env(safe-area-inset-right, 0px)) calc(6px + env(safe-area-inset-bottom, 0px))
      max(16px, env(safe-area-inset-left, 0px));
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
    z-index: 10;
  }

  nav a {
    flex: 0 1 140px;
    min-height: 52px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 2px;
    border-radius: 14px;
    color: var(--muted);
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
  }

  nav a[aria-current='page'] {
    color: var(--accent);
    background: var(--surface-2);
  }

  nav svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
