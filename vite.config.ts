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
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ],
  test: {
    include: ['src/**/*.test.ts']
  }
}));
