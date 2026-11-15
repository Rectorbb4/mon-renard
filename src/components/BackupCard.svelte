<script lang="ts">
  // Sauvegarde manuelle du journal : un fichier à garder, et le retour depuis ce fichier.
  import { liveQuery } from 'dexie';
  import { onMount } from 'svelte';
  import {
    BackupError,
    backupFileName,
    backupToJson,
    exportBackup,
    importBackup,
    parseBackup,
    summarizeBackup,
    type Backup,
    type BackupSummary
  } from '../data/backup';
  import { getDB } from '../data/db';
  import { startJournal } from '../lib/journal.svelte';
  import { formatSince } from '../lib/time';

  const KEY_LAST = 'mon-renard:derniere-sauvegarde';

  let counts = $state<{ checkins: number; events: number } | null>(null);
  let lastBackup = $state<number | null>(readLast());
  let busy = $state(false);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let pending = $state<{ backup: Backup; summary: BackupSummary; invalid: number; name: string } | null>(null);
  let fileInput: HTMLInputElement;

  onMount(() => {
    const sub = liveQuery(async () => {
      const db = getDB();
      return { checkins: await db.checkins.count(), events: await db.events.count() };
    }).subscribe({ next: (c) => (counts = c), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  });

  function readLast(): number | null {
    try {
      const v = Number(localStorage.getItem(KEY_LAST));
      return v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

  /** « du 5 novembre au 14 novembre 2026 », ou « le 5 novembre 2026 » */
  function period(s: BackupSummary): string {
    const b = dateFmt.format(s.to);
    if (dateFmt.format(s.from) === b) return `le ${b}`;
    const sameYear = new Date(s.from).getFullYear() === new Date(s.to).getFullYear();
    return `du ${(sameYear ? shortFmt : dateFmt).format(s.from)} au ${b}`;
  }

  async function save() {
    if (busy) return;
    busy = true;
    message = null;
    try {
      const now = Date.now();
      const backup = await exportBackup(getDB(), now, __APP_VERSION__);
      const blob = new Blob([backupToJson(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName(now);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      lastBackup = now;
      try {
        localStorage.setItem(KEY_LAST, String(now));
      } catch {
        /* stockage indisponible */
      }
      message = {
        kind: 'ok',
        text: `Sauvegarde enregistrée dans tes téléchargements : ${a.download}. Range-la dans un endroit sûr, elle contient ton journal.`
      };
    } catch (e) {
      console.error(e);
      message = { kind: 'error', text: "La sauvegarde n'a pas pu être créée. Réessaie dans un instant." };
    } finally {
      busy = false;
    }
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    message = null;
    pending = null;
    try {
      const { backup, invalid } = parseBackup(await file.text());
      pending = { backup, summary: summarizeBackup(backup), invalid, name: file.name };
    } catch (err) {
      if (!(err instanceof BackupError)) console.error(err);
      message = { kind: 'error', text: err instanceof BackupError ? err.message : "Ce fichier n'a pas pu être lu." };
    }
  }

  async function restore() {
    if (!pending || busy) return;
    busy = true;
    message = null;
    try {
      await startJournal();
      const r = await importBackup(getDB(), pending.backup);
      const added = [r.checkins && plural(r.checkins, 'check-in', 'check-ins'), r.events && plural(r.events, 'moment', 'moments')]
        .filter(Boolean)
        .join(' et ');
      const already = r.already ? ` ${plural(r.already, 'élément était', 'éléments étaient')} déjà sur ce téléphone.` : '';
      message = {
        kind: 'ok',
        text: added
          ? `C'est fait : ${added} ${r.checkins + r.events > 1 ? 'ajoutés' : 'ajouté'}.${already}`
          : `Rien à ajouter : tout était déjà sur ce téléphone.`
      };
      pending = null;
    } catch (e) {
      console.error(e);
      message = { kind: 'error', text: "L'import n'a pas pu se faire. Rien n'a été modifié." };
    } finally {
      busy = false;
    }
  }
</script>

<section class="backup" aria-labelledby="backup-title">
  <h2 id="backup-title">Tes données</h2>
  <p class="soft">
    Tout reste sur ce téléphone : pas de compte, pas de serveur, rien n'est envoyé. Si tu changes de téléphone ou si tu
    effaces les données de Chrome, ton journal disparaît : garde une sauvegarde de temps en temps.
  </p>

  <dl class="facts">
    <div>
      <dt>Sur ce téléphone</dt>
      <dd>
        {#if counts && counts.checkins + counts.events === 0}
          Rien pour l'instant
        {:else if counts}
          {plural(counts.checkins, 'check-in', 'check-ins')}, {plural(counts.events, 'moment', 'moments')}
        {:else}
          …
        {/if}
      </dd>
    </div>
    <div>
      <dt>Dernière sauvegarde</dt>
      <dd>{lastBackup ? formatSince(lastBackup, Date.now()) : 'jamais'}</dd>
    </div>
  </dl>

  <button class="primary" type="button" onclick={save} disabled={busy || !counts || counts.checkins + counts.events === 0}>
    Enregistrer une sauvegarde
  </button>

  {#if pending}
    <div class="confirm" role="group" aria-labelledby="confirm-title">
      <p id="confirm-title" class="confirm-title">Restaurer « {pending.name} » ?</p>
      <p>
        {plural(pending.summary.checkins, 'check-in', 'check-ins')} et {plural(pending.summary.events, 'moment', 'moments')},
        {period(pending.summary)}.
      </p>
      {#if pending.invalid}
        <p class="warn">{plural(pending.invalid, 'ligne abîmée sera laissée', 'lignes abîmées seront laissées')} de côté.</p>
      {/if}
      <p class="soft small">Ils s'ajoutent à ton journal : rien n'est effacé, et ce qui est déjà là n'est pas copié deux fois.</p>
      <button class="primary" type="button" onclick={restore} disabled={busy}>Ajouter à mon journal</button>
      <button class="link" type="button" onclick={() => (pending = null)} disabled={busy}>Annuler</button>
    </div>
  {:else}
    <button class="secondary" type="button" onclick={() => fileInput.click()} disabled={busy}>
      Restaurer une sauvegarde
    </button>
  {/if}
  <input
    class="file"
    type="file"
    accept="application/json,.json"
    bind:this={fileInput}
    onchange={onFile}
    tabindex="-1"
    aria-hidden="true"
  />

  {#if message}
    <p class={message.kind} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>
  {/if}
</section>

<style>
  .backup {
    display: grid;
    gap: 10px;
    padding: 18px 16px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
  }

  h2 {
    font-size: 18px;
  }

  .soft {
    color: var(--muted);
    font-size: 15px;
  }

  .small {
    font-size: 14px;
  }

  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 2px 0;
  }

  .facts div {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bg);
  }

  dt {
    font-size: 13px;
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-weight: 700;
    font-size: 15px;
  }

  .primary,
  .secondary {
    min-height: 52px;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    font-size: 16px;
    cursor: pointer;
  }

  .primary {
    border: 0;
    background: var(--accent);
    color: var(--accent-fg);
  }

  .secondary {
    border: 1.5px solid var(--accent);
    background: transparent;
    color: var(--accent);
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .confirm {
    display: grid;
    gap: 8px;
    padding: 14px;
    border-radius: 14px;
    border: 1.5px dashed var(--accent);
  }

  .confirm-title {
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .warn {
    color: var(--urgent);
    font-size: 15px;
  }

  .link {
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 15px;
    text-decoration: underline;
    cursor: pointer;
  }

  .file {
    display: none;
  }

  .ok {
    color: var(--fg);
    font-size: 15px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--breath) 12%, var(--surface));
    overflow-wrap: anywhere;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
    font-size: 15px;
  }
</style>
