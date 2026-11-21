<script lang="ts">
  // Essai des gestes de la bague : chaque geste est capté pendant 8 secondes, sans lancer de pause.
  import { appVersion, isAndroidApp, pauseBridge } from '../lib/android';
  import {
    CONTROL,
    GESTURES,
    compareGestures,
    loadTrials,
    saveTrials,
    usableGestures,
    type GestureResult,
    type RingSignal,
    type Trials
  } from '../lib/ringGestures';

  const TRIAL_MS = 8000;
  const inApp = isAndroidApp();
  const b = pauseBridge();
  // À partir de la 2.1, l'essai ouvre vraiment le tactile de la bague, puis remet son réglage
  const canTest = typeof b?.setRingTest === 'function' && (appVersion()?.code ?? 0) >= 12;

  let connected = $state(ringConnected());
  let trials = $state.raw<Trials>(loadTrials());
  let activeId = $state<string | null>(null);
  let captured = $state.raw<RingSignal[]>([]);
  let secondsLeft = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  let endsAt = 0;

  const results = $derived(compareGestures(trials));
  const byId = $derived(new Map(results.map((r) => [r.id, r])));
  const usable = $derived(usableGestures(results));
  const triedCount = $derived(results.filter((r) => r.id !== CONTROL).length);
  const activeGesture = $derived(GESTURES.find((g) => g.id === activeId));

  function ringConnected(): boolean {
    try {
      const list = JSON.parse(b?.bleActive() ?? '[]');
      return Array.isArray(list) && list.some((x) => x?.kind === 'bague' && x?.state === 'connected');
    } catch {
      return false;
    }
  }

  function begin(id: string) {
    if (activeId || !connected) return;
    captured = [];
    activeId = id;
    endsAt = Date.now() + TRIAL_MS;
    secondsLeft = Math.ceil(TRIAL_MS / 1000);
    b?.setRingTest?.(true);
    timer = setInterval(() => {
      const left = endsAt - Date.now();
      if (left <= 0) finish(true);
      else secondsLeft = Math.ceil(left / 1000);
    }, 200);
  }

  function finish(keep: boolean) {
    if (timer) clearInterval(timer);
    timer = null;
    b?.setRingTest?.(false);
    if (keep && activeId) {
      trials = { ...trials, [activeId]: captured };
      saveTrials(trials);
    }
    activeId = null;
  }

  function clearTrials() {
    trials = {};
    saveTrials(trials);
  }

  $effect(() => {
    if (!canTest) return;
    const onBle = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.kind !== 'bague') return;
      if (d.type === 'gesture') {
        if (activeId) captured = [...captured, { channel: d.channel, code: String(d.code), at: Number(d.at) }];
      } else if (d.type === 'status') {
        connected = d.state === 'connected';
      } else if (d.type === 'end') {
        connected = false;
      }
      if (!connected && activeId) finish(false);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') connected = ringConnected();
      else if (activeId) finish(false);
    };
    window.addEventListener('renard-ble', onBle);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('renard-ble', onBle);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) finish(false);
    };
  });

  const received = (r: GestureResult) => r.signals.map((s) => (s.count > 1 ? `${s.label}, ${s.count} fois` : s.label)).join(' et ');

  function verdict(r: GestureResult): string {
    switch (r.status) {
      case 'calme':
        return 'Aucun signal sans bouger, parfait.';
      case 'rien':
        return 'Rien reçu : la bague ne réagit pas à ce geste.';
      case 'apart':
        return `Signal à part : ${received(r)}.`;
      case 'commun':
        return `Même signal que ${r.sameAs.join(', ').toLowerCase()} : ${received(r)}.`;
      case 'parasite':
        return r.id === CONTROL
          ? `Reçu sans bouger : ${received(r)}. Ce signal part tout seul, il n'est pas fiable.`
          : `Pas fiable, ce signal part aussi sans bouger : ${received(r)}.`;
    }
  }
</script>

{#if inApp}
  <section class="card" aria-labelledby="gesture-title">
    <h2 id="gesture-title">Essai des gestes</h2>

    {#if !canTest}
      <p class="soft">Installe la version 2.1 de l'appli (plus bas) : elle ouvre le tactile de la bague pendant l'essai.</p>
    {:else}
      <p class="soft">
        Fais chaque geste pendant les 8 secondes. L'appli note ce que la bague envoie et compare : seuls les gestes aux
        signaux différents pourront avoir chacun leur action. Aucune pause ne se lance pendant un essai.
      </p>

      {#if !connected}
        <p class="wait" role="status">Bague pas connectée. Mets-la au doigt et attends qu'elle soit « connectée » sur l'accueil.</p>
      {/if}

      {#if activeGesture}
        <div class="now" role="status" aria-live="polite">
          <p class="now-title">{activeGesture.label}</p>
          <p class="now-hint">{activeGesture.hint}</p>
          <p class="now-count"><strong>{secondsLeft} s</strong>, {captured.length} {captured.length > 1 ? 'signaux reçus' : 'signal reçu'}</p>
          <div class="track" aria-hidden="true"><span style:animation-duration="{TRIAL_MS}ms"></span></div>
          <button type="button" class="ghost" onclick={() => finish(false)}>Annuler cet essai</button>
        </div>
      {/if}

      <ol>
        {#each GESTURES as g (g.id)}
          {@const r = byId.get(g.id)}
          <li class:good={r?.status === 'apart' || r?.status === 'calme'} class:bad={r?.status === 'parasite'}>
            <div>
              <p class="what">{g.label}</p>
              <p class="hint">{r ? verdict(r) : g.hint}</p>
            </div>
            <button type="button" class={r ? 'ghost' : 'start'} disabled={!connected || activeId != null} onclick={() => begin(g.id)}>
              {r ? 'Refaire' : 'Essayer'}
            </button>
          </li>
        {/each}
      </ol>

      {#if triedCount > 0}
        <div class="sum">
          <p>
            {#if usable === 0}
              Aucun geste fiable pour l'instant.
            {:else if usable === 1}
              <strong>1 geste</strong> utilisable d'après tes essais.
            {:else}
              <strong>{usable} gestes différents</strong> utilisables d'après tes essais.
            {/if}
            {#if !trials[CONTROL]}Fais aussi « Ne rien faire » pour repérer les signaux qui partent seuls.{/if}
          </p>
          <button type="button" class="ghost" disabled={activeId != null} onclick={clearTrials}>Tout effacer</button>
        </div>
      {/if}
    {/if}
  </section>
{/if}

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
  }

  .soft {
    font-size: 15px;
  }

  .hint {
    font-size: 14px;
  }

  .wait {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface-2);
    font-size: 14px;
  }

  .now {
    display: grid;
    gap: 6px;
    padding: 14px;
    border-radius: 14px;
    border: 1.5px solid var(--felt);
    background: color-mix(in srgb, var(--felt) 9%, var(--surface));
  }

  .now-title {
    font-size: 20px;
    font-weight: 700;
  }

  .now-hint {
    color: var(--muted);
    font-size: 15px;
  }

  .now-count {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 6px;
    margin: 2px 0 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }

  .track span {
    display: block;
    height: 100%;
    background: var(--felt);
    transform-origin: left;
    animation: fill linear forwards;
  }

  @keyframes fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track {
      display: none;
    }
  }

  ol {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0 10px 10px;
    border-top: 1px solid var(--line);
    border-left: 3px solid transparent;
  }

  li.good {
    border-left-color: var(--felt);
  }

  li.bad {
    border-left-color: var(--urgent);
  }

  li > div {
    flex: 1;
    min-width: 0;
  }

  .what {
    font-weight: 700;
  }

  button {
    flex: none;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .start {
    border: 1.5px solid var(--felt);
    background: color-mix(in srgb, var(--felt) 8%, var(--surface));
    color: var(--felt);
  }

  .ghost {
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
  }

  .now .ghost {
    justify-self: start;
  }

  .sum {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 15px;
  }

  .sum p {
    flex: 1 1 200px;
  }
</style>
