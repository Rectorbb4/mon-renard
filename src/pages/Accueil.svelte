<script lang="ts">
  import FoxStage from '../components/FoxStage.svelte';
  import { install, promptInstall } from '../lib/install.svelte';
  import { hrefFor } from '../lib/router';
  import { MOOD_IDS, MOODS, isMoodId, type MoodId } from '../fox/moods';

  // Provisoire : en attendant le check-in (étape 2), on choisit l'humeur à la main.
  const STORAGE_KEY = 'mon-renard:essai-humeur';
  function savedMood(): MoodId {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return isMoodId(v) ? v : 'equilibre';
    } catch {
      return 'equilibre';
    }
  }
  let mood = $state<MoodId>(savedMood());
  function choose(id: MoodId) {
    mood = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* stockage indisponible : ça marche quand même */
    }
  }

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

  <FoxStage {mood} />

  <div class="mood-line">
    <p class="mood-name">{MOODS[mood].label}</p>
    <p class="mood-caption">{MOODS[mood].caption}</p>
  </div>

  <div class="card">
    <h2>Essayer une humeur</h2>
    <p>Bientôt, ton renard suivra ce que tu notes. En attendant, choisis une humeur pour le voir changer. Touche-le pour qu'il réagisse.</p>
    <div class="moods" role="radiogroup" aria-label="Humeur du renard">
      {#each MOOD_IDS as id (id)}
        <button
          type="button"
          role="radio"
          aria-checked={mood === id}
          class="mood"
          class:selected={mood === id}
          style:--top={MOODS[id].sky.top}
          style:--bottom={MOODS[id].sky.bottom}
          onclick={() => choose(id)}
        >
          <span class="swatch"></span>
          {MOODS[id].label}
        </button>
      {/each}
    </div>
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

  .mood-line {
    display: grid;
    gap: 2px;
    margin-top: -4px;
  }

  .mood-name {
    font-weight: 700;
    font-size: 22px;
  }

  .mood-caption {
    color: var(--muted);
  }

  .moods {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .mood {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 14px 6px 8px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    background: var(--surface-2);
    color: var(--fg);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }

  .mood.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    font-weight: 700;
  }

  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(var(--top), var(--bottom));
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
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
