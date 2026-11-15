<script lang="ts">
  // Après « je le sens » : l'instant est déjà enregistré. On peut ajouter une note, ou annuler un appui par erreur.
  import { onMount } from 'svelte';
  import { NOTE_MAX } from '../data/events';
  import type { FeltEvent } from '../data/types';
  import { cancelFelt, noteFelt } from '../lib/journal.svelte';

  let {
    event,
    onclose,
    onbreathe
  }: {
    event: FeltEvent;
    onclose: (message: string | null) => void;
    /** Enchaîner sur la respiration guidée (la note est enregistrée avant). */
    onbreathe?: () => void;
  } = $props();

  const start = (() => event)();
  let note = $state(start.note ?? '');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let heading: HTMLHeadingElement;

  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(start.at);

  onMount(() => heading.focus());

  async function run(action: () => Promise<void>, message: string | null, after?: () => void) {
    if (busy) return;
    busy = true;
    error = null;
    try {
      await action();
      if (after) after();
      else onclose(message);
    } catch (e) {
      console.error(e);
      error = "Ça n'a pas pu être enregistré. Réessaie dans un instant.";
      busy = false;
    }
  }

  const saveNote = () => (note.trim() !== (start.note ?? '') ? noteFelt(start.id!, note) : Promise.resolve());

  function save(e: SubmitEvent) {
    e.preventDefault();
    const changed = note.trim() !== (start.note ?? '');
    run(saveNote, changed && note.trim() ? 'Note ajoutée.' : null);
  }
</script>

<form class="felt-card" onsubmit={save} aria-labelledby="felt-title">
  <div class="top">
    <span class="dot" aria-hidden="true"></span>
    <h2 id="felt-title" tabindex="-1" bind:this={heading}>Moment noté à {time}</h2>
  </div>
  <p class="soft">Ton renard reste avec toi. Prends ton temps, respire doucement.</p>

  <label for="felt-note">Ce qui se passe ? <span class="optional">facultatif</span></label>
  <textarea
    id="felt-note"
    bind:value={note}
    maxlength={NOTE_MAX}
    rows="3"
    placeholder="Où tu es, ce que tu ressens, ce qui l'a déclenché…"
  ></textarea>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <button type="submit" class="primary" disabled={busy}>
    {note.trim() && note.trim() !== (start.note ?? '') ? 'Enregistrer la note' : 'Fermer'}
  </button>
  {#if onbreathe}
    <button type="button" class="breathe" disabled={busy} onclick={() => run(saveNote, null, onbreathe)}>
      Respirer avec ton renard
    </button>
  {/if}
  <button type="button" class="undo" disabled={busy} onclick={() => run(() => cancelFelt(start.id!), 'Moment annulé.')}>
    C'était une erreur : annuler ce moment
  </button>
</form>

<style>
  .felt-card {
    display: grid;
    gap: 10px;
    padding: 20px 18px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1.5px solid color-mix(in srgb, var(--felt) 55%, var(--line));
    box-shadow: 0 6px 22px color-mix(in srgb, var(--felt) 18%, transparent);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--felt);
    box-shadow: 0 0 0 0 var(--felt);
    animation: pulse 2.4s ease-out infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--felt) 60%, transparent);
    }
    100% {
      box-shadow: 0 0 0 14px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }

  h2 {
    font-size: 21px;
    outline: none;
  }

  .soft {
    color: var(--muted);
  }

  label {
    font-weight: 700;
    margin-top: 6px;
  }

  .optional {
    font-weight: 400;
    color: var(--muted);
    font-size: 14px;
    margin-left: 4px;
  }

  textarea {
    resize: vertical;
    min-height: 88px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1.5px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }

  textarea:focus-visible {
    outline: 3px solid var(--felt);
    outline-offset: 1px;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
  }

  .primary {
    min-height: 54px;
    margin-top: 4px;
    border: 0;
    border-radius: 999px;
    background: var(--felt);
    color: var(--felt-fg);
    font: inherit;
    font-weight: 700;
    font-size: 17px;
    cursor: pointer;
  }

  .breathe {
    min-height: 50px;
    border: 1.5px solid var(--breath);
    border-radius: 999px;
    background: color-mix(in srgb, var(--breath) 10%, var(--surface));
    color: var(--breath);
    font: inherit;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
  }

  .undo {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 15px;
    text-decoration: underline;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
