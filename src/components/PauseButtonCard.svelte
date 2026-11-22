<script lang="ts">
  // Le bouton pause : contre l'impulsivité, demander une pause sans sortir le téléphone.
  // Trois tapotements sur la bague en 3 secondes (si l'option est activée), ou un porte-clés « iTag » pressé deux fois.
  // Tout passe par l'appli Android (BleSensors.java, RingKeys.java, PulseAlert.trigger).
  import { appVersion, isAndroidApp, pauseBridge } from '../lib/android';
  import { stateLabel } from '../sensors/native';

  const inApp = isAndroidApp();
  const b = pauseBridge();

  let status = $state<string | null>(activeState());
  let name = $state<string | null>(null);
  let error = $state<string | null>(null);
  let unknown = $state(readUnknown());
  let ringMessage = $state<string | null>(null);
  // Avant la 2.2, l'option suivait encore les mouvements de la main
  const hasGestureOption = typeof b?.setRingGesture === 'function' && (appVersion()?.code ?? 0) >= 13;
  let gestureOn = $state(b?.ringGestureOn?.() ?? false);
  let gestureCount = $state(b?.ringGesturesLastHour?.() ?? 0);

  function toggleGesture() {
    gestureOn = !gestureOn;
    b?.setRingGesture?.(gestureOn);
  }

  $effect(() => {
    if (!hasGestureOption) return;
    const timer = setInterval(() => (gestureCount = b?.ringGesturesLastHour?.() ?? 0), 3000);
    return () => clearInterval(timer);
  });

  function activeState(): string | null {
    try {
      const list = JSON.parse(b?.bleActive() ?? '[]');
      const me = Array.isArray(list) ? list.find((x) => x?.kind === 'bouton') : null;
      return me ? String(me.state) : null;
    } catch {
      return null;
    }
  }

  function readUnknown(): string[] {
    try {
      return (b?.bleUnknown() ?? '').split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  $effect(() => {
    const onBle = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      if (d.kind === 'bague' && d.type !== 'reading') unknown = readUnknown();
      if (d.kind !== 'bouton') return;
      if (d.type === 'status') {
        status = d.state;
        if (d.name) name = d.name;
      } else if (d.type === 'end') {
        status = null;
        error = d.message ?? null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      status = activeState();
      unknown = readUnknown();
    };
    window.addEventListener('renard-ble', onBle);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('renard-ble', onBle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });

  function connect() {
    error = null;
    try {
      if (!b?.bleStart('bouton')) error = "Ce téléphone n'a pas de Bluetooth utilisable.";
      else status = 'scanning';
    } catch (e) {
      console.error(e);
      error = "Le bouton n'a pas pu être branché.";
    }
  }

  function disconnect() {
    try {
      b?.bleStop('bouton');
    } catch {
      /* déjà débranché */
    }
    status = null;
  }

  function pingRing() {
    if (typeof b?.ringPing !== 'function') {
      ringMessage = "Mets d'abord l'appli à jour (version 1.8, plus bas).";
    } else if (b.ringPing()) {
      ringMessage = 'Signal envoyé : regarde si la bague clignote ou vibre.';
    } else {
      ringMessage = "La bague n'est pas connectée : branche-la d'abord dans « En direct », sur l'accueil.";
    }
  }
</script>

<section class="card" aria-labelledby="pause-title">
  <h2 id="pause-title">Bouton pause</h2>
  <p class="soft">
    Quand tu sens l'impulsion monter, demande une pause <strong>sans sortir ton téléphone</strong> : le téléphone vibre
    fort (et sonne pendant tes plages horaires de l'alerte, jamais au bureau), l'instant est noté dans ton journal, et
    ton renard te propose de respirer avant d'agir. À toute heure, même si l'alerte du pouls est désactivée.
  </p>

  {#if b}
    <div class="row">
      <div>
        <p class="what">Trois tapotements sur la bague</p>
        {#if !hasGestureOption}
          <p class="hint">Installe la version 2.2 de l'appli (plus bas) pour lancer une pause en tapotant ta bague.</p>
        {:else if gestureOn}
          <p class="hint">
            Activé. Tapote au moins 3 fois en 3 secondes : le téléphone vibre, sonne pendant tes plages horaires, puis te
            demande si c'est une erreur et comment tu te sens.
          </p>
          {#if (appVersion()?.code ?? 0) >= 16}
            <p class="hint">
              Sans la ceinture, la bague mesure ton pouls en continu de 7 h à 23 h pour garder les secondes autour de
              chaque pause. Sa batterie se vide plus vite, et la mesure s'arrête sous 15 %.
            </p>
          {/if}
        {:else}
          <p class="hint">Désactivé : tes tapotements ne lancent aucune pause.</p>
        {/if}
      </div>
      {#if hasGestureOption}
        <button type="button" class={gestureOn ? 'ghost' : 'start'} role="switch" aria-checked={gestureOn} onclick={toggleGesture}>
          {gestureOn ? 'Désactiver' : 'Activer'}
        </button>
      {/if}
    </div>
    {#if hasGestureOption}
      <div class="count">
        <p class="hint">
          Tapotements reçus depuis une heure : <strong>{gestureCount}</strong>. S'il monte sans que tu tapotes, laisse
          l'option désactivée.
        </p>
        <button type="button" class="ghost" onclick={pingRing}>Faire clignoter</button>
      </div>
    {/if}
    {#if ringMessage}
      <p class="hint" role="status">{ringMessage}</p>
    {/if}
    {#if gestureOn && typeof b.openLockSettings === 'function'}
      <div class="row">
        <div>
          <p class="what">Pour que la pause marche téléphone verrouillé</p>
          <p class="hint">
            Sur Xiaomi, autorise une fois l'appli à s'afficher sur l'écran de verrouillage et à ouvrir des fenêtres en
            arrière-plan. Dans sa batterie, choisis aucune restriction.
          </p>
        </div>
        <button type="button" class="ghost" onclick={() => b.openLockSettings?.()}>Autorisations</button>
      </div>
    {/if}

    <details class="itag" open={status != null}>
      <summary>Porte-clés Bluetooth « iTag » (facultatif)</summary>
      <div class="row">
        <div>
          <p class="hint">
            {#if status}
              {status === 'connected' ? 'Branché : appuie deux fois pour une pause' : stateLabel(status)}{#if name}&nbsp;({name.trim()}){/if}
            {:else}
              Appuie deux fois dessus, vite, pour demander une pause. La bague et la ceinture ne se branchent pas ici.
            {/if}
          </p>
        </div>
        {#if status}
          <button type="button" class="ghost" onclick={disconnect}>Débrancher</button>
        {:else}
          <button type="button" class="start" onclick={connect}>Brancher</button>
        {/if}
      </div>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
    </details>

    {#if unknown.length}
      <details>
        <summary>Messages de la bague (pour Claude)</summary>
        <pre>{unknown.join('\n')}</pre>
      </details>
    {/if}
  {:else if inApp}
    <p class="hint">Mets à jour l'appli (version 1.8, plus bas) pour utiliser le bouton pause.</p>
  {:else}
    <p class="hint">Seulement dans l'appli Android : elle seule peut rester connectée au bouton quand le téléphone est en veille.</p>
  {/if}
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

  .soft {
    color: var(--muted);
    font-size: 15px;
  }

  .soft strong {
    color: var(--fg);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .row > div {
    flex: 1;
    min-width: 0;
  }

  .what {
    font-weight: 700;
  }

  .hint {
    color: var(--muted);
    font-size: 14px;
  }

  .error {
    color: var(--urgent);
    font-weight: 700;
    font-size: 15px;
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

  .start {
    border: 1.5px solid var(--heart);
    background: color-mix(in srgb, var(--heart) 8%, var(--surface));
    color: var(--heart);
  }

  .ghost {
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--fg);
  }

  details {
    font-size: 13px;
    color: var(--muted);
  }

  .count {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .count p {
    flex: 1;
    min-width: 0;
  }

  .count strong {
    color: var(--fg);
  }

  .itag {
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 15px;
  }

  .itag summary {
    min-height: 32px;
    cursor: pointer;
  }

  .itag .row {
    margin-top: 8px;
    padding-top: 0;
    border-top: 0;
  }

  pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
