<script lang="ts">
  // L'appli Android et son widget : téléchargement depuis le navigateur, ou réglages depuis l'appli.
  import { onMount } from 'svelte';
  import { appVersion, canPinWidget, isAndroidApp, pinWidget } from '../lib/android';

  interface Published {
    versionCode: number;
    versionName: string;
    apk: string;
  }

  const base = import.meta.env.BASE_URL;
  const inApp = isAndroidApp();
  const installed = appVersion();
  const onAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const pinnable = inApp && canPinWidget();

  let published = $state<Published | null>(null);
  let pinMessage = $state<string | null>(null);
  const apkUrl = $derived(`${base}android/${published?.apk ?? 'mon-renard.apk'}`);
  const updateAvailable = $derived(!!installed && !!published && published.versionCode > installed.code);

  onMount(() => {
    // Le paramètre évite le cache hors ligne : on veut la version publiée maintenant
    fetch(`${base}android/version.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Published | null) => {
        if (v && Number.isInteger(v.versionCode) && typeof v.apk === 'string' && /^[\w.-]+\.apk$/.test(v.apk)) published = v;
      })
      .catch(() => {});
  });

  function pin(size: 'small' | 'large') {
    pinMessage = pinWidget(size)
      ? 'Ton téléphone te demande où poser le widget : confirme, et il apparaît sur ton écran d’accueil.'
      : 'Ton téléphone ne permet pas de le poser d’ici. Fais un appui long sur l’écran d’accueil, puis Widgets, puis Mon renard.';
  }
</script>

<section class="android" aria-labelledby="android-title">
  {#if inApp}
    <h2 id="android-title">Le widget du renard</h2>
    <p class="soft">
      Pose ton renard sur l’écran d’accueil : il prend l’humeur de ton dernier check-in et somnole la nuit. Le grand
      widget a aussi les boutons « Comment ça va ? » et « Je le sens ».
    </p>
    {#if pinnable}
      <div class="row">
        <button class="primary" type="button" onclick={() => pin('large')}>Grand widget</button>
        <button class="secondary" type="button" onclick={() => pin('small')}>Petit widget</button>
      </div>
    {:else}
      <p class="soft">Fais un appui long sur l’écran d’accueil, choisis Widgets, puis Mon renard.</p>
    {/if}
    {#if pinMessage}
      <p class="info" role="status">{pinMessage}</p>
    {/if}
    {#if updateAvailable && published}
      <div class="update">
        <p><strong>Nouvelle version de l’appli Android ({published.versionName})</strong></p>
        <p class="soft small">Télécharge-la puis installe-la par-dessus : ton journal est gardé.</p>
        <a class="primary link-button" href={apkUrl}>Télécharger la mise à jour</a>
      </div>
    {/if}
    <p class="version">Appli Android {installed?.name}</p>
  {:else}
    <h2 id="android-title">Le renard sur ton écran d’accueil</h2>
    <p class="soft">
      Sur Android, une petite appli ajoute un widget : ton renard dans l’humeur de ton dernier check-in, avec les
      raccourcis « Comment ça va ? » et « Je le sens ».
    </p>
    {#if onAndroid}
      <a class="primary link-button" href={apkUrl} download>
        Télécharger l’appli Android{published ? ` (${published.versionName})` : ''}
      </a>
      <ol class="steps">
        <li>Fais d’abord une sauvegarde ci-dessus : l’appli a son propre journal.</li>
        <li>Ouvre le fichier téléchargé. Android demande d’autoriser Chrome à installer des applis : accepte.</li>
        <li>Ouvre Mon renard, puis Repères → Restaurer une sauvegarde.</li>
        <li>Pose le widget depuis Repères, ou par un appui long sur l’écran d’accueil.</li>
      </ol>
      <p class="soft small">L’appli n’est pas sur le Play Store : Android peut afficher un avertissement, c’est normal.</p>
    {:else}
      <p class="soft">Ouvre cette page sur ton téléphone Android pour la télécharger.</p>
    {/if}
  {/if}
</section>

<style>
  .android {
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

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
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

  .link-button {
    display: grid;
    place-items: center;
    padding: 0 18px;
    text-align: center;
    text-decoration: none;
  }

  .steps {
    margin: 0;
    padding-left: 22px;
    display: grid;
    gap: 6px;
    font-size: 15px;
  }

  .info {
    font-size: 15px;
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--breath) 12%, var(--surface));
  }

  .update {
    display: grid;
    gap: 8px;
    padding: 14px;
    border-radius: 14px;
    border: 1.5px dashed var(--accent);
  }

  .version {
    font-size: 13px;
    color: var(--muted);
  }
</style>
