<script lang="ts">
  // Tes dernières nuits à côté de ton habitude, et ce que ça peut vouloir dire. Jamais un diagnostic.
  import { formatDuration } from '../lib/healthDays';
  import type { Rhythm, RhythmKind } from '../lib/rhythm';

  let { value }: { value: Rhythm } = $props();

  const TALK = 'Si ça continue, parles-en à ton médecin.';
  const WORDS: Record<Exclude<RhythmKind, 'learning'>, { title: string; text: string; watch: boolean }> = {
    steady: { title: 'Ton rythme ressemble à ton habitude', text: 'Rien ne s’écarte nettement ces trois derniers jours.', watch: false },
    shorter: { title: 'Tes nuits raccourcissent', text: 'Essaie de garder une heure de coucher régulière ce soir.', watch: false },
    longer: { title: 'Tes nuits s’allongent', text: 'Regarde si la fatigue s’installe ou si c’est juste du repos bienvenu.', watch: false },
    rising: {
      title: 'Nuits plus courtes, élan qui monte',
      text: `Ce duo peut accompagner une montée, même quand tu te sens bien. Protège ta prochaine nuit. ${TALK}`,
      watch: true
    },
    falling: {
      title: 'Nuits plus longues, élan qui baisse',
      text: `Ce duo peut accompagner une baisse. Sortir un peu à la lumière du jour peut aider. ${TALK}`,
      watch: true
    }
  };

  const words = $derived(value.kind === 'learning' ? null : WORDS[value.kind]);
  const longest = $derived(Math.max(value.recent ?? 0, value.usual ?? 0, 1));
  const width = (m: number | null) => `${Math.round(((m ?? 0) / longest) * 100)}%`;
</script>

<div class="rhythm" class:watch={words?.watch}>
  {#if words}
    <h3>{words.title}</h3>
    <dl>
      <div>
        <dt>Tes 3 dernières nuits</dt>
        <dd>{formatDuration(value.recent)}</dd>
        <span class="bar now" style:width={width(value.recent)}></span>
      </div>
      <div>
        <dt>D'habitude</dt>
        <dd>{formatDuration(value.usual)}</dd>
        <span class="bar" style:width={width(value.usual)}></span>
      </div>
    </dl>
    <p>{words.text}</p>
  {:else}
    <h3>Ton renard apprend ton rythme</h3>
    <p>Encore {value.missing} {value.missing > 1 ? 'nuits' : 'nuit'} avec la bague pour comparer tes nuits à ton habitude.</p>
  {/if}
</div>

<style>
  .rhythm {
    display: grid;
    gap: 10px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid var(--line);
  }

  .rhythm.watch {
    border-color: var(--heart);
  }

  h3 {
    font-size: 17px;
  }

  p {
    color: var(--muted);
    font-size: 15px;
  }

  dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  dl > div {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 3px 10px;
  }

  dt {
    color: var(--muted);
    font-size: 14px;
  }

  dd {
    margin: 0;
    font-weight: 700;
  }

  .bar {
    grid-column: 1 / -1;
    height: 8px;
    border-radius: 4px;
    background: var(--muted);
    opacity: 0.55;
  }

  .bar.now {
    background: var(--stage-light);
    opacity: 1;
  }
</style>
