<script lang="ts">
  // Une question à toucher sous chaque section ou relevé : l'explication reste repliée tant qu'on n'en veut pas.
  import { EXPLANATIONS, type Explanation, type ExplanationId } from '../lib/explanations';

  let { id }: { id: ExplanationId } = $props();

  const text = $derived<Explanation>(EXPLANATIONS[id]);
</script>

<details class="explain">
  <summary><span class="mark" aria-hidden="true">?</span><span>{text.question}</span></summary>
  <div class="body">
    {#each text.intro as line (line)}
      <p>{line}</p>
    {/each}
    {#if text.terms}
      <dl>
        {#each text.terms as term (term.name)}
          <div>
            <dt>{term.name}</dt>
            <dd>{term.text}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    {#if text.caution}
      <p class="caution">{text.caution}</p>
    {/if}
  </div>
</details>

<style>
  .explain {
    min-width: 0;
    font-size: 15px;
    line-height: 1.4;
  }

  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    font-size: 13px;
    line-height: 1;
  }

  details[open] summary {
    color: var(--fg);
  }

  .body {
    display: grid;
    gap: 10px;
    margin-bottom: 4px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-2);
  }

  dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  dt {
    font-weight: 700;
  }

  dd {
    margin: 0;
    color: var(--muted);
  }

  .caution {
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-weight: 700;
  }
</style>
