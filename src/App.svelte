<script lang="ts">
  import { hrefFor, parseRoute, type Route } from './lib/router';
  import Accueil from './pages/Accueil.svelte';
  import Reperes from './pages/Reperes.svelte';

  let route: Route = $state(parseRoute(location.hash));

  $effect(() => {
    const onHash = () => {
      route = parseRoute(location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  const NAV: { route: Route; label: string; icon: string }[] = [
    {
      route: 'accueil',
      label: 'Mon renard',
      // maison
      icon: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z'
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

<div class="shell">
  <main>
    {#if route === 'reperes'}
      <Reperes />
    {:else if route === 'historique'}
      <!-- Chargé à la demande : les courbes ne pèsent rien tant qu'on n'ouvre pas l'historique -->
      {#await import('./pages/Historique.svelte') then page}
        <page.default />
      {/await}
    {:else}
      <Accueil />
    {/if}
  </main>

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
