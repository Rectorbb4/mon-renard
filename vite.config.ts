import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Sur GitHub Pages, l'appli est servie sous /<nom-du-dépôt>/.
// BASE_PATH permet de changer ce chemin sans toucher au code (voir README).
const basePath = process.env.BASE_PATH ?? '/mon-renard/';

export default defineConfig(({ command, isPreview }) => ({
  // En développement l'appli est à la racine ; la version construite (et son aperçu local) sous basePath.
  base: command === 'build' || isPreview ? basePath : '/',
  // three.js pèse environ 650 ko ; il est chargé à part, seulement quand le renard s'affiche.
  build: { chunkSizeWarningLimit: 700 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        id: basePath,
        name: 'Mon renard',
        short_name: 'Mon renard',
        description: "Compagnon d'humeur du quotidien. Tes données restent sur ce téléphone.",
        lang: 'fr',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#13202b',
        theme_color: '#13202b',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Tout ce qui est nécessaire pour fonctionner hors ligne est mis en cache à l'installation.
        // Le modèle 3D du renard (fox.glb) en fait partie : il pèse environ 2,4 Mo, d'où la limite relevée.
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,webmanifest,glb}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        // L'APK de l'appli Android se télécharge tel quel (pas de page de l'appli à sa place)
        navigateFallbackDenylist: [/\/android\//],
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ],
  test: {
    include: ['src/**/*.test.ts']
  }
}));
