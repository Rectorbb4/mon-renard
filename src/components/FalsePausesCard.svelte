<script lang="ts">
  // Effacer d'un coup les pauses que la bague a lancées toute seule le soir du 21 novembre.
  import { liveQuery } from 'dexie';
  import { getDB } from '../data/db';
  import { deleteFeltEvents, feltEventsBetween, restoreFeltEvents } from '../data/events';
  import type { FeltEvent } from '../data/types';
  import { isAndroidApp } from '../lib/android';
  import { FALSE_PAUSE_FROM, FALSE_PAUSE_OFFER_ENDS, falsePauseEnd, falsePauses } from '../lib/falsePauses';
  import { journal, startJournal } from '../lib/journal.svelte';

  const DONE_KEY = 'mon-renard:fausses-pauses-traitees';
  const active = isAndroidApp() && Date.now() < FALSE_PAUSE_OFFER_ENDS;

  function wasHandled() {
    try {
      return localStorage.getItem(DONE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setHandled(on: boolean) {
    handled = on;
    try {
      if (on) localStorage.setItem(DONE_KEY, '1');
      else localStorage.removeItem(DONE_KEY);
    } catch {
      /* stockage indisponible */
    }
  }

  let handled = $state(wasHandled());
  // raw : les moments doivent rester des objets simples pour retourner tels quels dans la base
  let found = $state.raw<FeltEvent[]>([]);
  let removed = $state.raw<FeltEvent[]>([]);
  let kept = $state.raw<Set<number>>(new Set());
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!active || handled) return;
    let sub: { unsubscribe(): void } | null = null;
    let cancelled = false;
    startJournal().then(() => {
      const profileId = journal.profileId;
      if (cancelled || profileId == null) return;
      const db = getDB();
      sub = liveQuery(() => feltEventsBetween(db, profileId, FALSE_PAUSE_FROM, falsePauseEnd())).subscribe({
        next: (list) => (found = falsePauses(list, falsePauseEnd())),
        error: (e) => console.error(e)
      });
    });
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  });

  const chosen = $derived(found.filter((e) => !kept.has(e.id!)));
  const clock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const shortClock = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const count = (n: number) => `${n} ${n > 1 ? 'moments' : 'moment'}`;

  function toggle(id: number) {
    const next = new Set(kept);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    kept = next;
  }

  async function erase() {
    if (busy || !chosen.length) return;
    busy = true;
    error = null;
    const list = chosen;
    try {
      await deleteFeltEvents(getDB(), list.map((e) => e.id!));
      removed = list;
      kept = new Set();
      setHandled(true);
    } catch (e) {
      console.error(e);
      error = "Ces moments n'ont pas pu être effacés. Réessaie.";
    } finally {
      busy = false;
    }
  }

  async function undo() {
    if (busy) return;
    busy = true;
    error = null;
    try {
      await restoreFeltEvents(getDB(), removed);
      removed = [];
      setHandled(false);
    } catch (e) {
      console.error(e);
      error = "Ces moments n'ont pas pu être remis. Réessaie.";
    } finally {
      busy = false;
    }
  }
</script>

{#if active && removed.length}
  <section class="clean" aria-live="polite">
    <p class="done">{count(removed.length)} {removed.length > 1 ? 'effacés' : 'effacé'} de ton journal.</p>
    <button type="button" class="quiet" onclick={undo} disabled={busy}>Annuler</button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{:else if active && !handled && found.length}
  <section class="clean" aria-labelledby="false-title">
    <h2 id="false-title">Fausses pauses du 21 novembre</h2>
    <p>
      La bague a pu noter ces moments toute seule : {count(found.length)} sans note entre
      {shortClock.format(found[0].at)} et {shortClock.format(found[found.length - 1].at)}.
    </p>

    <details>
      <summary>Choisir lesquels effacer</summary>
      <ul>
        {#each found as e (e.id)}
          <li>
            <label>
              <input type="checkbox" checked={!kept.has(e.id!)} onchange={() => toggle(e.id!)} />
              {clock.format(e.at)}
            </label>
          </li>
        {/each}
      </ul>
    </details>

    <div class="actions">
      <button type="button" class="erase" onclick={erase} disabled={busy || !chosen.length}>
        Effacer {chosen.length === found.length && found.length > 1 ? 'les ' : ''}{count(chosen.length)}
      </button>
      <button type="button" class="quiet" onclick={() => setHandled(true)} disabled={busy}>Tout garder</button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .clean {
    display: grid;
    gap: 10px;
    margin-bottom: 16px;
    padding: 16px;
    border-radius: var(--radius);
    border: 1.5px solid var(--felt);
    background: color-mix(in srgb, var(--felt) 9%, var(--surface));
  }

  h2 {
    font-size: 20px;
  }

  p {
    font-size: 15px;
    color: var(--muted);
  }

  .done {
    color: var(--fg);
    font-weight: 700;
  }

  details {
    font-size: 15px;
    color: var(--muted);
  }

  summary {
    min-height: 36px;
    padding-top: 5px;
    cursor: pointer;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px 12px;
    max-height: 240px;
    margin: 4px 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  input {
    width: 20px;
    height: 20px;
    accent-color: var(--felt);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .erase {
    flex: 1 1 100%;
    border: 0;
    background: var(--felt);
    color: var(--felt-fg);
  }

  .quiet {
    justify-self: start;
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
  }

  .actions .quiet {
    flex: 1 1 100%;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
  }
</style>
