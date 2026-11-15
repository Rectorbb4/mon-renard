<script lang="ts">
  import { install, promptInstall } from '../lib/install.svelte';
  import { hrefFor } from '../lib/router';

  const portrait = `${import.meta.env.BASE_URL}renard-portrait.png`;

  function greeting(date: Date): string {
    const h = date.getHours();
    if (h < 5) return 'Bonne nuit';
    if (h < 18) return 'Bonjour';
    return 'Bonsoir';
  }

  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
</script>

<section class="home">
  <header>
    <p class="date">{today}</p>
    <h1>{greeting(new Date())}</h1>
  </header>

  <div class="stage">
    <img src={portrait} alt="Ton renard, assis, qui te regarde" width="512" height="512" />
  </div>

  <div class="card">
    <h2>Ton renard s'installe</h2>
    <p>
      Cette première version pose les fondations : l'appli s'installe sur ton téléphone et marche sans connexion.
      À la prochaine étape, ton renard prend vie en 3D et change avec ton humeur.
    </p>
  </div>

  {#if install.available}
    <button class="install" type="button" onclick={promptInstall}>Installer sur l'écran d'accueil</button>
  {:else if install.installed}
    <p class="installed">Installée sur ce téléphone. Elle marche aussi hors connexion.</p>
  {/if}

  <a class="help" href={hrefFor('reperes')}>
    <span class="help-title">Besoin d'aide maintenant ?</span>
    <span class="help-text">3114 et 15, dans Repères</span>
  </a>

  <p class="privacy">Tes données restent sur ce téléphone. Pas de compte, pas de serveur.</p>
</section>

<style>
  .home {
    display: grid;
    gap: 18px;
  }

  .date {
    color: var(--muted);
    font-size: 15px;
    text-transform: capitalize;
  }

  h1 {
    font-size: clamp(34px, 9vw, 44px);
    font-weight: 700;
  }

  .stage {
    border-radius: var(--radius);
    background: linear-gradient(var(--sky-top), var(--sky-bottom));
    aspect-ratio: 1;
    max-width: 100%;
    display: grid;
    place-items: end center;
    overflow: hidden;
  }

  .stage img {
    width: 92%;
    height: auto;
    display: block;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 18px;
    display: grid;
    gap: 8px;
  }

  .card h2 {
    font-size: 21px;
  }

  .card p {
    color: var(--muted);
  }

  .install {
    min-height: 54px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font-weight: 700;
    font-size: 17px;
    cursor: pointer;
  }

  .installed {
    color: var(--muted);
    text-align: center;
    font-size: 15px;
  }

  .help {
    display: grid;
    gap: 2px;
    padding: 14px 18px;
    border-radius: var(--radius);
    border: 1.5px solid var(--line);
    text-decoration: none;
    color: var(--fg);
  }

  .help-title {
    font-weight: 700;
  }

  .help-text {
    color: var(--muted);
    font-size: 15px;
  }

  .privacy {
    color: var(--muted);
    font-size: 14px;
    text-align: center;
  }
</style>
