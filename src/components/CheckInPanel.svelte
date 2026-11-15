<script lang="ts">
  // Le check-in : humeur, énergie, nuit (une fois par jour) et un mot facultatif. Pensé pour moins de 15 secondes.
  import { onMount } from 'svelte';
  import { WORD_MAX } from '../data/checkins';
  import type { CheckIn } from '../data/types';
  import { MOOD_IDS, MOODS, moodFromScore } from '../fox/moods';
  import { isSleepNotedToday, saveCheckIn } from '../lib/journal.svelte';

  let {
    previous,
    onpreview,
    ondone
  }: {
    previous: CheckIn | null;
    /** Appelé à chaque mouvement du curseur d'humeur, pour que le renard change en direct. */
    onpreview: (score: number) => void;
    /** Appelé après l'enregistrement (avec le check-in) ou l'annulation (null). */
    ondone: (saved: CheckIn | null) => void;
  } = $props();

  // Le panneau part de la saisie précédente, puis vit sa vie : on ne suit pas les changements de `previous`.
  const start = (() => previous)();
  let mood = $state(start?.mood ?? 0);
  let energy = $state(start?.energy ?? 0.5);
  let sleep = $state<number | null>(null);
  let word = $state('');
  let askSleep = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const moodId = $derived(moodFromScore(mood));
  const moodGradient = `linear-gradient(90deg, ${MOOD_IDS.map((id) => MOODS[id].sky.bottom).join(', ')})`;

  const SLEEP = [
    { value: 0, label: 'Très mauvaise' },
    { value: 0.25, label: 'Mauvaise' },
    { value: 0.5, label: 'Moyenne' },
    { value: 0.75, label: 'Bonne' },
    { value: 1, label: 'Très bonne' }
  ];

  function energyLabel(v: number): string {
    if (v < 0.2) return 'À plat';
    if (v < 0.4) return 'Fatigue';
    if (v < 0.6) return 'Ça va';
    if (v < 0.8) return 'En forme';
    return 'Pleine forme';
  }

  onMount(() => {
    onpreview(mood);
    isSleepNotedToday().then((noted) => (askSleep = !noted));
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (saving) return;
    saving = true;
    error = null;
    try {
      const saved = await saveCheckIn({ mood, energy, sleep: askSleep ? sleep : null, word });
      ondone(saved);
    } catch (err) {
      console.error(err);
      error = "Le check-in n'a pas pu être enregistré. Réessaie dans un instant.";
      saving = false;
    }
  }
</script>

<form class="panel" onsubmit={submit} aria-label="Check-in">
  <div class="field">
    <div class="row">
      <label for="ci-mood">Ton humeur</label>
      <output for="ci-mood" class="value mood-value">{MOODS[moodId].label}</output>
    </div>
    <input
      id="ci-mood"
      class="range"
      type="range"
      min="-1"
      max="1"
      step="0.01"
      bind:value={mood}
      oninput={() => onpreview(mood)}
      style:--track={moodGradient}
      aria-valuetext={MOODS[moodId].label}
    />
    <div class="ends"><span>Au plus bas</span><span>Au plus haut</span></div>
  </div>

  <div class="field">
    <div class="row">
      <label for="ci-energy">Ton énergie</label>
      <output for="ci-energy" class="value">{energyLabel(energy)}</output>
    </div>
    <input
      id="ci-energy"
      class="range"
      type="range"
      min="0"
      max="1"
      step="0.01"
      bind:value={energy}
      style:--track="linear-gradient(90deg, var(--surface-2), var(--accent))"
      aria-valuetext={energyLabel(energy)}
    />
  </div>

  {#if askSleep}
    <fieldset class="field">
      <legend>Ta nuit <span class="optional">facultatif</span></legend>
      <div class="chips">
        {#each SLEEP as option (option.value)}
          <button
            type="button"
            class="chip"
            aria-pressed={sleep === option.value}
            onclick={() => (sleep = sleep === option.value ? null : option.value)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    </fieldset>
  {/if}

  <div class="field">
    <label for="ci-word">Un mot ? <span class="optional">facultatif</span></label>
    <input
      id="ci-word"
      class="text"
      type="text"
      bind:value={word}
      maxlength={WORD_MAX}
      placeholder="boulot, soleil, dispute…"
      autocomplete="off"
      enterkeyhint="done"
    />
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="actions">
    <button type="button" class="secondary" onclick={() => ondone(null)} disabled={saving}>Annuler</button>
    <button type="submit" class="primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
  </div>
</form>

<style>
  .panel {
    display: grid;
    gap: 22px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px 18px 18px;
  }

  .field {
    display: grid;
    gap: 8px;
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  label,
  legend {
    font-weight: 700;
    padding: 0;
  }

  legend {
    margin-bottom: 8px;
  }

  .optional {
    font-weight: 400;
    color: var(--muted);
    font-size: 14px;
    margin-left: 4px;
  }

  .value {
    color: var(--muted);
  }

  .mood-value {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
    color: var(--fg);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 13px;
  }

  /* Curseurs : piste colorée épaisse, gros bouton facile à attraper au pouce */
  .range {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 44px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    touch-action: pan-y;
  }

  .range::-webkit-slider-runnable-track {
    height: 14px;
    border-radius: 999px;
    background: var(--track);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
  }

  .range::-moz-range-track {
    height: 14px;
    border-radius: 999px;
    background: var(--track);
  }

  .range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 34px;
    height: 34px;
    margin-top: -10px;
    border-radius: 50%;
    background: var(--surface);
    border: 3px solid var(--fg);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }

  .range::-moz-range-thumb {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface);
    border: 3px solid var(--fg);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }

  .range:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
    border-radius: 999px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    min-height: 44px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    background: var(--surface-2);
    color: var(--fg);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
    font-weight: 700;
  }

  .text {
    min-height: 48px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  .text:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 10px;
  }

  .actions button {
    min-height: 54px;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    font-size: 17px;
    cursor: pointer;
  }

  .primary {
    border: 0;
    background: var(--accent);
    color: var(--accent-fg);
  }

  .secondary {
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
