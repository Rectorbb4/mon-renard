<script lang="ts">
  import AlertCard from '../components/AlertCard.svelte';
  import AndroidCard from '../components/AndroidCard.svelte';
  import BackupCard from '../components/BackupCard.svelte';
  import GestureTestCard from '../components/GestureTestCard.svelte';
  import PauseButtonCard from '../components/PauseButtonCard.svelte';

  const NUMBERS = [
    {
      number: '3114',
      title: 'Prévention du suicide',
      text: "Numéro national, gratuit, 24 h sur 24 et 7 jours sur 7. Pour toi si tu as des idées noires, ou pour un proche qui t'inquiète.",
      urgent: false
    },
    {
      number: '15',
      title: 'SAMU, urgence médicale',
      text: 'En cas de danger immédiat pour ta vie ou celle de quelqu’un.',
      urgent: true
    },
    {
      number: '112',
      title: 'Urgence, depuis toute l’Europe',
      text: 'Marche depuis n’importe quel téléphone, même sans crédit.',
      urgent: true
    }
  ];
</script>

<section class="reperes">
  <header>
    <h1>Repères</h1>
    <p class="lead">Si ça ne va pas, quelqu'un peut t'écouter, à toute heure.</p>
  </header>

  <ul class="numbers">
    {#each NUMBERS as n (n.number)}
      <li class:urgent={n.urgent}>
        <div class="text">
          <h2>{n.title}</h2>
          <p>{n.text}</p>
        </div>
        <a class="call" href={`tel:${n.number}`} aria-label={`Appeler le ${n.number}, ${n.title}`}>
          <span class="digits">{n.number}</span>
          <span class="verb">Appeler</span>
        </a>
      </li>
    {/each}
  </ul>

  <div class="note">
    <h2>Ce que cette appli n'est pas</h2>
    <p>
      Mon renard n'est pas un outil médical. Il aide à observer ton humeur au quotidien, mais il ne pose pas de
      diagnostic et ne remplace pas un suivi par un médecin ou un psychologue.
    </p>
  </div>

  <PauseButtonCard />

  <GestureTestCard />

  <AlertCard />

  <BackupCard />

  <AndroidCard />

  <div class="note credits">
    <h2>Crédits</h2>
    <p>
      Modèle 3D du renard : « Fox » par
      <a href="https://sketchfab.com/3d-models/fox-39f97fe58f0b47ce80b6e02814001dd7" target="_blank" rel="noopener">pxltiger</a>,
      sous licence
      <a href="https://creativecommons.org/licenses/by/4.0/deed.fr" target="_blank" rel="noopener">CC BY 4.0</a>.
    </p>
    <p>Conçue avec Svelte, Vite, three.js, Dexie et uPlot, logiciels libres.</p>
    <p class="version">Version {__APP_VERSION__}</p>
  </div>
</section>

<style>
  .reperes {
    display: grid;
    gap: 18px;
  }

  h1 {
    font-size: clamp(34px, 9vw, 44px);
  }

  .lead {
    color: var(--muted);
    margin-top: 6px;
  }

  .numbers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }

  .numbers li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .text {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .text h2 {
    font-size: 18px;
  }

  .text p {
    color: var(--muted);
    font-size: 15px;
  }

  .call {
    display: grid;
    justify-items: center;
    min-width: 88px;
    padding: 10px 14px;
    border-radius: 16px;
    background: var(--accent);
    color: var(--accent-fg);
    text-decoration: none;
  }

  .urgent .call {
    background: var(--urgent);
    color: var(--urgent-fg);
  }

  .digits {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .verb {
    font-size: 13px;
    font-weight: 700;
  }

  .note {
    display: grid;
    gap: 6px;
    padding: 0 2px;
  }

  .note h2 {
    font-size: 18px;
  }

  .note p {
    color: var(--muted);
    font-size: 15px;
  }

  .credits {
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }

  .version {
    font-size: 13px;
  }
</style>
