<script lang="ts">
  // Réglages de l'alerte « ton pouls monte » : seuil, plages horaires, son, essai.
  import { alertBridge, isAndroidApp } from '../lib/android';
  import { alertConfig, nativeAlert, saveAlertConfig, testAlert } from '../lib/alert.svelte';
  import {
    DAY_LETTERS,
    DAY_NAMES,
    describeSlot,
    formatMinutes,
    parseMinutes,
    THRESHOLD_MAX,
    THRESHOLD_MIN,
    WEEK,
    type AlertSlot
  } from '../lib/pulseAlert';

  const inApp = isAndroidApp();
  const native = nativeAlert();

  let soundName = $state(readSoundName());

  function readSoundName(): string {
    try {
      return alertBridge()?.alertSoundName() || 'Alarme du téléphone';
    } catch {
      return 'Alarme du téléphone';
    }
  }

  // Le son choisi dans le sélecteur d'Android revient par un événement
  $effect(() => {
    const onSound = () => (soundName = readSoundName());
    window.addEventListener('renard-alert-sound', onSound);
    return () => window.removeEventListener('renard-alert-sound', onSound);
  });

  function change(fn: () => void) {
    fn();
    saveAlertConfig();
  }

  function setThreshold(v: number) {
    change(() => (alertConfig.threshold = Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(v)))));
  }

  function toggleDay(slot: AlertSlot, day: number) {
    change(() => {
      slot.days = slot.days.includes(day) ? slot.days.filter((d) => d !== day) : [...slot.days, day].sort();
    });
  }

  function setTime(slot: AlertSlot, key: 'from' | 'to', text: string) {
    const m = parseMinutes(text);
    if (m != null) change(() => (slot[key] = m));
  }

  function addSlot() {
    change(() => alertConfig.slots.push({ days: [1, 2, 3, 4, 5, 6, 0], from: 18 * 60, to: 22 * 60 }));
  }

  function removeSlot(i: number) {
    change(() => alertConfig.slots.splice(i, 1));
  }

  function pickSound(kind: 'music' | 'ringtone') {
    try {
      alertBridge()?.pickAlertSound(kind);
    } catch (e) {
      console.error(e);
    }
  }

  const summary = $derived(
    alertConfig.slots.filter((s) => s.days.length).length
      ? alertConfig.slots.filter((s) => s.days.length).map(describeSlot).join(' ; ')
      : 'aucune plage : elle ne sonnera jamais'
  );
</script>

<section class="card" aria-labelledby="alert-card-title">
  <h2 id="alert-card-title">Alerte quand ton pouls monte</h2>
  <p class="soft">
    Si ton pouls reste au-dessus de ton seuil pendant 30 secondes, le téléphone sonne et vibre fort, puis ton renard te
    propose de respirer avec lui. Seulement pendant tes plages horaires, et avec la ceinture ou la bague branchée.
  </p>

  <label class="switch">
    <input type="checkbox" checked={alertConfig.enabled} onchange={(e) => change(() => (alertConfig.enabled = e.currentTarget.checked))} />
    <span>{alertConfig.enabled ? 'Alerte activée' : 'Alerte désactivée'}</span>
  </label>

  <fieldset disabled={!alertConfig.enabled}>
    <legend>Seuil</legend>
    <div class="threshold">
      <button type="button" class="round" aria-label="Baisser le seuil" onclick={() => setThreshold(alertConfig.threshold - 5)}>−</button>
      <p class="value"><strong>{alertConfig.threshold}</strong> <span>battements / min</span></p>
      <button type="button" class="round" aria-label="Monter le seuil" onclick={() => setThreshold(alertConfig.threshold + 5)}>+</button>
    </div>
    <input
      type="range"
      min={THRESHOLD_MIN}
      max={THRESHOLD_MAX}
      step="1"
      value={alertConfig.threshold}
      aria-label="Seuil du pouls"
      onchange={(e) => setThreshold(Number(e.currentTarget.value))}
    />
    <p class="hint">Au repos, le pouls est souvent entre 60 et 80. Regarde le tien dans « En direct » pour choisir.</p>
  </fieldset>

  <fieldset disabled={!alertConfig.enabled}>
    <legend>Quand elle peut sonner</legend>
    {#each alertConfig.slots as slot, i (i)}
      <div class="slot">
        <div class="days" role="group" aria-label="Jours">
          {#each WEEK as d (d)}
            <button
              type="button"
              class="day"
              class:on={slot.days.includes(d)}
              aria-pressed={slot.days.includes(d)}
              aria-label={DAY_NAMES[d]}
              onclick={() => toggleDay(slot, d)}>{DAY_LETTERS[d]}</button
            >
          {/each}
        </div>
        <div class="hours">
          <label>de <input type="time" value={formatMinutes(slot.from)} onchange={(e) => setTime(slot, 'from', e.currentTarget.value)} /></label>
          <label>à <input type="time" value={formatMinutes(slot.to)} onchange={(e) => setTime(slot, 'to', e.currentTarget.value)} /></label>
          <button type="button" class="remove" onclick={() => removeSlot(i)} aria-label="Retirer cette plage">Retirer</button>
        </div>
      </div>
    {/each}
    <button type="button" class="add" onclick={addSlot}>+ Ajouter une plage</button>
    <p class="hint">En ce moment : {summary}. Une plage de 22:00 à 02:00 passe minuit.</p>
  </fieldset>

  <fieldset disabled={!alertConfig.enabled}>
    <legend>Son</legend>
    {#if native}
      <p class="sound-name">{soundName}</p>
      <div class="choices">
        <button type="button" class="add" onclick={() => pickSound('ringtone')}>Une sonnerie</button>
        <button type="button" class="add" onclick={() => pickSound('music')}>Une musique à toi</button>
      </div>
      <p class="hint">
        Le son suit le volume des alarmes du téléphone et sonne même en mode silencieux ; la vibration est longue et
        forte. Ça marche aussi appli fermée, tant qu'un capteur est branché.
      </p>
    {:else}
      <div class="choices">
        <label class:on={alertConfig.sound === 'carillon'}>
          <input type="radio" name="alert-sound" checked={alertConfig.sound === 'carillon'} onchange={() => change(() => (alertConfig.sound = 'carillon'))} />
          Carillon
        </label>
        <label class:on={alertConfig.sound === 'sonnerie'}>
          <input type="radio" name="alert-sound" checked={alertConfig.sound === 'sonnerie'} onchange={() => change(() => (alertConfig.sound = 'sonnerie'))} />
          Sonnerie
        </label>
      </div>
      <p class="hint">
        {#if inApp}
          Mets à jour l'appli (version 1.4, plus bas) pour qu'elle sonne aussi appli fermée, avec le son de ton choix.
        {:else}
          Dans le navigateur, l'alerte ne sonne que si Mon renard est ouvert à l'écran. Avec l'appli Android, elle sonne
          aussi appli fermée.
        {/if}
      </p>
    {/if}
  </fieldset>

  <button type="button" class="test" onclick={testAlert}>Essayer l'alerte (5 secondes)</button>
</section>

<style>
  .card {
    display: grid;
    gap: 12px;
    padding: 18px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid var(--line);
  }

  h2 {
    font-size: 20px;
  }

  .soft,
  .hint {
    color: var(--muted);
    font-size: 15px;
  }

  .hint {
    font-size: 14px;
  }

  fieldset {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 12px 0 0;
    border: 0;
    border-top: 1px solid var(--line);
  }

  fieldset:disabled {
    opacity: 0.45;
  }

  legend {
    padding: 0;
    font-weight: 700;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    font-weight: 700;
    cursor: pointer;
  }

  .switch input {
    width: 24px;
    height: 24px;
    accent-color: var(--heart);
  }

  .threshold {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .value {
    text-align: center;
  }

  .value strong {
    font-family: var(--font-display);
    font-size: 32px;
    color: var(--heart);
  }

  .value span {
    color: var(--muted);
    font-size: 14px;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--heart);
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  .round {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1.5px solid var(--line);
    background: var(--surface-2);
    color: var(--fg);
    font-size: 24px;
    font-weight: 700;
  }

  .slot {
    display: grid;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    background: var(--surface-2);
  }

  .days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .day {
    min-height: 40px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    background: var(--surface);
    color: var(--muted);
    font-weight: 700;
  }

  .day.on {
    border-color: var(--heart);
    background: color-mix(in srgb, var(--heart) 14%, var(--surface));
    color: var(--fg);
  }

  .hours {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .hours input {
    min-height: 40px;
    padding: 0 8px;
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
  }

  .remove {
    margin-left: auto;
    min-height: 40px;
    border: 0;
    background: none;
    color: var(--muted);
    text-decoration: underline;
  }

  .add {
    justify-self: start;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
    font-weight: 600;
  }

  .sound-name {
    font-weight: 700;
  }

  .choices .add {
    flex: 1;
  }

  .choices {
    display: flex;
    gap: 8px;
  }

  .choices label {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 48px;
    border-radius: 999px;
    border: 1.5px solid var(--line);
    font-weight: 700;
    cursor: pointer;
  }

  .choices label.on {
    border-color: var(--heart);
    background: color-mix(in srgb, var(--heart) 12%, var(--surface));
  }

  .choices input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .test {
    min-height: 52px;
    border-radius: 999px;
    border: 1.5px solid var(--heart);
    background: color-mix(in srgb, var(--heart) 8%, var(--surface));
    color: var(--heart);
    font-weight: 700;
  }
</style>
