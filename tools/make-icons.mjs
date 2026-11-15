// Fabrique les icônes de l'appli en faisant le rendu du vrai renard 3D.
// Prérequis : le serveur de dev tourne (npm run dev) et puppeteer-core est disponible.
// Usage : node tools/make-icons.mjs [cheminVersPuppeteerCore] [cheminVersChrome]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const puppeteer = require(process.argv[2] || 'puppeteer-core');
const chrome = process.argv[3] || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.env.DEV_URL || 'http://localhost:5173';
const out = path.resolve('public');
mkdirSync(path.join(out, 'icons'), { recursive: true });

const JOBS = [
  { file: 'icons/icon-512.png', size: 512, mode: 'icon' },
  { file: 'icons/icon-192.png', size: 192, mode: 'icon' },
  { file: 'icons/icon-maskable-512.png', size: 512, mode: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'maskable' },
  { file: 'favicon.png', size: 64, mode: 'icon' },
  { file: 'renard-portrait.png', size: 768, mode: 'portrait' }
];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
try {
  for (const job of JOBS) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message));
    await page.setViewport({ width: job.size, height: job.size, deviceScaleFactor: 1 });
    await page.goto(`${base}/tools/render-icon.html?size=${job.size}&mode=${job.mode}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__ready === true', { timeout: 60000 });
    await page.screenshot({ path: path.join(out, job.file), omitBackground: job.mode === 'portrait' });
    console.log('OK', job.file);
    await page.close();
  }
} finally {
  await browser.close();
}
