<script lang="ts">
  // Le carnet du renard : ce qu'il a remarqué chez toi, au fil des semaines.
  import type { Clue } from '../data/types';

  let { clues }: { clues: Clue[] } = $props();

  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
</script>

<section class="carnet" aria-labelledby="carnet-title">
  <h2 id="carnet-title">Le carnet de ton renard</h2>
  {#if clues.length}
    <ol>
      {#each clues as c (c.id)}
        <li>
          <time datetime={new Date(c.at).toISOString()}>{date.format(c.at)}</time>
          <p>{c.text}</p>
        </li>
      {/each}
    </ol>
    <p class="note">Ce sont des pistes à vérifier avec le temps, pas des explications ni un diagnostic.</p>
  {:else}
    <p class="empty">
      Rien de noté pour l'instant. Dès qu'une tendance revient chez toi, ton renard l'écrit ici, et elle y reste.
    </p>
  {/if}
</section>

<style>
  .carnet {
    display: grid;
    gap: 10px;
  }

  ol {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 2px 0 2px 16px;
    border-left: 2px dashed color-mix(in srgb, var(--accent) 55%, var(--line));
    list-style: none;
  }

  li {
    position: relative;
    display: grid;
    gap: 1px;
    padding: 8px 0;
  }

  li::before {
    content: '';
    position: absolute;
    left: -22px;
    top: 15px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px var(--bg);
  }

  time {
    color: var(--muted);
    font-size: 13px;
  }

  li p {
    font-size: 16px;
    line-height: 1.35;
  }

  .note,
  .empty {
    color: var(--muted);
    font-size: 14px;
  }
</style>
