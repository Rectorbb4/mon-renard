<script lang="ts">
  import CheckInPanel from '../components/CheckInPanel.svelte';
  import FoxStage from '../components/FoxStage.svelte';
  import type { CheckIn } from '../data/types';
  import { MOODS, moodFromScore, type MoodId } from '../fox/moods';
  import { install, promptInstall } from '../lib/install.svelte';
  import { journal, startJournal } from '../lib/journal.svelte';
  import { hrefFor } from '../lib/router';
  import { formatSince } from '../lib/time';

  startJournal();

  let checking = $state(false);
  let preview = $state<number | null>(null);
  let reactSignal = $state(0);
  let thanks = $state(false);
  let now = $state(Date.now());
  let thanksTimer: ReturnType<typeof setTimeout> | undefined;

  // Le renard prend l'humeur du dernier check-in ; pendant la saisie, il suit le curseur.
  const mood: MoodId = $derived(
    checking && preview != null ? moodFromScore(preview) : journal.last ? moodFromScore(journal.last.mood) : 'equilibre'
  );

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(thanksTimer);
    };
  });

  function openCheckIn() {
    thanks = false;
    preview = null;
    checking = true;
  }

  function closeCheckIn(saved: CheckIn | null) {
    checking = false;
    preview = null;
    now = Date.now();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (saved) {
      reactSignal += 1;
      thanks = true;
      clearTimeout(thanksTimer);
      thanksTimer = setTimeout(() => (thanks = false), 5000);
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

  <FoxStage {mood} compact={checking} {reactSignal} />

  <div class="mood-line" aria-live="polite">
    <p class="mood-name">{MOODS[mood].label}</p>
    <p class="mood-caption">{MOODS[mood].caption}</p>
    {#if !checking}
      {#if thanks}
        <p class="since thanks">C'est noté. Ton renard prend ton humeur.</p>
      {:else if journal.last}
        <p class="since">
          D'après ton check-in {formatSince(journal.last.at, now)}{#if journal.last.word}&nbsp;: « {journal.last.word} »{/if}
        </p>
      {:else if journal.ready}
        <p class="since">Dis-lui comment tu vas : il prendra ton humeur.</p>
      {/if}
    {/if}
  </div>

  {#if journal.error}
    <p class="storage-error" role="alert">{journal.error}</p>
  {/if}

  {#if checking}
    <CheckInPanel previous={journal.last} onpreview={(v) => (preview = v)} ondone={closeCheckIn} />
  {:else}
    <button class="checkin" type="button" onclick={openCheckIn} disabled={!!journal.error}>
      <span class="checkin-title">Comment ça va ?</span>
      <span class="checkin-sub">Humeur, énergie, nuit : 15 secondes</span>
    </button>
  {/if}

  {#if !checking}
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
  {/if}
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
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 24px;
  }

  .mood-caption {
    color: var(--muted);
  }

  .since {
    margin-top: 6px;
    font-size: 15px;
    color: var(--muted);
  }

  .thanks {
    color: var(--accent);
    font-weight: 700;
  }

  .storage-error {
    color: var(--urgent);
    font-weight: 700;
  }

  .checkin {
    display: grid;
    gap: 2px;
    justify-items: center;
    min-height: 72px;
    padding: 12px 20px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-fg);
    font: inherit;
    cursor: pointer;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
    transition: transform 0.15s ease;
  }

  .checkin:active {
    transform: scale(0.98);
  }

  .checkin:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .checkin-title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
  }

  .checkin-sub {
    font-size: 14px;
    opacity: 0.9;
  }

  .install {
    min-height: 54px;
    border: 1.5px solid var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--accent);
    font: inherit;
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
